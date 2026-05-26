
async function marcarSituacaoDesk(id, situacao) {
  const labels = { subiu:'⬆️ Subiu', devolucao:'↩️ Devolução', protocolo:'📋 Protocolo' };
  if (!confirm(`Marcar como ${labels[situacao]||situacao}?`)) return;
  try {
    const res = await fetch(`${API}/repositor/avisos/${id}`, {
      credentials:'include', method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ situacao, status: situacao })
    });
    if (res.ok) { toast(`Marcado como ${labels[situacao]||situacao}`, 'success'); carregarTabelaReposicao(); }
    else toast('Erro ao salvar', 'danger');
  } catch(e) { toast('Sem conexão', 'danger'); }
}

async function marcarProtocolo(id) {
  if (!confirm('Marcar este item como Protocolo?')) return;
  try {
    const res = await fetch(`${API}/repositor/avisos/${id}`, {
      credentials:'include', method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ situacao:'protocolo', status:'protocolo' })
    });
    if (res.ok) { toast('Marcado como Protocolo', 'success'); carregarTabelaReposicao(); }
    else toast('Erro ao salvar', 'danger');
  } catch(e) { toast('Sem conexão', 'danger'); }
}


function toggleItensColaborador(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'table-row' : 'none';
}

/* REPOSITOR — fluxo em 3 etapas */

let _todosUsuarios = [];
let _filtroSituacaoRep = '';
let _filtroMobileRep   = '';   // valor do filtro customizado mobile

/* ── Inicialização ─────────────────────────────────────────────────── */
function ativarMobileRep() {
  document.body.classList.add('rep-mobile');
  document.getElementById('rep-mobile-root').style.display = 'flex';
  document.getElementById('rep-tabbar').style.display = 'flex';
  carregarUsuariosParaRep();
  mudarTabRep('separar');
  setInterval(() => {
    const aba = document.querySelector('.rep-tab.ativo')?.id?.replace('rtab-','') || 'separar';
    if      (aba === 'separar')   carregarRepSeparar(true);
    else if (aba === 'separado')  carregarRepSeparado(true);
    else if (aba === 'subiu')     carregarRepSubiu(true);
    else if (aba === 'protocolo') carregarRepProtocolo(true);
  }, 30000);
}

const _REP_TABS_LIST = ['separar','separado','subiu','protocolo','stats'];

function mudarTabRep(tab) {
  _REP_TABS_LIST.forEach(t => {
    const pg = document.getElementById(`rep-tab-${t}`);
    const bt = document.getElementById(`rtab-${t}`);
    if (pg) pg.classList.toggle('ativa', t === tab);
    if (bt) bt.classList.toggle('ativo', t === tab);
  });
  if      (tab === 'separar')   carregarRepSeparar();
  else if (tab === 'separado')  carregarRepSeparado();
  else if (tab === 'subiu')     carregarRepSubiu();
  else if (tab === 'protocolo') carregarRepProtocolo();
  else if (tab === 'stats')     carregarStatsRepMobile();
}

/* ── Usuários ──────────────────────────────────────────────────────── */
async function carregarUsuariosParaRep() {
  try {
    const res = await fetch(`${API}/usuarios`, { credentials:'include' });
    _todosUsuarios = res.ok ? await res.json() : [];
  } catch(e) { _todosUsuarios = []; }
}

function optionsUsuarios(selecionado='') {
  const lista = _todosUsuarios
    .filter(u => u.status === 'ativo')
    .sort((a,b) => a.nome.localeCompare(b.nome));
  return `<option value="">— Selecionar —</option>` +
    lista.map(u =>
      `<option value="${u.nome}" ${u.nome===selecionado?'selected':''}>${u.nome}</option>`
    ).join('');
}

function corSituacao(sit) {
  return {
    pendente:'#f59e0b', verificando:'#8b5cf6', buscado:'#3b82f6',
    separado:'#3b82f6', aguardando_abastecer:'#f97316',
    subiu:'#0ea5e9', abastecido:'#10b981',
    protocolo:'#6b7280', devolucao:'#a855f7', nao_encontrado:'#ef4444'
  }[sit] || '#6b7280';
}

function labelSituacao(sit) {
  return {
    pendente:'⏳ Separar', verificando:'🔍 Verificando',
    buscado:'📦 Separado', separado:'📦 Separado',
    aguardando_abastecer:'🕐 Aguard. Entregar',
    subiu:'⬆️ Subiu', abastecido:'✅ Abastecido',
    protocolo:'📋 Protocolo', devolucao:'↩️ Devolução',
    nao_encontrado:'❌ Não encontrado'
  }[sit] || sit;
}

/* ══════════════════════════════════════════════════════════════════
   MOBILE — ABAS (Separar / Separado / Subiu / Protocolo / Stats)
══════════════════════════════════════════════════════════════════ */

/* ── Compatibilidade socket-client.js ─────────────────────────────── */
function carregarAvisosMobile() {
  const aba = document.querySelector('.rep-tab.ativo')?.id?.replace('rtab-','') || 'separar';
  if      (aba === 'separar')   carregarRepSeparar(true);
  else if (aba === 'separado')  carregarRepSeparado(true);
  else if (aba === 'subiu')     carregarRepSubiu(true);
  else if (aba === 'protocolo') carregarRepProtocolo(true);
  _atualizarBadgesRep();
}

async function _atualizarBadgesRep() {
  try {
    const res = await fetch(`${API}/repositor/avisos`, { credentials:'include' });
    if (!res.ok) return;
    const av = await res.json();
    const setBdg = (id, n) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = n;
      el.style.display = n ? 'inline-flex' : 'none';
    };
    const cnt = (sits) => av.filter(a => sits.includes(a.situacao||a.status)).length;
    const nSeparar   = cnt(['pendente']);
    const nSeparado  = cnt(['verificando','buscado','separado','aguardando_abastecer']);
    const nSubiu     = cnt(['subiu']);
    const nProtocolo = cnt(['nao_encontrado']);
    // Mobile badges
    setBdg('rtab-separar-badge',   nSeparar);
    setBdg('rtab-separado-badge',  nSeparado);
    setBdg('rtab-subiu-badge',     nSubiu);
    setBdg('rtab-protocolo-badge', nProtocolo);
    // Desktop badges
    setBdg('d-rtab-separar-badge',   nSeparar);
    setBdg('d-rtab-separado-badge',  nSeparado);
    setBdg('d-rtab-subiu-badge',     nSubiu);
    setBdg('d-rtab-protocolo-badge', nProtocolo);
    const setC = (id, n) => { const e=document.getElementById(id); if(e) e.textContent=n; };
    // Mobile counters
    setC('rep-cnt-separar',   nSeparar);
    setC('rep-cnt-separado',  nSeparado);
    setC('rep-cnt-subiu',     nSubiu);
    setC('rep-cnt-protocolo', nProtocolo);
    // Desktop counters
    setC('d-rep-cnt-separar',   nSeparar);
    setC('d-rep-cnt-separado',  nSeparado);
    setC('d-rep-cnt-subiu',     nSubiu);
    setC('d-rep-cnt-protocolo', nProtocolo);
  } catch(e) {}
}

/* ── Carregamento por aba ─────────────────────────────────────────── */
async function carregarRepSeparar(silent=false) {
  const el  = document.getElementById('rep-lista-separar');
  const elD = document.getElementById('d-rep-lista-separar');
  if (!el && !elD) return;
  try {
    const res = await fetch(`${API}/repositor/avisos?status=pendente`, { credentials:'include' });
    if (!res.ok) throw new Error();
    const av = await res.json();
    const n = av.length;
    const cntEl = document.getElementById('rep-cnt-separar');
    const bdgEl = document.getElementById('rtab-separar-badge');
    if (cntEl) cntEl.textContent = n;
    if (bdgEl) { bdgEl.textContent = n; bdgEl.style.display = n ? 'inline-flex' : 'none'; }
    const html = n
      ? av.map(a => renderCardRepSimples(a, 'separar')).join('')
      : `<div style="text-align:center;padding:60px 16px"><div style="font-size:48px;margin-bottom:12px">✅</div><div style="color:var(--text3);font-size:15px;font-weight:500">Nenhum item para separar</div></div>`;
    if (el)  el.innerHTML  = html;
    if (elD) elD.innerHTML = html;
  } catch(e) {
    const errHtml = `<div style="color:#ef4444;text-align:center;padding:24px;font-size:13px">Erro ao carregar — toque 🔄</div>`;
    if (!silent) {
      if (el)  el.innerHTML  = errHtml;
      if (elD) elD.innerHTML = errHtml;
    }
  }
}

async function carregarRepSeparado(silent=false) {
  const el  = document.getElementById('rep-lista-separado');
  const elD = document.getElementById('d-rep-lista-separado');
  if (!el && !elD) return;
  try {
    const res = await fetch(`${API}/repositor/avisos?status=verificando,buscado,separado,aguardando_abastecer`, { credentials:'include' });
    if (!res.ok) throw new Error();
    const av = await res.json();
    const n = av.length;
    const cntEl = document.getElementById('rep-cnt-separado');
    const bdgEl = document.getElementById('rtab-separado-badge');
    if (cntEl) cntEl.textContent = n;
    if (bdgEl) { bdgEl.textContent = n; bdgEl.style.display = n ? 'inline-flex' : 'none'; }
    const html = n
      ? av.map(a => renderCardRepSimples(a, 'separado')).join('')
      : `<div style="text-align:center;padding:60px 16px"><div style="font-size:48px;margin-bottom:12px">📦</div><div style="color:var(--text3);font-size:15px;font-weight:500">Nenhum item separado</div></div>`;
    if (el)  el.innerHTML  = html;
    if (elD) elD.innerHTML = html;
  } catch(e) {
    const errHtml = `<div style="color:#ef4444;text-align:center;padding:24px;font-size:13px">Erro ao carregar — toque 🔄</div>`;
    if (!silent) {
      if (el)  el.innerHTML  = errHtml;
      if (elD) elD.innerHTML = errHtml;
    }
  }
}

async function carregarRepSubiu(silent=false) {
  const el  = document.getElementById('rep-lista-subiu');
  const elD = document.getElementById('d-rep-lista-subiu');
  if (!el && !elD) return;
  try {
    const res = await fetch(`${API}/repositor/avisos?status=subiu`, { credentials:'include' });
    if (!res.ok) throw new Error();
    const av = await res.json();
    const n = av.length;
    const cntEl = document.getElementById('rep-cnt-subiu');
    const bdgEl = document.getElementById('rtab-subiu-badge');
    if (cntEl) cntEl.textContent = n;
    if (bdgEl) { bdgEl.textContent = n; bdgEl.style.display = n ? 'inline-flex' : 'none'; }
    const html = n
      ? av.map(a => renderCardRepSimples(a, 'subiu')).join('')
      : `<div style="text-align:center;padding:60px 16px"><div style="font-size:48px;margin-bottom:12px">⬆️</div><div style="color:var(--text3);font-size:15px;font-weight:500">Nenhum item subiu</div></div>`;
    if (el)  el.innerHTML  = html;
    if (elD) elD.innerHTML = html;
  } catch(e) {
    const errHtml = `<div style="color:#ef4444;text-align:center;padding:24px;font-size:13px">Erro ao carregar — toque 🔄</div>`;
    if (!silent) {
      if (el)  el.innerHTML  = errHtml;
      if (elD) elD.innerHTML = errHtml;
    }
  }
}

async function carregarRepProtocolo(silent=false) {
  const el  = document.getElementById('rep-lista-protocolo');
  const elD = document.getElementById('d-rep-lista-protocolo');
  if (!el && !elD) return;
  try {
    const res = await fetch(`${API}/repositor/avisos?status=nao_encontrado`, { credentials:'include' });
    if (!res.ok) throw new Error();
    const av = await res.json();
    const n = av.length;
    const cntEl = document.getElementById('rep-cnt-protocolo');
    const bdgEl = document.getElementById('rtab-protocolo-badge');
    if (cntEl) cntEl.textContent = n;
    if (bdgEl) { bdgEl.textContent = n; bdgEl.style.display = n ? 'inline-flex' : 'none'; }
    const html = n
      ? av.map(a => renderCardRepSimples(a, 'protocolo')).join('')
      : `<div style="text-align:center;padding:60px 16px"><div style="font-size:48px;margin-bottom:12px">📋</div><div style="color:var(--text3);font-size:15px;font-weight:500">Nenhum item em protocolo</div></div>`;
    if (el)  el.innerHTML  = html;
    if (elD) elD.innerHTML = html;
  } catch(e) {
    const errHtml = `<div style="color:#ef4444;text-align:center;padding:24px;font-size:13px">Erro ao carregar — toque 🔄</div>`;
    if (!silent) {
      if (el)  el.innerHTML  = errHtml;
      if (elD) elD.innerHTML = errHtml;
    }
  }
}

/* ── Card simplificado por aba ────────────────────────────────────── */
function renderCardRepSimples(a, modo) {
  const sit        = a.situacao || a.status || 'pendente';
  const cor        = corSituacao(sit);
  const nomeLogado = (usuarioAtual?.nome || '').replace(/'/g, "\\'");
  const qtd        = a.quantidade || 1;

  const envio    = (a.forma_envio || '').trim();
  const isDrive  = /drive|retirada/i.test(envio);
  const envioBdg = envio
    ? `<span style="background:${isDrive?'#fee2e2':'var(--surface2)'};color:${isDrive?'#dc2626':'var(--text2)'};border:1px solid ${isDrive?'#fca5a5':'var(--border)'};font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px">${isDrive?'🚗':'📦'} ${envio}</span>`
    : '';

  let botoes = '';
  if (modo === 'separar') {
    botoes = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px 14px;border-top:1px solid var(--border)">
        <button onclick="acaoRepTab(${a.id},'e_separado','${nomeLogado}','separado')"
          style="padding:12px;background:#eff6ff;border:2px solid #3b82f6;border-radius:10px;color:#1d4ed8;font-weight:700;font-size:13px;cursor:pointer;touch-action:manipulation">
          📦 Separado
        </button>
        <button onclick="acaoRepTab(${a.id},'e_nao_enc','${nomeLogado}','protocolo')"
          style="padding:12px;background:#fee2e2;border:2px solid #ef4444;border-radius:10px;color:#dc2626;font-weight:700;font-size:13px;cursor:pointer;touch-action:manipulation">
          ❌ Não enc.
        </button>
      </div>`;
  } else if (modo === 'separado') {
    botoes = `
      <div style="padding:12px 14px;border-top:1px solid var(--border)">
        <button onclick="acaoRepTab(${a.id},'e_subiu','${nomeLogado}','subiu')"
          style="width:100%;padding:14px;background:#e0f2fe;border:2px solid #0ea5e9;border-radius:10px;color:#0369a1;font-weight:700;font-size:14px;cursor:pointer;touch-action:manipulation">
          ⬆️ Subiu
        </button>
      </div>`;
  } else if (modo === 'subiu') {
    botoes = `
      <div style="padding:12px 14px;border-top:1px solid var(--border)">
        <button onclick="acaoRepTab(${a.id},'e_abastecido','${nomeLogado}','done')"
          style="width:100%;padding:14px;background:#dcfce7;border:2px solid #10b981;border-radius:10px;color:#065f46;font-weight:700;font-size:14px;cursor:pointer;touch-action:manipulation">
          ✅ Abastecido
        </button>
      </div>`;
  } else if (modo === 'protocolo') {
    botoes = `
      <div style="padding:10px 14px;border-top:1px solid var(--border);background:#fff1f2;border-radius:0 0 14px 14px">
        <div style="font-size:12px;color:#be123c;font-weight:600;text-align:center">⏳ Aguardando liberação do supervisor</div>
        ${a.quem_pegou?`<div style="font-size:11px;color:#9f1239;text-align:center;margin-top:3px">Registrado por: ${a.quem_pegou}</div>`:''}
      </div>`;
  }

  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-left:4px solid ${cor};border-radius:14px;margin-bottom:10px;overflow:hidden">
      <div style="padding:14px 14px ${botoes?'8':'14'}px">
        <div style="font-family:'Space Mono',monospace;font-size:16px;font-weight:700;color:var(--text);margin-bottom:2px">${a.codigo||'—'}</div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:8px;line-height:1.4">${a.descricao||''}</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center">
          ${a.numero_pedido?`<span style="background:var(--surface2);border-radius:8px;padding:3px 9px;font-size:11px;color:var(--text2);font-weight:600">📋 ${a.numero_pedido}</span>`:''}
          ${a.separador_nome?`<span style="background:var(--surface2);border-radius:8px;padding:3px 9px;font-size:11px;color:var(--text2)">👤 ${a.separador_nome}</span>`:''}
          <span style="background:#fee2e2;border-radius:8px;padding:3px 9px;font-size:11px;font-weight:800;color:#dc2626">${qtd} un</span>
          ${envioBdg}
          ${a.endereco?`<span style="background:var(--surface2);border-radius:8px;padding:3px 9px;font-size:10px;color:var(--text3)">📍 ${a.endereco}</span>`:''}
        </div>
        ${a.quem_pegou && modo !== 'separar' ? `<div style="margin-top:6px;font-size:11px;color:var(--text3)">📦 <strong style="color:var(--text2)">${a.quem_pegou}</strong></div>` : ''}
        ${a.hora_aviso?`<div style="margin-top:4px;font-size:10px;color:var(--text3)">🕐 ${a.hora_aviso}${a.data_aviso?' · '+a.data_aviso:''}</div>`:''}
      </div>
      ${botoes}
    </div>`;
}

/* ── Ação rápida por aba ──────────────────────────────────────────── */
async function acaoRepTab(id, acao, nomeLogado, proximaTab) {
  const body = {};
  if (acao === 'e_separado') {
    body.situacao = 'buscado';        body.status = 'buscado';
    body.quem_pegou = nomeLogado;     body.qtd_encontrada = 0;
  } else if (acao === 'e_nao_enc') {
    body.situacao = 'nao_encontrado'; body.status = 'nao_encontrado';
    body.quem_pegou = nomeLogado;     body.qtd_encontrada = 0;
  } else if (acao === 'e_subiu') {
    body.situacao = 'subiu';  body.status = 'subiu';
    body.quem_pegou = nomeLogado;
  } else if (acao === 'e_abastecido') {
    body.situacao = 'abastecido'; body.status = 'abastecido';
    body.quem_pegou = nomeLogado; body.quem_guardou = nomeLogado;
  }
  try {
    const res = await fetch(`${API}/repositor/avisos/${id}`, {
      credentials:'include', method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    if (res.ok) {
      toast('Salvo!', 'success');
      if (proximaTab === 'done') { carregarRepSubiu(); _atualizarBadgesRep(); }
      else if (proximaTab) {
        mudarTabRep(proximaTab);
        mudarTabRepDesk(proximaTab);
        _atualizarBadgesRep();
      }
    } else { toast('Erro ao salvar', 'danger'); }
  } catch(e) { toast('Sem conexão', 'danger'); }
}

/* ── Funções legadas (dropdown) mantidas para compatibilidade ─────── */
function toggleFiltroRepMobile(e) {
  e && e.stopPropagation();
  const drop = document.getElementById('m-rep-fdrop');
  const seta = document.getElementById('m-rep-fseta');
  const box  = document.getElementById('m-rep-fbox');
  const open = drop?.style.display !== 'none';
  if (drop) drop.style.display = open ? 'none' : 'block';
  if (seta) seta.style.transform = open ? '' : 'rotate(180deg)';
  if (box)  box.style.borderColor = open ? 'var(--border)' : 'var(--accent)';
}
function escolherFiltroRepMobile(val, label, el) {
  _filtroMobileRep = val;
  const valEl = document.getElementById('m-rep-fval');
  const drop  = document.getElementById('m-rep-fdrop');
  const seta  = document.getElementById('m-rep-fseta');
  const box   = document.getElementById('m-rep-fbox');
  if (valEl) valEl.textContent = label;
  if (drop)  drop.style.display = 'none';
  if (seta)  seta.style.transform = '';
  if (box)   box.style.borderColor = 'var(--border)';
  document.querySelectorAll('.m-rfopt').forEach(o => o.classList.remove('ativo'));
  if (el) el.classList.add('ativo');
  carregarAvisosMobile();
}

async function carregarAvisosMobile() {
  const el  = document.getElementById('m-lista-avisos');
  const cnt = document.getElementById('m-rep-pend');
  if (!el) return;
  const primeiraVez = el.children.length === 0 || el.innerHTML.includes('Nenhum item') || el.innerHTML.includes('Erro');
  try {
    const url = `${API}/repositor/avisos${_filtroMobileRep ? '?status=' + _filtroMobileRep : ''}`;
    const res = await fetch(url, { credentials:'include' });
    if (!res.ok) throw new Error('Servidor retornou ' + res.status);
    const avisos = await res.json();
    const pend = avisos.filter(a => ['pendente','verificando','buscado','aguardando_abastecer'].includes(a.situacao||a.status)).length;
    if (cnt) cnt.textContent = pend;
    if (!avisos.length) {
      el.innerHTML = `<div style="text-align:center;padding:60px 16px">
        <div style="font-size:48px;margin-bottom:12px">✅</div>
        <div style="color:var(--text3);font-size:15px;font-weight:500">Nenhum item em falta</div>
      </div>`;
      return;
    }
    el.innerHTML = avisos.map(a => renderCardMobile(a)).join('');
  } catch(e) {
    if (primeiraVez) {
      el.innerHTML = `<div style="color:#ef4444;text-align:center;padding:24px">Erro ao carregar — toque 🔄 para tentar novamente</div>`;
    }
  }
}

function renderCardMobile(a) {
  const sit          = a.situacao || a.status || 'pendente';
  const nomeLogado   = usuarioAtual?.nome || '';
  const qtdSolic     = a.quantidade || 1;
  const cor          = corSituacao(sit);

  // Parse historico com segurança
  let hist = [];
  try { hist = Array.isArray(a.historico) ? a.historico : (a.historico ? JSON.parse(a.historico) : []); } catch{}

  // ── Badge de status ──
  const BADGES = {
    pendente:            `<span style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px">⏳ Separar</span>`,
    verificando:         `<span style="background:#f3e8ff;color:#6b21a8;border:1px solid #d8b4fe;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px">🔍 Verificando</span>`,
    buscado:             `<span style="background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px">📦 Separado</span>`,
    separado:            `<span style="background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px">📦 Separado</span>`,
    aguardando_abastecer:`<span style="background:#ffedd5;color:#9a3412;border:1px solid #fed7aa;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px">🕐 Aguardando</span>`,
    subiu:               `<span style="background:#e0f2fe;color:#0369a1;border:1px solid #7dd3fc;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px">⬆️ Subiu</span>`,
    abastecido:          `<span style="background:#dcfce7;color:#166534;border:1px solid #86efac;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px">✅ Abastecido</span>`,
    protocolo:           `<span style="background:#f3f4f6;color:#374151;border:1px solid #d1d5db;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px">📋 Protocolo</span>`,
    devolucao:           `<span style="background:#faf5ff;color:#7e22ce;border:1px solid #d8b4fe;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px">↩️ Devolução</span>`,
    nao_encontrado:      `<span style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px">❌ Não encontrado</span>`,
  };
  const badge = BADGES[sit] || `<span style="font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;background:${cor}22;color:${cor}">${labelSituacao(sit)}</span>`;

  // ── ENVIO badge ──
  const envio    = (a.forma_envio || '').trim();
  const isDrive  = /drive|retirada/i.test(envio);
  const envioBdg = envio
    ? `<span style="background:${isDrive?'#fee2e2':'var(--surface2)'};color:${isDrive?'#dc2626':'var(--text2)'};border:1px solid ${isDrive?'#fca5a5':'var(--border)'};font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px">${isDrive?'🚗':'📦'} ${envio}</span>`
    : '';

  // ── Progress stepper ──
  const STEPS = [
    {k:'pendente',label:'Separar'},
    {k:'verificando',label:'Verificando'},
    {k:'buscado',label:'Separado'},
    {k:'aguardando_abastecer',label:'Aguard.'},
    {k:'subiu',label:'Subiu'},
    {k:'abastecido',label:'Abast.'},
  ];
  const STEP_IDX = {pendente:0,verificando:1,buscado:2,separado:2,aguardando_abastecer:3,subiu:4,abastecido:5};
  const isFinal  = ['protocolo','devolucao','nao_encontrado'].includes(sit);
  const curStep  = isFinal ? STEPS.length : (STEP_IDX[sit] ?? 0);

  const stepperHtml = `
    <div style="display:flex;align-items:flex-end;margin:10px 0 4px;overflow-x:auto;padding-bottom:2px">
      ${STEPS.map((st, i) => {
        const done   = i < curStep;
        const active = i === curStep;
        const dc = done ? '#10b981' : active ? cor : 'var(--border)';
        const tc = done ? '#10b981' : active ? cor : 'var(--text3)';
        return `<div style="display:flex;align-items:flex-end;flex-shrink:0">
          <div style="display:flex;flex-direction:column;align-items:center;gap:3px">
            <span style="font-size:9px;color:${tc};font-weight:${active?'800':'500'};white-space:nowrap;line-height:1">${st.label}</span>
            <div style="width:${active?11:7}px;height:${active?11:7}px;border-radius:50%;background:${dc};${active?`outline:3px solid ${cor}44`:''};transition:all .2s"></div>
          </div>
          ${i<STEPS.length-1?`<div style="width:22px;height:1.5px;background:${done?'#10b981':'var(--border)'};margin-bottom:5px;flex-shrink:0"></div>`:''}
        </div>`;
      }).join('')}
      ${isFinal ? `<div style="display:flex;align-items:flex-end;flex-shrink:0">
        <div style="width:22px;height:1.5px;background:${cor};margin-bottom:5px"></div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:3px">
          <span style="font-size:9px;color:${cor};font-weight:800;white-space:nowrap">${labelSituacao(sit).replace(/^[^\s]+\s/,'')}</span>
          <div style="width:11px;height:11px;border-radius:50%;background:${cor};outline:3px solid ${cor}44"></div>
        </div>
      </div>` : ''}
    </div>`;

  // ── Histórico ──
  const histHtml = hist.length ? `
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
      <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:1px;text-transform:uppercase;margin-bottom:5px">Histórico</div>
      ${hist.map(h => `
        <div style="display:flex;align-items:center;gap:7px;padding:3px 0;font-size:11px">
          <span style="font-family:'Space Mono',monospace;font-size:10px;color:var(--text3);white-space:nowrap">${h.hora||'—'}</span>
          <span style="font-weight:600;color:var(--text);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${h.usuario||'—'}</span>
          <span style="font-size:10px;font-weight:700;color:${corSituacao(h.acao)};background:${corSituacao(h.acao)}18;padding:1px 8px;border-radius:20px;white-space:nowrap">${labelSituacao(h.acao)}</span>
        </div>`).join('')}
    </div>` : '';

  // ── Obs ──
  const obsRedundante = (a.obs||'').startsWith('Falta total');
  const obsExtra = !obsRedundante && a.obs
    ? `<div style="margin-top:6px;font-size:11px;color:var(--text3);background:var(--surface2);border-radius:8px;padding:5px 10px">💬 ${a.obs}</div>`
    : '';

  // ── Botões de ação ──
  // ── Dropdown de etapas ──
  const ETAPAS_DROP = [
    { acao:'e_verificando', ico:'🔍', lbl:'Verificando',    cor:'#8b5cf6' },
    { acao:'e_separado',    ico:'📦', lbl:'Separado',        cor:'#3b82f6' },
    { acao:'e_subiu',       ico:'⬆️', lbl:'Subiu',           cor:'#0ea5e9' },
    { acao:'e_abastecido',  ico:'✅', lbl:'Abastecido',      cor:'#10b981' },
    { acao:'e_protocolo',   ico:'📋', lbl:'Protocolo',       cor:'#6b7280' },
    { acao:'e_devolucao',   ico:'↩️', lbl:'Devolução',       cor:'#a855f7' },
    { acao:'e_nao_enc',     ico:'❌', lbl:'Não encontrado',  cor:'#ef4444' },
  ];

  const dropEtapas = `
    <div style="position:relative" id="rep-ewrap-${a.id}">
      <div onclick="toggleEtapaDrop(${a.id},event)"
        style="display:flex;align-items:center;justify-content:space-between;padding:13px 16px;background:var(--surface2);border:2px solid var(--accent);border-radius:12px;cursor:pointer;transition:border-color .2s" id="rep-ebox-${a.id}">
        <span style="font-size:14px;font-weight:600;color:var(--text)" id="rep-eval-${a.id}">Registrar etapa...</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" id="rep-eseta-${a.id}" style="color:var(--accent);transition:transform .2s;flex-shrink:0"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div id="rep-edrop-${a.id}"
        style="display:none;position:absolute;left:0;right:0;top:calc(100% + 2px);background:var(--surface);border:2px solid var(--accent);border-radius:12px;z-index:300;overflow:hidden;box-shadow:0 8px 28px rgba(0,0,0,.15)">
        ${ETAPAS_DROP.map(et => `
          <div onclick="selecionarEtapaRep(${a.id},'${et.acao}','${nomeLogado}',this,event)"
            style="display:flex;align-items:center;gap:12px;padding:13px 16px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .12s"
            onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
            <span style="font-size:18px;width:22px;text-align:center;flex-shrink:0">${et.ico}</span>
            <span style="font-size:14px;font-weight:600;color:${et.cor};flex:1">${et.lbl}</span>
          </div>`).join('')}
      </div>
    </div>`;

  let botoesEtapa = '';
  // 'subiu' foi removido do finalStates para permitir que outro colaborador registre 'abastecido'
  const finalStates = ['abastecido','protocolo','devolucao','nao_encontrado'];

  if (sit === 'subiu') {
    // Etapa intermediária: alguém trouxe o item, outro precisa guardar
    botoesEtapa = `
      <div style="border-top:1px solid var(--border);padding:12px 0 0">
        <div style="background:#e0f2fe;border:1px solid #bae6fd;border-radius:10px;padding:9px 12px;margin-bottom:10px;font-size:12px;color:#0369a1">
          ⬆️ <strong>${a.quem_pegou||'—'}</strong> trouxe o item — quem vai guardar no estoque?
        </div>
        ${dropEtapas}
      </div>`;
  } else if (!finalStates.includes(sit)) {
    // Quantidade + dropdown para todos os estados ativos
    botoesEtapa = `
      <div style="border-top:1px solid var(--border);padding:12px 0 0">
        ${sit === 'aguardando_abastecer' ? `
          <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:9px 12px;margin-bottom:10px;font-size:12px;color:#92400e">
            📦 <strong>${a.quem_pegou||'—'}</strong> separou ${a.qtd_encontrada||qtdSolic} de ${qtdSolic} un. Aguardando entrega.
          </div>` : `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
            <span style="font-size:12px;color:var(--text3);white-space:nowrap">Qtd encontrada:</span>
            <div style="display:flex;align-items:center;gap:6px">
              <button onclick="this.nextElementSibling.value=Math.max(0,+this.nextElementSibling.value-1)" style="width:32px;height:32px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface2);font-size:18px;cursor:pointer;color:var(--text);line-height:1">−</button>
              <input type="number" id="qtd-${a.id}" min="0" max="${qtdSolic}" value="${a.qtd_encontrada||qtdSolic}" style="width:56px;padding:4px 8px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:18px;font-weight:700;text-align:center">
              <button onclick="this.previousElementSibling.value=Math.min(${qtdSolic},+this.previousElementSibling.value+1)" style="width:32px;height:32px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface2);font-size:18px;cursor:pointer;color:var(--text);line-height:1">+</button>
              <span style="font-size:12px;color:var(--text3)">de ${qtdSolic}</span>
            </div>
          </div>`}
        ${dropEtapas}
      </div>`;
  } else {
    // Estado final (abastecido, protocolo, devolucao, nao_encontrado) — mostra quem fez o quê
    const tem = a.quem_guardou || a.quem_pegou;
    botoesEtapa = tem ? `
      <div style="border-top:1px solid var(--border);padding-top:8px;display:flex;gap:14px;font-size:12px;color:var(--text3)">
        ${a.quem_pegou  ? `<span>📦 <strong style="color:var(--text)">${a.quem_pegou}</strong></span>` : ''}
        ${a.quem_guardou? `<span>🏠 <strong style="color:var(--text)">${a.quem_guardou}</strong></span>` : ''}
      </div>` : '';
  }

  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-left:4px solid ${cor};border-radius:14px;margin-bottom:10px;overflow:visible">
      <div style="padding:14px">
        <!-- Linha 1: código + badge -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
          <div style="flex:1;min-width:0;margin-right:8px">
            <div style="font-family:'Space Mono',monospace;font-size:16px;font-weight:700;color:var(--text);line-height:1.2">${a.codigo||'—'}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px;line-height:1.4">${a.descricao||''}</div>
          </div>
          ${badge}
        </div>
        <!-- Linha 2: tags (envio, qtd, endereço) -->
        <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-bottom:6px">
          ${envioBdg}
          <span style="background:#fee2e2;border-radius:8px;padding:3px 10px;font-size:12px;font-weight:800;color:#dc2626">${qtdSolic} un em falta</span>
          <span style="background:var(--surface2);border-radius:8px;padding:3px 10px;font-size:11px;color:var(--text2)">📍 ${a.endereco||'—'}</span>
        </div>
        <!-- Linha 3: separador + hora -->
        <div style="display:flex;gap:10px;font-size:11px;color:var(--text3);align-items:center">
          ${a.separador_nome?`<span>👤 <strong style="color:var(--text2)">${a.separador_nome}</strong></span>`:''}
          ${a.hora_aviso?`<span>🕐 ${a.hora_aviso}</span>`:''}
          ${a.data_aviso?`<span style="font-size:10px">${a.data_aviso}</span>`:''}
        </div>
        <!-- Stepper de etapas -->
        ${stepperHtml}
        ${obsExtra}
        <!-- Histórico de ações -->
        ${histHtml}
      </div>
      ${botoesEtapa?`<div style="padding:0 14px 14px">${botoesEtapa}</div>`:''}
    </div>`;
}

/* ── Dropdown de etapas — toggle / seleção ──────────────────────── */
function toggleEtapaDrop(id, e) {
  e && e.stopPropagation();
  const drop = document.getElementById(`rep-edrop-${id}`);
  const seta = document.getElementById(`rep-eseta-${id}`);
  const box  = document.getElementById(`rep-ebox-${id}`);
  const open = drop?.style.display !== 'none';
  // fecha todos os outros abertos
  document.querySelectorAll('[id^="rep-edrop-"]').forEach(d => { d.style.display = 'none'; });
  document.querySelectorAll('[id^="rep-eseta-"]').forEach(s => { s.style.transform = ''; });
  document.querySelectorAll('[id^="rep-ebox-"]').forEach(b => { b.style.borderColor = 'var(--accent)'; });
  if (!open) {
    if (drop) drop.style.display = 'block';
    if (seta) seta.style.transform = 'rotate(180deg)';
    if (box)  box.style.borderColor = 'var(--accent)';
  }
}

function selecionarEtapaRep(id, acao, nomeLogado, el, e) {
  e && e.stopPropagation();
  const drop = document.getElementById(`rep-edrop-${id}`);
  const seta = document.getElementById(`rep-eseta-${id}`);
  const val  = document.getElementById(`rep-eval-${id}`);
  if (drop) drop.style.display = 'none';
  if (seta) seta.style.transform = '';
  // Feedback visual imediato no label
  const labels = {
    e_verificando:'🔍 Verificando', e_separado:'📦 Separado', e_subiu:'⬆️ Subiu',
    e_abastecido:'✅ Abastecido',  e_protocolo:'📋 Protocolo', e_devolucao:'↩️ Devolução',
    e_nao_enc:'❌ Não encontrado'
  };
  if (val) val.textContent = labels[acao] || 'Registrando...';
  acaoRepositor(id, acao, nomeLogado);
}

// Fecha dropdowns ao clicar fora
document.addEventListener('click', () => {
  document.querySelectorAll('[id^="rep-edrop-"]').forEach(d => { d.style.display = 'none'; });
  document.querySelectorAll('[id^="rep-eseta-"]').forEach(s => { s.style.transform = ''; });
});

async function acaoRepositor(id, acao, nomeLogado) {
  const qtdInput = document.getElementById(`qtd-${id}`);
  const qtd = qtdInput ? parseInt(qtdInput.value) || 0 : 0;

  let body = {};
  if (acao === 'busquei_e_abasteci') {
    body = { situacao:'abastecido', status:'abastecido', quem_pegou: nomeLogado, quem_guardou: nomeLogado, qtd_encontrada: qtd };
  } else if (acao === 'subiu') {
    body = { situacao:'subiu', status:'subiu', quem_pegou: nomeLogado, qtd_encontrada: qtd };
  } else if (acao === 'so_busquei') {
    body = { situacao:'aguardando_abastecer', status:'aguardando_abastecer', quem_pegou: nomeLogado, qtd_encontrada: qtd };
  } else if (acao === 'devolucao') {
    body = { situacao:'devolucao', status:'devolucao', quem_pegou: nomeLogado, qtd_encontrada: qtd };
  } else if (acao === 'nao_encontrei') {
    body = { situacao:'nao_encontrado', status:'nao_encontrado', quem_pegou: nomeLogado, qtd_encontrada: 0 };
  } else if (acao === 'abasteci') {
    body = { situacao:'abastecido', status:'abastecido', quem_guardou: nomeLogado };
  } else if (acao === 'subiu_entrega') {
    body = { situacao:'subiu', status:'subiu', quem_guardou: nomeLogado };
  } else if (acao === 'e_verificando') {
    body = { situacao:'verificando', status:'verificando', quem_pegou: nomeLogado };
  } else if (acao === 'e_separado') {
    body = { situacao:'buscado', status:'buscado', quem_pegou: nomeLogado, qtd_encontrada: qtd };
  } else if (acao === 'e_subiu') {
    body = { situacao:'subiu', status:'subiu', quem_pegou: nomeLogado, qtd_encontrada: qtd };
  } else if (acao === 'e_abastecido') {
    body = { situacao:'abastecido', status:'abastecido', quem_pegou: nomeLogado, quem_guardou: nomeLogado, qtd_encontrada: qtd };
  } else if (acao === 'e_protocolo') {
    body = { situacao:'protocolo', status:'protocolo', quem_pegou: nomeLogado };
  } else if (acao === 'e_devolucao') {
    body = { situacao:'devolucao', status:'devolucao', quem_pegou: nomeLogado };
  } else if (acao === 'e_nao_enc') {
    body = { situacao:'nao_encontrado', status:'nao_encontrado', quem_pegou: nomeLogado, qtd_encontrada: 0 };
  }

  try {
    const res = await fetch(`${API}/repositor/avisos/${id}`, {
      credentials:'include', method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    if (res.ok) {
      toast(acao === 'nao_encontrei' ? 'Registrado!' : 'Salvo!', 'success');
      await carregarAvisosMobile();
    } else { toast('Erro ao salvar', 'danger'); }
  } catch(e) { toast('Sem conexão', 'danger'); }
}

async function carregarStatsRepMobile() {
  const el = document.getElementById('rep-stats-content');
  const nomeEl = document.getElementById('m-rep-nome');
  if (!el) return;
  try {
    const res = await fetch(`${API}/stats/meus`, { credentials:'include' });
    const data = res.ok ? await res.json() : {};
    if (nomeEl) nomeEl.textContent = data.nome || usuarioAtual?.nome || '—';
    const d = data.reposicao || {};
    // Atualiza elementos existentes
    const set = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v??0; };
    set('m-rep-hoje', d.resolvidos_hoje);
    set('m-rep-mes',  d.resolvidos_hoje); // fallback
    set('m-rep-pendentes', d.pendentes_hoje);
    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:4px 0">
        ${[
          ['✅','#10b981','Resolvidas hoje',   d.resolvidos_hoje||0],
          ['❌','#ef4444','Não encontradas',   d.nao_encontrados_hoje||0],
          ['⏳','#f59e0b','Pendentes agora',   d.pendentes_hoje||0],
          ['📋','#6b7280','Total hoje',         d.avisos_hoje||0],
        ].map(([ico,cor,lbl,val]) => `
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center">
            <div style="font-size:28px;margin-bottom:4px">${ico}</div>
            <div style="font-size:28px;font-weight:700;color:${cor}">${val}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:4px">${lbl}</div>
          </div>`).join('')}
      </div>`;
  } catch(e) { console.warn(e); }
}

/* ══════════════════════════════════════════════════════════════════
   DESKTOP — TABELA DE REPOSIÇÃO
══════════════════════════════════════════════════════════════════ */

function atualizarUltimaAtualizacaoRep() {
  const el = document.getElementById('rep-ultima-atualizacao');
  if (!el) return;
  const agora = new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'});
  el.textContent = `— atualizado ${agora}`;
}

const _REP_DESK_TABS = ['separar','separado','subiu','protocolo','stats','ranking'];

function mudarTabRepDesk(tab) {
  _REP_DESK_TABS.forEach(t => {
    const pg = document.getElementById(`d-rep-tab-${t}`);
    const bt = document.getElementById(`d-rtab-${t}`);
    if (pg) pg.style.display = t === tab ? '' : 'none';
    if (bt) bt.classList.toggle('ativo', t === tab);
  });
  if      (tab === 'separar')   carregarRepSeparar();
  else if (tab === 'separado')  carregarRepSeparado();
  else if (tab === 'subiu')     carregarRepSubiu();
  else if (tab === 'protocolo') carregarRepProtocolo();
  else if (tab === 'stats')     carregarEstatisticasRep();
  else if (tab === 'ranking')   carregarRankingProdutos();
}

async function carregarReposicaoDesktop() {
  await carregarUsuariosParaRep();
  // Mantém a aba ativa se já iniciada, senão começa em separar
  const activeBtn = document.querySelector('#pag-reposicao [id^="d-rtab-"].ativo');
  const tab = activeBtn?.id?.replace('d-rtab-','') || 'separar';
  mudarTabRepDesk(tab);
  _atualizarBadgesRep();
}

async function carregarAvisos() {
  await carregarReposicaoDesktop();
}

function verificarDuplicatas() {}

async function carregarTabelaReposicao() {
  const tbody   = document.getElementById('tbody-reposicao');
  const totalEl = document.getElementById('rep-total');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text3)">⏳ Carregando...</td></tr>`;
  try {
    const ini    = document.getElementById('rep-filtro-ini')?.value || '';
    const fim    = document.getElementById('rep-filtro-fim')?.value || '';
    const codigo = document.getElementById('rep-filtro-codigo')?.value || '';
    const params = new URLSearchParams();
    if (_filtroSituacaoRep) params.set('status', _filtroSituacaoRep);
    if (ini) params.set('data_ini', ini);
    if (fim) params.set('data_fim', fim);
    if (codigo) params.set('codigo', codigo);
    const url = `${API}/repositor/avisos${params.toString()?'?'+params.toString():''}`;
    const res = await fetch(url, { credentials:'include' });
    const avisos = res.ok ? await res.json() : [];
    if (totalEl) totalEl.textContent = avisos.length;

    // Actualiza cnt-cards de reposição
    const setC = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
    setC('rep-cnt-total',      avisos.length);
    setC('rep-cnt-pendentes',  avisos.filter(a=>['pendente','verificando'].includes(a.situacao||a.status)).length);
    setC('rep-cnt-andamento',  avisos.filter(a=>['buscado','separado','aguardando_abastecer','subiu'].includes(a.situacao||a.status)).length);
    setC('rep-cnt-abastecidos',avisos.filter(a=>['abastecido'].includes(a.situacao||a.status)).length);

    if (!avisos.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:48px;color:var(--text3)">
        <div style="font-size:32px;margin-bottom:8px">✅</div>Nenhum item</td></tr>`;
      return;
    }

    atualizarUltimaAtualizacaoRep();
    tbody.innerHTML = avisos.map(a => {
      const sit = a.situacao || a.status || 'pendente';
      const cor = corSituacao(sit);
      const lbl = labelSituacao(sit);
      const isDrive = /drive|retirada/i.test(a.forma_envio||'');

      // Parse historico
      let hist = [];
      try { hist = Array.isArray(a.historico) ? a.historico : (a.historico ? JSON.parse(a.historico) : []); } catch{}
      const histHtml = hist.length ? `
        <div style="margin-top:6px;padding-top:6px;border-top:1px dashed var(--border)">
          <div style="font-size:9px;font-weight:700;letter-spacing:1px;color:var(--text3);text-transform:uppercase;margin-bottom:3px">Histórico</div>
          ${hist.map(h=>`<div style="display:flex;align-items:center;gap:5px;font-size:10px;margin-bottom:2px">
            <span style="font-family:'Space Mono',monospace;color:var(--text3)">${h.hora||''}</span>
            <span style="font-weight:600;color:var(--text2)">${h.usuario||'—'}</span>
            <span style="color:${corSituacao(h.acao)};font-weight:700;background:${corSituacao(h.acao)}18;padding:0px 6px;border-radius:20px">${labelSituacao(h.acao)}</span>
          </div>`).join('')}
        </div>` : '';

      return `<tr id="rep-row-${a.id}" style="border-bottom:1px solid var(--border);border-left:3px solid ${cor}" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
        <td style="padding:10px 12px;min-width:160px">
          <div style="font-weight:700;font-size:13px;color:var(--text);font-family:'Space Mono',monospace">${a.codigo||'—'}</div>
          ${a.descricao?`<div style="font-size:11px;color:var(--text3);margin-top:2px;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${a.descricao}">${a.descricao}</div>`:''}
        </td>
        <td style="padding:10px 12px;white-space:nowrap">
          ${a.forma_envio
            ? `<span style="background:${isDrive?'#fee2e2':'var(--surface2)'};color:${isDrive?'#dc2626':'var(--text2)'};border:1px solid ${isDrive?'#fca5a5':'var(--border)'};font-weight:700;font-size:11px;padding:3px 8px;border-radius:20px">${isDrive?'🚗':'📦'} ${a.forma_envio}</span>`
            : `<span style="color:var(--text3)">—</span>`}
        </td>
        <td style="padding:10px 12px;font-size:12px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;color:var(--text2)">${a.separador_nome||'—'}</td>
        <td style="padding:8px 10px;min-width:130px">
          ${a.quem_pegou
            ? `<div style="display:flex;align-items:center;gap:4px">
                 <span style="font-size:12px;color:var(--text2);font-weight:600">📦 ${a.quem_pegou}</span>
                 <button onclick="limparCampoPessoa(${a.id},'quem_pegou')" title="Limpar" style="font-size:10px;padding:1px 5px;background:transparent;border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--text3)">✕</button>
               </div>`
            : `<select onchange="salvarCampoPessoa(${a.id},'quem_pegou',this.value)"
                 style="font-size:11px;padding:4px 6px;border:1.5px dashed var(--border);border-radius:6px;background:var(--surface);color:var(--text);max-width:130px">
                 ${optionsUsuarios('')}
               </select>`}
        </td>
        <td style="padding:8px 10px;min-width:130px">
          ${a.quem_guardou
            ? `<div style="display:flex;align-items:center;gap:4px">
                 <span style="font-size:12px;color:var(--text2);font-weight:600">🏠 ${a.quem_guardou}</span>
                 <button onclick="limparCampoPessoa(${a.id},'quem_guardou')" title="Limpar" style="font-size:10px;padding:1px 5px;background:transparent;border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--text3)">✕</button>
               </div>`
            : (!['nao_encontrado','protocolo','devolucao'].includes(sit)
              ? `<select onchange="salvarCampoPessoa(${a.id},'quem_guardou',this.value,true)"
                   style="font-size:11px;padding:4px 6px;border:1.5px dashed ${a.quem_pegou?'#10b981':'var(--border)'};border-radius:6px;background:var(--surface);color:var(--text);max-width:130px">
                   ${optionsUsuarios('')}
                 </select>`
              : `<span style="color:var(--text3)">—</span>`)}
        </td>
        <td style="padding:10px 12px;min-width:180px">
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:${hist.length?'4':'0'}px">
            <span style="font-size:12px;font-weight:700;color:${cor};background:${cor}18;padding:4px 10px;border-radius:20px;white-space:nowrap">${lbl}</span>
            ${!['protocolo','abastecido','nao_encontrado','devolucao','subiu'].includes(sit)
              ? `<button onclick="marcarSituacaoDesk(${a.id},'subiu')" title="Subiu" style="font-size:10px;padding:3px 8px;border:1px solid #0ea5e9;border-radius:20px;background:transparent;color:#0ea5e9;cursor:pointer">⬆️ Subiu</button>
                 <button onclick="marcarProtocolo(${a.id})" title="Protocolo" style="font-size:10px;padding:3px 8px;border:1px solid #6b7280;border-radius:20px;background:transparent;color:#6b7280;cursor:pointer">📋</button>
                 <button onclick="marcarSituacaoDesk(${a.id},'devolucao')" title="Devolução" style="font-size:10px;padding:3px 8px;border:1px solid #a855f7;border-radius:20px;background:transparent;color:#a855f7;cursor:pointer">↩️</button>`
              : ''}
          </div>
          ${histHtml}
        </td>
        <td style="padding:8px 10px;min-width:160px">
          <input type="text" value="${(a.obs||'').replace(/"/g,'&quot;')}" placeholder="Observação..."
            onblur="salvarCampoAviso(${a.id},'obs',this.value)"
            style="width:100%;font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);box-sizing:border-box">
        </td>
        <td style="padding:10px 12px;font-size:11px;color:var(--text3);white-space:nowrap">${a.hora_aviso||'—'}<br><span style="font-size:10px">${a.data_aviso||''}</span></td>
      </tr>`;
    }).join('');
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="8" style="color:#ef4444;padding:24px">Erro: ${e.message}</td></tr>`;
  }
}

async function salvarCampoAviso(id, campo, valor) {
  try {
    const body = { [campo]: valor };
    if (campo === 'situacao') body.status = valor;
    const res = await fetch(`${API}/repositor/avisos/${id}`, {
      credentials:'include', method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    if (res.ok) {
      toast('Salvo!', 'success');
      if (campo === 'situacao') {
        const row = document.getElementById(`rep-row-${id}`);
        if (row) {
          const sel = row.querySelectorAll('select')[2];
          const cor = corSituacao(valor);
          if (sel) { sel.style.color = cor; sel.style.borderColor = cor; }
        }
      }
    } else { toast('Erro ao salvar', 'danger'); }
  } catch(e) { toast('Sem conexão', 'danger'); }
}

async function salvarCampoPessoa(id, campo, valor, marcarAbastecido=false) {
  if (!valor) return;
  const body = { [campo]: valor };
  if (marcarAbastecido) { body.situacao = 'abastecido'; body.status = 'abastecido'; }
  try {
    const res = await fetch(`${API}/repositor/avisos/${id}`, {
      credentials:'include', method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    if (res.ok) { toast('Salvo!', 'success'); carregarTabelaReposicao(); }
    else toast('Erro ao salvar', 'danger');
  } catch(e) { toast('Sem conexão', 'danger'); }
}

async function limparCampoPessoa(id, campo) {
  try {
    const body = { [campo]: '' };
    if (campo === 'quem_guardou') { body.situacao = 'aguardando_abastecer'; body.status = 'aguardando_abastecer'; }
    const res = await fetch(`${API}/repositor/avisos/${id}`, {
      credentials:'include', method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    if (res.ok) { carregarTabelaReposicao(); }
    else toast('Erro ao limpar', 'danger');
  } catch(e) { toast('Sem conexão', 'danger'); }
}

function filtrarReposicao(situacao) {
  _filtroSituacaoRep = situacao;
  document.querySelectorAll('.rep-filtro-btn').forEach(btn => {
    const active = btn.dataset.sit === situacao;
    btn.style.background   = active ? 'var(--accent)' : 'transparent';
    btn.style.color        = active ? '#fff' : 'var(--text2)';
    btn.style.borderColor  = active ? 'var(--accent)' : 'var(--border)';
    btn.style.fontWeight   = active ? '700' : '500';
  });
  carregarTabelaReposicao();
}

function mudarAbaRep(aba) {
  ['avisos','stats','ranking'].forEach(t => {
    const el  = document.getElementById(`rep-aba-${t}`);
    const btn = document.getElementById(`rep-ababtn-${t}`);
    if (el)  el.style.display    = t===aba ? 'block' : 'none';
    if (btn) {
      btn.style.borderBottom = t===aba ? '2px solid var(--accent)' : '2px solid transparent';
      btn.style.color        = t===aba ? 'var(--accent)' : 'var(--text3)';
    }
  });
  if (aba==='avisos')  carregarTabelaReposicao();
  if (aba==='stats')   carregarEstatisticasRep();
  if (aba==='ranking') carregarRankingProdutos();
}

/* ── Indicadores ────────────────────────────────────────────────── */
async function exportarIndicadoresExcel() {
  try {
    const sIni = document.getElementById('rep-stats-ini')?.value || '';
    const sFim = document.getElementById('rep-stats-fim')?.value || '';
    const sParams = new URLSearchParams();
    if (sIni) sParams.set('data_ini', sIni);
    if (sFim) sParams.set('data_fim', sFim);
    const res = await fetch(`${API}/repositor/avisos${sParams.toString()?'?'+sParams.toString():''}`, { credentials:'include' });
    const avisos = res.ok ? await res.json() : [];

    // Aba 1: Resumo por colaborador
    const stats = {};
    const itensPorPessoa = {};
    avisos.forEach(a => {
      const sit = a.situacao || a.status;
      ['quem_pegou','quem_guardou'].forEach(campo => {
        if (!a[campo]) return;
        const nome = a[campo];
        if (!stats[nome]) stats[nome] = {pegou:0,guardou:0,abastecido:0,nao_enc:0};
        if (!itensPorPessoa[nome]) itensPorPessoa[nome] = [];
        if (campo==='quem_pegou') stats[nome].pegou++;
        if (campo==='quem_guardou') stats[nome].guardou++;
        if (sit==='abastecido' && campo==='quem_guardou') stats[nome].abastecido++;
        if (sit==='nao_encontrado' && campo==='quem_pegou') stats[nome].nao_enc++;
        if (!itensPorPessoa[nome].find(x=>x.id===a.id&&x.campo===campo)) {
          itensPorPessoa[nome].push({...a, campo, sit});
        }
      });
    });

    const wb = XLSX.utils.book_new();

    // Aba RESUMO
    const resumoRows = [
      ['COLABORADOR','PEGOU','GUARDOU','ABASTECIDOS','NÃO ENCONTRADO','TOTAL AÇÕES']
    ];
    Object.entries(stats).sort((a,b)=>(b[1].pegou+b[1].guardou)-(a[1].pegou+a[1].guardou)).forEach(([nome,s]) => {
      resumoRows.push([nome, s.pegou, s.guardou, s.abastecido, s.nao_enc, s.pegou+s.guardou]);
    });
    const wsResumo = XLSX.utils.aoa_to_sheet(resumoRows);
    wsResumo['!cols'] = [{wch:35},{wch:10},{wch:10},{wch:14},{wch:16},{wch:14}];
    XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

    // Aba DETALHADO — todos os itens com quem fez o quê
    const fmtData = d => {
      if (!d) return '';
      const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
    };
    const detRows = [
      ['DATA','HORÁRIO','CÓDIGO','PRODUTO','SEPARADOR','QUEM PEGOU','QUEM GUARDOU','SITUAÇÃO','FORMA ENVIO','OBS']
    ];
    avisos.forEach(a => {
      const sit = labelSituacao(a.situacao||a.status||'pendente');
      detRows.push([
        fmtData(a.data_aviso), a.hora_aviso||'', a.codigo||'', a.descricao||'',
        a.separador_nome||'', a.quem_pegou||'', a.quem_guardou||'',
        sit, a.forma_envio||'', a.obs||''
      ]);
    });
    const wsDet = XLSX.utils.aoa_to_sheet(detRows);
    wsDet['!cols'] = [{wch:12},{wch:8},{wch:18},{wch:35},{wch:25},{wch:25},{wch:25},{wch:18},{wch:18},{wch:30}];
    XLSX.utils.book_append_sheet(wb, wsDet, 'Detalhado');

    // Aba por colaborador
    Object.entries(itensPorPessoa).forEach(([nome, itens]) => {
      const rows = [['PAPEL','DATA','HORÁRIO','CÓDIGO','PRODUTO','SITUAÇÃO','OBS']];
      itens.forEach(it => {
        rows.push([
          it.campo==='quem_pegou'?'Pegou':'Guardou',
          fmtData(it.data_aviso), it.hora_aviso||'',
          it.codigo||'', it.descricao||'',
          labelSituacao(it.situacao||it.status||''), it.obs||''
        ]);
      });
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{wch:10},{wch:12},{wch:8},{wch:18},{wch:35},{wch:18},{wch:30}];
      // Nome da aba: máx 31 chars (limite do Excel)
      const nomeAba = nome.split(' ')[0] + ' ' + (nome.split(' ')[1]||'').charAt(0);
      XLSX.utils.book_append_sheet(wb, ws, nomeAba.substring(0,31));
    });

    const fmtFile = d => { const m=String(d||'').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m?`${m[3]}-${m[2]}-${m[1]}`:d||new Date().toLocaleDateString('pt-BR').replace(/\//g,'-'); };
    const periodo = sIni&&sFim ? `_${fmtFile(sIni)}_ate_${fmtFile(sFim)}` : `_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}`;
    XLSX.writeFile(wb, `indicadores_reposicao${periodo}.xlsx`);
    toast('Excel exportado!', 'success');
  } catch(e) { toast('Erro ao exportar: '+e.message, 'danger'); }
}

async function carregarEstatisticasRep() {
  const el = document.getElementById('rep-stats-desktop');
  if (!el) return;
  el.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text3)">⏳ Carregando...</div>`;
  try {
    const sIni = document.getElementById('rep-stats-ini')?.value || '';
    const sFim = document.getElementById('rep-stats-fim')?.value || '';
    const sParams = new URLSearchParams();
    if (sIni) sParams.set('data_ini', sIni);
    if (sFim) sParams.set('data_fim', sFim);
    const res = await fetch(`${API}/repositor/avisos${sParams.toString()?'?'+sParams.toString():''}`, { credentials:'include' });
    const avisos = res.ok ? await res.json() : [];
    const stats = {};
    const inc = (nome, campo) => {
      if (!nome) return;
      if (!stats[nome]) stats[nome] = {pegou:0,guardou:0,abastecido:0,nao_enc:0};
      stats[nome][campo]++;
    };
    avisos.forEach(a => {
      const sit = a.situacao || a.status;
      inc(a.quem_pegou,   'pegou');
      inc(a.quem_guardou, 'guardou');
      if (sit==='abastecido')     inc(a.quem_guardou||a.quem_pegou, 'abastecido');
      if (sit==='nao_encontrado') inc(a.quem_pegou, 'nao_enc');
    });
    const rows = Object.entries(stats).sort((a,b)=>(b[1].pegou+b[1].guardou)-(a[1].pegou+a[1].guardou));
    if (!rows.length) {
      el.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text3)">
        Nenhum dado ainda. Registre as ações no mobile.</div>`;
      return;
    }
    // Monta mapa de itens por colaborador
    const itensPorPessoa = {};
    avisos.forEach(a => {
      const sit = a.situacao || a.status;
      ['quem_pegou','quem_guardou'].forEach(campo => {
        if (!a[campo]) return;
        const nome = a[campo];
        if (!itensPorPessoa[nome]) itensPorPessoa[nome] = [];
        // Evita duplicatas (mesmo aviso pode ter mesma pessoa nos 2 campos)
        if (!itensPorPessoa[nome].find(x => x.id === a.id && x.campo === campo)) {
          itensPorPessoa[nome].push({...a, campo, sit});
        }
      });
    });

    el.innerHTML = `
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--surface2)">
            <th style="padding:12px 16px;text-align:left;font-size:11px;color:var(--text3)">COLABORADOR</th>
            <th style="padding:12px 16px;text-align:center;font-size:11px;color:var(--text3)">PEGOU</th>
            <th style="padding:12px 16px;text-align:center;font-size:11px;color:var(--text3)">GUARDOU</th>
            <th style="padding:12px 16px;text-align:center;font-size:11px;color:var(--text3)">ABASTECIDOS</th>
            <th style="padding:12px 16px;text-align:center;font-size:11px;color:var(--text3)">NÃO ENC.</th>
            <th style="padding:12px 16px;text-align:center;font-size:11px;color:var(--text3)">ITENS</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(([nome,s]) => {
            const itens = itensPorPessoa[nome] || [];
            const itensHtml = itens.map(it => {
              const sit = it.situacao || it.status;
              const cor = corSituacao(sit);
              const lbl = labelSituacao(sit);
              const papel = it.campo === 'quem_pegou' ? '📦 Pegou' : '🏠 Guardou';
              return `<tr style="background:var(--surface2);border-bottom:1px solid var(--border)">
                <td colspan="6" style="padding:6px 16px 6px 64px">
                  <div style="display:flex;align-items:center;gap:12px;font-size:12px">
                    <span style="color:var(--text3);min-width:70px">${papel}</span>
                    <span style="font-weight:700;color:var(--text)">${it.codigo||'—'}</span>
                    <span style="color:var(--text2);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${it.descricao||''}</span>
                    <span style="font-size:11px;font-weight:600;color:${cor};background:${cor}18;padding:2px 8px;border-radius:20px;white-space:nowrap">${lbl}</span>
                    <span style="color:var(--text3);white-space:nowrap">${it.data_aviso||''} ${it.hora_aviso||''}</span>
                  </div>
                </td>
              </tr>`;
            }).join('');

            return `
            <tr style="border-bottom:1px solid var(--border);cursor:pointer" onclick="toggleItensColaborador('rep-itens-${nome.replace(/\s/g,'_')}')">
              <td style="padding:12px 16px">
                <div style="display:flex;align-items:center;gap:10px">
                  <div style="width:34px;height:34px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700;flex-shrink:0">${nome.charAt(0).toUpperCase()}</div>
                  <span style="font-size:13px;font-weight:600">${nome}</span>
                  <span style="font-size:11px;color:var(--text3)">▼</span>
                </div>
              </td>
              <td style="text-align:center;font-size:15px;font-weight:700;color:var(--accent)">${s.pegou}</td>
              <td style="text-align:center;font-size:15px;font-weight:700;color:#3b82f6">${s.guardou}</td>
              <td style="text-align:center;font-size:15px;font-weight:700;color:#10b981">${s.abastecido}</td>
              <td style="text-align:center;font-size:15px;font-weight:700;color:#ef4444">${s.nao_enc}</td>
              <td style="text-align:center;font-size:12px;color:var(--text3)">${itens.length} itens</td>
            </tr>
            <tr id="rep-itens-${nome.replace(/\s/g,'_')}" style="display:none">
              <td colspan="6" style="padding:0">
                <table style="width:100%;border-collapse:collapse">
                  ${itensHtml || '<tr><td colspan="6" style="padding:12px 64px;color:var(--text3);font-size:12px">Nenhum item registrado</td></tr>'}
                </table>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  } catch(e) { el.innerHTML = `<div style="color:#ef4444;padding:16px">Erro: ${e.message}</div>`; }
}

async function carregarStatsRepositor() {
  try {
    const res = await fetch(`${API}/estatisticas/repositor`, { credentials:'include' });
    if (!res.ok) return;
    const data = await res.json();
    const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v??0; };
    set('rep-hoje',data.reposto_hoje); set('rep-mes',data.reposto_mes);
    set('rep-ano',data.reposto_ano);   set('rep-nao-enc',data.nao_encontrado_hoje);
  } catch(e) { console.warn(e); }
}

/* RANKING DE PRODUTOS */
async function carregarRankingProdutos() {
  const el = document.getElementById('rep-ranking-lista');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text3)">⏳ Carregando...</div>';
  try {
    const ini = document.getElementById('rep-rank-ini')?.value || '';
    const fim = document.getElementById('rep-rank-fim')?.value || '';
    const params = new URLSearchParams();
    if (ini) params.set('data_ini', ini);
    if (fim) params.set('data_fim', fim);
    const res = await fetch(`${API}/repositor/ranking-produtos${params.toString()?'?'+params.toString():''}`, { credentials:'include' });
    const produtos = res.ok ? await res.json() : [];
    if (!produtos.length) {
      el.innerHTML = '<div style="text-align:center;padding:48px;color:var(--text3)">Nenhum dado</div>';
      return;
    }
    const maxTotal = produtos[0]?.total || 1;
    el.innerHTML = `
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--surface2)">
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:var(--text3)">#</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:var(--text3)">CÓDIGO / PRODUTO</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;color:var(--text3)">TOTAL</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;color:var(--text3)">ABASTECIDOS</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;color:var(--text3)">NÃO ENC.</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:var(--text3)">FREQUÊNCIA</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:var(--text3)">ÚLTIMA VEZ</th>
          </tr>
        </thead>
        <tbody>
          ${produtos.map((p,i) => `
            <tr style="border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
              <td style="padding:10px 12px;font-size:13px;font-weight:700;color:var(--text3)">${i+1}</td>
              <td style="padding:10px 12px">
                <div style="font-weight:700;font-size:13px">${p.codigo}</div>
                ${p.descricao?`<div style="font-size:11px;color:var(--text3)">${p.descricao}</div>`:''}
              </td>
              <td style="padding:10px 12px;text-align:center;font-size:15px;font-weight:700;color:#ef4444">${p.total}</td>
              <td style="padding:10px 12px;text-align:center;font-size:14px;font-weight:600;color:#10b981">${p.abastecidos}</td>
              <td style="padding:10px 12px;text-align:center;font-size:14px;font-weight:600;color:#ef4444">${p.nao_encontrados}</td>
              <td style="padding:10px 12px;min-width:120px">
                <div style="background:var(--surface2);border-radius:4px;height:8px;overflow:hidden">
                  <div style="background:#ef4444;height:100%;width:${Math.round((p.total/maxTotal)*100)}%;border-radius:4px"></div>
                </div>
              </td>
              <td style="padding:10px 12px;font-size:12px;color:var(--text3)">${p.ultima_vez||'—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch(e) { el.innerHTML = `<div style="color:#ef4444;padding:16px">Erro: ${e.message}</div>`; }
}

/* EXPORTAR RANKING — Excel */
async function exportarRankingExcel() {
  try {
    const ini = document.getElementById('rep-rank-ini')?.value || '';
    const fim = document.getElementById('rep-rank-fim')?.value || '';
    const params = new URLSearchParams();
    if (ini) params.set('data_ini', ini);
    if (fim) params.set('data_fim', fim);
    const res = await fetch(`${API}/repositor/ranking-produtos${params.toString()?'?'+params.toString():''}`, { credentials:'include' });
    const produtos = res.ok ? await res.json() : [];
    if (!produtos.length) { toast('Nenhum dado para exportar', 'danger'); return; }

    const wb = XLSX.utils.book_new();
    const rows = [['#','CÓDIGO','PRODUTO','TOTAL REPOSIÇÕES','ABASTECIDOS','NÃO ENCONTRADO','ÚLTIMA VEZ']];
    produtos.forEach((p, i) => {
      rows.push([
        i + 1,
        p.codigo  || '',
        p.descricao || '',
        p.total   || 0,
        p.abastecidos || 0,
        p.nao_encontrados || 0,
        p.ultima_vez || ''
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{wch:5},{wch:22},{wch:42},{wch:16},{wch:14},{wch:16},{wch:16}];
    XLSX.utils.book_append_sheet(wb, ws, 'Ranking Produtos');

    const fmtFile = d => { const m=String(d||'').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m?`${m[3]}-${m[2]}-${m[1]}`:d||new Date().toLocaleDateString('pt-BR').replace(/\//g,'-'); };
    const periodo = ini&&fim ? `_${fmtFile(ini)}_ate_${fmtFile(fim)}` : `_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}`;
    XLSX.writeFile(wb, `ranking_reposicao${periodo}.xlsx`);
    toast('Excel exportado!', 'success');
  } catch(e) { toast('Erro ao exportar: '+e.message, 'danger'); }
}

/* ENTRADA MANUAL */
function abrirEntradaManual() {
  const modal = document.getElementById('modal-entrada-manual');
  if (!modal) return;
  // Popula dropdown de repositores
  const sel = document.getElementById('em-repositor');
  if (sel) {
    sel.innerHTML = '<option value="">— Selecionar —</option>' +
      _todosUsuarios.filter(u=>u.status==='ativo').sort((a,b)=>a.nome.localeCompare(b.nome))
        .map(u=>`<option value="${u.nome}">${u.nome}</option>`).join('');
  }
  modal.style.display = 'flex';
}

function fecharEntradaManual() {
  const modal = document.getElementById('modal-entrada-manual');
  if (modal) modal.style.display = 'none';
}

async function salvarEntradaManual() {
  const codigo    = document.getElementById('em-codigo')?.value?.trim();
  const descricao = document.getElementById('em-descricao')?.value?.trim();
  const quantidade= parseInt(document.getElementById('em-quantidade')?.value) || 1;
  const repositor = document.getElementById('em-repositor')?.value;
  const obs       = document.getElementById('em-obs')?.value?.trim();

  if (!codigo) { toast('Informe o código do produto', 'danger'); return; }
  if (!repositor) { toast('Selecione quem guardou', 'danger'); return; }

  try {
    const res = await fetch(`${API}/repositor/entrada-manual`, {
      credentials:'include', method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ codigo, descricao, quantidade, repositor_nome: repositor, quem_guardou: repositor, obs, situacao:'abastecido' })
    });
    if (res.ok) {
      toast('Entrada registrada!', 'success');
      fecharEntradaManual();
      // Limpa campos
      ['em-codigo','em-descricao','em-obs'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
      const q=document.getElementById('em-quantidade'); if(q) q.value='1';
      carregarTabelaReposicao();
    } else {
      const err = await res.json();
      toast(err.erro || 'Erro ao salvar', 'danger');
    }
  } catch(e) { toast('Sem conexão', 'danger'); }
}

