/**
 * Roda DEPOIS do build (npm run build) e ANTES do deploy valer: confere que cada arquivo .ts
 * gerou o seu .js e que o .js carrega sem erro. Se algo falhar, o build falha — e o Railway
 * mantem no ar a versao anterior em vez de subir um servidor que nao inicia.
 * Nao conecta no banco nem sobe servidor: so faz require dos modulos compilados.
 */
const fs = require('fs');
const path = require('path');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://verificacao-de-build';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'verificacao-de-build';

const RAIZ = path.join(__dirname, '..');
const PASTAS = ['lib', 'routes', 'src'];

function listarTs(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listarTs(p));
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const arquivos = PASTAS.flatMap((d) => listarTs(path.join(RAIZ, d)));
const falhas = [];
for (const ts of arquivos) {
  const js = ts.replace(/\.ts$/, '.js');
  const rel = path.relative(RAIZ, ts);
  if (!fs.existsSync(js)) { falhas.push(`${rel}: nao gerou o .js`); continue; }
  try { require(js); } catch (e) { falhas.push(`${rel}: erro ao carregar — ${e.message}`); }
}

if (falhas.length) {
  console.error('VERIFICACAO DO BUILD FALHOU:\n - ' + falhas.join('\n - '));
  process.exit(1);
}
console.log(`Build ok: ${arquivos.length} arquivo(s) TypeScript compilados e carregando.`);
process.exit(0);
