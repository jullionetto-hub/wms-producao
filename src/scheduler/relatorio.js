/**
 * src/scheduler/relatorio.js
 * Agenda a geração automática do relatório diário via node-cron.
 *
 * Dependência: npm install node-cron
 */

const cron = require('node-cron');
const env  = require('../config/env');

/**
 * @param {() => Promise<void>} gerarFn  Função que gera o relatório do dia
 */
function agendarRelatorio(gerarFn) {
  if (!cron.validate(env.RELATORIO_CRON)) {
    console.error(`[scheduler] Expressão cron inválida: ${env.RELATORIO_CRON}`);
    return;
  }

  cron.schedule(env.RELATORIO_CRON, async () => {
    console.log(`[scheduler] Gerando relatório diário — ${new Date().toLocaleString('pt-BR')}`);
    try {
      await gerarFn();
      console.log('[scheduler] Relatório gerado com sucesso.');
    } catch (err) {
      console.error('[scheduler] Erro ao gerar relatório:', err.message);
    }
  }, {
    timezone: env.TZ,
  });

  console.log(`[scheduler] Relatório agendado: "${env.RELATORIO_CRON}" (${env.TZ})`);
}

module.exports = { agendarRelatorio };
