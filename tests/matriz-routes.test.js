/**
 * WMS Miess — Testes da Matriz de Responsabilidades (routes/matriz.js)
 * Roda com: npm test -- matriz-routes
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

// Helper — autentica supervisor (acesso de leitura/edição na Matriz)
const loginSupervisor = (agent) => {
  mockDb.get.mockResolvedValueOnce({
    id: 1, nome: 'Supervisor Test', login: 'admin',
    perfil: 'supervisor', senha_hash: HASH_ADMIN,
    subtipo_repositor: 'geral', perfis_acesso: '', turno: 'Manhã', status: 'ativo',
    senha_temporaria: false,
  });
  return agent.post('/auth/login').send({ login: 'admin', senha: SENHA_ADMIN, perfil: 'supervisor' });
};

// Helper — autentica gestor (acesso total, inclusive rotas "de referência")
const loginGestor = (agent) => {
  mockDb.get.mockResolvedValueOnce({
    id: 2, nome: 'Gestor Test', login: 'gestor1',
    perfil: 'gestor', senha_hash: HASH_ADMIN,
    subtipo_repositor: 'geral', perfis_acesso: '', turno: 'Manhã', status: 'ativo',
    senha_temporaria: false,
  });
  return agent.post('/auth/login').send({ login: 'gestor1', senha: SENHA_ADMIN, perfil: 'gestor' });
};

/* ════════════════════════════════════════════════════════════
   COLABORADORES
════════════════════════════════════════════════════════════ */
describe('Matriz — Colaboradores', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
    mockPool.query.mockClear();
    mockDb.get.mockClear();
  });

  test('GET /matriz/colaboradores sem auth → 401', async () => {
    const res = await request(app).get('/matriz/colaboradores');
    expect(res.status).toBe(401);
  });

  test('GET /matriz/colaboradores → 200 com array', async () => {
    mockDb.all.mockResolvedValueOnce([{ id: 1, nome: 'Fulano', cargo: 'Analista', tier: 'analista', area: 'Checkout', turno: 'Manhã', ativo: true, vaga: false }]);
    const res = await agent.get('/matriz/colaboradores');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].nome).toBe('Fulano');
  });

  test('POST /matriz/colaboradores sem nome → 400', async () => {
    const res = await agent.post('/matriz/colaboradores').send({ cargo: 'Analista' });
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/nome/);
  });

  test('POST /matriz/colaboradores com nome → 201 com registro criado', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 5, nome: 'Ciclano', cargo: '', tier: 'analista', area: '', turno: null, ativo: true, vaga: false }] });
    const res = await agent.post('/matriz/colaboradores').send({ nome: 'Ciclano' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(5);
    expect(res.body.nome).toBe('Ciclano');
  });

  test('PATCH /matriz/colaboradores/:id inexistente → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.patch('/matriz/colaboradores/999').send({ nome: 'Novo Nome' });
    expect(res.status).toBe(404);
  });

  test('PATCH /matriz/colaboradores/:id → 200 mesclando campos não enviados', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, nome: 'Antigo', cargo: 'X', tier: 'analista', area: 'A', turno: 'Manhã', ativo: true, vaga: false });
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, nome: 'Novo Nome', cargo: 'X', tier: 'analista', area: 'A', turno: 'Manhã', ativo: true, vaga: false }] });
    const res = await agent.patch('/matriz/colaboradores/1').send({ nome: 'Novo Nome' });
    expect(res.status).toBe(200);
    expect(res.body.nome).toBe('Novo Nome');
    // mantém o cargo atual pois não foi enviado no body
    const args = mockPool.query.mock.calls[0][1];
    expect(args).toEqual(['Novo Nome', 'X', 'analista', 'A', 'Manhã', true, false, '1']);
  });

  test('DELETE /matriz/colaboradores/:id → 204', async () => {
    const res = await agent.delete('/matriz/colaboradores/1');
    expect(res.status).toBe(204);
  });
});

/* ════════════════════════════════════════════════════════════
   FEEDBACKS
════════════════════════════════════════════════════════════ */
describe('Matriz — Feedbacks', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
    mockPool.query.mockClear();
    mockDb.get.mockClear();
  });

  test('GET /matriz/feedbacks sem auth → 401', async () => {
    const res = await request(app).get('/matriz/feedbacks');
    expect(res.status).toBe(401);
  });

  test('GET /matriz/feedbacks → 200 com array', async () => {
    mockDb.all.mockResolvedValueOnce([{ id: 1, colaborador_id: 1, mes: '2026-08', created_at: '2026-08-01' }]);
    const res = await agent.get('/matriz/feedbacks');
    expect(res.status).toBe(200);
    expect(res.body[0].colaborador_id).toBe(1);
  });

  test('POST /matriz/feedbacks sem colaborador_id → 400', async () => {
    const res = await agent.post('/matriz/feedbacks').send({ mes: '2026-08' });
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/colaborador_id/);
  });

  test('POST /matriz/feedbacks com colaborador_id → 201', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 10, colaborador_id: 1, mes: '2026-08' }] });
    const res = await agent.post('/matriz/feedbacks').send({ colaborador_id: 1, mes: '2026-08' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(10);
  });

  test('PATCH /matriz/feedbacks/:id inexistente → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.patch('/matriz/feedbacks/999').send({ mes: '2026-09' });
    expect(res.status).toBe(404);
  });

  test('PATCH /matriz/feedbacks/:id → 200', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, mes: '2026-08', cargo_snapshot: '', area_snapshot: '', meta: null, entregue: null, pontos_positivos: '', pontos_construtivos: '', absenteismo_mes: '', retorno_antecipado: '', atrasos: null, faltas_injustificadas: null, ausencias_justificadas: null, recorrencia_ausencia: '', outros_pontos: '', saldo_banco_horas: '', combinado_mes: '' });
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, mes: '2026-09' }] });
    const res = await agent.patch('/matriz/feedbacks/1').send({ mes: '2026-09' });
    expect(res.status).toBe(200);
    expect(res.body.mes).toBe('2026-09');
  });

  test('DELETE /matriz/feedbacks/:id → 204', async () => {
    const res = await agent.delete('/matriz/feedbacks/1');
    expect(res.status).toBe(204);
  });
});

/* ════════════════════════════════════════════════════════════
   CLASSIFICAÇÕES
════════════════════════════════════════════════════════════ */
describe('Matriz — Classificações', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
    mockPool.query.mockClear();
    mockDb.get.mockClear();
  });

  test('GET /matriz/classificacoes sem auth → 401', async () => {
    const res = await request(app).get('/matriz/classificacoes');
    expect(res.status).toBe(401);
  });

  test('GET /matriz/classificacoes → 200', async () => {
    mockDb.all.mockResolvedValueOnce([{ id: 1, colaborador_id: 1, periodo_label: '2026-08', absenteismo: 'verde', performance: 'amarelo', comportamento: 'verde' }]);
    const res = await agent.get('/matriz/classificacoes');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  test('PUT /matriz/classificacoes sem colaborador_id ou periodo_label → 400', async () => {
    const res = await agent.put('/matriz/classificacoes').send({ absenteismo: 'verde' });
    expect(res.status).toBe(400);
  });

  test('PUT /matriz/classificacoes com dados → 200 (upsert)', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, colaborador_id: 1, periodo_label: '2026-08', absenteismo: 'verde', performance: null, comportamento: null }] });
    const res = await agent.put('/matriz/classificacoes').send({ colaborador_id: 1, periodo_label: '2026-08', absenteismo: 'verde' });
    expect(res.status).toBe(200);
    expect(res.body.periodo_label).toBe('2026-08');
  });
});

/* ════════════════════════════════════════════════════════════
   AUSÊNCIAS
════════════════════════════════════════════════════════════ */
describe('Matriz — Ausências', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
    mockPool.query.mockClear();
    mockDb.get.mockClear();
  });

  test('GET /matriz/ausencias sem auth → 401', async () => {
    const res = await request(app).get('/matriz/ausencias');
    expect(res.status).toBe(401);
  });

  test('GET /matriz/ausencias → 200', async () => {
    mockDb.all.mockResolvedValueOnce([{ id: 1, colaborador_id: 1, periodo_label: '2026-08', dias: 1, data: '2026-08-10', motivo: 'atestado' }]);
    const res = await agent.get('/matriz/ausencias');
    expect(res.status).toBe(200);
    expect(res.body[0].motivo).toBe('atestado');
  });

  test('POST /matriz/ausencias sem colaborador_id/periodo_label → 400', async () => {
    const res = await agent.post('/matriz/ausencias').send({ motivo: 'atraso' });
    expect(res.status).toBe(400);
  });

  test('POST /matriz/ausencias com dados → 201 e dias default 1', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 2, colaborador_id: 1, periodo_label: '2026-08', dias: 1, data: '', motivo: '' }] });
    const res = await agent.post('/matriz/ausencias').send({ colaborador_id: 1, periodo_label: '2026-08' });
    expect(res.status).toBe(201);
    const params = mockPool.query.mock.calls[0][1];
    expect(params[2]).toBe(1); // dias default
  });

  test('PATCH /matriz/ausencias/:id inexistente → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.patch('/matriz/ausencias/999').send({ dias: 2 });
    expect(res.status).toBe(404);
  });

  test('DELETE /matriz/ausencias/:id → 204', async () => {
    const res = await agent.delete('/matriz/ausencias/1');
    expect(res.status).toBe(204);
  });
});

/* ════════════════════════════════════════════════════════════
   BANCO DE HORAS
════════════════════════════════════════════════════════════ */
describe('Matriz — Banco de Horas', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
    mockPool.query.mockClear();
    mockDb.get.mockClear();
  });

  test('GET /matriz/banco-horas sem auth → 401', async () => {
    const res = await request(app).get('/matriz/banco-horas');
    expect(res.status).toBe(401);
  });

  test('GET /matriz/banco-horas → 200', async () => {
    mockDb.all.mockResolvedValueOnce([{ id: 1, colaborador_id: 1, saldo_atual: 5.5, delta: -1 }]);
    const res = await agent.get('/matriz/banco-horas');
    expect(res.status).toBe(200);
    expect(res.body[0].saldo_atual).toBe(5.5);
  });

  test('PUT /matriz/banco-horas sem colaborador_id → 400', async () => {
    const res = await agent.put('/matriz/banco-horas').send({ saldo_atual: 3 });
    expect(res.status).toBe(400);
  });

  test('PUT /matriz/banco-horas com dados → 200 (upsert)', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, colaborador_id: 1, saldo_atual: 3, delta: 0 }] });
    const res = await agent.put('/matriz/banco-horas').send({ colaborador_id: 1, saldo_atual: 3 });
    expect(res.status).toBe(200);
    expect(res.body.saldo_atual).toBe(3);
  });

  test('GET /matriz/banco-horas/periodo → cria período padrão quando não existe', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.get('/matriz/banco-horas/periodo');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ inicio_label: '', fim_label: '' });
    expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO mz_banco_horas_periodo'));
  });

  test('GET /matriz/banco-horas/periodo → retorna período existente', async () => {
    mockDb.get.mockResolvedValueOnce({ inicio_label: '2026-08-01', fim_label: '2026-08-31' });
    const res = await agent.get('/matriz/banco-horas/periodo');
    expect(res.status).toBe(200);
    expect(res.body.inicio_label).toBe('2026-08-01');
  });

  test('PUT /matriz/banco-horas/periodo como supervisor → 403 (rota é gestor-only)', async () => {
    const res = await agent.put('/matriz/banco-horas/periodo').send({ inicio_label: '2026-09-01', fim_label: '2026-09-30' });
    expect(res.status).toBe(403);
  });

  test('PUT /matriz/banco-horas/periodo como gestor → 200', async () => {
    const gAgent = request.agent(app);
    await loginGestor(gAgent);
    mockDb.get.mockResolvedValueOnce({ id: 1 });
    const res = await gAgent.put('/matriz/banco-horas/periodo').send({ inicio_label: '2026-09-01', fim_label: '2026-09-30' });
    expect(res.status).toBe(200);
    expect(res.body.inicio_label).toBe('2026-09-01');
  });
});

/* ════════════════════════════════════════════════════════════
   FÉRIAS
════════════════════════════════════════════════════════════ */
describe('Matriz — Férias', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
    mockPool.query.mockClear();
    mockDb.get.mockClear();
  });

  test('GET /matriz/ferias sem auth → 401', async () => {
    const res = await request(app).get('/matriz/ferias');
    expect(res.status).toBe(401);
  });

  test('GET /matriz/ferias → 200', async () => {
    mockDb.all.mockResolvedValueOnce([{ id: 1, colaborador_id: 1, tipo: 'p1', data_inicio: '2026-12-01', dias: 15 }]);
    const res = await agent.get('/matriz/ferias');
    expect(res.status).toBe(200);
    expect(res.body[0].tipo).toBe('p1');
  });

  test('PUT /matriz/ferias sem colaborador_id → 400', async () => {
    const res = await agent.put('/matriz/ferias').send({ tipo: 'p1' });
    expect(res.status).toBe(400);
  });

  test('PUT /matriz/ferias com tipo inválido → 400', async () => {
    const res = await agent.put('/matriz/ferias').send({ colaborador_id: 1, tipo: 'invalido' });
    expect(res.status).toBe(400);
  });

  test('PUT /matriz/ferias com tipo válido → 200 (upsert)', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, colaborador_id: 1, tipo: 'p1', data_inicio: '2026-12-01', dias: 15 }] });
    const res = await agent.put('/matriz/ferias').send({ colaborador_id: 1, tipo: 'p1', data_inicio: '2026-12-01', dias: 15 });
    expect(res.status).toBe(200);
    expect(res.body.tipo).toBe('p1');
  });
});

/* ════════════════════════════════════════════════════════════
   RACI (grade de responsabilidades)
════════════════════════════════════════════════════════════ */
describe('Matriz — RACI', () => {
  let agent, gAgent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
    gAgent = request.agent(app);
    await loginGestor(gAgent);
    mockPool.query.mockClear();
    mockDb.get.mockClear();
  });

  test('GET /matriz/raci sem auth → 401', async () => {
    const res = await request(app).get('/matriz/raci');
    expect(res.status).toBe(401);
  });

  test('GET /matriz/raci → monta árvore área→roles→atividades→status', async () => {
    mockDb.all
      .mockResolvedValueOnce([{ id: 1, nome: 'Checkout', ordem: 0 }]) // areas
      .mockResolvedValueOnce([{ id: 10, area_id: 1, nome: 'Supervisor', ordem: 0 }]) // roles
      .mockResolvedValueOnce([{ id: 100, area_id: 1, nome: 'Conferir pedidos', ordem: 0, categoria: 'Operacional', sugestao: null }]) // atividades
      .mockResolvedValueOnce([{ atividade_id: 100, role_id: 10, status: 'R' }]); // status
    const res = await agent.get('/matriz/raci');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const area = res.body[0];
    expect(area.roles).toEqual([{ id: 10, nome: 'Supervisor', ordem: 0 }]);
    expect(area.atividades).toHaveLength(1);
    expect(area.atividades[0].status).toEqual([{ role_id: 10, status: 'R' }]);
    // area_id/atividade_id não vazam nos objetos aninhados
    expect(area.roles[0].area_id).toBeUndefined();
    expect(area.atividades[0].area_id).toBeUndefined();
    expect(area.atividades[0].status[0].atividade_id).toBeUndefined();
  });

  test('POST /matriz/raci como supervisor → 403 (rota gestor-only)', async () => {
    const res = await agent.post('/matriz/raci').send({ nome: 'Nova Área' });
    expect(res.status).toBe(403);
  });

  test('POST /matriz/raci sem nome → 400', async () => {
    const res = await gAgent.post('/matriz/raci').send({ roles: ['A'] });
    expect(res.status).toBe(400);
  });

  test('POST /matriz/raci com nome → 201, cria área + roles em transação', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query.mockImplementation((sql) => {
      if (sql.startsWith('INSERT INTO mz_areas')) return Promise.resolve({ rows: [{ id: 7 }] });
      return Promise.resolve({ rows: [] });
    });
    mockPool.connect.mockResolvedValueOnce(client);
    mockDb.all
      .mockResolvedValueOnce([{ id: 7, nome: 'Nova Área', ordem: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const res = await gAgent.post('/matriz/raci').send({ nome: 'Nova Área', roles: ['Sup', 'Coord'] });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(7);
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  test('POST /matriz/raci com falha no meio → ROLLBACK e 500', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query.mockImplementation((sql) => {
      if (sql === 'BEGIN') return Promise.resolve();
      if (sql.startsWith('INSERT INTO mz_areas')) return Promise.reject(new Error('falha no banco'));
      return Promise.resolve();
    });
    mockPool.connect.mockResolvedValueOnce(client);
    const res = await gAgent.post('/matriz/raci').send({ nome: 'Área Falha' });
    expect(res.status).toBe(500);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  test('POST /matriz/raci/areas/:areaId/roles sem nome → 400', async () => {
    const res = await gAgent.post('/matriz/raci/areas/1/roles').send({});
    expect(res.status).toBe(400);
  });

  test('POST /matriz/raci/areas/:areaId/roles → 201 com ordem = contagem atual', async () => {
    mockDb.get.mockResolvedValueOnce({ n: 2 });
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 20, nome: 'Nova Role', ordem: 2 }] });
    const res = await gAgent.post('/matriz/raci/areas/1/roles').send({ nome: 'Nova Role' });
    expect(res.status).toBe(201);
    expect(res.body.ordem).toBe(2);
  });

  test('POST /matriz/raci/areas/:areaId/atividades sem nome → 400', async () => {
    const res = await gAgent.post('/matriz/raci/areas/1/atividades').send({});
    expect(res.status).toBe(400);
  });

  test('POST /matriz/raci/areas/:areaId/atividades → 201', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query.mockImplementation((sql) => {
      if (sql.startsWith('INSERT INTO mz_atividades')) return Promise.resolve({ rows: [{ id: 200, nome: 'Nova Atividade' }] });
      return Promise.resolve({ rows: [] });
    });
    mockPool.connect.mockResolvedValueOnce(client);
    const res = await gAgent.post('/matriz/raci/areas/1/atividades').send({ nome: 'Nova Atividade', status: [{ role_id: 10, status: 'A' }] });
    expect(res.status).toBe(201);
    expect(res.body.nome).toBe('Nova Atividade');
  });

  test('PATCH /matriz/raci/atividades/:id inexistente → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await gAgent.patch('/matriz/raci/atividades/999').send({ nome: 'X' });
    expect(res.status).toBe(404);
  });

  test('PATCH /matriz/raci/atividades/:id → 200', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 100, nome: 'Antiga', ordem: 0, categoria: null, sugestao: null });
    const res = await gAgent.patch('/matriz/raci/atividades/100').send({ nome: 'Atualizada' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('DELETE /matriz/raci/atividades/:id → 204', async () => {
    const res = await gAgent.delete('/matriz/raci/atividades/100');
    expect(res.status).toBe(204);
  });

  test('PUT /matriz/raci/atividades/:id/status sem role_id ou status → 400', async () => {
    const res = await gAgent.put('/matriz/raci/atividades/100/status').send({ role_id: 10 });
    expect(res.status).toBe(400);
  });

  test('PUT /matriz/raci/atividades/:id/status com dados → 200 (upsert)', async () => {
    const res = await gAgent.put('/matriz/raci/atividades/100/status').send({ role_id: 10, status: 'C' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

/* ════════════════════════════════════════════════════════════
   CARGOS
════════════════════════════════════════════════════════════ */
describe('Matriz — Cargos', () => {
  let agent, gAgent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
    gAgent = request.agent(app);
    await loginGestor(gAgent);
    mockPool.query.mockClear();
    mockDb.get.mockClear();
  });

  test('GET /matriz/cargos sem auth → 401', async () => {
    const res = await request(app).get('/matriz/cargos');
    expect(res.status).toBe(401);
  });

  test('GET /matriz/cargos → 200 (acessível a supervisor)', async () => {
    mockDb.all.mockResolvedValueOnce([{ id: 1, cargo: 'Analista', area: 'Checkout' }]);
    const res = await agent.get('/matriz/cargos');
    expect(res.status).toBe(200);
    expect(res.body[0].cargo).toBe('Analista');
  });

  test('POST /matriz/cargos como supervisor → 403 (gestor-only)', async () => {
    const res = await agent.post('/matriz/cargos').send({ cargo: 'Novo' });
    expect(res.status).toBe(403);
  });

  test('POST /matriz/cargos sem cargo → 400', async () => {
    const res = await gAgent.post('/matriz/cargos').send({ area: 'Checkout' });
    expect(res.status).toBe(400);
  });

  test('POST /matriz/cargos com cargo → 201, serializa arrays como JSON', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 3, cargo: 'Novo Cargo' }] });
    const res = await gAgent.post('/matriz/cargos').send({ cargo: 'Novo Cargo', funcoes: ['a', 'b'] });
    expect(res.status).toBe(201);
    const params = mockPool.query.mock.calls[0][1];
    expect(params[6]).toBe(JSON.stringify(['a', 'b'])); // funcoes
  });

  test('PATCH /matriz/cargos/:id inexistente → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await gAgent.patch('/matriz/cargos/999').send({ cargo: 'X' });
    expect(res.status).toBe(404);
  });

  test('PATCH /matriz/cargos/:id → 200', async () => {
    mockDb.get.mockResolvedValueOnce({
      id: 1, cargo: 'Antigo', area: 'A', gestor: '', perfil: '',
      graduacoes: '[]', descricao: '', funcoes: '[]', formacao: '',
      tecnicas: '[]', comportamentais: '[]', atitudes: '[]',
    });
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, cargo: 'Atualizado' }] });
    const res = await gAgent.patch('/matriz/cargos/1').send({ cargo: 'Atualizado' });
    expect(res.status).toBe(200);
    expect(res.body.cargo).toBe('Atualizado');
  });

  test('DELETE /matriz/cargos/:id → 204', async () => {
    const res = await gAgent.delete('/matriz/cargos/1');
    expect(res.status).toBe(204);
  });
});

/* ════════════════════════════════════════════════════════════
   INCENTIVO
════════════════════════════════════════════════════════════ */
describe('Matriz — Incentivo', () => {
  let agent, gAgent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
    gAgent = request.agent(app);
    await loginGestor(gAgent);
    mockPool.query.mockClear();
    mockDb.get.mockClear();
  });

  test('GET /matriz/incentivo sem auth → 401', async () => {
    const res = await request(app).get('/matriz/incentivo');
    expect(res.status).toBe(401);
  });

  test('GET /matriz/incentivo → cria config padrão quando não existe', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, abs_green: 0, abs_yellow: 1, abs_red: 3 }] });
    const res = await agent.get('/matriz/incentivo');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO mz_incentivo_config DEFAULT VALUES'));
  });

  test('GET /matriz/incentivo → retorna config existente sem criar nova', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, abs_green: 0, abs_yellow: 1, abs_red: 3 });
    const res = await agent.get('/matriz/incentivo');
    expect(res.status).toBe(200);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  test('PUT /matriz/incentivo como supervisor → 403', async () => {
    const res = await agent.put('/matriz/incentivo').send({ abs_green: 1 });
    expect(res.status).toBe(403);
  });

  test('PUT /matriz/incentivo como gestor → 200, mescla campos não enviados', async () => {
    mockDb.get.mockResolvedValueOnce({
      id: 1, abs_green: 0, abs_yellow: 1, abs_red: 3,
      perf_green: 90, perf_yellow: 70, perf_red: 50,
      comp_green: 5, comp_yellow: 3, comp_red: 1,
    });
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, abs_green: 2 }] });
    const res = await gAgent.put('/matriz/incentivo').send({ abs_green: 2 });
    expect(res.status).toBe(200);
    const params = mockPool.query.mock.calls[0][1];
    expect(params[0]).toBe(2);      // abs_green atualizado
    expect(params[3]).toBe(90);     // perf_green mantido do atual
  });
});

/* ════════════════════════════════════════════════════════════
   CARREIRA
════════════════════════════════════════════════════════════ */
describe('Matriz — Carreira', () => {
  let agent, gAgent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
    gAgent = request.agent(app);
    await loginGestor(gAgent);
    mockPool.query.mockClear();
    mockDb.get.mockClear();
  });

  test('GET /matriz/carreira sem auth → 401', async () => {
    const res = await request(app).get('/matriz/carreira');
    expect(res.status).toBe(401);
  });

  test('GET /matriz/carreira → cria config padrão (ladder vazio) quando não existe', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, ladder: '{}' }] });
    const res = await agent.get('/matriz/carreira');
    expect(res.status).toBe(200);
    expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO mz_carreira_config (ladder) VALUES ('{}')"));
  });

  test('PUT /matriz/carreira como supervisor → 403', async () => {
    const res = await agent.put('/matriz/carreira').send({ ladder: {} });
    expect(res.status).toBe(403);
  });

  test('PUT /matriz/carreira como gestor → 200, serializa ladder', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, ladder: '{}' });
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, ladder: '{"Checkout":["Jr","Pleno"]}' }] });
    const res = await gAgent.put('/matriz/carreira').send({ ladder: { Checkout: ['Jr', 'Pleno'] } });
    expect(res.status).toBe(200);
    const params = mockPool.query.mock.calls[0][1];
    expect(params[0]).toBe(JSON.stringify({ Checkout: ['Jr', 'Pleno'] }));
  });
});

/* ════════════════════════════════════════════════════════════
   MIGRAÇÃO — só testamos o gate de permissão. O corpo dessas rotas
   depende inteiramente do serviço externo (fetch pra MATRIZ_URL via
   getToken/mCall), fora do escopo de mock deste arquivo (lib/db) — testar
   o "happy path" exigiria mockar fetch global e o fluxo OAuth do serviço
   de matriz, o que acopla o teste a um sistema externo em vez do handler
   Express em si. Não fazemos isso aqui: ver nota no relatório.
════════════════════════════════════════════════════════════ */
describe('Matriz — Migração (gate de permissão)', () => {
  test('POST /matriz/migrar sem auth → 401', async () => {
    const res = await request(app).post('/matriz/migrar');
    expect(res.status).toBe(401);
  });

  test('POST /matriz/migrar como supervisor → 403 (só gestor)', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    const res = await agent.post('/matriz/migrar');
    expect(res.status).toBe(403);
  });

  test('GET /matriz/migrar/conferencia sem auth → 401', async () => {
    const res = await request(app).get('/matriz/migrar/conferencia');
    expect(res.status).toBe(401);
  });

  test('GET /matriz/migrar/conferencia como supervisor → 403 (só gestor)', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    const res = await agent.get('/matriz/migrar/conferencia');
    expect(res.status).toBe(403);
  });
});
