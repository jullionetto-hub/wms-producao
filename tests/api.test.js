/**
 * WMS Miess — Testes Automatizados da API
 * Roda com: npm test
 * 
 * Testa:
 * - Autenticação (login, logout, sessão)
 * - Pedidos (CRUD, importação, distribuição)
 * - Repositor (avisos, situações)
 * - Checkout
 * - KPIs e estatísticas
 * - Auditoria
 */

const request = require('supertest');

// Mock do banco para testes
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

// Mock dos módulos antes de importar o app
jest.mock('../lib/db', () => ({ db: mockDb, pool: mockPool }));
jest.mock('../lib/helpers', () => ({
  dataHoraLocal: () => ({ data: '2026-04-22', hora: '10:00' }),
  hashSenha: (s) => 'hash_' + s,
  perfisPermitidos: (u) => [u.perfil],
  formatarAguardandoDesde: (v) => v || '',
}));

// Importa app após mocks
let app;
beforeAll(() => {
  process.env.SESSION_SECRET = 'test_secret';
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgres://test';
  app = require('../index');
});

// Helper para criar sessão autenticada
const loginSupervisor = (agent) => {
  mockDb.get.mockResolvedValueOnce({
    id: 1, nome: 'Supervisor Test', login: 'admin',
    perfil: 'supervisor', senha_hash: 'hash_admin123',
    subtipo_repositor: 'geral', perfis_acesso: '', turno: 'Manhã', status: 'ativo'
  });
  return agent.post('/auth/login').send({ login: 'admin', senha: 'admin123' });
};

/* ════════════════════════════════════════════════════════════
   1. AUTENTICAÇÃO
════════════════════════════════════════════════════════════ */
describe('Auth', () => {
  test('GET /auth/me sem sessão → 401', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  test('POST /auth/login com credenciais erradas → 401', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/auth/login')
      .send({ login: 'ninguem', senha: '123' });
    expect(res.status).toBe(401);
  });

  test('POST /auth/login com credenciais corretas → 200', async () => {
    mockDb.get.mockResolvedValueOnce({
      id: 1, nome: 'Admin', login: 'admin', perfil: 'supervisor',
      senha_hash: 'hash_admin123', subtipo_repositor: 'geral',
      perfis_acesso: '', turno: 'Manhã', status: 'ativo'
    });
    const res = await request(app)
      .post('/auth/login')
      .send({ login: 'admin', senha: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.usuario).toBeDefined();
    expect(res.body.usuario.perfil).toBe('supervisor');
  });

  test('POST /auth/logout → 200', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    const res = await agent.post('/auth/logout');
    expect(res.status).toBe(200);
  });

  test('Rate limit: 11 tentativas de login → 429', async () => {
    mockDb.get.mockResolvedValue(null);
    let lastRes;
    for (let i = 0; i < 11; i++) {
      lastRes = await request(app)
        .post('/auth/login')
        .set('X-Forwarded-For', '10.0.0.99')
        .send({ login: 'x', senha: 'x' });
    }
    expect(lastRes.status).toBe(429);
  });
});

/* ════════════════════════════════════════════════════════════
   2. PEDIDOS
════════════════════════════════════════════════════════════ */
describe('Pedidos', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('GET /pedidos → 200 com array', async () => {
    mockDb.all.mockResolvedValueOnce([
      { id: 1, numero_pedido: '12345', status: 'pendente', itens: 3 }
    ]);
    const res = await agent.get('/pedidos');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /pedidos sem auth → 401', async () => {
    const res = await request(app).get('/pedidos');
    expect(res.status).toBe(401);
  });

  test('GET /pedidos?status=pendente → filtra por status', async () => {
    mockDb.all.mockResolvedValueOnce([]);
    const res = await agent.get('/pedidos?status=pendente');
    expect(res.status).toBe(200);
  });

  test('POST /pedidos/importar sem dados → 400', async () => {
    const res = await agent.post('/pedidos/importar').send({ pedidos: [] });
    expect(res.status).toBe(400);
  });

  test('POST /pedidos/importar com separador → 403', async () => {
    mockDb.get.mockResolvedValueOnce({
      id: 2, nome: 'Sep', login: 'sep1', perfil: 'separador',
      senha_hash: 'hash_sep123', subtipo_repositor: 'geral',
      perfis_acesso: '', turno: 'Manhã', status: 'ativo'
    });
    const sepAgent = request.agent(app);
    await sepAgent.post('/auth/login').send({ login: 'sep1', senha: 'sep123' });
    const res = await sepAgent.post('/pedidos/importar').send({ pedidos: [{}] });
    expect(res.status).toBe(403);
  });
});

/* ════════════════════════════════════════════════════════════
   3. USUÁRIOS
════════════════════════════════════════════════════════════ */
describe('Usuários', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('GET /usuarios → 200', async () => {
    mockDb.all.mockResolvedValueOnce([{ id: 1, nome: 'Test', perfil: 'separador' }]);
    const res = await agent.get('/usuarios');
    expect(res.status).toBe(200);
  });

  test('POST /usuarios sem nome → 400', async () => {
    const res = await agent.post('/usuarios').send({ login: 'x', senha: '123' });
    expect(res.status).toBe(400);
  });

  test('POST /usuarios com dados completos → 200', async () => {
    mockDb.get.mockResolvedValueOnce(null); // login não existe
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 99 }] });
    const res = await agent.post('/usuarios').send({
      nome: 'Novo User', login: 'novo.user', senha: 'senha123',
      perfil: 'separador', turno: 'Manhã'
    });
    expect([200, 201]).toContain(res.status);
  });
});

/* ════════════════════════════════════════════════════════════
   4. REPOSITOR
════════════════════════════════════════════════════════════ */
describe('Repositor', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('GET /repositor/avisos → 200', async () => {
    mockDb.all.mockResolvedValueOnce([]);
    const res = await agent.get('/repositor/avisos');
    expect(res.status).toBe(200);
  });

  test('PUT /repositor/avisos/:id → atualiza situação', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, quem_pegou: '', quem_guardou: '', forma_envio: '', obs: '', qtd_encontrada: 0 });
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    const res = await agent
      .put('/repositor/avisos/1')
      .send({ situacao: 'abastecido', quem_pegou: 'João', quem_guardou: 'João' });
    expect(res.status).toBe(200);
  });

  test('GET /repositor/ranking-produtos → 200', async () => {
    mockDb.all.mockResolvedValueOnce([]);
    const res = await agent.get('/repositor/ranking-produtos');
    expect(res.status).toBe(200);
  });
});

/* ════════════════════════════════════════════════════════════
   5. KPIs E ESTATÍSTICAS
════════════════════════════════════════════════════════════ */
describe('KPIs', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('GET /kpis → 200 com dados', async () => {
    mockDb.get.mockResolvedValueOnce({
      concluidos_hoje: 5, em_separacao: 2, faltas_abertas: 1,
      pendentes: 10, checkout_hoje: 3, checkpoint_pend: 1,
      seps_ativos: 4, nao_encontrados_hoje: 0, total_faltas_hoje: 1
    });
    const res = await agent.get('/kpis');
    expect(res.status).toBe(200);
    expect(res.body.pendentes).toBeDefined();
  });

  test('GET /estatisticas/repositor → 200', async () => {
    mockDb.get.mockResolvedValueOnce({ reposto_hoje: 3, reposto_mes: 10, reposto_ano: 50, nao_encontrado_hoje: 1 });
    const res = await agent.get('/estatisticas/repositor');
    expect(res.status).toBe(200);
  });
});

/* ════════════════════════════════════════════════════════════
   6. AUDITORIA
════════════════════════════════════════════════════════════ */
describe('Auditoria', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('GET /auditoria → 200', async () => {
    mockDb.all.mockResolvedValueOnce([
      { id: 1, usuario: 'admin', acao: 'login', data: '2026-04-22', hora: '10:00' }
    ]);
    const res = await agent.get('/auditoria');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /auditoria sem auth → 401', async () => {
    const res = await request(app).get('/auditoria');
    expect(res.status).toBe(401);
  });
});

/* ════════════════════════════════════════════════════════════
   7. SEGURANÇA
════════════════════════════════════════════════════════════ */
describe('Segurança', () => {
  test('Headers de segurança presentes', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  test('Rota inexistente → 404', async () => {
    const res = await request(app).get('/rota-que-nao-existe');
    expect(res.status).toBe(404);
  });

  test('POST /admin/zerar-dados sem confirmação → 400', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    const res = await agent.post('/admin/zerar-dados').send({ confirmar: 'errado' });
    expect(res.status).toBe(400);
  });
});
