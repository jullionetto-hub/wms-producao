import { Pool } from 'pg';
import type { QueryResult } from 'pg';

const isProd = process.env.NODE_ENV === 'production';

export const pool = new Pool({
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
 * As linhas voltam como `any` de propósito: o formato de cada tabela só vai ser tipado
 * aos poucos, rota por rota, nas próximas etapas.
 */
export const db: {
  run: (sql: string, p?: any[]) => Promise<QueryResult<any>>;
  get: (sql: string, p?: any[]) => Promise<any>;
  all: (sql: string, p?: any[]) => Promise<any[]>;
} = {
  run: (sql, p=[]) => pool.query(sql, p),
  get: async (sql, p=[]) => { const r = await pool.query(sql, p); return r.rows[0] || null; },
  all: async (sql, p=[]) => { const r = await pool.query(sql, p); return r.rows; }
};
