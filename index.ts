/**
 * index.ts — Ponto de entrada da aplicação WMS Produção.
 *
 * Responsabilidades deste arquivo:
 *  1. Criar o servidor HTTP + Socket.io
 *  2. Aplicar middlewares (segurança, sessão, corpo da requisição)
 *  3. Montar as rotas
 *  4. Inicializar banco de dados e scheduler
 *
 * Toda a lógica de negócio vive em src/ e lib/.
 *
 * Este arquivo é TypeScript: `npm run build` gera o index.js ao lado dele, e o servidor
 * continua iniciando com `node index.js`.
 */

import express from 'express';
import compression from 'compression';
import http from 'http';
import path from 'path';
import { Server } from 'socket.io';

// ── Config ───────────────────────────────────────────────────────────────────
import { PORT, isProd } from './src/config/env';
import { httpsRedirect, corsMiddleware, extraHeaders, helmetMiddleware, permitirEmbedMesmaOrigem } from './src/config/security';
import { sessionMiddleware } from './src/config/session';

// ── Database ──────────────────────────────────────────────────────────────────
import { runSchema } from './src/database/migrate';
import { criarUsuarioPadrao } from './src/database/seed';

// ── Scheduler ─────────────────────────────────────────────────────────────────
import { iniciarScheduler, verificarRelatoriosPerdidos } from './src/scheduler/relatorio';

// ── Rotas ─────────────────────────────────────────────────────────────────────
const apiRouter: express.Router = require('./routes/api');

// ── Utilitários ───────────────────────────────────────────────────────────────
import log from './lib/logger';
import { requerPerfil } from './lib/auth';
import { dataHoraLocal } from './lib/helpers';
import { normalizarQuery } from './lib/query';
import { ativarCapturaDeErrosAsync, tratadorDeErros, registrarTratadoresDeProcesso } from './lib/robustez';

ativarCapturaDeErrosAsync();   // erro numa rota async vira resposta 500 (antes derrubava o processo inteiro)

// ── KPI Cache (em memória — considere Redis para escala futura) ───────────────
const kpiCache: { data: any; ts: number; ttl: number } = { data: null, ts: 0, ttl: 20_000 };

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
// gzip/brotli em HTML, JS, CSS e JSON — sem isso os ~1,4 MB de JS + 210 KB de HTML
// iam crus pelo 4G/Wi-Fi do celular de separação. O Socket.io (upgrade de WebSocket)
// não passa por aqui.
app.use(compression());
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(extraHeaders);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
// JS e HTML sempre buscados frescos — só CSS é cacheado pelo SW
// Identificador desta versão do sistema (muda a cada deploy): o navegador compara e mostra o botão "Atualizar".
const VERSAO_SISTEMA = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.RENDER_GIT_COMMIT || process.env.SOURCE_VERSION || String(Date.now());
app.get('/versao', (_req, res) => { res.set('Cache-Control', 'no-store'); res.json({ versao: VERSAO_SISTEMA }); });
app.use('/js',  (_req, res, next) => { res.set('Cache-Control', 'no-cache, must-revalidate'); next(); });
app.use('/css', (_req, res, next) => { res.set('Cache-Control', 'public, max-age=86400');      next(); });
app.use(express.static(path.join(__dirname, 'public'), { etag: true, lastModified: true }));
app.use(sessionMiddleware);
app.use(normalizarQuery);   // ?x=a&x=b chega como "a" (e nao como lista) em todas as rotas

// ── Rotas ─────────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.set('Cache-Control', 'no-cache, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// Modelo 3D do estoque: embute o catálogo de produtos, então só é servido logado (supervisor/gestor)
app.get('/modelo-estoque', (req, res, next) => {
  if (!req.session?.usuario) return res.redirect('/');
  requerPerfil('supervisor', 'gestor')(req, res, () => {
    res.set('Cache-Control', 'no-cache, must-revalidate');
    permitirEmbedMesmaOrigem(res);   // esta página (e só ela) pode abrir dentro do WMS, nunca em outros domínios
    res.sendFile(path.join(__dirname, 'views', 'modelo-estoque.html'));
  });
});
app.use('/', apiRouter);

// ── Handlers de erro ──────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
app.use(tratadorDeErros);

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
  registrarTratadoresDeProcesso();
  iniciar().catch((e) => {
    log.fatal({ err: e }, 'erro fatal ao iniciar');
    process.exit(1);
  });
}

// os testes (e o resto do codigo) fazem require('../index') e recebem o app
export = app;
