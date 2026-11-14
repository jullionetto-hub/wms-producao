/**
 * Treinamento - Diario de Bordo (public/js/treino-diario.js): regras puras do simulador.
 * Em Node o modulo so exporta as funcoes (sem document, sem rede, sem localStorage).
 */
const T = require('../public/js/treino-diario.js');

describe('setor com problema de verdade', () => {
  test('item nao encontrado ou pendencia de 10% ou mais', () => {
    expect(T.setorTemProblema('reposicao', { total: 10, pendentes: 0, nao_encontrados: 1 })).toBe(true);
    expect(T.setorTemProblema('separacao', { total: 100, pendentes: 10 })).toBe(true);
    expect(T.setorTemProblema('separacao', { total: 100, pendentes: 9 })).toBe(false);
    expect(T.setorTemProblema('checkout', { total: 0, pendentes: 0 })).toBe(false);
    expect(T.setorTemProblema('checkout', undefined)).toBe(false);
  });
});

describe('nota e verificacao (iguais ao Diario real)', () => {
  const v = (...e) => Object.fromEntries(T.SETORES.map(([k], i) => [k, { estado: e[i], nota: e[i] === 'problema' ? 'x' : '' }]));
  test('cada problema desconta 25; 4 setores = 100', () => {
    expect(T.nota(v('ok', 'ok', 'ok', 'ok'))).toBe(100);
    expect(T.nota(v('problema', 'ok', 'ok', 'problema'))).toBe(50);
    expect(T.nota(v('problema', 'problema', 'problema', 'problema'))).toBe(0);
  });
  test('problema sem descricao nao conclui; faltando setor nao conclui', () => {
    expect(T.verificacaoCompleta(v('ok', 'ok', 'ok', 'ok'))).toBe(true);
    expect(T.verificacaoCompleta(v('ok', 'ok', 'ok', undefined))).toBe(false);
    const semNota = v('problema', 'ok', 'ok', 'ok'); semNota.separacao.nota = '  ';
    expect(T.verificacaoCompleta(semNota)).toBe(false);
  });
});

describe('cenarios: o gabarito esta coerente com o que o texto esconde', () => {
  const por = id => T.CENARIOS.find(c => c.id === id);
  const real = c => T.SETORES.filter(([k]) => T.setorTemProblema(k, c.anterior[k])).map(([k]) => k);
  test('tranquilo nao tem problema; falta e pico tem os setores esperados', () => {
    expect(real(por('tranquilo'))).toEqual([]);
    expect(real(por('falta'))).toEqual(['separacao', 'reposicao']);
    expect(real(por('pico'))).toEqual(['separacao', 'checkout']);
  });
  test('gabarito marca certo/errado conforme a resposta', () => {
    const c = por('falta');
    const g = T.gabarito(c, { separacao: { estado: 'ok' }, checkout: { estado: 'ok' }, embalagem: { estado: 'ok' }, reposicao: { estado: 'problema', nota: 'x' } });
    expect(g.map(x => x.certo)).toEqual([false, true, true, true]);
  });
});

describe('dicas de preenchimento', () => {
  test('pendencia sem explicacao e setor em branco geram dica', () => {
    const c = T.CENARIOS.find(x => x.id === 'falta');
    const d = T.dicas(c, { separacao: 'Sem ocorrências.', checkout: '', embalagem: 'ok', reposicao: 'Quatro itens não encontrados na rua C.' });
    expect(d.some(t => t.startsWith('Separação'))).toBe(true);
    expect(d.some(t => t.startsWith('Reposição'))).toBe(false);
  });
});
