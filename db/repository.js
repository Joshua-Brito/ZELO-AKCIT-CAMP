// db/repository.js - Camada de Persistência Unificada (PostgreSQL + Fallback em Memória Pitch-Safe)
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { carregarDadosIniciais } = require("./seedData");
const geo = require("../geo/recife");

let pool = null;
let usandoPostgres = false;

// Estado em memória para fallback quando DATABASE_URL não estiver disponível
let memDb = null;

function inicializarMemoria() {
  const { ubss, salas, pacientes, metricas } = carregarDadosIniciais();
  memDb = {
    ubss: ubss.map((u) => ({
      ...u,
      salas: salas.filter((s) => s.ubs_id === u.id)
    })),
    pacientes,
    metricas: {
      ...metricas,
      distribuicao_demandas: [
        { servico: "Vacinação (Imunobiológicos)", quantidade: 640, percentual: 43 },
        { servico: "Clínico Geral / Acolhimento", quantidade: 430, percentual: 29 },
        { servico: "Pediatria e Puericultura", quantidade: 220, percentual: 15 },
        { servico: "Saúde Bucal / Odontologia", quantidade: 110, percentual: 7 },
        { servico: "Pré-Natal e Preventivos", quantidade: 90, percentual: 6 }
      ]
    },
    logs_auditoria: [
      {
        id: 1,
        tipo: "info",
        tag: "SEED RECIFE",
        detalhe: "Base carregada com 22 UBSs reais do Portal de Dados Abertos da Prefeitura do Recife.",
        ubs_id: null,
        criado_em: new Date().toISOString()
      }
    ]
  };
}

async function seedPostgres(client) {
  const { ubss, salas, pacientes, metricas } = carregarDadosIniciais();

  for (const u of ubss) {
    await client.query(
      `INSERT INTO ubss (id, cnes, nome, rpa, distrito_sanitario, endereco, bairro, telefone, horario,
        latitude, longitude, servicos_disponiveis, especialidades_texto, status_atual, motivo_status,
        janela_disponivel, capacidade_diaria, atendimentos_hoje, is_demo_foco)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18,$19)`,
      [
        u.id, u.cnes, u.nome, u.rpa, u.distrito_sanitario, u.endereco, u.bairro,
        u.telefone, u.horario, u.latitude, u.longitude, JSON.stringify(u.servicos_disponiveis),
        u.especialidades_texto, u.status_atual, u.motivo_status, u.janela_disponivel,
        u.capacidade_diaria, u.atendimentos_hoje, u.is_demo_foco
      ]
    );
  }

  for (const s of salas) {
    await client.query(
      `INSERT INTO salas (id, ubs_id, nome, servico, status, responsavel, fila_espera, fichas_restantes, motivo_interrupcao)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [s.id, s.ubs_id, s.nome, s.servico, s.status, s.responsavel, s.fila_espera, s.fichas_restantes, s.motivo_interrupcao]
    );
  }

  for (const p of pacientes) {
    await client.query(
      `INSERT INTO pacientes (id, nome, idade, telefone, cpf_mascarado, bairro, servico, ubs_id, sala_nome, horario_agendado, status_alerta, remanejado_para)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [p.id, p.nome, p.idade, p.telefone, p.cpf_mascarado, p.bairro, p.servico, p.ubs_id, p.sala_nome, p.horario_agendado, p.status_alerta, p.remanejado_para]
    );
  }

  await client.query(
    `INSERT INTO metricas_gestao (id, viagens_perdidas_evitadas, horas_fila_poupadas, alertas_preventivos_disparados, guardrails_violacoes_bloqueadas, economia_estimada_reais, reducao_noshow_percentual)
     VALUES (1,$1,$2,$3,$4,$5,$6)
     ON CONFLICT (id) DO UPDATE SET
       viagens_perdidas_evitadas = EXCLUDED.viagens_perdidas_evitadas,
       horas_fila_poupadas = EXCLUDED.horas_fila_poupadas,
       alertas_preventivos_disparados = EXCLUDED.alertas_preventivos_disparados,
       guardrails_violacoes_bloqueadas = EXCLUDED.guardrails_violacoes_bloqueadas`,
    [metricas.viagens_perdidas_evitadas, metricas.horas_fila_poupadas, metricas.alertas_preventivos_disparados, metricas.guardrails_violacoes_bloqueadas, metricas.economia_estimada_reais, metricas.reducao_noshow_percentual]
  );

  await client.query(
    `INSERT INTO logs_auditoria (tipo, tag, detalhe) VALUES ($1, $2, $3)`,
    ["info", "SEED POSTGRES", `Seed inicial concluído com ${ubss.length} UBSs reais do Recife.`]
  );
}

async function init() {
  inicializarMemoria();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log("ℹ️ DATABASE_URL não definida. Rodando com base em memória (22 UBSs reais do Recife).");
    return;
  }

  pool = new Pool({ connectionString: dbUrl });

  for (let tentativa = 1; tentativa <= 5; tentativa++) {
    try {
      const client = await pool.connect();
      try {
        const schemaSql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
        await client.query(schemaSql);

        const countRes = await client.query("SELECT COUNT(*)::int AS total FROM ubss");
        if (countRes.rows[0].total === 0) {
          await client.query("BEGIN");
          await seedPostgres(client);
          await client.query("COMMIT");
          console.log("✅ PostgreSQL populado com as 22 UBSs reais do Recife.");
        } else {
          console.log(`✅ PostgreSQL conectado (${countRes.rows[0].total} UBSs carregadas).`);
        }
        usandoPostgres = true;
        return;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.warn(`⏳ Tentativa ${tentativa}/5 de conexão ao PostgreSQL falhou: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  console.warn("⚠️ PostgreSQL indisponível. Fallback em memória ativado automaticamente.");
  pool = null;
  usandoPostgres = false;
}

function anexarDistancia(ubss, lat, lng, bairro) {
  let refLat = lat != null ? parseFloat(lat) : null;
  let refLng = lng != null ? parseFloat(lng) : null;

  if ((refLat == null || Number.isNaN(refLat)) && bairro) {
    const c = geo.resolverBairroParaCoordenadas(bairro);
    if (c) {
      refLat = c.lat;
      refLng = c.lng;
    }
  }

  // Se o usuário não informou localização ainda, referencia padrão no Prado (próximo ao cenário da demo)
  const usouReferenciaPadrao = refLat == null || Number.isNaN(refLat);
  if (usouReferenciaPadrao) {
    refLat = -8.0638;
    refLng = -34.9137;
  }

  const enriquecidas = ubss.map((u) => {
    const km = geo.calcularDistanciaKm(refLat, refLng, u.latitude, u.longitude);
    return {
      ...u,
      distancia_km: Number(km.toFixed(2)),
      distancia: geo.formatarDistanciaTempo(km),
      referencia_padrao: usouReferenciaPadrao
    };
  });

  enriquecidas.sort((a, b) => a.distancia_km - b.distancia_km);
  return enriquecidas;
}

// ==========================================
// OPERAÇÕES DO SISTEMA
// ==========================================

async function obterTodasUbss({ lat = null, lng = null, bairro = null, rpa = null } = {}) {
  let ubss = [];

  if (usandoPostgres) {
    const resUbs = await pool.query("SELECT * FROM ubss ORDER BY is_demo_foco DESC, nome ASC");
    const resSalas = await pool.query("SELECT * FROM salas ORDER BY id ASC");
    const salasPorUbs = {};
    for (const s of resSalas.rows) {
      if (!salasPorUbs[s.ubs_id]) salasPorUbs[s.ubs_id] = [];
      salasPorUbs[s.ubs_id].push(s);
    }
    ubss = resUbs.rows.map((u) => ({
      ...u,
      salas: salasPorUbs[u.id] || []
    }));
  } else {
    ubss = memDb.ubss.map((u) => ({ ...u, salas: [...u.salas] }));
  }

  if (rpa && rpa !== "todas") {
    ubss = ubss.filter((u) => String(u.rpa) === String(rpa));
  }

  return anexarDistancia(ubss, lat, lng, bairro);
}

async function obterUbsPorId(id) {
  if (usandoPostgres) {
    const resU = await pool.query("SELECT * FROM ubss WHERE id = $1", [id]);
    if (resU.rows.length === 0) return null;
    const resS = await pool.query("SELECT * FROM salas WHERE ubs_id = $1 ORDER BY id ASC", [id]);
    return { ...resU.rows[0], salas: resS.rows };
  }
  return memDb.ubss.find((u) => u.id === id) || null;
}

function normalizarChaveServico(servico) {
  const s = (servico || "").toLowerCase().trim();
  if (s.includes("vacin") || s.includes("imuniz") || s.includes("dose")) return "vacinacao";
  if (s.includes("clinic") || s.includes("consult") || s.includes("medic")) return "clinico_geral";
  if (s.includes("pediat") || s.includes("crianc")) return "pediatria";
  if (s.includes("odonto") || s.includes("dent")) return "odontologia";
  if (s.includes("prenatal") || s.includes("mulher") || s.includes("ginec")) return "prenatal";
  if (s.includes("curativ")) return "curativos";
  return s || "clinico_geral";
}

async function consultarCatalogoUbs({ servico, lat = null, lng = null, bairro = null }) {
  const chaveBusca = normalizarChaveServico(servico);
  const todas = await obterTodasUbss({ lat, lng, bairro });

  const compativeis = todas
    .filter((u) => u.servicos_disponiveis.includes(chaveBusca))
    .slice(0, 5)
    .map((u) => ({
      id: u.id,
      nome: u.nome,
      bairro: u.bairro,
      endereco: u.endereco,
      distancia: u.distancia,
      distancia_km: u.distancia_km,
      servicos: u.servicos_disponiveis
    }));

  const descartadasMaisProximas = todas
    .filter((u) => !u.servicos_disponiveis.includes(chaveBusca))
    .slice(0, 3)
    .map((u) => ({
      id: u.id,
      nome: u.nome,
      bairro: u.bairro,
      distancia: u.distancia,
      motivo: `Não oferece '${chaveBusca}' no catálogo oficial`
    }));

  return {
    servico_pesquisado: chaveBusca,
    unidades_compativeis: compativeis,
    unidades_descartadas_proximas: descartadasMaisProximas,
    total_encontradas: todas.filter((u) => u.servicos_disponiveis.includes(chaveBusca)).length
  };
}

async function consultarStatusAoVivo({ ubs_id }) {
  const ubs = await obterUbsPorId(ubs_id);
  if (!ubs) {
    return { erro: `UBS com ID '${ubs_id}' não localizada.` };
  }

  const estaDisponivel = ubs.status_atual === "aberto" || ubs.status_atual === "aberto_normal";
  return {
    ubs_id: ubs.id,
    nome: ubs.nome,
    bairro: ubs.bairro,
    endereco: ubs.endereco,
    telefone: ubs.telefone,
    status_atual: ubs.status_atual,
    disponivel_para_atendimento: estaDisponivel,
    detalhes_operacionais: ubs.motivo_status,
    proxima_janela: ubs.janela_disponivel,
    salas: ubs.salas.map((s) => ({ nome: s.nome, servico: s.servico, status: s.status, fila: s.fila_espera })),
    alerta_para_cidadao: !estaDisponivel
      ? "ATENÇÃO: NÃO SE DESLOCAR AGORA. Sala temporariamente indisponível."
      : "Liberado para atendimento imediato."
  };
}

async function alterarStatusSala(ubs_id, sala_id, novo_status, motivo) {
  const motivoFinal = motivo || (novo_status === "aberto"
    ? "Equipe completa e sala em pleno funcionamento"
    : "Sala fechada temporariamente para reunião ou contingência");

  if (usandoPostgres) {
    const resSala = await pool.query(
      `UPDATE salas SET status = $1, motivo_interrupcao = $2 WHERE id = $3 AND ubs_id = $4 RETURNING *`,
      [novo_status, novo_status === "aberto" ? null : motivoFinal, sala_id, ubs_id]
    );
    if (resSala.rows.length === 0) return { erro: "Sala não encontrada." };
    const sala = resSala.rows[0];

    // Se todas as salas estiverem abertas, UBS fica aberta; se alguma fechar (especialmente vacinacao), atualiza status da UBS
    const resSalas = await pool.query("SELECT * FROM salas WHERE ubs_id = $1", [ubs_id]);
    const fechadas = resSalas.rows.filter((s) => s.status !== "aberto" && s.status !== "aberto_normal");
    const statusUbs = fechadas.length > 0 ? fechadas[0].status : "aberto_normal";
    const motivoUbs = fechadas.length > 0 ? (fechadas[0].motivo_interrupcao || motivoFinal) : "Equipe completa e salas em pleno funcionamento.";

    await pool.query(
      "UPDATE ubss SET status_atual = $1, motivo_status = $2 WHERE id = $3",
      [statusUbs, motivoUbs, ubs_id]
    );

    await registrarAuditoria({
      tipo: novo_status === "aberto" ? "sucesso" : "alerta",
      tag: "STATUS SALA",
      detalhe: `${sala.nome} (${ubs_id}) alterada para '${novo_status}'.`,
      ubs_id
    });

    const ubs = await obterUbsPorId(ubs_id);
    return { ubs, sala };
  }

  const ubs = memDb.ubss.find((u) => u.id === ubs_id);
  if (!ubs) return { erro: "UBS não encontrada." };
  const sala = ubs.salas.find((s) => s.id === sala_id);
  if (!sala) return { erro: "Sala não encontrada." };

  sala.status = novo_status;
  sala.motivo_interrupcao = novo_status === "aberto" ? null : motivoFinal;

  const fechadas = ubs.salas.filter((s) => s.status !== "aberto" && s.status !== "aberto_normal");
  ubs.status_atual = fechadas.length > 0 ? fechadas[0].status : "aberto_normal";
  ubs.motivo_status = fechadas.length > 0 ? (fechadas[0].motivo_interrupcao || motivoFinal) : "Equipe completa e salas em pleno funcionamento.";

  await registrarAuditoria({
    tipo: novo_status === "aberto" ? "sucesso" : "alerta",
    tag: "STATUS SALA",
    detalhe: `${sala.nome} (${ubs_id}) alterada para '${novo_status}'.`,
    ubs_id
  });

  return { ubs, sala };
}

async function dispararInterrupcaoUbs(ubs_id = "ubs_B", novo_status = "em_reuniao_interna", motivo = "Reunião de emergência da equipe de enfermagem") {
  if (usandoPostgres) {
    await pool.query(
      "UPDATE ubss SET status_atual = $1, motivo_status = $2 WHERE id = $3",
      [novo_status, motivo, ubs_id]
    );
    await pool.query(
      "UPDATE salas SET status = $1, motivo_interrupcao = $2 WHERE ubs_id = $3 AND servico = 'vacinacao'",
      [novo_status, motivo, ubs_id]
    );
    const resPac = await pool.query(
      "UPDATE pacientes SET status_alerta = 'notificado_com_sucesso' WHERE ubs_id = $1 AND servico = 'vacinacao' RETURNING *",
      [ubs_id]
    );
    const afetados = resPac.rows;
    if (afetados.length > 0) {
      await pool.query(
        `UPDATE metricas_gestao SET
           alertas_preventivos_disparados = alertas_preventivos_disparados + $1,
           viagens_perdidas_evitadas = viagens_perdidas_evitadas + $1,
           horas_fila_poupadas = horas_fila_poupadas + $2
         WHERE id = 1`,
        [afetados.length, afetados.length * 3]
      );
    }

    await registrarAuditoria({
      tipo: "notificacao",
      tag: "SENTINELA DISPARO",
      detalhe: `Sentinela notificou ${afetados.length} paciente(s) da ${ubs_id}: ${motivo}`,
      ubs_id
    });

    const ubs = await obterUbsPorId(ubs_id);
    return { ubs_afetada: ubs, pacientes_afetados: afetados, total_afetados: afetados.length };
  }

  const ubs = memDb.ubss.find((u) => u.id === ubs_id);
  if (ubs) {
    ubs.status_atual = novo_status;
    ubs.motivo_status = motivo;
    const salaVac = ubs.salas.find((s) => s.servico === "vacinacao");
    if (salaVac) {
      salaVac.status = novo_status;
      salaVac.motivo_interrupcao = motivo;
    }
  }

  const afetados = memDb.pacientes.filter((p) => p.ubs_id === ubs_id && p.servico === "vacinacao");
  afetados.forEach((p) => { p.status_alerta = "notificado_com_sucesso"; });

  memDb.metricas.alertas_preventivos_disparados += afetados.length;
  memDb.metricas.viagens_perdidas_evitadas += afetados.length;
  memDb.metricas.horas_fila_poupadas += afetados.length * 3;

  await registrarAuditoria({
    tipo: "notificacao",
    tag: "SENTINELA DISPARO",
    detalhe: `Sentinela notificou ${afetados.length} paciente(s) da ${ubs_id}: ${motivo}`,
    ubs_id
  });

  return { ubs_afetada: ubs, pacientes_afetados: afetados, total_afetados: afetados.length };
}

async function remanejarPaciente(paciente_id, destino_ubs_id) {
  const destino = await obterUbsPorId(destino_ubs_id);
  if (!destino) return { erro: "Unidade de destino não encontrada." };

  if (usandoPostgres) {
    const res = await pool.query(
      `UPDATE pacientes SET ubs_id = $1, remanejado_para = $2, status_alerta = 'remanejado'
       WHERE id = $3 RETURNING *`,
      [destino_ubs_id, destino.nome, paciente_id]
    );
    if (res.rows.length === 0) return { erro: "Paciente não encontrado." };

    await registrarAuditoria({
      tipo: "sucesso",
      tag: "REMANEJAMENTO",
      detalhe: `Paciente ${res.rows[0].nome} remanejado para ${destino.nome}.`,
      ubs_id: destino_ubs_id
    });

    return { sucesso: true, paciente: res.rows[0], destino };
  }

  const paciente = memDb.pacientes.find((p) => p.id === paciente_id);
  if (!paciente) return { erro: "Paciente não encontrado." };
  paciente.remanejado_para = destino.nome;
  paciente.status_alerta = "remanejado";
  paciente.ubs_id = destino_ubs_id;

  await registrarAuditoria({
    tipo: "sucesso",
    tag: "REMANEJAMENTO",
    detalhe: `Paciente ${paciente.nome} remanejado para ${destino.nome}.`,
    ubs_id: destino_ubs_id
  });

  return { sucesso: true, paciente, destino };
}

async function cadastrarAgendamento({ nome, telefone, bairro, servico, ubs_id, horario }) {
  const id = `pac_${Date.now().toString().slice(-6)}`;
  const salaNome = servico === "vacinacao" ? "Sala de Imunização e Vacinas" : "Consultório";
  const pac = {
    id,
    nome: nome || "Cidadão SUS",
    idade: 45,
    telefone: telefone || "(81) 98888-7777",
    cpf_mascarado: "***.999.000-**",
    bairro: bairro || "RECIFE",
    servico: servico || "vacinacao",
    ubs_id,
    sala_nome: salaNome,
    horario_agendado: horario || "Hoje às 16h00",
    status_alerta: "confirmado_presencial",
    remanejado_para: null
  };

  if (usandoPostgres) {
    await pool.query(
      `INSERT INTO pacientes (id, nome, idade, telefone, cpf_mascarado, bairro, servico, ubs_id, sala_nome, horario_agendado, status_alerta, remanejado_para)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [pac.id, pac.nome, pac.idade, pac.telefone, pac.cpf_mascarado, pac.bairro, pac.servico, pac.ubs_id, pac.sala_nome, pac.horario_agendado, pac.status_alerta, pac.remanejado_para]
    );
    await registrarAuditoria({
      tipo: "sucesso",
      tag: "NOVO AGENDAMENTO",
      detalhe: `Agendamento confirmado para ${pac.nome} (${pac.servico}) na ${ubs_id}.`,
      ubs_id
    });
    return pac;
  }

  memDb.pacientes.push(pac);
  await registrarAuditoria({
    tipo: "sucesso",
    tag: "NOVO AGENDAMENTO",
    detalhe: `Agendamento confirmado para ${pac.nome} (${pac.servico}) na ${ubs_id}.`,
    ubs_id
  });
  return pac;
}

async function obterPacientes(ubs_id = null) {
  if (usandoPostgres) {
    const q = ubs_id
      ? pool.query("SELECT * FROM pacientes WHERE ubs_id = $1 ORDER BY criado_em DESC", [ubs_id])
      : pool.query("SELECT * FROM pacientes ORDER BY criado_em DESC");
    const res = await q;
    return res.rows;
  }
  return ubs_id
    ? memDb.pacientes.filter((p) => p.ubs_id === ubs_id)
    : memDb.pacientes;
}

async function registrarGuardrailBloqueio() {
  if (usandoPostgres) {
    await pool.query(
      "UPDATE metricas_gestao SET guardrails_violacoes_bloqueadas = guardrails_violacoes_bloqueadas + 1 WHERE id = 1"
    );
  } else {
    memDb.metricas.guardrails_violacoes_bloqueadas += 1;
  }
  await registrarAuditoria({
    tipo: "guardrail",
    tag: "GUARDRAIL BLOQUEIO",
    detalhe: "Tentativa de solicitação clínica/prescrição interceptada e bloqueada."
  });
}

async function registrarAuditoria({ tipo, tag, detalhe, ubs_id = null }) {
  if (usandoPostgres) {
    await pool.query(
      "INSERT INTO logs_auditoria (tipo, tag, detalhe, ubs_id) VALUES ($1, $2, $3, $4)",
      [tipo, tag, detalhe, ubs_id]
    ).catch(() => {});
    return;
  }
  memDb.logs_auditoria.unshift({
    id: memDb.logs_auditoria.length + 1,
    tipo,
    tag,
    detalhe,
    ubs_id,
    criado_em: new Date().toISOString()
  });
  memDb.logs_auditoria = memDb.logs_auditoria.slice(0, 50);
}

async function obterLogsAuditoria(limite = 25) {
  if (usandoPostgres) {
    const res = await pool.query(
      "SELECT * FROM logs_auditoria ORDER BY criado_em DESC LIMIT $1",
      [limite]
    );
    return res.rows;
  }
  return memDb.logs_auditoria.slice(0, limite);
}

async function obterKpisGestao() {
  const todas = await obterTodasUbss();
  const abertas = todas.filter((u) => u.status_atual === "aberto" || u.status_atual === "aberto_normal").length;
  const interrompidas = todas.length - abertas;

  let base;
  if (usandoPostgres) {
    const res = await pool.query("SELECT * FROM metricas_gestao WHERE id = 1");
    base = res.rows[0] || {};
  } else {
    base = memDb.metricas;
  }

  return {
    ...base,
    total_ubss_rede: todas.length,
    ubss_abertas: abertas,
    ubss_interrompidas: interrompidas,
    distribuicao_demandas: [
      { servico: "Vacinação (Imunobiológicos)", quantidade: 640, percentual: 43 },
      { servico: "Clínico Geral / Acolhimento", quantidade: 430, percentual: 29 },
      { servico: "Pediatria e Puericultura", quantidade: 220, percentual: 15 },
      { servico: "Saúde Bucal / Odontologia", quantidade: 110, percentual: 7 },
      { servico: "Pré-Natal e Preventivos", quantidade: 90, percentual: 6 }
    ]
  };
}

async function resetarBanco() {
  inicializarMemoria();
  if (usandoPostgres) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("TRUNCATE TABLE logs_auditoria, pacientes, salas, ubss, metricas_gestao RESTART IDENTITY CASCADE");
      await seedPostgres(client);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  return { ubss: await obterTodasUbss(), pacientes: await obterPacientes() };
}

function getInfoPersistencia() {
  return { engine: usandoPostgres ? "PostgreSQL" : "Memória (Fallback)" };
}

module.exports = {
  init,
  obterTodasUbss,
  obterUbsPorId,
  consultarCatalogoUbs,
  consultarStatusAoVivo,
  alterarStatusSala,
  dispararInterrupcaoUbs,
  remanejarPaciente,
  cadastrarAgendamento,
  obterPacientes,
  registrarGuardrailBloqueio,
  registrarAuditoria,
  obterLogsAuditoria,
  obterKpisGestao,
  resetarBanco,
  getInfoPersistencia
};
