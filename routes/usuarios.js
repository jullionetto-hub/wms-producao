const express = require('express');
const router = express.Router();
const { db, pool } = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');
const { hashSenha, validarId } = require('../lib/helpers');

router.get('/usuarios', requerAuth, requerPerfil('supervisor', 'gestor'), async (req,res) => {
  try {
    let sql='SELECT id,nome,login,perfil,subtipo_repositor,perfis_acesso,turno,status,data_cadastro FROM usuarios WHERE 1=1';
    const p=[];
    if (req.query.perfil){p.push(req.query.perfil);sql+=` AND perfil=$${p.length}`;}
    res.json(await db.all(sql+' ORDER BY nome',p));
  } catch(e){res.status(500).json({erro:e.message});}
});

router.post('/usuarios', requerAuth, requerPerfil('supervisor', 'gestor'), async (req,res) => {
  const {nome,login,senha,perfil,subtipo_repositor,turno,perfis_acesso}=req.body;
  if (!nome||!login||!senha||!perfil) return res.status(400).json({erro:'Preencha todos os campos!'});
  const extras=Array.isArray(perfis_acesso)?perfis_acesso.filter(Boolean).filter(p=>p!==perfil).join(','):String(perfis_acesso||'');
  const subtipo=perfil==='repositor'?(subtipo_repositor||'geral'):'geral';
  try {
    const r=await pool.query(`INSERT INTO usuarios (nome,login,senha_hash,perfil,subtipo_repositor,perfis_acesso,turno) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [nome,login,hashSenha(senha),perfil,subtipo,extras,turno||'Manha']);
    const novoId=r.rows[0].id;
    if (perfil==='separador') await pool.query(`INSERT INTO separadores (nome,matricula,turno,usuario_id) VALUES ($1,$2,$3,$4) ON CONFLICT(matricula) DO NOTHING`,[nome,login,turno||'Manha',novoId]);
    res.json({id:novoId,mensagem:'Usuario cadastrado!'});
  } catch(e){
    if (e.code==='23505') return res.status(409).json({erro:'Login ja cadastrado!'});
    res.status(500).json({erro:e.message});
  }
});

router.put('/usuarios/:id', requerAuth, requerPerfil('supervisor', 'gestor'), async (req,res) => {
  const {nome,login,senha,perfil,subtipo_repositor,turno,status,perfis_acesso}=req.body;
  const subtipo=perfil==='repositor'?(subtipo_repositor||'geral'):'geral';
  const extras=Array.isArray(perfis_acesso)?perfis_acesso.filter(Boolean).filter(p=>p!==perfil).join(','):String(perfis_acesso||'');
  try {
    const senhaTemp = req.body.senha_temporaria === true;
    if (senha) {
      const expira = senhaTemp ? new Date(Date.now() + 24*60*60*1000) : null;
      await pool.query(`UPDATE usuarios SET nome=$1,login=$2,senha_hash=$3,perfil=$4,subtipo_repositor=$5,turno=$6,status=$7,perfis_acesso=$8,senha_temporaria=$9,senha_temporaria_expira=$10 WHERE id=$11`,
        [nome,login,hashSenha(senha),perfil,subtipo,turno||'Manha',status,extras,senhaTemp,expira,req.params.id]);
    } else {
      await pool.query(`UPDATE usuarios SET nome=$1,login=$2,perfil=$3,subtipo_repositor=$4,turno=$5,status=$6,perfis_acesso=$7 WHERE id=$8`,
        [nome,login,perfil,subtipo,turno||'Manha',status,extras,req.params.id]);
    }
    // Sincroniza separadores.turno para manter consistência com usuarios.turno
    await pool.query(`UPDATE separadores SET turno=$1, nome=$2 WHERE usuario_id=$3`, [turno||'Manha', nome, req.params.id]);
    res.json({mensagem:'Atualizado!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

router.patch('/usuarios/:id/status', requerAuth, requerPerfil('supervisor', 'gestor'), async (req,res) => {
  const id = validarId(req.params.id);
  if (!id) return res.status(400).json({erro:'ID invalido'});
  const {status} = req.body;
  if (!['ativo','inativo'].includes(status)) return res.status(400).json({erro:'Status invalido'});
  try {
    await pool.query('UPDATE usuarios SET status=$1 WHERE id=$2', [status, id]);
    res.json({mensagem:'Status atualizado!'});
  } catch(err) { res.status(500).json({erro:err.message}); }
});

router.delete('/usuarios/:id', requerAuth, requerPerfil('supervisor', 'gestor'), async (req,res) => {
  try { await pool.query('DELETE FROM usuarios WHERE id=$1',[req.params.id]); res.json({mensagem:'Excluido!'}); }
  catch(e){res.status(500).json({erro:e.message});}
});

// ── SEPARADORES ───────────────────────────────────────────────────────────────
router.get('/separadores', requerAuth, async (req,res) => {
  try { res.json(await db.all(`SELECT s.*,u.nome as usuario_nome FROM separadores s LEFT JOIN usuarios u ON s.usuario_id=u.id ORDER BY s.nome`)); }
  catch(e){res.status(500).json({erro:e.message});}
});

router.get('/separadores/:id', requerAuth, async (req,res) => {
  try { res.json(await db.get('SELECT * FROM separadores WHERE id=$1',[req.params.id])); }
  catch(e){res.status(500).json({erro:e.message});}
});

router.post('/separadores', requerAuth, requerPerfil('supervisor', 'gestor'), async (req,res) => {
  const {nome,matricula,turno,usuario_id}=req.body;
  try {
    const r=await pool.query(`INSERT INTO separadores (nome,matricula,turno,usuario_id) VALUES ($1,$2,$3,$4) ON CONFLICT(matricula) DO NOTHING RETURNING id`,
      [nome,matricula,turno||'Manha',usuario_id||null]);
    if (!r.rows[0]) return res.status(409).json({erro:'Matricula ja cadastrada!'});
    res.json({id:r.rows[0].id,mensagem:'Separador cadastrado!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

router.put('/separadores/:id', requerAuth, requerPerfil('supervisor', 'gestor'), async (req,res) => {
  const {nome,matricula,turno,status,usuario_id}=req.body;
  try { await pool.query('UPDATE separadores SET nome=$1,matricula=$2,turno=$3,status=$4,usuario_id=$5 WHERE id=$6',[nome,matricula,turno,status,usuario_id||null,req.params.id]); res.json({mensagem:'Atualizado!'}); }
  catch(e){res.status(500).json({erro:e.message});}
});

router.delete('/separadores/:id', requerAuth, requerPerfil('supervisor', 'gestor'), async (req,res) => {
  try { await pool.query('DELETE FROM separadores WHERE id=$1',[req.params.id]); res.json({mensagem:'Excluido!'}); }
  catch(e){res.status(500).json({erro:e.message});}
});

// ── Auto-vincula separadores sem usuario_id (diagnóstico + correção) ──────────
router.post('/separadores/vincular-todos', requerAuth, requerPerfil('supervisor', 'gestor'), async (req,res) => {
  try {
    // 1. Tenta vincular por matricula = login (mais confiável)
    const r1 = await pool.query(`
      UPDATE separadores s SET usuario_id = u.id
      FROM usuarios u
      WHERE (s.usuario_id IS NULL OR s.usuario_id = 0)
        AND s.status = 'ativo'
        AND u.perfil = 'separador'
        AND u.status = 'ativo'
        AND LOWER(TRIM(s.matricula)) = LOWER(TRIM(u.login))
    `);
    // 2. Tenta vincular por nome (fallback)
    const r2 = await pool.query(`
      UPDATE separadores s SET usuario_id = u.id
      FROM usuarios u
      WHERE (s.usuario_id IS NULL OR s.usuario_id = 0)
        AND s.status = 'ativo'
        AND u.perfil = 'separador'
        AND u.status = 'ativo'
        AND LOWER(TRIM(s.nome)) = LOWER(TRIM(u.nome))
    `);
    // 3. Relatório de ainda sem vínculo
    const semVinculo = await db.all(`
      SELECT s.id, s.nome, s.matricula, s.turno
      FROM separadores s
      WHERE (s.usuario_id IS NULL OR s.usuario_id = 0) AND s.status = 'ativo'
      ORDER BY s.nome
    `);
    res.json({
      vinculados_matricula: r1.rowCount,
      vinculados_nome: r2.rowCount,
      sem_vinculo: semVinculo
    });
  } catch(e) { res.status(500).json({erro:e.message}); }
});

module.exports = router;
