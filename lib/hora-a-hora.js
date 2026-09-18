/* ══ Hora a Hora — cálculo puro (sem banco) ══
   V10 da evolução do WMS: pra Embalagem, Expedição (Checkout) e Faturamento,
   agrupa registros por hora do dia e calcula ritmo atual (unidade/h desde o
   início do turno) e previsão de fechamento (ritmo atual projetado até o fim
   do turno). Mesmo espírito do Control Tower (lib/control-tower.js): nenhum
   número aqui é inventado, só derivado de dados reais + a meta configurada.
══════════════════════════════════════════════════════════════════════ */

// Agrupa uma lista de registros em 24 posições (uma por hora do dia),
// somando um campo numérico (ou contando registros, se campoValor for null).
function bucketsPorHora(registros, campoHora, campoValor = null) {
  const buckets = Array.from({ length: 24 }, () => 0);
  for (const r of registros || []) {
    const bruto = String(r?.[campoHora] || '');
    const h = parseInt(bruto.slice(0, 2), 10);
    if (Number.isNaN(h) || h < 0 || h > 23) continue;
    buckets[h] += campoValor ? (Number(r[campoValor]) || 0) : 1;
  }
  return buckets;
}

// Situação: compara a previsão de fechamento do turno contra a meta —
// mesmas faixas de tolerância do Control Tower (>=100% dentro do prazo,
// >=85% risco, abaixo disso atrasado), adaptado pra um processo de
// ACÚMULO ao longo do turno (não uma fila que se esvazia).
function calcularSituacaoHoraAHora(previsaoFimTurno, metaTurno) {
  if (!metaTurno || metaTurno <= 0) return 'sem_meta';
  const pct = previsaoFimTurno / metaTurno;
  if (pct >= 1) return 'dentro_do_prazo';
  if (pct >= 0.85) return 'risco';
  return 'atrasado';
}

// realizadoAteAgora: soma real já ocorrida no turno até agora.
// metaTurno: meta configurada pro turno inteiro (mesma unidade de realizado).
// minutosDecorridosTurno / minutosRestantesTurno: janela real de turno.
function ritmoEPrevisao(realizadoAteAgora, metaTurno, minutosDecorridosTurno, minutosRestantesTurno) {
  const horasDecorridas = Math.max(minutosDecorridosTurno, 1) / 60;
  const ritmoHora = Math.round((realizadoAteAgora / horasDecorridas) * 10) / 10;
  const horasRestantes = Math.max(minutosRestantesTurno, 0) / 60;
  const previsaoFimTurno = Math.round(realizadoAteAgora + ritmoHora * horasRestantes);
  const situacao = calcularSituacaoHoraAHora(previsaoFimTurno, metaTurno);
  const pctMeta = metaTurno > 0 ? Math.round((realizadoAteAgora / metaTurno) * 1000) / 10 : null;
  return {
    realizado: realizadoAteAgora,
    meta: metaTurno,
    ritmo_hora: ritmoHora,
    previsao_fim_turno: previsaoFimTurno,
    pct_meta: pctMeta,
    situacao,
  };
}

module.exports = { bucketsPorHora, calcularSituacaoHoraAHora, ritmoEPrevisao };
