'use strict';
/**
 * index.js — Ponto de entrada da aplicação WMS Produção.
 *
 * Responsabilidades deste arquivo:
 *  1. Criar o servidor HTTP + Socket.io
 *  2. Aplicar middlewares (segurança, sessão, corpo da requisição)
 *  3. Montar as rotas
 *  4. Inicializar banco de dados e scheduler
 *
 * Toda a lógica de negócio vive em src/ e lib/.
 */

const express = require('express');
const http    = require('http');
const path    = require('path');
const { Server } = require('socket.io');

// ── Config ───────────────────────────────────────────────────────────────────
const { PORT, isProd }                                           = require('./src/config/env');
const { httpsRedirect, corsMiddleware, extraHeaders, helmetMiddleware } = require('./src/config/security');
const { sessionMiddleware }                                      = require('./src/config/session');

// ── Database ──────────────────────────────────────────────────────────────────
const { runSchema }          = require('./src/database/migrate');
const { criarUsuarioPadrao } = require('./src/database/seed');

// ── Scheduler ─────────────────────────────────────────────────────────────────
const { iniciarScheduler, verificarRelatoriosPerdidos } = require('./src/scheduler/relatorio');

// ── Rotas ─────────────────────────────────────────────────────────────────────
const apiRouter = require('./routes/api');

// ── Utilitários ───────────────────────────────────────────────────────────────
const log               = require('./lib/logger');
const { dataHoraLocal } = require('./lib/helpers');

// ── KPI Cache (em memória — considere Redis para escala futura) ───────────────
const kpiCache = { data: null, ts: 0, ttl: 20_000 };

// ─────────────────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { credentials: true, origin: (o, cb) => cb(null, o) },
});

app.set('io', io);
app.set('kpiCache', kpiCache);
app.set('trust proxy', 1);

// ── Middlewares ───────────────────────────────────────────────────────────────
app.use(httpsRedirect);
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(extraHeaders);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
// JS e HTML sempre buscados frescos — só CSS é cacheado pelo SW
app.use('/js',  (_req, res, next) => { res.set('Cache-Control', 'no-cache, must-revalidate'); next(); });
app.use('/css', (_req, res, next) => { res.set('Cache-Control', 'public, max-age=86400');      next(); });
app.use(express.static(path.join(__dirname, 'public'), { etag: true, lastModified: true }));
app.use(sessionMiddleware);

// ── Rotas ─────────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.set('Cache-Control', 'no-cache, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use('/', apiRouter);

// ── Handlers de erro ──────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
app.use((err, req, res, _next) => {
  log.error({ err, url: req.url, method: req.method }, 'unhandled-error');
  res.status(500).json({ erro: isProd ? 'Erro interno do servidor.' : err.message });
});

// ── Inicialização ─────────────────────────────────────────────────────────────
async function iniciar() {
  await runSchema();
  await criarUsuarioPadrao();

  server.listen(PORT, () => {
    const { data, hora } = dataHoraLocal();
    log.info({ port: PORT, data, hora }, 'servidor WMS iniciado');

    if (isProd) {
      verificarRelatoriosPerdidos();
      iniciarScheduler();
    }
  });
}

if (process.env.NODE_ENV !== 'test') {
  iniciar().catch((e) => {
    log.fatal({ err: e }, 'erro fatal ao iniciar');
    process.exit(1);
  });
}

module.exports = app;
