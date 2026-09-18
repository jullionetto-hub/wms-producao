/**
 * WMS Miess — Testes de lib/simulador.js
 * Lógica pura do Simulador de Capacidade (V11).
 * Roda com: npm test
 */

const { simularCapacidade } = require('../lib/simulador');

describe('simularCapacidade', () => {
  test('adicionar pessoas aumenta a produção simulada proporcionalmente', () => {
    // 4 pessoas ativas produzindo 200 itens/h → 50 itens/h por pessoa
    const r = simularCapacidade({ producaoAtualH: 200, pessoasAtivas: 4, volumeRestante: 1000 }, 2, 300);
    expect(r.produtividade_por_pessoa_h).toBe(50);
    expect(r.pessoas_simuladas).toBe(6);
    expect(r.producao_simulada_h).toBe(300);
  });

  test('remover pessoas reduz a produção simulada, nunca fica negativa', () => {
    const r = simularCapacidade({ producaoAtualH: 100, pessoasAtivas: 2, volumeRestante: 500 }, -5, 300);
    expect(r.pessoas_simuladas).toBe(0);
    expect(r.producao_simulada_h).toBe(0);
    expect(r.tempo_estimado_min).toBeNull();
  });

  test('delta zero → produção simulada igual à atual', () => {
    const r = simularCapacidade({ producaoAtualH: 150, pessoasAtivas: 3, volumeRestante: 300 }, 0, 240);
    expect(r.producao_simulada_h).toBe(150);
  });

  test('sem pessoas ativas hoje (0) → produtividade por pessoa é 0, não quebra', () => {
    const r = simularCapacidade({ producaoAtualH: 0, pessoasAtivas: 0, volumeRestante: 200 }, 3, 300);
    expect(r.produtividade_por_pessoa_h).toBe(0);
    expect(r.producao_simulada_h).toBe(0);
    expect(r.tempo_estimado_min).toBeNull();
  });

  test('mais gente resolve o problema → situação vira dentro_do_prazo', () => {
    // 1 pessoa, 50 itens/h, 1000 restantes, 300min de turno → sozinho não dá (1000/50*60=1200min > 300)
    const semReforco = simularCapacidade({ producaoAtualH: 50, pessoasAtivas: 1, volumeRestante: 1000 }, 0, 300);
    expect(semReforco.situacao).not.toBe('dentro_do_prazo');
    // com +4 pessoas (5 total, 250 itens/h) → 1000/250*60=240min <= 300min
    const comReforco = simularCapacidade({ producaoAtualH: 50, pessoasAtivas: 1, volumeRestante: 1000 }, 4, 300);
    expect(comReforco.situacao).toBe('dentro_do_prazo');
  });

  test('volume restante zero → situação concluído independente das pessoas', () => {
    const r = simularCapacidade({ producaoAtualH: 100, pessoasAtivas: 2, volumeRestante: 0 }, 3, 300);
    expect(r.situacao).toBe('concluido');
  });
});
