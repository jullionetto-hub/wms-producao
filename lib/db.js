const { Pool } = require('pg');

const isProd = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.DATABASE_URL||'').includes('railway') || isProd
    ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do PostgreSQL:', err.message);
});

/**
 * run: resultado cru do pg · get: UMA linha (ou null) · all: lista de linhas.
 * (Comentario de tipo: so ajuda o TypeScript a checar o codigo, nao muda nada na execucao.)
 * @type {{
 *   run: (sql: string, p?: any[]) => Promise<import('pg').QueryResult<any>>,
 *   get: (sql: string, p?: any[]) => Promise<any>,
 *   all: (sql: string, p?: any[]) => Promise<any[]>
 * }}
 */
const db = {
  run: (sql, p=[]) => pool.query(sql, p),
  get: async (sql, p=[]) => { const r = await pool.query(sql, p); return r.rows[0] || null; },
  all: async (sql, p=[]) => { const r = await pool.query(sql, p); return r.rows; }
};

module.exports = { pool, db };
