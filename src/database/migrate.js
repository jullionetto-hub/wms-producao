'use strict';
// Executa o schema completo (tabelas + índices).
// Todas as tabelas usam CREATE IF NOT EXISTS, então é seguro rodar múltiplas vezes.

const { pool }            = require('../../lib/db');
const { TABLES, INDEXES } = require('./schema');
const log                 = require('../../lib/logger');

// Seed de configurações padrão e alterações de colunas aplicadas após criação inicial
const ALTERATIONS = [
  "INSERT INTO configuracoes (chave,valor,descricao) VALUES ('meta_separacao','75','Meta pedidos separação/turno') ON CONFLICT (chave) DO NOTHING",
  "INSERT INTO configuracoes (chave,valor,descricao) VALUES ('meta_embalagem','120','Meta embalagem/turno') ON CONFLICT (chave) DO NOTHING",
  "INSERT INTO configuracoes (chave,valor,descricao) VALUES ('meta_checkout','90','Meta checkout/turno') ON CONFLICT (chave) DO NOTHING",
  "INSERT INTO configuracoes (chave,valor,descricao) VALUES ('meta_reposicao','90','Meta reposição/turno') ON CONFLICT (chave) DO NOTHING",
  "INSERT INTO configuracoes (chave,valor,descricao) VALUES ('horas_turno_manha','8','Horas turno Manhã') ON CONFLICT (chave) DO NOTHING",
  "INSERT INTO configuracoes (chave,valor,descricao) VALUES ('horas_turno_tarde','8','Horas turno Tarde') ON CONFLICT (chave) DO NOTHING",
  "INSERT INTO configuracoes (chave,valor,descricao) VALUES ('horas_turno_noite','6','Horas turno Noite') ON CONFLICT (chave) DO NOTHING",
  "ALTER TABLE passagem_turno ADD COLUMN IF NOT EXISTS sep_separados INTEGER DEFAULT 0",
  "ALTER TABLE passagem_turno ADD COLUMN IF NOT EXISTS sep_pendentes INTEGER DEFAULT 0",
  "ALTER TABLE passagem_turno ADD COLUMN IF NOT EXISTS sep_em_separacao INTEGER DEFAULT 0",
  "ALTER TABLE passagem_turno ADD COLUMN IF NOT EXISTS ck_feitos INTEGER DEFAULT 0",
  "ALTER TABLE passagem_turno ADD COLUMN IF NOT EXISTS ck_pendentes INTEGER DEFAULT 0",
  "ALTER TABLE passagem_turno ADD COLUMN IF NOT EXISTS emb_embalados INTEGER DEFAULT 0",
  "ALTER TABLE passagem_turno ADD COLUMN IF NOT EXISTS emb_pendentes INTEGER DEFAULT 0",
  "ALTER TABLE passagem_turno ADD COLUMN IF NOT EXISTS rep_procurando INTEGER DEFAULT 0",
  "ALTER TABLE passagem_turno ADD COLUMN IF NOT EXISTS rep_na_rua INTEGER DEFAULT 0",
];

async function runSchema() {
  for (const sql of TABLES)      await pool.query(sql);
  for (const sql of INDEXES)     await pool.query(sql);
  for (const sql of ALTERATIONS) await pool.query(sql).catch(() => {});
  log.info('schema, índices e migrações aplicados com sucesso');
}

module.exports = { runSchema };
