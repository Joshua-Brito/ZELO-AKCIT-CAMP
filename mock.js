// mock.js - Banco de Dados em Memória e Funções de Tooling do Projeto ZELO

const DADOS_INICIAIS = {
  ubss: [
    {
      id: "ubs_A",
      nome: "UBS 01 - Vila Esperança (Mais Próxima)",
      distancia: "4 min a pé (350m)",
      servicos_disponiveis: ["clinico_geral", "pediatria", "curativos"], // NÃO TEM VACINA
      status_atual: "aberto",
      motivo_status: "Funcionamento regular sem fila de espera",
      janela_disponivel: "Hoje, das 07h às 17h"
    },
    {
      id: "ubs_B",
      nome: "UBS 02 - Central da Saúde (Segunda Opção)",
      distancia: "8 min de ônibus (1.8km)",
      servicos_disponiveis: ["clinico_geral", "vacinacao", "odontologia"], // TEM VACINA
      status_atual: "em_reuniao_interna", // GATILHO DA DEMO
      motivo_status: "Sala de Vacina temporariamente fechada para reunião técnica interna da equipe de enfermagem",
      janela_disponivel: "Amanhã, a partir das 08h00"
    },
    {
      id: "ubs_C",
      nome: "UBS 03 - San Martin (Unidade Alternativa)",
      distancia: "14 min (3.2km)",
      servicos_disponiveis: ["clinico_geral", "vacinacao", "prenatal"], // TEM VACINA E ESTÁ ABERTA
      status_atual: "aberto_normal",
      motivo_status: "Equipe completa e sala de vacinas em pleno funcionamento",
      janela_disponivel: "Hoje, atendimento imediato até às 17h"
    }
  ],
  pacientesAfetados: [
    {
      id: "pac_01",
      nome: "Dona Maria José",
      idade: 67,
      telefone: "(81) 98765-4321",
      servico: "vacinacao",
      ubs_id: "ubs_B",
      horario_agendado: "Hoje às 14h15",
      status_alerta: "aguardando_envio"
    },
    {
      id: "pac_02",
      nome: "Sr. Severino Ramos",
      idade: 71,
      telefone: "(81) 99123-9876",
      servico: "vacinacao",
      ubs_id: "ubs_B",
      horario_agendado: "Hoje às 15h00",
      status_alerta: "aguardando_envio"
    }
  ]
};

// Estado mutável durante a execução da demo
let db = JSON.parse(JSON.stringify(DADOS_INICIAIS));

// ==========================================
// FERRAMENTAS EXPOSTAS PARA O FUNCTION CALLING
// ==========================================

/**
 * Tool 1: Consulta matriz de serviços (RAG / Catálogo Oficial)
 * Descarta unidades que não oferecem o procedimento
 */
function consultar_catalogo_ubs({ servico }) {
  const servicoNormalizado = (servico || "").toLowerCase().trim();
  
  // Mapeamento semântico simples para o catálogo
  let chaveBusca = servicoNormalizado;
  if (servicoNormalizado.includes("vacin") || servicoNormalizado.includes("imuniz") || servicoNormalizado.includes("dose")) {
    chaveBusca = "vacinacao";
  } else if (servicoNormalizado.includes("clinic") || servicoNormalizado.includes("consult") || servicoNormalizado.includes("medic")) {
    chaveBusca = "clinico_geral";
  } else if (servicoNormalizado.includes("pediat") || servicoNormalizado.includes("crianc")) {
    chaveBusca = "pediatria";
  }

  const resultados = db.ubss.map(ubs => {
    const oferece = ubs.servicos_disponiveis.includes(chaveBusca);
    return {
      id: ubs.id,
      nome: ubs.nome,
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
    unidades_descartadas: unidadesSemServico.map(u => ({ id: u.id, nome: u.nome, motivo: "Não oferece o serviço no catálogo" })),
    total_encontradas: unidadesComServico.length
  };
}

/**
 * Tool 2: Consulta status em tempo real da UBS (Verificação Operacional)
 * Checa se a sala/equipe está disponível antes de confirmar deslocamento
 */
function consultar_status_ao_vivo({ ubs_id }) {
  const ubs = db.ubss.find(u => u.id === ubs_id);
  if (!ubs) {
    return { erro: `UBS com ID '${ubs_id}' não foi localizada no sistema.` };
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
    alerta_para_cidadao: !estaDisponivel ? "ATENÇÃO: NÃO SE DESLOCAR AGORA. Sala temporariamente indisponível." : "Liberado para atendimento."
  };
}

/**
 * Ação da Recepção da UBS (Agente Sentinela)
 */
function disparar_interrupcao_ubs(ubs_id = "ubs_B", novo_status = "em_reuniao_interna", motivo = "Reunião de emergência da equipe de vacinação") {
  const ubs = db.ubss.find(u => u.id === ubs_id);
  if (ubs) {
    ubs.status_atual = novo_status;
    ubs.motivo_status = motivo;
  }

  // Localiza os pacientes afetados na fila
  const afetados = db.pacientesAfetados.filter(p => p.ubs_id === ubs_id);
  afetados.forEach(p => {
    p.status_alerta = "notificado_com_sucesso";
  });

  return {
    ubs_afetada: ubs,
    pacientes_afetados: afetados,
    total_afetados: afetados.length
  };
}

function obter_todas_ubss() {
  return db.ubss;
}

function obter_pacientes() {
  return db.pacientesAfetados;
}

function resetar_banco() {
  db = JSON.parse(JSON.stringify(DADOS_INICIAIS));
  return db;
}

module.exports = {
  consultar_catalogo_ubs,
  consultar_status_ao_vivo,
  disparar_interrupcao_ubs,
  obter_todas_ubss,
  obter_pacientes,
  resetar_banco
};
