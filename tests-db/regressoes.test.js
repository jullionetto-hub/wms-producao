/**
 * Banco REAL: regressao dos defeitos achados pela primeira varredura contra um Postgres de verdade.
 *  - GET /mapa-estoque respondia 500 (GROUP BY rua ambiguo: a tabela pedidos tem uma COLUNA chamada rua);
 *  - GET /stats/colaboradores respondia 500 (ligava checkout por uma coluna usuario_id que nao existe) e o painel
 *    "Colaboradores" ficava vazio sem avisar (o front descarta resposta nao-ok em silencio).
 */
const request = require('supertest');
const { pool } = require('../lib/db');
const { runSchema } = require('../src/database/migrate');
const { criarUsuarioPadrao } = require('../src/database/seed');
const { hashSenha, dataHoraLocal } = require('../lib/helpers');
const app = require('../index');

let agent;
beforeAll(async () => {
  await runSchema();
  await criarUsuarioPadrao();
  await pool.query(
    `INSERT INTO usuarios (nome, login, senha_hash, perfil, perfis_acesso, status, senha_temporaria, turno)
     VALUES ('Teste Todos', 'todos', $1, 'gestor', 'supervisor,separador,repositor,checkout,embalador', 'ativo', false, 'Manha')
     ON CONFLICT (login) DO NOTHING`, [hashSenha('teste123')]);
  agent = request.agent(app);
  const r = await agent.post('/auth/login').send({ login: 'todos', senha: 'teste123', perfil: 'gestor' });
  if (r.status !== 200) throw new Error('login de teste falhou: ' + r.status);
});
afterAll(async () => { await pool.end(); });

describe('GET /mapa-estoque (GROUP BY rua ambiguo)', () => {
  test('responde 200 com dados, inclusive pedidos em separacao (a consulta que quebrava)', async () => {
    // pedido em separacao com item num endereco da rua "Q" -> a consulta que usava "GROUP BY rua"
    const ped = (await pool.query(
      `INSERT INTO pedidos (numero_pedido, status, rua) VALUES ('REG-MAPA-1', 'separando', 'Q') RETURNING id`)).rows[0];
    await pool.query(
      `INSERT INTO itens_pedido (pedido_id, codigo, descricao, endereco, quantidade) VALUES ($1, 'REG-SKU', 'x', 'Q10', 1)`, [ped.id]);
    const r = await agent.get('/mapa-estoque');
    expect(r.status).toBe(200);
    expect(r.body.ruas).toBeDefined();
    expect(r.body.ruas.Q).toBeDefined();
    expect(r.body.ruas.Q.contadores.separacao).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /stats/colaboradores (coluna inexistente)', () => {
  test('responde 200 e conta o checkout concluido hoje do operador (ligado por operador_nome)', async () => {
    const { data } = dataHoraLocal();
    await pool.query(
      `INSERT INTO usuarios (nome, login, senha_hash, perfil, status, turno)
       VALUES ('Operador Reg', 'op_reg', $1, 'checkout', 'ativo', 'Manha') ON CONFLICT (login) DO NOTHING`, [hashSenha('x12345')]);
    const p1 = (await pool.query(`INSERT INTO pedidos (numero_pedido, status) VALUES ('REG-CK-1', 'concluido') RETURNING id`)).rows[0].id;
    const p2 = (await pool.query(`INSERT INTO pedidos (numero_pedido, status) VALUES ('REG-CK-2', 'concluido') RETURNING id`)).rows[0].id;
    await pool.query(
      `INSERT INTO checkout (pedido_id, numero_caixa, numero_pedido, status, data_checkout, operador_nome)
       VALUES ($2, 'CX1', 'REG-CK-1', 'concluido', $1, 'Operador Reg'), ($3, 'CX2', 'REG-CK-2', 'fila', $1, 'Operador Reg')`, [data, p1, p2]);
    const r = await agent.get('/stats/colaboradores');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.separadores)).toBe(true);
    expect(Array.isArray(r.body.repositores)).toBe(true);
    const op = r.body.checkouts.find((c) => c.nome === 'Operador Reg');
    expect(op).toBeDefined();
    expect(Number(op.ck_hoje)).toBe(1);          // so o concluido
    expect(Number(op.ck_total_hoje)).toBe(2);    // concluido + fila
  });
});
