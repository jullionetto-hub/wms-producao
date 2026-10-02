/**
 * WMS Miess — Testes de routes/mapa-estoque.js
 * Roda com: npx jest tests/mapa-estoque-routes.test.js
 */

const request = require('supertest');
const bcrypt  = require('bcrypt');

const mockDb = {
  run: jest.fn().mockResolvedValue({ rows: [] }),
  get: jest.fn().mockResolvedValue(null),
  all: jest.fn().mockResolvedValue([]),
};

const mockPool = {
  query: jest.fn().mockResolvedValue({ rows: [] }),
  connect: jest.fn().mockResolvedValue({
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  }),
  on: jest.fn(),
};

const SENHA_ADMIN = 'admin123';
const HASH_ADMIN  = bcrypt.hashSync(SENHA_ADMIN, 4);
const SENHA_SEP   = 'sep123';
const HASH_SEP    = bcrypt.hashSync(SENHA_SEP, 4);

jest.mock('../lib/db', () => ({ db: mockDb, pool: mockPool }));
jest.mock('../lib/helpers', () => {
  const real = jest.requireActual('../lib/helpers');
  return { ...real, dataHoraLocal: () => ({ data: '2026-05-09', hora: '10:00' }) };
});

let app;
beforeAll(() => {
  process.env.SESSION_SECRET = 'test_secret';
  process.env.NODE_ENV       = 'test';
  process.env.DATABASE_URL   = 'postgres://test';
  app = require('../index');
});

beforeEach(() => {
  jest.resetAllMocks();
  mockDb.get.mockResolvedValue(null);
  mockDb.all.mockResolvedValue([]);
  mockDb.run.mockResolvedValue({ rows: [] });
  mockPool.query.mockResolvedValue({ rows: [] });
  mockPool.connect.mockResolvedValue({
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  });
});

const loginSupervisor = (agent) => {
  mockDb.get.mockResolvedValueOnce({
    id: 1, nome: 'Supervisor Test', login: 'admin',
    perfil: 'supervisor', senha_hash: HASH_ADMIN,
    subtipo_repositor: 'geral', perfis_acesso: '', turno: 'Manhã', status: 'ativo',
    senha_temporaria: false,
  });
  return agent.post('/auth/login').send({ login: 'admin', senha: SENHA_ADMIN, perfil: 'supervisor' });
};

const loginSeparador = async () => {
  mockDb.get.mockResolvedValueOnce({
    id: 2, nome: 'Sep', login: 'sep1', perfil: 'separador',
    senha_hash: HASH_SEP, subtipo_repositor: 'geral',
    perfis_acesso: '', turno: 'Manhã', status: 'ativo', senha_temporaria: false,
  });
  const sepAgent = request.agent(app);
  mockDb.get.mockResolvedValueOnce(null);
  await sepAgent.post('/auth/login').send({ login: 'sep1', senha: SENHA_SEP, perfil: 'separador' });
  return sepAgent;
};

describe('GET /mapa-estoque — autenticação', () => {
  test('sem auth → 401', async () => {
    const res = await request(app).get('/mapa-estoque');
    expect(res.status).toBe(401);
  });

  test('como separador → 403', async () => {
    const sepAgent = await loginSeparador();
    const res = await sepAgent.get('/mapa-estoque');
    expect(res.status).toBe(403);
  });
});

describe('GET /mapa-estoque — cálculo', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('200 combina os 4 sinais por rua corretamente', async () => {
    // Ordem: ruptura, estoque_baixo, separacao, reposicao (ver Promise.all no route)
    mockDb.all.mockResolvedValueOnce([{ rua: 'F', total: 3 }]);          // ruptura
    mockDb.all.mockResolvedValueOnce([{ rua: 'M', total: 1 }]);          // estoque_baixo
    mockDb.all.mockResolvedValueOnce([{ rua: 'F', total: 2 }]);          // separacao (F também está em ruptura)
    mockDb.all.mockResolvedValueOnce([{ rua: 'Q', total: 5 }]);          // reposicao

    const res = await agent.get('/mapa-estoque');
    expect(res.status).toBe(200);
    expect(res.body.ruas.F.estado_principal).toBe('ruptura');
    expect(res.body.ruas.F.estados).toEqual(['ruptura', 'separacao']);
    expect(res.body.ruas.M.estado_principal).toBe('estoque_baixo');
    expect(res.body.ruas.Q.estado_principal).toBe('reposicao');
    expect(res.body.ruas.A).toBeUndefined(); // rua sem nenhum sinal não aparece na resposta
  });

  test('sem nenhum sinal em nenhuma rua → ruas vazio, sem erro', async () => {
    mockDb.all.mockResolvedValue([]);
    const res = await agent.get('/mapa-estoque');
    expect(res.status).toBe(200);
    expect(res.body.ruas).toEqual({});
  });

  test('erro de banco → 500', async () => {
    mockDb.all.mockRejectedValueOnce(new Error('conexão perdida'));
    const res = await agent.get('/mapa-estoque');
    expect(res.status).toBe(500);
  });
});

describe('GET /mapa-estoque/:rua — detalhe', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('200 traz os 4 blocos de detalhe da rua', async () => {
    mockDb.all.mockResolvedValueOnce([{ codigo: 'X1', nome: 'Produto X', saldo: 0, localizacao: 'F10' }]); // skus_ruptura
    mockDb.all.mockResolvedValueOnce([]); // colmeias_estoque_baixo
    mockDb.all.mockResolvedValueOnce([{ numero_pedido: '123', separador_nome: 'João' }]); // pedidos_separando
    mockDb.all.mockResolvedValueOnce([]); // avisos_pendentes

    const res = await agent.get('/mapa-estoque/F');
    expect(res.status).toBe(200);
    expect(res.body.rua).toBe('F');
    expect(res.body.skus_ruptura).toHaveLength(1);
    expect(res.body.pedidos_separando).toHaveLength(1);
    expect(res.body.estado.estado_principal).toBe('ruptura');
  });
});
