/**
 * WMS Miess — Testes de routes/kpis.js (dashboards, estatísticas, configurações)
 * Roda com: npm test -- kpis-routes
 *
 * Convenção idêntica a tests/api.test.js — mock de ../lib/db, dataHoraLocal fixo,
 * loginSupervisor via bcrypt real. O describe "KPIs" de api.test.js já cobre
 * GET /kpis, GET /kpis sem auth, GET /estatisticas/repositor e GET /dashboard/ranking —
 * não duplicado aqui.
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

// Helper — autentica supervisor (perfil com acesso a todas as rotas requerPerfil('supervisor'))
const loginSupervisor = (agent) => {
  mockDb.get.mockResolvedValueOnce({
    id: 1, nome: 'Supervisor Test', login: 'admin',
    perfil: 'supervisor', senha_hash: bcrypt.hashSync('admin123', 4),
    subtipo_repositor: 'geral', perfis_acesso: '', turno: 'Manhã', status: 'ativo',
    senha_temporaria: false,
  });
  return agent.post('/auth/login').send({ login: 'admin', senha: 'admin123', perfil: 'supervisor' });
};

// Helper — autentica um colaborador sem privilégio de supervisor (para testar 403)
const loginColaborador = (agent, perfil = 'checkout') => {
  mockDb.get.mockResolvedValueOnce({
    id: 9, nome: 'Colaborador', login: 'colab1', perfil,
    senha_hash: bcrypt.hashSync('colab123', 4), subtipo_repositor: 'geral',
    perfis_acesso: '', turno: 'Manhã', status: 'ativo', senha_temporaria: false,
  });
  return agent.post('/auth/login').send({ login: 'colab1', senha: 'colab123', perfil });
};

/* ════════════════════════════════════════════════════════════
   PRODUTIVIDADE
════════════════════════════════════════════════════════════ */
describe('GET /produtividade', () => {
  let agent;
  beforeEach(async () => { agent = request.agent(app); await loginSupervisor(agent); });

  test('sem auth → 401', async () => {
    const res = await request(app).get('/produtividade');
    expect(res.status).toBe(401);
  });

  test('→ 200 com array de separadores', async () => {
    mockDb.all.mockResolvedValueOnce([
      { id: 1, nome: 'Ana', matricula: 'M1', status: 'ativo', hoje: 3, mes: 20, total_ano: 100, pontuacao_total: 500 },
    ]);
    const res = await agent.get('/produtividade');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 1, nome: 'Ana', matricula: 'M1', status: 'ativo', hoje: 3, mes: 20, total_ano: 100, pontuacao_total: 500 },
    ]);
  });

  test('?separador_id filtra por separador → 200', async () => {
    mockDb.all.mockResolvedValueOnce([]);
    const res = await agent.get('/produtividade?separador_id=5');
    expect(res.status).toBe(200);
    const [, params] = mockDb.all.mock.calls[0];
    expect(params).toContain('5');
  });
});

/* ════════════════════════════════════════════════════════════
   ESTATÍSTICAS — PEDIDOS
════════════════════════════════════════════════════════════ */
describe('GET /estatisticas/pedidos', () => {
  let agent;
  beforeEach(async () => { agent = request.agent(app); await loginSupervisor(agent); });

  test('sem auth → 401', async () => {
    const res = await request(app).get('/estatisticas/pedidos');
    expect(res.status).toBe(401);
  });

  test('sem período → 200 com totais do dia/mês/ano', async () => {
    mockDb.get.mockResolvedValueOnce({
      concluidos_hoje: 5, total_hoje: 8, concluidos_mes: 50, total_mes: 80,
      concluidos_ano: 500, total_ano: 800,
    });
    const res = await agent.get('/estatisticas/pedidos');
    expect(res.status).toBe(200);
    expect(res.body.concluidos_hoje).toBe(5);
    expect(res.body.total_periodo).toBeUndefined();
  });

  test('com data_ini/data_fim → mescla totais do período', async () => {
    mockDb.get
      .mockResolvedValueOnce({ concluidos_hoje: 5, total_hoje: 8, concluidos_mes: 50, total_mes: 80, concluidos_ano: 500, total_ano: 800 })
      .mockResolvedValueOnce({ total_periodo: 12, concluidos_periodo: 10 });
    const res = await agent.get('/estatisticas/pedidos?data_ini=2026-05-01&data_fim=2026-05-09');
    expect(res.status).toBe(200);
    expect(res.body.total_periodo).toBe(12);
    expect(res.body.concluidos_periodo).toBe(10);
    expect(res.body.concluidos_hoje).toBe(5); // mantém campos do primeiro row
  });
});

/* ════════════════════════════════════════════════════════════
   ESTATÍSTICAS — CHECKOUT
════════════════════════════════════════════════════════════ */
describe('GET /estatisticas/checkout', () => {
  let agent;
  beforeEach(async () => { agent = request.agent(app); await loginSupervisor(agent); });

  test('sem auth → 401', async () => {
    const res = await request(app).get('/estatisticas/checkout');
    expect(res.status).toBe(401);
  });

  test('→ 200 com totais', async () => {
    mockDb.get.mockResolvedValueOnce({ concluidos_hoje: 3, total_hoje: 4, pendentes: 1 });
    const res = await agent.get('/estatisticas/checkout');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ concluidos_hoje: 3, total_hoje: 4, pendentes: 1 });
  });

  test('→ 200 com {} quando db.get retorna null', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.get('/estatisticas/checkout');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });
});

/* ════════════════════════════════════════════════════════════
   TIMELINE
════════════════════════════════════════════════════════════ */
describe('GET /timeline', () => {
  let agent;
  beforeEach(async () => { agent = request.agent(app); await loginSupervisor(agent); });

  test('sem auth → 401', async () => {
    const res = await request(app).get('/timeline');
    expect(res.status).toBe(401);
  });

  test('→ 200 formata aguardando_desde (vazio quando nulo)', async () => {
    mockDb.all.mockResolvedValueOnce([
      { numero_pedido: '1', cliente: 'X', transportadora: 'Y', hora_pedido: '08:00', status: 'pendente', itens: 3, separador_nome: null, data_pedido: '2026-05-09', aguardando_desde: null },
    ]);
    const res = await agent.get('/timeline');
    expect(res.status).toBe(200);
    expect(res.body[0].aguardando_desde).toBe('');
  });

  test('→ 200 formata aguardando_desde a partir de serial Excel', async () => {
    mockDb.all.mockResolvedValueOnce([
      { numero_pedido: '2', cliente: 'X', transportadora: 'Y', hora_pedido: '08:00', status: 'pendente', itens: 1, separador_nome: null, data_pedido: '2026-05-09', aguardando_desde: '45810.5' },
    ]);
    const res = await agent.get('/timeline?data=2026-05-09');
    expect(res.status).toBe(200);
    expect(res.body[0].aguardando_desde).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });
});

/* ════════════════════════════════════════════════════════════
   STATS — COLABORADORES (supervisor)
════════════════════════════════════════════════════════════ */
describe('GET /stats/colaboradores', () => {
  test('sem auth → 401', async () => {
    const res = await request(app).get('/stats/colaboradores');
    expect(res.status).toBe(401);
  });

  test('perfil não supervisor → 403', async () => {
    const agent = request.agent(app);
    await loginColaborador(agent, 'checkout');
    const res = await agent.get('/stats/colaboradores');
    expect(res.status).toBe(403);
  });

  test('supervisor → 200 com separadores/repositores/checkouts', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.all
      .mockResolvedValueOnce([{ nome: 'Ana', login: 'ana', turno: 'Manhã', sep_hoje: 2, sep_total: 30 }])
      .mockResolvedValueOnce([{ nome: 'Bia', login: 'bia', turno: 'Tarde', rep_hoje: 1, rep_resolvidas_hoje: 1, rep_nao_encontrados_hoje: 0 }])
      .mockResolvedValueOnce([{ nome: 'Caio', login: 'caio', turno: 'Manhã', ck_hoje: 4, ck_total_hoje: 4 }]);
    const res = await agent.get('/stats/colaboradores');
    expect(res.status).toBe(200);
    expect(res.body.data).toBe('2026-05-09');
    expect(res.body.separadores).toHaveLength(1);
    expect(res.body.repositores).toHaveLength(1);
    expect(res.body.checkouts).toHaveLength(1);
  });
});

/* ════════════════════════════════════════════════════════════
   STATS — MEUS (por perfil da sessão)
════════════════════════════════════════════════════════════ */
describe('GET /stats/meus', () => {
  test('sem auth → 401', async () => {
    const res = await request(app).get('/stats/meus');
    expect(res.status).toBe(401);
  });

  test('perfil supervisor → 200 somente com dados base', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    const res = await agent.get('/stats/meus');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ perfil: 'supervisor', nome: 'Supervisor Test', hoje: '2026-05-09' });
  });

  test('perfil separador com registro vinculado → 200 com bloco separacao', async () => {
    const agent = request.agent(app);
    // login: busca usuário + acha separador já na 1ª tentativa (por usuario_id)
    mockDb.get.mockResolvedValueOnce({
      id: 7, nome: 'Sep1', login: 'sep1', perfil: 'separador',
      senha_hash: bcrypt.hashSync('sep123', 4), subtipo_repositor: 'geral',
      perfis_acesso: '', turno: 'Manhã', status: 'ativo', senha_temporaria: false,
    });
    mockDb.get.mockResolvedValueOnce({ id: 11, nome: 'Sep1', matricula: 'M1', turno: 'Manhã', status: 'ativo' });
    await agent.post('/auth/login').send({ login: 'sep1', senha: 'sep123', perfil: 'separador' });

    // rota: busca id do separador vinculado, depois estatísticas
    mockDb.get.mockResolvedValueOnce({ id: 11 });
    mockDb.get.mockResolvedValueOnce({ separados_hoje: 3, total_hoje: 5, separados_total: 50 });

    const res = await agent.get('/stats/meus');
    expect(res.status).toBe(200);
    expect(res.body.perfil).toBe('separador');
    expect(res.body.separacao).toEqual({ separados_hoje: 3, total_hoje: 5, separados_total: 50 });
  });

  test('perfil repositor → 200 com bloco reposicao', async () => {
    const agent = request.agent(app);
    await loginColaborador(agent, 'repositor');
    mockDb.get.mockResolvedValueOnce({ avisos_hoje: 4, resolvidos_hoje: 2, nao_encontrados_hoje: 1, pendentes_hoje: 1 });
    const res = await agent.get('/stats/meus');
    expect(res.status).toBe(200);
    expect(res.body.perfil).toBe('repositor');
    expect(res.body.reposicao).toEqual({ avisos_hoje: 4, resolvidos_hoje: 2, nao_encontrados_hoje: 1, pendentes_hoje: 1 });
  });

  test('perfil checkout → 200 com bloco checkout', async () => {
    const agent = request.agent(app);
    await loginColaborador(agent, 'checkout');
    mockDb.get.mockResolvedValueOnce({ expedidos_hoje: 6, total_hoje: 6, pendentes: 2 });
    const res = await agent.get('/stats/meus');
    expect(res.status).toBe(200);
    expect(res.body.perfil).toBe('checkout');
    expect(res.body.checkout).toEqual({ expedidos_hoje: 6, total_hoje: 6, pendentes: 2 });
  });
});

/* ════════════════════════════════════════════════════════════
   ESTATÍSTICAS — SEPARADOR
════════════════════════════════════════════════════════════ */
describe('GET /estatisticas/separador', () => {
  let agent;
  beforeEach(async () => { agent = request.agent(app); await loginSupervisor(agent); });

  test('sem auth → 401', async () => {
    const res = await request(app).get('/estatisticas/separador');
    expect(res.status).toBe(401);
  });

  test('supervisor sem separador_id → resolve via próprio usuário e usa data de hoje', async () => {
    mockDb.get
      .mockResolvedValueOnce({ d: '2026-05-09' })            // TO_CHAR
      .mockResolvedValueOnce(null)                            // usr lookup (supervisor não tem separador)
      .mockResolvedValueOnce({ hoje: 5, concluidos_hoje: 3, separando_hoje: 1, total_concluidos: 20, total_pedidos: 25 });
    mockDb.all.mockResolvedValueOnce([{ id: 1, numero_pedido: '123', status: 'concluido', itens: 5, cliente: 'X', hora_pedido: '08:00', numero_caixa: 'A1' }]);

    const res = await agent.get('/estatisticas/separador');
    expect(res.status).toBe(200);
    expect(res.body.hoje).toBe('2026-05-09');
    expect(res.body.totais.total_pedidos).toBe(25);
    expect(res.body.pedidos).toHaveLength(1);
  });

  test('supervisor com separador_id → usa direto, sem lookup do próprio usuário', async () => {
    mockDb.get
      .mockResolvedValueOnce({ d: '2026-05-09' })  // TO_CHAR
      .mockResolvedValueOnce({ hoje: 2, concluidos_hoje: 1, separando_hoje: 0, total_concluidos: 10, total_pedidos: 10 });
    mockDb.all.mockResolvedValueOnce([]);
    mockDb.get.mockClear(); // zera as chamadas do login no beforeEach — só quer contar as desta requisição

    const res = await agent.get('/estatisticas/separador?separador_id=42');
    expect(res.status).toBe(200);
    expect(mockDb.get).toHaveBeenCalledTimes(2); // não fez o lookup extra
    expect(res.body.totais.total_pedidos).toBe(10);
  });

  test('data fornecida via query pula a busca de TO_CHAR', async () => {
    mockDb.get
      .mockResolvedValueOnce(null) // usr lookup
      .mockResolvedValueOnce({ hoje: 0, concluidos_hoje: 0, separando_hoje: 0, total_concluidos: 0, total_pedidos: 0 });
    mockDb.all.mockResolvedValueOnce([]);

    const res = await agent.get('/estatisticas/separador?data=2026-01-01');
    expect(res.status).toBe(200);
    expect(res.body.hoje).toBe('2026-01-01');
  });
});

/* ════════════════════════════════════════════════════════════
   DASHBOARD — RANKING GERAL (supervisor)
════════════════════════════════════════════════════════════ */
describe('GET /dashboard/ranking-geral', () => {
  test('sem auth → 401', async () => {
    const res = await request(app).get('/dashboard/ranking-geral');
    expect(res.status).toBe(401);
  });

  test('perfil não supervisor → 403', async () => {
    const agent = request.agent(app);
    await loginColaborador(agent);
    const res = await agent.get('/dashboard/ranking-geral');
    expect(res.status).toBe(403);
  });

  test('supervisor → 200 com as 4 áreas', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.get.mockResolvedValueOnce({ d: '2026-05-09' });
    mockDb.all
      .mockResolvedValueOnce([{ nome: 'Ana', total: 10, itens: 100 }])
      .mockResolvedValueOnce([{ nome: 'Bia', total: 5 }])
      .mockResolvedValueOnce([{ nome: 'Caio', total: 3 }])
      .mockResolvedValueOnce([{ nome: 'Dan', total: 2 }]);
    const res = await agent.get('/dashboard/ranking-geral');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      separadores: [{ nome: 'Ana', total: 10, itens: 100 }],
      checkout: [{ nome: 'Bia', total: 5 }],
      embalagem: [{ nome: 'Caio', total: 3 }],
      repositores: [{ nome: 'Dan', total: 2 }],
    });
  });
});

/* ════════════════════════════════════════════════════════════
   DASHBOARD — POR HORA (supervisor)
════════════════════════════════════════════════════════════ */
describe('GET /dashboard/por-hora', () => {
  test('sem auth → 401', async () => {
    const res = await request(app).get('/dashboard/por-hora');
    expect(res.status).toBe(401);
  });

  test('perfil não supervisor → 403', async () => {
    const agent = request.agent(app);
    await loginColaborador(agent);
    const res = await agent.get('/dashboard/por-hora');
    expect(res.status).toBe(403);
  });

  test('supervisor → 200 com array de horas', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.get.mockResolvedValueOnce({ d: '2026-05-09' });
    mockDb.all.mockResolvedValueOnce([{ hora: '08', separacao: 3, checkout: 1, embalagem: 0, reposicao: 2 }]);
    const res = await agent.get('/dashboard/por-hora');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ hora: '08', separacao: 3, checkout: 1, embalagem: 0, reposicao: 2 }]);
  });
});

/* ════════════════════════════════════════════════════════════
   CONFIGURAÇÕES (metas e horas de turno)
════════════════════════════════════════════════════════════ */
describe('Configurações', () => {
  test('GET sem auth → 401', async () => {
    const res = await request(app).get('/configuracoes');
    expect(res.status).toBe(401);
  });

  test('GET perfil não supervisor → 403', async () => {
    const agent = request.agent(app);
    await loginColaborador(agent);
    const res = await agent.get('/configuracoes');
    expect(res.status).toBe(403);
  });

  test('GET supervisor → 200 com array de configs', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.all.mockResolvedValueOnce([{ chave: 'meta_separacao', valor: '75' }]);
    const res = await agent.get('/configuracoes');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ chave: 'meta_separacao', valor: '75' }]);
  });

  test('PUT sem auth → 401', async () => {
    const res = await request(app).put('/configuracoes/meta_separacao').send({ valor: '80' });
    expect(res.status).toBe(401);
  });

  test('PUT perfil não supervisor → 403', async () => {
    const agent = request.agent(app);
    await loginColaborador(agent);
    const res = await agent.put('/configuracoes/meta_separacao').send({ valor: '80' });
    expect(res.status).toBe(403);
  });

  test('PUT sem valor → 400', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    const res = await agent.put('/configuracoes/meta_separacao').send({});
    expect(res.status).toBe(400);
  });

  test('PUT com valor → 200 e grava via upsert', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    const res = await agent.put('/configuracoes/meta_separacao').send({ valor: '80' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mensagem: 'Salvo!' });
    // Não usa calls[0]: o login já fez sua própria chamada a pool.query (INSERT em
    // sessoes_trabalho) antes desta — procura a chamada específica do upsert.
    const chamada = mockPool.query.mock.calls.find(c => String(c[0]).includes('INSERT INTO configuracoes'));
    expect(chamada).toBeDefined();
    expect(chamada[1]).toEqual(['meta_separacao', '80']);
  });
});

/* ════════════════════════════════════════════════════════════
   LIBERAÇÃO DE ITENS (nao_encontrado → aguardando supervisor)
════════════════════════════════════════════════════════════ */
describe('GET /liberacao/pendentes', () => {
  test('sem auth → 401', async () => {
    const res = await request(app).get('/liberacao/pendentes');
    expect(res.status).toBe(401);
  });

  test('perfil não supervisor → 403', async () => {
    const agent = request.agent(app);
    await loginColaborador(agent);
    const res = await agent.get('/liberacao/pendentes');
    expect(res.status).toBe(403);
  });

  test('supervisor → 200 com array', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.all.mockResolvedValueOnce([{ id: 1, numero_pedido: '1', codigo: 'X', descricao: 'Item', quantidade: 1 }]);
    const res = await agent.get('/liberacao/pendentes?data_ini=2026-05-01&data_fim=2026-05-09');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('GET /liberacao/historico', () => {
  test('sem auth → 401', async () => {
    const res = await request(app).get('/liberacao/historico');
    expect(res.status).toBe(401);
  });

  test('perfil não supervisor → 403', async () => {
    const agent = request.agent(app);
    await loginColaborador(agent);
    const res = await agent.get('/liberacao/historico');
    expect(res.status).toBe(403);
  });

  test('supervisor → 200 com array (default [])', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.all.mockResolvedValueOnce(null);
    const res = await agent.get('/liberacao/historico');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════
   STATS — PERFORMANCE (metas x atingimento, com sessões de trabalho)
════════════════════════════════════════════════════════════ */
describe('GET /stats/performance', () => {
  test('sem auth → 401', async () => {
    const res = await request(app).get('/stats/performance');
    expect(res.status).toBe(401);
  });

  test('perfil não supervisor → 403', async () => {
    const agent = request.agent(app);
    await loginColaborador(agent);
    const res = await agent.get('/stats/performance');
    expect(res.status).toBe(403);
  });

  test('calcula meta proporcional e % de atingimento com configs customizadas', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);

    // Ordem das chamadas no handler: configs, sessoes, pedidos, faltas, checkouts, embalagens, reposicoes, todosAtivos, sepSemUsuario
    mockDb.all
      .mockResolvedValueOnce([{ chave: 'meta_separacao', valor: '100' }, { chave: 'horas_turno_manha', valor: '8' }]) // configs
      .mockResolvedValueOnce([{ usuario_id: 1, usuario_nome: 'Ana', perfil: 'separador', turno: 'Manha', minutos_total: 240, num_sessoes: 1 }]) // sessoes
      .mockResolvedValueOnce([{ uid: 1, nome: 'Ana', total: '30', itens: '150' }]) // pedidos
      .mockResolvedValueOnce([{ nome: 'Ana', total: '2' }]) // faltas
      .mockResolvedValueOnce([]) // checkouts
      .mockResolvedValueOnce([]) // embalagens
      .mockResolvedValueOnce([]) // reposicoes
      .mockResolvedValueOnce([{ id: 1, nome: 'Ana', perfil: 'separador', turno: 'Manha' }]) // todosAtivos
      .mockResolvedValueOnce([]); // sepSemUsuario

    const res = await agent.get('/stats/performance');
    expect(res.status).toBe(200);
    expect(res.body.metas).toEqual({ separador: 100, embalador: 120, checkout: 90, repositor: 90 });
    expect(res.body.horas_turno).toEqual({ Manha: 8, Tarde: 8, Noite: 6 });
    expect(res.body.resultado).toEqual([{
      usuario_id: 1, usuario_nome: 'Ana', perfil: 'separador', turno: 'Manha',
      horas: 4, minutos: 240, atividades: 30, detalhe: { itens: 150, faltas: 2 },
      meta_base: 100, meta_proporcional: 50, pct_atingimento: 60,
    }]);
    expect(res.body.resumo).toEqual({
      total_pedidos: 30, total_itens: 150, total_faltas: 2, total_checkouts: 0, total_embalagens: 0,
    });
  });

  test('usa metas e horas de turno padrão quando não há configurações salvas', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.all
      .mockResolvedValueOnce([]) // configs vazio
      .mockResolvedValueOnce([]) // sessoes
      .mockResolvedValueOnce([]) // pedidos
      .mockResolvedValueOnce([]) // faltas
      .mockResolvedValueOnce([]) // checkouts
      .mockResolvedValueOnce([]) // embalagens
      .mockResolvedValueOnce([]) // reposicoes
      .mockResolvedValueOnce([]) // todosAtivos
      .mockResolvedValueOnce([]); // sepSemUsuario

    const res = await agent.get('/stats/performance');
    expect(res.status).toBe(200);
    expect(res.body.metas).toEqual({ separador: 75, embalador: 120, checkout: 90, repositor: 90 });
    expect(res.body.horas_turno).toEqual({ Manha: 8, Tarde: 8, Noite: 6 });
    expect(res.body.resultado).toEqual([]);
    expect(res.body.resumo).toEqual({
      total_pedidos: 0, total_itens: 0, total_faltas: 0, total_checkouts: 0, total_embalagens: 0,
    });
  });
});

/* ════════════════════════════════════════════════════════════
   STATS — PERFORMANCE / DETALHE (pedido a pedido)
════════════════════════════════════════════════════════════ */
describe('GET /stats/performance/detalhe', () => {
  test('sem auth → 401', async () => {
    const res = await request(app).get('/stats/performance/detalhe');
    expect(res.status).toBe(401);
  });

  test('perfil não supervisor → 403', async () => {
    const agent = request.agent(app);
    await loginColaborador(agent);
    const res = await agent.get('/stats/performance/detalhe');
    expect(res.status).toBe(403);
  });

  test('sem filtro de perfil → calcula tempo_real/tempo_total/tempo_espera do separador', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);

    // Ordem: separador, checkout, embalador, repositor (roda todas quando !filtPerfil)
    mockDb.all
      .mockResolvedValueOnce([{
        separador_nome: 'Ana', numero_pedido: '123', data_pedido: '2026-05-09',
        iniciado_em: '2026-05-09T08:00', skus_concluido_em: '2026-05-09T08:10', concluido_em: '2026-05-09T08:15',
        qtd_produtos: 5, total_itens: 10, pontuacao: 20,
        tempo_real_min: '10.0', tempo_total_min: '15.0', qtd_reposicoes: 1,
        tempo_checkout_min: null, emb_horario: null, emb_operador: null,
      }])
      .mockResolvedValueOnce([]) // checkout
      .mockResolvedValueOnce([]) // embalador
      .mockResolvedValueOnce([]); // repositor

    const res = await agent.get('/stats/performance/detalhe');
    expect(res.status).toBe(200);
    expect(res.body.detalhe).toEqual([{
      nome: 'Ana', perfil: 'separador',
      pedidos: [{
        numero_pedido: '123', data_pedido: '2026-05-09',
        iniciado_em: '2026-05-09T08:00', concluido_em: '2026-05-09T08:15', skus_concluido_em: '2026-05-09T08:10',
        total_itens: 10, qtd_produtos: 5, pontuacao: 20,
        tempo_real_min: 10, tempo_total_min: 15, tempo_espera_min: 5, qtd_reposicoes: 1,
      }],
    }]);
  });

  test('filtPerfil=repositor → só roda a seção de reposição (tentativas novas e legado)', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);

    mockDb.all.mockResolvedValueOnce([
      {
        numero_pedido: '987', data_aviso: '2026-05-09', hora_aviso: '08:00', hora_reposto: '08:20',
        codigo: 'X1', descricao: 'Produto X', quantidade: 2, status: 'reposto', situacao: null, obs: '',
        repositor_nome: 'Rep1', total_tentativas: 1,
        tentativas: JSON.stringify([{ numero: 1, repositor: 'Rep1', hora_inicio: '08:05', hora_fim: '08:15', resultado: 'encontrado' }]),
      },
      {
        numero_pedido: '555', data_aviso: '2026-05-09', hora_aviso: '09:00', hora_reposto: '09:07',
        codigo: 'Y1', descricao: 'Produto Y', quantidade: 1, status: 'nao_encontrado', situacao: null, obs: null,
        repositor_nome: 'Rep2', total_tentativas: 0, tentativas: null,
      },
    ]);

    const res = await agent.get('/stats/performance/detalhe?perfil=repositor');
    expect(res.status).toBe(200);
    expect(mockDb.all).toHaveBeenCalledTimes(1); // só a query de reposição

    const porNome = Object.fromEntries(res.body.detalhe.map(d => [d.nome, d]));
    expect(porNome.Rep1.pedidos[0]).toEqual({
      numero_pedido: '987', data_pedido: '2026-05-09', hora_aviso: '08:00',
      hora_inicio_busca: '08:05', hora_fim_busca: '08:15', numero_tentativa: '1ª',
      resultado_tentativa: 'encontrado', codigo: 'X1', descricao: 'Produto X', quantidade: 2,
      status: 'reposto', obs: '', tempo_resolucao_min: 10,
    });
    expect(porNome.Rep2.pedidos[0]).toEqual({
      numero_pedido: '555', data_pedido: '2026-05-09', hora_aviso: '09:00',
      hora_inicio_busca: '09:00', hora_fim_busca: '09:07', numero_tentativa: '1ª',
      resultado_tentativa: 'nao_encontrado', codigo: 'Y1', descricao: 'Produto Y', quantidade: 1,
      status: 'nao_encontrado', obs: null, tempo_resolucao_min: 7,
    });
  });
});
