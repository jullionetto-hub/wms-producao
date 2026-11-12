const { analisarPedido, ordenarPorHora, segundosDoDia, mediana, chaveEndereco } = require('../lib/rota-eficiencia');

const it = (endereco, hora) => ({ endereco, hora_verificado: hora });

describe('rota-eficiencia', () => {
  test('segundosDoDia aceita HH:MM:SS e HH:MM e rejeita lixo', () => {
    expect(segundosDoDia('01:02:03')).toBe(3723);
    expect(segundosDoDia('10:30')).toBe(37800);
    expect(segundosDoDia('')).toBeNull();
    expect(segundosDoDia(null)).toBeNull();
    expect(segundosDoDia('abc')).toBeNull();
  });

  test('turno da noite: marcações depois da meia-noite ficam depois das de antes', () => {
    const o = ordenarPorHora([it('A1', '00:05:00'), it('B1', '23:58:00'), it('C1', '00:10:00')]);
    expect(o.map(x => x.item.endereco)).toEqual(['B1', 'A1', 'C1']);
    expect(o[1].t - o[0].t).toBe(420);   // 7 minutos, não -23h53
  });

  test('rota já na melhor ordem: caminhada evitável ~0 e sem rajada', () => {
    const r = analisarPedido([it('A010', '10:00:00'), it('B010', '10:02:00'), it('C010', '10:04:00'), it('D010', '10:06:00')]);
    expect(r.passos).toBe(4);
    expect(r.evitavelPct).toBeLessThanOrEqual(1);
    expect(r.temRajada).toBe(false);
    expect(r.intervalosSeg).toEqual([120, 120, 120]);
  });

  test('ordem em zigue-zague entre ruas distantes gera caminhada evitável', () => {
    const r = analisarPedido([it('F010', '10:00:00'), it('Z010', '10:02:00'), it('G050', '10:04:00'), it('Y010', '10:06:00'), it('H010', '10:08:00')]);
    expect(r.evitavelPct).toBeGreaterThan(25);
  });

  test('rajada: 3+ itens com até 5 s entre si', () => {
    const r = analisarPedido([it('A010', '10:00:00'), it('A011', '10:00:02'), it('A012', '10:00:04'), it('B010', '10:05:00')]);
    expect(r.itensEmRajada).toBe(3);
    expect(r.temRajada).toBe(true);
  });

  test('dois itens rápidos seguidos não são rajada (mínimo 3)', () => {
    const r = analisarPedido([it('A010', '10:00:00'), it('A011', '10:00:03'), it('B010', '10:05:00')]);
    expect(r.itensEmRajada).toBe(0);
  });

  test('sem horas válidas não quebra', () => {
    const r = analisarPedido([it('A010', ''), it('B010', null)]);
    expect(r.itensMarcados).toBe(0);
    expect(r.passos).toBe(0);
    expect(r.evitavelPct).toBe(0);
  });

  test('chaveEndereco normaliza como o Estoque 3D e usa o endereço primário', () => {
    expect(chaveEndereco('A36')).toBe('A036');
    expect(chaveEndereco('n144/VERT-N08-CX21')).toBe('N144');
    expect(chaveEndereco('ZA 5')).toBe('ZA005');
    expect(chaveEndereco('ARARA12, A001')).toBe('ARARA 12');
    expect(chaveEndereco('VERT-A1-CX6')).toBe('VERT-A01-CX06');
    expect(chaveEndereco('???')).toBeNull();
    expect(chaveEndereco('')).toBeNull();
  });

  test('distâncias reais do galpão: ramal curto, ponta a ponta longa', () => {
    const a = analisarPedido([it('A001', '10:00:00'), it('E001', '10:01:00')]);
    expect(a.distReal).toBeGreaterThan(10); expect(a.distReal).toBeLessThan(30);
    const b = analisarPedido([it('A001', '10:00:00'), it('F001', '10:03:00')]);
    expect(b.distReal).toBeGreaterThan(40);
  });

  test('endereço fora do modelo é ignorado sem quebrar', () => {
    const r = analisarPedido([it('A010', '10:00:00'), it('XYZ', '10:01:00'), it('B010', '10:02:00')]);
    expect(r.passos).toBe(2);
  });

  test('mediana', () => {
    expect(mediana([])).toBeNull();
    expect(mediana([5, 1, 3])).toBe(3);
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
  });
});
