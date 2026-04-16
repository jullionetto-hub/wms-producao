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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
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

// ── Banco ───────────────────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'wms.db');
const db = new sqlite3.Database(DB_PATH, err => {
  if (err) console.error(err.message);
  else console.log('Banco conectado em:', DB_PATH);
});
db.run('PRAGMA journal_mode=WAL');

// ── Helpers Promise ──────────────────────────────────────────────────────────
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

// ── Data/hora local — sempre America/Sao_Paulo ───────────────────────────────
function dataHoraLocal() {
  const agora   = new Date();
  const opcData = { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' };
  const opcHora = { timeZone:'America/Sao_Paulo', hour:'2-digit', minute:'2-digit', hour12:false };
  const partes  = agora.toLocaleDateString('pt-BR', opcData).split('/');   // DD/MM/YYYY
  const dataISO = `${partes[2]}-${partes[1]}-${partes[0]}`;                // YYYY-MM-DD
  const hora    = agora.toLocaleTimeString('pt-BR', opcHora);               // HH:MM
  return { data: dataISO, hora };
}

// ── Tabelas ──────────────────────────────────────────────────────────────────
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
    cliente TEXT DEFAULT '',
    transportadora TEXT DEFAULT '',
    aguardando_desde TEXT DEFAULT '',
    data_pedido TEXT,
    hora_pedido TEXT,
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (separador_id) REFERENCES separadores(id)
  )`);
  db.run(`ALTER TABLE pedidos ADD COLUMN numero_caixa TEXT DEFAULT ''`, () => {});
  db.run(`ALTER TABLE pedidos ADD COLUMN cliente TEXT DEFAULT ''`, () => {});
  db.run(`ALTER TABLE pedidos ADD COLUMN transportadora TEXT DEFAULT ''`, () => {});
  db.run(`ALTER TABLE pedidos ADD COLUMN aguardando_desde TEXT DEFAULT ''`, () => {});

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
  db.run(`ALTER TABLE itens_pedido ADD COLUMN obs TEXT DEFAULT ''`, () => {});
  db.run(`ALTER TABLE itens_pedido ADD COLUMN qtd_falta INTEGER DEFAULT 0`, () => {});

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

  db.run(`CREATE INDEX IF NOT EXISTS idx_pedidos_sep    ON pedidos(separador_id, status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_pedidos_num    ON pedidos(numero_pedido)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_itens_pedido   ON itens_pedido(pedido_id)`);
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
}
criarUsuarioPadrao();

// ─── AUTH ────────────────────────────────────────────────────────────────────
app.post('/auth/login', (req, res) => {
  const { login, senha, perfil } = req.body;
  if (!login || !senha || !perfil) return res.status(400).json({ erro:'Dados incompletos!' });
  
  const hash = hashSenha(senha);
  const perfisValidos = ['supervisor','separador','repositor','checkout'];
  if (!perfisValidos.includes(perfil)) return res.status(400).json({ erro:'Perfil inválido!' });

  // Busca usuário SEM filtrar por perfil — só login+senha
  db.get(`SELECT * FROM usuarios WHERE login=? AND senha_hash=? AND status='ativo'`,
    [login, hash], (err, user) => {
      if (err)   return res.status(500).json({ erro: err.message });
      if (!user) return res.status(401).json({ erro:'Login ou senha incorretos!' });

      const permitidos = perfisPermitidos(user);
      if (!permitidos.includes(perfil)) {
        return res.status(403).json({ erro:'Este colaborador nao pode acessar este perfil!' });
      }

      const perfilSessao = perfil; // perfil escolhido na tela

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
app.get('/auth/me', (req, res) => {
  if (!req.session.usuario) return res.status(401).json({ erro:'Nao autenticado' });
  res.json({ usuario: req.session.usuario, separador: req.session.separador || null });
});

// ─── USUÁRIOS ────────────────────────────────────────────────────────────────
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

app.post('/usuarios', (req, res) => {
  const { nome, login, senha, perfil, subtipo_repositor, turno, perfis_acesso } = req.body;
  if (!nome||!login||!senha||!perfil) return res.status(400).json({ erro:'Preencha todos os campos!' });
  const hash = hashSenha(senha);
  const extras = Array.isArray(perfis_acesso)
    ? perfis_acesso.filter(Boolean).filter(p => p !== perfil).join(',')
    : String(perfis_acesso || '');
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

app.put('/usuarios/:id', (req, res) => {
  const { nome, login, senha, perfil, subtipo_repositor, turno, status, perfis_acesso } = req.body;
  
  let extrasString = null;
  if (Array.isArray(perfis_acesso)) {
    extrasString = perfis_acesso.filter(Boolean).filter(p => p !== perfil).join(',');
  } else if (typeof perfis_acesso === 'string') {
    extrasString = perfis_acesso;
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

  if (extrasString !== null) {
    sql += `,perfis_acesso=?`;
    params.push(extrasString);
  }

  sql += ` WHERE id=?`;
  params.push(req.params.id);

  db.run(sql, params, err => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json({ mensagem:'Atualizado!' });
  });
});

app.delete('/usuarios/:id', (req, res) => {
  db.run('DELETE FROM usuarios WHERE id=?', [req.params.id], err => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json({ mensagem:'Excluido!' });
  });
});

// ─── SEPARADORES ─────────────────────────────────────────────────────────────
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

// ─── PEDIDOS ─────────────────────────────────────────────────────────────────
app.get('/pedidos', (req, res) => {
  const { separador_id, status, data, data_ini, data_fim, numero_pedido } = req.query;
  let query = `SELECT p.*, s.nome as separador_nome, p.cliente, p.transportadora, p.aguardando_desde
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

app.post('/pedidos', (req, res) => {
  const { numero_pedido, separador_id, status, itens, rua, data_pedido, hora_pedido } = req.body;
  const { data: dataLocal, hora: horaLocal } = dataHoraLocal();
  db.run('INSERT INTO pedidos (numero_pedido,separador_id,status,itens,rua,data_pedido,hora_pedido) VALUES (?,?,?,?,?,?,?)',
    [numero_pedido, separador_id||null, status||'pendente', itens||0, rua||'', data_pedido||dataLocal, hora_pedido||horaLocal],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(409).json({ erro:'Pedido ja cadastrado!' });
        return res.status(500).json({ erro: err.message });
      }
      res.json({ id: this.lastID, mensagem:'Pedido cadastrado!' });
    });
});

app.put('/pedidos/:id/status', (req, res) => {
  const { status } = req.body;
  db.run('UPDATE pedidos SET status=? WHERE id=?', [status, req.params.id], err => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json({ mensagem:'Status atualizado!' });
  });
});

app.put('/pedidos/:id/separador', (req, res) => {
  const { separador_id } = req.body;
  db.run('UPDATE pedidos SET separador_id=? WHERE id=?', [separador_id, req.params.id], err => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json({ mensagem:'Separador atribuido!' });
  });
});

// Vincular número de caixa ao pedido
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
db.run(`INSERT INTO checkout (numero_caixa,pedido_id,numero_pedido,separador_nome,status,hora_criacao,data_checkout)
VALUES (?,?,?,?,'pendente',?,?)`,
[caixa, req.params.id, ped.numero_pedido, sepNome, hora, data], () => {});
}
res.json({ mensagem:'Caixa vinculada!', pedido_id: req.params.id, numero_pedido: ped.numero_pedido });
});
});
});
});
});
});

// Bipar pedido — SEM necessidade de separador vinculado
app.post('/pedidos/bipar', (req, res) => {
  const { numero_pedido, separador_id } = req.body;
  if (!numero_pedido) return res.status(400).json({ erro:'Numero do pedido nao informado!' });

  db.get('SELECT * FROM pedidos WHERE numero_pedido=?', [numero_pedido], (err, pedido) => {
    if (err)     return res.status(500).json({ erro: err.message });
    if (!pedido) return res.status(404).json({ erro:'Pedido nao encontrado!' });
    if (pedido.status === 'concluido')
      return res.status(400).json({ erro:'Pedido ja concluido!', status:'concluido' });

    if (separador_id && pedido.separador_id && String(pedido.separador_id) === String(separador_id))
      return res.json({ mensagem:'Pedido ja atribuido.', pedido_id:pedido.id, status:pedido.status, ja_atribuido:true });

    if (separador_id && pedido.separador_id && String(pedido.separador_id) !== String(separador_id) && pedido.status === 'separando')
      return res.status(409).json({ erro:'Pedido sendo separado por outro operador!' });

    const sepId = separador_id || pedido.separador_id || null;
    // hora_pedido NÃO é atualizada aqui — já foi fixada na importação
    db.run(`UPDATE pedidos SET separador_id=?, status='separando' WHERE id=?`,
      [sepId, pedido.id], function(err2) {
        if (err2) return res.status(500).json({ erro: err2.message });
        res.json({ mensagem:'Pedido atribuido!', pedido_id:pedido.id, status:'separando' });
      });
  });
});

app.get('/pedidos/:id/itens', (req, res) => {
  db.all(`SELECT i.*,
     COALESCE(
       (SELECT a.status FROM avisos_repositor a WHERE a.item_id=i.id ORDER BY a.id DESC LIMIT 1),
       ''
     ) as aviso_status
   FROM itens_pedido i WHERE i.pedido_id=? ORDER BY i.id`,
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
  db.all(`SELECT * FROM itens_pedido WHERE pedido_id=? AND status='pendente'`, [req.params.id], (err, pendentes) => {
    if (err) return res.status(500).json({ erro: err.message });
    if (pendentes.length > 0)
      return res.status(400).json({ erro:`Ainda ha ${pendentes.length} item(s) nao verificado(s)!` });
    db.all(`SELECT * FROM avisos_repositor WHERE pedido_id=? AND status='pendente'`, [req.params.id], (err2, avisosPendentes) => {
      if (err2) return res.status(500).json({ erro: err2.message });
      if (avisosPendentes.length > 0)
        return res.status(400).json({ erro:`Aguardando repositor resolver ${avisosPendentes.length} item(s)!`, aguardando:true });
      // Bloquear se há itens nao_encontrado ou protocolo sem liberação do supervisor
      db.all(`SELECT * FROM avisos_repositor WHERE pedido_id=? AND status IN ('nao_encontrado','protocolo')`, [req.params.id], (err3, bloqueados) => {
        if (err3) return res.status(500).json({ erro: err3.message });
        if (bloqueados.length > 0)
          return res.status(400).json({
            erro:`Pedido bloqueado! ${bloqueados.length} item(s) com nao encontrado/protocolo aguardam liberacao do supervisor!`,
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

app.put('/repositor/avisos/:id/reposto', (req, res) => {
  const { hora } = dataHoraLocal();
  const { qtd_encontrada, repositor_nome } = req.body || {};
  db.run('UPDATE avisos_repositor SET status="encontrado",hora_reposto=?,qtd_encontrada=?,repositor_nome=? WHERE id=?',
    [hora, parseInt(qtd_encontrada)||0, repositor_nome||'', req.params.id], err => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json({ mensagem:'Item encontrado!' });
    });
});

app.put('/repositor/avisos/:id/encontrado', (req, res) => {
  const { hora } = dataHoraLocal();
  const { qtd_encontrada, repositor_nome } = req.body || {};
  db.run('UPDATE avisos_repositor SET status="encontrado",hora_reposto=?,qtd_encontrada=?,repositor_nome=? WHERE id=?',
    [hora, parseInt(qtd_encontrada)||0, repositor_nome||'', req.params.id], err => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json({ mensagem:'Item encontrado!' });
    });
});

app.put('/repositor/avisos/:id/subiu', (req, res) => {
  const { hora } = dataHoraLocal();
  const { qtd_encontrada, repositor_nome } = req.body || {};
  db.run('UPDATE avisos_repositor SET status="subiu",hora_reposto=?,qtd_encontrada=?,repositor_nome=? WHERE id=?',
    [hora, parseInt(qtd_encontrada)||0, repositor_nome||'', req.params.id], err => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json({ mensagem:'Item subiu para o estoque!' });
    });
});

app.put('/repositor/avisos/:id/abastecido', (req, res) => {
  const { hora } = dataHoraLocal();
  const { qtd_encontrada, repositor_nome } = req.body || {};
  db.run('UPDATE avisos_repositor SET status="abastecido",hora_reposto=?,qtd_encontrada=?,repositor_nome=? WHERE id=?',
    [hora, parseInt(qtd_encontrada)||0, repositor_nome||'', req.params.id], err => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json({ mensagem:'Estoque abastecido!' });
    });
});

app.put('/repositor/avisos/:id/nao_encontrado', (req, res) => {
  const { hora } = dataHoraLocal();
  const { repositor_nome } = req.body || {};
  db.run('UPDATE avisos_repositor SET status="nao_encontrado",hora_reposto=?,repositor_nome=? WHERE id=?',
    [hora, repositor_nome||'', req.params.id], err => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json({ mensagem:'Marcado como nao encontrado!' });
    });
});

app.put('/repositor/avisos/:id/protocolo', (req, res) => {
  const { hora } = dataHoraLocal();
  const { repositor_nome } = req.body || {};
  db.run('UPDATE avisos_repositor SET status="protocolo",hora_reposto=?,repositor_nome=? WHERE id=?',
    [hora, repositor_nome||'', req.params.id], err => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json({ mensagem:'Enviado para analise de protocolo!' });
    });
});

// Avisos para o separador — itens com status subiu/abastecido do seu pedido
app.get('/repositor/avisos/separador/:separador_id', (req, res) => {
  const { data: dataHoje } = dataHoraLocal();
  db.all(`SELECT a.* FROM avisos_repositor a
    WHERE a.separador_id=? AND a.status IN ('subiu','abastecido') AND a.data_aviso=?
    ORDER BY a.id DESC`,
    [req.params.separador_id, dataHoje], (err, rows) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json(rows || []);
    });
});

// Duplicatas no dia — mesmo código com aviso em mais de um pedido hoje
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

// ─── CHECKOUT ────────────────────────────────────────────────────────────────
app.get('/checkout/caixa/:numero', async (req, res) => {
  const numero = String(req.params.numero).trim();
  try {
    const rows = await new Promise((resolve, reject) => {
      db.all(`SELECT c.*, p.status as ped_status, p.itens as ped_itens, p.numero_caixa,
         s.nome as sep_nome
       FROM checkout c JOIN pedidos p ON c.pedido_id=p.id
       LEFT JOIN separadores s ON p.separador_id=s.id
       WHERE c.numero_caixa=? ORDER BY c.id DESC`,
        [numero], (err, r) => { if (err) reject(err); else resolve(r); });
    });
    // Para cada checkout busca os itens do pedido
    const result = [];
    for (const row of rows) {
      const itens = await new Promise((resolve, reject) => {
        db.all(`SELECT codigo, descricao, endereco, quantidade, status FROM itens_pedido WHERE pedido_id=? ORDER BY id`,
          [row.pedido_id], (err, r) => { if (err) reject(err); else resolve(r); });
      });
      result.push({ ...row, itens_lista: itens });
    }
    res.json(result);
  } catch(err) {
    res.status(500).json({ erro: err.message });
  }
});

app.get('/checkout/pedido/:numero', (req, res) => {
  const numero = String(req.params.numero).trim();
  db.get(`SELECT c.*, p.numero_caixa FROM checkout c JOIN pedidos p ON c.pedido_id=p.id
   WHERE c.numero_pedido=? ORDER BY c.id DESC LIMIT 1`, [numero], (err, row) => {
    if (err) return res.status(500).json({ erro: err.message });
    if (!row) {
      db.get('SELECT id,numero_pedido,numero_caixa,status FROM pedidos WHERE numero_pedido=?', [numero], (err2, ped) => {
        if (err2||!ped) return res.status(404).json({ erro:'Pedido nao encontrado!' });
        res.json(ped.numero_caixa
          ? { numero_pedido:ped.numero_pedido, numero_caixa:ped.numero_caixa, status:'pendente', pedido_status:ped.status }
          : null);
      });
      return;
    }
    res.json(row);
  });
});

app.put('/checkout/:id/confirmar', (req, res) => {
  const { hora, data } = dataHoraLocal();
  db.run('UPDATE checkout SET status="concluido",hora_checkout=?,data_checkout=? WHERE id=?',
    [hora, data, req.params.id], err => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json({ mensagem:'Checkout confirmado!' });
    });
});

// Liberar caixa — zera numero_caixa do pedido e remove checkout pendente
app.put('/checkout/:id/liberar', (req, res) => {
  const { hora, data } = dataHoraLocal();
  db.get('SELECT * FROM checkout WHERE id=?', [req.params.id], (err, ck) => {
    if (err || !ck) return res.status(404).json({ erro:'Checkout nao encontrado!' });
    db.run("UPDATE checkout SET status='liberado', hora_checkout=?, data_checkout=? WHERE id=?",
      [hora, data, req.params.id], err2 => {
        if (err2) return res.status(500).json({ erro: err2.message });
        // Limpa numero_caixa do pedido para liberar a caixa
        db.run("UPDATE pedidos SET numero_caixa='' WHERE id=?", [ck.pedido_id], () => {});
        res.json({ mensagem:'Caixa liberada!' });
      });
  });
});

// Pedidos bloqueados por nao_encontrado/protocolo — supervisor desbloqueia
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

app.put('/pedidos/:id/desbloquear', (req, res) => {
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

// ─── IMPORTAÇÃO ───────────────────────────────────────────────────────────────
app.post('/importar', async (req, res) => {
  const { linhas } = req.body;
  if (!linhas || !linhas.length)
    return res.status(400).json({ erro: 'Nenhuma linha enviada!' });

  const { data: hoje, hora } = dataHoraLocal();
  const pedidosMap = {};
  linhas.forEach(l => {
    const num = String(l.numero_pedido || '').trim();
    if (!num) return;
    if (!pedidosMap[num]) pedidosMap[num] = [];
    pedidosMap[num].push(l);
  });

  const numeros = Object.keys(pedidosMap);
  if (numeros.length === 0)
    return res.status(400).json({ erro: 'Nenhum pedido valido encontrado!' });

  let importados = 0, ignorados = 0, erros = 0;

  for (const numero of numeros) {
    const itens = pedidosMap[numero];
    try {
      // Pontuação por peso de corredor + ruas únicas
      function _pesoCorredor(end) {
        if (!end) return 1.0;
        const e = String(end).trim().toUpperCase();
        if (e.startsWith('ZA') || e.toLowerCase().includes('arara')) return 2.0;
        const l = e.charAt(0);
        if ('ABCDEPQRSTU'.includes(l)) return 1.0;
        if ('MNOUVWXYZ'.includes(l)) return 1.5;
        if ('FGHIJKL'.includes(l)) return 2.0;
        return 1.0;
      }
      const ruasUnicas = new Set(itens.map(i => String(i.endereco||'').split(',')[0].trim().replace(/\d+/g,'').trim())).size;
      const somaItens = itens.reduce((s,i) => s + _pesoCorredor(i.endereco) * (parseInt(i.quantidade)||1), 0);
      const pontuacao = Math.round(somaItens + ruasUnicas * 2);
      const cliente = itens[0]?.cliente || '';
      const transportadora = itens[0]?.transportadora || '';
      const aguardando_desde = itens[0]?.aguardando_desde || '';
      const result = await dbRun(
        `INSERT OR IGNORE INTO pedidos (numero_pedido,status,itens,rua,cliente,transportadora,aguardando_desde,pontuacao,data_pedido,hora_pedido) VALUES (?, 'pendente', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [numero, itens.length, itens[0]?.endereco || '', cliente, transportadora, aguardando_desde, pontuacao, hoje, hora]
      );
      const foiNovo = result.changes > 0;
      const pedido  = await dbGet('SELECT id FROM pedidos WHERE numero_pedido=?', [numero]);
      if (!pedido) { erros++; continue; }
      if (!foiNovo) { ignorados++; continue; }

      await dbRun('BEGIN', []);
      try {
        for (const item of itens) {
          await dbRun(
            `INSERT INTO itens_pedido (pedido_id,codigo,descricao,endereco,quantidade) VALUES (?,?,?,?,?)`,
            [pedido.id, String(item.codigo||'').trim(), String(item.descricao||'').trim(),
             String(item.endereco||'').trim(), parseInt(item.quantidade)||1]
          );
        }
        await dbRun('COMMIT', []);
        importados++;
      } catch (errItem) {
        await dbRun('ROLLBACK', []).catch(() => {});
        await dbRun('DELETE FROM pedidos WHERE id=?', [pedido.id]).catch(() => {});
        console.error(`Erro itens pedido ${numero}:`, errItem.message);
        erros++;
      }
    } catch (err) {
      console.error(`Erro pedido ${numero}:`, err.message);
      erros++;
    }
  }

  res.json({ mensagem:'Importacao concluida!', importados, ignorados, erros, total: numeros.length });
});

// ─── PRODUTIVIDADE ────────────────────────────────────────────────────────────
app.get('/produtividade', (req, res) => {
  const { separador_id } = req.query;
  const { data: dataHoje } = dataHoraLocal();
  const mesAtual = dataHoje.substring(0, 7);
  let query = `
    SELECT s.id, s.nome, s.matricula, s.status,
      SUM(CASE WHEN p.data_pedido=? THEN 1 ELSE 0 END) as hoje,
      SUM(CASE WHEN substr(p.data_pedido,1,7)=? THEN 1 ELSE 0 END) as mes,
      COUNT(p.id) as total_ano,
      COALESCE(SUM(p.pontuacao),0) as pontuacao_total
    FROM separadores s
    LEFT JOIN pedidos p ON p.separador_id=s.id AND p.status='concluido'
    WHERE 1=1`;
  const params = [dataHoje, mesAtual];
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

// ─── ESTATÍSTICAS REPOSITOR ──────────────────────────────────────────────────
app.get('/estatisticas/repositor', (req, res) => {
  const { data_ini, data_fim, repositor_nome } = req.query;
  const { data: dataHoje } = dataHoraLocal();
  const mesAtual = dataHoje.substring(0, 7);
  const anoAtual = dataHoje.substring(0, 4);
  let filtroNome = '';
  const params1 = [dataHoje, dataHoje, mesAtual, mesAtual, anoAtual, anoAtual];
  if (repositor_nome) { filtroNome = ' AND repositor_nome=?'; }

  db.get(`SELECT
    SUM(CASE WHEN data_aviso=? AND status='reposto' THEN 1 ELSE 0 END) as repostos_hoje,
    SUM(CASE WHEN data_aviso=? THEN 1 ELSE 0 END) as avisos_hoje,
    SUM(CASE WHEN substr(data_aviso,1,7)=? AND status='reposto' THEN 1 ELSE 0 END) as repostos_mes,
    SUM(CASE WHEN substr(data_aviso,1,7)=? THEN 1 ELSE 0 END) as avisos_mes,
    SUM(CASE WHEN substr(data_aviso,1,4)=? AND status='reposto' THEN 1 ELSE 0 END) as repostos_ano,
    SUM(CASE WHEN substr(data_aviso,1,4)=? THEN 1 ELSE 0 END) as avisos_ano,
    SUM(CASE WHEN status='pendente' THEN 1 ELSE 0 END) as pendentes_total,
    SUM(CASE WHEN status='nao_encontrado' THEN 1 ELSE 0 END) as nao_encontrados,
    SUM(CASE WHEN status='protocolo' THEN 1 ELSE 0 END) as protocolos
    FROM avisos_repositor WHERE 1=1${filtroNome}`,
    repositor_nome ? [...params1, repositor_nome] : params1, (err, row) => {
      if (err) return res.status(500).json({ erro: err.message });
      // Produtividade por repositor
      db.all(`SELECT repositor_nome as nome,
        COUNT(*) as total,
        SUM(CASE WHEN status='reposto' THEN 1 ELSE 0 END) as repostos,
        SUM(CASE WHEN status='nao_encontrado' THEN 1 ELSE 0 END) as nao_encontrados,
        SUM(CASE WHEN data_aviso=? THEN 1 ELSE 0 END) as hoje
        FROM avisos_repositor WHERE repositor_nome != '' GROUP BY repositor_nome ORDER BY repostos DESC`,
        [dataHoje], (err2, produtividade) => {
          if (err2) return res.status(500).json({ erro: err2.message });
          res.json({ ...row, produtividade: produtividade || [] });
        });
    });
});

// ─── ESTATÍSTICAS CHECKOUT ───────────────────────────────────────────────────
app.get('/estatisticas/checkout', (req, res) => {
  const { data_ini, data_fim } = req.query;
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

// ─── KPIs DASHBOARD ─────────────────────────────────────────────────────────
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
    (SELECT ROUND(AVG(CAST(
      (strftime('%s', date('now')) - strftime('%s', date(data_pedido))) AS REAL) / 3600), 1)
      FROM pedidos WHERE status='concluido' AND substr(data_pedido,1,7)=?) as tmo_horas,
    (SELECT COUNT(DISTINCT separador_id) FROM pedidos WHERE status='separando') as seps_ativos,
    (SELECT COUNT(*) FROM avisos_repositor WHERE status='nao_encontrado' AND data_aviso=?) as nao_encontrados_hoje,
    (SELECT COUNT(*) FROM avisos_repositor WHERE data_aviso=?) as total_faltas_hoje`;

  db.get(sql, [dataHoje, dataHoje, mesAtual, dataHoje, mesAtual, dataHoje, dataHoje], (err, row) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(row || {});
  });
});


// ─── INFO PEDIDO (transportadora + cliente) ─────────────────────────────────
app.get('/pedidos/info/:numero_pedido', (req, res) => {
  db.get('SELECT numero_pedido, cliente, transportadora FROM pedidos WHERE numero_pedido=?',
    [req.params.numero_pedido], (err, row) => {
      if (err) return res.status(500).json({ erro: err.message });
      if (!row) return res.status(404).json({ erro:'Pedido não encontrado' });
      res.json({ cliente: row.cliente||'', transportadora: row.transportadora||'' });
    });
});

// ─── DISTRIBUIÇÃO JUSTA DE PEDIDOS ──────────────────────────────────────────
//
// PONTUAÇÃO por corredor (extrai primeira letra do endereço):
//   Fácil  (A-E, P-U)        → peso 1.0
//   Médio  (M, N, O, V-Z)    → peso 1.5
//   Difícil (F-L, ZA, Arara) → peso 2.0
//
// Fórmula por item: peso_corredor
// Fórmula por pedido: Σ(peso_corredor × qtd) + ruas_únicas × 2
//
// Prioridade: RETIRADA DRIVE THRU vai sempre primeiro na distribuição
// Ordenação: mais antigo primeiro (hora_pedido ASC) dentro de cada grupo
// Algoritmo: greedy — atribui sempre ao separador com menor carga total
//
function calcularPesoCorredor(endereco) {
  if (!endereco) return 1.0;
  const end = String(endereco).trim().toUpperCase();
  // ZA e Arara — difícil
  if (end.startsWith('ZA') || end.toLowerCase().includes('arara')) return 2.0;
  const letra = end.charAt(0);
  // Fácil: A,B,C,D,E,P,Q,R,S,T,U
  if ('ABCDEPQRSTU'.includes(letra)) return 1.0;
  // Médio: M,N,O,V,W,X,Y,Z
  if ('MNOUVWXYZ'.includes(letra)) return 1.5;
  // Difícil: F,G,H,I,J,K,L
  if ('FGHIJKL'.includes(letra)) return 2.0;
  return 1.0;
}

function calcularPontuacaoPedido(itens) {
  if (!itens || !itens.length) return 0;
  // Soma peso por item × quantidade
  const somaItens = itens.reduce((sum, it) => {
    const peso = calcularPesoCorredor(it.endereco);
    return sum + peso * (it.quantidade || 1);
  }, 0);
  // Ruas únicas (primeira parte do endereço antes de vírgula ou número)
  const ruas = new Set(itens.map(it => {
    const end = String(it.endereco || '').split(',')[0].trim().replace(/\d+/g,'').trim();
    return end;
  }));
  return Math.round(somaItens + ruas.size * 2);
}

app.post('/pedidos/distribuicao', async (req, res) => {
  const { separadores, quantidade } = req.body;
  if (!separadores || !separadores.length)
    return res.status(400).json({ erro: 'Informe os separadores!' });

  try {
    // Busca pedidos pendentes com itens para calcular pontuação real
    const { apenas_sem_sep } = req.body;
    let where = "p.status='pendente'";
    if (apenas_sem_sep !== false) where += ' AND p.separador_id IS NULL';

    const pedidos = await new Promise((resolve, reject) => {
      db.all(
        `SELECT p.* FROM pedidos p WHERE ${where} ORDER BY p.hora_pedido ASC, p.id ASC`,
        [], (err, rows) => { if (err) reject(err); else resolve(rows || []); }
      );
    });

    if (!pedidos.length) return res.json({ plano: [], total_pedidos: 0 });

    // Busca itens de cada pedido e calcula pontuação real
    for (const ped of pedidos) {
      const itens = await new Promise((resolve, reject) => {
        db.all('SELECT endereco, quantidade FROM itens_pedido WHERE pedido_id=?',
          [ped.id], (err, r) => { if (err) reject(err); else resolve(r || []); });
      });
      ped._pontuacao = calcularPontuacaoPedido(itens);
      ped._itens = itens;
    }

    // Aplica limite de quantidade
    const limite = (req.body.quantidade && req.body.quantidade > 0) ? req.body.quantidade : pedidos.length;
    const { respeitar_hora } = req.body;

    // Separa RETIRADA DRIVE THRU — sempre primeiro
    const isDrive = p => String(p.transportadora||'').toUpperCase().includes('DRIVE');
    const drive = pedidos.filter(isDrive).slice(0, limite);
    let outros = pedidos.filter(p => !isDrive(p));

    // Se respeitando hora: ordena por aguardando_desde ASC (mais antigo primeiro)
    // Se não: ordena por pontuação DESC (maior carga primeiro → melhor balanceamento)
    if (respeitar_hora !== false) {
      outros.sort((a,b) => {
        const ha = String(a.aguardando_desde||a.hora_pedido||'');
        const hb = String(b.aguardando_desde||b.hora_pedido||'');
        return ha.localeCompare(hb);
      });
    } else {
      outros.sort((a,b) => b._pontuacao - a._pontuacao);
    }

    // Limita total (drive já incluídos)
    const restante = Math.max(0, limite - drive.length);
    outros = outros.slice(0, restante);
    const ordenados = [...drive, ...outros];

    // Resolve separadores (por usuario_id ou separador_id)
    const sepMap = {};
    for (const sid of separadores) {
      let row = await new Promise((resolve, reject) => {
        db.get('SELECT s.id, s.nome FROM separadores s WHERE s.usuario_id=? LIMIT 1',
          [sid], (err, r) => { if (err) reject(err); else resolve(r); });
      });
      if (!row) row = await new Promise((resolve, reject) => {
        db.get('SELECT id, nome FROM usuarios WHERE id=?',
          [sid], (err, r) => { if (err) reject(err); else resolve(r); });
      });
      if (row) sepMap[sid] = row;
    }

    // Algoritmo greedy — atribui ao sep com menor carga
    const filas = separadores.map(sid => ({
      separador_id: sid,
      separador_nome: sepMap[sid]?.nome || `Sep ${sid}`,
      pedidos: [],
      pontuacao_total: 0,
      sep_db_id: sepMap[sid]?.id || null
    }));

    for (const ped of ordenados) {
      filas.sort((a,b) => a.pontuacao_total - b.pontuacao_total);
      filas[0].pedidos.push(ped.numero_pedido);
      filas[0].pontuacao_total += ped._pontuacao;
    }

    const plano = filas.map(f => ({
      separador_id: f.separador_id,
      sep_db_id: f.sep_db_id,
      separador_nome: f.separador_nome,
      pedidos: f.pedidos,
      pontuacao_total: f.pontuacao_total
    }));

    res.json({ plano, total_pedidos: pedidos.length });
  } catch(err) {
    console.error(err);
    res.status(500).json({ erro: err.message });
  }
});

// ─── CONFIRMAR DISTRIBUIÇÃO ─────────────────────────────────────────────────
app.post('/pedidos/distribuicao/confirmar', async (req, res) => {
  const { plano } = req.body;
  if (!plano || !plano.length) return res.status(400).json({ erro: 'Plano não informado!' });

  let distribuidos = 0;
  try {
    for (const item of plano) {
      for (const numPedido of item.pedidos) {
        // Busca separador_id pelo usuario_id
        const sep = await new Promise((resolve, reject) => {
          db.get(
            'SELECT id FROM separadores WHERE usuario_id=? OR id=? LIMIT 1',
            [item.separador_id, item.separador_id],
            (err, r) => { if (err) reject(err); else resolve(r); }
          );
        });
        const sepId = sep ? sep.id : null;
        
        const dbSepId = item.sep_db_id || sepId;
        if (dbSepId) {
          const r = await dbRun(
            "UPDATE pedidos SET separador_id=? WHERE numero_pedido=? AND status='pendente'",
            [dbSepId, numPedido]
          );
          if (r.changes > 0) distribuidos++;
        }
      }
    }
    res.json({ mensagem: 'Distribuição confirmada!', distribuidos });
  } catch(err) {
    res.status(500).json({ erro: err.message });
  }
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Servidor WMS rodando na porta ${PORT}`);
  const { data, hora } = dataHoraLocal();
  console.log(`Data/hora local: ${data} ${hora}`);
});