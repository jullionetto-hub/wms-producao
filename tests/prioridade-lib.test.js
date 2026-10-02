/**
 * WMS Miess — Testes de lib/prioridade.js
 * Lógica pura de classificação de prioridade (NORMAL/ATENÇÃO/CRÍTICO).
 * Roda com: npm test
 */

const { calcularPrioridade, horasAguardando, SLA_HORAS } = require('../lib/prioridade');

describe('horasAguardando', () => {
  test('sem valor → null', () => {
    expect(horasAguardando(null)).toBeNull();
    expect(horasAguardando('')).toBeNull();
  });

  test('formato inválido → null', () => {
    expect(horasAguardando('não é uma data')).toBeNull();
  });

  test('calcula corretamente a diferença em horas', () => {
    const agora = new Date(2026, 5, 10, 14, 0); // 10/06/2026 14:00
    const h = horasAguardando('10/06/2026 08:00', agora);
    expect(h).toBeCloseTo(6, 5);
  });
});

describe('calcularPrioridade', () => {
  const agora = new Date(2026, 5, 10, 14, 0); // 10/06/2026 14:00

  test('sem aguardando_desde → normal, sem dados, com motivo explicando por quê', () => {
    const r = calcularPrioridade(null, agora);
    expect(r.nivel).toBe('normal');
    expect(r.horas_aguardando).toBeNull();
    expect(r.pct_sla).toBeNull();
    expect(r.motivo).toMatch(/sem horário/i);
  });

  test(`menos de ${60}% do SLA (${SLA_HORAS}h) decorrido → normal`, () => {
    // 2h de 6h = 33%
    const r = calcularPrioridade('10/06/2026 12:00', agora);
    expect(r.nivel).toBe('normal');
    expect(r.horas_aguardando).toBe(2);
    expect(r.pct_sla).toBe(33);
  });

  test('exatamente 60% do SLA → atenção (limiar inclusivo)', () => {
    // 3.6h de 6h = 60% exatos
    const r = calcularPrioridade('10/06/2026 10:24', agora);
    expect(r.nivel).toBe('atencao');
    expect(r.pct_sla).toBe(60);
  });

  test('entre 60% e 100% do SLA → atenção', () => {
    // 5h de 6h = 83%
    const r = calcularPrioridade('10/06/2026 09:00', agora);
    expect(r.nivel).toBe('atencao');
    expect(r.motivo).toContain('83%');
  });

  test('exatamente 100% do SLA → crítico (limiar inclusivo)', () => {
    // 6h de 6h = 100%
    const r = calcularPrioridade('10/06/2026 08:00', agora);
    expect(r.nivel).toBe('critico');
    expect(r.pct_sla).toBe(100);
  });

  test('acima de 100% do SLA → crítico, com motivo mencionando o SLA estourado', () => {
    // 9h de 6h = 150%
    const r = calcularPrioridade('10/06/2026 05:00', agora);
    expect(r.nivel).toBe('critico');
    expect(r.horas_aguardando).toBe(9);
    expect(r.motivo).toMatch(/ultrapassou/i);
  });

  test('horas_aguardando e pct_sla são sempre números arredondados (1 casa / inteiro)', () => {
    const r = calcularPrioridade('10/06/2026 11:07', agora);
    expect(Number.isInteger(r.pct_sla)).toBe(true);
    expect(r.horas_aguardando).toBe(Math.round(r.horas_aguardando * 10) / 10);
  });
});
