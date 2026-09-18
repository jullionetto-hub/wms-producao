/**
 * WMS Miess — Testes de lib/mapa-estoque.js
 * Lógica pura de combinação de estados do Mapa Vivo do Estoque.
 * Roda com: npm test
 */

const { montarEstadoRua, PRIORIDADE_ESTADO } = require('../lib/mapa-estoque');

describe('montarEstadoRua', () => {
  test('sem nenhum sinal → normal', () => {
    const r = montarEstadoRua({});
    expect(r.estados).toEqual(['normal']);
    expect(r.estado_principal).toBe('normal');
  });

  test('só ruptura → estados=[ruptura], principal=ruptura', () => {
    const r = montarEstadoRua({ ruptura: 3 });
    expect(r.estados).toEqual(['ruptura']);
    expect(r.estado_principal).toBe('ruptura');
    expect(r.contadores.ruptura).toBe(3);
  });

  test('só separação ativa → estados=[separacao]', () => {
    const r = montarEstadoRua({ separando: 2 });
    expect(r.estados).toEqual(['separacao']);
    expect(r.estado_principal).toBe('separacao');
  });

  test('ruptura + estoque baixo ao mesmo tempo → os dois aparecem, ruptura é o principal', () => {
    const r = montarEstadoRua({ ruptura: 1, estoqueBaixo: 2 });
    expect(r.estados).toEqual(['ruptura', 'estoque_baixo']);
    expect(r.estado_principal).toBe('ruptura');
  });

  test('todos os 4 sinais ao mesmo tempo → ordem de prioridade completa', () => {
    const r = montarEstadoRua({ ruptura: 1, estoqueBaixo: 1, separando: 1, reposicaoPendente: 1 });
    expect(r.estados).toEqual(['ruptura', 'estoque_baixo', 'separacao', 'reposicao']);
    expect(r.estado_principal).toBe('ruptura');
  });

  test('separação + reposição (sem ruptura/estoque baixo) → separação vence (prioridade)', () => {
    const r = montarEstadoRua({ separando: 5, reposicaoPendente: 1 });
    expect(r.estado_principal).toBe('separacao');
    expect(r.estados).toEqual(['separacao', 'reposicao']);
  });

  test('só reposição pendente → estado principal reposicao', () => {
    const r = montarEstadoRua({ reposicaoPendente: 4 });
    expect(r.estado_principal).toBe('reposicao');
    expect(r.estados).toEqual(['reposicao']);
  });

  test('contadores sempre presentes, mesmo zerados', () => {
    const r = montarEstadoRua({ ruptura: 5 });
    expect(r.contadores).toEqual({ ruptura: 5, estoque_baixo: 0, separacao: 0, reposicao: 0 });
  });

  test('PRIORIDADE_ESTADO exportada e na ordem esperada', () => {
    expect(PRIORIDADE_ESTADO).toEqual(['ruptura', 'estoque_baixo', 'separacao', 'reposicao', 'normal']);
  });
});
