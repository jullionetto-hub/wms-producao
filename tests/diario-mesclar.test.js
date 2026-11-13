// Salvar por setor: só o setor salvo muda, e o autor de cada setor fica registrado.
const router = require('../routes/admin/diario');
const mesclar = router.mesclarDiario;
const ana = { nome: 'Ana', turno: 'Noite' }, bia = { nome: 'Bia', turno: 'Noite' };
const t0 = new Date('2026-11-12T22:00:00Z'), t1 = new Date('2026-11-12T23:00:00Z');

describe('mesclarDiario', () => {
  test('setor único: grava só o dele e registra o autor', () => {
    const r = mesclar(null, { dados: { embalagem: { total: 426, embalados: 95 } }, observacoes: { embalagem: 'ok' } }, 'embalagem', ana, t0);
    expect(r.dados.embalagem.embalados).toBe(95);
    expect(r.dados.autores.embalagem).toEqual({ nome: 'Ana', turno: 'Noite', em: t0.toISOString() });
    expect(r.dados.autores.separacao).toBeUndefined();
  });
  test('dois colaboradores: um nao apaga o setor do outro mesmo com a tela desatualizada', () => {
    const a = mesclar(null, { dados: { embalagem: { total: 10, embalados: 5 } }, observacoes: { embalagem: 'da Ana' } }, 'embalagem', ana, t0);
    const salvo = { dados: JSON.stringify(a.dados), observacoes: JSON.stringify(a.observacoes) };
    // a tela da Bia foi aberta antes: embalagem vazia; ela salva só a separação
    const b = mesclar(salvo, { dados: { embalagem: { total: 0, embalados: 0 }, separacao: { total: 296, concluidos: 286 } }, observacoes: { embalagem: '', separacao: 'da Bia' } }, 'separacao', bia, t1);
    expect(b.dados.embalagem).toEqual({ total: 10, embalados: 5 });
    expect(b.observacoes.embalagem).toBe('da Ana');
    expect(b.observacoes.separacao).toBe('da Bia');
    expect(b.dados.autores.embalagem.nome).toBe('Ana');
    expect(b.dados.autores.separacao.nome).toBe('Bia');
  });
  test('o cliente nao consegue forjar o autor', () => {
    const r = mesclar(null, { dados: { separacao: { total: 1 }, autores: { separacao: { nome: 'Outro' } } }, observacoes: {} }, 'separacao', ana, t0);
    expect(r.dados.autores.separacao.nome).toBe('Ana');
  });
  test('sem setor (salvar geral): so quem mudou algo vira autor do setor', () => {
    const base = mesclar(null, { dados: { separacao: { total: 5 } }, observacoes: { separacao: 'x' } }, 'separacao', ana, t0);
    const salvo = { dados: JSON.stringify(base.dados), observacoes: JSON.stringify(base.observacoes) };
    const r = mesclar(salvo, { dados: { separacao: { total: 5 }, checkout: { total: 3 } }, observacoes: { separacao: 'x', geral: 'obs geral' } }, null, bia, t1);
    expect(r.dados.autores.separacao.nome).toBe('Ana');      // nao mudou
    expect(r.dados.autores.checkout.nome).toBe('Bia');
    expect(r.dados.autores.geral.nome).toBe('Bia');
  });
});
