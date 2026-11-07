/**
 * Importação de pedidos: pedido repetido (mesmo número, nada novo no arquivo) é bloqueado.
 * Lógica pura (lib/importacao.js) e as duas rotas (POST /pedidos/importar/verificar e /pedidos/importar).
 */
const request = require('supertest');
const bcrypt  = require('bcrypt');
const { dadosDoPedido, classificarPedidoImportado, classificarImportacao } = require('../lib/importacao');

const linha = (numero, extra = {}) => ({ numero_pedido: numero, codigo: 'AB-1', descricao: 'x', quantidade: 2, endereco: 'A001', cliente: 'Ana Souza', transportadora: 'SEDEX', aguardando_desde: '05/11/2026 21:30', estado: 'sp', ...extra });
const existente = (extra = {}) => ({ cliente: 'Ana Souza', transportadora: 'SEDEX', aguardando_desde: '05/11/2026 21:30', estado: 'SP', itens: [{ codigo: 'AB-1', quantidade: 2 }], ...extra });

describe('classificarPedidoImportado', () => {
  const novo = linhas => dadosDoPedido(linhas);

  test('número que não está no sistema → novo', () => {
    expect(classificarPedidoImportado(novo([linha('1')]), null)).toEqual({ acao: 'novo' });
  });

  test('mesmo número e tudo igual → repetido (bloqueado)', () => {
    expect(classificarPedidoImportado(novo([linha('1')]), existente())).toEqual({ acao: 'repetido', diferente: false });
  });

  test('comparação sem diferenciar caixa nem espaços (nome, código, UF)', () => {
    const c = classificarPedidoImportado(novo([linha('1', { cliente: '  ANA SOUZA ', codigo: 'ab-1', estado: ' SP ' })]), existente());
    expect(c).toEqual({ acao: 'repetido', diferente: false });
  });

  test('mesmo número mas com cliente ou itens diferentes → repetido, marcado como diferente (o sistema não é alterado)', () => {
    expect(classificarPedidoImportado(novo([linha('1', { cliente: 'Outra Pessoa' })]), existente())).toEqual({ acao: 'repetido', diferente: true });
    expect(classificarPedidoImportado(novo([linha('1', { quantidade: 9 })]), existente())).toEqual({ acao: 'repetido', diferente: true });
    expect(classificarPedidoImportado(novo([linha('1'), linha('1', { codigo: 'ZZ-9' })]), existente())).toEqual({ acao: 'repetido', diferente: true });
  });

  test('o pedido no sistema está incompleto e o arquivo completa → NÃO é repetido (completa os vazios)', () => {
    expect(classificarPedidoImportado(novo([linha('1')]), existente({ transportadora: '60' })).acao).toBe('completa');   // número no lugar da transportadora
    expect(classificarPedidoImportado(novo([linha('1')]), existente({ transportadora: '' })).acao).toBe('completa');
    expect(classificarPedidoImportado(novo([linha('1')]), existente({ cliente: '' })).acao).toBe('completa');
    expect(classificarPedidoImportado(novo([linha('1')]), existente({ estado: '' })).acao).toBe('completa');
    expect(classificarPedidoImportado(novo([linha('1')]), existente({ aguardando_desde: '' })).acao).toBe('completa');
    expect(classificarPedidoImportado(novo([linha('1')]), existente({ itens: [] })).acao).toBe('completa');                // pedido sem itens
  });

  test('o arquivo vem com transportadora numérica (erro): não conta como informação nova', () => {
    const c = classificarPedidoImportado(novo([linha('1', { transportadora: '59' })]), existente({ transportadora: 'SEDEX' }));
    expect(c.acao).toBe('repetido');
  });

  test('arquivo sem a informação que falta no sistema não completa nada → repetido', () => {
    expect(classificarPedidoImportado(novo([linha('1', { transportadora: '' })]), existente({ transportadora: '' })).acao).toBe('repetido');
  });
});

describe('classificarImportacao (arquivo inteiro)', () => {
  test('separa novos, completam, repetidos e diferentes; linhas do mesmo pedido contam uma vez', () => {
    const dados = [linha('1'), linha('1', { codigo: 'CD-2' }), linha('2'), linha('3'), linha('4', { cliente: 'Outro' })];
    const ex = new Map([
      ['2', existente({ itens: [{ codigo: 'AB-1', quantidade: 2 }] })],                        // igual → repetido
      ['3', existente({ transportadora: '12' })],                                              // transportadora errada → completa
      ['4', existente()],                                                                      // cliente diferente → repetido+diferente
    ]);
    const r = classificarImportacao(dados, ex);
    expect(r.novos).toEqual(['1']);
    expect(r.completam).toEqual(['3']);
    expect(r.repetidos).toEqual(['2', '4']);
    expect(r.diferentes).toEqual(['4']);
    expect(r.importar).toEqual(['1', '3']);
  });

  test('arquivo todo repetido: nada a importar', () => {
    const r = classificarImportacao([linha('7'), linha('8')], new Map([['7', existente()], ['8', existente()]]));
    expect(r.importar).toEqual([]);
    expect(r.repetidos).toEqual(['7', '8']);
  });
});

/* ── rotas ── */
const mockDb = { run: jest.fn().mockResolvedValue({ rows: [] }), get: jest.fn().mockResolvedValue(null), all: jest.fn().mockResolvedValue([]) };
const mockPool = {
  query: jest.fn().mockResolvedValue({ rows: [] }),
  connect: jest.fn().mockResolvedValue({ query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() }),
  on: jest.fn(),
};
const HASH = bcrypt.hashSync('senha123', 4);
jest.mock('../lib/db', () => ({ db: mockDb, pool: mockPool }));
jest.mock('../lib/helpers', () => ({ ...jest.requireActual('../lib/helpers'), dataHoraLocal: () => ({ data: '2026-11-07', hora: '10:00:00' }) }));

describe('rotas de importação', () => {
  let app, a;
  beforeAll(() => { process.env.SESSION_SECRET = 'test_secret'; process.env.NODE_ENV = 'test'; process.env.DATABASE_URL = 'postgres://test'; app = require('../index'); });
  beforeEach(async () => {
    jest.resetAllMocks();
    mockDb.get.mockResolvedValue(null); mockDb.all.mockResolvedValue([]); mockDb.run.mockResolvedValue({ rows: [] });
    mockPool.query.mockResolvedValue({ rows: [] });
    mockPool.connect.mockResolvedValue({ query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() });
    a = request.agent(app);
    mockDb.get.mockResolvedValueOnce({ id: 1, nome: 'Sup', login: 'u', perfil: 'supervisor', senha_hash: HASH, subtipo_repositor: 'geral', perfis_acesso: '', turno: 'Manha', status: 'ativo', senha_temporaria: false });
    await a.post('/auth/login').send({ login: 'u', senha: 'senha123', perfil: 'supervisor' });
  });
  const noSistema = (numero, extra = {}) => [[{ id: 50, numero_pedido: numero, cliente: 'Ana Souza', transportadora: 'SEDEX', aguardando_desde: '05/11/2026 21:30', estado: 'SP' }], [{ pedido_id: 50, codigo: 'AB-1', quantidade: 2 }]];

  test('POST /pedidos/importar/verificar: lista o que importar e o que é repetido', async () => {
    mockDb.all.mockResolvedValueOnce(noSistema('5001')[0]).mockResolvedValueOnce(noSistema('5001')[1]);
    const r = await a.post('/pedidos/importar/verificar').send({ linhas: [linha('5001'), linha('5002')] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ total: 2, importar: ['5002'], novos: 1, completam: 0, repetidos: ['5001'], diferentes: [] });
  });

  test('verificar sem pedidos → 400', async () => {
    expect((await a.post('/pedidos/importar/verificar').send({ linhas: [] })).status).toBe(400);
  });

  test('POST /pedidos/importar bloqueia o repetido: não grava nada e informa quantos foram bloqueados', async () => {
    mockDb.all.mockResolvedValueOnce(noSistema('5001')[0]).mockResolvedValueOnce(noSistema('5001')[1]);
    const r = await a.post('/pedidos/importar').send({ linhas: [linha('5001')] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ importados: 0, repetidos: 1, repetidos_diferentes: 0, repetidos_numeros: ['5001'] });
    expect(mockPool.query.mock.calls.some(c => /INSERT INTO pedidos/.test(c[0]))).toBe(false);
  });

  test('importa só o novo quando o arquivo mistura novo e repetido', async () => {
    mockDb.all.mockResolvedValueOnce(noSistema('5001')[0]).mockResolvedValueOnce(noSistema('5001')[1]);
    mockPool.query.mockResolvedValue({ rows: [{ id: 77, inserido: true }] });
    const r = await a.post('/pedidos/importar').send({ linhas: [linha('5001'), linha('5002')] });
    expect(r.body).toMatchObject({ importados: 1, repetidos: 1 });
    const inserts = mockPool.query.mock.calls.filter(c => /INSERT INTO pedidos/.test(c[0]));
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1][0]).toBe('5002');
  });
});
