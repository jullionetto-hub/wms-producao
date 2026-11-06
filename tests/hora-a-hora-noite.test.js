/**
 * Hora a Hora na madrugada: depois das 00h o turno da Noite em andamento começou ONTEM às 22h.
 * Antes o painel só contava os registros de "hoje" e perdia as 22h–24h.
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
  connect: jest.fn().mockResolvedValue({ query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() }),
  on: jest.fn(),
};
const HASH = bcrypt.hashSync('admin123', 4);

jest.mock('../lib/db', () => ({ db: mockDb, pool: mockPool }));
jest.mock('../lib/helpers', () => ({
  ...jest.requireActual('../lib/helpers'),
  dataHoraLocal: () => ({ data: '2026-11-06', hora: '01:30:00' }),
  turnoAtualEHorarios: () => ({ turno: 'Noite', fim_hora: '06:00', minutos_restantes: 270 }),
}));

let app;
beforeAll(() => {
  process.env.SESSION_SECRET = 'test_secret'; process.env.NODE_ENV = 'test'; process.env.DATABASE_URL = 'postgres://test';
  app = require('../index');
});
beforeEach(() => {
  jest.resetAllMocks();
  mockDb.get.mockResolvedValue(null); mockDb.all.mockResolvedValue([]); mockDb.run.mockResolvedValue({ rows: [] });
  mockPool.query.mockResolvedValue({ rows: [] });
  mockPool.connect.mockResolvedValue({ query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() });
});

const login = (agent) => {
  mockDb.get.mockResolvedValueOnce({ id: 1, nome: 'Sup', login: 'admin', perfil: 'supervisor', senha_hash: HASH, subtipo_repositor: 'geral',
    perfis_acesso: '', turno: 'Noite', status: 'ativo', senha_temporaria: false });
  return agent.post('/auth/login').send({ login: 'admin', senha: 'admin123', perfil: 'supervisor' });
};

describe('GET /hora-a-hora de madrugada (Noite)', () => {
  test('busca os registros desde a entrada do turno (ontem 22h), não só os de hoje', async () => {
    const agent = request.agent(app); await login(agent);
    mockDb.all.mockResolvedValueOnce([]);                       // metas
    mockDb.get.mockResolvedValueOnce({ valor: '6' });           // horas_turno_noite
    mockDb.all.mockResolvedValueOnce([{ hora: '23:10:00' }, { hora: '00:20:00' }]);   // embalagem (antes e depois da meia-noite)
    mockDb.all.mockResolvedValueOnce([{ hora: '23:40:00' }]);                          // checkout
    mockDb.all.mockResolvedValueOnce([]);                                              // faturamento

    const res = await agent.get('/hora-a-hora');
    expect(res.status).toBe(200);
    expect(res.body.embalagem.realizado).toBe(2);
    expect(res.body.expedicao.realizado).toBe(1);
    expect(res.body.embalagem.buckets[23]).toBe(1);   // 22h–24h do turno aparecem
    expect(res.body.embalagem.buckets[0]).toBe(1);

    // as 3 consultas usam a janela a partir de 22h de ontem
    const consultas = mockDb.all.mock.calls.slice(1, 4);
    consultas.forEach(([sql, params]) => {
      expect(params[0]).toBe('2026-11-05 22:00:00');
      expect(params[1]).toBe('2026-11-05');
      expect(sql).toContain('::timestamp >= $1::timestamp');
    });
  });
});

describe('GET /hora-a-hora/pedidos de madrugada', () => {
  test('a janela de 60 min atravessa a meia-noite: filtra por data >= ontem, não = hoje', async () => {
    const agent = request.agent(app); await login(agent);
    mockDb.get.mockResolvedValue({ n: 0 });
    const res = await agent.get('/hora-a-hora/pedidos');
    expect(res.status).toBe(200);
    const sqls = mockDb.get.mock.calls.map(c => [c[0], c[1]]).filter(([s]) => /FROM checkout|FROM embalagem/.test(s) && s.includes("INTERVAL '60 minutes'"));
    expect(sqls).toHaveLength(2);
    sqls.forEach(([s, p]) => { expect(s).toMatch(/data_(checkout|embalagem) >= \$1/); expect(p).toEqual(['2026-11-05']); });
  });
});
