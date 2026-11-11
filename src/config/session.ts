import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { pool }  from '../../lib/db';
import { SESSION_SECRET, isProd, isTest } from './env';
import log from '../../lib/logger';

const pgSession = connectPgSimple(session);

const store: session.Store = isTest
  ? new session.MemoryStore()
  : new pgSession({
      pool,
      tableName: 'session',
      createTableIfMissing: true,
      errorLog: (msg: unknown) => log.error({ msg }, 'session-store'),
    });

export const sessionMiddleware = session({
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
