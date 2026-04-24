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
  console.log('Tabelas OK');
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

// ── Scheduler de relatório diário ────────────────────────────────────────────
function agendarRelatoriosDiarios() {
  const agora = new Date();
  // Calcula ms até 23:55 de hoje (Brasília)
  const alvo = new Date(agora);
  alvo.setHours(23, 55, 0, 0);
  if (alvo <= agora) alvo.setDate(alvo.getDate() + 1);
  const delay = alvo - agora;

  setTimeout(async () => {
    try {
      const { dataHoraLocal } = require('./lib/helpers');
      const { db, pool } = require('./lib/db');
      const { data } = dataHoraLocal();
      console.log(`[SCHEDULER] Gerando relatório diário de ${data}...`);

      // Busca dados do dia
      const [pedidos, faltas, checkouts, seps] = await Promise.all([
        db.all(`SELECT p.*, s.nome as sep_nome FROM pedidos p LEFT JOIN separadores s ON p.separador_id=s.id WHERE p.data_pedido=$1`, [data]),
        db.all(`SELECT * FROM avisos_repositor WHERE data_aviso=$1`, [data]),
        db.all(`SELECT * FROM checkout WHERE data_checkout=$1`, [data]),
        db.all(`SELECT DISTINCT s.nome FROM separadores s INNER JOIN pedidos p ON p.separador_id=s.id WHERE p.data_pedido=$1`, [data]),
      ]);

      const porSep = {};
      pedidos.forEach(p => {
        if (!p.sep_nome) return;
        if (!porSep[p.sep_nome]) porSep[p.sep_nome] = { concluidos:0, pendentes:0, itens:0 };
        if (p.status==='concluido') porSep[p.sep_nome].concluidos++;
        else porSep[p.sep_nome].pendentes++;
        porSep[p.sep_nome].itens += p.itens||0;
      });

      await pool.query(
        `INSERT INTO relatorios_diarios (data,total_pedidos,pedidos_concluidos,pedidos_pendentes,total_itens,total_faltas,faltas_abastecidas,faltas_nao_encontradas,total_checkouts,separadores_ativos,dados_json)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT(data) DO UPDATE SET
           total_pedidos=$2,pedidos_concluidos=$3,pedidos_pendentes=$4,total_itens=$5,
           total_faltas=$6,faltas_abastecidas=$7,faltas_nao_encontradas=$8,
           total_checkouts=$9,separadores_ativos=$10,dados_json=$11,gerado_em=NOW()`,
        [data, pedidos.length,
         pedidos.filter(p=>p.status==='concluido').length,
         pedidos.filter(p=>p.status==='pendente').length,
         pedidos.reduce((s,p)=>s+(p.itens||0),0),
         faltas.length,
         faltas.filter(f=>f.status==='abastecido').length,
         faltas.filter(f=>f.status==='nao_encontrado').length,
         checkouts.filter(c=>c.status==='concluido').length,
         seps.length,
         JSON.stringify({ porSep })]
      );
      console.log(`[SCHEDULER] Relatório de ${data} gerado com sucesso.`);
    } catch(e) {
      console.error('[SCHEDULER] Erro ao gerar relatório:', e.message);
    }
    // Agenda próximo dia
    agendarRelatoriosDiarios();
  }, delay);

  console.log(`[SCHEDULER] Relatório diário agendado para ${new Date(Date.now()+delay).toLocaleString('pt-BR')}`);
}

async function iniciar() {
  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não definida!');
    await criarTabelas();
    await criarUsuarioPadrao();
    
// Migration automatica â€” cria colunas se nao existirem
async function runMigrations() {
  try {
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS iniciado_em TEXT DEFAULT ''");
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS concluido_em TEXT DEFAULT ''");
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tempo_aguardando_min INTEGER DEFAULT 0");
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS aguardando_repositor_desde TEXT DEFAULT ''");
    console.log('Migrations OK');
  } catch(e) {
    console.error('Migration erro:', e.message);
  }
}
runMigrations();
app.listen(PORT, () => {
      const {data,hora} = dataHoraLocal();
      console.log(`Servidor WMS rodando na porta ${PORT} — ${data} ${hora}`);
      // Inicia scheduler em produção
      if (isProd) agendarRelatoriosDiarios();
    });
  } catch(e) {
    console.error('Erro fatal ao iniciar:', e.message);
    process.exit(1);
  }
}
iniciar();
