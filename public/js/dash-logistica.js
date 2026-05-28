/* ══ WMS — Dash Logística ══
   Versão 5 — ranking ordenado por nº de pedidos
   Upload salva no BD; ao abrir, carrega histórico automaticamente.
   Filtra Usuário Faturado com 1, 2 ou 3 na frente.
══════════════════════════════════════════════════════════════════════ */
'use strict';

// ── Estado ────────────────────────────────────────────────────────────────
let _dlDados     = [];
let _dlFiltrados = [];
const _dlCharts  = {};
let _dlCarregando = false;

// ── Helpers ───────────────────────────────────────────────────────────────
const dlFmt  = n => Number(n||0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
const dlFmtN = n => Number(n||0).toLocaleString('pt-BR');
const dlToast = (m, t) => typeof toast === 'function' ? toast(m, t) : console.log(m);

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
function dlFmtBR(iso) {
  if (!iso) return '';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const DL_COR_TURNO = { '1':'#38bdf8', '2':'#a78bfa', '3':'#2dd4bf' };
const DL_GRID = { color:'rgba(51,65,85,.25)' };
const DL_TICK = { color:'#64748b', font:{ size:10 } };

// ── Renderiza a página ────────────────────────────────────────────────────
function renderizarDashLogistica() {
  const pag = document.getElementById('pag-dash-logistica');
  if (!pag) return;

  pag.innerHTML = `
  <div style="padding:0 0 40px">

    <div class="pg-title" style="margin-bottom:18px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      📊 Dash Logística
      <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button onclick="dlExportarExcel()" style="background:#16a34a;color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer">📊 Excel</button>
        <button onclick="dlExportarPDF()" style="background:#dc2626;color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer">📄 PDF</button>
        <button onclick="dlAbrirImport()" style="background:var(--accent);color:#fff;border:none;border-radius:8px;padding:7px 16px;font-size:12px;font-weight:700;cursor:pointer">📂 Importar Planilha</button>
      </div>
    </div>

    <!-- UPLOAD ZONA (oculta, aparece ao clicar) -->
    <div id="dl-upload-zona" style="display:none;margin-bottom:18px">
      <div class="card" style="padding:0">
        <div id="dl-drop" style="padding:32px 24px;text-align:center;cursor:pointer;border-radius:var(--r);transition:background .2s"
             onclick="document.getElementById('dl-input').click()"
             ondragover="event.preventDefault();this.style.background='rgba(99,102,241,.08)'"
             ondragleave="this.style.background=''"
             ondrop="dlHandleDrop(event)">
          <div style="font-size:32px;margin-bottom:8px">📂</div>
          <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:5px">Clique ou arraste a planilha aqui</div>
          <div style="font-size:11px;color:var(--text3)">Suporte: <b>.xlsx · .xls</b> &nbsp;·&nbsp; Abas: <b>Pedidos-turno</b> + <b>Itens</b></div>
          <div style="font-size:11px;color:#f59e0b;margin-top:6px">⚠️ Os dados do período da planilha serão substituídos no banco</div>
          <input type="file" id="dl-input" accept=".xlsx,.xls" style="display:none" onchange="dlProcessarArquivo(this.files[0])">
          <div style="display:flex;justify-content:center;gap:10px;margin-top:12px">
            <div style="background:var(--accent);color:#fff;border-radius:8px;padding:7px 18px;font-size:12px;font-weight:700">Selecionar arquivo</div>
            <button onclick="event.stopPropagation();dlFecharImport()" style="background:var(--surface2);color:var(--text3);border:1px solid var(--border);border-radius:8px;padding:7px 14px;font-size:12px;cursor:pointer">Cancelar</button>
          </div>
        </div>
      </div>
    </div>

    <!-- STATUS BANCO -->
    <div id="dl-banco-info" style="display:none;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.25);border-radius:8px;padding:10px 16px;margin-bottom:16px;align-items:center;gap:10px;font-size:12px;color:var(--blue)">
      <span>🗄️</span>
      <span id="dl-banco-txt"></span>
    </div>

    <!-- FILTROS -->
    <div id="dl-filtros" style="display:none;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:12px 16px;margin-bottom:18px;align-items:flex-end;gap:12px;flex-wrap:wrap">
      <div>
        <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.8px;margin-bottom:3px">DE</div>
        <input type="date" id="dl-ini" onchange="dlBuscarDados()"
          style="padding:7px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px;outline:none">
      </div>
      <div>
        <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.8px;margin-bottom:3px">ATÉ</div>
        <input type="date" id="dl-fim" onchange="dlBuscarDados()"
          style="padding:7px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px;outline:none">
      </div>
      <div>
        <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.8px;margin-bottom:3px">TURNO</div>
        <select id="dl-turno" onchange="dlBuscarDados()"
          style="padding:7px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px;outline:none">
          <option value="">Todos (1, 2 e 3)</option>
          <option value="1">Turno 1</option>
          <option value="2">Turno 2</option>
          <option value="3">Turno 3</option>
        </select>
      </div>
      <button onclick="dlBuscarDados()" style="background:var(--accent);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:12px;font-weight:700;cursor:pointer;margin-bottom:1px">🔍 Filtrar</button>
      <button onclick="dlResetarFiltros()" style="background:var(--surface2);color:var(--text3);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:12px;cursor:pointer;margin-bottom:1px">✕ Limpar</button>
      <span id="dl-filtro-info" style="margin-left:auto;font-size:11px;color:var(--text3);align-self:center"></span>
    </div>

    <!-- ESTADO VAZIO -->
    <div id="dl-vazio" style="text-align:center;padding:72px 24px;color:var(--text3)">
      <div style="font-size:40px;margin-bottom:12px">📊</div>
      <div style="font-size:15px;font-weight:700;margin-bottom:6px">Nenhum dado importado ainda</div>
      <div style="font-size:12px;margin-bottom:20px">Clique em <b>Importar Planilha</b> para começar</div>
      <button onclick="dlAbrirImport()" style="background:var(--accent);color:#fff;border:none;border-radius:8px;padding:9px 22px;font-size:13px;font-weight:700;cursor:pointer">📂 Importar primeira planilha</button>
    </div>

    <!-- LOADING -->
    <div id="dl-loading" style="display:none;text-align:center;padding:48px;color:var(--text3)">
      <div style="font-size:24px;margin-bottom:8px">⏳</div>
      <div>Carregando dados...</div>
    </div>

    <!-- CONTEÚDO DO DASHBOARD -->
    <div id="dl-conteudo" style="display:none">

      <!-- KPI CARDS -->
      <div id="dl-kpis" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;margin-bottom:20px"></div>

      <!-- Faturamento por colaborador -->
      <div class="card" style="padding:16px 18px;margin-bottom:16px">
        <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:14px">💰 FATURAMENTO POR COLABORADOR (R$)</div>
        <div style="position:relative;height:300px"><canvas id="dl-chart-fat"></canvas></div>
      </div>

      <!-- Pedidos + Itens -->
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

      <!-- Faturamento por dia + Turno -->
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

      <!-- Por hora + Evolução acumulada -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px" class="dl-grid-2">
        <div class="card" style="padding:16px 18px">
          <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:14px">⏱️ FATURAMENTO POR HORA DO DIA</div>
          <div style="position:relative;height:220px"><canvas id="dl-chart-hora"></canvas></div>
        </div>
        <div class="card" style="padding:16px 18px">
          <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:14px">📈 EVOLUÇÃO DIÁRIA POR TURNO</div>
          <div style="position:relative;height:220px"><canvas id="dl-chart-evolucao"></canvas></div>
        </div>
      </div>

      <!-- Tabela ranking -->
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:24px">
        <div style="padding:12px 18px;background:var(--surface2);border-bottom:1px solid var(--border);font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;display:flex;align-items:center;gap:8px">
          🏆 RANKING DETALHADO POR COLABORADOR
          <span style="margin-left:auto;font-size:10px;font-weight:600;color:var(--text3)" id="dl-table-count"></span>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:var(--surface2)">
                <th style="padding:9px 12px;text-align:center;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px">#</th>
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

    <!-- ══ HISTÓRICO DE IMPORTAÇÕES ══ -->
    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:12px 18px;background:var(--surface2);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">
        <span style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px">📁 ARQUIVOS IMPORTADOS</span>
        <button onclick="dlCarregarImportacoes()" title="Atualizar lista"
          style="margin-left:auto;background:none;border:1px solid var(--border);border-radius:6px;color:var(--text3);padding:3px 9px;font-size:11px;cursor:pointer">🔄 Atualizar</button>
      </div>
      <div id="dl-importacoes-lista" style="padding:8px 0">
        <div style="text-align:center;padding:24px;color:var(--text3);font-size:12px">Carregando...</div>
      </div>
    </div>

  </div>`;

  // CSS responsivo
  if (!document.getElementById('dl-grid-style')) {
    const s = document.createElement('style');
    s.id = 'dl-grid-style';
    s.textContent = `@media(max-width:800px){.dl-grid-2{grid-template-columns:1fr !important}}`;
    document.head.appendChild(s);
  }

  // Carrega dados do banco e histórico de importações
  dlInicializar();
  dlCarregarImportacoes();
}

// ── Inicializar — carrega range disponível e dados ────────────────────────
async function dlInicializar() {
  const rangeEl = document.getElementById('dl-banco-info');
  document.getElementById('dl-loading').style.display = '';
  document.getElementById('dl-vazio').style.display    = 'none';
  document.getElementById('dl-conteudo').style.display = 'none';

  const range = await apiFetch('/dash-logistica/range');
  document.getElementById('dl-loading').style.display = 'none';

  if (!range || range.erro || !range.ini) {
    document.getElementById('dl-vazio').style.display = '';
    return;
  }

  // Preenche filtros com o range disponível
  document.getElementById('dl-ini').value = range.ini;
  document.getElementById('dl-fim').value = range.fim;
  document.getElementById('dl-filtros').style.display = 'flex';

  if (rangeEl) {
    rangeEl.style.display = 'flex';
    document.getElementById('dl-banco-txt').textContent =
      `${dlFmtN(range.total)} pedidos salvos no banco · Período: ${dlFmtBR(range.ini)} a ${dlFmtBR(range.fim)}`;
  }

  await dlBuscarDados();
}

// ── Busca dados do backend com os filtros atuais ──────────────────────────
async function dlBuscarDados() {
  if (_dlCarregando) return;
  _dlCarregando = true;

  const ini   = document.getElementById('dl-ini')?.value  || '';
  const fim   = document.getElementById('dl-fim')?.value  || '';
  const turno = document.getElementById('dl-turno')?.value|| '';

  document.getElementById('dl-loading').style.display  = '';
  document.getElementById('dl-conteudo').style.display = 'none';

  const qs = new URLSearchParams();
  if (ini)   qs.set('ini', ini);
  if (fim)   qs.set('fim', fim);
  if (turno) qs.set('turno', turno);

  const dados = await apiFetch(`/dash-logistica/dados?${qs}`);
  _dlCarregando = false;
  document.getElementById('dl-loading').style.display = 'none';

  if (!dados || dados.erro || !dados.length) {
    document.getElementById('dl-vazio').style.display    = '';
    document.getElementById('dl-conteudo').style.display = 'none';
    const inf = document.getElementById('dl-filtro-info');
    if (inf) inf.textContent = 'Nenhum dado no período selecionado';
    return;
  }

  _dlDados = dados;
  document.getElementById('dl-vazio').style.display    = 'none';
  document.getElementById('dl-conteudo').style.display = '';
  document.getElementById('dl-filtros').style.display  = 'flex';

  const inf = document.getElementById('dl-filtro-info');
  if (inf) inf.textContent = `${dlFmtN(dados.length)} pedidos`;

  dlRenderizarDados(dados);
}

function dlResetarFiltros() {
  dlInicializar();
}

// ── Histórico de importações ──────────────────────────────────────────────
async function dlCarregarImportacoes() {
  const lista = document.getElementById('dl-importacoes-lista');
  if (!lista) return;

  lista.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text3);font-size:12px">⏳ Carregando...</div>`;

  const rows = await apiFetch('/dash-logistica/importacoes');

  if (!rows || rows.erro || !rows.length) {
    lista.innerHTML = `<div style="text-align:center;padding:28px;color:var(--text3);font-size:12px">Nenhum arquivo importado ainda.</div>`;
    return;
  }

  lista.innerHTML = `
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--surface2)">
            <th style="padding:8px 14px;text-align:left;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px">ARQUIVO</th>
            <th style="padding:8px 12px;text-align:center;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px">PERÍODO</th>
            <th style="padding:8px 12px;text-align:right;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px">REGISTROS</th>
            <th style="padding:8px 12px;text-align:left;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px">IMPORTADO POR</th>
            <th style="padding:8px 12px;text-align:left;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px">QUANDO</th>
            <th style="padding:8px 12px;text-align:center;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px">AÇÃO</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr style="border-bottom:1px solid rgba(51,65,85,.3)">
              <td style="padding:10px 14px">
                <div style="font-size:12px;font-weight:700;color:var(--text)">${escHtml(r.nome_arquivo||'arquivo.xlsx')}</div>
              </td>
              <td style="padding:10px 12px;text-align:center">
                <span style="font-size:11px;color:var(--text);background:var(--surface2);border-radius:6px;padding:3px 10px;white-space:nowrap">
                  ${escHtml(r.ini_fmt)} — ${escHtml(r.fim_fmt)}
                </span>
              </td>
              <td style="padding:10px 12px;text-align:right;font-size:12px;font-weight:700;color:#38bdf8">
                ${dlFmtN(r.total_registros)}
              </td>
              <td style="padding:10px 12px;font-size:11px;color:var(--text3)">${escHtml(r.importado_por||'—')}</td>
              <td style="padding:10px 12px;font-size:11px;color:var(--text3);white-space:nowrap">${escHtml(r.importado_em_fmt||'')}</td>
              <td style="padding:10px 12px;text-align:center">
                <button onclick="dlExcluirImportacao(${r.id},'${escHtml(r.nome_arquivo||'arquivo.xlsx').replace(/'/g,"\\'")}')"
                  title="Excluir este período do banco"
                  style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#ef4444;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer">
                  🗑️ Excluir
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

async function dlExcluirImportacao(id, nome) {
  if (!confirm(`Excluir a importação "${nome}" e todos os seus pedidos do banco?\n\nEssa ação não pode ser desfeita.`)) return;

  const r = await apiFetch(`/dash-logistica/importacoes/${id}`, { method:'DELETE' });
  if (r?.erro) { dlToast('Erro ao excluir: '+r.erro, 'erro'); return; }

  dlToast('✅ Importação excluída com sucesso.', 'sucesso');
  dlCarregarImportacoes();
  dlInicializar();
}

// ── Upload de arquivo ─────────────────────────────────────────────────────
function dlAbrirImport() {
  const z = document.getElementById('dl-upload-zona');
  if (z) z.style.display = '';
}

function dlFecharImport() {
  // Oculta a zona
  const z = document.getElementById('dl-upload-zona');
  if (z) z.style.display = 'none';

  // Reseta o drop zone para o HTML original
  const drop = document.getElementById('dl-drop');
  if (drop) drop.innerHTML = `
    <div style="font-size:32px;margin-bottom:8px">📂</div>
    <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:5px">Clique ou arraste a planilha aqui</div>
    <div style="font-size:11px;color:var(--text3)">Suporte: <b>.xlsx · .xls</b> &nbsp;·&nbsp; Abas: <b>Pedidos-turno</b> + <b>Itens</b></div>
    <div style="font-size:11px;color:#f59e0b;margin-top:6px">⚠️ Os dados do período da planilha serão substituídos no banco</div>
    <input type="file" id="dl-input" accept=".xlsx,.xls" style="display:none" onchange="dlProcessarArquivo(this.files[0])">
    <div style="display:flex;justify-content:center;gap:10px;margin-top:12px">
      <div style="background:var(--accent);color:#fff;border-radius:8px;padding:7px 18px;font-size:12px;font-weight:700">Selecionar arquivo</div>
      <button onclick="event.stopPropagation();dlFecharImport()" style="background:var(--surface2);color:var(--text3);border:1px solid var(--border);border-radius:8px;padding:7px 14px;font-size:12px;cursor:pointer">Cancelar</button>
    </div>`;
}

function dlHandleDrop(e) {
  e.preventDefault();
  e.currentTarget.style.background = '';
  const f = e.dataTransfer.files[0];
  if (f) dlProcessarArquivo(f);
}

async function dlProcessarArquivo(file) {
  if (!file) return;
  const drop = document.getElementById('dl-drop');

  // Mostra estado de leitura
  if (drop) drop.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text3)">⏳ Lendo <b>${escHtml(file.name)}</b>...</div>`;

  try {
    const buf = await file.arrayBuffer();
    const wb  = XLSX.read(buf, { type:'array', cellDates:false });

    const idx1 = wb.SheetNames.findIndex(n => /pedido|turno/i.test(n));
    const ws1  = wb.Sheets[wb.SheetNames[idx1 !== -1 ? idx1 : 0]];
    const raw1 = XLSX.utils.sheet_to_json(ws1, { defval:'', raw:true });

    if (!raw1.length) { dlToast('Aba Pedidos-turno vazia!','erro'); return; }

    const s     = raw1[0];
    const cFat  = dlFindCol(s, 'total faturado', 'faturado') || dlFindCol(s, 'valor');
    const cItens= dlFindCol(s, 'itens - qtde', 'qtde', 'qtd');
    const cData = dlFindCol(s, 'data faturado');
    const cUsr  = dlFindCol(s, 'usuário faturado', 'usuario faturado', 'usuário', 'usuario');
    const cNum  = dlFindCol(s, 'número', 'numero', 'pedido - n');
    const cSt   = dlFindCol(s, 'status');

    // Processa e filtra turno 1/2/3
    const pedidos = [];
    let ini = null, fim = null;

    for (const r of raw1) {
      const usuario = String(r[cUsr]||'').trim();
      if (!/^[123]/.test(usuario)) continue;

      const dataStr = String(r[cData]||'').trim();
      const m = dataStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (!m) continue;

      const dataFat = `${m[3]}-${m[2]}-${m[1]}`;
      const horaFat = dataStr.split(' ')[1] || '';

      if (!ini || dataFat < ini) ini = dataFat;
      if (!fim || dataFat > fim) fim = dataFat;

      pedidos.push({
        numero_pedido: String(r[cNum]||'').trim(),
        faturado:      parseFloat(r[cFat])  || 0,
        itens:         parseInt(r[cItens])  || 0,
        data_fat:      dataFat,
        hora_fat:      horaFat,
        usuario:       usuario,
        turno:         dlTurno(usuario),
        nome_usuario:  dlNome(usuario),
        status_ped:    String(r[cSt]||'').trim(),
      });
    }

    if (!pedidos.length) { dlToast('Nenhum pedido com turno 1/2/3 encontrado.','aviso'); return; }

    // Mostra estado de envio
    if (drop) drop.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text3)">⏳ Salvando <b>${dlFmtN(pedidos.length)}</b> pedidos no banco...</div>`;

    const r = await apiFetch('/dash-logistica/importar', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ pedidos, ini, fim, nome_arquivo: file.name })
    });

    if (r?.erro) {
      dlToast('Erro ao salvar: '+r.erro, 'erro');
      return;
    }

    dlToast(`✅ ${r.total} pedidos importados! (${dlFmtBR(ini)} a ${dlFmtBR(fim)})`, 'sucesso');

    // Atualiza filtros e recarrega
    const iniEl = document.getElementById('dl-ini');
    const fimEl = document.getElementById('dl-fim');
    if (iniEl) iniEl.value = ini;
    if (fimEl) fimEl.value = fim;

    dlInicializar();
    dlCarregarImportacoes();

  } catch(e) {
    console.error(e);
    dlToast('Erro ao processar arquivo: '+e.message, 'erro');
  } finally {
    // Garante que a zona sempre feche, independente de sucesso ou erro
    dlFecharImport();
  }
}

// ── Utilidade HTML escape ─────────────────────────────────────────────────
function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Render principal ───────────────────────────────────────────────────────
function dlRenderizarDados(data) {
  const byUser  = {};
  const byDia   = {};
  const byHora  = new Array(24).fill(0);
  const byTurno = { '1':{fat:0,ped:0,itens:0}, '2':{fat:0,ped:0,itens:0}, '3':{fat:0,ped:0,itens:0} };
  const byDiaTurno = {};
  let   totalFat = 0, totalPed = 0, totalItens = 0;

  data.forEach(r => {
    const usuario = r.usuario;
    if (!byUser[usuario]) byUser[usuario] = { nome:r.nome_usuario||dlNome(usuario), turno:r.turno, fat:0, ped:0, itens:0 };
    byUser[usuario].fat   += parseFloat(r.faturado)||0;
    byUser[usuario].ped   += 1;
    byUser[usuario].itens += parseInt(r.itens)||0;
    totalFat   += parseFloat(r.faturado)||0;
    totalPed   += 1;
    totalItens += parseInt(r.itens)||0;
    if (r.data_fat) {
      const k = r.data_fat;
      byDia[k] = (byDia[k]||0) + (parseFloat(r.faturado)||0);
      if (!byDiaTurno[k]) byDiaTurno[k] = {'1':0,'2':0,'3':0};
      if (byDiaTurno[k][r.turno] !== undefined) byDiaTurno[k][r.turno] += parseFloat(r.faturado)||0;
    }
    const h = parseInt(String(r.hora_fat||'').split(':')[0]);
    if (!isNaN(h) && h >= 0 && h < 24) byHora[h] += parseFloat(r.faturado)||0;
    if (byTurno[r.turno]) {
      byTurno[r.turno].fat   += parseFloat(r.faturado)||0;
      byTurno[r.turno].ped   += 1;
      byTurno[r.turno].itens += parseInt(r.itens)||0;
    }
  });

  const ranking = Object.entries(byUser).sort((a,b) => b[1].ped - a[1].ped);

  dlRenderKPIs(totalFat, totalPed, totalItens, ranking.length, byTurno);
  dlRenderChartFat(ranking);
  dlRenderChartPed(ranking);
  dlRenderChartItens(ranking);
  dlRenderChartDia(byDia);
  dlRenderChartTurno(byTurno);
  dlRenderChartHora(byHora);
  dlRenderChartEvolucao(byDiaTurno);
  dlRenderTabela(ranking, totalFat);
}

// ── KPIs ───────────────────────────────────────────────────────────────────
function dlRenderKPIs(fat, ped, itens, nColab, byTurno) {
  const ticket   = ped > 0 ? fat / ped : 0;
  const itensPed = ped > 0 ? itens / ped : 0;
  const COR = { green:'#22c55e', blue:'#38bdf8', amber:'#f59e0b', purple:'#a78bfa', teal:'#2dd4bf' };
  document.getElementById('dl-kpis').innerHTML = [
    ['green',  '💰 Faturamento Total', `R$ ${dlFmt(fat)}`,           `${dlFmtN(ped)} pedidos`],
    ['blue',   '📋 Total de Pedidos',   dlFmtN(ped),                   `${nColab} colaboradores`],
    ['amber',  '📦 Total de Itens',     dlFmtN(itens),                `${itensPed.toFixed(1)} itens/pedido`],
    ['purple', '🎯 Ticket Médio',       `R$ ${dlFmt(ticket)}`,        'por pedido'],
    ['blue',   '☀️ Turno 1',            `R$ ${dlFmt(byTurno['1'].fat)}`, `${dlFmtN(byTurno['1'].ped)} ped.`],
    ['purple', '🌅 Turno 2',            `R$ ${dlFmt(byTurno['2'].fat)}`, `${dlFmtN(byTurno['2'].ped)} ped.`],
    ['teal',   '🌙 Turno 3',            `R$ ${dlFmt(byTurno['3'].fat)}`, `${dlFmtN(byTurno['3'].ped)} ped.`],
  ].map(([cor,lb,val,sub]) => `
    <div class="card" style="padding:14px 16px;border-top:3px solid ${COR[cor]};overflow:hidden">
      <div style="font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:5px">${lb}</div>
      <div style="font-size:20px;font-weight:900;color:var(--text);line-height:1.1">${val}</div>
      <div style="font-size:10px;color:var(--text3);margin-top:3px">${sub}</div>
    </div>`).join('');
}

// ── Charts ─────────────────────────────────────────────────────────────────
function dlChartOpts(extra={}) {
  return Object.assign({ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, animation:{duration:250} }, extra);
}

function dlRenderChartFat(ranking) {
  dlDestroyChart('fat');
  const labels = ranking.map(([,v]) => v.nome);
  const colors = ranking.map(([,v]) => DL_COR_TURNO[v.turno] || '#6366f1');
  _dlCharts['fat'] = new Chart(document.getElementById('dl-chart-fat'), {
    type:'bar',
    data:{ labels, datasets:[{ data:ranking.map(([,v])=>v.fat), backgroundColor:colors.map(c=>c+'99'), borderColor:colors, borderWidth:1.5, borderRadius:6 }] },
    options: dlChartOpts({
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:c=>` R$ ${dlFmt(c.parsed.y)}`, afterLabel:c=>`Turno ${ranking[c.dataIndex][1].turno} · ${dlFmtN(ranking[c.dataIndex][1].ped)} ped.` }}},
      scales:{ x:{ ticks:{...DL_TICK, maxRotation:40}, grid:DL_GRID }, y:{ ticks:{...DL_TICK, callback:v=>'R$'+(v>=1000?(v/1000).toFixed(0)+'k':v)}, grid:DL_GRID }}
    })
  });
}

function dlRenderChartPed(ranking) {
  dlDestroyChart('ped');
  const colors = ranking.map(([,v]) => DL_COR_TURNO[v.turno] || '#6366f1');
  _dlCharts['ped'] = new Chart(document.getElementById('dl-chart-ped'), {
    type:'bar',
    data:{ labels:ranking.map(([,v])=>v.nome), datasets:[{ data:ranking.map(([,v])=>v.ped), backgroundColor:colors.map(c=>c+'99'), borderColor:colors, borderWidth:1.5, borderRadius:5 }] },
    options: dlChartOpts({ indexAxis:'y', plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:c=>` ${dlFmtN(c.parsed.x)} pedidos` }}}, scales:{ x:{ ticks:DL_TICK, grid:DL_GRID }, y:{ ticks:{...DL_TICK,font:{size:11}}, grid:DL_GRID }}})
  });
}

function dlRenderChartItens(ranking) {
  dlDestroyChart('itens');
  const colors = ranking.map(([,v]) => DL_COR_TURNO[v.turno] || '#6366f1');
  _dlCharts['itens'] = new Chart(document.getElementById('dl-chart-itens'), {
    type:'bar',
    data:{ labels:ranking.map(([,v])=>v.nome), datasets:[{ data:ranking.map(([,v])=>v.itens), backgroundColor:colors.map(c=>c+'99'), borderColor:colors, borderWidth:1.5, borderRadius:5 }] },
    options: dlChartOpts({ indexAxis:'y', plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:c=>` ${dlFmtN(c.parsed.x)} itens` }}}, scales:{ x:{ ticks:DL_TICK, grid:DL_GRID }, y:{ ticks:{...DL_TICK,font:{size:11}}, grid:DL_GRID }}})
  });
}

function dlRenderChartDia(byDia) {
  dlDestroyChart('dia');
  const sorted = Object.keys(byDia).sort();
  const labels = sorted.map(k => { const [y,m,d] = k.split('-'); return `${d}/${m}`; });
  _dlCharts['dia'] = new Chart(document.getElementById('dl-chart-dia'), {
    type:'line',
    data:{ labels, datasets:[{ data:sorted.map(k=>byDia[k]), borderColor:'#22c55e', backgroundColor:'rgba(34,197,94,.1)', borderWidth:2, pointBackgroundColor:'#22c55e', pointRadius:4, fill:true, tension:.3 }] },
    options: dlChartOpts({ plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:c=>` R$ ${dlFmt(c.parsed.y)}` }}}, scales:{ x:{ ticks:DL_TICK, grid:DL_GRID }, y:{ ticks:{...DL_TICK, callback:v=>'R$'+(v>=1000?(v/1000).toFixed(0)+'k':v)}, grid:DL_GRID }}})
  });
}

function dlRenderChartTurno(byTurno) {
  dlDestroyChart('turno');
  _dlCharts['turno'] = new Chart(document.getElementById('dl-chart-turno'), {
    type:'doughnut',
    data:{ labels:['Turno 1','Turno 2','Turno 3'], datasets:[{ data:[byTurno['1'].fat,byTurno['2'].fat,byTurno['3'].fat], backgroundColor:['rgba(56,189,248,.65)','rgba(167,139,250,.65)','rgba(45,212,191,.65)'], borderColor:['#38bdf8','#a78bfa','#2dd4bf'], borderWidth:2 }] },
    options: dlChartOpts({ plugins:{ legend:{ display:true, position:'bottom', labels:{color:'#94a3b8',font:{size:10},padding:10} }, tooltip:{ callbacks:{ label:c=>` R$ ${dlFmt(c.parsed)} — ${dlFmtN(Object.values(byTurno)[c.dataIndex].ped)} ped.` }}}, cutout:'60%' })
  });
}

function dlRenderChartHora(byHora) {
  dlDestroyChart('hora');
  const hLabels = Array.from({length:24},(_,i)=>`${String(i).padStart(2,'0')}h`);
  const colors = byHora.map(v => v > 0 ? 'rgba(99,102,241,.75)' : 'rgba(51,65,85,.3)');
  _dlCharts['hora'] = new Chart(document.getElementById('dl-chart-hora'), {
    type:'bar',
    data:{ labels:hLabels, datasets:[{ data:byHora, backgroundColor:colors, borderRadius:3, borderWidth:0 }] },
    options: dlChartOpts({ plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:c=>` R$ ${dlFmt(c.parsed.y)}` }}}, scales:{ x:{ ticks:{...DL_TICK,font:{size:9}}, grid:DL_GRID }, y:{ ticks:{...DL_TICK, callback:v=>v>=1000?(v/1000).toFixed(0)+'k':v}, grid:DL_GRID }}})
  });
}

function dlRenderChartEvolucao(byDiaTurno) {
  dlDestroyChart('evolucao');
  const dias = Object.keys(byDiaTurno).sort();
  const labels = dias.map(k => { const [y,m,d]=k.split('-'); return `${d}/${m}`; });
  _dlCharts['evolucao'] = new Chart(document.getElementById('dl-chart-evolucao'), {
    type:'line',
    data:{
      labels,
      datasets:[
        { label:'Turno 1', data:dias.map(k=>byDiaTurno[k]['1']||0), borderColor:'#38bdf8', backgroundColor:'rgba(56,189,248,.08)', borderWidth:2, pointRadius:3, fill:false, tension:.3 },
        { label:'Turno 2', data:dias.map(k=>byDiaTurno[k]['2']||0), borderColor:'#a78bfa', backgroundColor:'rgba(167,139,250,.08)', borderWidth:2, pointRadius:3, fill:false, tension:.3 },
        { label:'Turno 3', data:dias.map(k=>byDiaTurno[k]['3']||0), borderColor:'#2dd4bf', backgroundColor:'rgba(45,212,191,.08)', borderWidth:2, pointRadius:3, fill:false, tension:.3 },
      ]
    },
    options: dlChartOpts({ plugins:{ legend:{ display:true, position:'top', labels:{color:'#94a3b8',font:{size:10},padding:12,boxWidth:10} }, tooltip:{ callbacks:{ label:c=>` ${c.dataset.label}: R$ ${dlFmt(c.parsed.y)}` }}}, scales:{ x:{ ticks:DL_TICK, grid:DL_GRID }, y:{ ticks:{...DL_TICK, callback:v=>'R$'+(v>=1000?(v/1000).toFixed(0)+'k':v)}, grid:DL_GRID }}})
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
    const ticket = v.ped > 0  ? v.fat/v.ped  : 0;
    const ipd    = v.ped > 0  ? v.itens/v.ped : 0;
    const cor    = DL_COR_TURNO[v.turno] || '#6366f1';
    return `<tr style="border-bottom:1px solid rgba(51,65,85,.4)">
      <td style="padding:10px 12px;text-align:center;font-size:14px">${ICONS[i]||`<span style="font-size:10px;color:var(--text3);font-weight:700">${i+1}</span>`}</td>
      <td style="padding:10px 14px">
        <div style="font-weight:700;color:var(--text);font-size:13px">${escHtml(v.nome)}</div>
        <div style="background:var(--surface2);border-radius:3px;height:4px;margin-top:5px;overflow:hidden">
          <div style="height:100%;width:${(v.fat/maxFat*100).toFixed(1)}%;background:${cor};border-radius:3px"></div>
        </div>
      </td>
      <td style="padding:10px 12px;text-align:center"><span style="background:${T_COR[v.turno]||'rgba(99,102,241,.15)'};color:${T_TXT[v.turno]||'#6366f1'};border-radius:20px;padding:2px 10px;font-size:10px;font-weight:800">T${v.turno}</span></td>
      <td style="padding:10px 14px;text-align:right;font-weight:700;color:#22c55e;font-size:13px">R$ ${dlFmt(v.fat)}</td>
      <td style="padding:10px 14px;text-align:right;color:var(--text3);font-size:12px">${pct.toFixed(1)}%</td>
      <td style="padding:10px 14px;text-align:right;font-weight:600;font-size:13px">${dlFmtN(v.ped)}</td>
      <td style="padding:10px 14px;text-align:right;font-size:13px">${dlFmtN(v.itens)}</td>
      <td style="padding:10px 14px;text-align:right;color:#38bdf8;font-size:12px">R$ ${dlFmt(ticket)}</td>
      <td style="padding:10px 14px;text-align:right;color:#f59e0b;font-size:12px">${ipd.toFixed(1)}</td>
    </tr>`;
  }).join('');
}

// ── Exportar Excel ─────────────────────────────────────────────────────────
function dlExportarExcel() {
  if (!_dlDados || !_dlDados.length) { dlToast('Importe uma planilha antes de exportar.','aviso'); return; }

  // Agrega dados por usuário
  const byUser = {};
  let totalFat = 0;
  _dlDados.forEach(r => {
    const u = r.usuario;
    if (!byUser[u]) byUser[u] = { nome: r.nome_usuario||dlNome(u), turno: r.turno, fat:0, ped:0, itens:0 };
    byUser[u].fat   += parseFloat(r.faturado)||0;
    byUser[u].ped   += 1;
    byUser[u].itens += parseInt(r.itens)||0;
    totalFat += parseFloat(r.faturado)||0;
  });
  const ranking = Object.entries(byUser).sort((a,b) => b[1].ped - a[1].ped);

  // Agrega por dia
  const byDia = {};
  _dlDados.forEach(r => {
    const k = r.data_fat;
    if (!byDia[k]) byDia[k] = { total:0, '1':0, '2':0, '3':0 };
    byDia[k].total += parseFloat(r.faturado)||0;
    if (byDia[k][r.turno] !== undefined) byDia[k][r.turno] += parseFloat(r.faturado)||0;
  });

  // ── Aba 1: Ranking ────────────────────────────────────────────────────────
  const abaRanking = [
    ['#', 'Colaborador', 'Turno', 'Faturamento (R$)', '% Total', 'Pedidos', 'Itens', 'Ticket Médio (R$)', 'Itens/Ped'],
    ...ranking.map(([,v], i) => [
      i + 1,
      v.nome,
      `Turno ${v.turno}`,
      parseFloat(v.fat.toFixed(2)),
      totalFat > 0 ? parseFloat((v.fat/totalFat*100).toFixed(2)) : 0,
      v.ped,
      v.itens,
      parseFloat((v.ped > 0 ? v.fat/v.ped : 0).toFixed(2)),
      parseFloat((v.ped > 0 ? v.itens/v.ped : 0).toFixed(1)),
    ])
  ];

  // ── Aba 2: Por Dia ────────────────────────────────────────────────────────
  const abaDia = [
    ['Data', 'Total (R$)', 'Turno 1 (R$)', 'Turno 2 (R$)', 'Turno 3 (R$)'],
    ...Object.keys(byDia).sort().map(k => {
      const [y,m,d] = k.split('-');
      return [
        `${d}/${m}/${y}`,
        parseFloat(byDia[k].total.toFixed(2)),
        parseFloat(byDia[k]['1'].toFixed(2)),
        parseFloat(byDia[k]['2'].toFixed(2)),
        parseFloat(byDia[k]['3'].toFixed(2)),
      ];
    })
  ];

  // ── Aba 3: Dados Brutos ───────────────────────────────────────────────────
  const abaDados = [
    ['Nº Pedido', 'Data', 'Hora', 'Colaborador', 'Turno', 'Faturamento (R$)', 'Itens', 'Status'],
    ..._dlDados.map(r => {
      const [y,m,d] = (r.data_fat||'').split('-');
      return [
        r.numero_pedido,
        (d && m && y) ? `${d}/${m}/${y}` : r.data_fat,
        r.hora_fat,
        r.nome_usuario || dlNome(r.usuario),
        `Turno ${r.turno}`,
        parseFloat(r.faturado) || 0,
        parseInt(r.itens) || 0,
        r.status_ped,
      ];
    })
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abaRanking), 'Ranking');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abaDia),     'Por Dia');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abaDados),   'Dados');

  const ini = document.getElementById('dl-ini')?.value || '';
  const fim = document.getElementById('dl-fim')?.value || '';
  const nomeArq = `dash-logistica_${(ini||'').replace(/-/g,'')}${fim?'-'+(fim||'').replace(/-/g,''):''}.xlsx`;
  XLSX.writeFile(wb, nomeArq);
  dlToast('✅ Excel exportado com sucesso!', 'sucesso');
}

// ── Exportar PDF (abre janela de impressão formatada) ──────────────────────
function dlExportarPDF() {
  if (!_dlDados || !_dlDados.length) { dlToast('Importe uma planilha antes de exportar.','aviso'); return; }

  const byUser = {};
  let totalFat = 0, totalPed = 0, totalItens = 0;
  const byTurno = { '1':{fat:0,ped:0}, '2':{fat:0,ped:0}, '3':{fat:0,ped:0} };

  _dlDados.forEach(r => {
    const u = r.usuario;
    if (!byUser[u]) byUser[u] = { nome: r.nome_usuario||dlNome(u), turno: r.turno, fat:0, ped:0, itens:0 };
    byUser[u].fat   += parseFloat(r.faturado)||0;
    byUser[u].ped   += 1;
    byUser[u].itens += parseInt(r.itens)||0;
    totalFat   += parseFloat(r.faturado)||0;
    totalPed   += 1;
    totalItens += parseInt(r.itens)||0;
    if (byTurno[r.turno]) { byTurno[r.turno].fat += parseFloat(r.faturado)||0; byTurno[r.turno].ped += 1; }
  });
  const ranking = Object.entries(byUser).sort((a,b) => b[1].ped - a[1].ped);

  const ini = document.getElementById('dl-ini')?.value || '';
  const fim = document.getElementById('dl-fim')?.value || '';
  const ICONS = ['🥇','🥈','🥉'];
  const T_COR = { '1':'#38bdf8','2':'#a78bfa','3':'#2dd4bf' };

  const linhas = ranking.map(([,v], i) => {
    const pct    = totalFat > 0 ? (v.fat/totalFat*100).toFixed(1) : '0.0';
    const ticket = v.ped > 0 ? v.fat/v.ped : 0;
    const ipd    = v.ped > 0 ? v.itens/v.ped : 0;
    const cor    = T_COR[v.turno] || '#6366f1';
    return `<tr>
      <td style="text-align:center;font-size:15px">${ICONS[i] || (i+1)}</td>
      <td><b>${escHtml(v.nome)}</b></td>
      <td style="text-align:center"><span style="color:${cor};font-weight:700">T${v.turno}</span></td>
      <td style="text-align:right;font-weight:700;color:#16a34a">R$ ${dlFmt(v.fat)}</td>
      <td style="text-align:right">${pct}%</td>
      <td style="text-align:right">${dlFmtN(v.ped)}</td>
      <td style="text-align:right">${dlFmtN(v.itens)}</td>
      <td style="text-align:right">R$ ${dlFmt(ticket)}</td>
      <td style="text-align:right">${ipd.toFixed(1)}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<title>Dash Logística — ${dlFmtBR(ini)} a ${dlFmtBR(fim)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1e293b; padding: 24px; }
  h1 { font-size: 18px; font-weight: 900; margin-bottom: 2px; }
  .sub { font-size: 11px; color: #64748b; margin-bottom: 18px; }
  .kpis { display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; }
  .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; min-width: 120px; flex: 1; }
  .kpi-lb { font-size: 8px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: .6px; margin-bottom: 4px; }
  .kpi-val { font-size: 16px; font-weight: 900; color: #0f172a; }
  .kpi-sub { font-size: 9px; color: #94a3b8; margin-top: 2px; }
  .secao { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .8px; color: #64748b; margin-bottom: 8px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: #f8fafc; }
  th { padding: 8px 10px; text-align: left; font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: #64748b; border-bottom: 1px solid #e2e8f0; }
  td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; font-size: 11px; }
  tr:hover td { background: #f8fafc; }
  .rodape { margin-top: 16px; font-size: 9px; color: #94a3b8; text-align: right; }
  @media print {
    body { padding: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tr { break-inside: avoid; }
  }
</style>
</head><body>
<h1>📊 Dash Logística</h1>
<div class="sub">Período: <b>${dlFmtBR(ini)}</b> a <b>${dlFmtBR(fim)}</b> &nbsp;·&nbsp; Gerado em ${new Date().toLocaleString('pt-BR')} &nbsp;·&nbsp; WMS Miess</div>

<div class="kpis">
  <div class="kpi"><div class="kpi-lb">💰 Faturamento Total</div><div class="kpi-val">R$ ${dlFmt(totalFat)}</div><div class="kpi-sub">${dlFmtN(totalPed)} pedidos</div></div>
  <div class="kpi"><div class="kpi-lb">📋 Total de Pedidos</div><div class="kpi-val">${dlFmtN(totalPed)}</div><div class="kpi-sub">${ranking.length} colaboradores</div></div>
  <div class="kpi"><div class="kpi-lb">📦 Total de Itens</div><div class="kpi-val">${dlFmtN(totalItens)}</div><div class="kpi-sub">${totalPed>0?(totalItens/totalPed).toFixed(1):0} itens/ped.</div></div>
  <div class="kpi"><div class="kpi-lb">🎯 Ticket Médio</div><div class="kpi-val">R$ ${dlFmt(totalPed>0?totalFat/totalPed:0)}</div><div class="kpi-sub">por pedido</div></div>
  <div class="kpi"><div class="kpi-lb" style="color:#38bdf8">☀️ Turno 1</div><div class="kpi-val" style="color:#38bdf8">R$ ${dlFmt(byTurno['1'].fat)}</div><div class="kpi-sub">${dlFmtN(byTurno['1'].ped)} ped.</div></div>
  <div class="kpi"><div class="kpi-lb" style="color:#a78bfa">🌅 Turno 2</div><div class="kpi-val" style="color:#a78bfa">R$ ${dlFmt(byTurno['2'].fat)}</div><div class="kpi-sub">${dlFmtN(byTurno['2'].ped)} ped.</div></div>
  <div class="kpi"><div class="kpi-lb" style="color:#2dd4bf">🌙 Turno 3</div><div class="kpi-val" style="color:#2dd4bf">R$ ${dlFmt(byTurno['3'].fat)}</div><div class="kpi-sub">${dlFmtN(byTurno['3'].ped)} ped.</div></div>
</div>

<div class="secao">🏆 Ranking Detalhado por Colaborador</div>
<table>
  <thead><tr>
    <th>#</th>
    <th>Colaborador</th>
    <th style="text-align:center">Turno</th>
    <th style="text-align:right">Faturamento</th>
    <th style="text-align:right">% Total</th>
    <th style="text-align:right">Pedidos</th>
    <th style="text-align:right">Itens</th>
    <th style="text-align:right">Ticket Médio</th>
    <th style="text-align:right">Itens/Ped</th>
  </tr></thead>
  <tbody>${linhas}</tbody>
</table>

<div class="rodape">Relatório gerado automaticamente pelo WMS Miess — Dash Logística</div>
<script>setTimeout(()=>window.print(),400);<\/script>
</body></html>`;

  const w = window.open('', '_blank', 'width=1000,height=700');
  if (!w) { dlToast('Pop-up bloqueado. Permita pop-ups para este site.', 'aviso'); return; }
  w.document.write(html);
  w.document.close();
}
