/**
 * WMS Miess — Testes Automatizados de routes/admin.js
 * Roda com: npm test -- tests/admin-routes.test.js
 */

const request = require('supertest');
const bcrypt  = require('bcrypt');

// Mock do banco para testes (mesmo shape de tests/api.test.js)
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
    id: 50, nome: 'Sep Teste', login: 'septeste', perfil: 'separador',
    senha_hash: HASH_SEP, subtipo_repositor: 'geral',
    perfis_acesso: '', turno: 'Manhã', status: 'ativo', senha_temporaria: false,
  });
  return agent.post('/auth/login').send({ login: 'septeste', senha: SENHA_SEP, perfil: 'separador' });
};

// Cliente de transação (pool.connect) com fila de resultados controlada por teste
const makeClient = (queryResults = []) => {
  const client = { query: jest.fn(), release: jest.fn() };
  queryResults.forEach(r => client.query.mockResolvedValueOnce(r));
  return client;
};

// Todas as rotas de routes/admin.js exigem supervisor (via requerAuth + requerPerfil)
const ALL_ADMIN_ROUTES = [
  { method: 'post', path: '/admin/zerar-sessoes' },
  { method: 'post', path: '/admin/zerar-dados' },
  { method: 'post', path: '/admin/sincronizar-forma-envio' },
  { method: 'post', path: '/admin/migration-tempo' },
  { method: 'post', path: '/admin/migration-tempo-justo' },
  { method: 'get',  path: '/auditoria' },
  { method: 'get',  path: '/relatorio/diario' },
  { method: 'get',  path: '/relatorio/lista' },
  { method: 'post', path: '/relatorio/gerar' },
  { method: 'get',  path: '/diario' },
  { method: 'get',  path: '/diario/anterior' },
  { method: 'get',  path: '/diario/dados/turno' },
  { method: 'get',  path: '/diario/existe' },
  { method: 'get',  path: '/diario/1' },
  { method: 'post', path: '/diario' },
  { method: 'post', path: '/diario/1/enviar' },
  { method: 'get',  path: '/diario/validacao/pendente' },
  { method: 'get',  path: '/diario/1/validacao' },
  { method: 'post', path: '/diario/validacao/1/validar' },
  { method: 'get',  path: '/relatorio/analitico' },
  { method: 'post', path: '/admin/zerar-dados-teste' },
  { method: 'post', path: '/admin/limpar-lotes-separador' },
];
// GET /auditoria sem auth → 401 já está coberto em tests/api.test.js (describe Auditoria)
const ROUTES_FOR_401 = ALL_ADMIN_ROUTES.filter(r => !(r.method === 'get' && r.path === '/auditoria'));

/* ════════════════════════════════════════════════════════════
   AUTORIZAÇÃO — todas as rotas de admin.js exigem supervisor
════════════════════════════════════════════════════════════ */
describe('Admin — Autorização', () => {
  let sepAgent;
  beforeAll(async () => {
    sepAgent = request.agent(app);
    await loginSeparador(sepAgent);
  });

  test.each(ROUTES_FOR_401)('$method $path sem auth → 401', async ({ method, path }) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });

  test.each(ALL_ADMIN_ROUTES)('$method $path como separador → 403', async ({ method, path }) => {
    const res = await sepAgent[method](path).send({});
    expect(res.status).toBe(403);
  });
});

/* ════════════════════════════════════════════════════════════
   ADMIN — MANUTENÇÃO / ZERAR DADOS
════════════════════════════════════════════════════════════ */
describe('Admin — Manutenção', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('POST /admin/zerar-sessoes → 200 com contagem removida', async () => {
    mockPool.query.mockResolvedValueOnce({ rowCount: 5 });
    const res = await agent.post('/admin/zerar-sessoes').send({});
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toBe('5 sessão(ões) removida(s).');
  });

  test('POST /admin/zerar-sessoes com data específica → usa a data enviada', async () => {
    mockPool.query.mockResolvedValueOnce({ rowCount: 0 });
    const res = await agent.post('/admin/zerar-sessoes').send({ data: '2026-01-01' });
    expect(res.status).toBe(200);
    expect(mockPool.query).toHaveBeenCalledWith('DELETE FROM sessoes_trabalho WHERE data=$1', ['2026-01-01']);
  });

  test('POST /admin/zerar-dados com confirmação correta → 200 e apaga as tabelas operacionais', async () => {
    const res = await agent.post('/admin/zerar-dados').send({ confirmar: 'ZERAR_TUDO_CONFIRMO' });
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toMatch(/apagados com sucesso/);
    const deletedTables = mockPool.query.mock.calls.map(c => c[0]).filter(sql => sql.startsWith('DELETE FROM'));
    expect(deletedTables.some(sql => sql.includes('pedidos'))).toBe(true);
    expect(deletedTables.some(sql => sql.includes('itens_pedido'))).toBe(true);
    expect(deletedTables.some(sql => sql.includes('checkout'))).toBe(true);
    expect(deletedTables.some(sql => sql.includes('avisos_repositor'))).toBe(true);
  });

  test('POST /admin/sincronizar-forma-envio → 200 com contagem de avisos atualizados', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] });
    const res = await agent.post('/admin/sincronizar-forma-envio').send({});
    expect(res.status).toBe(200);
    expect(res.body.atualizados).toBe(2);
    expect(res.body.mensagem).toMatch(/2 avisos atualizados/);
  });

  test('POST /admin/migration-tempo → 200', async () => {
    const res = await agent.post('/admin/migration-tempo').send({});
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toBe('Colunas criadas!');
  });

  test('POST /admin/migration-tempo-justo → 200', async () => {
    const res = await agent.post('/admin/migration-tempo-justo').send({});
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toBe('Colunas criadas!');
  });
});

/* ════════════════════════════════════════════════════════════
   AUDITORIA — paginação e filtros (além do já coberto em api.test.js)
════════════════════════════════════════════════════════════ */
describe('Admin — Auditoria (paginação e filtros)', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('GET /auditoria?page=2&pageSize=10 → pagina os resultados', async () => {
    mockDb.get.mockResolvedValueOnce({ total: '25' });
    mockDb.all.mockResolvedValueOnce([{ id: 1 }]);
    const res = await agent.get('/auditoria?page=2&pageSize=10');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(25);
    expect(res.body.pagina).toBe(2);
    expect(res.body.totalPaginas).toBe(3);
    expect(Array.isArray(res.body.dados)).toBe(true);
  });

  test('GET /auditoria com filtros de data/usuario/acao → 200', async () => {
    mockDb.all.mockResolvedValueOnce([]);
    const res = await agent.get('/auditoria?data_ini=2026-01-01&data_fim=2026-01-31&usuario=admin&acao=LOGIN');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════
   RELATÓRIOS DIÁRIOS
════════════════════════════════════════════════════════════ */
describe('Admin — Relatórios', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('GET /relatorio/diario retorna relatório já salvo do dia', async () => {
    mockDb.get.mockResolvedValueOnce({ data: '2026-05-09', total_pedidos: 10 });
    const res = await agent.get('/relatorio/diario');
    expect(res.status).toBe(200);
    expect(res.body.total_pedidos).toBe(10);
  });

  test('GET /relatorio/diario sem relatório salvo → gera um novo (gerarRelatorio)', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    mockDb.all
      .mockResolvedValueOnce([{ sep_nome: 'Ana', status: 'concluido', itens: 5 }]) // pedidos
      .mockResolvedValueOnce([]) // faltas
      .mockResolvedValueOnce([]) // checkouts
      .mockResolvedValueOnce([{ nome: 'Ana' }]); // separadores ativos
    const res = await agent.get('/relatorio/diario');
    expect(res.status).toBe(200);
    expect(res.body.total_pedidos).toBe(1);
    expect(res.body.separadores_ativos).toBe(1);
  });

  test('GET /relatorio/lista → 200 com array de relatórios', async () => {
    mockDb.all.mockResolvedValueOnce([{ id: 1, data: '2026-05-09' }]);
    const res = await agent.get('/relatorio/lista');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /relatorio/gerar → 200 com relatório recém-gerado', async () => {
    mockDb.all
      .mockResolvedValueOnce([]) // pedidos
      .mockResolvedValueOnce([]) // faltas
      .mockResolvedValueOnce([]) // checkouts
      .mockResolvedValueOnce([]); // separadores
    const res = await agent.post('/relatorio/gerar').send({ data: '2026-05-01' });
    expect(res.status).toBe(200);
    expect(res.body.data).toBe('2026-05-01');
  });
});

/* ════════════════════════════════════════════════════════════
   DIÁRIO DE BORDO
════════════════════════════════════════════════════════════ */
describe('Admin — Diário de Bordo', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('GET /diario → 200 com array', async () => {
    mockDb.all.mockResolvedValueOnce([{ id: 1, data: '2026-05-09', turno: 'Manha' }]);
    const res = await agent.get('/diario');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /diario/anterior turno Manha → busca dia anterior + turno Noite', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.get('/diario/anterior').query({ data: '2026-05-09', turno: 'Manha' });
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
    expect(mockDb.get).toHaveBeenCalledWith(expect.any(String), ['2026-05-08', 'Noite']);
  });

  test('GET /diario/anterior turno Tarde → retorna anterior com dados/observações parseados', async () => {
    mockDb.get.mockResolvedValueOnce({
      id: 1, data: '2026-05-08', turno: 'Manha',
      dados: JSON.stringify({ a: 1 }), observacoes: JSON.stringify({ geral: 'ok' }),
    });
    const res = await agent.get('/diario/anterior').query({ data: '2026-05-09', turno: 'Tarde' });
    expect(res.status).toBe(200);
    expect(res.body.dados).toEqual({ a: 1 });
    expect(res.body.observacoes).toEqual({ geral: 'ok' });
  });

  test('GET /diario/dados/turno → 200 com estrutura agregada por seção', async () => {
    mockDb.all
      .mockResolvedValueOnce([{ id: 1, status: 'concluido', itens: 5, sep_turno: 'Manha', status_embalagem: 'embalado' }]) // pedidos
      .mockResolvedValueOnce([]) // faltasRaw
      .mockResolvedValueOnce([]) // checkoutsRaw
      .mockResolvedValueOnce([]); // reposicoesRaw
    const res = await agent.get('/diario/dados/turno').query({ data: '2026-05-09', turno: 'Manha' });
    expect(res.status).toBe(200);
    expect(res.body.separacao.total).toBe(1);
    expect(res.body.separacao.concluidos).toBe(1);
    expect(res.body.embalagem.embalados).toBe(1);
  });

  test('GET /diario/existe sem data/turno → retorna null', async () => {
    const res = await agent.get('/diario/existe');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  test('GET /diario/existe com data/turno encontrados → retorna id', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 7 });
    const res = await agent.get('/diario/existe').query({ data: '2026-05-09', turno: 'Manha' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 7 });
  });

  test('GET /diario/:id não encontrado → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.get('/diario/999');
    expect(res.status).toBe(404);
  });

  test('GET /diario/:id encontrado → parseia campo dados (JSON)', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, dados: JSON.stringify({ x: 1 }) });
    const res = await agent.get('/diario/1');
    expect(res.status).toBe(200);
    expect(res.body.dados).toEqual({ x: 1 });
  });

  test('POST /diario sem data/turno → 400', async () => {
    const res = await agent.post('/diario').send({ dados: {} });
    expect(res.status).toBe(400);
  });

  test('POST /diario cria novo diário quando não existe', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 42 }] });
    const res = await agent.post('/diario').send({ data: '2026-05-09', turno: 'Manha', dados: {} });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mensagem: 'Diario criado!', id: 42 });
  });

  test('POST /diario atualiza diário existente (não enviado/validado)', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 5, supervisor: 'X', status: 'rascunho' });
    const res = await agent.post('/diario').send({ data: '2026-05-09', turno: 'Manha', dados: {} });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mensagem: 'Diario atualizado!', id: 5 });
  });

  test('POST /diario bloqueia edição de diário já enviado → 403', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 5, supervisor: 'X', status: 'enviado' });
    const res = await agent.post('/diario').send({ data: '2026-05-09', turno: 'Manha', dados: {} });
    expect(res.status).toBe(403);
  });

  test('POST /diario bloqueia edição de diário já validado → 403', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 5, supervisor: 'X', status: 'validado' });
    const res = await agent.post('/diario').send({ data: '2026-05-09', turno: 'Manha', dados: {} });
    expect(res.status).toBe(403);
  });
});

/* ════════════════════════════════════════════════════════════
   DIÁRIO — ENVIO E VALIDAÇÃO
════════════════════════════════════════════════════════════ */
describe('Admin — Diário: Envio e Validação', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('POST /diario/:id/enviar com id inválido → 400', async () => {
    const res = await agent.post('/diario/abc/enviar').send({});
    expect(res.status).toBe(400);
  });

  test('POST /diario/:id/enviar diário inexistente → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.post('/diario/1/enviar').send({});
    expect(res.status).toBe(404);
  });

  test('POST /diario/:id/enviar diário já enviado → 400', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, status: 'enviado' });
    const res = await agent.post('/diario/1/enviar').send({});
    expect(res.status).toBe(400);
  });

  test('POST /diario/:id/enviar → 200 com prazo de validação', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, status: 'rascunho', data: '2026-05-09', turno: 'Manha', supervisor: 'Sup' });
    const res = await agent.post('/diario/1/enviar').send({});
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toBe('Diário enviado para validação!');
    expect(res.body.prazo).toBeDefined();
  });

  test('GET /diario/validacao/pendente sem pendências → null', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.get('/diario/validacao/pendente');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  test('GET /diario/validacao/pendente com pendência → inclui checklist e prazo restante', async () => {
    const prazoFuturo = new Date(Date.now() + 60000).toISOString();
    mockDb.get.mockResolvedValueOnce({
      validacao_id: 1, prazo: prazoFuturo, val_status: 'pendente',
      diario_id: 2, data: '2026-05-09', turno: 'Manha', supervisor: 'Outro',
      dados: '{}', observacoes: '{}',
    });
    const res = await agent.get('/diario/validacao/pendente');
    expect(res.status).toBe(200);
    expect(res.body.checklist).toBeDefined();
    expect(res.body.atrasada).toBe(false);
  });

  test('GET /diario/:id/validacao com id inválido → 400', async () => {
    const res = await agent.get('/diario/abc/validacao');
    expect(res.status).toBe(400);
  });

  test('GET /diario/:id/validacao sem registro → null', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.get('/diario/1/validacao');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  test('GET /diario/:id/validacao encontrado → parseia itens (JSON)', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, itens: JSON.stringify([{ id: 'sep_ok' }]) });
    const res = await agent.get('/diario/1/validacao');
    expect(res.status).toBe(200);
    expect(res.body.itens).toEqual([{ id: 'sep_ok' }]);
  });

  test('POST /diario/validacao/:id/validar com id inválido → 400', async () => {
    const res = await agent.post('/diario/validacao/abc/validar').send({});
    expect(res.status).toBe(400);
  });

  test('POST /diario/validacao/:id/validar não encontrado → 404', async () => {
    const client = makeClient([
      {},              // BEGIN
      { rows: [] },    // SELECT ... FOR UPDATE
      {},              // ROLLBACK
    ]);
    mockPool.connect.mockResolvedValueOnce(client);
    const res = await agent.post('/diario/validacao/1/validar').send({ itens: [] });
    expect(res.status).toBe(404);
    expect(client.release).toHaveBeenCalled();
  });

  test('POST /diario/validacao/:id/validar já validado → 400 com pontuação anterior', async () => {
    const client = makeClient([
      {},                                                                          // BEGIN
      { rows: [{ id: 1, status: 'validado', pontuacao: 80, diario_id: 2 }] },      // SELECT ... FOR UPDATE
      {},                                                                          // ROLLBACK
    ]);
    mockPool.connect.mockResolvedValueOnce(client);
    const res = await agent.post('/diario/validacao/1/validar').send({ itens: [] });
    expect(res.status).toBe(400);
    expect(res.body.pontuacao).toBe(80);
  });

  test('POST /diario/validacao/:id/validar calcula pontuação a partir dos itens reprovados', async () => {
    const client = makeClient([
      {},                                                    // BEGIN
      { rows: [{ id: 1, status: 'pendente', diario_id: 2 }] }, // SELECT ... FOR UPDATE
      {},                                                    // UPDATE diario_validacoes
      {},                                                    // UPDATE diario_bordo
      {},                                                    // COMMIT
    ]);
    mockPool.connect.mockResolvedValueOnce(client);
    const res = await agent.post('/diario/validacao/1/validar').send({
      itens: [{ id: 'sep_ok', passou: false }, { id: 'emb_ok', passou: true }],
      obs_geral: 'ok',
    });
    expect(res.status).toBe(200);
    // peso de sep_ok = 20 → 100 - 20 = 80
    expect(res.body.pontuacao).toBe(80);
  });
});

/* ════════════════════════════════════════════════════════════
   RELATÓRIO ANALÍTICO
════════════════════════════════════════════════════════════ */
describe('Admin — Relatório Analítico', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('GET /relatorio/analitico sem dados no período → estrutura zerada', async () => {
    mockDb.all
      .mockResolvedValueOnce([]) // pedidos
      .mockResolvedValueOnce([]) // checkouts
      .mockResolvedValueOnce([]) // embalagens
      .mockResolvedValueOnce([]); // reposicoes
    const res = await agent.get('/relatorio/analitico');
    expect(res.status).toBe(200);
    expect(res.body.separacao.total).toBe(0);
    expect(res.body.sla.pct).toBeNull();
  });

  test('GET /relatorio/analitico filtra por turno e classifica complexidade por rua', async () => {
    mockDb.all
      .mockResolvedValueOnce([
        {
          id: 1, status: 'concluido', itens: 5, pontuacao: 90, hora_pedido: '08:00:00', data_pedido: '2026-05-09',
          iniciado_em: '2026-05-09T08:00:00', concluido_em: '2026-05-09T08:30:00', skus_concluido_em: '2026-05-09T08:25:00',
          transportadora: 'Correios', rua: 'A1', status_embalagem: 'embalado', sep_nome: 'Ana', sep_turno: 'Manha',
        },
        {
          id: 2, status: 'concluido', itens: 3, pontuacao: 70, hora_pedido: '14:00:00', data_pedido: '2026-05-09',
          iniciado_em: '2026-05-09T14:00:00', concluido_em: '2026-05-09T14:20:00', skus_concluido_em: '2026-05-09T14:15:00',
          transportadora: 'Jadlog', rua: 'ZA1', status_embalagem: 'pendente', sep_nome: 'Bia', sep_turno: 'Tarde',
        },
      ])
      .mockResolvedValueOnce([]) // checkouts
      .mockResolvedValueOnce([]) // embalagens
      .mockResolvedValueOnce([]); // reposicoes
    const res = await agent.get('/relatorio/analitico').query({ turno: 'Manha' });
    expect(res.status).toBe(200);
    expect(res.body.turno_filtro).toBe('Manha');
    expect(res.body.separacao.total).toBe(1);       // só o pedido do turno Manha
    expect(res.body.separacao.total_geral).toBe(2); // grand total inclui os dois turnos
    expect(res.body.complexidade.facil.pedidos).toBe(1); // rua A1 → fácil
    expect(res.body.ranking_turnos.find(t => t.turno === 'Manhã').pedidos).toBe(1);
  });
});

/* ════════════════════════════════════════════════════════════
   ZERAR DADOS DE TESTE (por data)
════════════════════════════════════════════════════════════ */
describe('Admin — Zerar Dados de Teste', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem confirmar → 400', async () => {
    const res = await agent.post('/admin/zerar-dados-teste').send({});
    expect(res.status).toBe(400);
  });

  test('com confirmação → apaga em cascata e retorna contagem por tabela', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] }) // SELECT ids de pedidos do dia
      .mockResolvedValueOnce({ rowCount: 3 }) // DELETE avisos_repositor (por pedido_id)
      .mockResolvedValueOnce({ rowCount: 2 }) // DELETE itens_pedido
      .mockResolvedValueOnce({ rowCount: 1 }) // DELETE checkout (por pedido_id)
      .mockResolvedValueOnce({ rowCount: 0 }) // DELETE embalagem (por pedido_id)
      .mockResolvedValueOnce({ rowCount: 2 }) // DELETE pedidos → resultados.pedidos
      .mockResolvedValueOnce({ rowCount: 1 }) // DELETE checkout (por data) → resultados.checkout
      .mockResolvedValueOnce({ rowCount: 0 }) // DELETE embalagem (por data) → resultados.embalagem
      .mockResolvedValueOnce({ rowCount: 0 }) // DELETE avisos_repositor (por data) → resultados.reposicao
      .mockResolvedValueOnce({ rowCount: 4 }); // DELETE sessoes_trabalho → resultados.sessoes
    const res = await agent.post('/admin/zerar-dados-teste').send({ confirmar: true, data: '2026-05-09' });
    expect(res.status).toBe(200);
    expect(res.body.removidos).toEqual({ pedidos: 2, checkout: 1, embalagem: 0, reposicao: 0, sessoes: 4 });
  });

  test('sem pedidos no dia → pula deletes dependentes de pedido_id', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })      // SELECT ids -> nenhum pedido
      .mockResolvedValueOnce({ rowCount: 0 })   // DELETE pedidos
      .mockResolvedValueOnce({ rowCount: 0 })   // DELETE checkout (por data)
      .mockResolvedValueOnce({ rowCount: 0 })   // DELETE embalagem (por data)
      .mockResolvedValueOnce({ rowCount: 0 })   // DELETE avisos (por data)
      .mockResolvedValueOnce({ rowCount: 0 });  // DELETE sessoes
    const res = await agent.post('/admin/zerar-dados-teste').send({ confirmar: true });
    expect(res.status).toBe(200);
    expect(res.body.removidos.pedidos).toBe(0);
  });
});

/* ════════════════════════════════════════════════════════════
   LIMPAR LOTES DE UM SEPARADOR
════════════════════════════════════════════════════════════ */
describe('Admin — Limpar Lotes de Separador', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem confirmar → 400', async () => {
    const res = await agent.post('/admin/limpar-lotes-separador').send({ nomes: ['Ana'] });
    expect(res.status).toBe(400);
  });

  test('sem nomes → 400', async () => {
    const res = await agent.post('/admin/limpar-lotes-separador').send({ confirmar: true });
    expect(res.status).toBe(400);
  });

  test('nenhum separador encontrado com os nomes informados → 200 removidos 0', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] }); // SELECT separadores
    const res = await agent.post('/admin/limpar-lotes-separador').send({ confirmar: true, nomes: ['Fulano'] });
    expect(res.status).toBe(200);
    expect(res.body.removidos).toBe(0);
  });

  test('separador encontrado mas sem pedidos de lote → 200 removidos 0', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, nome: 'Ana' }] }) // SELECT separadores
      .mockResolvedValueOnce({ rows: [] });                      // SELECT pedidos com lote_id
    const res = await agent.post('/admin/limpar-lotes-separador').send({ confirmar: true, nomes: ['Ana'] });
    expect(res.status).toBe(200);
    expect(res.body.removidos).toBe(0);
    expect(res.body.separadores).toEqual(['Ana']);
  });

  test('remove pedidos de lote e lotes órfãos associados → 200', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, nome: 'Ana' }] })                       // SELECT separadores
      .mockResolvedValueOnce({ rows: [{ id: 10, lote_id: 100 }, { id: 11, lote_id: 100 }] }) // SELECT pedidos com lote
      .mockResolvedValueOnce({}) // DELETE avisos_repositor
      .mockResolvedValueOnce({}) // DELETE itens_pedido
      .mockResolvedValueOnce({}) // DELETE checkout
      .mockResolvedValueOnce({}) // DELETE embalagem
      .mockResolvedValueOnce({ rowCount: 2 }) // DELETE pedidos
      .mockResolvedValueOnce({}); // DELETE lotes_separacao
    const res = await agent.post('/admin/limpar-lotes-separador').send({ confirmar: true, nomes: ['Ana'] });
    expect(res.status).toBe(200);
    expect(res.body.removidos).toBe(2);
    expect(res.body.lotes_removidos).toBe(1);
  });
});
