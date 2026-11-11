/**
 * Banco REAL (Postgres 17 local e descartavel — ver scripts/test-db.js).
 * 1) O schema inteiro se aplica num banco vazio, SEM nenhuma instrucao falhando escondida
 *    (runSchema() engole erros de proposito: aqui cada instrucao e executada e tem que passar).
 * 2) Rodar de novo e inofensivo (idempotente).
 * 3) types/db.d.ts (gerado do SQL) bate com as colunas REAIS do banco: nomes, tipos e nulidade.
 */
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');
const { runSchema, ALTERATIONS } = require('../src/database/migrate');
const { TABLES, INDEXES } = require('../src/database/schema');

// tabela -> Map(coluna -> { ts, nula })
function lerTipos() {
  const dts = fs.readFileSync(path.join(__dirname, '..', 'types', 'db.d.ts'), 'utf8').replace(/\r\n/g, '\n');
  const out = new Map();
  for (const m of dts.matchAll(/^  (\w+): \{\n([\s\S]*?)^  \};/gm)) {
    const cols = new Map();
    for (const c of m[2].matchAll(/^    (\w+): (.+);$/gm)) cols.set(c[1], { ts: c[2].replace(/ \| null$/, ''), nula: / \| null$/.test(c[2]) });
    out.set(m[1], cols);
  }
  return out;
}
const TS_ESPERADO = { integer: 'number', smallint: 'number', real: 'number', 'double precision': 'number', bigint: 'string', numeric: 'string',
  text: 'string', 'character varying': 'string', character: 'string', boolean: 'boolean', json: 'any', jsonb: 'any', bytea: 'Buffer',
  date: 'Date', 'timestamp without time zone': 'Date', 'timestamp with time zone': 'Date' };

beforeAll(async () => {
  await runSchema();
  require('../index');                         // carrega as rotas (uma delas cria a tabela checkout_sessoes ao carregar)
  for (let i = 0; i < 50; i++) {               // espera ate 5s
    const r = await pool.query("SELECT to_regclass('checkout_sessoes') AS t");
    if (r.rows[0].t) break;
    await new Promise((ok) => setTimeout(ok, 100));
  }
});
afterAll(async () => { await pool.end(); });

describe('schema no Postgres real', () => {
  test(`as ${TABLES.length} instrucoes de TABLES executam sem erro`, async () => {
    for (const sql of TABLES) await expect(pool.query(sql)).resolves.toBeDefined();
  });
  test(`os ${INDEXES.length} INDEXES executam sem erro`, async () => {
    for (const sql of INDEXES) await expect(pool.query(sql)).resolves.toBeDefined();
  });
  test(`as ${ALTERATIONS.length} ALTERATIONS executam sem erro`, async () => {
    const falhas = [];
    for (const sql of ALTERATIONS) { try { await pool.query(sql); } catch (e) { falhas.push(`${e.message} :: ${sql.replace(/\s+/g, ' ').slice(0, 110)}`); } }
    expect(falhas).toEqual([]);
  });
  test('rodar o schema de novo e idempotente', async () => {
    await expect(runSchema()).resolves.toBeUndefined();
  });
});

describe('types/db.d.ts bate com o banco real', () => {
  let reais; const tipos = lerTipos();
  beforeAll(async () => {
    const r = await pool.query(`SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public'`);
    reais = new Map();
    for (const c of r.rows) { if (!reais.has(c.table_name)) reais.set(c.table_name, new Map()); reais.get(c.table_name).set(c.column_name, c); }
  });

  test('toda tabela tipada existe no banco e vice-versa (exceto tabelas de infraestrutura)', () => {
    const faltamNoBanco = [...tipos.keys()].filter((t) => !reais.has(t));
    const faltamNosTipos = [...reais.keys()].filter((t) => !tipos.has(t));
    expect(faltamNoBanco).toEqual([]);
    expect(faltamNosTipos).toEqual([]);
  });

  test('as colunas de cada tabela sao exatamente as tipadas', () => {
    const difs = [];
    for (const [tabela, cols] of tipos) {
      const reaisCols = reais.get(tabela) || new Map();
      for (const c of cols.keys()) if (!reaisCols.has(c)) difs.push(`${tabela}.${c}: tipada mas NAO existe no banco`);
      for (const c of reaisCols.keys()) if (!cols.has(c)) difs.push(`${tabela}.${c}: existe no banco mas NAO esta tipada`);
    }
    expect(difs).toEqual([]);
  });

  test('o tipo TypeScript de cada coluna corresponde ao tipo real do Postgres', () => {
    const difs = [];
    for (const [tabela, cols] of tipos) for (const [c, def] of cols) {
      const real = reais.get(tabela) && reais.get(tabela).get(c); if (!real) continue;
      const esperado = TS_ESPERADO[real.data_type];
      if (esperado === undefined) difs.push(`${tabela}.${c}: tipo SQL nao mapeado (${real.data_type})`);
      else if (def.ts !== esperado) difs.push(`${tabela}.${c}: banco=${real.data_type} (${esperado}) mas tipo gerado=${def.ts}`);
    }
    expect(difs).toEqual([]);
  });

  test('coluna NOT NULL no banco nunca e tipada como "| null"', () => {
    const difs = [];
    for (const [tabela, cols] of tipos) for (const [c, def] of cols) {
      const real = reais.get(tabela) && reais.get(tabela).get(c);
      if (real && real.is_nullable === 'NO' && def.nula) difs.push(`${tabela}.${c}`);
    }
    expect(difs).toEqual([]);
  });
});
