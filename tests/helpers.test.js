/**
 * WMS Miess — Testes de lib/helpers.js
 * hashSenha/verificarSenha/hashNeedsMigration já são cobertos em
 * tests/api.test.js — aqui ficam os demais helpers ainda sem teste.
 * Roda com: npm test
 */

const {
  perfisPermitidos, formatarAguardandoDesde, sanitizeStr, validarId, dataHoraLocal,
} = require('../lib/helpers');

/* ════════════════════════════════════════════════════════════
   perfisPermitidos
════════════════════════════════════════════════════════════ */
describe('perfisPermitidos', () => {
  test('usuário sem perfis extras retorna só o perfil principal', () => {
    expect(perfisPermitidos({ perfil: 'separador', perfis_acesso: '' })).toEqual(['separador']);
  });

  test('combina o perfil principal com os perfis extras (perfis_acesso)', () => {
    expect(perfisPermitidos({ perfil: 'separador', perfis_acesso: 'checkout, embalador' }))
      .toEqual(['separador', 'checkout', 'embalador']);
  });

  test('remove duplicatas entre perfil principal e perfis_acesso', () => {
    expect(perfisPermitidos({ perfil: 'separador', perfis_acesso: 'separador, checkout' }))
      .toEqual(['separador', 'checkout']);
  });

  test('perfis_acesso ausente não quebra (trata como sem extras)', () => {
    expect(perfisPermitidos({ perfil: 'supervisor' })).toEqual(['supervisor']);
  });

  test('ignora espaços em branco extras e entradas vazias na lista', () => {
    expect(perfisPermitidos({ perfil: 'separador', perfis_acesso: ' checkout ,, embalador ' }))
      .toEqual(['separador', 'checkout', 'embalador']);
  });
});

/* ════════════════════════════════════════════════════════════
   formatarAguardandoDesde
════════════════════════════════════════════════════════════ */
describe('formatarAguardandoDesde', () => {
  test('valor vazio ou nulo retorna string vazia', () => {
    expect(formatarAguardandoDesde('')).toBe('');
    expect(formatarAguardandoDesde(null)).toBe('');
    expect(formatarAguardandoDesde(undefined)).toBe('');
  });

  test('valor já no formato DD/MM/YYYY é retornado como está', () => {
    expect(formatarAguardandoDesde('15/03/2026 10:30')).toBe('15/03/2026 10:30');
    expect(formatarAguardandoDesde('01/01/2026')).toBe('01/01/2026');
  });

  test('número serial do Excel é convertido pra DD/MM/YYYY HH:MM', () => {
    // Época do Excel: 30/12/1899 + N dias, em UTC (sem depender do fuso da
    // máquina). 45000 é inteiro (sem fração de dia), então a hora é 00:00.
    expect(formatarAguardandoDesde(45000)).toBe('15/03/2023 00:00');
    expect(formatarAguardandoDesde('45000')).toBe('15/03/2023 00:00'); // aceita string numérica também
  });

  test('número fora da faixa plausível de datas (não é serial do Excel) é retornado como string, sem conversão', () => {
    expect(formatarAguardandoDesde('5')).toBe('5');
    expect(formatarAguardandoDesde('999999')).toBe('999999');
  });

  test('texto que não bate com nenhum padrão é devolvido como veio', () => {
    expect(formatarAguardandoDesde('texto qualquer')).toBe('texto qualquer');
  });
});

/* ════════════════════════════════════════════════════════════
   sanitizeStr
════════════════════════════════════════════════════════════ */
describe('sanitizeStr', () => {
  test('remove espaços nas pontas', () => {
    expect(sanitizeStr('  ola mundo  ')).toBe('ola mundo');
  });

  test('trunca no tamanho máximo informado', () => {
    expect(sanitizeStr('abcdefghij', 5)).toBe('abcde');
  });

  test('usa 255 como tamanho máximo padrão', () => {
    const longa = 'a'.repeat(300);
    expect(sanitizeStr(longa)).toHaveLength(255);
  });

  test('null/undefined viram string vazia', () => {
    expect(sanitizeStr(null)).toBe('');
    expect(sanitizeStr(undefined)).toBe('');
  });

  test('converte valores não-string (número) pra string', () => {
    expect(sanitizeStr(123)).toBe('123');
  });
});

/* ════════════════════════════════════════════════════════════
   validarId
════════════════════════════════════════════════════════════ */
describe('validarId', () => {
  test('aceita número positivo (como número ou string)', () => {
    expect(validarId(5)).toBe(5);
    expect(validarId('5')).toBe(5);
  });

  test('rejeita zero e negativos', () => {
    expect(validarId(0)).toBeNull();
    expect(validarId(-1)).toBeNull();
    expect(validarId('-5')).toBeNull();
  });

  test('rejeita valores não numéricos', () => {
    expect(validarId('abc')).toBeNull();
    expect(validarId(null)).toBeNull();
    expect(validarId(undefined)).toBeNull();
    expect(validarId({})).toBeNull();
  });

  test('parseInt aceita string com sufixo não-numérico (comportamento atual do parseInt, não validação estrita)', () => {
    // Documenta o comportamento real: parseInt('5abc') = 5, não NaN.
    expect(validarId('5abc')).toBe(5);
  });
});

/* ════════════════════════════════════════════════════════════
   dataHoraLocal
════════════════════════════════════════════════════════════ */
describe('dataHoraLocal', () => {
  test('retorna data no formato YYYY-MM-DD e hora no formato HH:MM:SS', () => {
    const { data, hora } = dataHoraLocal();
    expect(data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(hora).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});
