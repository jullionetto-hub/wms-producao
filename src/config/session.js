'use strict';
const session   = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { pool }  = require('../../lib/db');
const { SESSION_SECRET, isProd, isTest } = require('./env');
const log = require('../../lib/logger');

const store = isTest
  ? new session.MemoryStore()
  : new pgSession({
      pool,
      tableName: 'session',
      createTableIfMissing: true,
      errorLog: (msg) => log.error({ msg }, 'session-store'),
    });

const sessionMiddleware = session({
  store,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  name: 'wms.sid',
  cookie: {
    maxAge: 8 * 60 * 60 * 1000,
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
  },
});

module.exports = { sessionMiddleware };
