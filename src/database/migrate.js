/**
 * src/database/migrate.js
 * Aplica o schema no banco e executa migrations incrementais.
 * Seguro para executar múltiplas vezes (idempotente).
 */

const { applySchema } = require('./schema');

/**
 * @param {import('better-sqlite3').Database} db
 */
function runMigrations(db) {
  // 1. Garante que as tabelas existem
  applySchema(db);

  // 2. Migrations incrementais — ADD COLUMN é seguro de repetir com try/catch
  const alterColumns = [
    // pedidos
    `ALTER TABLE pedidos ADD COLUMN tem_prime INTEGER DEFAULT 0`,
    `ALTER TABLE pedidos ADD COLUMN numero_caixa TEXT`,
    // usuarios
    `ALTER TABLE usuarios ADD COLUMN senha_temporaria INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE usuarios ADD COLUMN subtipo_repositor TEXT`,
    `ALTER TABLE usuarios ADD COLUMN permissoes TEXT`,
    // repositor_avisos
    `ALTER TABLE repositor_avisos ADD COLUMN supervisor_liberou INTEGER DEFAULT 0`,
    `ALTER TABLE repositor_avisos ADD COLUMN supervisor_nome TEXT`,
    `ALTER TABLE repositor_avisos ADD COLUMN decisao_supervisor TEXT`,
    `ALTER TABLE repositor_avisos ADD COLUMN atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP`,
  ];

  for (const sql of alterColumns) {
    try { db.exec(sql); } catch (_e) { /* coluna já existe — ignora */ }
  }

  console.log('[migrate] Schema atualizado com sucesso.');
}

module.exports = { runMigrations };
