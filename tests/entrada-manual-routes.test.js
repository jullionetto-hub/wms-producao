/**
 * WMS Miess — Testes de routes/entrada-manual.js
 * Entrada manual de estoque por planilha, catálogo/código de barras, inventário físico.
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
    id: 2, nome: 'Separador Test', login: 'sep1',
    perfil: 'separador', senha_hash: HASH_SEP,
    subtipo_repositor: 'geral', perfis_acesso: '', turno: 'Manhã', status: 'ativo',
    senha_temporaria: false,
  });
  return agent.post('/auth/login').send({ login: 'sep1', senha: SENHA_SEP, perfil: 'separador' });
};

/* ════════════════════════════════════════════════════════════
   1. LOTES DE ENTRADA MANUAL
════════════════════════════════════════════════════════════ */
describe('Entrada manual — Lotes', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('GET /entrada-manual/lotes sem auth → 401', async () => {
    const res = await request(app).get('/entrada-manual/lotes');
    expect(res.status).toBe(401);
  });

  test('GET /entrada-manual/lotes → 200 com array', async () => {
    mockDb.all.mockResolvedValueOnce([
      { id: 1, nome: 'Entrada teste', status: 'aberto', total_itens: 3, itens_abastecidos: 1 },
    ]);
    const res = await agent.get('/entrada-manual/lotes');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].total_itens).toBe(3);
  });

  test('GET /entrada-manual/lotes?status=aberto → aplica filtro extra na query', async () => {
    mockDb.all.mockResolvedValueOnce([]);
    const res = await agent.get('/entrada-manual/lotes?status=aberto');
    expect(res.status).toBe(200);
    const [sql, params] = mockDb.all.mock.calls[0];
    expect(sql).toMatch(/l\.status=\$3/);
    expect(params).toEqual(['2026-05-09', '2026-05-09', 'aberto']);
  });

  test('POST /entrada-manual/lotes sem itens → 400', async () => {
    const res = await agent.post('/entrada-manual/lotes').send({ nome: 'Lote X', itens: [] });
    expect(res.status).toBe(400);
    expect(res.body.erro).toBeDefined();
  });

  test('POST /entrada-manual/lotes com itens não é array → 400', async () => {
    const res = await agent.post('/entrada-manual/lotes').send({ nome: 'Lote X' });
    expect(res.status).toBe(400);
  });

  test('POST /entrada-manual/lotes → 200 cria lote e insere itens', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 42 }] }) // INSERT lote
      .mockResolvedValueOnce({ rows: [] }) // INSERT item 1
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    mockPool.connect.mockResolvedValueOnce(client);

    const res = await agent.post('/entrada-manual/lotes').send({
      nome: 'Lote Y',
      itens: [{ codigo: 'abc1', descricao: 'Produto A', quantidade: '10', endereco: 'd106' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(42);
    expect(res.body.total).toBe(1);
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    // Código e endereço normalizados para maiúsculo
    const insertItemCall = client.query.mock.calls.find(c => String(c[0]).includes('INSERT INTO entrada_manual_itens'));
    expect(insertItemCall[1]).toEqual([42, 'ABC1', 'Produto A', 10, 'D106']);
  });

  test('POST /entrada-manual/lotes com erro no banco → 500 e ROLLBACK', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockRejectedValueOnce(new Error('falha no insert')) // INSERT lote falha
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    mockPool.connect.mockResolvedValueOnce(client);

    const res = await agent.post('/entrada-manual/lotes').send({
      itens: [{ codigo: 'X1' }],
    });
    expect(res.status).toBe(500);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  test('GET /entrada-manual/lotes/:id inexistente → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.get('/entrada-manual/lotes/999');
    expect(res.status).toBe(404);
  });

  test('GET /entrada-manual/lotes/:id → 200 com itens', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, nome: 'Lote Z', status: 'aberto' });
    mockDb.all.mockResolvedValueOnce([{ id: 10, codigo: 'X1', status: 'pendente' }]);
    const res = await agent.get('/entrada-manual/lotes/1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(res.body.itens).toHaveLength(1);
  });

  test('DELETE /entrada-manual/lotes/:id como separador → 403', async () => {
    const sepAgent = request.agent(app);
    await loginSeparador(sepAgent);
    const res = await sepAgent.delete('/entrada-manual/lotes/1');
    expect(res.status).toBe(403);
  });

  test('DELETE /entrada-manual/lotes/:id como supervisor → 200', async () => {
    const res = await agent.delete('/entrada-manual/lotes/1');
    expect(res.status).toBe(200);
    expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM entrada_manual_lotes'), ['1']);
  });
});

/* ════════════════════════════════════════════════════════════
   2. ITENS DO LOTE — progresso e validação de endereço
════════════════════════════════════════════════════════════ */
describe('Entrada manual — Itens do lote', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('PUT /entrada-manual/itens/:id sem auth → 401', async () => {
    const res = await request(app).put('/entrada-manual/itens/1').send({});
    expect(res.status).toBe(401);
  });

  test('PUT /entrada-manual/itens/:id inexistente → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.put('/entrada-manual/itens/999').send({ quantidade_abastecida: 5 });
    expect(res.status).toBe(404);
  });

  test('PUT /entrada-manual/itens/:id com endereço em formato inválido → 400', async () => {
    mockDb.get.mockResolvedValueOnce({
      id: 1, lote_id: 1, quantidade_esperada: 10, quantidade_abastecida: 0, endereco: 'D106',
    });
    const res = await agent.put('/entrada-manual/itens/1').send({ endereco: '!!' });
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/Endereço inválido/);
  });

  test('PUT /entrada-manual/itens/:id com endereço vazio → 400 (formato)', async () => {
    mockDb.get.mockResolvedValueOnce({
      id: 1, lote_id: 1, quantidade_esperada: 10, quantidade_abastecida: 0, endereco: 'D106',
    });
    const res = await agent.put('/entrada-manual/itens/1').send({ endereco: '   ' });
    expect(res.status).toBe(400);
  });

  test('PUT /entrada-manual/itens/:id com quantidade=0 → status nao_encontrado', async () => {
    mockDb.get.mockResolvedValueOnce({
      id: 1, lote_id: 1, quantidade_esperada: 10, quantidade_abastecida: 0, endereco: 'D106',
    });
    mockDb.get.mockResolvedValueOnce({ total: 1, concluidos: 1 });
    const res = await agent.put('/entrada-manual/itens/1').send({ quantidade_abastecida: 0, endereco: 'D106' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('nao_encontrado');
    expect(res.body.lote_status).toBe('concluido');
  });

  test('PUT /entrada-manual/itens/:id com quantidade parcial → status parcial e lote aberto', async () => {
    mockDb.get.mockResolvedValueOnce({
      id: 1, lote_id: 1, quantidade_esperada: 10, quantidade_abastecida: 0, endereco: 'D106',
    });
    mockDb.get.mockResolvedValueOnce({ total: 3, concluidos: 1 });
    const res = await agent.put('/entrada-manual/itens/1').send({ quantidade_abastecida: 5, endereco: 'D106' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('parcial');
    expect(res.body.lote_status).toBe('aberto');
  });

  test('PUT /entrada-manual/itens/:id com quantidade >= esperada → status abastecido', async () => {
    mockDb.get.mockResolvedValueOnce({
      id: 1, lote_id: 1, quantidade_esperada: 10, quantidade_abastecida: 0, endereco: 'D106',
    });
    mockDb.get.mockResolvedValueOnce({ total: 1, concluidos: 1 });
    const res = await agent.put('/entrada-manual/itens/1').send({ quantidade_abastecida: 10, endereco: 'D106' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('abastecido');
  });

  test('PUT /entrada-manual/lotes/:id/itens-bulk sem itens → 400', async () => {
    const res = await agent.put('/entrada-manual/lotes/1/itens-bulk').send({ itens: [] });
    expect(res.status).toBe(400);
  });

  test('PUT /entrada-manual/lotes/:id/itens-bulk → 200 salva múltiplos itens', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ quantidade_esperada: 10 }] }) // SELECT item 1
      .mockResolvedValueOnce({ rows: [] }) // UPDATE item 1
      .mockResolvedValueOnce({ rows: [{ total: 1, concluidos: 1 }] }) // resumo
      .mockResolvedValueOnce({ rows: [] }) // UPDATE lote
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    mockPool.connect.mockResolvedValueOnce(client);

    const res = await agent.put('/entrada-manual/lotes/1/itens-bulk').send({
      itens: [{ id: 1, quantidade_abastecida: 10 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.itens_concluidos).toBe(1);
    expect(res.body.lote_status).toBe('concluido');
  });

  test('PUT /entrada-manual/lotes/:id/itens-bulk ignora item que não pertence ao lote', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT item — não encontrado nesse lote
      .mockResolvedValueOnce({ rows: [{ total: 0, concluidos: 0 }] }) // resumo
      .mockResolvedValueOnce({ rows: [] }) // UPDATE lote
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    mockPool.connect.mockResolvedValueOnce(client);

    const res = await agent.put('/entrada-manual/lotes/1/itens-bulk').send({
      itens: [{ id: 999, quantidade_abastecida: 5 }],
    });
    expect(res.status).toBe(200);
    // Não deve ter chamado UPDATE entrada_manual_itens (só resumo + lote)
    const updateItemCalls = client.query.mock.calls.filter(c => String(c[0]).includes('UPDATE entrada_manual_itens'));
    expect(updateItemCalls.length).toBe(0);
  });
});

/* ════════════════════════════════════════════════════════════
   3. HISTÓRICO E VALIDAÇÃO DE ENDEREÇO
════════════════════════════════════════════════════════════ */
describe('Entrada manual — Histórico e validação de endereço', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('GET /entrada-manual/historico-endereco/:codigo → 200', async () => {
    mockDb.get.mockResolvedValueOnce({ endereco: 'D106', vezes: 5, ultimo_uso: '2026-05-01' });
    const res = await agent.get('/entrada-manual/historico-endereco/abc1');
    expect(res.status).toBe(200);
    expect(res.body.endereco).toBe('D106');
  });

  test('GET /entrada-manual/historico-endereco/:codigo sem histórico → null', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.get('/entrada-manual/historico-endereco/zzz');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  test('POST /entrada-manual/validar-endereco com formato inválido → valido:false', async () => {
    const res = await agent.post('/entrada-manual/validar-endereco').send({ codigo: 'X1', endereco: '#@' });
    expect(res.status).toBe(200);
    expect(res.body.valido).toBe(false);
    expect(res.body.nivel).toBe('erro');
  });

  test('POST /entrada-manual/validar-endereco endereço diferente do histórico → nivel aviso', async () => {
    mockDb.get.mockResolvedValueOnce({ endereco: 'D200', vezes: 3 });
    const res = await agent.post('/entrada-manual/validar-endereco').send({ codigo: 'X1', endereco: 'D106' });
    expect(res.status).toBe(200);
    expect(res.body.valido).toBe(true);
    expect(res.body.nivel).toBe('aviso');
    expect(res.body.historico).toBe('D200');
  });

  test('POST /entrada-manual/validar-endereco endereço confere com histórico → nivel ok', async () => {
    mockDb.get.mockResolvedValueOnce({ endereco: 'D106', vezes: 3 });
    const res = await agent.post('/entrada-manual/validar-endereco').send({ codigo: 'X1', endereco: 'd106' });
    expect(res.status).toBe(200);
    expect(res.body.nivel).toBe('ok');
  });

  test('POST /entrada-manual/validar-endereco sem histórico algum → mensagem "Formato válido"', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.post('/entrada-manual/validar-endereco').send({ codigo: 'NOVO', endereco: 'D999' });
    expect(res.status).toBe(200);
    expect(res.body.nivel).toBe('ok');
    expect(res.body.mensagem).toMatch(/Formato válido/);
  });
});

/* ════════════════════════════════════════════════════════════
   4. EXPORTAÇÃO CSV
════════════════════════════════════════════════════════════ */
describe('Entrada manual — Exportar CSV', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('GET /entrada-manual/exportar sem auth → 401', async () => {
    const res = await request(app).get('/entrada-manual/exportar');
    expect(res.status).toBe(401);
  });

  test('GET /entrada-manual/exportar → 200 com CSV', async () => {
    mockDb.all.mockResolvedValueOnce([
      { data_fmt: '09/05/2026', criado_por: 'admin', codigo: 'X1', descricao: 'Produto', quantidade_esperada: 10,
        quantidade_abastecida: 10, endereco: 'D106', status: 'abastecido', responsavel: 'admin', obs: '', confirmado_em: '09/05/2026 10:00' },
    ]);
    const res = await agent.get('/entrada-manual/exportar');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('Abastecido');
  });
});

/* ════════════════════════════════════════════════════════════
   5. CATÁLOGO / CÓDIGO DE BARRAS
════════════════════════════════════════════════════════════ */
describe('Entrada manual — Catálogo de produtos', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('POST /entrada-manual/produtos/importar sem auth → 401', async () => {
    const res = await request(app).post('/entrada-manual/produtos/importar').send({ produtos: [{ codigo: 'X1' }] });
    expect(res.status).toBe(401);
  });

  test('POST /entrada-manual/produtos/importar como separador → 403', async () => {
    const sepAgent = request.agent(app);
    await loginSeparador(sepAgent);
    const res = await sepAgent.post('/entrada-manual/produtos/importar').send({ produtos: [{ codigo: 'X1' }] });
    expect(res.status).toBe(403);
  });

  test('POST /entrada-manual/produtos/importar sem produtos → 400', async () => {
    const res = await agent.post('/entrada-manual/produtos/importar').send({ produtos: [] });
    expect(res.status).toBe(400);
  });

  test('POST /entrada-manual/produtos/importar → insere novo e atualiza existente', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT — não existe (produto 1)
      .mockResolvedValueOnce({ rows: [] }) // INSERT produto 1
      .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // SELECT — existe (produto 2)
      .mockResolvedValueOnce({ rows: [] }) // UPDATE produto 2
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    mockPool.connect.mockResolvedValueOnce(client);

    const res = await agent.post('/entrada-manual/produtos/importar').send({
      produtos: [
        { codigo: 'novo1', codigo_barras: '789', nome: 'Produto Novo', saldo: '10', disponivel: '5', localizacao: 'a01' },
        { codigo: 'exist1', nome: 'Produto Existente' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.inseridos).toBe(1);
    expect(res.body.atualizados).toBe(1);
  });

  test('POST /entrada-manual/produtos/importar pula produto sem código', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // COMMIT (nenhum SELECT/INSERT pois código vazio)
    mockPool.connect.mockResolvedValueOnce(client);

    const res = await agent.post('/entrada-manual/produtos/importar').send({
      produtos: [{ codigo: '  ', nome: 'Sem código' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.inseridos).toBe(0);
    expect(res.body.atualizados).toBe(0);
  });

  test('GET /entrada-manual/produtos/buscar sem q → array vazio direto', async () => {
    const res = await agent.get('/entrada-manual/produtos/buscar');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(mockDb.all).not.toHaveBeenCalled();
  });

  test('GET /entrada-manual/produtos/buscar?q=X → 200 com resultados', async () => {
    mockDb.all.mockResolvedValueOnce([{ codigo: 'X1', nome: 'Produto X' }]);
    const res = await agent.get('/entrada-manual/produtos/buscar?q=X');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  test('GET /entrada-manual/produtos/ruas → 200', async () => {
    mockDb.all.mockResolvedValueOnce([{ rua: 'D', total: 12 }]);
    const res = await agent.get('/entrada-manual/produtos/ruas');
    expect(res.status).toBe(200);
    expect(res.body[0].rua).toBe('D');
  });

  test('GET /entrada-manual/produtos/total → 200', async () => {
    mockDb.get.mockResolvedValueOnce({ total: 150 });
    const res = await agent.get('/entrada-manual/produtos/total');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(150);
  });
});

/* ════════════════════════════════════════════════════════════
   6. INVENTÁRIO FÍSICO
════════════════════════════════════════════════════════════ */
describe('Entrada manual — Inventário físico', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('GET /inventario/sessoes sem auth → 401', async () => {
    const res = await request(app).get('/inventario/sessoes');
    expect(res.status).toBe(401);
  });

  test('GET /inventario/sessoes → 200', async () => {
    mockDb.all.mockResolvedValueOnce([{ id: 1, nome: 'Inventário A', status: 'aberto' }]);
    const res = await agent.get('/inventario/sessoes');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  test('POST /inventario/sessoes com itens explícitos → 200', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 7 }] }) // INSERT sessão
      .mockResolvedValueOnce({ rows: [] }) // INSERT itens (unnest)
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    mockPool.connect.mockResolvedValueOnce(client);

    const res = await agent.post('/inventario/sessoes').send({
      nome: 'Inventário Manual',
      itens: [{ codigo: 'a1', nome: 'Produto A', saldo_sistema: '5', localizacao: 'd106' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(7);
    expect(res.body.total).toBe(1);
  });

  test('POST /inventario/sessoes com carregarCatalogo → busca produtos do catálogo', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ codigo: 'X1', nome: 'P1', codigo_barras: '', localizacao: 'D01', saldo_sistema: 3 }] }) // SELECT produtos
      .mockResolvedValueOnce({ rows: [{ id: 8 }] }) // INSERT sessão
      .mockResolvedValueOnce({ rows: [] }) // INSERT itens
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    mockPool.connect.mockResolvedValueOnce(client);

    const res = await agent.post('/inventario/sessoes').send({ carregarCatalogo: true });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    const selectCall = client.query.mock.calls.find(c => String(c[0]).includes('FROM produtos'));
    expect(selectCall).toBeDefined();
  });

  test('POST /inventario/sessoes sem itens nem catálogo → sessão vazia', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 9 }] }) // INSERT sessão
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    mockPool.connect.mockResolvedValueOnce(client);

    const res = await agent.post('/inventario/sessoes').send({});
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  test('GET /inventario/sessoes/:id inexistente → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.get('/inventario/sessoes/999');
    expect(res.status).toBe(404);
  });

  test('GET /inventario/sessoes/:id → 200 com itens', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, nome: 'Inventário A' });
    mockDb.all.mockResolvedValueOnce([{ id: 1, codigo: 'X1' }]);
    const res = await agent.get('/inventario/sessoes/1');
    expect(res.status).toBe(200);
    expect(res.body.itens).toHaveLength(1);
  });

  test('PUT /inventario/itens/:id inexistente → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.put('/inventario/itens/999').send({ qtd_contada: 5 });
    expect(res.status).toBe(404);
  });

  test('PUT /inventario/itens/:id com contagem igual ao saldo → status ok', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, sessao_id: 1, saldo_sistema: 10 });
    mockDb.get.mockResolvedValueOnce({ contados: 1 });
    const res = await agent.put('/inventario/itens/1').send({ qtd_contada: 10 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('PUT /inventario/itens/:id com contagem divergente → status divergente', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, sessao_id: 1, saldo_sistema: 10 });
    mockDb.get.mockResolvedValueOnce({ contados: 1 });
    const res = await agent.put('/inventario/itens/1').send({ qtd_contada: 7 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('divergente');
  });

  test('PUT /inventario/itens/:id sem qtd_contada (NaN) → status pendente', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, sessao_id: 1, saldo_sistema: 10 });
    mockDb.get.mockResolvedValueOnce({ contados: 0 });
    const res = await agent.put('/inventario/itens/1').send({ obs: 'sem contagem ainda' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pendente');
  });

  test('PUT /inventario/itens/:id com diferença dentro da tolerância (<0.001) → status ok', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, sessao_id: 1, saldo_sistema: 10.0005 });
    mockDb.get.mockResolvedValueOnce({ contados: 1 });
    const res = await agent.put('/inventario/itens/1').send({ qtd_contada: 10 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('PUT /inventario/sessoes/:id/concluir → 200', async () => {
    const res = await agent.put('/inventario/sessoes/1/concluir');
    expect(res.status).toBe(200);
    expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("status='concluido'"), ['1']);
  });

  test('PUT /inventario/sessoes/:id/sync-enderecos → 200 com contagem de atualizados', async () => {
    mockPool.query.mockResolvedValueOnce({ rowCount: 4 });
    const res = await agent.put('/inventario/sessoes/1/sync-enderecos');
    expect(res.status).toBe(200);
    expect(res.body.atualizados).toBe(4);
  });

  test('DELETE /inventario/sessoes/:id como separador → 403', async () => {
    const sepAgent = request.agent(app);
    await loginSeparador(sepAgent);
    const res = await sepAgent.delete('/inventario/sessoes/1');
    expect(res.status).toBe(403);
  });

  test('DELETE /inventario/sessoes/:id como supervisor → 200', async () => {
    const res = await agent.delete('/inventario/sessoes/1');
    expect(res.status).toBe(200);
  });

  test('GET /inventario/sessoes/:id/exportar inexistente → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const res = await agent.get('/inventario/sessoes/999/exportar');
    expect(res.status).toBe(404);
  });

  test('GET /inventario/sessoes/:id/exportar → 200 com CSV de divergências', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1, nome: 'Inventário A' });
    mockDb.all.mockResolvedValueOnce([
      { codigo: 'X1', nome: 'Produto', localizacao: 'D106', saldo_sistema: 10, qtd_contada: 7,
        diferenca: -3, status: 'divergente', contado_por: 'admin', obs: '', contado_em_fmt: '09/05/2026 10:00' },
    ]);
    const res = await agent.get('/inventario/sessoes/1/exportar');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('Divergente');
  });
});
