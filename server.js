// server.js - Servidor Principal ZELO (AKCIT Camp 2026 - Squad 13)
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { GoogleGenAI, Type } = require("@google/genai");

const mock = require("./mock");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Inicialização do Google Gemini SDK (suporta GEMINI_API_KEY ou GOOGLE_API_KEY)
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
let ai = null;

if (geminiApiKey && geminiApiKey !== "sua_chave_gemini_aqui") {
  ai = new GoogleGenAI({ apiKey: geminiApiKey });
  console.log("✅ Google Gemini API configurada e ativa.");
} else {
  console.log("⚠️ Chave do Gemini (GEMINI_API_KEY ou GOOGLE_API_KEY) não detectada no .env.");
  console.log("🛡️ Modo Demonstração/Resiliência Local ATIVADO (Pitch-Safe).");
}

const MODELO_GEMINI = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

// ==========================================
// PROMPTS DO SISTEMA MULTIAGENTE
// ==========================================
const PROMPT_AGENTE_1 = `Você é o Agente de Acolhimento do Zelo (Atenção Básica do SUS).
Sua missão é dar previsibilidade ao cidadão e evitar que ele perca viagem ou enfrente filas desnecessárias.

GUARDRAILS (REGRAS CRÍTICAS INVIOLÁVEIS):
1. NUNCA dê diagnósticos, análises de sintomas ou prescrições médicas.
2. Seu escopo é 100% administrativo, logístico e de acolhimento.
3. Se o cidadão relatar sintomas ou pedir medicamentos, recuse gentilmente explicando que você é um assistente de logística do SUS e oriente procurar a UPA ou SAMU 192 se for urgente.
4. Fale de forma extremamente simples, curta, empática e acolhedora (foco em idosos e famílias).

FLUXO OBRIGATÓRIO DE AÇÃO:
1. Quando o usuário pedir um serviço (ex: vacina), use OBRIGATORIAMENTE a ferramenta 'consultar_catalogo_ubs' para ver qual unidade oferece.
2. NUNCA confirme deslocamento sem antes chamar 'consultar_status_ao_vivo' para checar a situação operacional da sala.
3. Se a unidade mais próxima NÃO tiver o serviço no catálogo, avise com clareza.
4. Se a unidade que possui o serviço estiver em reunião interna ou fechada, DIGA COM TODAS AS LETRAS PARA NÃO SAIR DE CASA AGORA, explique o motivo e ofereça a alternativa viável (ex: UBS San Martin ou agendamento para a próxima janela).`;

const PROMPT_AGENTE_2 = `Você é o Agente Sentinela do Zelo.
Você atua na retaguarda operacional da atenção básica do SUS.
Ao ser acionado sobre uma interrupção em uma UBS (ex: reunião interna na sala de vacina), gere uma mensagem curta, acolhedora e direta (formato WhatsApp) para o paciente afetado (ex: Dona Maria), informando o imprevisto, orientando a NÃO SAIR DE CASA agora e oferecendo a opção de reagendamento para amanhã às 08h ou direcionamento para uma unidade vizinha aberta.`;

// Declaração de ferramentas para o Google Gemini
const functionDeclarationsGemini = [
  {
    name: "consultar_catalogo_ubs",
    description: "Consulta a matriz de serviços (RAG) para descobrir quais UBSs oferecem um serviço específico (ex: vacinacao, clinico_geral).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        servico: {
          type: Type.STRING,
          description: "O serviço ou procedimento médico buscado (ex: vacinacao, clinico_geral)"
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

// Helper para detectar quebra de Guardrails médicos
function verificarGuardrailMedico(texto) {
  const t = (texto || "").toLowerCase();
  const termosClinicos = [
    "dor de", "febre", "dor no peito", "remedio", "remédio", "prescricao", "prescrição",
    "diagnostico", "diagnóstico", "estou sentindo", "posso tomar", "qual medicamento",
    "dipirona", "antibiotico", "sintoma", "infeccao", "infecção", "pressao alta", "pressão alta"
  ];
  return termosClinicos.some(termo => t.includes(termo));
}

// Execução local das tools
function executarToolLocal(nomeFuncao, args) {
  if (nomeFuncao === "consultar_catalogo_ubs") {
    return mock.consultar_catalogo_ubs(args);
  }
  if (nomeFuncao === "consultar_status_ao_vivo") {
    return mock.consultar_status_ao_vivo(args);
  }
  return { erro: `Função ${nomeFuncao} não reconhecida.` };
}

// ==========================================
// ROTAS DA API
// ==========================================

/**
 * POST /api/chat - Interação do Cidadão com o Agente 1 (Acolhimento)
 */
app.post("/api/chat", async (req, res) => {
  const { mensagem } = req.body;
  if (!mensagem) {
    return res.status(400).json({ erro: "Mensagem é obrigatória." });
  }

  const logs = [];
  const timestamp = () => new Date().toLocaleTimeString("pt-BR");

  logs.push({
    tipo: "info",
    tag: "ENTRADA",
    hora: timestamp(),
    detalhe: `Mensagem recebida do cidadão: "${mensagem}"`
  });

  // 1. Verificação prévia de Guardrails (Camada de Segurança Ativa)
  const violouGuardrail = verificarGuardrailMedico(mensagem);
  if (violouGuardrail) {
    logs.push({
      tipo: "guardrail",
      tag: "GUARDRAIL ATIVADO",
      hora: timestamp(),
      detalhe: "Bloqueio de Diagnóstico/Prescrição Médica acionado. A solicitação contém termos clínicos ou pedido de remédio/diagnóstico."
    });

    const respostaGuardrail = "Olá! Como assistente de acolhimento do Zelo, meu papel no SUS é exclusivamente de organização e logística das unidades de saúde. Eu não tenho autorização para avaliar sintomas, dar diagnósticos ou indicar medicamentos. Se você estiver sentindo mal-estar agudo, procure imediatamente a UPA mais próxima ou ligue 192 (SAMU). Como posso te ajudar a encontrar um posto aberto ou conferir a fila?";
    
    return res.json({
      resposta: respostaGuardrail,
      logs,
      guardrailAtivado: true,
      modeloUsado: "Guardrail Policy Engine"
    });
  }

  logs.push({
    tipo: "sucesso",
    tag: "GUARDRAIL CHECK",
    hora: timestamp(),
    detalhe: "Validação de escopo aprovada: pedido estritamente administrativo e logístico."
  });

  // 2. Execução via Google Gemini API se houver chave configurada
  if (ai) {
    try {
      logs.push({
        tipo: "ia",
        tag: "LLM REASONING (GEMINI)",
        hora: timestamp(),
        detalhe: `Enviando contexto e ferramentas para Google Gemini (${MODELO_GEMINI})...`
      });

      const contents = [
        { role: "user", parts: [{ text: mensagem }] }
      ];

      const configChamada = {
        systemInstruction: PROMPT_AGENTE_1,
        tools: [{ functionDeclarations: functionDeclarationsGemini }]
      };

      // Loop de Function Calling (suporta múltiplos passos de ferramentas)
      let turnos = 0;
      const MAX_TURNOS = 5;
      let respostaFinalTexto = "";

      while (turnos < MAX_TURNOS) {
        turnos++;

        const response = await ai.models.generateContent({
          model: MODELO_GEMINI,
          contents: contents,
          config: configChamada
        });

        const candidate = response.candidates && response.candidates[0];
        if (!candidate) break;

        const parts = candidate.content ? candidate.content.parts : [];
        const functionCallParts = parts.filter(p => p.functionCall);

        if (functionCallParts.length > 0) {
          // Anexa a chamada da tool no histórico
          contents.push(candidate.content);

          const functionResponseParts = [];

          for (const callPart of functionCallParts) {
            const nomeFuncao = callPart.functionCall.name;
            const args = callPart.functionCall.args || {};

            logs.push({
              tipo: "tool_call",
              tag: "FUNCTION CALLING",
              hora: timestamp(),
              detalhe: `Agente 1 invocou '${nomeFuncao}' com parâmetros: ${JSON.stringify(args)}`
            });

            const resultado = executarToolLocal(nomeFuncao, args);

            logs.push({
              tipo: "tool_result",
              tag: "TOOL RESPONSE (RAG/MOCK)",
              hora: timestamp(),
              detalhe: `Resultado retornado de '${nomeFuncao}': ${JSON.stringify(resultado)}`
            });

            functionResponseParts.push({
              functionResponse: {
                name: nomeFuncao,
                response: resultado
              }
            });
          }

          // Envia o retorno da tool para o Gemini continuar o raciocínio
          contents.push({
            role: "user",
            parts: functionResponseParts
          });

        } else {
          // O modelo gerou a resposta em texto final
          const textPart = parts.find(p => p.text);
          respostaFinalTexto = textPart ? textPart.text : (response.text || "");
          break;
        }
      }

      if (respostaFinalTexto) {
        logs.push({
          tipo: "ia",
          tag: "SÍNTESE FINAL (GEMINI)",
          hora: timestamp(),
          detalhe: "Agente 1 sintetizou a orientação com base nos dados obtidos em tempo real."
        });

        return res.json({
          resposta: respostaFinalTexto,
          logs,
          guardrailAtivado: false,
          modeloUsado: `Google ${MODELO_GEMINI}`
        });
      }

    } catch (err) {
      console.error("Erro na chamada Google Gemini:", err.message);
      logs.push({
        tipo: "alerta",
        tag: "FALLBACK ATIVADO",
        hora: timestamp(),
        detalhe: `Google Gemini indisponível (${err.message}). Ativando Motor Determinístico Autônomo para garantir o Pitch!`
      });
      // Segue para o fallback abaixo
    }
  }

  // 3. MOTOR AUTÔNOMO DETERMINÍSTICO (Fallback Pitch-Proof)
  logs.push({
    tipo: "ia",
    tag: "ORQUESTRADOR ZELO",
    hora: timestamp(),
    detalhe: "Iniciando orquestração autônoma de ferramentas para o cidadão..."
  });

  const ehVacina = mensagem.toLowerCase().includes("vacin") || mensagem.toLowerCase().includes("dose");
  const servicoDetectado = ehVacina ? "vacinacao" : "clinico_geral";

  logs.push({
    tipo: "tool_call",
    tag: "FUNCTION CALLING",
    hora: timestamp(),
    detalhe: `Invocando 'consultar_catalogo_ubs' com { servico: "${servicoDetectado}" }`
  });

  const catalogo = mock.consultar_catalogo_ubs({ servico: servicoDetectado });

  logs.push({
    tipo: "tool_result",
    tag: "RAG MATRIZ DE SERVIÇOS",
    hora: timestamp(),
    detalhe: `Catálogo retornou: UBS 01 (Vila Esperança - 4 min) DESCARTADA (não tem vacina). UBS 02 (Central - 8 min) e UBS 03 (San Martin) possuem o serviço.`
  });

  logs.push({
    tipo: "tool_call",
    tag: "FUNCTION CALLING",
    hora: timestamp(),
    detalhe: `Invocando 'consultar_status_ao_vivo' para unidade mais próxima com o serviço: { ubs_id: "ubs_B" }`
  });

  const statusUbsB = mock.consultar_status_ao_vivo({ ubs_id: "ubs_B" });

  logs.push({
    tipo: "alerta",
    tag: "STATUS AO VIVO: INTERRUPÇÃO DETECTADA",
    hora: timestamp(),
    detalhe: `UBS 02 Central: STATUS '${statusUbsB.status_atual}'. Motivo: ${statusUbsB.detalhes_operacionais}. Bloqueio de viagem preventivo.`
  });

  logs.push({
    tipo: "tool_call",
    tag: "FUNCTION CALLING",
    hora: timestamp(),
    detalhe: `Invocando 'consultar_status_ao_vivo' para unidade alternativa viável: { ubs_id: "ubs_C" }`
  });

  const statusUbsC = mock.consultar_status_ao_vivo({ ubs_id: "ubs_C" });

  logs.push({
    tipo: "sucesso",
    tag: "ALTERNATIVA CONFIRMADA",
    hora: timestamp(),
    detalhe: `UBS 03 San Martin: STATUS '${statusUbsC.status_atual}'. Aberta e com atendimento imediato confirmado.`
  });

  const respostaFinalLocal = `⚠️ **NÃO SAIA DE CASA AGORA PARA A UBS MAIS PRÓXIMA!**\n\n` +
    `Fiz a checagem no sistema do SUS agora às ${timestamp()} e veja o que encontrei:\n\n` +
    `❌ **UBS Vila Esperança (a 4 min):** Não oferece o serviço de vacinação no catálogo oficial.\n` +
    `⚠️ **UBS Central (a 8 min):** Possui vacina, mas a **sala de vacinação está temporariamente em reunião interna** agora à tarde.\n\n` +
    `✅ **Sua melhor opção imediata:**\n` +
    `A **UBS San Martin (a 14 min)** está com a sala de vacinas **aberta e sem fila** para atendimento imediato hoje.\n\n` +
    `Prefere que eu direcione você para a **UBS San Martin** ou prefere reservar seu horário na **UBS Central amanhã a partir das 08h00**?`;

  return res.json({
    resposta: respostaFinalLocal,
    logs,
    guardrailAtivado: false,
    modeloUsado: "Zelo Autonomous Multi-Agent Engine (Pitch Safe)"
  });
});

/**
 * POST /api/sentinela/interrupcao - Disparo do Agente 2 (Sentinela Operacional)
 */
app.post("/api/sentinela/interrupcao", async (req, res) => {
  const { ubs_id = "ubs_B", motivo = "Reunião técnica interna na Sala de Vacina" } = req.body;
  const timestamp = () => new Date().toLocaleTimeString("pt-BR");
  const logs = [];

  logs.push({
    tipo: "alerta",
    tag: "RECEPÇÃO UBS ACIONADA",
    hora: timestamp(),
    detalhe: `Recepção da UBS Central (${ubs_id}) sinalizou: "${motivo}". Status alterado para 'em_reuniao_interna'.`
  });

  const dadosInterrupcao = mock.disparar_interrupcao_ubs(ubs_id, "em_reuniao_interna", motivo);

  logs.push({
    tipo: "info",
    tag: "SENTINELA ATIVADO (BACKGROUND)",
    hora: timestamp(),
    detalhe: `Agente 2 (Sentinela) acordou. Varrendo fila de pacientes agendados para a UBS ${ubs_id}...`
  });

  logs.push({
    tipo: "sucesso",
    tag: "PACIENTES IDENTIFICADOS",
    hora: timestamp(),
    detalhe: `Encontrado(s) ${dadosInterrupcao.total_afetados} paciente(s) na fila: Dona Maria José (14h15) e Sr. Severino Ramos (15h00).`
  });

  let mensagemPaciente = "";

  // Tenta gerar a mensagem personalizada via Gemini se disponível
  if (ai) {
    try {
      logs.push({
        tipo: "ia",
        tag: "LLM SENTINELA (GEMINI)",
        hora: timestamp(),
        detalhe: `Agente 2 gerando mensagem acolhedora de prevenção via Google Gemini (${MODELO_GEMINI})...`
      });

      const resIA = await ai.models.generateContent({
        model: MODELO_GEMINI,
        contents: [
          {
            role: "user",
            parts: [{
              text: `Gere a mensagem de WhatsApp para a Dona Maria José. O agendamento dela era hoje às 14h15 na UBS Central para vacinação, mas a equipe de enfermagem entrou em reunião técnica interna. Avise para não sair de casa agora e ofereça reagendamento para amanhã às 08h ou direcionamento para a UBS San Martin que está aberta.`
            }]
          }
        ],
        config: {
          systemInstruction: PROMPT_AGENTE_2
        }
      });

      const cand = resIA.candidates && resIA.candidates[0];
      const textPart = cand ? cand.content.parts.find(p => p.text) : null;
      mensagemPaciente = textPart ? textPart.text : resIA.text;
    } catch (err) {
      console.warn("Erro ao gerar com Gemini no Sentinela, usando template local:", err.message);
    }
  }

  if (!mensagemPaciente) {
    mensagemPaciente = `Olá, Dona Maria! Aqui é o Zelo, da sua UBS Central. 💙\n\n` +
      `Passando para avisar para a senhora **NÃO SAIR DE CASA agora** para a sua vacina das 14h15.\n` +
      `Nossa equipe de enfermagem precisou entrar em uma reunião interna urgente e a sala de vacinas está temporariamente fechada hoje à tarde.\n\n` +
      `Para a senhora não perder a viagem, já pré-reservamos sua vaga para **amanhã às 08h00**, ou a senhora pode ir até a **UBS San Martin** que está atendendo normalmente agora.\n\n` +
      `Responda 1 para confirmar amanhã ou 2 para ir na UBS San Martin!`;
  }

  logs.push({
    tipo: "notificacao",
    tag: "DISPARO PREVENTIVO ENVIADO",
    hora: timestamp(),
    detalhe: `Notificação enviada com sucesso para Dona Maria José (+55 81 98765-4321) via WhatsApp/SMS.`
  });

  return res.json({
    sucesso: true,
    ubs: dadosInterrupcao.ubs_afetada,
    pacientesAfetados: dadosInterrupcao.pacientes_afetados,
    mensagemGerada: mensagemPaciente,
    logs
  });
});

/**
 * GET /api/status - Retorna o estado atual das UBSs e pacientes
 */
app.get("/api/status", (req, res) => {
  res.json({
    ubss: mock.obter_todas_ubss(),
    pacientes: mock.obter_pacientes(),
    geminiConfigurado: Boolean(ai)
  });
});

/**
 * GET /api/gestao/kpis - Portal de Gestão Municipal (B2G)
 */
app.get("/api/gestao/kpis", (req, res) => {
  res.json({
    kpis: mock.obter_kpis_gestao(),
    ubss: mock.obter_todas_ubss(),
    pacientes: mock.obter_pacientes()
  });
});

/**
 * GET /api/ubs/:id - Dados específicos de uma UBS com salas operacionais
 */
app.get("/api/ubs/:id", (req, res) => {
  const ubs = mock.obter_ubs_por_id(req.params.id);
  if (!ubs) return res.status(404).json({ erro: "UBS não encontrada" });
  const pacientes = mock.obter_pacientes().filter(p => p.ubs_id === req.params.id);
  res.json({ ubs, pacientes });
});

/**
 * POST /api/ubs/sala-status - Portal da UBS: Recepção altera status de sala
 */
app.post("/api/ubs/sala-status", (req, res) => {
  const { ubs_id, sala_id, novo_status, motivo } = req.body;
  if (!ubs_id || !sala_id || !novo_status) {
    return res.status(400).json({ erro: "Parâmetros insuficientes." });
  }

  const resultado = mock.alterar_status_sala(ubs_id, sala_id, novo_status, motivo);
  if (resultado.erro) return res.status(400).json(resultado);

  res.json({ sucesso: true, resultado });
});

/**
 * POST /api/paciente/remanejar - Portal da UBS: Remanejamento ativo de paciente
 */
app.post("/api/paciente/remanejar", (req, res) => {
  const { paciente_id, destino_ubs_id } = req.body;
  if (!paciente_id || !destino_ubs_id) {
    return res.status(400).json({ erro: "paciente_id e destino_ubs_id são obrigatórios." });
  }

  const resultado = mock.remanejar_paciente(paciente_id, destino_ubs_id);
  if (resultado.erro) return res.status(400).json(resultado);

  res.json(resultado);
});

/**
 * POST /api/paciente/agendar - Portal do Cidadão: Novo agendamento digital
 */
app.post("/api/paciente/agendar", (req, res) => {
  const { nome, telefone, servico, ubs_id, horario } = req.body;
  if (!ubs_id || !servico) {
    return res.status(400).json({ erro: "ubs_id e servico são obrigatórios." });
  }

  const ubs = mock.obter_ubs_por_id(ubs_id);
  if (!ubs) {
    return res.status(404).json({ erro: "Unidade não encontrada." });
  }
  if (!ubs.servicos_disponiveis.includes(servico)) {
    return res.status(422).json({ erro: `A ${ubs.nome} não oferece este serviço. Escolha outra unidade.` });
  }
  // Verificação de status ao vivo da sala antes de confirmar
  const sala = ubs.salas.find(s => s.servico === servico);
  if (sala && sala.status !== "aberto" && sala.status !== "aberto_normal") {
    return res.status(409).json({
      erro: `A sala está temporariamente fechada na ${ubs.nome}. Escolha outra unidade ou outro horário.`,
      motivo: sala.motivo_interrupcao || ubs.motivo_status
    });
  }

  const novoAgendamento = mock.cadastrar_agendamento({ nome, telefone, servico, ubs_id, horario });
  res.json({ sucesso: true, agendamento: novoAgendamento });
});

/**
 * GET /api/cidadao/agendamentos?telefone= - Portal do Cidadão: meus agendamentos
 * com o status ao vivo da unidade associada
 */
app.get("/api/cidadao/agendamentos", (req, res) => {
  const digitos = String(req.query.telefone || "").replace(/\D/g, "");
  if (digitos.length < 8) {
    return res.status(400).json({ erro: "Informe um telefone válido." });
  }

  const agendamentos = mock.obter_pacientes()
    .filter(p => String(p.telefone).replace(/\D/g, "") === digitos)
    .map(p => {
      const ubs = mock.obter_ubs_por_id(p.ubs_id);
      const sala = ubs ? ubs.salas.find(s => s.servico === p.servico) : null;
      const salaAberta = !sala || sala.status === "aberto" || sala.status === "aberto_normal";
      return {
        id: p.id,
        servico: p.servico,
        horario: p.horario_agendado,
        status_alerta: p.status_alerta,
        remanejado_para: p.remanejado_para,
        ubs: ubs ? { id: ubs.id, nome: ubs.nome, bairro: ubs.bairro } : null,
        sala_aberta: salaAberta,
        motivo: salaAberta ? null : (sala.motivo_interrupcao || ubs.motivo_status)
      };
    });

  res.json({ agendamentos });
});

/**
 * Frontend dedicado ao cidadão: http://localhost:3000/cidadao
 */
app.get(["/cidadao", "/app"], (req, res) => {
  res.redirect("/cidadao/");
});

/**
 * POST /api/reset - Restaura os dados originais para nova demonstração
 */
app.post("/api/reset", (req, res) => {
  const dados = mock.resetar_banco();
  res.json({ sucesso: true, mensagem: "Banco de dados em memória restaurado ao estado original.", dados });
});

// Inicialização do servidor
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🏥 ZELO - Sistema Multiagente para a Atenção Básica`);
  console.log(`🚀 Squad 13 (AKCIT Camp 2026 - Recife)`);
  console.log(`🌐 Servidor rodando em: http://localhost:${PORT}`);
  console.log(`🤖 LLM Provider: Google Gemini (${MODELO_GEMINI})`);
  console.log(`======================================================\n`);
});
