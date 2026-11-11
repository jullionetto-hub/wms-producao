/**
 * Gera types/db.d.ts: um tipo por tabela do banco, lido do proprio SQL do projeto
 * (CREATE TABLE + ALTER TABLE ... ADD COLUMN IF NOT EXISTS, em src/ routes/ lib/ index.ts).
 * Rode:  npm run gerar-tipos-db   (depois de mudar o schema). tests/tipos-db.test.js avisa se esquecer.
 *
 * Regras de conversao (conforme o que o driver "pg" devolve ao Node):
 *   SERIAL/INTEGER/SMALLINT/REAL/FLOAT      -> number
 *   BIGINT/BIGSERIAL/NUMERIC/DECIMAL        -> string   (pg devolve texto para nao perder precisao)
 *   TEXT/VARCHAR/CHAR                       -> string
 *   BOOLEAN                                 -> boolean
 *   TIMESTAMP/TIMESTAMPTZ/DATE              -> Date
 *   JSON/JSONB                              -> any
 *   BYTEA                                   -> Buffer   (arquivos/fotos guardados no banco)
 * Coluna "pode ser nula" = sem NOT NULL, sem DEFAULT e sem PRIMARY KEY/SERIAL.
 * (Coluna com DEFAULT e tratada como nao nula: na pratica o banco sempre a preenche.)
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const PASTAS = ['src', 'routes', 'lib'];
const SAIDA = path.join(RAIZ, 'types', 'db.d.ts');

function arquivosTs(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) arquivosTs(p, out);
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const TIPO_TS = {
  SERIAL: 'number', INTEGER: 'number', INT: 'number', SMALLINT: 'number', REAL: 'number', FLOAT: 'number', DOUBLE: 'number',
  BIGINT: 'string', BIGSERIAL: 'string', NUMERIC: 'string', DECIMAL: 'string',
  TEXT: 'string', VARCHAR: 'string', CHAR: 'string',
  BOOLEAN: 'boolean',
  TIMESTAMP: 'Date', TIMESTAMPTZ: 'Date', DATE: 'Date',
  JSON: 'any', JSONB: 'any',
  BYTEA: 'Buffer',
};

function dividirNivel0(texto) {
  const partes = []; let nivel = 0, atual = '';
  for (const c of texto) {
    if (c === '(') nivel++;
    if (c === ')') nivel--;
    if (c === ',' && nivel === 0) { partes.push(atual); atual = ''; } else atual += c;
  }
  if (atual.trim()) partes.push(atual);
  return partes;
}

function definirColuna(def) {
  const limpo = def.replace(/--.*$/gm, '').trim().replace(/\s+/g, ' ');
  const m = /^(\w+)\s+([A-Za-z]+)(?:\s+PRECISION)?(?:\(\d+(?:,\d+)?\))?(.*)$/i.exec(limpo);
  if (!m) return null;
  const [, nome, tipoSql, resto] = m;
  if (/^(PRIMARY|UNIQUE|FOREIGN|CONSTRAINT|CHECK)$/i.test(nome)) return null;
  const tipo = TIPO_TS[tipoSql.toUpperCase()] || 'any';
  const pk = /PRIMARY KEY/i.test(resto) || /SERIAL/i.test(tipoSql);
  // "DEFAULT NULL" explicito = a coluna PODE ser nula; qualquer outro DEFAULT conta como nao nula
  const defaultReal = /DEFAULT/i.test(resto) && !/DEFAULT\s+NULL\b/i.test(resto);
  const naoNula = pk || /NOT NULL/i.test(resto) || defaultReal;
  return { nome, tipo, nula: !naoNula && tipo !== 'any' };
}

function gerar() {
  const tabelas = new Map(); // nome -> Map(coluna -> def)
  const textos = PASTAS.flatMap((p) => arquivosTs(path.join(RAIZ, p))).concat(path.join(RAIZ, 'index.ts')).map((f) => fs.readFileSync(f, 'utf8'));

  // CREATE TABLE ... ( colunas )
  for (const t of textos) {
    const re = /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(/g;
    let m;
    while ((m = re.exec(t))) {
      let i = m.index + m[0].length, nivel = 1, corpo = '';
      for (; i < t.length && nivel > 0; i++) { const c = t[i]; if (c === '(') nivel++; if (c === ')') nivel--; if (nivel > 0) corpo += c; }
      const cols = tabelas.get(m[1]) || new Map();
      for (const d of dividirNivel0(corpo)) { const col = definirColuna(d); if (col && !cols.has(col.nome)) cols.set(col.nome, col); }
      tabelas.set(m[1], cols);
    }
  }
  // ALTER TABLE x ADD COLUMN IF NOT EXISTS col TIPO ...
  for (const t of textos) {
    const re = /ALTER TABLE\s+(\w+)\s+ADD COLUMN IF NOT EXISTS\s+(\w+)\s+([^`'";]+)/g;
    let m;
    while ((m = re.exec(t))) {
      if (!tabelas.has(m[1])) continue;
      const col = definirColuna(`${m[2]} ${m[3]}`);
      if (col && !tabelas.get(m[1]).has(col.nome)) tabelas.get(m[1]).set(col.nome, col);
    }
  }

  const linhas = [
    '// ARQUIVO GERADO por scripts/gerar-tipos-db.js — NAO EDITE A MAO. Rode: npm run gerar-tipos-db',
    '// Um tipo por tabela do banco, lido do SQL do proprio projeto. Uso:  db.get<Linha<\'pedidos\'>>(...)',
    '// Colunas com DEFAULT contam como nao nulas; BIGINT/NUMERIC chegam como string (assim o driver "pg" devolve).',
    '',
    'export interface Tabelas {',
  ];
  for (const nome of [...tabelas.keys()].sort()) {
    linhas.push(`  ${nome}: {`);
    for (const c of tabelas.get(nome).values()) linhas.push(`    ${c.nome}: ${c.tipo}${c.nula ? ' | null' : ''};`);
    linhas.push('  };');
  }
  linhas.push('}', '', 'export type Linha<T extends keyof Tabelas> = Tabelas[T];', '');
  return { texto: linhas.join('\n'), tabelas: tabelas.size, colunas: [...tabelas.values()].reduce((s, m) => s + m.size, 0) };
}

module.exports = { gerar, SAIDA };

if (require.main === module) {
  const r = gerar();
  fs.writeFileSync(SAIDA, r.texto, 'utf8');
  console.log(`types/db.d.ts gerado: ${r.tabelas} tabelas, ${r.colunas} colunas.`);
}
