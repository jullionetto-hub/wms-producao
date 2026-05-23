'use strict';
/**
 * src/config/env.js
 * Único lugar que lê process.env.
 * Exporte somente constantes tipadas — nunca strings brutas espalhadas pelo código.
 */

const PORT    = parseInt(process.env.PORT  || '3000', 10);
const isProd  = process.env.NODE_ENV === 'production';

const env = {
  PORT,
  isProd,
  NODE_ENV:       process.env.NODE_ENV    || 'development',
  DATABASE_URL:   process.env.DATABASE_URL,

  // Sessão
  SESSION_SECRET:  process.env.SESSION_SECRET  || 'wms-secret-dev-troque-em-prod',
  SESSION_MAX_AGE: parseInt(process.env.SESSION_MAX_AGE || String(24 * 60 * 60 * 1000), 10), // 24 h

  // Segurança
  FORCE_HTTPS:  process.env.FORCE_HTTPS  === 'true',
  CORS_ORIGIN:  process.env.CORS_ORIGIN  || '*',

  // Scheduler
  RELATORIO_CRON: process.env.RELATORIO_CRON || '0 23 * * *',
  TZ:             process.env.TZ             || 'America/Sao_Paulo',
};

if (!env.DATABASE_URL && isProd) {
  console.warn('[env] DATABASE_URL não definida em produção!');
}

module.exports = env;
module.exports.PORT   = PORT;
module.exports.isProd = isProd;
