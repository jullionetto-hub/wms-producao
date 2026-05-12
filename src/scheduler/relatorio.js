'use strict';
// Agendador de relatórios diários usando node-cron.
// Substitui o setTimeout frágil do index.js original.
// Instale a dependência: npm install node-cron

const cron               = require('node-cron');
const { gerarRelatorio }  = require('../../lib/relatorio');
const { db }             = require('../../lib/db');
const { dataHoraLocal }  = require('../../lib/helpers');
const log                = require('../../lib/logger');

async function verificarRelatoriosPerdidos() {
  try {
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const dataOntem = ontem.toISOString().split('T')[0];
    const existe = await db.get('SELECT id FROM relatorios_diarios WHERE data=$1', [dataOntem]);
    if (!existe) {
      log.info({ data: dataOntem }, 'gerando relatório perdido de ontem');
      await gerarRelatorio(dataOntem);
    }
  } catch (e) {
    log.error({ err: e }, 'erro ao verificar relatórios perdidos');
  }
}

function iniciarScheduler() {
  // Roda todo dia às 23:55 no fuso de Brasília
  cron.schedule('55 23 * * *', async () => {
    try {
      const { data } = dataHoraLocal();
      const existe = await db.get('SELECT id FROM relatorios_diarios WHERE data=$1', [data]);
      if (!existe) {
        log.info({ data }, 'gerando relatório diário agendado');
        await gerarRelatorio(data);
        log.info({ data }, 'relatório diário gerado com sucesso');
      }
    } catch (e) {
      log.error({ err: e }, 'erro ao gerar relatório diário');
    }
  }, { timezone: 'America/Sao_Paulo' });

  log.info('scheduler de relatório diário iniciado (23:55 BRT)');
}

module.exports = { iniciarScheduler, verificarRelatoriosPerdidos };
