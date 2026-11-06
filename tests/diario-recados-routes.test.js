/**
 * Recado da gestão no Diário de Bordo (routes/diario-recados.js):
 * uma informação (texto + fotos) que vale para os 3 turnos. Ler = supervisor/gestor; escrever = só gestor.
 */
const request = require('supertest');
const bcrypt  = require('bcrypt');

const mockDb = { run: jest.fn().mockResolvedValue({ rows: [] }), get: jest.fn().mockResolvedValue(null), all: jest.fn().mockResolvedValue([]) };
const mockPool = {
  query: jest.fn().mockResolvedValue({ rows: [] }),
  connect: jest.fn().mockResolvedValue({ query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() }),
  on: jest.fn(),
};
const HASH = bcrypt.hashSync('senha123', 4);

jest.mock('../lib/db', () => ({ db: mockDb, pool: mockPool }));
jest.mock('../lib/helpers', () => ({ ...jest.requireActual('../lib/helpers'), dataHoraLocal: () => ({ data: '2026-11-06', hora: '10:00' }) }));

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

const login = (agent, perfil) => {
  mockDb.get.mockResolvedValueOnce({ id: 1, nome: perfil === 'gestor' ? 'Gestor' : 'Sup', login: 'u', perfil, senha_hash: HASH, subtipo_repositor: 'geral',
    perfis_acesso: '', turno: 'Manha', status: 'ativo', senha_temporaria: false });
  return agent.post('/auth/login').send({ login: 'u', senha: 'senha123', perfil });
};
const IMG = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg-bytes').toString('base64');

describe('autorização', () => {
  test.each([['get', '/diario-recados'], ['post', '/diario-recados'], ['put', '/diario-recados/1'], ['delete', '/diario-recados/1'],
    ['post', '/diario-recados/1/fotos'], ['get', '/diario-recados/foto/1'], ['delete', '/diario-recados/foto/1']])('%s %s sem login → 401', async (m, p) => {
    expect((await request(app)[m](p)).status).toBe(401);
  });

  test('supervisor lê, mas não cria/edita/encerra/anexa foto (403)', async () => {
    const a = request.agent(app); await login(a, 'supervisor');
    expect((await a.get('/diario-recados')).status).toBe(200);
    expect((await a.post('/diario-recados').send({ texto: 'x' })).status).toBe(403);
    expect((await a.put('/diario-recados/1').send({ texto: 'x' })).status).toBe(403);
    expect((await a.delete('/diario-recados/1')).status).toBe(403);
    expect((await a.post('/diario-recados/1/fotos').send({ imagem: IMG })).status).toBe(403);
    expect((await a.delete('/diario-recados/foto/1')).status).toBe(403);
  });
});

describe('gestor', () => {
  let a;
  beforeEach(async () => { a = request.agent(app); await login(a, 'gestor'); });

  test('GET devolve os recados ativos com os ids das fotos', async () => {
    mockDb.all.mockResolvedValueOnce([{ id: 7, titulo: 'T', texto: 'x', autor: 'G' }]);
    mockDb.all.mockResolvedValueOnce([{ id: 11, recado_id: 7 }, { id: 12, recado_id: 7 }]);
    const r = await a.get('/diario-recados');
    expect(r.status).toBe(200);
    expect(r.body[0].fotos).toEqual([{ id: 11 }, { id: 12 }]);
    expect(mockDb.all.mock.calls[0][0]).toContain('ativo=true');
  });

  test('POST cria (201) com título e texto aparados; texto vazio → 400; texto enorme → 400', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 9 }] });
    const ok = await a.post('/diario-recados').send({ titulo: '  Estoque  ', texto: '  caixas nas ruas  ' });
    expect(ok.status).toBe(201); expect(ok.body).toEqual({ id: 9 });
    const ins = mockPool.query.mock.calls.find(c => /INSERT INTO diario_recados/.test(c[0]));
    expect(ins[1].slice(0, 2)).toEqual(['Estoque', 'caixas nas ruas']);
    expect((await a.post('/diario-recados').send({ titulo: 'x', texto: '   ' })).status).toBe(400);
    expect((await a.post('/diario-recados').send({ texto: 'a'.repeat(4001) })).status).toBe(400);
  });

  test('PUT edita; recado inexistente/encerrado → 404', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 3 }] });
    expect((await a.put('/diario-recados/3').send({ titulo: 't', texto: 'novo' })).status).toBe(200);
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    expect((await a.put('/diario-recados/99').send({ titulo: 't', texto: 'novo' })).status).toBe(404);
  });

  test('DELETE encerra sem apagar (ativo=false)', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 3 }] });
    expect((await a.delete('/diario-recados/3')).status).toBe(200);
    const sql = mockPool.query.mock.calls.find(c => /UPDATE diario_recados SET ativo=false/.test(c[0]));
    expect(sql).toBeDefined();
    expect(mockPool.query.mock.calls.some(c => /DELETE FROM diario_recados/.test(c[0]))).toBe(false);
  });

  test('fotos: aceita imagem; recusa não-imagem, mais de 2 MB, recado encerrado e limite de 12', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 3 });
    mockDb.get.mockResolvedValueOnce({ n: 2 });
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 21 }] });
    const ok = await a.post('/diario-recados/3/fotos').send({ imagem: IMG });
    expect(ok.status).toBe(200); expect(ok.body).toEqual({ id: 21 });
    expect((await a.post('/diario-recados/3/fotos').send({ imagem: 'data:text/html;base64,PGI+' })).status).toBe(400);
    const grande = 'data:image/jpeg;base64,' + Buffer.alloc(2 * 1024 * 1024 + 10).toString('base64');
    expect((await a.post('/diario-recados/3/fotos').send({ imagem: grande })).status).toBe(400);
    mockDb.get.mockResolvedValueOnce(null);
    expect((await a.post('/diario-recados/3/fotos').send({ imagem: IMG })).status).toBe(404);
    mockDb.get.mockResolvedValueOnce({ id: 3 }); mockDb.get.mockResolvedValueOnce({ n: 12 });
    expect((await a.post('/diario-recados/3/fotos').send({ imagem: IMG })).status).toBe(400);
  });

  test('foto servida com o tipo certo; inexistente → 404', async () => {
    mockDb.get.mockResolvedValueOnce({ mime: 'image/jpeg', dados: Buffer.from([0xff, 0xd8, 0xff]) });
    const r = await a.get('/diario-recados/foto/21');
    expect(r.status).toBe(200); expect(r.headers['content-type']).toContain('image/jpeg');
    mockDb.get.mockResolvedValueOnce(null);
    expect((await a.get('/diario-recados/foto/22')).status).toBe(404);
  });
});
