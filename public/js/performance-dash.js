/* ══ WMS — Performance dos Separadores ══
   Versão 1 — dashboard visual com filtro de período
   Pedidos, itens, SKUs, reposições, tempo médio por colaborador.
══════════════════════════════════════════════════════════════════════ */
'use strict';

// ── Estado ────────────────────────────────────────────────────────────────
let _pfDados       = null;
const _pfCharts    = {};
let _pfCarregando  = false;

// ── Helpers ───────────────────────────────────────────────────────────────
const pfFmtN = n  => Number(n||0).toLocaleString('pt-BR');
const pfFmtT = n  => n != null ? `${Number(n).toFixed(1)} min` : '—';
const pfToast = (m, t) => typeof toast === 'function' ? toast(m, t) : console.log(m);

function pfFmtBR(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function pfDestroyChart(id) {
  if (_pfCharts[id]) { _pfCharts[id].destroy(); delete _pfCharts[id]; }
}
function pfEsc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const PF_COR_TURNO = { Manha:'#38bdf8', Tarde:'#f59e0b', Noite:'#a78bfa' };
const PF_LABEL_TURNO = { Manha:'☀️ Manhã', Tarde:'🌅 Tarde', Noite:'🌙 Noite' };
const PF_GRID = { color:'rgba(51,65,85,.25)' };
const PF_TICK = { color:'#64748b', font:{ size:10 } };

function pfCor(turno) { return PF_COR_TURNO[turno] || '#6366f1'; }

function pfChartOpts(extra = {}) {
  return Object.assign({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    animation: { duration: 250 }
  }, extra);
}

// ── Renderiza a página ─────────────────────────────────────────────────────
function renderizarPerformanceDash() {
  const pag = document.getElementById('pag-performance');
  if (!pag) return;

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

      <!-- KPI CARDS -->
      <div id="pf-kpis" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:20px"></div>

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
          <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:14px">🔁 REPOSIÇÕES GERADAS POR COLABORADOR</div>
          <div style="position:relative;height:260px"><canvas id="pf-chart-repos"></canvas></div>
        </div>
        <div class="card" style="padding:16px 18px">
          <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:14px">⏱️ TEMPO MÉDIO POR PEDIDO (min)</div>
          <div style="position:relative;height:260px"><canvas id="pf-chart-tempo"></canvas></div>
        </div>
      </div>

      <!-- Evolução diária -->
      <div class="card" style="padding:16px 18px;margin-bottom:20px">
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

    </div><!-- /pf-conteudo -->
  </div>`;

  // CSS responsivo
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
  // Tenta carregar o range disponível para pré-preencher datas
  const iniEl = document.getElementById('pf-ini');
  const fimEl = document.getElementById('pf-fim');
  const turnoEl = document.getElementById('pf-turno');
  if (!iniEl) return;

  if (!iniEl.value || !fimEl.value) {
    document.getElementById('pf-loading').style.display = '';
    const range = await apiFetch('/performance/range');
    document.getElementById('pf-loading').style.display = 'none';

    if (range && !range.erro && range.ini) {
      // Usa os últimos 7 dias disponíveis por padrão
      const fim = range.fim;
      const dt  = new Date(range.fim + 'T12:00:00');
      dt.setDate(dt.getDate() - 6);
      const ini = dt.toISOString().slice(0,10);
      iniEl.value = ini < range.ini ? range.ini : ini;
      fimEl.value = fim;
    } else {
      // Sem dados — usa semana atual
      const hoje = new Date();
      fimEl.value = hoje.toISOString().slice(0,10);
      hoje.setDate(hoje.getDate() - 6);
      iniEl.value = hoje.toISOString().slice(0,10);
    }
  }
  if (turnoEl) turnoEl.value = '';
  await pfBuscarDados();
}

// ── Busca e renderiza ──────────────────────────────────────────────────────
async function pfBuscarDados() {
  if (_pfCarregando) return;
  _pfCarregando = true;

  const ini   = document.getElementById('pf-ini')?.value  || '';
  const fim   = document.getElementById('pf-fim')?.value  || '';
  const turno = document.getElementById('pf-turno')?.value|| '';

  document.getElementById('pf-loading').style.display  = '';
  document.getElementById('pf-conteudo').style.display = 'none';
  document.getElementById('pf-vazio').style.display    = 'none';

  const qs = new URLSearchParams({ ini, fim });
  if (turno) qs.set('turno', turno);

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
  document.getElementById('pf-conteudo').style.display = '';

  const inf = document.getElementById('pf-filtro-info');
  if (inf) inf.textContent = `${dados.colaboradores.length} colaboradores · ${pfFmtBR(ini)} a ${pfFmtBR(fim)}`;

  pfRenderizarDados(dados);
}

// ── Render principal ───────────────────────────────────────────────────────
function pfRenderizarDados({ colaboradores, por_dia }) {
  // Totais
  let totPed = 0, totItens = 0, totSkus = 0, totRep = 0;
  const tempos = [];
  colaboradores.forEach(c => {
    totPed   += c.pedidos   || 0;
    totItens += c.itens     || 0;
    totSkus  += c.skus      || 0;
    totRep   += c.reposicoes|| 0;
    if (c.tempo_medio_min != null) tempos.push(c.tempo_medio_min);
  });
  const tempoMed = tempos.length ? tempos.reduce((a,b) => a+b, 0) / tempos.length : null;

  pfRenderKPIs(totPed, totItens, totSkus, totRep, tempoMed, colaboradores.length);
  pfRenderChartPedidos(colaboradores);
  pfRenderChartItens(colaboradores);
  pfRenderChartSkus(colaboradores);
  pfRenderChartRepos(colaboradores);
  pfRenderChartTempo(colaboradores);
  pfRenderChartDia(por_dia || []);
  pfRenderTabela(colaboradores, totPed);
}

// ── KPIs ───────────────────────────────────────────────────────────────────
function pfRenderKPIs(ped, itens, skus, rep, tempo, nColab) {
  const COR = { green:'#22c55e', blue:'#38bdf8', amber:'#f59e0b', purple:'#a78bfa', red:'#ef4444', teal:'#2dd4bf' };
  const itensPed = ped > 0 ? itens / ped : 0;
  document.getElementById('pf-kpis').innerHTML = [
    ['blue',   '📋 Total de Pedidos',     pfFmtN(ped),              `${nColab} colaboradores`],
    ['green',  '📦 Total de Itens',       pfFmtN(itens),            `${itensPed.toFixed(1)} itens/ped`],
    ['amber',  '🏷️ Total de SKUs',         pfFmtN(skus),             `${ped > 0 ? (skus/ped).toFixed(1) : 0} SKUs/ped`],
    ['red',    '🔁 Total Reposições',     pfFmtN(rep),              `${ped > 0 ? (rep/ped*100).toFixed(1) : 0}% dos pedidos`],
    ['purple', '⏱️ Tempo Médio/Ped',      tempo != null ? `${tempo.toFixed(1)} min` : '—', 'separação real'],
    ['teal',   '👥 Colaboradores',        pfFmtN(nColab),           'no período'],
  ].map(([cor,lb,val,sub]) => `
    <div class="card" style="padding:14px 16px;border-top:3px solid ${COR[cor]};overflow:hidden">
      <div style="font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:5px">${lb}</div>
      <div style="font-size:20px;font-weight:900;color:var(--text);line-height:1.1">${val}</div>
      <div style="font-size:10px;color:var(--text3);margin-top:3px">${sub}</div>
    </div>`).join('');
}

// ── Charts ─────────────────────────────────────────────────────────────────
function pfRenderChartPedidos(colab) {
  pfDestroyChart('pedidos');
  const colors = colab.map(c => pfCor(c.turno));
  _pfCharts['pedidos'] = new Chart(document.getElementById('pf-chart-pedidos'), {
    type: 'bar',
    data: {
      labels: colab.map(c => c.nome),
      datasets: [{
        data: colab.map(c => c.pedidos),
        backgroundColor: colors.map(c => c + '99'),
        borderColor: colors, borderWidth: 1.5, borderRadius: 6
      }]
    },
    options: pfChartOpts({
      plugins: { legend: { display: false }, tooltip: { callbacks: {
        label: c => ` ${pfFmtN(c.parsed.y)} pedidos`,
        afterLabel: c => `${PF_LABEL_TURNO[colab[c.dataIndex].turno] || colab[c.dataIndex].turno}`
      }}},
      scales: {
        x: { ticks: { ...PF_TICK, maxRotation: 40 }, grid: PF_GRID },
        y: { ticks: { ...PF_TICK }, grid: PF_GRID }
      }
    })
  });
}

function pfRenderChartHoriz(id, colab, key, label, color) {
  pfDestroyChart(id);
  const colors = colab.map(c => pfCor(c.turno));
  _pfCharts[id] = new Chart(document.getElementById(`pf-chart-${id}`), {
    type: 'bar',
    data: {
      labels: colab.map(c => c.nome),
      datasets: [{
        data: colab.map(c => c[key] || 0),
        backgroundColor: colors.map(c => c + '99'),
        borderColor: colors, borderWidth: 1.5, borderRadius: 5
      }]
    },
    options: pfChartOpts({
      indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: { callbacks: {
        label: c => ` ${pfFmtN(c.parsed.x)} ${label}`
      }}},
      scales: {
        x: { ticks: PF_TICK, grid: PF_GRID },
        y: { ticks: { ...PF_TICK, font: { size: 11 } }, grid: PF_GRID }
      }
    })
  });
}

function pfRenderChartItens(c)  { pfRenderChartHoriz('itens',  c, 'itens',      'itens',      '#22c55e'); }
function pfRenderChartSkus(c)   { pfRenderChartHoriz('skus',   c, 'skus',       'SKUs',       '#f59e0b'); }
function pfRenderChartRepos(c)  { pfRenderChartHoriz('repos',  c, 'reposicoes', 'reposições', '#ef4444'); }

function pfRenderChartTempo(colab) {
  pfDestroyChart('tempo');
  // Ordena por tempo médio decrescente (mais rápido primeiro na exibição)
  const sorted = [...colab].filter(c => c.tempo_medio_min != null)
                           .sort((a,b) => b.tempo_medio_min - a.tempo_medio_min);
  const colors = sorted.map(c => pfCor(c.turno));
  _pfCharts['tempo'] = new Chart(document.getElementById('pf-chart-tempo'), {
    type: 'bar',
    data: {
      labels: sorted.map(c => c.nome),
      datasets: [{
        data: sorted.map(c => c.tempo_medio_min),
        backgroundColor: colors.map(c => c + '99'),
        borderColor: colors, borderWidth: 1.5, borderRadius: 5
      }]
    },
    options: pfChartOpts({
      indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: { callbacks: {
        label: c => ` ${c.parsed.x.toFixed(1)} min/pedido`
      }}},
      scales: {
        x: { ticks: { ...PF_TICK, callback: v => `${v}min` }, grid: PF_GRID },
        y: { ticks: { ...PF_TICK, font: { size: 11 } }, grid: PF_GRID }
      }
    })
  });
}

function pfRenderChartDia(porDia) {
  pfDestroyChart('dia');
  const labels = porDia.map(r => { const [y,m,d] = r.data.split('-'); return `${d}/${m}`; });
  _pfCharts['dia'] = new Chart(document.getElementById('pf-chart-dia'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: porDia.map(r => r.pedidos),
        borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,.1)',
        borderWidth: 2, pointBackgroundColor: '#38bdf8', pointRadius: 4,
        fill: true, tension: .3
      }]
    },
    options: pfChartOpts({
      plugins: { legend: { display: false }, tooltip: { callbacks: {
        label: c => ` ${pfFmtN(c.parsed.y)} pedidos`
      }}},
      scales: {
        x: { ticks: PF_TICK, grid: PF_GRID },
        y: { ticks: PF_TICK, grid: PF_GRID }
      }
    })
  });
}

// ── Tabela ranking ─────────────────────────────────────────────────────────
function pfRenderTabela(colab, totPed) {
  document.getElementById('pf-table-count').textContent = `${colab.length} colaboradores`;
  const ICONS = ['🥇','🥈','🥉'];
  const T_BG  = { Manha:'rgba(56,189,248,.12)', Tarde:'rgba(245,158,11,.12)', Noite:'rgba(167,139,250,.12)' };
  const T_TXT = { Manha:'#38bdf8', Tarde:'#f59e0b', Noite:'#a78bfa' };
  const maxPed = colab[0]?.pedidos || 1;

  document.getElementById('pf-tbody').innerHTML = colab.map((c, i) => {
    const pct     = totPed > 0 ? (c.pedidos / totPed * 100).toFixed(1) : '0.0';
    const ipd     = c.pedidos > 0 ? (c.itens / c.pedidos).toFixed(1) : '—';
    const cor     = pfCor(c.turno);
    const tBG     = T_BG[c.turno]  || 'rgba(99,102,241,.12)';
    const tTXT    = T_TXT[c.turno] || '#6366f1';
    const tlbl    = PF_LABEL_TURNO[c.turno] || c.turno;
    return `<tr style="border-bottom:1px solid rgba(51,65,85,.4)">
      <td style="padding:10px 12px;text-align:center;font-size:14px">${ICONS[i] || `<span style="font-size:10px;color:var(--text3);font-weight:700">${i+1}</span>`}</td>
      <td style="padding:10px 14px">
        <div style="font-weight:700;color:var(--text);font-size:13px">${pfEsc(c.nome)}</div>
        <div style="background:var(--surface2);border-radius:3px;height:4px;margin-top:5px;overflow:hidden">
          <div style="height:100%;width:${(c.pedidos/maxPed*100).toFixed(1)}%;background:${cor};border-radius:3px"></div>
        </div>
      </td>
      <td style="padding:10px 12px;text-align:center">
        <span style="background:${tBG};color:${tTXT};border-radius:20px;padding:2px 10px;font-size:10px;font-weight:800">${tlbl}</span>
      </td>
      <td style="padding:10px 14px;text-align:right;font-weight:700;color:#38bdf8;font-size:13px">${pfFmtN(c.pedidos)}</td>
      <td style="padding:10px 14px;text-align:right;font-weight:600;font-size:13px">${pfFmtN(c.itens)}</td>
      <td style="padding:10px 14px;text-align:right;font-size:12px;color:#f59e0b">${pfFmtN(c.skus)}</td>
      <td style="padding:10px 14px;text-align:right;font-size:12px;color:#ef4444">${pfFmtN(c.reposicoes)}</td>
      <td style="padding:10px 14px;text-align:right;font-size:12px;color:var(--text3)">${ipd}</td>
      <td style="padding:10px 14px;text-align:right;font-size:12px;color:#a78bfa">${c.tempo_medio_min != null ? c.tempo_medio_min.toFixed(1)+' min' : '—'}</td>
    </tr>`;
  }).join('');
}

// ── Exportar Excel ─────────────────────────────────────────────────────────
function pfExportarExcel() {
  if (!_pfDados?.colaboradores?.length) { pfToast('Sem dados para exportar.', 'aviso'); return; }

  const { colaboradores, por_dia } = _pfDados;
  const ini = document.getElementById('pf-ini')?.value || '';
  const fim = document.getElementById('pf-fim')?.value || '';

  // ── Aba 1: Resumo por colaborador ────────────────────────────────────────
  const abaResumo = [
    ['#', 'Colaborador', 'Turno', 'Pedidos', 'Itens', 'SKUs', 'Reposições', 'Itens/Ped', 'Tempo Médio (min)'],
    ...colaboradores.map((c, i) => [
      i + 1,
      c.nome,
      c.turno === 'Manha' ? 'Manhã' : c.turno,
      c.pedidos,
      c.itens,
      c.skus,
      c.reposicoes,
      c.pedidos > 0 ? parseFloat((c.itens / c.pedidos).toFixed(1)) : 0,
      c.tempo_medio_min != null ? parseFloat(c.tempo_medio_min.toFixed(1)) : '',
    ])
  ];

  // ── Aba 2: Por dia ────────────────────────────────────────────────────────
  const abaDia = [
    ['Data', 'Pedidos', 'Itens'],
    ...(por_dia || []).map(r => {
      const [y,m,d] = r.data.split('-');
      return [`${d}/${m}/${y}`, r.pedidos, r.itens];
    })
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abaResumo), 'Resumo');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abaDia),    'Por Dia');

  const iniStr = (ini||'').replace(/-/g,'');
  const fimStr = (fim||'').replace(/-/g,'');
  const nome   = `performance-separadores_${iniStr}${fimStr ? '-'+fimStr : ''}.xlsx`;
  XLSX.writeFile(wb, nome);
  pfToast('✅ Excel exportado!', 'sucesso');
}
