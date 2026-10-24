/**
 * WMS Miess — Testes de routes/estoque-3d.js
 * Roda com: npx jest tests/estoque-3d-routes.test.js
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

describe('rotas /estoque-3d — autenticação', () => {
  test('sem auth → 401', async () => {
    const res = await request(app).get('/estoque-3d/dados');
    expect(res.status).toBe(401);
  });

  test('como separador → 403', async () => {
    const sepAgent = await loginSeparador();
    const res = await sepAgent.get('/estoque-3d/dados');
    expect(res.status).toBe(403);
  });
});

describe('GET /estoque-3d/dados', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('200 devolve produtos compactos, separação, reposição e giro', async () => {
    // Ordem do Promise.all: produtos, separando, reposicao, giro
    mockDb.all.mockResolvedValueOnce([{ codigo: 'HL670', nome: 'Calcinha', localizacao: 'J121', saldo: '12', disponivel: '10' }]);
    mockDb.all.mockResolvedValueOnce([{ endereco: 'J121', codigo: 'HL670', quantidade: 1, status_item: 'pendente', numero_pedido: '900' }]);
    mockDb.all.mockResolvedValueOnce([{ endereco: 'K022', codigo: 'X', quantidade: 2, numero_pedido: '901' }]);
    mockDb.all.mockResolvedValueOnce([{ endereco: 'J121', linhas: 7, qtd: 9 }]);
    const res = await agent.get('/estoque-3d/dados?dias=15');
    expect(res.status).toBe(200);
    expect(res.body.dias).toBe(15);
    expect(res.body.produtos).toEqual([['HL670', 'Calcinha', 'J121', 12, 10]]);
    expect(res.body.separando[0].endereco).toBe('J121');
    expect(res.body.reposicao[0].endereco).toBe('K022');
    expect(res.body.giro[0]).toEqual({ endereco: 'J121', linhas: 7, qtd: 9 });
  });

  test('dias inválido é limitado a 1..90', async () => {
    mockDb.all.mockResolvedValue([]);
    const res = await agent.get('/estoque-3d/dados?dias=9999');
    expect(res.status).toBe(200);
    expect(res.body.dias).toBe(90);
  });

  test('erro de banco → 500', async () => {
    mockDb.all.mockRejectedValue(new Error('boom'));
    const res = await agent.get('/estoque-3d/dados');
    expect(res.status).toBe(500);
  });
});

describe('GET /estoque-3d/pedidos', () => {
  test('200 devolve os pedidos com as ruas por onde passam', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.all.mockResolvedValueOnce([{ numero_pedido: '900', status: 'separando', itens: 3, rua: '', separador: 'Ana', ruas: ['Q', 'T'] }]);
    const res = await agent.get('/estoque-3d/pedidos');
    expect(res.status).toBe(200);
    expect(res.body.pedidos[0].ruas).toEqual(['Q', 'T']);
  });
});

describe('GET /estoque-3d/pedido/:numero', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('404 quando o pedido não existe', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.get('/estoque-3d/pedido/999');
    expect(res.status).toBe(404);
  });

  test('200 devolve os itens com endereço', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 5, numero_pedido: '900', status: 'pendente' });
    mockDb.all.mockResolvedValueOnce([{ codigo: 'A', descricao: 'x', endereco: 'Q012', quantidade: 2, status: 'pendente', qtd_falta: 0 }]);
    const res = await agent.get('/estoque-3d/pedido/900');
    expect(res.status).toBe(200);
    expect(res.body.itens[0].endereco).toBe('Q012');
  });
});

describe('GET /modelo-estoque (página)', () => {
  test('sem login → redireciona para /', async () => {
    const res = await request(app).get('/modelo-estoque');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  test('supervisor recebe o HTML', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    const res = await agent.get('/modelo-estoque');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Estoque Vertical');
  });

  test('o arquivo não é servido de graça pela pasta public', async () => {
    const res = await request(app).get('/modelo-estoque.html');
    expect(res.status).toBe(404);
  });
});
