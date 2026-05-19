'use strict';
const express = require('express');
const router  = express.Router();
const { db, pool } = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');

const PONTOS_POR_CAMPO = {
  sep_separados: 75, sep_pendentes: 75, sep_em_separacao: 50,
  ck_feitos: 75, ck_pendentes: 75,
  emb_embalados: 75, emb_pendentes: 75,
  rep_procurando: 75, rep_na_rua: 75,
  separadores_presentes: 25, ocorrencias: 25,
};

async function garantirPlacar() {
  for (const t of ['Manha','Tarde','Noite'])
    await pool.query(`INSERT INTO placar_turno (turno, pontos) VALUES ($1, 1000) ON CONFLICT (turno) DO NOTHING`, [t]);
}

router.get('/passagem', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    res.json(await db.all(`SELECT p.*, v.pontos_perdidos, v.supervisor_entrando, v.validado_em FROM passagem_turno p LEFT JOIN validacao_passagem v ON v.passagem_id = p.id ORDER BY p.criado_em DESC LIMIT 50`));
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.get('/passagem/placar', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    await garantirPlacar();
    const placar    = await db.all('SELECT * FROM placar_turno ORDER BY pontos DESC');
    const historico = await db.all(`SELECT v.*, p.turno as turno_saindo, p.data FROM validacao_passagem v JOIN passagem_turno p ON p.id = v.passagem_id ORDER BY v.validado_em DESC LIMIT 20`);
    res.json({ placar, historico });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.get('/passagem/pendente', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    res.json(await db.get(`SELECT p.* FROM passagem_turno p LEFT JOIN validacao_passagem v ON v.passagem_id = p.id WHERE v.id IS NULL AND p.status = 'pendente' ORDER BY p.criado_em DESC LIMIT 1`) || null);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.get('/passagem/:id', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    const row = await db.get('SELECT * FROM passagem_turno WHERE id=$1', [req.params.id]);
    if (!row) return res.status(404).json({ erro: 'Não encontrado' });
    res.json({ ...row, validacao: await db.get('SELECT * FROM validacao_passagem WHERE passagem_id=$1', [row.id]) || null });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/passagem', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  const { data, turno, sep_separados, sep_pendentes, sep_em_separacao, ck_feitos, ck_pendentes, emb_embalados, emb_pendentes, rep_procurando, rep_na_rua, separadores_presentes, ocorrencias } = req.body;
  if (!data || !turno) return res.status(400).json({ erro: 'Data e turno obrigatórios' });
  const supervisor = req.session?.usuario?.nome || 'Supervisor';
  const supervisor_id = req.session?.usuario?.id || null;
  const n = v => parseInt(v) || 0;
  try {
    const existe = await db.get('SELECT id, status FROM passagem_turno WHERE data=$1 AND turno=$2', [data, turno]);
    if (existe) {
      if (existe.status === 'validado') return res.status(400).json({ erro: 'Esta passagem já foi validada.' });
      await pool.query(
        `UPDATE passagem_turno SET sep_separados=$1,sep_pendentes=$2,sep_em_separacao=$3,ck_feitos=$4,ck_pendentes=$5,emb_embalados=$6,emb_pendentes=$7,rep_procurando=$8,rep_na_rua=$9,separadores_presentes=$10,ocorrencias=$11,supervisor=$12,supervisor_id=$13 WHERE id=$14`,
        [n(sep_separados),n(sep_pendentes),n(sep_em_separacao),n(ck_feitos),n(ck_pendentes),n(emb_embalados),n(emb_pendentes),n(rep_procurando),n(rep_na_rua),separadores_presentes||'',ocorrencias||'',supervisor,supervisor_id,existe.id]
      );
      return res.json({ mensagem: 'Passagem atualizada!', id: existe.id });
    }
    const r = await pool.query(
      `INSERT INTO passagem_turno (data,turno,supervisor,supervisor_id,sep_separados,sep_pendentes,sep_em_separacao,ck_feitos,ck_pendentes,emb_embalados,emb_pendentes,rep_procurando,rep_na_rua,separadores_presentes,ocorrencias,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'pendente') RETURNING id`,
      [data,turno,supervisor,supervisor_id,n(sep_separados),n(sep_pendentes),n(sep_em_separacao),n(ck_feitos),n(ck_pendentes),n(emb_embalados),n(emb_pendentes),n(rep_procurando),n(rep_na_rua),separadores_presentes||'',ocorrencias||'']
    );
    req.app.get('io')?.emit('passagem:nova', { data, turno });
    res.json({ mensagem: 'Passagem registrada!', id: r.rows[0].id });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/passagem/:id/validar', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  const passagem_id = parseInt(req.params.id);
  if (!passagem_id) return res.status(400).json({ erro: 'ID inválido' });
  const { turno_entrando, resultados, obs_geral } = req.body;
  if (!turno_entrando || !resultados) return res.status(400).json({ erro: 'Turno e resultados obrigatórios' });
  const supervisor = req.session?.usuario?.nome || 'Supervisor';
  const supervisor_id = req.session?.usuario?.id || null;
  try {
    const passagem = await db.get('SELECT * FROM passagem_turno WHERE id=$1', [passagem_id]);
    if (!passagem) return res.status(404).json({ erro: 'Passagem não encontrada' });
    if (passagem.status === 'validado') return res.status(400).json({ erro: 'Passagem já foi validada' });
    if (await db.get('SELECT id FROM validacao_passagem WHERE passagem_id=$1', [passagem_id])) return res.status(400).json({ erro: 'Passagem já foi validada' });

    let pontos_perdidos = 0;
    for (const [campo, ok] of Object.entries(resultados))
      if (!ok && PONTOS_POR_CAMPO[campo]) pontos_perdidos += PONTOS_POR_CAMPO[campo];

    await pool.query(
      `INSERT INTO validacao_passagem (passagem_id,turno_entrando,supervisor_entrando,supervisor_id,resultados,obs_geral,pontos_perdidos) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [passagem_id, turno_entrando, supervisor, supervisor_id, JSON.stringify(resultados), obs_geral||'', pontos_perdidos]
    );
    const temContestacao = Object.values(resultados).some(v => !v);
    await pool.query(`UPDATE passagem_turno SET status=$1 WHERE id=$2`, [temContestacao ? 'contestado' : 'validado', passagem_id]);
    if (pontos_perdidos > 0) {
      await garantirPlacar();
      await pool.query(`UPDATE placar_turno SET pontos = GREATEST(0, pontos - $1) WHERE turno=$2`, [pontos_perdidos, passagem.turno]);
    }
    req.app.get('io')?.emit('passagem:validada', { passagem_id, pontos_perdidos, turno: passagem.turno });
    res.json({ mensagem: 'Validação registrada!', pontos_perdidos, status: temContestacao ? 'contestado' : 'validado' });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/passagem/placar/resetar', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  const { turno } = req.body;
  if (!turno) return res.status(400).json({ erro: 'Turno obrigatório' });
  try {
    await garantirPlacar();
    await pool.query('UPDATE placar_turno SET pontos=1000 WHERE turno=$1', [turno]);
    res.json({ mensagem: `Placar do turno ${turno} resetado para 1000 pontos.` });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
