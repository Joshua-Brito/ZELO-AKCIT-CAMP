// server.js - Servidor Principal ZELO (AKCIT Camp 2026 - Squad 13)
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { GoogleGenAI, Type } = require("@google/genai");

const repo = require("./db/repository");
const geo = require("./geo/recife");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Inicialização do Google Gemini SDK
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
let ai = null;

if (geminiApiKey && geminiApiKey !== "sua_chave_gemini_aqui") {
  ai = new GoogleGenAI({ apiKey: geminiApiKey });
  console.log("✅ Google Gemini API configurada e ativa.");
} else {
  console.log("⚠️ Chave do Gemini não detectada. Modo Demonstração Local ATIVADO (Pitch-Safe).");
}

const MODELO_GEMINI = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

// ==========================================
// PROMPTS DO SISTEMA MULTIAGENTE
// ==========================================
const PROMPT_AGENTE_1 = `Você é o Agente de Acolhimento do Zelo (Atenção Básica do SUS no Recife).
Sua missão é dar previsibilidade ao cidadão e evitar que ele perca viagem ou enfrente filas desnecessárias.

GUARDRAILS (REGRAS CRÍTICAS INVIOLÁVEIS):
1. NUNCA dê diagnósticos, análises de sintomas ou prescrições médicas.
2. Seu escopo é 100% administrativo, logístico e de acolhimento.
3. Se o cidadão relatar sintomas ou pedir medicamentos, recuse gentilmente explicando que você é um assistente de logística do SUS e oriente procurar a UPA ou SAMU 192 se for urgente.
4. Fale de forma extremamente simples, curta, empática e acolhedora (foco em idosos e famílias).

FLUXO OBRIGATÓRIO DE AÇÃO:
1. Quando o usuário pedir um serviço (ex: vacina), use OBRIGATORIAMENTE a ferramenta 'consultar_catalogo_ubs' para ver quais unidades mais próximas oferecem o serviço (ela já ordena por distância).
2. NUNCA confirme deslocamento sem antes chamar 'consultar_status_ao_vivo' para checar a situação operacional da unidade candidata.
3. Se a unidade mais próxima NÃO tiver o serviço no catálogo, avise com gentileza usando o nome e distância dela.
4. Se a unidade que possui o serviço estiver em reunião interna ou fechada, DIGA COM TODAS AS LETRAS PARA NÃO SAIR DE CASA AGORA para aquela unidade, explique o motivo e ofereça a unidade alternativa aberta mais próxima.`;

const PROMPT_AGENTE_2 = `Você é o Agente Sentinela do Zelo.
Você atua na retaguarda operacional da atenção básica do SUS.
Ao ser acionado sobre uma interrupção em uma UBS (ex: reunião interna na sala de vacina), gere uma mensagem curta, acolhedora e direta (formato WhatsApp) para o paciente afetado, informando o imprevisto, orientando a NÃO SAIR DE CASA agora e oferecendo a opção de reagendamento para amanhã às 08h ou direcionamento para a unidade vizinha aberta.`;

const functionDeclarationsGemini = [
  {
    name: "consultar_catalogo_ubs",
    description: "Consulta a matriz de serviços (RAG) das 22 UBSs do Recife ordenadas da mais próxima para a mais distante, filtrando pelo serviço buscado.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        servico: {
          type: Type.STRING,
          description: "O serviço buscado (ex: vacinacao, clinico_geral, pediatria, odontologia, prenatal, curativos)"
        }
      },
      required: ["servico"]
    }
  },
  {
    name: "consultar_status_ao_vivo",
    description: "Verifica em tempo real se a sala da UBS está aberta, em reunião interna ou com interrupções.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        ubs_id: {
          type: Type.STRING,
          description: "ID da UBS a ser verificada (ex: ubs_A, ubs_B, ubs_C)"
        }
      },
      required: ["ubs_id"]
    }
  }
];

function verificarGuardrailMedico(texto) {
  const t = (texto || "").toLowerCase();
  const termosClinicos = [
    "dor de", "febre", "dor no peito", "remedio", "remédio", "prescricao", "prescrição",
    "diagnostico", "diagnóstico", "estou sentindo", "posso tomar", "qual medicamento",
    "dipirona", "antibiotico", "sintoma", "infeccao", "infecção", "pressao alta", "pressão alta"
  ];
  return termosClinicos.some((termo) => t.includes(termo));
}

async function executarToolLocal(nomeFuncao, args, localizacao) {
  if (nomeFuncao === "consultar_catalogo_ubs") {
    return repo.consultarCatalogoUbs({
      servico: args.servico,
      lat: localizacao?.lat,
      lng: localizacao?.lng,
      bairro: localizacao?.bairro
    });
  }
  if (nomeFuncao === "consultar_status_ao_vivo") {
    return repo.consultarStatusAoVivo(args);
  }
  return { erro: `Função ${nomeFuncao} não reconhecida.` };
}

// ==========================================
// HEALTHCHECK & GEOLOCALIZAÇÃO
// ==========================================
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", ...repo.getInfoPersistencia() });
});

app.get("/api/geo/bairros", (req, res) => {
  res.json({ bairros: geo.listarBairros() });
});

app.get("/api/geo/cep/:cep", async (req, res) => {
  try {
    const resultado = await geo.buscarCepViaCep(req.params.cep);
    res.json(resultado);
  } catch (err) {
    res.status(400).json({ erro: err.message });
  }
});

// ==========================================
// ROTAS DE IA (AGENTES 1 E 2)
// ==========================================
app.post("/api/chat", async (req, res) => {
  const { mensagem, localizacao } = req.body;
  if (!mensagem) {
    return res.status(400).json({ erro: "Mensagem é obrigatória." });
  }

  const logs = [];
  const timestamp = () => new Date().toLocaleTimeString("pt-BR");

  logs.push({
    tipo: "info",
    tag: "ENTRADA",
    hora: timestamp(),
    detalhe: `Mensagem recebida: "${mensagem}"${localizacao?.bairro ? ` (Bairro ref: ${localizacao.bairro})` : ""}`
  });

  if (verificarGuardrailMedico(mensagem)) {
    await repo.registrarGuardrailBloqueio();
    logs.push({
      tipo: "guardrail",
      tag: "GUARDRAIL ATIVADO",
      hora: timestamp(),
      detalhe: "Bloqueio de Diagnóstico/Prescrição Médica acionado."
    });

    return res.json({
      resposta: "Olá! Como assistente de acolhimento do Zelo, meu papel no SUS é exclusivamente de organização e logística das unidades de saúde. Eu não tenho autorização para avaliar sintomas, dar diagnósticos ou indicar medicamentos. Se você estiver sentindo mal-estar agudo, procure imediatamente a UPA mais próxima ou ligue 192 (SAMU). Como posso te ajudar a encontrar um posto aberto?",
      logs,
      guardrailAtivado: true,
      modeloUsado: "Guardrail Policy Engine"
    });
  }

  logs.push({
    tipo: "sucesso",
    tag: "GUARDRAIL CHECK",
    hora: timestamp(),
    detalhe: "Validação de escopo aprovada: pedido administrativo/logístico."
  });

  if (ai) {
    try {
      logs.push({
        tipo: "ia",
        tag: "LLM REASONING (GEMINI)",
        hora: timestamp(),
        detalhe: `Enviando contexto para Google Gemini (${MODELO_GEMINI})...`
      });

      const contents = [{ role: "user", parts: [{ text: mensagem }] }];
      const configChamada = {
        systemInstruction: PROMPT_AGENTE_1,
        tools: [{ functionDeclarations: functionDeclarationsGemini }]
      };

      let turnos = 0;
      let respostaFinalTexto = "";

      while (turnos < 5) {
        turnos++;
        const response = await ai.models.generateContent({
          model: MODELO_GEMINI,
          contents,
          config: configChamada
        });

        const candidate = response.candidates && response.candidates[0];
        if (!candidate) break;

        const parts = candidate.content ? candidate.content.parts : [];
        const functionCallParts = parts.filter((p) => p.functionCall);

        if (functionCallParts.length > 0) {
          contents.push(candidate.content);
          const functionResponseParts = [];

          for (const callPart of functionCallParts) {
            const nomeFuncao = callPart.functionCall.name;
            const args = callPart.functionCall.args || {};

            logs.push({
              tipo: "tool_call",
              tag: "FUNCTION CALLING",
              hora: timestamp(),
              detalhe: `Agente 1 invocou '${nomeFuncao}' com: ${JSON.stringify(args)}`
            });

            const resultado = await executarToolLocal(nomeFuncao, args, localizacao);

            logs.push({
              tipo: "tool_result",
              tag: "TOOL RESPONSE (POSTGRES/RAG)",
              hora: timestamp(),
              detalhe: `Retorno de '${nomeFuncao}': ${JSON.stringify(resultado).slice(0, 260)}...`
            });

            functionResponseParts.push({
              functionResponse: { name: nomeFuncao, response: resultado }
            });
          }

          contents.push({ role: "user", parts: functionResponseParts });
        } else {
          const textPart = parts.find((p) => p.text);
          respostaFinalTexto = textPart ? textPart.text : (response.text || "");
          break;
        }
      }

      if (respostaFinalTexto) {
        logs.push({
          tipo: "ia",
          tag: "SÍNTESE FINAL (GEMINI)",
          hora: timestamp(),
          detalhe: "Agente 1 sintetizou a orientação com base nos dados reais do banco."
        });

        return res.json({
          resposta: respostaFinalTexto,
          logs,
          guardrailAtivado: false,
          modeloUsado: `Google ${MODELO_GEMINI}`
        });
      }
    } catch (err) {
      console.error("Erro Gemini:", err.message);
      logs.push({
        tipo: "alerta",
        tag: "FALLBACK ATIVADO",
        hora: timestamp(),
        detalhe: `Gemini indisponível (${err.message}). Ativando Motor Determinístico Autônomo!`
      });
    }
  }

  // Motor Determinístico Autônomo (Fallback Pitch-Proof) usando dados reais do repositório
  const ehVacina = mensagem.toLowerCase().includes("vacin") || mensagem.toLowerCase().includes("dose");
  const servicoDetectado = ehVacina ? "vacinacao" : "clinico_geral";

  logs.push({
    tipo: "tool_call",
    tag: "FUNCTION CALLING",
    hora: timestamp(),
    detalhe: `Invocando 'consultar_catalogo_ubs' com { servico: "${servicoDetectado}" }`
  });

  const catalogo = await repo.consultarCatalogoUbs({
    servico: servicoDetectado,
    lat: localizacao?.lat,
    lng: localizacao?.lng,
    bairro: localizacao?.bairro
  });

  logs.push({
    tipo: "tool_result",
    tag: "RAG MATRIZ DE SERVIÇOS",
    hora: timestamp(),
    detalhe: `Encontradas ${catalogo.total_encontradas} unidades compatíveis. Mais próxima compatível: ${catalogo.unidades_compativeis[0]?.nome || "N/A"}.`
  });

  const candidata = catalogo.unidades_compativeis[0];
  let respostaFinalLocal = "";

  if (candidata) {
    logs.push({
      tipo: "tool_call",
      tag: "FUNCTION CALLING",
      hora: timestamp(),
      detalhe: `Invocando 'consultar_status_ao_vivo' para { ubs_id: "${candidata.id}" }`
    });

    const statusCandidata = await repo.consultarStatusAoVivo({ ubs_id: candidata.id });

    if (!statusCandidata.disponivel_para_atendimento) {
      logs.push({
        tipo: "alerta",
        tag: "STATUS AO VIVO: INTERRUPÇÃO DETECTADA",
        hora: timestamp(),
        detalhe: `${candidata.nome}: '${statusCandidata.status_atual}'. Bloqueio de viagem preventivo.`
      });

      const alternativa = catalogo.unidades_compativeis[1];
      let statusAlt = null;
      if (alternativa) {
        statusAlt = await repo.consultarStatusAoVivo({ ubs_id: alternativa.id });
        logs.push({
          tipo: "sucesso",
          tag: "ALTERNATIVA CONFIRMADA",
          hora: timestamp(),
          detalhe: `${alternativa.nome} (${alternativa.distancia}): '${statusAlt.status_atual}'.`
        });
      }

      const descartada = catalogo.unidades_descartadas_proximas[0];
      respostaFinalLocal = `⚠️ **NÃO SAIA DE CASA AGORA!**\n\n` +
        `Conferi o sistema do SUS do Recife agora às ${timestamp()}:\n\n` +
        (descartada ? `❌ **${descartada.nome} (${descartada.distancia}):** Não oferece ${servicoDetectado === "vacinacao" ? "vacinação" : "este serviço"} no catálogo.\n` : "") +
        `⚠️ **${candidata.nome} (${candidata.distancia}):** Está com **${statusCandidata.detalhes_operacionais}**\n\n` +
        (alternativa && statusAlt?.disponivel_para_atendimento
          ? `✅ **Sua melhor opção aberta agora:**\n**${alternativa.nome}** (${alternativa.bairro} • ${alternativa.distancia}) — atendimento regular hoje.\n\nQuer que eu reserve para você ou prefere aguardar ${statusCandidata.proxima_janela}?`
          : `Próxima janela prevista: **${statusCandidata.proxima_janela}**.`);
    } else {
      logs.push({
        tipo: "sucesso",
        tag: "SALA LIBERADA",
        hora: timestamp(),
        detalhe: `${candidata.nome} aberta e disponível.`
      });
      respostaFinalLocal = `✅ **Tudo certo para seu atendimento!**\n\nA unidade mais próxima com o serviço aberto agora é a **${candidata.nome}** (${candidata.bairro} • ${candidata.distancia}).\nEndereço: ${candidata.endereco}.\n\nLeve seu documento com foto e Cartão do SUS!`;
    }
  } else {
    respostaFinalLocal = "Não encontrei unidades com esse serviço no momento. Tente falar com a central do SUS (136).";
  }

  return res.json({
    resposta: respostaFinalLocal,
    logs,
    guardrailAtivado: false,
    modeloUsado: "Zelo Autonomous Multi-Agent Engine (Pitch Safe)"
  });
});

app.post("/api/sentinela/interrupcao", async (req, res) => {
  const { ubs_id = "ubs_B", motivo = "Reunião técnica interna na Sala de Vacina" } = req.body;
  const timestamp = () => new Date().toLocaleTimeString("pt-BR");
  const logs = [];

  logs.push({
    tipo: "alerta",
    tag: "RECEPÇÃO UBS ACIONADA",
    hora: timestamp(),
    detalhe: `Recepção da unidade (${ubs_id}) sinalizou: "${motivo}".`
  });

  const dadosInterrupcao = await repo.dispararInterrupcaoUbs(ubs_id, "em_reuniao_interna", motivo);

  logs.push({
    tipo: "sucesso",
    tag: "PACIENTES IDENTIFICADOS",
    hora: timestamp(),
    detalhe: `Sentinela localizou ${dadosInterrupcao.total_afetados} paciente(s) afetado(s) na fila.`
  });

  let mensagemPaciente = "";
  if (ai) {
    try {
      const resIA = await ai.models.generateContent({
        model: MODELO_GEMINI,
        contents: [{
          role: "user",
          parts: [{
            text: `Gere uma mensagem curta de WhatsApp para Dona Maria José avisando que a sala de vacinação da ${dadosInterrupcao.ubs_afetada?.nome || "UBS"} fechou por motivo de: ${motivo}. Peça para NÃO sair de casa e ofereça reagendamento para amanhã às 08h ou ir para a unidade vizinha aberta.`
          }]
        }],
        config: { systemInstruction: PROMPT_AGENTE_2 }
      });
      const cand = resIA.candidates && resIA.candidates[0];
      const textPart = cand ? cand.content.parts.find((p) => p.text) : null;
      mensagemPaciente = textPart ? textPart.text : resIA.text;
    } catch (err) {
      console.warn("Erro Sentinela Gemini:", err.message);
    }
  }

  if (!mensagemPaciente) {
    mensagemPaciente = `Olá, Dona Maria! Aqui é o Zelo, da sua UBS. 💙\n\n` +
      `Passando para avisar para a senhora **NÃO SAIR DE CASA agora** para a sua vacina das 14h15.\n` +
      `Motivo: ${motivo}.\n\n` +
      `Já pré-reservamos sua vaga para **amanhã às 08h00**, ou podemos remanejar para a unidade vizinha aberta.\n` +
      `Responda 1 para confirmar amanhã ou 2 para unidade vizinha!`;
  }

  logs.push({
    tipo: "notificacao",
    tag: "DISPARO PREVENTIVO ENVIADO",
    hora: timestamp(),
    detalhe: "Notificação preventiva enviada via WhatsApp/SMS para os pacientes afetados."
  });

  res.json({
    sucesso: true,
    ubs: dadosInterrupcao.ubs_afetada,
    pacientesAfetados: dadosInterrupcao.pacientes_afetados,
    mensagemGerada: mensagemPaciente,
    logs
  });
});

// ==========================================
// ROTAS OPERACIONAIS, GESTÃO E CIDADÃO
// ==========================================
app.get("/api/status", async (req, res) => {
  const { lat, lng, bairro, rpa } = req.query;
  const [ubss, pacientes] = await Promise.all([
    repo.obterTodasUbss({ lat, lng, bairro, rpa }),
    repo.obterPacientes()
  ]);
  res.json({
    ubss,
    pacientes,
    geminiConfigurado: Boolean(ai),
    ...repo.getInfoPersistencia()
  });
});

app.get("/api/gestao/kpis", async (req, res) => {
  const { rpa } = req.query;
  const [kpis, ubss, pacientes, auditoria] = await Promise.all([
    repo.obterKpisGestao(),
    repo.obterTodasUbss({ rpa }),
    repo.obterPacientes(),
    repo.obterLogsAuditoria(20)
  ]);
  res.json({ kpis, ubss, pacientes, auditoria, ...repo.getInfoPersistencia() });
});

app.get("/api/ubs/:id", async (req, res) => {
  const ubs = await repo.obterUbsPorId(req.params.id);
  if (!ubs) return res.status(404).json({ erro: "UBS não encontrada" });
  const pacientes = await repo.obterPacientes(req.params.id);
  res.json({ ubs, pacientes });
});

app.post("/api/ubs/sala-status", async (req, res) => {
  const { ubs_id, sala_id, novo_status, motivo } = req.body;
  if (!ubs_id || !sala_id || !novo_status) {
    return res.status(400).json({ erro: "Parâmetros insuficientes." });
  }
  const resultado = await repo.alterarStatusSala(ubs_id, sala_id, novo_status, motivo);
  if (resultado.erro) return res.status(400).json(resultado);
  res.json({ sucesso: true, resultado });
});

app.post("/api/paciente/remanejar", async (req, res) => {
  const { paciente_id, destino_ubs_id } = req.body;
  if (!paciente_id || !destino_ubs_id) {
    return res.status(400).json({ erro: "paciente_id e destino_ubs_id são obrigatórios." });
  }
  const resultado = await repo.remanejarPaciente(paciente_id, destino_ubs_id);
  if (resultado.erro) return res.status(400).json(resultado);
  res.json(resultado);
});

app.post("/api/paciente/agendar", async (req, res) => {
  const { nome, telefone, bairro, servico, ubs_id, horario } = req.body;
  if (!ubs_id || !servico) {
    return res.status(400).json({ erro: "ubs_id e servico são obrigatórios." });
  }

  const ubs = await repo.obterUbsPorId(ubs_id);
  if (!ubs) return res.status(404).json({ erro: "Unidade não encontrada." });
  if (!ubs.servicos_disponiveis.includes(servico)) {
    return res.status(422).json({ erro: `A ${ubs.nome} não oferece este serviço. Escolha outra unidade.` });
  }

  const sala = ubs.salas.find((s) => s.servico === servico);
  if (sala && sala.status !== "aberto" && sala.status !== "aberto_normal") {
    return res.status(409).json({
      erro: `A sala está temporariamente fechada na ${ubs.nome}. Escolha outra unidade ou outro horário.`,
      motivo: sala.motivo_interrupcao || ubs.motivo_status
    });
  }

  const novoAgendamento = await repo.cadastrarAgendamento({ nome, telefone, bairro, servico, ubs_id, horario });
  res.json({ sucesso: true, agendamento: novoAgendamento });
});

app.get("/api/cidadao/agendamentos", async (req, res) => {
  const digitos = String(req.query.telefone || "").replace(/\D/g, "");
  if (digitos.length < 8) {
    return res.status(400).json({ erro: "Informe um telefone válido." });
  }

  const todos = await repo.obterPacientes();
  const filtrados = todos.filter((p) => String(p.telefone).replace(/\D/g, "") === digitos);
  const agendamentos = [];

  for (const p of filtrados) {
    const ubs = await repo.obterUbsPorId(p.ubs_id);
    const sala = ubs ? ubs.salas.find((s) => s.servico === p.servico) : null;
    const salaAberta = !sala || sala.status === "aberto" || sala.status === "aberto_normal";
    agendamentos.push({
      id: p.id,
      servico: p.servico,
      horario: p.horario_agendado,
      status_alerta: p.status_alerta,
      remanejado_para: p.remanejado_para,
      ubs: ubs ? { id: ubs.id, nome: ubs.nome, bairro: ubs.bairro } : null,
      sala_aberta: salaAberta,
      motivo: salaAberta ? null : (sala.motivo_interrupcao || ubs.motivo_status)
    });
  }

  res.json({ agendamentos });
});

app.post("/api/reset", async (req, res) => {
  const dados = await repo.resetarBanco();
  res.json({ sucesso: true, mensagem: "Banco de dados restaurado ao estado inicial.", dados });
});

// Redirects amigáveis para os 3 Frontends dedicados
app.get(["/cidadao", "/app"], (req, res) => res.redirect("/cidadao/"));
app.get("/ubs", (req, res) => res.redirect("/ubs/"));
app.get("/gestao", (req, res) => res.redirect("/gestao/"));

// Inicialização assíncrona garantindo que o DB suba antes de aceitar tráfego
repo.init().then(() => {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🏥 ZELO - Sistema Multiagente para a Atenção Básica`);
    console.log(`🚀 Squad 13 (AKCIT Camp 2026 - Recife)`);
    console.log(`🌐 Hub Principal: http://localhost:${PORT}/`);
    console.log(`👤 App Cidadão:   http://localhost:${PORT}/cidadao`);
    console.log(`🏥 Portal UBS:    http://localhost:${PORT}/ubs`);
    console.log(`📊 Gestão B2G:    http://localhost:${PORT}/gestao`);
    console.log(`🗄️ Persistência:  ${repo.getInfoPersistencia().engine}`);
    console.log(`======================================================\n`);
  });
}).catch((err) => {
  console.error("Erro fatal ao inicializar repositório:", err);
  process.exit(1);
});
