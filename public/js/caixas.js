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
      const quando = c.ultima ? `${c.ultima.data} ${c.ultima.hora||''}`.trim() : '';
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
              <span>${h.data} ${h.hora||''} — ${pfEsc(h.usuario_nome||'—')}</span>
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
  const body = {
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
  } catch(e) { toast('Erro ao salvar!','erro'); }
}
