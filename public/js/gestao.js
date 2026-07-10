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
      <button onclick="gerarRelatorioAbs()" style="padding:7px 14px;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;color:var(--text2)">📊 Gerar Relatório</button>
      <button onclick="mostrarArquivosAbs()" style="padding:7px 14px;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;color:var(--text2)">📁 Arquivos Importados</button>
      <button onclick="toggleImportarAbs()" style="padding:7px 14px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">📥 Importar PDF</button>
    </div>
  </div>

  <!-- ── Modal arquivos ── -->
  <div id="gabs-modal-arq" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;align-items:center;justify-content:center">
    <div style="background:var(--surface);border-radius:16px;padding:20px;width:min(520px,95vw);max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,.3)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="font-size:14px;font-weight:800;color:var(--text)">📁 Arquivos Importados</div>
        <div style="display:flex;align-items:center;gap:8px">
          <button onclick="absLimparTudo()" style="padding:5px 12px;background:#dc2626;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">🗑️ Limpar Tudo</button>
          <button onclick="fecharArquivosAbs()" style="background:transparent;border:none;font-size:20px;cursor:pointer;color:var(--text3);line-height:1">✕</button>
        </div>
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
        ${m === 0 ? '0 min' : m + ' min'}
      </button>`).join('')}
      <div style="display:flex;align-items:center;gap:4px">
        <input type="number" id="gabs-tol-custom" min="0" max="120" placeholder="Outro"
          style="width:70px;padding:4px 8px;border:1.5px solid var(--border);border-radius:20px;font-size:12px;background:var(--surface);color:var(--text);text-align:center"
          onkeydown="if(event.key==='Enter'){setToleranciAbs(+this.value||0);aplicarToleranciaAbs();}"/>
        <button onclick="setToleranciAbs(+(document.getElementById('gabs-tol-custom').value)||0);aplicarToleranciaAbs()"
          style="padding:4px 10px;border-radius:20px;border:1.5px solid var(--border);font-size:12px;font-weight:700;cursor:pointer;background:var(--surface2);color:var(--text2)">
          ✓
        </button>
      </div>
    </div>
    <button onclick="aplicarToleranciaAbs()"
      style="padding:4px 14px;border-radius:20px;border:1.5px solid var(--accent);background:var(--accent);color:#fff;font-size:12px;font-weight:700;cursor:pointer">
      🔄 Atualizar
    </button>
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
    btn('📈 Histórico', 'selecionarPeriodoAbs(null)', activeKey === 'todos'),
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

  // Aplica tolerância na tabela e cards automaticamente
  aplicarToleranciaAbs();
}

/* ── Recalcula tabela/cards com a tolerância atual ── */
function _parseHMtoMin(s) {
  if (!s) return 0;
  const parts = String(s).split(':');
  return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
}

function aplicarToleranciaAbs() {
  if (!_absRows.length || !_absPeriodo) return;

  const tol   = _absToleranciMin;
  const fmtM  = m => { const h = Math.floor(m/60), mm = m%60; return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`; };

  const rowsCalc = _absRows.map(r => {
    const expectedMin  = _parseHMtoMin(r.expected_hours);
    const workedMin    = _parseHMtoMin(r.worked_hours);
    const atrasoRaw    = r.total_atraso_minutes || 0;
    const atrasoEfetivo = Math.max(0, atrasoRaw - tol);

    let taxaEfetiva = parseFloat(r.absenteeism_rate) || 0;
    if (expectedMin > 0) {
      const deficit     = Math.max(0, expectedMin - workedMin);
      const horasPerd   = Math.max(deficit, atrasoEfetivo);
      taxaEfetiva       = horasPerd / expectedMin * 100;
    }

    return {
      ...r,
      absenteeism_rate:       taxaEfetiva,
      total_atraso_minutes:   atrasoEfetivo,
      total_atraso_formatted: atrasoEfetivo > 0 ? fmtM(atrasoEfetivo) : null,
    };
  }).sort((a, b) => b.absenteeism_rate - a.absenteeism_rate);

  // Atualiza KPI cards
  const cards = document.getElementById('gabs-cards');
  if (cards) {
    const totalFunc      = rowsCalc.length;
    const totalFaltas    = rowsCalc.reduce((s, r) => s + (r.faltas_count || 0), 0);
    const totalAtestados = rowsCalc.reduce((s, r) => s + (r.atestados_count || 0), 0);
    const taxaEquipe     = totalFunc > 0
      ? rowsCalc.reduce((s, r) => s + r.absenteeism_rate, 0) / totalFunc
      : 0;

    const kpis = [
      { icon:'👥', label:'Funcionários',   val: totalFunc,                bg:'#eff6ff', cor:'#1d4ed8' },
      { icon:'❌', label:'Total Faltas',   val: totalFaltas,              bg:'#fef2f2', cor:'#dc2626' },
      { icon:'🏥', label:'Atestados',      val: totalAtestados,           bg:'#fefce8', cor:'#ca8a04' },
      { icon:'📉', label:'Taxa da Equipe', val:`${taxaEquipe.toFixed(1)}%`,
        bg:  taxaEquipe>=10?'#fef2f2':taxaEquipe>=5?'#fefce8':'#f0fdf4',
        cor: taxaEquipe>=10?'#dc2626':taxaEquipe>=5?'#ca8a04':'#16a34a' },
    ];
    cards.innerHTML = kpis.map(c => `
      <div style="background:${c.bg};border:1px solid ${c.cor}33;border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:12px">
        <div style="font-size:26px">${c.icon}</div>
        <div>
          <div style="font-size:10px;font-weight:800;color:${c.cor}aa;letter-spacing:.5px">${c.label.toUpperCase()}</div>
          <div style="font-size:24px;font-weight:900;color:${c.cor};font-family:'Space Mono',monospace;line-height:1.1">${c.val}</div>
        </div>
      </div>`).join('');
  }

  _renderListaNomesAbs(rowsCalc);
  _renderTabelaAbs(rowsCalc);
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

async function absLimparTudo() {
  if (!confirm('⚠️ ATENÇÃO: Isso vai apagar TODOS os PDFs importados e todos os dados de absenteísmo.\n\nDeseja continuar?')) return;
  if (!confirm('Confirmar? Esta ação não pode ser desfeita.')) return;
  try {
    const res = await fetch(`${API}/gestao/absenteismo/uploads/all`, { method:'DELETE', credentials:'include' });
    const data = await res.json().catch(()=>({}));
    if (res.ok) {
      toast('Todos os dados foram removidos!', 'sucesso');
      _absUploads = []; _absPeriodo = null;
      fecharArquivosAbs();
      carregarGestaoAbsenteismo();
    } else {
      toast('Erro ao limpar: ' + (data.erro || data.detail || `HTTP ${res.status}`), 'erro');
    }
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
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

  // "Todos" → exibe histórico de evolução em vez da lista de funcionários
  if (!_absPeriodo) {
    await _renderHistoricoEvolucao();
    return;
  }

  try {
    const pdqs = `?start_date=${_absPeriodo.start}&end_date=${_absPeriodo.end}`;
    const res = await fetch(`${API}/gestao/absenteismo/team${pdqs}`, { credentials:'include' });
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.erro || `HTTP ${res.status}`); }
    const team = await res.json();

    const totalFunc      = team.total_employees ?? (team.employees || []).length;
    const totalFaltas    = team.total_faltas    ?? 0;
    const totalAtestados = team.total_atestados ?? 0;
    const taxaEquipe     = parseFloat(team.team_absenteeism_rate) || 0;

    const periodoEl = document.getElementById('gabs-periodo');
    if (periodoEl && _absPeriodo) {
      const fmtDt = s => new Date(s + 'T12:00:00').toLocaleDateString('pt-BR');
      periodoEl.textContent = `Período: ${fmtDt(_absPeriodo.start)} a ${fmtDt(_absPeriodo.end)}`;
    } else if (periodoEl) {
      periodoEl.textContent = '';
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


/* ── Histórico de evolução por período ── */
async function _renderHistoricoEvolucao() {
  const cards  = document.getElementById('gabs-cards');
  const tabela = document.getElementById('gabs-tabela');
  const lista  = document.getElementById('gabs-lista-nomes');
  const periEl = document.getElementById('gabs-periodo');

  if (periEl) periEl.textContent = 'Visão geral de todos os períodos';
  if (lista) lista.innerHTML = '<div style="color:var(--text3);font-size:11px;padding:14px;text-align:center">Selecione um período para ver os funcionários</div>';
  const detalheEl = document.getElementById('gabs-detalhe');
  if (detalheEl) detalheEl.innerHTML = '';

  try {
    const res = await fetch(`${API}/gestao/absenteismo/historico`, { credentials: 'include' });
    if (!res.ok) throw new Error('Erro ao carregar histórico');
    const hist = await res.json();

    if (!hist.length) {
      if (cards) cards.innerHTML = '<div style="grid-column:1/-1;color:var(--text3);font-size:12px;padding:8px">Nenhum período importado ainda.</div>';
      if (tabela) tabela.innerHTML = '';
      return;
    }

    const last = hist[hist.length - 1];
    const prev = hist.length > 1 ? hist[hist.length - 2] : null;

    const trendHtml = (cur, old, lessBetter) => {
      if (old == null) return '';
      const diff = cur - old;
      if (Math.abs(diff) < 0.05) return '';
      const up = diff > 0;
      const good = lessBetter ? !up : up;
      const color = good ? '#16a34a' : '#dc2626';
      return `<span style="font-size:9px;color:${color};margin-left:4px">${up ? '▲' : '▼'}${Math.abs(diff).toFixed(1)}</span>`;
    };

    const fmtPer = p => {
      if (!p.period_start) return p.filename || `Importação #${p.upload_id}`;
      const f = s => { const [y,m,d] = s.split('-'); return `${d}/${m}`; };
      return p.period_start === p.period_end ? f(p.period_start) : `${f(p.period_start)} – ${f(p.period_end)}`;
    };

    if (cards) {
      const kpis = [
        { icon:'📋', label:'Períodos importados', val: hist.length, bg:'#eff6ff', cor:'#1d4ed8', extra:'' },
        { icon:'👥', label:'Funcionários (atual)', val: last.total_employees, bg:'#f0fdf4', cor:'#16a34a',
          extra: prev ? trendHtml(last.total_employees, prev.total_employees, false) : '' },
        { icon:'📉', label:'Absenteísmo (atual)', val: `${last.absenteeism_rate.toFixed(1)}%`,
          bg: last.absenteeism_rate>=10?'#fef2f2':last.absenteeism_rate>=5?'#fefce8':'#f0fdf4',
          cor: last.absenteeism_rate>=10?'#dc2626':last.absenteeism_rate>=5?'#ca8a04':'#16a34a',
          extra: prev ? trendHtml(last.absenteeism_rate, prev.absenteeism_rate, true) : '' },
        { icon:'⏱', label:'Atraso (atual)', val: `${last.delay_rate.toFixed(1)}%`,
          bg: last.delay_rate>=5?'#fef2f2':last.delay_rate>=2?'#fefce8':'#f0fdf4',
          cor: last.delay_rate>=5?'#dc2626':last.delay_rate>=2?'#ca8a04':'#16a34a',
          extra: prev ? trendHtml(last.delay_rate, prev.delay_rate, true) : '' },
      ];
      cards.innerHTML = kpis.map(c => `
        <div style="background:${c.bg};border:1px solid ${c.cor}33;border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:12px">
          <div style="font-size:26px">${c.icon}</div>
          <div>
            <div style="font-size:10px;font-weight:800;color:${c.cor}aa;letter-spacing:.5px">${c.label.toUpperCase()}</div>
            <div style="font-size:22px;font-weight:900;color:${c.cor};font-family:'Space Mono',monospace;line-height:1.1">${c.val}${c.extra}</div>
          </div>
        </div>`).join('');
    }

    if (tabela) {
      const rows = [...hist].reverse();
      tabela.innerHTML = `
        <div style="font-size:11px;font-weight:800;color:var(--text3);letter-spacing:.5px;margin-bottom:10px">📈 EVOLUÇÃO POR PERÍODO</div>
        <div style="overflow-x:auto;border:1px solid var(--border);border-radius:12px">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="background:var(--surface2)">
                <th style="padding:9px 12px;text-align:left;color:var(--text3);font-size:10px;font-weight:800;border-bottom:1px solid var(--border)">PERÍODO</th>
                <th style="padding:9px 12px;text-align:center;color:var(--text3);font-size:10px;font-weight:800;border-bottom:1px solid var(--border)">FUNC.</th>
                <th style="padding:9px 12px;text-align:center;color:var(--text3);font-size:10px;font-weight:800;border-bottom:1px solid var(--border)">FALTAS</th>
                <th style="padding:9px 12px;text-align:center;color:var(--text3);font-size:10px;font-weight:800;border-bottom:1px solid var(--border)">ATESTADOS</th>
                <th style="padding:9px 12px;text-align:center;color:var(--text3);font-size:10px;font-weight:800;border-bottom:1px solid var(--border)">ABSENTEÍSMO</th>
                <th style="padding:9px 12px;text-align:center;color:var(--text3);font-size:10px;font-weight:800;border-bottom:1px solid var(--border)">ATRASO</th>
                <th style="padding:9px 12px;text-align:center;color:var(--text3);font-size:10px;font-weight:800;border-bottom:1px solid var(--border)">VER</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((p, idx) => {
                const older = rows[idx + 1];
                const absRt = p.absenteeism_rate;
                const absCor = absRt >= 10 ? '#dc2626' : absRt >= 5 ? '#d97706' : '#16a34a';
                const delRt = p.delay_rate;
                const delCor = delRt >= 5 ? '#dc2626' : delRt >= 2 ? '#d97706' : '#16a34a';
                const isLatest = idx === 0;
                const absTrend = older ? trendHtml(absRt, older.absenteeism_rate, true) : '';
                const delTrend = older ? trendHtml(delRt, older.delay_rate, true) : '';
                const perLabel = fmtPer(p);
                const sel = p.period_start && p.period_end
                  ? `selecionarPeriodoAbs('${p.period_start}','${p.period_end}')`
                  : `selecionarUploadAbs(${p.upload_id})`;
                return `
                <tr style="border-bottom:1px solid var(--border);${isLatest ? 'background:var(--surface2)' : ''}">
                  <td style="padding:9px 12px;font-weight:700;color:var(--text)">
                    ${isLatest ? '<span style="font-size:9px;background:#1d4ed8;color:#fff;padding:2px 6px;border-radius:4px;margin-right:6px">ATUAL</span>' : ''}
                    ${perLabel}
                  </td>
                  <td style="padding:9px 12px;text-align:center;font-weight:700;color:var(--text2)">${p.total_employees}</td>
                  <td style="padding:9px 12px;text-align:center;font-weight:700;color:${p.total_faltas>0?'#dc2626':'var(--text2)'}">${p.total_faltas}</td>
                  <td style="padding:9px 12px;text-align:center;font-weight:700;color:${p.total_atestados>0?'#d97706':'var(--text2)'}">${p.total_atestados}</td>
                  <td style="padding:9px 12px;text-align:center"><span style="font-weight:800;color:${absCor}">${absRt.toFixed(1)}%${absTrend}</span></td>
                  <td style="padding:9px 12px;text-align:center"><span style="font-weight:800;color:${delCor}">${delRt.toFixed(1)}%${delTrend}</span></td>
                  <td style="padding:9px 12px;text-align:center">
                    <button onclick="${sel}"
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
  } catch(e) {
    if (cards) cards.innerHTML = `<div style="grid-column:1/-1;color:var(--red);font-size:12px;padding:8px">Erro ao carregar histórico: ${e.message}</div>`;
    if (tabela) tabela.innerHTML = '';
  }
}

function selecionarUploadAbs(uploadId) {
  // Busca o período do upload nos dados cacheados e seleciona
  const up = _absUploads.find(u => u.id === uploadId);
  if (!up) return;
  const p = _parsePeriodFromUpload(up);
  if (p) selecionarPeriodoAbs(p.start, p.end);
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

  // Dias com ocorrência especial (DSR, feriado, falta)
  const diasEspeciais = allRec.filter(r => r.status !== 'normal' || r.falta || r.atestado || r.ferias);

  const _fmtMin = m => m > 0 ? `+${m} min` : '—';
  const _lunchDur = r => r.lunch_start && r.lunch_end
    ? (() => { const [lh,lm]=r.lunch_start.split(':').map(Number), [eh,em]=r.lunch_end.split(':').map(Number); return (eh*60+em)-(lh*60+lm); })()
    : null;
  const _breakDur = r => r.break_start && r.break_end
    ? (() => { const [lh,lm]=r.break_start.split(':').map(Number), [eh,em]=r.break_end.split(':').map(Number); return (eh*60+em)-(lh*60+lm); })()
    : null;

  // Volta antecipada do almoço (almoço < 60min) — deve ficar após _lunchDur
  let totalVoltaAntecipada = 0, totalMinVoltaAlmoco = 0;
  diasTrab.forEach(r => {
    const ld = _lunchDur(r);
    if (ld !== null && ld > 0 && ld < LUNCH_MIN) {
      totalVoltaAntecipada++;
      totalMinVoltaAlmoco += LUNCH_MIN - ld;
    }
  });
  const _fmtHM = m => { const h = Math.floor(m / 60), mm = m % 60; return `${String(h).padStart(3,'0')}:${String(mm).padStart(2,'0')}`; };

  // Detecção de batidas suspeitas: dias com menos de 30 min trabalhados (líquido)
  const ANOMALY_MIN = 30;
  diasTrab.forEach(r => {
    if (r.entry_time && r.exit_time) {
      const toM2 = s => { const [h,m] = s.split(':').map(Number); return h*60+m; };
      const en = toM2(r.entry_time), ex = toM2(r.exit_time);
      let raw = ex >= en ? ex - en : (1440 - en) + ex; // suporte turno noturno
      const ld = _lunchDur(r), bd = _breakDur(r);
      if (ld && ld > 0) raw -= ld;
      if (bd && bd > 0) raw -= bd;
      r._workedMin = Math.max(0, raw);
      r._anomalia  = r._workedMin < ANOMALY_MIN;
    } else {
      r._workedMin = null;
      r._anomalia  = false;
    }
  });
  const diasAnomalia = diasTrab.filter(r => r._anomalia).length;

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
            const anomalia   = r._anomalia;
            const ld         = _lunchDur(r);
            const bd         = _breakDur(r);
            const lunchOver  = ld !== null && ld > LUNCH_MIN;
            const lunchEarly = ld !== null && ld > 0 && ld < LUNCH_MIN;
            const breakOver  = bd !== null && bd > BREAK_MIN;
            const earlyMin   = lunchEarly ? LUNCH_MIN - ld : 0;
            const rowBg      = anomalia ? '#fef2f2' : late ? '#fff7ed' : lunchEarly ? '#eff6ff' : '';
            const lunchStr   = r.lunch_start && r.lunch_end
              ? `<span style="color:${lunchOver?'#d97706':lunchEarly?'#2563eb':'var(--text2)'};font-weight:${lunchOver||lunchEarly?'700':'400'}">${r.lunch_start} → ${r.lunch_end}${lunchOver?` <small>(${ld}min)</small>`:lunchEarly?` <small>${ld}min</small>`:''}</span>`
              : '—';
            const breakStr   = r.break_start && r.break_end
              ? `<span style="color:${breakOver?'#d97706':'var(--text2)'};font-weight:${breakOver?'700':'400'}">${r.break_start} → ${r.break_end}${breakOver?` <small>(${bd}min)</small>`:''}</span>`
              : '—';
            const atrasoPartes = [];
            if (anomalia) atrasoPartes.push(`<span style="background:#dc2626;color:#fff;border-radius:10px;padding:1px 6px;font-size:10px;font-weight:800;white-space:nowrap">⚠️ ${r._workedMin}min</span>`);
            if (atr > 0) atrasoPartes.push(`<span style="color:${late?'#dc2626':'#d97706'};font-weight:800">${atr} min</span>`);
            if (earlyMin > 0) atrasoPartes.push(`<span style="color:#2563eb;font-size:10px">−${earlyMin} min antecip.</span>`);
            const atrasoCel = atrasoPartes.length ? atrasoPartes.join('<br>') : '—';
            return `<tr style="border-bottom:1px solid var(--border);background:${rowBg}">
              <td style="padding:5px 8px;font-weight:700;white-space:nowrap;color:${anomalia?'#dc2626':late?'#c2410c':'var(--text)'}">${fmtDt(r.date)}</td>
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
            const stLow = (r.status||'').toLowerCase();
            const label = r.falta    ? '❌ Falta'
              : r.atestado ? '🏥 Atestado'
              : r.ferias   ? '🌴 Férias'
              : stLow === 'dsr'                                                  ? '🔵 DSR'
              : stLow.includes('folga') || stLow.includes('banco')               ? '🏦 Folga BH'
              : stLow === 'holiday' || stLow === 'feriado'                       ? '🎉 Feriado'
              : r.status || '—';
            const cor   = r.falta ? '#dc2626' : r.atestado ? '#d97706' : r.ferias ? '#2563eb'
              : stLow.includes('folga') || stLow.includes('banco') ? '#16a34a' : 'var(--text3)';
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
        ${(data.folga_bh_days||0) > 0 ? `
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:8px 12px;text-align:center" title="Dias de folga banco de horas: excluídos do cálculo de absenteísmo">
          <div style="font-size:10px;color:#16a34a;font-weight:700">FOLGA BH</div>
          <div style="font-size:22px;font-weight:900;color:#16a34a">${data.folga_bh_days}</div>
          <div style="font-size:9px;color:#6b7280;margin-top:1px">excluído do cálculo</div>
        </div>` : ''}
        <div style="background:var(--surface);border-radius:8px;padding:8px 12px;text-align:center">
          <div style="font-size:10px;color:var(--text3);font-weight:700">ATRASO CALC.</div>
          <div style="font-size:16px;font-weight:900;color:#7c3aed">${totalAtrasoComp > 0 ? totalAtrasoComp+' min' : '—'}</div>
        </div>
        <div style="background:var(--surface);border-radius:8px;padding:8px 12px;text-align:center">
          <div style="font-size:10px;color:var(--text3);font-weight:700">DIAS c/ ATRASO</div>
          <div style="font-size:22px;font-weight:900;color:${diasComAtraso>0?'#dc2626':'var(--text3)'}">${diasComAtraso}</div>
        </div>
        <div style="background:var(--surface);border-radius:8px;padding:8px 12px;text-align:center">
          <div style="font-size:10px;color:var(--text3);font-weight:700">ANTECIPADA</div>
          <div style="font-size:16px;font-weight:900;color:${totalVoltaAntecipada>0?'#2563eb':'var(--text3)'};font-family:monospace">${totalMinVoltaAlmoco > 0 ? _fmtHM(totalMinVoltaAlmoco) : '—'}</div>
          ${totalVoltaAntecipada > 0 ? `<div style="font-size:9px;color:#6b7280;margin-top:2px">${totalVoltaAntecipada} dia${totalVoltaAntecipada!==1?'s':''} de almoço</div>` : ''}
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
      <div style="margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:4px">
          <span style="font-size:11px;color:var(--text3)">📅 ${fmtDt(data.period_start)} → ${fmtDt(data.period_end)}</span>
          <span style="font-size:11px;color:var(--text3)">Previsto <b>${data.expected_hours||'—'}</b> · Realizado <b>${data.worked_hours||'—'}</b></span>
          ${(data.folga_bh_days||0) > 0 && data.expected_hours_adj ? `<span style="font-size:11px;color:#16a34a;font-weight:700">Previsto ajustado (−${data.folga_bh_days} folga BH): ${data.expected_hours_adj}</span>` : ''}
        </div>
        ${diasAnomalia > 0 ? (() => {
          const dias = diasTrab.filter(r => r._anomalia)
            .map(r => `${fmtDt(r.date)} (${r._workedMin}min trabalhados)`).join(', ');
          return `<div style="font-size:11px;color:#fff;background:#dc2626;border-radius:6px;padding:5px 10px;font-weight:700;margin-bottom:6px;display:inline-block">
            ⚠️ Batida suspeita: ${dias} — verificar se houve esquecimento de ponto
          </div>`;
        })() : ''}
        ${(() => {
          const expAdj = data.expected_hours_adj || data.expected_hours;
          const parseHM = s => { if (!s || s==='--:--') return 0; const p=String(s).split(':'); return (parseInt(p[0])||0)*60+(parseInt(p[1])||0); };
          const expMin  = parseHM(expAdj);
          const wrkMin  = parseHM(data.worked_hours);
          const atrMin  = data.total_atraso_minutes || 0;
          const deficit = Math.max(0, expMin - wrkMin);
          const lost    = Math.max(deficit, atrMin);
          if (lost <= 0) return '';
          const fmtM = m => { const h=Math.floor(m/60), mm=m%60; return h>0 ? `${h}h${mm>0?mm+'min':''}` : `${mm}min`; };
          const origem = deficit > atrMin
            ? `déficit de horas (${fmtM(deficit)} a menos no período)`
            : `atraso acumulado (${fmtM(atrMin)})`;
          return `<div style="font-size:10px;color:#92400e;background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;padding:3px 8px;display:inline-block">
            ⚠️ Absenteísmo de ${taxa}% originado por ${origem}
          </div>`;
        })()}
      </div>

      <!-- Espelho de ponto -->
      <div style="font-size:11px;font-weight:800;color:var(--text);letter-spacing:.5px;margin-bottom:6px;display:flex;align-items:center;gap:8px">
        🕐 ESPELHO DE PONTO (${diasTrab.length} dia${diasTrab.length!==1?'s':''} trabalhados)
        ${diasAnomalia > 0 ? `<span style="background:#dc2626;color:#fff;border-radius:12px;padding:2px 8px;font-size:10px;font-weight:800">⚠️ ${diasAnomalia} batida${diasAnomalia>1?'s':''} suspeita${diasAnomalia>1?'s':''}</span>` : ''}
        ${diasComAtraso > 0 ? `<span style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:12px;padding:2px 8px;font-size:10px;font-weight:800">${diasComAtraso} com atraso</span>` : ''}
        ${totalVoltaAntecipada > 0 ? `<span style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:12px;padding:2px 8px;font-size:10px;font-weight:800">${totalVoltaAntecipada} volta antecipada</span>` : ''}
      </div>
      <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--surface)">${tblPonto}</div>

      ${tblEspeciais}
    </div>`;
}


/* ── Relatório de atrasos e voltas antecipadas ── */
async function gerarRelatorioAbs() {
  const LUNCH_MIN = 60, BREAK_MIN = 15;
  const toM = s => { if (!s) return null; const [h,m] = s.split(':').map(Number); return h*60+m; };
  const fmtDt = s => s ? new Date(s+'T12:00:00').toLocaleDateString('pt-BR') : '—';
  const fmtHM = m => { const h=Math.floor(m/60), mm=m%60; return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`; };

  const pdqs = _absPeriodo ? `?start_date=${_absPeriodo.start}&end_date=${_absPeriodo.end}` : '';
  let funcionarios;
  try {
    const res = await fetch(`${API}/gestao/absenteismo/relatorio${pdqs}`, { credentials:'include' });
    if (!res.ok) throw new Error(`Erro ${res.status}`);
    funcionarios = await res.json();
  } catch(e) {
    toast('Erro ao gerar relatório: ' + e.message, 'erro');
    return;
  }

  const periodoLabel = _absPeriodo
    ? `${new Date(_absPeriodo.start+'T12:00:00').toLocaleDateString('pt-BR')} a ${new Date(_absPeriodo.end+'T12:00:00').toLocaleDateString('pt-BR')}`
    : 'Todos os períodos';

  // Monta linhas por funcionário
  let linhas = '';
  let totalAtrasoGeral = 0, totalAntecipadoGeral = 0, totalFuncsComOcorr = 0;

  for (const func of funcionarios) {
    const schedMatch = (func.schedule || '').match(/(\d+)h/);
    const schedStart = schedMatch ? parseInt(schedMatch[1]) * 60 : null;

    // Heurística de mediana para entrada
    let sched = schedStart;
    if (sched !== null) {
      const entries = func.daily_records.map(r => toM(r.entry_time)).filter(v => v !== null).sort((a,b)=>a-b);
      if (entries.length) {
        const typ = entries[Math.floor(entries.length/2)];
        if (Math.abs(typ - sched) > 90) sched = null;
      }
    }

    const eventos = [];
    for (const r of func.daily_records) {
      const entry = toM(r.entry_time);
      const ls    = toM(r.lunch_start), le = toM(r.lunch_end);
      const bs    = toM(r.break_start), be = toM(r.break_end);

      if (sched !== null && entry !== null && entry > sched)
        eventos.push({ date: r.date, dow: r.day_of_week, tipo: 'Atraso entrada',    min: entry - sched,   cor: '#dc2626' });
      if (ls !== null && le !== null && le - ls > LUNCH_MIN)
        eventos.push({ date: r.date, dow: r.day_of_week, tipo: 'Atraso almoço',     min: (le-ls) - LUNCH_MIN, cor: '#d97706' });
      if (ls !== null && le !== null && le - ls > 0 && le - ls < LUNCH_MIN)
        eventos.push({ date: r.date, dow: r.day_of_week, tipo: 'Volta antecipada',  min: LUNCH_MIN - (le-ls), cor: '#2563eb' });
      if (bs !== null && be !== null && be - bs > BREAK_MIN)
        eventos.push({ date: r.date, dow: r.day_of_week, tipo: 'Atraso pausa',      min: (be-bs) - BREAK_MIN, cor: '#d97706' });
    }

    if (!eventos.length) continue;
    totalFuncsComOcorr++;
    const totalAtrasoFunc    = eventos.filter(e=>e.tipo!=='Volta antecipada').reduce((s,e)=>s+e.min,0);
    const totalAntecipadoFunc= eventos.filter(e=>e.tipo==='Volta antecipada').reduce((s,e)=>s+e.min,0);
    totalAtrasoGeral     += totalAtrasoFunc;
    totalAntecipadoGeral += totalAntecipadoFunc;

    linhas += `
      <tr style="background:#f8fafc">
        <td colspan="5" style="padding:10px 12px 4px;font-weight:800;font-size:13px;color:#1e293b;border-top:2px solid #e2e8f0">
          ${func.name}
          <span style="font-weight:400;font-size:11px;color:#64748b;margin-left:8px">${func.sector||''} · Mat. ${func.matricula||'—'} · ${func.schedule||'—'}</span>
          <span style="float:right;font-size:11px;color:#64748b">
            ${totalAtrasoFunc>0?`<span style="color:#dc2626">Atraso total: ${fmtHM(totalAtrasoFunc)}</span>`:''}
            ${totalAtrasoFunc>0&&totalAntecipadoFunc>0?' · ':''}
            ${totalAntecipadoFunc>0?`<span style="color:#2563eb">Antecipado: ${fmtHM(totalAntecipadoFunc)}</span>`:''}
          </span>
        </td>
      </tr>`;

    for (const ev of eventos) {
      const isAntecip = ev.tipo === 'Volta antecipada';
      linhas += `
        <tr style="border-bottom:1px solid #f1f5f9">
          <td style="padding:5px 12px 5px 24px;font-size:12px;color:#374151;white-space:nowrap">${fmtDt(ev.date)}</td>
          <td style="padding:5px 8px;font-size:11px;color:#9ca3af">${ev.dow||'—'}</td>
          <td style="padding:5px 8px">
            <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;
              background:${isAntecip?'#eff6ff':ev.cor==='#dc2626'?'#fef2f2':'#fefce8'};
              color:${ev.cor}">
              ${ev.tipo}
            </span>
          </td>
          <td style="padding:5px 8px;font-size:13px;font-weight:800;color:${ev.cor};font-family:monospace;text-align:right">
            ${isAntecip?'−':'+'} ${fmtHM(ev.min)}
          </td>
          <td style="padding:5px 8px;font-size:11px;color:#9ca3af;text-align:right">${ev.min} min</td>
        </tr>`;
    }
  }

  if (!linhas) {
    toast('Nenhuma ocorrência encontrada no período.', 'info');
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório de Atrasos e Voltas Antecipadas</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color:#1e293b; background:#fff; padding:24px; }
    h1  { font-size:18px; font-weight:800; margin-bottom:4px; }
    .sub{ font-size:12px; color:#64748b; margin-bottom:20px; }
    .resumo { display:flex; gap:16px; margin-bottom:20px; flex-wrap:wrap; }
    .card { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 18px; min-width:140px; }
    .card .lbl { font-size:10px; font-weight:700; color:#94a3b8; letter-spacing:.5px; }
    .card .val { font-size:22px; font-weight:900; margin-top:2px; }
    table { width:100%; border-collapse:collapse; font-size:12px; }
    thead th { padding:8px 12px; background:#f1f5f9; font-size:10px; font-weight:800; color:#64748b; letter-spacing:.5px; text-align:left; border-bottom:2px solid #e2e8f0; }
    @media print {
      body { padding:12px; }
      button { display:none !important; }
      tr { page-break-inside:avoid; }
    }
  </style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
    <h1>📊 Relatório de Atrasos e Voltas Antecipadas</h1>
    <button onclick="window.print()" style="padding:8px 16px;background:#1e293b;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">🖨️ Imprimir</button>
  </div>
  <div class="sub">Período: ${periodoLabel} · Gerado em ${new Date().toLocaleString('pt-BR')}</div>

  <div class="resumo">
    <div class="card"><div class="lbl">FUNCIONÁRIOS C/ OCORRÊNCIA</div><div class="val" style="color:#1e293b">${totalFuncsComOcorr}</div></div>
    <div class="card"><div class="lbl">TOTAL ATRASO</div><div class="val" style="color:#dc2626">${fmtHM(totalAtrasoGeral)}</div></div>
    <div class="card"><div class="lbl">TOTAL ANTECIPADO</div><div class="val" style="color:#2563eb">${fmtHM(totalAntecipadoGeral)}</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>DATA</th>
        <th>DIA</th>
        <th>TIPO</th>
        <th style="text-align:right">HORA:MIN</th>
        <th style="text-align:right">MINUTOS</th>
      </tr>
    </thead>
    <tbody>${linhas}</tbody>
  </table>
</body>
</html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}


/* ── Helpers ── */
function _gestaoLoading() {
  return `<div style="color:var(--text3);padding:20px;text-align:center;font-size:13px">Carregando...</div>`;
}
function _gestaoVazio(msg) {
  return `<div style="color:var(--text3);padding:40px;text-align:center;font-size:13px">${msg}</div>`;
}
