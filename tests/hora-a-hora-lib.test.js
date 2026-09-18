/**
 * WMS Miess — Testes de lib/hora-a-hora.js
 * Lógica pura de agrupamento por hora + ritmo/previsão (V10).
 * Roda com: npm test
 */

const { bucketsPorHora, calcularSituacaoHoraAHora, ritmoEPrevisao } = require('../lib/hora-a-hora');

describe('bucketsPorHora', () => {
  test('conta registros por hora quando campoValor é null', () => {
    const registros = [{ hora: '08:15:00' }, { hora: '08:40:00' }, { hora: '09:02:00' }];
    const b = bucketsPorHora(registros, 'hora');
    expect(b[8]).toBe(2);
    expect(b[9]).toBe(1);
    expect(b[7]).toBe(0);
  });

  test('soma um campo numérico quando campoValor é passado', () => {
    const registros = [{ hora: '10:00:00', faturado: 150.5 }, { hora: '10:30:00', faturado: 49.5 }];
    const b = bucketsPorHora(registros, 'hora', 'faturado');
    expect(b[10]).toBe(200);
  });

  test('ignora hora inválida ou vazia sem quebrar', () => {
    const registros = [{ hora: '' }, { hora: null }, { hora: '25:00:00' }, { hora: '14:00:00' }];
    const b = bucketsPorHora(registros, 'hora');
    expect(b.reduce((s, v) => s + v, 0)).toBe(1);
    expect(b[14]).toBe(1);
  });

  test('array vazio → 24 buckets zerados', () => {
    const b = bucketsPorHora([], 'hora');
    expect(b).toHaveLength(24);
    expect(b.every(v => v === 0)).toBe(true);
  });
});

describe('calcularSituacaoHoraAHora', () => {
  test('sem meta configurada (<=0) → sem_meta', () => {
    expect(calcularSituacaoHoraAHora(1000, 0)).toBe('sem_meta');
    expect(calcularSituacaoHoraAHora(1000, null)).toBe('sem_meta');
  });
  test('previsão >= meta → dentro_do_prazo', () => {
    expect(calcularSituacaoHoraAHora(1000, 1000)).toBe('dentro_do_prazo');
    expect(calcularSituacaoHoraAHora(1200, 1000)).toBe('dentro_do_prazo');
  });
  test('previsão entre 85% e 100% da meta → risco', () => {
    expect(calcularSituacaoHoraAHora(900, 1000)).toBe('risco');
  });
  test('previsão abaixo de 85% da meta → atrasado', () => {
    expect(calcularSituacaoHoraAHora(800, 1000)).toBe('atrasado');
  });
});

describe('ritmoEPrevisao', () => {
  test('exemplo básico: 300 realizados em 3h decorridas, 5h restantes, meta 1000', () => {
    const r = ritmoEPrevisao(300, 1000, 180, 300);
    expect(r.ritmo_hora).toBe(100);
    expect(r.previsao_fim_turno).toBe(300 + 100 * 5);
    expect(r.pct_meta).toBe(30);
    expect(r.situacao).toBe('atrasado'); // previsão 800 / meta 1000 = 80% < 85%
  });

  test('ritmo suficiente pra bater a meta → dentro_do_prazo', () => {
    const r = ritmoEPrevisao(500, 1000, 240, 240); // 4h decorridas, ritmo 125/h, 4h restantes → previsão 1000
    expect(r.ritmo_hora).toBe(125);
    expect(r.previsao_fim_turno).toBe(1000);
    expect(r.situacao).toBe('dentro_do_prazo');
  });

  test('minutosDecorridosTurno=0 não quebra (divide por >=1 minuto)', () => {
    const r = ritmoEPrevisao(0, 1000, 0, 480);
    expect(Number.isFinite(r.ritmo_hora)).toBe(true);
    expect(r.previsao_fim_turno).toBe(0);
  });

  test('meta zerada → pct_meta null, situação sem_meta', () => {
    const r = ritmoEPrevisao(200, 0, 120, 120);
    expect(r.pct_meta).toBeNull();
    expect(r.situacao).toBe('sem_meta');
  });
});
