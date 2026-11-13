// mock.js - Banco de Dados em Memória e Funções de Tooling do Projeto ZELO (Multi-Portal MVP)

const DADOS_INICIAIS = {
  ubss: [
    {
      id: "ubs_A",
      nome: "UBS 01 - Vila Esperança",
      bairro: "Boa Vista, Recife - PE",
      distancia: "4 min a pé (350m)",
      servicos_disponiveis: ["clinico_geral", "pediatria", "curativos"], // NÃO TEM VACINA
      status_atual: "aberto",
      motivo_status: "Funcionamento regular sem fila de espera crítica",
      janela_disponivel: "Hoje, das 07h às 17h",
      capacidade_diaria: 120,
      atendimentos_hoje: 78,
      salas: [
        {
          id: "sala_clinico",
          nome: "Consultório 01 (Clínico Geral)",
          servico: "clinico_geral",
          status: "aberto",
          responsavel: "Dr. André Valença (CRM 14.890)",
          fila_espera: 3,
          fichas_restantes: 12
        },
        {
          id: "sala_pediatria",
          nome: "Consultório 02 (Pediatria)",
          servico: "pediatria",
          status: "aberto",
          responsavel: "Dra. Camila Alencar (CRM 22.341)",
          fila_espera: 2,
          fichas_restantes: 8
        },
        {
          id: "sala_curativos",
          nome: "Sala de Curativos e Triagem",
          servico: "curativos",
          status: "aberto",
          responsavel: "Téc. Enfermagem João",
          fila_espera: 1,
          fichas_restantes: 15
        }
      ]
    },
    {
      id: "ubs_B",
      nome: "UBS 02 - Central da Saúde",
      bairro: "Afogados, Recife - PE",
      distancia: "8 min de ônibus (1.8km)",
      servicos_disponiveis: ["clinico_geral", "vacinacao", "odontologia"], // TEM VACINA
      status_atual: "em_reuniao_interna", // GATILHO DA DEMO
      motivo_status: "Sala de Vacina temporariamente fechada para reunião técnica interna da equipe de enfermagem",
      janela_disponivel: "Amanhã, a partir das 08h00",
      capacidade_diaria: 160,
      atendimentos_hoje: 42,
      salas: [
        {
          id: "sala_vacina",
          nome: "Sala de Imunização e Vacinas",
          servico: "vacinacao",
          status: "em_reuniao_interna", // FECHADA
          responsavel: "Enfª Mariana Rocha (COREN 109.842)",
          fila_espera: 2,
          fichas_restantes: 0,
          motivo_interrupcao: "Reunião de alinhamento emergencial do protocolo de imunização"
        },
        {
          id: "sala_clinico_central",
          nome: "Consultório 01 (Clínico Geral)",
          servico: "clinico_geral",
          status: "aberto",
          responsavel: "Dr. Roberto Freire (CRM 19.821)",
          fila_espera: 5,
          fichas_restantes: 6
        },
        {
          id: "sala_odonto",
          nome: "Consultório Odontológico",
          servico: "odontologia",
          status: "aberto",
          responsavel: "Dra. Luciana Paes (CRO 8.219)",
          fila_espera: 1,
          fichas_restantes: 4
        }
      ]
    },
    {
      id: "ubs_C",
      nome: "UBS 03 - San Martin",
      bairro: "San Martin, Recife - PE",
      distancia: "14 min (3.2km)",
      servicos_disponiveis: ["clinico_geral", "vacinacao", "prenatal"], // TEM VACINA E ESTÁ ABERTA
      status_atual: "aberto_normal",
      motivo_status: "Equipe completa e sala de vacinas em pleno funcionamento",
      janela_disponivel: "Hoje, atendimento imediato até às 17h",
      capacidade_diaria: 140,
      atendimentos_hoje: 94,
      salas: [
        {
          id: "sala_vacina_sanmartin",
          nome: "Sala de Vacinação (Pronta)",
          servico: "vacinacao",
          status: "aberto",
          responsavel: "Enfª Beatriz Lima",
          fila_espera: 1,
          fichas_restantes: 24
        },
        {
          id: "sala_clinico_sanmartin",
          nome: "Consultório Geral",
          servico: "clinico_geral",
          status: "aberto",
          responsavel: "Dr. Felipe Gusmão",
          fila_espera: 3,
          fichas_restantes: 10
        },
        {
          id: "sala_prenatal",
          nome: "Saúde da Mulher & Pré-Natal",
          servico: "prenatal",
          status: "aberto",
          responsavel: "Dra. Renata Vasconcelos",
          fila_espera: 2,
          fichas_restantes: 7
        }
      ]
    }
  ],
  pacientesAfetados: [
    {
      id: "pac_01",
      nome: "Dona Maria José da Silva",
      idade: 67,
      telefone: "(81) 98765-4321",
      cpf_mascarado: "***.482.914-**",
      servico: "vacinacao",
      ubs_id: "ubs_B",
      sala_nome: "Sala de Imunização e Vacinas",
      horario_agendado: "Hoje às 14h15",
      status_alerta: "aguardando_envio", // aguardando_envio | notificado_com_sucesso | remanejado
      remanejado_para: null
    },
    {
      id: "pac_02",
      nome: "Sr. Severino Ramos de Souza",
      idade: 71,
      telefone: "(81) 99123-9876",
      cpf_mascarado: "***.719.304-**",
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
      servico: "clinico_geral",
      ubs_id: "ubs_A",
      sala_nome: "Consultório 01 (Clínico Geral)",
      horario_agendado: "Hoje às 15h30",
      status_alerta: "confirmado_presencial",
      remanejado_para: null
    }
  ],
  metricasGestao: {
    viagens_perdidas_evitadas: 1482,
    horas_fila_poupadas: 4890,
    reducao_noshow_percentual: 78.7, // Queda de 38% para 8.2%
    economia_estimada_reais: "R$ 194.200,00",
    alertas_preventivos_disparados: 312,
    guardrails_violacoes_bloqueadas: 147, // Bloqueios estritos de diagnóstico
    satisfacao_cidadao_nps: "+89",
    taxa_ocupacao_geral: "72%",
    distribuicao_demandas: [
      { servico: "Vacinação (Imunobiológicos)", quantidade: 640, percentual: 43 },
      { servico: "Clínico Geral / Acolhimento", quantidade: 430, percentual: 29 },
      { servico: "Pediatria e Puericultura", quantidade: 220, percentual: 15 },
      { servico: "Saúde Bucal / Odontologia", quantidade: 110, percentual: 7 },
      { servico: "Pré-Natal e Preventivos", quantidade: 90, percentual: 6 }
    ],
    bairros_maior_demanda: [
      { bairro: "Afogados (UBS Central)", indice_pressao: "Alta (94%)", acao_sugerida: "Remanejamento preventivo ativo" },
      { bairro: "Boa Vista (UBS Vila Esperança)", indice_pressao: "Moderada (65%)", acao_sugerida: "Oferta excedente de clínico" },
      { bairro: "San Martin (UBS San Martin)", indice_pressao: "Equilibrada (58%)", acao_sugerida: "Polo receptor de contingência" }
    ]
  }
};

let db = JSON.parse(JSON.stringify(DADOS_INICIAIS));

// ==========================================
// TOOLS DE IA (FUNCTION CALLING)
// ==========================================

function consultar_catalogo_ubs({ servico }) {
  const servicoNormalizado = (servico || "").toLowerCase().trim();
  
  let chaveBusca = servicoNormalizado;
  if (servicoNormalizado.includes("vacin") || servicoNormalizado.includes("imuniz") || servicoNormalizado.includes("dose")) {
    chaveBusca = "vacinacao";
  } else if (servicoNormalizado.includes("clinic") || servicoNormalizado.includes("consult") || servicoNormalizado.includes("medic")) {
    chaveBusca = "clinico_geral";
  } else if (servicoNormalizado.includes("pediat") || servicoNormalizado.includes("crianc")) {
    chaveBusca = "pediatria";
  } else if (servicoNormalizado.includes("odonto") || servicoNormalizado.includes("dente")) {
    chaveBusca = "odontologia";
  } else if (servicoNormalizado.includes("prenatal") || servicoNormalizado.includes("mulher")) {
    chaveBusca = "prenatal";
  }

  const resultados = db.ubss.map(ubs => {
    const oferece = ubs.servicos_disponiveis.includes(chaveBusca);
    return {
      id: ubs.id,
      nome: ubs.nome,
      bairro: ubs.bairro,
      distancia: ubs.distancia,
      oferece_servico: oferece,
      servicos: ubs.servicos_disponiveis
    };
  });

  const unidadesComServico = resultados.filter(u => u.oferece_servico);
  const unidadesSemServico = resultados.filter(u => !u.oferece_servico);

  return {
    servico_pesquisado: chaveBusca,
    unidades_compativeis: unidadesComServico,
    unidades_descartadas: unidadesSemServico.map(u => ({ id: u.id, nome: u.nome, motivo: "Não oferece o serviço no catálogo oficial" })),
    total_encontradas: unidadesComServico.length
  };
}

function consultar_status_ao_vivo({ ubs_id }) {
  const ubs = db.ubss.find(u => u.id === ubs_id);
  if (!ubs) {
    return { erro: `UBS com ID '${ubs_id}' não foi localizada.` };
  }

  const estaDisponivel = ubs.status_atual === "aberto" || ubs.status_atual === "aberto_normal";

  return {
    ubs_id: ubs.id,
    nome: ubs.nome,
    distancia: ubs.distancia,
    status_atual: ubs.status_atual,
    disponivel_para_atendimento: estaDisponivel,
    detalhes_operacionais: ubs.motivo_status,
    proxima_janela: ubs.janela_disponivel,
    alerta_para_cidadao: !estaDisponivel ? "ATENÇÃO: NÃO SE DESLOCAR AGORA. Sala temporariamente indisponível." : "Liberado para atendimento imediato."
  };
}

// ==========================================
// GESTÃO OPERACIONAL DA UBS
// ==========================================

function alterar_status_sala(ubs_id, sala_id, novo_status, motivo) {
  const ubs = db.ubss.find(u => u.id === ubs_id);
  if (!ubs) return { erro: "UBS não encontrada" };

  const sala = ubs.salas.find(s => s.id === sala_id);
  if (!sala) return { erro: "Sala não encontrada" };

  sala.status = novo_status;
  if (motivo) sala.motivo_interrupcao = motivo;

  // Atualiza status global da UBS se for uma sala crítica
  if (sala.servico === "vacinacao") {
    ubs.status_atual = novo_status;
    ubs.motivo_status = motivo || (novo_status === "aberto" ? "Equipe completa e sala em pleno funcionamento" : "Sala fechada para reunião ou contingência");
  }

  return { ubs, sala };
}

function disparar_interrupcao_ubs(ubs_id = "ubs_B", novo_status = "em_reuniao_interna", motivo = "Reunião de emergência da equipe de enfermagem") {
  const ubs = db.ubss.find(u => u.id === ubs_id);
  if (ubs) {
    ubs.status_atual = novo_status;
    ubs.motivo_status = motivo;
    const salaVacina = ubs.salas.find(s => s.servico === "vacinacao");
    if (salaVacina) {
      salaVacina.status = novo_status;
      salaVacina.motivo_interrupcao = motivo;
    }
  }

  const afetados = db.pacientesAfetados.filter(p => p.ubs_id === ubs_id && p.servico === "vacinacao");
  afetados.forEach(p => {
    p.status_alerta = "notificado_com_sucesso";
  });

  // Atualiza KPIs da gestão
  db.metricasGestao.alertas_preventivos_disparados += afetados.length;
  db.metricasGestao.viagens_perdidas_evitadas += afetados.length;
  db.metricasGestao.horas_fila_poupadas += (afetados.length * 3);

  return {
    ubs_afetada: ubs,
    pacientes_afetados: afetados,
    total_afetados: afetados.length
  };
}

function remanejar_paciente(paciente_id, destino_ubs_id) {
  const paciente = db.pacientesAfetados.find(p => p.id === paciente_id);
  const ubsDestino = db.ubss.find(u => u.id === destino_ubs_id);
  if (!paciente || !ubsDestino) return { erro: "Dados inválidos" };

  paciente.remanejado_para = ubsDestino.nome;
  paciente.status_alerta = "remanejado";
  paciente.ubs_id = destino_ubs_id;

  return { sucesso: true, paciente, destino: ubsDestino };
}

function cadastrar_agendamento({ nome, telefone, servico, ubs_id, horario }) {
  const ubs = db.ubss.find(u => u.id === ubs_id);
  const novoId = `pac_${String(db.pacientesAfetados.length + 1).padStart(2, "0")}`;
  const novoPaciente = {
    id: novoId,
    nome: nome || "Cidadão Anônimo",
    idade: 45,
    telefone: telefone || "(81) 98888-7777",
    cpf_mascarado: "***.999.000-**",
    servico: servico || "vacinacao",
    ubs_id: ubs_id,
    sala_nome: servico === "vacinacao" ? "Sala de Vacinas" : "Consultório Geral",
    horario_agendado: horario || "Hoje às 16h00",
    status_alerta: "confirmado_presencial",
    remanejado_para: null
  };

  db.pacientesAfetados.push(novoPaciente);
  return novoPaciente;
}

function obter_todas_ubss() {
  return db.ubss;
}

function obter_ubs_por_id(id) {
  return db.ubss.find(u => u.id === id);
}

function obter_pacientes() {
  return db.pacientesAfetados;
}

function obter_kpis_gestao() {
  return db.metricasGestao;
}

function resetar_banco() {
  db = JSON.parse(JSON.stringify(DADOS_INICIAIS));
  return db;
}

module.exports = {
  consultar_catalogo_ubs,
  consultar_status_ao_vivo,
  alterar_status_sala,
  disparar_interrupcao_ubs,
  remanejar_paciente,
  cadastrar_agendamento,
  obter_todas_ubss,
  obter_ubs_por_id,
  obter_pacientes,
  obter_kpis_gestao,
  resetar_banco
};
