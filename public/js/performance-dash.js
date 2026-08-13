/* ══ WMS — Performance dos Separadores ══
   Versão 2 — cards gradiente + dropdown de colaboradores
   Pedidos, itens, SKUs, reposições, tempo médio por colaborador.
══════════════════════════════════════════════════════════════════════ */
'use strict';

// ── Estado ────────────────────────────────────────────────────────────────
let _pfDados      = null;   // resposta completa da API
let _pfFiltrados  = [];     // colaboradores após filtro de nome
let _pfUsuarios   = [];     // todos os usuários ativos (para o dropdown)
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
const PF_LABEL_TURNO = { Manha:'Manhã', Tarde:'Tarde', Noite:'Noite' };
const PF_GRID = { color:'rgba(51,65,85,.25)' };
const PF_TICK = { color:'#64748b', font:{ size:10 } };

function pfCor(turno) { return PF_COR_TURNO[turno] || '#8B5CF6'; }
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
  _pfAbaAtiva   = 'resumo';
  _pfDados      = null;
  _pfFiltrados  = [];

  pag.innerHTML = `
  <div style="padding:0 0 40px">

    <div class="pg-title" style="margin-bottom:14px">Performance Logística</div>

    <!-- ABAS PRINCIPAIS -->
    <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap">
      <button id="pf-tab-resumo" onclick="pfSwitchTab('resumo')" class="rel-turno-btn ativo">
        Resumo
      </button>
      <button id="pf-tab-tempos" onclick="pfSwitchTab('tempos')" class="rel-turno-btn">
        <i class="ti ti-clock" aria-hidden="true"></i> Tempos por Pedido
      </button>
      <button id="pf-tab-ocorrencias" onclick="pfSwitchTab('ocorrencias')" class="rel-turno-btn">
        Ocorrências
      </button>
      <button id="pf-tab-metas" onclick="pfSwitchTab('metas')" class="rel-turno-btn">
        Metas
      </button>
    </div>

    <!-- FILTROS (compartilhado entre abas) -->
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
          <option value="Manha">Manhã</option>
          <option value="Tarde">Tarde</option>
          <option value="Noite">Noite</option>
        </select>
      </div>
      <div id="pf-colab-wrap">
        <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.8px;margin-bottom:3px">COLABORADOR</div>
        <select id="pf-colab" onchange="pfAplicarFiltroColab()"
          style="padding:7px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px;outline:none;min-width:160px">
          <option value="">Todos os colaboradores</option>
        </select>
      </div>
      <button id="pf-btn-filtrar" onclick="pfFiltrarAtivo()" style="background:var(--accent);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:12px;font-weight:700;cursor:pointer">Filtrar</button>
      <button onclick="pfInicializar()" style="background:var(--surface2);color:var(--text3);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:12px;cursor:pointer"><i class="ti ti-x" aria-hidden="true"></i> Limpar</button>
      <button onclick="pfExportarExcel()" style="background:var(--green);color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer">Excel</button>
      <button onclick="pfAbrirAnalisePdf()" style="background:var(--red);color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer"><i class="ti ti-file-text" aria-hidden="true"></i> Análise PDF</button>
      <span id="pf-filtro-info" style="margin-left:auto;font-size:11px;color:var(--text3);align-self:center"></span>
    </div>

    <!-- LOADING -->
    <div id="pf-loading" style="display:none;text-align:center;padding:48px;color:var(--text3)">
      <div style="font-size:24px;margin-bottom:8px"><i class="ti ti-loader-2" aria-hidden="true"></i></div>
      <div>Carregando dados...</div>
    </div>

    <!-- VAZIO -->
    <div id="pf-vazio" style="display:none;text-align:center;padding:72px 24px;color:var(--text3)">
      
      <div style="font-size:15px;font-weight:700;margin-bottom:6px">Nenhum dado encontrado</div>
      <div style="font-size:12px">Ajuste o período e tente novamente</div>
    </div>

    <!-- ABA RESUMO -->
    <div id="pf-conteudo" style="display:none">

      <!-- KPI CARDS GRADIENTE -->
      <div id="pf-kpis" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px;margin-bottom:24px"></div>

      <!-- Pedidos por colaborador (full width) -->
      <div class="card" style="padding:16px 18px;margin-bottom:16px">
        <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:14px">Pedidos por colaborador</div>
        <div style="position:relative;height:300px"><canvas id="pf-chart-pedidos"></canvas></div>
      </div>

      <!-- Itens + SKUs -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px" class="pf-grid-2">
        <div class="card" style="padding:16px 18px">
          <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:14px">Itens por colaborador</div>
          <div style="position:relative;height:260px"><canvas id="pf-chart-itens"></canvas></div>
        </div>
        <div class="card" style="padding:16px 18px">
          <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:14px">SKUs POR COLABORADOR</div>
          <div style="position:relative;height:260px"><canvas id="pf-chart-skus"></canvas></div>
        </div>
      </div>

      <!-- Reposições + Tempo médio -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px" class="pf-grid-2">
        <div class="card" style="padding:16px 18px">
          <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:14px">Reposições por colaborador</div>
          <div style="position:relative;height:260px"><canvas id="pf-chart-repos"></canvas></div>
        </div>
        <div class="card" style="padding:16px 18px">
          <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:14px"><i class="ti ti-clock" aria-hidden="true"></i> Tempo médio por pedido (min)</div>
          <div style="position:relative;height:260px"><canvas id="pf-chart-tempo"></canvas></div>
        </div>
      </div>

      <!-- Evolução diária -->
      <div id="pf-dia-wrap" class="card" style="padding:16px 18px;margin-bottom:20px">
        <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;margin-bottom:14px">Evolução diária de pedidos</div>
        <div style="position:relative;height:220px"><canvas id="pf-chart-dia"></canvas></div>
      </div>

      <!-- Ranking -->
      <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:12px 18px;background:var(--surface2);border-bottom:1px solid var(--border);font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.8px;display:flex;align-items:center;gap:8px">
          RANKING DETALHADO
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

    </div><!-- /pf-conteudo (resumo) -->

    <!-- ABA TEMPOS -->
    <div id="pf-tempos-conteudo" style="display:none">
      <div id="pf-timing-wrap">
        <div style="text-align:center;padding:64px 24px;color:var(--text3)">
          <div style="font-size:36px;margin-bottom:12px"><i class="ti ti-clock" aria-hidden="true"></i></div>
          <div style="font-size:14px;font-weight:700;margin-bottom:6px">Selecione o período e clique em Filtrar</div>
          <div style="font-size:12px">Verá o início e fim de cada operação por colaborador</div>
        </div>
      </div>
    </div>

    <!-- ABA OCORRÊNCIAS -->
    <div id="pf-ocorrencias-conteudo" style="display:none">
      <div id="pf-ocorrencias-wrap"></div>
    </div>

    <!-- ABA METAS -->
    <div id="pf-metas-conteudo" style="display:none">
      <div id="pf-metas-wrap">
        <div style="text-align:center;padding:64px 24px;color:var(--text3)">
          
          <div style="font-size:14px;font-weight:700;margin-bottom:6px">Selecione o período e clique em Filtrar</div>
          <div style="font-size:12px">Exibe metas proporcionais ao tempo logado em cada função</div>
        </div>
      </div>
    </div>

  </div>`;

  if (!document.getElementById('pf-grid-style')) {
    const s = document.createElement('style');
    s.id = 'pf-grid-style';
    s.textContent = `@media(max-width:800px){.pf-grid-2{grid-template-columns:1fr !important}}`;
    document.head.appendChild(s);
  }

  pfInicializar();
}

// ── Controle de abas principais ───────────────────────────────────────────
let _pfAbaAtiva = 'resumo';

function pfSwitchTab(aba) {
  _pfAbaAtiva = aba;
  const tabs = { resumo:'pf-tab-resumo', tempos:'pf-tab-tempos', ocorrencias:'pf-tab-ocorrencias', metas:'pf-tab-metas' };
  const divs = { resumo:'pf-conteudo', tempos:'pf-tempos-conteudo', ocorrencias:'pf-ocorrencias-conteudo', metas:'pf-metas-conteudo' };
  // Reset todos os botões
  Object.values(tabs).forEach(id => {
    const b = document.getElementById(id);
    if (b) b.classList.remove('ativo');
  });
  // Ativa o botão atual
  const btn = document.getElementById(tabs[aba]);
  if (btn) btn.classList.add('ativo');
  // Mostra só o div correto
  Object.entries(divs).forEach(([k,id]) => {
    const d = document.getElementById(id);
    if (d) d.style.display = (k === aba) ? '' : 'none';
  });
  // Esconde sempre os estados de loading/vazio do Resumo ao trocar de aba
  const vaziEl   = document.getElementById('pf-vazio');
  const loadEl   = document.getElementById('pf-loading');

  if (aba === 'resumo') {
    const d = document.getElementById('pf-conteudo');
    if (d) d.style.display = _pfDados ? '' : 'none';
    if (!_pfDados && vaziEl) vaziEl.style.display = '';
  } else {
    // Nas abas Tempos e Ocorrências, o loading/vazio do Resumo não deve aparecer
    if (vaziEl)  vaziEl.style.display  = 'none';
    if (loadEl)  loadEl.style.display  = 'none';
    if (aba === 'tempos') {
      if (!_pfTiming) pfCarregarTiming();
    } else if (aba === 'ocorrencias') {
      pfCarregarOcorrencias();
    } else if (aba === 'metas') {
      pfCarregarMetas();
    }
  }
}

function pfFiltrarAtivo() {
  if (_pfAbaAtiva === 'tempos') {
    _pfTiming = null;
    pfCarregarTiming();
  } else if (_pfAbaAtiva === 'ocorrencias') {
    pfCarregarOcorrencias();
  } else if (_pfAbaAtiva === 'metas') {
    pfCarregarMetas();
  } else {
    pfBuscarDados();
  }
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

  // Carrega todos os usuários ativos para o dropdown (só na primeira vez)
  if (!_pfUsuarios.length) {
    const usuarios = await apiFetch('/usuarios?status=ativo&_=' + Date.now());
    if (Array.isArray(usuarios)) {
      _pfUsuarios = usuarios.sort((a,b) => (a.nome||'').localeCompare(b.nome||''));
    }
  }
  pfPopularDropdownTodos();

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

  document.getElementById('pf-loading').style.display        = '';
  document.getElementById('pf-conteudo').style.display       = 'none';
  document.getElementById('pf-tempos-conteudo').style.display = 'none';
  document.getElementById('pf-vazio').style.display          = 'none';
  _pfTiming = null;

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
        Dados recebidos mas cards não renderizaram.<br>
        <b>${dados.colaboradores.length} colaborador(es):</b>
        ${dados.colaboradores.map(c=>`${pfEsc(c.nome||'?')} (${c.pedidos} ped)`).join(', ')}<br>
        <small>Abra o console do navegador (F12 → Console) para ver o erro.</small>
      </div>`;
    }
  }, 500);
}

// ── Popula dropdown com TODOS os usuários ativos ──────────────────────────
function pfPopularDropdownTodos() {
  const sel = document.getElementById('pf-colab');
  if (!sel) return;
  const valorAtual = sel.value;
  sel.innerHTML = '<option value="">Todos os colaboradores</option>' +
    _pfUsuarios.map(u => `<option value="${pfEsc(u.nome)}">${pfEsc(u.nome)}</option>`).join('');
  if (valorAtual && [...sel.options].some(o => o.value === valorAtual)) sel.value = valorAtual;
}

// mantém compatibilidade com chamadas antigas
function pfPopularDropdownColab() { pfPopularDropdownTodos(); }

// ── Filtra por colaborador e renderiza (ambas as abas) ────────────────────
function pfAplicarFiltroColab() {
  const nome = document.getElementById('pf-colab')?.value || '';
  const ini  = document.getElementById('pf-ini')?.value   || '';
  const fim  = document.getElementById('pf-fim')?.value   || '';

  const inf = document.getElementById('pf-filtro-info');

  // ── Aba Tempos: re-renderiza com filtro ──────────────────────────────────
  if (_pfAbaAtiva === 'tempos') {
    if (_pfTiming) pfRenderTiming(nome);
    if (inf) inf.textContent = nome ? `${pfFmtBR(ini)} a ${pfFmtBR(fim)} · ${nome}` : `${pfFmtBR(ini)} a ${pfFmtBR(fim)}`;
    return;
  }

  // ── Aba Resumo ───────────────────────────────────────────────────────────
  if (!_pfDados) return;

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

  const diaWrap = document.getElementById('pf-dia-wrap');
  if (diaWrap) diaWrap.style.display = nome ? 'none' : '';

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
      Erro ao renderizar os dados: <b>${pfEsc(err.message)}</b><br>
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
    <div class="pipeline-card-kpi">
      <div class="pipeline-card-kpi-lbl">${label}</div>
      <div class="pipeline-card-kpi-val" style="font-size:15px">${val}</div>
    </div>`;

  const card = (cor, label, num, desc, stats) => `
    <div class="pipeline-card" style="border-top:3px solid ${cor}">
      <div class="pipeline-card-top">
        <div class="pipeline-card-hd">
          <span class="pipeline-card-dot" style="background:${cor}"></span>
          <span class="pipeline-card-label">${label}</span>
        </div>
        <div class="pipeline-card-value">${num}</div>
        <div class="pipeline-card-sub">${desc}</div>
      </div>
      <div class="pipeline-card-kpis">${stats}</div>
    </div>`;

  const nomeAtual  = document.getElementById('pf-colab')?.value || '';
  const ruasRaw    = _pfDados?.ruas || [];
  const ruasFiltradas = (() => {
    const src = nomeAtual ? ruasRaw.filter(r => r.nome === nomeAtual) : ruasRaw;
    const m = {};
    src.forEach(r => {
      if (!m[r.rua]) m[r.rua] = { rua: r.rua, itens: 0, pedidos: 0 };
      m[r.rua].itens   += r.itens   || 0;
      m[r.rua].pedidos += r.pedidos || 0;
    });
    return Object.values(m).sort((a, b) => b.itens - a.itens);
  })();
  const ruas       = ruasFiltradas;
  const topRua     = ruas[0];
  const top6       = ruas.slice(0, 6);
  const maxItens   = top6[0]?.itens || 1;
  const TOTAL_RUAS = 27;

  const ruaBars = top6.length ? `
    <div style="padding:0 16px 14px">
      <div style="border-top:1px solid var(--border);margin:0 0 8px"></div>
      <div class="pipeline-card-kpi-lbl" style="margin-bottom:6px">Top ruas</div>
      ${top6.map(r => {
        const pct = Math.round(r.itens / maxItens * 100);
        return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
          <div style="width:20px;font-size:10px;font-weight:800;color:var(--text2);text-align:right;flex-shrink:0">${r.rua}</div>
          <div style="flex:1;background:var(--surface2);border-radius:3px;height:5px;overflow:hidden">
            <div style="width:${pct}%;background:var(--green);height:100%;border-radius:3px"></div>
          </div>
          <div style="width:32px;font-size:9px;font-weight:600;color:var(--text3);text-align:right;flex-shrink:0">${r.itens}</div>
        </div>`;
      }).join('')}
    </div>` : '';

  const ruasCard = `
    <div class="pipeline-card" style="border-top:3px solid var(--green)">
      <div class="pipeline-card-top">
        <div class="pipeline-card-hd">
          <span class="pipeline-card-dot" style="background:var(--green)"></span>
          <span class="pipeline-card-label">Ruas</span>
        </div>
        <div class="pipeline-card-value">${ruas.length}</div>
        <div class="pipeline-card-sub">ruas percorridas</div>
      </div>
      <div class="pipeline-card-kpis">
        ${mini('Mais ativa', topRua?.rua || '—')}
        ${mini('Itens lá', pfFmtN(topRua?.itens || 0))}
        ${mini('Cobertura', ruas.length ? Math.round(ruas.length / TOTAL_RUAS * 100) + '%' : '—')}
        ${mini('No armazém', TOTAL_RUAS + ' ruas')}
      </div>
      ${ruaBars}
    </div>`;

  // ── Checkout e Embalagem — vêm prontos do backend (não dependem do filtro de colaborador) ──
  const setorCard = (cor, label, setor, unidade) => {
    if (!setor) return '';
    const tempoTxt = setor.tempo_medio_min != null ? setor.tempo_medio_min.toFixed(1)+' min' : '—';
    const rapNome = setor.mais_rapido?.nome ? setor.mais_rapido.nome.split(' ')[0] : '—';
    return card(
      cor, label, pfFmtN(setor.concluidos), `${unidade} concluídos`,
      mini('Itens', pfFmtN(setor.itens||0)) +
      mini('Pendentes', pfFmtN(setor.pendentes)) +
      mini('Tempo médio', tempoTxt) +
      mini('Mais rápido', rapNome !== '—' && setor.mais_rapido ? `${rapNome} (${setor.mais_rapido.tempo_medio_min.toFixed(1)}m)` : '—')
    );
  };

  document.getElementById('pf-kpis').innerHTML =
    card(
      '#4f46e5',
      'Separação', pfFmtN(totPed), 'pedidos concluídos',
      mini('Colaboradores', nColab) +
      mini('Itens/ped', itensPed) +
      mini('Total itens', pfFmtN(totItens)) +
      mini('Total SKUs', pfFmtN(totSkus))
    ) +
    card(
      '#db2777',
      'Itens', pfFmtN(totItens), 'itens separados',
      mini('Total SKUs', pfFmtN(totSkus)) +
      mini('SKUs/ped', skusPed) +
      mini('Mais itens', liderPed ? (liderPed.nome||'?').split(' ')[0] : '—') +
      mini('Média/dia', _pfDados?.por_dia?.length ? pfFmtN(Math.round(totItens / _pfDados.por_dia.length)) : '—')
    ) +
    card(
      '#ea580c',
      'Reposição', pfFmtN(totRep), 'reposições geradas',
      mini('% dos pedidos', repPct + '%') +
      mini('Tempo médio', _pfDados?.reposicao?.tempo_medio_min != null ? _pfDados.reposicao.tempo_medio_min.toFixed(1)+' min' : '—') +
      mini('Mais repos.', liderRep?.reposicoes ? (liderRep.nome||'?').split(' ')[0] : '—') +
      mini('Méd/colab', nColab > 0 ? (totRep / nColab).toFixed(1) : '0')
    ) +
    card(
      '#7c3aed',
      'Tempo médio', tempoMed != null ? tempoMed.toFixed(1)+' min' : '—', 'por pedido (separação)',
      mini('Mais rápido', tempoMin ? (tempoMin.nome||'?').split(' ')[0]+' ('+tempoMin.t.toFixed(1)+'m)' : '—') +
      mini('Mais lento', tempoMax ? (tempoMax.nome||'?').split(' ')[0]+' ('+tempoMax.t.toFixed(1)+'m)' : '—') +
      mini('Com tempo', pfFmtN(nComTempo)) +
      mini('Sem tempo', pfFmtN(nColab - nComTempo))
    ) +
    setorCard('var(--info)', 'Checkout',  _pfDados?.checkout,  'pedidos') +
    setorCard('var(--green)', 'Embalagem', _pfDados?.embalagem, 'pedidos') +
    ruasCard;
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
  const ICONS = ['1º','2º','3º'];
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
        <span style="background:${T_BG[c.turno]||'rgba(79,70,229,.12)'};color:${T_TXT[c.turno]||'var(--accent)'};border-radius:20px;padding:2px 10px;font-size:10px;font-weight:800">
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
  if (!wrap || !ini || !fim) return;

  wrap.innerHTML = `
    <div style="text-align:center;padding:48px;color:var(--text3)">
      <div style="font-size:28px;margin-bottom:10px"><i class="ti ti-loader-2" aria-hidden="true"></i></div>
      <div style="font-size:13px">Buscando tempos...</div>
    </div>`;

  const qs = new URLSearchParams({ ini, fim });
  if (turno) qs.set('turno', turno);
  qs.set('_', Date.now());

  const dados = await apiFetch(`/performance/timing?${qs}`);

  if (!dados || dados.erro) {
    wrap.innerHTML = `<div style="padding:20px;color:#ef4444;font-size:13px">${pfEsc(dados?.erro || 'Erro ao carregar')}</div>`;
    return;
  }
  _pfTiming = dados;
  pfRenderTiming();
}

function pfRenderTiming(filtroNome) {
  const wrap = document.getElementById('pf-timing-wrap');
  if (!wrap || !_pfTiming) return;
  if (filtroNome === undefined) filtroNome = document.getElementById('pf-colab')?.value || '';

  const ABAS = [
    { id:'separacao', label:'Separação', cor:'#4f46e5' },
    { id:'reposicao', label:'Reposição', cor:'#d97706' },
    { id:'checkout',  label:'Checkout',  cor:'#db2777' },
    { id:'embalagem', label:'Embalagem', cor:'#7c3aed' },
  ];
  const abaAtual = ABAS.find(a => a.id === _pfTimingAba) || ABAS[0];

  const fmtHora = v => {
    if (!v) return '—';
    return v.includes('T') ? v.slice(11,16) : v.slice(0,5);
  };
  const fmtDur = min => {
    if (min == null) return '—';
    if (min < 1) return `${Math.round(min*60)}s`;
    return `${min.toFixed(1)} min`;
  };
  const badgeDur = (min) => {
    if (min == null) return `<span style="color:var(--text3);font-size:11px">—</span>`;
    const cor  = min <= 5 ? '#16a34a' : min <= 15 ? '#d97706' : '#dc2626';
    const bg   = min <= 5 ? 'rgba(22,163,74,.12)' : min <= 15 ? 'rgba(217,119,6,.12)' : 'rgba(220,38,38,.12)';
    return `<span style="background:${bg};color:${cor};border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;white-space:nowrap">${fmtDur(min)}</span>`;
  };

  // Sub-abas
  const subAbas = ABAS.map(a => {
    const n = (_pfTiming[a.id]||[]).length;
    const ativo = a.id === _pfTimingAba;
    return `<button onclick="pfSwitchAba('${a.id}')"
      style="display:flex;align-items:center;gap:6px;padding:9px 16px;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;transition:all .2s;
             background:${ativo ? a.cor+'1a' : 'var(--surface2)'};color:${ativo ? a.cor : 'var(--text3)'};border:1.5px solid ${ativo ? a.cor : 'transparent'}">
      <span>${a.label}</span>
      <span style="background:${ativo ? a.cor+'22' : 'var(--border)'};color:${ativo ? a.cor : 'var(--text3)'};border-radius:20px;padding:1px 7px;font-size:10px;font-weight:800">${n}</span>
    </button>`;
  }).join('');

  // Dados da aba ativa — aplica filtro de colaborador se selecionado
  const dadosBrutos = _pfTiming[_pfTimingAba] || [];
  const dados = filtroNome
    ? dadosBrutos.filter(r => (r.colaborador||'') === filtroNome)
    : dadosBrutos;

  // KPI rápido da aba
  const totalCom  = dados.filter(r => r.duracao_min != null).length;
  const mediaGeral= totalCom ? dados.reduce((s,r)=>s+(r.duracao_min||0),0)/totalCom : null;
  const minDur    = totalCom ? Math.min(...dados.filter(r=>r.duracao_min!=null).map(r=>r.duracao_min)) : null;
  const maxDur    = totalCom ? Math.max(...dados.filter(r=>r.duracao_min!=null).map(r=>r.duracao_min)) : null;
  const nColab    = new Set(dados.map(r=>r.colaborador).filter(Boolean)).size;

  const kpiBar = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-bottom:20px">
      ${[
        ['REGISTROS', dados.length, ''],
        ['COLABORADORES', nColab, ''],
        ['TEMPO MÉDIO', mediaGeral!=null?fmtDur(mediaGeral):'—', ''],
        ['MAIS RÁPIDO', minDur!=null?fmtDur(minDur):'—', 'color:#16a34a'],
        ['MAIS LENTO',  maxDur!=null?fmtDur(maxDur):'—', 'color:#dc2626'],
        _pfTimingAba==='reposicao' ? ['ENCONTRADOS',
          dados.filter(r=>['encontrado','buscado','abastecido'].includes(r.resultado)).length,'color:#16a34a'] : null,
        _pfTimingAba==='reposicao' ? ['NÃO ENCONTR.',
          dados.filter(r=>['nao_encontrado','protocolo'].includes(r.resultado)).length,'color:#dc2626'] : null,
      ].filter(Boolean).map(([lbl,val,sty])=>`
        <div style="background:var(--surface2);border-radius:10px;padding:12px 14px">
          <div style="font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.6px;margin-bottom:4px">${lbl}</div>
          <div style="font-size:20px;font-weight:900;${sty}">${val}</div>
        </div>`).join('')}
    </div>`;

  // Nota informativa
  const nota = _pfTimingAba==='separacao'
    ? `<div style="display:flex;align-items:center;gap:8px;background:rgba(79,70,229,.08);border:1px solid rgba(79,70,229,.2);border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:var(--accent)">
        ℹ️ Tempo de separação <strong>não inclui</strong> o tempo aguardando reposição de item.
       </div>` : '';

  // Agrupar por colaborador
  const grupos = {};
  dados.forEach(r => {
    const k = r.colaborador || '—';
    if (!grupos[k]) grupos[k] = [];
    grupos[k].push(r);
  });

  let tabelasHtml = '';
  if (!Object.keys(grupos).length) {
    tabelasHtml = `<div style="text-align:center;padding:48px 24px;color:var(--text3)">
      <div style="font-size:32px;margin-bottom:10px">${abaAtual.icon}</div>
      <div style="font-size:13px;font-weight:700">Nenhum registro de ${abaAtual.label} no período</div>
    </div>`;
  } else {
    const TH = `padding:8px 14px;font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.6px;text-transform:uppercase;`;

    Object.entries(grupos).sort(([a],[b])=>a.localeCompare(b)).forEach(([nome, rows]) => {
      const nCom  = rows.filter(r=>r.duracao_min!=null).length;
      const media = nCom ? rows.reduce((s,r)=>s+(r.duracao_min||0),0)/nCom : null;

      // cabeçalho do colaborador — card com gradiente sutil
      let statsExtra = '';
      if (_pfTimingAba === 'reposicao') {
        const enc    = rows.filter(r=>['encontrado','buscado','abastecido'].includes(r.resultado)).length;
        const naoEnc = rows.filter(r=>['nao_encontrado','protocolo'].includes(r.resultado)).length;
        statsExtra = `
          <div style="font-size:11px"><b style="color:#16a34a">${enc}</b> encontrado(s)</div>
          <div style="font-size:11px"><b style="color:#dc2626">${naoEnc}</b> não encontrado(s)</div>`;
      }

      const linhas = rows.map((r,i) => {
        const dataFmt = r.data ? (()=>{const[y,m,d]=r.data.split('-');return`${d}/${m}`;})() : '';
        let extraCells = '';
        if (_pfTimingAba === 'reposicao') {
          const resMap = {encontrado:'Enc',buscado:'Enc',abastecido:'Abast',nao_encontrado:'NE',protocolo:'Proto'};
          extraCells = `
            <td style="padding:8px 14px;text-align:center;font-size:13px">${resMap[r.resultado]||'?'}</td>
            <td style="padding:8px 14px;max-width:200px">
              <div style="font-size:10px;font-weight:700;color:var(--text3)">${pfEsc(r.codigo||'')}</div>
              <div style="font-size:11px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${pfEsc(r.descricao||'')}">${pfEsc((r.descricao||'').slice(0,35))}</div>
            </td>`;
        } else if (_pfTimingAba === 'separacao' || _pfTimingAba === 'checkout' || _pfTimingAba === 'embalagem') {
          extraCells = `
            <td style="padding:8px 14px;text-align:right;font-size:12px;font-weight:700;color:#38bdf8">${r.total_itens ?? '—'}</td>
            <td style="padding:8px 14px;text-align:right;font-size:12px;color:#f59e0b">${r.skus ?? '—'}</td>`;
        }
        const bg = i%2===0 ? 'transparent' : 'rgba(51,65,85,.04)';
        return `<tr style="background:${bg}">
          <td style="padding:8px 14px;font-size:12px;font-weight:700;color:var(--text)">${pfEsc(r.numero_pedido||'—')}</td>
          <td style="padding:8px 14px;font-size:11px;color:var(--text3)">${dataFmt}</td>
          <td style="padding:8px 14px;font-size:12px;color:var(--text);font-weight:600">${fmtHora(r.iniciado_em)}</td>
          <td style="padding:8px 14px;font-size:12px;color:var(--text);font-weight:600">${fmtHora(r.concluido_em)}</td>
          ${extraCells}
          <td style="padding:8px 14px;text-align:right">${badgeDur(r.duracao_min)}</td>
        </tr>`;
      }).join('');

      const extraTh = _pfTimingAba==='reposicao'
        ? `<th style="${TH}text-align:center">RESULT.</th><th style="${TH}">ITEM</th>`
        : ['separacao','checkout','embalagem'].includes(_pfTimingAba)
        ? `<th style="${TH}text-align:right">ITENS</th><th style="${TH}text-align:right">SKUs</th>`
        : '';

      tabelasHtml += `
        <div class="card" style="padding:0;overflow:hidden;margin-bottom:16px">
          <div style="background:${abaAtual.grad};padding:14px 18px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
            <div>
              <div style="font-size:14px;font-weight:800;color:#fff">${pfEsc(nome)}</div>
              <div style="font-size:11px;color:rgba(255,255,255,.75);margin-top:2px">${rows.length} registro(s)</div>
            </div>
            <div style="display:flex;gap:16px;margin-left:auto;flex-wrap:wrap;align-items:center">
              ${statsExtra}
              ${media!=null ? `<div style="background:rgba(255,255,255,.15);border-radius:20px;padding:4px 14px;color:#fff;font-size:12px;font-weight:700">⌀ ${fmtDur(media)}</div>` : ''}
            </div>
          </div>
          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse">
              <thead style="background:var(--surface2);border-bottom:1px solid var(--border)">
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
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px">${subAbas}</div>
    ${nota}
    ${kpiBar}
    ${tabelasHtml}`;
}

function pfSwitchAba(id) {
  _pfTimingAba = id;
  pfRenderTiming();  // filtroNome vem do dropdown automaticamente
}

// ── Aba Ocorrências ────────────────────────────────────────────────────────
let _pfOcorrencias = [];

const OC_TIPOS = {
  processo_errado:      { label: 'Processo Errado',          icon: '',  cor: '#f59e0b' },
  absenteismo:          { label: 'Absenteísmo',              icon: '',  cor: '#ef4444' },
  conduta_inapropriada: { label: 'Conduta Inapropriada',     icon: '',  cor: '#dc2626' },
  atraso:               { label: 'Atraso',                   icon: '⏰',  cor: '#f97316' },
  descumprimento_norma: { label: 'Descumprimento de Norma',  icon: '',  cor: '#8b5cf6' },
  qualidade:            { label: 'Problema de Qualidade',    icon: '',  cor: '#db2777' },
  outro:                { label: 'Outro',                    icon: '',  cor: '#6b7280' },
};

const OC_GRAVIDADE = {
  leve:     { label: 'Leve',     bg: 'rgba(34,197,94,.12)',   cor: '#16a34a' },
  moderada: { label: 'Moderada', bg: 'rgba(245,158,11,.12)',  cor: '#d97706' },
  grave:    { label: 'Grave',    bg: 'rgba(220,38,38,.12)',   cor: '#dc2626' },
};

async function pfCarregarOcorrencias() {
  const wrap = document.getElementById('pf-ocorrencias-wrap');
  if (!wrap) return;
  const ini   = document.getElementById('pf-ini')?.value   || '';
  const fim   = document.getElementById('pf-fim')?.value   || '';
  const colab = document.getElementById('pf-colab')?.value || '';

  wrap.innerHTML = pfRenderOcorrenciasUI([], true);

  const qs = new URLSearchParams();
  if (ini)   qs.set('ini', ini);
  if (fim)   qs.set('fim', fim);
  if (colab) qs.set('colaborador', colab);
  qs.set('_', Date.now());

  const dados = await apiFetch(`/performance/ocorrencias?${qs}`);
  _pfOcorrencias = Array.isArray(dados) ? dados : [];
  wrap.innerHTML = pfRenderOcorrenciasUI(_pfOcorrencias, false);
}

function pfRenderOcorrenciasUI(lista, carregando) {
  const ini   = document.getElementById('pf-ini')?.value   || '';
  const fim   = document.getElementById('pf-fim')?.value   || '';
  const fmtDt = d => { if (!d) return ''; const [y,m,dd]=d.split('-'); return `${dd}/${m}/${y}`; };

  const tiposOpts = Object.entries(OC_TIPOS).map(([v,{label}])=>`<option value="${v}">${label}</option>`).join('');
  const gravsOpts = Object.entries(OC_GRAVIDADE).map(([v,{label}])=>`<option value="${v}">${label}</option>`).join('');
  const usuariosOpts = _pfUsuarios.map(u=>`<option value="${pfEsc(u.nome)}">${pfEsc(u.nome)}</option>`).join('');

  const INP = 'width:100%;padding:10px 12px;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;color:var(--text);font-size:14px;outline:none;box-sizing:border-box';
  const LBL = 'display:block;font-size:12px;font-weight:700;color:var(--text);margin-bottom:6px';

  // Formulário de registro
  const form = `
    <div class="card" style="padding:24px;margin-bottom:24px;border:1.5px solid var(--border)">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
        
        <div>
          <div style="font-size:15px;font-weight:800;color:var(--text)">Registrar Ocorrência</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px">Registre faltas, processos errados, condutas ou ausências de colaboradores</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px" class="pf-grid-2">
        <div>
          <label style="${LBL}">Colaborador <span style="color:#ef4444">*</span></label>
          <select id="oc-colab" style="${INP}">
            <option value="">— Selecione o colaborador —</option>${usuariosOpts}
          </select>
        </div>
        <div>
          <label style="${LBL}">Tipo de Ocorrência <span style="color:#ef4444">*</span></label>
          <select id="oc-tipo" style="${INP}">
            <option value="">— Selecione o tipo —</option>${tiposOpts}
          </select>
        </div>
        <div>
          <label style="${LBL}">Gravidade</label>
          <select id="oc-grav" style="${INP}">
            ${gravsOpts}
          </select>
        </div>
        <div>
          <label style="${LBL}">Data da ocorrência <span style="color:#ef4444">*</span></label>
          <input type="date" id="oc-data" value="${new Date().toISOString().slice(0,10)}" style="${INP}">
        </div>
        <div>
          <label style="${LBL}">Turno</label>
          <select id="oc-turno" style="${INP}">
            <option value="">— Selecione o turno —</option>
            <option value="Manha">Manhã</option>
            <option value="Tarde">Tarde</option>
            <option value="Noite">Noite</option>
          </select>
        </div>
      </div>

      <div style="margin-bottom:20px">
        <label style="${LBL}">Descrição / O que aconteceu <span style="color:#ef4444">*</span></label>
        <textarea id="oc-desc" rows="4"
          placeholder="Descreva com detalhes o que ocorreu: local, horário, o que foi feito de errado, impacto na operação..."
          style="${INP}resize:vertical;font-family:inherit;line-height:1.5"></textarea>
      </div>

      <button onclick="pfSalvarOcorrencia()"
        style="background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;border:none;border-radius:10px;padding:12px 24px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:8px">
        Registrar Ocorrência
      </button>
    </div>`;

  // Lista de ocorrências
  if (carregando) {
    return form + `<div style="text-align:center;padding:32px;color:var(--text3)">Carregando...</div>`;
  }

  // Totais por tipo
  const contTipo = {};
  const contGrav = {};
  lista.forEach(o => {
    contTipo[o.tipo] = (contTipo[o.tipo]||0) + 1;
    contGrav[o.gravidade] = (contGrav[o.gravidade]||0) + 1;
  });

  const kpis = lista.length === 0 ? '' : `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;margin-bottom:24px">
      <div style="background:var(--surface2);border-radius:12px;padding:16px 18px">
        <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:6px">Total de Ocorrências</div>
        <div style="font-size:32px;font-weight:900;color:var(--text)">${lista.length}</div>
      </div>
      ${Object.entries(contGrav).map(([g,n])=>{const gc=OC_GRAVIDADE[g]||{cor:'#6b7280',bg:'var(--surface2)',label:g};return`
      <div style="background:${gc.bg||'var(--surface2)'};border-radius:12px;padding:16px 18px">
        <div style="font-size:11px;font-weight:700;color:${gc.cor};margin-bottom:6px">${gc.label}</div>
        <div style="font-size:32px;font-weight:900;color:${gc.cor}">${n}</div>
      </div>`;}).join('')}
    </div>`;

  const rows = lista.length === 0
    ? `<div style="text-align:center;padding:48px;color:var(--text3)">
        
        <div style="font-size:13px;font-weight:700">Nenhuma ocorrência no período</div>
       </div>`
    : lista.map(o => {
        const t  = OC_TIPOS[o.tipo]    || { icon:'', label: o.tipo,      cor:'#6b7280' };
        const g  = OC_GRAVIDADE[o.gravidade] || { label: o.gravidade, bg:'var(--surface2)', cor:'#6b7280' };
        const tu = { Manha:'Manhã', Tarde:'Tarde', Noite:'Noite' }[o.turno] || o.turno || '—';
        // Borda esquerda colorida pela gravidade
        const bordaGrav = { leve:'#22c55e', moderada:'#f59e0b', grave:'#dc2626' }[o.gravidade] || '#6b7280';
        return `
          <div style="background:var(--surface);border:1.5px solid var(--border);border-left:4px solid ${bordaGrav};border-radius:12px;padding:18px 20px;margin-bottom:14px">
            <div style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap">
              <div style="flex:1;min-width:200px">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
                  <span style="font-size:20px">${t.icon}</span>
                  <span style="font-size:15px;font-weight:800;color:var(--text)">${pfEsc(o.colaborador_nome)}</span>
                  <span style="background:${g.bg};color:${g.cor};border-radius:20px;padding:3px 12px;font-size:12px;font-weight:700">${g.label}</span>
                  <span style="background:rgba(0,0,0,.07);color:${t.cor};border-radius:20px;padding:3px 12px;font-size:12px;font-weight:700">${t.label}</span>
                </div>
                <div style="font-size:14px;color:var(--text);line-height:1.5;margin-bottom:8px">${pfEsc(o.descricao)}</div>
                <div style="font-size:12px;color:var(--text3)">
                  ${fmtDt(o.data)} &nbsp;·&nbsp; ${tu} &nbsp;·&nbsp; Registrado por: <b style="color:var(--text2)">${pfEsc(o.supervisor_nome)}</b>
                </div>
              </div>
              <button onclick="pfExcluirOcorrencia(${o.id})"
                style="background:none;border:1.5px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text3);font-size:14px;cursor:pointer;flex-shrink:0"
                title="Excluir ocorrência">Excluir</button>
            </div>
          </div>`;
      }).join('');

  return form + kpis + `
    <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:14px">
      Ocorrências Registradas${lista.length ? ` — ${lista.length} no período` : ''}
    </div>
    ${rows}`;
}

async function pfSalvarOcorrencia() {
  const colaborador_nome = document.getElementById('oc-colab')?.value;
  const tipo             = document.getElementById('oc-tipo')?.value;
  const gravidade        = document.getElementById('oc-grav')?.value || 'leve';
  const descricao        = document.getElementById('oc-desc')?.value?.trim();
  const data             = document.getElementById('oc-data')?.value;
  const turno            = document.getElementById('oc-turno')?.value || '';

  if (!colaborador_nome) { pfToast('Selecione o colaborador.','aviso'); return; }
  if (!tipo)             { pfToast('Selecione o tipo de ocorrência.','aviso'); return; }
  if (!descricao)        { pfToast('Preencha a descrição.','aviso'); return; }
  if (!data)             { pfToast('Informe a data.','aviso'); return; }

  const r = await apiFetch('/performance/ocorrencias', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ colaborador_nome, tipo, gravidade, descricao, data, turno })
  });
  if (r) {
    pfToast('Ocorrência registrada!','sucesso');
    pfCarregarOcorrencias();
  }
}

async function pfExcluirOcorrencia(id) {
  if (!confirm('Excluir esta ocorrência? Ação não pode ser desfeita.')) return;
  const r = await apiFetch(`/performance/ocorrencias/${id}`, { method:'DELETE' });
  if (r) { pfToast('Ocorrência excluída.','sucesso'); pfCarregarOcorrencias(); }
}

// ── Exportar Excel ─────────────────────────────────────────────────────────
// ── Análise do turno (pontos de atenção) — regras simples sobre os dados já carregados ──
function pfGerarInsights() {
  const insights = [];
  const colab = _pfDados?.colaboradores || [];
  const comTempo = colab.filter(c => c.tempo_medio_min != null);

  if (comTempo.length >= 2) {
    const ordenado = [...comTempo].sort((a,b) => a.tempo_medio_min - b.tempo_medio_min);
    const rapido = ordenado[0], lento = ordenado[ordenado.length-1];
    if (lento.tempo_medio_min > rapido.tempo_medio_min * 1.5) {
      insights.push(`${pfEsc(lento.nome)} levou em média ${lento.tempo_medio_min.toFixed(1)} min por pedido — cerca de ${(lento.tempo_medio_min/rapido.tempo_medio_min).toFixed(1)}x mais que ${pfEsc(rapido.nome)} (${rapido.tempo_medio_min.toFixed(1)} min). Vale entender se foi complexidade dos pedidos recebidos ou dificuldade pontual.`);
    }
  }

  const totPed = colab.reduce((s,c) => s + (c.pedidos||0), 0);
  const totRep = colab.reduce((s,c) => s + (c.reposicoes||0), 0);
  if (totPed > 0) {
    const repPct = Math.round((totRep/totPed)*100);
    if (repPct > 40) insights.push(`${repPct}% dos pedidos precisaram de reposição de estoque — indica ruptura frequente nesse período. Vale revisar quais SKUs mais geraram falta.`);
  }

  const ck = _pfDados?.checkout;
  if (ck && (ck.concluidos + ck.pendentes) > 0) {
    const pctPend = Math.round((ck.pendentes/(ck.concluidos+ck.pendentes))*100);
    if (pctPend > 30) insights.push(`Checkout com ${ck.pendentes} pedido(s) pendente(s) (${pctPend}% do total do período) — pode estar represando a saída dos pedidos.`);
  }

  const emb = _pfDados?.embalagem;
  if (emb && (emb.concluidos + emb.pendentes) > 0) {
    const pctPend = Math.round((emb.pendentes/(emb.concluidos+emb.pendentes))*100);
    if (pctPend > 30) insights.push(`Embalagem com ${emb.pendentes} pedido(s) pendente(s) (${pctPend}% do total do período) — candidata a gargalo do turno.`);
  }

  const semTempo = colab.filter(c => c.tempo_medio_min == null).length;
  if (semTempo > 0) insights.push(`${semTempo} colaborador(es) sem tempo de separação registrado — verifique se estão batendo início/fim corretamente no app.`);

  if (!insights.length) insights.push('Nenhum ponto crítico identificado automaticamente para o período selecionado — operação dentro do esperado.');
  return insights;
}

function pfAbrirAnalisePdf() {
  if (!_pfDados) { pfToast('Carregue os dados antes de gerar a análise.', 'aviso'); return; }
  const ini   = document.getElementById('pf-ini')?.value || '';
  const fim   = document.getElementById('pf-fim')?.value || '';
  const turno = document.getElementById('pf-turno')?.value || '';
  const turnoLabel = { Manha:'Manhã', Tarde:'Tarde', Noite:'Noite' }[turno] || 'Todos';

  const colab      = _pfDados.colaboradores || [];
  const totPed     = colab.reduce((s,c) => s + (c.pedidos||0), 0);
  const totItens   = colab.reduce((s,c) => s + (c.itens||0), 0);
  const totRep     = colab.reduce((s,c) => s + (c.reposicoes||0), 0);
  const totSkus    = _pfDados.total_skus || 0;
  const totRuas    = new Set((_pfDados.ruas||[]).map(r => r.rua)).size;
  const comTempo   = colab.filter(c => c.tempo_medio_min != null);
  const tempoMedio = comTempo.length ? comTempo.reduce((s,c) => s+c.tempo_medio_min, 0) / comTempo.length : null;
  const ck  = _pfDados.checkout  || {};
  const emb = _pfDados.embalagem || {};
  const rep = _pfDados.reposicao || {};
  const insights = pfGerarInsights();

  const linha = (label, val) => `<tr><td style="padding:6px 10px;color:#555;font-size:12px">${label}</td><td style="padding:6px 10px;text-align:right;font-weight:700;font-size:12px">${val}</td></tr>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Análise do Turno</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;padding:32px;max-width:800px;margin:0 auto}
    h1{font-size:20px;margin-bottom:2px}
    .sub{color:#666;font-size:12px;margin-bottom:24px}
    h2{font-size:14px;margin:24px 0 8px;border-bottom:2px solid #4f46e5;padding-bottom:4px}
    table{width:100%;border-collapse:collapse;margin-bottom:8px}
    tr{border-bottom:1px solid #eee}
    ul{padding-left:18px;font-size:13px;line-height:1.7}
    li{margin-bottom:6px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .box{border:1px solid #ddd;border-radius:8px;padding:12px}
    .box h3{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#888;margin:0 0 4px}
    @media print{ body{padding:12px} }
  </style></head><body>
    <h1>Análise de Performance — Logística</h1>
    <div class="sub">Período: ${ini||'—'} a ${fim||'—'} · Turno: ${turnoLabel} · Gerado em ${new Date().toLocaleString('pt-BR')}</div>

    <h2>Resumo geral — todo o processo</h2>
    <div class="grid">
      <div class="box"><h3>Separação</h3><table>
        ${linha('Pedidos separados', pfFmtN(totPed))}
        ${linha('Itens separados', pfFmtN(totItens))}
        ${linha('SKUs (total)', pfFmtN(totSkus))}
        ${linha('Ruas percorridas (total)', pfFmtN(totRuas))}
        ${linha('Tempo médio de separação', tempoMedio!=null ? tempoMedio.toFixed(1)+' min' : '—')}
        ${linha('Colaboradores', colab.length)}
      </table></div>
      <div class="box"><h3>Reposição</h3><table>
        ${linha('Reposições geradas', pfFmtN(totRep))}
        ${linha('Tempo médio de resolução', rep.tempo_medio_min!=null ? rep.tempo_medio_min.toFixed(1)+' min' : '—')}
      </table></div>
      <div class="box"><h3>Checkout</h3><table>
        ${linha('Pedidos concluídos / pendentes', `${ck.concluidos||0} / ${ck.pendentes||0}`)}
        ${linha('Itens conferidos', pfFmtN(ck.itens||0))}
        ${linha('Tempo médio', ck.tempo_medio_min!=null ? ck.tempo_medio_min.toFixed(1)+' min' : '—')}
      </table></div>
      <div class="box"><h3>Embalagem</h3><table>
        ${linha('Pedidos concluídos / pendentes', `${emb.concluidos||0} / ${emb.pendentes||0}`)}
        ${linha('Itens embalados', pfFmtN(emb.itens||0))}
        ${linha('Tempo médio', emb.tempo_medio_min!=null ? emb.tempo_medio_min.toFixed(1)+' min' : '—')}
      </table></div>
    </div>

    <h2>Pontos de atenção</h2>
    <ul>${insights.map(i => `<li>${i}</li>`).join('')}</ul>

    <h2>Por colaborador (separação)</h2>
    <table>
      <tr style="border-bottom:2px solid #333;font-size:11px;text-transform:uppercase;color:#666">
        <td style="padding:6px 10px">Nome</td><td style="padding:6px 10px;text-align:right">Pedidos</td>
        <td style="padding:6px 10px;text-align:right">Itens</td><td style="padding:6px 10px;text-align:right">Reposições</td>
        <td style="padding:6px 10px;text-align:right">Tempo médio</td>
      </tr>
      ${colab.map(c => `<tr>
        <td style="padding:6px 10px;font-size:12px">${pfEsc(c.nome||'—')}</td>
        <td style="padding:6px 10px;text-align:right;font-size:12px">${c.pedidos||0}</td>
        <td style="padding:6px 10px;text-align:right;font-size:12px">${c.itens||0}</td>
        <td style="padding:6px 10px;text-align:right;font-size:12px">${c.reposicoes||0}</td>
        <td style="padding:6px 10px;text-align:right;font-size:12px">${c.tempo_medio_min!=null ? c.tempo_medio_min.toFixed(1)+' min' : '—'}</td>
      </tr>`).join('')}
    </table>

    <div style="margin-top:28px;text-align:center;color:#999;font-size:10px">Gerado automaticamente pelo WMS Miess — análise baseada em regras simples sobre os dados do período, não substitui avaliação humana.</div>
    <script>window.onload = () => setTimeout(() => window.print(), 300);<\/script>
  </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { pfToast('Habilite pop-ups no navegador para gerar a análise.', 'aviso'); return; }
  w.document.write(html);
  w.document.close();
}

function pfExportarExcel() {
  const ini = document.getElementById('pf-ini')?.value || '';
  const fim = document.getElementById('pf-fim')?.value || '';
  const fmtHora = v => { if (!v) return ''; return v.includes('T') ? v.slice(11,16) : v.slice(0,5); };
  const fmtData = d => { if (!d) return ''; const [y,m,dd]=d.split('-'); return `${dd}/${m}/${y}`; };

  // Na aba Ocorrências → exporta lista de ocorrências
  if (_pfAbaAtiva === 'ocorrencias') {
    if (!_pfOcorrencias.length) { pfToast('Nenhuma ocorrência para exportar.','aviso'); return; }
    const cols = ['Data','Colaborador','Tipo','Gravidade','Turno','Descrição','Registrado por'];
    const tipoLabel = v => OC_TIPOS[v]?.label || v;
    const gravLabel = v => OC_GRAVIDADE[v]?.label || v;
    const turnoLabel = v => ({ Manha:'Manhã', Tarde:'Tarde', Noite:'Noite' }[v] || v || '—');
    const rows = _pfOcorrencias.map(o => [
      fmtData(o.data), o.colaborador_nome, tipoLabel(o.tipo), gravLabel(o.gravidade),
      turnoLabel(o.turno), o.descricao, o.supervisor_nome
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cols, ...rows]), 'Ocorrências');
    XLSX.writeFile(wb, `ocorrencias_${(ini||'').replace(/-/g,'')}${fim?'-'+(fim).replace(/-/g,''):''}.xlsx`);
    pfToast('Excel exportado!','sucesso');
    return;
  }

  // Na aba Tempos → exporta pedido a pedido
  if (_pfAbaAtiva === 'tempos' && _pfTiming) {
    const ABAS_EXP = [
      { id:'separacao', label:'Separação',
        cols:['Colaborador','Pedido','Data','Início','Fim','Duração (min)','Total Itens','SKUs'],
        row: r => [r.colaborador||'', r.numero_pedido||'', fmtData(r.data), fmtHora(r.iniciado_em), fmtHora(r.concluido_em), r.duracao_min??'', r.total_itens??'', r.skus??''] },
      { id:'reposicao', label:'Reposição',
        cols:['Colaborador','Pedido','Data','Início','Fim','Duração (min)','Resultado','Código','Descrição'],
        row: r => [r.colaborador||'', r.numero_pedido||'', fmtData(r.data), fmtHora(r.iniciado_em), fmtHora(r.concluido_em), r.duracao_min??'', r.resultado||'', r.codigo||'', r.descricao||''] },
      { id:'checkout', label:'Checkout',
        cols:['Colaborador','Pedido','Data','Início','Fim','Total Itens','SKUs','Duração (min)'],
        row: r => [r.colaborador||'', r.numero_pedido||'', fmtData(r.data), fmtHora(r.iniciado_em), fmtHora(r.concluido_em), r.total_itens??'', r.skus??'', r.duracao_min??''] },
      { id:'embalagem', label:'Embalagem',
        cols:['Colaborador','Pedido','Data','Início','Fim','Total Itens','SKUs','Duração (min)'],
        row: r => [r.colaborador||'', r.numero_pedido||'', fmtData(r.data), fmtHora(r.iniciado_em), fmtHora(r.concluido_em), r.total_itens??'', r.skus??'', r.duracao_min??''] },
    ];
    const wb = XLSX.utils.book_new();
    let temDados = false;
    ABAS_EXP.forEach(({ id, label, cols, row }) => {
      const rows = _pfTiming[id] || [];
      if (!rows.length) return;
      temDados = true;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cols, ...rows.map(row)]), label);
    });
    if (!temDados) { pfToast('Nenhum dado de tempo para exportar.','aviso'); return; }
    XLSX.writeFile(wb, `tempos-por-pedido_${(ini||'').replace(/-/g,'')}${fim?'-'+(fim).replace(/-/g,''):''}.xlsx`);
    pfToast('Excel exportado!','sucesso');
    return;
  }

  // Aba Resumo → exporta agregado por colaborador
  const colab = _pfFiltrados?.length ? _pfFiltrados : _pfDados?.colaboradores;
  if (!colab?.length) { pfToast('Sem dados para exportar.','aviso'); return; }

  const nomeAtualExp = document.getElementById('pf-colab')?.value || '';
  const fmtTurno = v => v === 'Manha' ? 'Manhã' : (v || '');

  const abaResumo = [
    ['#','Colaborador','Turno','Pedidos','Itens','SKUs','Reposições','Itens/Ped','Tempo Médio (min)'],
    ...colab.map((c,i) => [
      i+1, c.nome, fmtTurno(c.turno),
      c.pedidos, c.itens, c.skus, c.reposicoes,
      c.pedidos > 0 ? parseFloat((c.itens/c.pedidos).toFixed(1)) : 0,
      c.tempo_medio_min != null ? parseFloat(c.tempo_medio_min.toFixed(1)) : '',
    ])
  ];

  const pcdSrc = (_pfDados?.por_colab_dia || []);
  const pcdFilt = nomeAtualExp ? pcdSrc.filter(r => r.colaborador === nomeAtualExp) : pcdSrc;
  const abaDia2 = [
    ['Data','Colaborador','Turno','Pedidos','Itens','SKUs','Ruas','Itens/Ped','Itens/Rua','Tempo Médio (min)'],
    ...pcdFilt.map(r => {
      const ped = r.pedidos || 0;
      const it  = r.itens   || 0;
      const ru  = r.ruas    || 0;
      return [
        fmtData(r.data), r.colaborador, fmtTurno(r.turno),
        ped, it, r.skus ?? '', ru,
        ped > 0 ? parseFloat((it/ped).toFixed(1)) : '',
        ru  > 0 ? parseFloat((it/ru).toFixed(1))  : '',
        r.tempo_medio != null ? parseFloat(r.tempo_medio) : '',
      ];
    })
  ];

  const ruasSrc = (_pfDados?.ruas || []);
  const ruasFilt = nomeAtualExp ? ruasSrc.filter(r => r.nome === nomeAtualExp) : ruasSrc;
  const ruasAgg = (() => {
    const m = {};
    ruasFilt.forEach(r => {
      const k = `${r.nome}||${r.rua}`;
      if (!m[k]) m[k] = { colaborador: r.nome, rua: r.rua, itens: 0, pedidos: 0 };
      m[k].itens   += r.itens   || 0;
      m[k].pedidos += r.pedidos || 0;
    });
    return Object.values(m).sort((a,b) => b.itens - a.itens);
  })();
  const abaRuas = [
    ['Colaborador','Rua','Itens','Pedidos','Itens/Pedido'],
    ...ruasAgg.map(r => [
      r.colaborador, r.rua, r.itens, r.pedidos,
      r.pedidos > 0 ? parseFloat((r.itens/r.pedidos).toFixed(1)) : '',
    ])
  ];

  const abaDia = [
    ['Data','Pedidos','Itens'],
    ...(_pfDados?.por_dia||[]).map(r => [fmtData(r.data), r.pedidos, r.itens])
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abaResumo), 'Resumo');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abaDia2),   'Por Colab-Dia');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abaRuas),   'Ruas');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abaDia),    'Por Dia');
  XLSX.writeFile(wb, `performance-separadores_${(ini||'').replace(/-/g,'')}${fim?'-'+(fim).replace(/-/g,''):''}.xlsx`);
  pfToast('Excel exportado!','sucesso');
}

// ── ABA METAS ─────────────────────────────────────────────────────────────
const PF_PERFIL_LABEL = {
  separador: 'Separação',
  checkout:  'Checkout',
  embalador: 'Embalagem',
  repositor: 'Reposição',
};
const PF_PERFIL_UNIDADE = {
  separador: 'pedidos',
  checkout:  'pedidos',
  embalador: 'pedidos',
  repositor: 'SKUs',
};

async function pfCarregarMetas() {
  const wrap = document.getElementById('pf-metas-wrap');
  if (!wrap) return;
  const ini = document.getElementById('pf-ini')?.value || '';
  const fim = document.getElementById('pf-fim')?.value || '';
  if (!ini || !fim) { wrap.innerHTML = `<div style="padding:48px;text-align:center;color:var(--text3)">Selecione o período e clique em Filtrar.</div>`; return; }

  wrap.innerHTML = `<div style="padding:48px;text-align:center;color:var(--text3)">Carregando metas...</div>`;

  const dados = await apiFetch(`/performance/metas?ini=${ini}&fim=${fim}`);
  if (!dados || dados.erro) {
    wrap.innerHTML = `<div style="padding:48px;text-align:center;color:var(--red)">Erro ao carregar metas.</div>`;
    return;
  }
  if (!dados.length) {
    wrap.innerHTML = `<div style="padding:48px;text-align:center;color:var(--text3)">Nenhum dado de sessão encontrado no período.<br><small>Os dados são registrados a partir de agora — logins anteriores a esta atualização não constam.</small></div>`;
    return;
  }

  // Agrupar por perfil
  const porPerfil = {};
  for (const r of dados) {
    if (!porPerfil[r.perfil]) porPerfil[r.perfil] = [];
    porPerfil[r.perfil].push(r);
  }

  const fmtMin = min => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}h${String(m).padStart(2,'0')}`;
  };
  const pctCor = pct => {
    if (pct === null) return '#64748b';
    if (pct >= 100) return '#22c55e';
    if (pct >= 80)  return '#f59e0b';
    return '#ef4444';
  };
  const fmtData = d => { if (!d) return '—'; const [y,m,dy] = d.split('-'); return `${dy}/${m}/${y}`; };

  const ordemPerfil = ['separador','checkout','embalador','repositor'];
  let html = '';

  for (const perfil of ordemPerfil) {
    const rows = porPerfil[perfil];
    if (!rows?.length) continue;

    // Totais consolidados por colaborador
    const totais = {};
    for (const r of rows) {
      if (!totais[r.nome]) totais[r.nome] = { nome: r.nome, turno: r.turno, minutos: 0, metaProp: 0, realizado: 0 };
      totais[r.nome].minutos   += r.minutos_logado;
      totais[r.nome].metaProp  += r.meta_proporcional;
      totais[r.nome].realizado += r.realizado;
    }

    html += `
    <div class="card" style="margin-bottom:16px;padding:0;overflow:hidden">
      <div style="padding:12px 18px;background:var(--surface2);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">
        <span style="font-size:14px;font-weight:900;color:var(--text)">${PF_PERFIL_LABEL[perfil]||perfil}</span>
        <span style="font-size:10px;color:var(--text3)">Meta cheia: ${rows[0].meta_cheia} ${PF_PERFIL_UNIDADE[perfil]||''}/turno</span>
      </div>

      <!-- Resumo por colaborador -->
      <div style="padding:12px 18px;border-bottom:1px solid var(--border)">
        <div style="font-size:9px;font-weight:800;color:var(--text3);letter-spacing:.5px;margin-bottom:10px">Resumo do período</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">
          ${Object.values(totais).map(t => {
            const pct = t.metaProp > 0 ? Math.round((t.realizado / t.metaProp) * 100) : null;
            const cor = pctCor(pct);
            const barW = pct !== null ? Math.min(100, pct) : 0;
            return `
            <div style="background:var(--surface2);border-radius:10px;padding:10px 12px;border:1px solid var(--border)">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <div style="font-size:12px;font-weight:800;color:var(--text)">${t.nome}</div>
                <span style="font-size:10px;color:var(--text3)">${PF_LABEL_TURNO[t.turno]||t.turno||'—'}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-bottom:4px">
                <span><i class="ti ti-clock" aria-hidden="true"></i> ${fmtMin(t.minutos)}</span>
                <span>Meta: <b style="color:var(--text)">${t.metaProp.toFixed(1)}</b> | Realiz.: <b style="color:${cor}">${t.realizado}</b></span>
              </div>
              <div style="background:var(--surface);border-radius:4px;height:6px;overflow:hidden;margin-bottom:4px">
                <div style="height:100%;width:${barW}%;background:${cor};border-radius:4px;transition:width .4s"></div>
              </div>
              <div style="text-align:right;font-size:11px;font-weight:800;color:${cor}">${pct !== null ? pct+'%' : '—'}</div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Detalhe por dia -->
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead>
            <tr style="background:var(--surface2)">
              <th style="padding:8px 12px;text-align:left;font-size:9px;font-weight:800;color:var(--text3)">DATA</th>
              <th style="padding:8px 12px;text-align:left;font-size:9px;font-weight:800;color:var(--text3)">COLABORADOR</th>
              <th style="padding:8px 12px;text-align:center;font-size:9px;font-weight:800;color:var(--text3)">TURNO</th>
              <th style="padding:8px 12px;text-align:center;font-size:9px;font-weight:800;color:var(--text3)">LOGADO</th>
              <th style="padding:8px 12px;text-align:center;font-size:9px;font-weight:800;color:var(--text3)">META PROP.</th>
              <th style="padding:8px 12px;text-align:center;font-size:9px;font-weight:800;color:var(--text3)">REALIZADO</th>
              <th style="padding:8px 12px;text-align:center;font-size:9px;font-weight:800;color:var(--text3)">%</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => {
              const cor = pctCor(r.pct_atingido);
              const barW = r.pct_atingido !== null ? Math.min(100, r.pct_atingido) : 0;
              return `
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:7px 12px;color:var(--text3)">${fmtData(r.data)}</td>
                <td style="padding:7px 12px;font-weight:700;color:var(--text)">${r.nome}</td>
                <td style="padding:7px 12px;text-align:center;color:var(--text3)">${PF_LABEL_TURNO[r.turno]||r.turno||'—'}</td>
                <td style="padding:7px 12px;text-align:center;font-family:monospace;font-weight:700;color:var(--text)">${fmtMin(r.minutos_logado)}</td>
                <td style="padding:7px 12px;text-align:center;font-weight:700;color:var(--text)">${r.meta_proporcional}</td>
                <td style="padding:7px 12px;text-align:center;font-weight:800;color:${cor}">${r.realizado}</td>
                <td style="padding:7px 12px;text-align:center;min-width:80px">
                  <div style="display:flex;align-items:center;gap:6px">
                    <div style="flex:1;background:var(--surface2);border-radius:3px;height:5px;overflow:hidden">
                      <div style="height:100%;width:${barW}%;background:${cor};border-radius:3px"></div>
                    </div>
                    <span style="font-size:10px;font-weight:800;color:${cor};min-width:30px;text-align:right">${r.pct_atingido !== null ? r.pct_atingido+'%' : '—'}</span>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  wrap.innerHTML = html;
}

// ── Rastreio de pedido ─────────────────────────────────────────────────────
async function pfBuscarPedido(num) {
  const el = document.getElementById('pf-pedido-result');
  if (!num) { pfToast('Digite o número do pedido','aviso'); return; }
  if (el) el.innerHTML = '<span style="color:var(--text3);font-size:12px">Buscando...</span>';
  const dados = await apiFetch(`/performance/pedido/${encodeURIComponent(num)}`);
  if (!dados || dados.erro) {
    if (el) el.innerHTML = `<div style="color:#dc2626;font-size:12px;padding:8px 0">${pfEsc(dados?.erro || 'Pedido não encontrado')}</div>`;
    return;
  }
  if (el) el.innerHTML = pfRenderPedidoDetalhe(dados);
}

function pfFecharRastreio() {
  const el  = document.getElementById('pf-pedido-result');
  const inp = document.getElementById('pf-pedido-input');
  if (el)  el.innerHTML = '';
  if (inp) inp.value   = '';
}

function pfRenderPedidoDetalhe(d) {
  const fmtHora = v => { if (!v) return '—'; return v.includes('T') ? v.slice(11, 16) : String(v).slice(0, 5); };
  const fmtDur  = min => {
    if (min == null) return '—';
    if (min < 1) return `${Math.round(min * 60)}s`;
    return `${min.toFixed(1)} min`;
  };
  const badgeDur = min => {
    if (min == null) return `<span style="color:var(--text3);font-size:11px">—</span>`;
    const cor = min <= 5 ? '#16a34a' : min <= 15 ? '#d97706' : '#dc2626';
    const bg  = min <= 5 ? 'rgba(22,163,74,.12)' : min <= 15 ? 'rgba(217,119,6,.12)' : 'rgba(220,38,38,.12)';
    return `<span style="background:${bg};color:${cor};border-radius:20px;padding:3px 12px;font-size:12px;font-weight:800">${fmtDur(min)}</span>`;
  };
  const resMap = { encontrado:'Enc', buscado:'Enc', abastecido:'Abast', nao_encontrado:'NE', protocolo:'Proto' };

  const sep = d.separacao;
  const ck  = d.checkout;
  const emb = d.embalagem;
  const rep = d.reposicoes || [];

  const tsIni = sep?.iniciado_em ? new Date(sep.iniciado_em).getTime() : null;
  const tsFim = emb?.concluido_em
    ? new Date((emb.data || '') + 'T' + emb.concluido_em).getTime()
    : ck?.concluido_em
    ? new Date((ck.data || '') + 'T' + ck.concluido_em).getTime()
    : null;
  const totalMin = tsIni && tsFim ? Math.round((tsFim - tsIni) / 60000 * 10) / 10 : null;

  const etapaColors = { 'Separação':'#4f46e5', 'Reposição':'#d97706', 'Checkout':'#db2777', 'Embalagem':'#7c3aed' };
  const etapaCard = (icon, label, grad, corpo, durMin) => {
    const cor = etapaColors[label] || '#64748b';
    return `
    <div style="flex:1;min-width:190px;border-radius:12px;overflow:hidden;border:1px solid var(--border);border-top:3px solid ${cor};display:flex;flex-direction:column">
      <div style="background:var(--surface2);padding:10px 14px;display:flex;align-items:center;gap:8px">
        <span style="width:7px;height:7px;border-radius:50%;background:${cor};flex-shrink:0;display:inline-block"></span>
        <span style="font-size:12px;font-weight:800;color:var(--text);letter-spacing:.3px">${label}</span>
        <span style="margin-left:auto">${badgeDur(durMin)}</span>
      </div>
      <div style="padding:12px 14px;background:var(--surface);font-size:12px;flex:1">${corpo}</div>
    </div>`;
  };

  const linha = (label, val, valCor) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--text3);font-size:10px;font-weight:700;letter-spacing:.4px">${label}</span>
      <span style="color:${valCor||'var(--text)'};font-weight:600;font-size:12px">${val}</span>
    </div>`;

  // Separação
  const sepCard = etapaCard('','Separação','',
    sep
      ? linha('Colaborador', pfEsc(sep.colaborador||'—')) +
        linha('Início', fmtHora(sep.iniciado_em)) +
        linha('Fim', fmtHora(sep.concluido_em)) +
        linha('Itens', sep.total_itens ?? '—') +
        linha('SKUs', sep.skus ?? '—')
      : '<div style="color:var(--text3);text-align:center;padding:12px 0;font-size:11px">Não iniciada</div>',
    sep?.duracao_min
  );

  // Reposição
  const repCorpo = !rep.length
    ? '<div style="color:var(--text3);text-align:center;padding:12px 0;font-size:11px">Sem reposições</div>'
    : rep.map(r => `
        <div style="padding:7px 8px;background:var(--surface2);border-radius:8px;margin-bottom:6px">
          <div style="font-size:10px;font-weight:700;color:var(--text);margin-bottom:3px">${resMap[r.resultado]||'?'} ${pfEsc(r.codigo||'')} — ${pfEsc((r.descricao||'').slice(0,30))}</div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:11px;color:var(--text3)">${pfEsc(r.colaborador||'—')}</span>
            ${badgeDur(r.duracao_min)}
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">⏱ ${fmtHora(r.iniciado_em)} → ${fmtHora(r.concluido_em)}</div>
        </div>`).join('');
  const repTotalMin = rep.length ? rep.reduce((s,r) => s + (r.duracao_min||0), 0) || null : null;
  const repCard = etapaCard('','Reposição','', repCorpo, repTotalMin);

  // Checkout
  const ckCard = etapaCard('','Checkout','',
    ck
      ? linha('Colaborador', pfEsc(ck.colaborador||'—')) +
        linha('Início', fmtHora(ck.iniciado_em)) +
        linha('Fim', fmtHora(ck.concluido_em)) +
        linha('Itens', ck.total_itens ?? sep?.total_itens ?? '—') +
        linha('SKUs', ck.skus ?? sep?.skus ?? '—')
      : '<div style="color:var(--text3);text-align:center;padding:12px 0;font-size:11px">Não realizado</div>',
    ck?.duracao_min
  );

  // Embalagem
  const embCard = etapaCard('','Embalagem','',
    emb?.concluido_em
      ? linha('Colaborador', pfEsc(emb.colaborador||'—')) +
        linha('Início', fmtHora(emb.iniciado_em)) +
        linha('Fim', fmtHora(emb.concluido_em)) +
        linha('Itens', emb.total_itens ?? sep?.total_itens ?? '—') +
        linha('SKUs', sep?.skus ?? '—')
      : '<div style="color:var(--text3);text-align:center;padding:12px 0;font-size:11px">Não embalado</div>',
    emb?.duracao_min
  );

  // Itens do pedido — lista suspensa (SKU, item, quantidade, endereço)
  const itens = d.itens || [];
  const itensRows = itens.map(it => `
    <tr style="border-bottom:1px solid var(--border)">
      <td style="padding:6px 10px;font-family:'Space Mono',monospace;font-size:11px;color:var(--accent);font-weight:700;white-space:nowrap">${pfEsc(it.codigo||'—')}</td>
      <td style="padding:6px 10px;font-size:11px;color:var(--text)">${pfEsc(it.descricao||'')}</td>
      <td style="padding:6px 10px;font-size:11px;color:var(--text);text-align:center">${it.quantidade ?? '—'}</td>
      <td style="padding:6px 10px;font-size:11px;color:var(--text3);white-space:nowrap">${pfEsc(it.endereco||'—')}</td>
    </tr>`).join('');

  const itensSecao = `
    <details style="border-top:1px solid var(--border)">
      <summary style="padding:12px 18px;cursor:pointer;font-size:12px;font-weight:800;color:var(--text);letter-spacing:.3px;display:flex;align-items:center;justify-content:space-between">
        <span>Itens do Pedido</span>
        <span style="font-size:11px;font-weight:600;color:var(--text3)">${itens.length} SKU(s) · clique para ver</span>
      </summary>
      <div style="overflow-x:auto;max-height:340px;overflow-y:auto;border-top:1px solid var(--border)">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:var(--surface2)">
              <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">SKU</th>
              <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">ITEM</th>
              <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:800;color:var(--text3)">QTD</th>
              <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">ENDEREÇO</th>
            </tr>
          </thead>
          <tbody>
            ${itensRows || `<tr><td colspan="4" style="padding:16px;text-align:center;color:var(--text3);font-size:12px">Nenhum item encontrado</td></tr>`}
          </tbody>
        </table>
      </div>
    </details>`;

  // Badge de forma de envio — mesmas cores usadas no resto do app
  const envio = (sep?.transportadora || '').trim();
  const envioBdg = (() => {
    if (!envio) return '';
    if (/DRIVE|RETIRADA/i.test(envio))
      return `<span style="background:#fee2e2;color:#dc2626;border:1.5px solid #fca5a5;font-size:10px;font-weight:800;padding:2px 9px;border-radius:20px;white-space:nowrap">Drive Thru</span>`;
    if (/PRIME/i.test(envio))
      return `<span style="background:#FEF3C7;color:#92400E;border:1.5px solid #FCD34D;font-size:10px;font-weight:800;padding:2px 9px;border-radius:20px;white-space:nowrap"><i class="ti ti-star-filled" aria-hidden="true"></i> Prime</span>`;
    if (/SEDEX/i.test(envio))
      return `<span style="background:#EFF6FF;color:#4338CA;border:1.5px solid #BFDBFE;font-size:10px;font-weight:800;padding:2px 9px;border-radius:20px;white-space:nowrap">${pfEsc(envio)}</span>`;
    if (/^PAC/i.test(envio))
      return `<span style="background:#F0FDF4;color:#166534;border:1.5px solid #BBF7D0;font-size:10px;font-weight:800;padding:2px 9px;border-radius:20px;white-space:nowrap">${pfEsc(envio)}</span>`;
    if (/MOTOBOY|MOTO/i.test(envio))
      return `<span style="background:#F5F3FF;color:#6D28D9;border:1.5px solid #DDD6FE;font-size:10px;font-weight:800;padding:2px 9px;border-radius:20px;white-space:nowrap">${pfEsc(envio)}</span>`;
    return `<span style="background:var(--surface2);color:var(--text2);border:1px solid var(--border);font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px;white-space:nowrap">${pfEsc(envio)}</span>`;
  })();

  return `
    <div style="border:1.5px solid var(--border);border-radius:14px;overflow:hidden;background:var(--surface)">
      <div style="background:var(--surface2);border-bottom:1px solid var(--border);padding:14px 18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
          <div style="display:flex;align-items:center;gap:12px">
            <span style="font-family:'Space Mono',monospace;font-size:20px;font-weight:900;color:var(--text)">#${pfEsc(d.numero_pedido)}</span>
            <span style="font-size:12px;color:var(--text2)">${sep?.total_itens ?? '—'} itens · ${sep?.skus ?? '—'} SKUs</span>
          </div>
          ${(sep?.cliente || envioBdg) ? `<div style="display:flex;align-items:center;gap:8px;margin-top:5px">
            ${sep?.cliente ? `<span style="font-size:12px;color:var(--text2)">${pfEsc(sep.cliente)}</span>` : ''}
            ${envioBdg}
          </div>` : ''}
        </div>
        ${totalMin != null ? `<div style="background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:5px 18px;color:var(--text);font-size:13px;font-weight:700">Total: ${fmtDur(totalMin)}</div>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;padding:14px">
        ${sepCard}${repCard}${ckCard}${embCard}
      </div>
      ${itensSecao}
    </div>`;
}
