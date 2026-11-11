/**
 * types/db.d.ts e GERADO a partir do SQL do projeto (scripts/gerar-tipos-db.js).
 * Se alguem mudar o banco (CREATE TABLE / ALTER TABLE ... ADD COLUMN) e esquecer de regenerar,
 * este teste falha e diz o comando: npm run gerar-tipos-db
 */
const fs = require('fs');
const path = require('path');
const { gerar, SAIDA } = require('../scripts/gerar-tipos-db');

const norm = (s) => s.replace(/\r\n/g, '\n');

describe('tipos das tabelas do banco (types/db.d.ts)', () => {
  const gerado = gerar();
  const atual = norm(fs.readFileSync(SAIDA, 'utf8'));

  test('esta atualizado em relacao ao SQL do projeto (rode: npm run gerar-tipos-db)', () => {
    expect(atual).toBe(norm(gerado.texto));
  });

  test('cobre todas as tabelas criadas em src/database/schema.ts', () => {
    const schema = fs.readFileSync(path.join(__dirname, '..', 'src', 'database', 'schema.ts'), 'utf8');
    const nomes = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
    expect(nomes.length).toBeGreaterThan(40);
    for (const n of nomes) expect(atual).toContain(`\n  ${n}: {`);
  });

  test('colunas com DEFAULT NULL ou sem NOT NULL/DEFAULT aceitam null; BIGINT/NUMERIC chegam como string', () => {
    expect(atual).toMatch(/lote_id: number \| null;/);          // pedidos.lote_id INTEGER DEFAULT NULL
    expect(atual).toMatch(/data_pedido: string \| null;/);      // pedidos.data_pedido TEXT (sem default)
    expect(atual).toMatch(/\n    id: number;/);                // SERIAL PRIMARY KEY nunca e nulo
  });
});
