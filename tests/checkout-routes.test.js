/**
 * WMS Miess — Testes Automatizados de routes/checkout.js
 * Cobre os endpoints de checkout NÃO cobertos por tests/api.test.js
 * (que já cobre GET /checkout 200/401).
 * Roda com: npx jest tests/checkout-routes.test.js
 */

const request = require('supertest');
const bcrypt  = require('bcrypt');

// Mock do banco para testes — mesmo formato de tests/api.test.js
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
const HASH_ADMIN  = bcrypt.hashSync(SENHA_ADMIN, 4); // rounds baixo para velocidade em teste

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

// Helper — autentica supervisor com bcrypt (mesmo padrão de api.test.js)
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
   1. DIAGNÓSTICO
════════════════════════════════════════════════════════════ */
describe('GET /checkout/diagnostico', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).get('/checkout/diagnostico');
    expect(res.status).toBe(401);
  });

  test('200 com totais e amostra', async () => {
    mockDb.get.mockResolvedValueOnce({ cnt: '7' });
    mockDb.all.mockResolvedValueOnce([{ id: 1, status: 'pendente', data_checkout: '2026-05-09', numero_pedido: '111' }]);
    const res = await agent.get('/checkout/diagnostico');
    expect(res.status).toBe(200);
    expect(res.body.total_registros).toBe(7);
    expect(res.body.data_servidor).toBe('2026-05-09');
    expect(res.body.hora_servidor).toBe('10:00');
    expect(res.body.ultimos_15).toHaveLength(1);
  });
});

/* ════════════════════════════════════════════════════════════
   2. FILA AGUARDANDO ITEM
════════════════════════════════════════════════════════════ */
describe('GET /checkout/aguardando', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).get('/checkout/aguardando');
    expect(res.status).toBe(401);
  });

  test('200 com lista de checkouts aguardando item', async () => {
    mockDb.all.mockResolvedValueOnce([{ id: 1, status: 'aguardando_item', cliente: 'Cliente X' }]);
    const res = await agent.get('/checkout/aguardando');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('aguardando_item');
  });
});

/* ════════════════════════════════════════════════════════════
   3. SESSÕES DE UM CHECKOUT
════════════════════════════════════════════════════════════ */
describe('GET /checkout/:id/sessoes', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).get('/checkout/1/sessoes');
    expect(res.status).toBe(401);
  });

  test('200 com lista de sessões', async () => {
    mockDb.all.mockResolvedValueOnce([{ id: 1, checkout_id: 5, operador_nome: 'Op1', acao: 'aberto' }]);
    const res = await agent.get('/checkout/5/sessoes');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    // garante que o id da rota foi convertido pra inteiro no parâmetro da query
    expect(mockDb.all.mock.calls[0][1]).toEqual([5]);
  });
});

/* ════════════════════════════════════════════════════════════
   4. BUSCAR POR NÚMERO
════════════════════════════════════════════════════════════ */
describe('GET /checkout/buscar', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).get('/checkout/buscar?numero=123');
    expect(res.status).toBe(401);
  });

  test('sem numero → 400', async () => {
    const res = await agent.get('/checkout/buscar');
    expect(res.status).toBe(400);
    expect(res.body.erro).toBe('Número não informado');
  });

  test('encontra pelo numero_caixa → 200', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, numero_caixa: 'CX1', status: 'pendente' });
    const res = await agent.get('/checkout/buscar?numero=CX1');
    expect(res.status).toBe(200);
    expect(res.body.numero_caixa).toBe('CX1');
  });

  test('numero_caixa não bate, encontra pelo numero_pedido → 200', async () => {
    mockDb.get
      .mockResolvedValueOnce(null) // busca por numero_caixa falha
      .mockResolvedValueOnce({ id: 2, numero_pedido: '999', status: 'pendente' }); // busca por numero_pedido acha
    const res = await agent.get('/checkout/buscar?numero=999');
    expect(res.status).toBe(200);
    expect(res.body.numero_pedido).toBe('999');
  });

  test('não acha em checkout, cai no fallback de pedidos → 200', async () => {
    mockDb.get
      .mockResolvedValueOnce(null) // numero_caixa
      .mockResolvedValueOnce(null) // numero_pedido
      .mockResolvedValueOnce({ id: 3, numero_pedido: '555', numero_caixa: '', status: 'em_separacao' }); // fallback pedidos
    const res = await agent.get('/checkout/buscar?numero=555');
    expect(res.status).toBe(200);
    expect(res.body.numero_pedido).toBe('555');
    expect(res.body.status).toBe('pendente'); // status fixo do fallback
    expect(res.body.pedido_status).toBe('em_separacao');
  });

  test('não encontra em lugar nenhum → 404', async () => {
    mockDb.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const res = await agent.get('/checkout/buscar?numero=inexistente');
    expect(res.status).toBe(404);
  });
});

/* ════════════════════════════════════════════════════════════
   5. BUSCAR/ABRIR POR NÚMERO DE CAIXA
════════════════════════════════════════════════════════════ */
describe('GET /checkout/caixa/:numero', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).get('/checkout/caixa/CX1');
    expect(res.status).toBe(401);
  });

  test('nada encontrado (sem registro ativo, concluído ou pedido) → 200 com array vazio', async () => {
    mockDb.all
      .mockResolvedValueOnce([]) // por numero_caixa
      .mockResolvedValueOnce([]) // por numero_pedido
      .mockResolvedValueOnce([]); // concluídos
    mockDb.get.mockResolvedValueOnce(null); // pedido concluído sem checkout
    const res = await agent.get('/checkout/caixa/SEMNADA');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('registro ativo encontrado, sem conflito de sessão → 200 com itens_lista e sessoes', async () => {
    mockDb.all
      .mockResolvedValueOnce([{ id: 10, status: 'pendente', operador_nome: 'Op1', pedido_id: 5, numero_pedido: '123', numero_caixa: 'CX1' }])
      .mockResolvedValueOnce([{ item_id: 1, codigo: 'A1', status: 'pendente' }]) // itens_lista
      .mockResolvedValueOnce([{ id: 1, acao: 'aberto' }]); // sessoes
    const res = await agent.get('/checkout/caixa/CX1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].itens_lista).toHaveLength(1);
    expect(res.body[0].sessoes).toHaveLength(1);
  });

  test('conflito: outro operador já com sessão ativa → 409', async () => {
    mockDb.all.mockResolvedValueOnce([
      { id: 11, status: 'pendente', operador_nome: '', pedido_id: 6, numero_pedido: '456', numero_caixa: 'CX2' },
    ]);
    const clienteComConflito = {
      query: jest.fn((sql) => {
        if (String(sql).includes("hora_fim=''") && String(sql).includes('checkout_sessoes')) {
          return Promise.resolve({ rows: [{ operador_nome: 'Outro Operador' }] });
        }
        return Promise.resolve({ rows: [] });
      }),
      release: jest.fn(),
    };
    mockPool.connect.mockResolvedValueOnce(clienteComConflito);
    const res = await agent.get('/checkout/caixa/CX2');
    expect(res.status).toBe(409);
    expect(res.body.erro).toContain('Outro Operador');
    expect(res.body.erro).toContain('456');
  });
});

/* ════════════════════════════════════════════════════════════
   6. CONCLUIR CHECKOUT
════════════════════════════════════════════════════════════ */
describe('PUT /checkout/:id/concluir', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).put('/checkout/1/concluir').send({});
    expect(res.status).toBe(401);
  });

  test('200 e retorna numero_pedido', async () => {
    mockDb.get.mockResolvedValueOnce({ numero_pedido: '789', pedido_id: 9 });
    const res = await agent.put('/checkout/1/concluir').send({});
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toBe('Checkout concluido!');
    expect(res.body.numero_pedido).toBe('789');
  });

  test('checkout inexistente não quebra (numero_pedido undefined) → 200', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.put('/checkout/999/concluir').send({});
    expect(res.status).toBe(200);
    expect(res.body.numero_pedido).toBeUndefined();
  });
});

/* ════════════════════════════════════════════════════════════
   7. CONFIRMAR CHECKOUT
════════════════════════════════════════════════════════════ */
describe('PUT /checkout/:id/confirmar', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).put('/checkout/1/confirmar').send({});
    expect(res.status).toBe(401);
  });

  test('checkout inexistente → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.put('/checkout/1/confirmar').send({});
    expect(res.status).toBe(404);
    expect(res.body.erro).toBe('Checkout nao encontrado');
  });

  test('checkout já concluído por outro operador → 409', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, status: 'concluido' });
    const res = await agent.put('/checkout/1/confirmar').send({});
    expect(res.status).toBe(409);
    expect(res.body.erro).toMatch(/já foi confirmado/);
  });

  test('com sessão aberta → fecha sessão e conclui → 200', async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: 1, status: 'pendente', pedido_id: 5, numero_pedido: '123', hora_criacao: '09:00' })
      .mockResolvedValueOnce({ id: 50, hora_inicio: '09:00', hora_fim: '' }); // sessaoAberta
    const res = await agent.put('/checkout/1/confirmar').send({ hora_checkout: '10:00' });
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toBe('Checkout concluido!');
    const updateSessao = mockPool.query.mock.calls.find(c => String(c[0]).includes('UPDATE checkout_sessoes'));
    expect(updateSessao).toBeDefined();
  });

  test('sem sessão aberta → cria sessão retroativa antes de concluir → 200', async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: 2, status: 'pendente', pedido_id: null, numero_pedido: '321', hora_criacao: '09:00' })
      .mockResolvedValueOnce(null); // nenhuma sessão aberta
    const res = await agent.put('/checkout/2/confirmar').send({ hora_checkout: '10:00' });
    expect(res.status).toBe(200);
    const insertSessao = mockPool.query.mock.calls.find(c => String(c[0]).includes('INSERT INTO checkout_sessoes'));
    expect(insertSessao).toBeDefined();
    // sem pedido_id, atualiza pedidos pelo numero_pedido
    const updatePedidoPorNumero = mockPool.query.mock.calls.find(c => String(c[0]).includes('UPDATE pedidos') && String(c[0]).includes('numero_pedido=$1'));
    expect(updatePedidoPorNumero).toBeDefined();
  });
});

/* ════════════════════════════════════════════════════════════
   8. REGISTRAR PENDÊNCIA (itens faltando)
════════════════════════════════════════════════════════════ */
describe('PUT /checkout/:id/pendencia', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).put('/checkout/1/pendencia').send({});
    expect(res.status).toBe(401);
  });

  test('checkout inexistente → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.put('/checkout/1/pendencia').send({ itens_falta: [] });
    expect(res.status).toBe(404);
  });

  test('200 e grava itens_falta como JSON', async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: 1, hora_criacao: '09:00' })
      .mockResolvedValueOnce({ id: 50, hora_inicio: '09:00', hora_fim: '' }); // sessaoAberta
    const itens = [{ codigo: 'A1', descricao: 'Item Faltante' }];
    const res = await agent.put('/checkout/1/pendencia').send({ itens_falta: itens });
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toBe('Pendência registrada!');
    const updateCall = mockPool.query.mock.calls.find(c => String(c[0]).includes("status='aguardando_item'"));
    expect(updateCall).toBeDefined();
    expect(updateCall[1]).toEqual([JSON.stringify(itens), 1]);
  });

  test('sem itens_falta no body → grava array vazio', async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: 1, hora_criacao: '09:00' })
      .mockResolvedValueOnce(null); // sem sessão aberta -> cria retroativa
    const res = await agent.put('/checkout/1/pendencia').send({});
    expect(res.status).toBe(200);
    const updateCall = mockPool.query.mock.calls.find(c => String(c[0]).includes("status='aguardando_item'"));
    expect(updateCall[1]).toEqual(['[]', 1]);
  });
});

/* ════════════════════════════════════════════════════════════
   9. VERIFICAÇÃO DE ITEM (V/X por item)
════════════════════════════════════════════════════════════ */
describe('PUT /checkout/:id/item-verificacao', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).put('/checkout/1/item-verificacao').send({ item_id: 1 });
    expect(res.status).toBe(401);
  });

  test('sem item_id → 400', async () => {
    const res = await agent.put('/checkout/1/item-verificacao').send({ errado: true });
    expect(res.status).toBe(400);
    expect(res.body.erro).toBe('item_id obrigatório');
  });

  test('checkout inexistente → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.put('/checkout/1/item-verificacao').send({ item_id: 5, errado: true });
    expect(res.status).toBe(404);
  });

  test('errado=true → insere/atualiza registro de conferência → 200', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, pedido_id: 5, numero_pedido: '111', separador_nome: 'Sep1' });
    const res = await agent.put('/checkout/1/item-verificacao').send({ item_id: 5, codigo: 'C1', descricao: 'Desc', errado: true });
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toBe('ok');
    const insertCall = mockPool.query.mock.calls.find(c => String(c[0]).includes('INSERT INTO checkout_itens_conferencia'));
    expect(insertCall).toBeDefined();
  });

  test('errado=false → remove registro de conferência → 200', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, pedido_id: 5, numero_pedido: '111', separador_nome: 'Sep1' });
    const res = await agent.put('/checkout/1/item-verificacao').send({ item_id: 5, errado: false });
    expect(res.status).toBe(200);
    const deleteCall = mockPool.query.mock.calls.find(c => String(c[0]).includes('DELETE FROM checkout_itens_conferencia'));
    expect(deleteCall).toBeDefined();
    expect(deleteCall[1]).toEqual([1, 5]);
  });
});

/* ════════════════════════════════════════════════════════════
   10. RETOMAR CHECKOUT (fila de espera)
════════════════════════════════════════════════════════════ */
describe('PUT /checkout/:id/retomar', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).put('/checkout/1/retomar').send({});
    expect(res.status).toBe(401);
  });

  test('checkout inexistente → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.put('/checkout/1/retomar').send({});
    expect(res.status).toBe(404);
  });

  test('checkout não está em espera → 400', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, status: 'pendente' });
    const res = await agent.put('/checkout/1/retomar').send({});
    expect(res.status).toBe(400);
    expect(res.body.erro).toBe('Checkout não está em espera');
  });

  test('200 com itens_lista e dados do checkout retomado', async () => {
    mockDb.get.mockResolvedValueOnce({
      id: 1, status: 'aguardando_item', pedido_id: 5, numero_caixa: 'CX1', numero_pedido: '123', itens_falta: [{ codigo: 'A1' }],
    });
    mockDb.all.mockResolvedValueOnce([{ item_id: 1, codigo: 'A1', status: 'pendente' }]);
    const res = await agent.put('/checkout/1/retomar').send({});
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toBe('Checkout retomado!');
    expect(res.body.checkout_id).toBe(1);
    expect(res.body.numero_caixa).toBe('CX1');
    expect(res.body.numero_pedido).toBe('123');
    expect(res.body.itens_falta).toEqual([{ codigo: 'A1' }]);
    expect(res.body.itens_lista).toHaveLength(1);
  });
});

/* ════════════════════════════════════════════════════════════
   11. PAUSAR CHECKOUT
════════════════════════════════════════════════════════════ */
describe('PUT /checkout/:id/pausar', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).put('/checkout/1/pausar').send({});
    expect(res.status).toBe(401);
  });

  test('checkout inexistente → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.put('/checkout/1/pausar').send({});
    expect(res.status).toBe(404);
  });

  test('checkout já concluído → 400', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, status: 'concluido' });
    const res = await agent.put('/checkout/1/pausar').send({});
    expect(res.status).toBe(400);
    expect(res.body.erro).toBe('Checkout já foi concluído');
  });

  test('com sessão aberta → fecha sessão e pausa → 200', async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: 1, status: 'pendente', hora_criacao: '09:00' })
      .mockResolvedValueOnce({ id: 50, hora_inicio: '09:00', hora_fim: '' });
    const res = await agent.put('/checkout/1/pausar').send({});
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toBe('Checkout pausado!');
    const updateSessao = mockPool.query.mock.calls.find(c => String(c[0]).includes("acao='pausado'"));
    expect(updateSessao).toBeDefined();
  });

  test('sem sessão aberta → cria sessão retroativa pausada → 200', async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: 1, status: 'pendente', hora_criacao: '09:00' })
      .mockResolvedValueOnce(null);
    const res = await agent.put('/checkout/1/pausar').send({});
    expect(res.status).toBe(200);
    const insertSessao = mockPool.query.mock.calls.find(c => String(c[0]).includes('INSERT INTO checkout_sessoes') && String(c[0]).includes("'pausado'"));
    expect(insertSessao).toBeDefined();
  });
});

/* ════════════════════════════════════════════════════════════
   12. LIBERAR CAIXA
════════════════════════════════════════════════════════════ */
describe('PUT /checkout/:id/liberar', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).put('/checkout/1/liberar').send({});
    expect(res.status).toBe(401);
  });

  test('checkout não confirmado → exclui registro e libera caixa → 200', async () => {
    mockDb.get.mockResolvedValueOnce({ pedido_id: 5, status: 'pendente' });
    const res = await agent.put('/checkout/1/liberar').send({});
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toBe('Caixa liberada!');
    const deleteCall = mockPool.query.mock.calls.find(c => String(c[0]).includes('DELETE FROM checkout'));
    expect(deleteCall).toBeDefined();
  });

  test('checkout já concluído → mantém registro (não exclui), só libera a caixa', async () => {
    mockDb.get.mockResolvedValueOnce({ pedido_id: 5, status: 'concluido' });
    const res = await agent.put('/checkout/1/liberar').send({});
    expect(res.status).toBe(200);
    const deleteCall = mockPool.query.mock.calls.find(c => String(c[0]).includes('DELETE FROM checkout'));
    expect(deleteCall).toBeUndefined();
    const updatePedido = mockPool.query.mock.calls.find(c => String(c[0]).includes("numero_caixa=''"));
    expect(updatePedido).toBeDefined();
  });

  test('checkout inexistente → não quebra, responde 200', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.put('/checkout/999/liberar').send({});
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toBe('Caixa liberada!');
  });
});
