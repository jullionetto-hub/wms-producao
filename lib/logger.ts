let logger: any;
try {
  const pino = require('pino');
  logger = pino({ level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug') });
} catch(e) {
  // fallback se pino não estiver instalado
  const lvl: Record<string, (...args: any[]) => void> = { fatal: console.error, error: console.error, warn: console.warn, info: console.log, debug: console.log };
  logger = Object.fromEntries(Object.entries(lvl).map(([k,fn]) => [k, (obj: any, msg?: any) => fn(`[${k.toUpperCase()}]`, msg||obj)]));
}

// mantém "const log = require('./lib/logger')" funcionando (o módulo É o logger)
export = logger;
