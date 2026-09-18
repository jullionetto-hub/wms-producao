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
const { bucketsPorHora, ritmoEPrevisao } = require('../lib/hora-a-hora');

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

module.exports = router;
