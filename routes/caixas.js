const express = require('express');
const router = express.Router();
const { db, pool } = require('../lib/db');
const { requerAuth } = require('../lib/auth');
const { dataHoraLocal } = require('../lib/helpers');

const TOTAL_CAIXAS = 10;

// Status de cada uma das 10 caixas na data informada: pega a conferência
// mais recente de cada número (pode ter sido feita em outro dia, se hoje
// ainda não foi conferida) pra nunca mostrar uma caixa "sem informação".
router.get('/caixas/checklist', requerAuth, async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT DISTINCT ON (numero) *
      FROM checklist_caixas
      ORDER BY numero, criado_em DESC
    `);
    const porNumero = {};
    rows.forEach(r => { porNumero[r.numero] = r; });
    const hoje = req.query.data || dataHoraLocal().data;
    const caixas = Array.from({ length: TOTAL_CAIXAS }, (_, i) => {
      const n = i + 1;
      const c = porNumero[n] || null;
      return {
        numero: n,
        ultima: c,
        ok: c ? (c.organizada && c.limpa && !c.produtos_espalhados && !c.objetos_indevidos) : null,
        conferida_hoje: c ? c.data === hoje : false,
      };
    });
    res.json(caixas);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.get('/caixas/:numero/historico', requerAuth, async (req, res) => {
  const numero = parseInt(req.params.numero);
  if (!numero || numero < 1 || numero > TOTAL_CAIXAS) return res.status(400).json({ erro: 'Caixa inválida' });
  try {
    const rows = await db.all(
      `SELECT * FROM checklist_caixas WHERE numero=$1 ORDER BY criado_em DESC LIMIT 30`,
      [numero]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.post('/caixas/:numero/checklist', requerAuth, async (req, res) => {
  const numero = parseInt(req.params.numero);
  if (!numero || numero < 1 || numero > TOTAL_CAIXAS) return res.status(400).json({ erro: 'Caixa inválida' });
  const { organizada, limpa, produtos_espalhados, objetos_indevidos, observacoes } = req.body;
  const { data, hora } = dataHoraLocal();
  const usuario_nome = req.session?.usuario?.nome || '';
  try {
    const r = await pool.query(
      `INSERT INTO checklist_caixas
         (numero, data, hora, usuario_nome, organizada, limpa, produtos_espalhados, objetos_indevidos, observacoes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [numero, data, hora, usuario_nome, !!organizada, !!limpa, !!produtos_espalhados, !!objetos_indevidos, observacoes || '']
    );
    res.json({ mensagem: 'Checklist registrado!', id: r.rows[0].id });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
