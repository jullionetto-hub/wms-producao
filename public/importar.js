/* ══ IMPORTAR.JS ══ WMS Miess ══ */

function handleDrop(e) {
  e.preventDefault();
  const area = document.getElementById('upload-area');
  if (area) { area.style.borderColor = 'var(--border)'; area.style.background = 'var(--surface2)'; }
  const f = e.dataTransfer.files[0];
  if (f) processarArquivoFile(f);
}

function processarArquivo(e) {
  const f = e.target.files[0];
  if (f) processarArquivoFile(f);
}

function processarArquivoFile(file) {
  // Esconde preview anterior
  const elPrev = document.getElementById('preview-importacao');
  const elWrp  = document.getElementById('import-status-wrap');
  const elTxt  = document.getElementById('import-status-txt');
  const elBar  = document.getElementById('import-bar');
  const elPct  = document.getElementById('import-pct');
  if (elPrev) elPrev.style.display = 'none';
  if (elWrp)  { elWrp.style.display = 'block'; }
  if (elTxt)  { elTxt.textContent = '⏳ Lendo arquivo...'; elTxt.style.color = 'var(--accent)'; }
  if (elBar)  { elBar.style.width = '30%'; elBar.style.background = 'var(--accent)'; }
  if (elPct)  { elPct.textContent = '...'; }

  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });

      function lerAba(sheetName) {
        const ws = wb.Sheets[sheetName];
        return XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });
      }
      function norm(s) {
        return String(s).toLowerCase().trim()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      }

      // Detecta abas
      let abaItens = null, abaTransp = null;
      for (const name of wb.SheetNames) {
        const rows = lerAba(name);
        if (!rows.length) continue;
        const cab = rows[0].map(norm);
        const temItens  = cab.some(c => c.includes('cod')) && cab.some(c => c.includes('desc'));
        const temTransp = cab.some(c => c.includes('transp') || c.includes('entrega') || c.includes('servico') || c.includes('servi'));
        if (temItens  && !abaItens)  abaItens  = name;
        if (temTransp && !abaTransp) abaTransp = name;
      }
      if (!abaItens) abaItens = wb.SheetNames[0];

      // Lê Itens
      const rows = lerAba(abaItens);
      if (!rows.length) throw new Error('Arquivo vazio');
      const cab    = rows[0].map(norm);
      const temCab = cab.some(c => c.includes('pedido') || c.includes('codigo') || c.includes('descricao'));
      const ini    = temCab ? 1 : 0;
      const iNum   = Math.max(cab.findIndex(c => c.includes('pedido') || c.includes('numero')), 0);
      const iCod   = cab.findIndex(c => c.includes('cod')) >= 0 ? cab.findIndex(c => c.includes('cod')) : 1;
      const iDesc  = cab.findIndex(c => c.includes('desc')) >= 0 ? cab.findIndex(c => c.includes('desc')) : 2;
      const iQtd   = cab.findIndex(c => c.includes('qtd') || c.includes('quant')) >= 0 ? cab.findIndex(c => c.includes('qtd') || c.includes('quant')) : 3;
      const iEnd   = cab.findIndex(c => c.includes('end') || c.includes('ender')) >= 0 ? cab.findIndex(c => c.includes('end') || c.includes('ender')) : 5;

      const dados = [];
      for (let i = ini; i < rows.length; i++) {
        const r   = rows[i];
        const num = String(r[iNum] || '').trim();
        if (!num || num === '0') continue;
        dados.push({
          numero_pedido: num,
          codigo:        String(r[iCod]  || '').trim(),
          descricao:     String(r[iDesc] || '').trim(),
          quantidade:    parseInt(r[iQtd]) || 1,
          endereco:      String(r[iEnd]  || '').trim()
        });
      }

      if (!dados.length) throw new Error('Nenhum item encontrado na planilha!');
      pedidosImportar = dados;

      // Lê Transportadora
      transportadorasImportar = [];
      if (abaTransp) {
        const tRows = lerAba(abaTransp);
        if (tRows.length > 1) {
          const tCab   = tRows[0].map(norm);
          const tNum   = tCab.findIndex(c => c.includes('pedido') || c.includes('numero'));
          const tTransp = tCab.findIndex(c => c.includes('servico') || c.includes('servi') || c.includes('entrega') || c.includes('transp'));
          const tRazao = tCab.findIndex(c => c.includes('razao') || c.includes('social') || c.includes('nome') || c.includes('destinat'));
          for (let i = 1; i < tRows.length; i++) {
            const r   = tRows[i];
            const num = String(r[tNum >= 0 ? tNum : 0] || '').trim();
            if (!num || num === '0') continue;
            transportadorasImportar.push({
              numero_pedido: num,
              transportadora: tTransp >= 0 ? String(r[tTransp] || '').trim() : '',
              razao_social:   tRazao  >= 0 ? String(r[tRazao]  || '').trim() : ''
            });
          }
        }
      }

      const totalP     = new Set(dados.map(d => d.numero_pedido)).size;
      const transpInfo = transportadorasImportar.length > 0 ? ` • 🚚 ${transportadorasImportar.length} transportadoras` : '';

      // Mostra preview
      const elTot  = document.getElementById('txt-total-import');
      const elIts  = document.getElementById('txt-itens-import');
      const elTbody = document.getElementById('tbody-prev');

      if (elTot)   elTot.textContent  = `${totalP} pedido${totalP !== 1 ? 's' : ''}`;
      if (elIts)   elIts.textContent  = `${dados.length} itens no total${transpInfo}`;
      if (elTbody) elTbody.innerHTML  = dados.slice(0, 10).map(d =>
        `<tr>
          <td>${d.numero_pedido}</td>
          <td style="color:var(--accent)">${d.codigo}</td>
          <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.descricao}</td>
          <td style="color:var(--amber)">${d.endereco}</td>
          <td style="color:var(--green);text-align:center">${d.quantidade}</td>
        </tr>`
      ).join('') + (dados.length > 10 ? `<tr><td colspan="5" style="color:var(--text3);text-align:center;padding:8px">... +${dados.length - 10} itens</td></tr>` : '');

      // Esconde barra de progresso, mostra preview + botão
      if (elWrp)  elWrp.style.display  = 'none';
      if (elPrev) elPrev.style.display = 'block';

    } catch(err) {
      const elWrp = document.getElementById('import-status-wrap');
      const elTxt = document.getElementById('import-status-txt');
      const elPct = document.getElementById('import-pct');
      if (elWrp) elWrp.style.display = 'block';
      if (elTxt) { elTxt.textContent = '❌ ' + err.message; elTxt.style.color = 'var(--red)'; }
      if (elPct) elPct.textContent = '';
    }
  };
  reader.onerror = () => {
    const elTxt = document.getElementById('import-status-txt');
    if (elTxt) elTxt.textContent = '❌ Erro ao abrir arquivo!';
  };
  reader.readAsArrayBuffer(file);
}

async function confirmarImportacao() {
  if (!pedidosImportar.length) { toast('Selecione um arquivo primeiro!', 'erro'); return; }

  const elWrp = document.getElementById('import-status-wrap');
  const elPrev = document.getElementById('preview-importacao');
  const elTxt  = document.getElementById('import-status-txt');
  const elBar  = document.getElementById('import-bar');
  const elPct  = document.getElementById('import-pct');

  if (elPrev) elPrev.style.display = 'none';
  if (elWrp)  elWrp.style.display  = 'block';
  if (elTxt)  { elTxt.textContent = 'Preparando importação...'; elTxt.style.color = 'var(--text2)'; }
  if (elBar)  { elBar.style.width = '0%'; elBar.style.background = 'var(--accent)'; }
  if (elPct)  elPct.textContent = '0%';

  // Agrupa por pedido
  const pedMapLocal = {};
  pedidosImportar.forEach(l => {
    const n = String(l.numero_pedido || '').trim();
    if (!n) return;
    if (!pedMapLocal[n]) pedMapLocal[n] = [];
    pedMapLocal[n].push(l);
  });
  const numeros = Object.keys(pedMapLocal);
  const LOTE = 20;
  let totalImportados = 0, totalIgnorados = 0;

  try {
    for (let i = 0; i < numeros.length; i += LOTE) {
      const loteNums   = numeros.slice(i, i + LOTE);
      const linhasLote = [];
      loteNums.forEach(n => linhasLote.push(...pedMapLocal[n]));

      const progresso = Math.round(((i + loteNums.length) / numeros.length) * 100);
      if (elTxt) elTxt.textContent = `Importando... (${Math.min(i + LOTE, numeros.length)} de ${numeros.length} pedidos)`;
      if (elBar) elBar.style.width = progresso + '%';
      if (elPct) elPct.textContent = progresso + '%';

      const res = await fetch(`${API}/importar`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linhas: linhasLote, transportadoras: transportadorasImportar })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Erro ao importar');
      totalImportados += data.importados || loteNums.length;
      totalIgnorados  += data.ignorados  || 0;
    }

    // 100% verde
    if (elBar) { elBar.style.width = '100%'; elBar.style.background = 'var(--green)'; }
    if (elPct) { elPct.textContent = '100%'; elPct.style.color = 'var(--green)'; }
    if (elTxt) { elTxt.textContent = `✅ ${totalImportados} pedidos importados com sucesso!${totalIgnorados > 0 ? ' (' + totalIgnorados + ' já existiam)' : ''}`; elTxt.style.color = 'var(--green)'; }

    // Salva histórico
    const agora = new Date();
    const h = `${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}`;
    const d = `${String(agora.getDate()).padStart(2,'0')}/${String(agora.getMonth()+1).padStart(2,'0')}/${agora.getFullYear()}`;
    historicoImportacoes.unshift({ ok: totalImportados, erro: totalIgnorados, data: d, hora: h });
    if (historicoImportacoes.length > 20) historicoImportacoes = historicoImportacoes.slice(0, 20);
    localStorage.setItem('historico_importacoes', JSON.stringify(historicoImportacoes));
    renderHistorico();

    pedidosImportar = [];
    transportadorasImportar = [];
    toast(`${totalImportados} pedidos importados!`, 'sucesso');

  } catch(err) {
    if (elTxt) { elTxt.textContent = '❌ ' + err.message; elTxt.style.color = 'var(--red)'; }
    if (elBar) elBar.style.background = 'var(--red)';
    toast('Erro na importação: ' + err.message, 'erro');
  }
}

function renderHistorico() {
  const el = document.getElementById('hist-importacoes');
  if (!el) return;
  if (!historicoImportacoes.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:12px;text-align:center;padding:30px">Nenhuma importação ainda</div>';
    return;
  }
  el.innerHTML = historicoImportacoes.map(h => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid var(--border)">
      <div>
        <div style="color:var(--green);font-weight:700;font-size:13px">✅ ${h.ok} pedido${h.ok !== 1 ? 's' : ''} importados</div>
        ${h.erro > 0 ? `<div style="color:var(--amber);font-size:11px">⚠️ ${h.erro} já existiam</div>` : ''}
      </div>
      <div style="color:var(--text3);font-size:11px;text-align:right">${h.data}<br>${h.hora}</div>
    </div>`).join('');
}

function limparHistorico() {
  if (!confirm('Limpar todo o histórico de importações?')) return;
  historicoImportacoes = [];
  localStorage.removeItem('historico_importacoes');
  renderHistorico();
  toast('Histórico limpo!', 'info');
}
