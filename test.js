/**
 * Testes das rotas críticas do WMS Miess
 * Para executar: node test.js
 * (Testes manuais sem dependência de Jest)
 */

const http = require('http');
const path = require('path');

// ── Test runner simples ──────────────────────────────────────────
let passed = 0, failed = 0, total = 0;

function assert(condition, name) {
  total++;
  if (condition) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.error(`  ❌ ${name}`); }
}

async function request(method, path, body=null, cookie='') {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: process.env.PORT || 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        let body = Buffer.concat(chunks);
        try {
          if (res.headers['content-encoding'] === 'gzip') {
            const zlib = require('zlib');
            body = zlib.gunzipSync(body);
          }
          resolve({ status: res.status || res.statusCode, data: JSON.parse(body.toString()), headers: res.headers });
        } catch(e) {
          resolve({ status: res.statusCode, data: body.toString(), headers: res.headers });
        }
      });
    });
    req.on('error', () => resolve({ status: 0, data: null }));
    if (data) req.write(data);
    req.end();
  });
}

// ── Testes ─────────────────────────────────────────────────────────────────
async function runTests() {
  console.log('\n═══════════════════════════════════════');
  console.log('   WMS Miess — Testes de Integração');
  console.log('═══════════════════════════════════════\n');

  // ── Auth ──────────────────────────────────────────────────────
  console.log('📋 Auth');

  const badLogin = await request('POST', '/auth/login', { login:'admin', senha:'errada', perfil:'supervisor' });
  assert(badLogin.status === 401, 'Login com senha errada retorna 401');
  assert(badLogin.data?.erro, 'Login inválido retorna mensagem de erro');

  const noPerfilLogin = await request('POST', '/auth/login', { login:'admin', senha:'123456' });
  assert(noPerfilLogin.status === 400, 'Login sem perfil retorna 400');

  const goodLogin = await request('POST', '/auth/login', { login:'admin', senha:'123456', perfil:'supervisor' });
  assert(goodLogin.status === 200, 'Login válido retorna 200');
  assert(goodLogin.data?.usuario, 'Login retorna objeto usuario');
  
  const cookie = goodLogin.headers?.['set-cookie']?.[0] || '';

  const me = await request('GET', '/auth/me', null, cookie);
  assert(me.status === 200, '/auth/me retorna usuário logado');
  assert(me.data?.usuario?.perfil === 'supervisor', '/auth/me retorna perfil correto');

  // ── Rotas protegidas sem auth ──────────────────────────────────
  console.log('\n🔒 Proteção de rotas');
  
  const noAuth = await request('GET', '/pedidos');
  assert(noAuth.status === 401, '/pedidos sem auth retorna 401');

  const noAuthUsers = await request('POST', '/usuarios', { nome:'Teste' });
  assert(noAuthUsers.status === 401, 'POST /usuarios sem auth retorna 401');

  // ── Rotas com auth ─────────────────────────────────────────────
  console.log('\n📦 Rotas autenticadas');

  const pedidos = await request('GET', '/pedidos', null, cookie);
  assert(pedidos.status === 200, 'GET /pedidos retorna 200');
  assert(Array.isArray(pedidos.data), 'GET /pedidos retorna array');

  const usuarios = await request('GET', '/usuarios', null, cookie);
  assert(usuarios.status === 200, 'GET /usuarios retorna 200');
  assert(Array.isArray(usuarios.data), 'GET /usuarios retorna array');

  const kpis = await request('GET', '/kpis', null, cookie);
  assert(kpis.status === 200, 'GET /kpis retorna 200');

  const cfg = await request('GET', '/configuracoes', null, cookie);
  assert(cfg.status === 200, 'GET /configuracoes retorna 200');
  assert(cfg.data?.meta_pedidos_dia, 'Configurações têm meta_pedidos_dia');

  const layout = await request('GET', '/layout-estoque', null, cookie);
  assert(layout.status === 200, 'GET /layout-estoque retorna 200');
  assert(layout.data?.corredores, 'Layout tem corredores');

  const alertas = await request('GET', '/alertas', null, cookie);
  assert(alertas.status === 200, 'GET /alertas retorna 200');

  // ── Validação de input ─────────────────────────────────────────
  console.log('\n✏️  Validação de input');

  const biparVazio = await request('POST', '/pedidos/bipar', {}, cookie);
  assert(biparVazio.status === 400, 'Bipar sem número retorna 400');

  const importarVazio = await request('POST', '/importar', { linhas: [] }, cookie);
  assert(importarVazio.status === 400, 'Importar vazio retorna 400');

  // ── Performance ────────────────────────────────────────────────
  console.log('\n⚡ Performance');

  const t0 = Date.now();
  await request('GET', '/layout-estoque', null, cookie);
  const t1 = Date.now();
  await request('GET', '/layout-estoque', null, cookie); // segunda vez (cache)
  const t2 = Date.now();
  assert(t2-t1 < t1-t0, `Cache funcionando: ${t1-t0}ms → ${t2-t1}ms`);

  // ── Compressão ─────────────────────────────────────────────────
  console.log('\n🗜️  Compressão');
  const gzipRes = await request('GET', '/pedidos', null, cookie);
  // Se gzip está ativo, headers terão content-encoding
  console.log('  ℹ️  Gzip:', gzipRes.headers['content-encoding'] === 'gzip' ? 'ativo' : 'verificar Accept-Encoding');

  // ── Resultado final ────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════');
  console.log(`   Resultado: ${passed}/${total} testes passaram`);
  if (failed > 0) console.error(`   ❌ ${failed} testes falharam`);
  else console.log('   ✅ Todos os testes passaram!');
  console.log('═══════════════════════════════════════\n');
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('\n❌ Erro ao executar testes:', e.message);
  console.error('   Certifique-se que o servidor está rodando na porta', process.env.PORT || 3000);
  process.exit(1);
});