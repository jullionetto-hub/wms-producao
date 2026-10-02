/**
 * WMS Miess — Testes de routes/control-tower.js
 * Roda com: npx jest tests/control-tower-routes.test.js
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
    dataHoraLocal: () => ({ data: '2026-05-09', hora: '10:00' }),
    turnoAtualEHorarios: () => ({ turno: 'Manha', fim_hora: '13:00', minutos_restantes: 135 }),
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

describe('GET /control-tower — autenticação', () => {
  test('sem auth → 401', async () => {
    const res = await request(app).get('/control-tower');
    expect(res.status).toBe(401);
  });

  test('como separador → 403', async () => {
    const sepAgent = await loginSeparador();
    const res = await sepAgent.get('/control-tower');
    expect(res.status).toBe(403);
  });
});

describe('GET /control-tower — cálculo', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('200 com metas configuradas → devolve turno, 4 processos e gargalo explicado', async () => {
    // 1) metasConfiguradas() — db.all
    mockDb.all.mockResolvedValueOnce([
      { chave: 'meta_separacao', valor: '100' },
      { chave: 'meta_checkout',  valor: '90' },
      { chave: 'meta_embalagem', valor: '120' },
      { chave: 'meta_reposicao', valor: '90' },
    ]);
    // 2) horasTurnoRow
    mockDb.get.mockResolvedValueOnce({ valor: '10' });
    // 3) metricasSeparacao: producaoAtual, restante, mediaItens — ritmo forte e
    // pouco volume represado, termina bem dentro do turno (não disputa o gargalo)
    mockDb.get.mockResolvedValueOnce({ itens: 200 });
    mockDb.get.mockResolvedValueOnce({ itens: 100 });
    mockDb.get.mockResolvedValueOnce({ media: 10 });
    // 4) metricasCheckout
    mockDb.get.mockResolvedValueOnce({ itens: 900 });
    mockDb.get.mockResolvedValueOnce({ itens: 200 });
    mockDb.get.mockResolvedValueOnce({ media: 10 });
    // 5) metricasEmbalagem — sem produção na última hora, com volume represado (vira o gargalo)
    mockDb.get.mockResolvedValueOnce({ itens: 0 });
    mockDb.get.mockResolvedValueOnce({ itens: 500 });
    mockDb.get.mockResolvedValueOnce({ media: 8 });
    // 6) metricasReposicao
    mockDb.get.mockResolvedValueOnce({ itens: 50 });
    mockDb.get.mockResolvedValueOnce({ itens: 10 });

    const res = await agent.get('/control-tower');
    expect(res.status).toBe(200);
    expect(res.body.turno_atual).toBe('Manha');
    expect(res.body.minutos_restantes_turno).toBe(135);
    expect(res.body.processos).toHaveLength(4);

    const sep = res.body.processos.find(p => p.processo === 'separacao');
    expect(sep.producao_atual_h).toBe(200);
    expect(sep.necessario_h).toBe(Math.round((100 * 10) / 10)); // meta 100 pedidos x 10 itens médios / 10h turno
    expect(sep.situacao).toBe('dentro_do_prazo');

    const emb = res.body.processos.find(p => p.processo === 'embalagem');
    expect(emb.producao_atual_h).toBe(0);
    expect(emb.situacao).toBe('atrasado');

    expect(res.body.gargalo).not.toBeNull();
    expect(res.body.gargalo.processo).toBe('embalagem');
    expect(res.body.gargalo.motivo).toContain('sem produção');
  });

  test('sem linhas em configuracoes → usa metas padrão (75/90/120/90) sem quebrar', async () => {
    mockDb.all.mockResolvedValueOnce([]); // nenhuma meta configurada
    mockDb.get.mockResolvedValue({ itens: 0, media: 1 }); // todo o resto zerado/neutro
    const res = await agent.get('/control-tower');
    expect(res.status).toBe(200);
    expect(res.body.processos).toHaveLength(4);
    // Tudo com volume restante 0 → todos "concluido", gargalo null
    expect(res.body.gargalo).toBeNull();
  });

  test('erro de banco → 500 com corpo de erro', async () => {
    mockDb.all.mockRejectedValueOnce(new Error('conexão perdida'));
    const res = await agent.get('/control-tower');
    expect(res.status).toBe(500);
    expect(res.body.erro).toBeDefined();
  });
});
