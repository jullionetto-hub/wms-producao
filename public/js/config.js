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
function wmsConfirm(msg, onYes) {
  _wmsConfirmCb = onYes;
  const el = document.getElementById('modal-confirm-msg');
  if (el) el.textContent = msg;
  document.getElementById('modal-confirm').style.display = 'flex';
}
function _confirmarWms() {
  document.getElementById('modal-confirm').style.display = 'none';
  if (_wmsConfirmCb) { const cb = _wmsConfirmCb; _wmsConfirmCb = null; cb(); }
}
function _cancelarWms() {
  document.getElementById('modal-confirm').style.display = 'none';
  _wmsConfirmCb = null;
}

// ── Protocolo ─────────────────────────────────────────────────────────────────
let _protocoloRows = [];
async function carregarProtocolo() {
  const data = document.getElementById('proto-filtro-data')?.value || '';
  const q = data ? `?data=${data}` : '';
  const rows = await apiFetch(`/protocolo${q}`);
  _protocoloRows = rows || [];
  const el = document.getElementById('proto-lista');
  if (!el) return;
  if (!rows || !rows.length) { el.innerHTML = '<div style="text-align:center;color:var(--text3);padding:32px">Nenhum item em protocolo</div>'; return; }
  el.innerHTML = rows.map(r => `
    <div style="background:var(--surface);border-radius:12px;padding:16px;margin-bottom:12px;border:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-weight:700;font-size:15px">${r.codigo||''} — ${r.descricao||''}</span>
        <span class="pill protocolo">Protocolo</span>
      </div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:4px">Pedido: <b>#${r.numero_pedido||r.pedido_id}</b> | Cliente: ${r.cliente||'—'}</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:4px">Separador: ${r.separador_nome||'—'} | Data: ${fmtData(r.data_aviso)} ${r.hora_aviso||''}</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:8px">Endereço: ${r.endereco||'—'} | Qtd: ${r.quantidade||0}</div>
      ${usuarioAtual?.perfil==='supervisor' ? `<button class="btn btn-outline btn-sm" onclick="liberarProtocolo(${r.id})" style="color:#ef4444;border-color:#ef4444">✅ Liberar como Não Encontrado</button>` : ''}
    </div>
  `).join('');
  // Badge
  const badge = document.getElementById('menu-badge-proto');
  if (badge) { badge.style.display = rows.length ? '' : 'none'; badge.textContent = rows.length; }
}

async function liberarProtocolo(id) {
  wmsConfirm('Confirmar liberação como Não Encontrado?', async () => {
    const r = await apiFetch(`/repositor/avisos/${id}/liberar`, {method:'PUT'});
    if (r?.mensagem) { toast('✅ Item liberado!', 'sucesso'); carregarProtocolo(); }
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

// ── Estatísticas Separador ───────────────────────────────────────────────────
async function carregarEstatisticasSep() {
  const data = document.getElementById('stats-sep-data')?.value || '';
  const q = data ? `?data=${data}` : '';
  const d = await apiFetch(`/estatisticas/separador${q}`);
  if (!d) return;
  const cards = document.getElementById('stats-sep-cards');
  if (cards) cards.innerHTML = `
    <div class="stat-card"><div class="stat-val">${d.totais?.hoje||0}</div><div class="stat-lbl">Hoje</div></div>
    <div class="stat-card"><div class="stat-val">${d.totais?.concluidos_hoje||0}</div><div class="stat-lbl">Concluídos</div></div>
    <div class="stat-card"><div class="stat-val">${d.totais?.separando_hoje||0}</div><div class="stat-lbl">Em Separação</div></div>
  `;
  const lista = document.getElementById('stats-sep-lista');
  if (lista) {
    const pedidos = d.pedidos||[];
    if (!pedidos.length) { lista.innerHTML='<div style="text-align:center;color:var(--text3);padding:24px">Nenhum pedido no período</div>'; return; }
    lista.innerHTML = `<div style="font-weight:700;font-size:13px;margin-bottom:8px">Pedidos do Dia</div>` +
      pedidos.map(p=>`
        <div style="background:var(--surface);border-radius:10px;padding:12px;margin-bottom:8px;border:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:700">#${p.numero_pedido}</div>
            <div style="font-size:12px;color:var(--text3)">${p.cliente||'—'} | ${p.itens||0} itens</div>
          </div>
          <span class="pill ${p.status}">${p.status}</span>
        </div>
      `).join('');
  }
}

// ── Estatísticas Checkout ────────────────────────────────────────────────────
async function carregarEstatisticasCk() {
  const d = await apiFetch('/estatisticas/checkout');
  if (!d) return;
  const cards = document.getElementById('stats-ck-cards');
  if (cards) cards.innerHTML = `
    <div class="stat-card"><div class="stat-val">${d.hoje_concluidos||0}</div><div class="stat-lbl">Checkouts Hoje</div></div>
    <div class="stat-card"><div class="stat-val">${d.hoje_pendentes||0}</div><div class="stat-lbl">Pendentes Hoje</div></div>
    <div class="stat-card"><div class="stat-val">${d.mes_concluidos||0}</div><div class="stat-lbl">No Mês</div></div>
    <div class="stat-card"><div class="stat-val">${d.total_concluidos||0}</div><div class="stat-lbl">Total</div></div>
  `;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('input-pedido')?.addEventListener('keypress', e => { if(e.key==='Enter') confirmarPedido(); });
  document.getElementById('m-input-pedido')?.addEventListener('keypress', e => { if(e.key==='Enter') confirmarPedidoMobile(); });
  document.getElementById('m-ck-input-caixa')?.addEventListener('keypress', e => { if(e.key==='Enter') buscarCaixaMobile(); });
});
