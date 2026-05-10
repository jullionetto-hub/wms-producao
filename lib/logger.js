let logger;
try {
  const pino = require('pino');
  logger = pino({ level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug') });
} catch(e) {
  // fallback se pino não estiver instalado
  const lvl = { fatal: console.error, error: console.error, warn: console.warn, info: console.log, debug: console.log };
  logger = Object.fromEntries(Object.entries(lvl).map(([k,fn]) => [k, (obj, msg) => fn(`[${k.toUpperCase()}]`, msg||obj)]));
}

module.exports = logger;
