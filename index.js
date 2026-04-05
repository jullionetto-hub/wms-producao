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
    turno TEXT DEFAULT 'Manha',
    status TEXT DEFAULT 'ativo',
    data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
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
    data_pedido TEXT,
    hora_pedido TEXT,
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (separador_id) REFERENCES separadores(id)
  )`);
  db.run(`ALTER TABLE pedidos ADD COLUMN numero_caixa TEXT DEFAULT ''`, () => {});

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
  if (!login||!senha||!perfil) return res.status(400).json({ erro:'Dados incompletos!' });
  const hash = hashSenha(senha);
  // Perfis válidos
  const perfisValidos = ['supervisor','separador','repositor','checkout'];
  if (!perfisValidos.includes(perfil)) return res.status(400).json({ erro:'Perfil inválido!' });
  db.get(`SELECT * FROM usuarios WHERE login=? AND senha_hash=? AND perfil=? AND status='ativo'`,
    [login, hash, perfil], (err, user) => {
      if (err)   return res.status(500).json({ erro: err.message });
      if (!user) return res.status(401).json({ erro:'Login ou senha incorretos!' });
const permitidos = perfisPermitidos(user);
if (!permitidos.includes(perfil)) return res.status(403).json({ erro:'Este colaborador nao pode acessar este perfil!' });
      if (perfil === 'separador' || extras.includes('separador')) {
        db.get(`SELECT * FROM separadores WHERE usuario_id=? AND status='ativo'`, [user.id], (err2, sep) => {
          if (err2) return res.status(500).json({ erro: err2.message });
          req.session.usuario   = { id:user.id, nome:user.nome, login:user.login, perfil:user.perfil, turno:user.turno };
          req.session.separador = sep || null;
          return res.json({ usuario: req.session.usuario, separador: req.session.separador });
        });
      } else {
        req.session.usuario   = { id:user.id, nome:user.nome, login:user.login, perfil:user.perfil, turno:user.turno };
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
  let sql = 'SELECT id,nome,login,perfil,perfis_acesso,turno,status,data_cadastro FROM usuarios WHERE 1=1';
  const params = [];
  if (perfil) { sql += ' AND perfil=?'; params.push(perfil); }
  sql += ' ORDER BY nome';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows);
  });
});
app.post('/usuarios', (req, res) => {
  const { nome, login, senha, perfil, turno, perfis_acesso } = req.body;
  if (!nome||!login||!senha||!perfil) return res.status(400).json({ erro:'Preencha todos os campos!' });
  const hash = hashSenha(senha);
  db.run(`INSERT INTO usuarios (nome,login,senha_hash,perfil,turno) VALUES (?,?,?,?,?)`,
    [nome, login, hash, perfil, turno||'Manha'], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(409).json({ erro:'Login ja cadastrado!' });
        return res.status(500).json({ erro: err.message });
      }
      const novoId = this.lastID;
      if (perfil === 'separador' || extras.includes('separador')) {
        db.run(`INSERT OR IGNORE INTO separadores (nome,matricula,turno,usuario_id) VALUES (?,?,?,?)`,
          [nome, login, turno||'Manha', novoId], () => {});
      }
      res.json({ id: novoId, mensagem:'Usuario cadastrado!' });
    }
  );
});
app.put('/usuarios/:id', (req, res) => {
  const { nome, login, senha, perfil, turno, status, perfis_acesso } = req.body;
const extras = Array.isArray(perfis_acesso) ? perfis_acesso.filter(Boolean).filter(p => p !== perfil) : [];
  if (senha) {
    const hash = hashSenha(senha);
    db.run(`UPDATE usuarios SET nome=?,login=?,senha_hash=?,perfil=?,turno=?,status=? WHERE id=?`,
      [nome, login, hash, perfil, turno||'Manha', status, req.params.id],
      err => { if (err) return res.status(500).json({ erro: err.message }); res.json({ mensagem:'Atualizado!' }); });
  } else {
    db.run(`UPDATE usuarios SET nome=?,login=?,perfil=?,turno=?,status=? WHERE id=?`,
      [nome, login, perfil, turno||'Manha', status, req.params.id],
      err => { if (err) return res.status(500).json({ erro: err.message }); res.json({ mensagem:'Atualizado!' }); });
  }
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

  db.run('UPDATE pedidos SET numero_caixa=? WHERE id=?', [caixa, req.params.id], err => {
    if (err) return res.status(500).json({ erro: err.message });

    db.get('SELECT p.*, s.nome as sep_nome FROM pedidos p LEFT JOIN separadores s ON p.separador_id=s.id WHERE p.id=?',
      [req.params.id], (err2, ped) => {
        if (err2 || !ped) return res.json({ mensagem:'Caixa vinculada!' });
        const sepNome = ped.sep_nome || '';

        db.get('SELECT id FROM checkout WHERE pedido_id=?', [req.params.id], (err3, ck) => {
          if (ck) {
            db.run('UPDATE checkout SET numero_caixa=?, separador_nome=? WHERE pedido_id=?',
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

    const { hora } = dataHoraLocal();
    const sepId = separador_id || pedido.separador_id || null;
    db.run(`UPDATE pedidos SET separador_id=?, status='separando', hora_pedido=? WHERE id=?`,
      [sepId, hora, pedido.id], function(err2) {
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
      db.run('UPDATE pedidos SET status="concluido" WHERE id=?', [req.params.id], err3 => {
        if (err3) return res.status(500).json({ erro: err3.message });
        res.json({ mensagem:'Pedido concluido!' });
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
  db.run('UPDATE avisos_repositor SET status="reposto",hora_reposto=?,qtd_encontrada=?,repositor_nome=? WHERE id=?',
    [hora, parseInt(qtd_encontrada)||0, repositor_nome||'', req.params.id], err => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json({ mensagem:'Item reposto!' });
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
      const result = await dbRun(
        `INSERT OR IGNORE INTO pedidos (numero_pedido,status,itens,rua,data_pedido,hora_pedido) VALUES (?, 'pendente', ?, ?, ?, ?)`,
        [numero, itens.length, itens[0]?.endereco || '', hoje, hora]
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

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Servidor WMS rodando na porta ${PORT}`);
  const { data, hora } = dataHoraLocal();
  console.log(`Data/hora local: ${data} ${hora}`);
});