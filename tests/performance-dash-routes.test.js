/**
 * WMS Miess — Testes Automatizados da API
 * routes/performance-dash.js (backend) — performance de colaboradores,
 * tempos por pedido, ocorrências, metas proporcionais e rastreio de pedido.
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

const SENHA_ADMIN = 'admin123';
const HASH_ADMIN  = bcrypt.hashSync(SENHA_ADMIN, 4);
const SENHA_SEP   = 'sep12345';
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

// Helper — autentica supervisor com bcrypt (perfil com acesso a /performance/*)
const loginSupervisor = (agent) => {
  mockDb.get.mockResolvedValueOnce({
    id: 1, nome: 'Supervisor Test', login: 'admin',
    perfil: 'supervisor', senha_hash: HASH_ADMIN,
    subtipo_repositor: 'geral', perfis_acesso: '', turno: 'Manhã', status: 'ativo',
    senha_temporaria: false,
  });
  return agent.post('/auth/login').send({ login: 'admin', senha: SENHA_ADMIN, perfil: 'supervisor' });
};

// Helper — autentica separador (perfil SEM acesso a /performance/*, usado nos testes de 403)
const loginSeparador = (agent) => {
  mockDb.get.mockResolvedValueOnce({
    id: 2, nome: 'Separador Test', login: 'sep1',
    perfil: 'separador', senha_hash: HASH_SEP,
    subtipo_repositor: 'geral', perfis_acesso: '', turno: 'Manhã', status: 'ativo',
    senha_temporaria: false,
  });
  return agent.post('/auth/login').send({ login: 'sep1', senha: SENHA_SEP, perfil: 'separador' });
};

/* ════════════════════════════════════════════════════════════
   1. GET /performance/separadores
════════════════════════════════════════════════════════════ */
describe('GET /performance/separadores', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).get('/performance/separadores?ini=2026-05-01&fim=2026-05-31');
    expect(res.status).toBe(401);
  });

  test('perfil sem permissão (separador) → 403', async () => {
    const sepAgent = request.agent(app);
    await loginSeparador(sepAgent);
    const res = await sepAgent.get('/performance/separadores?ini=2026-05-01&fim=2026-05-31');
    expect(res.status).toBe(403);
  });

  test('sem ini/fim → 400', async () => {
    const res = await agent.get('/performance/separadores');
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/ini e fim/);
  });

  test('happy path → 200 com resumo agregado e cálculo de setores', async () => {
    // ordem exata das chamadas no handler: colab, repos, porDia, ruasRaw, porColabDia,
    // checkoutRows, embalagemRows, reposicaoPorColabRows (db.all) — depois reposicaoTiming, skusTotal (db.get)
    mockDb.all
      .mockResolvedValueOnce([{ nome: 'Ana', turno: 'Manha', pedidos: 10, itens: 50, skus: 20, tempo_medio_min: '15.5' }]) // colab
      .mockResolvedValueOnce([{ nome: 'Ana', reposicoes: 2 }]) // repos
      .mockResolvedValueOnce([{ data: '2026-05-01', pedidos: 10, itens: 50 }]) // porDia
      .mockResolvedValueOnce([{ rua: 'A', nome: 'Ana', itens: 50, pedidos: 10 }]) // ruasRaw
      .mockResolvedValueOnce([{ data: '2026-05-01', colaborador: 'Ana', turno: 'Manha', pedidos: 10, itens: 50, skus: 20, ruas: 3, tempo_medio: '15.5' }]) // porColabDia
      .mockResolvedValueOnce([
        { nome: 'Bia',    concluidos: 5, pendentes: 1, itens: 30, tempo_medio_min: '10.0' },
        { nome: 'Carlos', concluidos: 8, pendentes: 0, itens: 40, tempo_medio_min: '20.0' },
      ]) // checkoutRows
      .mockResolvedValueOnce([{ nome: 'Duda', concluidos: 3, pendentes: 2, itens: 15, tempo_medio_min: '12.0' }]) // embalagemRows
      .mockResolvedValueOnce([{ nome: 'Eli', concluidos: 4, pendentes: 1, tempo_medio_min: '8.0' }]); // reposicaoPorColabRows

    mockDb.get
      .mockResolvedValueOnce({ tempo_medio_min: '9.5' }) // reposicaoTiming
      .mockResolvedValueOnce({ total_skus: 100 }); // skusTotal

    const res = await agent.get('/performance/separadores?ini=2026-05-01&fim=2026-05-31');
    expect(res.status).toBe(200);

    // colaboradores + reposições cruzadas por nome
    expect(res.body.colaboradores[0].nome).toBe('Ana');
    expect(res.body.colaboradores[0].reposicoes).toBe(2);
    expect(res.body.colaboradores[0].tempo_medio_min).toBe(15.5);

    expect(res.body.total_skus).toBe(100);
    expect(res.body.reposicao.tempo_medio_min).toBe(9.5);

    // resumirSetor: soma de concluidos/pendentes/itens e média de tempo
    expect(res.body.checkout.colaboradores).toBe(2);
    expect(res.body.checkout.concluidos).toBe(13);
    expect(res.body.checkout.pendentes).toBe(1);
    expect(res.body.checkout.itens).toBe(70);
    expect(res.body.checkout.tempo_medio_min).toBe(15); // média de (10.0 + 20.0)/2
    expect(res.body.checkout.mais_rapido).toEqual({ nome: 'Bia', tempo_medio_min: 10 });
    expect(res.body.checkout.mais_lento).toEqual({ nome: 'Carlos', tempo_medio_min: 20 });

    // mapColab: ordenado por concluidos desc
    expect(res.body.checkout_colaboradores.map(c => c.nome)).toEqual(['Carlos', 'Bia']);

    expect(res.body.embalagem.colaboradores).toBe(1);
    expect(res.body.reposicao_colaboradores[0].nome).toBe('Eli');
  });

  test('com filtro de turno → 200 (não quebra a query)', async () => {
    mockDb.all.mockResolvedValue([]);
    mockDb.get.mockResolvedValue(null);
    const res = await agent.get('/performance/separadores?ini=2026-05-01&fim=2026-05-31&turno=Manha');
    expect(res.status).toBe(200);
  });

  test('erro no banco → 500', async () => {
    mockDb.all.mockRejectedValueOnce(new Error('falha de conexão'));
    const res = await agent.get('/performance/separadores?ini=2026-05-01&fim=2026-05-31');
    expect(res.status).toBe(500);
    expect(res.body.erro).toBeDefined();
  });
});

/* ════════════════════════════════════════════════════════════
   2. GET /performance/pedidos-detail
════════════════════════════════════════════════════════════ */
describe('GET /performance/pedidos-detail', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).get('/performance/pedidos-detail?ini=2026-05-01&fim=2026-05-31');
    expect(res.status).toBe(401);
  });

  test('perfil sem permissão → 403', async () => {
    const sepAgent = request.agent(app);
    await loginSeparador(sepAgent);
    const res = await sepAgent.get('/performance/pedidos-detail?ini=2026-05-01&fim=2026-05-31');
    expect(res.status).toBe(403);
  });

  test('sem ini/fim → 400', async () => {
    const res = await agent.get('/performance/pedidos-detail');
    expect(res.status).toBe(400);
  });

  test('happy path → 200 com array de pedidos detalhados', async () => {
    mockDb.all.mockResolvedValueOnce([{
      data: '2026-05-01', numero_pedido: '12345', colaborador: 'Ana', turno: 'Manha',
      total_itens: 10, skus: 5, duracao_min: 22.5, ruas_percorridas: 3, ruas_lista: 'A,B,C',
    }]);
    const res = await agent.get('/performance/pedidos-detail?ini=2026-05-01&fim=2026-05-31');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].numero_pedido).toBe('12345');
    expect(res.body[0].duracao_min).toBe(22.5);
  });
});

/* ════════════════════════════════════════════════════════════
   3. GET /performance/timing
════════════════════════════════════════════════════════════ */
describe('GET /performance/timing', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).get('/performance/timing?ini=2026-05-01&fim=2026-05-31');
    expect(res.status).toBe(401);
  });

  test('perfil sem permissão → 403', async () => {
    const sepAgent = request.agent(app);
    await loginSeparador(sepAgent);
    const res = await sepAgent.get('/performance/timing?ini=2026-05-01&fim=2026-05-31');
    expect(res.status).toBe(403);
  });

  test('sem ini/fim → 400', async () => {
    const res = await agent.get('/performance/timing');
    expect(res.status).toBe(400);
  });

  test('happy path → 200 com separacao/reposicao/checkout/embalagem', async () => {
    // ordem exata: separacao, reposicao, checkout, embalagem
    mockDb.all
      .mockResolvedValueOnce([{ numero_pedido: '1', colaborador: 'Ana', turno: 'Manha', data: '2026-05-01', duracao_min: 15 }])
      .mockResolvedValueOnce([{ numero_pedido: '1', codigo: 'X1', colaborador: 'Eli', duracao_min: 5 }])
      .mockResolvedValueOnce([{ numero_pedido: '1', colaborador: 'Bia', duracao_min: 8 }])
      .mockResolvedValueOnce([{ numero_pedido: '1', colaborador: 'Duda', duracao_min: 12 }]);

    const res = await agent.get('/performance/timing?ini=2026-05-01&fim=2026-05-31');
    expect(res.status).toBe(200);
    expect(res.body.separacao).toHaveLength(1);
    expect(res.body.reposicao[0].colaborador).toBe('Eli');
    expect(res.body.checkout[0].colaborador).toBe('Bia');
    expect(res.body.embalagem[0].colaborador).toBe('Duda');
  });
});

/* ════════════════════════════════════════════════════════════
   4. GET /performance/metas
════════════════════════════════════════════════════════════ */
describe('GET /performance/metas', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).get('/performance/metas?ini=2026-05-01&fim=2026-05-31');
    expect(res.status).toBe(401);
  });

  test('perfil sem permissão → 403', async () => {
    const sepAgent = request.agent(app);
    await loginSeparador(sepAgent);
    const res = await sepAgent.get('/performance/metas?ini=2026-05-01&fim=2026-05-31');
    expect(res.status).toBe(403);
  });

  test('sem ini/fim → 400', async () => {
    const res = await agent.get('/performance/metas');
    expect(res.status).toBe(400);
  });

  test('calcula meta proporcional e % atingido corretamente', async () => {
    // ordem: sessoes (1), depois Promise.all([sepRows, ckRows, embRows, repRows])
    mockDb.all
      .mockResolvedValueOnce([
        { nome: 'João', perfil: 'separador', turno: 'Manha', data: '2026-05-01', minutos_logado: 465 },
      ]) // sessoes — turno inteiro (465min) logado
      .mockResolvedValueOnce([{ nome: 'João', data: '2026-05-01', realizado: 50 }]) // sepRows
      .mockResolvedValueOnce([]) // ckRows
      .mockResolvedValueOnce([]) // embRows
      .mockResolvedValueOnce([]); // repRows

    const res = await agent.get('/performance/metas?ini=2026-05-01&fim=2026-05-31');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const r = res.body[0];
    // meta cheia do separador é 65; turno Manha = 465min; logou o turno inteiro → meta proporcional = meta cheia
    expect(r.meta_cheia).toBe(65);
    expect(r.meta_proporcional).toBe(65);
    expect(r.realizado).toBe(50);
    expect(r.pct_atingido).toBe(Math.round((50 / 65) * 100)); // 77
  });

  test('perfil sem meta cadastrada → meta_cheia 0 e pct_atingido null', async () => {
    mockDb.all
      .mockResolvedValueOnce([
        { nome: 'Zeca', perfil: 'gestor', turno: 'Manha', data: '2026-05-01', minutos_logado: 200 },
      ])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const res = await agent.get('/performance/metas?ini=2026-05-01&fim=2026-05-31');
    expect(res.status).toBe(200);
    expect(res.body[0].meta_cheia).toBe(0);
    expect(res.body[0].meta_proporcional).toBe(0);
    expect(res.body[0].pct_atingido).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════
   5. GET /performance/range
════════════════════════════════════════════════════════════ */
describe('GET /performance/range', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).get('/performance/range');
    expect(res.status).toBe(401);
  });

  test('perfil sem permissão → 403', async () => {
    const sepAgent = request.agent(app);
    await loginSeparador(sepAgent);
    const res = await sepAgent.get('/performance/range');
    expect(res.status).toBe(403);
  });

  test('happy path → 200 com ini/fim do banco', async () => {
    mockDb.get.mockResolvedValueOnce({ ini: '2026-01-01', fim: '2026-05-31' });
    const res = await agent.get('/performance/range');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ini: '2026-01-01', fim: '2026-05-31' });
  });

  test('sem pedidos concluídos → 200 com ini/fim null', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.get('/performance/range');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ini: null, fim: null });
  });
});

/* ════════════════════════════════════════════════════════════
   6. GET /performance/ocorrencias
════════════════════════════════════════════════════════════ */
describe('GET /performance/ocorrencias', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).get('/performance/ocorrencias');
    expect(res.status).toBe(401);
  });

  test('perfil sem permissão → 403', async () => {
    const sepAgent = request.agent(app);
    await loginSeparador(sepAgent);
    const res = await sepAgent.get('/performance/ocorrencias');
    expect(res.status).toBe(403);
  });

  test('sem filtros → 200 com array', async () => {
    mockDb.all.mockResolvedValueOnce([{ id: 1, colaborador_nome: 'Ana', tipo: 'atraso', data: '2026-05-01' }]);
    const res = await agent.get('/performance/ocorrencias');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(mockDb.all).toHaveBeenCalledWith(expect.stringContaining('WHERE 1=1'), []);
  });

  test('com filtros ini/fim/colaborador/tipo → monta WHERE e params corretamente', async () => {
    mockDb.all.mockResolvedValueOnce([]);
    const res = await agent.get('/performance/ocorrencias')
      .query({ ini: '2026-05-01', fim: '2026-05-31', colaborador: 'Ana', tipo: 'atraso' });
    expect(res.status).toBe(200);
    const [sql, params] = mockDb.all.mock.calls[0];
    expect(sql).toMatch(/o\.data >= \$1/);
    expect(sql).toMatch(/o\.data <= \$2/);
    expect(sql).toMatch(/o\.colaborador_nome = \$3/);
    expect(sql).toMatch(/o\.tipo = \$4/);
    expect(params).toEqual(['2026-05-01', '2026-05-31', 'Ana', 'atraso']);
  });

  test('erro no banco → 500', async () => {
    mockDb.all.mockRejectedValueOnce(new Error('boom'));
    const res = await agent.get('/performance/ocorrencias');
    expect(res.status).toBe(500);
  });
});

/* ════════════════════════════════════════════════════════════
   7. POST /performance/ocorrencias
════════════════════════════════════════════════════════════ */
describe('POST /performance/ocorrencias', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).post('/performance/ocorrencias').send({});
    expect(res.status).toBe(401);
  });

  test('perfil sem permissão → 403', async () => {
    const sepAgent = request.agent(app);
    await loginSeparador(sepAgent);
    const res = await sepAgent.post('/performance/ocorrencias').send({
      colaborador_nome: 'Ana', tipo: 'atraso', descricao: 'x', data: '2026-05-01',
    });
    expect(res.status).toBe(403);
  });

  test('sem colaborador_nome → 400', async () => {
    const res = await agent.post('/performance/ocorrencias').send({
      tipo: 'atraso', descricao: 'chegou atrasada', data: '2026-05-01',
    });
    expect(res.status).toBe(400);
  });

  test('sem tipo → 400', async () => {
    const res = await agent.post('/performance/ocorrencias').send({
      colaborador_nome: 'Ana', descricao: 'x', data: '2026-05-01',
    });
    expect(res.status).toBe(400);
  });

  test('sem descricao → 400', async () => {
    const res = await agent.post('/performance/ocorrencias').send({
      colaborador_nome: 'Ana', tipo: 'atraso', data: '2026-05-01',
    });
    expect(res.status).toBe(400);
  });

  test('sem data → 400', async () => {
    const res = await agent.post('/performance/ocorrencias').send({
      colaborador_nome: 'Ana', tipo: 'atraso', descricao: 'x',
    });
    expect(res.status).toBe(400);
  });

  test('happy path → 200 com ocorrência criada', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 10, colaborador_nome: 'Ana', tipo: 'atraso', gravidade: 'leve', descricao: 'chegou atrasada', data: '2026-05-01', turno: 'Manha', supervisor_nome: 'Supervisor Test' }],
    });
    const res = await agent.post('/performance/ocorrencias').send({
      colaborador_nome: 'Ana', tipo: 'atraso', descricao: 'chegou atrasada', data: '2026-05-01', turno: 'Manha',
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(10);
    expect(res.body.colaborador_nome).toBe('Ana');
    // supervisor_nome vem da sessão autenticada
    const insertCall = mockPool.query.mock.calls.find(c => String(c[0]).includes('INSERT INTO ocorrencias'));
    expect(insertCall[1][6]).toBe('Supervisor Test');
  });

  test('gravidade default "leve" quando não informada', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 11, gravidade: 'leve' }] });
    const res = await agent.post('/performance/ocorrencias').send({
      colaborador_nome: 'Bia', tipo: 'falta', descricao: 'faltou sem avisar', data: '2026-05-02',
    });
    expect(res.status).toBe(200);
    const insertCall = mockPool.query.mock.calls.find(c => String(c[0]).includes('INSERT INTO ocorrencias'));
    expect(insertCall[1][2]).toBe('leve'); // gravidade
  });

  test('erro no banco → 500', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('falhou'));
    const res = await agent.post('/performance/ocorrencias').send({
      colaborador_nome: 'Ana', tipo: 'atraso', descricao: 'x', data: '2026-05-01',
    });
    expect(res.status).toBe(500);
  });
});

/* ════════════════════════════════════════════════════════════
   8. DELETE /performance/ocorrencias/:id
════════════════════════════════════════════════════════════ */
describe('DELETE /performance/ocorrencias/:id', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).delete('/performance/ocorrencias/1');
    expect(res.status).toBe(401);
  });

  test('perfil sem permissão → 403', async () => {
    const sepAgent = request.agent(app);
    await loginSeparador(sepAgent);
    const res = await sepAgent.delete('/performance/ocorrencias/1');
    expect(res.status).toBe(403);
  });

  test('happy path → 200 com mensagem de sucesso', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    const res = await agent.delete('/performance/ocorrencias/1');
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toMatch(/exclu/i);
    expect(mockPool.query).toHaveBeenCalledWith('DELETE FROM ocorrencias WHERE id=$1', ['1']);
  });

  test('erro no banco → 500', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('falhou'));
    const res = await agent.delete('/performance/ocorrencias/1');
    expect(res.status).toBe(500);
  });
});

/* ════════════════════════════════════════════════════════════
   9. GET /performance/pedido/:numero
════════════════════════════════════════════════════════════ */
describe('GET /performance/pedido/:numero', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).get('/performance/pedido/12345');
    expect(res.status).toBe(401);
  });

  test('perfil sem permissão → 403', async () => {
    const sepAgent = request.agent(app);
    await loginSeparador(sepAgent);
    const res = await sepAgent.get('/performance/pedido/12345');
    expect(res.status).toBe(403);
  });

  test('pedido não encontrado → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null); // sep
    const res = await agent.get('/performance/pedido/99999');
    expect(res.status).toBe(404);
    expect(res.body.erro).toMatch(/não encontrado/);
  });

  test('happy path → 200 com todas as etapas do pedido', async () => {
    // ordem: sep (db.get), reposicoes (db.all), ck (db.get), emb (db.get), itens (db.all), itensComProblema (db.all)
    mockDb.get
      .mockResolvedValueOnce({
        numero_pedido: '12345', cliente: 'Cliente X', transportadora: 'Transp Y',
        colaborador: 'Ana', data: '2026-05-01', iniciado_em: '2026-05-01T08:00:00',
        concluido_em: '2026-05-01T08:20:00', total_itens: 10, skus: 5,
        status: 'concluido', status_embalagem: 'embalado', duracao_min: 20,
      }) // sep
      .mockResolvedValueOnce({ numero_pedido: '12345', colaborador: 'Bia', data: '2026-05-01', iniciado_em: '08:25', concluido_em: '08:30', total_itens: 10, skus: 5, duracao_min: 5 }) // ck
      .mockResolvedValueOnce({ numero_pedido: '12345', colaborador: 'Duda', data: '2026-05-01', iniciado_em: '08:31', concluido_em: '08:40', total_itens: 10, skus: 5, duracao_min: 9 }); // emb

    mockDb.all
      .mockResolvedValueOnce([]) // reposicoes
      .mockResolvedValueOnce([{ codigo: 'A1', descricao: 'Item 1', quantidade: 2, endereco: 'A1/01', hora_verificado: '08:10' }]) // itens
      .mockResolvedValueOnce([]); // itensComProblema

    const res = await agent.get('/performance/pedido/12345');
    expect(res.status).toBe(200);
    expect(res.body.numero_pedido).toBe('12345');
    expect(res.body.separacao.cliente).toBe('Cliente X');
    expect(res.body.checkout.colaborador).toBe('Bia');
    expect(res.body.embalagem.colaborador).toBe('Duda');
    expect(res.body.itens).toHaveLength(1);
    expect(res.body.itens_com_problema).toEqual([]);
    expect(res.body.reposicoes).toEqual([]);
  });

  test('erro no banco → 500', async () => {
    mockDb.get.mockRejectedValueOnce(new Error('falha'));
    const res = await agent.get('/performance/pedido/12345');
    expect(res.status).toBe(500);
  });
});
