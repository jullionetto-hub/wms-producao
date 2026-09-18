/**
 * WMS Miess — Testes de lib/control-tower.js
 * Lógica pura de cálculo da Control Tower (ritmo, gap, previsão, risco, gargalo).
 * Roda com: npm test
 */

const { calcularSituacao, montarProcesso, calcularGargalo } = require('../lib/control-tower');

/* ════════════════════════════════════════════════════════════
   calcularSituacao
════════════════════════════════════════════════════════════ */
describe('calcularSituacao', () => {
  test('volume restante zerado → concluido, mesmo sem produção', () => {
    expect(calcularSituacao(null, 100, 0)).toBe('concluido');
    expect(calcularSituacao(50, 100, 0)).toBe('concluido');
  });

  test('sem produção atual (tempo estimado null) e volume represado → atrasado', () => {
    expect(calcularSituacao(null, 100, 50)).toBe('atrasado');
  });

  test('tempo estimado dentro do tempo restante de turno → dentro_do_prazo', () => {
    expect(calcularSituacao(80, 100, 50)).toBe('dentro_do_prazo');
    expect(calcularSituacao(100, 100, 50)).toBe('dentro_do_prazo'); // limite exato
  });

  test('tempo estimado até 25% acima do tempo restante → risco', () => {
    expect(calcularSituacao(120, 100, 50)).toBe('risco'); // 20% acima
    expect(calcularSituacao(125, 100, 50)).toBe('risco'); // limite exato (25%)
  });

  test('tempo estimado mais de 25% acima do tempo restante → atrasado', () => {
    expect(calcularSituacao(126, 100, 50)).toBe('atrasado');
    expect(calcularSituacao(500, 100, 50)).toBe('atrasado');
  });
});

/* ════════════════════════════════════════════════════════════
   montarProcesso
════════════════════════════════════════════════════════════ */
describe('montarProcesso', () => {
  test('necessario_h = (meta em pedidos × itens médios/pedido) ÷ horas do turno', () => {
    // meta 75 pedidos/turno × 10 itens médios ÷ 8h turno = 93,75 → 94 itens/h necessário
    const r = montarProcesso('separacao', { producaoAtualH: 80, volumeRestante: 200, mediaItensPedido: 10 }, 75, 8, 200);
    expect(r.necessario_h).toBe(94);
    expect(r.gap_h).toBe(80 - 94);
    expect(r.producao_atual_h).toBe(80);
    expect(r.volume_restante).toBe(200);
  });

  test('produção zero com volume restante → tempo_estimado_min null e situação atrasado', () => {
    const r = montarProcesso('checkout', { producaoAtualH: 0, volumeRestante: 200, mediaItensPedido: 5 }, 90, 8, 60);
    expect(r.tempo_estimado_min).toBeNull();
    expect(r.situacao).toBe('atrasado');
  });

  test('volume restante zero → situação concluido independente do ritmo', () => {
    const r = montarProcesso('embalagem', { producaoAtualH: 500, volumeRestante: 0, mediaItensPedido: 5 }, 120, 8, 60);
    expect(r.situacao).toBe('concluido');
    expect(r.tempo_estimado_min).toBe(0);
  });

  test('horasTurno = 0 não gera divisão por zero (necessario_h = 0)', () => {
    const r = montarProcesso('reposicao', { producaoAtualH: 10, volumeRestante: 5, mediaItensPedido: 1 }, 90, 0, 30);
    expect(r.necessario_h).toBe(0);
    expect(Number.isFinite(r.gap_h)).toBe(true);
  });

  test('tempo_estimado_min é o volume restante dividido pelo ritmo atual, em minutos', () => {
    // 120 itens restantes a 60 itens/h = 1h = 60min
    const r = montarProcesso('separacao', { producaoAtualH: 60, volumeRestante: 120, mediaItensPedido: 10 }, 50, 8, 200);
    expect(r.tempo_estimado_min).toBe(120);
  });
});

/* ════════════════════════════════════════════════════════════
   calcularGargalo
════════════════════════════════════════════════════════════ */
describe('calcularGargalo', () => {
  test('todos dentro do prazo → null (não inventa gargalo)', () => {
    const processos = [
      { processo: 'separacao', situacao: 'dentro_do_prazo', volume_restante: 10, producao_atual_h: 100, gap_h: 5, necessario_h: 95 },
      { processo: 'checkout', situacao: 'concluido', volume_restante: 0, producao_atual_h: 50, gap_h: 0, necessario_h: 50 },
    ];
    expect(calcularGargalo(processos)).toBeNull();
  });

  test('um único processo em risco/atrasado vira o gargalo', () => {
    const processos = [
      { processo: 'separacao', situacao: 'dentro_do_prazo', volume_restante: 10, producao_atual_h: 100, gap_h: 5, necessario_h: 95 },
      { processo: 'embalagem', situacao: 'atrasado', volume_restante: 300, producao_atual_h: 20, gap_h: -80, necessario_h: 100 },
    ];
    const g = calcularGargalo(processos);
    expect(g.processo).toBe('embalagem');
    expect(g.motivo).toContain('Embalagem');
  });

  test('entre dois em risco/atrasado, "atrasado" pesa mais que "risco"', () => {
    const processos = [
      { processo: 'checkout', situacao: 'risco', volume_restante: 500, producao_atual_h: 80, gap_h: -10, necessario_h: 90 },
      { processo: 'reposicao', situacao: 'atrasado', volume_restante: 50, producao_atual_h: 5, gap_h: -85, necessario_h: 90 },
    ];
    expect(calcularGargalo(processos).processo).toBe('reposicao');
  });

  test('empate na situação desempata por maior volume represado', () => {
    const processos = [
      { processo: 'checkout', situacao: 'atrasado', volume_restante: 100, producao_atual_h: 0, gap_h: -90, necessario_h: 90 },
      { processo: 'embalagem', situacao: 'atrasado', volume_restante: 400, producao_atual_h: 0, gap_h: -120, necessario_h: 120 },
    ];
    expect(calcularGargalo(processos).processo).toBe('embalagem');
  });

  test('motivo explica "sem produção" quando ritmo atual é zero', () => {
    const processos = [
      { processo: 'reposicao', situacao: 'atrasado', volume_restante: 30, producao_atual_h: 0, gap_h: -90, necessario_h: 90 },
    ];
    expect(calcularGargalo(processos).motivo).toContain('sem produção');
  });
});
