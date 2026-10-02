/**
 * WMS Miess — Testes de routes/simulador.js
 * Roda com: npx jest tests/simulador-routes.test.js
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
  return {
    ...real,
    dataHoraLocal: () => ({ data: '2026-09-18', hora: '10:00:00' }),
    turnoAtualEHorarios: () => ({ turno: 'Manha', fim_hora: '13:00', minutos_restantes: 180 }),
  };
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

const loginSeparador = async (agent) => {
  mockDb.get.mockResolvedValueOnce({
    id: 2, nome: 'Sep', login: 'sep1', perfil: 'separador',
    senha_hash: HASH_SEP, subtipo_repositor: 'geral',
    perfis_acesso: '', turno: 'Manhã', status: 'ativo', senha_temporaria: false,
  });
  mockDb.get.mockResolvedValueOnce(null);
  return agent.post('/auth/login').send({ login: 'sep1', senha: SENHA_SEP, perfil: 'separador' });
};

describe('GET /simulador/capacidade', () => {
  test('sem auth → 401', async () => {
    const res = await request(app).get('/simulador/capacidade?processo=separacao&delta=2');
    expect(res.status).toBe(401);
  });

  test('como separador → 403', async () => {
    const sepAgent = request.agent(app);
    await loginSeparador(sepAgent);
    const res = await sepAgent.get('/simulador/capacidade?processo=separacao&delta=2');
    expect(res.status).toBe(403);
  });

  test('processo inválido → 400', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    const res = await agent.get('/simulador/capacidade?processo=faturamento&delta=2');
    expect(res.status).toBe(400);
  });

  test('delta ausente/inválido → 400', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    const res = await agent.get('/simulador/capacidade?processo=separacao');
    expect(res.status).toBe(400);
  });

  test('processo=separacao com delta positivo → 200 com produção simulada maior', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    // metricasSeparacao: producaoAtual, restante, mediaItens (3 db.get em Promise.all)
    // pessoasAtivasSeparacao: 1 db.get
    mockDb.get
      .mockResolvedValueOnce({ itens: 200 })   // producaoAtual
      .mockResolvedValueOnce({ itens: 1000 })  // restante
      .mockResolvedValueOnce({ media: 10 })    // mediaItens
      .mockResolvedValueOnce({ n: 4 });        // pessoasAtivas

    const res = await agent.get('/simulador/capacidade?processo=separacao&delta=2');
    expect(res.status).toBe(200);
    expect(res.body.pessoas_ativas).toBe(4);
    expect(res.body.pessoas_simuladas).toBe(6);
    expect(res.body.producao_simulada_h).toBe(300); // 50/pessoa × 6
  });

  test('processo=checkout → 200', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.get
      .mockResolvedValueOnce({ itens: 90 })
      .mockResolvedValueOnce({ itens: 400 })
      .mockResolvedValueOnce({ media: 5 })
      .mockResolvedValueOnce({ n: 3 });
    const res = await agent.get('/simulador/capacidade?processo=checkout&delta=-1');
    expect(res.status).toBe(200);
    expect(res.body.processo).toBe('checkout');
    expect(res.body.pessoas_simuladas).toBe(2);
  });

  test('erro de banco → 500', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.get.mockRejectedValueOnce(new Error('conexão perdida'));
    const res = await agent.get('/simulador/capacidade?processo=embalagem&delta=1');
    expect(res.status).toBe(500);
  });
});
