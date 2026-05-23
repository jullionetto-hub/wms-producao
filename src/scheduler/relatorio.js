'use strict';
/**
 * src/scheduler/relatorio.js
 * Agenda a geração automática do relatório diário via node-cron.
 * Reutiliza a lógica já existente em lib/relatorio.js.
 */

const cron                  = require('node-cron');
const env                   = require('../config/env');
const { gerarRelatorio }    = require('../../lib/relatorio');
const { dataHoraLocal }     = require('../../lib/helpers');

// ── Verifica se o relatório de ontem foi perdido ─────────────────────────────
async function verificarRelatoriosPerdidos() {
  try {
    const { pool } = require('../../lib/db');
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const dataOntem = ontem.toISOString().slice(0, 10);

    const { rows } = await pool.query(
      'SELECT id FROM relatorios_diarios WHERE data = $1',
      [dataOntem]
    );

    if (rows.length === 0) {
      console.log(`[scheduler] Relatório de ontem (${dataOntem}) ausente — gerando agora...`);
      await gerarRelatorio(dataOntem);
    }
  } catch (e) {
    console.error('[scheduler] Erro ao verificar relatórios perdidos:', e.message);
  }
}

// ── Inicia o cron job ─────────────────────────────────────────────────────────
function iniciarScheduler() {
  if (!cron.validate(env.RELATORIO_CRON)) {
    console.error(`[scheduler] Expressão cron inválida: ${env.RELATORIO_CRON}`);
    return;
  }

  cron.schedule(env.RELATORIO_CRON, async () => {
    const { data } = dataHoraLocal();
    console.log(`[scheduler] Gerando relatório — ${data}`);
    try {
      await gerarRelatorio(data);
      console.log('[scheduler] Relatório gerado com sucesso.');
    } catch (e) {
      console.error('[scheduler] Erro ao gerar relatório:', e.message);
    }
  }, { timezone: env.TZ });

  console.log(`[scheduler] Agendado: "${env.RELATORIO_CRON}" (${env.TZ})`);
}

module.exports = { iniciarScheduler, verificarRelatoriosPerdidos };
