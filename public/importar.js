/* ══ IMPORTAR.JS ══ WMS Miess ══ */

function handleDrop(e) {
  e.preventDefault(); document.getElementById('upload-area').classList.remove('drag');
  const f = e.dataTransfer.files[0]; if (f) processarArquivoFile(f);
}

function processarArquivo(e) { const f = e.target.files[0]; if (f) processarArquivoFile(f); }

function processarArquivoFile(file) {
  mostrarStatus('⏳ Lendo arquivo...','carregando');
  document.getElementById('preview-importacao').style.display = 'none';
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type:'array' });

      // ── Detecta aba de itens (primeira que tem "codigo" ou "pedido") ──
      function lerAba(sheetName) {
        const ws = wb.Sheets[sheetName];
        return XLSX.utils.sheet_to_json(ws, { defval:'', header:1 });
      }
      function norm(s) { return String(s).toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

      // Procura aba de Itens (tem coluna "codigo" ou "descricao")
      let abaItens = null, abaTransp = null;
      for (const name of wb.SheetNames) {
        const rows = lerAba(name);
        if (!rows.length) continue;
        const cab = rows[0].map(norm);
        const temItens = cab.some(c=>c.includes('cod')) && cab.some(c=>c.includes('desc'));
        const temTransp = cab.some(c=>c.includes('transp')||c.includes('entrega')||c.includes('servico')||c.includes('servi'));
        if (temItens && !abaItens) abaItens = name;
        if (temTransp && !abaTransp) abaTransp = name;
      }
      if (!abaItens) abaItens = wb.SheetNames[0];

      // ── Lê aba de Itens ──
      const rows = lerAba(abaItens);
      if (!rows.length) throw new Error('Arquivo vazio');
      const cab = rows[0].map(norm);
      const temCab = cab.some(c=>c.includes('pedido')||c.includes('codigo')||c.includes('descricao'));
      const ini   = temCab ? 1 : 0;
      const iNum  = temCab ? Math.max(cab.findIndex(c=>c.includes('pedido')||c.includes('numero')),0) : 0;
      const iCod  = temCab ? (cab.findIndex(c=>c.includes('cod'))>=0 ? cab.findIndex(c=>c.includes('cod')) : 1) : 1;
      const iDesc = temCab ? (cab.findIndex(c=>c.includes('desc'))>=0 ? cab.findIndex(c=>c.includes('desc')) : 2) : 2;
      const iQtd  = temCab ? (cab.findIndex(c=>c.includes('qtd')||c.includes('quant'))>=0 ? cab.findIndex(c=>c.includes('qtd')||c.includes('quant')) : 4) : 4;
      const iEnd  = temCab ? (cab.findIndex(c=>c.includes('end')||c.includes('rua')||c.includes('ender'))>=0 ? cab.findIndex(c=>c.includes('end')||c.includes('rua')||c.includes('ender')) : 3) : 3;
      const dados = [];
      for (let i = ini; i < rows.length; i++) {
        const r = rows[i];
        const num = String(r[iNum]||'').trim();
        if (!num) continue;
        dados.push({ numero_pedido:num, codigo:String(r[iCod]||'').trim(), descricao:String(r[iDesc]||'').trim(), quantidade:parseInt(r[iQtd])||1, endereco:String(r[iEnd]||'').trim() });
      }
      if (!dados.length) { mostrarStatus('❌ Nenhuma linha encontrada!','erro'); return; }
      pedidosImportar = dados;

      // ── Lê aba de Transportadora (se existir) ──
      transportadorasImportar = [];
      if (abaTransp) {
        const tRows = lerAba(abaTransp);
        if (tRows.length > 1) {
          const tCab = tRows[0].map(norm);
          const tNum   = tCab.findIndex(c=>c.includes('pedido')||c.includes('numero'));
          // Procura coluna de serviço de entrega
          const tTransp= tCab.findIndex(c=>c.includes('servico')||c.includes('servi')||c.includes('entrega')||c.includes('transp'));
          // Razão social / nome do destinatário
          const tRazao = tCab.findIndex(c=>c.includes('razao')||c.includes('social')||c.includes('nome')||c.includes('destinat'));
          for (let i = 1; i < tRows.length; i++) {
            const r = tRows[i];
            const num = String(r[tNum>=0?tNum:0]||'').trim();
            if (!num) continue;
            transportadorasImportar.push({
              numero_pedido: num,
              transportadora: tTransp>=0 ? String(r[tTransp]||'').trim() : '',
              razao_social:   tRazao>=0  ? String(r[tRazao]||'').trim()  : ''
            });
          }
        }
      }

      const totalP = new Set(dados.map(d=>d.numero_pedido)).size;
      const transpInfo = transportadorasImportar.length > 0 ? ` • 🚚 ${transportadorasImportar.length} transportadoras` : '';
      mostrarStatus(`✅ ${dados.length} linha(s) em ${totalP} pedido(s)${transpInfo} — clique Importar`,'sucesso');
      document.getElementById('tbody-prev').innerHTML =
        dados.slice(0,10).map(d=>`<tr><td>${d.numero_pedido}</td><td style="color:var(--accent)">${d.codigo}</td><td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.descricao}</td><td style="color:var(--amber)">${d.endereco}</td><td style="color:var(--green)">${d.quantidade}</td></tr>`).join('') +
        (dados.length>10?`<tr><td colspan="5" style="color:var(--text3);text-align:center;padding:8px">... +${dados.length-10} linhas</td></tr>`:'');
      const elTot = document.getElementById('txt-total-import');
      const elIts = document.getElementById('txt-itens-import');
      const elWrp = document.getElementById('import-status-wrap');
      if (elTot) elTot.textContent = `${totalP} pedido${totalP!==1?'s':''}`;
      if (elIts) elIts.textContent = `${dados.length} itens no total${transpInfo}`;
      if (elWrp) elWrp.style.display = 'none';
      document.getElementById('preview-importacao').style.display = 'block';
    } catch(err) { mostrarStatus(`❌ ${err.message}`,'erro'); }
  };
  reader.onerror = () => mostrarStatus('❌ Erro ao abrir arquivo!','erro');
  reader.readAsArrayBuffer(file);
}

function renderHistorico() {
  const el = document.getElementById('hist-importacoes');
  if (!historicoImportacoes.length) { el.innerHTML = '<div style="color:var(--text3);font-size:11px;text-align:center;padding:14px">Nenhuma importação</div>'; return; }
  el.innerHTML = historicoImportacoes.map(h=>`
    <div class="hist-item">
      <div><div style="color:var(--green);font-weight:700">✅ ${h.ok} pedido(s)</div>${h.erro>0?`<div style="color:var(--amber);font-size:10px">⚠️ ${h.erro} já existiam</div>`:''}</div>
      <div style="color:var(--text3);font-size:10px">${h.data} às ${h.hora}</div>
    </div>`).join('');
}

function limparHistorico() {
  if (!confirm('Limpar histórico?')) return;
  historicoImportacoes = []; localStorage.removeItem('historico_importacoes');
  renderHistorico(); toast('Histórico limpo!','info');
}