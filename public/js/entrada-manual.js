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
  const concluidos= _emItens.filter(i => i.status === 'abastecido' || i.status === 'parcial').length;
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
        <div style="font-size:12px;color:var(--text);margin-top:2px;line-height:1.4">${it.descricao||'—'}</div>
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
    ${it.status !== 'pendente'
      ? `<button id="em-mbtn-${it.id}" onclick="emSalvarItem(${it.id},true)" data-saved="true" disabled
          style="display:block;width:calc(100% - 28px);margin:8px 14px 12px;background:#16a34a;color:#fff;border:none;border-radius:10px;padding:11px;font-size:13px;font-weight:800;cursor:not-allowed;opacity:.85">
          ✓ Salvo
        </button>`
      : `<button id="em-mbtn-${it.id}" onclick="emSalvarItem(${it.id},true)"
          style="display:block;width:calc(100% - 28px);margin:8px 14px 12px;background:#f97316;color:#fff;border:none;border-radius:10px;padding:11px;font-size:13px;font-weight:800;cursor:pointer">
          💾 Salvar
        </button>`}
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
  const parsed = parseInt(val)||0;
  // Sincroniza inputs desktop↔mobile
  const outId = mobile ? `em-qty-${id}` : `em-mqty-${id}`;
  const out = document.getElementById(outId);
  if (out) out.value = parsed;
  // Reativa botão de salvar se estava no estado "já salvo"
  const btn = document.getElementById(mobile ? `em-mbtn-${id}` : `em-btn-save-${id}`);
  if (btn && btn.dataset.saved === 'true') {
    btn.disabled = false; btn.dataset.saved = ''; btn.style.background = '#f97316'; btn.innerHTML = '💾 Salvar';
  }
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

  // Não faz nada se os dados não mudaram
  if (qtd === (it.quantidade_abastecida || 0) && obs === (it.obs || '')) {
    emToast('Nenhuma alteração para salvar', 'aviso');
    if (btn) { btn.disabled = false; btn.innerHTML = '💾 Salvar'; }
    return;
  }

  // Confirmação se quantidade está fora do esperado
  const esp = it.quantidade_esperada || 0;
  if (esp > 0 && qtd > esp) {
    if (btn) { btn.disabled = false; btn.innerHTML = '💾 Salvar'; }
    const ok = await emConfirmarQtd(it.codigo, qtd, esp, 'maior');
    if (!ok) return;
    if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }
  } else if (esp > 0 && qtd > 0 && qtd < esp) {
    if (btn) { btn.disabled = false; btn.innerHTML = '💾 Salvar'; }
    const ok = await emConfirmarQtd(it.codigo, qtd, esp, 'menor');
    if (!ok) return;
    if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }
  }

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

  // Marca o botão como "já salvo" para evitar duplo salvamento
  const savedBtn = document.getElementById(btnId);
  if (savedBtn) {
    savedBtn.disabled = true;
    savedBtn.dataset.saved = 'true';
    savedBtn.style.background = '#16a34a';
    savedBtn.innerHTML = '✓ Salvo';
  }

  emAtualizarProgresso();
}

// ── Modal de confirmação de quantidade fora do esperado ──────────────────
function emConfirmarQtd(codigo, qtd, esp, tipo = 'maior') {
  return new Promise(resolve => {
    const mid = 'em-modal-confirm-qtd';
    document.getElementById(mid)?.remove();
    const el = document.createElement('div');
    el.id = mid;
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px';
    const isMaior = tipo === 'maior';
    const cor     = isMaior ? '#dc2626' : '#d97706';
    const bgCor   = isMaior ? '#fff7ed' : '#fefce8';
    const borda   = isMaior ? '#f97316' : '#f59e0b';
    const titulo  = isMaior ? 'Quantidade acima do esperado' : 'Quantidade abaixo do esperado';
    const msg     = isMaior ? `Realmente chegaram <b>${qtd}</b> unidades?` : `Confirma salvar com quantidade incompleta (${qtd} de ${esp})?`;
    const corBtn  = isMaior ? '#16a34a' : '#d97706';
    el.innerHTML = `
      <div style="background:var(--surface);border-radius:16px;padding:24px;width:100%;max-width:360px;box-shadow:0 8px 32px rgba(0,0,0,.3)">
        <div style="font-size:32px;text-align:center;margin-bottom:12px">⚠️</div>
        <div style="font-size:15px;font-weight:800;color:var(--text);text-align:center;margin-bottom:8px">${titulo}</div>
        <div style="background:${bgCor};border:1.5px solid ${borda};border-radius:10px;padding:14px;margin-bottom:16px;text-align:center">
          <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:6px">${codigo}</div>
          <div style="display:flex;justify-content:center;gap:24px">
            <div><div style="font-size:10px;color:#92400e;font-weight:700">ESPERADO</div><div style="font-size:28px;font-weight:900;color:#92400e">${esp}</div></div>
            <div style="font-size:24px;color:${borda};align-self:center">→</div>
            <div><div style="font-size:10px;color:${cor};font-weight:700">INFORMADO</div><div style="font-size:28px;font-weight:900;color:${cor}">${qtd}</div></div>
          </div>
        </div>
        <div style="font-size:13px;color:var(--text2);text-align:center;margin-bottom:20px">${msg}</div>
        <div style="display:flex;gap:10px">
          <button id="em-cq-nao" style="flex:1;padding:13px;background:var(--surface2);border:1.5px solid var(--border);border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;color:var(--text)">✕ Corrigir</button>
          <button id="em-cq-sim" style="flex:1;padding:13px;background:${corBtn};border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;color:#fff">✓ Confirmar ${qtd}</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    document.getElementById('em-cq-sim').onclick = () => { el.remove(); resolve(true); };
    document.getElementById('em-cq-nao').onclick = () => { el.remove(); resolve(false); };
  });
}

// ── Salvar todos os itens do lote de uma vez ──────────────────────────────
async function emSalvarTudo() {
  if (!_emLoteAtivo) return;
  const btn = document.getElementById('em-btn-salvar-tudo');
  if (btn) { btn.disabled = true; btn.textContent = `⏳ Salvando ${_emItens.length}...`; }

  // Só envia itens com alteração pendente (não os já salvos individualmente)
  const payload = _emItens.map(it => {
    const qtdEl = document.getElementById(`em-qty-${it.id}`) || document.getElementById(`em-mqty-${it.id}`);
    const obsEl = document.getElementById(`em-obs-${it.id}`) || document.getElementById(`em-mobs-${it.id}`);
    const newQtd = qtdEl ? (parseInt(qtdEl.value)||0) : (it.quantidade_abastecida||0);
    const newObs = obsEl ? (obsEl.value.trim() || null) : (it.obs || null);
    const changed = newQtd !== (it.quantidade_abastecida || 0) || newObs !== (it.obs || null);
    return changed ? { id: it.id, quantidade_abastecida: newQtd, obs: newObs } : null;
  }).filter(Boolean);

  if (!payload.length) {
    emToast('Nenhum item com alterações para salvar.', 'aviso');
    if (btn) { btn.disabled = false; btn.innerHTML = '💾 Salvar Tudo'; }
    return;
  }

  // Verificar se algum item supera a quantidade esperada
  const acimaDaEsperança = payload.filter(p => {
    const it = _emItens.find(i => i.id === p.id);
    return it && (it.quantidade_esperada || 0) > 0 && p.quantidade_abastecida > it.quantidade_esperada;
  });
  if (acimaDaEsperança.length > 0) {
    if (btn) { btn.disabled = false; btn.innerHTML = '💾 Salvar Tudo'; }
    const linhas = acimaDaEsperança.map(p => {
      const it = _emItens.find(i => i.id === p.id);
      return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)"><span style="font-family:monospace;font-size:12px;color:#f97316">${it.codigo}</span><span style="font-size:12px">esp. <b>${it.quantidade_esperada}</b> → inf. <b style="color:#dc2626">${p.quantidade_abastecida}</b></span></div>`;
    }).join('');
    const modalId = 'em-modal-bulk-confirm';
    document.getElementById(modalId)?.remove();
    const el = document.createElement('div');
    el.id = modalId;
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px';
    el.innerHTML = `
      <div style="background:var(--surface);border-radius:16px;padding:24px;width:100%;max-width:380px;box-shadow:0 8px 32px rgba(0,0,0,.3)">
        <div style="font-size:32px;text-align:center;margin-bottom:8px">⚠️</div>
        <div style="font-size:15px;font-weight:800;color:var(--text);text-align:center;margin-bottom:12px">${acimaDaEsperança.length} item(s) acima do esperado</div>
        <div style="max-height:180px;overflow-y:auto;margin-bottom:16px;padding:8px 12px;background:var(--surface2);border-radius:10px">${linhas}</div>
        <div style="font-size:13px;color:var(--text2);text-align:center;margin-bottom:20px">Confirma salvar com essas quantidades?</div>
        <div style="display:flex;gap:10px">
          <button id="em-bk-nao" style="flex:1;padding:13px;background:var(--surface2);border:1.5px solid var(--border);border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;color:var(--text)">✕ Corrigir</button>
          <button id="em-bk-sim" style="flex:1;padding:13px;background:#16a34a;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;color:#fff">✓ Confirmar tudo</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    const ok = await new Promise(resolve => {
      document.getElementById('em-bk-sim').onclick = () => { el.remove(); resolve(true); };
      document.getElementById('em-bk-nao').onclick = () => { el.remove(); resolve(false); };
    });
    if (!ok) return;
    if (btn) { btn.disabled = true; btn.textContent = `⏳ Salvando ${_emItens.length}...`; }
  }

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

  const isMob = window.innerWidth < 768;
  pag.innerHTML = `
  <div style="padding:0 0 32px">

    <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap">
      <button id="em-tab-btn-estoque" onclick="emMostrarAba('estoque')"
        style="padding:8px 16px;border-radius:20px;border:1px solid var(--border);background:var(--accent);color:#fff;font-size:11px;font-weight:700;cursor:pointer">📥 Entrada de Estoque</button>
      <button id="em-tab-btn-barcode" onclick="emMostrarAba('barcode')"
        style="padding:8px 16px;border-radius:20px;border:1px solid var(--border);background:var(--surface2);color:var(--text3);font-size:11px;font-weight:700;cursor:pointer">🔍 Código de Barras</button>
      ${isMob ? '' : `<button id="em-tab-btn-inventario" onclick="emMostrarAba('inventario')"
        style="padding:8px 16px;border-radius:20px;border:1px solid var(--border);background:var(--surface2);color:var(--text3);font-size:11px;font-weight:700;cursor:pointer">📋 Inventário</button>`}
    </div>

    <div id="em-aba-estoque">

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
    </div><!-- /em-aba-estoque -->

    <!-- ABA: CÓDIGO DE BARRAS -->
    <div id="em-aba-barcode" style="display:none">
      <div class="card" style="padding:20px;margin-bottom:14px">
        <div style="font-size:13px;font-weight:800;color:var(--text);margin-bottom:6px">🔍 Exibir Código de Barras na Tela</div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:14px">Quando o leitor não consegue ler a etiqueta física, busque o produto aqui e bipe o código exibido na tela.</div>
        <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
          <input id="bc-input" type="text" placeholder="Código do produto ou código de barras (EAN)..."
            style="flex:1;min-width:200px;padding:11px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:14px;outline:none"
            onkeydown="if(event.key==='Enter')bcBuscar()">
          <button onclick="bcBuscar()" style="background:var(--accent);color:#fff;border:none;border-radius:10px;padding:11px 22px;font-size:13px;font-weight:700;cursor:pointer">🔍 Buscar</button>
        </div>
        <div id="bc-resultado"></div>
      </div>
      <div class="card" style="padding:14px 18px">
        <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:1px;margin-bottom:8px">📦 IMPORTAR CATÁLOGO DE PRODUTOS (barras.xlsx)</div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:10px">Importe o arquivo barras.xlsx para habilitar a busca por código de barras. <span id="bc-total-produtos" style="color:var(--accent);font-weight:700"></span></div>
        <div id="bc-upload-zona">${catUploadZonaHTML()}</div>
      </div>
    </div>

    ${isMob ? '' : `<!-- ABA: INVENTÁRIO (desktop) -->
    <div id="em-aba-inventario" style="display:none">
      <div id="inv-sec-sessoes"></div>
      <div id="inv-sec-itens" style="display:none"></div>
    </div>`}

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

// ════════════════════════════════════════════════════════════════════════════
// ABAS
// ════════════════════════════════════════════════════════════════════════════

let _emAbaTiva = 'estoque';

function emMostrarAba(aba) {
  _emAbaTiva = aba;
  ['estoque','barcode','inventario'].forEach(a => {
    const el  = document.getElementById(`em-aba-${a}`);
    const btn = document.getElementById(`em-tab-btn-${a}`);
    if (el)  el.style.display  = a === aba ? '' : 'none';
    if (btn) { btn.style.background = a === aba ? 'var(--accent)' : 'var(--surface2)'; btn.style.color = a === aba ? '#fff' : 'var(--text3)'; }
  });
  if (aba === 'inventario') invCarregarSessoes();
  if (aba === 'barcode') bcAtualizarTotal();
}

// ════════════════════════════════════════════════════════════════════════════
// CATÁLOGO / CÓDIGO DE BARRAS
// ════════════════════════════════════════════════════════════════════════════

function catUploadZonaHTML() {
  return `
  <div style="border:2px dashed var(--border);border-radius:10px;padding:16px;text-align:center;cursor:pointer"
       onclick="catAbrirImport()" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
    <div style="font-size:24px;margin-bottom:6px">📂</div>
    <div style="font-size:12px;font-weight:700;color:var(--text)">Clique para importar barras.xlsx</div>
    <div style="font-size:10px;color:var(--text3);margin-top:4px">Suporte: .xlsx · .xls · .csv</div>
    <input id="cat-import-input" type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="catProcessarArquivo(this)">
  </div>`;
}

function catAbrirImport() { document.getElementById('cat-import-input')?.click(); }

async function bcAtualizarTotal() {
  const r = await apiFetch('/entrada-manual/produtos/total');
  const el = document.getElementById('bc-total-produtos');
  if (el && r?.total !== undefined) el.textContent = `(${r.total.toLocaleString('pt-BR')} produtos no catálogo)`;
}

async function catProcessarArquivo(input) {
  const file = input.files?.[0];
  if (!file) return;
  const zona = document.getElementById('bc-upload-zona');
  if (zona) zona.innerHTML = `<div style="padding:12px;text-align:center;color:var(--text3)">⏳ Lendo arquivo...</div>`;
  try {
    const data = await file.arrayBuffer();
    const wb   = XLSX.read(data, { type:'array' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval:'' });
    if (!rows.length) { emToast('Arquivo vazio.', 'erro'); if (zona) zona.innerHTML = catUploadZonaHTML(); return; }

    const norm  = s => s.normalize('NFD').replace(/\p{Mn}/gu,'').toLowerCase().trim();
    const alias = (_key, names) => {
      const found = Object.keys(rows[0]).find(h => names.some(n => norm(h) === norm(n)));
      return found || null;
    };
    const cCod  = alias('codigo',     ['código','codigo','cod','sku','ref']);
    const cBarr = alias('barras',     ['código de barras','codigo de barras','barras','barcode','ean','gtin','cod. barras']);
    const cNome = alias('nome',       ['nome','descrição','descricao','produto','description','descritor simples','name']);
    const cSaldo= alias('saldo',      ['saldo','estoque','stock','quantidade','qtd','qty','quantidade total']);
    const cDisp = alias('disponivel', ['disponível','disponivel','available','disp']);
    const cLoc  = alias('localizacao',['localização no estoque','localizacao no estoque','localizacao','localização','local','address','endereço']);

    if (!cCod) { emToast('Coluna Código não encontrada.', 'erro'); if (zona) zona.innerHTML = catUploadZonaHTML(); return; }

    const produtos = rows.map(r => ({
      codigo:        String(r[cCod]||'').trim().toUpperCase(),
      codigo_barras: cBarr ? String(r[cBarr]||'').trim() : '',
      nome:          cNome ? String(r[cNome]||'').trim() : '',
      saldo:         cSaldo ? (parseFloat(r[cSaldo])||0) : 0,
      disponivel:    cDisp ? (parseFloat(r[cDisp])||0) : 0,
      localizacao:   cLoc ? String(r[cLoc]||'').trim().toUpperCase() : '',
    })).filter(p => p.codigo);

    if (!produtos.length) { emToast('Nenhum produto válido.', 'erro'); if (zona) zona.innerHTML = catUploadZonaHTML(); return; }

    if (zona) zona.innerHTML = `<div style="padding:12px;text-align:center;color:var(--text3)">⏳ Importando ${produtos.length.toLocaleString('pt-BR')} produtos...</div>`;

    // Envia em lotes de 1000
    const LOTE = 1000;
    let total = 0;
    for (let i = 0; i < produtos.length; i += LOTE) {
      const lote = produtos.slice(i, i + LOTE);
      const r = await apiFetch('/entrada-manual/produtos/importar', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ produtos: lote })
      });
      if (r?.erro) { emToast('Erro: '+r.erro, 'erro'); break; }
      total += (r.inseridos || 0) + (r.atualizados || 0);
      if (zona) zona.innerHTML = `<div style="padding:12px;text-align:center;color:var(--text3)">⏳ ${total.toLocaleString('pt-BR')} / ${produtos.length.toLocaleString('pt-BR')} processados...</div>`;
    }

    emToast(`✅ Catálogo importado! ${produtos.length.toLocaleString('pt-BR')} produtos.`, 'sucesso');
    if (zona) zona.innerHTML = catUploadZonaHTML();
    bcAtualizarTotal();
  } catch(e) {
    emToast('Erro ao ler arquivo: '+e.message, 'erro');
    if (zona) zona.innerHTML = catUploadZonaHTML();
  }
  input.value = '';
}

async function bcBuscar() {
  const inp = document.getElementById('bc-input');
  const q = (inp?.value || '').trim();
  if (!q) return;
  const div = document.getElementById('bc-resultado');
  if (div) div.innerHTML = `<div style="padding:14px;text-align:center;color:var(--text3)">⏳ Buscando...</div>`;
  const result = await apiFetch(`/entrada-manual/produtos/buscar?q=${encodeURIComponent(q)}`);
  if (!result || result.erro || !result.length) {
    if (div) div.innerHTML = `<div style="padding:14px;text-align:center;color:var(--red)">❌ Produto não encontrado. Verifique o código e tente novamente.</div>`;
    return;
  }
  bcRenderizar(result[0]);
}

function bcRenderizar(p) {
  const div = document.getElementById('bc-resultado');
  if (!div) return;
  const cb = p.codigo_barras || '';
  const temCB = cb.length >= 8;

  div.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-family:monospace;font-size:12px;font-weight:800;color:#f97316">${p.codigo}</div>
      <div style="font-size:14px;color:var(--text);margin:4px 0">${p.nome||'—'}</div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:14px">📦 Saldo: ${p.saldo} · Disp.: ${p.disponivel} · 📍 ${p.localizacao||'—'}</div>
      ${temCB ? `
      <div style="text-align:center;background:#fff;border-radius:12px;padding:24px 16px;margin-bottom:10px">
        <svg id="bc-svg" style="max-width:100%;height:auto"></svg>
        <div style="font-size:13px;color:#666;margin-top:10px;font-family:monospace;letter-spacing:2px">${cb}</div>
      </div>` : `
      <div style="text-align:center;background:var(--surface);border:2px dashed var(--border);border-radius:10px;padding:24px;margin-bottom:10px">
        <div style="font-size:28px;margin-bottom:6px">🚫</div>
        <div style="font-size:12px;color:var(--text3)">Produto sem código de barras cadastrado.</div>
      </div>`}
      <button onclick="document.getElementById('bc-input').value='';document.getElementById('bc-resultado').innerHTML='';document.getElementById('bc-input').focus()"
        style="background:var(--surface);border:1px solid var(--border);color:var(--text3);border-radius:8px;padding:7px 14px;font-size:11px;cursor:pointer">🔄 Nova busca</button>
    </div>`;

  if (temCB) {
    try {
      const fmt = cb.length === 13 ? 'EAN13' : cb.length === 12 ? 'UPC' : cb.length === 8 ? 'EAN8' : 'CODE128';
      JsBarcode('#bc-svg', cb, { format: fmt, width: 3, height: 140, displayValue: false, margin: 10 });
    } catch(e) {
      try { JsBarcode('#bc-svg', cb, { format:'CODE128', width:2, height:100, displayValue:false }); } catch(e2) {}
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// INVENTÁRIO
// ════════════════════════════════════════════════════════════════════════════

let _invSessoes     = [];
let _invSessaoAtiva = null;
let _invItens       = [];
let _invBusca       = '';
let _invFiltroStatus= 'todos';
let _invFiltroRua   = '';
let _invPagina      = 1;
const INV_PAGE_SIZE = 30;

async function invCarregarSessoes() {
  const wrap = document.getElementById('inv-sec-sessoes');
  if (!wrap) return;
  wrap.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text3)">Carregando...</div>`;
  const sessoes = await apiFetch('/inventario/sessoes');
  if (!sessoes || sessoes.erro) { wrap.innerHTML = `<div style="padding:32px;text-align:center;color:var(--red)">Erro ao carregar inventários.</div>`; return; }
  _invSessoes = sessoes;
  invRenderizarSessoes();
  invCarregarRuasCatalogo();
}

function invRenderizarSessoes() {
  const wrap = document.getElementById('inv-sec-sessoes');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="pg-title" style="margin-bottom:16px">📋 Inventário Físico</div>

    <div class="card" style="padding:16px 18px;margin-bottom:14px">
      <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:1px;margin-bottom:10px">🆕 CRIAR NOVO INVENTÁRIO</div>
      <input id="inv-nome-novo" placeholder="Nome do inventário (ex: Inventário Geral Jul/2026)..."
        style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px;outline:none;box-sizing:border-box;margin-bottom:10px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
        <div style="flex:1;min-width:160px">
          <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.5px;margin-bottom:4px">FILTRAR POR RUA (opcional)</div>
          <select id="inv-rua-criar" style="width:100%;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px;outline:none">
            <option value="">📦 Todos os produtos</option>
          </select>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button onclick="invCriarComCatalogo()"
          style="background:var(--accent);color:#fff;border:none;border-radius:8px;padding:9px 16px;font-size:12px;font-weight:700;cursor:pointer">
          📦 Criar com catálogo
        </button>
        <button onclick="invCriarVazio()"
          style="background:var(--surface2);color:var(--text3);border:1px solid var(--border);border-radius:8px;padding:9px 16px;font-size:12px;font-weight:700;cursor:pointer">
          📄 Criar vazio
        </button>
      </div>
    </div>

    <div id="inv-lista-sessoes">
      ${_invSessoes.length ? _invSessoes.map(s => invSessaoCardHTML(s)).join('') :
        `<div style="padding:48px;text-align:center;color:var(--text3)"><div style="font-size:32px;margin-bottom:8px">📋</div><div>Nenhum inventário criado ainda.</div></div>`}
    </div>`;
}

function invSessaoCardHTML(s) {
  const pct   = s.total_itens > 0 ? Math.round((s.contados / s.total_itens) * 100) : 0;
  const barClr= pct === 100 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#3b82f6';
  const chip  = s.status === 'concluido'
    ? `<span style="background:#14532d;color:#22c55e;border-radius:20px;padding:2px 10px;font-size:10px;font-weight:800">✅ Concluído</span>`
    : `<span style="background:#1c1917;color:#f59e0b;border:1px solid #78350f;border-radius:20px;padding:2px 10px;font-size:10px;font-weight:800">⏳ Em andamento</span>`;
  const dt = s.criado_em ? new Date(s.criado_em).toLocaleDateString('pt-BR') : '—';
  return `
    <div class="card" style="margin-bottom:10px;padding:14px 16px;cursor:pointer" onclick="invAbrirSessao(${s.id})">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px">
        <div>
          <div style="font-size:13px;font-weight:800;color:var(--text)">${s.nome||'Inventário'}</div>
          <div style="font-size:11px;color:var(--text3)">📅 ${dt} · 👤 ${s.criado_por||'—'} · ${s.total_itens} produtos</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          ${chip}
          <a href="/inventario/sessoes/${s.id}/exportar" onclick="event.stopPropagation()" title="Exportar CSV"
            style="color:#22c55e;font-size:15px;text-decoration:none">📊</a>
          <span onclick="event.stopPropagation();invExcluirSessao(${s.id})" title="Excluir"
            style="color:var(--accent);font-size:14px;cursor:pointer">🗑️</span>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:700;color:var(--text3);margin-bottom:4px">
        <span>Contados: ${s.contados}/${s.total_itens}</span><span>${pct}%</span>
      </div>
      <div style="background:var(--surface2);border-radius:4px;height:6px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${barClr};border-radius:4px;transition:width .3s"></div>
      </div>
    </div>`;
}

async function invCriarComCatalogo() {
  const nome     = document.getElementById('inv-nome-novo')?.value?.trim();
  if (!nome) { emToast('Informe um nome para o inventário.', 'aviso'); return; }
  const filtroRua = document.getElementById('inv-rua-criar')?.value || '';

  const totalR = await apiFetch('/entrada-manual/produtos/total');
  const total  = totalR?.total || 0;
  if (!total) { emToast('Catálogo vazio. Importe o barras.xlsx na aba Código de Barras primeiro.', 'erro'); return; }

  const msg = filtroRua
    ? `Criar inventário somente com produtos da rua "${filtroRua}"?`
    : `Criar inventário com ${total.toLocaleString('pt-BR')} produtos do catálogo?`;

  wmsConfirm(msg, async () => {
    const wrap = document.getElementById('inv-lista-sessoes');
    if (wrap) wrap.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text3)">⏳ Criando inventário...</div>`;

    const body = { nome, carregarCatalogo: true };
    if (filtroRua) body.filtroRua = filtroRua;

    const r = await apiFetch('/inventario/sessoes', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    if (r?.erro) { emToast('Erro: '+r.erro, 'erro'); invCarregarSessoes(); return; }
    emToast(`✅ Inventário criado com ${(r.total||0).toLocaleString('pt-BR')} produtos!`, 'sucesso');
    await invCarregarSessoes();
    invAbrirSessao(r.id);
  });
}

async function invCarregarRuasCatalogo() {
  const sel = document.getElementById('inv-rua-criar');
  if (!sel) return;
  const rows = await apiFetch('/entrada-manual/produtos/ruas');
  if (!rows || rows.erro || !rows.length) return;
  sel.innerHTML = '<option value="">📦 Todos os produtos</option>';
  rows.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.rua;
    opt.textContent = `${r.rua}  (${Number(r.total).toLocaleString('pt-BR')} itens)`;
    sel.appendChild(opt);
  });
}

async function invCriarVazio() {
  const nome = document.getElementById('inv-nome-novo')?.value?.trim();
  if (!nome) { emToast('Informe um nome para o inventário.', 'aviso'); return; }
  const r = await apiFetch('/inventario/sessoes', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ nome })
  });
  if (r?.erro) { emToast('Erro: '+r.erro, 'erro'); return; }
  emToast('✅ Inventário criado!', 'sucesso');
  await invCarregarSessoes();
  invAbrirSessao(r.id);
}

async function invAbrirSessao(id) {
  const secSess = document.getElementById('inv-sec-sessoes');
  const secIt   = document.getElementById('inv-sec-itens');
  if (secSess) secSess.style.display = 'none';
  if (secIt)   { secIt.style.display = ''; secIt.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text3)">Carregando inventário...</div>`; }
  const r = await apiFetch(`/inventario/sessoes/${id}`);
  if (!r || r.erro) { emToast('Erro ao carregar inventário.', 'erro'); if (secSess) secSess.style.display = ''; return; }
  _invSessaoAtiva = r;
  _invItens       = r.itens || [];
  _invBusca       = '';
  _invFiltroStatus= 'todos';
  _invFiltroRua   = '';
  _invPagina      = 1;
  invRenderizarSessaoAtiva();
}

function invVoltarSessoes() {
  _invSessaoAtiva = null; _invItens = [];
  document.getElementById('inv-sec-itens')  && (document.getElementById('inv-sec-itens').style.display = 'none');
  document.getElementById('inv-sec-sessoes')&& (document.getElementById('inv-sec-sessoes').style.display = '');
  invCarregarSessoes();
}

function invRenderizarSessaoAtiva() {
  const wrap = document.getElementById('inv-sec-itens');
  if (!wrap || !_invSessaoAtiva) return;
  const s = _invSessaoAtiva;
  const pct    = s.total_itens > 0 ? Math.round(((s.contados||0) / s.total_itens) * 100) : 0;
  const barClr = pct === 100 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#3b82f6';
  const SL = { ok:'✅ OK', divergente:'⚠️ Divergente', pendente:'⬜ Pendente' };
  const SC = { ok:'#22c55e', divergente:'#f59e0b', pendente:'#64748b' };

  const itens = _invItens.filter(i => {
    const mS = _invFiltroStatus === 'todos' || i.status === _invFiltroStatus;
    const mB = !_invBusca || i.codigo.toLowerCase().includes(_invBusca.toLowerCase()) || (i.nome||'').toLowerCase().includes(_invBusca.toLowerCase());
    const mR = !_invFiltroRua || (i.localizacao||'').toLowerCase().startsWith(_invFiltroRua.toLowerCase());
    return mS && mB && mR;
  });
  const total = itens.length;
  const start = (_invPagina - 1) * INV_PAGE_SIZE;
  const page  = itens.slice(start, start + INV_PAGE_SIZE);
  const stats = { ok:0, divergente:0, pendente:0, aMais:0, aMenos:0 };
  _invItens.forEach(i => {
    if (stats[i.status]!==undefined) stats[i.status]++;
    if (i.qtd_contada != null) {
      const dif = parseFloat(i.qtd_contada) - parseFloat(i.saldo_sistema);
      if (dif > 0) stats.aMais++;
      else if (dif < 0) stats.aMenos++;
    }
  });
  const acuracia = s.total_itens > 0 ? Math.round((stats.ok / s.total_itens) * 100) : 0;

  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
      <button onclick="invVoltarSessoes()"
        style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:7px 12px;color:var(--text3);cursor:pointer;font-size:12px;font-weight:700">← Voltar</button>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:900;color:var(--text)">${s.nome||'Inventário'}</div>
        <div style="font-size:11px;color:var(--text3)">👤 ${s.criado_por||'—'} · ${_invItens.length} produtos</div>
      </div>
      <div style="display:flex;gap:6px">
        ${s.status !== 'concluido' ? `<button onclick="invConcluir()"
          style="background:#16a34a;color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:11px;font-weight:700;cursor:pointer">✅ Concluir</button>` : ''}
        <a href="/inventario/sessoes/${s.id}/exportar"
          style="background:#1e3a5f;color:#38bdf8;border:none;border-radius:8px;padding:7px 14px;font-size:11px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-block">📊 CSV</a>
      </div>
    </div>

    <div class="card" style="padding:12px 16px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:700;color:var(--text3);margin-bottom:6px">
        <span>CONTAGEM</span><span>${s.contados||0}/${s.total_itens} (${pct}%)</span>
      </div>
      <div style="background:var(--surface2);border-radius:6px;height:8px;overflow:hidden;margin-bottom:10px">
        <div style="height:100%;width:${pct}%;background:${barClr};border-radius:6px;transition:width .4s"></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">
        ${[['⬜','PENDENTES',stats.pendente,'#64748b'],['✅','OK',stats.ok,'#22c55e'],['⬆️','A MAIS',stats.aMais,'#f97316'],['⬇️','A MENOS',stats.aMenos,'#ef4444'],[`${acuracia}%`,'ACURÁCIA','','#38bdf8']].map(([ic,lb,n,c])=>`
        <div style="background:var(--surface2);border-radius:8px;padding:8px;text-align:center;border:1px solid var(--border)">
          <div style="font-size:${lb==='ACURÁCIA'?'16px':'18px'};font-weight:900;color:${c}">${lb==='ACURÁCIA'?ic:n}</div>
          <div style="font-size:8px;color:var(--text3);font-weight:700;letter-spacing:.5px">${lb==='ACURÁCIA'?'':''+ic+' '}${lb}</div>
        </div>`).join('')}
      </div>
    </div>

    <div class="card" style="padding:10px 14px;margin-bottom:10px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
        <input id="inv-busca-input" placeholder="🔍 Código ou nome..." value="${_invBusca}"
          oninput="_invBusca=this.value;_invPagina=1;invRenderizarSessaoAtiva()"
          style="flex:1;min-width:160px;padding:7px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px;outline:none">
        <select id="inv-rua-select"
          onchange="_invFiltroRua=this.value;_invPagina=1;invRenderizarSessaoAtiva()"
          style="padding:7px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px;outline:none;min-width:120px">
          <option value="">📍 Todas as ruas</option>
          ${[...new Set(_invItens.map(i=>{const m=(i.localizacao||'').split('/')[0].match(/^([A-Za-z]+)/);return m?m[1].toUpperCase():'';}).filter(Boolean))].sort().map(r=>`<option value="${r}" ${_invFiltroRua===r?'selected':''}>${r}</option>`).join('')}
        </select>
        ${s.status !== 'concluido' ? `<button onclick="invAbrirColetor()"
          style="padding:7px 12px;border-radius:8px;border:none;background:#7c3aed;color:#fff;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap">📷 Coletor</button>` : ''}
        <button onclick="invSincronizarEnderecos()"
          title="Atualiza endereços a partir do catálogo importado"
          style="padding:7px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text3);font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap">🔄 Sync</button>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${['todos','pendente','ok','divergente'].map(st=>`
        <button onclick="_invFiltroStatus='${st}';_invPagina=1;invRenderizarSessaoAtiva();this.closest('.card').querySelectorAll('[data-sf]').forEach(b=>{b.style.background='var(--surface2)';b.style.color='var(--text3)'});this.style.background='var(--accent)';this.style.color='#fff'" data-sf="1"
          style="padding:6px 12px;border-radius:20px;border:1px solid var(--border);background:${st==='todos'?'var(--accent)':'var(--surface2)'};color:${st==='todos'?'#fff':'var(--text3)'};font-size:10px;font-weight:700;cursor:pointer;white-space:nowrap">
          ${st==='todos'?'Todos':SL[st]||st}
        </button>`).join('')}
      </div>
    </div>

    <div class="tabela-wrap">
      <table>
        <thead><tr>
          <th>CÓDIGO</th><th>NOME</th><th>LOCALIZAÇÃO</th>
          <th style="text-align:center">SALDO SIS.</th>
          <th style="text-align:center">CONTADO</th>
          <th style="text-align:center">DIF.</th>
          <th style="text-align:center">STATUS</th>
          <th style="text-align:center">SALVAR</th>
        </tr></thead>
        <tbody>
          ${page.length ? page.map(it => invRowHTML(it, SL, SC)).join('') :
            `<tr><td colspan="8" style="padding:32px;text-align:center;color:var(--text3)">Nenhum item encontrado.</td></tr>`}
        </tbody>
      </table>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:11px;color:var(--text3);padding:0 2px">
      <span>${Math.min(start+1,total)}–${Math.min(start+page.length,total)} de ${total}</span>
      <div style="display:flex;gap:4px">
        <button onclick="_invPagina=Math.max(1,_invPagina-1);invRenderizarSessaoAtiva()" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text3);cursor:pointer;font-size:11px">←</button>
        <button onclick="_invPagina++;invRenderizarSessaoAtiva()" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text3);cursor:pointer;font-size:11px">→</button>
      </div>
    </div>`;
}

function invRowHTML(it, SL, SC) {
  const concluido = _invSessaoAtiva?.status === 'concluido';
  const clr = SC[it.status] || '#64748b';
  const dif = it.qtd_contada != null ? (parseFloat(it.qtd_contada) - parseFloat(it.saldo_sistema)) : null;
  const difStr = dif === null ? '—' : (dif > 0 ? `+${dif}` : String(Math.round(dif*100)/100));
  const difClr = dif === null ? 'var(--text3)' : dif === 0 ? '#22c55e' : dif > 0 ? '#f97316' : '#ef4444';
  return `
  <tr id="inv-tr-${it.id}" style="border-bottom:1px solid var(--border)">
    <td style="padding:8px 10px;font-family:monospace;font-size:11px;font-weight:800;color:#f97316">${it.codigo}</td>
    <td style="padding:8px 10px;font-size:11px;color:var(--text);max-width:280px">${it.nome||'—'}</td>
    <td style="padding:8px 10px;font-family:monospace;font-size:11px;color:var(--text3)">${it.localizacao||'—'}</td>
    <td style="padding:8px 10px;text-align:center;font-weight:700">${it.saldo_sistema}</td>
    <td style="padding:8px 10px;text-align:center">
      ${concluido
        ? `<span style="font-size:13px;font-weight:700;color:var(--text)">${it.qtd_contada??'—'}</span>`
        : `<input id="inv-qty-${it.id}" type="number" value="${it.qtd_contada??''}" min="0" placeholder="—"
            onkeydown="if(event.key==='Enter'){invSalvarContagem(${it.id})}"
            style="width:70px;text-align:center;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:4px;color:var(--text);font-size:13px;font-weight:700;outline:none">`}
    </td>
    <td style="padding:8px 10px;text-align:center;font-weight:800;color:${difClr}">${difStr}</td>
    <td style="padding:8px 10px;text-align:center">
      <span style="background:${clr}22;color:${clr};border-radius:20px;padding:3px 8px;font-size:10px;font-weight:800;white-space:nowrap">${SL[it.status]||it.status}</span>
    </td>
    <td style="padding:8px 10px;text-align:center">
      ${concluido ? '—' : `<button onclick="invSalvarContagem(${it.id})"
        style="background:#1e3a5f;color:#38bdf8;border:none;border-radius:6px;padding:5px 10px;font-size:10px;font-weight:700;cursor:pointer">💾 Salvar</button>`}
    </td>
  </tr>`;
}

async function invSalvarContagem(id) {
  if (_invSessaoAtiva?.status === 'concluido') { emToast('Inventário concluído — edição bloqueada.', 'aviso'); return; }
  const inp = document.getElementById(`inv-qty-${id}`);
  const qtd = inp ? parseFloat(inp.value) : NaN;
  const r = await apiFetch(`/inventario/itens/${id}`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ qtd_contada: isNaN(qtd) ? null : qtd })
  });
  if (r?.erro) { emToast('Erro: '+r.erro, 'erro'); return; }
  const it = _invItens.find(i => i.id === id);
  if (it) { it.qtd_contada = isNaN(qtd) ? null : qtd; it.status = r.status; }
  if (_invSessaoAtiva && r.contados !== undefined) _invSessaoAtiva.contados = r.contados;
  emToast(`✅ ${it?.codigo||'Item'} contado!`, 'sucesso');
  invRenderizarSessaoAtiva();
}

async function invConcluir() {
  if (!_invSessaoAtiva) return;
  wmsConfirm('Concluir o inventário? Ele ficará somente leitura.', async () => {
    const r = await apiFetch(`/inventario/sessoes/${_invSessaoAtiva.id}/concluir`, { method:'PUT' });
    if (r?.erro) { emToast('Erro: '+r.erro, 'erro'); return; }
    _invSessaoAtiva.status = 'concluido';
    emToast('✅ Inventário concluído!', 'sucesso');
    invRenderizarSessaoAtiva();
  });
}

async function invSincronizarEnderecos() {
  if (!_invSessaoAtiva) return;
  const btn = document.querySelector('[onclick="invSincronizarEnderecos()"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Sincronizando...'; }
  const r = await apiFetch(`/inventario/sessoes/${_invSessaoAtiva.id}/sync-enderecos`, { method:'PUT' });
  if (r?.erro) { emToast('Erro: '+r.erro, 'erro'); if (btn) { btn.disabled = false; btn.innerHTML = '🔄 Sync Endereços'; } return; }
  emToast(`✅ ${r.atualizados} endereços atualizados do catálogo!`, 'sucesso');
  await invAbrirSessao(_invSessaoAtiva.id);
}

async function invExcluirSessao(id) {
  wmsConfirm('Excluir este inventário permanentemente?', async () => {
    const r = await apiFetch(`/inventario/sessoes/${id}`, { method:'DELETE' });
    if (r?.erro) { emToast('Erro: '+r.erro, 'erro'); return; }
    emToast('Inventário excluído.', 'sucesso');
    invCarregarSessoes();
  });
}

// ── Coletor de Dados ─────────────────────────────────────────────────────
let _coletorIdx = -1;

function invAbrirColetor() {
  if (!_invSessaoAtiva) return;
  const pendentes = _invItens.filter(i => i.status === 'pendente');
  const modal = document.createElement('div');
  modal.id = 'inv-coletor-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:24px 16px;overflow-y:auto';
  modal.innerHTML = `
    <div style="width:100%;max-width:480px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <div style="font-size:16px;font-weight:900;color:#fff">📷 Coletor de Dados</div>
        <button onclick="invColetorCancelar()" style="background:#334155;border:none;border-radius:8px;padding:7px 14px;color:#fff;font-size:12px;font-weight:700;cursor:pointer">✕ Fechar</button>
      </div>
      <div style="background:#1e293b;border-radius:12px;padding:16px;margin-bottom:14px">
        <div style="font-size:10px;color:#94a3b8;font-weight:700;letter-spacing:.5px;margin-bottom:6px">BIPAGEM / CÓDIGO</div>
        <input id="coletor-scan-input" type="text" placeholder="Bipe o código de barras ou digite o código..." autofocus
          style="width:100%;padding:12px 14px;background:#0f172a;border:2px solid #7c3aed;border-radius:8px;color:#fff;font-size:15px;outline:none;box-sizing:border-box"
          onkeydown="if(event.key==='Enter'){invColetorBuscar()}">
        <button onclick="invColetorBuscar()" style="width:100%;margin-top:8px;padding:10px;background:#7c3aed;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:700;cursor:pointer">🔍 Buscar</button>
      </div>
      <div id="coletor-item-card" style="display:none;background:#1e293b;border-radius:12px;padding:16px;margin-bottom:14px">
        <div id="coletor-item-info" style="margin-bottom:12px"></div>
        <div style="font-size:10px;color:#94a3b8;font-weight:700;letter-spacing:.5px;margin-bottom:6px">QUANTIDADE CONTADA</div>
        <input id="coletor-qty-input" type="number" min="0" placeholder="0"
          style="width:100%;padding:12px 14px;background:#0f172a;border:2px solid #22c55e;border-radius:8px;color:#fff;font-size:20px;font-weight:900;text-align:center;outline:none;box-sizing:border-box"
          onkeydown="if(event.key==='Enter'){invColetorSalvar()}">
        <button onclick="invColetorSalvar()" style="width:100%;margin-top:8px;padding:10px;background:#16a34a;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:700;cursor:pointer">💾 Salvar e Próximo (Enter)</button>
      </div>
      <div id="coletor-msg" style="text-align:center;padding:10px;font-size:13px;color:#94a3b8">
        ${pendentes.length} itens pendentes. Bipe para iniciar.
      </div>
    </div>`;
  document.body.appendChild(modal);
  setTimeout(() => document.getElementById('coletor-scan-input')?.focus(), 100);
}

function invColetorBuscar() {
  const inp = document.getElementById('coletor-scan-input');
  const q = (inp?.value || '').trim().toUpperCase();
  if (!q) return;
  const it = _invItens.find(i => i.codigo.toUpperCase() === q || (i.codigo_barras||'').toUpperCase() === q);
  const msg = document.getElementById('coletor-msg');
  const card = document.getElementById('coletor-item-card');
  if (!it) {
    if (msg) { msg.style.color = '#ef4444'; msg.textContent = `❌ Código "${q}" não encontrado no inventário.`; }
    if (card) card.style.display = 'none';
    return;
  }
  _coletorIdx = it.id;
  if (card) card.style.display = '';
  const info = document.getElementById('coletor-item-info');
  if (info) info.innerHTML = `
    <div style="font-size:13px;font-weight:900;color:#f97316">${it.codigo}</div>
    <div style="font-size:12px;color:#e2e8f0;margin:4px 0">${it.nome||'—'}</div>
    <div style="font-size:11px;color:#94a3b8">📍 ${it.localizacao||'—'} &nbsp;·&nbsp; Saldo: <strong style="color:#38bdf8">${it.saldo_sistema}</strong></div>
    <div style="font-size:11px;color:${it.status==='ok'?'#22c55e':it.status==='divergente'?'#f59e0b':'#64748b'}">${it.status}</div>`;
  const qty = document.getElementById('coletor-qty-input');
  if (qty) { qty.value = it.qtd_contada ?? ''; qty.focus(); qty.select(); }
  if (msg) { msg.style.color = '#22c55e'; msg.textContent = `Encontrado: ${it.codigo}`; }
  if (inp) inp.value = '';
}

async function invColetorSalvar() {
  if (_coletorIdx < 0) return;
  const qty = parseFloat(document.getElementById('coletor-qty-input')?.value);
  const r = await apiFetch(`/inventario/itens/${_coletorIdx}`, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ qtd_contada: isNaN(qty) ? null : qty })
  });
  if (r?.erro) { emToast('Erro: '+r.erro, 'erro'); return; }
  const it = _invItens.find(i => i.id === _coletorIdx);
  if (it) { it.qtd_contada = isNaN(qty) ? null : qty; it.status = r.status; }
  if (_invSessaoAtiva && r.contados !== undefined) _invSessaoAtiva.contados = r.contados;
  const msg = document.getElementById('coletor-msg');
  if (msg) { msg.style.color='#22c55e'; msg.textContent = `✅ ${it?.codigo||''} salvo! Bipe o próximo.`; }
  const card = document.getElementById('coletor-item-card');
  if (card) card.style.display = 'none';
  _coletorIdx = -1;
  document.getElementById('coletor-scan-input')?.focus();
}

function invColetorCancelar() {
  document.getElementById('inv-coletor-modal')?.remove();
  invRenderizarSessaoAtiva();
}

// ── irPara integração ─────────────────────────────────────────────────────
const _emOrigIrPara = typeof irPara === 'function' ? irPara : null;
// Registra o init da página (chamado pelo irPara do auth.js)
window._pagInits = window._pagInits || {};
window._pagInits['entrada-manual'] = renderizarPagEntradaManual;
