/* ══ WMS — Dash Logística (Provisório) ══
   Upload de planilha de pedidos faturados → KPIs + Gráficos + Ranking
   Filtra apenas Usuário Faturado com 1, 2 ou 3 na frente
══════════════════════════════════════════════════════════════════════ */
'use strict';

// ── Estado ────────────────────────────────────────────────────────────────
let _dlBrutos    = [];   // todos os dados (filtro 1/2/3 já aplicado)
let _dlSheet2    = [];   // aba Itens
let _dlFiltrados = [];
const _dlCharts  = {};

// ── Helpers ───────────────────────────────────────────────────────────────
const dlFmt  = n => Number(n||0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
const dlFmtN = n => Number(n||0).toLocaleString('pt-BR');
const dlToast = (m, t) => typeof toast === 'function' ? toast(m, t) : console.log(m);

function dlParseData(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? new Date(+m[3], +m[2]-1, +m[1]) : null;
}
function dlToInput(d) {
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function dlInputToDate(s) {
  if (!s) return null;
  const [y,m,d] = s.split('-');
  return new Date(+y, +m-1, +d);
}
function dlTurno(u)   { const m = String(u||'').match(/^([123])/); return m ? m[1] : '?'; }
function dlNome(u)    { return String(u||'').replace(/^[123]\s*/,'').trim() || u; }
function dlFindCol(row, ...aliases) {
  const keys = Object.keys(row);
  for (const a of aliases) {
    const f = keys.find(k => k.trim().toLowerCase().includes(a.toLowerCase()));
    if (f) return f;
  }
  return null;
}
function dlDestroyChart(id) {
  if (_dlCharts[id]) { _dlCharts[id].destroy(); delete _dlCharts[id]; }
}

const DL_COR_TURNO = { '1':'#38bdf8', '2':'#a78bfa', '3':'#2dd4bf' };

// ── Renderiza a página ─────────────────────────────────────────────────────
function renderizarDashLogistica() {
  const pag = document.getElementById('pag-dash-logistica');
  if (!pag) return;

  pag.innerHTML = `
  <div style="padding:0 0 40px">

    <div class="pg-title" style="margin-bottom:18px">
      📊 Dash Logística
      <span style="font-size:10px;font-weight:700;background:#f59e0b22;color:#f59e0b;border:1px solid #78350f;border-radius:20px;padding:2px 10px;margin-left:8px;vertical-align:middle">PROVISÓRIO</span>
    </div>

    <!-- UPLOAD -->
    <div id="dl-upload-zona" class="card" style="padding:0;margin-bottom:18px">
      <div id="dl-drop" style="padding:36px 24px;text-align:center;cursor:pointer;border-radius:var(--r);transition:background .2s"
           onclick="document.getElementById('dl-input').click()"
           ondragover="event.preventDefault();this.style.background='rgba(99,102,241,.08)'"
           ondragleave="this.style.background=''"
           ondrop="dlHandleDrop(event)">
        <div style="font-size:36px;margin-bottom:10px">📂</div>
        <div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:6px">Clique ou arraste a planilha aqui</div>
        <div style="font-size:11px;color:var(--text3)">Suporte: <b>.xlsx · .xls</b> &nbsp;·&nbsp; Abas: <b>Pedidos-turno</b> e <b>Itens</b></div>
        <div style="display:inline-block;margin-top:12px;background:var(--accent);color:#fff;border-radius:8px;padding:8px 20px;font-size:12px;font-weight:700">Selecionar arquivo</div>
        <input type="file" id="dl-input" accept=".xlsx,.xls" style="display:none" onchange="dlProcessarArquivo(this.files[0])">
      </div>
    </div>

    <!-- ARQUIVO CARREGADO -->
    <div id="dl-file-info" style="display:none;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.25);border-radius:8px;padding:10px 16px;margin-bottom:16px;display:none;align-items:center;gap:10px;font-size:12px;color:var(--green)">
      <span>✅</span>
      <span style="font-weight:700" id="dl-file-nome"></span>
      <span style="margin-left:auto;color:var(--text3)" id="dl-file-rows"></span>
      <button onclick="dlResetarArquivo()" style="background:none;border:1px solid var(--border);border-radius:6px;padding:3px 10px;color:var(--text3);cursor:pointer;font-size:11px">↩ Trocar</button>
    </div>

    <!-- FILTROS -->
    <div id="dl-filtros" style="display:none;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:12px 16px;margin-bottom:18px;display:none;align-items:flex-end;gap:12px;flex-wrap:wrap">
      <div>
        <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.8px;margin-bottom:3px">DE</div>
        <input type="date" id="dl-ini" onchange="dlAplicarFiltros()"
          style="padding:7px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px;outline:none">
      </div>
      <div>
        <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.8px;margin-bottom:3px">ATÉ</div>
        <input type="date" id="dl-fim" onchange="dlAplicarFiltros()"
          style="padding:7px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px;outline:none">
      </div>
      <div>
        <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.8px;margin-bottom:3px">TURNO</div>
        <select id="dl-turno" onchange="dlAplicarFiltros()"
          style="padding:7px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px;outline:none">
          <option value="">Todos (1, 2 e 3)</option>
          <option value="1">Turno 1</option>
          <option value="2">Turno 2</option>
          <option value="3">Turno 3</option>
        </select>
      </div>
      <button onclick="dlAplicarFiltros()" style="background:var(--accent);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:12px;font-weight:700;cursor:pointer;margin-bottom:1px">🔍 Filtrar</button>
      <button onclick="dlResetarFiltros()" style="background:var(--surface2);color:var(--text3);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:12px;cursor:pointer;margin-bottom:1px">✕ Limpar</button>
      <span id="dl-filtro-info" style="margin-left:auto;font-size:11px;color:var(--text3);align-self:center"></span>
    </div>

    <!-- CONTEÚDO DO DASHBOARD -->
    <div id="dl-conteudo" style="display:none">

      <!-- KPI CARDS -->
      <div id="dl-kpis" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;margin-bottom:20px"></div>

      <!-- Faturamento por colaborador (largura total) -->
      <div class="card" style="padding:16px 18px;margin-bottom:16px">
        <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:14px">💰 FATURAMENTO POR COLABORADOR (R$)</div>
        <div style="position:relative;height:300px"><canvas id="dl-chart-fat"></canvas></div>
      </div>

      <!-- Pedidos + Itens (2 colunas) -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px" class="dl-grid-2">
        <div class="card" style="padding:16px 18px">
          <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:14px">📋 PEDIDOS POR COLABORADOR</div>
          <div style="position:relative;height:260px"><canvas id="dl-chart-ped"></canvas></div>
        </div>
        <div class="card" style="padding:16px 18px">
          <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:14px">📦 ITENS POR COLABORADOR</div>
          <div style="position:relative;height:260px"><canvas id="dl-chart-itens"></canvas></div>
        </div>
      </div>

      <!-- Faturamento por dia + Distribuição por turno -->
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:16px" class="dl-grid-2">
        <div class="card" style="padding:16px 18px">
          <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:14px">📅 FATURAMENTO POR DIA</div>
          <div style="position:relative;height:210px"><canvas id="dl-chart-dia"></canvas></div>
        </div>
        <div class="card" style="padding:16px 18px">
          <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:14px">🔄 POR TURNO</div>
          <div style="position:relative;height:210px"><canvas id="dl-chart-turno"></canvas></div>
        </div>
      </div>

      <!-- Status pedidos + Por hora -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px" class="dl-grid-2">
        <div class="card" style="padding:16px 18px" id="dl-card-status">
          <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:14px">📊 STATUS DOS PEDIDOS</div>
          <div style="position:relative;height:220px"><canvas id="dl-chart-status"></canvas></div>
        </div>
        <div class="card" style="padding:16px 18px">
          <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:14px">⏱️ FATURAMENTO POR HORA</div>
          <div style="position:relative;height:220px"><canvas id="dl-chart-hora"></canvas></div>
        </div>
      </div>

      <!-- Tabela ranking -->
      <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:12px 18px;background:var(--surface2);border-bottom:1px solid var(--border);font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;display:flex;align-items:center;gap:8px">
          🏆 RANKING DETALHADO POR COLABORADOR
          <span style="margin-left:auto;font-size:10px;font-weight:600;color:var(--text3)" id="dl-table-count"></span>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:var(--surface2)">
                <th style="padding:9px 12px;text-align:center;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px;white-space:nowrap">#</th>
                <th style="padding:9px 12px;text-align:left;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px">COLABORADOR</th>
                <th style="padding:9px 12px;text-align:center;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px">TURNO</th>
                <th style="padding:9px 12px;text-align:right;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px">FATURAMENTO</th>
                <th style="padding:9px 12px;text-align:right;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px">% TOTAL</th>
                <th style="padding:9px 12px;text-align:right;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px">PEDIDOS</th>
                <th style="padding:9px 12px;text-align:right;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px">ITENS</th>
                <th style="padding:9px 12px;text-align:right;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px">TICKET MÉDIO</th>
                <th style="padding:9px 12px;text-align:right;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px">ITENS/PED</th>
              </tr>
            </thead>
            <tbody id="dl-tbody"></tbody>
          </table>
        </div>
      </div>

    </div><!-- /dl-conteudo -->
  </div>`;

  // CSS responsivo inline
  const style = document.getElementById('dl-grid-style');
  if (!style) {
    const s = document.createElement('style');
    s.id = 'dl-grid-style';
    s.textContent = `@media(max-width:800px){.dl-grid-2{grid-template-columns:1fr !important}}`;
    document.head.appendChild(s);
  }
}

// ── Upload ─────────────────────────────────────────────────────────────────
function dlHandleDrop(e) {
  e.preventDefault();
  e.currentTarget.style.background = '';
  const f = e.dataTransfer.files[0];
  if (f) dlProcessarArquivo(f);
}

function dlResetarArquivo() {
  _dlBrutos = []; _dlSheet2 = []; _dlFiltrados = [];
  Object.keys(_dlCharts).forEach(k => dlDestroyChart(k));
  document.getElementById('dl-file-info')?.style && (document.getElementById('dl-file-info').style.display = 'none');
  document.getElementById('dl-filtros')?.style   && (document.getElementById('dl-filtros').style.display   = 'none');
  document.getElementById('dl-conteudo')?.style  && (document.getElementById('dl-conteudo').style.display  = 'none');
  document.getElementById('dl-upload-zona')?.style && (document.getElementById('dl-upload-zona').style.display = '');
}

async function dlProcessarArquivo(file) {
  if (!file) return;
  const zona = document.getElementById('dl-upload-zona');
  if (zona) zona.innerHTML = `<div style="padding:36px;text-align:center;color:var(--text3)">⏳ Lendo <b>${file.name}</b>...</div>`;

  try {
    const buf  = await file.arrayBuffer();
    const wb   = XLSX.read(buf, { type:'array', cellDates:false });

    const idx1 = wb.SheetNames.findIndex(n => /pedido|turno/i.test(n));
    const idx2 = wb.SheetNames.findIndex(n => /iten/i.test(n));
    const ws1  = wb.Sheets[wb.SheetNames[idx1 !== -1 ? idx1 : 0]];
    const ws2  = idx2 !== -1 ? wb.Sheets[wb.SheetNames[idx2]] : null;

    const raw1 = XLSX.utils.sheet_to_json(ws1, { defval:'', raw:true });
    const raw2 = ws2 ? XLSX.utils.sheet_to_json(ws2, { defval:'', raw:true }) : [];

    if (!raw1.length) { dlToast('Aba Pedidos-turno não encontrada ou vazia!','erro'); dlResetarArquivo(); return; }

    const s = raw1[0];
    const cFat  = dlFindCol(s, 'total faturado', 'faturado') || dlFindCol(s, 'valor');
    const cItens = dlFindCol(s, 'itens - qtde', 'qtde', 'qtd');
    const cData  = dlFindCol(s, 'data faturado');
    const cUsr   = dlFindCol(s, 'usuário faturado', 'usuario faturado', 'usuário', 'usuario');
    const cSt    = dlFindCol(s, 'status');

    const brutos = raw1
      .filter(r => /^[123]/.test(String(r[cUsr]||'').trim()))
      .map(r => {
        const usuario = String(r[cUsr]||'').trim();
        const dataStr = String(r[cData]||'').trim();
        const dt      = dlParseData(dataStr);
        return {
          faturado: parseFloat(r[cFat])  || 0,
          itens:    parseInt(r[cItens])  || 0,
          data:     dt,
          dataStr,
          usuario,
          turno:  dlTurno(usuario),
          nome:   dlNome(usuario),
          status: String(r[cSt]||''),
        };
      })
      .filter(r => r.data !== null);

    // Sheet2
    let sheet2 = [];
    if (raw2.length) {
      const s2  = raw2[0];
      const c2s = dlFindCol(s2, 'status');
      sheet2 = raw2.map(r => ({ status: String(r[c2s]||'').trim() })).filter(r => r.status);
    }

    _dlBrutos  = brutos;
    _dlSheet2  = sheet2;

    // Range de datas automático
    const datas = brutos.map(r => r.data).filter(Boolean);
    if (datas.length) {
      document.getElementById('dl-ini').value = dlToInput(new Date(Math.min(...datas.map(d => d.getTime()))));
      document.getElementById('dl-fim').value = dlToInput(new Date(Math.max(...datas.map(d => d.getTime()))));
    }

    // Mostra UI
    if (zona) zona.style.display = 'none';
    const fi = document.getElementById('dl-file-info');
    if (fi) { fi.style.display = 'flex'; document.getElementById('dl-file-nome').textContent = file.name; document.getElementById('dl-file-rows').textContent = `${brutos.length} pedidos (turno 1/2/3)`; }
    document.getElementById('dl-filtros').style.display  = 'flex';
    document.getElementById('dl-conteudo').style.display = '';

    dlAplicarFiltros();

  } catch(e) {
    console.error(e);
    dlToast('Erro ao ler arquivo: ' + e.message, 'erro');
    dlResetarArquivo();
  }
}

// ── Filtros ────────────────────────────────────────────────────────────────
function dlAplicarFiltros() {
  const ini   = dlInputToDate(document.getElementById('dl-ini')?.value);
  const fim   = dlInputToDate(document.getElementById('dl-fim')?.value);
  const turno = document.getElementById('dl-turno')?.value || '';

  _dlFiltrados = _dlBrutos.filter(r => {
    if (ini && r.data < ini) return false;
    if (fim && r.data > fim) return false;
    if (turno && r.turno !== turno) return false;
    return true;
  });

  const inf = document.getElementById('dl-filtro-info');
  if (inf) inf.textContent = _dlFiltrados.length === _dlBrutos.length
    ? `${dlFmtN(_dlBrutos.length)} pedidos`
    : `${dlFmtN(_dlFiltrados.length)} de ${dlFmtN(_dlBrutos.length)} pedidos`;

  dlRenderizarDados();
}

function dlResetarFiltros() {
  const datas = _dlBrutos.map(r => r.data).filter(Boolean);
  if (datas.length) {
    document.getElementById('dl-ini').value = dlToInput(new Date(Math.min(...datas.map(d => d.getTime()))));
    document.getElementById('dl-fim').value = dlToInput(new Date(Math.max(...datas.map(d => d.getTime()))));
  }
  document.getElementById('dl-turno').value = '';
  dlAplicarFiltros();
}

// ── Render principal ───────────────────────────────────────────────────────
function dlRenderizarDados() {
  const data = _dlFiltrados;
  if (!data.length) return;

  const byUser  = {};
  const byDia   = {};
  const byHora  = new Array(24).fill(0);
  const byTurno = { '1':{fat:0,ped:0,itens:0}, '2':{fat:0,ped:0,itens:0}, '3':{fat:0,ped:0,itens:0} };
  let   totalFat = 0, totalPed = 0, totalItens = 0;

  data.forEach(r => {
    if (!byUser[r.usuario]) byUser[r.usuario] = { nome:r.nome, turno:r.turno, fat:0, ped:0, itens:0 };
    byUser[r.usuario].fat   += r.faturado;
    byUser[r.usuario].ped   += 1;
    byUser[r.usuario].itens += r.itens;
    totalFat   += r.faturado;
    totalPed   += 1;
    totalItens += r.itens;
    if (r.data) { const k = r.data.toLocaleDateString('pt-BR'); byDia[k] = (byDia[k]||0) + r.faturado; }
    const h = parseInt(String(r.dataStr).split(' ')[1]?.split(':')[0]);
    if (!isNaN(h) && h >= 0 && h < 24) byHora[h] += r.faturado;
    if (byTurno[r.turno]) { byTurno[r.turno].fat += r.faturado; byTurno[r.turno].ped += 1; byTurno[r.turno].itens += r.itens; }
  });

  const ranking = Object.entries(byUser).sort((a,b) => b[1].fat - a[1].fat);

  dlRenderKPIs(totalFat, totalPed, totalItens, ranking.length, byTurno);
  dlRenderChartFat(ranking);
  dlRenderChartPed(ranking);
  dlRenderChartItens(ranking);
  dlRenderChartDia(byDia);
  dlRenderChartTurno(byTurno);
  dlRenderChartStatus();
  dlRenderChartHora(byHora);
  dlRenderTabela(ranking, totalFat);
}

// ── KPIs ───────────────────────────────────────────────────────────────────
function dlRenderKPIs(fat, ped, itens, nColab, byTurno) {
  const ticket   = ped > 0 ? fat / ped : 0;
  const itensPed = ped > 0 ? itens / ped : 0;
  document.getElementById('dl-kpis').innerHTML = [
    ['k-green',  '💰 Faturamento Total', `R$ ${dlFmt(fat)}`,           `${dlFmtN(ped)} pedidos`],
    ['k-blue',   '📋 Total de Pedidos',   dlFmtN(ped),                   `${nColab} colaboradores`],
    ['k-amber',  '📦 Total de Itens',     dlFmtN(itens),                `${itensPed.toFixed(1)} itens/pedido`],
    ['k-purple', '🎯 Ticket Médio',       `R$ ${dlFmt(ticket)}`,        'por pedido'],
    ['k-blue',   '☀️ Turno 1',            `R$ ${dlFmt(byTurno['1'].fat)}`, `${dlFmtN(byTurno['1'].ped)} ped.`],
    ['k-purple', '🌅 Turno 2',            `R$ ${dlFmt(byTurno['2'].fat)}`, `${dlFmtN(byTurno['2'].ped)} ped.`],
    ['k-teal',   '🌙 Turno 3',            `R$ ${dlFmt(byTurno['3'].fat)}`, `${dlFmtN(byTurno['3'].ped)} ped.`],
  ].map(([cls,lb,val,sub]) => `
    <div class="card kpi-card ${cls}" style="padding:14px 16px;position:relative;overflow:hidden">
      <div style="font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:5px">${lb}</div>
      <div style="font-size:20px;font-weight:900;color:var(--text);line-height:1.1">${val}</div>
      <div style="font-size:10px;color:var(--text3);margin-top:3px">${sub}</div>
    </div>`).join('');
}

// ── Charts ─────────────────────────────────────────────────────────────────
const DL_GRID = { color:'rgba(51,65,85,.25)' };
const DL_TICK = { color:'#64748b', font:{ size:10 } };
const DL_DARK = { backgroundColor:'rgba(0,0,0,0)' };

function dlChartOpts(extra={}) {
  return Object.assign({ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, animation:{duration:300} }, extra);
}

function dlRenderChartFat(ranking) {
  dlDestroyChart('fat');
  const labels = ranking.map(([,v]) => v.nome);
  const values = ranking.map(([,v]) => v.fat);
  const colors = ranking.map(([,v]) => DL_COR_TURNO[v.turno] || '#6366f1');
  _dlCharts['fat'] = new Chart(document.getElementById('dl-chart-fat'), {
    type:'bar',
    data:{ labels, datasets:[{ data:values, backgroundColor:colors.map(c=>c+'99'), borderColor:colors, borderWidth:1.5, borderRadius:6 }] },
    options: dlChartOpts({
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label: c=>` R$ ${dlFmt(c.parsed.y)}`, afterLabel: c=>`Turno ${ranking[c.dataIndex][1].turno} · ${dlFmtN(ranking[c.dataIndex][1].ped)} ped.` }}},
      scales:{ x:{ ticks:{...DL_TICK, maxRotation:40}, grid:DL_GRID }, y:{ ticks:{...DL_TICK, callback:v=>'R$'+(v>=1000?(v/1000).toFixed(0)+'k':v)}, grid:DL_GRID }}
    })
  });
}

function dlRenderChartPed(ranking) {
  dlDestroyChart('ped');
  const labels = ranking.map(([,v]) => v.nome);
  const colors = ranking.map(([,v]) => DL_COR_TURNO[v.turno] || '#6366f1');
  _dlCharts['ped'] = new Chart(document.getElementById('dl-chart-ped'), {
    type:'bar',
    data:{ labels, datasets:[{ data:ranking.map(([,v])=>v.ped), backgroundColor:colors.map(c=>c+'99'), borderColor:colors, borderWidth:1.5, borderRadius:5 }] },
    options: dlChartOpts({
      indexAxis:'y',
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:c=>` ${dlFmtN(c.parsed.x)} pedidos` }}},
      scales:{ x:{ ticks:DL_TICK, grid:DL_GRID }, y:{ ticks:{...DL_TICK, font:{size:11}}, grid:DL_GRID }}
    })
  });
}

function dlRenderChartItens(ranking) {
  dlDestroyChart('itens');
  const labels = ranking.map(([,v]) => v.nome);
  const colors = ranking.map(([,v]) => DL_COR_TURNO[v.turno] || '#6366f1');
  _dlCharts['itens'] = new Chart(document.getElementById('dl-chart-itens'), {
    type:'bar',
    data:{ labels, datasets:[{ data:ranking.map(([,v])=>v.itens), backgroundColor:colors.map(c=>c+'99'), borderColor:colors, borderWidth:1.5, borderRadius:5 }] },
    options: dlChartOpts({
      indexAxis:'y',
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:c=>` ${dlFmtN(c.parsed.x)} itens` }}},
      scales:{ x:{ ticks:DL_TICK, grid:DL_GRID }, y:{ ticks:{...DL_TICK, font:{size:11}}, grid:DL_GRID }}
    })
  });
}

function dlRenderChartDia(byDia) {
  dlDestroyChart('dia');
  const sorted = Object.entries(byDia).sort((a,b)=>{
    const [da,ma,ya]=a[0].split('/'); const [db,mb,yb]=b[0].split('/');
    return new Date(+ya,+ma-1,+da)-new Date(+yb,+mb-1,+db);
  });
  _dlCharts['dia'] = new Chart(document.getElementById('dl-chart-dia'), {
    type:'line',
    data:{ labels:sorted.map(([d])=>d), datasets:[{ data:sorted.map(([,v])=>v), borderColor:'#22c55e', backgroundColor:'rgba(34,197,94,.1)', borderWidth:2, pointBackgroundColor:'#22c55e', pointRadius:4, fill:true, tension:.3 }] },
    options: dlChartOpts({
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:c=>` R$ ${dlFmt(c.parsed.y)}` }}},
      scales:{ x:{ ticks:DL_TICK, grid:DL_GRID }, y:{ ticks:{...DL_TICK, callback:v=>'R$'+(v>=1000?(v/1000).toFixed(0)+'k':v)}, grid:DL_GRID }}
    })
  });
}

function dlRenderChartTurno(byTurno) {
  dlDestroyChart('turno');
  _dlCharts['turno'] = new Chart(document.getElementById('dl-chart-turno'), {
    type:'doughnut',
    data:{
      labels:['Turno 1','Turno 2','Turno 3'],
      datasets:[{ data:[byTurno['1'].fat, byTurno['2'].fat, byTurno['3'].fat],
        backgroundColor:['rgba(56,189,248,.65)','rgba(167,139,250,.65)','rgba(45,212,191,.65)'],
        borderColor:['#38bdf8','#a78bfa','#2dd4bf'], borderWidth:2 }]
    },
    options: dlChartOpts({
      plugins:{ legend:{ display:true, position:'bottom', labels:{color:'#94a3b8', font:{size:10}, padding:10} },
        tooltip:{ callbacks:{ label:c=>` R$ ${dlFmt(c.parsed)} — ${dlFmtN(Object.values(byTurno)[c.dataIndex].ped)} ped.` }}},
      cutout:'60%'
    })
  });
}

function dlRenderChartStatus() {
  dlDestroyChart('status');
  if (!_dlSheet2.length) { const el = document.getElementById('dl-card-status'); if (el) el.style.display='none'; return; }
  const byS = {};
  _dlSheet2.forEach(r => { const s = r.status||'—'; byS[s] = (byS[s]||0)+1; });
  const sorted = Object.entries(byS).sort((a,b)=>b[1]-a[1]);
  const COR = { 'FATURADO':'#22c55e','ENTREGUE':'#38bdf8','DESPACHADO':'#a78bfa','CANCELADO':'#ef4444','PENDENTE':'#f59e0b' };
  _dlCharts['status'] = new Chart(document.getElementById('dl-chart-status'), {
    type:'doughnut',
    data:{
      labels:sorted.map(([s])=>s),
      datasets:[{ data:sorted.map(([,v])=>v),
        backgroundColor:sorted.map(([s])=>(COR[s]||'#6366f1')+'99'),
        borderColor:sorted.map(([s])=>COR[s]||'#6366f1'), borderWidth:2 }]
    },
    options: dlChartOpts({
      plugins:{ legend:{ display:true, position:'bottom', labels:{color:'#94a3b8', font:{size:10}, padding:8} },
        tooltip:{ callbacks:{ label:c=>` ${dlFmtN(c.parsed)} pedidos` }}},
      cutout:'55%'
    })
  });
}

function dlRenderChartHora(byHora) {
  dlDestroyChart('hora');
  const hLabels = Array.from({length:24}, (_,i)=>`${String(i).padStart(2,'0')}h`);
  const colors  = byHora.map(v => v > 0 ? 'rgba(99,102,241,.75)' : 'rgba(51,65,85,.3)');
  _dlCharts['hora'] = new Chart(document.getElementById('dl-chart-hora'), {
    type:'bar',
    data:{ labels:hLabels, datasets:[{ data:byHora, backgroundColor:colors, borderRadius:3, borderWidth:0 }] },
    options: dlChartOpts({
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:c=>` R$ ${dlFmt(c.parsed.y)}` }}},
      scales:{ x:{ ticks:{...DL_TICK,font:{size:9}}, grid:DL_GRID }, y:{ ticks:{...DL_TICK, callback:v=>v>=1000?(v/1000).toFixed(0)+'k':v}, grid:DL_GRID }}
    })
  });
}

// ── Tabela ranking ─────────────────────────────────────────────────────────
function dlRenderTabela(ranking, totalFat) {
  document.getElementById('dl-table-count').textContent = `${ranking.length} colaboradores`;
  const ICONS = ['🥇','🥈','🥉'];
  const T_COR = { '1':'rgba(56,189,248,.15)','2':'rgba(167,139,250,.15)','3':'rgba(45,212,191,.15)' };
  const T_TXT = { '1':'#38bdf8','2':'#a78bfa','3':'#2dd4bf' };
  const maxFat = ranking[0]?.[1].fat || 1;

  document.getElementById('dl-tbody').innerHTML = ranking.map(([,v], i) => {
    const pct    = totalFat > 0 ? (v.fat/totalFat*100) : 0;
    const ticket = v.ped  > 0  ? v.fat/v.ped  : 0;
    const ipd    = v.ped  > 0  ? v.itens/v.ped : 0;
    const barW   = maxFat > 0  ? (v.fat/maxFat*100) : 0;
    const cor    = DL_COR_TURNO[v.turno] || '#6366f1';
    return `<tr style="border-bottom:1px solid rgba(51,65,85,.4)">
      <td style="padding:10px 12px;text-align:center;font-size:14px">${ICONS[i] || `<span style="font-size:10px;color:var(--text3);font-weight:700">${i+1}</span>`}</td>
      <td style="padding:10px 14px">
        <div style="font-weight:700;color:var(--text);font-size:13px">${v.nome}</div>
        <div style="background:var(--surface2);border-radius:3px;height:4px;margin-top:5px;overflow:hidden">
          <div style="height:100%;width:${barW}%;background:${cor};border-radius:3px"></div>
        </div>
      </td>
      <td style="padding:10px 12px;text-align:center">
        <span style="background:${T_COR[v.turno]||'rgba(99,102,241,.15)'};color:${T_TXT[v.turno]||'#6366f1'};border-radius:20px;padding:2px 10px;font-size:10px;font-weight:800">T${v.turno}</span>
      </td>
      <td style="padding:10px 14px;text-align:right;font-weight:700;color:#22c55e;font-size:13px">R$ ${dlFmt(v.fat)}</td>
      <td style="padding:10px 14px;text-align:right;color:var(--text3);font-size:12px">${pct.toFixed(1)}%</td>
      <td style="padding:10px 14px;text-align:right;font-weight:600;font-size:13px">${dlFmtN(v.ped)}</td>
      <td style="padding:10px 14px;text-align:right;font-size:13px">${dlFmtN(v.itens)}</td>
      <td style="padding:10px 14px;text-align:right;color:#38bdf8;font-size:12px">R$ ${dlFmt(ticket)}</td>
      <td style="padding:10px 14px;text-align:right;color:#f59e0b;font-size:12px">${ipd.toFixed(1)}</td>
    </tr>`;
  }).join('');
}
