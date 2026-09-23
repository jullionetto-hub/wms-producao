/* ══ Hora a Hora — routes/hora-a-hora.js ══
   V10 da evolução do WMS: painel de Embalagem, Expedição (Checkout) e
   Faturamento hora a hora — meta/realizado/ritmo/previsão. Embalagem e
   Expedição já tinham dado hora-a-hora exposto (GET /dashboard/por-hora,
   usado no gráfico "Produção por Hora" do Dashboard) mas sem ritmo/previsão
   calculados; Faturamento é 100% novo (ver routes/faturamento.js). Esta
   rota não duplica /dashboard/por-hora — faz sua própria leitura das mesmas
   tabelas (embalagem, checkout) porque aqui a unidade é sempre "pedidos",
   nunca misturada com os outros 2 setores (separação/reposição) daquele
   gráfico, e porque precisa do total do dia (não só os buckets) pra
   calcular ritmo/previsão.
══════════════════════════════════════════════════════════════════════ */
'use strict';
const express = require('express');
const router  = express.Router();
const { db } = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');
const { dataHoraLocal, turnoAtualEHorarios } = require('../lib/helpers');
const { bucketsPorHora, ritmoEPrevisao, inicioTurnoTimestamp } = require('../lib/hora-a-hora');

async function metasConfiguradas() {
  const rows = await db.all(
    `SELECT chave, valor FROM configuracoes WHERE chave IN ('meta_embalagem','meta_checkout','meta_faturamento')`
  );
  const porChave = Object.fromEntries(rows.map(r => [r.chave, parseFloat(r.valor)]));
  return {
    embalagem: porChave.meta_embalagem || 120,
    expedicao: porChave.meta_checkout || 90,
    faturamento: porChave.meta_faturamento || 0, // sem default "chutado" — 0 = sem_meta até o supervisor configurar
  };
}

router.get('/hora-a-hora', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  try {
    const { data: hoje } = dataHoraLocal();
    const { turno, minutos_restantes } = turnoAtualEHorarios();
    const metas = await metasConfiguradas();

    const horasTurnoRow = await db.get(
      `SELECT valor FROM configuracoes WHERE chave=$1`,
      [`horas_turno_${turno === 'Manha' ? 'manha' : turno === 'Tarde' ? 'tarde' : 'noite'}`]
    );
    const horasTurno = parseFloat(horasTurnoRow?.valor) || (turno === 'Noite' ? 6 : 8);
    const minutosDecorridos = Math.max(horasTurno * 60 - minutos_restantes, 0);

    const [embRows, ckRows, fatRows] = await Promise.all([
      db.all(`SELECT embalado_em AS hora FROM embalagem WHERE data_embalagem=$1 AND embalado_em <> ''`, [hoje]),
      db.all(`SELECT hora_checkout AS hora FROM checkout WHERE data_checkout=$1 AND status='concluido' AND hora_checkout <> ''`, [hoje]),
      db.all(`SELECT hora_fat AS hora, faturado FROM faturamento_pedidos WHERE data_fat=$1 AND hora_fat <> ''`, [hoje]),
    ]);

    const bucketsEmb = bucketsPorHora(embRows, 'hora');
    const bucketsCk  = bucketsPorHora(ckRows, 'hora');
    const bucketsFat = bucketsPorHora(fatRows, 'hora', 'faturado');

    const realizadoEmb = bucketsEmb.reduce((s, v) => s + v, 0);
    const realizadoCk  = bucketsCk.reduce((s, v) => s + v, 0);
    const realizadoFat = Math.round(bucketsFat.reduce((s, v) => s + v, 0) * 100) / 100;

    res.json({
      turno_atual: turno,
      minutos_restantes_turno: minutos_restantes,
      embalagem:   { ...ritmoEPrevisao(realizadoEmb, metas.embalagem, minutosDecorridos, minutos_restantes), buckets: bucketsEmb },
      expedicao:   { ...ritmoEPrevisao(realizadoCk,  metas.expedicao, minutosDecorridos, minutos_restantes), buckets: bucketsCk },
      faturamento: { ...ritmoEPrevisao(realizadoFat, metas.faturamento, minutosDecorridos, minutos_restantes), buckets: bucketsFat },
    });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ── GET /hora-a-hora/pedidos — anúncio operacional (Separação/Checkout/
// Embalagem em PEDIDOS, não itens/R$) ──────────────────────────────────
// Mesma janela de "última hora" já usada no Control Tower (lib/control-tower)
// pra produção atual, mas contando PEDIDOS (COUNT) em vez de ITENS (SUM) —
// unidade diferente, pedida especificamente pro anúncio sonoro. O "gap pra
// meta do turno" é só de Checkout (a etapa que "puxa o resultado", segundo
// o usuário) — meta configurável por turno (meta_checkout_manha/tarde/
// noite), diferente da meta_checkout genérica (pedidos/turno) já usada no
// Control Tower/Hora a Hora — essa aqui é especificamente por turno de
// verdade, com valores diferentes por turno (ex: manhã 300, tarde 250).
router.get('/hora-a-hora/pedidos', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  try {
    const { data: hoje, hora: horaAgoraStr } = dataHoraLocal();
    const { turno } = turnoAtualEHorarios();
    const horaAgora = parseInt(horaAgoraStr.slice(0, 2), 10);
    const inicioTurno = inicioTurnoTimestamp(turno, hoje, horaAgora);

    const metaRow = await db.get(
      `SELECT valor FROM configuracoes WHERE chave=$1`,
      [`meta_checkout_${turno === 'Manha' ? 'manha' : turno === 'Tarde' ? 'tarde' : 'noite'}`]
    );
    const metaCheckoutTurno = parseFloat(metaRow?.valor) || 0; // 0 = sem meta configurada pra esse turno

    const [sepUltHora, ckUltHora, embUltHora, ckTurnoAtual] = await Promise.all([
      db.get(`SELECT COUNT(*)::int AS n FROM pedidos
        WHERE status='concluido' AND concluido_em <> ''
          AND concluido_em::timestamp >= NOW() AT TIME ZONE 'America/Sao_Paulo' - INTERVAL '60 minutes'`),
      db.get(`SELECT COUNT(*)::int AS n FROM checkout
        WHERE status='concluido' AND hora_checkout <> '' AND data_checkout=$1
          AND (data_checkout || 'T' || hora_checkout)::timestamp >= NOW() AT TIME ZONE 'America/Sao_Paulo' - INTERVAL '60 minutes'`, [hoje]),
      db.get(`SELECT COUNT(*)::int AS n FROM embalagem
        WHERE embalado_em <> '' AND data_embalagem=$1
          AND (data_embalagem || 'T' || embalado_em)::timestamp >= NOW() AT TIME ZONE 'America/Sao_Paulo' - INTERVAL '60 minutes'`, [hoje]),
      db.get(`SELECT COUNT(*)::int AS n FROM checkout
        WHERE status='concluido' AND hora_checkout <> '' AND data_checkout <> ''
          AND (data_checkout || ' ' || hora_checkout)::timestamp >= $1::timestamp`, [inicioTurno]),
    ]);

    const checkoutTurnoAtual = ckTurnoAtual.n;
    const gapCheckout = metaCheckoutTurno > 0 ? Math.max(0, metaCheckoutTurno - checkoutTurnoAtual) : null;

    res.json({
      turno_atual: turno,
      separacao_ultima_hora: sepUltHora.n,
      checkout_ultima_hora: ckUltHora.n,
      embalagem_ultima_hora: embUltHora.n,
      checkout_turno_atual: checkoutTurnoAtual,
      meta_checkout_turno: metaCheckoutTurno,
      gap_checkout_meta: gapCheckout,
    });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
