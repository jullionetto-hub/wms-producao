/**
 * WMS Miess — Testes de rotas: Passagem de Turno e Usuários (cobertura estendida)
 * Roda com: npm test -- tests/passagem-usuarios-routes.test.js
 */

const request = require('supertest');
const bcrypt  = require('bcrypt');

// Mock do banco para testes (mesma forma exata de tests/api.test.js)
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
const SENHA_SEP   = 'sep123456';
const HASH_SEP    = bcrypt.hashSync(SENHA_SEP, 4);

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

// Helper — autentica supervisor com bcrypt (copiado de tests/api.test.js)
const loginSupervisor = (agent) => {
  mockDb.get.mockResolvedValueOnce({
    id: 1, nome: 'Supervisor Test', login: 'admin',
    perfil: 'supervisor', senha_hash: HASH_ADMIN,
    subtipo_repositor: 'geral', perfis_acesso: '', turno: 'Manhã', status: 'ativo',
    senha_temporaria: false,
  });
  return agent.post('/auth/login').send({ login: 'admin', senha: SENHA_ADMIN, perfil: 'supervisor' });
};

// Helper — autentica separador (perfil sem permissão de supervisor/gestor)
const loginSeparador = (agent) => {
  mockDb.get.mockResolvedValueOnce({
    id: 2, nome: 'Sep Test', login: 'sep1',
    perfil: 'separador', senha_hash: HASH_SEP,
    subtipo_repositor: 'geral', perfis_acesso: '', turno: 'Manhã', status: 'ativo',
    senha_temporaria: false,
  });
  return agent.post('/auth/login').send({ login: 'sep1', senha: SENHA_SEP, perfil: 'separador' });
};

/* ════════════════════════════════════════════════════════════
   PASSAGEM DE TURNO
════════════════════════════════════════════════════════════ */
describe('Passagem de Turno', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('GET /passagem sem auth → 401', async () => {
    const res = await request(app).get('/passagem');
    expect(res.status).toBe(401);
  });

  test('GET /passagem como separador → 403', async () => {
    const sepAgent = request.agent(app);
    await loginSeparador(sepAgent);
    const res = await sepAgent.get('/passagem');
    expect(res.status).toBe(403);
  });

  test('GET /passagem → 200 com array', async () => {
    mockDb.all.mockResolvedValueOnce([{ id: 1, data: '2026-05-09', turno: 'Manha', status: 'pendente' }]);
    const res = await agent.get('/passagem');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /passagem/placar → 200 com placar e historico', async () => {
    mockDb.all
      .mockResolvedValueOnce([{ turno: 'Manha', pontos: 1000 }])   // placar
      .mockResolvedValueOnce([]);                                    // historico
    const res = await agent.get('/passagem/placar');
    expect(res.status).toBe(200);
    expect(res.body.placar).toBeDefined();
    expect(res.body.historico).toBeDefined();
  });

  test('GET /passagem/pendente → 200 com null quando não há pendente', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.get('/passagem/pendente');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  test('GET /passagem/pendente → 200 com registro pendente', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 5, status: 'pendente', turno: 'Manha' });
    const res = await agent.get('/passagem/pendente');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(5);
  });

  test('GET /passagem/:id inexistente → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.get('/passagem/999');
    expect(res.status).toBe(404);
  });

  test('GET /passagem/:id → 200 com validacao', async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: 5, data: '2026-05-09', turno: 'Manha' }) // passagem
      .mockResolvedValueOnce({ id: 1, passagem_id: 5, pontos_perdidos: 0 }); // validacao
    const res = await agent.get('/passagem/5');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(5);
    expect(res.body.validacao).toBeDefined();
  });

  test('POST /passagem sem data/turno → 400', async () => {
    const res = await agent.post('/passagem').send({ turno: 'Manha' });
    expect(res.status).toBe(400);
  });

  test('POST /passagem nova → 200 e cria registro', async () => {
    mockDb.get.mockResolvedValueOnce(null); // não existe passagem para essa data/turno
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 10 }] }); // INSERT ... RETURNING id
    const res = await agent.post('/passagem').send({
      data: '2026-05-09', turno: 'Manha', sep_separados: 5, ck_feitos: 3,
    });
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toBe('Passagem registrada!');
    expect(res.body.id).toBe(10);
  });

  test('POST /passagem existente (pendente) → 200 e atualiza', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 7, status: 'pendente' });
    const res = await agent.post('/passagem').send({ data: '2026-05-09', turno: 'Manha' });
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toBe('Passagem atualizada!');
    expect(res.body.id).toBe(7);
  });

  test('POST /passagem já validada → 400', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 7, status: 'validado' });
    const res = await agent.post('/passagem').send({ data: '2026-05-09', turno: 'Manha' });
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/já foi validada/i);
  });

  test('POST /passagem/:id/validar com ID inválido → 400', async () => {
    const res = await agent.post('/passagem/abc/validar').send({ turno_entrando: 'Tarde', resultados: {} });
    expect(res.status).toBe(400);
  });

  test('POST /passagem/:id/validar sem turno_entrando/resultados → 400', async () => {
    const res = await agent.post('/passagem/5/validar').send({});
    expect(res.status).toBe(400);
  });

  test('POST /passagem/:id/validar com passagem inexistente → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.post('/passagem/5/validar').send({ turno_entrando: 'Tarde', resultados: { ck_feitos: true } });
    expect(res.status).toBe(404);
  });

  test('POST /passagem/:id/validar com passagem já validada (status) → 400', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 5, status: 'validado', turno: 'Manha' });
    const res = await agent.post('/passagem/5/validar').send({ turno_entrando: 'Tarde', resultados: { ck_feitos: true } });
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/já foi validada/i);
  });

  test('POST /passagem/:id/validar com validação já existente → 400', async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: 5, status: 'pendente', turno: 'Manha' }) // passagem
      .mockResolvedValueOnce({ id: 1 }); // já existe validacao_passagem
    const res = await agent.post('/passagem/5/validar').send({ turno_entrando: 'Tarde', resultados: { ck_feitos: true } });
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/já foi validada/i);
  });

  test('POST /passagem/:id/validar checklist todo OK → status validado, sem perda de pontos', async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: 5, status: 'pendente', turno: 'Manha' }) // passagem
      .mockResolvedValueOnce(null); // sem validacao prévia
    const res = await agent.post('/passagem/5/validar').send({
      turno_entrando: 'Tarde',
      resultados: { sep_separados: true, ck_feitos: true },
      obs_geral: 'tudo certo',
    });
    expect(res.status).toBe(200);
    expect(res.body.pontos_perdidos).toBe(0);
    expect(res.body.status).toBe('validado');
  });

  test('POST /passagem/:id/validar checklist com item incompleto → status contestado, desconta pontos e atualiza placar', async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: 5, status: 'pendente', turno: 'Manha' }) // passagem
      .mockResolvedValueOnce(null); // sem validacao prévia
    const res = await agent.post('/passagem/5/validar').send({
      turno_entrando: 'Tarde',
      resultados: { sep_separados: true, ck_feitos: false }, // ck_feitos vale 75 pontos
    });
    expect(res.status).toBe(200);
    expect(res.body.pontos_perdidos).toBe(75);
    expect(res.body.status).toBe('contestado');
    // Deve ter atualizado o placar do turno
    const updatePlacar = mockPool.query.mock.calls.filter(c => String(c[0]).includes('UPDATE placar_turno SET pontos = GREATEST'));
    expect(updatePlacar.length).toBeGreaterThan(0);
  });

  test('POST /passagem/placar/resetar sem turno → 400', async () => {
    const res = await agent.post('/passagem/placar/resetar').send({});
    expect(res.status).toBe(400);
  });

  test('POST /passagem/placar/resetar → 200', async () => {
    const res = await agent.post('/passagem/placar/resetar').send({ turno: 'Manha' });
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toMatch(/resetado/i);
  });
});

/* ════════════════════════════════════════════════════════════
   USUÁRIOS (cobertura estendida — além do que já existe em api.test.js)
════════════════════════════════════════════════════════════ */
describe('Usuários — cobertura estendida', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('PUT /usuarios/:id sem auth → 401', async () => {
    const res = await request(app).put('/usuarios/1').send({ nome: 'X' });
    expect(res.status).toBe(401);
  });

  test('PUT /usuarios/:id como separador → 403', async () => {
    const sepAgent = request.agent(app);
    await loginSeparador(sepAgent);
    const res = await sepAgent.put('/usuarios/1').send({ nome: 'X' });
    expect(res.status).toBe(403);
  });

  test('PUT /usuarios/:id sem trocar senha → 200 e não altera hash', async () => {
    const res = await agent.put('/usuarios/1').send({
      nome: 'Editado', login: 'editado', perfil: 'separador', turno: 'Tarde', status: 'ativo',
    });
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toBe('Atualizado!');
    const updateCalls = mockPool.query.mock.calls.filter(c => String(c[0]).includes('UPDATE usuarios SET'));
    expect(updateCalls.length).toBe(1);
    expect(String(updateCalls[0][0])).not.toMatch(/senha_hash/);
  });

  test('PUT /usuarios/:id trocando senha (temporária) → 200 e grava expiração', async () => {
    const res = await agent.put('/usuarios/1').send({
      nome: 'Editado', login: 'editado', senha: 'novaSenha123', perfil: 'separador',
      turno: 'Tarde', status: 'ativo', senha_temporaria: true,
    });
    expect(res.status).toBe(200);
    const updateCalls = mockPool.query.mock.calls.filter(c => String(c[0]).includes('UPDATE usuarios SET') && String(c[0]).includes('senha_hash'));
    expect(updateCalls.length).toBe(1);
    // Último parâmetro antes do id é a data de expiração (não deve ser null)
    const params = updateCalls[0][1];
    expect(params[params.length - 2]).not.toBeNull();
  });

  test('PATCH /usuarios/:id/status com ID inválido → 400', async () => {
    const res = await agent.patch('/usuarios/abc/status').send({ status: 'ativo' });
    expect(res.status).toBe(400);
  });

  test('PATCH /usuarios/:id/status com status inválido → 400', async () => {
    const res = await agent.patch('/usuarios/1/status').send({ status: 'banido' });
    expect(res.status).toBe(400);
  });

  test('PATCH /usuarios/:id/status → 200', async () => {
    const res = await agent.patch('/usuarios/1/status').send({ status: 'inativo' });
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toBe('Status atualizado!');
  });

  test('PATCH /usuarios/:id/status como separador → 403', async () => {
    const sepAgent = request.agent(app);
    await loginSeparador(sepAgent);
    const res = await sepAgent.patch('/usuarios/1/status').send({ status: 'inativo' });
    expect(res.status).toBe(403);
  });
});

describe('Separadores', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('GET /separadores sem auth → 401', async () => {
    const res = await request(app).get('/separadores');
    expect(res.status).toBe(401);
  });

  test('GET /separadores autenticado (qualquer perfil) → 200', async () => {
    const sepAgent = request.agent(app);
    await loginSeparador(sepAgent);
    mockDb.all.mockResolvedValueOnce([{ id: 1, nome: 'Sep', usuario_nome: 'Sep Test' }]);
    const res = await sepAgent.get('/separadores');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /separadores/diagnostico sem auth → 401', async () => {
    const res = await request(app).get('/separadores/diagnostico');
    expect(res.status).toBe(401);
  });

  test('GET /separadores/diagnostico como separador → 403', async () => {
    const sepAgent = request.agent(app);
    await loginSeparador(sepAgent);
    const res = await sepAgent.get('/separadores/diagnostico');
    expect(res.status).toBe(403);
  });

  test('GET /separadores/diagnostico → 200 com listas de vínculo', async () => {
    mockDb.all
      .mockResolvedValueOnce([{ id: 1, nome: 'U1', login: 'u1' }])              // usuarios separador
      .mockResolvedValueOnce([{ id: 10, nome: 'U1', matricula: 'u1', usuario_id: 1 }]); // separadores
    const res = await agent.get('/separadores/diagnostico');
    expect(res.status).toBe(200);
    expect(res.body.sem_vinculo).toEqual([]);
    expect(res.body.usuarios_sem_separador).toEqual([]);
  });

  test('POST /separadores/vincular-todos → 200 com contagem de vínculos', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rowCount: 2, rows: [] }) // vínculo por matrícula
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // vínculo por nome
    mockDb.all.mockResolvedValueOnce([]); // sem_vinculo
    const res = await agent.post('/separadores/vincular-todos');
    expect(res.status).toBe(200);
    expect(res.body.vinculados_matricula).toBe(2);
    expect(res.body.vinculados_nome).toBe(1);
  });

  test('GET /separadores/:id → 200', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, nome: 'Sep' });
    const res = await agent.get('/separadores/1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  test('POST /separadores com matrícula duplicada → 409', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] }); // ON CONFLICT DO NOTHING não retornou linha
    const res = await agent.post('/separadores').send({ nome: 'Novo', matricula: 'dup', turno: 'Manha' });
    expect(res.status).toBe(409);
  });

  test('POST /separadores → 200 cria novo separador', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 20 }] });
    const res = await agent.post('/separadores').send({ nome: 'Novo', matricula: 'novo1', turno: 'Manha' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(20);
  });

  test('POST /separadores como separador → 403', async () => {
    const sepAgent = request.agent(app);
    await loginSeparador(sepAgent);
    const res = await sepAgent.post('/separadores').send({ nome: 'X', matricula: 'x1' });
    expect(res.status).toBe(403);
  });

  test('PUT /separadores/:id → 200', async () => {
    const res = await agent.put('/separadores/1').send({ nome: 'Editado', matricula: 'm1', turno: 'Tarde', status: 'ativo' });
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toBe('Atualizado!');
  });

  test('DELETE /separadores/:id → 200', async () => {
    const res = await agent.delete('/separadores/1');
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toBe('Excluido!');
  });

  test('DELETE /separadores/:id como separador → 403', async () => {
    const sepAgent = request.agent(app);
    await loginSeparador(sepAgent);
    const res = await sepAgent.delete('/separadores/1');
    expect(res.status).toBe(403);
  });
});
