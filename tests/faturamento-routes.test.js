/**
 * WMS Miess — Testes de routes/faturamento.js
 * Roda com: npx jest tests/faturamento-routes.test.js
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

const loginSeparador = async (agent) => {
  mockDb.get.mockResolvedValueOnce({
    id: 2, nome: 'Sep', login: 'sep1', perfil: 'separador',
    senha_hash: HASH_SEP, subtipo_repositor: 'geral',
    perfis_acesso: '', turno: 'Manhã', status: 'ativo', senha_temporaria: false,
  });
  mockDb.get.mockResolvedValueOnce(null);
  return agent.post('/auth/login').send({ login: 'sep1', senha: SENHA_SEP, perfil: 'separador' });
};

describe('POST /faturamento/importar', () => {
  test('sem auth → 401', async () => {
    const res = await request(app).post('/faturamento/importar').send({ registros: [{ numero_pedido: '1', data_fat: '2026-09-18' }] });
    expect(res.status).toBe(401);
  });

  test('como separador → 403', async () => {
    const sepAgent = request.agent(app);
    await loginSeparador(sepAgent);
    const res = await sepAgent.post('/faturamento/importar').send({ registros: [{ numero_pedido: '1', data_fat: '2026-09-18' }] });
    expect(res.status).toBe(403);
  });

  test('sem registros → 400', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    const res = await agent.post('/faturamento/importar').send({ registros: [] });
    expect(res.status).toBe(400);
  });

  test('registros válidos → insere e grava fat_importacoes', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);

    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // INSERT registro 1
      .mockResolvedValueOnce({ rows: [] }) // INSERT registro 2
      .mockResolvedValueOnce({ rows: [] }) // INSERT fat_importacoes
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    mockPool.connect.mockResolvedValueOnce(client);

    const res = await agent.post('/faturamento/importar').send({
      nome_arquivo: 'faturamento_set.xlsx',
      registros: [
        { numero_pedido: '1001', faturado: '150.50', itens: '3', data_fat: '2026-09-18', hora_fat: '09:15:00', usuario: 'jsilva', turno: 'Manha' },
        { numero_pedido: '1002', faturado: '80', itens: '1', data_fat: '2026-09-17', hora_fat: '14:00:00', usuario: 'jsilva', turno: 'Tarde' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.inseridos).toBe(2);
    expect(res.body.ini).toBe('2026-09-17');
    expect(res.body.fim).toBe('2026-09-18');
  });

  test('registro sem numero_pedido ou data_fat é pulado — todos inválidos → 400', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);

    const client = { query: jest.fn(), release: jest.fn() };
    client.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    mockPool.connect.mockResolvedValueOnce(client);

    const res = await agent.post('/faturamento/importar').send({
      registros: [{ numero_pedido: '', data_fat: '' }],
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /faturamento/importacoes', () => {
  test('sem auth → 401', async () => {
    const res = await request(app).get('/faturamento/importacoes');
    expect(res.status).toBe(401);
  });

  test('200 lista histórico', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.all.mockResolvedValueOnce([{ id: 1, nome_arquivo: 'x.xlsx', total_registros: 10 }]);
    const res = await agent.get('/faturamento/importacoes');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
