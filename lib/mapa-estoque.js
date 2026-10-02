/* ══ Mapa Vivo do Estoque — cálculo puro (sem banco) ══
   V8 da evolução do WMS: combina os sinais reais já existentes (catálogo de
   produtos, colmeias, pedidos em separação agora, avisos de reposição
   pendentes) num estado por rua. Granularidade é por RUA (corredor inteiro),
   não por prateleira individual — decisão explícita do usuário, reaproveita
   o mesmo nível do Mapa do Estoque que já existia.

   Não inclui giro, curva ABCDE, estoque de segurança nem ponto de pedido —
   nenhum desses dados existe em lugar nenhum do sistema hoje, e não são
   inventados aqui (pedido explícito do usuário).
══════════════════════════════════════════════════════════════════════ */

// Prioridade de exibição quando uma rua tem mais de um estado ao mesmo tempo
// — a cor do mapa mostra sempre o mais urgente, mas TODOS os estados que se
// aplicam continuam disponíveis (ver estados[]), não só o principal.
const PRIORIDADE_ESTADO = ['ruptura', 'estoque_baixo', 'separacao', 'reposicao', 'normal'];

const LABEL_ESTADO = {
  ruptura: 'Ruptura',
  estoque_baixo: 'Estoque baixo',
  separacao: 'Separação',
  reposicao: 'Reposição',
  normal: 'Normal',
};

function montarEstadoRua({ ruptura = 0, estoqueBaixo = 0, separando = 0, reposicaoPendente = 0 } = {}) {
  const estados = [];
  if (ruptura > 0) estados.push('ruptura');
  if (estoqueBaixo > 0) estados.push('estoque_baixo');
  if (separando > 0) estados.push('separacao');
  if (reposicaoPendente > 0) estados.push('reposicao');
  if (!estados.length) estados.push('normal');

  const estadoPrincipal = PRIORIDADE_ESTADO.find(e => estados.includes(e)) || 'normal';

  return {
    estados,
    estado_principal: estadoPrincipal,
    contadores: {
      ruptura,
      estoque_baixo: estoqueBaixo,
      separacao: separando,
      reposicao: reposicaoPendente,
    },
  };
}

module.exports = { montarEstadoRua, PRIORIDADE_ESTADO, LABEL_ESTADO };
