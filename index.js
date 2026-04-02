const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors    = require('cors');
const path    = require('path');
const crypto  = require('crypto');
const session = require('express-session');

const app  = express();
const PORT = process.env.PORT || 3000;

// CORS com origem explícita — necessário para cookies de sessão funcionarem
app.use(cors({
  credentials: true,
  origin: function(origin, callback) {
    // Aceita localhost e qualquer IP local
    callback(null, origin || 'http://localhost:3000');
  }
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Sessão persistente com cookie correto para HTTP local
const SQLiteStore = require('connect-sqlite3')(session);

app.use(session({
  secret: 'wms_session_secret_2026',
  resave: false,
  saveUninitialized: false,
  store: new SQLiteStore({ db: 'sessions.db', dir: __dirname }),
  cookie: {
    maxAge:   8 * 60 * 60 * 1000, // 8 horas
    httpOnly: true,
    secure:   false,               // false para HTTP local
    sameSite: 'lax'
  }
}));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Banco de dados ─────────────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'wms.db');
const db = new sqlite3.Database(DB_PATH, err => {
  if (err) console.error(err.message);
  else console.log('Banco conectado em:', DB_PATH);
});

db.run('PRAGMA journal_mode=WAL');

// ── Helper de data/hora local (fuso do servidor) ──────────────────────────────
// Usa toLocaleString com pt-BR para obter data/hora no fuso local, evitando
// o problema do UTC que causava registro de data errada.
function dataHoraLocal() {
  const agora = new Date();
  const data  = agora.toLocaleDateString('pt-BR', { year:'numeric', month:'2-digit', day:'2-digit' });
  // converte DD/MM/YYYY → YYYY-MM-DD para compatibilidade com SQLite
  const [d, m, y] = data.split('/');
  const dataISO = `${y}-${m}-${d}`;
  const hora    = agora.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
  return { data: dataISO, hora };
}

// ── Criação de tabelas ────────────────────────────────────────────────────────
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    login TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    perfil TEXT NOT NULL DEFAULT 'separador',
    turno TEXT DEFAULT 'Manhã',
    status TEXT DEFAULT 'ativo',
    data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Migração segura: adiciona coluna turno se ainda não existe
  db.run(`ALTER TABLE usuarios ADD COLUMN turno TEXT DEFAULT 'Manhã'`, () => {});

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
    data_pedido TEXT,
    hora_pedido TEXT,
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (separador_id) REFERENCES separadores(id)
  )`);

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
    FOREIGN KEY (item_id) REFERENCES itens_pedido(id)
  )`);

  db.run(`ALTER TABLE avisos_repositor ADD COLUMN obs TEXT DEFAULT ''`, () => {});
  db.run(`ALTER TABLE avisos_repositor ADD COLUMN data_aviso TEXT`, () => {});

  db.run(`CREATE INDEX IF NOT EXISTS idx_pedidos_sep    ON pedidos(separador_id, status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_pedidos_num    ON pedidos(numero_pedido)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_itens_pedido   ON itens_pedido(pedido_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_avisos_status  ON avisos_repositor(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_avisos_data    ON avisos_repositor(data_aviso)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_usuarios_login ON usuarios(login)`);
});

function hashSenha(senha) {
  return crypto.createHash('sha256').update(senha + 'wms_salt_2026').digest('hex');
}

function criarUsuarioPadrao() {
  const hash = hashSenha('123456');
  db.run(
    `INSERT OR IGNORE INTO usuarios (nome,login,senha_hash,perfil,status) VALUES (?,?,?,?,?)`,
    ['Supervisor Master','admin',hash,'supervisor','ativo'],
    function(err) {
      if (err) console.error('Erro ao criar usuário padrão:', err.message);
      else if (this.changes > 0) console.log('Usuário padrão criado: admin / 123456');
    }
  );
}
criarUsuarioPadrao();

// ─── AUTH ──────────────────────────────────────────────────────────────────────

app.post('/auth/login', (req, res) => {
  const { login, senha, perfil } = req.body;
  if (!login||!senha||!perfil) return res.status(400).json({ erro:'Dados incompletos!' });

  const hash = hashSenha(senha);
  db.get(
    `SELECT * FROM usuarios WHERE login=? AND senha_hash=? AND perfil=? AND status='ativo'`,
    [login, hash, perfil],
    (err, user) => {
      if (err)   return res.status(500).json({ erro: err.message });
      if (!user) return res.status(401).json({ erro:'Login ou senha incorretos!' });

      if (perfil === 'separador') {
        // Busca o separador vinculado ao usuario
        db.get(
          `SELECT * FROM separadores WHERE usuario_id=? AND status='ativo'`,
          [user.id],
          (err2, sep) => {
            if (err2) return res.status(500).json({ erro: err2.message });
            req.session.usuario   = { id:user.id, nome:user.nome, login:user.login, perfil:user.perfil, turno:user.turno };
            req.session.separador = sep || null;
            return res.json({ usuario: req.session.usuario, separador: req.session.separador });
          }
        );
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
  if (!req.session.usuario) return res.status(401).json({ erro:'Não autenticado' });
  res.json({ usuario: req.session.usuario, separador: req.session.separador || null });
});

// ─── USUÁRIOS ──────────────────────────────────────────────────────────────────

app.get('/usuarios', (req, res) => {
  const { perfil } = req.query;
  let sql = 'SELECT id,nome,login,perfil,turno,status,data_cadastro FROM usuarios WHERE 1=1';
  const params = [];
  if (perfil) { sql += ' AND perfil=?'; params.push(perfil); }
  sql += ' ORDER BY nome';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows);
  });
});

app.post('/usuarios', (req, res) => {
  const { nome, login, senha, perfil, turno } = req.body;
  if (!nome||!login||!senha||!perfil) return res.status(400).json({ erro:'Preencha todos os campos!' });
  const hash = hashSenha(senha);
  db.run(
    `INSERT INTO usuarios (nome,login,senha_hash,perfil,turno) VALUES (?,?,?,?,?)`,
    [nome, login, hash, perfil, turno||'Manhã'],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(409).json({ erro:'Login já cadastrado!' });
        return res.status(500).json({ erro: err.message });
      }
      const novoId = this.lastID;

      // Se for separador, cria automaticamente na tabela separadores
      if (perfil === 'separador') {
        db.run(
          `INSERT OR IGNORE INTO separadores (nome,matricula,turno,usuario_id) VALUES (?,?,?,?)`,
          [nome, login, turno||'Manhã', novoId],
          () => {} // ignora erro de UNIQUE silenciosamente
        );
      }

      res.json({ id: novoId, mensagem:'Usuário cadastrado!' });
    }
  );
});

app.put('/usuarios/:id', (req, res) => {
  const { nome, login, senha, perfil, turno, status } = req.body;
  if (senha) {
    const hash = hashSenha(senha);
    db.run(
      `UPDATE usuarios SET nome=?,login=?,senha_hash=?,perfil=?,turno=?,status=? WHERE id=?`,
      [nome, login, hash, perfil, turno||'Manhã', status, req.params.id],
      err => { if (err) return res.status(500).json({ erro: err.message }); res.json({ mensagem:'Usuário atualizado!' }); }
    );
  } else {
    db.run(
      `UPDATE usuarios SET nome=?,login=?,perfil=?,turno=?,status=? WHERE id=?`,
      [nome, login, perfil, turno||'Manhã', status, req.params.id],
      err => { if (err) return res.status(500).json({ erro: err.message }); res.json({ mensagem:'Usuário atualizado!' }); }
    );
  }
});

app.delete('/usuarios/:id', (req, res) => {
  db.run('DELETE FROM usuarios WHERE id=?', [req.params.id], err => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json({ mensagem:'Usuário excluído!' });
  });
});

// ─── SEPARADORES (mantido para compatibilidade interna) ────────────────────────

app.get('/separadores', (req, res) => {
  // Retorna separadores com join nos usuários para dados atualizados
  db.all(
    `SELECT s.*, u.nome as usuario_nome FROM separadores s LEFT JOIN usuarios u ON s.usuario_id=u.id ORDER BY s.nome`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json(rows);
    }
  );
});

app.get('/separadores/:id', (req, res) => {
  db.get('SELECT * FROM separadores WHERE id=?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(row);
  });
});

app.post('/separadores', (req, res) => {
  const { nome, matricula, turno, usuario_id } = req.body;
  db.run(
    'INSERT OR IGNORE INTO separadores (nome,matricula,turno,usuario_id) VALUES (?,?,?,?)',
    [nome, matricula, turno||'Manhã', usuario_id||null],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(409).json({ erro:'Matrícula já cadastrada!' });
        return res.status(500).json({ erro: err.message });
      }
      res.json({ id: this.lastID, mensagem:'Separador cadastrado!' });
    }
  );
});

app.put('/separadores/:id', (req, res) => {
  const { nome, matricula, turno, status, usuario_id } = req.body;
  db.run(
    'UPDATE separadores SET nome=?,matricula=?,turno=?,status=?,usuario_id=? WHERE id=?',
    [nome, matricula, turno, status, usuario_id||null, req.params.id],
    err => { if (err) return res.status(500).json({ erro: err.message }); res.json({ mensagem:'Separador atualizado!' }); }
  );
});

app.delete('/separadores/:id', (req, res) => {
  db.run('DELETE FROM separadores WHERE id=?', [req.params.id], err => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json({ mensagem:'Separador excluído!' });
  });
});

// ─── PEDIDOS ───────────────────────────────────────────────────────────────────

app.get('/pedidos', (req, res) => {
  const { separador_id, status, data, data_ini, data_fim, numero_pedido } = req.query;

  let query = `SELECT p.*, s.nome as separador_nome
               FROM pedidos p
               LEFT JOIN separadores s ON p.separador_id=s.id
               WHERE 1=1`;
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
  const d = data_pedido || dataLocal;
  const h = hora_pedido || horaLocal;

  db.run(
    'INSERT INTO pedidos (numero_pedido,separador_id,status,itens,rua,data_pedido,hora_pedido) VALUES (?,?,?,?,?,?,?)',
    [numero_pedido, separador_id||null, status||'pendente', itens||0, rua||'', d, h],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(409).json({ erro:'Pedido já cadastrado!' });
        return res.status(500).json({ erro: err.message });
      }
      res.json({ id: this.lastID, mensagem:'Pedido cadastrado!' });
    }
  );
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
    res.json({ mensagem:'Separador atribuído!' });
  });
});

app.post('/pedidos/bipar', (req, res) => {
  const { numero_pedido, separador_id } = req.body;
  if (!numero_pedido||!separador_id) return res.status(400).json({ erro:'Dados incompletos!' });

  db.get('SELECT * FROM pedidos WHERE numero_pedido=?', [numero_pedido], (err, pedido) => {
    if (err)    return res.status(500).json({ erro: err.message });
    if (!pedido) return res.status(404).json({ erro:'Pedido não encontrado!' });

    if (pedido.status === 'concluido')
      return res.status(400).json({ erro:'Pedido já concluído!', status:'concluido' });

    if (pedido.separador_id && String(pedido.separador_id)===String(separador_id))
      return res.json({ mensagem:'Pedido já atribuído.', pedido_id:pedido.id, status:pedido.status, ja_atribuido:true });

    if (pedido.separador_id && String(pedido.separador_id)!==String(separador_id) && pedido.status!=='pendente')
      return res.status(409).json({ erro:'Pedido sendo separado por outro operador!' });

    const { hora } = dataHoraLocal();

    db.run(
      `UPDATE pedidos SET separador_id=?, status='separando', hora_pedido=? WHERE id=? AND status='pendente'`,
      [separador_id, hora, pedido.id],
      function(err2) {
        if (err2) return res.status(500).json({ erro: err2.message });
        if (this.changes === 0)
          return res.status(409).json({ erro:'Pedido acabou de ser pego por outro operador!' });
        res.json({ mensagem:'Pedido atribuído!', pedido_id:pedido.id, status:'separando' });
      }
    );
  });
});

app.get('/pedidos/:id/itens', (req, res) => {
  db.all(
    `SELECT i.*, COALESCE(a.status,'') as aviso_status
     FROM itens_pedido i
     LEFT JOIN avisos_repositor a ON a.item_id=i.id AND a.status IN ('reposto','nao_encontrado')
     WHERE i.pedido_id=?
     ORDER BY i.id`,
    [req.params.id],
    (err, rows) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json(rows);
    }
  );
});

app.put('/itens/:id/verificar', (req, res) => {
  const { status, obs, qtd_falta, separador_id, separador_nome } = req.body;
  const { data, hora } = dataHoraLocal();

  db.get(
    `SELECT i.*, p.numero_pedido FROM itens_pedido i JOIN pedidos p ON i.pedido_id=p.id WHERE i.id=?`,
    [req.params.id],
    (err, item) => {
      if (err||!item) return res.status(500).json({ erro: err?.message||'Item não encontrado' });

      const obsTexto  = obs || '';
      const qtdFaltou = qtd_falta || 0;

      db.run(
        'UPDATE itens_pedido SET status=?, obs=?, qtd_falta=?, hora_verificado=? WHERE id=?',
        [status, obsTexto, qtdFaltou, hora, req.params.id],
        err2 => {
          if (err2) return res.status(500).json({ erro: err2.message });

          if (status === 'falta' || status === 'parcial') {
            const qtdAviso = status==='falta' ? item.quantidade : qtdFaltou;
            const obsAviso = status==='parcial' ? obsTexto : `Falta total — ${item.quantidade} unidade(s)`;

            db.get(
              `SELECT id FROM avisos_repositor WHERE item_id=? AND status='pendente'`,
              [item.id],
              (err3, jaExiste) => {
                if (err3) return res.status(500).json({ erro: err3.message });

                if (jaExiste) {
                  db.run(
                    `UPDATE avisos_repositor SET quantidade=?, obs=?, hora_aviso=? WHERE id=?`,
                    [qtdAviso, obsAviso, hora, jaExiste.id],
                    err4 => {
                      if (err4) return res.status(500).json({ erro: err4.message });
                      res.json({ mensagem:'Aviso atualizado!', aviso:true });
                    }
                  );
                  return;
                }

                db.run(
                  `INSERT INTO avisos_repositor
                  (item_id,pedido_id,numero_pedido,separador_id,separador_nome,codigo,descricao,endereco,quantidade,obs,status,hora_aviso,data_aviso)
                  VALUES (?,?,?,?,?,?,?,?,?,?,'pendente',?,?)`,
                  [item.id, item.pedido_id, item.numero_pedido, separador_id, separador_nome,
                   item.codigo, item.descricao, item.endereco, qtdAviso, obsAviso, hora, data],
                  err4 => {
                    if (err4) return res.status(500).json({ erro: err4.message });
                    res.json({ mensagem:'Repositor avisado!', aviso:true });
                  }
                );
              }
            );
          } else {
            res.json({ mensagem:'Item verificado!', aviso:false });
          }
        }
      );
    }
  );
});

app.put('/pedidos/:id/concluir', (req, res) => {
  db.all(
    `SELECT * FROM itens_pedido WHERE pedido_id=? AND status='pendente'`,
    [req.params.id],
    (err, pendentes) => {
      if (err) return res.status(500).json({ erro: err.message });
      if (pendentes.length > 0)
        return res.status(400).json({ erro:`Ainda há ${pendentes.length} item(s) não verificado(s)!` });

      db.all(
        `SELECT * FROM avisos_repositor WHERE pedido_id=? AND status='pendente'`,
        [req.params.id],
        (err2, avisosPendentes) => {
          if (err2) return res.status(500).json({ erro: err2.message });
          if (avisosPendentes.length > 0)
            return res.status(400).json({ erro:`Aguardando repositor resolver ${avisosPendentes.length} item(s)!`, aguardando:true });

          db.run('UPDATE pedidos SET status="concluido" WHERE id=?', [req.params.id], err3 => {
            if (err3) return res.status(500).json({ erro: err3.message });
            res.json({ mensagem:'Pedido concluído!' });
          });
        }
      );
    }
  );
});

// ─── REPOSITOR ────────────────────────────────────────────────────────────────

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
  db.run('UPDATE avisos_repositor SET status="reposto",hora_reposto=? WHERE id=?', [hora, req.params.id], err => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json({ mensagem:'Item reposto!' });
  });
});

app.put('/repositor/avisos/:id/nao_encontrado', (req, res) => {
  const { hora } = dataHoraLocal();
  db.run('UPDATE avisos_repositor SET status="nao_encontrado",hora_reposto=? WHERE id=?', [hora, req.params.id], err => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json({ mensagem:'Marcado como não encontrado!' });
  });
});

// ─── IMPORTAÇÃO ───────────────────────────────────────────────────────────────

app.post('/importar', (req, res) => {
  const { linhas } = req.body;
  if (!linhas||!linhas.length) return res.status(400).json({ erro:'Nenhuma linha enviada!' });

  // FIX: usa data/hora local do servidor, não UTC
  const { data: hoje, hora } = dataHoraLocal();

  let importados = 0, ignorados = 0, erros = 0;
  const pedidosMap = {};

  linhas.forEach(l => {
    const num = String(l.numero_pedido||'').trim();
    if (!num) return;
    if (!pedidosMap[num]) pedidosMap[num] = [];
    pedidosMap[num].push(l);
  });

  const numeros = Object.keys(pedidosMap);
  if (numeros.length === 0) return res.status(400).json({ erro:'Nenhum pedido válido encontrado!' });

  let processados = 0;

  numeros.forEach(numero => {
    const itens = pedidosMap[numero];

    db.run(
      `INSERT OR IGNORE INTO pedidos (numero_pedido,status,itens,rua,data_pedido,hora_pedido) VALUES (?,'pendente',?,?,?,?)`,
      [numero, itens.length, itens[0]?.endereco||'', hoje, hora],
      function(errInsert) {
        if (errInsert) { erros++; processados++; verificarFim(); return; }

        const foiNovo = this.changes > 0;

        db.get('SELECT id FROM pedidos WHERE numero_pedido=?', [numero], (errGet, pedido) => {
          if (errGet||!pedido) { erros++; processados++; verificarFim(); return; }

          if (foiNovo) {
            importados++;
            const stmt = db.prepare(
              'INSERT OR IGNORE INTO itens_pedido (pedido_id,codigo,descricao,endereco,quantidade) VALUES (?,?,?,?,?)'
            );
            itens.forEach(item => {
              stmt.run([
                pedido.id,
                String(item.codigo    ||'').trim(),
                String(item.descricao ||'').trim(),
                String(item.endereco  ||'').trim(),
                parseInt(item.quantidade)||1
              ]);
            });
            stmt.finalize(() => { processados++; verificarFim(); });
          } else {
            ignorados++; processados++; verificarFim();
          }
        });
      }
    );
  });

  function verificarFim() {
    if (processados === numeros.length)
      res.json({ mensagem:'Importação concluída!', importados, ignorados, erros, total:numeros.length });
  }
});

// ─── PRODUTIVIDADE ────────────────────────────────────────────────────────────

app.get('/produtividade', (req, res) => {
  const { separador_id } = req.query;
  // Usa data local do servidor para "hoje" e "mês"
  const { data: dataHoje } = dataHoraLocal();
  const mesAtual = dataHoje.substring(0, 7); // YYYY-MM

  let query = `
    SELECT s.id, s.nome, s.matricula, s.status,
      SUM(CASE WHEN p.data_pedido=? THEN 1 ELSE 0 END) as hoje,
      SUM(CASE WHEN substr(p.data_pedido,1,7)=? THEN 1 ELSE 0 END) as mes,
      COUNT(p.id) as total_ano,
      COALESCE(SUM(p.pontuacao),0) as pontuacao_total
    FROM separadores s
    LEFT JOIN pedidos p ON p.separador_id=s.id AND p.status='concluido'
    WHERE 1=1
  `;
  const params = [dataHoje, mesAtual];
  if (separador_id) { query += ' AND s.id=?'; params.push(separador_id); }
  query += ' GROUP BY s.id ORDER BY s.nome';

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows);
  });
});

// ─── START ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Servidor WMS rodando na porta ${PORT}`);
  const { data, hora } = dataHoraLocal();
  console.log(`Data/hora local do servidor: ${data} ${hora}`);
});