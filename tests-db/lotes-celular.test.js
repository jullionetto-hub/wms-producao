/**
 * Banco REAL: lotes formados pelo proprio celular do separador
 * (GET /pedidos/meus-lotes/sugestao e POST /pedidos/meus-lotes/confirmar).
 */
const request = require('supertest');
const { pool } = require('../lib/db');
const { runSchema } = require('../src/database/migrate');
const { hashSenha } = require('../lib/helpers');
const app = require('../index');

const S = String(Date.now()).slice(-6);
const num = (n) => `L${S}${n}`;
let agent, sepId, outroSepId;

async function criaPedido(n, { endereco = 'A10', transp = 'PAC', prime = false, sep = sepId } = {}) {
  const r = await pool.query(
    `INSERT INTO pedidos (numero_pedido, status, itens, total_itens, transportadora, tem_prime, separador_id, aguardando_desde)
     VALUES ($1,'pendente',1,1,$2,$3,$4,'10/11/2026 08:00') RETURNING id`, [num(n), transp, prime, sep]);
  await pool.query(
    `INSERT INTO itens_pedido (pedido_id, codigo, descricao, endereco, quantidade, status)
     VALUES ($1,$2,'x',$3,1,'pendente')`, [r.rows[0].id, `SKU${n}`, endereco]);
  return r.rows[0].id;
}

beforeAll(async () => {
  await runSchema();
  await pool.query(
    `INSERT INTO usuarios (nome, login, senha_hash, perfil, perfis_acesso, status, senha_temporaria, turno)
     VALUES ('Sep Lote', 'seplote', $1, 'separador', 'separador', 'ativo', false, 'Manha')
     ON CONFLICT (login) DO NOTHING`, [hashSenha('teste123')]);
  agent = request.agent(app);
  const r = await agent.post('/auth/login').send({ login: 'seplote', senha: 'teste123', perfil: 'separador' });
  if (r.status !== 200 || !r.body.separador) throw new Error('login de teste falhou: ' + r.status);
  sepId = r.body.separador.id;
  const o = await pool.query(`INSERT INTO separadores (nome, matricula) VALUES ('Outro', $1) RETURNING id`, ['M' + S]);
  outroSepId = o.rows[0].id;
});
afterAll(async () => { await pool.end(); });

describe('lotes formados pelo celular', () => {
  let ids;
  test('sugere lote so com pedidos do proprio separador, sem Drive Thru, sem misturar Prime', async () => {
    ids = [await criaPedido(1, { endereco: 'A10' }), await criaPedido(2, { endereco: 'B20' }), await criaPedido(3, { endereco: 'A11' })];
    await criaPedido(4, { transp: 'DRIVE THRU' });          // fica de fora
    await criaPedido(5, { prime: true });                   // sozinho no Prime: nao forma lote
    await criaPedido(6, { sep: outroSepId });               // de outro separador
    const r = await agent.get('/pedidos/meus-lotes/sugestao');
    expect(r.status).toBe(200);
    const todos = r.body.lotes.flatMap(l => l.pedidos.map(p => p.numero_pedido));
    expect(todos.sort()).toEqual([num(1), num(2), num(3)].sort());
    expect(r.body.lotes.every(l => l.pedidos.length >= 2 && l.pedidos.length <= 4)).toBe(true);
  });

  test('sem login de separador a sugestao e recusada', async () => {
    const r = await request(app).get('/pedidos/meus-lotes/sugestao');
    expect([401, 403]).toContain(r.status);
  });

  test('confirmar grava o lote, e uma segunda confirmacao dos mesmos pedidos da 409', async () => {
    const r = await agent.post('/pedidos/meus-lotes/confirmar').send({ pedido_ids: ids });
    expect(r.status).toBe(200);
    const { rows } = await pool.query('SELECT DISTINCT lote_id FROM pedidos WHERE id=ANY($1)', [ids]);
    expect(rows).toHaveLength(1);
    expect(rows[0].lote_id).toBe(r.body.lote_id);
    const de = await agent.post('/pedidos/meus-lotes/confirmar').send({ pedido_ids: ids });
    expect(de.status).toBe(409);
    // depois de formado, nao aparece mais como sugestao
    const s = await agent.get('/pedidos/meus-lotes/sugestao');
    expect(s.body.lotes).toHaveLength(0);
  });

  test('recusa lote de 1, lote acima de 4, pedido de outro separador e mistura Prime/normal', async () => {
    expect((await agent.post('/pedidos/meus-lotes/confirmar').send({ pedido_ids: [ids[0]] })).status).toBe(400);
    expect((await agent.post('/pedidos/meus-lotes/confirmar').send({ pedido_ids: [1, 2, 3, 4, 5] })).status).toBe(400);
    const a = await criaPedido(7), b = await criaPedido(8, { sep: outroSepId });
    expect((await agent.post('/pedidos/meus-lotes/confirmar').send({ pedido_ids: [a, b] })).status).toBe(409);
    const p = await criaPedido(9, { prime: true });
    expect((await agent.post('/pedidos/meus-lotes/confirmar').send({ pedido_ids: [a, p] })).status).toBe(400);
  });

  test('"tirar do lote" continua valendo para pedido a pedido', async () => {
    const r = await agent.put(`/pedidos/${ids[0]}/tirar-do-lote`).send({});
    expect(r.status).toBe(200);
    const { rows } = await pool.query('SELECT lote_id FROM pedidos WHERE id=$1', [ids[0]]);
    expect(rows[0].lote_id).toBeNull();
  });
});
