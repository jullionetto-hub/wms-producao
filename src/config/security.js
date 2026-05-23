'use strict';
/**
 * src/config/security.js
 * Middlewares de segurança: Helmet, CORS, headers extras e redirect HTTPS.
 *
 * Exporta funções/middlewares prontos para usar no app.use().
 */

const helmet = require('helmet');
const env    = require('./env');

// ── Redirect HTTP → HTTPS ────────────────────────────────────────────────────
const httpsRedirect = (req, res, next) => {
  if (env.FORCE_HTTPS && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
};

// ── Helmet — headers de segurança padrão ─────────────────────────────────────
const helmetMiddleware = helmet({
  contentSecurityPolicy:    false,
  crossOriginEmbedderPolicy: false,
});

// ── CORS simples (origin dinâmica para suportar credenciais) ──────────────────
const corsMiddleware = (req, res, next) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin',      origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods',     'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',     'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
};

// ── Headers adicionais ────────────────────────────────────────────────────────
const extraHeaders = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy',        'strict-origin-when-cross-origin');
  next();
};

module.exports = { httpsRedirect, helmetMiddleware, corsMiddleware, extraHeaders };
