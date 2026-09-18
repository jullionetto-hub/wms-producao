/**
 * WMS Miess — Testes de routes/permissoes.js
 * Roda com: npx jest tests/permissoes-routes.test.js
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
const SENHA_SUP   = 'sup123';
const HASH_SUP    = bcrypt.hashSync(SENHA_SUP, 4);

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

const loginGestor = (agent) => {
  mockDb.get.mockResolvedValueOnce({
    id: 1, nome: 'Gestor Test', login: 'gestor1',
    perfil: 'gestor', senha_hash: HASH_ADMIN,
    subtipo_repositor: 'geral', perfis_acesso: '', turno: 'Manhã', status: 'ativo',
    senha_temporaria: false,
  });
  return agent.post('/auth/login').send({ login: 'gestor1', senha: SENHA_ADMIN, perfil: 'gestor' });
};

const loginSupervisor = async (agent) => {
  mockDb.get.mockResolvedValueOnce({
    id: 2, nome: 'Supervisor Test', login: 'sup1',
    perfil: 'supervisor', senha_hash: HASH_SUP,
    subtipo_repositor: 'geral', perfis_acesso: '', turno: 'Manhã', status: 'ativo',
    senha_temporaria: false,
  });
  mockDb.get.mockResolvedValueOnce(null);
  return agent.post('/auth/login').send({ login: 'sup1', senha: SENHA_SUP, perfil: 'supervisor' });
};

describe('GET /permissoes/acoes', () => {
  test('sem auth → 401', async () => {
    const res = await request(app).get('/permissoes/acoes');
    expect(res.status).toBe(401);
  });

  test('como supervisor (não gestor) → 403', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    const res = await agent.get('/permissoes/acoes');
    expect(res.status).toBe(403);
  });

  test('como gestor → 200 com as 7 ações', async () => {
    const agent = request.agent(app);
    await loginGestor(agent);
    const res = await agent.get('/permissoes/acoes');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(7);
  });
});

describe('GET /permissoes/usuarios/:id', () => {
  test('id inválido → 400', async () => {
    const agent = request.agent(app);
    await loginGestor(agent);
    const res = await agent.get('/permissoes/usuarios/abc');
    expect(res.status).toBe(400);
  });

  test('200 lista overrides do usuário', async () => {
    const agent = request.agent(app);
    await loginGestor(agent);
    mockDb.all.mockResolvedValueOnce([{ acao: 'excluir', concedida: false, concedido_por: 'Gestor Test' }]);
    const res = await agent.get('/permissoes/usuarios/5');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].acao).toBe('excluir');
  });
});

describe('PUT /permissoes/usuarios/:id', () => {
  test('ação inválida → 400', async () => {
    const agent = request.agent(app);
    await loginGestor(agent);
    const res = await agent.put('/permissoes/usuarios/5').send({ acao: 'destruir', concedida: false });
    expect(res.status).toBe(400);
  });

  test('concedida não-booleano → 400', async () => {
    const agent = request.agent(app);
    await loginGestor(agent);
    const res = await agent.put('/permissoes/usuarios/5').send({ acao: 'excluir', concedida: 'nao' });
    expect(res.status).toBe(400);
  });

  test('revoga a ação excluir de um supervisor → 200', async () => {
    const agent = request.agent(app);
    await loginGestor(agent);
    const res = await agent.put('/permissoes/usuarios/5').send({ acao: 'excluir', concedida: false });
    expect(res.status).toBe(200);
    expect(mockDb.run).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT'), [5, 'excluir', false, 'Gestor Test']);
  });

  test('como supervisor (não gestor) → 403, não altera nada', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    const res = await agent.put('/permissoes/usuarios/5').send({ acao: 'excluir', concedida: false });
    expect(res.status).toBe(403);
    expect(mockDb.run).not.toHaveBeenCalled();
  });
});

describe('DELETE /permissoes/usuarios/:id/:acao', () => {
  test('reseta a permissão pro padrão do perfil → 200', async () => {
    const agent = request.agent(app);
    await loginGestor(agent);
    const res = await agent.delete('/permissoes/usuarios/5/excluir');
    expect(res.status).toBe(200);
    expect(mockDb.run).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM permissoes_usuario'), [5, 'excluir']);
  });
});
