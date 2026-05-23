/**
 * src/config/env.js
 * Centraliza todas as variáveis de ambiente.
 * Nenhuma outra parte do código deve ler process.env diretamente.
 */

const env = {
  PORT:        process.env.PORT        || 3000,
  NODE_ENV:    process.env.NODE_ENV    || 'development',
  DATABASE_URL: process.env.DATABASE_URL,

  // Sessão
  SESSION_SECRET: process.env.SESSION_SECRET || 'wms-secret-dev-change-in-prod',
  SESSION_MAX_AGE: parseInt(process.env.SESSION_MAX_AGE || '86400000'), // 24h

  // HTTPS / proxy reverso
  TRUST_PROXY: process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production',
  FORCE_HTTPS: process.env.FORCE_HTTPS === 'true',

  // Relatório diário (cron)
  RELATORIO_CRON: process.env.RELATORIO_CRON || '0 23 * * *', // 23:00 todo dia
  TZ: process.env.TZ || 'America/Sao_Paulo',
};

if (!env.DATABASE_URL) {
  console.warn('[env] DATABASE_URL não definida — usando SQLite local (dev)');
}

module.exports = env;
