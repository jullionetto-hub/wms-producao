/**
 * WMS Miess — Testes de routes/hora-a-hora.js
 * Roda com: npx jest tests/hora-a-hora-routes.test.js
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
    dataHoraLocal: () => ({ data: '2026-09-18', hora: '10:00:00' }),
    turnoAtualEHorarios: () => ({ turno: 'Manha', fim_hora: '13:00', minutos_restantes: 180 }),
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

const loginSeparador = async (agent) => {
  mockDb.get.mockResolvedValueOnce({
    id: 2, nome: 'Sep', login: 'sep1', perfil: 'separador',
    senha_hash: HASH_SEP, subtipo_repositor: 'geral',
    perfis_acesso: '', turno: 'Manhã', status: 'ativo', senha_temporaria: false,
  });
  mockDb.get.mockResolvedValueOnce(null);
  return agent.post('/auth/login').send({ login: 'sep1', senha: SENHA_SEP, perfil: 'separador' });
};

describe('GET /hora-a-hora', () => {
  test('sem auth → 401', async () => {
    const res = await request(app).get('/hora-a-hora');
    expect(res.status).toBe(401);
  });

  test('como separador → 403', async () => {
    const sepAgent = request.agent(app);
    await loginSeparador(sepAgent);
    const res = await sepAgent.get('/hora-a-hora');
    expect(res.status).toBe(403);
  });

  test('200 combina embalagem, expedição e faturamento com ritmo/previsão', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);

    // Ordem das chamadas: metasConfiguradas (db.all), horasTurnoRow (db.get),
    // depois Promise.all([embRows, ckRows, fatRows]) (db.all × 3).
    mockDb.all.mockResolvedValueOnce([{ chave: 'meta_embalagem', valor: '120' }, { chave: 'meta_faturamento', valor: '10000' }]);
    mockDb.get.mockResolvedValueOnce({ valor: '7' }); // horas_turno_manha
    mockDb.all.mockResolvedValueOnce([{ hora: '09:00:00' }, { hora: '09:30:00' }]); // embalagem
    mockDb.all.mockResolvedValueOnce([{ hora: '09:00:00' }]); // checkout
    mockDb.all.mockResolvedValueOnce([{ hora: '09:00:00', faturado: 500 }]); // faturamento

    const res = await agent.get('/hora-a-hora');
    expect(res.status).toBe(200);
    expect(res.body.embalagem.realizado).toBe(2);
    expect(res.body.expedicao.realizado).toBe(1);
    expect(res.body.faturamento.realizado).toBe(500);
    expect(res.body.faturamento.meta).toBe(10000);
    expect(res.body.embalagem.buckets).toHaveLength(24);
    expect(res.body.turno_atual).toBe('Manha');
  });

  test('sem meta_faturamento configurada → situação sem_meta', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);

    mockDb.all.mockResolvedValueOnce([]); // nenhuma meta configurada
    mockDb.get.mockResolvedValueOnce(null); // sem horas_turno configurado → usa default
    mockDb.all.mockResolvedValueOnce([]);
    mockDb.all.mockResolvedValueOnce([]);
    mockDb.all.mockResolvedValueOnce([{ hora: '09:00:00', faturado: 100 }]);

    const res = await agent.get('/hora-a-hora');
    expect(res.status).toBe(200);
    expect(res.body.faturamento.situacao).toBe('sem_meta');
  });

  test('erro de banco → 500', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.all.mockRejectedValueOnce(new Error('conexão perdida'));
    const res = await agent.get('/hora-a-hora');
    expect(res.status).toBe(500);
  });
});

describe('GET /hora-a-hora/pedidos', () => {
  test('sem auth → 401', async () => {
    const res = await request(app).get('/hora-a-hora/pedidos');
    expect(res.status).toBe(401);
  });

  test('como separador → 403', async () => {
    const sepAgent = request.agent(app);
    await loginSeparador(sepAgent);
    const res = await sepAgent.get('/hora-a-hora/pedidos');
    expect(res.status).toBe(403);
  });

  test('200 combina pedidos da última hora das 3 etapas + gap da meta de checkout do turno', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);

    // Ordem: metaRow (db.get), depois Promise.all([sepUltHora, ckUltHora, embUltHora, ckTurnoAtual]) (4× db.get)
    mockDb.get
      .mockResolvedValueOnce({ valor: '300' })  // meta_checkout_manha
      .mockResolvedValueOnce({ n: 30 })         // separacao_ultima_hora
      .mockResolvedValueOnce({ n: 34 })         // checkout_ultima_hora
      .mockResolvedValueOnce({ n: 40 })         // embalagem_ultima_hora
      .mockResolvedValueOnce({ n: 34 });        // checkout_turno_atual

    const res = await agent.get('/hora-a-hora/pedidos');
    expect(res.status).toBe(200);
    expect(res.body.separacao_ultima_hora).toBe(30);
    expect(res.body.checkout_ultima_hora).toBe(34);
    expect(res.body.embalagem_ultima_hora).toBe(40);
    expect(res.body.checkout_turno_atual).toBe(34);
    expect(res.body.meta_checkout_turno).toBe(300);
    expect(res.body.gap_checkout_meta).toBe(266);
  });

  test('meta já batida → gap_checkout_meta é 0, nunca negativo', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.get
      .mockResolvedValueOnce({ valor: '300' })
      .mockResolvedValueOnce({ n: 10 })
      .mockResolvedValueOnce({ n: 310 })
      .mockResolvedValueOnce({ n: 15 })
      .mockResolvedValueOnce({ n: 310 });

    const res = await agent.get('/hora-a-hora/pedidos');
    expect(res.status).toBe(200);
    expect(res.body.gap_checkout_meta).toBe(0);
  });

  test('sem meta_checkout do turno configurada → gap_checkout_meta null', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.get
      .mockResolvedValueOnce(null) // sem meta configurada pro turno
      .mockResolvedValueOnce({ n: 5 })
      .mockResolvedValueOnce({ n: 5 })
      .mockResolvedValueOnce({ n: 5 })
      .mockResolvedValueOnce({ n: 5 });

    const res = await agent.get('/hora-a-hora/pedidos');
    expect(res.status).toBe(200);
    expect(res.body.meta_checkout_turno).toBe(0);
    expect(res.body.gap_checkout_meta).toBeNull();
  });

  test('erro de banco → 500', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.get.mockRejectedValueOnce(new Error('conexão perdida'));
    const res = await agent.get('/hora-a-hora/pedidos');
    expect(res.status).toBe(500);
  });
});
