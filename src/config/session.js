/**
 * src/config/session.js
 * Configuração da sessão Express.
 */

const session = require('express-session');
const env     = require('./env');

const sessionMiddleware = session({
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure:   env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge:   env.SESSION_MAX_AGE,
    sameSite: 'lax',
  },
});

module.exports = { sessionMiddleware };
