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
  // Sempre atualiza o badge — mesmo quando a lista está vazia
  const badge = document.getElementById('menu-badge-proto');
  if (badge) { badge.style.display = (rows||[]).length ? '' : 'none'; badge.textContent = (rows||[]).length; }
  if (!el) return;
  // ── Histórico (status=protocolado) ───────────────────────────────────────
  const elHist  = document.getElementById('proto-historico');
  const histBdg = document.getElementById('proto-hist-badge');
  const rowsH   = await apiFetch(`/protocolo/historico${q}`) || [];
  if (histBdg) histBdg.textContent = rowsH.length;
  if (elHist) {
    elHist.innerHTML = rowsH.length ? rowsH.map(h => `
      <div style="background:var(--surface);border-radius:14px;overflow:hidden;margin-bottom:12px;border:1.5px solid #d1fae5;box-shadow:0 1px 6px rgba(0,0,0,.04)">
        <div style="background:linear-gradient(135deg,#059669,#047857);padding:11px 16px;display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:16px">✅</span>
            <div>
              <div style="color:#fff;font-weight:800;font-size:14px;font-family:'Space Mono',monospace">#${h.numero_pedido||h.pedido_id}</div>
              <div style="color:rgba(255,255,255,.7);font-size:11px">${fmtData(h.data_aviso)} às ${h.hora_aviso||'—'}</div>
            </div>
          </div>
          <span style="background:rgba(255,255,255,.22);color:#fff;padding:3px 12px;border-radius:20px;font-size:10px;font-weight:800;letter-spacing:.5px">PROTOCOLADO</span>
        </div>
        <div style="padding:12px 16px">
          <div style="font-family:'Space Mono',monospace;font-size:14px;font-weight:700;color:#dc2626;margin-bottom:2px">${h.codigo||'—'}</div>
          <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:10px">${h.descricao||'—'}</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px">
            <div><div style="font-size:9px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Cliente</div><div style="font-size:12px;font-weight:700;color:var(--text)">${h.cliente||'—'}</div></div>
            <div><div style="font-size:9px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Qtde</div><div style="font-size:16px;font-weight:900;color:#92400e">${h.quantidade||0}</div></div>
            <div><div style="font-size:9px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Separador</div><div style="font-size:12px;font-weight:600;color:var(--text2)">${h.separador_nome||'—'}</div></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div><div style="font-size:9px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Forma de Envio</div><div style="font-size:12px;font-weight:600;color:var(--text2)">${h.transportadora||'—'}</div></div>
            <div><div style="font-size:9px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Enviado por</div><div style="font-size:12px;font-weight:700;color:#059669">${h.quem_guardou||'—'}</div></div>
          </div>
        </div>
      </div>`).join('')
    : '<div style="text-align:center;color:var(--text3);padding:32px;font-size:13px">Nenhum item protocolado no período</div>';
  }

  if (!rows || !rows.length) { el.innerHTML = '<div style="text-align:center;color:var(--text3);padding:48px;font-size:14px">Nenhum item aguardando envio para protocolo</div>'; return; }
  el.innerHTML = rows.map(r => `
    <div style="background:var(--surface);border-radius:16px;overflow:hidden;margin-bottom:16px;border:1.5px solid #e2e8f0;box-shadow:0 2px 12px rgba(0,0,0,.07)">

      <!-- Cabeçalho roxo -->
      <div style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:14px 18px;display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:22px">📋</span>
          <div>
            <div style="color:#fff;font-weight:800;font-size:16px;font-family:'Space Mono',monospace">#${r.numero_pedido||r.pedido_id}</div>
            <div style="color:rgba(255,255,255,.7);font-size:11px">${fmtData(r.data_aviso)} às ${r.hora_aviso||'—'}</div>
          </div>
        </div>
        <span style="background:rgba(255,255,255,.22);color:#fff;padding:5px 14px;border-radius:20px;font-size:11px;font-weight:800;letter-spacing:.8px">PROTOCOLO</span>
      </div>

      <!-- Corpo -->
      <div style="padding:16px 18px">
        <!-- Item -->
        <div style="font-family:'Space Mono',monospace;font-size:17px;font-weight:800;color:#dc2626;letter-spacing:.5px;margin-bottom:3px">${r.codigo||'—'}</div>
        <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:16px;line-height:1.4">${r.descricao||'—'}</div>

        <!-- Grid de dados -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">

          <div style="background:#eff6ff;border-radius:10px;padding:11px 13px;border-left:3px solid #3b82f6">
            <div style="font-size:9px;font-weight:800;color:#2563eb;letter-spacing:.8px;margin-bottom:3px;text-transform:uppercase">Cliente</div>
            <div style="font-size:13px;font-weight:700;color:#1e3a5f">${r.cliente||'—'}</div>
          </div>

          <div style="background:#fef3c7;border-radius:10px;padding:11px 13px;border-left:3px solid #f59e0b">
            <div style="font-size:9px;font-weight:800;color:#d97706;letter-spacing:.8px;margin-bottom:3px;text-transform:uppercase">Quantidade</div>
            <div style="font-size:22px;font-weight:900;color:#92400e;line-height:1">${r.quantidade||0}</div>
          </div>

          <div style="background:#f0fdf4;border-radius:10px;padding:11px 13px;border-left:3px solid #10b981">
            <div style="font-size:9px;font-weight:800;color:#059669;letter-spacing:.8px;margin-bottom:3px;text-transform:uppercase">Separador</div>
            <div style="font-size:12px;font-weight:700;color:#064e3b">${r.separador_nome||'—'}</div>
          </div>

          <div style="background:#fdf4ff;border-radius:10px;padding:11px 13px;border-left:3px solid #a855f7">
            <div style="font-size:9px;font-weight:800;color:#9333ea;letter-spacing:.8px;margin-bottom:3px;text-transform:uppercase">Forma de Envio</div>
            <div style="font-size:12px;font-weight:700;color:#4a044e">${r.transportadora||'—'}</div>
          </div>

        </div>

        <!-- Endereço -->
        <div style="background:#f8fafc;border-radius:10px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:8px;border:1px solid #e2e8f0">
          <span style="font-size:16px">📍</span>
          <div>
            <div style="font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.8px;text-transform:uppercase;margin-bottom:1px">Endereço</div>
            <div style="font-size:13px;font-weight:700;color:var(--text);font-family:'Space Mono',monospace">${r.endereco||'—'}</div>
          </div>
        </div>

        <!-- Botão -->
        ${usuarioAtual?.perfil==='supervisor' ? `
        <div id="proto-btn-wrap-${r.id}">
          <button id="proto-btn-enc-${r.id}"
            onclick="liberarProtocolo(${r.id},this)"
            style="width:100%;padding:14px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:800;cursor:pointer;letter-spacing:.3px;display:flex;align-items:center;justify-content:center;gap:8px">
            📋 Enviar para Protocolo
          </button>
        </div>` : ''}
      </div>
    </div>
  `).join('');
}

async function liberarProtocolo(id, btn) {
  if (btn?.disabled) return;
  // Desabilita o botão imediatamente (proteção contra clique múltiplo)
  btn.disabled = true;
  wmsConfirm('Confirmar envio para Protocolo? O item será registrado oficialmente.', async () => {
    try {
      const supervisorNome = usuarioAtual?.nome || 'Supervisor';
      const r = await apiFetch(`/repositor/avisos/${id}`, {
        method:'PUT',
        body: JSON.stringify({ status:'protocolado', situacao:'protocolado', quem_guardou: supervisorNome }),
        headers: {'Content-Type':'application/json'}
      });
      if (r?.mensagem) {
        toast(r.mensagem, 'sucesso');
        // Re-busca o wrap após async (pode ter sido re-renderizado)
        const wrapFresh = document.getElementById(`proto-btn-wrap-${id}`);
        if (wrapFresh) wrapFresh.innerHTML =
          '<span style="display:flex;align-items:center;justify-content:center;gap:6px;padding:14px;background:#f3e8ff;color:#7c3aed;border-radius:10px;font-size:14px;font-weight:800;border:1.5px solid #c4b5fd">✅ Enviado para Protocolo</span>';
        carregarProtocolo(); // sempre recarrega para refletir o estado real
      } else {
        const btnFresh = document.getElementById(`proto-btn-enc-${id}`);
        if (btnFresh) btnFresh.disabled = false;
        else if (btn) btn.disabled = false;
      }
    } catch(e) {
      const btnFresh = document.getElementById(`proto-btn-enc-${id}`);
      if (btnFresh) btnFresh.disabled = false;
      else if (btn) btn.disabled = false;
      toast('Erro ao liberar','erro');
    }
  }, () => {
    // Cancelou — reabilita o botão
    const btnFresh = document.getElementById(`proto-btn-enc-${id}`);
    if (btnFresh) btnFresh.disabled = false;
    else if (btn) btn.disabled = false;
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
