const express = require('express');
const router  = express.Router();
const { db, pool } = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');
const { dataHoraLocal } = require('../lib/helpers');

const PONTOS_POR_CAMPO = {
  pedidos_separados: 100,
  checkouts_feitos:  100,
  faltas_abertas:    100,
  faltas_resolvidas: 100,
  embalagem:         100,
  separadores_presentes: 50,
  ocorrencias:       50,
};

// Garante que os 3 turnos existem no placar
async function garantirPlacar() {
  for (const t of ['Manha','Tarde','Noite']) {
    await pool.query(
      `INSERT INTO placar_turno (turno, pontos) VALUES ($1, 1000) ON CONFLICT (turno) DO NOTHING`,
      [t]
    );
  }
}

// Lista passagens (histórico)
router.get('/passagem', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT p.*, v.pontos_perdidos, v.supervisor_entrando, v.validado_em
       FROM passagem_turno p
       LEFT JOIN validacao_passagem v ON v.passagem_id = p.id
       ORDER BY p.criado_em DESC LIMIT 50`
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Placar dos turnos
router.get('/passagem/placar', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    await garantirPlacar();
    const placar = await db.all('SELECT * FROM placar_turno ORDER BY pontos DESC');
    const historico = await db.all(
      `SELECT v.*, p.turno as turno_saindo, p.data
       FROM validacao_passagem v
       JOIN passagem_turno p ON p.id = v.passagem_id
       ORDER BY v.validado_em DESC LIMIT 20`
    );
    res.json({ placar, historico });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Passagem pendente de validação para o turno seguinte
router.get('/passagem/pendente', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    const row = await db.get(
      `SELECT p.* FROM passagem_turno p
       LEFT JOIN validacao_passagem v ON v.passagem_id = p.id
       WHERE v.id IS NULL AND p.status = 'pendente'
       ORDER BY p.criado_em DESC LIMIT 1`
    );
    if (!row) return res.json(null);
    if (typeof row.dados === 'string') try { row.dados = JSON.parse(row.dados); } catch(e) {}
    res.json(row);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Busca passagem por id
router.get('/passagem/:id', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    const row = await db.get('SELECT * FROM passagem_turno WHERE id=$1', [req.params.id]);
    if (!row) return res.status(404).json({ erro: 'Não encontrado' });
    const val = await db.get('SELECT * FROM validacao_passagem WHERE passagem_id=$1', [row.id]);
    res.json({ ...row, validacao: val || null });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Cria ou atualiza passagem do turno saindo
router.post('/passagem', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  const { data, turno, pedidos_separados, checkouts_feitos, faltas_abertas,
          faltas_resolvidas, embalagem, separadores_presentes, ocorrencias } = req.body;
  if (!data || !turno) return res.status(400).json({ erro: 'Data e turno obrigatórios' });
  const supervisor = req.session?.usuario?.nome || 'Supervisor';
  const supervisor_id = req.session?.usuario?.id || null;
  try {
    const existe = await db.get('SELECT id, status FROM passagem_turno WHERE data=$1 AND turno=$2', [data, turno]);
    if (existe) {
      if (existe.status === 'validado') return res.status(400).json({ erro: 'Esta passagem já foi validada e não pode ser editada.' });
      await pool.query(
        `UPDATE passagem_turno SET pedidos_separados=$1, checkouts_feitos=$2, faltas_abertas=$3,
         faltas_resolvidas=$4, embalagem=$5, separadores_presentes=$6, ocorrencias=$7, supervisor=$8, supervisor_id=$9
         WHERE id=$10`,
        [pedidos_separados||0, checkouts_feitos||0, faltas_abertas||0, faltas_resolvidas||0,
         embalagem||0, separadores_presentes||'', ocorrencias||'', supervisor, supervisor_id, existe.id]
      );
      res.json({ mensagem: 'Passagem atualizada!', id: existe.id });
    } else {
      const r = await pool.query(
        `INSERT INTO passagem_turno (data, turno, supervisor, supervisor_id, pedidos_separados, checkouts_feitos,
         faltas_abertas, faltas_resolvidas, embalagem, separadores_presentes, ocorrencias, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pendente') RETURNING id`,
        [data, turno, supervisor, supervisor_id, pedidos_separados||0, checkouts_feitos||0,
         faltas_abertas||0, faltas_resolvidas||0, embalagem||0, separadores_presentes||'', ocorrencias||'']
      );
      req.app.get('io')?.emit('passagem:nova', { data, turno });
      res.json({ mensagem: 'Passagem registrada!', id: r.rows[0].id });
    }
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Valida passagem (turno que entra)
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
    const jaValidou = await db.get('SELECT id FROM validacao_passagem WHERE passagem_id=$1', [passagem_id]);
    if (jaValidou) return res.status(400).json({ erro: 'Passagem já foi validada' });

    // Calcula pontos perdidos
    let pontos_perdidos = 0;
    for (const [campo, ok] of Object.entries(resultados)) {
      if (!ok && PONTOS_POR_CAMPO[campo]) pontos_perdidos += PONTOS_POR_CAMPO[campo];
    }

    // Registra validação
    await pool.query(
      `INSERT INTO validacao_passagem (passagem_id, turno_entrando, supervisor_entrando, supervisor_id, resultados, obs_geral, pontos_perdidos)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [passagem_id, turno_entrando, supervisor, supervisor_id, JSON.stringify(resultados), obs_geral||'', pontos_perdidos]
    );

    // Marca passagem como validada ou contestada
    const temContestacao = Object.values(resultados).some(v => !v);
    await pool.query(
      `UPDATE passagem_turno SET status=$1 WHERE id=$2`,
      [temContestacao ? 'contestado' : 'validado', passagem_id]
    );

    // Desconta pontos do turno que saiu
    if (pontos_perdidos > 0) {
      await garantirPlacar();
      await pool.query(
        `UPDATE placar_turno SET pontos = GREATEST(0, pontos - $1) WHERE turno=$2`,
        [pontos_perdidos, passagem.turno]
      );
    }

    req.app.get('io')?.emit('passagem:validada', { passagem_id, pontos_perdidos, turno: passagem.turno });
    res.json({ mensagem: 'Validação registrada!', pontos_perdidos, status: temContestacao ? 'contestado' : 'validado' });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// Reseta placar de um turno (supervisor master)
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
