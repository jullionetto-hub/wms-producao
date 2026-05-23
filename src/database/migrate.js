'use strict';
/**
 * src/database/migrate.js
 * Exporta runSchema() — cria tabelas que não existem e adiciona colunas faltantes.
 * 100% idempotente: seguro rodar várias vezes sem perder dados.
 */

const { pool } = require('../../lib/db');

async function runSchema() {
  const client = await pool.connect();
  try {
    // ── 1. Criar tabelas (só cria se não existir) ─────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id    SERIAL PRIMARY KEY,
        nome  TEXT NOT NULL,
        login TEXT NOT NULL UNIQUE,
        senha_hash TEXT NOT NULL,
        perfil TEXT NOT NULL DEFAULT 'separador',
        turno  TEXT NOT NULL DEFAULT 'Manha',
        ativo  INTEGER NOT NULL DEFAULT 1
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS pedidos (
        id            SERIAL PRIMARY KEY,
        numero_pedido TEXT NOT NULL UNIQUE,
        cliente        TEXT,
        transportadora TEXT,
        status         TEXT NOT NULL DEFAULT 'pendente',
        separador_id   INTEGER REFERENCES usuarios(id),
        importado_em   TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pedidos_status    ON pedidos(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pedidos_numero    ON pedidos(numero_pedido)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pedidos_separador ON pedidos(separador_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS itens_pedido (
        id          SERIAL PRIMARY KEY,
        pedido_id   INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
        codigo      TEXT NOT NULL,
        descricao   TEXT,
        quantidade  INTEGER NOT NULL DEFAULT 1,
        endereco    TEXT,
        status      TEXT NOT NULL DEFAULT 'pendente'
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_itens_pedido_id ON itens_pedido(pedido_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_itens_status    ON itens_pedido(status)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS repositor_avisos (
        id     SERIAL PRIMARY KEY,
        status TEXT DEFAULT 'pendente',
        criado_em TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_avisos_status ON repositor_avisos(status)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sessoes_trabalho (
        id         SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
        pedido_id  INTEGER REFERENCES pedidos(id),
        iniciado_em TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS checkouts (
        id            SERIAL PRIMARY KEY,
        numero_pedido TEXT,
        numero_caixa  TEXT,
        status        TEXT DEFAULT 'pendente',
        criado_em     TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_checkouts_caixa  ON checkouts(numero_caixa)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_checkouts_pedido ON checkouts(numero_pedido)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS embalagem (
        id            SERIAL PRIMARY KEY,
        numero_pedido TEXT,
        status        TEXT DEFAULT 'pendente',
        criado_em     TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS relatorios_diarios (
        id   SERIAL PRIMARY KEY,
        data TEXT NOT NULL UNIQUE,
        gerado_em TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS passagem_turno (
        id        SERIAL PRIMARY KEY,
        data      TEXT NOT NULL,
        turno     TEXT NOT NULL,
        criado_em TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS diario_bordo (
        id        SERIAL PRIMARY KEY,
        data      TEXT NOT NULL,
        turno     TEXT NOT NULL,
        criado_em TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS auditoria (
        id        SERIAL PRIMARY KEY,
        acao      TEXT,
        criado_em TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_auditoria_acao   ON auditoria(acao)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_auditoria_criado ON auditoria(criado_em)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS metas (
        id    SERIAL PRIMARY KEY,
        chave TEXT NOT NULL UNIQUE,
        valor TEXT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS importacoes (
        id        SERIAL PRIMARY KEY,
        arquivo   TEXT,
        total     INTEGER,
        criado_em TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── 2. ADD COLUMN IF NOT EXISTS — adiciona colunas que podem faltar ─────────────
    // usuarios
    const usuariosAlter = [
      `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS subtipo_repositor TEXT`,
      `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS permissoes        TEXT`,
      `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS senha_temporaria  INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS criado_em         TIMESTAMPTZ DEFAULT NOW()`,
    ];
    // pedidos
    const pedidosAlter = [
      `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tem_prime     INTEGER DEFAULT 0`,
      `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS numero_caixa  TEXT`,
      `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS iniciado_em   TIMESTAMPTZ`,
      `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS concluido_em  TIMESTAMPTZ`,
    ];
    // itens_pedido
    const itensAlter = [
      `ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS obs             TEXT`,
      `ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS aviso_status    TEXT`,
      `ALTER TABLE itens_pedido ADD COLUMN IF NOT EXISTS hora_verificado TEXT`,
    ];
    // repositor_avisos
    const avisosAlter = [
      `ALTER TABLE repositor_avisos ADD COLUMN IF NOT EXISTS item_id            INTEGER`,
      `ALTER TABLE repositor_avisos ADD COLUMN IF NOT EXISTS numero_pedido      TEXT`,
      `ALTER TABLE repositor_avisos ADD COLUMN IF NOT EXISTS codigo             TEXT`,
      `ALTER TABLE repositor_avisos ADD COLUMN IF NOT EXISTS descricao          TEXT`,
      `ALTER TABLE repositor_avisos ADD COLUMN IF NOT EXISTS quantidade         INTEGER DEFAULT 1`,
      `ALTER TABLE repositor_avisos ADD COLUMN IF NOT EXISTS endereco           TEXT`,
      `ALTER TABLE repositor_avisos ADD COLUMN IF NOT EXISTS separador_id       INTEGER`,
      `ALTER TABLE repositor_avisos ADD COLUMN IF NOT EXISTS separador_nome     TEXT`,
      `ALTER TABLE repositor_avisos ADD COLUMN IF NOT EXISTS quem_pegou         TEXT`,
      `ALTER TABLE repositor_avisos ADD COLUMN IF NOT EXISTS quem_guardou       TEXT`,
      `ALTER TABLE repositor_avisos ADD COLUMN IF NOT EXISTS situacao           TEXT DEFAULT 'pendente'`,
      `ALTER TABLE repositor_avisos ADD COLUMN IF NOT EXISTS obs                TEXT`,
      `ALTER TABLE repositor_avisos ADD COLUMN IF NOT EXISTS supervisor_liberou INTEGER DEFAULT 0`,
      `ALTER TABLE repositor_avisos ADD COLUMN IF NOT EXISTS supervisor_nome    TEXT`,
      `ALTER TABLE repositor_avisos ADD COLUMN IF NOT EXISTS decisao_supervisor TEXT`,
      `ALTER TABLE repositor_avisos ADD COLUMN IF NOT EXISTS hora_aviso         TEXT`,
      `ALTER TABLE repositor_avisos ADD COLUMN IF NOT EXISTS atualizado_em      TIMESTAMPTZ DEFAULT NOW()`,
      `CREATE INDEX IF NOT EXISTS idx_avisos_pedido ON repositor_avisos(numero_pedido)`,
    ];
    // sessoes_trabalho
    const sessoesAlter = [
      `ALTER TABLE sessoes_trabalho ADD COLUMN IF NOT EXISTS encerrado_em TIMESTAMPTZ`,
      `ALTER TABLE sessoes_trabalho ADD COLUMN IF NOT EXISTS duracao_seg  INTEGER`,
    ];
    // checkouts
    const checkoutsAlter = [
      `ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS pedido_id    INTEGER`,
      `ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS separador_id INTEGER`,
      `ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS checkout_por INTEGER`,
      `ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS concluido_em TIMESTAMPTZ`,
    ];
    // embalagem
    const embalagemAlter = [
      `ALTER TABLE embalagem ADD COLUMN IF NOT EXISTS pedido_id   INTEGER`,
      `ALTER TABLE embalagem ADD COLUMN IF NOT EXISTS embalado_por INTEGER`,
      `ALTER TABLE embalagem ADD COLUMN IF NOT EXISTS concluido_em TIMESTAMPTZ`,
    ];
    // relatorios_diarios
    const relatoriosAlter = [
      `ALTER TABLE relatorios_diarios ADD COLUMN IF NOT EXISTS total_pedidos          INTEGER DEFAULT 0`,
      `ALTER TABLE relatorios_diarios ADD COLUMN IF NOT EXISTS pedidos_concluidos     INTEGER DEFAULT 0`,
      `ALTER TABLE relatorios_diarios ADD COLUMN IF NOT EXISTS pedidos_pendentes      INTEGER DEFAULT 0`,
      `ALTER TABLE relatorios_diarios ADD COLUMN IF NOT EXISTS total_itens            INTEGER DEFAULT 0`,
      `ALTER TABLE relatorios_diarios ADD COLUMN IF NOT EXISTS total_faltas           INTEGER DEFAULT 0`,
      `ALTER TABLE relatorios_diarios ADD COLUMN IF NOT EXISTS faltas_abastecidas     INTEGER DEFAULT 0`,
      `ALTER TABLE relatorios_diarios ADD COLUMN IF NOT EXISTS faltas_nao_encontradas INTEGER DEFAULT 0`,
      `ALTER TABLE relatorios_diarios ADD COLUMN IF NOT EXISTS total_checkouts        INTEGER DEFAULT 0`,
      `ALTER TABLE relatorios_diarios ADD COLUMN IF NOT EXISTS separadores_ativos     INTEGER DEFAULT 0`,
      `ALTER TABLE relatorios_diarios ADD COLUMN IF NOT EXISTS dados_json             TEXT`,
    ];
    // passagem_turno
    const passagemAlter = [
      `ALTER TABLE passagem_turno ADD COLUMN IF NOT EXISTS separadores  TEXT`,
      `ALTER TABLE passagem_turno ADD COLUMN IF NOT EXISTS ocorrencias  TEXT`,
      `ALTER TABLE passagem_turno ADD COLUMN IF NOT EXISTS dados_json   TEXT`,
      `ALTER TABLE passagem_turno ADD COLUMN IF NOT EXISTS validado_por INTEGER`,
      `ALTER TABLE passagem_turno ADD COLUMN IF NOT EXISTS validado_em  TIMESTAMPTZ`,
      `ALTER TABLE passagem_turno ADD COLUMN IF NOT EXISTS criado_por   INTEGER`,
    ];
    // diario_bordo
    const diarioAlter = [
      `ALTER TABLE diario_bordo ADD COLUMN IF NOT EXISTS dados_json TEXT`,
      `ALTER TABLE diario_bordo ADD COLUMN IF NOT EXISTS salvo_por  INTEGER`,
    ];
    // auditoria
    const auditoriaAlter = [
      `ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS usuario_id INTEGER`,
      `ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS usuario    TEXT`,
      `ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS entidade   TEXT`,
      `ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS ip         TEXT`,
    ];
    // importacoes
    const importacoesAlter = [
      `ALTER TABLE importacoes ADD COLUMN IF NOT EXISTS importado_por INTEGER`,
    ];

    const todasAlteracoes = [
      ...usuariosAlter, ...pedidosAlter, ...itensAlter, ...avisosAlter,
      ...sessoesAlter, ...checkoutsAlter, ...embalagemAlter, ...relatoriosAlter,
      ...passagemAlter, ...diarioAlter, ...auditoriaAlter, ...importacoesAlter,
    ];

    for (const sql of todasAlteracoes) {
      await client.query(sql);
    }

    console.log('[db] Schema pronto.');
  } catch (e) {
    console.error('[db] Erro ao aplicar schema:', e.message);
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { runSchema };
