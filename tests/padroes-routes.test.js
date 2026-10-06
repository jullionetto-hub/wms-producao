/**
 * WMS Miess — Testes Automatizados da API
 * Cobertura de routes/padroes.js (detecção de padrões por colaborador)
 * Roda com: npm test
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
  delete process.env.ANTHROPIC_API_KEY;
  app = require('../index');
});

beforeEach(() => {
  jest.resetAllMocks();
  mockDb.get.mockResolvedValue(null);
  mockDb.all.mockResolvedValue([]);
  mockDb.run.mockResolvedValue({ rows: [] });
  mockPool.query.mockResolvedValue({ rows: [] });
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

const loginSeparador = (agent) => {
  mockDb.get.mockResolvedValueOnce({
    id: 3, nome: 'Separador Test', login: 'sep1',
    perfil: 'separador', senha_hash: HASH_ADMIN,
    subtipo_repositor: '', perfis_acesso: '', turno: 'Manhã', status: 'ativo',
    senha_temporaria: false,
  });
  return agent.post('/auth/login').send({ login: 'sep1', senha: SENHA_ADMIN, perfil: 'separador' });
};

describe('GET /performance/padroes', () => {
  test('sem auth → 401', async () => {
    const res = await request(app).get('/performance/padroes?ini=2026-05-01&fim=2026-05-07');
    expect(res.status).toBe(401);
  });

  test('perfil separador (não permitido) → 403', async () => {
    const agent = request.agent(app);
    await loginSeparador(agent);
    const res = await agent.get('/performance/padroes?ini=2026-05-01&fim=2026-05-07');
    expect(res.status).toBe(403);
  });

  test('sem ini/fim → 400', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    const res = await agent.get('/performance/padroes');
    expect(res.status).toBe(400);
  });

  test('período sem nenhum dado → 200 com lista vazia', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.all.mockResolvedValue([]);
    const res = await agent.get('/performance/padroes?ini=2026-05-01&fim=2026-05-07');
    expect(res.status).toBe(200);
    expect(res.body.colaboradores).toEqual([]);
    expect(res.body.resumo.total_avaliado).toBe(0);
  });

  test('colaborador com tempo muito acima da equipe → sinal crítico de outlier', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    // Ordem das 6 queries em Promise.all dentro de calcularPadroes:
    // 1) tempoColab  2) porColabDia  3) desfeitos  4) itensVerificados  5) avisosRows  6) ocorrencias
    mockDb.all
      .mockResolvedValueOnce([
        ...Array.from({ length: 8 }, (_, i) => ({ nome: `Normal${i}`, turno: 'Manha', pedidos: 10, tempo_medio_min: '10.0' })),
        { nome: 'Lento', turno: 'Manha', pedidos: 10, tempo_medio_min: '60.0' },
      ])
      .mockResolvedValueOnce([])  // porColabDia
      .mockResolvedValueOnce([])  // desfeitos
      .mockResolvedValueOnce([])  // itensVerificados
      .mockResolvedValueOnce([])  // avisosRows
      .mockResolvedValueOnce([]); // ocorrencias

    const res = await agent.get('/performance/padroes?ini=2026-05-01&fim=2026-05-07');
    expect(res.status).toBe(200);
    const lento = res.body.colaboradores.find(c => c.nome === 'Lento');
    expect(lento).toBeTruthy();
    expect(lento.nivel_geral).toBe('critico');
    expect(lento.sinais.some(s => s.tipo === 'tempo_outlier')).toBe(true);
    expect(res.body.resumo.criticos).toBeGreaterThanOrEqual(1);
  });

  test('colaborador com muitas marcações desfeitas → sinal de correção', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.all
      .mockResolvedValueOnce([]) // tempoColab
      .mockResolvedValueOnce([]) // porColabDia
      .mockResolvedValueOnce([
        { nome: 'Carlos', desfeitos: 8 },
        { nome: 'Ana',    desfeitos: 1 },
        { nome: 'Bruno',  desfeitos: 1 },
      ]) // desfeitos
      .mockResolvedValueOnce([
        { nome: 'Carlos', itens_verificados: 100 },
        { nome: 'Ana',    itens_verificados: 100 },
        { nome: 'Bruno',  itens_verificados: 100 },
      ]) // itensVerificados
      .mockResolvedValueOnce([]) // avisosRows
      .mockResolvedValueOnce([]); // ocorrencias

    const res = await agent.get('/performance/padroes?ini=2026-05-01&fim=2026-05-07');
    expect(res.status).toBe(200);
    const carlos = res.body.colaboradores.find(c => c.nome === 'Carlos');
    expect(carlos).toBeTruthy();
    expect(carlos.sinais.some(s => s.tipo === 'correcao')).toBe(true);
  });

  test('reincidência em ocorrências graves → sinal crítico', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.all
      .mockResolvedValueOnce([]) // tempoColab
      .mockResolvedValueOnce([]) // porColabDia
      .mockResolvedValueOnce([]) // desfeitos
      .mockResolvedValueOnce([]) // itensVerificados
      .mockResolvedValueOnce([]) // avisosRows
      .mockResolvedValueOnce([
        { nome: 'João', tipo: 'falta', gravidade: 'grave' },
        { nome: 'João', tipo: 'falta', gravidade: 'grave' },
      ]); // ocorrencias

    const res = await agent.get('/performance/padroes?ini=2026-05-01&fim=2026-05-07');
    expect(res.status).toBe(200);
    const joao = res.body.colaboradores.find(c => c.nome === 'João');
    expect(joao.nivel_geral).toBe('critico');
    expect(joao.sinais.some(s => s.tipo === 'reincidencia')).toBe(true);
  });
});

describe('GET /performance/padroes/resumo-ia', () => {
  test('sem auth → 401', async () => {
    const res = await request(app).get('/performance/padroes/resumo-ia?ini=2026-05-01&fim=2026-05-07');
    expect(res.status).toBe(401);
  });

  test('sem ANTHROPIC_API_KEY configurada → 501', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    const res = await agent.get('/performance/padroes/resumo-ia?ini=2026-05-01&fim=2026-05-07');
    expect(res.status).toBe(501);
    expect(res.body.erro).toMatch(/ANTHROPIC_API_KEY/);
  });
});
