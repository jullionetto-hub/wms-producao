const API = window.location.origin;
let usuarioAtual     = null;
let separadorAtual   = null;
let pedidoAtualId    = null;
let pedidoAtualNum   = null;
let itensAtuais      = [];
let todosSeparadores = [];
let pedidosImportar  = [];
let caixaJaVinculada = false;
let historicoImportacoes = JSON.parse(localStorage.getItem('historico_importacoes') || '[]');
let isMobile = () => window.innerWidth <= 768;
let _turnoFiltro = '';

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
function modoRepositorAtual() {
  return usuarioAtual?.subtipo_repositor || 'geral';
}
function toggleSubtipoRepositor() {
  const perf = document.getElementById('usr-perfil');
  const wrap = document.getElementById('usr-subtipo-wrap');
  if (!perf || !wrap) return;
  wrap.style.display = perf.value === 'repositor' ? 'block' : 'none';
}

function atualizarRelogio() {
  const agora = new Date();
  const str   = agora.toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo' });
  const el    = document.getElementById('data-hora');
  if (el) el.textContent = str;
}
setInterval(atualizarRelogio, 1000);
atualizarRelogio();

function toast(msg, tipo='info') {
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.textContent = msg;
  const root = document.getElementById('toast-root');
  if (root) root.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function fmtData(iso){if(!iso)return'';const[y,m,d]=iso.split('-');return d+'/'+m+'/'+y;}

async function apiFetch(path, opts={}) {
  try {
    const res = await fetch(`${API}${path}`, { credentials:'include', ...opts });
    if (!res.ok) { const e = await res.json().catch(()=>({erro:'Erro'})); toast(e.erro||'Erro na requisição','erro'); return null; }
    return await res.json();
  } catch(e) { toast('Erro ao conectar com o servidor','erro'); return null; }
}

function formatarData(iso) {
  if (!iso) return '-';
  const p = iso.split('-');
  if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
  return iso;
}

// ── Modal confirmação genérico ────────────────────────────────────────────────
let _wmsConfirmCb = null;
let _wmsConfirmCancelCb = null;
function wmsConfirm(msg, onYes, onNo) {
  _wmsConfirmCb = onYes;
  _wmsConfirmCancelCb = onNo || null;
  const el = document.getElementById('modal-confirm-msg');
  if (el) el.textContent = msg;
  document.getElementById('modal-confirm').style.display = 'flex';
}
function _confirmarWms() {
  document.getElementById('modal-confirm').style.display = 'none';
  if (_wmsConfirmCb) { const cb = _wmsConfirmCb; _wmsConfirmCb = null; _wmsConfirmCancelCb = null; cb(); }
}
function _cancelarWms() {
  document.getElementById('modal-confirm').style.display = 'none';
  _wmsConfirmCb = null;
  if (_wmsConfirmCancelCb) { const cb = _wmsConfirmCancelCb; _wmsConfirmCancelCb = null; cb(); }
}

// ── Protocolo ─────────────────────────────────────────────────────────────────
let _protocoloRows = [];
async function carregarProtocolo() {
  const ini = document.getElementById('proto-filtro-ini')?.value || '';
  const fim = document.getElementById('proto-filtro-fim')?.value || '';
  const p = new URLSearchParams();
  if (ini) p.set('data_ini', ini);
  if (fim) p.set('data_fim', fim);
  const q = p.toString() ? '?' + p.toString() : '';
  const rows = await apiFetch(`/protocolo${q}`);
  _protocoloRows = rows || [];
  const el = document.getElementById('proto-lista');
  const badge = document.getElementById('menu-badge-proto');

  // ── Agrupa por pedido ──────────────────────────────────────────────────────
  const pedMap = {};
  (_protocoloRows).forEach(r => {
    const key = r.pedido_id || r.numero_pedido;
    if (!pedMap[key]) pedMap[key] = { pedido_id: r.pedido_id, numero_pedido: r.numero_pedido || r.pedido_id, cliente: r.cliente || '—', transportadora: r.transportadora || '—', itens: [] };
    pedMap[key].itens.push(r);
  });
  const pedList = Object.values(pedMap);

  if (badge) { badge.style.display = pedList.length ? '' : 'none'; badge.textContent = pedList.length; }
  if (!el) return;

  if (!pedList.length) {
    el.innerHTML = '<div style="text-align:center;color:var(--text3);padding:48px;font-size:14px">Nenhum pedido aguardando protocolo</div>';
  } else {
    el.innerHTML = pedList.map(ped => `
      <div style="background:var(--surface);border-radius:16px;overflow:hidden;margin-bottom:16px;border:1.5px solid #e2e8f0;box-shadow:0 2px 12px rgba(0,0,0,.07)">
        <!-- Cabeçalho -->
        <div style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:14px 18px;display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:22px">📋</span>
            <div>
              <div style="color:#fff;font-weight:800;font-size:16px;font-family:'Space Mono',monospace">#${ped.numero_pedido}</div>
              <div style="color:rgba(255,255,255,.75);font-size:12px">${ped.cliente}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end">
            <span style="background:rgba(255,255,255,.22);color:#fff;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700">${ped.transportadora}</span>
            <span style="background:rgba(255,255,255,.3);color:#fff;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:800">${ped.itens.length} ${ped.itens.length===1?'item':'itens'} em falta</span>
          </div>
        </div>
        <!-- Tabela de itens -->
        <div style="padding:14px 16px">
          <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px">
            <thead>
              <tr style="background:#f8fafc">
                <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e2e8f0">Código</th>
                <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e2e8f0">Descrição</th>
                <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e2e8f0">Qtde</th>
                <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e2e8f0">Endereço</th>
                <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #e2e8f0">Separador</th>
              </tr>
            </thead>
            <tbody>
              ${ped.itens.map(r => `
                <tr style="border-bottom:1px solid #f1f5f9">
                  <td style="padding:8px 10px;font-family:'Space Mono',monospace;font-weight:700;color:#dc2626;font-size:12px">${r.codigo||'—'}</td>
                  <td style="padding:8px 10px;font-weight:600;color:var(--text)">${r.descricao||'—'}</td>
                  <td style="padding:8px 10px;text-align:center;font-weight:900;font-size:15px;color:#92400e">${r.quantidade||0}</td>
                  <td style="padding:8px 10px;font-family:'Space Mono',monospace;color:var(--text2);font-size:11px">${r.endereco||'—'}</td>
                  <td style="padding:8px 10px;color:var(--text2);font-size:12px">${r.separador_nome||'—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ${usuarioAtual?.perfil==='supervisor' ? `
          <div id="proto-pedido-wrap-${ped.pedido_id}">
            <button onclick="encerrarProtocoloPedido(${ped.pedido_id}, ${ped.itens.length}, this)"
              style="width:100%;padding:14px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;letter-spacing:.3px">
              📋 Encerrar Protocolo deste Pedido (${ped.itens.length} ${ped.itens.length===1?'item':'itens'})
            </button>
          </div>` : ''}
        </div>
      </div>
    `).join('');
  }

  // ── Histórico (status=protocolado) agrupado por pedido ─────────────────────
  const elHist  = document.getElementById('proto-historico');
  const histBdg = document.getElementById('proto-hist-badge');
  const rowsH   = await apiFetch(`/protocolo/historico${q}`) || [];

  const pedMapH = {};
  rowsH.forEach(r => {
    const key = r.pedido_id || r.numero_pedido;
    if (!pedMapH[key]) pedMapH[key] = { pedido_id: r.pedido_id, numero_pedido: r.numero_pedido || r.pedido_id, cliente: r.cliente || '—', transportadora: r.transportadora || '—', itens: [] };
    pedMapH[key].itens.push(r);
  });
  const pedListH = Object.values(pedMapH);
  if (histBdg) histBdg.textContent = pedListH.length;

  if (elHist) {
    elHist.innerHTML = pedListH.length ? pedListH.map(ped => `
      <div style="background:var(--surface);border-radius:14px;overflow:hidden;margin-bottom:12px;border:1.5px solid #d1fae5;box-shadow:0 1px 6px rgba(0,0,0,.04)">
        <div style="background:linear-gradient(135deg,#059669,#047857);padding:11px 16px;display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:16px">✅</span>
            <div>
              <div style="color:#fff;font-weight:800;font-size:14px;font-family:'Space Mono',monospace">#${ped.numero_pedido}</div>
              <div style="color:rgba(255,255,255,.7);font-size:11px">${ped.cliente}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="background:rgba(255,255,255,.22);color:#fff;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:800;letter-spacing:.5px">PROTOCOLADO</span>
            <span style="background:rgba(255,255,255,.22);color:#fff;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:800">${ped.itens.length} ${ped.itens.length===1?'item':'itens'}</span>
          </div>
        </div>
        <div style="padding:12px 16px">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="background:#f8fafc">
                <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e2e8f0">Código</th>
                <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e2e8f0">Descrição</th>
                <th style="padding:6px 8px;text-align:center;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e2e8f0">Qtde</th>
                <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e2e8f0">Endereço</th>
                <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e2e8f0">Enviado por</th>
              </tr>
            </thead>
            <tbody>
              ${ped.itens.map(r => `
                <tr style="border-bottom:1px solid #f1f5f9">
                  <td style="padding:6px 8px;font-family:'Space Mono',monospace;font-weight:700;color:#dc2626">${r.codigo||'—'}</td>
                  <td style="padding:6px 8px;font-weight:600;color:var(--text)">${r.descricao||'—'}</td>
                  <td style="padding:6px 8px;text-align:center;font-weight:700;color:#92400e">${r.quantidade||0}</td>
                  <td style="padding:6px 8px;font-family:'Space Mono',monospace;color:var(--text2);font-size:11px">${r.endereco||'—'}</td>
                  <td style="padding:6px 8px;color:#059669;font-weight:700">${r.quem_guardou||'—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `).join('')
    : '<div style="text-align:center;color:var(--text3);padding:32px;font-size:13px">Nenhum pedido protocolado no período</div>';
  }
}

async function encerrarProtocoloPedido(pedido_id, qtdItens, btn) {
  if (btn?.disabled) return;
  wmsConfirm(`Encerrar o protocolo deste pedido?\n${qtdItens} item(ns) serão marcados como protocolados oficialmente.`, async () => {
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Encerrando...'; }
    try {
      const r = await apiFetch(`/protocolo/pedido/${pedido_id}/encerrar`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({})
      });
      if (r?.mensagem) {
        toast(r.mensagem, 'sucesso');
        carregarProtocolo();
      } else {
        if (btn) { btn.disabled = false; btn.innerHTML = `📋 Encerrar Protocolo deste Pedido`; }
        toast(r?.erro || 'Erro ao encerrar protocolo', 'erro');
      }
    } catch(e) {
      if (btn) { btn.disabled = false; btn.innerHTML = `📋 Encerrar Protocolo deste Pedido`; }
      toast('Erro ao encerrar protocolo', 'erro');
    }
  });
}

function exportarProtocolo() {
  if (!_protocoloRows.length) { toast('Nenhum item para exportar','aviso'); return; }
  const header = ['Código','Descrição','Pedido','Cliente','Separador','Data','Hora','Endereço','Qtd'];
  const csvRows = [header, ..._protocoloRows.map(r => [
    r.codigo||'', r.descricao||'', r.numero_pedido||r.pedido_id||'', r.cliente||'',
    r.separador_nome||'', fmtData(r.data_aviso), r.hora_aviso||'', r.endereco||'', r.quantidade||0
  ])];
  const csv = csvRows.map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n');
  const blob = new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `protocolo_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ══ ESTATÍSTICAS — MINHAS ESTATÍSTICAS (SEP / CK / EMB) ══════════════════════

function _fmtTempo(minutos) {
  if (!minutos || minutos < 0) return '—';
  const m = Math.round(minutos);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), rm = m % 60;
  return `${h}h ${rm.toString().padStart(2,'0')}min`;
}

async function _carregarEstatisticasPage(page) {
  const ini   = document.getElementById(`stats-${page}-ini`)?.value || '';
  const fim   = document.getElementById(`stats-${page}-fim`)?.value || '';
  const cards = document.getElementById(`stats-${page}-cards`);
  const lista = document.getElementById(`stats-${page}-lista`);
  if (!cards && !lista) return;
  if (lista) lista.innerHTML = '<div style="text-align:center;padding:48px;color:var(--text3);font-size:14px">⏳ Carregando...</div>';
  try {
    const params = new URLSearchParams();

    let url, iniField, fimField, skuField, itemField, dataField;

    if (page === 'sep') {
      // ── Separação: pedidos separados por este usuário ──────────────────────
      if (ini) params.set('data_ini', ini);
      if (fim) params.set('data_fim', fim);
      if (typeof separadorAtual !== 'undefined' && separadorAtual?.id)
        params.set('separador_id', separadorAtual.id);
      url = `${API}/pedidos?${params}`;
      iniField = 'iniciado_em'; fimField = 'concluido_em';
      skuField = 'itens'; itemField = 'total_itens'; dataField = 'data_pedido';

    } else if (page === 'ck') {
      // ── Checkout: pedidos confirmados por este operador ────────────────────
      if (ini) params.set('data_ini', ini);
      if (fim) params.set('data_fim', fim);
      params.set('status', 'concluido');
      if (typeof usuarioAtual !== 'undefined' && usuarioAtual?.nome)
        params.set('operador_nome', usuarioAtual.nome);
      url = `${API}/checkout?${params}`;
      iniField = '_ck_ini'; fimField = '_ck_fim';
      skuField = 'ped_itens'; itemField = 'ped_total_itens'; dataField = 'data_checkout';

    } else {
      // ── Embalagem: pedidos embalados por este colaborador ──────────────────
      if (ini) params.set('ini', ini);
      if (fim) params.set('fim', fim);
      params.set('status', 'embalado');
      if (typeof usuarioAtual !== 'undefined' && usuarioAtual?.nome)
        params.set('embalado_por', usuarioAtual.nome);
      url = `${API}/embalagem?${params}`;
      iniField = '_emb_ini'; fimField = '_emb_fim';
      skuField = 'itens'; itemField = 'total_itens'; dataField = 'data_pedido';
    }

    const res  = await fetch(url, { credentials: 'include' });
    const data = res.ok ? await res.json() : [];
    const pedidos = Array.isArray(data) ? data : (data.dados || []);

    // ── Normalizar campos de tempo por tipo de página ──────────────────────
    pedidos.forEach(p => {
      if (page === 'ck') {
        // hora_criacao + hora_checkout são "HH:MM" no mesmo dia data_checkout
        const base = p.data_checkout || '';
        p._ck_ini = base && p.hora_criacao  ? `${base}T${p.hora_criacao}:00`  : null;
        p._ck_fim = base && p.hora_checkout ? `${base}T${p.hora_checkout}:00` : null;
      } else if (page === 'emb') {
        // embalagem_iniciado_em + embalado_em são "HH:MM" com data_pedido como base
        const base = p.data_pedido || '';
        p._emb_ini = base && p.embalagem_iniciado_em ? `${base}T${p.embalagem_iniciado_em}:00` : null;
        p._emb_fim = base && p.embalado_em           ? `${base}T${p.embalado_em}:00`           : null;
      }
    });

    // ── Calcular resumo usando campos dinâmicos ──────────────────────────────
    const tempos = pedidos
      .filter(p => p[iniField] && p[fimField])
      .map(p => (new Date(p[fimField]) - new Date(p[iniField])) / 60000)
      .filter(t => t > 0 && t < 1440); // ignora negativos e > 24h (dados ruins)
    const tempoMed   = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : 0;
    const totalSkus  = pedidos.reduce((s, p) => s + (parseInt(p[skuField])  || 0), 0);
    const totalItens = pedidos.reduce((s, p) => s + (parseInt(p[itemField]) || 0), 0);

    // ── Cards de resumo ──────────────────────────────────────────────────────
    if (cards) cards.innerHTML = `
      <div class="cnt-card azul">
        <div class="cnt-lbl">PEDIDOS</div>
        <div class="cnt-val">${pedidos.length}</div>
        <div class="cnt-sub">no período</div>
      </div>
      <div class="cnt-card verde">
        <div class="cnt-lbl">SKUs</div>
        <div class="cnt-val">${totalSkus}</div>
        <div class="cnt-sub">tipos de produto</div>
      </div>
      <div class="cnt-card amarelo">
        <div class="cnt-lbl">ITENS</div>
        <div class="cnt-val">${totalItens}</div>
        <div class="cnt-sub">quantidade total</div>
      </div>
      <div class="cnt-card roxo">
        <div class="cnt-lbl">TEMPO MÉDIO</div>
        <div class="cnt-val" style="font-size:22px;line-height:1.2">${_fmtTempo(tempoMed)}</div>
        <div class="cnt-sub">por pedido</div>
      </div>
    `;

    if (!pedidos.length) {
      if (lista) lista.innerHTML = '<div style="text-align:center;color:var(--text3);padding:48px;font-size:14px">📭 Nenhum pedido encontrado no período</div>';
      return;
    }

    // ── Tabela detalhada ─────────────────────────────────────────────────────
    const linhas = pedidos.map(p => {
      const dtIni  = p[iniField]  ? new Date(p[iniField])  : null;
      const dtFim  = p[fimField]  ? new Date(p[fimField])  : null;
      const diff   = (dtIni && dtFim) ? (dtFim - dtIni) / 60000 : null;
      const tempo  = (diff && diff > 0 && diff < 1440) ? _fmtTempo(diff) : '—';
      const hIni   = dtIni ? dtIni.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
      const hFim   = dtFim ? dtFim.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
      const dtStr  = p[dataField] || (dtIni ? dtIni.toLocaleDateString('pt-BR') : '—');
      const envio  = p.forma_envio || p.transportadora || '—';
      const skus   = parseInt(p[skuField])  || 0;
      const itens  = parseInt(p[itemField]) || 0;
      return `<tr>
        <td style="white-space:nowrap">${dtStr}</td>
        <td style="font-weight:700;font-family:'Space Mono',monospace;white-space:nowrap">${p.numero_pedido || '—'}</td>
        <td>${p.cliente || '—'}</td>
        <td><span style="background:var(--surface2);padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap">${envio}</span></td>
        <td style="text-align:center;font-weight:600">${skus}</td>
        <td style="text-align:center;font-weight:600">${itens}</td>
        <td style="text-align:center;font-family:'Space Mono',monospace;font-size:12px">${hIni}</td>
        <td style="text-align:center;font-family:'Space Mono',monospace;font-size:12px">${hFim}</td>
        <td style="text-align:center;font-weight:700;color:var(--accent);white-space:nowrap">${tempo}</td>
      </tr>`;
    }).join('');

    if (lista) lista.innerHTML = `
      <div class="card">
        <div class="card-hd">
          📋 DETALHAMENTO DE PEDIDOS
          <span style="font-size:12px;font-weight:600;color:var(--text3)">${pedidos.length} registro${pedidos.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th>DATA</th>
                <th>PEDIDO</th>
                <th>CLIENTE</th>
                <th>ENVIO</th>
                <th style="text-align:center">SKUs</th>
                <th style="text-align:center">ITENS</th>
                <th style="text-align:center">INÍCIO</th>
                <th style="text-align:center">FIM</th>
                <th style="text-align:center">TEMPO</th>
              </tr>
            </thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    console.error('Erro estatísticas:', e);
    if (lista) lista.innerHTML = '<div style="text-align:center;color:var(--red);padding:32px;font-size:13px">⚠️ Erro ao carregar estatísticas</div>';
  }
}

// ── Separador ────────────────────────────────────────────────────────────────
async function carregarEstatisticasSep() {
  const ini = document.getElementById('stats-sep-ini');
  const fim = document.getElementById('stats-sep-fim');
  if (ini && !ini.value) ini.value = hojeLocal();
  if (fim && !fim.value) fim.value = hojeLocal();
  await _carregarEstatisticasPage('sep');
}

// ── Checkout ─────────────────────────────────────────────────────────────────
async function carregarEstatisticasCk() {
  const ini = document.getElementById('stats-ck-ini');
  const fim = document.getElementById('stats-ck-fim');
  if (ini && !ini.value) ini.value = hojeLocal();
  if (fim && !fim.value) fim.value = hojeLocal();
  await _carregarEstatisticasPage('ck');
}

// ── Embalagem ────────────────────────────────────────────────────────────────
async function carregarEstatisticasEmb() {
  const ini = document.getElementById('stats-emb-ini');
  const fim = document.getElementById('stats-emb-fim');
  if (ini && !ini.value) ini.value = hojeLocal();
  if (fim && !fim.value) fim.value = hojeLocal();
  await _carregarEstatisticasPage('emb');
}

// ── Seletor multi-permissão (dropdown com checkboxes) ────────────────────────
function togglePermSel(box, e) {
  if (e) e.stopPropagation();
  const wrap = box.closest('.perm-sel-wrap');
  const drop = wrap.querySelector('.perm-sel-drop');
  const isOpen = drop.classList.contains('visivel');
  _fecharPermSels();
  if (!isOpen) { drop.classList.add('visivel'); box.classList.add('aberto'); }
}
function _fecharPermSels() {
  document.querySelectorAll('.perm-sel-drop.visivel').forEach(d => {
    d.classList.remove('visivel');
    const b = d.closest('.perm-sel-wrap')?.querySelector('.perm-sel-box');
    if (b) b.classList.remove('aberto');
  });
}
function togglePermOpt(el, e) {
  if (e) e.stopPropagation();
  const cb = el.querySelector('input[type=checkbox]');
  cb.checked = !cb.checked;
  el.classList.toggle('selecionado', cb.checked);
  _atualizarPermSelValor(el.closest('.perm-sel-wrap'));
}
function _atualizarPermSelValor(wrap) {
  if (!wrap) return;
  const nomes = Array.from(wrap.querySelectorAll('.perm-sel-opt.selecionado .perm-sel-nm')).map(s => s.textContent);
  const val = wrap.querySelector('.perm-sel-valor');
  if (val) { val.textContent = nomes.length ? nomes.join(', ') : 'Selecione os acessos'; val.style.color = nomes.length ? 'var(--text)' : ''; }
}
document.addEventListener('click', function(e) {
  if (!e.target.closest('.perm-sel-wrap')) _fecharPermSels();
});

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('input-pedido')?.addEventListener('keypress', e => { if(e.key==='Enter') confirmarPedido(); });
  document.getElementById('m-input-pedido')?.addEventListener('keypress', e => { if(e.key==='Enter') confirmarPedidoMobile(); });
  document.getElementById('m-ck-input-caixa')?.addEventListener('keypress', e => { if(e.key==='Enter') buscarCaixaMobile(); });
});
