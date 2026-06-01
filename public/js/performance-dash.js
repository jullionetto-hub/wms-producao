/* ══ WMS — Performance dos Separadores ══
   Versão 2 — cards gradiente + dropdown de colaboradores
   Pedidos, itens, SKUs, reposições, tempo médio por colaborador.
══════════════════════════════════════════════════════════════════════ */
'use strict';

// ── Estado ────────────────────────────────────────────────────────────────
let _pfDados      = null;   // resposta completa da API
let _pfFiltrados  = [];     // colaboradores após filtro de nome
const _pfCharts   = {};
let _pfCarregando = false;

// ── Helpers ───────────────────────────────────────────────────────────────
const pfFmtN  = n => Number(n||0).toLocaleString('pt-BR');
const pfToast = (m,t) => typeof toast === 'function' ? toast(m,t) : console.log(m);

function pfFmtBR(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function pfDestroyChart(id) {
  if (_pfCharts[id]) { _pfCharts[id].destroy(); delete _pfCharts[id]; }
}
function pfEsc(s) {
  return String(s||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const PF_COR_TURNO   = { Manha:'#38bdf8', Tarde:'#f59e0b', Noite:'#a78bfa' };
const PF_LABEL_TURNO = { Manha:'☀️ Manhã', Tarde:'🌅 Tarde', Noite:'🌙 Noite' };
const PF_GRID = { color:'rgba(51,65,85,.25)' };
const PF_TICK = { color:'#64748b', font:{ size:10 } };

function pfCor(turno) { return PF_COR_TURNO[turno] || '#6366f1'; }
function pfChartOpts(extra={}) {
  return Object.assign({ responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{display:false} }, animation:{duration:250} }, extra);
}

// ── Renderiza a página ─────────────────────────────────────────────────────
function renderizarPerformanceDash() {
  const pag = document.getElementById('pag-performance');
  if (!pag) return;

  // Força atualização do Service Worker para garantir que rotas /performance
  // não sejam servidas de cache antigo
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.update()));
  }

  // Reseta estado para evitar race conditions se o usuário navegar durante carregamento
  _pfCarregando = false;

  pag.innerHTML = `
  <div style="padding:0 0 40px">

    <div class="pg-title" style="margin-bottom:18px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      🏆 Performance dos Separadores
      <div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button onclick="pfExportarExcel()" style="background:#16a34a;color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer">📊 Excel</button>
      </div>
    </div>

    <!-- FILTROS -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:12px 16px;margin-bottom:18px;display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap">
      <div>
        <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.8px;margin-bottom:3px">DE</div>
        <input type="date" id="pf-ini"
          style="padding:7px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px;outline:none">
      </div>
      <div>
        <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.8px;margin-bottom:3px">ATÉ</div>
        <input type="date" id="pf-fim"
          style="padding:7px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px;outline:none">
      </div>
      <div>
        <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.8px;margin-bottom:3px">TURNO</div>
        <select id="pf-turno"
          style="padding:7px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px;outline:none">
          <option value="">Todos</option>
          <option value="Manha">☀️ Manhã</option>
          <option value="Tarde">🌅 Tarde</option>
          <option value="Noite">🌙 Noite</option>
        </select>
      </div>
      <div>
        <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.8px;margin-bottom:3px">COLABORADOR</div>
        <select id="pf-colab" onchange="pfAplicarFiltroColab()"
          style="padding:7px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px;outline:none;min-width:160px">
          <option value="">Todos os colaboradores</option>
        </select>
      </div>
      <button onclick="pfBuscarDados()" style="background:var(--accent);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:12px;font-weight:700;cursor:pointer">🔍 Filtrar</button>
      <button onclick="pfInicializar()" style="background:var(--surface2);color:var(--text3);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:12px;cursor:pointer">✕ Limpar</button>
      <span id="pf-filtro-info" style="margin-left:auto;font-size:11px;color:var(--text3);align-self:center"></span>
    </div>

    <!-- LOADING -->
    <div id="pf-loading" style="display:none;text-align:center;padding:48px;color:var(--text3)">
      <div style="font-size:24px;margin-bottom:8px">⏳</div>
      <div>Carregando dados...</div>
    </div>

    <!-- VAZIO -->
    <div id="pf-vazio" style="display:none;text-align:center;padding:72px 24px;color:var(--text3)">
      <div style="font-size:40px;margin-bottom:12px">📊</div>
      <div style="font-size:15px;font-weight:700;margin-bottom:6px">Nenhum dado encontrado</div>
      <div style="font-size:12px">Ajuste o período e tente novamente</div>
    </div>

    <!-- CONTEÚDO -->
    <div id="pf-conteudo" style="display:none">

      <!-- KPI CARDS GRADIENTE -->
      <div id="pf-kpis" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px;margin-bottom:24px"></div>

      <!-- Pedidos por colaborador (full width) -->
      <div class="card" style="padding:16px 18px;margin-bottom:16px">
        <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:14px">📋 PEDIDOS POR COLABORADOR</div>
        <div style="position:relative;height:300px"><canvas id="pf-chart-pedidos"></canvas></div>
      </div>

      <!-- Itens + SKUs -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px" class="pf-grid-2">
        <div class="card" style="padding:16px 18px">
          <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:14px">📦 ITENS POR COLABORADOR</div>
          <div style="position:relative;height:260px"><canvas id="pf-chart-itens"></canvas></div>
        </div>
        <div class="card" style="padding:16px 18px">
          <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:14px">🏷️ SKUs POR COLABORADOR</div>
          <div style="position:relative;height:260px"><canvas id="pf-chart-skus"></canvas></div>
        </div>
      </div>

      <!-- Reposições + Tempo médio -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px" class="pf-grid-2">
        <div class="card" style="padding:16px 18px">
          <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:14px">🔁 REPOSIÇÕES POR COLABORADOR</div>
          <div style="position:relative;height:260px"><canvas id="pf-chart-repos"></canvas></div>
        </div>
        <div class="card" style="padding:16px 18px">
          <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:14px">⏱️ TEMPO MÉDIO POR PEDIDO (min)</div>
          <div style="position:relative;height:260px"><canvas id="pf-chart-tempo"></canvas></div>
        </div>
      </div>

      <!-- Evolução diária (só aparece sem filtro de colaborador) -->
      <div id="pf-dia-wrap" class="card" style="padding:16px 18px;margin-bottom:20px">
        <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:14px">📅 EVOLUÇÃO DIÁRIA DE PEDIDOS</div>
        <div style="position:relative;height:220px"><canvas id="pf-chart-dia"></canvas></div>
      </div>

      <!-- Ranking -->
      <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:12px 18px;background:var(--surface2);border-bottom:1px solid var(--border);font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;display:flex;align-items:center;gap:8px">
          🏆 RANKING DETALHADO
          <span style="margin-left:auto;font-size:10px;font-weight:600;color:var(--text3)" id="pf-table-count"></span>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:var(--surface2)">
                <th style="padding:9px 12px;text-align:center;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px">#</th>
                <th style="padding:9px 14px;text-align:left;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px">COLABORADOR</th>
                <th style="padding:9px 12px;text-align:center;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px">TURNO</th>
                <th style="padding:9px 14px;text-align:right;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px">PEDIDOS</th>
                <th style="padding:9px 14px;text-align:right;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px">ITENS</th>
                <th style="padding:9px 14px;text-align:right;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px">SKUs</th>
                <th style="padding:9px 14px;text-align:right;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px">REPOSIÇÕES</th>
                <th style="padding:9px 14px;text-align:right;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px">ITENS/PED</th>
                <th style="padding:9px 14px;text-align:right;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px">TEMPO MÉDIO</th>
              </tr>
            </thead>
            <tbody id="pf-tbody"></tbody>
          </table>
        </div>
      </div>

      <!-- TEMPOS DETALHADOS POR PEDIDO -->
      <div class="card" style="padding:16px 18px;margin-top:16px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
          <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px">⏱️ TEMPOS POR PEDIDO / COLABORADOR</div>
          <button id="pf-btn-timing" onclick="pfCarregarTiming()"
            style="background:var(--accent);color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer">
            🔍 Carregar tempos
          </button>
          <span style="font-size:11px;color:var(--text3)">Separação · Reposição · Checkout · Embalagem — início e fim de cada operação</span>
        </div>
        <div id="pf-timing-wrap" style="display:none"></div>
      </div>

    </div><!-- /pf-conteudo -->
  </div>`;

  if (!document.getElementById('pf-grid-style')) {
    const s = document.createElement('style');
    s.id = 'pf-grid-style';
    s.textContent = `@media(max-width:800px){.pf-grid-2{grid-template-columns:1fr !important}}`;
    document.head.appendChild(s);
  }

  pfInicializar();
}

// ── Inicializar ────────────────────────────────────────────────────────────
async function pfInicializar() {
  const iniEl = document.getElementById('pf-ini');
  const fimEl = document.getElementById('pf-fim');
  if (!iniEl) return;

  // Reset colaborador dropdown para "Todos"
  const colabEl = document.getElementById('pf-colab');
  if (colabEl) colabEl.value = '';
  const turnoEl = document.getElementById('pf-turno');
  if (turnoEl) turnoEl.value = '';

  if (!iniEl.value || !fimEl.value) {
    document.getElementById('pf-loading').style.display = '';
    const range = await apiFetch(`/performance/range?_=${Date.now()}`);
    document.getElementById('pf-loading').style.display = 'none';
    if (range && !range.erro && range.ini) {
      const fim = range.fim;
      const dt  = new Date(range.fim + 'T12:00:00');
      dt.setDate(dt.getDate() - 6);
      const ini = dt.toISOString().slice(0,10);
      iniEl.value = ini < range.ini ? range.ini : ini;
      fimEl.value = fim;
    } else {
      const hoje = new Date();
      fimEl.value = hoje.toISOString().slice(0,10);
      hoje.setDate(hoje.getDate() - 6);
      iniEl.value = hoje.toISOString().slice(0,10);
    }
  }
  await pfBuscarDados();
}

// ── Busca dados da API ─────────────────────────────────────────────────────
async function pfBuscarDados() {
  if (_pfCarregando) return;
  _pfCarregando = true;

  const ini   = document.getElementById('pf-ini')?.value   || '';
  const fim   = document.getElementById('pf-fim')?.value   || '';
  const turno = document.getElementById('pf-turno')?.value || '';

  document.getElementById('pf-loading').style.display  = '';
  document.getElementById('pf-conteudo').style.display = 'none';
  document.getElementById('pf-vazio').style.display    = 'none';
  // Reset timing ao buscar novos dados
  _pfTiming = null;
  const timingWrap = document.getElementById('pf-timing-wrap');
  const timingBtn  = document.getElementById('pf-btn-timing');
  if (timingWrap) timingWrap.style.display = 'none';
  if (timingBtn)  timingBtn.textContent = '🔍 Carregar tempos';

  const qs = new URLSearchParams({ ini, fim });
  if (turno) qs.set('turno', turno);
  qs.set('_', Date.now()); // evita cache do SW

  const dados = await apiFetch(`/performance/separadores?${qs}`);
  _pfCarregando = false;
  document.getElementById('pf-loading').style.display = 'none';

  if (!dados || dados.erro || !dados.colaboradores?.length) {
    document.getElementById('pf-vazio').style.display = '';
    const inf = document.getElementById('pf-filtro-info');
    if (inf) inf.textContent = dados?.erro || 'Nenhum dado encontrado';
    return;
  }

  _pfDados = dados;

  console.log('[Performance] colaboradores:', dados.colaboradores?.length, '| por_dia:', dados.por_dia?.length);
  if (dados.colaboradores?.length) {
    console.log('[Performance] Exemplo:', JSON.stringify(dados.colaboradores[0]));
  }

  // Popula dropdown de colaboradores
  pfPopularDropdownColab(dados.colaboradores);

  // Aplica filtro de colaborador se já estiver selecionado
  pfAplicarFiltroColab();

  // Diagnóstico: se pf-kpis ainda estiver vazio após render, mostra dados brutos
  setTimeout(() => {
    const kpisEl = document.getElementById('pf-kpis');
    if (kpisEl && !kpisEl.children.length && dados.colaboradores?.length) {
      kpisEl.innerHTML = `<div style="grid-column:1/-1;background:#fef3c7;border:1px solid #f59e0b;border-radius:12px;padding:16px;color:#92400e;font-size:12px">
        ⚠️ Dados recebidos mas cards não renderizaram.<br>
        <b>${dados.colaboradores.length} colaborador(es):</b>
        ${dados.colaboradores.map(c=>`${pfEsc(c.nome||'?')} (${c.pedidos} ped)`).join(', ')}<br>
        <small>Abra o console do navegador (F12 → Console) para ver o erro.</small>
      </div>`;
    }
  }, 500);
}

// ── Popula dropdown de colaboradores ──────────────────────────────────────
function pfPopularDropdownColab(colaboradores) {
  const sel = document.getElementById('pf-colab');
  if (!sel) return;
  const valorAtual = sel.value;
  sel.innerHTML = '<option value="">Todos os colaboradores</option>' +
    [...colaboradores]
      .sort((a,b) => a.nome.localeCompare(b.nome))
      .map(c => `<option value="${pfEsc(c.nome)}">${pfEsc(c.nome)}</option>`)
      .join('');
  // Mantém seleção se o nome ainda existe
  if (valorAtual && [...sel.options].some(o => o.value === valorAtual)) {
    sel.value = valorAtual;
  }
}

// ── Filtra por colaborador e renderiza ────────────────────────────────────
function pfAplicarFiltroColab() {
  if (!_pfDados) return;
  const nome = document.getElementById('pf-colab')?.value || '';
  const ini  = document.getElementById('pf-ini')?.value   || '';
  const fim  = document.getElementById('pf-fim')?.value   || '';

  _pfFiltrados = nome
    ? _pfDados.colaboradores.filter(c => c.nome === nome)
    : _pfDados.colaboradores;

  if (!_pfFiltrados.length) {
    document.getElementById('pf-conteudo').style.display = 'none';
    document.getElementById('pf-vazio').style.display    = '';
    return;
  }

  document.getElementById('pf-conteudo').style.display = '';
  document.getElementById('pf-vazio').style.display    = 'none';

  // Mostra/oculta evolução diária (só faz sentido sem filtro de colaborador)
  const diaWrap = document.getElementById('pf-dia-wrap');
  if (diaWrap) diaWrap.style.display = nome ? 'none' : '';

  const inf = document.getElementById('pf-filtro-info');
  if (inf) {
    inf.textContent = nome
      ? `${pfFmtBR(ini)} a ${pfFmtBR(fim)} · ${nome}`
      : `${_pfFiltrados.length} colaboradores · ${pfFmtBR(ini)} a ${pfFmtBR(fim)}`;
  }

  pfRenderizarDados(_pfFiltrados, _pfDados.por_dia || []);
}

// ── Render principal ───────────────────────────────────────────────────────
function pfRenderizarDados(colab, porDia) {
  try {
  let totPed = 0, totItens = 0, totSkus = 0, totRep = 0;
  const tempos = [];
  colab.forEach(c => {
    totPed   += c.pedidos    || 0;
    totItens += c.itens      || 0;
    totSkus  += c.skus       || 0;
    totRep   += c.reposicoes || 0;
    if (c.tempo_medio_min != null) tempos.push({ nome: c.nome || '?', t: +c.tempo_medio_min });
  });
  const tempoMed = tempos.length ? tempos.reduce((a,b) => a + b.t, 0) / tempos.length : null;
  const tempoMin = tempos.length ? tempos.reduce((a,b) => a.t < b.t ? a : b) : null;
  const tempoMax = tempos.length ? tempos.reduce((a,b) => a.t > b.t ? a : b) : null;
  const liderPed = [...colab].sort((a,b) => (b.pedidos||0) - (a.pedidos||0))[0];
  const liderRep = [...colab].sort((a,b) => (b.reposicoes||0) - (a.reposicoes||0))[0];

  pfRenderKPIs({ totPed, totItens, totSkus, totRep, tempoMed, tempoMin, tempoMax, liderPed, liderRep, nColab: colab.length, nComTempo: tempos.length });
  pfRenderChartPedidos(colab);
  pfRenderChartHoriz('itens',  colab, 'itens',      'itens');
  pfRenderChartHoriz('skus',   colab, 'skus',       'SKUs');
  pfRenderChartHoriz('repos',  colab, 'reposicoes', 'reposições');
  pfRenderChartTempo(colab);
  pfRenderChartDia(porDia);
  pfRenderTabela(colab, totPed);
  } catch(err) {
    console.error('[Performance] Erro ao renderizar:', err);
    const kpisEl = document.getElementById('pf-kpis');
    if (kpisEl) kpisEl.innerHTML = `<div style="grid-column:1/-1;background:#fee2e2;border:1px solid #ef4444;border-radius:12px;padding:16px;color:#b91c1c;font-size:13px">
      ⚠️ Erro ao renderizar os dados: <b>${pfEsc(err.message)}</b><br>
      <small>Verifique o console do navegador (F12) para mais detalhes.</small>
    </div>`;
  }
}

// ── KPI Cards com gradiente ────────────────────────────────────────────────
function pfRenderKPIs({ totPed, totItens, totSkus, totRep, tempoMed, tempoMin, tempoMax, liderPed, liderRep, nColab, nComTempo }) {
  const itensPed = totPed > 0 ? (totItens / totPed).toFixed(1) : '0';
  const skusPed  = totPed > 0 ? (totSkus  / totPed).toFixed(1) : '0';
  const repPct   = totPed > 0 ? (totRep   / totPed * 100).toFixed(1) : '0';

  const mini = (label, val) => `
    <div>
      <div style="font-size:8px;font-weight:700;opacity:.65;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">${label}</div>
      <div style="font-size:15px;font-weight:800;line-height:1">${val}</div>
    </div>`;

  const card = (grad, icon, label, num, desc, stats) => `
    <div style="background:${grad};border-radius:16px;padding:20px;color:#fff;position:relative;overflow:hidden">
      <div style="position:absolute;right:-18px;top:-18px;width:90px;height:90px;background:rgba(255,255,255,.12);border-radius:50%"></div>
      <div style="position:absolute;right:22px;top:28px;width:52px;height:52px;background:rgba(255,255,255,.08);border-radius:50%"></div>
      <div style="font-size:26px;margin-bottom:4px;position:relative">${icon}</div>
      <div style="font-size:10px;font-weight:800;letter-spacing:.8px;opacity:.85;text-transform:uppercase">${label}</div>
      <div style="font-size:44px;font-weight:900;line-height:1.05;margin:6px 0 2px;position:relative">${num}</div>
      <div style="font-size:11px;opacity:.75">${desc}</div>
      <div style="border-top:1px solid rgba(255,255,255,.2);margin:12px 0 10px"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${stats}</div>
    </div>`;

  document.getElementById('pf-kpis').innerHTML =
    card(
      'linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%)',
      '📋', 'SEPARAÇÃO', pfFmtN(totPed), 'pedidos concluídos',
      mini('COLABORADORES', nColab) +
      mini('ITENS/PED', itensPed) +
      mini('TOTAL ITENS', pfFmtN(totItens)) +
      mini('TOTAL SKUs', pfFmtN(totSkus))
    ) +
    card(
      'linear-gradient(135deg,#0891b2 0%,#0d9488 100%)',
      '📦', 'ITENS', pfFmtN(totItens), 'itens separados',
      mini('TOTAL SKUs', pfFmtN(totSkus)) +
      mini('SKUs/PED', skusPed) +
      mini('MAIS ITENS', liderPed ? (liderPed.nome||'?').split(' ')[0] : '—') +
      mini('MÉDIA/DIA', _pfDados?.por_dia?.length ? pfFmtN(Math.round(totItens / _pfDados.por_dia.length)) : '—')
    ) +
    card(
      'linear-gradient(135deg,#ea580c 0%,#f59e0b 100%)',
      '🔁', 'REPOSIÇÃO', pfFmtN(totRep), 'reposições geradas',
      mini('% DOS PEDIDOS', repPct + '%') +
      mini('PEDIDOS SEM REP.', pfFmtN(totPed - Math.min(totRep, totPed))) +
      mini('MAIS REPOS.', liderRep?.reposicoes ? (liderRep.nome||'?').split(' ')[0] : '—') +
      mini('MÉD/COLAB', nColab > 0 ? (totRep / nColab).toFixed(1) : '0')
    ) +
    card(
      'linear-gradient(135deg,#7c3aed 0%,#a855f7 100%)',
      '⏱️', 'TEMPO MÉDIO', tempoMed != null ? tempoMed.toFixed(1)+' min' : '—', 'por pedido (separação)',
      mini('MAIS RÁPIDO', tempoMin ? (tempoMin.nome||'?').split(' ')[0]+' ('+tempoMin.t.toFixed(1)+'m)' : '—') +
      mini('MAIS LENTO', tempoMax ? (tempoMax.nome||'?').split(' ')[0]+' ('+tempoMax.t.toFixed(1)+'m)' : '—') +
      mini('COM TEMPO', pfFmtN(nComTempo)) +
      mini('SEM TEMPO', pfFmtN(nColab - nComTempo))
    );
}

// ── Charts ─────────────────────────────────────────────────────────────────
function pfRenderChartPedidos(colab) {
  pfDestroyChart('pedidos');
  const colors = colab.map(c => pfCor(c.turno));
  _pfCharts['pedidos'] = new Chart(document.getElementById('pf-chart-pedidos'), {
    type: 'bar',
    data: {
      labels: colab.map(c => c.nome),
      datasets: [{ data: colab.map(c => c.pedidos),
        backgroundColor: colors.map(c => c+'99'), borderColor: colors, borderWidth:1.5, borderRadius:6 }]
    },
    options: pfChartOpts({
      plugins: { legend:{display:false}, tooltip:{ callbacks:{
        label: c => ` ${pfFmtN(c.parsed.y)} pedidos`,
        afterLabel: c => PF_LABEL_TURNO[colab[c.dataIndex].turno] || colab[c.dataIndex].turno
      }}},
      scales: { x:{ ticks:{...PF_TICK,maxRotation:40}, grid:PF_GRID }, y:{ ticks:PF_TICK, grid:PF_GRID } }
    })
  });
}

function pfRenderChartHoriz(id, colab, key, label) {
  pfDestroyChart(id);
  const colors = colab.map(c => pfCor(c.turno));
  _pfCharts[id] = new Chart(document.getElementById(`pf-chart-${id}`), {
    type: 'bar',
    data: {
      labels: colab.map(c => c.nome),
      datasets: [{ data: colab.map(c => c[key]||0),
        backgroundColor: colors.map(c => c+'99'), borderColor: colors, borderWidth:1.5, borderRadius:5 }]
    },
    options: pfChartOpts({
      indexAxis: 'y',
      plugins: { legend:{display:false}, tooltip:{ callbacks:{ label:c => ` ${pfFmtN(c.parsed.x)} ${label}` }}},
      scales: { x:{ ticks:PF_TICK, grid:PF_GRID }, y:{ ticks:{...PF_TICK,font:{size:11}}, grid:PF_GRID } }
    })
  });
}

function pfRenderChartTempo(colab) {
  pfDestroyChart('tempo');
  const sorted = [...colab].filter(c => c.tempo_medio_min != null)
                           .sort((a,b) => b.tempo_medio_min - a.tempo_medio_min);
  if (!sorted.length) return;
  const colors = sorted.map(c => pfCor(c.turno));
  _pfCharts['tempo'] = new Chart(document.getElementById('pf-chart-tempo'), {
    type: 'bar',
    data: {
      labels: sorted.map(c => c.nome),
      datasets: [{ data: sorted.map(c => c.tempo_medio_min),
        backgroundColor: colors.map(c => c+'99'), borderColor: colors, borderWidth:1.5, borderRadius:5 }]
    },
    options: pfChartOpts({
      indexAxis: 'y',
      plugins: { legend:{display:false}, tooltip:{ callbacks:{ label:c => ` ${c.parsed.x.toFixed(1)} min/pedido` }}},
      scales: { x:{ ticks:{...PF_TICK, callback:v=>`${v}min`}, grid:PF_GRID }, y:{ ticks:{...PF_TICK,font:{size:11}}, grid:PF_GRID } }
    })
  });
}

function pfRenderChartDia(porDia) {
  pfDestroyChart('dia');
  if (!porDia?.length) return;
  const labels = porDia.map(r => { const [y,m,d]=r.data.split('-'); return `${d}/${m}`; });
  _pfCharts['dia'] = new Chart(document.getElementById('pf-chart-dia'), {
    type: 'line',
    data: {
      labels,
      datasets: [{ data: porDia.map(r => r.pedidos),
        borderColor:'#38bdf8', backgroundColor:'rgba(56,189,248,.1)',
        borderWidth:2, pointBackgroundColor:'#38bdf8', pointRadius:4, fill:true, tension:.3 }]
    },
    options: pfChartOpts({
      plugins: { legend:{display:false}, tooltip:{ callbacks:{ label:c=>` ${pfFmtN(c.parsed.y)} pedidos` }}},
      scales: { x:{ ticks:PF_TICK, grid:PF_GRID }, y:{ ticks:PF_TICK, grid:PF_GRID } }
    })
  });
}

// ── Ranking ────────────────────────────────────────────────────────────────
function pfRenderTabela(colab, totPed) {
  document.getElementById('pf-table-count').textContent = `${colab.length} colaboradores`;
  const ICONS = ['🥇','🥈','🥉'];
  const T_BG  = { Manha:'rgba(56,189,248,.12)', Tarde:'rgba(245,158,11,.12)', Noite:'rgba(167,139,250,.12)' };
  const T_TXT = { Manha:'#38bdf8', Tarde:'#f59e0b', Noite:'#a78bfa' };
  const maxPed = colab[0]?.pedidos || 1;

  document.getElementById('pf-tbody').innerHTML = colab.map((c,i) => {
    const ipd  = c.pedidos > 0 ? (c.itens/c.pedidos).toFixed(1) : '—';
    const cor  = pfCor(c.turno);
    return `<tr style="border-bottom:1px solid rgba(51,65,85,.4)">
      <td style="padding:10px 12px;text-align:center;font-size:14px">${ICONS[i]||`<span style="font-size:10px;color:var(--text3);font-weight:700">${i+1}</span>`}</td>
      <td style="padding:10px 14px">
        <div style="font-weight:700;color:var(--text);font-size:13px">${pfEsc(c.nome)}</div>
        <div style="background:var(--surface2);border-radius:3px;height:4px;margin-top:5px;overflow:hidden">
          <div style="height:100%;width:${(c.pedidos/maxPed*100).toFixed(1)}%;background:${cor};border-radius:3px"></div>
        </div>
      </td>
      <td style="padding:10px 12px;text-align:center">
        <span style="background:${T_BG[c.turno]||'rgba(99,102,241,.12)'};color:${T_TXT[c.turno]||'#6366f1'};border-radius:20px;padding:2px 10px;font-size:10px;font-weight:800">
          ${PF_LABEL_TURNO[c.turno]||c.turno}
        </span>
      </td>
      <td style="padding:10px 14px;text-align:right;font-weight:700;color:#38bdf8;font-size:13px">${pfFmtN(c.pedidos)}</td>
      <td style="padding:10px 14px;text-align:right;font-weight:600;font-size:13px">${pfFmtN(c.itens)}</td>
      <td style="padding:10px 14px;text-align:right;font-size:12px;color:#f59e0b">${pfFmtN(c.skus)}</td>
      <td style="padding:10px 14px;text-align:right;font-size:12px;color:#ef4444">${pfFmtN(c.reposicoes)}</td>
      <td style="padding:10px 14px;text-align:right;font-size:12px;color:var(--text3)">${ipd}</td>
      <td style="padding:10px 14px;text-align:right;font-size:12px;color:#a78bfa">${c.tempo_medio_min!=null?c.tempo_medio_min.toFixed(1)+' min':'—'}</td>
    </tr>`;
  }).join('');
}

// ── Tempos Detalhados por Pedido ───────────────────────────────────────────
let _pfTiming     = null;
let _pfTimingAba  = 'separacao';

async function pfCarregarTiming() {
  const ini   = document.getElementById('pf-ini')?.value   || '';
  const fim   = document.getElementById('pf-fim')?.value   || '';
  const turno = document.getElementById('pf-turno')?.value || '';
  const wrap  = document.getElementById('pf-timing-wrap');
  const btn   = document.getElementById('pf-btn-timing');
  if (!wrap || !ini || !fim) return;

  btn.disabled = true;
  btn.textContent = '⏳ Carregando...';
  wrap.style.display = '';
  wrap.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text3)">⏳ Buscando dados...</div>`;

  const qs = new URLSearchParams({ ini, fim });
  if (turno) qs.set('turno', turno);
  qs.set('_', Date.now());

  const dados = await apiFetch(`/performance/timing?${qs}`);
  btn.disabled = false;
  btn.textContent = '🔄 Atualizar';

  if (!dados || dados.erro) {
    wrap.innerHTML = `<div style="padding:16px;color:#ef4444">${pfEsc(dados?.erro || 'Erro ao carregar')}</div>`;
    return;
  }
  _pfTiming = dados;
  pfRenderTiming();
}

function pfRenderTiming() {
  const wrap = document.getElementById('pf-timing-wrap');
  if (!wrap || !_pfTiming) return;

  const abas = [
    { id:'separacao', label:'✂️ Separação',  cor:'#6366f1' },
    { id:'reposicao', label:'🔁 Reposição',   cor:'#f59e0b' },
    { id:'checkout',  label:'📦 Checkout',    cor:'#0891b2' },
    { id:'embalagem', label:'🎁 Embalagem',   cor:'#16a34a' },
  ];

  const abaHtml = abas.map(a => `
    <button onclick="pfSwitchAba('${a.id}')" id="pf-aba-${a.id}"
      style="padding:8px 16px;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;transition:all .15s;
             background:${_pfTimingAba===a.id ? a.cor : 'var(--surface2)'};
             color:${_pfTimingAba===a.id ? '#fff' : 'var(--text3)'}">
      ${a.label} <span style="opacity:.75;font-weight:400">(${(_pfTiming[a.id]||[]).length})</span>
    </button>`).join('');

  const dados = _pfTiming[_pfTimingAba] || [];
  const abaAtual = abas.find(a => a.id === _pfTimingAba);

  // Agrupar por colaborador
  const grupos = {};
  dados.forEach(r => {
    const nome = r.colaborador || '—';
    if (!grupos[nome]) grupos[nome] = [];
    grupos[nome].push(r);
  });

  const fmtHora = (v) => {
    if (!v) return '—';
    // ISO timestamp: pega só HH:MM
    if (v.includes('T')) return v.slice(11, 16);
    // HH:MM ou HH:MM:SS
    return v.slice(0, 5);
  };

  const fmtDur = (min) => {
    if (min == null) return '—';
    if (min < 1) return `${Math.round(min * 60)}s`;
    return `${min.toFixed(1)} min`;
  };

  const corDur = (min) => {
    if (min == null) return 'var(--text3)';
    if (min <= 5)  return '#22c55e';
    if (min <= 15) return '#f59e0b';
    return '#ef4444';
  };

  let tabelasHtml = '';
  if (!Object.keys(grupos).length) {
    tabelasHtml = `<div style="padding:32px;text-align:center;color:var(--text3);font-size:13px">
      Nenhum dado encontrado para o período selecionado.
    </div>`;
  } else {
    Object.entries(grupos).sort(([a],[b]) => a.localeCompare(b)).forEach(([nome, rows]) => {
      const totalCom = rows.filter(r => r.duracao_min != null).length;
      const mediaMin = totalCom ? rows.reduce((s,r) => s + (r.duracao_min||0), 0) / totalCom : null;

      let headerExtra = '';
      if (_pfTimingAba === 'reposicao') {
        const enc    = rows.filter(r => r.resultado === 'encontrado' || r.resultado === 'buscado' || r.resultado === 'abastecido').length;
        const naoEnc = rows.filter(r => r.resultado === 'nao_encontrado' || r.resultado === 'protocolo').length;
        headerExtra = `· <span style="color:#22c55e">${enc} encontrado(s)</span> · <span style="color:#ef4444">${naoEnc} não encontrado(s)</span>`;
      }

      const linhas = rows.map(r => {
        let extra = '';
        if (_pfTimingAba === 'reposicao') {
          const resMap = { encontrado:'✅', buscado:'✅', abastecido:'✅', nao_encontrado:'❌', protocolo:'📋' };
          const resIcon = resMap[r.resultado] || '?';
          extra = `<td style="padding:7px 12px;text-align:center;font-size:13px" title="${pfEsc(r.resultado||'')}">${resIcon}</td>
                   <td style="padding:7px 12px;font-size:11px;color:var(--text3);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${pfEsc(r.descricao||'')}">
                     <div style="font-size:10px;color:var(--text3)">${pfEsc(r.codigo||'')}</div>
                     ${pfEsc((r.descricao||'').slice(0,40))}
                   </td>`;
        }

        const dataFmt = r.data ? (() => { const [y,m,d]=r.data.split('-'); return `${d}/${m}`; })() : '';

        return `<tr style="border-bottom:1px solid rgba(51,65,85,.2)">
          <td style="padding:7px 12px;font-size:12px;font-weight:600;color:var(--text)">${pfEsc(r.numero_pedido||'—')}</td>
          <td style="padding:7px 12px;font-size:11px;color:var(--text3)">${dataFmt}</td>
          <td style="padding:7px 12px;font-size:12px;color:var(--text)">${fmtHora(r.iniciado_em)}</td>
          <td style="padding:7px 12px;font-size:12px;color:var(--text)">${fmtHora(r.concluido_em)}</td>
          ${extra}
          <td style="padding:7px 12px;text-align:right;font-size:12px;font-weight:700;color:${corDur(r.duracao_min)}">${fmtDur(r.duracao_min)}</td>
        </tr>`;
      }).join('');

      const TH = 'padding:7px 12px;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px;';
      const extraTh = _pfTimingAba === 'reposicao'
        ? `<th style="${TH}text-align:center">RESULTADO</th><th style="${TH}">ITEM</th>`
        : '';
      tabelasHtml += `
        <div style="margin-bottom:20px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap">
            <div style="font-size:13px;font-weight:800;color:var(--text)">${pfEsc(nome)}</div>
            <div style="font-size:11px;color:var(--text3)">${rows.length} registro(s) ${headerExtra}</div>
            ${mediaMin!=null ? `<div style="margin-left:auto;font-size:12px;font-weight:700;color:${corDur(mediaMin)}">⌀ ${fmtDur(mediaMin)}</div>` : ''}
          </div>
          <div style="overflow-x:auto;border-radius:8px;border:1px solid var(--border)">
            <table style="width:100%;border-collapse:collapse">
              <thead style="background:var(--surface2)">
                <tr>
                  <th style="${TH}text-align:left">PEDIDO</th>
                  <th style="${TH}">DATA</th>
                  <th style="${TH}">INÍCIO</th>
                  <th style="${TH}">FIM</th>
                  ${extraTh}
                  <th style="${TH}text-align:right">DURAÇÃO</th>
                </tr>
              </thead>
              <tbody>${linhas}</tbody>
            </table>
          </div>
        </div>`;
    });
  }

  wrap.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">${abaHtml}</div>
    <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.5px;margin-bottom:14px;text-transform:uppercase">
      ${abaAtual?.label || ''} — ${dados.length} registro(s) no período
      ${_pfTimingAba==='separacao' ? ' · ⚠️ Tempo sem contar espera por reposição' : ''}
    </div>
    ${tabelasHtml}`;
}

function pfSwitchAba(id) {
  _pfTimingAba = id;
  pfRenderTiming();
}

// ── Exportar Excel ─────────────────────────────────────────────────────────
function pfExportarExcel() {
  const colab = _pfFiltrados?.length ? _pfFiltrados : _pfDados?.colaboradores;
  if (!colab?.length) { pfToast('Sem dados para exportar.','aviso'); return; }

  const ini = document.getElementById('pf-ini')?.value || '';
  const fim = document.getElementById('pf-fim')?.value || '';

  const abaResumo = [
    ['#','Colaborador','Turno','Pedidos','Itens','SKUs','Reposições','Itens/Ped','Tempo Médio (min)'],
    ...colab.map((c,i) => [
      i+1, c.nome,
      c.turno === 'Manha' ? 'Manhã' : c.turno,
      c.pedidos, c.itens, c.skus, c.reposicoes,
      c.pedidos > 0 ? parseFloat((c.itens/c.pedidos).toFixed(1)) : 0,
      c.tempo_medio_min != null ? parseFloat(c.tempo_medio_min.toFixed(1)) : '',
    ])
  ];

  const abaDia = [
    ['Data','Pedidos','Itens'],
    ...(_pfDados?.por_dia||[]).map(r => {
      const [y,m,d] = r.data.split('-');
      return [`${d}/${m}/${y}`, r.pedidos, r.itens];
    })
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abaResumo), 'Resumo');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abaDia),    'Por Dia');

  const nome = `performance-separadores_${(ini||'').replace(/-/g,'')}${fim?'-'+(fim||'').replace(/-/g,''):''}.xlsx`;
  XLSX.writeFile(wb, nome);
  pfToast('✅ Excel exportado!','sucesso');
}
