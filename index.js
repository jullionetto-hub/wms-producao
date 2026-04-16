const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  credentials: true,
  origin: function(origin, callback) {
    callback(null, origin || 'http://localhost:3000');
  }
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'wms_session_secret_2026',
  resave: false,
  saveUninitialized: false,
  store: new SQLiteStore({ db: 'sessions.db', dir: __dirname }),
  cookie: { maxAge: 8 * 60 * 60 * 1000, httpOnly: true, secure: false, sameSite: 'lax' }
}));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const DB_PATH = path.join(__dirname, 'wms.db');
const db = new sqlite3.Database(DB_PATH, err => {
  if (err) console.error(err.message);
  else console.log('Banco conectado em:', DB_PATH);
});
db.run('PRAGMA journal_mode=WAL');

function dbRun(sql, params=[]) {
  return new Promise((resolve, reject) => db.run(sql, params, function(err){ if(err) reject(err); else resolve(this); }));
}
function dbGet(sql, params=[]) {
  return new Promise((resolve, reject) => db.get(sql, params, (err,row)=> err ? reject(err) : resolve(row)));
}
function dbAll(sql, params=[]) {
  return new Promise((resolve, reject) => db.all(sql, params, (err,rows)=> err ? reject(err) : resolve(rows)));
}
function dataHoraLocal() {
  const agora = new Date();
  const opcData = { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' };
  const opcHora = { timeZone:'America/Sao_Paulo', hour:'2-digit', minute:'2-digit', hour12:false };
  const partes = agora.toLocaleDateString('pt-BR', opcData).split('/');
  const dataISO = `${partes[2]}-${partes[1]}-${partes[0]}`;
  const hora = agora.toLocaleTimeString('pt-BR', opcHora);
  return { data: dataISO, hora };
}
function hashSenha(senha) {
  return crypto.createHash('sha256').update(String(senha) + 'wms_salt_2026').digest('hex');
}
function perfisPermitidos(user) {
  const extras = String(user.perfis_acesso || '').split(',').map(s => s.trim()).filter(Boolean);
  return Array.from(new Set([user.perfil, ...extras]));
}
function validarPerfil(perfil) {
  return ['supervisor','separador','repositor','checkout'].includes(perfil);
}

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    login TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    perfil TEXT NOT NULL DEFAULT 'separador',
    perfis_acesso TEXT DEFAULT '',
    turno TEXT DEFAULT 'Manhã',
    status TEXT DEFAULT 'ativo',
    data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`ALTER TABLE usuarios ADD COLUMN turno TEXT DEFAULT 'Manhã'`, ()=>{});
  db.run(`ALTER TABLE usuarios ADD COLUMN perfis_acesso TEXT DEFAULT ''`, ()=>{});

  db.run(`CREATE TABLE IF NOT EXISTS separadores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    matricula TEXT NOT NULL UNIQUE,
    turno TEXT DEFAULT 'Manhã',
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
    data_pedido TEXT,
    hora_pedido TEXT,
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (separador_id) REFERENCES separadores(id)
  )`);
  db.run(`ALTER TABLE pedidos ADD COLUMN numero_caixa TEXT DEFAULT ''`, ()=>{});

  db.run(`CREATE TABLE IF NOT EXISTS itens_pedido (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    codigo TEXT,
    descricao TEXT,
    endereco TEXT,
    quantidade INTEGER DEFAULT 1,
    status TEXT DEFAULT 'pendente',
    obs TEXT DEFAULT '',
    qtd_falta INTEGER DEFAULT 0,
    hora_verificado TEXT,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
  )`);
  db.run(`ALTER TABLE itens_pedido ADD COLUMN obs TEXT DEFAULT ''`, ()=>{});
  db.run(`ALTER TABLE itens_pedido ADD COLUMN qtd_falta INTEGER DEFAULT 0`, ()=>{});

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
  db.run(`ALTER TABLE avisos_repositor ADD COLUMN obs TEXT DEFAULT ''`, ()=>{});
  db.run(`ALTER TABLE avisos_repositor ADD COLUMN data_aviso TEXT`, ()=>{});
  db.run(`ALTER TABLE avisos_repositor ADD COLUMN qtd_encontrada INTEGER DEFAULT 0`, ()=>{});
  db.run(`ALTER TABLE avisos_repositor ADD COLUMN repositor_nome TEXT DEFAULT ''`, ()=>{});

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
  db.run(`ALTER TABLE checkout ADD COLUMN separador_nome TEXT DEFAULT ''`, ()=>{});

  db.run(`CREATE INDEX IF NOT EXISTS idx_pedidos_sep ON pedidos(separador_id, status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_pedidos_num ON pedidos(numero_pedido)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_itens_pedido ON itens_pedido(pedido_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_avisos_status ON avisos_repositor(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_usuarios_login ON usuarios(login)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_checkout_caixa ON checkout(numero_caixa)`);
});

async function criarUsuarioPadrao() {
  try {
    const user = await dbGet(`SELECT id FROM usuarios WHERE login='admin'`);
    if (!user) {
      await dbRun(`INSERT INTO usuarios (nome,login,senha_hash,perfil,perfis_acesso,turno,status) VALUES (?,?,?,?,?,?,?)`,
        ['Supervisor Master','admin',hashSenha('123456'),'supervisor','separador,repositor,checkout','Manhã','ativo']);
      console.log('Usuário padrão criado: admin / 123456');
    }
  } catch(e) { console.error(e.message); }
}
criarUsuarioPadrao();

app.post('/auth/login', async (req, res) => {
  const { login, senha, perfil } = req.body;
  if (!login || !senha || !perfil) return res.status(400).json({ erro:'Dados incompletos!' });
  if (!validarPerfil(perfil)) return res.status(400).json({ erro:'Perfil inválido!' });
  try {
    const user = await dbGet(`SELECT * FROM usuarios WHERE login=? AND senha_hash=? AND status='ativo'`, [login.trim(), hashSenha(senha)]);
    if (!user) return res.status(401).json({ erro:'Login ou senha incorretos!' });
    const permitidos = perfisPermitidos(user);
    if (!permitidos.includes(perfil)) return res.status(403).json({ erro:'Este colaborador não pode acessar este perfil!' });
    let sep = null;
    if (perfil === 'separador') sep = await dbGet(`SELECT * FROM separadores WHERE usuario_id=? AND status='ativo'`, [user.id]);
    req.session.usuario = { id:user.id, nome:user.nome, login:user.login, perfil, perfil_principal:user.perfil, perfis_acesso:permitidos, turno:user.turno };
    req.session.separador = sep || null;
    res.json({ usuario:req.session.usuario, separador:req.session.separador });
  } catch(err) {
    res.status(500).json({ erro: err.message });
  }
});
app.post('/auth/logout', (req, res) => req.session.destroy(() => res.json({ mensagem:'Logout realizado!' })));
app.get('/auth/me', (req, res) => {
  if (!req.session.usuario) return res.status(401).json({ erro:'Não autenticado' });
  res.json({ usuario:req.session.usuario, separador:req.session.separador || null });
});

app.get('/usuarios', async (req, res) => {
  try {
    const { perfil } = req.query;
    let sql = `SELECT id,nome,login,perfil,perfis_acesso,turno,status,data_cadastro FROM usuarios WHERE 1=1`;
    const params = [];
    if (perfil) { sql += ' AND perfil=?'; params.push(perfil); }
    sql += ' ORDER BY nome';
    const rows = await dbAll(sql, params);
    res.json(rows);
  } catch(err) { res.status(500).json({ erro: err.message }); }
});
app.post('/usuarios', async (req, res) => {
  const { nome, login, senha, perfil, turno, perfis_acesso } = req.body;
  if (!nome || !login || !senha || !perfil) return res.status(400).json({ erro:'Preencha todos os campos!' });
  if (!validarPerfil(perfil)) return res.status(400).json({ erro:'Perfil inválido!' });
  try {
    const extras = Array.isArray(perfis_acesso) ? perfis_acesso.filter(validarPerfil).filter(p => p !== perfil) : [];
    const result = await dbRun(`INSERT INTO usuarios (nome,login,senha_hash,perfil,perfis_acesso,turno,status) VALUES (?,?,?,?,?,?,?)`,
      [nome.trim(), login.trim(), hashSenha(senha), perfil, extras.join(','), turno || 'Manhã', 'ativo']);
    if (perfil === 'separador' || extras.includes('separador')) {
      await dbRun(`INSERT OR IGNORE INTO separadores (nome,matricula,turno,usuario_id,status) VALUES (?,?,?,?,?)`,
        [nome.trim(), login.trim(), turno || 'Manhã', result.lastID, 'ativo']);
    }
    res.json({ id: result.lastID, mensagem:'Usuário cadastrado!' });
  } catch(err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ erro:'Login já cadastrado!' });
    res.status(500).json({ erro: err.message });
  }
});
app.put('/usuarios/:id', async (req, res) => {
  const { nome, login, senha, perfil, turno, status, perfis_acesso } = req.body;
  try {
    const extras = Array.isArray(perfis_acesso) ? perfis_acesso.filter(validarPerfil).filter(p => p !== perfil) : [];
    if (senha) {
      await dbRun(`UPDATE usuarios SET nome=?,login=?,senha_hash=?,perfil=?,perfis_acesso=?,turno=?,status=? WHERE id=?`,
        [nome, login, hashSenha(senha), perfil, extras.join(','), turno || 'Manhã', status, req.params.id]);
    } else {
      await dbRun(`UPDATE usuarios SET nome=?,login=?,perfil=?,perfis_acesso=?,turno=?,status=? WHERE id=?`,
        [nome, login, perfil, extras.join(','), turno || 'Manhã', status, req.params.id]);
    }
    if (perfil === 'separador' || extras.includes('separador')) {
      await dbRun(`INSERT OR IGNORE INTO separadores (nome,matricula,turno,usuario_id,status) VALUES (?,?,?,?,?)`, [nome, login, turno || 'Manhã', req.params.id, status || 'ativo']);
      await dbRun(`UPDATE separadores SET nome=?, matricula=?, turno=?, status=?, usuario_id=? WHERE usuario_id=?`, [nome, login, turno || 'Manhã', status || 'ativo', req.params.id, req.params.id]);
    }
    res.json({ mensagem:'Atualizado!' });
  } catch(err) { res.status(500).json({ erro: err.message }); }
});
app.delete('/usuarios/:id', (req, res) => {
  db.run('DELETE FROM usuarios WHERE id=?', [req.params.id], err => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json({ mensagem:'Excluído!' });
  });
});

app.get('/separadores', async (req,res)=> { try { res.json(await dbAll(`SELECT s.*, u.nome as usuario_nome FROM separadores s LEFT JOIN usuarios u ON s.usuario_id=u.id ORDER BY s.nome`)); } catch(err){ res.status(500).json({ erro: err.message }); } });
app.get('/separadores/:id', async (req,res)=> { try { res.json(await dbGet('SELECT * FROM separadores WHERE id=?',[req.params.id])); } catch(err){ res.status(500).json({ erro: err.message }); } });
app.post('/separadores', (req,res)=> res.json({ mensagem:'Separadores são criados pelo cadastro de usuários.' }));
app.put('/separadores/:id', async (req,res)=> {
  const { nome, matricula, turno, status, usuario_id } = req.body;
  try {
    await dbRun('UPDATE separadores SET nome=?,matricula=?,turno=?,status=?,usuario_id=? WHERE id=?',[nome,matricula,turno,status,usuario_id||null,req.params.id]);
    res.json({ mensagem:'Atualizado!' });
  } catch(err){ res.status(500).json({ erro: err.message }); }
});
app.delete('/separadores/:id', async (req,res)=> {
  try { await dbRun('DELETE FROM separadores WHERE id=?',[req.params.id]); res.json({ mensagem:'Excluído!' }); }
  catch(err){ res.status(500).json({ erro: err.message }); }
});

app.get('/pedidos', async (req, res) => {
  try {
    const { separador_id, status, data, data_ini, data_fim, numero_pedido } = req.query;
    let query = `SELECT p.*, s.nome as separador_nome FROM pedidos p LEFT JOIN separadores s ON p.separador_id=s.id WHERE 1=1`;
    const params = [];
    if (separador_id) { query += ' AND p.separador_id=?'; params.push(separador_id); }
    if (status) { query += ' AND p.status=?'; params.push(status); }
    if (data) { query += ' AND p.data_pedido=?'; params.push(data); }
    if (data_ini) { query += ' AND p.data_pedido>=?'; params.push(data_ini); }
    if (data_fim) { query += ' AND p.data_pedido<=?'; params.push(data_fim); }
    if (numero_pedido) { query += ' AND p.numero_pedido=?'; params.push(numero_pedido); }
    query += ' ORDER BY p.data_pedido DESC, p.hora_pedido DESC';
    res.json(await dbAll(query, params));
  } catch(err) { res.status(500).json({ erro: err.message }); }
});
app.post('/pedidos', async (req,res)=> {
  const { numero_pedido, separador_id, status, itens, rua, data_pedido, hora_pedido } = req.body;
  const { data, hora } = dataHoraLocal();
  try {
    const result = await dbRun('INSERT INTO pedidos (numero_pedido,separador_id,status,itens,rua,data_pedido,hora_pedido) VALUES (?,?,?,?,?,?,?)',
      [numero_pedido, separador_id||null, status||'pendente', itens||0, rua||'', data_pedido||data, hora_pedido||hora]);
    res.json({ id: result.lastID, mensagem:'Pedido cadastrado!' });
  } catch(err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ erro:'Pedido já cadastrado!' });
    res.status(500).json({ erro: err.message });
  }
});
app.put('/pedidos/:id/status', (req,res)=> db.run('UPDATE pedidos SET status=? WHERE id=?',[req.body.status, req.params.id], err=> err ? res.status(500).json({ erro: err.message }) : res.json({ mensagem:'Status atualizado!' })));
app.put('/pedidos/:id/separador', (req,res)=> db.run('UPDATE pedidos SET separador_id=? WHERE id=?',[req.body.separador_id, req.params.id], err=> err ? res.status(500).json({ erro: err.message }) : res.json({ mensagem:'Separador atribuído!' })));

app.put('/pedidos/:id/caixa', async (req, res) => {
  const numero_caixa = String(req.body.numero_caixa || '').trim();
  if (!numero_caixa) return res.status(400).json({ erro:'Número da caixa não informado!' });
  try {
    const pedido = await dbGet(`SELECT p.*, s.nome as sep_nome FROM pedidos p LEFT JOIN separadores s ON p.separador_id=s.id WHERE p.id=?`, [req.params.id]);
    if (!pedido) return res.status(404).json({ erro:'Pedido não encontrado!' });
    const emUso = await dbGet(`SELECT id, numero_pedido FROM checkout WHERE numero_caixa=? AND status='pendente' AND pedido_id<>? ORDER BY id DESC LIMIT 1`, [numero_caixa, req.params.id]);
    if (emUso) return res.status(409).json({ erro:`A caixa ${numero_caixa} já está no pedido ${emUso.numero_pedido}.` });
    const emOutroPedido = await dbGet(`SELECT id, numero_pedido FROM pedidos WHERE numero_caixa=? AND id<>? AND status<>'concluido'`, [numero_caixa, req.params.id]);
    if (emOutroPedido) return res.status(409).json({ erro:`A caixa ${numero_caixa} já está em uso no pedido ${emOutroPedido.numero_pedido}.` });
    await dbRun('UPDATE pedidos SET numero_caixa=? WHERE id=?', [numero_caixa, req.params.id]);
    const ja = await dbGet('SELECT id FROM checkout WHERE pedido_id=?', [req.params.id]);
    const { data, hora } = dataHoraLocal();
    if (ja) {
      await dbRun(`UPDATE checkout SET numero_caixa=?, separador_nome=?, status='pendente', hora_checkout=NULL, data_checkout=NULL WHERE pedido_id=?`, [numero_caixa, pedido.sep_nome || '', req.params.id]);
    } else {
      await dbRun(`INSERT INTO checkout (numero_caixa,pedido_id,numero_pedido,separador_nome,status,hora_criacao,data_checkout) VALUES (?,?,?,?, 'pendente', ?, ?)`, [numero_caixa, req.params.id, pedido.numero_pedido, pedido.sep_nome || '', hora, data]);
    }
    res.json({ mensagem:'Caixa vinculada!', pedido_id:req.params.id, numero_pedido:pedido.numero_pedido, numero_caixa });
  } catch(err) { res.status(500).json({ erro: err.message }); }
});

app.post('/pedidos/bipar', async (req, res) => {
  const { numero_pedido, separador_id } = req.body;
  if (!numero_pedido) return res.status(400).json({ erro:'Número do pedido não informado!' });
  try {
    const pedido = await dbGet('SELECT * FROM pedidos WHERE numero_pedido=?', [numero_pedido]);
    if (!pedido) return res.status(404).json({ erro:'Pedido não encontrado!' });
    if (pedido.status === 'concluido') return res.status(400).json({ erro:'Pedido já concluído!', status:'concluido' });
    if (separador_id && pedido.separador_id && String(pedido.separador_id) !== String(separador_id) && pedido.status === 'separando') return res.status(409).json({ erro:'Pedido sendo separado por outro operador!' });
    const { hora } = dataHoraLocal();
    await dbRun(`UPDATE pedidos SET separador_id=?, status='separando', hora_pedido=? WHERE id=?`, [separador_id || pedido.separador_id || null, hora, pedido.id]);
    res.json({ mensagem:'Pedido atribuído!', pedido_id:pedido.id, status:'separando' });
  } catch(err) { res.status(500).json({ erro: err.message }); }
});
app.get('/pedidos/:id/itens', async (req,res)=> {
  try { res.json(await dbAll(`SELECT i.*, COALESCE((SELECT a.status FROM avisos_repositor a WHERE a.item_id=i.id ORDER BY a.id DESC LIMIT 1),'') as aviso_status FROM itens_pedido i WHERE i.pedido_id=? ORDER BY i.id`, [req.params.id])); }
  catch(err){ res.status(500).json({ erro: err.message }); }
});
app.put('/itens/:id/verificar', async (req,res)=> {
  const { status, obs, qtd_falta, separador_id, separador_nome } = req.body;
  const { data, hora } = dataHoraLocal();
  try {
    const item = await dbGet(`SELECT i.*, p.numero_pedido FROM itens_pedido i JOIN pedidos p ON i.pedido_id=p.id WHERE i.id=?`, [req.params.id]);
    if (!item) return res.status(404).json({ erro:'Item não encontrado!' });
    const obsTexto = obs || '';
    const qtdFaltou = parseInt(qtd_falta) || 0;
    await dbRun('UPDATE itens_pedido SET status=?, obs=?, qtd_falta=?, hora_verificado=? WHERE id=?', [status, obsTexto, qtdFaltou, hora, req.params.id]);
    if (status === 'falta' || status === 'parcial') {
      const qtdAviso = status === 'falta' ? item.quantidade : qtdFaltou;
      const obsAviso = status === 'parcial' ? obsTexto : `Falta total - ${item.quantidade} unidade(s)`;
      const existente = await dbGet(`SELECT id FROM avisos_repositor WHERE item_id=? AND status='pendente'`, [item.id]);
      if (existente) {
        await dbRun(`UPDATE avisos_repositor SET quantidade=?, obs=?, hora_aviso=? WHERE id=?`, [qtdAviso, obsAviso, hora, existente.id]);
      } else {
        await dbRun(`INSERT INTO avisos_repositor (item_id,pedido_id,numero_pedido,separador_id,separador_nome,codigo,descricao,endereco,quantidade,obs,status,hora_aviso,data_aviso) VALUES (?,?,?,?,?,?,?,?,?,?,'pendente',?,?)`, [item.id,item.pedido_id,item.numero_pedido,separador_id,separador_nome,item.codigo,item.descricao,item.endereco,qtdAviso,obsAviso,hora,data]);
      }
      return res.json({ mensagem:'Repositor avisado!', aviso:true });
    }
    res.json({ mensagem:'Item verificado!', aviso:false });
  } catch(err) { res.status(500).json({ erro: err.message }); }
});
app.put('/pedidos/:id/concluir', async (req,res)=> {
  try {
    const pendentes = await dbAll(`SELECT * FROM itens_pedido WHERE pedido_id=? AND status='pendente'`, [req.params.id]);
    if (pendentes.length) return res.status(400).json({ erro:`Ainda há ${pendentes.length} item(s) não verificado(s)!` });
    const avisos = await dbAll(`SELECT * FROM avisos_repositor WHERE pedido_id=? AND status='pendente'`, [req.params.id]);
    if (avisos.length) return res.status(400).json({ erro:`Aguardando repositor resolver ${avisos.length} item(s)!`, aguardando:true });
    await dbRun(`UPDATE pedidos SET status='concluido' WHERE id=?`, [req.params.id]);
    res.json({ mensagem:'Pedido concluído!' });
  } catch(err) { res.status(500).json({ erro: err.message }); }
});

app.get('/repositor/buscar-produto', async (req,res)=> {
  const { codigo } = req.query;
  if (!codigo) return res.status(400).json({ erro:'Código não informado!' });
  try {
    res.json(await dbAll(`SELECT i.*, p.numero_pedido, p.status as pedido_status, COALESCE((SELECT a.status FROM avisos_repositor a WHERE a.item_id=i.id ORDER BY a.id DESC LIMIT 1),'') as aviso_status FROM itens_pedido i JOIN pedidos p ON i.pedido_id=p.id WHERE i.codigo LIKE ? AND p.status!='concluido' ORDER BY p.numero_pedido`, [`%${String(codigo).trim()}%`]));
  } catch(err) { res.status(500).json({ erro: err.message }); }
});
app.get('/repositor/duplicatas', async (req,res)=> { try { res.json(await dbAll(`SELECT i.codigo, i.descricao, COUNT(DISTINCT i.pedido_id) as total_pedidos, GROUP_CONCAT(p.numero_pedido, ', ') as pedidos FROM itens_pedido i JOIN pedidos p ON i.pedido_id=p.id JOIN avisos_repositor a ON a.item_id=i.id WHERE a.status='pendente' GROUP BY i.codigo HAVING COUNT(DISTINCT i.pedido_id) > 1`)); } catch(err){ res.status(500).json({ erro: err.message }); } });
app.get('/repositor/avisos', async (req,res)=> {
  const { status, data } = req.query;
  try {
    let query = 'SELECT * FROM avisos_repositor WHERE 1=1'; const params=[];
    if (status) { query += ' AND status=?'; params.push(status); }
    if (data) { query += ' AND data_aviso=?'; params.push(data); }
    query += ' ORDER BY id DESC';
    res.json(await dbAll(query, params));
  } catch(err) { res.status(500).json({ erro: err.message }); }
});
app.put('/repositor/avisos/:id/reposto', (req,res)=> { const { hora } = dataHoraLocal(); const { qtd_encontrada, repositor_nome } = req.body || {}; db.run(`UPDATE avisos_repositor SET status='reposto',hora_reposto=?,qtd_encontrada=?,repositor_nome=? WHERE id=?`, [hora, parseInt(qtd_encontrada)||0, repositor_nome||'', req.params.id], err => err ? res.status(500).json({ erro: err.message }) : res.json({ mensagem:'Item reposto!' })); });
app.put('/repositor/avisos/:id/nao_encontrado', (req,res)=> { const { hora } = dataHoraLocal(); const { repositor_nome } = req.body || {}; db.run(`UPDATE avisos_repositor SET status='nao_encontrado',hora_reposto=?,repositor_nome=? WHERE id=?`, [hora, repositor_nome||'', req.params.id], err => err ? res.status(500).json({ erro: err.message }) : res.json({ mensagem:'Marcado como não encontrado!' })); });
app.put('/repositor/avisos/:id/protocolo', (req,res)=> { const { hora } = dataHoraLocal(); const { repositor_nome } = req.body || {}; db.run(`UPDATE avisos_repositor SET status='protocolo',hora_reposto=?,repositor_nome=? WHERE id=?`, [hora, repositor_nome||'', req.params.id], err => err ? res.status(500).json({ erro: err.message }) : res.json({ mensagem:'Enviado para protocolo!' })); });

app.get('/protocolo', async (req,res)=> {
  const { status='', dataini='', datafim='' } = req.query;
  try {
    let sql = `SELECT id,item_id,pedido_id,numero_pedido,codigo,descricao,quantidade,obs,status,hora_aviso,hora_reposto,data_aviso,repositor_nome FROM avisos_repositor WHERE 1=1`;
    const params = [];
    if (status) { sql += ` AND status=?`; params.push(status); }
    if (dataini) { sql += ` AND data_aviso>=?`; params.push(dataini); }
    if (datafim) { sql += ` AND data_aviso<=?`; params.push(datafim); }
    sql += ` ORDER BY id DESC`;
    res.json(await dbAll(sql, params));
  } catch(err) { res.status(500).json({ erro: err.message }); }
});
app.put('/supervisor/protocolo/:id/liberar', async (req,res)=> {
  try { await dbRun(`UPDATE avisos_repositor SET status='nao_encontrado' WHERE id=?`, [req.params.id]); res.json({ mensagem:'Pedido liberado pelo supervisor!' }); }
  catch(err){ res.status(500).json({ erro: err.message }); }
});

app.get('/checkout/caixa/:numero', async (req,res)=> {
  try {
    const numero = String(req.params.numero).trim();
    const rows = await dbAll(`SELECT c.*, p.status as ped_status, p.itens as ped_itens, p.numero_caixa, s.nome as sep_nome FROM checkout c JOIN pedidos p ON c.pedido_id=p.id LEFT JOIN separadores s ON p.separador_id=s.id WHERE c.numero_caixa=? ORDER BY c.id DESC`, [numero]);
    const result = [];
    for (const row of rows) {
      const itens = await dbAll(`SELECT codigo, descricao, endereco, quantidade, status FROM itens_pedido WHERE pedido_id=? ORDER BY id`, [row.pedido_id]);
      result.push({ ...row, itens_lista: itens });
    }
    res.json(result);
  } catch(err) { res.status(500).json({ erro: err.message }); }
});
app.get('/checkout/pedido/:numero', async (req,res)=> {
  const numero = String(req.params.numero).trim();
  try {
    const row = await dbGet(`SELECT c.*, p.numero_caixa FROM checkout c JOIN pedidos p ON c.pedido_id=p.id WHERE c.numero_pedido=? ORDER BY c.id DESC LIMIT 1`, [numero]);
    if (row) return res.json(row);
    const ped = await dbGet(`SELECT id,numero_pedido,numero_caixa,status FROM pedidos WHERE numero_pedido=?`, [numero]);
    if (!ped) return res.status(404).json({ erro:'Pedido não encontrado!' });
    return res.json(ped.numero_caixa ? { numero_pedido:ped.numero_pedido, numero_caixa:ped.numero_caixa, status:'pendente', pedido_status:ped.status } : null);
  } catch(err) { res.status(500).json({ erro: err.message }); }
});
app.put('/checkout/:id/confirmar', async (req,res)=> {
  const { hora, data } = dataHoraLocal();
  try {
    const checkout = await dbGet(`SELECT * FROM checkout WHERE id=?`, [req.params.id]);
    if (!checkout) return res.status(404).json({ erro:'Checkout não encontrado!' });
    await dbRun(`UPDATE checkout SET status='concluido',hora_checkout=?,data_checkout=? WHERE id=?`, [hora, data, req.params.id]);
    await dbRun(`UPDATE pedidos SET numero_caixa='' WHERE id=?`, [checkout.pedido_id]);
    res.json({ mensagem:'Checkout confirmado e caixa liberada!' });
  } catch(err) { res.status(500).json({ erro: err.message }); }
});
app.get('/checkout', async (req,res)=> {
  const { status, data_ini, data_fim } = req.query;
  try {
    let query = `SELECT c.*, p.numero_caixa FROM checkout c JOIN pedidos p ON c.pedido_id=p.id WHERE 1=1`; const params=[];
    if (status) { query += ' AND c.status=?'; params.push(status); }
    if (data_ini) { query += ' AND c.data_checkout>=?'; params.push(data_ini); }
    if (data_fim) { query += ' AND c.data_checkout<=?'; params.push(data_fim); }
    query += ' ORDER BY c.id DESC';
    res.json(await dbAll(query, params));
  } catch(err){ res.status(500).json({ erro: err.message }); }
});

app.post('/importar', async (req,res)=> {
  const { linhas } = req.body;
  if (!linhas || !linhas.length) return res.status(400).json({ erro:'Nenhuma linha enviada!' });
  const { data: hoje, hora } = dataHoraLocal();
  const pedidosMap = {};
  linhas.forEach(l => {
    const num = String(l.numero_pedido || '').trim();
    if (!num) return;
    if (!pedidosMap[num]) pedidosMap[num] = [];
    pedidosMap[num].push(l);
  });
  const numeros = Object.keys(pedidosMap);
  let importados = 0, ignorados = 0, erros = 0;
  for (const numero of numeros) {
    const itens = pedidosMap[numero];
    try {
      const result = await dbRun(`INSERT OR IGNORE INTO pedidos (numero_pedido,status,itens,rua,data_pedido,hora_pedido) VALUES (?, 'pendente', ?, ?, ?, ?)`, [numero, itens.length, itens[0]?.endereco || '', hoje, hora]);
      const foiNovo = result.changes > 0;
      const pedido = await dbGet(`SELECT id FROM pedidos WHERE numero_pedido=?`, [numero]);
      if (!pedido) { erros++; continue; }
      if (!foiNovo) { ignorados++; continue; }
      for (const item of itens) {
        await dbRun(`INSERT INTO itens_pedido (pedido_id,codigo,descricao,endereco,quantidade) VALUES (?,?,?,?,?)`, [pedido.id, String(item.codigo||'').trim(), String(item.descricao||'').trim(), String(item.endereco||'').trim(), parseInt(item.quantidade)||1]);
      }
      importados++;
    } catch(err) { console.error(err.message); erros++; }
  }
  res.json({ mensagem:'Importação concluída!', importados, ignorados, erros, total:numeros.length });
});

app.get('/produtividade', async (req,res)=> {
  const { separador_id } = req.query;
  const { data: dataHoje } = dataHoraLocal();
  const mesAtual = dataHoje.substring(0,7);
  try {
    let query = `SELECT s.id, s.nome, s.matricula, s.status, SUM(CASE WHEN p.data_pedido=? THEN 1 ELSE 0 END) as hoje, SUM(CASE WHEN substr(p.data_pedido,1,7)=? THEN 1 ELSE 0 END) as mes, COUNT(p.id) as total_ano, COALESCE(SUM(p.pontuacao),0) as pontuacao_total FROM separadores s LEFT JOIN pedidos p ON p.separador_id=s.id AND p.status='concluido' WHERE 1=1`;
    const params = [dataHoje, mesAtual];
    if (separador_id) { query += ' AND s.id=?'; params.push(separador_id); }
    query += ' GROUP BY s.id ORDER BY s.nome';
    res.json(await dbAll(query, params));
  } catch(err){ res.status(500).json({ erro: err.message }); }
});
app.get('/estatisticas/pedidos', async (req,res)=> {
  const { data_ini, data_fim } = req.query;
  const { data: dataHoje } = dataHoraLocal();
  const mesAtual = dataHoje.substring(0,7);
  const anoAtual = dataHoje.substring(0,4);
  try {
    const row = await dbGet(`SELECT SUM(CASE WHEN data_pedido=? AND status='concluido' THEN 1 ELSE 0 END) as concluidos_hoje, SUM(CASE WHEN data_pedido=? THEN 1 ELSE 0 END) as total_hoje, SUM(CASE WHEN substr(data_pedido,1,7)=? AND status='concluido' THEN 1 ELSE 0 END) as concluidos_mes, SUM(CASE WHEN substr(data_pedido,1,7)=? THEN 1 ELSE 0 END) as total_mes, SUM(CASE WHEN substr(data_pedido,1,4)=? AND status='concluido' THEN 1 ELSE 0 END) as concluidos_ano, SUM(CASE WHEN substr(data_pedido,1,4)=? THEN 1 ELSE 0 END) as total_ano FROM pedidos`, [dataHoje,dataHoje,mesAtual,mesAtual,anoAtual,anoAtual]);
    if (data_ini && data_fim) {
      const row2 = await dbGet(`SELECT COUNT(*) as total_periodo, SUM(CASE WHEN status='concluido' THEN 1 ELSE 0 END) as concluidos_periodo FROM pedidos WHERE data_pedido>=? AND data_pedido<=?`, [data_ini,data_fim]);
      return res.json({ ...row, ...row2 });
    }
    res.json(row);
  } catch(err){ res.status(500).json({ erro: err.message }); }
});
app.get('/ranking/separadores', async (req,res)=> {
  try {
    res.json(await dbAll(`SELECT s.id, s.nome, COUNT(CASE WHEN p.status='concluido' THEN 1 END) AS pedidos, COALESCE(SUM(CASE WHEN p.status='concluido' THEN p.itens ELSE 0 END),0) AS itens, ROUND(AVG(CASE WHEN p.status='concluido' AND p.hora_pedido IS NOT NULL THEN 1 ELSE NULL END),2) AS tempo_medio FROM separadores s LEFT JOIN pedidos p ON p.separador_id=s.id GROUP BY s.id, s.nome ORDER BY pedidos DESC, itens DESC, s.nome`));
  } catch(err){ res.status(500).json({ erro: err.message }); }
});
app.get('/estatisticas/horas', async (req,res)=> {
  try {
    res.json(await dbAll(`SELECT substr(COALESCE(hora_pedido,'00:00'),1,2) as hora, COUNT(*) as total FROM pedidos WHERE status='concluido' GROUP BY substr(COALESCE(hora_pedido,'00:00'),1,2) ORDER BY hora`));
  } catch(err){ res.status(500).json({ erro: err.message }); }
});

app.listen(PORT, () => {
  console.log(`Servidor WMS rodando na porta ${PORT}`);
  const { data, hora } = dataHoraLocal();
  console.log(`Data/hora local: ${data} ${hora}`);
});
