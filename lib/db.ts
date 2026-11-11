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
 * Sem informar o tipo, as linhas voltam como `any` (como sempre foi). Quando a consulta é de UMA tabela,
 * informe o tipo gerado em types/db.d.ts:   db.get<Linha<'pedidos'>>('SELECT * FROM pedidos WHERE id=$1', [id])
 * (só vale para linhas completas da tabela; consultas com JOIN/colunas calculadas continuam sem tipo).
 */
export const db: {
  run: (sql: string, p?: any[]) => Promise<QueryResult<any>>;
  get: <T = any>(sql: string, p?: any[]) => Promise<T | null>;
  all: <T = any>(sql: string, p?: any[]) => Promise<T[]>;
} = {
  run: (sql, p=[]) => pool.query(sql, p),
  get: async <T = any>(sql: string, p: any[] = []) => { const r = await pool.query(sql, p); return (r.rows[0] || null) as T | null; },
  all: async <T = any>(sql: string, p: any[] = []) => { const r = await pool.query(sql, p); return r.rows as T[]; }
};
