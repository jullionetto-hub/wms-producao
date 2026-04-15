/* ══ UTILS.JS ══ WMS Miess ══ */


let isMobile = () => window.innerWidth <= 768;

async function apiFetch(url, opts={}) {
  try {
    const res = await fetch(url, { credentials:'include', ...opts });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.erro || `HTTP ${res.status}`), { status: res.status });
    return data;
  } catch(e) {
    if (e.name === 'TypeError') throw new Error('Sem conexão com o servidor');
    throw e;
  }
}

function sanitize(str, maxLen=200) {
  if (!str) return '';
  return String(str).trim().slice(0, maxLen);
}

// ── Segurança: escapa HTML para evitar XSS ──

function debounce(fn, ms=300) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), ms); };
}

// RetryFetch: retentar em caso de falha de rede
async function retryFetch(url, opts={}, retries=2) {
  for (let i=0; i<=retries; i++) {
    try { return await apiFetch(url, opts); }
    catch(e) { if (i===retries || e.status) throw e; await new Promise(r=>setTimeout(r,1000*(i+1))); }
  }
}

async function retryFetch(url, opts={}, retries=2) {
  for (let i=0; i<=retries; i++) {
    try { return await apiFetch(url, opts); }
    catch(e) { if (i===retries || e.status) throw e; await new Promise(r=>setTimeout(r,1000*(i+1))); }
  }
}

function setLoading(btn, loading, originalText=null) {
  if (!btn) return;
  if (loading) {
    btn._origText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span style="opacity:.7">⏳ Aguarde...</span>';
  } else {
    btn.disabled = false;
    btn.innerHTML = originalText || btn._origText || btn.innerHTML;
  }
}

function esc(str) {
  if (str === null || str === undefined) return '—';
  if (typeof str === 'number') return String(str);
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
let pedidoCaixaVinculada = false;

function hojeLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
const hoje = hojeLocal();
function labelSubtipoRepositor(v) {
  if (v === 'busca') return 'REPOSITOR BUSCA';
  if (v === 'abastecimento') return 'REPOSITOR ABASTECIMENTO';
  return 'REPOSITOR';
}

function labelSubtipoRepositor(v) {
  if (v === 'busca') return 'REPOSITOR BUSCA';
  if (v === 'abastecimento') return 'REPOSITOR ABASTECIMENTO';
  return 'REPOSITOR';
}
function modoRepositorAtual() {
  return usuarioAtual?.subtipo_repositor || 'geral';
}

function modoRepositorAtual() {
  return usuarioAtual?.subtipo_repositor || 'geral';
}
function toggleSubtipoRepositor() {
  const perf = document.getElementById('usr-perfil');
  const wrap = document.getElementById('usr-subtipo-wrap');
  if (!perf || !wrap) return;
  wrap.style.display = perf.value === 'repositor' ? 'block' : 'none';
  // Marca visualmente o perfil principal como ativo e desabilita o checkbox dele
  ['supervisor','separador','repositor','checkout'].forEach(p => {
    const cb  = document.getElementById(`perm-cb-${p}`);
    const lbl = document.getElementById(`perm-${p}`);
    if (!cb || !lbl) return;
    const isMain = p === perf.value;
    cb.disabled = isMain;
    cb.checked  = isMain ? false : cb.checked;
    lbl.style.opacity   = isMain ? '.5' : '1';
    lbl.style.cursor    = isMain ? 'not-allowed' : 'pointer';
    lbl.title = isMain ? 'Este é o perfil principal' : '';
    atualizarPermVisual(p);
  });
}

function atualizarRelogio() {
  const agora = new Date();
  const str   = agora.toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo' });
  const el    = document.getElementById('data-hora');
  if (el) el.textContent = str;
}

function toast(msg, tipo='info') {
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.textContent = msg;
  const root = document.getElementById('toast-root');
  root.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}