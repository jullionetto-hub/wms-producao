'use strict';

/* ══════════════════════════════════════════
   GESTÃO — Absenteísmo
══════════════════════════════════════════ */

let _absRows = [];
let _absToleranciMin = 0;
let _absDetalheCache = null;
let _absPeriodo  = null;   // null = todos, ou {start:'2024-05-27', end:'2024-06-26'}
let _absUploads  = [];     // cache dos uploads para montar os botões de período

function renderizarPagGestao() {
  const root = document.getElementById('pag-gestao');
  if (!root) return;
  root.innerHTML = `
<div style="display:flex;flex-direction:column;height:100%;min-height:0">

  <!-- ── Header ── -->
  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding:16px 24px 12px;border-bottom:1px solid var(--border);flex-shrink:0">
    <div>
      <div style="font-family:'Space Mono',monospace;font-size:17px;font-weight:800;color:var(--text)">📅 Absenteísmo</div>
      <div id="gabs-periodo" style="font-size:11px;color:var(--text3);margin-top:3px;font-weight:600"></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button onclick="mostrarArquivosAbs()" style="padding:7px 14px;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;color:var(--text2)">📁 Arquivos Importados</button>
      <button onclick="toggleImportarAbs()" style="padding:7px 14px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">📥 Importar PDF</button>
    </div>
  </div>

  <!-- ── Modal arquivos ── -->
  <div id="gabs-modal-arq" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;align-items:center;justify-content:center">
    <div style="background:var(--surface);border-radius:16px;padding:20px;width:min(520px,95vw);max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,.3)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="font-size:14px;font-weight:800;color:var(--text)">📁 Arquivos Importados</div>
        <button onclick="fecharArquivosAbs()" style="background:transparent;border:none;font-size:20px;cursor:pointer;color:var(--text3);line-height:1">✕</button>
      </div>
      <div id="gabs-historico" style="flex:1;overflow-y:auto">Carregando...</div>
    </div>
  </div>

  <!-- ── Área de importação ── -->
  <div id="gabs-import-area" style="display:none;background:var(--surface2);border-bottom:1.5px solid var(--border);padding:16px 24px;flex-shrink:0">
    <div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:1px;margin-bottom:10px">IMPORTAR RELATÓRIO DE PONTO (PDF InPonto / MIESS)</div>
    <div id="gabs-drop-zone"
      ondragover="event.preventDefault();this.style.borderColor='var(--accent)'"
      ondragleave="this.style.borderColor='var(--border)'"
      ondrop="absHandleDrop(event)"
      style="border:2px dashed var(--border);border-radius:10px;padding:22px;text-align:center;cursor:pointer;transition:.2s"
      onclick="document.getElementById('gabs-file-input').click()">
      <div style="font-size:28px;margin-bottom:6px">📄</div>
      <div style="font-size:13px;font-weight:700;color:var(--text)">Clique ou arraste o PDF aqui</div>
      <div style="font-size:11px;color:var(--text3);margin-top:3px">Relatório InPonto / MIESS — máx. 30 MB</div>
    </div>
    <input type="file" id="gabs-file-input" accept=".pdf" style="display:none" onchange="absEnviarPdf(this.files[0])">
    <div id="gabs-upload-status" style="margin-top:8px;font-size:12px"></div>
  </div>

  <!-- ── Seletor de período ── -->
  <div style="padding:10px 24px 8px;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--surface2)">
    <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.5px;margin-bottom:6px">📅 PERÍODO DE ANÁLISE</div>
    <div id="gabs-periodo-btns" style="display:flex;gap:6px;flex-wrap:wrap">
      <span style="font-size:11px;color:var(--text3)">Carregando...</span>
    </div>
  </div>

  <!-- ── KPI cards ── -->
  <div id="gabs-cards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;padding:14px 24px 10px;flex-shrink:0"></div>

  <!-- ── Tolerância de atraso ── -->
  <div style="display:flex;align-items:center;gap:10px;padding:0 24px 12px;flex-shrink:0;flex-wrap:wrap">
    <span style="font-size:11px;font-weight:800;color:var(--text3);letter-spacing:.5px;white-space:nowrap">⏱ TOLERÂNCIA DE ATRASO:</span>
    <div style="display:flex;gap:6px;flex-wrap:wrap" id="gabs-tol-btns">
      ${[0,5,10,15,30].map(m => `
      <button onclick="setToleranciAbs(${m})" id="gabs-tol-${m}"
        style="padding:4px 12px;border-radius:20px;border:1.5px solid var(--border);font-size:12px;font-weight:700;cursor:pointer;
               background:${m===0?'var(--accent)':'var(--surface2)'};color:${m===0?'#fff':'var(--text2)'}">
        ${m === 0 ? 'Todos' : m + ' min'}
      </button>`).join('')}
      <div style="display:flex;align-items:center;gap:4px">
        <input type="number" id="gabs-tol-custom" min="0" max="120" placeholder="Outro"
          style="width:70px;padding:4px 8px;border:1.5px solid var(--border);border-radius:20px;font-size:12px;background:var(--surface);color:var(--text);text-align:center"
          onkeydown="if(event.key==='Enter')setToleranciAbs(+this.value||0)"/>
        <button onclick="setToleranciAbs(+(document.getElementById('gabs-tol-custom').value)||0)"
          style="padding:4px 10px;border-radius:20px;border:1.5px solid var(--border);font-size:12px;font-weight:700;cursor:pointer;background:var(--surface2);color:var(--text2)">
          ✓
        </button>
      </div>
    </div>
    <span id="gabs-tol-label" style="font-size:11px;color:var(--text3)"></span>
  </div>

  <!-- ── Corpo principal: lista de nomes + ranking/detalhe ── -->
  <div style="display:flex;flex:1;min-height:0;gap:0;overflow:hidden">

    <!-- Painel esquerdo: lista de funcionários -->
    <div style="width:240px;flex-shrink:0;display:flex;flex-direction:column;border-right:1px solid var(--border);background:var(--surface2)">
      <div style="padding:10px 12px;border-bottom:1px solid var(--border);flex-shrink:0">
        <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.5px;margin-bottom:6px">FUNCIONÁRIOS</div>
        <input type="text" id="gabs-busca" placeholder="🔍 Buscar nome..."
          oninput="filtrarListaAbs(this.value)"
          style="width:100%;padding:6px 9px;border:1.5px solid var(--border);border-radius:8px;font-size:12px;background:var(--surface);color:var(--text);box-sizing:border-box"/>
      </div>
      <div id="gabs-lista-nomes" style="flex:1;overflow-y:auto;padding:6px 0"></div>
    </div>

    <!-- Painel direito: ranking + detalhe -->
    <div style="flex:1;overflow-y:auto;padding:16px 24px">
      <div style="font-size:11px;font-weight:800;color:var(--text3);letter-spacing:.5px;margin-bottom:10px">RANKING POR ABSENTEÍSMO</div>
      <div id="gabs-tabela"></div>
      <div id="gabs-detalhe" style="margin-top:16px"></div>
    </div>
  </div>
</div>`;
  carregarGestaoAbsenteismo();
}


/* ── Seletor de período ── */
function _parsePeriodFromUpload(u) {
  if (u.period_start && u.period_end) return { start: u.period_start, end: u.period_end };
  const dates = (u.filename || '').match(/\d{4}-\d{2}-\d{2}/g) || [];
  if (dates.length >= 2) return { start: dates[0], end: dates[1] };
  if (dates.length === 1) return { start: dates[0], end: dates[0] };
  if (u.upload_at) { const d = u.upload_at.split('T')[0]; return { start: d, end: d }; }
  return null;
}

function _fmtPdBtn(start, end) {
  const f = s => { const [y, m, d] = s.split('-'); return `${d}/${m}`; };
  return start === end ? f(start) : `${f(start)} – ${f(end)}`;
}

async function _renderPeriodBtns(forceRefresh) {
  const el = document.getElementById('gabs-periodo-btns');
  if (!el) return;

  if (!_absUploads.length || forceRefresh) {
    try {
      const r    = await fetch(`${API}/gestao/absenteismo/uploads`, { credentials: 'include' });
      const list = await r.json();
      _absUploads = Array.isArray(list) ? list.filter(u => u.status === 'success') : [];
    } catch { _absUploads = []; }
  }

  const seen = new Set();
  const periods = [];
  for (const u of _absUploads) {
    const p = _parsePeriodFromUpload(u);
    if (!p) continue;
    const key = `${p.start}|${p.end}`;
    if (!seen.has(key)) { seen.add(key); periods.push(p); }
  }
  periods.sort((a, b) => b.start.localeCompare(a.start));

  const activeKey = _absPeriodo ? `${_absPeriodo.start}|${_absPeriodo.end}` : 'todos';

  const btn = (label, onclick, active) =>
    `<button onclick="${onclick}"
      style="padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;
             border:1.5px solid ${active ? 'var(--accent)' : 'var(--border)'};
             background:${active ? 'var(--accent)' : 'var(--surface)'};
             color:${active ? '#fff' : 'var(--text2)'}">
      ${label}
    </button>`;

  el.innerHTML = [
    btn('Todos', 'selecionarPeriodoAbs(null)', activeKey === 'todos'),
    ...periods.map(p => btn(
      _fmtPdBtn(p.start, p.end),
      `selecionarPeriodoAbs('${p.start}','${p.end}')`,
      activeKey === `${p.start}|${p.end}`
    )),
  ].join('') || '<span style="font-size:11px;color:var(--text3)">Importe um PDF para ver períodos</span>';
}

function selecionarPeriodoAbs(start, end) {
  _absPeriodo      = start ? { start, end } : null;
  _absDetalheCache = null;
  _renderPeriodBtns();
  carregarGestaoAbsenteismo();
}


/* ── Tolerância de atraso ── */
function setToleranciAbs(min) {
  _absToleranciMin = Math.max(0, min || 0);

  // Atualiza botões preset
  [0,5,10,15,30].forEach(m => {
    const btn = document.getElementById(`gabs-tol-${m}`);
    if (!btn) return;
    const ativo = m === _absToleranciMin;
    btn.style.background  = ativo ? 'var(--accent)' : 'var(--surface2)';
    btn.style.color       = ativo ? '#fff'           : 'var(--text2)';
    btn.style.borderColor = ativo ? 'var(--accent)'  : 'var(--border)';
  });

  // Limpa campo customizado se for um preset
  if ([0,5,10,15,30].includes(_absToleranciMin)) {
    const inp = document.getElementById('gabs-tol-custom');
    if (inp) inp.value = '';
  }

  // Atualiza label informativo
  const lbl = document.getElementById('gabs-tol-label');
  if (lbl) lbl.textContent = _absToleranciMin > 0
    ? `— atrasos ≤ ${_absToleranciMin} min ignorados`
    : '';

  // Re-renderiza detalhe aberto usando cache (sem nova requisição HTTP)
  const detalhe = document.getElementById('gabs-detalhe');
  if (detalhe && detalhe.innerHTML.trim() && _absDetalheCache) {
    _renderDetalheAbs(_absDetalheCache.data, _absDetalheCache.nome);
  }
}

/* ── Toggle importar ── */
function toggleImportarAbs() {
  const area = document.getElementById('gabs-import-area');
  if (!area) return;
  area.style.display = area.style.display !== 'none' ? 'none' : '';
}

/* ── Modal de arquivos ── */
function mostrarArquivosAbs() {
  const modal = document.getElementById('gabs-modal-arq');
  if (!modal) return;
  modal.style.display = 'flex';
  carregarHistoricoAbs();
}
function fecharArquivosAbs() {
  const modal = document.getElementById('gabs-modal-arq');
  if (modal) modal.style.display = 'none';
}

/* ── Drop / upload ── */
function absHandleDrop(event) {
  event.preventDefault();
  document.getElementById('gabs-drop-zone').style.borderColor = 'var(--border)';
  const file = event.dataTransfer?.files?.[0];
  if (file && file.name.toLowerCase().endsWith('.pdf')) absEnviarPdf(file);
  else toast('Selecione um arquivo PDF', 'erro');
}

async function absEnviarPdf(file) {
  if (!file) return;
  const status = document.getElementById('gabs-upload-status');
  status.innerHTML = `<span style="color:var(--text2)">⏳ Enviando <b>${file.name}</b>...</span>`;
  const fd = new FormData();
  fd.append('file', file);
  try {
    const res  = await fetch(`${API}/gestao/absenteismo/upload`, { method:'POST', credentials:'include', body: fd });
    const data = await res.json();
    if (!res.ok) { status.innerHTML = `<span style="color:var(--red)">❌ ${data.erro || 'Erro no upload'}</span>`; return; }
    status.innerHTML = `<span style="color:var(--green)">✅ ${data.message || 'Importado!'} (${data.employees} funcionário(s))</span>`;
    document.getElementById('gabs-file-input').value = '';
    _absUploads = []; // força refresh dos botões de período
    carregarGestaoAbsenteismo();
  } catch(e) {
    status.innerHTML = `<span style="color:var(--red)">❌ Erro: ${e.message}</span>`;
  }
}

/* ── Histórico de uploads ── */
async function carregarHistoricoAbs() {
  const el = document.getElementById('gabs-historico');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:10px">Carregando...</div>';
  try {
    const res   = await fetch(`${API}/gestao/absenteismo/uploads`, { credentials:'include' });
    const lista = await res.json();
    if (!Array.isArray(lista) || !lista.length) {
      el.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:10px">Nenhum arquivo importado ainda.</div>';
      return;
    }
    el.innerHTML = lista.map(u => {
      const ok  = u.status === 'success';
      const dt  = u.upload_at ? new Date(u.upload_at).toLocaleString('pt-BR') : '—';
      const cor = ok ? '#16a34a' : 'var(--red)';
      const ico = ok ? '✅' : '❌';
      return `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:var(--surface2);margin-bottom:8px;font-size:12px">
        <span style="font-size:18px;flex-shrink:0">${ico}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.filename}</div>
          <div style="color:var(--text3);margin-top:2px">${dt}</div>
          <div style="color:${cor};font-size:11px">${ok ? `${u.records_count ?? 0} funcionário(s)` : u.error_message || 'erro'}</div>
        </div>
        <button onclick="absExcluirUpload(${u.id},this)" title="Excluir arquivo"
          style="background:#fee2e2;border:none;color:#dc2626;font-size:14px;cursor:pointer;padding:6px 10px;border-radius:8px;font-weight:700;flex-shrink:0">
          🗑️ Excluir
        </button>
      </div>`;
    }).join('');
  } catch(e) {
    el.innerHTML = `<div style="color:var(--red);font-size:12px;padding:10px">Erro ao carregar histórico.</div>`;
  }
}

async function absExcluirUpload(id, btn) {
  if (!confirm('Excluir esta importação? Os dados dos funcionários serão removidos.')) return;
  btn.disabled = true; btn.textContent = '...';
  try {
    const res = await fetch(`${API}/gestao/absenteismo/uploads/${id}`, { method:'DELETE', credentials:'include' });
    if (res.ok) { toast('Arquivo excluído!','sucesso'); _absUploads = []; _absPeriodo = null; carregarHistoricoAbs(); carregarGestaoAbsenteismo(); }
    else { btn.disabled = false; btn.innerHTML = '🗑️ Excluir'; toast('Erro ao excluir','erro'); }
  } catch(e) { btn.disabled = false; btn.innerHTML = '🗑️ Excluir'; }
}


/* ── Absenteísmo principal ── */
async function carregarGestaoAbsenteismo() {
  const cards    = document.getElementById('gabs-cards');
  const tabela   = document.getElementById('gabs-tabela');
  const listaNom = document.getElementById('gabs-lista-nomes');
  if (!cards || !tabela) return;

  cards.innerHTML  = '<div style="grid-column:1/-1;color:var(--text3);font-size:12px;padding:4px">Carregando...</div>';
  tabela.innerHTML = '';
  if (listaNom) listaNom.innerHTML = '';

  // Carrega os botões de período (usa cache se já tiver)
  _renderPeriodBtns(!_absUploads.length);

  try {
    const pdqs = _absPeriodo ? `?start_date=${_absPeriodo.start}&end_date=${_absPeriodo.end}` : '';
    const res = await fetch(`${API}/gestao/absenteismo/team${pdqs}`, { credentials:'include' });
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.erro || `HTTP ${res.status}`); }
    const team = await res.json();

    const totalFunc      = team.total_employees ?? (team.employees || []).length;
    const totalFaltas    = team.total_faltas    ?? 0;
    const totalAtestados = team.total_atestados ?? 0;
    const taxaEquipe     = parseFloat(team.team_absenteeism_rate) || 0;

    const periodoEl = document.getElementById('gabs-periodo');
    if (periodoEl) {
      const fmtDt = s => s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : null;
      const ini = fmtDt(team.period_start);
      const fim = fmtDt(team.period_end);
      periodoEl.textContent = ini && fim ? `Período: ${ini} a ${fim}` : '';
    }

    const kpis = [
      { icon:'👥', label:'Funcionários',   val: totalFunc,              bg:'#eff6ff', cor:'#1d4ed8' },
      { icon:'❌', label:'Total Faltas',   val: totalFaltas,            bg:'#fef2f2', cor:'#dc2626' },
      { icon:'🏥', label:'Atestados',      val: totalAtestados,         bg:'#fefce8', cor:'#ca8a04' },
      { icon:'📉', label:'Taxa da Equipe', val:`${taxaEquipe.toFixed(1)}%`, bg: taxaEquipe>=10?'#fef2f2':taxaEquipe>=5?'#fefce8':'#f0fdf4', cor: taxaEquipe>=10?'#dc2626':taxaEquipe>=5?'#ca8a04':'#16a34a' },
    ];
    cards.innerHTML = kpis.map(c => `
      <div style="background:${c.bg};border:1px solid ${c.cor}33;border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:12px">
        <div style="font-size:26px">${c.icon}</div>
        <div>
          <div style="font-size:10px;font-weight:800;color:${c.cor}aa;letter-spacing:.5px">${c.label.toUpperCase()}</div>
          <div style="font-size:24px;font-weight:900;color:${c.cor};font-family:'Space Mono',monospace;line-height:1.1">${c.val}</div>
        </div>
      </div>`).join('');

    _absRows = [...(team.employees || [])].sort(
      (a, b) => (parseFloat(b.absenteeism_rate)||0) - (parseFloat(a.absenteeism_rate)||0)
    );

    _renderListaNomesAbs(_absRows);
    _renderTabelaAbs(_absRows);

  } catch(e) {
    cards.innerHTML  = '';
    tabela.innerHTML = `<div style="color:var(--red);padding:20px;font-size:13px">Erro ao carregar absenteísmo: ${e.message}<br><small style="color:var(--text3)">Importe os PDFs no botão 📥 Importar PDF</small></div>`;
  }
}


/* ── Lista de nomes (painel esquerdo) ── */
function _renderListaNomesAbs(rows) {
  const el = document.getElementById('gabs-lista-nomes');
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:14px;text-align:center">Nenhum funcionário</div>';
    return;
  }
  el.innerHTML = rows.map(r => {
    const taxa = parseFloat(r.absenteeism_rate) || 0;
    const cor  = taxa >= 10 ? '#dc2626' : taxa >= 5 ? '#d97706' : '#16a34a';
    const bg   = taxa >= 10 ? '#fef2f2' : taxa >= 5 ? '#fefce8' : '#f0fdf4';
    const nome = r.name || '—';
    const iniciais = nome.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase();
    return `
    <div onclick="verDetalheAbsenteismo(${r.id},'${nome.replace(/'/g,"\\'")}',null,'${(r.matricula||'').replace(/'/g,"\\'")}')"
      style="display:flex;align-items:center;gap:9px;padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .15s"
      onmouseover="this.style.background='var(--surface)'" onmouseout="this.style.background=''">
      <div style="width:32px;height:32px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:${cor};flex-shrink:0">${iniciais}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nome}</div>
        <div style="font-size:10px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${(r.sector||'').split('/')[0].trim()}</div>
      </div>
      <div style="font-size:12px;font-weight:800;color:${cor};flex-shrink:0">${taxa.toFixed(1)}%</div>
    </div>`;
  }).join('');
}

function filtrarListaAbs(q) {
  const busca = (q || '').toLowerCase().trim();
  const filtrado = busca ? _absRows.filter(r => (r.name||'').toLowerCase().includes(busca)) : _absRows;
  _renderListaNomesAbs(filtrado);
}


/* ── Tabela ranking ── */
function _renderTabelaAbs(rows) {
  const tabela = document.getElementById('gabs-tabela');
  if (!tabela) return;
  if (!rows.length) {
    tabela.innerHTML = '<div style="color:var(--text3);padding:40px;text-align:center;font-size:13px">Nenhum dado. Importe os PDFs no botão 📥.</div>';
    return;
  }
  tabela.innerHTML = `
    <div style="overflow-x:auto;border:1px solid var(--border);border-radius:12px">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:var(--surface2)">
            <th style="padding:9px 12px;text-align:left;color:var(--text3);font-size:10px;font-weight:800;border-bottom:1px solid var(--border)">#</th>
            <th style="padding:9px 12px;text-align:left;color:var(--text3);font-size:10px;font-weight:800;border-bottom:1px solid var(--border)">FUNCIONÁRIO</th>
            <th style="padding:9px 12px;text-align:left;color:var(--text3);font-size:10px;font-weight:800;border-bottom:1px solid var(--border)">SETOR</th>
            <th style="padding:9px 12px;text-align:center;color:var(--text3);font-size:10px;font-weight:800;border-bottom:1px solid var(--border)">FALTAS</th>
            <th style="padding:9px 12px;text-align:center;color:var(--text3);font-size:10px;font-weight:800;border-bottom:1px solid var(--border)">ATESTADOS</th>
            <th style="padding:9px 12px;text-align:center;color:var(--text3);font-size:10px;font-weight:800;border-bottom:1px solid var(--border)">ATRASO</th>
            <th style="padding:9px 12px;text-align:center;color:var(--text3);font-size:10px;font-weight:800;border-bottom:1px solid var(--border)">ABSENTEÍSMO</th>
            <th style="padding:9px 12px;text-align:center;color:var(--text3);font-size:10px;font-weight:800;border-bottom:1px solid var(--border)">DETALHE</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, i) => {
            const taxa = parseFloat(r.absenteeism_rate) || 0;
            const cor  = taxa >= 10 ? '#dc2626' : taxa >= 5 ? '#d97706' : '#16a34a';
            const bg   = taxa >= 10 ? '#fef2f222' : taxa >= 5 ? '#fefce822' : '';
            const nome = r.name || '—';
            const barW = Math.min(100, taxa * 5);
            return `
            <tr style="border-bottom:1px solid var(--border);background:${bg}">
              <td style="padding:9px 12px;font-weight:700;color:var(--text3)">${i+1}</td>
              <td style="padding:9px 12px;font-weight:700;color:var(--text)">${nome}</td>
              <td style="padding:9px 12px;color:var(--text2);font-size:11px">${r.sector || '—'}</td>
              <td style="padding:9px 12px;text-align:center;font-weight:700;color:${r.faltas_count>0?'#dc2626':'var(--text2)'}">${r.faltas_count ?? '—'}</td>
              <td style="padding:9px 12px;text-align:center;font-weight:700;color:${r.atestados_count>0?'#d97706':'var(--text2)'}">${r.atestados_count ?? '—'}</td>
              <td style="padding:9px 12px;text-align:center;color:var(--text2);font-size:11px">${r.total_atraso_formatted || '—'}</td>
              <td style="padding:9px 12px;text-align:center">
                <div style="display:flex;align-items:center;gap:6px;justify-content:center">
                  <div style="width:50px;background:var(--surface2);border-radius:4px;height:5px;overflow:hidden">
                    <div style="width:${barW}%;height:100%;background:${cor};border-radius:4px"></div>
                  </div>
                  <span style="font-size:12px;font-weight:800;color:${cor};min-width:36px">${taxa.toFixed(1)}%</span>
                </div>
              </td>
              <td style="padding:9px 12px;text-align:center">
                <button onclick="verDetalheAbsenteismo(${r.id},'${nome.replace(/'/g,"\\'")}',this,'${(r.matricula||'').replace(/'/g,"\\'")}')"
                  style="padding:4px 12px;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;font-size:11px;cursor:pointer;color:var(--text2);font-weight:700">
                  Ver
                </button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}


/* ── Detalhe do funcionário ── */
async function verDetalheAbsenteismo(id, nome, btn, matricula) {
  const detalhe = document.getElementById('gabs-detalhe');
  if (!detalhe) return;
  detalhe.innerHTML = '<div style="color:var(--text3);padding:14px;font-size:12px">Carregando...</div>';
  detalhe.scrollIntoView({ behavior:'smooth', block:'nearest' });
  if (btn) { btn.textContent = '...'; btn.disabled = true; }

  try {
    const params = {};
    if (_absPeriodo) { params.start_date = _absPeriodo.start; params.end_date = _absPeriodo.end; }
    if (matricula)   { params.matricula = matricula; }
    const pdqs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
    const res  = await fetch(`${API}/gestao/absenteismo/funcionario/${id}${pdqs}`, { credentials:'include' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.erro || `Erro ${res.status} ao carregar funcionário`);
    }
    const data = await res.json();
    _absDetalheCache = { id, nome, data };
    _renderDetalheAbs(data, nome);
  } catch(e) {
    const detalheEl = document.getElementById('gabs-detalhe');
    if (detalheEl) detalheEl.innerHTML = `
      <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:12px;padding:14px 16px">
        <div style="font-weight:700;color:#dc2626;font-size:13px;margin-bottom:4px">Erro ao carregar funcionário</div>
        <div style="font-size:12px;color:#7f1d1d">${e.message}</div>
      </div>`;
  } finally {
    if (btn) { btn.textContent = 'Ver'; btn.disabled = false; }
  }
}

/* ── helpers de atraso (módulo-level) ── */
const _ABS_ZEROS = new Set(['--:--','-:--','00:00','000:00','0:00','','0','--']);
function _parseTstr(s) {
  if (!s || _ABS_ZEROS.has(String(s).trim())) return 0;
  const parts = String(s).split(':');
  return (parseInt(parts[0])||0)*60 + (parseInt(parts[1])||0);
}
function _minAtraso(r) {
  for (const f of ['atraso_minutes','late_minutes','atraso_mins','delay_minutes','atraso_min','neg_minutes','h_neg_minutes']) {
    if (Number(r[f]) > 0) return Number(r[f]);
  }
  for (const f of ['atraso','atraso_formatado','atraso_str','late','h_neg','horas_negativas','delay','atraso_total','neg']) {
    const v = _parseTstr(r[f]); if (v > 0) return v;
  }
  for (const [k, v] of Object.entries(r||{})) {
    if (typeof v === 'number' && v > 0 && /atr|late|neg|delay/i.test(k)) return v;
    if (typeof v === 'string' && /atr|late|neg|delay/i.test(k)) { const m = _parseTstr(v); if (m > 0) return m; }
  }
  return 0;
}
function _fmtAtraso(r) {
  for (const f of ['atraso','atraso_formatado','atraso_str','h_neg','horas_negativas']) {
    const s = String(r[f]||'').trim();
    if (s && !_ABS_ZEROS.has(s)) return s;
  }
  const m = _minAtraso(r);
  if (!m) return '—';
  const hh = Math.floor(m/60), mm = m%60;
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}

/* ── Calcula atraso estimado de um registro a partir das batidas ── */
function _computeAtrasoRec(r, scheduleStartMin, lunchMin, breakMin) {
  const toM = s => { if (!s) return null; const [h,m] = s.split(':').map(Number); return h*60+m; };
  let a = 0;
  const entry = toM(r.entry_time);
  if (entry !== null && entry > scheduleStartMin) a += entry - scheduleStartMin;
  const ls = toM(r.lunch_start), le = toM(r.lunch_end);
  if (ls !== null && le !== null && le - ls > lunchMin) a += (le - ls) - lunchMin;
  const bs = toM(r.break_start), be = toM(r.break_end);
  if (bs !== null && be !== null && be - bs > breakMin) a += (be - bs) - breakMin;
  return a;
}

/* ── Render do detalhe (separado do fetch para reuso ao mudar tolerância) ── */
function _renderDetalheAbs(data, nome) {
  const detalhe = document.getElementById('gabs-detalhe');
  if (!detalhe) return;

  const allRec    = data.daily_records || [];
  const ausencias = allRec.filter(r => r.falta || r.atestado || r.ferias);
  const taxa      = parseFloat(data.absenteeism_rate || 0).toFixed(1);
  const taxaCor   = taxa >= 10 ? '#dc2626' : taxa >= 5 ? '#d97706' : '#16a34a';
  const fmtDt     = s => s ? new Date(s+'T12:00:00').toLocaleDateString('pt-BR') : '—';
  const t         = v => v || '—';

  // Parâmetros do turno
  const schedMatch = (data.schedule || '').match(/(\d+)h/);
  const schedStartMin = schedMatch ? parseInt(schedMatch[1]) * 60 : 780; // default 13:00
  const LUNCH_MIN = 60, BREAK_MIN = 15;

  // Espelho de ponto — todos os dias trabalhados (status normal com registro)
  const diasTrab = allRec.filter(r => r.status === 'normal' && r.entry_time);

  // Pré-computa atraso por dia
  diasTrab.forEach(r => {
    r._atraso = _computeAtrasoRec(r, schedStartMin, LUNCH_MIN, BREAK_MIN);
  });
  const totalAtrasoComp = diasTrab.reduce((s, r) => s + r._atraso, 0);
  const diasComAtraso   = diasTrab.filter(r => r._atraso > _absToleranciMin).length;

  // Volta antecipada (almoço < 60min ou pausa < 15min)
  const diasVoltaAlmoco = diasTrab.filter(r => { const ld = _lunchDur(r); return ld !== null && ld > 0 && ld < LUNCH_MIN; }).length;
  const diasVoltaPausa  = diasTrab.filter(r => { const bd = _breakDur(r);  return bd !== null && bd > 0 && bd < BREAK_MIN;  }).length;
  const totalVoltaAntecipada = diasVoltaAlmoco + diasVoltaPausa;

  // Dias com ocorrência especial (DSR, feriado, falta)
  const diasEspeciais = allRec.filter(r => r.status !== 'normal' || r.falta || r.atestado || r.ferias);

  const _fmtMin = m => m > 0 ? `+${m} min` : '—';
  const _lunchDur = r => r.lunch_start && r.lunch_end
    ? (() => { const [lh,lm]=r.lunch_start.split(':').map(Number), [eh,em]=r.lunch_end.split(':').map(Number); return (eh*60+em)-(lh*60+lm); })()
    : null;
  const _breakDur = r => r.break_start && r.break_end
    ? (() => { const [lh,lm]=r.break_start.split(':').map(Number), [eh,em]=r.break_end.split(':').map(Number); return (eh*60+em)-(lh*60+lm); })()
    : null;

  const tblPonto = !diasTrab.length
    ? `<div style="color:var(--text3);font-size:12px;padding:10px 12px">Nenhum registro de ponto no período.</div>`
    : `<div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:560px">
          <thead><tr style="background:var(--surface2)">
            <th style="padding:5px 8px;text-align:left;color:var(--text3);border-bottom:1px solid var(--border);font-size:10px">DATA</th>
            <th style="padding:5px 8px;text-align:left;color:var(--text3);border-bottom:1px solid var(--border);font-size:10px">DIA</th>
            <th style="padding:5px 8px;text-align:center;color:var(--text3);border-bottom:1px solid var(--border);font-size:10px">ENTRADA</th>
            <th style="padding:5px 8px;text-align:center;color:var(--text3);border-bottom:1px solid var(--border);font-size:10px">ALMOÇO</th>
            <th style="padding:5px 8px;text-align:center;color:var(--text3);border-bottom:1px solid var(--border);font-size:10px">PAUSA</th>
            <th style="padding:5px 8px;text-align:center;color:var(--text3);border-bottom:1px solid var(--border);font-size:10px">SAÍDA</th>
            <th style="padding:5px 8px;text-align:center;color:var(--text3);border-bottom:1px solid var(--border);font-size:10px">ATRASO</th>
          </tr></thead>
          <tbody>${diasTrab.map(r => {
            const atr        = r._atraso;
            const late       = atr > _absToleranciMin;
            const ld         = _lunchDur(r);
            const bd         = _breakDur(r);
            const lunchOver  = ld !== null && ld > LUNCH_MIN;
            const lunchEarly = ld !== null && ld > 0 && ld < LUNCH_MIN;
            const breakOver  = bd !== null && bd > BREAK_MIN;
            const breakEarly = bd !== null && bd > 0 && bd < BREAK_MIN;
            const earlyTotal = (lunchEarly ? LUNCH_MIN - ld : 0) + (breakEarly ? BREAK_MIN - bd : 0);
            const rowBg      = late ? '#fff7ed' : (lunchEarly || breakEarly) ? '#eff6ff' : '';
            const lunchStr   = r.lunch_start && r.lunch_end
              ? `<span style="color:${lunchOver?'#d97706':lunchEarly?'#2563eb':'var(--text2)'};font-weight:${lunchOver||lunchEarly?'700':'400'}">${r.lunch_start} → ${r.lunch_end}${lunchOver?` <small>(${ld}min)</small>`:lunchEarly?` <small>${ld}min</small>`:''}</span>`
              : '—';
            const breakStr   = r.break_start && r.break_end
              ? `<span style="color:${breakOver?'#d97706':breakEarly?'#2563eb':'var(--text2)'};font-weight:${breakOver||breakEarly?'700':'400'}">${r.break_start} → ${r.break_end}${breakOver?` <small>(${bd}min)</small>`:breakEarly?` <small>${bd}min</small>`:''}</span>`
              : '—';
            const atrasoPartes = [];
            if (atr > 0) atrasoPartes.push(`<span style="color:${late?'#dc2626':'#d97706'};font-weight:800">${atr} min</span>`);
            if (earlyTotal > 0) atrasoPartes.push(`<span style="color:#2563eb;font-size:10px">−${earlyTotal} min antecip.</span>`);
            const atrasoCel = atrasoPartes.length ? atrasoPartes.join('<br>') : '—';
            return `<tr style="border-bottom:1px solid var(--border);background:${rowBg}">
              <td style="padding:5px 8px;font-weight:700;white-space:nowrap;color:${late?'#c2410c':'var(--text)'}">${fmtDt(r.date)}</td>
              <td style="padding:5px 8px;color:var(--text2)">${r.day_of_week||'—'}</td>
              <td style="padding:5px 8px;text-align:center;font-family:monospace;color:var(--text)">${t(r.entry_time)}</td>
              <td style="padding:5px 8px;text-align:center;font-family:monospace;font-size:10px">${lunchStr}</td>
              <td style="padding:5px 8px;text-align:center;font-family:monospace;font-size:10px">${breakStr}</td>
              <td style="padding:5px 8px;text-align:center;font-family:monospace;color:var(--text)">${t(r.exit_time)}</td>
              <td style="padding:5px 8px;text-align:center;line-height:1.6">${atrasoCel}</td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
      </div>`;

  const tblEspeciais = !diasEspeciais.length ? '' : `
    <div style="margin-top:14px">
      <div style="font-size:11px;font-weight:800;color:var(--text3);letter-spacing:.5px;margin-bottom:6px">DIAS SEM TRABALHO / OCORRÊNCIAS</div>
      <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--surface)">
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <tbody>${diasEspeciais.map(r => {
            const label = r.falta ? '❌ Falta' : r.atestado ? '🏥 Atestado' : r.ferias ? '🌴 Férias' : r.status === 'dsr' ? '🔵 DSR' : r.status === 'holiday' ? '🎉 Feriado' : r.status;
            const cor   = r.falta ? '#dc2626' : r.atestado ? '#d97706' : r.ferias ? '#2563eb' : 'var(--text3)';
            return `<tr style="border-bottom:1px solid var(--border)">
              <td style="padding:5px 8px;color:var(--text);font-weight:700;white-space:nowrap">${fmtDt(r.date)}</td>
              <td style="padding:5px 8px;color:var(--text2)">${r.day_of_week||'—'}</td>
              <td style="padding:5px 8px;font-weight:700;color:${cor}">${label}</td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  detalhe.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <div style="font-weight:900;color:var(--text);font-size:15px">📋 ${nome}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${data.schedule||''} · Mat. ${data.matricula||'—'}</div>
        </div>
        <button onclick="document.getElementById('gabs-detalhe').innerHTML='';_absDetalheCache=null"
          style="background:transparent;border:none;font-size:18px;cursor:pointer;color:var(--text3);line-height:1;padding:0 4px">✕</button>
      </div>

      <!-- KPIs -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;margin-bottom:12px">
        <div style="background:var(--surface);border-radius:8px;padding:8px 12px;text-align:center">
          <div style="font-size:10px;color:var(--text3);font-weight:700">FALTAS</div>
          <div style="font-size:22px;font-weight:900;color:#dc2626">${data.faltas_count ?? 0}</div>
        </div>
        <div style="background:var(--surface);border-radius:8px;padding:8px 12px;text-align:center">
          <div style="font-size:10px;color:var(--text3);font-weight:700">ATESTADOS</div>
          <div style="font-size:22px;font-weight:900;color:#d97706">${data.atestados_count ?? 0}</div>
        </div>
        <div style="background:var(--surface);border-radius:8px;padding:8px 12px;text-align:center">
          <div style="font-size:10px;color:var(--text3);font-weight:700">ATRASO CALC.</div>
          <div style="font-size:16px;font-weight:900;color:#7c3aed">${totalAtrasoComp > 0 ? totalAtrasoComp+' min' : '—'}</div>
        </div>
        <div style="background:var(--surface);border-radius:8px;padding:8px 12px;text-align:center">
          <div style="font-size:10px;color:var(--text3);font-weight:700">DIAS c/ ATRASO</div>
          <div style="font-size:22px;font-weight:900;color:${diasComAtraso>0?'#dc2626':'var(--text3)'}">${diasComAtraso}</div>
        </div>
        <div style="background:var(--surface);border-radius:8px;padding:8px 12px;text-align:center">
          <div style="font-size:10px;color:var(--text3);font-weight:700">VOLT. ANTECIPADA</div>
          <div style="font-size:22px;font-weight:900;color:${totalVoltaAntecipada>0?'#2563eb':'var(--text3)'}">${totalVoltaAntecipada}</div>
          ${totalVoltaAntecipada > 0 ? `<div style="font-size:9px;color:#6b7280;margin-top:2px">${[diasVoltaAlmoco>0?'Alm: '+diasVoltaAlmoco+'d':'', diasVoltaPausa>0?'Ps: '+diasVoltaPausa+'d':''].filter(Boolean).join(' · ')}</div>` : ''}
        </div>
        <div style="background:var(--surface);border-radius:8px;padding:8px 12px;text-align:center">
          <div style="font-size:10px;color:var(--text3);font-weight:700">H. POSITIVAS</div>
          <div style="font-size:16px;font-weight:900;color:#16a34a">${data.positive_hours || '—'}</div>
        </div>
        <div style="background:var(--surface);border-radius:8px;padding:8px 12px;text-align:center">
          <div style="font-size:10px;color:var(--text3);font-weight:700">ABSENTEÍSMO</div>
          <div style="font-size:22px;font-weight:900;color:${taxaCor}">${taxa}%</div>
        </div>
      </div>

      <!-- Info período -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
        <span style="font-size:11px;color:var(--text3)">📅 ${fmtDt(data.period_start)} → ${fmtDt(data.period_end)}</span>
        <span style="font-size:11px;color:var(--text3)">Previsto: ${data.expected_hours||'—'} · Realizado: ${data.worked_hours||'—'}</span>
      </div>

      <!-- Espelho de ponto -->
      <div style="font-size:11px;font-weight:800;color:var(--text);letter-spacing:.5px;margin-bottom:6px;display:flex;align-items:center;gap:8px">
        🕐 ESPELHO DE PONTO (${diasTrab.length} dia${diasTrab.length!==1?'s':''} trabalhados)
        ${diasComAtraso > 0 ? `<span style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:12px;padding:2px 8px;font-size:10px;font-weight:800">${diasComAtraso} com atraso</span>` : ''}
        ${totalVoltaAntecipada > 0 ? `<span style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:12px;padding:2px 8px;font-size:10px;font-weight:800">${totalVoltaAntecipada} volta antecipada</span>` : ''}
      </div>
      <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--surface)">${tblPonto}</div>

      ${tblEspeciais}
    </div>`;
}


/* ── Helpers ── */
function _gestaoLoading() {
  return `<div style="color:var(--text3);padding:20px;text-align:center;font-size:13px">Carregando...</div>`;
}
function _gestaoVazio(msg) {
  return `<div style="color:var(--text3);padding:40px;text-align:center;font-size:13px">${msg}</div>`;
}
