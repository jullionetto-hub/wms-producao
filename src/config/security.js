'use strict';
const cors   = require('cors');
const helmet = require('helmet');
const { isProd, ALLOWED_ORIGINS } = require('./env');

// Força HTTPS em produção
function httpsRedirect(req, res, next) {
  if (!isProd) return next();
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') return next();
  return res.redirect(301, `https://${req.hostname}${req.url}`);
}

// Configuração do CORS
const corsMiddleware = cors({
  credentials: true,
  origin: (origin, cb) => {
    if (!isProd) return cb(null, origin || 'http://localhost:3000');
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, origin);
    cb(new Error('Origem não permitida pelo CORS'));
  },
});

// Headers extras de segurança
function extraHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
}

const helmetMiddleware = helmet({
  // CSP habilitado: bloqueia scripts de domínios não autorizados e eval().
  // 'unsafe-inline' é necessário pois o app usa onclick= e style= inline extensivamente.
  // O principal ganho é impedir carregamento de scripts externos não listados.
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",           // onclick= e blocos <script> inline
        "cdn.jsdelivr.net",          // Chart.js
        "cdn.sheetjs.com",           // SheetJS / xlsx
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",           // style= inline extensivo no app
        "fonts.googleapis.com",
      ],
      fontSrc:    ["'self'", "fonts.gstatic.com"],
      imgSrc:     ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "wss:", "ws:"],  // socket.io
      workerSrc:  ["'self'"],                  // service worker
      frameSrc:   ["'none'"],
      objectSrc:  ["'none'"],
      baseUri:    ["'self'"],
      formAction: ["'self'"],
      // Impede que o app seja embarcado em iframes de outros domínios
      frameAncestors: ["'none'"],
      // Bloqueia upgrade de requisições (reforço HTTPS)
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
});

module.exports = { httpsRedirect, corsMiddleware, extraHeaders, helmetMiddleware };
