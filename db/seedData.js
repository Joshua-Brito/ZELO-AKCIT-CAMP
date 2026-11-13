// db/seedData.js - Leitura do CSV oficial da Prefeitura do Recife e montagem do Seed da Demo
const fs = require("fs");
const path = require("path");

function parseCsvLinha(linha) {
  const campos = [];
  let atual = "";
  let emAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (ch === '"') {
      emAspas = !emAspas;
    } else if (ch === ";" && !emAspas) {
      campos.push(atual.trim());
      atual = "";
    } else {
      atual += ch;
    }
  }
  campos.push(atual.trim());
  return campos;
}

function mapearServicos(especialidadeRaw, cnes) {
  const txt = (especialidadeRaw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  const servicos = new Set();

  if (txt.includes("CLINICA") || txt.includes("CLINICO") || txt.includes("MEDICA")) {
    servicos.add("clinico_geral");
  }
  if (txt.includes("PEDIATRIA")) {
    servicos.add("pediatria");
  }
  if (txt.includes("ODONTO")) {
    servicos.add("odontologia");
  }
  if (txt.includes("GINECOLOG")) {
    servicos.add("prenatal");
  }
  if (txt.includes("ENFERMAGEM")) {
    servicos.add("curativos");
  }

  // Garante serviços base e aplica o cenário controlado da demo para as 3 UBSs vizinhas (Prado / Torrões / Iputinga)
  if (cnes === "0000760") {
    // ubs_A: US 161 CS Prof Romero Marques (Prado) -> NÃO TEM VACINA no cenário demo
    servicos.delete("vacinacao");
    servicos.add("clinico_geral");
    servicos.add("pediatria");
    servicos.add("curativos");
  } else if (cnes === "0000639") {
    // ubs_B: US 106 CS Prof Joaquim Cavalcante (Torrões) -> TEM VACINA, mas está em reunião interna
    servicos.add("vacinacao");
  } else if (cnes === "0001813") {
    // ubs_C: US 112 CS Dr José Dustan Carvalho Soares (Iputinga) -> TEM VACINA e está ABERTA
    servicos.add("vacinacao");
  } else {
    // Demais UBSs reais: unidades com enfermagem ou nº CNES par oferecem vacinação
    if (txt.includes("ENFERMAGEM") || Number(cnes) % 2 === 0) {
      servicos.add("vacinacao");
    }
    if (servicos.size === 0) servicos.add("clinico_geral");
  }

  return Array.from(servicos);
}

const NOMES_SALA = {
  vacinacao: "Sala de Imunização e Vacinas",
  clinico_geral: "Consultório Clínico Geral",
  pediatria: "Consultório de Pediatria",
  odontologia: "Consultório Odontológico",
  prenatal: "Saúde da Mulher & Pré-Natal",
  curativos: "Sala de Curativos e Triagem"
};

const RESPONSAVEIS_PADRAO = {
  vacinacao: "Enfª Mariana Rocha (COREN-PE)",
  clinico_geral: "Dr. Roberto Freire (CRM-PE)",
  pediatria: "Dra. Camila Alencar (CRM-PE)",
  odontologia: "Dra. Luciana Paes (CRO-PE)",
  prenatal: "Dra. Renata Vasconcelos (CRM-PE)",
  curativos: "Téc. Enfermagem João Silva"
};

function carregarDadosIniciais() {
  const csvPath = path.join(__dirname, "..", "data", "unidades-basicas-de-saude-ubs.csv");
  const conteudo = fs.readFileSync(csvPath, "utf8");
  const linhas = conteudo.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const header = parseCsvLinha(linhas[0]);
  const idx = (col) => header.indexOf(col);

  const ubss = [];
  const salas = [];

  for (let i = 1; i < linhas.length; i++) {
    const cols = parseCsvLinha(linhas[i]);
    if (cols.length < 15) continue;

    const cnes = cols[idx("cnes")];
    const nome = cols[idx("nome_oficial")];
    const rpa = cols[idx("rpa")];
    const distrito = cols[idx("distrito_sanitario")];
    const endereco = cols[idx("endereço")];
    const bairro = cols[idx("bairro")];
    const telefone = cols[idx("fone")];
    const especialidades = cols[idx("especialidade")];
    const horario = cols[idx("horario")];
    const lat = parseFloat(cols[idx("latitude")]);
    const lng = parseFloat(cols[idx("longitude")]);

    let id = `ubs_${cnes}`;
    let statusAtual = "aberto_normal";
    let motivoStatus = "Funcionamento regular e equipe completa.";
    let janelaDisponivel = "Hoje, 08h00 às 17h00";
    let isDemoFoco = false;
    let atendimentosHoje = 45 + ((i * 7) % 55);

    if (cnes === "0000760") {
      id = "ubs_A";
      statusAtual = "aberto";
      motivoStatus = "Funcionamento regular (esta unidade não dispõe de sala de vacinas).";
      isDemoFoco = true;
      atendimentosHoje = 78;
    } else if (cnes === "0000639") {
      id = "ubs_B";
      statusAtual = "em_reuniao_interna";
      motivoStatus = "Sala de Vacina temporariamente fechada para reunião técnica da equipe de enfermagem.";
      janelaDisponivel = "Amanhã, a partir das 08h00";
      isDemoFoco = true;
      atendimentosHoje = 42;
    } else if (cnes === "0001813") {
      id = "ubs_C";
      statusAtual = "aberto_normal";
      motivoStatus = "Equipe completa e sala de vacinas em pleno funcionamento.";
      janelaDisponivel = "Hoje, atendimento imediato até às 17h";
      isDemoFoco = true;
      atendimentosHoje = 94;
    }

    const servicosDisponiveis = mapearServicos(especialidades, cnes);

    ubss.push({
      id,
      cnes,
      nome,
      rpa,
      distrito_sanitario: distrito,
      endereco,
      bairro,
      telefone,
      horario,
      latitude: lat,
      longitude: lng,
      servicos_disponiveis: servicosDisponiveis,
      especialidades_texto: especialidades,
      status_atual: statusAtual,
      motivo_status: motivoStatus,
      janela_disponivel: janelaDisponivel,
      capacidade_diaria: 140,
      atendimentos_hoje: atendimentosHoje,
      is_demo_foco: isDemoFoco
    });

    servicosDisponiveis.forEach((srv) => {
      const fechadaDemo = id === "ubs_B" && srv === "vacinacao";
      salas.push({
        id: `${id}_${srv}`,
        ubs_id: id,
        nome: NOMES_SALA[srv] || srv,
        servico: srv,
        status: fechadaDemo ? "em_reuniao_interna" : "aberto",
        responsavel: RESPONSAVEIS_PADRAO[srv] || "Equipe SUS",
        fila_espera: fechadaDemo ? 2 : (i % 4) + 1,
        fichas_restantes: fechadaDemo ? 0 : 10 + (i % 15),
        motivo_interrupcao: fechadaDemo
          ? "Reunião de alinhamento emergencial do protocolo de imunização"
          : null
      });
    });
  }

  const pacientes = [
    {
      id: "pac_01",
      nome: "Maria José da Silva",
      idade: 67,
      telefone: "(81) 98765-4321",
      cpf_mascarado: "***.482.914-**",
      bairro: "TORROES",
      servico: "vacinacao",
      ubs_id: "ubs_B",
      sala_nome: "Sala de Imunização e Vacinas",
      horario_agendado: "Hoje às 14h15",
      status_alerta: "aguardando_envio",
      remanejado_para: null
    },
    {
      id: "pac_02",
      nome: "Severino Ramos de Souza",
      idade: 71,
      telefone: "(81) 99123-9876",
      cpf_mascarado: "***.719.304-**",
      bairro: "TORROES",
      servico: "vacinacao",
      ubs_id: "ubs_B",
      sala_nome: "Sala de Imunização e Vacinas",
      horario_agendado: "Hoje às 15h00",
      status_alerta: "aguardando_envio",
      remanejado_para: null
    },
    {
      id: "pac_03",
      nome: "Juliana Mendes Cavalcanti",
      idade: 34,
      telefone: "(81) 98455-1234",
      cpf_mascarado: "***.128.774-**",
      bairro: "PRADO",
      servico: "clinico_geral",
      ubs_id: "ubs_A",
      sala_nome: "Consultório Clínico Geral",
      horario_agendado: "Hoje às 15h30",
      status_alerta: "confirmado_presencial",
      remanejado_para: null
    }
  ];

  const metricas = {
    viagens_perdidas_evitadas: 1482,
    horas_fila_poupadas: 4890,
    alertas_preventivos_disparados: 312,
    guardrails_violacoes_bloqueadas: 147,
    economia_estimada_reais: "R$ 194.200,00",
    reducao_noshow_percentual: 78.7
  };

  return { ubss, salas, pacientes, metricas };
}

module.exports = { carregarDadosIniciais };
