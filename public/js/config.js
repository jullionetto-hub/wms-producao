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

// ── Modal confirmação genérico — mesmo design do "Sair do sistema" ───────────
// Uso: wmsConfirm({ icone, titulo, sub, btnOk, btnOkClass }, onYes, onNo)
//      wmsConfirm("mensagem simples", onYes)   ← compatibilidade legado
let _wmsConfirmCb = null;
let _wmsConfirmCancelCb = null;

function wmsConfirm(opts, onYes, onNo) {
  _wmsConfirmCb       = onYes || null;
  _wmsConfirmCancelCb = onNo  || null;

  if (typeof opts === 'string') opts = { titulo: opts };

  const icone  = opts.icone      || '❓';
  const titulo = opts.titulo     || 'Confirmar ação?';
  const sub    = opts.sub        || '';
  const btnOk  = opts.btnOk      || 'Confirmar';
  const btnCls = opts.btnOkClass || 'btn-primary';

  const s = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  s('modal-confirm-icon',   icone);
  s('modal-confirm-titulo', titulo);
  s('modal-confirm-sub',    sub);

  const btnEl = document.getElementById('modal-confirm-btn-ok');
  if (btnEl) {
    btnEl.textContent = btnOk;
    btnEl.className = `btn ${btnCls}`;
    btnEl.style.cssText = 'flex:1;padding:13px;font-size:14px;font-weight:700';
  }

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

function mudarProtoTab(tab) {
  ['aguardando','protocolados'].forEach(t => {
    const btn = document.getElementById(`proto-tab-btn-${t}`);
    const pnl = document.getElementById(`proto-tab-${t}`);
    const active = t === tab;
    if (btn) {
      btn.style.color        = active ? 'var(--accent)' : 'var(--text3)';
      btn.style.borderBottom = active ? '2px solid var(--accent)' : '2px solid transparent';
    }
    if (pnl) pnl.style.display = active ? '' : 'none';
  });
}

function _renderProtoKpis(pedList, pedListH) {
  const wrap = document.getElementById('proto-kpi-cards');
  if (!wrap) return;
  const itensPend  = pedList.reduce((s, p) => s + p.itens.length, 0);
  const itensProto = pedListH.reduce((s, p) => s + p.itens.length, 0);
  const totalItens = itensPend + itensProto;
  const totalPeds  = pedList.length + pedListH.length;

  // Breakdowns por tipo de entrega no aguardando
  const tipos = {};
  pedList.forEach(ped => {
    const t = (ped.transportadora || '').toUpperCase();
    const tipo = /DRIVE|RETIRADA/i.test(t) ? '🚗 Drive Thru'
               : /PRIME/i.test(t)           ? '⭐ Prime'
               : /SEDEX/i.test(t)           ? '📮 SEDEX'
               : /^PAC/i.test(t)            ? '📦 PAC'
               : /MOTOBOY|MOTO/i.test(t)    ? '🏍️ Motoboy'
               : '📦 Outros';
    tipos[tipo] = (tipos[tipo] || 0) + 1;
  });
  const tiposKpis = Object.entries(tipos).map(([k,v]) => `<div style="background:var(--surface2);border-radius:8px;padding:7px 10px"><div style="font-size:9px;color:var(--text3);font-weight:700;letter-spacing:.5px">${k.toUpperCase()}</div><div style="font-size:15px;font-weight:800;color:var(--text);margin-top:2px">${v} ped.</div></div>`).join('');

  const cards = [
    { icon:'📋', label:'AGUARDANDO', grad:'linear-gradient(135deg,#7c3aed,#6d28d9)',
      main: itensPend,
      sub: `${pedList.length} pedido${pedList.length!==1?'s':''}`,
      kpis: tiposKpis || `<div style="background:var(--surface2);border-radius:8px;padding:7px 10px"><div style="font-size:11px;color:var(--text3)">Nenhum aguardando</div></div>` },
    { icon:'✅', label:'PROTOCOLADOS', grad:'linear-gradient(135deg,#10b981,#047857)',
      main: itensProto,
      sub: `${pedListH.length} pedido${pedListH.length!==1?'s':''}`,
      kpis: [
        { lbl:'Total Itens',   val: itensProto },
        { lbl:'Total Pedidos', val: pedListH.length },
      ]},
    { icon:'📊', label:'TOTAL PERÍODO', grad:'linear-gradient(135deg,#3b82f6,#1d4ed8)',
      main: totalItens,
      sub: `${totalPeds} pedido${totalPeds!==1?'s':''}`,
      kpis: [
        { lbl:'Aguardando', val: itensPend  },
        { lbl:'Resolvidos', val: itensProto },
      ]},
  ];

  wrap.innerHTML = cards.map((c, i) => {
    const kpisHtml = i === 0
      ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${c.kpis}</div>`
      : `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${c.kpis.map(k=>`<div style="background:var(--surface2);border-radius:8px;padding:7px 10px"><div style="font-size:9px;color:var(--text3);font-weight:700;letter-spacing:.5px">${k.lbl.toUpperCase()}</div><div style="font-size:15px;font-weight:800;color:var(--text);margin-top:2px">${k.val}</div></div>`).join('')}</div>`;
    return `
    <div style="background:var(--surface);border-radius:18px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.10)">
      <div style="background:${c.grad};padding:18px 18px 16px;position:relative;overflow:hidden">
        <div style="position:absolute;right:-14px;top:-14px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.10);pointer-events:none"></div>
        <div style="position:absolute;right:-18px;bottom:-18px;width:65px;height:65px;border-radius:50%;background:rgba(255,255,255,.07);pointer-events:none"></div>
        <div style="position:relative">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,.2);font-size:20px;margin-bottom:8px">${c.icon}</div>
          <div style="font-size:10px;font-weight:800;color:rgba(255,255,255,.8);letter-spacing:1.2px;margin-bottom:4px">${c.label}</div>
          <div style="font-size:44px;font-weight:800;color:#fff;line-height:1;letter-spacing:-1px">${c.main}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.7);margin-top:4px">${c.sub}</div>
        </div>
      </div>
      <div style="padding:12px 14px">${kpisHtml}</div>
    </div>`;
  }).join('');
}

// Badge colorido por tipo de entrega (reutilizado no protocolo)
function _transpBadgeProto(transp) {
  const t = (transp||'').trim();
  if (!t || t === '—') return '';
  if (/DRIVE|RETIRADA/i.test(t))  return `<span style="background:#fee2e2;color:#dc2626;border:1.5px solid #fca5a5;font-size:10px;font-weight:800;padding:2px 8px;border-radius:20px;white-space:nowrap">🚗 Drive Thru</span>`;
  if (/PRIME/i.test(t))           return `<span style="background:#FEF3C7;color:#92400E;border:1.5px solid #FCD34D;font-size:10px;font-weight:800;padding:2px 8px;border-radius:20px;white-space:nowrap">⭐ Prime</span>`;
  if (/SEDEX/i.test(t))           return `<span style="background:#EFF6FF;color:#1D4ED8;border:1.5px solid #BFDBFE;font-size:10px;font-weight:800;padding:2px 8px;border-radius:20px;white-space:nowrap">📮 ${t}</span>`;
  if (/^PAC/i.test(t))            return `<span style="background:#F0FDF4;color:#166534;border:1.5px solid #BBF7D0;font-size:10px;font-weight:800;padding:2px 8px;border-radius:20px;white-space:nowrap">📦 ${t}</span>`;
  if (/MOTOBOY|MOTO/i.test(t))    return `<span style="background:#F5F3FF;color:#6D28D9;border:1.5px solid #DDD6FE;font-size:10px;font-weight:800;padding:2px 8px;border-radius:20px;white-space:nowrap">🏍️ ${t}</span>`;
  return `<span style="background:var(--surface2);color:var(--text2);border:1px solid var(--border);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap">📦 ${t}</span>`;
}

async function carregarProtocolo() {
  const ini = document.getElementById('proto-filtro-ini')?.value || '';
  const fim = document.getElementById('proto-filtro-fim')?.value || '';
  const p = new URLSearchParams();
  if (ini) p.set('data_ini', ini);
  if (fim) p.set('data_fim', fim);
  const q = p.toString() ? '?' + p.toString() : '';

  const rows = await apiFetch(`/protocolo${q}`);
  _protocoloRows = rows || [];
  const el    = document.getElementById('proto-lista');
  const badge = document.getElementById('menu-badge-proto');

  // ── Badge do menu ──────────────────────────────────────────────────────────
  const pedMap = {};
  (_protocoloRows).forEach(r => {
    const key = r.pedido_id || r.numero_pedido;
    if (!pedMap[key]) pedMap[key] = {
      pedido_id: r.pedido_id, numero_pedido: r.numero_pedido || r.pedido_id,
      cliente: r.cliente || '—', transportadora: r.transportadora || '—', itens: []
    };
    pedMap[key].itens.push(r);
  });
  const pedList = Object.values(pedMap);
  if (badge) { badge.style.display = pedList.length ? '' : 'none'; badge.textContent = pedList.length; }
  const tabBdgAg = document.getElementById('proto-tab-badge-aguardando');
  if (tabBdgAg) tabBdgAg.textContent = pedList.length;
  if (!el) return;

  // ── Tabela unificada de aguardando protocolo ───────────────────────────────
  if (!pedList.length) {
    el.innerHTML = `
      <div style="text-align:center;padding:60px 20px">
        <div style="font-size:48px;margin-bottom:12px">✅</div>
        <div style="font-size:15px;font-weight:600;color:var(--text2)">Nenhum item aguardando protocolo</div>
      </div>`;
  } else {
    // Achata todos os itens em uma lista plana com dados do pedido
    const todosItens = pedList.flatMap(ped =>
      ped.itens.map(r => ({ ...r, _ped: ped }))
    );
    el.innerHTML = `
      <div style="background:var(--surface);border-radius:16px;overflow:hidden;border:1.5px solid var(--border);box-shadow:0 2px 12px rgba(0,0,0,.07);margin-bottom:20px">
        <!-- Cabeçalho da seção -->
        <div style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:14px 18px;display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:20px">📋</span>
            <span style="color:#fff;font-weight:800;font-size:15px;letter-spacing:.3px">Aguardando Protocolo</span>
          </div>
          <span style="background:rgba(255,255,255,.25);color:#fff;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:800">${todosItens.length} ${todosItens.length===1?'item':'itens'} · ${pedList.length} pedido${pedList.length!==1?'s':''}</span>
        </div>
        <!-- Tabela de itens -->
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="background:var(--surface2);border-bottom:2px solid var(--border)">
                <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;white-space:nowrap">Data</th>
                <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;white-space:nowrap">Nº Pedido</th>
                <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">Entrega</th>
                <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">Código</th>
                <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">Descrição</th>
                <th style="padding:10px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">Qtd</th>
                <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">Separador</th>
                <th style="padding:10px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">Aviso</th>
                ${usuarioAtual?.perfil==='supervisor' ? `<th style="padding:10px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">Ação</th>` : ''}
              </tr>
            </thead>
            <tbody>
              ${todosItens.map((r, i) => {
                const dataFmt = (r.data_aviso||'').split('-').reverse().join('/') || '—';
                const transp  = _transpBadgeProto(r._ped.transportadora);
                return `<tr style="border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
                  <td style="padding:9px 12px;color:var(--text3);font-size:11px;white-space:nowrap">${dataFmt}</td>
                  <td style="padding:9px 12px;white-space:nowrap">
                    <span style="font-family:'Space Mono',monospace;font-weight:800;font-size:13px;color:#7c3aed">#${r._ped.numero_pedido}</span>
                    ${r._ped.cliente && r._ped.cliente !== '—' ? `<div style="font-size:10px;color:var(--text3);margin-top:1px">${r._ped.cliente}</div>` : ''}
                  </td>
                  <td style="padding:9px 12px">${transp}</td>
                  <td style="padding:9px 12px;font-family:'Space Mono',monospace;font-weight:700;color:#dc2626;font-size:12px;white-space:nowrap">${r.codigo||'—'}</td>
                  <td style="padding:9px 12px;font-weight:600;color:var(--text);max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${r.descricao||''}">${r.descricao||'—'}</td>
                  <td style="padding:9px 12px;text-align:center">
                    <span style="background:#FEF3C7;color:#92400E;border-radius:8px;padding:3px 10px;font-weight:900;font-size:14px">${r.quantidade||0}</span>
                  </td>
                  <td style="padding:9px 12px;color:var(--text2);font-size:11px;white-space:nowrap">${r.separador_nome||'—'}</td>
                  <td style="padding:9px 12px;text-align:center;white-space:nowrap">
                    <span style="font-family:'Space Mono',monospace;font-size:11px;color:var(--text3)">${r.hora_aviso||'—'}</span>
                  </td>
                  ${usuarioAtual?.perfil==='supervisor' ? `
                  <td style="padding:6px 12px;text-align:center">
                    <button onclick="encerrarItemProtocolo(${r.id},this)" id="proto-btn-${r.id}"
                      style="padding:5px 12px;background:#7c3aed;color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap">
                      ✔ Encerrar
                    </button>
                  </td>` : ''}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <!-- Botão encerrar todos (supervisor) -->
        ${usuarioAtual?.perfil==='supervisor' ? `
        <div style="padding:14px 16px;border-top:1px solid var(--border);display:flex;gap:10px;flex-wrap:wrap">
          ${pedList.map(ped => `
            <button onclick="encerrarProtocoloPedido('${ped.numero_pedido}','${ped.itens.map(i=>i.id).join(',')}',${ped.itens.length},this)" id="proto-enc-${ped.numero_pedido}"
              style="padding:9px 16px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap">
              📋 Encerrar Pedido #${ped.numero_pedido} (${ped.itens.length} ${ped.itens.length===1?'item':'itens'})
            </button>`).join('')}
        </div>` : ''}
      </div>`;
  }

  // ── Histórico (protocolados) — tabela unificada ────────────────────────────
  const elHist  = document.getElementById('proto-historico');
  const histBdg = document.getElementById('proto-hist-badge');
  const rowsH   = await apiFetch(`/protocolo/historico${q}`) || [];

  const pedMapH = {};
  rowsH.forEach(r => {
    const key = r.pedido_id || r.numero_pedido;
    if (!pedMapH[key]) pedMapH[key] = {
      pedido_id: r.pedido_id, numero_pedido: r.numero_pedido || r.pedido_id,
      cliente: r.cliente || '—', transportadora: r.transportadora || '—', itens: []
    };
    pedMapH[key].itens.push(r);
  });
  const pedListH = Object.values(pedMapH);
  const tabBdgPr = document.getElementById('proto-tab-badge-protocolados');
  if (tabBdgPr) tabBdgPr.textContent = pedListH.length;
  _renderProtoKpis(pedList, pedListH);

  if (elHist) {
    if (!pedListH.length) {
      elHist.innerHTML = '<div style="text-align:center;color:var(--text3);padding:32px;font-size:13px">Nenhum pedido protocolado no período</div>';
    } else {
      const todosH = pedListH.flatMap(ped => ped.itens.map(r => ({...r, _ped: ped})));
      elHist.innerHTML = `
        <div style="background:var(--surface);border-radius:16px;overflow:hidden;border:1.5px solid #d1fae5;box-shadow:0 1px 6px rgba(0,0,0,.04)">
          <div style="background:linear-gradient(135deg,#059669,#047857);padding:12px 18px;display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:18px">✅</span>
              <span style="color:#fff;font-weight:800;font-size:14px;letter-spacing:.3px">Protocolados</span>
            </div>
            <span style="background:rgba(255,255,255,.25);color:#fff;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:800">${todosH.length} itens · ${pedListH.length} pedidos</span>
          </div>
          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead>
                <tr style="background:var(--surface2);border-bottom:2px solid var(--border)">
                  <th style="padding:9px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;white-space:nowrap">Data</th>
                  <th style="padding:9px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;white-space:nowrap">Nº Pedido</th>
                  <th style="padding:9px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">Entrega</th>
                  <th style="padding:9px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">Código</th>
                  <th style="padding:9px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">Descrição</th>
                  <th style="padding:9px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">Qtd</th>
                  <th style="padding:9px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">Separador</th>
                  <th style="padding:9px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.6px">Encerrado por</th>
                </tr>
              </thead>
              <tbody>
                ${todosH.map(r => {
                  const dataFmt = (r.data_aviso||'').split('-').reverse().join('/') || '—';
                  const transp  = _transpBadgeProto(r._ped.transportadora);
                  return `<tr style="border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
                    <td style="padding:8px 12px;color:var(--text3);font-size:11px;white-space:nowrap">${dataFmt}</td>
                    <td style="padding:8px 12px;white-space:nowrap">
                      <span style="font-family:'Space Mono',monospace;font-weight:800;font-size:12px;color:#059669">#${r._ped.numero_pedido}</span>
                      ${r._ped.cliente && r._ped.cliente !== '—' ? `<div style="font-size:10px;color:var(--text3)">${r._ped.cliente}</div>` : ''}
                    </td>
                    <td style="padding:8px 12px">${transp}</td>
                    <td style="padding:8px 12px;font-family:'Space Mono',monospace;font-weight:700;color:#dc2626;font-size:12px">${r.codigo||'—'}</td>
                    <td style="padding:8px 12px;font-weight:600;color:var(--text);max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${r.descricao||''}">${r.descricao||'—'}</td>
                    <td style="padding:8px 12px;text-align:center">
                      <span style="background:#dcfce7;color:#166534;border-radius:8px;padding:2px 10px;font-weight:800;font-size:13px">${r.quantidade||0}</span>
                    </td>
                    <td style="padding:8px 12px;color:var(--text2);font-size:11px;white-space:nowrap">${r.separador_nome||'—'}</td>
                    <td style="padding:8px 12px;color:#059669;font-weight:700;font-size:11px;white-space:nowrap">${r.quem_guardou||'—'}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    }
  }
}

// Encerra um único item de protocolo
async function encerrarItemProtocolo(id, btn) {
  if (btn?.disabled) return;
  const orig = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳'; }
  try {
    const r = await apiFetch(`/repositor/avisos/${id}`, {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ status:'protocolado', situacao:'protocolado', quem_guardou: usuarioAtual?.nome || '' })
    });
    if (!r?.erro) {
      // Remove a linha da tabela imediatamente
      const row = btn?.closest('tr');
      if (row) { row.style.opacity='0'; row.style.transition='opacity .3s'; setTimeout(()=>{ row.remove(); carregarProtocolo(); }, 300); }
      else carregarProtocolo();
    } else {
      if (btn) { btn.disabled=false; btn.innerHTML=orig; }
      toast(r.erro, 'erro');
    }
  } catch(e) { if (btn) { btn.disabled=false; btn.innerHTML=orig; } toast('Erro','erro'); }
}

async function encerrarProtocoloPedido(numero_pedido, idsStr, qtdItens, btn) {
  if (btn?.disabled) return;
  wmsConfirm(`Encerrar protocolo do pedido #${numero_pedido}?\n${qtdItens} item(ns) serão marcados como protocolados.`, async () => {
    const orig = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Encerrando...'; }
    try {
      const ids = String(idsStr).split(',').map(Number).filter(Boolean);
      let ok = 0, erros = 0;
      for (const id of ids) {
        const r = await apiFetch(`/repositor/avisos/${id}`, {
          method:'PUT', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ status:'protocolado', situacao:'protocolado', quem_guardou: usuarioAtual?.nome || '' })
        });
        r?.erro ? erros++ : ok++;
      }
      if (erros === 0) {
        toast(`✅ Pedido #${numero_pedido}: ${ok} item(ns) protocolado(s)`, 'sucesso');
      } else {
        toast(`⚠️ ${ok} ok · ${erros} com erro — recarregando...`, 'aviso');
      }
      carregarProtocolo();
    } catch(e) {
      if (btn) { btn.disabled=false; btn.innerHTML=orig; }
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
  const _hoje = new Date().toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}).replace(/\//g,'-');
  a.href = url; a.download = `protocolo_${_hoje}.csv`;
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
      const dtStr  = (p[dataField] ? fmtData(p[dataField]) : null) || (dtIni ? dtIni.toLocaleDateString('pt-BR') : '—');
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
