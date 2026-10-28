const { normalizarTurno } = require('../lib/helpers');

describe('normalizarTurno', () => {
  test('Manhã com acento e Manha sem acento viram a mesma coisa', () => {
    expect(normalizarTurno('Manhã')).toBe('Manha');
    expect(normalizarTurno('Manha')).toBe('Manha');
  });

  test('Tarde e Noite ficam como estão', () => {
    expect(normalizarTurno('Tarde')).toBe('Tarde');
    expect(normalizarTurno('Noite')).toBe('Noite');
  });

  test('vazio, nulo e espaços não quebram', () => {
    expect(normalizarTurno('')).toBe('');
    expect(normalizarTurno(null)).toBe('');
    expect(normalizarTurno(undefined)).toBe('');
    expect(normalizarTurno('  Noite ')).toBe('Noite');
  });
});
