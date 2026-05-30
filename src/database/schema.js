'use strict';
// Define as queries de criação de todas as tabelas do sistema.

const TABLES = [
  `CREATE TABLE IF NOT EXISTS usuarios (
    id                      SERIAL PRIMARY KEY,
    nome                    TEXT NOT NULL,
    login                   TEXT NOT NULL UNIQUE,
    senha_hash              TEXT NOT NULL,
    perfil                  TEXT NOT NULL DEFAULT 'separador',
    subtipo_repositor       TEXT DEFAULT 'geral',
    perfis_acesso           TEXT DEFAULT '',
    turno                   TEXT DEFAULT 'Manha',
    status                  TEXT DEFAULT 'ativo',
    senha_temporaria        BOOLEAN DEFAULT false,
    senha_temporaria_expira TIMESTAMPTZ,
    data_cadastro           TIMESTAMP DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS separadores (
    id            SERIAL PRIMARY KEY,
    nome          TEXT NOT NULL,
    matricula     TEXT NOT NULL UNIQUE,
    turno         TEXT DEFAULT 'Manha',
    status        TEXT DEFAULT 'ativo',
    usuario_id    INTEGER REFERENCES usuarios(id),
    data_cadastro TIMESTAMP DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS pedidos (
    id                         SERIAL PRIMARY KEY,
    numero_pedido              TEXT NOT NULL UNIQUE,
    separador_id               INTEGER REFERENCES separadores(id),
    status                     TEXT DEFAULT 'pendente',
    pontuacao                  INTEGER DEFAULT 0,
    itens                      INTEGER DEFAULT 0,
    rua                        TEXT DEFAULT '',
    numero_caixa               TEXT DEFAULT '',
    cliente                    TEXT DEFAULT '',
    transportadora             TEXT DEFAULT '',
    aguardando_desde           TEXT DEFAULT '',
    iniciado_em                TEXT DEFAULT '',
    concluido_em               TEXT DEFAULT '',
    tem_prime                  BOOLEAN DEFAULT false,
    tempo_aguardando_min       INTEGER DEFAULT 0,
    aguardando_repositor_desde TEXT DEFAULT '',
    status_embalagem           TEXT DEFAULT 'nao_iniciado',
    embalado_em                TEXT DEFAULT '',
    embalado_por               TEXT DEFAULT '',
    data_pedido                TEXT,
    hora_pedido                TEXT,
    data_criacao               TIMESTAMP DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS itens_pedido (
    id              SERIAL PRIMARY KEY,
    pedido_id       INTEGER NOT NULL REFERENCES pedidos(id),
    codigo          TEXT,
    descricao       TEXT,
    endereco        TEXT,
    quantidade      INTEGER DEFAULT 1,
    status          TEXT DEFAULT 'pendente',
    obs             TEXT DEFAULT '',
    qtd_falta       INTEGER DEFAULT 0,
    hora_verificado TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS avisos_repositor (
    id             SERIAL PRIMARY KEY,
    item_id        INTEGER NOT NULL REFERENCES itens_pedido(id),
    pedido_id      INTEGER NOT NULL REFERENCES pedidos(id),
    numero_pedido  TEXT,
    separador_id   INTEGER,
    separador_nome TEXT,
    codigo         TEXT,
    descricao      TEXT,
    endereco       TEXT,
    quantidade     INTEGER,
    obs            TEXT DEFAULT '',
    status         TEXT DEFAULT 'pendente',
    hora_aviso     TEXT,
    hora_reposto   TEXT,
    data_aviso     TEXT,
    qtd_encontrada INTEGER DEFAULT 0,
    repositor_nome TEXT DEFAULT '',
    quem_pegou     TEXT DEFAULT '',
    quem_guardou   TEXT DEFAULT '',
    forma_envio    TEXT DEFAULT '',
    situacao       TEXT DEFAULT '',
    lido_separador BOOLEAN DEFAULT false
  )`,

  `CREATE TABLE IF NOT EXISTS checkout (
    id             SERIAL PRIMARY KEY,
    numero_caixa   TEXT NOT NULL,
    pedido_id      INTEGER NOT NULL REFERENCES pedidos(id),
    numero_pedido  TEXT NOT NULL,
    separador_nome TEXT DEFAULT '',
    operador_nome  TEXT DEFAULT '',
    status         TEXT DEFAULT 'pendente',
    hora_criacao   TEXT,
    hora_checkout  TEXT,
    data_checkout  TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS embalagem (
    id             SERIAL PRIMARY KEY,
    pedido_id      INTEGER REFERENCES pedidos(id),
    numero_pedido  TEXT NOT NULL,
    embalado_por   TEXT NOT NULL,
    embalado_em    TEXT NOT NULL,
    data_embalagem TEXT NOT NULL,
    cliente        TEXT DEFAULT '',
    transportadora TEXT DEFAULT '',
    is_drive       BOOLEAN DEFAULT false,
    is_prime       BOOLEAN DEFAULT false,
    criado_em      TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS auditoria (
    id            SERIAL PRIMARY KEY,
    usuario_id    INTEGER,
    usuario_login TEXT,
    usuario_nome  TEXT,
    acao          TEXT NOT NULL,
    entidade      TEXT,
    entidade_id   INTEGER,
    dados_antes   JSONB,
    dados_depois  JSONB,
    ip            TEXT,
    data          TEXT,
    hora          TEXT,
    created_at    TIMESTAMP DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS relatorios_diarios (
    id                     SERIAL PRIMARY KEY,
    data                   TEXT UNIQUE NOT NULL,
    total_pedidos          INTEGER DEFAULT 0,
    pedidos_concluidos     INTEGER DEFAULT 0,
    pedidos_pendentes      INTEGER DEFAULT 0,
    total_itens            INTEGER DEFAULT 0,
    total_faltas           INTEGER DEFAULT 0,
    faltas_abastecidas     INTEGER DEFAULT 0,
    faltas_nao_encontradas INTEGER DEFAULT 0,
    total_checkouts        INTEGER DEFAULT 0,
    separadores_ativos     INTEGER DEFAULT 0,
    dados_json             JSONB,
    gerado_em              TIMESTAMP DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS diario_bordo (
    id               SERIAL PRIMARY KEY,
    data             TEXT NOT NULL,
    turno            TEXT NOT NULL,
    supervisor       TEXT NOT NULL,
    dados            JSONB NOT NULL DEFAULT '{}',
    observacoes      TEXT DEFAULT '',
    leu_anterior     BOOLEAN DEFAULT false,
    status           TEXT DEFAULT 'rascunho',
    enviado_em       TIMESTAMPTZ,
    prazo_validacao  TIMESTAMPTZ,
    criado_em        TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS diario_validacoes (
    id               SERIAL PRIMARY KEY,
    diario_id        INTEGER NOT NULL UNIQUE REFERENCES diario_bordo(id) ON DELETE CASCADE,
    validador        TEXT DEFAULT '',
    turno_validador  TEXT DEFAULT '',
    status           TEXT DEFAULT 'pendente',
    itens            JSONB DEFAULT '[]'::jsonb,
    pontuacao        INTEGER,
    obs_geral        TEXT DEFAULT '',
    prazo            TIMESTAMPTZ NOT NULL,
    validado_em      TIMESTAMPTZ,
    criado_em        TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS passagem_turno (
    id                    SERIAL PRIMARY KEY,
    data                  TEXT NOT NULL,
    turno                 TEXT NOT NULL,
    supervisor            TEXT NOT NULL,
    supervisor_id         INTEGER,
    pedidos_separados     INTEGER DEFAULT 0,
    checkouts_feitos      INTEGER DEFAULT 0,
    faltas_abertas        INTEGER DEFAULT 0,
    faltas_resolvidas     INTEGER DEFAULT 0,
    embalagem             INTEGER DEFAULT 0,
    separadores_presentes TEXT DEFAULT '',
    ocorrencias           TEXT DEFAULT '',
    status                TEXT DEFAULT 'pendente',
    criado_em             TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(data, turno)
  )`,

  `CREATE TABLE IF NOT EXISTS validacao_passagem (
    id                  SERIAL PRIMARY KEY,
    passagem_id         INTEGER REFERENCES passagem_turno(id),
    turno_entrando      TEXT NOT NULL,
    supervisor_entrando TEXT NOT NULL,
    supervisor_id       INTEGER,
    resultados          JSONB DEFAULT '{}',
    obs_geral           TEXT DEFAULT '',
    pontos_perdidos     INTEGER DEFAULT 0,
    validado_em         TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS placar_turno (
    id     SERIAL PRIMARY KEY,
    turno  TEXT NOT NULL UNIQUE,
    pontos INTEGER DEFAULT 1000
  )`,

  `CREATE TABLE IF NOT EXISTS sessoes_trabalho (
    id            SERIAL PRIMARY KEY,
    usuario_id    INTEGER REFERENCES usuarios(id),
    usuario_nome  TEXT,
    usuario_login TEXT,
    perfil        TEXT NOT NULL,
    turno         TEXT DEFAULT 'Manha',
    login_em      TIMESTAMPTZ DEFAULT NOW(),
    logout_em     TIMESTAMPTZ,
    duracao_min   INTEGER,
    data          TEXT,
    ip            TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS configuracoes (
    chave     TEXT PRIMARY KEY,
    valor     TEXT NOT NULL,
    descricao TEXT DEFAULT ''
  )`,

  /* ── Entrada Manual de Estoque ────────────────────────────────────────── */
  `CREATE TABLE IF NOT EXISTS entrada_manual_lotes (
    id               SERIAL PRIMARY KEY,
    nome             TEXT    DEFAULT '',
    data_entrada     DATE    NOT NULL,
    criado_por       TEXT    DEFAULT '',
    responsavel      TEXT    DEFAULT '',
    total_itens      INTEGER DEFAULT 0,
    itens_concluidos INTEGER DEFAULT 0,
    status           TEXT    DEFAULT 'aberto',
    criado_em        TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS entrada_manual_itens (
    id                   SERIAL PRIMARY KEY,
    lote_id              INTEGER REFERENCES entrada_manual_lotes(id) ON DELETE CASCADE,
    codigo               TEXT    NOT NULL,
    descricao            TEXT    DEFAULT '',
    quantidade_esperada  INTEGER NOT NULL DEFAULT 1,
    quantidade_abastecida INTEGER DEFAULT 0,
    endereco             TEXT    DEFAULT '',
    status               TEXT    DEFAULT 'pendente',
    responsavel          TEXT    DEFAULT '',
    confirmado_em        TIMESTAMPTZ,
    obs                  TEXT    DEFAULT '',
    criado_em            TIMESTAMPTZ DEFAULT NOW()
  )`,

  /* ── Dash Logística ───────────────────────────────────────────────────── */
  `CREATE TABLE IF NOT EXISTS faturamento_pedidos (
    id            SERIAL PRIMARY KEY,
    numero_pedido TEXT    DEFAULT '',
    faturado      NUMERIC(14,2) DEFAULT 0,
    itens         INTEGER DEFAULT 0,
    data_fat      DATE    NOT NULL,
    hora_fat      TEXT    DEFAULT '',
    usuario       TEXT    NOT NULL,
    turno         TEXT    NOT NULL DEFAULT '?',
    nome_usuario  TEXT    DEFAULT '',
    status_ped    TEXT    DEFAULT '',
    importado_em  TIMESTAMPTZ DEFAULT NOW(),
    importado_por TEXT    DEFAULT ''
  )`,

  `CREATE TABLE IF NOT EXISTS fat_importacoes (
    id             SERIAL PRIMARY KEY,
    nome_arquivo   TEXT    DEFAULT '',
    ini            DATE    NOT NULL,
    fim            DATE    NOT NULL,
    total_registros INTEGER DEFAULT 0,
    importado_por  TEXT    DEFAULT '',
    importado_em   TIMESTAMPTZ DEFAULT NOW()
  )`,
];

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_pedidos_sep         ON pedidos(separador_id, status)',
  'CREATE INDEX IF NOT EXISTS idx_pedidos_num         ON pedidos(numero_pedido)',
  'CREATE INDEX IF NOT EXISTS idx_pedidos_data_status ON pedidos(data_pedido, status)',
  'CREATE INDEX IF NOT EXISTS idx_pedidos_status_sep  ON pedidos(status, separador_id)',
  'CREATE INDEX IF NOT EXISTS idx_itens_pedido        ON itens_pedido(pedido_id)',
  'CREATE INDEX IF NOT EXISTS idx_avisos_status       ON avisos_repositor(status)',
  'CREATE INDEX IF NOT EXISTS idx_avisos_data         ON avisos_repositor(data_aviso)',
  'CREATE INDEX IF NOT EXISTS idx_avisos_data_status  ON avisos_repositor(data_aviso, status)',
  'CREATE INDEX IF NOT EXISTS idx_avisos_codigo       ON avisos_repositor(codigo)',
  'CREATE INDEX IF NOT EXISTS idx_checkout_data       ON checkout(data_checkout)',
  'CREATE INDEX IF NOT EXISTS idx_checkout_caixa      ON checkout(numero_caixa)',
  'CREATE INDEX IF NOT EXISTS idx_usuarios_login      ON usuarios(login)',
  'CREATE INDEX IF NOT EXISTS idx_auditoria_data      ON auditoria(data)',
  'CREATE INDEX IF NOT EXISTS idx_auditoria_usuario   ON auditoria(usuario_login)',
  'CREATE INDEX IF NOT EXISTS idx_sessoes_data        ON sessoes_trabalho(data)',
  'CREATE INDEX IF NOT EXISTS idx_sessoes_usuario     ON sessoes_trabalho(usuario_id)',
  'CREATE INDEX IF NOT EXISTS idx_sessoes_perfil      ON sessoes_trabalho(perfil, data)',
  'CREATE INDEX IF NOT EXISTS idx_em_lotes_data       ON entrada_manual_lotes(data_entrada)',
  'CREATE INDEX IF NOT EXISTS idx_em_itens_lote       ON entrada_manual_itens(lote_id)',
  'CREATE INDEX IF NOT EXISTS idx_em_itens_codigo     ON entrada_manual_itens(codigo)',
  'CREATE INDEX IF NOT EXISTS idx_em_itens_status     ON entrada_manual_itens(status)',
  'CREATE INDEX IF NOT EXISTS idx_fat_data            ON faturamento_pedidos(data_fat)',
  'CREATE INDEX IF NOT EXISTS idx_fat_turno           ON faturamento_pedidos(turno)',
  'CREATE INDEX IF NOT EXISTS idx_fat_usuario         ON faturamento_pedidos(usuario)',
  'CREATE INDEX IF NOT EXISTS idx_fat_data_turno      ON faturamento_pedidos(data_fat, turno)',
];

module.exports = { TABLES, INDEXES };
