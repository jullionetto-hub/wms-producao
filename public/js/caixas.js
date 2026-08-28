/* ══════════════════════════════════════════
   CAIXAS — checklist das estações de trabalho
══════════════════════════════════════════ */

let _caixaAtual = null;

async function carregarCaixas() {
  const grid = document.getElementById('caixas-grid');
  if (!grid) return;
  grid.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:12px">Carregando...</div>';
  try {
    const res = await fetch(`${API}/caixas/checklist`, { credentials:'include' });
    const caixas = await res.json();
    grid.innerHTML = caixas.map(c => {
      const cor = c.ok === null ? 'var(--text3)' : c.ok ? 'var(--green)' : 'var(--red)';
      const label = c.ok === null ? 'Nunca conferida' : c.ok ? 'OK' : 'Atenção';
      const quando = c.ultima ? `${fmtData(c.ultima.data)} ${(c.ultima.hora||'').slice(0,5)}`.trim() : '';
      const quem = c.ultima?.usuario_nome || '';
      return `
        <div class="card" style="margin-bottom:0;cursor:pointer;border-top:3px solid ${cor}" onclick="abrirModalCaixa(${c.numero})">
          <div style="font-weight:800;font-size:15px;color:var(--text)">Caixa ${String(c.numero).padStart(2,'0')}</div>
          <div style="font-size:12px;font-weight:700;color:${cor};margin:6px 0 4px">${label}</div>
          <div style="font-size:10px;color:var(--text3)">${quando ? `${quando}${quem?` · ${pfEsc(quem)}`:''}` : 'Sem registro'}</div>
        </div>`;
    }).join('');
  } catch(e) { grid.innerHTML = '<div style="color:var(--red);font-size:12px;padding:12px">Erro ao carregar caixas.</div>'; }
}

async function abrirModalCaixa(numero) {
  _caixaAtual = numero;
  document.getElementById('mcc-titulo').textContent = `Caixa ${String(numero).padStart(2,'0')}`;
  document.getElementById('mcc-operador').value = '';
  document.getElementById('mcc-turno').value = '';
  document.getElementById('mcc-organizada').checked = true;
  document.getElementById('mcc-limpa').checked = true;
  document.getElementById('mcc-produtos').checked = false;
  document.getElementById('mcc-objetos').checked = false;
  document.getElementById('mcc-obs').value = '';
  const hist = document.getElementById('mcc-historico');
  hist.innerHTML = '<div style="font-size:11px;color:var(--text3)">Carregando histórico...</div>';
  document.getElementById('modal-caixa-checklist').style.display = 'flex';

  try {
    const res = await fetch(`${API}/caixas/${numero}/historico`, { credentials:'include' });
    const lista = await res.json();
    if (!lista.length) { hist.innerHTML = ''; return; }
    hist.innerHTML = `
      <div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:6px;letter-spacing:.2px">CONFERÊNCIAS ANTERIORES</div>
      <div style="max-height:150px;overflow-y:auto;display:flex;flex-direction:column;gap:6px">
        ${lista.map(h => {
          const ok = h.organizada && h.limpa && !h.produtos_espalhados && !h.objetos_indevidos;
          const cor = ok ? 'var(--green)' : 'var(--red)';
          return `<div style="background:var(--surface2);border-radius:8px;padding:7px 10px;font-size:11px">
            <div style="display:flex;justify-content:space-between;color:var(--text2)">
              <span>${fmtData(h.data)} ${(h.hora||'').slice(0,5)} — ${pfEsc(h.usuario_nome||'—')}</span>
              <span style="color:${cor};font-weight:700">${ok?'OK':'Atenção'}</span>
            </div>
            ${h.observacoes ? `<div style="color:var(--text3);margin-top:3px">${pfEsc(h.observacoes)}</div>` : ''}
          </div>`;
        }).join('')}
      </div>`;
  } catch(e) { hist.innerHTML = ''; }
}

function fecharModalCaixa() {
  document.getElementById('modal-caixa-checklist').style.display = 'none';
  _caixaAtual = null;
}

async function salvarChecklistCaixa() {
  if (!_caixaAtual) return;
  const operador = document.getElementById('mcc-operador').value.trim();
  const turno = document.getElementById('mcc-turno').value;
  if (!operador) { toast('Informe quem estava operando a caixa.','aviso'); return; }
  if (!turno) { toast('Selecione o turno.','aviso'); return; }
  const body = {
    operador_nome: operador,
    turno,
    organizada: document.getElementById('mcc-organizada').checked,
    limpa: document.getElementById('mcc-limpa').checked,
    produtos_espalhados: document.getElementById('mcc-produtos').checked,
    objetos_indevidos: document.getElementById('mcc-objetos').checked,
    observacoes: document.getElementById('mcc-obs').value.trim(),
  };
  try {
    const res = await fetch(`${API}/caixas/${_caixaAtual}/checklist`, {
      credentials:'include', method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    const dados = await res.json();
    if (!res.ok) { toast(dados.erro || 'Erro ao salvar!','erro'); return; }
    toast('Conferência registrada!','sucesso');
    fecharModalCaixa();
    carregarCaixas();
    carregarLogCaixas();
  } catch(e) { toast('Erro ao salvar!','erro'); }
}

const TURNO_LABEL = { Manha:'Manhã', Tarde:'Tarde', Noite:'Noite' };

// Log completo pra gestão/supervisão acompanharem todas as conferências —
// filtrável por período, caixa e turno.
async function carregarLogCaixas() {
  const tbody = document.getElementById('cxlog-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:16px">Carregando...</td></tr>';
  const ini = document.getElementById('cxlog-ini')?.value || '';
  const fim = document.getElementById('cxlog-fim')?.value || '';
  const numero = document.getElementById('cxlog-numero')?.value || '';
  const turno = document.getElementById('cxlog-turno')?.value || '';
  const qs = new URLSearchParams();
  if (ini) qs.set('data_ini', ini);
  if (fim) qs.set('data_fim', fim);
  if (numero) qs.set('numero', numero);
  if (turno) qs.set('turno', turno);
  try {
    const res = await fetch(`${API}/caixas/checklist/log?${qs}`, { credentials:'include' });
    const lista = await res.json();
    if (!lista.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:16px">Nenhuma conferência encontrada</td></tr>';
      return;
    }
    tbody.innerHTML = lista.map(h => {
      const ok = h.organizada && h.limpa && !h.produtos_espalhados && !h.objetos_indevidos;
      const cor = ok ? 'var(--green)' : 'var(--red)';
      return `<tr>
        <td style="padding:7px 10px">${fmtData(h.data)} ${pfEsc((h.hora||'').slice(0,5))}</td>
        <td style="padding:7px 10px;font-weight:700">Caixa ${String(h.numero).padStart(2,'0')}</td>
        <td style="padding:7px 10px">${pfEsc(TURNO_LABEL[h.turno]||h.turno||'—')}</td>
        <td style="padding:7px 10px">${pfEsc(h.operador_nome||'—')}</td>
        <td style="padding:7px 10px;color:var(--text3)">${pfEsc(h.usuario_nome||'—')}</td>
        <td style="padding:7px 10px;text-align:center;color:${cor};font-weight:700">${ok?'OK':'Atenção'}</td>
        <td style="padding:7px 10px;color:var(--text3)">${pfEsc(h.observacoes||'—')}</td>
      </tr>`;
    }).join('');
  } catch(e) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--red);padding:16px">Erro ao carregar histórico</td></tr>';
  }
}
