/**
 * WMS Miess — Testes de routes/pedidos.js
 * Cobre os endpoints não testados em tests/api.test.js (que só cobre GET /pedidos,
 * GET /pedidos?status= e POST /pedidos/importar lista vazia/como separador).
 * Roda com: npm test -- pedidos-routes
 */

const request = require('supertest');
const bcrypt  = require('bcrypt');

// Mock do banco para testes — mesmo shape de tests/api.test.js
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

// Helpers de login — mesmo padrão de tests/api.test.js
const loginSupervisor = (agent) => {
  mockDb.get.mockResolvedValueOnce({
    id: 1, nome: 'Supervisor Test', login: 'admin',
    perfil: 'supervisor', senha_hash: HASH_ADMIN,
    subtipo_repositor: 'geral', perfis_acesso: '', turno: 'Manhã', status: 'ativo',
    senha_temporaria: false,
  });
  return agent.post('/auth/login').send({ login: 'admin', senha: SENHA_ADMIN, perfil: 'supervisor' });
};

// separadorRow: quando informado, simula um vínculo separadores↔usuário já
// existente (req.session.separador fica com esse id) — necessário pra testar
// rotas que derivam a identidade do separador da sessão (ex: /pedidos/bipar).
const loginSeparador = async (separadorRow = null) => {
  mockDb.get.mockResolvedValueOnce({
    id: 2, nome: 'Sep', login: 'sep1', perfil: 'separador',
    senha_hash: HASH_SEP, subtipo_repositor: 'geral',
    perfis_acesso: '', turno: 'Manhã', status: 'ativo', senha_temporaria: false,
  });
  const sepAgent = request.agent(app);
  mockDb.get.mockResolvedValueOnce(separadorRow); // busca de separador vinculado no login (se houver)
  await sepAgent.post('/auth/login').send({ login: 'sep1', senha: SENHA_SEP, perfil: 'separador' });
  return sepAgent;
};

/* ════════════════════════════════════════════════════════════
   RITMO DE ESTIMATIVA
════════════════════════════════════════════════════════════ */
describe('Pedidos — ritmo de estimativa', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('GET /pedidos/ritmo-estimativa sem auth → 401', async () => {
    const res = await request(app).get('/pedidos/ritmo-estimativa');
    expect(res.status).toBe(401);
  });

  test('GET /pedidos/ritmo-estimativa → 200 com buckets', async () => {
    mockDb.all.mockResolvedValueOnce([
      { bucket: 'facil_baixa', amostras: '25', ritmo: '3.5' },
    ]);
    const res = await agent.get('/pedidos/ritmo-estimativa');
    expect(res.status).toBe(200);
    expect(res.body.buckets.facil_baixa.ritmo).toBe(3.5);
    expect(res.body.buckets.facil_baixa.amostras).toBe(25);
    expect(res.body.min_amostras).toBe(20);
  });

  test('GET /pedidos/ritmo-estimativa com poucas amostras → ritmo null', async () => {
    mockDb.all.mockResolvedValueOnce([
      { bucket: 'dificil_alta', amostras: '5', ritmo: '2.1' },
    ]);
    // Usa o endpoint de recalcular (não o GET normal): a rota GET guarda um
    // cache em memória de 30min entre requisições — o teste anterior já
    // "esquentou" esse cache, então um GET aqui devolveria o resultado
    // antigo em vez de reconsultar o mock. O POST /recalcular ignora esse
    // cache de propósito (é o mesmo botão "Recalcular" da tela de Pedidos).
    const res = await agent.post('/pedidos/ritmo-estimativa/recalcular');
    expect(res.status).toBe(200);
    expect(res.body.buckets.dificil_alta.ritmo).toBeNull();
  });

  test('POST /pedidos/ritmo-estimativa/recalcular sem auth → 401', async () => {
    const res = await request(app).post('/pedidos/ritmo-estimativa/recalcular');
    expect(res.status).toBe(401);
  });

  test('POST /pedidos/ritmo-estimativa/recalcular como separador → 403', async () => {
    const sepAgent = await loginSeparador();
    const res = await sepAgent.post('/pedidos/ritmo-estimativa/recalcular');
    expect(res.status).toBe(403);
  });

  test('POST /pedidos/ritmo-estimativa/recalcular como supervisor → 200', async () => {
    mockDb.all.mockResolvedValueOnce([]);
    const res = await agent.post('/pedidos/ritmo-estimativa/recalcular');
    expect(res.status).toBe(200);
    expect(res.body.calculado_em).toBeDefined();
  });
});

/* ════════════════════════════════════════════════════════════
   CRUD BÁSICO DE PEDIDOS
════════════════════════════════════════════════════════════ */
describe('Pedidos — CRUD básico', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('POST /pedidos sem auth → 401', async () => {
    const res = await request(app).post('/pedidos').send({ numero_pedido: '1' });
    expect(res.status).toBe(401);
  });

  test('POST /pedidos como separador → 403', async () => {
    const sepAgent = await loginSeparador();
    const res = await sepAgent.post('/pedidos').send({ numero_pedido: '1' });
    expect(res.status).toBe(403);
  });

  test('POST /pedidos → 200 com id criado', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 42 }] });
    const res = await agent.post('/pedidos').send({ numero_pedido: '999' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(42);
    expect(res.body.mensagem).toMatch(/criado/i);
  });

  test('POST /pedidos duplicado (unique violation) → 409', async () => {
    const err = new Error('duplicate key'); err.code = '23505';
    mockPool.query.mockRejectedValueOnce(err);
    const res = await agent.post('/pedidos').send({ numero_pedido: '999' });
    expect(res.status).toBe(409);
  });

  test('GET /pedidos/bloqueados sem auth → 401', async () => {
    const res = await request(app).get('/pedidos/bloqueados');
    expect(res.status).toBe(401);
  });

  test('GET /pedidos/bloqueados como separador → 403', async () => {
    const sepAgent = await loginSeparador();
    const res = await sepAgent.get('/pedidos/bloqueados');
    expect(res.status).toBe(403);
  });

  test('GET /pedidos/bloqueados → 200 com array', async () => {
    mockDb.all.mockResolvedValueOnce([
      { id: 1, numero_pedido: '1', status: 'separando', total_bloqueios: 2, codigos_bloqueados: 'A1, B2' },
    ]);
    const res = await agent.get('/pedidos/bloqueados');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].codigos_bloqueados).toBe('A1, B2');
  });

  test('GET /pedidos/info/:numero_pedido não encontrado → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.get('/pedidos/info/12345');
    expect(res.status).toBe(404);
  });

  test('GET /pedidos/info/:numero_pedido → 200 com dados', async () => {
    mockDb.get.mockResolvedValueOnce({ numero_pedido: '12345', cliente: 'Fulano', transportadora: 'Correios', numero_caixa: 'CX1' });
    const res = await agent.get('/pedidos/info/12345');
    expect(res.status).toBe(200);
    expect(res.body.cliente).toBe('Fulano');
  });
});

/* ════════════════════════════════════════════════════════════
   CAIXA (vincular / liberar)
════════════════════════════════════════════════════════════ */
describe('Pedidos — vincular/liberar caixa', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('PUT /pedidos/:id/caixa sem auth → 401', async () => {
    const res = await request(app).put('/pedidos/1/caixa').send({ numero_caixa: 'CX1' });
    expect(res.status).toBe(401);
  });

  test('PUT /pedidos/:id/caixa com ID inválido → 400', async () => {
    const res = await agent.put('/pedidos/abc/caixa').send({ numero_caixa: 'CX1' });
    expect(res.status).toBe(400);
  });

  test('PUT /pedidos/:id/caixa sem numero_caixa → 400', async () => {
    const res = await agent.put('/pedidos/1/caixa').send({});
    expect(res.status).toBe(400);
  });

  test('PUT /pedidos/:id/caixa já em uso por outro pedido → 409', async () => {
    mockDb.get.mockResolvedValueOnce({ numero_pedido: '555' }); // usadaPed
    const res = await agent.put('/pedidos/1/caixa').send({ numero_caixa: 'CX1' });
    expect(res.status).toBe(409);
    expect(res.body.erro).toMatch(/555/);
  });

  test('PUT /pedidos/:id/caixa aguardando checkout em outro pedido → 409', async () => {
    mockDb.get.mockResolvedValueOnce(null); // usadaPed livre
    mockDb.get.mockResolvedValueOnce({ numero_pedido: '777' }); // usadaCk
    const res = await agent.put('/pedidos/1/caixa').send({ numero_caixa: 'CX1' });
    expect(res.status).toBe(409);
    expect(res.body.erro).toMatch(/777/);
  });

  test('PUT /pedidos/:id/caixa → 200 vinculada', async () => {
    mockDb.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const res = await agent.put('/pedidos/1/caixa').send({ numero_caixa: 'CX1' });
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toMatch(/vinculada/i);
  });

  test('PUT /pedidos/:id/liberar-caixa sem auth → 401', async () => {
    const res = await request(app).put('/pedidos/1/liberar-caixa');
    expect(res.status).toBe(401);
  });

  test('PUT /pedidos/:id/liberar-caixa como separador → 403', async () => {
    const sepAgent = await loginSeparador();
    const res = await sepAgent.put('/pedidos/1/liberar-caixa');
    expect(res.status).toBe(403);
  });

  test('PUT /pedidos/:id/liberar-caixa → 200', async () => {
    const res = await agent.put('/pedidos/1/liberar-caixa');
    expect(res.status).toBe(200);
  });
});

/* ════════════════════════════════════════════════════════════
   BIPAR — claim atômico do pedido
════════════════════════════════════════════════════════════ */
describe('Pedidos — bipar', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('POST /pedidos/bipar sem auth → 401', async () => {
    const res = await request(app).post('/pedidos/bipar').send({ numero_pedido: '1' });
    expect(res.status).toBe(401);
  });

  test('POST /pedidos/bipar sem numero_pedido → 400', async () => {
    const res = await agent.post('/pedidos/bipar').send({});
    expect(res.status).toBe(400);
  });

  test('POST /pedidos/bipar pedido não encontrado → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.post('/pedidos/bipar').send({ numero_pedido: '123' });
    expect(res.status).toBe(404);
  });

  test('POST /pedidos/bipar pedido já concluído → 400', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, status: 'concluido' });
    const res = await agent.post('/pedidos/bipar').send({ numero_pedido: '123' });
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('concluido');
  });

  test('POST /pedidos/bipar disputado por outro operador → 409', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, status: 'pendente', separador_id: null });
    mockPool.query.mockResolvedValueOnce({ rows: [] }); // claim falhou (outro já pegou)
    const res = await agent.post('/pedidos/bipar').send({ numero_pedido: '123', separador_id: 5 });
    expect(res.status).toBe(409);
  });

  test('POST /pedidos/bipar → 200 atribuído', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, status: 'pendente', separador_id: null });
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, numero_caixa: '' }] });
    const res = await agent.post('/pedidos/bipar').send({ numero_pedido: '123', separador_id: 5 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('separando');
    expect(res.body.ja_atribuido).toBe(false);
  });

  test('POST /pedidos/bipar → já atribuído ao mesmo separador', async () => {
    // Identidade vem da sessão (não do corpo) desde a correção de segurança da
    // V0 — precisa logar como o próprio separador 5, não como supervisor.
    const sepAgent = await loginSeparador({ id: 5, nome: 'Sep', matricula: 'sep1', turno: 'Manhã', status: 'ativo' });
    mockDb.get.mockResolvedValueOnce({ id: 1, status: 'separando', separador_id: 5 });
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, numero_caixa: 'CX9' }] });
    const res = await sepAgent.post('/pedidos/bipar').send({ numero_pedido: '123' });
    expect(res.status).toBe(200);
    expect(res.body.ja_atribuido).toBe(true);
    expect(res.body.caixa_vinculada).toBe(true);
  });

  test('POST /pedidos/bipar → separador_id no corpo é ignorado (vem da sessão)', async () => {
    // Regressão da correção de segurança: um separador logado (id real 5) não
    // consegue mais atribuir o pedido a OUTRO separador (ex: 999) forjando o
    // corpo da requisição — o valor enviado é ignorado.
    const sepAgent = await loginSeparador({ id: 5, nome: 'Sep', matricula: 'sep1', turno: 'Manhã', status: 'ativo' });
    mockDb.get.mockResolvedValueOnce({ id: 1, status: 'pendente', separador_id: null });
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, numero_caixa: '' }] });
    const res = await sepAgent.post('/pedidos/bipar').send({ numero_pedido: '123', separador_id: 999 });
    expect(res.status).toBe(200);
    const chamada = mockPool.query.mock.calls.find(c => String(c[0]).includes('UPDATE pedidos'));
    expect(chamada[1][0]).toBe(5); // primeiro parâmetro da query = separador_id efetivo
  });
});

/* ════════════════════════════════════════════════════════════
   REORDENAR FILA (drag-and-drop do separador)
════════════════════════════════════════════════════════════ */
describe('Pedidos — reordenar fila', () => {
  test('PUT /pedidos/reordenar-fila sem auth → 401', async () => {
    const res = await request(app).put('/pedidos/reordenar-fila').send({ ids: [1, 2] });
    expect(res.status).toBe(401);
  });

  test('PUT /pedidos/reordenar-fila sem ids → 400', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    const res = await agent.put('/pedidos/reordenar-fila').send({ ids: [] });
    expect(res.status).toBe(400);
  });

  test('PUT /pedidos/reordenar-fila sem separador vinculado → 403', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent); // supervisor não tem req.session.separador
    const res = await agent.put('/pedidos/reordenar-fila').send({ ids: [1, 2] });
    expect(res.status).toBe(403);
  });
});

/* ════════════════════════════════════════════════════════════
   LOTE — itens, iniciar, buscar-caixa, concluir
════════════════════════════════════════════════════════════ */
describe('Pedidos — lote (itens/iniciar/buscar-caixa/concluir)', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('GET /pedidos/lote-itens sem pedido_ids → 400', async () => {
    const res = await agent.get('/pedidos/lote-itens');
    expect(res.status).toBe(400);
  });

  test('GET /pedidos/lote-itens → 200 com itens e pedidos', async () => {
    mockDb.all
      .mockResolvedValueOnce([{ id: 1, numero_pedido: '1', total_itens: 2 }, { id: 2, numero_pedido: '2', total_itens: 1 }])
      .mockResolvedValueOnce([
        { id: 10, pedido_id: 1, endereco: 'A1', numero_pedido: '1' },
        { id: 11, pedido_id: 2, endereco: 'B1', numero_pedido: '2' },
      ]);
    const res = await agent.get('/pedidos/lote-itens?pedido_ids=1,2');
    expect(res.status).toBe(200);
    expect(res.body.itens).toHaveLength(2);
    expect(res.body.itens[0].caixa_num).toBe(1); // pedido 1 é o primeiro da lista => caixa 1
    expect(res.body.itens[1].caixa_num).toBe(2);
    expect(res.body.pedidos).toHaveLength(2);
  });

  test('POST /pedidos/lote/iniciar sem pedido_ids → 400', async () => {
    const res = await agent.post('/pedidos/lote/iniciar').send({});
    expect(res.status).toBe(400);
  });

  test('POST /pedidos/lote/iniciar → 200', async () => {
    const res = await agent.post('/pedidos/lote/iniciar').send({ pedido_ids: [1, 2], caixas: [{ pedido_id: 1, caixa_lote: 'CX1' }] });
    expect(res.status).toBe(200);
    expect(res.body.iniciados).toBe(2);
  });

  test('GET /pedidos/buscar-caixa-lote sem numero → 400', async () => {
    const res = await agent.get('/pedidos/buscar-caixa-lote');
    expect(res.status).toBe(400);
  });

  test('GET /pedidos/buscar-caixa-lote não encontrado → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.get('/pedidos/buscar-caixa-lote?numero=CX1');
    expect(res.status).toBe(404);
  });

  test('GET /pedidos/buscar-caixa-lote → 200', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, numero_pedido: '1', caixa_lote: 'CX1', status: 'separando' });
    const res = await agent.get('/pedidos/buscar-caixa-lote?numero=CX1');
    expect(res.status).toBe(200);
    expect(res.body.numero_pedido).toBe('1');
  });

  test('POST /pedidos/lote/concluir sem pedido_ids → 400', async () => {
    const res = await agent.post('/pedidos/lote/concluir').send({});
    expect(res.status).toBe(400);
  });

  test('POST /pedidos/lote/concluir com item pendente → resultado ok:false', async () => {
    mockDb.all.mockResolvedValueOnce([{ id: 100 }]); // itens_pedido pendente
    const res = await agent.post('/pedidos/lote/concluir').send({ pedido_ids: [1] });
    expect(res.status).toBe(200);
    expect(res.body.resultados[0].ok).toBe(false);
    expect(res.body.resultados[0].erro).toMatch(/pendente/);
  });

  test('POST /pedidos/lote/concluir com aviso de repositor pendente → aguardando true', async () => {
    mockDb.all
      .mockResolvedValueOnce([]) // sem itens pendentes
      .mockResolvedValueOnce([{ id: 5 }]); // aviso pendente
    const res = await agent.post('/pedidos/lote/concluir').send({ pedido_ids: [1] });
    expect(res.status).toBe(200);
    expect(res.body.aguardando).toBe(true);
    expect(res.body.resultados[0].aguardando).toBe(true);
  });

  test('POST /pedidos/lote/concluir sucesso → conclui e cria checkout', async () => {
    mockDb.all
      .mockResolvedValueOnce([]) // sem itens pendentes
      .mockResolvedValueOnce([]); // sem avisos
    mockDb.get
      .mockResolvedValueOnce({ numero_pedido: '1', numero_caixa: '', caixa_lote: 'CX1', separador_id: 9 })
      .mockResolvedValueOnce({ nome: 'Sep' });
    mockPool.query.mockResolvedValueOnce({ rows: [] }); // UPDATE pedidos concluido
    mockPool.query.mockResolvedValueOnce({ rowCount: 0 }); // UPDATE checkout não achou nada
    mockPool.query.mockResolvedValueOnce({ rows: [] }); // INSERT checkout
    const res = await agent.post('/pedidos/lote/concluir').send({ pedido_ids: [1] });
    expect(res.status).toBe(200);
    expect(res.body.resultados[0].ok).toBe(true);
    expect(res.body.mensagem).toMatch(/concluido/i);
  });
});

/* ════════════════════════════════════════════════════════════
   ITENS DO PEDIDO E VERIFICAÇÃO
════════════════════════════════════════════════════════════ */
describe('Pedidos — itens e verificação', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('GET /pedidos/:id/itens sem auth → 401', async () => {
    const res = await request(app).get('/pedidos/1/itens');
    expect(res.status).toBe(401);
  });

  test('GET /pedidos/:id/itens → 200 array', async () => {
    mockDb.all.mockResolvedValueOnce([{ id: 1, codigo: 'A1', aviso_status: '' }]);
    const res = await agent.get('/pedidos/1/itens');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('PUT /itens/:id/verificar item não encontrado → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.put('/itens/1/verificar').send({ status: 'ok' });
    expect(res.status).toBe(404);
  });

  test('PUT /itens/:id/verificar status ok → sem aviso', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, pedido_id: 10, numero_pedido: '10', quantidade: 2, codigo: 'A1', descricao: 'X', endereco: 'A1' });
    mockDb.get.mockResolvedValueOnce({ cnt: 1 }); // ainda há pendentes
    const res = await agent.put('/itens/1/verificar').send({ status: 'ok' });
    expect(res.status).toBe(200);
    expect(res.body.aviso).toBe(false);
  });

  test('PUT /itens/:id/verificar status falta → cria aviso de repositor', async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: 1, pedido_id: 10, numero_pedido: '10', quantidade: 3, codigo: 'A1', descricao: 'X', endereco: 'A1' })
      .mockResolvedValueOnce({ cnt: 0 }) // sem itens pendentes -> grava skus_concluido_em
      .mockResolvedValueOnce({ transportadora: 'Correios' })
      .mockResolvedValueOnce(null) // sem aviso existente
      .mockResolvedValueOnce({ aguardando_repositor_desde: null });
    const res = await agent.put('/itens/1/verificar').send({ status: 'falta' });
    expect(res.status).toBe(200);
    expect(res.body.aviso).toBe(true);
    expect(res.body.mensagem).toMatch(/avisado/i);
  });

  test('PUT /itens/:id/verificar status parcial usa obs enviado e qtd_falta', async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: 1, pedido_id: 10, numero_pedido: '10', quantidade: 5, codigo: 'A1', descricao: 'X', endereco: 'A1' })
      .mockResolvedValueOnce({ cnt: 0 })
      .mockResolvedValueOnce({ transportadora: '' })
      .mockResolvedValueOnce({ id: 99 }) // já existe aviso pendente -> UPDATE em vez de INSERT
      .mockResolvedValueOnce({ aguardando_repositor_desde: '2026-05-09T09:00:00' });
    const res = await agent.put('/itens/1/verificar').send({ status: 'parcial', qtd_falta: 2, obs: 'faltou 2' });
    expect(res.status).toBe(200);
    expect(res.body.aviso).toBe(true);
    // Verifica que usou o fluxo de UPDATE (aviso já existente) e não INSERT
    const updateCall = mockPool.query.mock.calls.find(c => String(c[0]).includes('UPDATE avisos_repositor'));
    expect(updateCall).toBeDefined();
  });
});

/* ════════════════════════════════════════════════════════════
   CONCLUIR / CONCLUIR-COM-FALTA / REDEFINIR
════════════════════════════════════════════════════════════ */
describe('Pedidos — concluir / concluir-com-falta / redefinir', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('PUT /pedidos/:id/concluir já concluído → mensagem sem reprocessar', async () => {
    mockDb.get.mockResolvedValueOnce({ status: 'concluido' });
    const res = await agent.put('/pedidos/1/concluir');
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toMatch(/já concluído/i);
  });

  test('PUT /pedidos/:id/concluir com itens pendentes → 400', async () => {
    mockDb.get.mockResolvedValueOnce({ status: 'separando' });
    mockDb.all.mockResolvedValueOnce([{ id: 1 }]); // item pendente
    const res = await agent.put('/pedidos/1/concluir');
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/1 item/);
  });

  test('PUT /pedidos/:id/concluir com aviso pendente de repositor → aguardando', async () => {
    mockDb.get.mockResolvedValueOnce({ status: 'separando' });
    mockDb.all.mockResolvedValueOnce([]); // sem itens pendentes
    mockDb.all.mockResolvedValueOnce([{ id: 5 }]); // aviso pendente
    const res = await agent.put('/pedidos/1/concluir');
    expect(res.status).toBe(200);
    expect(res.body.aguardando).toBe(true);
  });

  test('PUT /pedidos/:id/concluir sucesso → cria checkout e emite evento', async () => {
    mockDb.get.mockResolvedValueOnce({ status: 'separando' });
    mockDb.all.mockResolvedValueOnce([]); // sem itens pendentes
    mockDb.all.mockResolvedValueOnce([]); // sem avisos
    mockDb.get.mockResolvedValueOnce({ numero_pedido: '1', numero_caixa: 'CX1', separador_id: 9 });
    mockDb.get.mockResolvedValueOnce({ nome: 'Sep' });
    mockPool.query.mockResolvedValueOnce({ rows: [] }); // UPDATE concluido
    mockPool.query.mockResolvedValueOnce({ rowCount: 0 }); // UPDATE checkout não achou
    mockPool.query.mockResolvedValueOnce({ rows: [] }); // INSERT checkout
    const res = await agent.put('/pedidos/1/concluir');
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toMatch(/concluido/i);
  });

  test('PUT /pedidos/:id/concluir-com-falta com itens pendentes → 400', async () => {
    mockDb.all.mockResolvedValueOnce([{ id: 1 }]);
    const res = await agent.put('/pedidos/1/concluir-com-falta');
    expect(res.status).toBe(400);
  });

  test('PUT /pedidos/:id/concluir-com-falta sem avisos de falta → 400', async () => {
    mockDb.all.mockResolvedValueOnce([]); // sem pendentes
    mockDb.all.mockResolvedValueOnce([]); // sem avisos
    const res = await agent.put('/pedidos/1/concluir-com-falta');
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/Nenhum item com falta/);
  });

  test('PUT /pedidos/:id/concluir-com-falta sucesso → conclui com itens_falta', async () => {
    mockDb.all.mockResolvedValueOnce([]); // sem pendentes
    mockDb.all.mockResolvedValueOnce([{ codigo: 'A1', descricao: 'X', quantidade: 2 }]); // aviso
    mockDb.get.mockResolvedValueOnce({ numero_pedido: '1', numero_caixa: 'CX1', separador_id: 9 });
    mockDb.get.mockResolvedValueOnce({ nome: 'Sep' });
    mockPool.query.mockResolvedValueOnce({ rows: [] }); // UPDATE concluido
    mockPool.query.mockResolvedValueOnce({ rowCount: 0 }); // UPDATE checkout não achou
    mockPool.query.mockResolvedValueOnce({ rows: [] }); // INSERT checkout
    const res = await agent.put('/pedidos/1/concluir-com-falta');
    expect(res.status).toBe(200);
    expect(res.body.itens_falta).toBe(1);
  });

  test('PUT /pedidos/:id/redefinir sem auth → 401', async () => {
    const res = await request(app).put('/pedidos/1/redefinir');
    expect(res.status).toBe(401);
  });

  test('PUT /pedidos/:id/redefinir como separador → 403', async () => {
    const sepAgent = await loginSeparador();
    const res = await sepAgent.put('/pedidos/1/redefinir');
    expect(res.status).toBe(403);
  });

  test('PUT /pedidos/:id/redefinir como supervisor → 200', async () => {
    const res = await agent.put('/pedidos/1/redefinir');
    expect(res.status).toBe(200);
  });
});

/* ════════════════════════════════════════════════════════════
   EMBALAGEM (reenviar / desbloquear) / SEPARADOR
════════════════════════════════════════════════════════════ */
describe('Pedidos — embalagem e atribuição de separador', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('PUT /pedidos/embalagem/reenviar sem numero_pedido → 400', async () => {
    const res = await agent.put('/pedidos/embalagem/reenviar').send({});
    expect(res.status).toBe(400);
  });

  test('PUT /pedidos/embalagem/reenviar pedido não encontrado → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.put('/pedidos/embalagem/reenviar').send({ numero_pedido: '1' });
    expect(res.status).toBe(404);
  });

  test('PUT /pedidos/embalagem/reenviar já embalado → 400', async () => {
    mockDb.get.mockResolvedValueOnce({ status_embalagem: 'embalado' });
    const res = await agent.put('/pedidos/embalagem/reenviar').send({ numero_pedido: '1' });
    expect(res.status).toBe(400);
  });

  test('PUT /pedidos/embalagem/reenviar → 200', async () => {
    mockDb.get.mockResolvedValueOnce({ status_embalagem: 'pendente' });
    const res = await agent.put('/pedidos/embalagem/reenviar').send({ numero_pedido: '1' });
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toMatch(/1/);
  });

  test('PUT /pedidos/:id/desbloquear sem auth → 401', async () => {
    const res = await request(app).put('/pedidos/1/desbloquear');
    expect(res.status).toBe(401);
  });

  test('PUT /pedidos/:id/desbloquear cria checkout quando não existe → 200', async () => {
    mockDb.get.mockResolvedValueOnce({ numero_pedido: '1', numero_caixa: 'CX1', separador_id: 9 });
    mockDb.get.mockResolvedValueOnce({ nome: 'Sep' });
    mockDb.get.mockResolvedValueOnce(null); // ckExist
    const res = await agent.put('/pedidos/1/desbloquear');
    expect(res.status).toBe(200);
    const insertCall = mockPool.query.mock.calls.find(c => String(c[0]).includes('INSERT INTO checkout'));
    expect(insertCall).toBeDefined();
  });

  test('PUT /pedidos/:id/separador → 200 atribuído', async () => {
    const res = await agent.put('/pedidos/1/separador').send({ separador_id: 3 });
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toMatch(/atribuido/i);
  });
});

/* ════════════════════════════════════════════════════════════
   DELETE
════════════════════════════════════════════════════════════ */
describe('Pedidos — exclusão', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('DELETE /pedidos/:id sem auth → 401', async () => {
    const res = await request(app).delete('/pedidos/1');
    expect(res.status).toBe(401);
  });

  test('DELETE /pedidos/:id como separador → 403', async () => {
    const sepAgent = await loginSeparador();
    const res = await sepAgent.delete('/pedidos/1');
    expect(res.status).toBe(403);
  });

  test('DELETE /pedidos/:id com ID inválido → 400', async () => {
    const res = await agent.delete('/pedidos/abc');
    expect(res.status).toBe(400);
  });

  test('DELETE /pedidos/:id → 200 excluido', async () => {
    const res = await agent.delete('/pedidos/1');
    expect(res.status).toBe(200);
  });

  test('DELETE /pedidos sem data nem status → 400', async () => {
    const res = await agent.delete('/pedidos');
    expect(res.status).toBe(400);
  });

  test('DELETE /pedidos?status=cancelado → 200 com contagem', async () => {
    mockPool.query.mockResolvedValueOnce({ rowCount: 0 }); // avisos
    mockPool.query.mockResolvedValueOnce({ rowCount: 0 }); // checkout
    mockPool.query.mockResolvedValueOnce({ rowCount: 0 }); // itens
    mockPool.query.mockResolvedValueOnce({ rowCount: 3 }); // DELETE pedidos
    const res = await agent.delete('/pedidos?status=cancelado');
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toMatch(/3 pedidos/);
  });

  test('GET /pedidos/vazios → 200', async () => {
    mockDb.all.mockResolvedValueOnce([{ id: 1, numero_pedido: '1' }]);
    const res = await agent.get('/pedidos/vazios');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });

  test('DELETE /pedidos/vazios → 200', async () => {
    mockPool.query.mockResolvedValueOnce({ rowCount: 0 }); // avisos
    mockPool.query.mockResolvedValueOnce({ rowCount: 0 }); // checkout
    mockPool.query.mockResolvedValueOnce({ rowCount: 4 }); // DELETE pedidos
    const res = await agent.delete('/pedidos/vazios');
    expect(res.status).toBe(200);
    expect(res.body.excluidos).toBe(4);
  });
});

/* ════════════════════════════════════════════════════════════
   IMPORTAÇÃO — caminho feliz (vazio/separador já cobertos em api.test.js)
════════════════════════════════════════════════════════════ */
describe('Pedidos — importação', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('POST /pedidos/importar com itens reais → importa e insere itens_pedido', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 55, inserido: true }] }); // INSERT pedidos
    mockPool.query.mockResolvedValueOnce({ rows: [] }); // SELECT 1 FROM itens_pedido (nenhum ainda)
    const clientMock = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
    mockPool.connect.mockResolvedValueOnce(clientMock);
    const res = await agent.post('/pedidos/importar').send({
      pedidos: [{ numero_pedido: '1001', codigo: 'A1', descricao: 'Produto', endereco: 'A1', quantidade: 2 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.importados).toBe(1);
    expect(res.body.erros).toBe(0);
    expect(clientMock.query).toHaveBeenCalledWith('BEGIN');
    expect(clientMock.query).toHaveBeenCalledWith('COMMIT');
  });

  test('POST /pedidos/importar quando INSERT retorna vazio (ON CONFLICT sem match) → ignorado', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    const res = await agent.post('/pedidos/importar').send({
      pedidos: [{ numero_pedido: '1002', codigo: 'A1', quantidade: 1 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.ignorados).toBe(1);
    expect(res.body.importados).toBe(0);
  });

  test('POST /importar (alias) redireciona 307 para /pedidos/importar', async () => {
    const res = await agent.post('/importar').send({ pedidos: [] }).redirects(0);
    expect(res.status).toBe(307);
    expect(res.headers.location).toBe('/pedidos/importar');
  });
});

/* ════════════════════════════════════════════════════════════
   DISTRIBUIÇÃO AUTOMÁTICA — lógica de negócio central
════════════════════════════════════════════════════════════ */
describe('Pedidos — distribuição automática', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('POST /pedidos/distribuicao sem auth → 401', async () => {
    const res = await request(app).post('/pedidos/distribuicao').send({ separadores: [1] });
    expect(res.status).toBe(401);
  });

  test('POST /pedidos/distribuicao como separador → 403', async () => {
    const sepAgent = await loginSeparador();
    const res = await sepAgent.post('/pedidos/distribuicao').send({ separadores: [1] });
    expect(res.status).toBe(403);
  });

  test('POST /pedidos/distribuicao sem separadores → 400', async () => {
    const res = await agent.post('/pedidos/distribuicao').send({});
    expect(res.status).toBe(400);
  });

  test('POST /pedidos/distribuicao sem pedidos pendentes → plano vazio', async () => {
    mockDb.all.mockImplementation(async (sql) => {
      if (sql.includes('FROM pedidos p WHERE')) return [];
      return [];
    });
    const res = await agent.post('/pedidos/distribuicao').send({ separadores: [1] });
    expect(res.status).toBe(200);
    expect(res.body.plano).toEqual([]);
    expect(res.body.total_pedidos).toBe(0);
  });

  test('POST /pedidos/distribuicao balanceia entre 2 separadores (LPT) e prioriza Drive Thru', async () => {
    const pedidosFixture = [
      { id: 1, numero_pedido: '100', itens: 5, transportadora: '', tem_prime: false },
      { id: 2, numero_pedido: '200', itens: 3, transportadora: 'DRIVE THRU', tem_prime: false },
    ];
    const itensPorPedido = {
      1: [{ endereco: 'A1', quantidade: 5, codigo: 'A1' }],
      2: [{ endereco: 'A1', quantidade: 3, codigo: 'B1' }],
    };
    mockDb.all.mockImplementation(async (sql, params) => {
      if (sql.includes('itens_pedido WHERE pedido_id=$1')) return itensPorPedido[params[0]] || [];
      if (sql.includes('FROM pedidos p WHERE')) return pedidosFixture;
      return [];
    });
    mockDb.get.mockImplementation(async () => null); // sem separador/usuario vinculado -> usa fallback de nome
    const res = await agent.post('/pedidos/distribuicao').send({ separadores: [11, 22] });
    expect(res.status).toBe(200);
    expect(res.body.total_pedidos).toBe(2);
    expect(res.body.total_distribuidos).toBe(2);
    expect(res.body.plano).toHaveLength(2);
    const todosPedidos = res.body.plano.flatMap(f => f.pedidos);
    expect(todosPedidos.sort()).toEqual(['100', '200']);
    // Cada separador recebeu exatamente 1 pedido (LPT com cargas iguais e mesma pontuação)
    expect(res.body.plano.every(f => f.pedidos.length === 1)).toBe(true);
  });

  test('POST /pedidos/distribuicao cenario "por_itens" atribui pelo menor total de itens', async () => {
    const pedidosFixture = [
      { id: 1, numero_pedido: 'A', itens: 10, transportadora: '', tem_prime: false },
      { id: 2, numero_pedido: 'B', itens: 2, transportadora: '', tem_prime: false },
    ];
    mockDb.all.mockImplementation(async (sql, params) => {
      if (sql.includes('itens_pedido WHERE pedido_id=$1')) return [{ endereco: 'A1', quantidade: 1, codigo: 'X' }];
      if (sql.includes('FROM pedidos p WHERE')) return pedidosFixture;
      return [];
    });
    mockDb.get.mockImplementation(async () => null);
    const res = await agent.post('/pedidos/distribuicao').send({ separadores: [11], cenario: 'por_itens' });
    expect(res.status).toBe(200);
    expect(res.body.cenario).toBe('por_itens');
  });

  test('POST /pedidos/distribuicao com apenas_prime=true filtra pedidos Prime na query', async () => {
    mockDb.all.mockResolvedValue([]);
    await agent.post('/pedidos/distribuicao').send({ separadores: [1], apenas_prime: true });
    const pedidosQueryCall = mockDb.all.mock.calls.find(c => c[0].includes('FROM pedidos p WHERE'));
    expect(pedidosQueryCall[0]).toContain('p.tem_prime=true');
  });

  test('POST /pedidos/distribuicao normaliza turno_filtro "Manha" para incluir variante "Manhã"', async () => {
    mockDb.all.mockResolvedValue([]);
    await agent.post('/pedidos/distribuicao').send({ separadores: [1], turno_filtro: 'Manha' });
    const pedidosQueryCall = mockDb.all.mock.calls.find(c => c[0].includes('FROM pedidos p WHERE'));
    expect(pedidosQueryCall[0]).toContain("'Manha'");
    expect(pedidosQueryCall[0]).toContain("'Manhã'");
  });
});

/* ════════════════════════════════════════════════════════════
   DISTRIBUIÇÃO ENTRE TURNOS
════════════════════════════════════════════════════════════ */
describe('Pedidos — distribuição entre turnos', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('POST /pedidos/distribuicao-turnos sem turnos → 400', async () => {
    const res = await agent.post('/pedidos/distribuicao-turnos').send({});
    expect(res.status).toBe(400);
  });

  test('POST /pedidos/distribuicao-turnos com turno sem separadores → 400', async () => {
    const res = await agent.post('/pedidos/distribuicao-turnos').send({ turnos: [{ nome: 'Manhã', separadores: 0 }] });
    expect(res.status).toBe(400);
  });

  test('POST /pedidos/distribuicao-turnos sem pedidos → plano vazio', async () => {
    mockDb.all.mockResolvedValueOnce([]);
    const res = await agent.post('/pedidos/distribuicao-turnos').send({ turnos: [{ nome: 'Manhã', separadores: 2 }] });
    expect(res.status).toBe(200);
    expect(res.body.plano).toEqual([]);
  });

  test('POST /pedidos/distribuicao-turnos distribui proporcionalmente ao nº de separadores por turno', async () => {
    const pedidosFixture = Array.from({ length: 4 }, (_, i) => ({
      id: i + 1, numero_pedido: String(i + 1), itens: 1, transportadora: '', tem_prime: false,
    }));
    mockDb.all.mockImplementation(async (sql, params) => {
      if (sql.includes('itens_pedido WHERE pedido_id=$1')) return [{ endereco: 'A1', quantidade: 1, codigo: 'X' }];
      if (sql.includes('FROM pedidos p WHERE')) return pedidosFixture;
      return [];
    });
    const res = await agent.post('/pedidos/distribuicao-turnos').send({
      turnos: [{ nome: 'Manhã', separadores: 3 }, { nome: 'Tarde', separadores: 1 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.total_pedidos).toBe(4);
    expect(res.body.total_distribuidos).toBe(4);
    const manha = res.body.plano.find(p => p.nome === 'Manhã');
    const tarde = res.body.plano.find(p => p.nome === 'Tarde');
    // Turno com mais separadores deve ficar com carga por-separador menor ou igual (mais pedidos no total)
    expect(manha.pedidos_count + tarde.pedidos_count).toBe(4);
    expect(manha.pedidos_count).toBeGreaterThanOrEqual(tarde.pedidos_count);
  });
});

/* ════════════════════════════════════════════════════════════
   CONFIRMAR DISTRIBUIÇÃO
════════════════════════════════════════════════════════════ */
describe('Pedidos — confirmar distribuição', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('POST /pedidos/distribuicao/confirmar sem plano → 400', async () => {
    const res = await agent.post('/pedidos/distribuicao/confirmar').send({});
    expect(res.status).toBe(400);
  });

  test('POST /pedidos/distribuicao/confirmar → grava separador via usuario_id', async () => {
    mockDb.get.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM separadores WHERE usuario_id=$1')) return { id: 77 };
      return null;
    });
    mockPool.query.mockResolvedValue({ rowCount: 1 });
    const res = await agent.post('/pedidos/distribuicao/confirmar').send({
      plano: [{ separador_id: 5, pedidos: ['100', '200'] }],
    });
    expect(res.status).toBe(200);
    expect(res.body.distribuidos).toBe(2);
  });

  test('POST /pedidos/distribuicao-turnos/confirmar sem plano → 400', async () => {
    const res = await agent.post('/pedidos/distribuicao-turnos/confirmar').send({});
    expect(res.status).toBe(400);
  });

  test('POST /pedidos/distribuicao-turnos/confirmar → marca turno_distribuicao', async () => {
    mockPool.query.mockResolvedValue({ rowCount: 1 });
    const res = await agent.post('/pedidos/distribuicao-turnos/confirmar').send({
      plano: [{ nome: 'Manhã', pedidos: ['1', '2'] }],
    });
    expect(res.status).toBe(200);
    expect(res.body.marcados).toBe(2);
  });
});

/* ════════════════════════════════════════════════════════════
   FORMAÇÃO DE LOTES
════════════════════════════════════════════════════════════ */
describe('Pedidos — formação de lotes', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('POST /pedidos/lote/formar sem auth → 401', async () => {
    const res = await request(app).post('/pedidos/lote/formar').send({ separadores: [1] });
    expect(res.status).toBe(401);
  });

  test('POST /pedidos/lote/formar sem separadores → 400', async () => {
    const res = await agent.post('/pedidos/lote/formar').send({});
    expect(res.status).toBe(400);
  });

  test('POST /pedidos/lote/formar agrupa pedidos elegíveis (exclui Drive Thru) em um único lote', async () => {
    const pedidosFixture = [
      { id: 1, numero_pedido: '1', transportadora: '', cliente: 'C1' },
      { id: 2, numero_pedido: '2', transportadora: '', cliente: 'C2' },
      { id: 3, numero_pedido: '3', transportadora: 'DRIVE THRU', cliente: 'C3' },
    ];
    mockDb.all.mockImplementation(async (sql, params) => {
      if (sql.includes('itens_pedido WHERE pedido_id=$1')) {
        return [{ endereco: 'A1', quantidade: 1, codigo: 'X' + params[0] }];
      }
      if (sql.includes('FROM pedidos p WHERE')) return pedidosFixture;
      return [];
    });
    mockDb.get.mockImplementation(async () => null);
    const res = await agent.post('/pedidos/lote/formar').send({ separadores: [11] });
    expect(res.status).toBe(200);
    expect(res.body.total_disponivel).toBe(2); // Drive Thru excluído
    expect(res.body.drive_thru_excluidos).toBe(1);
    expect(res.body.lotes).toHaveLength(1);
    expect(res.body.lotes[0].pedidos).toHaveLength(2);
    expect(res.body.lotes[0].separador_id).toBe(11);
    // V6 — rota (ordem real de caminhada) e distância ponderada calculadas pro lote
    expect(res.body.lotes[0].rota).toEqual(['A']);
    expect(res.body.lotes[0].distancia_ponderada).toBe(0); // uma única rua, sem par pra comparar
  });

  test('POST /pedidos/lote/formar → rota segue ROTA_FISICA_LOTE, não ordem alfabética', async () => {
    // ROTA_FISICA_LOTE = [...,'Q','P',...] — na caminhada real, Q vem ANTES de P,
    // mesmo P vindo antes de Q em ordem alfabética. Prova que `rota` (novo campo,
    // V6) não é só uma cópia de `ruas` (alfabética, já existia).
    const pedidosFixture = [
      { id: 1, numero_pedido: '1', transportadora: '', cliente: 'C1' },
      { id: 2, numero_pedido: '2', transportadora: '', cliente: 'C2' },
    ];
    mockDb.all.mockImplementation(async (sql, params) => {
      if (sql.includes('itens_pedido WHERE pedido_id=$1')) {
        return params[0] === 1 ? [{ endereco: 'P1', quantidade: 1, codigo: 'X1' }] : [{ endereco: 'Q1', quantidade: 1, codigo: 'X2' }];
      }
      if (sql.includes('FROM pedidos p WHERE')) return pedidosFixture;
      return [];
    });
    mockDb.get.mockImplementation(async () => null);
    const res = await agent.post('/pedidos/lote/formar').send({ separadores: [11] });
    expect(res.body.lotes[0].ruas).toEqual(['P', 'Q']); // alfabética: P antes de Q
    expect(res.body.lotes[0].rota).toEqual(['Q', 'P']); // rota física real: Q antes de P
    expect(res.body.lotes[0].distancia_ponderada).toBeGreaterThan(0);
  });

  test('POST /pedidos/lote/formar com apenas_prime=true filtra pedidos Prime na query', async () => {
    mockDb.all.mockResolvedValue([]);
    await agent.post('/pedidos/lote/formar').send({ separadores: [11], apenas_prime: true });
    const pedidosQueryCall = mockDb.all.mock.calls.find(c => c[0].includes('FROM pedidos p WHERE'));
    expect(pedidosQueryCall[0]).toContain('p.tem_prime=true');
  });

  test('POST /pedidos/lote/formar/confirmar sem lotes → 400', async () => {
    const res = await agent.post('/pedidos/lote/formar/confirmar').send({});
    expect(res.status).toBe(400);
  });

  test('POST /pedidos/lote/formar/confirmar → grava lotes_separacao e atualiza pedidos', async () => {
    const clientMock = {
      query: jest.fn().mockImplementation(async (sql) => {
        if (sql.includes('FROM separadores WHERE usuario_id=$1')) return { rows: [{ id: 77 }] };
        if (sql.includes('INSERT INTO lotes_separacao')) return { rows: [{ id: 900 }] };
        if (sql.includes('UPDATE pedidos')) return { rowCount: 2 };
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    mockPool.connect.mockResolvedValueOnce(clientMock);
    const res = await agent.post('/pedidos/lote/formar/confirmar').send({
      lotes: [{ separador_id: 5, pedidos: [{ id: 1 }, { id: 2 }] }],
    });
    expect(res.status).toBe(200);
    expect(res.body.lotes).toBe(1);
    expect(res.body.pedidos).toBe(2);
    expect(clientMock.query).toHaveBeenCalledWith('COMMIT');
  });

  test('POST /pedidos/lote/formar/confirmar sem separador vinculado → ignora lote (0 gravados)', async () => {
    const clientMock = {
      query: jest.fn().mockImplementation(async (sql) => {
        if (sql.includes('FROM separadores WHERE usuario_id=$1')) return { rows: [] }; // não vinculado
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    mockPool.connect.mockResolvedValueOnce(clientMock);
    const res = await agent.post('/pedidos/lote/formar/confirmar').send({
      lotes: [{ separador_id: 999, pedidos: [{ id: 1 }] }],
    });
    expect(res.status).toBe(200);
    expect(res.body.lotes).toBe(0);
    expect(res.body.pedidos).toBe(0);
  });

  test('POST /pedidos/lote/formar/confirmar — pedidos que deixaram de estar pendente (corrida) não geram lote fantasma', async () => {
    // Regressão: entre o preview e a confirmação, os pedidos do lote deixaram
    // de ser 'pendente' (ex: outra ação já pegou primeiro) — a UPDATE não
    // afeta nenhuma linha. Antes desta correção, o lote em lotes_separacao
    // já tinha sido gravado mesmo assim e contava como "gravado" na resposta.
    const calls = [];
    const clientMock = {
      query: jest.fn().mockImplementation(async (sql, params) => {
        calls.push(sql);
        if (sql.includes('FROM separadores WHERE usuario_id=$1')) return { rows: [{ id: 77 }] };
        if (sql.includes('INSERT INTO lotes_separacao')) return { rows: [{ id: 900 }] };
        if (sql.includes('UPDATE pedidos')) return { rowCount: 0 }; // ninguém mais pendente
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    mockPool.connect.mockResolvedValueOnce(clientMock);
    const res = await agent.post('/pedidos/lote/formar/confirmar').send({
      lotes: [{ separador_id: 5, pedidos: [{ id: 1 }, { id: 2 }] }],
    });
    expect(res.status).toBe(200);
    expect(res.body.lotes).toBe(0);
    expect(res.body.pedidos).toBe(0);
    expect(calls.some(sql => sql.includes('DELETE FROM lotes_separacao'))).toBe(true);
  });

  test('GET /pedidos/lote/historico sem separador_id → lista vazia sem consultar banco', async () => {
    const res = await agent.get('/pedidos/lote/historico');
    expect(res.status).toBe(200);
    expect(res.body.lotes).toEqual([]);
  });

  test('GET /pedidos/lote/historico → 200 com lotes concluídos', async () => {
    mockDb.all
      .mockResolvedValueOnce([{ lote_id: 900, total: 2, concluido_em: '2026-05-09T10:00:00' }])
      .mockResolvedValueOnce([{ id: 1, numero_pedido: '1' }, { id: 2, numero_pedido: '2' }]);
    const res = await agent.get('/pedidos/lote/historico?separador_id=9');
    expect(res.status).toBe(200);
    expect(res.body.lotes).toHaveLength(1);
    expect(res.body.lotes[0].pedidos).toHaveLength(2);
  });
});

/* ════════════════════════════════════════════════════════════
   RECALCULAR PONTUAÇÃO / RELATÓRIO DE TEMPO
════════════════════════════════════════════════════════════ */
describe('Pedidos — recalcular pontuação e relatório de tempo', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('POST /pedidos/recalcular-pontuacao sem auth → 401', async () => {
    const res = await request(app).post('/pedidos/recalcular-pontuacao');
    expect(res.status).toBe(401);
  });

  test('POST /pedidos/recalcular-pontuacao recalcula apenas pedidos com pontuação zerada', async () => {
    mockDb.all
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([{ endereco: 'A1', quantidade: 5 }]);
    const res = await agent.post('/pedidos/recalcular-pontuacao');
    expect(res.status).toBe(200);
    expect(res.body.atualizados).toBe(1);
  });

  test('GET /pedidos/relatorio/tempo-separacao sem auth → 401', async () => {
    const res = await request(app).get('/pedidos/relatorio/tempo-separacao');
    expect(res.status).toBe(401);
  });

  test('GET /pedidos/relatorio/tempo-separacao como separador → 403', async () => {
    const sepAgent = await loginSeparador();
    const res = await sepAgent.get('/pedidos/relatorio/tempo-separacao');
    expect(res.status).toBe(403);
  });

  test('GET /pedidos/relatorio/tempo-separacao calcula tempo_espera_min = total - real', async () => {
    mockDb.all.mockResolvedValueOnce([
      { numero_pedido: '1', tempo_real_min: '10.0', tempo_total_min: '15.0' },
      { numero_pedido: '2', tempo_real_min: null, tempo_total_min: null },
    ]);
    const res = await agent.get('/pedidos/relatorio/tempo-separacao');
    expect(res.status).toBe(200);
    expect(res.body[0].tempo_espera_min).toBe(5);
    expect(res.body[1].tempo_espera_min).toBe(0);
  });
});
