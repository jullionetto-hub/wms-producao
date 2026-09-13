'use strict';

/* ══════════════════════════════════════════
   GESTÃO — Absenteísmo
══════════════════════════════════════════ */

/* ── Absenteísmo nativo: upload de PDF → atraso por marcação (entrada / almoço / pausa) ──
   Cada PDF (uma empresa) vira um upload_id separado no backend, mas a tela sempre mostra
   o resultado GERAL (todo mundo que já tem dado salvo, não só o que foi importado nesta
   sessão) — é o que faz a informação persistir ao navegar/recarregar a página. */
let _absnTolerancia = 0;

async function _absnUploadUmPdf(file) {
  const buf = await file.arrayBuffer();
  const res = await fetch(`${API}/absenteismo/upload?nome=${encodeURIComponent(file.name)}`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/pdf' },
    body: buf,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.erro || 'falha ao importar');
  return data;
}

// Mês de referência ativo (o que pré-preenche o prompt de "Enviar p/
// Matriz") e a lista de TODOS os meses distintos já importados, cada um com
// seu período (min/max entre os uploads daquele mês) — um botão por mês,
// lado a lado, clicável pra filtrar o resultado só daquele período.
let _absnMesAtivo = null;
let _absnMesesInfo = [];

async function absnEnviarPdfs(fileList) {
  const arquivos = Array.from(fileList || []);
  if (!arquivos.length) return;
  const statusEl = document.getElementById('absn-status');
  let okCount = 0, totalColaboradores = 0, periodoInicio = null, periodoFim = null;
  const erros = [];
  for (let i = 0; i < arquivos.length; i++) {
    const arq = arquivos[i];
    statusEl.textContent = arquivos.length > 1
      ? `Enviando ${i+1} de ${arquivos.length}: ${arq.name}...`
      : 'Enviando e lendo o PDF...';
    statusEl.style.color = 'var(--text3)';
    try {
      const data = await _absnUploadUmPdf(arq);
      okCount++;
      totalColaboradores += data.total_colaboradores;
      if (!periodoInicio || data.periodo_inicio < periodoInicio) periodoInicio = data.periodo_inicio;
      if (!periodoFim || data.periodo_fim > periodoFim) periodoFim = data.periodo_fim;
    } catch (e) {
      erros.push(`${arq.name}: ${e.message}`);
    }
  }
  if (!okCount) {
    statusEl.textContent = 'Erro: nenhum PDF foi importado. ' + erros.join(' | ');
    statusEl.style.color = 'var(--red)';
    return;
  }
  statusEl.textContent = `Importado! ${okCount}/${arquivos.length} arquivo(s), ${totalColaboradores} colaborador(es), período ${fmtData(periodoInicio)} a ${fmtData(periodoFim)}.`
    + (erros.length ? ` Falhas: ${erros.join(' | ')}` : '');
  statusEl.style.color = erros.length ? 'var(--amber)' : 'var(--green)';
  await _absnCarregarMesesAtivos();
  await absnCarregarResultado();
}

// Busca TODOS os uploads salvos (não só os do lote que acabou de subir) e
// agrupa por mês de referência, guardando o período (min ini / max fim)
// de cada um — cobre o caso de subir PDFs de meses diferentes juntos, ou
// já ter meses antigos salvos de sessões passadas.
async function _absnCarregarMesesAtivos() {
  try {
    const res = await fetch(`${API}/absenteismo/uploads`, { credentials:'include' });
    const uploads = await res.json();
    const porMes = {};
    (uploads || []).forEach(u => {
      if (!u.mes_referencia) return;
      const atual = porMes[u.mes_referencia] || { mes: u.mes_referencia, ini: u.periodo_inicio, fim: u.periodo_fim };
      if (u.periodo_inicio < atual.ini) atual.ini = u.periodo_inicio;
      if (u.periodo_fim > atual.fim) atual.fim = u.periodo_fim;
      porMes[u.mes_referencia] = atual;
    });
    _absnMesesInfo = Object.values(porMes).sort((a, b) => b.fim.localeCompare(a.fim));
    if (!_absnMesAtivo && _absnMesesInfo[0]) _absnMesAtivo = _absnMesesInfo[0].mes;
    _absnRenderBadgesMes();
  } catch (e) { /* silencioso — não é crítico */ }
}

function _absnRenderBadgesMes() {
  const cont = document.getElementById('absn-meses-ativos');
  if (!cont) return;
  cont.innerHTML = _absnMesesInfo.map(m => {
    const ativo = _absnDataIni === m.ini && _absnDataFim === m.fim;
    return `<button onclick="absnFiltrarMes('${m.mes}','${m.ini}','${m.fim}')" title="${fmtData(m.ini)} a ${fmtData(m.fim)}" style="padding:6px 14px;background:${ativo?'var(--green)':'var(--accent)'};color:#fff;border:none;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer">📅 ${m.mes}</button>`;
  }).join('');
}

// Clicar num mês filtra o resultado só pro período daquele mês (reaproveita
// o filtro de PERÍODO) e marca ele como o mês ativo pro "Enviar p/ Matriz".
function absnFiltrarMes(mes, ini, fim) {
  _absnMesAtivo = mes;
  _absnDataIni = ini;
  _absnDataFim = fim;
  const iniEl = document.getElementById('absn-data-ini'); if (iniEl) iniEl.value = ini;
  const fimEl = document.getElementById('absn-data-fim'); if (fimEl) fimEl.value = fim;
  _absnRenderBadgesMes();
  absnCarregarResultado();
}

async function absnDebugPdf(file) {
  if (!file) return;
  const out = document.getElementById('absn-debug-out');
  out.style.display = 'block';
  out.value = 'Lendo...';
  try {
    const buf = await file.arrayBuffer();
    const res = await fetch(`${API}/absenteismo/debug?nome=${encodeURIComponent(file.name)}`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/pdf' },
      body: buf,
    });
    const data = await res.json();
    out.value = JSON.stringify(data, null, 2);
    out.select();
  } catch(e) { out.value = 'Erro: ' + e.message; }
}

function absnSetTolerancia(min) {
  _absnTolerancia = min;
  [0,5,10,15,30].forEach(m => {
    const btn = document.getElementById(`absn-tol-${m}`);
    if (btn) { btn.style.background = m===min ? 'var(--accent)' : 'var(--surface)'; btn.style.color = m===min ? '#fff' : 'var(--text2)'; }
  });
  absnCarregarResultado();
}

// abs = valor absoluto (total de atrasos, sempre >=0); comSinal = mostra +/-
// (banco de horas, pode ser negativo).
function _absnFmtMin(min, comSinal) {
  if (min == null) return '—';
  const sinal = comSinal ? (min > 0 ? '+' : (min < 0 ? '-' : '')) : '';
  const valorAbs = Math.abs(min);
  if (valorAbs < 60) return `${sinal}${valorAbs}min`;
  return `${sinal}${Math.floor(valorAbs / 60)}:${String(valorAbs % 60).padStart(2, '0')}`;
}

async function absnApagarTudo() {
  if (!confirm('ATENÇÃO: Isso vai apagar TODOS os colaboradores, dias importados e uploads do Absenteísmo (a seção nova, "Atraso por Marcação").\n\nDeseja continuar?')) return;
  if (!confirm('Confirmar? Esta ação não pode ser desfeita — os PDFs precisam ser reimportados do zero depois.')) return;
  try {
    const res = await fetch(`${API}/absenteismo/dados`, { method:'DELETE', credentials:'include' });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) { toast(data.erro || 'Erro ao apagar dados', 'erro'); return; }
    toast('Todos os dados do absenteísmo foram apagados!', 'sucesso');
    const statusEl = document.getElementById('absn-status');
    if (statusEl) { statusEl.textContent = ''; }
    await absnCarregarResultado();
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
}

async function absnEnviarMatriz(colaboradorId, nome) {
  const mes = prompt(`Mês de referência na Matriz de Responsabilidades (ex: Agosto/2026)\nColaborador: ${nome}`, _absnMesAtivo || '');
  if (!mes) return;
  try {
    const res = await fetch(`${API}/absenteismo/colaboradores/${colaboradorId}/enviar-matriz`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mes }),
    });
    const data = await res.json();
    if (!res.ok) { toast(data.erro || 'Erro ao enviar pra Matriz', 'erro'); return; }
    toast(`Enviado pra Matriz — absenteísmo: ${data.status}`, 'sucesso');
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
}

// Turno do colaborador a partir do texto livre de horario do PDF — mesmo
// casamento por substring usado no backend (lib/absenteismo.js turnoOficial).
let _absnTurnoFiltro = null; // null = todos
function _absnTurnoDe(horarioTexto) {
  const t = (horarioTexto || '').toLowerCase();
  if (t.includes('madrugada')) return 'Madrugada';
  if (t.includes('tarde')) return 'Tarde';
  if (t.includes('manh')) return 'Manhã';
  return 'Outro';
}

function _absnLinhasFiltradas() {
  const resultado = window._absnResultadoCache || [];
  const filtradas = _absnTurnoFiltro
    ? resultado.filter(r => _absnTurnoDe(r.colaborador.horario) === _absnTurnoFiltro)
    : resultado;
  return [...filtradas].sort((a,b) =>
    (b.entradas_atrasadas+b.almocos_atrasados+b.pausas_atrasadas) - (a.entradas_atrasadas+a.almocos_atrasados+a.pausas_atrasadas));
}

function absnSetTurnoFiltro(turno) {
  _absnTurnoFiltro = turno;
  ['Manhã','Tarde','Madrugada',''].forEach(t => {
    const btn = document.getElementById(`absn-turno-${t||'todos'}`);
    if (!btn) return;
    const ativo = (t||null) === _absnTurnoFiltro;
    btn.style.background = ativo ? 'var(--accent)' : 'var(--surface)';
    btn.style.color = ativo ? '#fff' : 'var(--text2)';
  });
  _absnRenderTabela();
}

// Período customizado (ex: "de julho a setembro") pra somar atrasos/faltas/
// atestados/declarações de horas num recorte de dias — o banco de horas
// continua vindo do Saldo Final mais recente (não é filtrado por período,
// já que é um saldo acumulado, não algo pra somar por dia).
let _absnDataIni = null, _absnDataFim = null;

function absnAplicarPeriodo() {
  _absnDataIni = document.getElementById('absn-data-ini')?.value || null;
  _absnDataFim = document.getElementById('absn-data-fim')?.value || null;
  absnCarregarResultado();
}
function absnLimparPeriodo() {
  _absnDataIni = null; _absnDataFim = null;
  const ini = document.getElementById('absn-data-ini'); if (ini) ini.value = '';
  const fim = document.getElementById('absn-data-fim'); if (fim) fim.value = '';
  absnCarregarResultado();
}

async function absnCarregarResultado() {
  const cont = document.getElementById('absn-resultado');
  if (!cont) return;
  cont.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:10px">Carregando...</div>';
  // Se ainda não carregou os meses nesta sessão (ex: acabou de abrir a
  // página, sem ter subido PDF ainda), busca os já salvos.
  if (!_absnMesesInfo.length) _absnCarregarMesesAtivos();
  else _absnRenderBadgesMes();
  const labelEl = document.getElementById('absn-periodo-label');
  if (labelEl) labelEl.textContent = (_absnDataIni || _absnDataFim)
    ? `Mostrando ${fmtData(_absnDataIni)||'início'} a ${fmtData(_absnDataFim)||'hoje'}` : '';
  try {
    const qs = new URLSearchParams({ tolerancia: _absnTolerancia });
    if (_absnDataIni) qs.set('data_ini', _absnDataIni);
    if (_absnDataFim) qs.set('data_fim', _absnDataFim);
    const res = await fetch(`${API}/absenteismo/resultado?${qs}`, { credentials:'include' });
    const data = await res.json();
    if (!res.ok) { cont.innerHTML = `<div style="color:var(--red);font-size:12px">${data.erro||'erro'}</div>`; return; }
    const resultado = data.resultado || [];
    const tolEl = document.getElementById('absn-tolerancia');
    if (tolEl) tolEl.style.display = resultado.length ? 'flex' : 'none';
    window._absnResultadoCache = resultado;
    _absnRenderTabela();
  } catch(e) { cont.innerHTML = `<div style="color:var(--red);font-size:12px">Erro: ${e.message}</div>`; }
}

function _absnRenderTabela() {
  const cont = document.getElementById('absn-resultado');
  if (!cont) return;
  const linhas = _absnLinhasFiltradas();
  const turnos = ['Manhã','Tarde','Madrugada'];
  cont.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
        <button id="absn-turno-todos" onclick="absnSetTurnoFiltro(null)" style="padding:5px 12px;border-radius:20px;border:1.5px solid var(--border);background:${!_absnTurnoFiltro?'var(--accent)':'var(--surface)'};color:${!_absnTurnoFiltro?'#fff':'var(--text2)'};font-size:11px;font-weight:700;cursor:pointer">Todos</button>
        ${turnos.map(t => `<button id="absn-turno-${t}" onclick="absnSetTurnoFiltro('${t}')" style="padding:5px 12px;border-radius:20px;border:1.5px solid var(--border);background:${_absnTurnoFiltro===t?'var(--accent)':'var(--surface)'};color:${_absnTurnoFiltro===t?'#fff':'var(--text2)'};font-size:11px;font-weight:700;cursor:pointer">${t}</button>`).join('')}
        <button onclick="absnGerarPDF()" style="margin-left:auto;padding:5px 12px;background:var(--surface2);border:1px solid var(--border);color:var(--text2);border-radius:8px;font-size:11px;font-weight:700;cursor:pointer">🖨️ Gerar PDF / Imprimir</button>
      </div>
      <div style="overflow-x:auto;background:var(--surface);border:1px solid var(--border);border-radius:10px">
        <table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <thead><tr style="background:var(--surface2)">
            <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">COLABORADOR</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">SETOR</th>
            <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3)">ENTRADAS ATRASADAS</th>
            <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3)">ALMOÇO ATRASADO</th>
            <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3)">PAUSA ATRASADA</th>
            <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3)">TOTAL ATRASOS</th>
            <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3)">BANCO DE HORAS</th>
            <th style="padding:8px 12px"></th>
          </tr></thead>
          <tbody>${linhas.map(r => `
            <tr style="border-top:1px solid var(--border)">
              <td style="padding:8px 12px;font-weight:700;color:var(--text)">${pfEsc(r.colaborador.nome)}</td>
              <td style="padding:8px 12px;color:var(--text3)">${pfEsc(r.colaborador.setor||'—')}</td>
              <td style="padding:8px 12px;text-align:center;font-weight:800;color:${r.entradas_atrasadas?'var(--red)':'var(--text3)'}">${r.entradas_atrasadas}</td>
              <td style="padding:8px 12px;text-align:center;font-weight:800;color:${r.almocos_atrasados?'var(--red)':'var(--text3)'}">${r.almocos_atrasados}</td>
              <td style="padding:8px 12px;text-align:center;font-weight:800;color:${r.pausas_atrasadas?'var(--red)':'var(--text3)'}">${r.pausas_atrasadas}</td>
              <td style="padding:8px 12px;text-align:center;font-weight:800;color:${r.total_atraso_min?'var(--red)':'var(--text3)'}">${_absnFmtMin(r.total_atraso_min,false)}</td>
              <td style="padding:8px 12px;text-align:center;font-weight:800;color:${r.banco_horas_min>0?'var(--green)':(r.banco_horas_min<0?'var(--red)':'var(--text3)')}">${_absnFmtMin(r.banco_horas_min,true)}</td>
              <td style="padding:8px 12px;text-align:right;white-space:nowrap">
                <button class="btn btn-outline btn-sm" onclick="absnAbrirDetalhe(${r.colaborador.id})">Ver dias</button>
                <button class="btn btn-outline btn-sm" onclick="absnEnviarMatriz(${r.colaborador.id},'${pfEsc(r.colaborador.nome).replace(/'/g,"\\'")}')">Enviar p/ Matriz</button>
              </td>
            </tr>`).join('') || `<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:20px">Nenhum colaborador</td></tr>`}
          </tbody>
        </table>
      </div>
      <div id="absn-detalhe" style="margin-top:12px"></div>`;
}

// Abre uma janela com a tabela atualmente filtrada (respeitando o filtro de
// turno ativo) já pronta pra imprimir/salvar como PDF — mesmo padrão do
// "Imprimir/PDF" já usado no relatório antigo de absenteísmo.
function absnGerarPDF() {
  const linhas = _absnLinhasFiltradas();
  const turnoLabel = _absnTurnoFiltro ? ` — ${_absnTurnoFiltro}` : '';
  const linhasHtml = linhas.map(r => `
    <tr>
      <td>${pfEsc(r.colaborador.nome)}</td>
      <td>${pfEsc(r.colaborador.setor||'—')}</td>
      <td style="text-align:center">${r.entradas_atrasadas}</td>
      <td style="text-align:center">${r.almocos_atrasados}</td>
      <td style="text-align:center">${r.pausas_atrasadas}</td>
      <td style="text-align:center">${_absnFmtMin(r.total_atraso_min,false)}</td>
      <td style="text-align:center">${_absnFmtMin(r.banco_horas_min,true)}</td>
      <td style="text-align:center">${r.ausencias_justificadas}</td>
      <td style="text-align:center">${r.faltas_injustificadas}</td>
      <td style="text-align:center">${r.declaracoes_horas}</td>
    </tr>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Absenteísmo${turnoLabel}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;padding:24px}
  h1{font-size:18px;margin:0 0 4px}
  .sub{font-size:12px;color:#64748b;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}
  th{background:#f1f5f9}
  .btn{margin-bottom:16px;padding:8px 16px;background:#0F172A;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer}
  @media print{.btn{display:none}}
</style></head><body>
  <button class="btn" onclick="window.print()">Imprimir / Salvar PDF</button>
  <h1>Absenteísmo — Atraso por Marcação${turnoLabel}</h1>
  <div class="sub">${(_absnDataIni || _absnDataFim)
      ? `Período: <b>${fmtData(_absnDataIni)||'início'} a ${fmtData(_absnDataFim)||'hoje'}</b> · `
      : (_absnMesAtivo ? `Mês de referência: <b>${_absnMesAtivo}</b> · ` : '')
    }Gerado em ${new Date().toLocaleString('pt-BR')}${_absnTolerancia?` · Tolerância de entrada: ${_absnTolerancia}min`:''}</div>
  <table>
    <thead><tr>
      <th>Colaborador</th><th>Setor</th>
      <th style="text-align:center">Entradas Atrasadas</th>
      <th style="text-align:center">Almoço Atrasado</th>
      <th style="text-align:center">Pausa Atrasada</th>
      <th style="text-align:center">Total Atrasos</th>
      <th style="text-align:center">Banco de Horas</th>
      <th style="text-align:center">Atestados</th>
      <th style="text-align:center">Faltas</th>
      <th style="text-align:center">Declaração de Horas</th>
    </tr></thead>
    <tbody>${linhasHtml || '<tr><td colspan="10" style="text-align:center">Nenhum colaborador</td></tr>'}</tbody>
  </table>
</body></html>`;
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

function absnAbrirDetalhe(colaboradorId) {
  const r = (window._absnResultadoCache||[]).find(x => x.colaborador.id === colaboradorId);
  const cont = document.getElementById('absn-detalhe');
  if (!r || !cont) return;
  const fmtDev = min => {
    if (min == null) return '—';
    const sinal = min > 0 ? '+' : (min < 0 ? '-' : '');
    const abs = Math.abs(min);
    if (abs < 60) return `${sinal}${abs}min`;
    const h = Math.floor(abs / 60), m = abs % 60;
    return `${sinal}${h}:${String(m).padStart(2,'0')}`;
  };
  // Tolerância só vale pra entrada — almoço/pausa não têm tolerância.
  const corDev = (min, comTolerancia) => min == null ? 'var(--text3)' : (min > (comTolerancia ? _absnTolerancia : 0) ? 'var(--red)' : 'var(--green)');
  cont.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px">
      <div style="font-weight:800;font-size:13px;margin-bottom:10px">${pfEsc(r.colaborador.nome)} — dia a dia</div>
      <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:var(--surface2)">
          <th style="padding:6px 10px;text-align:left;font-size:10px;color:var(--text3)">DATA</th>
          <th style="padding:6px 10px;text-align:left;font-size:10px;color:var(--text3)">STATUS</th>
          <th style="padding:6px 10px;text-align:center;font-size:10px;color:var(--text3)">ENTRADA</th>
          <th style="padding:6px 10px;text-align:center;font-size:10px;color:var(--text3)">VOLTA ALMOÇO</th>
          <th style="padding:6px 10px;text-align:center;font-size:10px;color:var(--text3)">VOLTA PAUSA</th>
        </tr></thead>
        <tbody>${r.dias.map(d => `
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:6px 10px;font-weight:600">${fmtData(d.data)} <span style="color:var(--text3);font-weight:400">${pfEsc(d.dia_semana||'')}</span></td>
            <td style="padding:6px 10px;color:var(--text3)">${pfEsc(d.status||'—')}</td>
            <td style="padding:6px 10px;text-align:center">${d.entrada_hora?`${d.entrada_hora} <span style="color:${corDev(d.entrada_atraso_min,true)}">(${fmtDev(d.entrada_atraso_min)})</span>`:'—'}</td>
            <td style="padding:6px 10px;text-align:center">${d.almoco_retorno_hora?`${d.almoco_retorno_hora} <span style="color:${corDev(d.almoco_atraso_min,false)}">(${fmtDev(d.almoco_atraso_min)})</span>`:'—'}</td>
            <td style="padding:6px 10px;text-align:center">${d.pausa_retorno_hora?`${d.pausa_retorno_hora} <span style="color:${corDev(d.pausa_atraso_min,false)}">(${fmtDev(d.pausa_atraso_min)})</span>`:'—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      </div>
    </div>`;
}

function renderizarPagGestao() {
  const root = document.getElementById('pag-gestao');
  if (!root) return;
  root.innerHTML = `
<div style="display:flex;flex-direction:column;height:100%;min-height:0;overflow-y:auto">

  <!-- ── Header ── -->
  <div style="padding:16px 24px 12px;border-bottom:1px solid var(--border);flex-shrink:0">
    <div style="font-family:'Space Mono',monospace;font-size:17px;font-weight:800;color:var(--text)">Absenteísmo</div>
  </div>

  <!-- ── Absenteísmo — atraso por marcação (espelho de ponto) ── -->
  <div style="background:var(--surface2);padding:16px 24px;flex-shrink:0">
    <div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:1px;margin-bottom:10px">ATRASO POR MARCAÇÃO — ESPELHO DE PONTO</div>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <button onclick="document.getElementById('absn-file-input').click()" style="padding:8px 16px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">📄 Enviar PDF(s) do espelho de ponto</button>
      <input type="file" id="absn-file-input" accept=".pdf" multiple style="display:none" onchange="absnEnviarPdfs(this.files)">
      <button onclick="document.getElementById('absn-debug-input').click()" style="padding:8px 16px;background:var(--surface);border:1.5px solid var(--border);color:var(--text2);border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">🔍 Diagnóstico (temporário)</button>
      <input type="file" id="absn-debug-input" accept=".pdf" style="display:none" onchange="absnDebugPdf(this.files[0])">
      <button onclick="absnApagarTudo()" style="padding:8px 16px;background:transparent;border:1.5px solid var(--red);color:var(--red);border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">🗑️ Apagar todos os dados</button>
      <div id="absn-status" style="font-size:12px;color:var(--text3)"></div>
    </div>
    <div id="absn-meses-ativos" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"></div>
    <textarea id="absn-debug-out" readonly style="display:none;width:100%;min-height:300px;margin-top:10px;padding:10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:monospace;font-size:11px;white-space:pre;overflow:auto"></textarea>
    <div id="absn-tolerancia" style="display:none;align-items:center;gap:8px;margin-top:10px;font-size:11.5px">
      <span style="color:var(--text3);font-weight:700">TOLERÂNCIA:</span>
      ${[0,5,10,15,30].map(m => `<button onclick="absnSetTolerancia(${m})" id="absn-tol-${m}" style="padding:5px 10px;border-radius:20px;border:1.5px solid var(--border);background:${m===0?'var(--accent)':'var(--surface)'};color:${m===0?'#fff':'var(--text2)'};font-size:11px;font-weight:700;cursor:pointer">${m} min</button>`).join('')}
    </div>
    <div id="absn-periodo" style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:11.5px;flex-wrap:wrap">
      <span style="color:var(--text3);font-weight:700">PERÍODO:</span>
      <input type="date" id="absn-data-ini" style="padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:11px">
      <span style="color:var(--text3)">até</span>
      <input type="date" id="absn-data-fim" style="padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:11px">
      <button onclick="absnAplicarPeriodo()" style="padding:5px 12px;background:var(--accent);color:#fff;border:none;border-radius:20px;font-size:11px;font-weight:700;cursor:pointer">Aplicar</button>
      <button onclick="absnLimparPeriodo()" style="padding:5px 12px;background:var(--surface);border:1.5px solid var(--border);color:var(--text2);border-radius:20px;font-size:11px;font-weight:700;cursor:pointer">Ver tudo</button>
      <span id="absn-periodo-label" style="color:var(--text3)"></span>
    </div>
    <div id="absn-resultado" style="margin-top:14px"></div>
  </div>
</div>`;
  absnCarregarResultado();
}

/* ── Helpers ── */
function _gestaoLoading() {
  return `<div style="color:var(--text3);padding:20px;text-align:center;font-size:13px">Carregando...</div>`;
}
function _gestaoVazio(msg) {
  return `<div style="color:var(--text3);padding:40px;text-align:center;font-size:13px">${msg}</div>`;
}
