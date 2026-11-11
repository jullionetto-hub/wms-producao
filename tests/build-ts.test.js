/**
 * Etapa 2 (TypeScript): cada arquivo .ts gera um .js ao lado (npm run build). O .js gerado
 * NAO pode ser versionado (a fonte e o .ts), nem pode existir um .js escrito a mao com o
 * mesmo nome de um .ts (o build sobrescreveria). Tambem confere que o build do Railway
 * roda a compilacao e a verificacao.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');

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

const fontes = [
  ...['lib', 'routes', 'src'].flatMap((d) => listarTs(path.join(RAIZ, d))),
  path.join(RAIZ, 'index.ts'),   // ponto de entrada
];
const rel = (p) => path.relative(RAIZ, p).split(path.sep).join('/');
const git = (...args) => execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8' });

describe('arquivos TypeScript e seus .js gerados', () => {
  test('existe pelo menos um .ts convertido', () => {
    expect(fontes.length).toBeGreaterThan(0);
  });

  test.each(fontes.map((f) => [rel(f)]))('%s: o .js gerado existe (rode npm run build)', (ts) => {
    expect(fs.existsSync(path.join(RAIZ, ts.replace(/\.ts$/, '.js')))).toBe(true);
  });

  test('o .js gerado de cada .ts esta no .gitignore (nao e versionado)', () => {
    const naoIgnorados = fontes
      .map((f) => rel(f).replace(/\.ts$/, '.js'))
      .filter((js) => {
        try { git('check-ignore', '-q', js); return false; } catch { return true; }
      });
    expect(naoIgnorados).toEqual([]);
  });

  test('nenhum .js gerado esta versionado no git', () => {
    const versionados = new Set(git('ls-files').split('\n').filter(Boolean));
    const gerados = fontes.map((f) => rel(f).replace(/\.ts$/, '.js'));
    expect(gerados.filter((js) => versionados.has(js))).toEqual([]);
  });
});

describe('build do Railway', () => {
  const railway = JSON.parse(fs.readFileSync(path.join(RAIZ, 'railway.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));

  test('buildCommand instala dev, compila e verifica', () => {
    const cmd = railway.build.buildCommand;
    expect(cmd).toContain('--include=dev');
    expect(cmd).toContain('npm run build');
    expect(cmd).toContain('npm run verificar-build');
    expect(cmd.indexOf('npm run build')).toBeLessThan(cmd.indexOf('npm run verificar-build'));
  });

  test('o servidor continua iniciando com "node index.js" (sem passo extra em tempo de execucao)', () => {
    expect(railway.deploy.startCommand).toBe('node index.js');
    expect(pkg.scripts.start).toBe('node index.js');
  });

  test('typescript e so devDependency (nao vai para a producao)', () => {
    expect(pkg.devDependencies.typescript).toBeDefined();
    expect((pkg.dependencies || {}).typescript).toBeUndefined();
  });
});
