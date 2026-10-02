/* ══ Simulador de Capacidade — cálculo puro (sem banco) ══
   V11 da evolução do WMS: "E se eu adicionar/remover N pessoas nesse
   processo agora?" Reaproveita a mesma matemática do Control Tower
   (lib/control-tower.js: calcularSituacao) — só troca a produção atual
   medida pela produção SIMULADA (produtividade média por pessoa × número
   de pessoas simulado), mantendo volume restante e tempo de turno reais.
   Nenhum número aqui é inventado: a produtividade por pessoa vem de dividir
   dois números reais (produção atual da equipe ÷ pessoas realmente ativas
   na última hora).
══════════════════════════════════════════════════════════════════════ */
const { calcularSituacao } = require('./control-tower');

function simularCapacidade({ producaoAtualH, pessoasAtivas, volumeRestante }, deltaPessoas, minutosRestantesTurno) {
  const produtividadePorPessoa = pessoasAtivas > 0 ? producaoAtualH / pessoasAtivas : 0;
  const pessoasSimuladas = Math.max(pessoasAtivas + deltaPessoas, 0);
  const producaoSimuladaH = Math.round(produtividadePorPessoa * pessoasSimuladas);
  const tempoEstimadoMin = producaoSimuladaH > 0 ? Math.round((volumeRestante / producaoSimuladaH) * 60) : null;
  const situacao = calcularSituacao(tempoEstimadoMin, minutosRestantesTurno, volumeRestante);
  return {
    pessoas_ativas: pessoasAtivas,
    pessoas_simuladas: pessoasSimuladas,
    produtividade_por_pessoa_h: Math.round(produtividadePorPessoa * 10) / 10,
    producao_atual_h: producaoAtualH,
    producao_simulada_h: producaoSimuladaH,
    volume_restante: volumeRestante,
    tempo_estimado_min: tempoEstimadoMin,
    situacao,
  };
}

module.exports = { simularCapacidade };
