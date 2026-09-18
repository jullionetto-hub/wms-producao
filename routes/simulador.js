/* ══ Simulador de Capacidade — routes/simulador.js ══
   V11 da evolução do WMS: "E se eu adicionar/remover N pessoas nesse
   processo agora?" — reaproveita as mesmas consultas do Control Tower
   (produção atual, volume restante) e só adiciona a contagem de pessoas
   realmente ativas na última hora (mesma janela), pra derivar produtividade
   por pessoa. O cálculo em si é puro e testado em lib/simulador.js.
══════════════════════════════════════════════════════════════════════ */
'use strict';
const express = require('express');
const router  = express.Router();
const { db } = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');
const { dataHoraLocal, turnoAtualEHorarios } = require('../lib/helpers');
const { simularCapacidade } = require('../lib/simulador');
const { metricasSeparacao, metricasCheckout, metricasEmbalagem } = require('./control-tower');

// Pessoas realmente ativas na última hora — mesma janela usada pra medir
// "produção atual" no Control Tower, pra manter a produtividade/pessoa
// coerente com o número que ela divide.
async function pessoasAtivasSeparacao() {
  const r = await db.get(`SELECT COUNT(DISTINCT separador_id)::int AS n FROM pedidos
    WHERE status='concluido' AND separador_id IS NOT NULL AND concluido_em <> ''
      AND concluido_em::timestamptz >= NOW() - INTERVAL '60 minutes'`);
  return r?.n || 0;
}
async function pessoasAtivasCheckout(hoje) {
  const r = await db.get(`SELECT COUNT(DISTINCT operador_nome)::int AS n FROM checkout
    WHERE status='concluido' AND operador_nome <> '' AND hora_checkout <> '' AND data_checkout=$1
      AND (data_checkout || 'T' || hora_checkout)::timestamp >= NOW() AT TIME ZONE 'America/Sao_Paulo' - INTERVAL '60 minutes'`, [hoje]);
  return r?.n || 0;
}
async function pessoasAtivasEmbalagem(hoje) {
  const r = await db.get(`SELECT COUNT(DISTINCT embalado_por)::int AS n FROM embalagem
    WHERE embalado_por <> '' AND embalado_em <> '' AND data_embalagem=$1
      AND (data_embalagem || 'T' || embalado_em)::timestamp >= NOW() AT TIME ZONE 'America/Sao_Paulo' - INTERVAL '60 minutes'`, [hoje]);
  return r?.n || 0;
}

const PROCESSOS = ['separacao', 'checkout', 'embalagem'];

router.get('/simulador/capacidade', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  try {
    const processo = String(req.query.processo || '').trim();
    const delta = parseInt(req.query.delta, 10);
    if (!PROCESSOS.includes(processo)) return res.status(400).json({ erro: `processo deve ser um de: ${PROCESSOS.join(', ')}` });
    if (Number.isNaN(delta)) return res.status(400).json({ erro: 'delta (número de pessoas a adicionar/remover) é obrigatório' });

    const { data: hoje } = dataHoraLocal();
    const { minutos_restantes } = turnoAtualEHorarios();

    const [metricas, pessoasAtivas] = await Promise.all([
      processo === 'separacao' ? metricasSeparacao(hoje) : processo === 'checkout' ? metricasCheckout(hoje) : metricasEmbalagem(hoje),
      processo === 'separacao' ? pessoasAtivasSeparacao() : processo === 'checkout' ? pessoasAtivasCheckout(hoje) : pessoasAtivasEmbalagem(hoje),
    ]);

    const resultado = simularCapacidade(
      { producaoAtualH: metricas.producaoAtualH, pessoasAtivas, volumeRestante: metricas.volumeRestante },
      delta,
      minutos_restantes
    );
    res.json({ processo, delta, minutos_restantes_turno: minutos_restantes, ...resultado });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
