/**
 * Banco REAL: fluxo de escrita do dia a dia, ponta a ponta, com SQL de verdade (transacoes, ON CONFLICT, RETURNING, xmax...):
 * importar pedidos -> reimportar (bloqueado) -> separar sem falta (gera checkout) -> separar com falta (avisa o repositor,
 * NAO conclui) -> painel de checkout.
 */
const request = require('supertest');
const { pool } = require('../lib/db');
const { runSchema } = require('../src/database/migrate');
const { criarUsuarioPadrao } = require('../src/database/seed');
const { hashSenha } = require('../lib/helpers');
const app = require('../index');

const SUFIXO = String(Date.now()).slice(-7);                 // numeros unicos por execucao
const PED_OK = `T${SUFIXO}1`;
const PED_FALTA = `T${SUFIXO}2`;
let agent;

const linhas = [
  { numero_pedido: PED_OK, codigo: 'SKU-A1', descricao: 'Item A1', endereco: 'A10', quantidade: 2, cliente: 'Ana', transportadora: 'SEDEX', aguardando_desde: '10/11/2026 08:00', estado: 'sp' },
  { numero_pedido: PED_OK, codigo: 'SKU-A2', descricao: 'Item A2', endereco: 'B20', quantidade: 1, cliente: 'Ana', transportadora: 'SEDEX' },
  { numero_pedido: PED_FALTA, codigo: 'SKU-B1', descricao: 'Item B1', endereco: 'C30', quantidade: 3, cliente: 'Bruno', transportadora: 'PAC', aguardando_desde: '10/11/2026 09:00', estado: 'rj' },
];

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

const pedido = async (numero) => (await pool.query('SELECT * FROM pedidos WHERE numero_pedido=$1', [numero])).rows[0];
const itens = async (pedidoId) => (await pool.query('SELECT * FROM itens_pedido WHERE pedido_id=$1 ORDER BY id', [pedidoId])).rows;

describe('importacao', () => {
  test('importa 2 pedidos novos com seus itens', async () => {
    const r = await agent.post('/pedidos/importar').send({ pedidos: linhas });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ importados: 2, erros: 0, repetidos: 0 });
    const p = await pedido(PED_OK);
    expect(p).toMatchObject({ status: 'pendente', cliente: 'Ana', transportadora: 'SEDEX', estado: 'SP', total_itens: 3, itens: 2 });
    expect(p.pontuacao).toBeGreaterThan(0);
    expect(await itens(p.id)).toHaveLength(2);
    expect(await itens((await pedido(PED_FALTA)).id)).toHaveLength(1);
  });

  test('importar o MESMO arquivo de novo e bloqueado (nao duplica pedido nem itens)', async () => {
    const r = await agent.post('/pedidos/importar').send({ pedidos: linhas });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ importados: 0, repetidos: 2 });
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM pedidos WHERE numero_pedido = ANY($1)', [[PED_OK, PED_FALTA]]);
    expect(rows[0].n).toBe(2);
    expect(await itens((await pedido(PED_OK)).id)).toHaveLength(2);
  });

  test('os pedidos importados aparecem na listagem', async () => {
    const r = await agent.get('/pedidos');
    expect(r.status).toBe(200);
    const numeros = JSON.stringify(r.body);
    expect(numeros).toContain(PED_OK);
    expect(numeros).toContain(PED_FALTA);
  });
});

describe('separacao sem falta -> checkout', () => {
  test('bipar, verificar todos os itens e concluir gera o registro de checkout em "fila"', async () => {
    const p = await pedido(PED_OK);
    const bip = await agent.post('/pedidos/bipar').send({ numero_pedido: PED_OK });
    expect(bip.status).toBe(200);
    expect((await pedido(PED_OK)).status).toBe('separando');

    // ainda ha item pendente: nao deixa concluir
    const cedo = await agent.put(`/pedidos/${p.id}/concluir`).send({});
    expect(cedo.status).toBe(400);

    for (const it of await itens(p.id)) {
      const v = await agent.put(`/itens/${it.id}/verificar`).send({ status: 'encontrado' });
      expect(v.status).toBe(200);
      expect(v.body.aviso).toBe(false);
    }
    const fim = await agent.put(`/pedidos/${p.id}/concluir`).send({});
    expect(fim.status).toBe(200);
    expect(fim.body.mensagem).toMatch(/concluido/i);

    const concluido = await pedido(PED_OK);
    expect(concluido.status).toBe('concluido');
    expect(concluido.concluido_em).not.toBe('');
    expect(concluido.skus_concluido_em).not.toBe('');
    const ck = (await pool.query('SELECT * FROM checkout WHERE pedido_id=$1', [p.id])).rows;
    expect(ck).toHaveLength(1);
    expect(ck[0]).toMatchObject({ status: 'fila', numero_pedido: PED_OK });
  });

  test('o painel de checkout lista o pedido que esta na fila', async () => {
    const r = await agent.get('/checkout');
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).toContain(PED_OK);
  });
});

describe('separacao com falta -> aviso ao repositor', () => {
  test('item em falta gera 1 aviso pendente e o pedido fica aguardando o repositor (nao conclui)', async () => {
    const p = await pedido(PED_FALTA);
    expect((await agent.post('/pedidos/bipar').send({ numero_pedido: PED_FALTA })).status).toBe(200);
    const [item] = await itens(p.id);

    const falta = await agent.put(`/itens/${item.id}/verificar`).send({ status: 'falta' });
    expect(falta.status).toBe(200);
    expect(falta.body).toMatchObject({ aviso: true });

    // repetir "falta" no mesmo item NAO cria segundo aviso (regra de atomicidade do codigo)
    await agent.put(`/itens/${item.id}/verificar`).send({ status: 'falta' });
    const avisos = (await pool.query('SELECT * FROM avisos_repositor WHERE item_id=$1', [item.id])).rows;
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ status: 'pendente', numero_pedido: PED_FALTA, codigo: 'SKU-B1' });

    expect((await pedido(PED_FALTA)).aguardando_repositor_desde).not.toBe('');

    const tentar = await agent.put(`/pedidos/${p.id}/concluir`).send({});
    expect(tentar.status).toBe(200);
    expect(tentar.body.aguardando).toBe(true);
    expect((await pedido(PED_FALTA)).status).toBe('separando');          // continua em separacao
  });
});
