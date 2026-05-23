'use strict';
/**
 * src/scheduler/relatorio.js
 * Agenda a geração automática do relatório diário.
 *
 * Dependência: npm install node-cron
 */

const cron = require('node-cron');
const env  = require('../config/env');
const db   = require('../../lib/db');
const { dataHoraLocal } = require('../../lib/helpers');

// ── Gera o relatório do dia e salva na tabela relatorios_diarios ──────────────
async function gerarRelatorio() {
  const { data } = dataHoraLocal();

  const totais = db.prepare(`
    SELECT
      COUNT(*)                                              AS total,
      SUM(CASE WHEN status = 'concluido'   THEN 1 ELSE 0 END) AS concluidos,
      SUM(CASE WHEN status = 'pendente'    THEN 1 ELSE 0 END) AS pendentes,
      SUM(CASE WHEN status = 'separando'   THEN 1 ELSE 0 END) AS em_separacao
    FROM pedidos
    WHERE DATE(importado_em) = ?
  `).get(data);

  const separadores = db.prepare(`
    SELECT u.nome, COUNT(p.id) AS qtd
    FROM pedidos p
    JOIN usuarios u ON u.id = p.separador_id
    WHERE DATE(p.concluido_em) = ? AND p.status = 'concluido'
    GROUP BY u.id
    ORDER BY qtd DESC
  `).all(data);

  const conteudo = JSON.stringify({ data, totais, separadores });

  db.prepare(`
    INSERT INTO relatorios_diarios (data, conteudo)
    VALUES (?, ?)
    ON CONFLICT(data) DO UPDATE SET conteudo = excluded.conteudo
  `).run(data, conteudo);

  console.log(`[relatorio] Salvo para ${data}: ${totais.total} pedidos, ${totais.concluidos} concluídos.`);
}

// ── Verifica se algum relatório do dia anterior não foi gerado ───────────────
function verificarRelatoriosPerdidos() {
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const dataOntem = ontem.toISOString().slice(0, 10);

  const existe = db.prepare('SELECT id FROM relatorios_diarios WHERE data = ?').get(dataOntem);
  if (!existe) {
    console.log(`[scheduler] Relatório de ontem (${dataOntem}) ausente — gerando agora...`);
    gerarRelatorio().catch((e) => console.error('[scheduler] Erro ao recuperar relatório perdido:', e.message));
  }
}

// ── Inicia o cron job ─────────────────────────────────────────────────────────
function iniciarScheduler() {
  if (!cron.validate(env.RELATORIO_CRON)) {
    console.error(`[scheduler] Expressão cron inválida: ${env.RELATORIO_CRON}`);
    return;
  }

  cron.schedule(env.RELATORIO_CRON, () => {
    console.log(`[scheduler] Disparando relatório — ${new Date().toLocaleString('pt-BR')}`);
    gerarRelatorio().catch((e) => console.error('[scheduler] Erro:', e.message));
  }, { timezone: env.TZ });

  console.log(`[scheduler] Agendado: "${env.RELATORIO_CRON}" (${env.TZ})`);
}

module.exports = { iniciarScheduler, verificarRelatoriosPerdidos };
