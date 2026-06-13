/* ══ WMS — Entrada Manual de Estoque ══
   Versão 1  |  Desktop (Supervisor) + Mobile (Supervisor + Repositor)
   Formatos de endereço: D106 | ZA387 | C099/VERT-C82-CX18 | U080 | U087/VERT-U01-CX13
══════════════════════════════════════════════════════════════════════ */

'use strict';

// ── Estado global ─────────────────────────────────────────────────────────
let _emLoteAtivo   = null;   // lote sendo editado
let _emItens       = [];     // itens do lote ativo
let _emFiltroStatus= 'todos';
let _emBusca       = '';
let _emPagina      = 1;
const EM_PAGE_SIZE = 30;

// Aceita qualquer endereço com letras, números, barra e hífen (ex: D106, ZA387, C099/VERT-C02-CX18)
const EM_ADDR_RE = /^[A-Z0-9][A-Z0-9\/\-]{1,29}$/i;

function emValidarEndereco(end) {
  if (!end || !end.trim()) return { ok: false, tipo: 'vazio' };
  return EM_ADDR_RE.test(end.trim()) ? { ok: true } : { ok: false, tipo: 'formato' };
}

// ── Toast & helpers ───────────────────────────────────────────────────────
const emToast = (msg, tipo='info') => typeof toast === 'function' ? toast(msg, tipo) : console.log(msg);
const emFmt   = d => { if (!d) return '—'; const [y,m,dy] = d.split('-'); return `${dy}/${m}/${y}`; };
const emFmtPct= (a,b) => b > 0 ? Math.round((a/b)*100) : 0;
const emStatusLabel = { pendente:'⬜ Pendente', abastecido:'✅ Abastecido', parcial:'⚠️ Parcial', nao_encontrado:'❌ Não encontrado' };
const emStatusClr   = { pendente:'#64748b', abastecido:'#22c55e', parcial:'#f59e0b', nao_encontrado:'#ef4444' };

// ── Carregar lista de lotes ───────────────────────────────────────────────
async function carregarEntradaManualLotes() {
  const ini = document.getElementById('em-filtro-ini')?.value || '';
  const fim = document.getElementById('em-filtro-fim')?.value || '';
  const wrap = document.getElementById('em-lista-lotes');
  if (!wrap) return;
  wrap.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text3)">Carregando...</div>`;

  const qs = new URLSearchParams();
  if (ini) qs.set('ini', ini);
  if (fim) qs.set('fim', fim);

  const lotes = await apiFetch(`/entrada-manual/lotes?${qs}`);
  if (!lotes || lotes.erro) { wrap.innerHTML = `<div style="padding:32px;text-align:center;color:var(--red)">Erro ao carregar lotes.</div>`; return; }

  if (!lotes.length) {
    wrap.innerHTML = `<div style="padding:48px;text-align:center;color:var(--text3)"><div style="font-size:32px;margin-bottom:8px">📭</div><div>Nenhum lote encontrado no período.</div></div>`;
    return;
  }

  wrap.innerHTML = lotes.map(l => {
    const pct = emFmtPct(l.itens_concluidos, l.total_itens);
    const barClr = pct === 100 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#3b82f6';
    const statusChip = l.status === 'concluido'
      ? `<span style="background:#14532d;color:#22c55e;border-radius:20px;padding:2px 10px;font-size:10px;font-weight:800">✅ Concluído</span>`
      : `<span style="background:#1c1917;color:#f59e0b;border:1px solid #78350f;border-radius:20px;padding:2px 10px;font-size:10px;font-weight:800">⏳ Em andamento</span>`;
    return `
    <div class="card" style="margin-bottom:10px;padding:14px 16px;cursor:pointer" onclick="abrirLoteEM(${l.id})">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:800;color:var(--text);margin-bottom:2px">${l.nome||'Entrada sem nome'}</div>
          <div style="font-size:11px;color:var(--text3)">📅 ${emFmt(l.data_entrada)} &nbsp;·&nbsp; 👤 ${l.criado_por||'—'}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">${statusChip}</div>
      </div>
      <div style="margin-top:10px">
        <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:700;color:var(--text3);margin-bottom:4px">
          <span>Progresso: ${l.itens_concluidos}/${l.total_itens} itens</span><span>${pct}%</span>
        </div>
        <div style="background:var(--surface2);border-radius:4px;height:6px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${barClr};border-radius:4px;transition:width .3s"></div>
        </div>
      </div>
      <div style="display:flex;gap:12px;margin-top:10px;font-size:11px">
        <span style="color:#22c55e">✅ ${l.itens_abastecidos} abast.</span>
        <span style="color:#f59e0b">⚠️ ${l.itens_parciais} parcial</span>
        <span style="color:#64748b">⬜ ${l.itens_pendentes} pend.</span>
        <span style="color:#ef4444">❌ ${l.itens_nao_encontrados} n/enc.</span>
        <span style="margin-left:auto;color:var(--accent);font-weight:700;cursor:pointer" onclick="event.stopPropagation();emExcluirLote(${l.id})">🗑️</span>
      </div>
    </div>`;
  }).join('');
}

// ── Abrir lote (entrar na tela de abastecimento) ──────────────────────────
async function abrirLoteEM(id) {
  const lote = await apiFetch(`/entrada-manual/lotes/${id}`);
  if (!lote || lote.erro) { emToast('Erro ao carregar lote', 'erro'); return; }
  _emLoteAtivo = lote;
  _emItens     = lote.itens || [];
  _emPagina    = 1;
  _emBusca     = '';
  _emFiltroStatus = 'todos';
  document.getElementById('em-busca')?.value && (document.getElementById('em-busca').value = '');
  emRenderizarTabela();
  document.getElementById('em-sec-lotes')  && (document.getElementById('em-sec-lotes').style.display = 'none');
  document.getElementById('em-sec-itens')  && (document.getElementById('em-sec-itens').style.display = '');
  emAtualizarCabecalho();
}

function emVoltarLotes() {
  _emLoteAtivo = null;
  _emItens = [];
  document.getElementById('em-sec-lotes') && (document.getElementById('em-sec-lotes').style.display = '');
  document.getElementById('em-sec-itens') && (document.getElementById('em-sec-itens').style.display = 'none');
  carregarEntradaManualLotes();
}

function emAtualizarCabecalho() {
  if (!_emLoteAtivo) return;
  const el = document.getElementById('em-lote-titulo');
  if (el) el.innerHTML = `
    <div style="font-size:14px;font-weight:900;color:var(--text)">${_emLoteAtivo.nome||'Sem nome'}</div>
    <div style="font-size:11px;color:var(--text3)">📅 ${emFmt(_emLoteAtivo.data_entrada)} · 👤 ${_emLoteAtivo.criado_por||'—'} · ${_emItens.length} itens</div>`;
  emAtualizarProgresso();
}

function emAtualizarProgresso() {
  if (!_emLoteAtivo) return;
  const total     = _emItens.length;
  const concluidos= _emItens.filter(i => i.status !== 'pendente').length;
  const pct       = emFmtPct(concluidos, total);
  const barClr    = pct === 100 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#3b82f6';
  const el = document.getElementById('em-progress-bar');
  const et = document.getElementById('em-progress-txt');
  if (el) { el.style.width = pct+'%'; el.style.background = barClr; }
  if (et) et.textContent = `${concluidos}/${total} (${pct}%)`;
  // stats
  const stats = { pendente:0, abastecido:0, parcial:0, nao_encontrado:0 };
  _emItens.forEach(i => { if (stats[i.status]!==undefined) stats[i.status]++; });
  document.getElementById('em-stat-pend') && (document.getElementById('em-stat-pend').textContent = stats.pendente);
  document.getElementById('em-stat-abast')&& (document.getElementById('em-stat-abast').textContent = stats.abastecido);
  document.getElementById('em-stat-parc') && (document.getElementById('em-stat-parc').textContent = stats.parcial);
  document.getElementById('em-stat-nenc') && (document.getElementById('em-stat-nenc').textContent = stats.nao_encontrado);
}

// ── Renderizar tabela de itens ────────────────────────────────────────────
function emRenderizarTabela() {
  if (!_emLoteAtivo) return;
  const tbody = document.getElementById('em-tbody');
  const mCards = document.getElementById('em-mobile-cards');
  if (!tbody && !mCards) return;

  // Filtros
  let itens = _emItens.filter(i => {
    const matchStatus = _emFiltroStatus === 'todos' || i.status === _emFiltroStatus;
    const matchBusca  = !_emBusca || i.codigo.toLowerCase().includes(_emBusca.toLowerCase()) || (i.descricao||'').toLowerCase().includes(_emBusca.toLowerCase());
    return matchStatus && matchBusca;
  });

  // Paginação
  const total = itens.length;
  const start = (_emPagina - 1) * EM_PAGE_SIZE;
  const page  = itens.slice(start, start + EM_PAGE_SIZE);

  document.getElementById('em-pag-info') && (document.getElementById('em-pag-info').textContent = `${start+1}–${Math.min(start+page.length, total)} de ${total}`);

  // Renderiza desktop
  if (tbody) {
    tbody.innerHTML = page.length ? page.map(it => emRowHTML(it)).join('') :
      `<tr><td colspan="8" style="padding:32px;text-align:center;color:var(--text3)">Nenhum item encontrado.</td></tr>`;
  }

  // Renderiza mobile
  if (mCards) {
    mCards.innerHTML = page.length ? page.map(it => emCardHTML(it)).join('') :
      `<div style="padding:32px;text-align:center;color:var(--text3)">Nenhum item encontrado.</div>`;
  }

  emAtualizarProgresso();
}

// ── HTML de uma linha (desktop) ───────────────────────────────────────────
function emRowHTML(it) {
  const clr = emStatusClr[it.status] || '#64748b';
  const endClr = it.endereco ? '#22c55e' : '#64748b';
  return `
  <tr id="em-tr-${it.id}" style="border-bottom:1px solid var(--border)">
    <td style="padding:8px 10px;font-family:monospace;font-size:11px;font-weight:800;color:#f97316">${it.codigo}</td>
    <td style="padding:8px 10px;font-size:11px;color:var(--text);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${it.descricao||''}">${it.descricao||'—'}</td>
    <td style="padding:8px 10px;text-align:center;font-weight:700">${it.quantidade_esperada}</td>
    <td style="padding:8px 10px;text-align:center">
      <div style="display:flex;align-items:center;gap:4px;justify-content:center">
        <button onclick="emAjustarQtd(${it.id},-1)" style="width:24px;height:24px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;font-size:14px;font-weight:700">−</button>
        <input id="em-qty-${it.id}" type="number" value="${it.quantidade_abastecida||0}" min="0"
          onchange="emQtdChange(${it.id},this.value)"
          style="width:52px;text-align:center;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:4px;color:var(--text);font-size:13px;font-weight:700">
        <button onclick="emAjustarQtd(${it.id},1)" style="width:24px;height:24px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;font-size:14px;font-weight:700">+</button>
      </div>
    </td>
    <td style="padding:8px 10px">
      <span style="font-family:monospace;font-size:12px;font-weight:700;color:${endClr};background:${endClr}18;border-radius:6px;padding:4px 8px;display:inline-block;min-width:60px">${it.endereco||'—'}</span>
    </td>
    <td style="padding:8px 10px">
      <input id="em-obs-${it.id}" type="text" value="${(it.obs||'').replace(/"/g,'&quot;')}" placeholder="Observação..."
        style="width:160px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:5px 8px;color:var(--text);font-size:11px;outline:none">
    </td>
    <td style="padding:8px 10px;text-align:center">
      <span style="background:${clr}22;color:${clr};border-radius:20px;padding:3px 8px;font-size:10px;font-weight:800;white-space:nowrap">${emStatusLabel[it.status]||it.status}</span>
    </td>
    <td style="padding:8px 10px;text-align:center">
      <button id="em-btn-save-${it.id}" onclick="emSalvarItem(${it.id})"
        style="background:#1e3a5f;color:#38bdf8;border:none;border-radius:6px;padding:5px 10px;font-size:10px;font-weight:700;cursor:pointer">
        💾 Salvar
      </button>
    </td>
  </tr>`;
}

// ── HTML de um card (mobile) ──────────────────────────────────────────────
function emCardHTML(it) {
  const clr = emStatusClr[it.status] || '#64748b';
  const endClr = it.endereco ? '#22c55e' : 'var(--text3)';
  return `
  <div id="em-card-${it.id}" style="background:var(--surface);border:1px solid var(--border);border-radius:14px;margin-bottom:8px;overflow:hidden">
    <div style="padding:10px 14px 8px;display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
      <div style="min-width:0">
        <div style="font-family:monospace;font-size:11px;font-weight:800;color:#f97316">${it.codigo}</div>
        <div style="font-size:12px;color:var(--text);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">${it.descricao||'—'}</div>
      </div>
      <span style="background:${clr}22;color:${clr};border-radius:20px;padding:3px 8px;font-size:9px;font-weight:800;flex-shrink:0;white-space:nowrap">${emStatusLabel[it.status]||it.status}</span>
    </div>
    <div style="border-top:1px solid var(--border);padding:10px 14px">
      <div style="display:flex;gap:12px;margin-bottom:10px">
        <div style="flex:1">
          <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.5px;margin-bottom:4px">ENDEREÇO</div>
          <div style="font-family:monospace;font-size:14px;font-weight:700;color:${endClr};background:var(--surface2);border-radius:8px;padding:8px 10px">${it.endereco||'—'}</div>
        </div>
        <div style="flex-shrink:0">
          <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.5px;margin-bottom:4px">QTD ESP.</div>
          <div style="font-size:18px;font-weight:900;color:var(--text);margin-top:6px">${it.quantidade_esperada}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.5px">QTD ABASTECIDA</div>
        <div style="display:flex;align-items:center;gap:0">
          <button onclick="emAjustarQtd(${it.id},-1,true)"
            style="width:36px;height:36px;border-radius:8px 0 0 8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:18px;font-weight:700;cursor:pointer">−</button>
          <input id="em-mqty-${it.id}" type="number" value="${it.quantidade_abastecida||0}" min="0"
            onchange="emQtdChange(${it.id},this.value,true)"
            style="width:60px;height:36px;text-align:center;background:var(--surface2);border:1px solid var(--border);border-top:1px solid var(--border);border-bottom:1px solid var(--border);border-left:none;border-right:none;color:var(--text);font-size:16px;font-weight:800;outline:none">
          <button onclick="emAjustarQtd(${it.id},1,true)"
            style="width:36px;height:36px;border-radius:0 8px 8px 0;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:18px;font-weight:700;cursor:pointer">+</button>
        </div>
      </div>
      <div>
        <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.5px;margin-bottom:4px">OBSERVAÇÃO</div>
        <input id="em-mobs-${it.id}" type="text" value="${(it.obs||'').replace(/"/g,'&quot;')}" placeholder="Observação sobre o endereço..."
          style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--text);font-size:12px;outline:none;box-sizing:border-box">
      </div>
    </div>
    <button id="em-mbtn-${it.id}" onclick="emSalvarItem(${it.id},true)"
      style="display:block;width:calc(100% - 28px);margin:8px 14px 12px;background:#f97316;color:#fff;border:none;border-radius:10px;padding:11px;font-size:13px;font-weight:800;cursor:pointer">
      💾 Salvar
    </button>
  </div>`;
}

// ── Ajuste de quantidade ──────────────────────────────────────────────────
function emAjustarQtd(id, delta, mobile = false) {
  const inp = document.getElementById(mobile ? `em-mqty-${id}` : `em-qty-${id}`);
  if (!inp) return;
  const novo = Math.max(0, (parseInt(inp.value)||0) + delta);
  inp.value = novo;
  emQtdChange(id, novo, mobile);
}

function emQtdChange(id, val, mobile = false) {
  const it = _emItens.find(i => i.id === id);
  if (!it) return;
  it.quantidade_abastecida = parseInt(val)||0;
  // Espelha no outro input (sync desktop↔mobile)
  const outId = mobile ? `em-qty-${id}` : `em-mqty-${id}`;
  const out = document.getElementById(outId);
  if (out) out.value = it.quantidade_abastecida;
}

// ── Validação de endereço em tempo real ───────────────────────────────────
function emEnderecoInput(id, inp, mobile = false) {
  const val = inp.value.toUpperCase();
  inp.value = val;
  const hintId = mobile ? `em-mend-hint-${id}` : `em-end-hint-${id}`;
  const icId   = mobile ? null : `em-end-ic-${id}`;
  const hint   = document.getElementById(hintId);
  const ic     = icId ? document.getElementById(icId) : null;

  if (!val) {
    inp.style.borderColor = 'var(--border)'; inp.style.color = 'var(--text)';
    if (hint) hint.textContent = '';
    if (ic)   ic.textContent  = '';
    return;
  }
  const v = emValidarEndereco(val);
  if (v.ok) {
    inp.style.borderColor = '#22c55e'; inp.style.color = '#22c55e';
    if (ic)   ic.textContent  = '✅';
    if (hint) hint.style.color = '#22c55e';
    if (hint) hint.textContent = 'Formato válido';
  } else {
    inp.style.borderColor = '#ef4444'; inp.style.color = '#ef4444';
    if (ic)   ic.textContent  = '❌';
    if (hint) hint.style.color = '#ef4444';
    if (hint) hint.textContent = 'Inválido. Ex: D106, ZA387, C099/VERT-C02-CX18';
  }

  // Espelha no outro input (sync)
  const outId = mobile ? `em-end-${id}` : `em-mend-${id}`;
  const out = document.getElementById(outId);
  if (out) { out.value = val; out.style.borderColor = inp.style.borderColor; out.style.color = inp.style.color; }
}

async function emEnderecoBlur(id, inp, mobile = false) {
  const val = (inp.value || '').trim().toUpperCase();
  if (!val) return;
  if (!emValidarEndereco(val).ok) return; // já tem erro inline

  // Checa histórico no servidor
  const it = _emItens.find(i => i.id === id);
  if (!it) return;
  const hist = await apiFetch(`/entrada-manual/historico-endereco/${encodeURIComponent(it.codigo)}`);
  const hintId = mobile ? `em-mend-hint-${id}` : `em-end-hint-${id}`;
  const hint   = document.getElementById(hintId);
  if (hist && hist.endereco && hist.endereco.toUpperCase() !== val) {
    inp.style.borderColor = '#f59e0b'; inp.style.color = '#f59e0b';
    if (hint) { hint.style.color = '#f59e0b'; hint.textContent = `⚠️ Histórico indica: ${hist.endereco}`; }
  } else if (hist && hist.endereco) {
    if (hint) { hint.style.color = '#22c55e'; hint.textContent = '✅ Confirmado pelo histórico'; }
  }
}

// ── Salvar item ───────────────────────────────────────────────────────────
async function emSalvarItem(id, mobile = false) {
  const it = _emItens.find(i => i.id === id);
  if (!it) return;

  const obsInp = document.getElementById(mobile ? `em-mobs-${id}` : `em-obs-${id}`);
  const obs = (obsInp?.value || '').trim();

  const btnId = mobile ? `em-mbtn-${id}` : `em-btn-save-${id}`;
  const btn   = document.getElementById(btnId);
  if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }

  const qtd = parseInt(document.getElementById(mobile ? `em-mqty-${id}` : `em-qty-${id}`)?.value)||0;
  const r = await apiFetch(`/entrada-manual/itens/${id}`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ quantidade_abastecida: qtd, obs: obs || null })
  });

  if (r?.erro) {
    emToast(`Erro: ${r.erro}`, 'erro');
    if (btn) { btn.disabled = false; btn.innerHTML = '💾 Salvar'; }
    return;
  }

  it.quantidade_abastecida = qtd;
  it.obs = obs;
  it.status = r.status;
  _emLoteAtivo.itens_concluidos = r.itens_concluidos;

  emToast(`✅ ${it.codigo} salvo!`, 'sucesso');

  const tr   = document.getElementById(`em-tr-${id}`);
  const card = document.getElementById(`em-card-${id}`);
  if (tr)   tr.outerHTML   = emRowHTML(it);
  if (card) card.outerHTML = emCardHTML(it);

  emAtualizarProgresso();
}

// ── Salvar todos os itens do lote de uma vez ──────────────────────────────
async function emSalvarTudo() {
  if (!_emLoteAtivo) return;
  const btn = document.getElementById('em-btn-salvar-tudo');
  if (btn) { btn.disabled = true; btn.textContent = `⏳ Salvando ${_emItens.length}...`; }

  const payload = _emItens.map(it => {
    const qtdEl = document.getElementById(`em-qty-${it.id}`);
    const obsEl = document.getElementById(`em-obs-${it.id}`);
    return {
      id: it.id,
      quantidade_abastecida: qtdEl ? (parseInt(qtdEl.value)||0) : (it.quantidade_abastecida||0),
      obs: obsEl ? (obsEl.value.trim() || null) : (it.obs || null)
    };
  });

  const r = await apiFetch(`/entrada-manual/lotes/${_emLoteAtivo.id}/itens-bulk`, {
    method: 'PUT', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ itens: payload })
  });

  if (btn) { btn.disabled = false; btn.innerHTML = '💾 Salvar Tudo'; }

  if (r?.erro) { emToast('Erro ao salvar: ' + r.erro, 'erro'); return; }

  payload.forEach(p => {
    const it = _emItens.find(i => i.id === p.id);
    if (it) { it.quantidade_abastecida = p.quantidade_abastecida; it.obs = p.obs; }
  });
  if (r.itens_concluidos !== undefined) _emLoteAtivo.itens_concluidos = r.itens_concluidos;

  emToast(`✅ ${payload.length} itens salvos!`, 'sucesso');
  emRenderizarTabela();
}

// ── Excluir lote ──────────────────────────────────────────────────────────
async function emExcluirLote(id) {
  wmsConfirm('Excluir este lote? Todos os itens serão removidos permanentemente.', async () => {
    const r = await apiFetch(`/entrada-manual/lotes/${id}`, { method:'DELETE' });
    if (r?.erro) { emToast('Erro ao excluir: '+r.erro, 'erro'); return; }
    emToast('Lote excluído.', 'sucesso');
    carregarEntradaManualLotes();
  });
}

// ── Import de arquivo Excel/CSV (via SheetJS) ─────────────────────────────
function emAbrirImport() {
  document.getElementById('em-import-input')?.click();
}

async function emProcessarArquivo(input) {
  const file = input.files?.[0];
  if (!file) return;

  const zona = document.getElementById('em-upload-zona');
  if (zona) zona.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text3)">⏳ Lendo arquivo...</div>`;

  try {
    const data = await file.arrayBuffer();
    const wb   = XLSX.read(data, { type:'array' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval:'' });

    if (!rows.length) { emToast('Arquivo vazio.', 'erro'); emResetUpload(); return; }

    // Detecta colunas (case-insensitive, trim)
    const col = key => {
      const aliases = {
        codigo:      ['código','codigo','cod','code','sku','ref'],
        descricao:   ['descrição','descricao','desc','description','produto','nome'],
        quantidade:  ['quantidade','quant.','quant','qtd','qty','quantity'],
        endereco:    ['endereço','endereco','end','local','localizacao','localização','address'],
      };
      const headers = Object.keys(rows[0]).map(h => h.trim().toLowerCase());
      for (const alias of aliases[key]) {
        const found = Object.keys(rows[0]).find(h => h.trim().toLowerCase() === alias.toLowerCase());
        if (found) return found;
      }
      return null;
    };

    const cCod  = col('codigo');
    const cDesc = col('descricao');
    const cQtd  = col('quantidade');
    const cEnd  = col('endereco');

    if (!cCod) { emToast('Coluna Código não encontrada.', 'erro'); emResetUpload(); return; }

    const itens = rows.map(r => ({
      codigo:    String(r[cCod]||'').trim().toUpperCase(),
      descricao: cDesc ? String(r[cDesc]||'').trim() : '',
      quantidade: parseInt(cQtd ? r[cQtd] : 1)||1,
      endereco:  cEnd ? String(r[cEnd]||'').trim().toUpperCase() : '',
    })).filter(i => i.codigo);

    if (!itens.length) { emToast('Nenhum item válido encontrado.', 'erro'); emResetUpload(); return; }

    // Preview
    emMostrarPreview(itens, file.name);
  } catch(e) {
    emToast('Erro ao ler arquivo: '+e.message, 'erro');
    emResetUpload();
  }
  input.value = '';
}

function emResetUpload() {
  const zona = document.getElementById('em-upload-zona');
  if (zona) zona.innerHTML = emUploadZonaHTML();
}

function emMostrarPreview(itens, nomeArq) {
  const zona = document.getElementById('em-upload-zona');
  if (!zona) return;

  const semEnd = itens.filter(i => !i.endereco).length;
  const endInv = itens.filter(i => i.endereco && !emValidarEndereco(i.endereco).ok).length;

  zona.innerHTML = `
  <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:14px 16px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px">
      <div>
        <div style="font-size:13px;font-weight:800;color:#22c55e">✅ ${nomeArq}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">${itens.length} itens detectados</div>
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="emConfirmarImport(window.__emItensPreview)"
          style="background:#22c55e;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:12px;font-weight:700;cursor:pointer">
          ✅ Importar ${itens.length} itens
        </button>
        <button onclick="emResetUpload()"
          style="background:var(--surface);border:1px solid var(--border);color:var(--text3);border-radius:8px;padding:8px 12px;font-size:12px;cursor:pointer">
          ✕ Cancelar
        </button>
      </div>
    </div>
    ${semEnd ? `<div style="font-size:11px;color:#f59e0b;background:#78350f22;border-radius:6px;padding:6px 10px;margin-bottom:8px">⚠️ ${semEnd} item(ns) sem endereço — poderão ser preenchidos depois.</div>` : ''}
    ${endInv ? `<div style="font-size:11px;color:#ef4444;background:#7f1d1d22;border-radius:6px;padding:6px 10px;margin-bottom:8px">❌ ${endInv} endereço(s) com formato inválido — serão importados e deverão ser corrigidos.</div>` : ''}
    <div style="overflow-x:auto;border-radius:8px;border:1px solid var(--border);max-height:200px;overflow-y:auto">
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead style="position:sticky;top:0;background:var(--surface2)">
          <tr style="border-bottom:1px solid var(--border)">
            <th style="padding:6px 10px;text-align:left;font-size:9px;font-weight:800;color:var(--text3)">CÓDIGO</th>
            <th style="padding:6px 10px;text-align:left;font-size:9px;font-weight:800;color:var(--text3)">DESCRIÇÃO</th>
            <th style="padding:6px 10px;text-align:center;font-size:9px;font-weight:800;color:var(--text3)">QTD</th>
            <th style="padding:6px 10px;text-align:left;font-size:9px;font-weight:800;color:var(--text3)">ENDEREÇO</th>
          </tr>
        </thead>
        <tbody>
          ${itens.slice(0,50).map(it => {
            const vEnd = it.endereco ? emValidarEndereco(it.endereco) : null;
            const endClr = !it.endereco ? '#64748b' : vEnd?.ok ? '#22c55e' : '#ef4444';
            return `<tr style="border-bottom:1px solid var(--border)">
              <td style="padding:5px 10px;font-family:monospace;font-weight:700;color:#f97316">${it.codigo}</td>
              <td style="padding:5px 10px;color:var(--text)">${it.descricao||'—'}</td>
              <td style="padding:5px 10px;text-align:center;font-weight:700">${it.quantidade}</td>
              <td style="padding:5px 10px;font-family:monospace;font-weight:700;color:${endClr}">${it.endereco||'—'}</td>
            </tr>`;
          }).join('')}
          ${itens.length > 50 ? `<tr><td colspan="4" style="padding:8px;text-align:center;color:var(--text3);font-size:11px">... e mais ${itens.length-50} itens</td></tr>` : ''}
        </tbody>
      </table>
    </div>
  </div>`;
  window.__emItensPreview = itens;
}

async function emConfirmarImport(itens) {
  if (!itens?.length) return;

  const hoje = new Date().toISOString().split('T')[0];
  const nome = document.getElementById('em-nome-lote')?.value?.trim() || `Entrada ${hoje}`;

  const zona = document.getElementById('em-upload-zona');
  if (zona) zona.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text3)">⏳ Criando lote...</div>`;

  const r = await apiFetch('/entrada-manual/lotes', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ nome, data_entrada: hoje, itens })
  });

  if (r?.erro) { emToast('Erro ao importar: '+r.erro, 'erro'); emResetUpload(); return; }

  emToast(`✅ ${r.total} itens importados! Abrindo lote...`, 'sucesso');
  emResetUpload();
  await carregarEntradaManualLotes();
  await abrirLoteEM(r.id);
}

// ── HTML da zona de upload ────────────────────────────────────────────────
function emUploadZonaHTML() {
  const isMobile = window.innerWidth < 768;
  return `
  <div style="border:2px dashed var(--border);border-radius:12px;padding:24px;text-align:center;cursor:pointer;transition:border-color .2s"
       onclick="emAbrirImport()" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
    <div style="font-size:32px;margin-bottom:8px">📂</div>
    <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:4px">${isMobile ? 'Toque para selecionar o arquivo' : 'Clique ou arraste o arquivo aqui'}</div>
    <div style="font-size:11px;color:var(--text3)">Suporte: <b>.xlsx · .xls · .csv</b></div>
    <div style="display:inline-block;margin-top:10px;background:var(--surface2);color:var(--accent);border-radius:20px;padding:4px 14px;font-size:10px;font-weight:700;border:1px solid var(--border)">
      Colunas: Código · Quant. · Descrição · Endereço
    </div>
    <input id="em-import-input" type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="emProcessarArquivo(this)">
  </div>`;
}

// ── Exportar CSV ──────────────────────────────────────────────────────────
function emExportarCSV() {
  const ini = document.getElementById('em-filtro-ini')?.value || '';
  const fim = document.getElementById('em-filtro-fim')?.value || '';
  const loteId = _emLoteAtivo?.id;
  const qs = new URLSearchParams();
  if (loteId) qs.set('lote_id', loteId);
  else { if (ini) qs.set('ini',ini); if (fim) qs.set('fim',fim); }
  window.location.href = `/entrada-manual/exportar?${qs}`;
}

// ── Renderização da página principal ─────────────────────────────────────
function renderizarPagEntradaManual(containerId) {
  const pag = document.getElementById(containerId || 'pag-entrada-manual');
  if (!pag) return;

  const hoje = new Date().toISOString().split('T')[0];
  const primDia = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

  pag.innerHTML = `
  <div style="padding:0 0 32px">

    <!-- SEÇÃO: LOTES (listagem) -->
    <div id="em-sec-lotes">
      <div class="pg-title" style="margin-bottom:16px">
        📥 Entrada Manual
        <button onclick="emExportarCSV()" class="btn btn-outline btn-sm" style="float:right;margin-left:8px">📊 Excel</button>
      </div>

      <!-- Upload + nome do lote -->
      <div class="card" style="margin-bottom:14px;padding:16px 18px">
        <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:1px;margin-bottom:10px">📂 IMPORTAR NOVO ARQUIVO</div>
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
          <input id="em-nome-lote" placeholder="Nome do lote (ex: 3R Import 28/05)" class="input"
            style="flex:1;min-width:180px;padding:8px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px">
        </div>
        <div id="em-upload-zona">${emUploadZonaHTML()}</div>
      </div>

      <!-- Filtros + lista -->
      <div class="card" style="padding:12px 16px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div>
            <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.5px;margin-bottom:3px">DE</div>
            <input id="em-filtro-ini" type="date" value="${primDia}" class="input"
              style="padding:7px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px">
          </div>
          <div>
            <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.5px;margin-bottom:3px">ATÉ</div>
            <input id="em-filtro-fim" type="date" value="${hoje}" class="input"
              style="padding:7px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px">
          </div>
          <button onclick="carregarEntradaManualLotes()" class="btn btn-primary btn-sm" style="margin-top:14px">🔍 Filtrar</button>
        </div>
      </div>

      <div id="em-lista-lotes">
        <div style="padding:32px;text-align:center;color:var(--text3)">Carregando...</div>
      </div>
    </div>

    <!-- SEÇÃO: ITENS (dentro de um lote) -->
    <div id="em-sec-itens" style="display:none">

      <!-- Header do lote -->
      <div style="margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <button onclick="emVoltarLotes()" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:7px 12px;color:var(--text3);cursor:pointer;font-size:12px;font-weight:700;white-space:nowrap">
            ← Voltar
          </button>
          <div id="em-lote-titulo" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button onclick="emExportarCSV()" style="background:#16a34a;color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer">📊 Excel</button>
          <button id="em-btn-salvar-tudo" onclick="emSalvarTudo()" style="background:#1e3a5f;color:#38bdf8;border:none;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer">💾 Salvar Tudo</button>
        </div>
      </div>

      <!-- Barra de progresso -->
      <div class="card" style="padding:12px 16px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:700;color:var(--text3);margin-bottom:6px">
          <span>PROGRESSO</span><span id="em-progress-txt">0/0</span>
        </div>
        <div style="background:var(--surface2);border-radius:6px;height:8px;overflow:hidden;margin-bottom:10px">
          <div id="em-progress-bar" style="height:100%;width:0%;background:#3b82f6;border-radius:6px;transition:width .4s"></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
          ${[['⬜','PENDENTES','em-stat-pend','#64748b'],['✅','ABASTECIDOS','em-stat-abast','#22c55e'],['⚠️','PARCIAIS','em-stat-parc','#f59e0b'],['❌','NÃO ENC.','em-stat-nenc','#ef4444']].map(([ic,lb,id,c])=>`
          <div style="background:var(--surface2);border-radius:8px;padding:8px;text-align:center;border:1px solid var(--border)">
            <div style="font-size:18px;font-weight:900;color:${c}" id="${id}">0</div>
            <div style="font-size:8px;color:var(--text3);font-weight:700;letter-spacing:.5px">${ic} ${lb}</div>
          </div>`).join('')}
        </div>
      </div>

      <!-- Filtros da tabela -->
      <div class="card" style="padding:10px 14px;margin-bottom:10px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <input id="em-busca" placeholder="🔍 Código ou descrição..." oninput="_emBusca=this.value;_emPagina=1;emRenderizarTabela()"
            style="flex:1;min-width:160px;padding:7px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px;outline:none">
          ${['todos','pendente','abastecido','parcial','nao_encontrado'].map(s=>`
          <button onclick="_emFiltroStatus='${s}';_emPagina=1;emRenderizarTabela();this.closest('.card').querySelectorAll('button').forEach(b=>b.style.background='var(--surface2)');this.style.background='var(--accent)';this.style.color='#fff'"
            style="padding:6px 12px;border-radius:20px;border:1px solid var(--border);background:${s==='todos'?'var(--accent)':'var(--surface2)'};color:${s==='todos'?'#fff':'var(--text3)'};font-size:10px;font-weight:700;cursor:pointer;white-space:nowrap">
            ${s==='todos'?'Todos':emStatusLabel[s]}
          </button>`).join('')}
        </div>
      </div>

      <!-- DESKTOP TABLE -->
      <div class="tabela-wrap" id="em-desktop-table" style="display:none">
        <table>
          <thead><tr>
            <th>CÓDIGO</th><th>DESCRIÇÃO</th>
            <th style="text-align:center">QTD ESP.</th>
            <th style="text-align:center">QTD ABAST.</th>
            <th>ENDEREÇO</th>
            <th>OBSERVAÇÃO</th>
            <th style="text-align:center">STATUS</th>
            <th style="text-align:center">SALVAR</th>
          </tr></thead>
          <tbody id="em-tbody"></tbody>
        </table>
      </div>

      <!-- MOBILE CARDS -->
      <div id="em-mobile-cards" style="display:none"></div>

      <!-- Paginação -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:11px;color:var(--text3);padding:0 2px">
        <span id="em-pag-info"></span>
        <div style="display:flex;gap:4px">
          <button onclick="_emPagina=Math.max(1,_emPagina-1);emRenderizarTabela()" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text3);cursor:pointer;font-size:11px">←</button>
          <button onclick="_emPagina++;emRenderizarTabela()" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text3);cursor:pointer;font-size:11px">→</button>
        </div>
      </div>

    </div>
  </div>`;

  // Detecta mobile vs desktop e mostra o layout certo
  emAjustarLayout();
  carregarEntradaManualLotes();
}

function emAjustarLayout() {
  const isMobile = window.innerWidth < 768;
  const desktop = document.getElementById('em-desktop-table');
  const mobile  = document.getElementById('em-mobile-cards');
  if (desktop) desktop.style.display = isMobile ? 'none' : '';
  if (mobile)  mobile.style.display  = isMobile ? '' : 'none';
}

// Ajusta layout ao redimensionar
window.addEventListener('resize', emAjustarLayout);

// ── irPara integração ─────────────────────────────────────────────────────
const _emOrigIrPara = typeof irPara === 'function' ? irPara : null;
// Registra o init da página (chamado pelo irPara do auth.js)
window._pagInits = window._pagInits || {};
window._pagInits['entrada-manual'] = renderizarPagEntradaManual;
