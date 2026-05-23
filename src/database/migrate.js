'use strict';
/**
 * src/database/migrate.js
 * Exporta runSchema() — cria todas as tabelas no PostgreSQL e aplica migrations.
 * Idempotente: usa CREATE TABLE IF NOT EXISTS e ADD COLUMN com tratamento de erro.
 */

const { pool } = require('../../lib/db');

async function runSchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Usuários ─────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id                SERIAL PRIMARY KEY,
        nome              TEXT    NOT NULL,
        login             TEXT    NOT NULL UNIQUE,
        senha_hash        TEXT    NOT NULL,
        perfil            TEXT    NOT NULL DEFAULT 'separador',
        turno             TEXT    NOT NULL DEFAULT 'Manha',
        subtipo_repositor TEXT,
        permissoes        TEXT,
        ativo             INTEGER NOT NULL DEFAULT 1,
        senha_temporaria  INTEGER NOT NULL DEFAULT 0,
        criado_em         TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Pedidos ───────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS pedidos (
        id             SERIAL PRIMARY KEY,
        numero_pedido  TEXT    NOT NULL UNIQUE,
        cliente        TEXT,
        transportadora TEXT,
        tem_prime      INTEGER DEFAULT 0,
        status         TEXT    NOT NULL DEFAULT 'pendente',
        separador_id   INTEGER REFERENCES usuarios(id),
        numero_caixa   TEXT,
        importado_em   TIMESTAMPTZ DEFAULT NOW(),
        iniciado_em    TIMESTAMPTZ,
        concluido_em   TIMESTAMPTZ
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pedidos_status    ON pedidos(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pedidos_numero    ON pedidos(numero_pedido)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pedidos_separador ON pedidos(separador_id)`);

    // ── Itens de pedido ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS itens_pedido (
        id              SERIAL PRIMARY KEY,
        pedido_id       INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
        codigo          TEXT    NOT NULL,
        descricao       TEXT,
        quantidade      INTEGER NOT NULL DEFAULT 1,
        endereco        TEXT,
        status          TEXT    NOT NULL DEFAULT 'pendente',
        obs             TEXT,
        aviso_status    TEXT,
        hora_verificado TEXT
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_itens_pedido_id ON itens_pedido(pedido_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_itens_status    ON itens_pedido(status)`);

    // ── Avisos de reposição ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS repositor_avisos (
        id                   SERIAL PRIMARY KEY,
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
        criado_em            TIMESTAMPTZ DEFAULT NOW(),
        atualizado_em        TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_avisos_status ON repositor_avisos(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_avisos_pedido ON repositor_avisos(numero_pedido)`);

    // ── Sessões de trabalho ───────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessoes_trabalho (
        id           SERIAL PRIMARY KEY,
        usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
        pedido_id    INTEGER REFERENCES pedidos(id),
        iniciado_em  TIMESTAMPTZ DEFAULT NOW(),
        encerrado_em TIMESTAMPTZ,
        duracao_seg  INTEGER
      )
    `);

    // ── Checkouts ─────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS checkouts (
        id            SERIAL PRIMARY KEY,
        pedido_id     INTEGER REFERENCES pedidos(id),
        numero_pedido TEXT,
        numero_caixa  TEXT,
        separador_id  INTEGER REFERENCES usuarios(id),
        checkout_por  INTEGER REFERENCES usuarios(id),
        status        TEXT    DEFAULT 'pendente',
        criado_em     TIMESTAMPTZ DEFAULT NOW(),
        concluido_em  TIMESTAMPTZ
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_checkouts_caixa  ON checkouts(numero_caixa)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_checkouts_pedido ON checkouts(numero_pedido)`);

    // ── Embalagem ─────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS embalagem (
        id            SERIAL PRIMARY KEY,
        pedido_id     INTEGER REFERENCES pedidos(id),
        numero_pedido TEXT,
        embalado_por  INTEGER REFERENCES usuarios(id),
        status        TEXT    DEFAULT 'pendente',
        criado_em     TIMESTAMPTZ DEFAULT NOW(),
        concluido_em  TIMESTAMPTZ
      )
    `);

    // ── Relatórios diários ────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS relatorios_diarios (
        id                   SERIAL PRIMARY KEY,
        data                 TEXT    NOT NULL UNIQUE,
        total_pedidos        INTEGER DEFAULT 0,
        pedidos_concluidos   INTEGER DEFAULT 0,
        pedidos_pendentes    INTEGER DEFAULT 0,
        total_itens          INTEGER DEFAULT 0,
        total_faltas         INTEGER DEFAULT 0,
        faltas_abastecidas   INTEGER DEFAULT 0,
        faltas_nao_encontradas INTEGER DEFAULT 0,
        total_checkouts      INTEGER DEFAULT 0,
        separadores_ativos   INTEGER DEFAULT 0,
        dados_json           TEXT,
        gerado_em            TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Passagem de turno ─────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS passagem_turno (
        id           SERIAL PRIMARY KEY,
        data         TEXT    NOT NULL,
        turno        TEXT    NOT NULL,
        separadores  TEXT,
        ocorrencias  TEXT,
        dados_json   TEXT,
        validado_por INTEGER REFERENCES usuarios(id),
        validado_em  TIMESTAMPTZ,
        criado_por   INTEGER REFERENCES usuarios(id),
        criado_em    TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Diário de bordo ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS diario_bordo (
        id         SERIAL PRIMARY KEY,
        data       TEXT    NOT NULL,
        turno      TEXT    NOT NULL,
        dados_json TEXT,
        salvo_por  INTEGER REFERENCES usuarios(id),
        criado_em  TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Auditoria ─────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS auditoria (
        id         SERIAL PRIMARY KEY,
        usuario_id INTEGER REFERENCES usuarios(id),
        usuario    TEXT,
        acao       TEXT,
        entidade   TEXT,
        ip         TEXT,
        criado_em  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_auditoria_acao   ON auditoria(acao)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_auditoria_criado ON auditoria(criado_em)`);

    // ── Metas ─────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS metas (
        id    SERIAL PRIMARY KEY,
        chave TEXT NOT NULL UNIQUE,
        valor TEXT NOT NULL
      )
    `);

    // ── Importações ───────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS importacoes (
        id            SERIAL PRIMARY KEY,
        arquivo       TEXT,
        total         INTEGER,
        importado_por INTEGER REFERENCES usuarios(id),
        criado_em     TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query('COMMIT');
    console.log('[db] Schema pronto.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[db] Erro ao aplicar schema:', e.message);
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { runSchema };
