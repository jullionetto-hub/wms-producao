/* ══ Detecção de Anomalias — routes/anomalias.js ══
   V11 da evolução do WMS: compara o ritmo de hoje de cada separador com o
   PRÓPRIO histórico (últimos 30 dias, excluindo hoje) — nunca contra a
   média da equipe, já que cada pessoa tem seu ritmo normal. Cálculo puro
   testado em lib/anomalias.js; esta rota só busca os 2 números reais que
   ele precisa (itens e horas trabalhadas, hoje e no histórico).
══════════════════════════════════════════════════════════════════════ */
'use strict';
const express = require('express');
const router  = express.Router();
const { db } = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');
const { dataHoraLocal } = require('../lib/helpers');
const { detectarAnomalias } = require('../lib/anomalias');

const DIAS_HISTORICO = 30;

router.get('/anomalias/ritmo', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  try {
    const { data: hoje } = dataHoraLocal();
    const inicioHistorico = await db.get(`SELECT TO_CHAR($1::date - INTERVAL '${DIAS_HISTORICO} days', 'YYYY-MM-DD') AS d`, [hoje]);
    const desde = inicioHistorico.d;

    const rows = await db.all(`
      WITH hoje AS (
        SELECT p.separador_id,
          SUM(p.total_itens) AS itens,
          SUM(EXTRACT(EPOCH FROM (NULLIF(p.concluido_em,'')::timestamp - NULLIF(p.iniciado_em,'')::timestamp)) / 3600.0) AS horas
        FROM pedidos p
        WHERE p.status='concluido' AND p.data_pedido=$1 AND p.separador_id IS NOT NULL
          AND p.iniciado_em <> '' AND p.concluido_em <> ''
        GROUP BY p.separador_id
      ),
      historico AS (
        SELECT p.separador_id,
          SUM(p.total_itens) AS itens,
          SUM(EXTRACT(EPOCH FROM (NULLIF(p.concluido_em,'')::timestamp - NULLIF(p.iniciado_em,'')::timestamp)) / 3600.0) AS horas
        FROM pedidos p
        WHERE p.status='concluido' AND p.data_pedido >= $2 AND p.data_pedido < $1 AND p.separador_id IS NOT NULL
          AND p.iniciado_em <> '' AND p.concluido_em <> ''
        GROUP BY p.separador_id
      )
      SELECT h.separador_id, s.nome,
        h.itens AS itens_hoje, h.horas AS horas_hoje,
        COALESCE(hist.itens, 0) AS itens_historico, COALESCE(hist.horas, 0) AS horas_historico
      FROM hoje h
      LEFT JOIN historico hist ON hist.separador_id = h.separador_id
      LEFT JOIN separadores s ON s.id = h.separador_id
    `, [hoje, desde]);

    const anomalias = detectarAnomalias(rows.map(r => ({
      nome: r.nome || `Separador #${r.separador_id}`,
      itensHoje: Number(r.itens_hoje) || 0,
      horasHoje: Number(r.horas_hoje) || 0,
      itensHistorico: Number(r.itens_historico) || 0,
      horasHistorico: Number(r.horas_historico) || 0,
    })));

    res.json({ anomalias, periodo_historico_desde: desde });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
