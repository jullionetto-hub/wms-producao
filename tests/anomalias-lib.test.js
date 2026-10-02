/**
 * WMS Miess — Testes de lib/anomalias.js
 * Lógica pura de detecção de anomalia de ritmo (V11).
 * Roda com: npm test
 */

const { detectarAnomaliaRitmo, detectarAnomalias, LIMIAR_RITMO, MIN_ITENS_HOJE } = require('../lib/anomalias');

describe('detectarAnomaliaRitmo', () => {
  test('ritmo hoje muito abaixo do histórico → anomalia detectada', () => {
    // histórico: 100 itens/h. hoje: 40 itens/h (40% do normal, abaixo de 60%)
    const r = detectarAnomaliaRitmo({ nome: 'João', itensHoje: 80, horasHoje: 2, itensHistorico: 2000, horasHistorico: 20 });
    expect(r).not.toBeNull();
    expect(r.ritmo_hoje).toBe(40);
    expect(r.ritmo_historico).toBe(100);
    expect(r.pct_do_normal).toBe(40);
  });

  test('ritmo hoje dentro do normal → sem anomalia', () => {
    const r = detectarAnomaliaRitmo({ nome: 'Maria', itensHoje: 180, horasHoje: 2, itensHistorico: 2000, horasHistorico: 20 });
    expect(r).toBeNull();
  });

  test('ritmo hoje exatamente no limiar (60%) → não é anomalia (limiar é exclusivo)', () => {
    const r = detectarAnomaliaRitmo({ nome: 'Pedro', itensHoje: 120, horasHoje: 2, itensHistorico: 2000, horasHistorico: 20 });
    expect(r).toBeNull(); // 60 itens/h = exatamente 60% de 100
  });

  test('itens hoje abaixo do mínimo → não julga (ruído estatístico)', () => {
    const r = detectarAnomaliaRitmo({ nome: 'Ana', itensHoje: 5, horasHoje: 0.5, itensHistorico: 2000, horasHistorico: 20 });
    expect(r).toBeNull();
  });

  test('sem histórico suficiente → não julga', () => {
    const r = detectarAnomaliaRitmo({ nome: 'Carlos', itensHoje: 50, horasHoje: 2, itensHistorico: 0, horasHistorico: 0 });
    expect(r).toBeNull();
  });

  test('horasHoje zero → não julga (evita divisão por zero)', () => {
    const r = detectarAnomaliaRitmo({ nome: 'Bia', itensHoje: 50, horasHoje: 0, itensHistorico: 2000, horasHistorico: 20 });
    expect(r).toBeNull();
  });
});

describe('detectarAnomalias', () => {
  test('filtra só quem tem anomalia real e ordena do pior pro melhor', () => {
    const lista = [
      { nome: 'Normal', itensHoje: 200, horasHoje: 2, itensHistorico: 2000, horasHistorico: 20 },
      { nome: 'Pior',   itensHoje: 40,  horasHoje: 2, itensHistorico: 2000, horasHistorico: 20 }, // 20/h = 20%
      { nome: 'Leve',   itensHoje: 90,  horasHoje: 2, itensHistorico: 2000, horasHistorico: 20 }, // 45/h = 45%
    ];
    const r = detectarAnomalias(lista);
    expect(r).toHaveLength(2);
    expect(r[0].nome).toBe('Pior');
    expect(r[1].nome).toBe('Leve');
  });

  test('lista vazia ou undefined → array vazio', () => {
    expect(detectarAnomalias([])).toEqual([]);
    expect(detectarAnomalias(undefined)).toEqual([]);
  });

  test('constantes exportadas', () => {
    expect(LIMIAR_RITMO).toBe(0.6);
    expect(MIN_ITENS_HOJE).toBe(20);
  });
});
