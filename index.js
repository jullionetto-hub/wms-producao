const express    = require('express');
const session    = require('express-session');
const pgSession  = require('connect-pg-simple')(session);
const cors       = require('cors');
const path       = require('path');
const http       = require('http');
const { Server } = require('socket.io');
const { pool, db } = require('./lib/db');
const { requerAuth } = require('./lib/auth');
const { hashSenha, perfisPermitidos, dataHoraLocal } = require('./lib/helpers');
const apiRouter  = require('./routes/api');
const helmet     = require('helmet');
const log        = require('./lib/logger');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { credentials: true, origin: (o,cb) => cb(null,o) } });
const PORT   = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Expõe io para as rotas emitirem eventos
app.set('io', io);

// ── Segurança ─────────────────────────────────────────────────────────────────
if (isProd && !process.env.SESSION_SECRET) {
  log.fatal('SESSION_SECRET não definido em produção — abortando');
  process.exit(1);
}
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_secret_local_apenas';

// ── Trust proxy (Railway) ─────────────────────────────────────────────────────
app.set('trust proxy', 1);

// ── Força HTTPS em produção ───────────────────────────────────────────────────
if (isProd) {
  app.use((req, res, next) => {
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') return next();
    res.redirect(301, `https://${req.hostname}${req.url}`);
  });
}

// ── CORS ──────────────────────────────────────────────────────────────────────
const ORIGENS_PERMITIDAS = (process.env.ALLOWED_ORIGINS || '').split(',').map(o=>o.trim()).filter(Boolean);
// ── Helmet (security headers) ───────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  credentials: true,
  origin: (origin, cb) => {
    if (!isProd) return cb(null, origin || 'http://localhost:3000');
    if (!origin || ORIGENS_PERMITIDAS.includes(origin)) return cb(null, origin);
    cb(new Error('Origem não permitida pelo CORS'));
  }
}));

// ── Headers de segurança ──────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Sessão ────────────────────────────────────────────────────────────────────
const sessionStore = process.env.NODE_ENV === 'test'
  ? new session.MemoryStore()
  : new pgSession({ pool, tableName: 'session', createTableIfMissing: true, errorLog: (msg) => log.error({ msg }, 'session-store') });
app.use(session({
  store: sessionStore,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  name: 'wms.sid',
  cookie: { maxAge: 8*60*60*1000, httpOnly: true, secure: isProd, sameSite: 'lax' }
}));

// ── Rota principal ────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Rotas da API ──────────────────────────────────────────────────────────────
app.use('/', apiRouter);

// ── Handler 404 e 500 ────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
app.use((err, req, res, next) => {
  log.error({ err, url: req.url, method: req.method }, 'unhandled-error');
  res.status(500).json({ erro: isProd ? 'Erro interno do servidor.' : err.message });
});

// ── Inicialização ─────────────────────────────────────────────────────────────
async function criarTabelas() {
  const Q = (sql) => pool.query(sql);
  await Q(`CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY, nome TEXT NOT NULL, login TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL, perfil TEXT NOT NULL DEFAULT 'separador',
    subtipo_repositor TEXT DEFAULT 'geral', perfis_acesso TEXT DEFAULT '',
    turno TEXT DEFAULT 'Manha', status TEXT DEFAULT 'ativo',
    data_cadastro TIMESTAMP DEFAULT NOW())`);
  await Q(`CREATE TABLE IF NOT EXISTS separadores (
    id SERIAL PRIMARY KEY, nome TEXT NOT NULL, matricula TEXT NOT NULL UNIQUE,
    turno TEXT DEFAULT 'Manha', status TEXT DEFAULT 'ativo',
    usuario_id INTEGER REFERENCES usuarios(id), data_cadastro TIMESTAMP DEFAULT NOW())`);
  await Q(`CREATE TABLE IF NOT EXISTS pedidos (
    id SERIAL PRIMARY KEY, numero_pedido TEXT NOT NULL UNIQUE,
    separador_id INTEGER REFERENCES separadores(id),
    status TEXT DEFAULT 'pendente', pontuacao INTEGER DEFAULT 0,
    itens INTEGER DEFAULT 0, rua TEXT DEFAULT '', numero_caixa TEXT DEFAULT '',
    cliente TEXT DEFAULT '', transportadora TEXT DEFAULT '',
    aguardando_desde TEXT DEFAULT '', data_pedido TEXT, hora_pedido TEXT,
    data_criacao TIMESTAMP DEFAULT NOW())`);
  await Q(`CREATE TABLE IF NOT EXISTS itens_pedido (
    id SERIAL PRIMARY KEY, pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
    codigo TEXT, descricao TEXT, endereco TEXT, quantidade INTEGER DEFAULT 1,
    status TEXT DEFAULT 'pendente', obs TEXT DEFAULT '',
    qtd_falta INTEGER DEFAULT 0, hora_verificado TEXT)`);
  await Q(`CREATE TABLE IF NOT EXISTS avisos_repositor (
    id SERIAL PRIMARY KEY, item_id INTEGER NOT NULL REFERENCES itens_pedido(id),
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
    numero_pedido TEXT, separador_id INTEGER, separador_nome TEXT,
    codigo TEXT, descricao TEXT, endereco TEXT, quantidade INTEGER,
    obs TEXT DEFAULT '', status TEXT DEFAULT 'pendente',
    hora_aviso TEXT, hora_reposto TEXT, data_aviso TEXT,
    qtd_encontrada INTEGER DEFAULT 0, repositor_nome TEXT DEFAULT '',
    quem_pegou TEXT DEFAULT '', quem_guardou TEXT DEFAULT '',
    forma_envio TEXT DEFAULT '', situacao TEXT DEFAULT '')`);
  // Migra colunas novas para tabelas existentes
  for (const col of [
    "ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS quem_pegou TEXT DEFAULT ''",
    "ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS quem_guardou TEXT DEFAULT ''",
    "ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS forma_envio TEXT DEFAULT ''",
    "ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS situacao TEXT DEFAULT ''"
  ]) { await Q(col).catch(()=>{}); }
  await Q(`CREATE TABLE IF NOT EXISTS checkout (
    id SERIAL PRIMARY KEY, numero_caixa TEXT NOT NULL,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
    numero_pedido TEXT NOT NULL, separador_nome TEXT DEFAULT '',
    status TEXT DEFAULT 'pendente', hora_criacao TEXT,
    hora_checkout TEXT, data_checkout TEXT)`);
  // Tabela de auditoria
  await Q(`CREATE TABLE IF NOT EXISTS auditoria (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER, usuario_login TEXT, usuario_nome TEXT,
    acao TEXT NOT NULL, entidade TEXT, entidade_id INTEGER,
    dados_antes JSONB, dados_depois JSONB,
    ip TEXT, data TEXT, hora TEXT,
    created_at TIMESTAMP DEFAULT NOW())`);

  // Tabela de relatórios diários
  await Q(`CREATE TABLE IF NOT EXISTS relatorios_diarios (
    id SERIAL PRIMARY KEY,
    data TEXT UNIQUE NOT NULL,
    total_pedidos INTEGER DEFAULT 0,
    pedidos_concluidos INTEGER DEFAULT 0,
    pedidos_pendentes INTEGER DEFAULT 0,
    total_itens INTEGER DEFAULT 0,
    total_faltas INTEGER DEFAULT 0,
    faltas_abastecidas INTEGER DEFAULT 0,
    faltas_nao_encontradas INTEGER DEFAULT 0,
    total_checkouts INTEGER DEFAULT 0,
    separadores_ativos INTEGER DEFAULT 0,
    dados_json JSONB,
    gerado_em TIMESTAMP DEFAULT NOW())`);

  // Índices
  for (const idx of [
    'CREATE INDEX IF NOT EXISTS idx_pedidos_sep ON pedidos(separador_id,status)',
    'CREATE INDEX IF NOT EXISTS idx_pedidos_num ON pedidos(numero_pedido)',
    'CREATE INDEX IF NOT EXISTS idx_itens_pedido ON itens_pedido(pedido_id)',
    'CREATE INDEX IF NOT EXISTS idx_avisos_status ON avisos_repositor(status)',
    'CREATE INDEX IF NOT EXISTS idx_avisos_data ON avisos_repositor(data_aviso)',
    'CREATE INDEX IF NOT EXISTS idx_usuarios_login ON usuarios(login)',
    'CREATE INDEX IF NOT EXISTS idx_pedidos_data_status ON pedidos(data_pedido, status)',
    'CREATE INDEX IF NOT EXISTS idx_pedidos_status_sep ON pedidos(status, separador_id)',
    'CREATE INDEX IF NOT EXISTS idx_avisos_data_status ON avisos_repositor(data_aviso, status)',
    'CREATE INDEX IF NOT EXISTS idx_avisos_codigo ON avisos_repositor(codigo)',
    'CREATE INDEX IF NOT EXISTS idx_checkout_data ON checkout(data_checkout)',
    'CREATE INDEX IF NOT EXISTS idx_auditoria_data ON auditoria(data)',
    'CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria(usuario_login)',
    'CREATE INDEX IF NOT EXISTS idx_checkout_caixa ON checkout(numero_caixa)',
  ]) await Q(idx);
  log.info('tabelas OK');
}

async function criarUsuarioPadrao() {
  await pool.query(
    `INSERT INTO usuarios (nome,login,senha_hash,perfil,perfis_acesso,status)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(login) DO NOTHING`,
    ['Supervisor Master','admin',hashSenha('123456'),'supervisor','separador,repositor,checkout','ativo']
  );
}

// ── Cache de KPIs ────────────────────────────────────────────────────────────
const kpiCache = { data: null, ts: 0, ttl: 60000 }; // 60s TTL
app.set('kpiCache', kpiCache);

// ── Scheduler de relatório diário (DB-backed) ────────────────────────────────
const { gerarRelatorio } = require('./lib/relatorio');

async function verificarRelatoriosPerdidos() {
  // Ao iniciar, verifica se o relatório de ontem foi gerado
  try {
    const { db: dbLib } = require('./lib/db');
    const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
    const dataOntem = ontem.toISOString().split('T')[0];
    const existe = await dbLib.get('SELECT id FROM relatorios_diarios WHERE data=$1', [dataOntem]);
    if (!existe) {
      log.info({ data: dataOntem }, 'scheduler gerando relatório perdido de ontem');
      await gerarRelatorio(dataOntem);
    }
  } catch(e) { log.error({ err: e }, 'scheduler erro ao verificar relatórios perdidos'); }
}

function agendarRelatoriosDiarios() {
  const agora = new Date();
  // Calcula ms até 23:55 hora local (Brasília via offset fixo -3h)
  const alvo = new Date(agora);
  alvo.setHours(23, 55, 0, 0);
  if (alvo <= agora) alvo.setDate(alvo.getDate() + 1);
  const delay = alvo - agora;

  setTimeout(async () => {
    try {
      const { data } = dataHoraLocal();
      // Idempotente: pula se já foi gerado hoje
      const { db: dbLib } = require('./lib/db');
      const existe = await dbLib.get('SELECT id FROM relatorios_diarios WHERE data=$1', [data]);
      if (!existe) {
        log.info({ data }, 'scheduler gerando relatório diário');
        await gerarRelatorio(data);
        log.info({ data }, 'scheduler relatório diário gerado');
      }
    } catch(e) {
      log.error({ err: e }, 'scheduler erro ao gerar relatório');
    }
    agendarRelatoriosDiarios();
  }, delay);

  log.info({ agendadoPara: new Date(Date.now()+delay).toISOString() }, 'scheduler relatório diário agendado');
}

async function runMigrations() {
  try {
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS iniciado_em TEXT DEFAULT ''");
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS concluido_em TEXT DEFAULT ''");
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tem_prime BOOLEAN DEFAULT false");
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tempo_aguardando_min INTEGER DEFAULT 0");
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS aguardando_repositor_desde TEXT DEFAULT ''");
    await pool.query(`CREATE TABLE IF NOT EXISTS diario_bordo (
      id SERIAL PRIMARY KEY,
      data TEXT NOT NULL,
      turno TEXT NOT NULL,
      supervisor TEXT NOT NULL,
      dados JSONB NOT NULL DEFAULT '{}',
      observacoes TEXT DEFAULT '',
      criado_em TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pool.query("ALTER TABLE diario_bordo ADD COLUMN IF NOT EXISTS leu_anterior BOOLEAN DEFAULT false");
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS status_embalagem TEXT DEFAULT 'pendente'");
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS embalado_em TEXT DEFAULT ''");
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS embalado_por TEXT DEFAULT ''");
    await pool.query(`CREATE TABLE IF NOT EXISTS embalagem (
      id SERIAL PRIMARY KEY,
      pedido_id INTEGER REFERENCES pedidos(id),
      numero_pedido TEXT NOT NULL,
      embalado_por TEXT NOT NULL,
      embalado_em TEXT NOT NULL,
      data_embalagem TEXT NOT NULL,
      cliente TEXT DEFAULT '',
      transportadora TEXT DEFAULT '',
      is_drive BOOLEAN DEFAULT false,
      is_prime BOOLEAN DEFAULT false,
      criado_em TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS senha_temporaria BOOLEAN DEFAULT false");
    await pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS senha_temporaria_expira TIMESTAMPTZ");
    await pool.query("ALTER TABLE checkout ADD COLUMN IF NOT EXISTS operador_nome TEXT DEFAULT ''");
    await pool.query("ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS lido_separador BOOLEAN DEFAULT false");
    log.info('migrations OK');
  } catch(e) {
    log.error({ err: e }, 'migration erro');
  }
}

async function iniciar() {
  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não definida!');
    await criarTabelas();
    await criarUsuarioPadrao();
    await runMigrations();
    server.listen(PORT, () => {
      const {data,hora} = dataHoraLocal();
      log.info({ port: PORT, data, hora }, 'servidor WMS iniciado');
      if (isProd) {
        verificarRelatoriosPerdidos();
        agendarRelatoriosDiarios();
      }
    });
  } catch(e) {
    log.fatal({ err: e }, 'erro fatal ao iniciar');
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  iniciar();
}

module.exports = app;
