'use strict';
// Executa o schema completo (tabelas + índices).
// Todas as tabelas usam CREATE IF NOT EXISTS, então é seguro rodar múltiplas vezes.

const { pool }            = require('../../lib/db');
const { TABLES, INDEXES } = require('./schema');
const log                 = require('../../lib/logger');

async function runSchema() {
  for (const sql of TABLES)  await pool.query(sql);
  for (const sql of INDEXES) await pool.query(sql);
  log.info('schema e índices aplicados com sucesso');
}

module.exports = { runSchema };
