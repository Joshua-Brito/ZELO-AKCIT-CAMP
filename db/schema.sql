-- schema.sql - Estrutura relacional do ZELO (PostgreSQL 16)

CREATE TABLE IF NOT EXISTS ubss (
  id VARCHAR(32) PRIMARY KEY,
  cnes VARCHAR(20) NOT NULL,
  nome VARCHAR(180) NOT NULL,
  rpa VARCHAR(10),
  distrito_sanitario VARCHAR(10),
  endereco TEXT,
  bairro VARCHAR(80),
  telefone VARCHAR(40),
  horario VARCHAR(80),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  servicos_disponiveis JSONB NOT NULL DEFAULT '[]'::jsonb,
  especialidades_texto TEXT,
  status_atual VARCHAR(40) NOT NULL DEFAULT 'aberto',
  motivo_status TEXT,
  janela_disponivel VARCHAR(120),
  capacidade_diaria INTEGER NOT NULL DEFAULT 140,
  atendimentos_hoje INTEGER NOT NULL DEFAULT 0,
  is_demo_foco BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS salas (
  id VARCHAR(64) PRIMARY KEY,
  ubs_id VARCHAR(32) NOT NULL REFERENCES ubss(id) ON DELETE CASCADE,
  nome VARCHAR(140) NOT NULL,
  servico VARCHAR(50) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'aberto',
  responsavel VARCHAR(120),
  fila_espera INTEGER NOT NULL DEFAULT 0,
  fichas_restantes INTEGER NOT NULL DEFAULT 15,
  motivo_interrupcao TEXT
);

CREATE TABLE IF NOT EXISTS pacientes (
  id VARCHAR(32) PRIMARY KEY,
  nome VARCHAR(140) NOT NULL,
  idade INTEGER,
  telefone VARCHAR(40) NOT NULL,
  cpf_mascarado VARCHAR(30),
  bairro VARCHAR(80),
  servico VARCHAR(50) NOT NULL,
  ubs_id VARCHAR(32) NOT NULL REFERENCES ubss(id) ON DELETE CASCADE,
  sala_nome VARCHAR(140),
  horario_agendado VARCHAR(60),
  status_alerta VARCHAR(40) NOT NULL DEFAULT 'aguardando_envio',
  remanejado_para VARCHAR(180),
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS metricas_gestao (
  id INTEGER PRIMARY KEY DEFAULT 1,
  viagens_perdidas_evitadas INTEGER NOT NULL DEFAULT 1482,
  horas_fila_poupadas INTEGER NOT NULL DEFAULT 4890,
  alertas_preventivos_disparados INTEGER NOT NULL DEFAULT 312,
  guardrails_violacoes_bloqueadas INTEGER NOT NULL DEFAULT 147,
  economia_estimada_reais VARCHAR(40) NOT NULL DEFAULT 'R$ 194.200,00',
  reducao_noshow_percentual NUMERIC(5,2) NOT NULL DEFAULT 78.70
);

CREATE TABLE IF NOT EXISTS logs_auditoria (
  id SERIAL PRIMARY KEY,
  tipo VARCHAR(30) NOT NULL,
  tag VARCHAR(60) NOT NULL,
  detalhe TEXT NOT NULL,
  ubs_id VARCHAR(32),
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
