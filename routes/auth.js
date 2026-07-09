const express = require('express');
const router = express.Router();
const { db, pool } = require('../lib/db');
const { requerAuth, checkRateLimit } = require('../lib/auth');
const { hashSenha, verificarSenha, hashNeedsMigration, perfisPermitidos, sanitizeStr, dataHoraLocal } = require('../lib/helpers');
const { registrarAuditoria } = require('../lib/auditoria');

router.post('/auth/login', async (req,res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ erro: 'Muitas tentativas. Aguarde 15 minutos.' });
  }

  const login  = sanitizeStr(req.body.login, 100);
  const senha  = sanitizeStr(req.body.senha, 200);
  const perfil = sanitizeStr(req.body.perfil, 50);

  if (!login || !senha || !perfil) return res.status(400).json({erro:'Dados incompletos!'});
  if (!['supervisor','separador','repositor','checkout','embalador','gestor'].includes(perfil))
    return res.status(400).json({erro:'Perfil inválido!'});

  try {
    const user = await db.get(
      `SELECT id,nome,login,perfil,subtipo_repositor,perfis_acesso,turno,senha_hash,senha_temporaria,senha_temporaria_expira
       FROM usuarios WHERE login=$1 AND status='ativo'`,
      [login]
    );

    const senhaCorreta = user ? verificarSenha(senha, user.senha_hash || '') : false;

    if (!user || !senhaCorreta) return res.status(401).json({erro:'Login ou senha incorretos!'});

    if (user && hashNeedsMigration(user.senha_hash)) {
      pool.query('UPDATE usuarios SET senha_hash=$1 WHERE id=$2', [hashSenha(senha), user.id]).catch(()=>{});
    }
    if (!perfisPermitidos(user).includes(perfil))
      return res.status(403).json({erro:'Este colaborador não pode acessar este perfil!'});

    const senhaTemp = user.senha_temporaria === true || user.senha_temporaria === 't';
    if (senhaTemp && user.senha_temporaria_expira && new Date() > new Date(user.senha_temporaria_expira)) {
      return res.status(401).json({erro:'Senha temporária expirada. Contate o supervisor.'});
    }

    req.session.usuario = {
      id: user.id, nome: user.nome, login: user.login, perfil,
      subtipo_repositor: user.subtipo_repositor || 'geral',
      turno: user.turno,
      perfis_acesso: user.perfis_acesso || ''
    };

    // Registra início de sessão de trabalho
    const { data: dataHoje } = dataHoraLocal();
    pool.query(
      `INSERT INTO sessoes_trabalho (usuario_id,usuario_nome,usuario_login,perfil,turno,data,ip) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [user.id, user.nome, user.login, perfil, user.turno || 'Manha', dataHoje, ip]
    ).catch(() => {});

    if (perfil === 'separador') {
      req.session.separador = await db.get(
        `SELECT id,nome,matricula,turno,status FROM separadores WHERE usuario_id=$1 AND status='ativo'`,
        [user.id]
      );
      // Fallback 1: vincula pelo nome quando usuario_id não está configurado
      if (!req.session.separador) {
        req.session.separador = await db.get(
          `SELECT id,nome,matricula,turno,status FROM separadores
           WHERE LOWER(TRIM(nome))=LOWER(TRIM($1)) AND status='ativo'`,
          [user.nome]
        );
      }
      // Fallback 2: vincula pela matrícula (= login do usuário)
      if (!req.session.separador) {
        req.session.separador = await db.get(
          `SELECT id,nome,matricula,turno,status FROM separadores
           WHERE LOWER(TRIM(matricula))=LOWER(TRIM($1)) AND status='ativo'`,
          [user.login]
        );
      }
      // Auto-vincula usuario_id para logins futuros (qualquer fallback que funcionou)
      if (req.session.separador) {
        pool.query('UPDATE separadores SET usuario_id=$1 WHERE id=$2 AND (usuario_id IS NULL OR usuario_id=0)',
          [user.id, req.session.separador.id]).catch(()=>{});
      }
      // Fallback 3: cria registro em separadores se não existir nenhum
      if (!req.session.separador) {
        const ins = await pool.query(
          `INSERT INTO separadores (nome, matricula, turno, status, usuario_id)
           VALUES ($1,$2,$3,'ativo',$4)
           ON CONFLICT (usuario_id) DO UPDATE SET nome=EXCLUDED.nome
           RETURNING id,nome,matricula,turno,status`,
          [user.nome, user.login, user.turno||'Manha', user.id]
        );
        req.session.separador = ins.rows[0] || null;
      }
    } else {
      req.session.separador = null;
    }

    res.json({ usuario: req.session.usuario, separador: req.session.separador, senha_temporaria: senhaTemp });
  } catch(e) { res.status(500).json({erro:'Erro interno ao autenticar.'}); }
});

router.post('/auth/ping', requerAuth, (req, res) => {
  const usuario = req.session?.usuario;
  if (usuario?.id) {
    const { data: hoje } = dataHoraLocal();
    pool.query(
      `UPDATE sessoes_trabalho SET ultimo_ping=NOW()
       WHERE id=(SELECT id FROM sessoes_trabalho WHERE usuario_id=$1 AND data=$2 AND logout_em IS NULL ORDER BY login_em DESC LIMIT 1)`,
      [usuario.id, hoje]
    ).catch(() => {});
  }
  res.json({ ok: true });
});

router.post('/auth/logout', (req, res) => {
  const usuario = req.session?.usuario;
  if (usuario?.id) {
    const { data: hoje } = dataHoraLocal();
    pool.query(
      `UPDATE sessoes_trabalho SET logout_em=NOW(),
        duracao_min=GREATEST(0,ROUND(EXTRACT(EPOCH FROM (NOW()-login_em))/60)::int)
       WHERE id=(SELECT id FROM sessoes_trabalho WHERE usuario_id=$1 AND data=$2 AND logout_em IS NULL ORDER BY login_em DESC LIMIT 1)`,
      [usuario.id, hoje]
    ).catch(() => {});
  }
  req.session.destroy(() => {
    res.clearCookie('wms.sid');
    res.json({ mensagem: 'Logout realizado!' });
  });
});

router.get('/auth/me', (req,res) => {
  if (!req.session.usuario) return res.status(401).json({erro:'Nao autenticado'});
  res.json({usuario:req.session.usuario, separador:req.session.separador||null});
});

router.post('/auth/redefinir-senha', requerAuth, async (req,res) => {
  try {
    const { senha_atual, senha_nova } = req.body;
    if (!senha_atual || !senha_nova) return res.status(400).json({erro:'Campos obrigatorios'});
    if (senha_nova.length < 6) return res.status(400).json({erro:'Senha minima 6 caracteres'});
    const usuario = req.session?.usuario;
    const u = await db.get('SELECT * FROM usuarios WHERE id=$1', [usuario.id]);
    if (!u) return res.status(404).json({erro:'Usuario nao encontrado'});
    if (!verificarSenha(senha_atual, u.senha_hash)) return res.status(400).json({erro:'Senha atual incorreta'});
    await pool.query('UPDATE usuarios SET senha_hash=$1 WHERE id=$2', [hashSenha(senha_nova), usuario.id]);
    await registrarAuditoria(req, 'REDEFINIR_SENHA', 'usuario', usuario.id, null, null);
    res.json({mensagem:'Senha redefinida!'});
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.post('/auth/trocar-senha-temp', async (req,res) => {
  try {
    const { login, senha_nova, senha_conf } = req.body;
    if (!login || !senha_nova || !senha_conf) return res.status(400).json({erro:'Preencha todos os campos'});
    if (senha_nova.length < 6) return res.status(400).json({erro:'Senha minima 6 caracteres'});
    if (senha_nova !== senha_conf) return res.status(400).json({erro:'Senhas nao conferem'});
    const u = await db.get('SELECT id,senha_temporaria_expira FROM usuarios WHERE login=$1 AND senha_temporaria=true', [login]);
    if (!u) return res.status(400).json({erro:'Nao autorizado'});
    if (u.senha_temporaria_expira && new Date() > new Date(u.senha_temporaria_expira)) {
      return res.status(400).json({erro:'Senha temporária expirada. Contate o supervisor.'});
    }
    await pool.query('UPDATE usuarios SET senha_hash=$1, senha_temporaria=false, senha_temporaria_expira=NULL WHERE id=$2', [hashSenha(senha_nova), u.id]);
    res.json({mensagem:'Senha alterada! Faca o login.'});
  } catch(e) { res.status(500).json({erro:e.message}); }
});

module.exports = router;
