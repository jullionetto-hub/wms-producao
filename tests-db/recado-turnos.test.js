/**
 * Banco REAL: recado da gestao por turno, ponta a ponta (coluna diario_recados.turnos de verdade).
 * O gestor cria recados para todos / so Manha / so Noite; o supervisor ve so os do turno que esta olhando.
 */
const request = require('supertest');
const { pool } = require('../lib/db');
const { runSchema } = require('../src/database/migrate');
const { criarUsuarioPadrao } = require('../src/database/seed');
const { hashSenha } = require('../lib/helpers');
const app = require('../index');

const P = `RT${String(Date.now()).slice(-6)}`;           // prefixo unico desta execucao
let gestor, supervisor;

const novoUsuario = (login, perfil, turno, perfis = '') => pool.query(
  `INSERT INTO usuarios (nome, login, senha_hash, perfil, perfis_acesso, status, senha_temporaria, turno)
   VALUES ($1, $2, $3, $4, $5, 'ativo', false, $6) ON CONFLICT (login) DO NOTHING`, [login, login, hashSenha('teste123'), perfil, perfis, turno]);

beforeAll(async () => {
  await runSchema();
  await criarUsuarioPadrao();
  await novoUsuario('rt_gestor', 'gestor', 'Manha', 'supervisor');
  await novoUsuario('rt_super', 'supervisor', 'Manha');
  gestor = request.agent(app); supervisor = request.agent(app);
  if ((await gestor.post('/auth/login').send({ login: 'rt_gestor', senha: 'teste123', perfil: 'gestor' })).status !== 200) throw new Error('login gestor');
  if ((await supervisor.post('/auth/login').send({ login: 'rt_super', senha: 'teste123', perfil: 'supervisor' })).status !== 200) throw new Error('login supervisor');
});
afterAll(async () => { await pool.end(); });

const titulos = (r) => r.body.filter((x) => String(x.titulo).startsWith(P)).map((x) => x.titulo.slice(P.length + 1)).sort();
const criar = async (nome, turnos) => (await gestor.post('/diario-recados').send({ titulo: `${P} ${nome}`, texto: 'texto', ...(turnos ? { turnos } : {}) }));

describe('recado por turno (Postgres real)', () => {
  let idManha;
  beforeAll(async () => {
    expect((await criar('todos')).status).toBe(201);
    const m = await criar('manha', ['Manha']); expect(m.status).toBe(201); idManha = m.body.id;
    expect((await criar('noite', ['Noite'])).status).toBe(201);
    expect((await criar('tarde-noite', ['Noite', 'Tarde'])).status).toBe(201);
    // recado "antigo": gravado direto, sem informar turnos (o default do banco e vazio = todos)
    await pool.query(`INSERT INTO diario_recados (titulo, texto, autor) VALUES ($1, 'x', 'antigo')`, [`${P} antigo`]);
  });

  test('a coluna guarda "" para todos e a lista ordenada para os demais', async () => {
    const { rows } = await pool.query(`SELECT titulo, turnos FROM diario_recados WHERE titulo LIKE $1`, [`${P} %`]);
    const por = Object.fromEntries(rows.map((r) => [r.titulo.slice(P.length + 1), r.turnos]));
    expect(por).toEqual({ todos: '', manha: 'Manha', noite: 'Noite', 'tarde-noite': 'Tarde,Noite', antigo: '' });
  });

  test('o gestor ve TODOS, com os turnos de cada um', async () => {
    const r = await gestor.get('/diario-recados?turno=Noite');          // mesmo olhando a Noite
    expect(titulos(r)).toEqual(['antigo', 'manha', 'noite', 'tarde-noite', 'todos']);
    const tn = r.body.find((x) => x.titulo === `${P} tarde-noite`);
    expect(tn.turnos).toEqual(['Tarde', 'Noite']);
    expect(r.body.find((x) => x.titulo === `${P} todos`).turnos).toEqual([]);
  });

  test.each([
    ['Manha', ['antigo', 'manha', 'todos']],
    ['Tarde', ['antigo', 'tarde-noite', 'todos']],
    ['Noite', ['antigo', 'noite', 'tarde-noite', 'todos']],
  ])('o supervisor olhando o turno %s ve so os que valem para ele', async (turno, esperado) => {
    expect(titulos(await supervisor.get(`/diario-recados?turno=${turno}`))).toEqual(esperado);
  });

  test('sem escolher turno, o supervisor (turno Manha) ve os da Manha e os de todos', async () => {
    expect(titulos(await supervisor.get('/diario-recados'))).toEqual(['antigo', 'manha', 'todos']);
  });

  test('editar sem informar turnos mantem; editar com turnos troca; turno invalido e recusado', async () => {
    expect((await gestor.put(`/diario-recados/${idManha}`).send({ titulo: `${P} manha`, texto: 'novo texto' })).status).toBe(200);
    expect((await pool.query('SELECT turnos FROM diario_recados WHERE id=$1', [idManha])).rows[0].turnos).toBe('Manha');   // inalterado
    expect((await gestor.put(`/diario-recados/${idManha}`).send({ titulo: `${P} manha`, texto: 'novo texto', turnos: ['Tarde'] })).status).toBe(200);
    expect(titulos(await supervisor.get('/diario-recados?turno=Manha'))).not.toContain('manha');
    expect(titulos(await supervisor.get('/diario-recados?turno=Tarde'))).toContain('manha');
    expect((await gestor.put(`/diario-recados/${idManha}`).send({ texto: 'x', turnos: ['Sabado'] })).status).toBe(400);
  });

  test('so o gestor cria: o supervisor continua recebendo 403', async () => {
    expect((await supervisor.post('/diario-recados').send({ texto: 'x', turnos: ['Manha'] })).status).toBe(403);
  });
});
