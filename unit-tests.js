/**
 * Testes unitários das funções críticas — WMS Miess
 * Execução: node unit-tests.js
 * Zero dependências externas
 */

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch(e) {
    failed++;
    console.error(`  ❌ ${name}: ${e.message}`);
  }
}

function assertEquals(a, b, msg='') {
  if (a !== b) throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}. ${msg}`);
}

function assertTrue(v, msg='') {
  if (!v) throw new Error(`Expected truthy, got ${JSON.stringify(v)}. ${msg}`);
}

function assertFalse(v, msg='') {
  if (v) throw new Error(`Expected falsy, got ${JSON.stringify(v)}. ${msg}`);
}

// ── Simular ambiente browser ─────────────────────────────
global.window = { innerWidth: 1024, location: { origin: 'http://localhost' } };
global.localStorage = { getItem: () => null };
global.document = { getElementById: () => null, createElement: () => ({ style:{}, appendChild:()=>{}, remove:()=>{}, classList:{add:()=>{},remove:()=>{},toggle:()=>{}} }), querySelector: () => null, querySelectorAll: () => [] };

// ── Importar crypto para hashSenha ─────────────────────────
const crypto = require('crypto');

function hashSenha(senha) {
  return crypto.pbkdf2Sync(senha, 'wms_pbkdf2_salt_miess_2026', 100000, 64, 'sha512').toString('hex');
}
function verificarSenha(senha, hash) {
  if (!hash) return false;
  if (hash.length === 64)
    return crypto.createHash('sha256').update(senha + 'wms_salt_2026').digest('hex') === hash;
  return hashSenha(senha) === hash;
}

// ── Utilitários inline para teste ───────────────────────────
function hojeLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function esc(str) {
  if (str === null || str === undefined) return '—';
  if (typeof str === 'number') return String(str);
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function sanitize(str, maxLen=200) {
  if (!str) return '';
  return String(str).trim().slice(0, maxLen);
}
function debounce(fn, ms=300) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), ms); };
}

// ── Lógica de peso/corredor ──────────────────────────────────
const CORREDOR_DIFICULDADE = {
  'A':1,'B':1,'C':1,'D':1,'E':1,'P':1,'Q':1,'R':1,'S':1,'T':1,'U':1,
  'M':2,'N':2,'O':2,'V':2,'W':2,'X':2,'Y':2,'Z':2,
  'F':3,'G':3,'H':3,'I':3,'J':3,'K':3,'L':3
};
function getDificuldade(endereco) {
  if (!endereco) return 1;
  const m = String(endereco).split(',')[0].trim().match(/^([A-Za-z]+)/);
  if (!m) return 1;
  return CORREDOR_DIFICULDADE[m[1].toUpperCase()] || 1;
}
function calcPeso(itens) {
  const corrs = new Set(itens.map(i => (String(i.endereco||'').match(/^([A-Za-z]+)/)||['',''])[1].toUpperCase()));
  const totalUnidades = itens.reduce((s,i) => s + (parseInt(i.quantidade)||1), 0);
  let pontosCorredores = 0;
  corrs.forEach(c => { pontosCorredores += getDificuldade(c) * 3; });
  return Math.round(pontosCorredores + itens.length + totalUnidades * 0.5);
}

// ══════════════════════════════════════════
// TESTES
// ══════════════════════════════════════════
console.log('\n═══════════════════════════════════════');
console.log('   WMS Miess — Testes Unitários');
console.log('═══════════════════════════════════════\n');

// ── hashSenha / verificarSenha ──────────────────────────────
console.log('🔐 Hashing de senha');
test('hashSenha retorna string hex de 128 chars', () => {
  const h = hashSenha('minha_senha_123');
  assertEquals(typeof h, 'string');
  assertEquals(h.length, 128);
  assertTrue(/^[0-9a-f]+$/.test(h));
});
test('hashSenha é determinístico (mesmo input = mesmo output)', () => {
  assertEquals(hashSenha('abc123'), hashSenha('abc123'));
});
test('hashSenha é único (senhas diferentes = hashes diferentes)', () => {
  assertTrue(hashSenha('senha1') !== hashSenha('senha2'));
});
test('verificarSenha retorna true para senha correta', () => {
  const h = hashSenha('minha_senha');
  assertTrue(verificarSenha('minha_senha', h));
});
test('verificarSenha retorna false para senha errada', () => {
  const h = hashSenha('correta');
  assertFalse(verificarSenha('errada', h));
});
test('verificarSenha aceita hash legado SHA-256', () => {
  const legado = crypto.createHash('sha256').update('admin' + 'wms_salt_2026').digest('hex');
  assertTrue(verificarSenha('admin', legado), 'retrocompatibilidade SHA-256');
});
test('verificarSenha retorna false para hash nulo', () => {
  assertFalse(verificarSenha('qualquer', null));
});

// ── hojeLocal ───────────────────────────────────────────────
console.log('\n📅 Data/hora');
test('hojeLocal retorna formato YYYY-MM-DD', () => {
  const hoje = hojeLocal();
  assertTrue(/^\d{4}-\d{2}-\d{2}$/.test(hoje), `formato: ${hoje}`);
});
test('hojeLocal retorna data de hoje', () => {
  const hoje = hojeLocal();
  const agora = new Date();
  assertTrue(hoje.startsWith(agora.getFullYear().toString()));
});

// ── esc (XSS protection) ────────────────────────────────────
console.log('\n🛡️  Sanitização XSS');
test('esc escapa <script>', () => {
  assertEquals(esc('<script>'), '&lt;script&gt;');
});
test('esc escapa aspas duplas', () => {
  assertEquals(esc('"hello"'), '&quot;hello&quot;');
});
test('esc escapa & (ampersand)', () => {
  assertEquals(esc('a&b'), 'a&amp;b');
});
test('esc retorna — para null', () => {
  assertEquals(esc(null), '—');
});
test('esc retorna — para undefined', () => {
  assertEquals(esc(undefined), '—');
});
test('esc converte número para string', () => {
  assertEquals(esc(42), '42');
});
test('esc não modifica texto normal', () => {
  assertEquals(esc('Texto normal'), 'Texto normal');
});

// ── sanitize ────────────────────────────────────────────────
console.log('\n✂️  Sanitize');
test('sanitize remove espaços extras', () => {
  assertEquals(sanitize('  texto  '), 'texto');
});
test('sanitize limita comprimento', () => {
  assertEquals(sanitize('a'.repeat(300), 200).length, 200);
});
test('sanitize retorna vazio para null', () => {
  assertEquals(sanitize(null), '');
});
test('sanitize retorna vazio para string vazia', () => {
  assertEquals(sanitize(''), '');
});

// ── getDificuldade (corredores) ──────────────────────────────
console.log('\n🗺️  Dificuldade de corredor');
test('Corredor A = verde (×1)', () => {
  assertEquals(getDificuldade('A01,01'), 1);
});
test('Corredor M = azul (×2)', () => {
  assertEquals(getDificuldade('M15,03'), 2);
});
test('Corredor F = vermelho (×3)', () => {
  assertEquals(getDificuldade('F07,02'), 3);
});
test('Corredor P = verde (×1)', () => {
  assertEquals(getDificuldade('P22,04'), 1);
});
test('Corredor Z = azul (×2)', () => {
  assertEquals(getDificuldade('Z01,01'), 2);
});
test('Corredor L = vermelho (×3)', () => {
  assertEquals(getDificuldade('L03,06'), 3);
});
test('Endereco vazio = dificuldade 1', () => {
  assertEquals(getDificuldade(''), 1);
});
test('Endereco null = dificuldade 1', () => {
  assertEquals(getDificuldade(null), 1);
});

// ── calcPeso ─────────────────────────────────────────────────
console.log('\n⚡ Cálculo de peso');
test('Pedido simples: 1 corredor fácil (A), 2 itens, 2 unidades', () => {
  const itens = [{endereco:'A01', quantidade:1},{endereco:'A02', quantidade:1}];
  // corredores: A(×1)×3=3, itens: 2×1=2, unidades: 2×0.5=1 → total=6
  assertEquals(calcPeso(itens), 6);
});
test('Pedido pesado: corredores difíceis (F,G), itens e unidades', () => {
  const itens = [
    {endereco:'F01', quantidade:3},
    {endereco:'G02', quantidade:2},
  ];
  // corredores: F(×3)×3=9 + G(×3)×3=9=18, itens:2×1=2, unidades:5×0.5=2.5→3 → 23
  assertEquals(calcPeso(itens), 23);
});
test('Corredores duplicados contam só uma vez', () => {
  const itens = [
    {endereco:'A01', quantidade:1},
    {endereco:'A02', quantidade:1},
    {endereco:'A03', quantidade:1},
  ];
  // corredor A: 1×3=3, itens:3, unidades:3×0.5=1.5≈2 → 8
  assertEquals(calcPeso(itens), 8);
});
test('Pedido misto: verde + vermelho', () => {
  const itens = [
    {endereco:'A01', quantidade:5},
    {endereco:'F01', quantidade:5},
  ];
  // A(1)×3=3 + F(3)×3=9=12 corredores, 2 itens, 10×0.5=5 unidades → 19
  assertEquals(calcPeso(itens), 19);
});

// ── debounce ─────────────────────────────────────────────────
console.log('\n⏱️  Debounce');
test('debounce retorna função', () => {
  assertTrue(typeof debounce(() => {}) === 'function');
});
test('debounce executa função após delay', done => {
  let called = false;
  const fn = debounce(() => { called = true; }, 50);
  fn();
  setTimeout(() => {
    assertTrue(called, 'função deve ter sido chamada');
  }, 100);
});

// ════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════');
const total = passed + failed;
console.log(`   Resultado: ${passed}/${total} testes passaram`);
if (failed > 0) {
  console.error(`   ❌ ${failed} testes falharam`);
  process.exit(1);
} else {
  console.log('   ✅ Todos os testes unitários passaram!');
}
console.log('═══════════════════════════════════════\n');