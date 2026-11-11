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

/* ── Recado por turno: a gestão escolhe quais turnos veem (vazio/3 marcados = todos) ── */
describe('recado por turno', () => {
  const salvos = () => mockPool.query.mock.calls;
  const insert = () => salvos().find(c => /INSERT INTO diario_recados/.test(c[0]));
  const update = () => salvos().find(c => /UPDATE diario_recados SET titulo/.test(c[0]));

  describe('gestor grava os turnos', () => {
    let a;
    beforeEach(async () => { a = request.agent(app); await login(a, 'gestor'); mockPool.query.mockResolvedValue({ rows: [{ id: 9 }] }); });

    test('POST com 2 turnos guarda os dois, na ordem do dia (Manha antes de Noite)', async () => {
      expect((await a.post('/diario-recados').send({ texto: 'x', turnos: ['Noite', 'Manha'] })).status).toBe(201);
      expect(insert()[1]).toEqual(['', 'x', 'Gestor', 'Manha,Noite']);
    });
    test('aceita acento e "Madrugada" (= Noite), e texto separado por virgula', async () => {
      await a.post('/diario-recados').send({ texto: 'x', turnos: ['Manhã', 'Madrugada'] });
      expect(insert()[1][3]).toBe('Manha,Noite');
      mockPool.query.mockClear(); mockPool.query.mockResolvedValue({ rows: [{ id: 9 }] });
      await a.post('/diario-recados').send({ texto: 'x', turnos: 'Tarde' });
      expect(insert()[1][3]).toBe('Tarde');
    });
    test('os 3 turnos, lista vazia ou sem o campo = todos (guarda vazio)', async () => {
      for (const corpo of [{ turnos: ['Manha', 'Tarde', 'Noite'] }, { turnos: [] }, {}]) {
        mockPool.query.mockClear(); mockPool.query.mockResolvedValue({ rows: [{ id: 9 }] });
        expect((await a.post('/diario-recados').send({ texto: 'x', ...corpo })).status).toBe(201);
        expect(insert()[1][3]).toBe('');
      }
    });
    test('turno inexistente → 400 e nada e gravado', async () => {
      const r = await a.post('/diario-recados').send({ texto: 'x', turnos: ['Manha', 'Sabado'] });
      expect(r.status).toBe(400);
      expect(r.body.erro).toMatch(/Turno inv/);
      expect(insert()).toBeUndefined();
    });
    test('PUT troca os turnos; PUT SEM o campo (tela antiga) NAO mexe nos turnos ja salvos', async () => {
      await a.put('/diario-recados/3').send({ texto: 'novo', turnos: ['Tarde'] });
      expect(update()[1]).toEqual(['', 'novo', 3, 'Tarde']);
      expect(update()[0]).toMatch(/turnos=COALESCE\(\$4, turnos\)/);
      mockPool.query.mockClear(); mockPool.query.mockResolvedValue({ rows: [{ id: 3 }] });
      await a.put('/diario-recados/3').send({ texto: 'novo' });
      expect(update()[1][3]).toBeNull();                       // null => COALESCE mantem o valor atual
      mockPool.query.mockClear(); mockPool.query.mockResolvedValue({ rows: [{ id: 3 }] });
      expect((await a.put('/diario-recados/3').send({ texto: 'novo', turnos: ['Quinta'] })).status).toBe(400);
    });
  });

  describe('quem ve o que', () => {
    const RECADOS = [
      { id: 1, titulo: 'Todos', texto: 'a', autor: 'G', turnos: '' },
      { id: 2, titulo: 'So manha', texto: 'b', autor: 'G', turnos: 'Manha' },
      { id: 3, titulo: 'Tarde e noite', texto: 'c', autor: 'G', turnos: 'Tarde,Noite' },
      { id: 4, titulo: 'So noite', texto: 'd', autor: 'G', turnos: 'Noite' },
    ];
    const ids = r => r.body.map(x => x.id);
    const lista = async (perfil, query = '') => {
      const a = request.agent(app); await login(a, perfil);      // o usuario de teste e do turno "Manha"
      mockDb.all.mockResolvedValueOnce(RECADOS.map(r => ({ ...r }))).mockResolvedValueOnce([]);
      return a.get('/diario-recados' + query);
    };

    test('o GESTOR ve todos, com a lista de turnos de cada um (vazia = todos)', async () => {
      const r = await lista('gestor', '?turno=Noite');
      expect(ids(r)).toEqual([1, 2, 3, 4]);                        // mesmo olhando o turno Noite, ve os de Manha (precisa editar/encerrar)
      expect(r.body.map(x => x.turnos)).toEqual([[], ['Manha'], ['Tarde', 'Noite'], ['Noite']]);
    });
    test('supervisor olhando a Manha ve os de todos os turnos e os da Manha', async () => {
      expect(ids(await lista('supervisor', '?turno=Manha'))).toEqual([1, 2]);
    });
    test('supervisor olhando a Noite (seletor do Diario) ve os de todos e os que incluem Noite', async () => {
      expect(ids(await lista('supervisor', '?turno=Noite'))).toEqual([1, 3, 4]);
    });
    test('sem ?turno usa o turno do proprio usuario (Manha); turno desconhecido tambem', async () => {
      expect(ids(await lista('supervisor'))).toEqual([1, 2]);
      expect(ids(await lista('supervisor', '?turno=xyz'))).toEqual([1, 2]);
    });
    test('recado antigo (coluna turnos vazia/ausente) continua valendo para todos', async () => {
      const a = request.agent(app); await login(a, 'supervisor');
      mockDb.all.mockResolvedValueOnce([{ id: 8, titulo: 'antigo', texto: 'x', autor: 'G' }]).mockResolvedValueOnce([]);
      const r = await a.get('/diario-recados?turno=Tarde');
      expect(ids(r)).toEqual([8]);
      expect(r.body[0].turnos).toEqual([]);
    });
  });
});
