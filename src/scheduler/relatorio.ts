// Agendador de relatórios diários usando node-cron.
// Substitui o setTimeout frágil do index.js original.
// Instale a dependência: npm install node-cron

import * as cron from 'node-cron';
import { gerarRelatorio }  from '../../lib/relatorio';
import { db }             from '../../lib/db';
import { dataHoraLocal }  from '../../lib/helpers';
import log                from '../../lib/logger';

export async function verificarRelatoriosPerdidos(): Promise<void> {
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

export function iniciarScheduler(): void {
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
