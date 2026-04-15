const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors    = require('cors');
const path    = require('path');
const crypto  = require('crypto');
const session = require('express-session');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  credentials: true,
  origin: function(origin, callback) {
    callback(null, origin || 'http://localhost:3000');
  }
}));

// ── Segurança: headers básicos ───────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// ── Rate limiting simples (sem lib externa) ──────
const rateLimitMap = new Map();
function rateLimit(req, res, next) {
  const key  = req.ip + ':' + req.path;
  const now  = Date.now();
  const entry = rateLimitMap.get(key) || { count:0, reset: now + 60000 };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60000; }
  entry.count++;
  rateLimitMap.set(key, entry);
  if (entry.count > 120) { // 120 req/min por IP por rota
    return res.status(429).json({ erro: 'Muitas requisições. Tente novamente em breve.' });
  }
  next();
}
app.use(rateLimit);
// Limpa rate limit map a cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [k,v] of rateLimitMap) { if (now > v.reset) rateLimitMap.delete(k); }
}, 300000);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const SQLiteStore = require('connect-sqlite3')(session);
app.use(session({
  secret: 'wms_session_secret_2026',
  resave: false,
  saveUninitialized: false,
  store: new SQLiteStore({ db: 'sessions.db', dir: __dirname }),
  cookie: { maxAge: 8 * 60 * 60 * 1000, httpOnly: true, secure: false, sameSite: 'lax' }
}));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Banco ─────────────────────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'wms.db');
const db = new sqlite3.Database(DB_PATH, err => {
  if (err) console.error(err.message);
  else console.log('Banco conectado em:', DB_PATH);
});
db.run('PRAGMA journal_mode=WAL');
db.run('PRAGMA synchronous=NORMAL');
db.run('PRAGMA cache_size=10000');
db.run('PRAGMA temp_store=MEMORY');
db.run('PRAGMA mmap_size=268435456'); // 256MB

// ── Helpers Promise ───────────────────────────────────────────────────────────
function dbRun(sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) { if (err) reject(err); else resolve(this); });
  });
}
function dbGet(sql, params) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
  });
}

// ── Mapa de dificuldade dos corredores (baseado no layout do estoque) ─────────
const CORREDOR_DIFICULDADE = {
  // 🟢 Verde — fácil (×1): A, B, C, D, E, P, Q, R, S, T, U
  'A':1,'B':1,'C':1,'D':1,'E':1,'P':1,'Q':1,'R':1,'S':1,'T':1,'U':1,
  // 🔵 Azul — médio (×2): M, N, O, V, W, X, Y, Z
  'M':2,'N':2,'O':2,'V':2,'W':2,'X':2,'Y':2,'Z':2,
  // 🔴 Vermelho — difícil (×3): F, G, H, I, J, K, L
  'F':3,'G':3,'H':3,'I':3,'J':3,'K':3,'L':3
};

function getDificuldade(endereco) {
  if (!endereco) return 1;
  const primeiro = String(endereco).split(',')[0].trim();
  const match    = primeiro.match(/^([A-Za-z]+)/);
  if (!match) return 1;
  const letra = match[1].toUpperCase();
  // Para corredores compostos como 'VERT', 'STAFF', usa a primeira letra
  return CORREDOR_DIFICULDADE[letra] || CORREDOR_DIFICULDADE[letra[0]] || 1;
}

// ── Data/hora local ───────────────────────────────────────────────────────────
function dataHoraLocal() {
  const agora   = new Date();
  const opcData = { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' };
  const opcHora = { timeZone:'America/Sao_Paulo', hour:'2-digit', minute:'2-digit', hour12:false };
  const partes  = agora.toLocaleDateString('pt-BR', opcData).split('/');
  const dataISO = `${partes[2]}-${partes[1]}-${partes[0]}`;
  const hora    = agora.toLocaleTimeString('pt-BR', opcHora);
  return { data: dataISO, hora };
}

// ── Ordenação por corredor ─────────────────────────────────────────────────────
// Extrai a letra do corredor do endereço (ex: "D012, D013" → "D", "VERT-D01" → "VERT")
function extrairCorredor(endereco) {
  if (!endereco) return 'ZZZ';
  const primeiro = String(endereco).split(',')[0].trim();
  const match = primeiro.match(/^([A-Za-z]+)/);
  return match ? match[1].toUpperCase() : 'ZZZ';
}

// Extrai número do endereço para ordenação secundária (ex: "D012" → 12)
function extrairNumero(endereco) {
  if (!endereco) return 9999;
  const primeiro = String(endereco).split(',')[0].trim();
  const match = primeiro.match(/([0-9]+)/);
  return match ? parseInt(match[1]) : 9999;
}

function ordenarPorCorredor(itens) {
  return [...itens].sort((a, b) => {
    const corA = extrairCorredor(a.endereco);
    const corB = extrairCorredor(b.endereco);
    if (corA !== corB) return corA.localeCompare(corB);
    return extrairNumero(a.endereco) - extrairNumero(b.endereco);
  });
}

// ── Tabelas ───────────────────────────────────────────────────────────────────
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    login TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    perfil TEXT NOT NULL DEFAULT 'separador',
    subtipo_repositor TEXT DEFAULT 'geral',
    perfis_acesso TEXT DEFAULT '',
    turno TEXT DEFAULT 'Manha',
    status TEXT DEFAULT 'ativo',
    data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`ALTER TABLE usuarios ADD COLUMN subtipo_repositor TEXT DEFAULT 'geral'`, () => {});
  db.run(`ALTER TABLE usuarios ADD COLUMN turno TEXT DEFAULT 'Manha'`, () => {});
  db.run(`ALTER TABLE usuarios ADD COLUMN perfis_acesso TEXT DEFAULT ''`, () => {});

  db.run(`CREATE TABLE IF NOT EXISTS separadores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    matricula TEXT NOT NULL UNIQUE,
    turno TEXT DEFAULT 'Manha',
    status TEXT DEFAULT 'ativo',
    usuario_id INTEGER,
    data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_pedido TEXT NOT NULL UNIQUE,
    separador_id INTEGER,
    status TEXT DEFAULT 'pendente',
    pontuacao INTEGER DEFAULT 0,
    itens INTEGER DEFAULT 0,
    rua TEXT,
    numero_caixa TEXT DEFAULT '',
    transportadora TEXT DEFAULT '',
    razao_social TEXT DEFAULT '',
    data_pedido TEXT,
    hora_pedido TEXT,
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (separador_id) REFERENCES separadores(id)
  )`);
  db.run(`ALTER TABLE pedidos ADD COLUMN numero_caixa TEXT DEFAULT ''`, () => {});
  db.run(`ALTER TABLE pedidos ADD COLUMN peso INTEGER DEFAULT 0`, () => {});
  db.run(`ALTER TABLE pedidos ADD COLUMN corredores_count INTEGER DEFAULT 0`, () => {});
  db.run(`ALTER TABLE pedidos ADD COLUMN unidades_total INTEGER DEFAULT 0`, () => {});
  db.run(`ALTER TABLE pedidos ADD COLUMN transportadora TEXT DEFAULT ''`, () => {});
  db.run(`ALTER TABLE pedidos ADD COLUMN razao_social TEXT DEFAULT ''`, () => {});

  db.run(`CREATE TABLE IF NOT EXISTS itens_pedido (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    codigo TEXT,
    descricao TEXT,
    endereco TEXT,
    corredor TEXT DEFAULT '',
    quantidade INTEGER DEFAULT 1,
    status TEXT DEFAULT 'pendente',
    obs TEXT DEFAULT '',
    qtd_falta INTEGER DEFAULT 0,
    hora_verificado TEXT,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
  )`);
  db.run(`ALTER TABLE itens_pedido ADD COLUMN obs TEXT DEFAULT ''`, () => {});
  db.run(`ALTER TABLE itens_pedido ADD COLUMN qtd_falta INTEGER DEFAULT 0`, () => {});
  db.run(`ALTER TABLE itens_pedido ADD COLUMN corredor TEXT DEFAULT ''`, () => {});

  db.run(`CREATE TABLE IF NOT EXISTS avisos_repositor (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    pedido_id INTEGER NOT NULL,
    numero_pedido TEXT,
    separador_id INTEGER,
    separador_nome TEXT,
    codigo TEXT,
    descricao TEXT,
    endereco TEXT,
    quantidade INTEGER,
    obs TEXT DEFAULT '',
    status TEXT DEFAULT 'pendente',
    hora_aviso TEXT,
    hora_reposto TEXT,
    data_aviso TEXT,
    qtd_encontrada INTEGER DEFAULT 0,
    repositor_nome TEXT DEFAULT '',
    FOREIGN KEY (item_id) REFERENCES itens_pedido(id)
  )`);
  db.run(`ALTER TABLE avisos_repositor ADD COLUMN obs TEXT DEFAULT ''`, () => {});
  db.run(`ALTER TABLE avisos_repositor ADD COLUMN data_aviso TEXT`, () => {});
  db.run(`ALTER TABLE avisos_repositor ADD COLUMN qtd_encontrada INTEGER DEFAULT 0`, () => {});
  db.run(`ALTER TABLE avisos_repositor ADD COLUMN repositor_nome TEXT DEFAULT ''`, () => {});

  db.run(`CREATE TABLE IF NOT EXISTS checkout (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_caixa TEXT NOT NULL,
    pedido_id INTEGER NOT NULL,
    numero_pedido TEXT NOT NULL,
    separador_nome TEXT DEFAULT '',
    status TEXT DEFAULT 'pendente',
    hora_criacao TEXT,
    hora_checkout TEXT,
    data_checkout TEXT,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
  )`);
  db.run(`ALTER TABLE checkout ADD COLUMN separador_nome TEXT DEFAULT ''`, () => {});

  db.run(`CREATE TABLE IF NOT EXISTS historico_etapas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    aviso_id INTEGER NOT NULL,
    numero_pedido TEXT,
    codigo TEXT,
    descricao TEXT,
    endereco TEXT,
    etapa TEXT NOT NULL,
    funcionario TEXT NOT NULL,
    hora TEXT,
    data TEXT,
    qtd_encontrada INTEGER DEFAULT 0
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_hist_aviso ON historico_etapas(aviso_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_hist_data  ON historico_etapas(data)`);
  db.run(`CREATE TABLE IF NOT EXISTS configuracoes (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  // Metas padrão
  db.run(`INSERT OR IGNORE INTO configuracoes (chave,valor) VALUES ('meta_pontos_dia','300')`, ()=>{});
  db.run(`INSERT OR IGNORE INTO configuracoes (chave,valor) VALUES ('meta_pedidos_dia','25')`, ()=>{});
  db.run(`CREATE INDEX IF NOT EXISTS idx_pedidos_sep    ON pedidos(separador_id, status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_pedidos_num    ON pedidos(numero_pedido)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_itens_pedido   ON itens_pedido(pedido_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_itens_corredor ON itens_pedido(pedido_id, corredor)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_avisos_status  ON avisos_repositor(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_avisos_data    ON avisos_repositor(data_aviso)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_usuarios_login ON usuarios(login)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_checkout_caixa ON checkout(numero_caixa)`);
});

function perfisPermitidos(user) {
  const extras = String(user.perfis_acesso || '').split(',').map(s => s.trim()).filter(Boolean);
  return Array.from(new Set([user.perfil, ...extras]));
}

function hashSenha(senha) {
  return crypto.createHash('sha256').update(senha + 'wms_salt_2026').digest('hex');
}
function criarUsuarioPadrao() {
  const hash = hashSenha('123456');
  db.run(`INSERT OR IGNORE INTO usuarios (nome,login,senha_hash,perfil,perfis_acesso,status) VALUES (?,?,?,?,?,?)`,
    ['Supervisor Master','admin',hash,'supervisor','separador,repositor,checkout','ativo'],
    function(err) { if (!err && this.changes > 0) console.log('Usuario padrao criado: admin / 123456'); }
  );
  // Usuário padrão da tela de reposição (computador)
  const hashRep = hashSenha('reposicao2026');
  db.run(`INSERT OR IGNORE INTO usuarios (nome,login,senha_hash,perfil,status) VALUES (?,?,?,?,?)`,
    ['Reposição','reposicao',hashRep,'repositor','ativo'],
    function(err) { if (!err && this.changes > 0) console.log('Usuario reposicao criado: reposicao / reposicao2026'); }
  );
}
criarUsuarioPadrao();

// ─── AUTH ─────────────────────────────────────────────────────────────────────
app.post('/auth/login', (req, res) => {
  const { login, senha, perfil } = req.body;
  if (!login || !senha || !perfil) return res.status(400).json({ erro:'Dados incompletos!' });
  const hash = hashSenha(senha);
  const perfisValidos = ['supervisor','separador','repositor','checkout'];
  if (!perfisValidos.includes(perfil)) return res.status(400).json({ erro:'Perfil inválido!' });
  // Permite atualizar só o colaborador sem revalidar login
  if (req.body._apenas_colab) {
    if (!req.session.rep_usuario) return res.status(401).json({ erro:'Sessão expirada!' });
    req.session.rep_colaborador = colaborador || req.session.rep_usuario.nome;
    return res.json({ ok:true, nome: req.session.rep_colaborador });
  }
  db.get(`SELECT * FROM usuarios WHERE login=? AND senha_hash=? AND status='ativo'`,
    [login, hash], (err, user) => {
      if (err)   return res.status(500).json({ erro: err.message });
      if (!user) return res.status(401).json({ erro:'Login ou senha incorretos!' });
      const permitidos = perfisPermitidos(user);
      if (!permitidos.includes(perfil)) {
        return res.status(403).json({ erro:'Este colaborador nao pode acessar este perfil!' });
      }
      const perfilSessao = perfil;
      if (perfilSessao === 'separador') {
        db.get(`SELECT * FROM separadores WHERE usuario_id=? AND status='ativo'`, [user.id], (err2, sep) => {
          if (err2) return res.status(500).json({ erro: err2.message });
          req.session.usuario   = { id:user.id, nome:user.nome, login:user.login, perfil:perfilSessao, subtipo_repositor:user.subtipo_repositor || 'geral', turno:user.turno };
          req.session.separador = sep || null;
          return res.json({ usuario: req.session.usuario, separador: req.session.separador });
        });
      } else {
        req.session.usuario   = { id:user.id, nome:user.nome, login:user.login, perfil:perfilSessao, subtipo_repositor:user.subtipo_repositor || 'geral', turno:user.turno };
        req.session.separador = null;
        return res.json({ usuario: req.session.usuario, separador: null });
      }
    }
  );
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ mensagem:'Logout realizado!' }));
});
// Middleware de autenticação para rotas protegidas
function requireAuth(req, res, next) {
  if (!req.session.usuario) return res.status(401).json({ erro:'Não autenticado' });
  next();
}
function requireSupervisor(req, res, next) {
  if (!req.session.usuario) return res.status(401).json({ erro:'Não autenticado' });
  if (req.session.usuario.perfil !== 'supervisor') return res.status(403).json({ erro:'Acesso negado' });
  next();
}

app.get('/auth/me', (req, res) => {
  if (!req.session.usuario) return res.status(401).json({ erro:'Nao autenticado' });
  res.json({ usuario: req.session.usuario, separador: req.session.separador || null });
});

// ─── USUÁRIOS ─────────────────────────────────────────────────────────────────
// Lista de todos usuários ativos para tela de repositor aberta
app.get('/repositor/funcionarios', (req, res) => {
  db.all(`SELECT id, nome FROM usuarios WHERE status='ativo' ORDER BY nome`,
    [], (err, rows) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json(rows || []);
    });
});

app.get('/usuarios', (req, res) => {
  const { perfil } = req.query;
  let sql = 'SELECT id,nome,login,perfil,subtipo_repositor,perfis_acesso,turno,status,data_cadastro FROM usuarios WHERE 1=1';
  const params = [];
  if (perfil) { sql += ' AND perfil=?'; params.push(perfil); }
  sql += ' ORDER BY nome';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows);
  });
});

app.post('/usuarios', requireSupervisor, (req, res) => {
  const { nome, login, senha, perfil, subtipo_repositor, turno, perfis_acesso } = req.body;
  if (!nome||!login||!senha||!perfil) return res.status(400).json({ erro:'Preencha todos os campos!' });
  const hash = hashSenha(senha);
  // Normaliza perfis_acesso: remove o perfil principal, deduplica, limpa
  let extrasArr = Array.isArray(perfis_acesso)
    ? perfis_acesso
    : String(perfis_acesso || '').split(',');
  const extras = extrasArr
    .map(p => String(p).trim())
    .filter(Boolean)
    .filter(p => p !== perfil)
    .filter(p => ['supervisor','separador','repositor','checkout'].includes(p))
    .filter((v,i,a) => a.indexOf(v) === i)
    .join(',');
  const subtipo = perfil === 'repositor' ? (subtipo_repositor || 'geral') : 'geral';
  db.run(`INSERT INTO usuarios (nome,login,senha_hash,perfil,subtipo_repositor,perfis_acesso,turno) VALUES (?,?,?,?,?,?,?)`,
    [nome, login, hash, perfil, subtipo, extras, turno||'Manha'], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(409).json({ erro:'Login ja cadastrado!' });
        return res.status(500).json({ erro: err.message });
      }
      const novoId = this.lastID;
      if (perfil === 'separador') {
        db.run(`INSERT OR IGNORE INTO separadores (nome,matricula,turno,usuario_id) VALUES (?,?,?,?)`,
          [nome, login, turno||'Manha', novoId], () => {});
      }
      res.json({ id: novoId, mensagem:'Usuario cadastrado!' });
    }
  );
});

app.put('/usuarios/:id', requireSupervisor, (req, res) => {
  const { nome, login, senha, perfil, subtipo_repositor, turno, status, perfis_acesso } = req.body;
  let extrasString = null;
  if (perfis_acesso !== undefined) {
    const arr = Array.isArray(perfis_acesso)
      ? perfis_acesso
      : String(perfis_acesso || '').split(',');
    extrasString = arr
      .map(p => String(p).trim())
      .filter(Boolean)
      .filter(p => p !== perfil)
      .filter(p => ['supervisor','separador','repositor','checkout'].includes(p))
      .filter((v,i,a) => a.indexOf(v) === i)
      .join(',');
  }
  const subtipo = perfil === 'repositor' ? (subtipo_repositor || 'geral') : 'geral';
  let sql;
  const params = [];
  if (senha) {
    const hash = hashSenha(senha);
    sql = `UPDATE usuarios SET nome=?,login=?,senha_hash=?,perfil=?,subtipo_repositor=?,turno=?,status=?`;
    params.push(nome, login, hash, perfil, subtipo, turno||'Manha', status);
  } else {
    sql = `UPDATE usuarios SET nome=?,login=?,perfil=?,subtipo_repositor=?,turno=?,status=?`;
    params.push(nome, login, perfil, subtipo, turno||'Manha', status);
  }
  if (extrasString !== null) { sql += `,perfis_acesso=?`; params.push(extrasString); }
  sql += ` WHERE id=?`;
  params.push(req.params.id);
  db.run(sql, params, err => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json({ mensagem:'Atualizado!' });
  });
});

app.delete('/usuarios/:id', requireSupervisor, (req, res) => {
  db.run('DELETE FROM usuarios WHERE id=?', [req.params.id], err => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json({ mensagem:'Excluido!' });
  });
});

// ─── SEPARADORES ──────────────────────────────────────────────────────────────
app.get('/separadores', (req, res) => {
  db.all(`SELECT s.*, u.nome as usuario_nome FROM separadores s LEFT JOIN usuarios u ON s.usuario_id=u.id ORDER BY s.nome`,
    [], (err, rows) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json(rows);
    });
});
app.get('/separadores/:id', (req, res) => {
  db.get('SELECT * FROM separadores WHERE id=?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(row);
  });
});
app.post('/separadores', (req, res) => {
  const { nome, matricula, turno, usuario_id } = req.body;
  db.run('INSERT OR IGNORE INTO separadores (nome,matricula,turno,usuario_id) VALUES (?,?,?,?)',
    [nome, matricula, turno||'Manha', usuario_id||null], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(409).json({ erro:'Matricula ja cadastrada!' });
        return res.status(500).json({ erro: err.message });
      }
      res.json({ id: this.lastID, mensagem:'Separador cadastrado!' });
    });
});
app.put('/separadores/:id', (req, res) => {
  const { nome, matricula, turno, status, usuario_id } = req.body;
  db.run('UPDATE separadores SET nome=?,matricula=?,turno=?,status=?,usuario_id=? WHERE id=?',
    [nome, matricula, turno, status, usuario_id||null, req.params.id],
    err => { if (err) return res.status(500).json({ erro: err.message }); res.json({ mensagem:'Atualizado!' }); });
});
app.delete('/separadores/:id', (req, res) => {
  db.run('DELETE FROM separadores WHERE id=?', [req.params.id], err => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json({ mensagem:'Excluido!' });
  });
});

// ─── PEDIDOS ──────────────────────────────────────────────────────────────────
app.get('/pedidos', (req, res) => {
  const { separador_id, status, data, data_ini, data_fim, numero_pedido } = req.query;
  let query = `SELECT p.*, s.nome as separador_nome
               FROM pedidos p LEFT JOIN separadores s ON p.separador_id=s.id WHERE 1=1`;
  const params = [];
  if (separador_id) { query += ' AND p.separador_id=?'; params.push(separador_id); }
  if (status)       { query += ' AND p.status=?'; params.push(status); }
  if (data)         { query += ' AND p.data_pedido=?'; params.push(data); }
  if (data_ini)     { query += ' AND p.data_pedido>=?'; params.push(data_ini); }
  if (data_fim)     { query += ' AND p.data_pedido<=?'; params.push(data_fim); }
  if (numero_pedido){ query += ' AND p.numero_pedido=?'; params.push(numero_pedido); }
  query += ' ORDER BY p.data_pedido DESC, p.hora_pedido DESC';
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows);
  });
});

app.put('/pedidos/:id/separador', (req, res) => {
  const { separador_id } = req.body;
  db.run('UPDATE pedidos SET separador_id=? WHERE id=?', [separador_id, req.params.id], err => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json({ mensagem:'Separador atribuido!' });
  });
});

// Vincular caixa ao pedido — OBRIGATÓRIO antes de separar
app.put('/pedidos/:id/caixa', (req, res) => {
  const { numero_caixa } = req.body;
  if (!numero_caixa) return res.status(400).json({ erro:'Numero da caixa nao informado!' });
  const { data, hora } = dataHoraLocal();
  const caixa = String(numero_caixa).trim();

  db.get(`SELECT c.id, c.numero_pedido FROM checkout c WHERE c.numero_caixa=? AND c.status='pendente' AND c.pedido_id<>? ORDER BY c.id DESC LIMIT 1`, [caixa, req.params.id], (err0, usada) => {
    if (err0) return res.status(500).json({ erro: err0.message });
    if (usada) return res.status(409).json({ erro:`Caixa ${caixa} em uso no ped. ${usada.numero_pedido}. Aguarde o checkout liberar.` });

    db.get(`SELECT id, numero_pedido FROM pedidos WHERE numero_caixa=? AND id<>? AND status<>'concluido'`, [caixa, req.params.id], (err00, outroPed) => {
      if (err00) return res.status(500).json({ erro: err00.message });
      if (outroPed) return res.status(409).json({ erro:`Caixa ${caixa} em uso no pedido ${outroPed.numero_pedido}.` });

      db.run('UPDATE pedidos SET numero_caixa=? WHERE id=?', [caixa, req.params.id], err => {
        if (err) return res.status(500).json({ erro: err.message });

        db.get('SELECT p.*, s.nome as sep_nome FROM pedidos p LEFT JOIN separadores s ON p.separador_id=s.id WHERE p.id=?',
          [req.params.id], (err2, ped) => {
            if (err2 || !ped) return res.json({ mensagem:'Caixa vinculada!' });
            const sepNome = ped.sep_nome || '';

            db.get('SELECT id FROM checkout WHERE pedido_id=?', [req.params.id], (err3, ck) => {
              if (ck) {
                db.run("UPDATE checkout SET numero_caixa=?, separador_nome=?, status='pendente', hora_checkout=NULL, data_checkout=NULL WHERE pedido_id=?",
                  [caixa, sepNome, req.params.id], () => {});
              } else {
                db.run(`INSERT INTO checkout (numero_caixa,pedido_id,numero_pedido,separador_nome,status,hora_criacao,data_checkout) VALUES (?,?,?,?,'pendente',?,?)`,
                  [caixa, req.params.id, ped.numero_pedido, sepNome, hora, data], () => {});
              }
              res.json({ mensagem:'Caixa vinculada!', pedido_id: req.params.id, numero_pedido: ped.numero_pedido });
            });
          });
      });
    });
  });
});

// Bipar pedido — retorna transportadora e exige caixa vinculada antes de liberar checklist
app.post('/pedidos/bipar', (req, res) => {
  const { numero_pedido, separador_id } = req.body;
  if (!numero_pedido) return res.status(400).json({ erro:'Numero do pedido nao informado!' });

  db.get('SELECT * FROM pedidos WHERE numero_pedido=?', [numero_pedido], (err, pedido) => {
    if (err)     return res.status(500).json({ erro: err.message });
    if (!pedido) return res.status(404).json({ erro:'Pedido nao encontrado!' });
    if (pedido.status === 'concluido')
      return res.status(400).json({ erro:'Pedido ja concluido!', status:'concluido' });

    if (separador_id && pedido.separador_id && String(pedido.separador_id) === String(separador_id))
      return res.json({
        mensagem:'Pedido ja atribuido.', pedido_id:pedido.id, status:pedido.status,
        ja_atribuido:true, transportadora:pedido.transportadora||'', razao_social:pedido.razao_social||'',
        numero_caixa:pedido.numero_caixa||'', caixa_vinculada: !!(pedido.numero_caixa)
      });

    if (separador_id && pedido.separador_id && String(pedido.separador_id) !== String(separador_id) && pedido.status === 'separando')
      return res.status(409).json({ erro:'Pedido sendo separado por outro operador!' });

    const sepId = separador_id || pedido.separador_id || null;
    db.run(`UPDATE pedidos SET separador_id=?, status='separando' WHERE id=?`,
      [sepId, pedido.id], function(err2) {
        if (err2) return res.status(500).json({ erro: err2.message });
        res.json({
          mensagem:'Pedido atribuido!', pedido_id:pedido.id, status:'separando',
          transportadora: pedido.transportadora || '',
          razao_social: pedido.razao_social || '',
          numero_caixa: pedido.numero_caixa || '',
          caixa_vinculada: !!(pedido.numero_caixa)
        });
      });
  });
});

// Itens do pedido — ordenados por corredor (A→B→C...)
app.get('/pedidos/:id/itens', (req, res) => {
  db.all(`SELECT i.*,
     COALESCE(
       (SELECT a.status FROM avisos_repositor a WHERE a.item_id=i.id ORDER BY a.id DESC LIMIT 1),
       ''
     ) as aviso_status
   FROM itens_pedido i WHERE i.pedido_id=? ORDER BY i.corredor ASC, i.endereco ASC`,
    [req.params.id], (err, rows) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json(rows);
    });
});

app.put('/itens/:id/verificar', (req, res) => {
  const { status, obs, qtd_falta, separador_id, separador_nome } = req.body;
  const { data, hora } = dataHoraLocal();
  db.get(`SELECT i.*, p.numero_pedido FROM itens_pedido i JOIN pedidos p ON i.pedido_id=p.id WHERE i.id=?`,
    [req.params.id], (err, item) => {
      if (err||!item) return res.status(500).json({ erro: err?.message||'Item nao encontrado' });
      const obsTexto  = obs || '';
      const qtdFaltou = qtd_falta || 0;
      db.run('UPDATE itens_pedido SET status=?, obs=?, qtd_falta=?, hora_verificado=? WHERE id=?',
        [status, obsTexto, qtdFaltou, hora, req.params.id], err2 => {
          if (err2) return res.status(500).json({ erro: err2.message });
          if (status === 'falta' || status === 'parcial') {
            const qtdAviso = status==='falta' ? item.quantidade : qtdFaltou;
            const obsAviso = status==='parcial' ? obsTexto : `Falta total - ${item.quantidade} unidade(s)`;
            db.get(`SELECT id FROM avisos_repositor WHERE item_id=? AND status='pendente'`, [item.id], (err3, jaExiste) => {
              if (err3) return res.status(500).json({ erro: err3.message });
              if (jaExiste) {
                db.run(`UPDATE avisos_repositor SET quantidade=?,obs=?,hora_aviso=? WHERE id=?`,
                  [qtdAviso, obsAviso, hora, jaExiste.id], err4 => {
                    if (err4) return res.status(500).json({ erro: err4.message });
                    res.json({ mensagem:'Aviso atualizado!', aviso:true });
                  });
                return;
              }
              db.run(`INSERT INTO avisos_repositor
                (item_id,pedido_id,numero_pedido,separador_id,separador_nome,codigo,descricao,endereco,quantidade,obs,status,hora_aviso,data_aviso)
                VALUES (?,?,?,?,?,?,?,?,?,?,'pendente',?,?)`,
                [item.id,item.pedido_id,item.numero_pedido,separador_id,separador_nome,
                 item.codigo,item.descricao,item.endereco,qtdAviso,obsAviso,hora,data],
                err4 => {
                  if (err4) return res.status(500).json({ erro: err4.message });
                  res.json({ mensagem:'Repositor avisado!', aviso:true });
                });
            });
          } else {
            res.json({ mensagem:'Item verificado!', aviso:false });
          }
        });
    });
});

app.put('/pedidos/:id/concluir', (req, res) => {
  // Verifica se caixa foi vinculada
  db.get('SELECT numero_caixa FROM pedidos WHERE id=?', [req.params.id], (err0, ped) => {
    if (err0) return res.status(500).json({ erro: err0.message });
    if (!ped || !ped.numero_caixa) {
      return res.status(400).json({ erro:'Vincule uma caixa ao pedido antes de concluir!', sem_caixa:true });
    }
    db.all(`SELECT * FROM itens_pedido WHERE pedido_id=? AND status='pendente'`, [req.params.id], (err, pendentes) => {
      if (err) return res.status(500).json({ erro: err.message });
      if (pendentes.length > 0)
        return res.status(400).json({ erro:`Ainda ha ${pendentes.length} item(s) nao verificado(s)!` });
      // Pendente = repositor ainda não agiu. Verificando = em andamento mas não liberou
      db.all(`SELECT * FROM avisos_repositor WHERE pedido_id=? AND status IN ('pendente','verificando')`, [req.params.id], (err2, avisosPendentes) => {
        if (err2) return res.status(500).json({ erro: err2.message });
        if (avisosPendentes.length > 0)
          return res.status(400).json({ erro:`Aguardando repositor resolver ${avisosPendentes.length} item(s)!`, aguardando:true });
        db.all(`SELECT * FROM avisos_repositor WHERE pedido_id=? AND status IN ('nao_encontrado','protocolo')`, [req.params.id], (err3, bloqueados) => {
          if (err3) return res.status(500).json({ erro: err3.message });
          if (bloqueados.length > 0)
            return res.status(400).json({
              erro:`Pedido bloqueado! ${bloqueados.length} item(s) aguardam liberacao do supervisor!`,
              bloqueado: true
            });
          db.run('UPDATE pedidos SET status="concluido" WHERE id=?', [req.params.id], err4 => {
            if (err4) return res.status(500).json({ erro: err4.message });
            res.json({ mensagem:'Pedido concluido!' });
          });
        });
      });
    });
  });
});

// ─── REPOSITOR ────────────────────────────────────────────────────────────────
app.get('/repositor/buscar-produto', (req, res) => {
  const { codigo } = req.query;
  if (!codigo) return res.status(400).json({ erro: 'Codigo nao informado!' });
  db.all(`SELECT i.*, p.numero_pedido, p.status as pedido_status,
     COALESCE((SELECT a.status FROM avisos_repositor a WHERE a.item_id=i.id ORDER BY a.id DESC LIMIT 1),'') as aviso_status
   FROM itens_pedido i JOIN pedidos p ON i.pedido_id=p.id
   WHERE i.codigo LIKE ? AND p.status != 'concluido' ORDER BY p.numero_pedido`,
    [`%${codigo.trim()}%`], (err, rows) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json(rows);
    });
});

app.get('/repositor/duplicatas', (req, res) => {
  db.all(`SELECT i.codigo, i.descricao, COUNT(DISTINCT i.pedido_id) as total_pedidos,
     GROUP_CONCAT(p.numero_pedido, ', ') as pedidos
   FROM itens_pedido i JOIN pedidos p ON i.pedido_id=p.id
   JOIN avisos_repositor a ON a.item_id=i.id
   WHERE a.status='pendente'
   GROUP BY i.codigo HAVING COUNT(DISTINCT i.pedido_id) > 1`,
    [], (err, rows) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json(rows);
    });
});

app.get('/repositor/avisos', (req, res) => {
  const { status, data } = req.query;
  let query = 'SELECT * FROM avisos_repositor WHERE 1=1';
  const params = [];
  if (status) { query += ' AND status=?'; params.push(status); }
  if (data)   { query += ' AND data_aviso=?'; params.push(data); }
  query += ' ORDER BY id DESC';
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows);
  });
});

// Rota unificada para marcar aviso (encontrado, subiu, abastecido, nao_encontrado, protocolo)
app.put('/repositor/avisos/:id/:acao', (req, res) => {
  const { acao } = req.params;
  // Novas ações: separado, verificando, devolucao além das antigas
  const acoes = ['reposto','encontrado','separado','subiu','abastecido','nao_encontrado','protocolo','verificando','devolucao'];
  if (!acoes.includes(acao)) return res.status(400).json({ erro:'Acao invalida!' });
  const { hora, data } = dataHoraLocal();
  const { qtd_encontrada, repositor_nome } = req.body || {};
  // Mapeia ação para status no banco
  const statusMap = {
    reposto:'encontrado', encontrado:'encontrado', separado:'encontrado',
    subiu:'subiu', abastecido:'abastecido',
    nao_encontrado:'nao_encontrado', protocolo:'protocolo',
    verificando:'verificando', devolucao:'devolucao'
  };
  const novoStatus = statusMap[acao];
  const temQtd = ['encontrado','reposto','separado','subiu','abastecido'].includes(acao);
  // Etapas que notificam o separador
  const etapasNotifica = ['separado','subiu','abastecido'];

  db.get('SELECT * FROM avisos_repositor WHERE id=?', [req.params.id], (err0, aviso) => {
    if (err0 || !aviso) return res.status(404).json({ erro:'Aviso nao encontrado!' });

    const qtdEnc = parseInt(qtd_encontrada)||0;
    const func   = repositor_nome || '';

    // Bloqueia separado/subiu/abastecido se qtd insuficiente
    const acoesCompletas = ['separado','encontrado','subiu','abastecido'];
    if (acoesCompletas.includes(acao) && qtdEnc < (aviso.quantidade||1)) {
      return res.status(400).json({
        erro: `Quantidade insuficiente! Encontrou ${qtdEnc} de ${aviso.quantidade||1}. Use Verificando se ainda está buscando.`,
        qtd_insuficiente: true
      });
    }

    const salvarHistorico = (cb) => {
      db.run(`INSERT INTO historico_etapas (aviso_id,numero_pedido,codigo,descricao,endereco,etapa,funcionario,hora,data,qtd_encontrada)
        VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [aviso.id, aviso.numero_pedido, aviso.codigo, aviso.descricao, aviso.endereco,
         acao, func, hora, data, temQtd ? qtdEnc : 0], cb);
    };

    const updateAviso = (cb) => {
      if (temQtd) {
        db.run('UPDATE avisos_repositor SET status=?,hora_reposto=?,qtd_encontrada=?,repositor_nome=? WHERE id=?',
          [novoStatus, hora, qtdEnc, func, req.params.id], cb);
      } else {
        db.run('UPDATE avisos_repositor SET status=?,hora_reposto=?,repositor_nome=? WHERE id=?',
          [novoStatus, hora, func, req.params.id], cb);
      }
    };

    updateAviso(err => {
      if (err) return res.status(500).json({ erro: err.message });
      salvarHistorico(() => {
        res.json({ mensagem:'OK!', notifica: etapasNotifica.includes(acao), acao });
      });
    });
  });
});

// Histórico de etapas de um aviso
app.get('/repositor/historico/:aviso_id', (req, res) => {
  db.all('SELECT * FROM historico_etapas WHERE aviso_id=? ORDER BY id ASC',
    [req.params.aviso_id], (err, rows) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json(rows || []);
    });
});

// Histórico geral do dia
app.get('/repositor/historico-dia', (req, res) => {
  const { data: dataHoje } = dataHoraLocal();
  const usuario = req.session.usuario;
  // Supervisor vê tudo, repositor vê só o dele
  const ehSupervisor = usuario && usuario.perfil === 'supervisor';
  let sql = 'SELECT * FROM historico_etapas WHERE data=?';
  const params = [dataHoje];
  if (!ehSupervisor && usuario) {
    sql += ' AND funcionario=?';
    params.push(usuario.nome);
  }
  sql += ' ORDER BY id DESC LIMIT 500';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows || []);
  });
});

// ── PARA GUARDAR: itens que subiram mas ainda não foram abastecidos ──
app.get('/repositor/para-guardar', (req, res) => {
  db.all(`SELECT a.*,
    (SELECT GROUP_CONCAT(h.etapa || '|' || h.funcionario || '|' || h.hora, ';;')
     FROM historico_etapas h WHERE h.aviso_id = a.id ORDER BY h.id ASC) as etapas_json
    FROM avisos_repositor a
    WHERE a.status = 'subiu'
    ORDER BY a.hora_reposto DESC`,
    [], (err, rows) => {
      if (err) return res.status(500).json({ erro: err.message });
      // Parse etapas
      const result = rows.map(r => ({
        ...r,
        etapas: r.etapas_json
          ? r.etapas_json.split(';;').map(e => {
              const [etapa, funcionario, hora] = e.split('|');
              return { etapa, funcionario, hora };
            })
          : []
      }));
      res.json(result);
    });
});

// Histórico completo por data (supervisor)
app.get('/repositor/historico-completo', requireSupervisor, (req, res) => {
  const { data } = req.query;
  const { data: dataHoje } = dataHoraLocal();
  db.all(`SELECT h.*, 
    COUNT(*) OVER (PARTITION BY h.funcionario) as total_funcionario
    FROM historico_etapas h WHERE h.data=? ORDER BY h.id DESC LIMIT 1000`,
    [data || dataHoje], (err, rows) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json(rows || []);
    });
});

app.get('/repositor/avisos/separador/:separador_id', (req, res) => {
  const { data: dataHoje } = dataHoraLocal();
  db.all(`SELECT a.* FROM avisos_repositor a
    WHERE a.separador_id=? AND a.status IN ('encontrado','subiu','abastecido') AND a.data_aviso=?
    ORDER BY a.id DESC`,
    [req.params.separador_id, dataHoje], (err, rows) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json(rows || []);
    });
});

app.get('/repositor/duplicatas-dia', (req, res) => {
  const { data: dataHoje } = dataHoraLocal();
  db.all(`SELECT a.codigo, a.descricao,
    COUNT(DISTINCT a.pedido_id) as total_pedidos,
    GROUP_CONCAT(DISTINCT a.numero_pedido) as pedidos,
    MIN(a.hora_aviso) as primeira_hora
    FROM avisos_repositor a
    WHERE a.data_aviso=? AND a.status IN ('pendente','encontrado','subiu','abastecido')
    GROUP BY a.codigo
    HAVING COUNT(DISTINCT a.pedido_id) > 1
    ORDER BY total_pedidos DESC`,
    [dataHoje], (err, rows) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json(rows || []);
    });
});

// ─── CHECKOUT ─────────────────────────────────────────────────────────────────
app.get('/checkout/caixa/:numero', async (req, res) => {
  const numero = String(req.params.numero).trim();
  try {
    const rows = await new Promise((resolve, reject) => {
      db.all(`SELECT c.*, p.status as ped_status, p.itens as ped_itens, p.numero_caixa,
         p.transportadora, p.razao_social, s.nome as sep_nome
       FROM checkout c JOIN pedidos p ON c.pedido_id=p.id
       LEFT JOIN separadores s ON p.separador_id=s.id
       WHERE c.numero_caixa=? ORDER BY c.id DESC`,
        [numero], (err, r) => { if (err) reject(err); else resolve(r); });
    });
    const result = [];
    for (const row of rows) {
      const itens = await new Promise((resolve, reject) => {
        db.all(`SELECT codigo, descricao, endereco, quantidade, status FROM itens_pedido WHERE pedido_id=? ORDER BY corredor ASC, endereco ASC`,
          [row.pedido_id], (err, r) => { if (err) reject(err); else resolve(r); });
      });
      result.push({ ...row, itens_lista: itens });
    }
    res.json(result);
  } catch(err) {
    res.status(500).json({ erro: err.message });
  }
});

app.put('/checkout/:id/confirmar', (req, res) => {
  const { hora, data } = dataHoraLocal();
  db.run('UPDATE checkout SET status="concluido",hora_checkout=?,data_checkout=? WHERE id=?',
    [hora, data, req.params.id], err => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json({ mensagem:'Checkout confirmado!' });
    });
});

app.put('/checkout/:id/liberar', (req, res) => {
  const { hora, data } = dataHoraLocal();
  db.get('SELECT * FROM checkout WHERE id=?', [req.params.id], (err, ck) => {
    if (err || !ck) return res.status(404).json({ erro:'Checkout nao encontrado!' });
    db.run("UPDATE checkout SET status='liberado', hora_checkout=?, data_checkout=? WHERE id=?",
      [hora, data, req.params.id], err2 => {
        if (err2) return res.status(500).json({ erro: err2.message });
        db.run("UPDATE pedidos SET numero_caixa='' WHERE id=?", [ck.pedido_id], () => {});
        res.json({ mensagem:'Caixa liberada!' });
      });
  });
});

app.get('/pedidos/bloqueados', (req, res) => {
  db.all(`SELECT DISTINCT p.id, p.numero_pedido, p.status, p.separador_id,
    s.nome as separador_nome,
    COUNT(DISTINCT a.id) as total_bloqueios,
    GROUP_CONCAT(DISTINCT a.codigo) as codigos_bloqueados
    FROM pedidos p
    JOIN avisos_repositor a ON a.pedido_id=p.id
    LEFT JOIN separadores s ON p.separador_id=s.id
    WHERE a.status IN ('nao_encontrado','protocolo')
      AND p.status IN ('separando','concluido')
      AND NOT EXISTS (
        SELECT 1 FROM avisos_repositor a2
        WHERE a2.pedido_id=p.id AND a2.status='pendente'
      )
    GROUP BY p.id ORDER BY p.id DESC`,
    [], (err, rows) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json(rows || []);
    });
});

app.put('/pedidos/:id/desbloquear', requireSupervisor, (req, res) => {
  db.run("UPDATE pedidos SET status='concluido' WHERE id=?", [req.params.id], err => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json({ mensagem:'Pedido desbloqueado e concluido!' });
  });
});

app.get('/checkout', (req, res) => {
  const { status, data_ini, data_fim } = req.query;
  let query = `SELECT c.*, p.numero_caixa FROM checkout c JOIN pedidos p ON c.pedido_id=p.id WHERE 1=1`;
  const params = [];
  if (status)   { query += ' AND c.status=?'; params.push(status); }
  if (data_ini) { query += ' AND c.data_checkout>=?'; params.push(data_ini); }
  if (data_fim) { query += ' AND c.data_checkout<=?'; params.push(data_fim); }
  query += ' ORDER BY c.id DESC';
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows);
  });
});

// ─── IMPORTAÇÃO — suporta duas abas: "Itens" e "Transportadora" ──────────────
app.post('/importar', requireAuth, async (req, res) => {
  const { linhas, transportadoras } = req.body;
  if (!linhas || !linhas.length)
    return res.status(400).json({ erro: 'Nenhuma linha enviada!' });

  const { data: hoje, hora } = dataHoraLocal();

  // Monta mapa de transportadoras: { numero_pedido: { transportadora, razao_social } }
  const transpMap = {};
  if (transportadoras && transportadoras.length) {
    transportadoras.forEach(t => {
      const num = String(t.numero_pedido || '').trim();
      if (num) transpMap[num] = {
        transportadora: String(t.transportadora || '').trim(),
        razao_social:   String(t.razao_social || '').trim()
      };
    });
  }

  // Agrupa itens por pedido
  const pedidosMap = {};
  linhas.forEach(l => {
    const num = String(l.numero_pedido || '').trim().replace(/[^a-zA-Z0-9\-_]/g,'');
    if (!num) return;
    if (!pedidosMap[num]) pedidosMap[num] = [];
    pedidosMap[num].push(l);
  });

  const numeros = Object.keys(pedidosMap);
  if (!numeros.length)
    return res.status(400).json({ erro: 'Nenhum pedido valido encontrado!' });

  let importados = 0, ignorados = 0, erros = 0;

  // Função para extrair letra do corredor
  function corridorKey(endereco) {
    if (!endereco) return 'ZZZ';
    const primeiro = String(endereco).split(',')[0].trim();
    const match = primeiro.match(/^([A-Za-z]+)/);
    return match ? match[1].toUpperCase() : 'ZZZ';
  }

  for (const numero of numeros) {
    const itens = pedidosMap[numero];
    const transp = transpMap[numero] || { transportadora:'', razao_social:'' };
    try {
      // Calcula peso do pedido com dificuldade real de cada corredor
      const corridorKey = (e) => { const m=(String(e||'').split(',')[0].trim()).match(/^([A-Za-z]+)/); return m?m[1].toUpperCase():'ZZZ'; };
      const corredoresSet = new Set(itens.map(i => corridorKey(i.endereco)));
      const corredoresUnicos = corredoresSet.size;
      const totalUnidades    = itens.reduce((s,i) => s + (parseInt(i.quantidade)||1), 0);
      const totalItens       = itens.length;
      // Pontuação por corredor usando dificuldade real do estoque
      let pontosCorredores = 0;
      corredoresSet.forEach(cor => { pontosCorredores += getDificuldade(cor) * 3; });
      // Fórmula final: pontos_corredores + itens×1 + unidades×0.5
      const pesoPedido = Math.round(pontosCorredores + (totalItens * 1) + (totalUnidades * 0.5));

      const result = await dbRun(
        `INSERT OR IGNORE INTO pedidos (numero_pedido,status,itens,rua,data_pedido,hora_pedido,transportadora,razao_social,peso,corredores_count,unidades_total) VALUES (?, 'pendente', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [numero, itens.length, itens[0]?.endereco || '', hoje, hora, transp.transportadora, transp.razao_social, pesoPedido, corredoresUnicos, totalUnidades]
      );
      const foiNovo = result.changes > 0;
      const pedido  = await dbGet('SELECT id FROM pedidos WHERE numero_pedido=?', [numero]);
      if (!pedido) { erros++; continue; }

      // Se o pedido já existia, atualiza transportadora se veio nova
      if (!foiNovo) {
        if (transp.transportadora) {
          await dbRun('UPDATE pedidos SET transportadora=?, razao_social=? WHERE id=?',
            [transp.transportadora, transp.razao_social, pedido.id]).catch(()=>{});
        }
        ignorados++;
        continue;
      }

      await dbRun('BEGIN', []);
      try {
        // Ordena itens por corredor antes de inserir
        const itensOrdenados = [...itens].sort((a, b) => {
          const cA = corridorKey(a.endereco);
          const cB = corridorKey(b.endereco);
          if (cA !== cB) return cA.localeCompare(cB);
          const nA = parseInt((String(a.endereco||'').split(',')[0].match(/[0-9]+/)||['9999'])[0]);
          const nB = parseInt((String(b.endereco||'').split(',')[0].match(/[0-9]+/)||['9999'])[0]);
          return nA - nB;
        });
        // Salva dificuldade de cada item
        itensOrdenados.forEach(item => {
          item._dificuldade = getDificuldade(item.endereco);
        });

        for (const item of itensOrdenados) {
          const corredor = corridorKey(item.endereco);
          await dbRun(
            `INSERT INTO itens_pedido (pedido_id,codigo,descricao,endereco,corredor,quantidade) VALUES (?,?,?,?,?,?)`,
            [pedido.id, String(item.codigo||'').trim(), String(item.descricao||'').trim(),
             String(item.endereco||'').trim(), corredor, parseInt(item.quantidade)||1]
          );
        }
        await dbRun('COMMIT', []);
        importados++;
      } catch (errItem) {
        await dbRun('ROLLBACK', []).catch(() => {});
        await dbRun('DELETE FROM pedidos WHERE id=?', [pedido.id]).catch(() => {});
        erros++;
      }
    } catch (err) {
      erros++;
    }
  }

  res.json({ mensagem:'Importacao concluida!', importados, ignorados, erros, total: numeros.length });
});

// ─── LAYOUT DO ESTOQUE ──────────────────────────────────────────────────────
app.get('/layout-estoque', requireAuth, (req, res) => {
  res.json({
    corredores: {
      verde:    ['A','B','C','D','E','P','Q','R','S','T','U'],
      azul:     ['M','N','O','V','W','X','Y','Z'],
      vermelho: ['F','G','H','I','J','K','L']
    },
    multiplicadores: { verde:1, azul:2, vermelho:3 },
    descricoes: {
      verde:    '🟢 Fácil — corredores de fácil acesso (×1 ponto)',
      azul:     '🔵 Médio — corredores de acesso médio (×2 pontos)',
      vermelho: '🔴 Difícil — corredores de difícil acesso (×3 pontos)'
    }
  });
});

// ─── CONFIGURAÇÕES / METAS ──────────────────────────────────────────────────
app.get('/configuracoes', requireAuth, (req, res) => {
  db.all('SELECT chave, valor FROM configuracoes', [], (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    const cfg = {};
    rows.forEach(r => cfg[r.chave] = r.valor);
    res.json(cfg);
  });
});

app.put('/configuracoes', requireSupervisor, (req, res) => {
  const updates = req.body;
  const stmt = db.prepare('INSERT OR REPLACE INTO configuracoes (chave,valor,atualizado_em) VALUES (?,?,CURRENT_TIMESTAMP)');
  Object.entries(updates).forEach(([k,v]) => stmt.run([k, String(v)]));
  stmt.finalize(() => res.json({ mensagem:'Configurações salvas!' }));
});

// ─── SUGESTÃO DE ATRIBUIÇÃO (balanceamento) ──────────────────────────────────
app.get('/sugestao-separador/:pedido_id', requireAuth, (req, res) => {
  const { data: dataHoje } = dataHoraLocal();
  // Busca separadores ativos e seus pontos acumulados hoje
  db.all(`SELECT s.id, s.nome,
    COALESCE(SUM(CASE WHEN p.status='concluido' AND p.data_pedido=? THEN p.peso ELSE 0 END),0) as pontos_hoje,
    COALESCE(COUNT(CASE WHEN p.status='concluido' AND p.data_pedido=? THEN 1 END),0) as pedidos_hoje,
    COALESCE(COUNT(CASE WHEN p.status='separando' THEN 1 END),0) as em_separacao
    FROM separadores s
    LEFT JOIN pedidos p ON p.separador_id=s.id
    WHERE s.status='ativo'
    GROUP BY s.id ORDER BY pontos_hoje ASC, em_separacao ASC`,
    [dataHoje, dataHoje], (err, separadores) => {
      if (err) return res.status(500).json({ erro: err.message });
      if (!separadores.length) return res.json({ sugestao: null, separadores: [] });
      // Sugere quem tem menos pontos hoje e menos pedidos em separação
      const sugestao = separadores.find(s => s.em_separacao === 0) || separadores[0];
      res.json({ sugestao, separadores });
    });
});

// ─── PRODUTIVIDADE ────────────────────────────────────────────────────────────
app.get('/produtividade', (req, res) => {
  const { separador_id } = req.query;
  const { data: dataHoje } = dataHoraLocal();
  const mesAtual = dataHoje.substring(0, 7);
  let query = `
    SELECT s.id, s.nome, s.matricula, s.status,
      COALESCE(SUM(CASE WHEN p.data_pedido=? THEN 1 ELSE 0 END),0) as hoje,
      COALESCE(SUM(CASE WHEN substr(p.data_pedido,1,7)=? THEN 1 ELSE 0 END),0) as mes,
      COALESCE(COUNT(p.id),0) as total_ano,
      COALESCE(SUM(CASE WHEN p.data_pedido=? THEN p.peso ELSE 0 END),0) as pontos_hoje,
      COALESCE(SUM(p.peso),0) as pontos_total,
      COALESCE(SUM(CASE WHEN p.data_pedido=? THEN p.unidades_total ELSE 0 END),0) as unidades_hoje
    FROM separadores s
    LEFT JOIN pedidos p ON p.separador_id=s.id AND p.status='concluido'
    WHERE 1=1`;
  const params = [dataHoje, mesAtual, dataHoje, dataHoje];
  if (separador_id) { query += ' AND s.id=?'; params.push(separador_id); }
  query += ' GROUP BY s.id ORDER BY s.nome';
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows);
  });
});

// ─── ESTATÍSTICAS ─────────────────────────────────────────────────────────────
app.get('/estatisticas/pedidos', (req, res) => {
  const { data_ini, data_fim } = req.query;
  const { data: dataHoje } = dataHoraLocal();
  const mesAtual = dataHoje.substring(0, 7);
  const anoAtual = dataHoje.substring(0, 4);
  db.get(`SELECT
    SUM(CASE WHEN data_pedido=? AND status='concluido' THEN 1 ELSE 0 END) as concluidos_hoje,
    SUM(CASE WHEN data_pedido=? THEN 1 ELSE 0 END) as total_hoje,
    SUM(CASE WHEN substr(data_pedido,1,7)=? AND status='concluido' THEN 1 ELSE 0 END) as concluidos_mes,
    SUM(CASE WHEN substr(data_pedido,1,7)=? THEN 1 ELSE 0 END) as total_mes,
    SUM(CASE WHEN substr(data_pedido,1,4)=? AND status='concluido' THEN 1 ELSE 0 END) as concluidos_ano,
    SUM(CASE WHEN substr(data_pedido,1,4)=? THEN 1 ELSE 0 END) as total_ano
    FROM pedidos`,
    [dataHoje, dataHoje, mesAtual, mesAtual, anoAtual, anoAtual], (err, row) => {
      if (err) return res.status(500).json({ erro: err.message });
      if (data_ini && data_fim) {
        db.get(`SELECT COUNT(*) as total_periodo,
          SUM(CASE WHEN status='concluido' THEN 1 ELSE 0 END) as concluidos_periodo
          FROM pedidos WHERE data_pedido>=? AND data_pedido<=?`,
          [data_ini, data_fim], (err2, row2) => {
            if (err2) return res.status(500).json({ erro: err2.message });
            res.json({ ...row, ...row2 });
          });
      } else {
        res.json(row);
      }
    });
});

app.get('/estatisticas/repositor', (req, res) => {
  const { data: dataHoje } = dataHoraLocal();
  const mesAtual = dataHoje.substring(0, 7);
  const anoAtual = dataHoje.substring(0, 4);
  const params1 = [dataHoje, dataHoje, mesAtual, mesAtual, anoAtual, anoAtual];
  db.get(`SELECT
    SUM(CASE WHEN data_aviso=? AND status IN ('reposto','encontrado','subiu','abastecido') THEN 1 ELSE 0 END) as repostos_hoje,
    SUM(CASE WHEN data_aviso=? THEN 1 ELSE 0 END) as avisos_hoje,
    SUM(CASE WHEN substr(data_aviso,1,7)=? AND status IN ('reposto','encontrado','subiu','abastecido') THEN 1 ELSE 0 END) as repostos_mes,
    SUM(CASE WHEN substr(data_aviso,1,7)=? THEN 1 ELSE 0 END) as avisos_mes,
    SUM(CASE WHEN substr(data_aviso,1,4)=? AND status IN ('reposto','encontrado','subiu','abastecido') THEN 1 ELSE 0 END) as repostos_ano,
    SUM(CASE WHEN substr(data_aviso,1,4)=? THEN 1 ELSE 0 END) as avisos_ano,
    SUM(CASE WHEN status='pendente' THEN 1 ELSE 0 END) as pendentes_total,
    SUM(CASE WHEN status='nao_encontrado' THEN 1 ELSE 0 END) as nao_encontrados,
    SUM(CASE WHEN status='protocolo' THEN 1 ELSE 0 END) as protocolos
    FROM avisos_repositor WHERE 1=1`,
    params1, (err, row) => {
      if (err) return res.status(500).json({ erro: err.message });
      db.all(`SELECT repositor_nome as nome, COUNT(*) as total,
        SUM(CASE WHEN status IN ('reposto','encontrado','subiu','abastecido') THEN 1 ELSE 0 END) as repostos,
        SUM(CASE WHEN status='nao_encontrado' THEN 1 ELSE 0 END) as nao_encontrados,
        SUM(CASE WHEN data_aviso=? THEN 1 ELSE 0 END) as hoje
        FROM avisos_repositor WHERE repositor_nome != '' GROUP BY repositor_nome ORDER BY repostos DESC`,
        [dataHoje], (err2, produtividade) => {
          if (err2) return res.status(500).json({ erro: err2.message });
          res.json({ ...row, produtividade: produtividade || [] });
        });
    });
});

app.get('/estatisticas/checkout', (req, res) => {
  const { data: dataHoje } = dataHoraLocal();
  const mesAtual = dataHoje.substring(0, 7);
  const anoAtual = dataHoje.substring(0, 4);
  db.get(`SELECT
    SUM(CASE WHEN data_checkout=? AND status='concluido' THEN 1 ELSE 0 END) as concluidos_hoje,
    SUM(CASE WHEN data_checkout=? THEN 1 ELSE 0 END) as total_hoje,
    SUM(CASE WHEN substr(data_checkout,1,7)=? AND status='concluido' THEN 1 ELSE 0 END) as concluidos_mes,
    SUM(CASE WHEN substr(data_checkout,1,7)=? THEN 1 ELSE 0 END) as total_mes,
    SUM(CASE WHEN substr(data_checkout,1,4)=? AND status='concluido' THEN 1 ELSE 0 END) as concluidos_ano,
    SUM(CASE WHEN substr(data_checkout,1,4)=? THEN 1 ELSE 0 END) as total_ano,
    SUM(CASE WHEN status='pendente' THEN 1 ELSE 0 END) as pendentes
    FROM checkout`,
    [dataHoje, dataHoje, mesAtual, mesAtual, anoAtual, anoAtual], (err, row) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json(row || {});
    });
});

// ─── ALERTAS EM TEMPO REAL ───────────────────────────────────────────────
app.get('/alertas', requireAuth, (req, res) => {
  const { data: dataHoje } = dataHoraLocal();

  const sqlTravados = `SELECT p.id, p.numero_pedido, p.hora_pedido,
      s.nome as separador_nome,
      CAST((julianday('now','localtime') - julianday(p.data_pedido || ' ' || p.hora_pedido)) * 1440 AS INTEGER) as minutos
    FROM pedidos p LEFT JOIN separadores s ON p.separador_id=s.id
    WHERE p.status='separando' AND p.data_pedido=? AND p.hora_pedido IS NOT NULL
      AND (julianday('now','localtime') - julianday(p.data_pedido || ' ' || p.hora_pedido)) * 1440 > 30
    ORDER BY minutos DESC`;

  const sqlFaltas = `SELECT a.id, a.codigo, a.descricao, a.numero_pedido,
      a.separador_nome, a.hora_aviso,
      CAST((julianday('now','localtime') - julianday(a.data_aviso || ' ' || a.hora_aviso)) * 1440 AS INTEGER) as minutos
    FROM avisos_repositor a
    WHERE a.status='pendente' AND a.data_aviso=? AND a.hora_aviso IS NOT NULL
      AND (julianday('now','localtime') - julianday(a.data_aviso || ' ' || a.hora_aviso)) * 1440 > 30
    ORDER BY minutos DESC`;

  const sqlBloqueados = `SELECT DISTINCT p.id, p.numero_pedido,
      s.nome as separador_nome,
      GROUP_CONCAT(DISTINCT a.codigo) as codigos,
      COUNT(DISTINCT a.id) as total
    FROM pedidos p JOIN avisos_repositor a ON a.pedido_id=p.id
    LEFT JOIN separadores s ON p.separador_id=s.id
    WHERE a.status IN ('nao_encontrado','protocolo')
      AND p.status IN ('separando','pendente')
    GROUP BY p.id ORDER BY p.id DESC`;

  db.all(sqlTravados, [dataHoje], (e1, travados) => {
    db.all(sqlFaltas, [dataHoje], (e2, faltas) => {
      db.all(sqlBloqueados, [], (e3, bloqueados) => {
        res.json({
          pedidos_travados:    travados  || [],
          faltas_sem_resposta: faltas    || [],
          pedidos_bloqueados:  bloqueados|| [],
          tem_alerta: !!(travados?.length || faltas?.length || bloqueados?.length)
        });
      });
    });
  });
});

app.get('/kpis', (req, res) => {
  const { data: dataHoje } = dataHoraLocal();
  const mesAtual = dataHoje.substring(0, 7);
  const sql = `SELECT
    (SELECT COUNT(*) FROM pedidos WHERE status='concluido' AND data_pedido=?) as concluidos_hoje,
    (SELECT COUNT(*) FROM pedidos WHERE status='separando') as em_separacao,
    (SELECT COUNT(*) FROM pedidos WHERE status='pendente') as pendentes,
    (SELECT COUNT(*) FROM avisos_repositor WHERE status='pendente') as faltas_abertas,
    (SELECT COUNT(*) FROM checkout WHERE status='pendente') as checkout_pendente,
    (SELECT COUNT(*) FROM checkout WHERE status='concluido' AND data_checkout=?) as checkout_hoje,
    (SELECT COUNT(*) FROM pedidos WHERE status='concluido' AND substr(data_pedido,1,7)=?) as concluidos_mes,
    (SELECT COUNT(*) FROM pedidos WHERE data_pedido=?) as importados_hoje,
    (SELECT COUNT(DISTINCT separador_id) FROM pedidos WHERE status='separando') as seps_ativos,
    (SELECT COUNT(*) FROM avisos_repositor WHERE status='nao_encontrado' AND data_aviso=?) as nao_encontrados_hoje,
    (SELECT COUNT(*) FROM avisos_repositor WHERE data_aviso=?) as total_faltas_hoje`;
  db.get(sql, [dataHoje, dataHoje, mesAtual, dataHoje, dataHoje, dataHoje], (err, row) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(row || {});
  });
});

// ─── ROTA REPOSITOR — requer login repositor ────
app.get('/repositor-tela', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'repositor.html'));
});

// Login específico para tela de reposição (retorna token simples em session)
app.post('/repositor/login', (req, res) => {
  const { login, senha, colaborador } = req.body;
  if (!login || !senha) return res.status(400).json({ erro:'Preencha login e senha!' });
  const hash = hashSenha(senha);
  db.get(`SELECT * FROM usuarios WHERE login=? AND senha_hash=? AND status='ativo'`,
    [login, hash], (err, user) => {
      if (err)   return res.status(500).json({ erro: err.message });
      if (!user) return res.status(401).json({ erro:'Login ou senha incorretos!' });
      // Aceita supervisor ou repositor
      const perfisOk = ['supervisor','repositor'];
      const perfisUser = [user.perfil, ...(user.perfis_acesso||'').split(',').filter(Boolean)];
      if (!perfisOk.some(p => perfisUser.includes(p)))
        return res.status(403).json({ erro:'Sem permissão para esta tela!' });
      // Salva colaborador selecionado na sessão
      req.session.rep_colaborador = colaborador || user.nome;
      req.session.rep_usuario = { id: user.id, nome: user.nome, login: user.login };
      res.json({ ok: true, nome: req.session.rep_colaborador });
    });
});

app.get('/repositor/sessao', (req, res) => {
  if (!req.session.rep_usuario) return res.status(401).json({ logado: false });
  res.json({ logado: true, colaborador: req.session.rep_colaborador || req.session.rep_usuario.nome });
});

app.post('/repositor/logout', (req, res) => {
  req.session.rep_colaborador = null;
  req.session.rep_usuario = null;
  res.json({ ok: true });
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Servidor WMS rodando na porta ${PORT}`);
  const { data, hora } = dataHoraLocal();
  console.log(`Data/hora local: ${data} ${hora}`);
});