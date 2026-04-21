const express    = require('express');
const session    = require('express-session');
const pgSession  = require('connect-pg-simple')(session);
const cors       = require('cors');
const path       = require('path');
const { pool, db } = require('./lib/db');
const { requerAuth } = require('./lib/auth');
const { hashSenha, perfisPermitidos, dataHoraLocal } = require('./lib/helpers');
const apiRouter  = require('./routes/api');

const app    = express();
const PORT   = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// ── Segurança ─────────────────────────────────────────────────────────────────
if (isProd && !process.env.SESSION_SECRET) {
  console.error('ERRO CRÍTICO: SESSION_SECRET não definido em produção!');
  process.exit(1);
}
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_secret_local_apenas';

// ── Trust proxy (Railway) ─────────────────────────────────────────────────────
app.set('trust proxy', 1);

// ── CORS ──────────────────────────────────────────────────────────────────────
const ORIGENS_PERMITIDAS = (process.env.ALLOWED_ORIGINS || '').split(',').map(o=>o.trim()).filter(Boolean);
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
const pgStore = new pgSession({
  pool, tableName: 'session', createTableIfMissing: true,
  errorLog: (msg) => console.error('[SESSION STORE]', msg)
});
app.use(session({
  store: pgStore,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  name: 'wms.sid',
  cookie: { maxAge: 8*60*60*1000, httpOnly: true, secure: false, sameSite: 'lax' }
}));

// ── Rota principal ────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Rotas da API ──────────────────────────────────────────────────────────────
app.use('/', apiRouter);

// ── Handler 404 e 500 ────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err.message);
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
    qtd_encontrada INTEGER DEFAULT 0, repositor_nome TEXT DEFAULT '')`);
  await Q(`CREATE TABLE IF NOT EXISTS checkout (
    id SERIAL PRIMARY KEY, numero_caixa TEXT NOT NULL,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
    numero_pedido TEXT NOT NULL, separador_nome TEXT DEFAULT '',
    status TEXT DEFAULT 'pendente', hora_criacao TEXT,
    hora_checkout TEXT, data_checkout TEXT)`);
  // Índices
  for (const idx of [
    'CREATE INDEX IF NOT EXISTS idx_pedidos_sep ON pedidos(separador_id,status)',
    'CREATE INDEX IF NOT EXISTS idx_pedidos_num ON pedidos(numero_pedido)',
    'CREATE INDEX IF NOT EXISTS idx_itens_pedido ON itens_pedido(pedido_id)',
    'CREATE INDEX IF NOT EXISTS idx_avisos_status ON avisos_repositor(status)',
    'CREATE INDEX IF NOT EXISTS idx_avisos_data ON avisos_repositor(data_aviso)',
    'CREATE INDEX IF NOT EXISTS idx_usuarios_login ON usuarios(login)',
    'CREATE INDEX IF NOT EXISTS idx_checkout_caixa ON checkout(numero_caixa)',
  ]) await Q(idx);
  console.log('Tabelas OK');
}

async function criarUsuarioPadrao() {
  await pool.query(
    `INSERT INTO usuarios (nome,login,senha_hash,perfil,perfis_acesso,status)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(login) DO NOTHING`,
    ['Supervisor Master','admin',hashSenha('123456'),'supervisor','separador,repositor,checkout','ativo']
  );
}

async function iniciar() {
  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não definida!');
    await criarTabelas();
    await criarUsuarioPadrao();
    app.listen(PORT, () => {
      const {data,hora} = dataHoraLocal();
      console.log(`Servidor WMS rodando na porta ${PORT} — ${data} ${hora}`);
    });
  } catch(e) {
    console.error('Erro fatal ao iniciar:', e.message);
    process.exit(1);
  }
}
iniciar();
