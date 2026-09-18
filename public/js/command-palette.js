/* ══ Command Palette (Ctrl+K) — V12 da evolução do WMS ══
   Não duplica a lista de páginas por perfil (montarSidebar, auth.js) —
   lê os itens JÁ renderizados em #sidebar .mi (que já respeitam o perfil
   logado) e reaproveita o onclick de cada um pra navegar, exatamente como
   um clique real no menu faria.
══════════════════════════════════════════════════════════════════════ */
let _cmdIndex = -1;
let _cmdItens = [];

function _cmdColetarItens() {
  const links = Array.from(document.querySelectorAll('#sidebar .mi'));
  return links.map(a => ({
    label: a.textContent.trim().replace(/\s*\d+$/, '').replace(/!\s*$/, '').trim(),
    executar: () => a.click(),
  }));
}

function abrirCommandPalette() {
  let modal = document.getElementById('cmd-palette');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'cmd-palette';
    modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;align-items:flex-start;justify-content:center;padding-top:12vh';
    modal.onclick = e => { if (e.target === modal) fecharCommandPalette(); };
    modal.innerHTML = `
      <div style="background:var(--surface);border-radius:14px;width:480px;max-width:92vw;box-shadow:0 20px 60px rgba(0,0,0,.4);overflow:hidden" onclick="event.stopPropagation()">
        <input id="cmd-input" type="text" placeholder="Ir para... ou digite o número de um pedido"
          style="width:100%;box-sizing:border-box;padding:16px 18px;border:none;border-bottom:1px solid var(--border);background:transparent;color:var(--text);font-size:15px;outline:none"
          oninput="_cmdFiltrar(this.value)" onkeydown="_cmdKeydown(event)"/>
        <div id="cmd-lista" style="max-height:50vh;overflow-y:auto;padding:6px"></div>
      </div>`;
    document.body.appendChild(modal);
  }
  modal.style.display = 'flex';
  const input = document.getElementById('cmd-input');
  input.value = '';
  _cmdFiltrar('');
  setTimeout(() => input.focus(), 10);
}

function fecharCommandPalette() {
  const modal = document.getElementById('cmd-palette');
  if (modal) modal.style.display = 'none';
}

function _cmdFiltrar(q) {
  const termo = q.trim().toLowerCase();
  const paginas = _cmdColetarItens().filter(i => i.label.toLowerCase().includes(termo));
  _cmdItens = [];
  if (/^\d{4,}$/.test(termo) && typeof irParaPedidoDashboard === 'function') {
    _cmdItens.push({ label: `Ir para o pedido #${termo}`, executar: () => irParaPedidoDashboard(termo) });
  }
  _cmdItens.push(...paginas);
  _cmdIndex = _cmdItens.length ? 0 : -1;
  _cmdRenderLista();
}

function _cmdRenderLista() {
  const el = document.getElementById('cmd-lista');
  if (!el) return;
  if (!_cmdItens.length) { el.innerHTML = '<div style="padding:16px;color:var(--text3);font-size:13px;text-align:center">Nada encontrado</div>'; return; }
  el.innerHTML = _cmdItens.map((it, i) => `
    <div class="cmd-item" data-i="${i}" onmouseenter="_cmdIndex=${i};_cmdRenderLista()" onclick="_cmdExecutar(${i})"
      style="padding:10px 12px;border-radius:8px;font-size:13px;font-weight:600;color:var(--text);cursor:pointer;${i===_cmdIndex?'background:var(--accent);color:#fff':''}">
      ${it.label}
    </div>`).join('');
}

function _cmdExecutar(i) {
  const item = _cmdItens[i];
  if (!item) return;
  fecharCommandPalette();
  item.executar();
}

function _cmdKeydown(e) {
  if (e.key === 'ArrowDown') { e.preventDefault(); _cmdIndex = Math.min(_cmdIndex + 1, _cmdItens.length - 1); _cmdRenderLista(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); _cmdIndex = Math.max(_cmdIndex - 1, 0); _cmdRenderLista(); }
  else if (e.key === 'Enter') { e.preventDefault(); _cmdExecutar(_cmdIndex); }
  else if (e.key === 'Escape') { fecharCommandPalette(); }
}

document.addEventListener('keydown', (e) => {
  const modal = document.getElementById('cmd-palette');
  const aberto = modal && modal.style.display === 'flex';
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    aberto ? fecharCommandPalette() : abrirCommandPalette();
  } else if (e.key === 'Escape' && aberto) {
    fecharCommandPalette();
  }
});
