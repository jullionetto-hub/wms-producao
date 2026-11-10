/**
 * Parametro repetido na URL em ROTAS REAIS (app inteiro, banco simulado).
 * GET /kpis lia req.query.turnos.split(',') e dIni.substring(...): com ?turnos=a&turnos=b
 * o Express entrega lista e a rota quebrava (500). Agora vale o primeiro valor (lib/query.js).
 * Convencao dos demais testes de rotas (tests/kpis-routes.test.js).
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
  connect: jest.fn().mockResolvedValue({ query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() }),
  on: jest.fn(),
};
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
  mockPool.connect.mockResolvedValue({ query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() });
});

const loginSupervisor = (agent) => {
  mockDb.get.mockResolvedValueOnce({
    id: 1, nome: 'Supervisor Test', login: 'admin', perfil: 'supervisor',
    senha_hash: bcrypt.hashSync('admin123', 4), subtipo_repositor: 'geral',
    perfis_acesso: '', turno: 'Manhã', status: 'ativo', senha_temporaria: false,
  });
  return agent.post('/auth/login').send({ login: 'admin', senha: 'admin123', perfil: 'supervisor' });
};

describe('GET /kpis com parametros repetidos', () => {
  test('?turnos=...&turnos=... e ?data_ini=...&data_ini=... nao derrubam a rota', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    const r = await agent.get('/kpis?turnos=Manha,Tarde&turnos=Noite&data_ini=2026-05-01&data_ini=2026-05-02&data_fim=2026-05-09&data_fim=2026-05-10');
    expect(r.status).toBe(200);
  });

  test('parametro unico continua funcionando como antes', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    const r = await agent.get('/kpis?turnos=Manha,Tarde&data_ini=2026-05-01&data_fim=2026-05-09');
    expect(r.status).toBe(200);
  });
});
