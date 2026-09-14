/**
 * WMS Miess — Testes Automatizados da API
 * Cobertura estendida de routes/repositor.js (endpoints não cobertos em api.test.js)
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

// Helper — autentica supervisor com bcrypt (copiado de api.test.js)
const loginSupervisor = (agent) => {
  mockDb.get.mockResolvedValueOnce({
    id: 1, nome: 'Supervisor Test', login: 'admin',
    perfil: 'supervisor', senha_hash: HASH_ADMIN,
    subtipo_repositor: 'geral', perfis_acesso: '', turno: 'Manhã', status: 'ativo',
    senha_temporaria: false,
  });
  return agent.post('/auth/login').send({ login: 'admin', senha: SENHA_ADMIN, perfil: 'supervisor' });
};

// Helper — autentica repositor com bcrypt
const loginRepositor = (agent) => {
  mockDb.get.mockResolvedValueOnce({
    id: 2, nome: 'Repositor Test', login: 'repo1',
    perfil: 'repositor', senha_hash: HASH_ADMIN,
    subtipo_repositor: 'geral', perfis_acesso: '', turno: 'Manhã', status: 'ativo',
    senha_temporaria: false,
  });
  return agent.post('/auth/login').send({ login: 'repo1', senha: SENHA_ADMIN, perfil: 'repositor' });
};

// Helper — autentica separador (usado para testar 403 em rotas perfil-gated)
const loginSeparador = (agent) => {
  mockDb.get.mockResolvedValueOnce({
    id: 3, nome: 'Separador Test', login: 'sep1',
    perfil: 'separador', senha_hash: HASH_ADMIN,
    subtipo_repositor: 'geral', perfis_acesso: '', turno: 'Manhã', status: 'ativo',
    senha_temporaria: false,
  });
  return agent.post('/auth/login').send({ login: 'sep1', senha: SENHA_ADMIN, perfil: 'separador' });
};

// Monta um client de transação (pool.connect) que responde à query "FOR UPDATE"
// com a linha atual do aviso — usado pelas rotas que fazem SELECT ... FOR UPDATE.
function makeTxClient(atualRow) {
  return {
    query: jest.fn((sql) => {
      if (typeof sql === 'string' && sql.includes('FOR UPDATE')) {
        return Promise.resolve({ rows: atualRow ? [atualRow] : [] });
      }
      return Promise.resolve({ rows: [] });
    }),
    release: jest.fn(),
  };
}

/* ════════════════════════════════════════════════════════════
   PUT /repositor/avisos/reordenar
════════════════════════════════════════════════════════════ */
describe('Repositor — reordenar fila', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
    mockPool.query.mockClear(); // login também chama pool.query (INSERT sessoes_trabalho)
  });

  test('sem auth → 401', async () => {
    const res = await request(app).put('/repositor/avisos/reordenar').send({ ids: [1, 2] });
    expect(res.status).toBe(401);
  });

  test('sem lista de ids → 400', async () => {
    const res = await agent.put('/repositor/avisos/reordenar').send({});
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/lista de ids/);
  });

  test('lista vazia → 400', async () => {
    const res = await agent.put('/repositor/avisos/reordenar').send({ ids: [] });
    expect(res.status).toBe(400);
  });

  test('ids válidos → 200 e atualiza cada um', async () => {
    const res = await agent.put('/repositor/avisos/reordenar').send({ ids: [10, 20, 30] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mensagem: 'Ordem atualizada!', atualizados: 3 });
    expect(mockPool.query).toHaveBeenCalledTimes(3);
  });

  test('ids inválidos misturados são pulados mas contam no total retornado', async () => {
    const res = await agent.put('/repositor/avisos/reordenar').send({ ids: [1, 'abc', -5, 2] });
    expect(res.status).toBe(200);
    expect(res.body.atualizados).toBe(4);
    // apenas os 2 ids válidos (1 e 2) geram UPDATE
    expect(mockPool.query).toHaveBeenCalledTimes(2);
  });
});

/* ════════════════════════════════════════════════════════════
   PUT /repositor/avisos/:id
════════════════════════════════════════════════════════════ */
describe('Repositor — editar status do aviso', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).put('/repositor/avisos/1').send({ status: 'pendente' });
    expect(res.status).toBe(401);
  });

  test('id inválido → 400', async () => {
    const res = await agent.put('/repositor/avisos/abc').send({ status: 'pendente' });
    expect(res.status).toBe(400);
    expect(res.body.erro).toBe('ID invalido');
  });

  test('reverter item em estado final → 409', async () => {
    mockDb.get.mockResolvedValueOnce({ status: 'abastecido', tentativas: [], historico: [] });
    const res = await agent.put('/repositor/avisos/1').send({ status: 'pendente' });
    expect(res.status).toBe(409);
    expect(res.body.erro).toMatch(/estado final: abastecido/);
  });

  test('aviso inexistente (rowCount 0) → 404', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await agent.put('/repositor/avisos/999').send({ status: 'buscado' });
    expect(res.status).toBe(404);
    expect(res.body.erro).toBe('Aviso não encontrado');
  });

  test('nao_encontrado com poucas falhas volta para a fila (pendente)', async () => {
    mockDb.get.mockResolvedValueOnce({
      status: 'verificando',
      tentativas: [{ numero: 1, hora_inicio: '09:00', hora_fim: null, resultado: null }],
      historico: [],
      total_tentativas: 1,
    });
    mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await agent.put('/repositor/avisos/1').send({ status: 'nao_encontrado' });
    expect(res.status).toBe(200);
    expect(res.body.stFinal).toBe('pendente');
  });

  test('nao_encontrado na 3ª falha vai para liberação', async () => {
    mockDb.get.mockResolvedValueOnce({
      status: 'verificando',
      tentativas: [
        { numero: 1, hora_inicio: '08:00', hora_fim: '08:10', resultado: 'nao_encontrado' },
        { numero: 2, hora_inicio: '09:00', hora_fim: '09:10', resultado: 'nao_encontrado' },
        { numero: 3, hora_inicio: '10:00', hora_fim: null, resultado: null },
      ],
      historico: [],
      total_tentativas: 3,
    });
    mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await agent.put('/repositor/avisos/1').send({ status: 'nao_encontrado' });
    expect(res.status).toBe(200);
    expect(res.body.stFinal).toBe('nao_encontrado');
  });

  test('atualização simples (sem aviso anterior) → 200', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await agent.put('/repositor/avisos/1').send({ status: 'buscado' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mensagem: 'Aviso atualizado!', stFinal: 'buscado' });
  });
});

/* ════════════════════════════════════════════════════════════
   POST /repositor/entrada-manual
════════════════════════════════════════════════════════════ */
describe('Repositor — entrada manual', () => {
  test('sem auth → 401', async () => {
    const res = await request(app).post('/repositor/entrada-manual').send({ codigo: 'X1' });
    expect(res.status).toBe(401);
  });

  test('perfil separador (não permitido) → 403', async () => {
    const agent = request.agent(app);
    await loginSeparador(agent);
    const res = await agent.post('/repositor/entrada-manual').send({ codigo: 'X1', descricao: 'Item' });
    expect(res.status).toBe(403);
  });

  test('perfil repositor → 200 e cria registro', async () => {
    const agent = request.agent(app);
    await loginRepositor(agent);
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 42 }] });
    const res = await agent.post('/repositor/entrada-manual').send({
      codigo: 'X1', descricao: 'Item Teste', quantidade: 2, obs: 'obs teste',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 42, mensagem: 'Entrada registrada!' });
  });

  test('perfil supervisor → 200 (também permitido)', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 43 }] });
    const res = await agent.post('/repositor/entrada-manual').send({ codigo: 'X2' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(43);
  });
});

/* ════════════════════════════════════════════════════════════
   PUT /repositor/avisos/:id/iniciar-busca
════════════════════════════════════════════════════════════ */
describe('Repositor — iniciar busca', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).put('/repositor/avisos/1/iniciar-busca');
    expect(res.status).toBe(401);
  });

  test('id inválido → 400', async () => {
    const res = await agent.put('/repositor/avisos/abc/iniciar-busca');
    expect(res.status).toBe(400);
  });

  test('aviso inexistente → 404', async () => {
    mockPool.connect.mockResolvedValueOnce(makeTxClient(null));
    const res = await agent.put('/repositor/avisos/1/iniciar-busca');
    expect(res.status).toBe(404);
  });

  test('já em verificando → 200 sincroniza e informa tentativa atual', async () => {
    mockPool.connect.mockResolvedValueOnce(makeTxClient({
      id: 1, status: 'verificando', total_tentativas: 2, tentativas: [{}, {}], numero_pedido: 'P1',
    }));
    const res = await agent.put('/repositor/avisos/1/iniciar-busca');
    expect(res.status).toBe(200);
    expect(res.body.mensagem).toMatch(/já em andamento/);
    expect(res.body.tentativa).toBe(2);
  });

  test('status diferente de pendente → 409', async () => {
    mockPool.connect.mockResolvedValueOnce(makeTxClient({ id: 1, status: 'abastecido', tentativas: [] }));
    const res = await agent.put('/repositor/avisos/1/iniciar-busca');
    expect(res.status).toBe(409);
    expect(res.body.erro).toMatch(/status atual: abastecido/);
  });

  test('máximo de 3 tentativas atingido → 409 e envia para liberação', async () => {
    mockPool.connect.mockResolvedValueOnce(makeTxClient({
      id: 1, status: 'pendente', tentativas: [{}, {}, {}], numero_pedido: 'P1',
    }));
    const res = await agent.put('/repositor/avisos/1/iniciar-busca');
    expect(res.status).toBe(409);
    expect(res.body.erro).toMatch(/Máximo de 3 tentativas/);
  });

  test('pendente sem tentativas → 200 inicia 1ª tentativa', async () => {
    mockPool.connect.mockResolvedValueOnce(makeTxClient({
      id: 1, status: 'pendente', tentativas: [], numero_pedido: 'P1',
    }));
    const res = await agent.put('/repositor/avisos/1/iniciar-busca');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mensagem: 'Busca iniciada!', tentativa: 1 });
  });
});

/* ════════════════════════════════════════════════════════════
   PUT /repositor/avisos/:id/lido-separador
════════════════════════════════════════════════════════════ */
describe('Repositor — lido-separador', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).put('/repositor/avisos/1/lido-separador');
    expect(res.status).toBe(401);
  });

  test('id inválido → 400', async () => {
    const res = await agent.put('/repositor/avisos/abc/lido-separador');
    expect(res.status).toBe(400);
  });

  test('id válido → 200', async () => {
    const res = await agent.put('/repositor/avisos/1/lido-separador');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mensagem: 'Aviso confirmado!' });
  });
});

/* ════════════════════════════════════════════════════════════
   GET /repositor/buscar-produto, /duplicatas, /duplicatas-dia,
   /avisos/separador/:separador_id
════════════════════════════════════════════════════════════ */
describe('Repositor — consultas auxiliares', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('GET /repositor/buscar-produto sem auth → 401', async () => {
    const res = await request(app).get('/repositor/buscar-produto?codigo=ABC');
    expect(res.status).toBe(401);
  });

  test('GET /repositor/buscar-produto sem código → 400', async () => {
    const res = await agent.get('/repositor/buscar-produto');
    expect(res.status).toBe(400);
    expect(res.body.erro).toBe('Código não informado');
  });

  test('GET /repositor/buscar-produto com código → 200 array', async () => {
    mockDb.all.mockResolvedValueOnce([{ codigo: 'ABC', descricao: 'Item' }]);
    const res = await agent.get('/repositor/buscar-produto?codigo=ABC');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /repositor/duplicatas sem auth → 401', async () => {
    const res = await request(app).get('/repositor/duplicatas');
    expect(res.status).toBe(401);
  });

  test('GET /repositor/duplicatas → 200 array', async () => {
    mockDb.all.mockResolvedValueOnce([]);
    const res = await agent.get('/repositor/duplicatas');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /repositor/duplicatas-dia sem auth → 401', async () => {
    const res = await request(app).get('/repositor/duplicatas-dia');
    expect(res.status).toBe(401);
  });

  test('GET /repositor/duplicatas-dia → 200 array', async () => {
    mockDb.all.mockResolvedValueOnce([]);
    const res = await agent.get('/repositor/duplicatas-dia');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /repositor/avisos/separador/:id sem auth → 401', async () => {
    const res = await request(app).get('/repositor/avisos/separador/5');
    expect(res.status).toBe(401);
  });

  test('GET /repositor/avisos/separador/:id → 200 array', async () => {
    mockDb.all.mockResolvedValueOnce([{ id: 1, status: 'subiu' }]);
    const res = await agent.get('/repositor/avisos/separador/5');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════
   PUT /repositor/avisos/:id/{reposto,encontrado,subiu,abastecido,nao_encontrado}
   (atualizarAviso + resolverAvisoEAcumularTempo)
════════════════════════════════════════════════════════════ */
describe.each([
  ['reposto'],
  ['encontrado'],
  ['subiu'],
  ['abastecido'],
  ['nao_encontrado'],
])('Repositor — ação rápida PUT /repositor/avisos/:id/%s', (acao) => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).put(`/repositor/avisos/1/${acao}`).send({});
    expect(res.status).toBe(401);
  });

  test('id válido → 200', async () => {
    // db.get default (null) faz resolverAvisoEAcumularTempo encerrar cedo (pedido não encontrado)
    const res = await agent.put(`/repositor/avisos/1/${acao}`).send({ qtd_encontrada: 3, repositor_nome: 'Fulano' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mensagem: 'Aviso atualizado!' });
  });
});

/* ════════════════════════════════════════════════════════════
   PUT /repositor/avisos/:id/{protocolo,devolucao} (atualizarAviso simples)
════════════════════════════════════════════════════════════ */
describe.each([
  ['protocolo'],
  ['devolucao'],
])('Repositor — PUT /repositor/avisos/:id/%s', (acao) => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  test('sem auth → 401', async () => {
    const res = await request(app).put(`/repositor/avisos/1/${acao}`).send({});
    expect(res.status).toBe(401);
  });

  test('id válido → 200', async () => {
    const res = await agent.put(`/repositor/avisos/1/${acao}`).send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mensagem: 'Aviso atualizado!' });
  });
});

/* ════════════════════════════════════════════════════════════
   PUT /repositor/avisos/:id/liberar (supervisor)
════════════════════════════════════════════════════════════ */
describe('Repositor — liberar (supervisor)', () => {
  test('sem auth → 401', async () => {
    const res = await request(app).put('/repositor/avisos/1/liberar').send({ decisao: 'encontrado' });
    expect(res.status).toBe(401);
  });

  test('perfil repositor (não permitido) → 403', async () => {
    const agent = request.agent(app);
    await loginRepositor(agent);
    const res = await agent.put('/repositor/avisos/1/liberar').send({ decisao: 'encontrado' });
    expect(res.status).toBe(403);
  });

  test('decisao=encontrado → status reposto', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.get.mockResolvedValueOnce({ historico: [] });     // busca historico
    mockDb.get.mockResolvedValueOnce({ item_id: 7 });        // busca item_id (status reposto)
    mockDb.get.mockResolvedValueOnce({ numero_pedido: 'P9' });// busca numero_pedido p/ emit
    const res = await agent.put('/repositor/avisos/1/liberar').send({ decisao: 'encontrado' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mensagem: 'Item liberado como Encontrado.' });
  });

  test('decisao padrão (nao_encontrado) → status protocolo', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.get.mockResolvedValueOnce({ historico: [] });
    mockDb.get.mockResolvedValueOnce({ numero_pedido: 'P9' });
    const res = await agent.put('/repositor/avisos/1/liberar').send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mensagem: 'Item liberado para Protocolo.' });
  });
});

/* ════════════════════════════════════════════════════════════
   GET /protocolo/historico, GET /protocolo,
   POST /protocolo/pedido/:pedido_id/encerrar
════════════════════════════════════════════════════════════ */
describe('Protocolo', () => {
  test('GET /protocolo/historico sem auth → 401', async () => {
    const res = await request(app).get('/protocolo/historico');
    expect(res.status).toBe(401);
  });

  test('GET /protocolo/historico → 200 array', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.all.mockResolvedValueOnce([{ id: 1, status: 'protocolado' }]);
    const res = await agent.get('/protocolo/historico');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /protocolo sem auth → 401', async () => {
    const res = await request(app).get('/protocolo');
    expect(res.status).toBe(401);
  });

  test('GET /protocolo → 200 array', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.all.mockResolvedValueOnce([]);
    const res = await agent.get('/protocolo');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /protocolo/pedido/:pedido_id/encerrar sem auth → 401', async () => {
    const res = await request(app).post('/protocolo/pedido/1/encerrar');
    expect(res.status).toBe(401);
  });

  test('POST /protocolo/pedido/:pedido_id/encerrar perfil repositor → 403', async () => {
    const agent = request.agent(app);
    await loginRepositor(agent);
    const res = await agent.post('/protocolo/pedido/1/encerrar');
    expect(res.status).toBe(403);
  });

  test('POST /protocolo/pedido/:pedido_id/encerrar sem itens em protocolo → 400', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.all.mockResolvedValueOnce([]);
    const res = await agent.post('/protocolo/pedido/1/encerrar');
    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/Nenhum item em protocolo/);
  });

  test('POST /protocolo/pedido/:pedido_id/encerrar com itens → 200 e encerra todos', async () => {
    const agent = request.agent(app);
    await loginSupervisor(agent);
    mockDb.all.mockResolvedValueOnce([
      { id: 1, historico: [] },
      { id: 2, historico: [] },
    ]);
    mockDb.get.mockResolvedValueOnce({ numero_pedido: 'P42' });
    const res = await agent.post('/protocolo/pedido/1/encerrar');
    expect(res.status).toBe(200);
    expect(res.body.itens_encerrados).toBe(2);
    expect(res.body.mensagem).toMatch(/P42/);
  });
});
