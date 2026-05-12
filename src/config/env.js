'use strict';
// Centraliza e valida todas as variáveis de ambiente.
// Importe este módulo onde precisar de configs; nunca use process.env diretamente.

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente obrigatória não definida: ${name}`);
  return v;
}

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

module.exports = {
  isProd,
  isTest,
  PORT: process.env.PORT || 3000,
  DATABASE_URL: isProd || !isTest ? required('DATABASE_URL') : process.env.DATABASE_URL,
  SESSION_SECRET: isProd ? required('SESSION_SECRET') : (process.env.SESSION_SECRET || 'dev_secret_local_apenas'),
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean),
};
