'use strict';

/* ══════════════════════════════════════════
   GESTÃO — página de Gerente / Coordenador
   3 abas: Performance · Ocorrências · Absenteísmo
══════════════════════════════════════════ */

let _gestaoTabAtual = 'performance';

function renderizarPagGestao() {
  const root = document.getElementById('pag-gestao');
  if (!root) return;
  root.innerHTML = `
<div style="padding:20px 24px 0">
  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:20px">
    <div style="font-family:'Space Mono',monospace;font-size:17px;color:var(--text)">📅 Absenteísmo</div>
    <button onclick="toggleImportarAbs()" style="padding:8px 16px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">📥 Importar PDF</button>
  </div>

  <!-- ÁREA DE IMPORTAÇÃO (colapsável) -->
  <div id="gabs-import-area" style="display:none;background:var(--surface2);border:1.5px dashed var(--border);border-radius:12px;padding:20px;margin-bottom:20px">
    <div style="font-size:12px;font-weight:700;color:var(--text3);letter-spacing:1px;margin-bottom:12px">IMPORTAR RELATÓRIO DE PONTO (PDF InPonto / MIESS)</div>
    <div id="gabs-drop-zone"
      ondragover="event.preventDefault();this.style.borderColor='var(--accent)'"
      ondragleave="this.style.borderColor='var(--border)'"
      ondrop="absHandleDrop(event)"
      style="border:2px dashed var(--border);border-radius:10px;padding:28px;text-align:center;cursor:pointer;transition:.2s"
      onclick="document.getElementById('gabs-file-input').click()">
      <div style="font-size:32px;margin-bottom:8px">📄</div>
      <div style="font-size:14px;font-weight:700;color:var(--text)">Clique ou arraste o PDF aqui</div>
      <div style="font-size:12px;color:var(--text3);margin-top:4px">Relatório de ponto do InPonto / MIESS — máx. 30 MB</div>
    </div>
    <input type="file" id="gabs-file-input" accept=".pdf" style="display:none" onchange="absEnviarPdf(this.files[0])">
    <div id="gabs-upload-status" style="margin-top:10px;font-size:13px"></div>

    <!-- Histórico de uploads -->
    <div style="margin-top:16px">
      <div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:1px;margin-bottom:8px">HISTÓRICO DE IMPORTAÇÕES</div>
      <div id="gabs-historico">Carregando...</div>
    </div>
  </div>
</div>

<div style="padding:0 24px 24px">
  <div id="gabs-cards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px"></div>
  <div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:1px;margin-bottom:10px">RANKING POR ABSENTEÍSMO</div>
  <div id="gabs-tabela" style="overflow-x:auto"></div>
  <div id="gabs-detalhe" style="margin-top:20px"></div>
</div>
`;
  carregarGestaoAbsenteismo();
}


function toggleImportarAbs() {
  const area = document.getElementById('gabs-import-area');
  if (!area) return;
  const visible = area.style.display !== 'none';
  area.style.display = visible ? 'none' : '';
  if (!visible) carregarHistoricoAbs();
}

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
    carregarHistoricoAbs();
    carregarGestaoAbsenteismo();
  } catch(e) {
    status.innerHTML = `<span style="color:var(--red)">❌ Erro: ${e.message}</span>`;
  }
}

async function carregarHistoricoAbs() {
  const el = document.getElementById('gabs-historico');
  if (!el) return;
  try {
    const res   = await fetch(`${API}/gestao/absenteismo/uploads`, { credentials:'include' });
    const lista = await res.json();
    if (!Array.isArray(lista) || !lista.length) {
      el.innerHTML = '<div style="color:var(--text3);font-size:12px">Nenhum arquivo importado ainda.</div>';
      return;
    }
    el.innerHTML = lista.map(u => {
      const ok  = u.status === 'success';
      const dt  = u.upload_at ? new Date(u.upload_at).toLocaleString('pt-BR') : '—';
      const cor = ok ? 'var(--green)' : 'var(--red)';
      const ico = ok ? '✅' : '❌';
      return `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;background:var(--surface);margin-bottom:6px;font-size:12px">
        <span>${ico}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.filename}</div>
          <div style="color:var(--text3)">${dt} · <span style="color:${cor}">${ok ? `${u.records_count ?? 0} func.` : u.error_message || 'erro'}</span></div>
        </div>
        <button onclick="absExcluirUpload(${u.id},this)" title="Excluir"
          style="background:transparent;border:none;color:var(--red);font-size:16px;cursor:pointer;padding:4px">🗑️</button>
      </div>`;
    }).join('');
  } catch(e) {
    el.innerHTML = `<div style="color:var(--red);font-size:12px">Erro ao carregar histórico.</div>`;
  }
}

async function absExcluirUpload(id, btn) {
  if (!confirm('Excluir esta importação? Os dados dos funcionários serão removidos.')) return;
  btn.disabled = true;
  try {
    const res = await fetch(`${API}/gestao/absenteismo/uploads/${id}`, { method:'DELETE', credentials:'include' });
    if (res.ok) { carregarHistoricoAbs(); carregarGestaoAbsenteismo(); }
    else btn.disabled = false;
  } catch(e) { btn.disabled = false; }
}


/* ── Performance ──────────────────────────────────────────────── */
async function carregarGestaoPerformance() {
  const ini   = document.getElementById('gperf-ini')?.value;
  const fim   = document.getElementById('gperf-fim')?.value;
  const turno = document.getElementById('gperf-turno')?.value || '';
  const cards = document.getElementById('gperf-cards');
  const tabela = document.getElementById('gperf-tabela');
  if (!ini || !fim || !cards || !tabela) return;

  cards.innerHTML  = _gestaoLoading();
  tabela.innerHTML = '';

  try {
    const qs  = `ini=${ini}&fim=${fim}${turno ? `&turno=${turno}` : ''}`;
    const [sepsRes, metasRes] = await Promise.all([
      fetch(`${API}/performance/separadores?${qs}`, { credentials:'include' }),
      fetch(`${API}/performance/metas?${qs}`, { credentials:'include' }),
    ]);

    const seps = await sepsRes.json();
    const metas = metasRes.ok ? await metasRes.json() : {};

    if (!Array.isArray(seps) || !seps.length) {
      cards.innerHTML  = '';
      tabela.innerHTML = _gestaoVazio('Nenhum dado encontrado para o período.');
      return;
    }

    const totalPedidos = seps.reduce((s, r) => s + (r.pedidos || 0), 0);
    const totalItens   = seps.reduce((s, r) => s + (r.itens   || 0), 0);
    const mediaTempo   = seps.filter(r => r.tempo_medio_min).reduce((s, r, _, a) => s + r.tempo_medio_min / a.length, 0);
    const top          = seps.reduce((a, b) => (b.pedidos || 0) > (a.pedidos || 0) ? b : a, seps[0]);

    cards.innerHTML = [
      { icon:'📦', label:'Total Pedidos', val: totalPedidos },
      { icon:'🔢', label:'Itens Separados', val: totalItens.toLocaleString('pt-BR') },
      { icon:'⏱️', label:'Tempo Médio', val: mediaTempo ? `${mediaTempo.toFixed(1)} min` : '—' },
      { icon:'🏆', label:'Top Separador', val: top?.nome || '—' },
    ].map(c => `
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:16px">
        <div style="font-size:22px;margin-bottom:6px">${c.icon}</div>
        <div style="font-size:11px;color:var(--text3);font-weight:700;letter-spacing:.5px;margin-bottom:4px">${c.label.toUpperCase()}</div>
        <div style="font-size:22px;font-weight:800;color:var(--text);font-family:'Space Mono',monospace">${c.val}</div>
      </div>`).join('');

    const metaObj = (metas.metas || []).reduce((o, m) => { o[m.usuario_id] = m; return o; }, {});
    tabela.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--surface2)">
            <th style="padding:10px 12px;text-align:left;color:var(--text3);font-size:11px;font-weight:700;border-bottom:1px solid var(--border)">#</th>
            <th style="padding:10px 12px;text-align:left;color:var(--text3);font-size:11px;font-weight:700;border-bottom:1px solid var(--border)">COLABORADOR</th>
            <th style="padding:10px 12px;text-align:center;color:var(--text3);font-size:11px;font-weight:700;border-bottom:1px solid var(--border)">TURNO</th>
            <th style="padding:10px 12px;text-align:center;color:var(--text3);font-size:11px;font-weight:700;border-bottom:1px solid var(--border)">PEDIDOS</th>
            <th style="padding:10px 12px;text-align:center;color:var(--text3);font-size:11px;font-weight:700;border-bottom:1px solid var(--border)">ITENS</th>
            <th style="padding:10px 12px;text-align:center;color:var(--text3);font-size:11px;font-weight:700;border-bottom:1px solid var(--border)">TEMPO MÉD.</th>
            <th style="padding:10px 12px;text-align:center;color:var(--text3);font-size:11px;font-weight:700;border-bottom:1px solid var(--border)">META</th>
          </tr>
        </thead>
        <tbody>
          ${seps.sort((a,b) => (b.pedidos||0)-(a.pedidos||0)).map((r, i) => {
            const m  = metaObj[r.usuario_id];
            const pct = m ? Math.round((r.pedidos / (m.meta_calculada || 1)) * 100) : null;
            const cor = pct == null ? 'var(--text3)' : pct >= 100 ? 'var(--green)' : pct >= 80 ? '#f59e0b' : 'var(--red)';
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`;
            return `
            <tr style="border-bottom:1px solid var(--border)">
              <td style="padding:10px 12px;font-weight:700;color:var(--text3)">${medal}</td>
              <td style="padding:10px 12px;font-weight:700;color:var(--text)">${r.nome}</td>
              <td style="padding:10px 12px;text-align:center;color:var(--text2)">${r.turno || '—'}</td>
              <td style="padding:10px 12px;text-align:center;font-weight:800;color:var(--accent);font-family:'Space Mono',monospace">${r.pedidos}</td>
              <td style="padding:10px 12px;text-align:center;color:var(--text2)">${(r.itens||0).toLocaleString('pt-BR')}</td>
              <td style="padding:10px 12px;text-align:center;color:var(--text2)">${r.tempo_medio_min ? `${Number(r.tempo_medio_min).toFixed(1)} min` : '—'}</td>
              <td style="padding:10px 12px;text-align:center;font-weight:700;color:${cor}">${pct != null ? `${pct}%` : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;

  } catch(e) {
    cards.innerHTML  = '';
    tabela.innerHTML = `<div style="color:var(--red);padding:20px">Erro ao carregar dados de performance.</div>`;
  }
}


/* ── Ocorrências ──────────────────────────────────────────────── */
async function carregarGestaoOcorrencias() {
  const ini   = document.getElementById('goc-ini')?.value;
  const fim   = document.getElementById('goc-fim')?.value;
  const lista = document.getElementById('goc-lista');
  if (!ini || !fim || !lista) return;

  lista.innerHTML = _gestaoLoading();

  try {
    const res = await fetch(`${API}/performance/ocorrencias?ini=${ini}&fim=${fim}`, { credentials:'include' });
    const dados = await res.json();

    if (!Array.isArray(dados) || !dados.length) {
      lista.innerHTML = _gestaoVazio('Nenhuma ocorrência no período.');
      return;
    }

    const tipoIcon = { atraso:'⏰', falta_item:'📦', qualidade:'⭐', outros:'📝' };
    const gravCor  = { alta:'var(--red)', media:'#f59e0b', baixa:'var(--green)' };

    lista.innerHTML = dados.map(o => `
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:10px;display:flex;gap:14px;align-items:flex-start">
        <div style="font-size:26px;flex-shrink:0">${tipoIcon[o.tipo] || '📝'}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
            <span style="font-weight:700;color:var(--text);font-size:14px">${o.colaborador_nome || '—'}</span>
            <span style="font-size:11px;font-weight:700;color:${gravCor[o.gravidade]||'var(--text3)'};background:${gravCor[o.gravidade]||'var(--text3)'}22;padding:2px 8px;border-radius:20px">${(o.gravidade||'—').toUpperCase()}</span>
            <span style="font-size:11px;color:var(--text3)">${o.data_ocorrencia ? new Date(o.data_ocorrencia).toLocaleDateString('pt-BR') : '—'}</span>
          </div>
          <div style="font-size:13px;color:var(--text2)">${o.descricao || ''}</div>
          ${o.registrado_por_nome ? `<div style="font-size:11px;color:var(--text3);margin-top:4px">Registrado por: ${o.registrado_por_nome}</div>` : ''}
        </div>
      </div>`).join('');

  } catch(e) {
    lista.innerHTML = `<div style="color:var(--red);padding:20px">Erro ao carregar ocorrências.</div>`;
  }
}


/* ── Absenteísmo ──────────────────────────────────────────────── */
async function carregarGestaoAbsenteismo() {
  const cards  = document.getElementById('gabs-cards');
  const tabela = document.getElementById('gabs-tabela');
  if (!cards || !tabela) return;

  cards.innerHTML  = _gestaoLoading();
  tabela.innerHTML = '';

  try {
    // Usa apenas /reports/team — retorna tudo incluindo `id` por funcionário
    const res = await fetch(`${API}/gestao/absenteismo/team`, { credentials:'include' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.erro || `HTTP ${res.status}`);
    }
    const team = await res.json();

    // Campos corretos da API: total_employees, total_faltas, total_atestados, team_absenteeism_rate
    const totalFunc     = team.total_employees ?? (team.employees || []).length;
    const totalFaltas   = team.total_faltas    ?? 0;
    const totalAtestados = team.total_atestados ?? 0;
    const taxaEquipe    = parseFloat(team.team_absenteeism_rate) || 0;

    cards.innerHTML = [
      { icon:'👥', label:'Funcionários',  val: totalFunc },
      { icon:'❌', label:'Total Faltas',  val: totalFaltas },
      { icon:'🏥', label:'Atestados',     val: totalAtestados },
      { icon:'📉', label:'Taxa da Equipe', val: `${taxaEquipe.toFixed(1)}%` },
    ].map(c => `
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:16px">
        <div style="font-size:22px;margin-bottom:6px">${c.icon}</div>
        <div style="font-size:11px;color:var(--text3);font-weight:700;letter-spacing:.5px;margin-bottom:4px">${c.label.toUpperCase()}</div>
        <div style="font-size:22px;font-weight:800;color:var(--text);font-family:'Space Mono',monospace">${c.val}</div>
      </div>`).join('');

    // employees: [{ id, name, sector, faltas_count, atestados_count, absenteeism_rate, ... }]
    const rows = [...(team.employees || [])].sort(
      (a, b) => (parseFloat(b.absenteeism_rate) || 0) - (parseFloat(a.absenteeism_rate) || 0)
    );

    if (!rows.length) {
      tabela.innerHTML = _gestaoVazio('Nenhum dado de absenteísmo disponível. Importe os PDFs no sistema de absenteísmo.');
      return;
    }

    tabela.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--surface2)">
            <th style="padding:10px 12px;text-align:left;color:var(--text3);font-size:11px;font-weight:700;border-bottom:1px solid var(--border)">#</th>
            <th style="padding:10px 12px;text-align:left;color:var(--text3);font-size:11px;font-weight:700;border-bottom:1px solid var(--border)">FUNCIONÁRIO</th>
            <th style="padding:10px 12px;text-align:left;color:var(--text3);font-size:11px;font-weight:700;border-bottom:1px solid var(--border)">SETOR</th>
            <th style="padding:10px 12px;text-align:center;color:var(--text3);font-size:11px;font-weight:700;border-bottom:1px solid var(--border)">FALTAS</th>
            <th style="padding:10px 12px;text-align:center;color:var(--text3);font-size:11px;font-weight:700;border-bottom:1px solid var(--border)">ATESTADOS</th>
            <th style="padding:10px 12px;text-align:center;color:var(--text3);font-size:11px;font-weight:700;border-bottom:1px solid var(--border)">ATRASO</th>
            <th style="padding:10px 12px;text-align:center;color:var(--text3);font-size:11px;font-weight:700;border-bottom:1px solid var(--border)">ABSENTEÍSMO</th>
            <th style="padding:10px 12px;text-align:center;color:var(--text3);font-size:11px;font-weight:700;border-bottom:1px solid var(--border)">DETALHE</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, i) => {
            const taxa = parseFloat(r.absenteeism_rate) || 0;
            const cor  = taxa >= 10 ? 'var(--red)' : taxa >= 5 ? '#f59e0b' : 'var(--green)';
            const nome = r.name || '—';
            return `
            <tr style="border-bottom:1px solid var(--border)">
              <td style="padding:10px 12px;font-weight:700;color:var(--text3)">${i+1}</td>
              <td style="padding:10px 12px;font-weight:700;color:var(--text)">${nome}</td>
              <td style="padding:10px 12px;color:var(--text2);font-size:12px">${r.sector || '—'}</td>
              <td style="padding:10px 12px;text-align:center;color:var(--text2)">${r.faltas_count ?? '—'}</td>
              <td style="padding:10px 12px;text-align:center;color:var(--text2)">${r.atestados_count ?? '—'}</td>
              <td style="padding:10px 12px;text-align:center;color:var(--text2);font-size:12px">${r.total_atraso_formatted || '—'}</td>
              <td style="padding:10px 12px;text-align:center;font-weight:800;color:${cor};font-family:'Space Mono',monospace">${taxa.toFixed(1)}%</td>
              <td style="padding:10px 12px;text-align:center">
                <button onclick="verDetalheAbsenteismo(${r.id}, '${nome.replace(/'/g,"\\'")}', this)"
                  style="padding:4px 12px;background:transparent;border:1.5px solid var(--border);border-radius:8px;font-size:12px;cursor:pointer;color:var(--text2)">
                  Ver
                </button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;

  } catch(e) {
    cards.innerHTML  = '';
    tabela.innerHTML = `<div style="color:var(--red);padding:20px">Erro ao carregar absenteísmo: ${e.message}</div>`;
  }
}


async function verDetalheAbsenteismo(id, nome, btn) {
  const detalhe = document.getElementById('gabs-detalhe');
  if (!detalhe) return;
  if (btn) { btn.textContent = '...'; btn.disabled = true; }

  try {
    const res  = await fetch(`${API}/gestao/absenteismo/funcionario/${id}`, { credentials:'include' });
    if (!res.ok) throw new Error('Erro ao carregar');
    const data = await res.json();
    // API retorna: daily_records: [{date, day_of_week, status, falta, atestado, ferias, entry_time, exit_time, atraso_minutes}]
    const registros = (data.daily_records || []).filter(r => r.falta || r.atestado || r.ferias || r.atraso_minutes > 0);

    detalhe.innerHTML = `
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="font-weight:800;color:var(--text);font-size:14px">📅 ${nome}</div>
          <button onclick="document.getElementById('gabs-detalhe').innerHTML=''"
            style="background:transparent;border:none;font-size:18px;cursor:pointer;color:var(--text3)">✕</button>
        </div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px;font-size:12px">
          <span>Faltas: <b style="color:var(--red)">${data.faltas_count ?? 0}</b></span>
          <span>Atestados: <b style="color:#f59e0b">${data.atestados_count ?? 0}</b></span>
          <span>Atraso: <b>${data.total_atraso_formatted || '—'}</b></span>
          <span>Absenteísmo: <b>${parseFloat(data.absenteeism_rate||0).toFixed(1)}%</b></span>
          <span style="color:var(--text3)">${data.period_start || ''} → ${data.period_end || ''}</span>
        </div>
        ${!registros.length ? '<div style="color:var(--text3);padding:10px">Nenhuma ocorrência encontrada no período.</div>' : `
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="background:var(--surface)">
                <th style="padding:8px 10px;text-align:left;color:var(--text3);border-bottom:1px solid var(--border)">DATA</th>
                <th style="padding:8px 10px;text-align:left;color:var(--text3);border-bottom:1px solid var(--border)">DIA</th>
                <th style="padding:8px 10px;text-align:center;color:var(--text3);border-bottom:1px solid var(--border)">OCORRÊNCIA</th>
                <th style="padding:8px 10px;text-align:center;color:var(--text3);border-bottom:1px solid var(--border)">ATRASO</th>
              </tr>
            </thead>
            <tbody>
              ${registros.map(r => {
                const ocorrencia = r.falta ? '❌ Falta' : r.atestado ? '🏥 Atestado' : r.ferias ? '🌴 Férias' : '⏰ Atraso';
                const cor = r.falta ? 'var(--red)' : r.atestado ? '#f59e0b' : r.ferias ? '#3b82f6' : '#8b5cf6';
                const dt  = r.date ? new Date(r.date + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
                return `
                <tr style="border-bottom:1px solid var(--border)">
                  <td style="padding:8px 10px;color:var(--text)">${dt}</td>
                  <td style="padding:8px 10px;color:var(--text2)">${r.day_of_week || '—'}</td>
                  <td style="padding:8px 10px;text-align:center;font-weight:700;color:${cor}">${ocorrencia}</td>
                  <td style="padding:8px 10px;text-align:center;color:var(--text2)">${r.atraso_minutes ? `${r.atraso_minutes} min` : '—'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`}
      </div>`;

  } catch(e) {
    detalhe.innerHTML = `<div style="color:var(--red);padding:10px">Erro ao carregar detalhe.</div>`;
  } finally {
    if (btn) { btn.textContent = 'Ver'; btn.disabled = false; }
  }
}


/* ── Helpers ──────────────────────────────────────────────────── */
function _gestaoLoading() {
  return `<div style="color:var(--text3);padding:20px;text-align:center;font-size:13px">Carregando...</div>`;
}
function _gestaoVazio(msg) {
  return `<div style="color:var(--text3);padding:40px;text-align:center;font-size:13px">${msg}</div>`;
}
