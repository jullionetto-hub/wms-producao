/**
 * Roda os testes de banco REAL (tests-db/) contra um Postgres temporario, local, descartavel.
 *   npm run test:db            (todos)      |   npm run test:db -- schema   (so os que casam com "schema")
 *
 * Nada disso toca o banco de producao: o Postgres sobe em 127.0.0.1, numa pasta temporaria, e e apagado no fim.
 * Na PRIMEIRA execucao baixa o pacote "embedded-postgres" (~100 MB, binarios do PostgreSQL 17, licenca MIT) do npm
 * para %TEMP%/wms-pg-test — fora do projeto: nao entra no package.json nem no build do Railway.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const RAIZ = path.join(__dirname, '..');
const DIR_PG = path.join(os.tmpdir(), 'wms-pg-test');
const VERSAO = '17.11.0-beta.19';       // PostgreSQL 17.11 (o rotulo "beta" e do empacotamento, nao do banco)
const PORTA = Number(process.env.WMS_PG_TEST_PORT || 54329);

function garantirInstalado() {
  if (fs.existsSync(path.join(DIR_PG, 'node_modules', 'embedded-postgres'))) return;
  console.log(`Primeira execucao: baixando embedded-postgres@${VERSAO} (~100 MB) para ${DIR_PG} ...`);
  fs.mkdirSync(DIR_PG, { recursive: true });
  fs.writeFileSync(path.join(DIR_PG, 'package.json'), JSON.stringify({ name: 'wms-pg-test', version: '1.0.0', private: true }));
  const r = spawnSync(`npm install embedded-postgres@${VERSAO} --no-audit --no-fund --loglevel=error`, { cwd: DIR_PG, stdio: 'inherit', shell: true });
  if (r.status !== 0) { console.error('Falha ao instalar embedded-postgres.'); process.exit(1); }
}

async function main() {
  garantirInstalado();

  console.log('Compilando (npm run build)...');
  const b = spawnSync('npm run build', { cwd: RAIZ, stdio: 'inherit', shell: true });
  if (b.status !== 0) process.exit(b.status || 1);

  const EmbeddedPostgres = require('module').createRequire(path.join(DIR_PG, 'x.js'))('embedded-postgres').default;
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'wms-pgdata-'));
  const pg = new EmbeddedPostgres({ databaseDir: dados, user: 'postgres', password: 'senha', port: PORTA, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
  let codigo = 1;
  try {
    await pg.initialise();
    await pg.start();
    await pg.createDatabase('wms_test');
    const url = `postgres://postgres:senha@127.0.0.1:${PORTA}/wms_test`;
    console.log(`PostgreSQL local no ar em ${url.replace(/:senha@/, ':***@')}\n`);
    const jest = path.join(RAIZ, 'node_modules', 'jest', 'bin', 'jest.js');
    const r = spawnSync(process.execPath, [jest, '--config', 'jest.db.config.js', '--runInBand', '--forceExit', ...process.argv.slice(2)], {
      cwd: RAIZ, stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: url, SESSION_SECRET: 'teste-db', TESTE_BANCO_REAL: '1' },
    });
    codigo = r.status == null ? 1 : r.status;
  } finally {
    await pg.stop().catch(() => {});
    fs.rmSync(dados, { recursive: true, force: true });
  }
  process.exit(codigo);
}

main().catch((e) => { console.error(e); process.exit(1); });
