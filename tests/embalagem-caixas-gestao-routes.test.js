/**
 * WMS Miess — Testes de rotas: embalagem, caixas, gestao
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

// Helper — autentica supervisor com bcrypt
const loginSupervisor = (agent) => {
  mockDb.get.mockResolvedValueOnce({
    id: 1, nome: 'Supervisor Test', login: 'admin',
    perfil: 'supervisor', senha_hash: HASH_ADMIN,
    subtipo_repositor: 'geral', perfis_acesso: '', turno: 'Manhã', status: 'ativo',
    senha_temporaria: false,
  });
  return agent.post('/auth/login').send({ login: 'admin', senha: SENHA_ADMIN, perfil: 'supervisor' });
};

// Helper — autentica embalador (perfil sem acesso a rotas de supervisor)
const loginEmbalador = (agent) => {
  mockDb.get.mockResolvedValueOnce({
    id: 3, nome: 'Embalador Test', login: 'emb1',
    perfil: 'embalador', senha_hash: bcrypt.hashSync('emb123', 4),
    subtipo_repositor: 'geral', perfis_acesso: '', turno: 'Manhã', status: 'ativo',
    senha_temporaria: false,
  });
  return agent.post('/auth/login').send({ login: 'emb1', senha: 'emb123', perfil: 'embalador' });
};

/* ════════════════════════════════════════════════════════════
   routes/embalagem.js
════════════════════════════════════════════════════════════ */
describe('routes/embalagem.js', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  describe('GET /embalagem', () => {
    test('sem auth → 401', async () => {
      const res = await request(app).get('/embalagem');
      expect(res.status).toBe(401);
    });

    test('sem filtros (default) → 200 com array', async () => {
      mockDb.all.mockResolvedValueOnce([{ id: 1, numero_pedido: '111', status_embalagem: 'pendente' }]);
      const res = await agent.get('/embalagem');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test('status=pendente → 200', async () => {
      mockDb.all.mockResolvedValueOnce([]);
      const res = await agent.get('/embalagem?status=pendente');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test('status=embalado com range ini/fim → 200', async () => {
      mockDb.all.mockResolvedValueOnce([]);
      const res = await agent.get('/embalagem?status=embalado&ini=2026-05-01&fim=2026-05-09');
      expect(res.status).toBe(200);
    });

    test('erro no banco → 500', async () => {
      mockDb.all.mockRejectedValueOnce(new Error('falha db'));
      const res = await agent.get('/embalagem');
      expect(res.status).toBe(500);
      expect(res.body.erro).toBeDefined();
    });
  });

  describe('PUT /embalagem/:id/iniciar', () => {
    test('sem auth → 401', async () => {
      const res = await request(app).put('/embalagem/1/iniciar');
      expect(res.status).toBe(401);
    });

    test('id inválido → 400', async () => {
      const res = await agent.put('/embalagem/abc/iniciar');
      expect(res.status).toBe(400);
      expect(res.body.erro).toBeDefined();
    });

    test('pedido não encontrado → 404', async () => {
      mockDb.get.mockResolvedValueOnce(null);
      const res = await agent.put('/embalagem/999/iniciar');
      expect(res.status).toBe(404);
    });

    test('pedido já embalado → 400', async () => {
      mockDb.get.mockResolvedValueOnce({ id: 1, numero_pedido: '111', status_embalagem: 'embalado' });
      const res = await agent.put('/embalagem/1/iniciar');
      expect(res.status).toBe(400);
    });

    test('happy path → 200 com mensagem e hora_inicio', async () => {
      mockDb.get.mockResolvedValueOnce({ id: 1, numero_pedido: '111', status_embalagem: 'pendente' });
      const res = await agent.put('/embalagem/1/iniciar');
      expect(res.status).toBe(200);
      expect(res.body.mensagem).toBe('Embalagem iniciada!');
      expect(res.body.numero_pedido).toBe('111');
      expect(res.body.hora_inicio).toBe('10:00');
    });
  });

  describe('PUT /embalagem/:id/confirmar', () => {
    test('sem auth → 401', async () => {
      const res = await request(app).put('/embalagem/1/confirmar');
      expect(res.status).toBe(401);
    });

    test('id inválido → 400', async () => {
      const res = await agent.put('/embalagem/xyz/confirmar');
      expect(res.status).toBe(400);
    });

    test('pedido não encontrado → 404', async () => {
      mockDb.get.mockResolvedValueOnce(null);
      const res = await agent.put('/embalagem/999/confirmar');
      expect(res.status).toBe(404);
    });

    test('pedido já embalado → 400', async () => {
      mockDb.get.mockResolvedValueOnce({ id: 1, numero_pedido: '111', status_embalagem: 'embalado' });
      const res = await agent.put('/embalagem/1/confirmar');
      expect(res.status).toBe(400);
    });

    test('happy path → 200 com mensagem e numero_pedido', async () => {
      mockDb.get.mockResolvedValueOnce({
        id: 1, numero_pedido: '111', status_embalagem: 'pendente',
        embalagem_iniciado_em: '09:50', cliente: 'Cliente X', transportadora: 'DRIVE SP', tem_prime: true,
      });
      const res = await agent.put('/embalagem/1/confirmar');
      expect(res.status).toBe(200);
      expect(res.body.mensagem).toBe('Embalagem concluída!');
      expect(res.body.numero_pedido).toBe('111');
      // registra INSERT em embalagem + UPDATE em pedidos via pool.query
      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('GET /embalagem/stats', () => {
    test('sem auth → 401', async () => {
      const res = await request(app).get('/embalagem/stats');
      expect(res.status).toBe(401);
    });

    test('happy path → 200 com data, stats e totais', async () => {
      mockDb.all.mockResolvedValueOnce([{ embalado_por: 'Fulano', total: 3, drive: 1, prime: 2 }]);
      mockDb.get.mockResolvedValueOnce({ total: 10, embalados: 3, pendentes: 7 });
      const res = await agent.get('/embalagem/stats');
      expect(res.status).toBe(200);
      expect(res.body.data).toBe('2026-05-09');
      expect(Array.isArray(res.body.stats)).toBe(true);
      expect(res.body.totais).toBeDefined();
    });
  });

  describe('GET /embalagem/lote/preview', () => {
    test('sem auth → 401', async () => {
      const res = await request(app).get('/embalagem/lote/preview?data=2026-05-09&separadores=Fulano');
      expect(res.status).toBe(401);
    });

    test('perfil sem permissão (embalador) → 403', async () => {
      const embAgent = request.agent(app);
      await loginEmbalador(embAgent);
      const res = await embAgent.get('/embalagem/lote/preview?data=2026-05-09&separadores=Fulano');
      expect(res.status).toBe(403);
    });

    test('sem data/separadores → 400', async () => {
      const res = await agent.get('/embalagem/lote/preview');
      expect(res.status).toBe(400);
    });

    test('happy path → 200 com total e pedidos', async () => {
      mockDb.all.mockResolvedValueOnce([
        { id: 1, numero_pedido: '111', separador_nome: 'Fulano' },
      ]);
      const res = await agent.get('/embalagem/lote/preview?data=2026-05-09&separadores=Fulano');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(Array.isArray(res.body.pedidos)).toBe(true);
    });
  });

  describe('PUT /embalagem/lote', () => {
    test('sem auth → 401', async () => {
      const res = await request(app).put('/embalagem/lote').send({ data: '2026-05-09', separadores: ['Fulano'] });
      expect(res.status).toBe(401);
    });

    test('perfil sem permissão (embalador) → 403', async () => {
      const embAgent = request.agent(app);
      await loginEmbalador(embAgent);
      const res = await embAgent.put('/embalagem/lote').send({ data: '2026-05-09', separadores: ['Fulano'] });
      expect(res.status).toBe(403);
    });

    test('sem data/separadores → 400', async () => {
      const res = await agent.put('/embalagem/lote').send({});
      expect(res.status).toBe(400);
    });

    test('happy path → 200 com mensagem e marcados', async () => {
      mockDb.all.mockResolvedValueOnce([
        { id: 1, numero_pedido: '111', separador_nome: 'Fulano', status: 'pendente' },
      ]);
      const res = await agent.put('/embalagem/lote').send({ data: '2026-05-09', separadores: ['Fulano'] });
      expect(res.status).toBe(200);
      expect(res.body.marcados).toBe(1);
      expect(res.body.mensagem).toContain('1 pedido');
    });

    test('nenhum pedido correspondente → 200 com marcados=0', async () => {
      mockDb.all.mockResolvedValueOnce([]);
      const res = await agent.put('/embalagem/lote').send({ data: '2026-05-09', separadores: ['Ninguem'] });
      expect(res.status).toBe(200);
      expect(res.body.marcados).toBe(0);
    });
  });
});

/* ════════════════════════════════════════════════════════════
   routes/caixas.js
════════════════════════════════════════════════════════════ */
describe('routes/caixas.js', () => {
  let agent;
  beforeEach(async () => {
    agent = request.agent(app);
    await loginSupervisor(agent);
  });

  describe('GET /caixas/checklist', () => {
    test('sem auth → 401', async () => {
      const res = await request(app).get('/caixas/checklist');
      expect(res.status).toBe(401);
    });

    test('happy path → 200 com 10 caixas', async () => {
      mockDb.all.mockResolvedValueOnce([
        { numero: 1, data: '2026-05-09', organizada: true, limpa: true, produtos_espalhados: false, objetos_indevidos: false },
      ]);
      const res = await agent.get('/caixas/checklist');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(10);
      expect(res.body[0].numero).toBe(1);
      expect(res.body[0].ok).toBe(true);
      expect(res.body[0].conferida_hoje).toBe(true);
    });

    test('caixa sem histórico → ok null e conferida_hoje false', async () => {
      mockDb.all.mockResolvedValueOnce([]);
      const res = await agent.get('/caixas/checklist');
      expect(res.status).toBe(200);
      expect(res.body[0].ok).toBeNull();
      expect(res.body[0].conferida_hoje).toBe(false);
      expect(res.body[0].ultima).toBeNull();
    });
  });

  describe('GET /caixas/checklist/log', () => {
    test('sem auth → 401', async () => {
      const res = await request(app).get('/caixas/checklist/log');
      expect(res.status).toBe(401);
    });

    test('sem filtros → 200 com array', async () => {
      mockDb.all.mockResolvedValueOnce([]);
      const res = await agent.get('/caixas/checklist/log');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test('com filtros (data_ini, data_fim, numero, turno) → 200', async () => {
      mockDb.all.mockResolvedValueOnce([{ id: 1, numero: 2 }]);
      const res = await agent.get('/caixas/checklist/log')
        .query({ data_ini: '2026-05-01', data_fim: '2026-05-09', numero: 2, turno: 'Manha' });
      expect(res.status).toBe(200);
      expect(res.body[0].numero).toBe(2);
    });
  });

  describe('GET /caixas/:numero/historico', () => {
    test('sem auth → 401', async () => {
      const res = await request(app).get('/caixas/1/historico');
      expect(res.status).toBe(401);
    });

    test('número inválido (0) → 400', async () => {
      const res = await agent.get('/caixas/0/historico');
      expect(res.status).toBe(400);
    });

    test('número inválido (>TOTAL_CAIXAS) → 400', async () => {
      const res = await agent.get('/caixas/11/historico');
      expect(res.status).toBe(400);
    });

    test('número não numérico → 400', async () => {
      const res = await agent.get('/caixas/abc/historico');
      expect(res.status).toBe(400);
    });

    test('happy path → 200 com array', async () => {
      mockDb.all.mockResolvedValueOnce([{ id: 1, numero: 3 }]);
      const res = await agent.get('/caixas/3/historico');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /caixas/:numero/checklist', () => {
    test('sem auth → 401', async () => {
      const res = await request(app).post('/caixas/1/checklist').send({ organizada: true });
      expect(res.status).toBe(401);
    });

    test('número inválido → 400', async () => {
      const res = await agent.post('/caixas/99/checklist').send({ organizada: true });
      expect(res.status).toBe(400);
    });

    test('happy path → 200 com mensagem e id', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 42 }] });
      const res = await agent.post('/caixas/5/checklist').send({
        organizada: true, limpa: true, produtos_espalhados: false, objetos_indevidos: false,
        observacoes: 'tudo ok', operador_nome: 'Fulano', turno: 'Manhã',
      });
      expect(res.status).toBe(200);
      expect(res.body.mensagem).toBe('Checklist registrado!');
      expect(res.body.id).toBe(42);
    });

    test('erro no banco → 500', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('falha insert'));
      const res = await agent.post('/caixas/5/checklist').send({ organizada: true });
      expect(res.status).toBe(500);
    });
  });
});

/* ════════════════════════════════════════════════════════════
   routes/gestao.js
════════════════════════════════════════════════════════════ */
describe('routes/gestao.js', () => {
  // Arquivo é apenas um placeholder histórico: o painel antigo de absenteísmo
  // (proxy pro FastAPI externo) foi removido e substituído pelo módulo nativo
  // (routes/absenteismo.js). O router exportado não define nenhuma rota própria.
  test('router não expõe rotas próprias (smoke test)', () => {
    const gestaoRouter = require('../routes/gestao');
    expect(gestaoRouter.stack.length).toBe(0);
  });
});
