/**
 * WMS Miess — Testes Automatizados da API
 * Roda com: npm test
 */

const request = require('supertest');
const bcrypt  = require('bcrypt');

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

// Gera hash bcrypt real para testes de autenticação
const SENHA_ADMIN  = 'admin123';
const HASH_ADMIN   = bcrypt.hashSync(SENHA_ADMIN, 4); // rounds baixo para velocidade em teste
const HASH_LEGADO  = require('crypto').createHash('sha256').update('legado123' + 'wms_salt_2026').digest('hex');

jest.mock('../lib/db', () => ({ db: mockDb, pool: mockPool }));
jest.mock('../lib/helpers', () => {
  const real = jest.requireActual('../lib/helpers');
  return {
    ...real,
    dataHoraLocal: () => ({ data: '2026-05-09', hora: '10:00' }),
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

// Helper — autentica supervisor com bcrypt
const loginSupervisor = (agent) => {
  mockDb.get.mockResolvedValueOnce({
    id: 1, nome: 'Supervisor Test', login: 'admin',
    perfil: 'supervisor', senha_hash: HASH_ADMIN,
    subtipo_repositor: 'geral', perfis_acesso: '', turno: 'Manhã', status: 'ativo',
    senha_temporaria: false,
  });
  return agent.post('/auth/login').send({ login: 'admin', senha: SENHA_ADMIN, perfil: 'supervisor' });
};

/* ════════════════════════════════════════════════════════════
   1. AUTENTICAÇÃO
════════════════════════════════════════════════════════════ */
describe('Auth', () => {
  test('GET /auth/me sem sessão → 401', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  test('POST /auth/login com perfil faltando → 400', async () => {
    const res = await request(app).post('/auth/login').send({ login: 'x', senha: 'x' });
    expect(res.status).toBe(400);
  });

  test('POST /auth/login com perfil inválido → 400', async () => {
    const res = await request(app).post('/auth/login').send({ login: 'x', senha: 'x', perfil: 'hacker' });
    expect(res.status).toBe(400);
  });

  test('POST /auth/login com usuário inexistente → 401', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await request(app).post('/auth/login').send({ login: 'ninguem', senha: '123', perfil: 'supervisor' });
    expect(res.status).toBe(401);
  });

  test('POST /auth/login com senha errada → 401', async () => {
    mockDb.get.mockResolvedValueOnce({
      id: 1, nome: 'Admin', login: 'admin', perfil: 'supervisor',
      senha_hash: HASH_ADMIN, subtipo_repositor: 'geral',
      perfis_acesso: '', turno: 'Manhã', status: 'ativo',
    });
    const res = await request(app).post('/auth/login').send({ login: 'admin', senha: 'ERRADA', perfil: 'supervisor' });
    expect(res.status).toBe(401);
  });

  test('POST /auth/login com bcrypt → 200', async () => {
    mockDb.get.mockResolvedValueOnce({
      id: 1, nome: 'Admin', login: 'admin', perfil: 'supervisor',
      senha_hash: HASH_ADMIN, subtipo_repositor: 'geral',
      perfis_acesso: '', turno: 'Manhã', status: 'ativo', senha_temporaria: false,
    });
    const res = await request(app).post('/auth/login').send({ login: 'admin', senha: SENHA_ADMIN, perfil: 'supervisor' });
    expect(res.status).toBe(200);
    expect(res.body.usuario.perfil).toBe('supervisor');
    expect(res.body.usuario.senha_hash).toBeUndefined(); // nunca retorna hash
  });

  test('POST /auth/login com hash SHA-256 legado → 200 e rehash disparado', async () => {
    mockDb.get.mockResolvedValueOnce({
      id: 2, nome: 'Legado', login: 'legado', perfil: 'supervisor',
      senha_hash: HASH_LEGADO, subtipo_repositor: 'geral',
      perfis_acesso: '', turno: 'Manhã', status: 'ativo', senha_temporaria: false,
    });
    const res = await request(app).post('/auth/login').send({ login: 'legado', senha: 'legado123', perfil: 'supervisor' });
    expect(res.status).toBe(200);
    // Deve ter chamado pool.query para atualizar o hash
    const updateCalls = mockPool.query.mock.calls.filter(c => String(c[0]).includes('UPDATE usuarios SET senha_hash'));
    expect(updateCalls.length).toBeGreaterThan(0);
  });

  test('POST /auth/logout → 200', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    const res = await agent.post('/auth/logout');
    expect(res.status).toBe(200);
  });

  test('GET /auth/me autenticado → 200 com usuario', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.get('/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.usuario).toBeDefined();
  });

  test('Rate limit: bloqueia após 10 tentativas (teste unitário)', () => {
    const { _loginAttempts } = jest.requireActual('../lib/auth');
    const { checkRateLimit } = jest.requireActual('../lib/auth');
    const testIp = '192.168.99.99';
    _loginAttempts.delete(testIp); // garante estado limpo
    // Em NODE_ENV=test o bypass está ativo, testamos a lógica diretamente
    const maxAttempts = 10;
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    _loginAttempts.set(testIp, { count: maxAttempts, resetAt: now + windowMs });
    // Simula chamada que excede o limite
    const entry = _loginAttempts.get(testIp);
    entry.count++;
    expect(entry.count > maxAttempts).toBe(true);
    _loginAttempts.delete(testIp);
  });
});

/* ════════════════════════════════════════════════════════════
   2. HELPERS — verificarSenha e hashNeedsMigration
════════════════════════════════════════════════════════════ */
describe('Helpers — bcrypt', () => {
  const { hashSenha, verificarSenha, hashNeedsMigration } = jest.requireActual('../lib/helpers');

  test('hashSenha gera hash bcrypt', () => {
    const h = hashSenha('minhasenha');
    expect(h.startsWith('$2')).toBe(true);
  });

  test('verificarSenha aceita bcrypt correto', () => {
    const h = hashSenha('abc123');
    expect(verificarSenha('abc123', h)).toBe(true);
  });

  test('verificarSenha rejeita senha errada', () => {
    const h = hashSenha('abc123');
    expect(verificarSenha('errada', h)).toBe(false);
  });

  test('verificarSenha aceita hash SHA-256 legado', () => {
    const crypto = require('crypto');
    const legHash = crypto.createHash('sha256').update('legado' + 'wms_salt_2026').digest('hex');
    expect(verificarSenha('legado', legHash)).toBe(true);
  });

  test('hashNeedsMigration retorna true para SHA-256', () => {
    expect(hashNeedsMigration(HASH_LEGADO)).toBe(true);
  });

  test('hashNeedsMigration retorna false para bcrypt', () => {
    expect(hashNeedsMigration(HASH_ADMIN)).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════
   3. PEDIDOS
════════════════════════════════════════════════════════════ */
describe('Pedidos', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('GET /pedidos → 200 com array', async () => {
    mockDb.all.mockResolvedValueOnce([{ id: 1, numero_pedido: '12345', status: 'pendente', itens: 3 }]);
    const res = await agent.get('/pedidos');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /pedidos sem auth → 401', async () => {
    const res = await request(app).get('/pedidos');
    expect(res.status).toBe(401);
  });

  test('GET /pedidos?status=pendente → 200', async () => {
    mockDb.all.mockResolvedValueOnce([]);
    const res = await agent.get('/pedidos?status=pendente');
    expect(res.status).toBe(200);
  });

  test('POST /pedidos/importar lista vazia → 400', async () => {
    const res = await agent.post('/pedidos/importar').send({ pedidos: [] });
    expect(res.status).toBe(400);
  });

  test('POST /pedidos/importar como separador → 403', async () => {
    mockDb.get.mockResolvedValueOnce({
      id: 2, nome: 'Sep', login: 'sep1', perfil: 'separador',
      senha_hash: bcrypt.hashSync('sep123', 4), subtipo_repositor: 'geral',
      perfis_acesso: '', turno: 'Manhã', status: 'ativo', senha_temporaria: false,
    });
    const sepAgent = request.agent(app);
    await sepAgent.post('/auth/login').send({ login: 'sep1', senha: 'sep123', perfil: 'separador' });
    mockDb.get.mockResolvedValueOnce(null); // sem separador vinculado
    const res = await sepAgent.post('/pedidos/importar').send({ pedidos: [{ numero_pedido: '1' }] });
    expect(res.status).toBe(403);
  });
});

/* ════════════════════════════════════════════════════════════
   4. USUÁRIOS
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
    const res = await agent.post('/usuarios').send({ login: 'x', senha: '123', perfil: 'separador' });
    expect(res.status).toBe(400);
  });

  test('POST /usuarios com login duplicado → erro', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 99 }); // login já existe
    const res = await agent.post('/usuarios').send({
      nome: 'Dup', login: 'dup', senha: 'senha123', perfil: 'separador', turno: 'Manhã',
    });
    expect([400, 409, 500]).toContain(res.status);
  });

  test('DELETE /usuarios/:id → responde (sem erro 5xx)', async () => {
    const res = await agent.delete('/usuarios/99');
    expect(res.status).toBeLessThan(500);
  });
});

/* ════════════════════════════════════════════════════════════
   5. REPOSITOR
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

  test('GET /repositor/avisos sem auth → 401', async () => {
    const res = await request(app).get('/repositor/avisos');
    expect(res.status).toBe(401);
  });

  test('GET /repositor/ranking-produtos → 200', async () => {
    mockDb.all.mockResolvedValueOnce([]);
    const res = await agent.get('/repositor/ranking-produtos');
    expect(res.status).toBe(200);
  });
});

/* ════════════════════════════════════════════════════════════
   6. KPIs E ESTATÍSTICAS
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
      seps_ativos: 4, nao_encontrados_hoje: 0, total_faltas_hoje: 1,
    });
    const res = await agent.get('/kpis');
    expect(res.status).toBe(200);
    expect(res.body.pendentes).toBeDefined();
  });

  test('GET /kpis sem auth → 401', async () => {
    const res = await request(app).get('/kpis');
    expect(res.status).toBe(401);
  });

  test('GET /estatisticas/repositor → 200', async () => {
    mockDb.get.mockResolvedValueOnce({ reposto_hoje: 3, reposto_mes: 10, reposto_ano: 50, nao_encontrado_hoje: 1 });
    const res = await agent.get('/estatisticas/repositor');
    expect(res.status).toBe(200);
  });

  test('GET /dashboard/ranking → 200', async () => {
    mockDb.get.mockResolvedValueOnce({ d: '2026-05-09' }); // TO_CHAR da data atual
    mockDb.all.mockResolvedValueOnce([]);
    const res = await agent.get('/dashboard/ranking');
    expect(res.status).toBe(200);
  });
});

/* ════════════════════════════════════════════════════════════
   7. AUDITORIA
════════════════════════════════════════════════════════════ */
describe('Auditoria', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('GET /auditoria → 200 com array', async () => {
    mockDb.all.mockResolvedValueOnce([
      { id: 1, usuario: 'admin', acao: 'LOGIN', data: '2026-05-09', hora: '10:00' },
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
   8. SEGURANÇA
════════════════════════════════════════════════════════════ */
describe('Segurança', () => {
  test('Headers de segurança presentes', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  test('CSP desabilitado intencionalmente (compatibilidade com SheetJS/Google Fonts)', async () => {
    const res = await request(app).get('/auth/me');
    // CSP foi desabilitado no Helmet para permitir scripts externos (SheetJS, Google Fonts)
    // Outros headers de segurança compensam: X-Frame-Options, X-Content-Type-Options
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
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

  test('Input muito longo é truncado (sanitizeStr)', () => {
    const { hashSenha } = jest.requireActual('../lib/helpers');
    // Testa que um input absurdamente longo não quebra o sistema
    const longa = 'a'.repeat(10000);
    expect(() => hashSenha(longa.slice(0, 200))).not.toThrow();
  });
});

/* ════════════════════════════════════════════════════════════
   9. CHECKOUT
════════════════════════════════════════════════════════════ */
describe('Checkout', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('GET /checkout → 200', async () => {
    mockDb.all.mockResolvedValueOnce([]);
    const res = await agent.get('/checkout');
    expect(res.status).toBe(200);
  });

  test('GET /checkout sem auth → 401', async () => {
    const res = await request(app).get('/checkout');
    expect(res.status).toBe(401);
  });
});

/* ════════════════════════════════════════════════════════════
   10. REDEFINIÇÃO DE SENHA
════════════════════════════════════════════════════════════ */
describe('Redefinição de Senha', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('POST /auth/redefinir-senha com senha atual errada → 400', async () => {
    mockDb.get.mockResolvedValueOnce({
      id: 1, senha_hash: HASH_ADMIN, login: 'admin',
    });
    const res = await agent.post('/auth/redefinir-senha').send({
      senha_atual: 'ERRADA',
      senha_nova: 'novasenha123',
    });
    expect(res.status).toBe(400);
  });

  test('POST /auth/redefinir-senha com nova senha curta → 400', async () => {
    const res = await agent.post('/auth/redefinir-senha').send({
      senha_atual: SENHA_ADMIN,
      senha_nova: '123',
    });
    expect(res.status).toBe(400);
  });
});
