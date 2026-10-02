/* ══ WMS — Geometria do Estoque (fonte única) ══
   Modelo físico do corredor principal ("fundo", uma reta) e do ramal da
   frente (E→D→C→B→A, pendurado perpendicular na altura de Q), mais a
   classificação de dificuldade por rua inteira — usados pra formação de
   lote (routes/pedidos.js) e pro Mapa do Estoque (public/js/dashboard.js).

   Este arquivo é a ÚNICA fonte desses dois modelos. Antes desta consolidação
   (V2 da evolução do WMS), routes/pedidos.js e dashboard.js mantinham cada
   um sua própria cópia manual (PESO_DIFICULDADE_RUA e DIFIC) — sempre com a
   mesma classificação por rua, mas duplicada e sujeita a divergir se só uma
   fosse atualizada. Os valores abaixo são exatamente os que já estavam em
   produção nos dois lugares — nada mudou, só passou a ter um lugar só.

   NÃO confundir com lib/pontuacao.js (SEGMENTOS_ESTOQUE/PESOS/
   calcularPesoCorredor) — aquele é o modelo DETALHADO por segmento/faixa de
   número, usado pra pontuar CADA pedido individualmente. Este arquivo aqui é
   a simplificação por rua inteira (sem distinguir Frente/Fundo nem faixa de
   número), usada só pra decidir distância/agrupamento de lote e pra colorir
   o mapa — os dois modelos coexistem de propósito, em níveis de detalhe
   diferentes para propósitos diferentes.

   Carregado tanto via <script> (browser, vira window.GeometriaEstoque)
   quanto via require() (Node, routes/pedidos.js) — por isso o wrapper UMD
   simples abaixo, sem depender de bundler (o projeto não tem um). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GeometriaEstoque = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Corredor principal ("fundo"), em ordem física — uma reta. ZA e ARARA
  // entram aqui pra terem uma posição/distância real (são locais de picking
  // de verdade), mesmo sendo desenhados como caixas de canto separadas no
  // mapa (ver FUNDO_SEM_ESPECIAIS abaixo).
  var FUNDO_COORD = ['ZA','F','G','ARARA','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];

  // Ramal da frente: pendura perpendicular no meio do fundo, na altura de Q
  // — por isso E fica fisicamente colado em Q/P/N (não em A, a ponta morta
  // do ramal), mesmo aparecendo "antes" de N na ordem de CAMINHADA (que
  // precisa descer o ramal inteiro e voltar antes de seguir pro resto do
  // corredor — ver ROTA_FISICA em public/js/separador.js, que é a ordem de
  // passos do separador, não a distância física usada aqui).
  var FRENTE_COORD = { E: 1, D: 2, C: 3, B: 4, A: 5 };
  var Q_IDX_COORD = FUNDO_COORD.indexOf('Q');

  function coordRua(rua) {
    var fIdx = FUNDO_COORD.indexOf(rua);
    if (fIdx !== -1) return { x: fIdx, y: 0 };
    if (FRENTE_COORD[rua] != null) return { x: Q_IDX_COORD, y: FRENTE_COORD[rua] };
    return null;
  }

  function distanciaRuas(a, b) {
    var ca = coordRua(a), cb = coordRua(b);
    if (!ca || !cb) return 999; // sentinela: rua fora do mapa (endereço especial não catalogado)
    return Math.abs(ca.x - cb.x) + Math.abs(ca.y - cb.y);
  }

  // Classificação de dificuldade por rua inteira — mesma tabela que já
  // existia (idêntica) em routes/pedidos.js (PESO_DIFICULDADE_RUA, como
  // categoria) e public/js/dashboard.js (DIFIC).
  var DIFICULDADE_POR_RUA = {
    A: 'facil', B: 'facil', C: 'facil', D: 'facil', E: 'facil',
    F: 'dificil', G: 'dificil', H: 'dificil', I: 'dificil', J: 'dificil', K: 'dificil', L: 'dificil',
    M: 'medio', N: 'medio', O: 'medio',
    P: 'facil', Q: 'facil', R: 'facil', S: 'facil', T: 'facil', U: 'facil',
    V: 'medio', W: 'medio', X: 'medio', Y: 'medio', Z: 'medio',
    ZA: 'especial', ARARA: 'especial',
  };

  // Peso numérico por categoria — reproduz exatamente os valores que
  // routes/pedidos.js já usava em PESO_DIFICULDADE_RUA (1.0/1.8/2.8/3.5).
  var PESO_POR_DIFICULDADE = { facil: 1.0, medio: 1.8, dificil: 2.8, especial: 3.5 };

  function pesoDificuldadeRua(rua) {
    return PESO_POR_DIFICULDADE[DIFICULDADE_POR_RUA[rua]] || 1.0;
  }

  // Array do corredor principal SEM ZA/ARARA — pro Mapa do Estoque, que
  // desenha os dois como caixas de canto separadas em vez de posições em
  // linha. Derivado de FUNDO_COORD (não é uma segunda lista digitada à mão),
  // pra nunca ficar dessincronizado se uma rua for adicionada/removida.
  var FUNDO_SEM_ESPECIAIS = FUNDO_COORD.filter(function (r) { return r !== 'ZA' && r !== 'ARARA'; });

  return {
    FUNDO_COORD: FUNDO_COORD,
    FRENTE_COORD: FRENTE_COORD,
    Q_IDX_COORD: Q_IDX_COORD,
    FUNDO_SEM_ESPECIAIS: FUNDO_SEM_ESPECIAIS,
    coordRua: coordRua,
    distanciaRuas: distanciaRuas,
    DIFICULDADE_POR_RUA: DIFICULDADE_POR_RUA,
    PESO_POR_DIFICULDADE: PESO_POR_DIFICULDADE,
    pesoDificuldadeRua: pesoDificuldadeRua,
  };
});
