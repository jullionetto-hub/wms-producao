/**
 * WMS Miess — Testes do painel de liderança (routes/lideranca.js)
 * Roda com: npm test -- lideranca-routes
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

// Helper — autentica supervisor
const loginSupervisor = (agent) => {
  mockDb.get.mockResolvedValueOnce({
    id: 1, nome: 'Supervisor Test', login: 'admin',
    perfil: 'supervisor', senha_hash: HASH_ADMIN,
    subtipo_repositor: 'geral', perfis_acesso: '', turno: 'Manhã', status: 'ativo',
    senha_temporaria: false,
  });
  return agent.post('/auth/login').send({ login: 'admin', senha: SENHA_ADMIN, perfil: 'supervisor' });
};

describe('GET /lideranca/turnos', () => {
  it('exige autenticação', async () => {
    const r = await request(app).get('/lideranca/turnos?ini=2026-09-01&fim=2026-09-30');
    expect(r.status).toBe(401);
  });

  it('valida ini/fim', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    const r = await agent.get('/lideranca/turnos?ini=x');
    expect(r.status).toBe(400);
  });

  it('junta passagem e diário por data+turno', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.all
      .mockResolvedValueOnce([{ id: 1, data: '2026-09-28', turno: 'Manha', supervisor: 'Ana', status: 'validado', leu_anterior: true,
        enviado_em: null, val_status: 'validado', pontuacao: 85, validador: 'Bia', itens: [{ id: 'caixas_ok', passou: false }] }])
      .mockResolvedValueOnce([{ id: 9, data: '2026-09-28', turno: 'Manha', supervisor: 'Ana', status: 'validado', sep_separados: 400,
        ck_feitos: 380, emb_embalados: 300, separadores_presentes: 'A, B, C', ocorrencias: '', pontos_perdidos: 25 },
        { id: 10, data: '2026-09-28', turno: 'Tarde', supervisor: 'Caio', status: 'pendente', sep_separados: 100, separadores_presentes: '' }]);
    const r = await agent.get('/lideranca/turnos?ini=2026-09-01&fim=2026-09-30');
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(2);
    const m = r.body.find(x => x.turno === 'Manha');
    expect(m).toMatchObject({ supervisor: 'Ana', pedidos: 400, presentes: 3, pontosPerdidos: 25, diarioNota: 85, diarioFalhas: ['caixas_ok'] });
    const t = r.body.find(x => x.turno === 'Tarde');
    expect(t).toMatchObject({ diarioStatus: 'ausente', diarioNota: null, pontosPerdidos: null });
  });
});
