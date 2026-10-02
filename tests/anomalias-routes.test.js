/**
 * WMS Miess — Testes de routes/anomalias.js
 * Roda com: npx jest tests/anomalias-routes.test.js
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
  return { ...real, dataHoraLocal: () => ({ data: '2026-09-18', hora: '10:00:00' }) };
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

describe('GET /anomalias/ritmo', () => {
  test('sem auth → 401', async () => {
    const res = await request(app).get('/anomalias/ritmo');
    expect(res.status).toBe(401);
  });

  test('como separador → 403', async () => {
    const sepAgent = request.agent(app);
    await loginSeparador(sepAgent);
    const res = await sepAgent.get('/anomalias/ritmo');
    expect(res.status).toBe(403);
  });

  test('200 detecta separador com ritmo abaixo do próprio histórico', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);

    mockDb.get.mockResolvedValueOnce({ d: '2026-08-19' }); // inicioHistorico
    mockDb.all.mockResolvedValueOnce([
      { separador_id: 1, nome: 'João', itens_hoje: 80, horas_hoje: 2, itens_historico: 2000, horas_historico: 20 }, // 40/h vs 100/h = 40%
      { separador_id: 2, nome: 'Maria', itens_hoje: 180, horas_hoje: 2, itens_historico: 2000, horas_historico: 20 }, // 90/h vs 100/h = normal
    ]);

    const res = await agent.get('/anomalias/ritmo');
    expect(res.status).toBe(200);
    expect(res.body.anomalias).toHaveLength(1);
    expect(res.body.anomalias[0].nome).toBe('João');
    expect(res.body.periodo_historico_desde).toBe('2026-08-19');
  });

  test('200 sem ninguém ativo hoje → anomalias vazio', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.get.mockResolvedValueOnce({ d: '2026-08-19' });
    mockDb.all.mockResolvedValueOnce([]);
    const res = await agent.get('/anomalias/ritmo');
    expect(res.status).toBe(200);
    expect(res.body.anomalias).toEqual([]);
  });

  test('separador sem nome cadastrado usa fallback', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.get.mockResolvedValueOnce({ d: '2026-08-19' });
    mockDb.all.mockResolvedValueOnce([
      { separador_id: 9, nome: null, itens_hoje: 40, horas_hoje: 2, itens_historico: 2000, horas_historico: 20 },
    ]);
    const res = await agent.get('/anomalias/ritmo');
    expect(res.status).toBe(200);
    expect(res.body.anomalias[0].nome).toBe('Separador #9');
  });

  test('erro de banco → 500', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.get.mockRejectedValueOnce(new Error('conexão perdida'));
    const res = await agent.get('/anomalias/ritmo');
    expect(res.status).toBe(500);
  });
});
