/* UTILS.JS - WMS Miess */

async function apiFetch(url, opts) {
  opts = opts || {};
  try {
    var res = await fetch(url, Object.assign({ credentials:'include' }, opts));
    var data = await res.json().catch(function(){ return {}; });
    if (!res.ok) throw new Error(data.erro || 'HTTP ' + res.status);
    return data;
  } catch(e) {
    if (e.name === 'TypeError') throw new Error('Sem conexao com o servidor');
    throw e;
  }
}

function sanitize(str, maxLen) {
  maxLen = maxLen || 200;
  if (!str) return '';
  return String(str).trim().slice(0, maxLen);
}

function debounce(fn, ms) {
  ms = ms || 300;
  var t;
  return function() {
    var args = arguments;
    clearTimeout(t);
    t = setTimeout(function(){ fn.apply(null, args); }, ms);
  };
}

async function retryFetch(url, opts, retries) {
  retries = retries || 2;
  for (var i = 0; i <= retries; i++) {
    try { return await apiFetch(url, opts || {}); }
    catch(e) { if (i === retries || e.status) throw e; await new Promise(function(r){ setTimeout(r, 1000*(i+1)); }); }
  }
}

function setLoading(btn, loading) {
  if (!btn) return;
  if (loading) { btn._orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = 'Aguarde...'; }
  else { btn.disabled = false; btn.innerHTML = btn._orig || btn.innerHTML; }
}

function esc(str) {
  if (str === null || str === undefined) return '--';
  if (typeof str === 'number') return String(str);
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function hojeLocal() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function labelSubtipoRepositor(v) {
  if (v === 'busca') return 'REPOSITOR BUSCA';
  if (v === 'abastecimento') return 'REPOSITOR ABASTECIMENTO';
  return 'REPOSITOR';
}

function modoRepositorAtual() {
  return (usuarioAtual && usuarioAtual.subtipo_repositor) ? usuarioAtual.subtipo_repositor : 'geral';
}

function atualizarRelogio() {
  var agora = new Date();
  var str = agora.toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo' });
  var el = document.getElementById('data-hora');
  if (el) el.textContent = str;
}

function toast(msg, tipo) {
  tipo = tipo || 'info';
  var el = document.createElement('div');
  el.className = 'toast ' + tipo;
  el.textContent = msg;
  var root = document.getElementById('toast-root');
  if (root) root.appendChild(el);
  setTimeout(function(){ el.remove(); }, 3500);
}

function mostrarStatus(msg, tipo, pct) {
  var wrap = document.getElementById('import-status-wrap');
  var txt  = document.getElementById('import-status-txt');
  var bar  = document.getElementById('import-bar');
  var pctEl = document.getElementById('import-pct');
  if (wrap) wrap.style.display = 'block';
  if (txt) { txt.textContent = msg; txt.style.color = tipo==='erro' ? 'var(--red)' : tipo==='sucesso' ? 'var(--green)' : 'var(--text2)'; }
  if (pct !== null && pct !== undefined) {
    if (bar) { bar.style.width = pct + '%'; bar.style.background = pct >= 100 ? 'var(--green)' : 'var(--accent)'; }
    if (pctEl) { pctEl.textContent = pct + '%'; pctEl.style.color = pct >= 100 ? 'var(--green)' : 'var(--accent)'; }
  }
}
