'use strict';
/**
 * src/database/migrate.js
 * Exporta runSchema() — cria todas as tabelas e aplica migrations incrementais.
 * Seguro para chamar múltiplas vezes (idempotente).
 */

const db = require('../../lib/db');  // instância better-sqlite3 da aplicação

// ── Tabelas base ──────────────────────────────────────────────────────────────
function criarTabelas() {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      nome              TEXT    NOT NULL,
      login             TEXT    NOT NULL UNIQUE,
      senha_hash        TEXT    NOT NULL,
      perfil            TEXT    NOT NULL DEFAULT 'separador',
      turno             TEXT    NOT NULL DEFAULT 'Manha',
      subtipo_repositor TEXT,
      permissoes        TEXT,
      ativo             INTEGER NOT NULL DEFAULT 1,
      senha_temporaria  INTEGER NOT NULL DEFAULT 0,
      criado_em         DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pedidos (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      numero_pedido  TEXT    NOT NULL UNIQUE,
      cliente        TEXT,
      transportadora TEXT,
      tem_prime      INTEGER DEFAULT 0,
      status         TEXT    NOT NULL DEFAULT 'pendente',
      separador_id   INTEGER REFERENCES usuarios(id),
      numero_caixa   TEXT,
      importado_em   DATETIME DEFAULT CURRENT_TIMESTAMP,
      iniciado_em    DATETIME,
      concluido_em   DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_pedidos_status    ON pedidos(status);
    CREATE INDEX IF NOT EXISTS idx_pedidos_numero    ON pedidos(numero_pedido);
    CREATE INDEX IF NOT EXISTS idx_pedidos_separador ON pedidos(separador_id);

    CREATE TABLE IF NOT EXISTS itens_pedido (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id       INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
      codigo          TEXT    NOT NULL,
      descricao       TEXT,
      quantidade      INTEGER NOT NULL DEFAULT 1,
      endereco        TEXT,
      status          TEXT    NOT NULL DEFAULT 'pendente',
      obs             TEXT,
      aviso_status    TEXT,
      hora_verificado TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_itens_pedido_id ON itens_pedido(pedido_id);
    CREATE INDEX IF NOT EXISTS idx_itens_status    ON itens_pedido(status);

    CREATE TABLE IF NOT EXISTS repositor_avisos (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id              INTEGER REFERENCES itens_pedido(id),
      numero_pedido        TEXT,
      codigo               TEXT,
      descricao            TEXT,
      quantidade           INTEGER DEFAULT 1,
      endereco             TEXT,
      separador_id         INTEGER REFERENCES usuarios(id),
      separador_nome       TEXT,
      quem_pegou           TEXT,
      quem_guardou         TEXT,
      situacao             TEXT    DEFAULT 'pendente',
      status               TEXT    DEFAULT 'pendente',
      obs                  TEXT,
      supervisor_liberou   INTEGER DEFAULT 0,
      supervisor_nome      TEXT,
      decisao_supervisor   TEXT,
      hora_aviso           TEXT,
      criado_em            DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em        DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_avisos_status ON repositor_avisos(status);
    CREATE INDEX IF NOT EXISTS idx_avisos_pedido ON repositor_avisos(numero_pedido);

    CREATE TABLE IF NOT EXISTS sessoes_trabalho (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
      pedido_id    INTEGER REFERENCES pedidos(id),
      iniciado_em  DATETIME DEFAULT CURRENT_TIMESTAMP,
      encerrado_em DATETIME,
      duracao_seg  INTEGER
    );

    CREATE TABLE IF NOT EXISTS checkouts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id     INTEGER REFERENCES pedidos(id),
      numero_pedido TEXT,
      numero_caixa  TEXT,
      separador_id  INTEGER REFERENCES usuarios(id),
      checkout_por  INTEGER REFERENCES usuarios(id),
      status        TEXT    DEFAULT 'pendente',
      criado_em     DATETIME DEFAULT CURRENT_TIMESTAMP,
      concluido_em  DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_checkouts_caixa  ON checkouts(numero_caixa);
    CREATE INDEX IF NOT EXISTS idx_checkouts_pedido ON checkouts(numero_pedido);

    CREATE TABLE IF NOT EXISTS embalagem (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id     INTEGER REFERENCES pedidos(id),
      numero_pedido TEXT,
      embalado_por  INTEGER REFERENCES usuarios(id),
      status        TEXT    DEFAULT 'pendente',
      criado_em     DATETIME DEFAULT CURRENT_TIMESTAMP,
      concluido_em  DATETIME
    );

    CREATE TABLE IF NOT EXISTS relatorios_diarios (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      data      TEXT    NOT NULL,
      conteudo  TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_relatorios_data ON relatorios_diarios(data);

    CREATE TABLE IF NOT EXISTS passagem_turno (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      data         TEXT    NOT NULL,
      turno        TEXT    NOT NULL,
      separadores  TEXT,
      ocorrencias  TEXT,
      dados_json   TEXT,
      validado_por INTEGER REFERENCES usuarios(id),
      validado_em  DATETIME,
      criado_por   INTEGER REFERENCES usuarios(id),
      criado_em    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS diario_bordo (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      data      TEXT    NOT NULL,
      turno     TEXT    NOT NULL,
      dados_json TEXT,
      salvo_por INTEGER REFERENCES usuarios(id),
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS auditoria (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER REFERENCES usuarios(id),
      usuario    TEXT,
      acao       TEXT,
      entidade   TEXT,
      ip         TEXT,
      criado_em  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_auditoria_acao   ON auditoria(acao);
    CREATE INDEX IF NOT EXISTS idx_auditoria_criado ON auditoria(criado_em);

    CREATE TABLE IF NOT EXISTS metas (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      chave TEXT    NOT NULL UNIQUE,
      valor TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS importacoes (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      arquivo       TEXT,
      total         INTEGER,
      importado_por INTEGER REFERENCES usuarios(id),
      criado_em     DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// ── Migrations incrementais (ADD COLUMN é idempotente via try/catch) ─────────
function runMigrations() {
  const alterColumns = [
    `ALTER TABLE pedidos          ADD COLUMN tem_prime          INTEGER DEFAULT 0`,
    `ALTER TABLE pedidos          ADD COLUMN numero_caixa       TEXT`,
    `ALTER TABLE usuarios         ADD COLUMN senha_temporaria   INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE usuarios         ADD COLUMN subtipo_repositor  TEXT`,
    `ALTER TABLE usuarios         ADD COLUMN permissoes         TEXT`,
    `ALTER TABLE repositor_avisos ADD COLUMN supervisor_liberou INTEGER DEFAULT 0`,
    `ALTER TABLE repositor_avisos ADD COLUMN supervisor_nome    TEXT`,
    `ALTER TABLE repositor_avisos ADD COLUMN decisao_supervisor TEXT`,
    `ALTER TABLE repositor_avisos ADD COLUMN atualizado_em      DATETIME DEFAULT CURRENT_TIMESTAMP`,
  ];
  for (const sql of alterColumns) {
    try { db.exec(sql); } catch (_) { /* coluna já existe — ignora */ }
  }
}

// ── Export ────────────────────────────────────────────────────────────────────
async function runSchema() {
  criarTabelas();
  runMigrations();
  console.log('[db] Schema pronto.');
}

module.exports = { runSchema };
