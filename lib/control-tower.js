/* ══ Control Tower — cálculo puro (sem banco) ══
   routes/control-tower.js busca os dados reais; este módulo só faz a conta,
   pra poder ser testado isoladamente (mesmo padrão de lib/pontuacao.js).
══════════════════════════════════════════════════════════════════════ */

// Situação: compara o tempo estimado pra zerar o volume restante (no ritmo
// atual) contra o tempo que ainda resta de turno. Sem produção no momento e
// com volume represado = risco máximo, mesmo sem "tempo estimado" (infinito).
function calcularSituacao(tempoEstimadoMin, minutosRestantesTurno, volumeRestante) {
  if (volumeRestante <= 0) return 'concluido';
  if (tempoEstimadoMin == null) return 'atrasado'; // produção atual = 0, com volume represado
  if (tempoEstimadoMin <= minutosRestantesTurno) return 'dentro_do_prazo';
  if (tempoEstimadoMin <= minutosRestantesTurno * 1.25) return 'risco';
  return 'atrasado';
}

function montarProcesso(nome, { producaoAtualH, volumeRestante, mediaItensPedido }, metaPedidosTurno, horasTurno, minutosRestantesTurno) {
  const necessarioH = horasTurno > 0 ? Math.round((metaPedidosTurno * mediaItensPedido) / horasTurno) : 0;
  const gapH = producaoAtualH - necessarioH;
  const tempoEstimadoMin = producaoAtualH > 0 ? Math.round((volumeRestante / producaoAtualH) * 60) : null;
  const situacao = calcularSituacao(tempoEstimadoMin, minutosRestantesTurno, volumeRestante);
  return {
    processo: nome,
    producao_atual_h: producaoAtualH,
    necessario_h: necessarioH,
    gap_h: gapH,
    volume_restante: volumeRestante,
    tempo_estimado_min: tempoEstimadoMin,
    situacao,
  };
}

const RANK_SITUACAO = { atrasado: 3, risco: 2, dentro_do_prazo: 1, concluido: 0 };
const LABEL_PROCESSO = { separacao: 'Separação', checkout: 'Checkout', embalagem: 'Embalagem', reposicao: 'Reposição' };

// Gargalo = entre os processos em risco/atrasados, o pior (situação mais
// crítica, desempate por maior volume represado). null se ninguém está em
// risco — não "inventa" um gargalo quando tudo está dentro do prazo.
function calcularGargalo(processos) {
  const candidatos = processos.filter(p => p.situacao === 'risco' || p.situacao === 'atrasado');
  if (!candidatos.length) return null;
  candidatos.sort((a, b) =>
    RANK_SITUACAO[b.situacao] - RANK_SITUACAO[a.situacao] || b.volume_restante - a.volume_restante
  );
  const pior = candidatos[0];
  const nome = LABEL_PROCESSO[pior.processo] || pior.processo;
  const motivo = pior.producao_atual_h === 0
    ? `${nome} está sem produção registrada na última hora, com ${pior.volume_restante} itens represados.`
    : `${nome} está produzindo ${pior.producao_atual_h} itens/h, ${Math.abs(pior.gap_h)} abaixo do ritmo necessário (${pior.necessario_h} itens/h), com ${pior.volume_restante} itens ainda pendentes.`;
  return { processo: pior.processo, motivo };
}

module.exports = { calcularSituacao, montarProcesso, calcularGargalo };
