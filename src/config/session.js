'use strict';
/**
 * src/config/session.js
 * Configuração da sessão Express.
 * Troque o store por connect-pg-simple ou connect-sqlite3 se precisar persistência.
 */

const session = require('express-session');
const env     = require('./env');

const sessionMiddleware = session({
  secret:            env.SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   env.isProd,
    httpOnly: true,
    maxAge:   env.SESSION_MAX_AGE,
    sameSite: 'lax',
  },
});

module.exports = { sessionMiddleware };
