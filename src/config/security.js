/**
 * src/config/security.js
 * Configura headers de segurança: Helmet, CORS e redirect HTTPS.
 */

const helmet = require('helmet');
const env    = require('./env');

/**
 * Aplica todas as configurações de segurança no app Express.
 * @param {import('express').Application} app
 */
function applySecurity(app) {
  // Trust proxy reverso (Railway, Render, Heroku, etc.)
  if (env.TRUST_PROXY) {
    app.set('trust proxy', 1);
  }

  // Helmet — headers de segurança padrão
  app.use(helmet({
    contentSecurityPolicy: false, // CSP manual abaixo se necessário
    crossOriginEmbedderPolicy: false,
  }));

  // Headers manuais adicionais
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Redirect HTTP → HTTPS em produção
  if (env.FORCE_HTTPS) {
    app.use((req, res, next) => {
      if (req.headers['x-forwarded-proto'] !== 'https') {
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
      }
      next();
    });
  }
}

module.exports = { applySecurity };
