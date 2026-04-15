/* ══ SEPARACAO.JS ══ WMS Miess ══ */

function gerarCodigoBarrasSVG(texto) {
  const chars   = String(texto).split('');
  const barLarg = 4;   // largura de cada módulo (maior = mais legível pelo coletor)
  const altura  = 120; // altura das barras
  let barras = '';
  let x = 30;
  // Barra inicial
  barras += `<rect x="${x}" y="10" width="${barLarg*2}" height="${altura}" fill="#000"/>`; x += barLarg*3;
  chars.forEach(c => {
    const code  = c.charCodeAt(0);
    const w1    = barLarg * (1 + (code % 4));
    const w2    = barLarg * (1 + ((code >> 3) % 3));
    const w3    = barLarg * (1 + ((code >> 5) % 2));
    barras += `<rect x="${x}" y="10" width="${w1}" height="${altura}" fill="#000"/>`; x += w1 + barLarg;
    barras += `<rect x="${x}" y="10" width="${w2}" height="${altura}" fill="#000"/>`; x += w2 + barLarg*2;
    barras += `<rect x="${x}" y="10" width="${w3}" height="${altura}" fill="#000"/>`; x += w3 + barLarg;
  });
  // Barra final
  barras += `<rect x="${x}" y="10" width="${barLarg*2}" height="${altura}" fill="#000"/>`; x += barLarg*3;
  const totalLarg = x + 30;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalLarg}" height="${altura+40}" style="max-width:100%;min-width:300px">
    <rect width="${totalLarg}" height="${altura+40}" fill="#fff"/>
    ${barras}
    <text x="${totalLarg/2}" y="${altura+32}" text-anchor="middle" font-family="monospace" font-size="18" font-weight="bold" fill="#000">${texto}</text>
  </svg>`;
}

async function vincularCaixaCore(caixa, inputStatusId) {
  if (!pedidoAtualId) { toast('Nenhum pedido ativo!','aviso'); return; }
  if (!caixa) { toast('Digite o número da caixa!','aviso'); return; }
  try {
    const res  = await fetch(`${API}/pedidos/${pedidoAtualId}/caixa`, {
      credentials:'include', method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ numero_caixa: caixa })
    });
    const data = await res.json();
    if (data.erro) { toast(data.erro,'erro'); return; }
    pedidoCaixaVinculada = true;
    toast(`📦 Caixa ${caixa} vinculada ao pedido ${pedidoAtualNum}!`,'sucesso');
    // Re-renderiza checklist para mostrar botões
    if (pedidoAtualId) { const isMob2 = document.getElementById('m-cl-lista'); if(isMob2) renderChecklist('m-cl'); else renderChecklist('cl'); }
    const statusEl = document.getElementById(inputStatusId);
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.innerHTML = `✅ Caixa <b>${caixa}</b> vinculada — Pedido #${pedidoAtualNum}`;
      statusEl.style.color = 'var(--green)';
    }
    // Atualiza status do pedido para remover aviso de caixa
    const stEl = document.getElementById(inputStatusId === 'cl-caixa-status' ? 'status-atual' : 'm-status-atual');
    if (stEl && stEl.querySelector) {
      const avisoDiv = stEl.querySelector('[style*="FEF3C7"]');
      if (avisoDiv) avisoDiv.remove();
    }
  } catch(e) { toast('Erro ao vincular caixa!','erro'); }
}

function vincularCaixaDesktop() {
  const caixa = document.getElementById('cl-input-caixa')?.value?.trim();
  vincularCaixaCore(caixa, 'cl-caixa-status');
}

function vincularCaixaMobile() {
  const caixa = document.getElementById('m-input-caixa')?.value?.trim();
  vincularCaixaCore(caixa, 'm-caixa-status');
}

function mostrarCampoCaixa(show) {
  const d = document.getElementById('cl-caixa-wrap');
  const m = document.getElementById('m-caixa-wrap');
  if (d) d.style.display = show ? 'block' : 'none';
  if (m) m.style.display = show ? 'block' : 'none';
}

function renderChecklist(prefix) {
  const total       = itensAtuais.length;
  const verificados = itensAtuais.filter(i=>i.status!=='pendente').length;
  const encontrados = itensAtuais.filter(i=>i.status==='encontrado').length;
  const faltas      = itensAtuais.filter(i=>i.status==='falta').length;
  const parciais    = itensAtuais.filter(i=>i.status==='parcial').length;
  const pct         = total>0 ? Math.round((verificados/total)*100) : 0;
  const todosVerif  = verificados===total;
  const temProblema = faltas>0 || parciais>0;

  const set = (id,val) => { const el=document.getElementById(`${prefix}-${id}`); if(el) el[typeof val==='string'&&id!=='style'?'textContent':'innerHTML'] = val; };
  document.getElementById(`${prefix}-titulo`).textContent   = `📋 PEDIDO #${pedidoAtualNum}`;
  document.getElementById(`${prefix}-contador`).textContent = `${verificados}/${total} itens`;
  document.getElementById(`${prefix}-barra`).style.width    = `${pct}%`;
  document.getElementById(`${prefix}-resumo`).innerHTML     = `✅ ${encontrados} ok &nbsp;🟡 ${parciais} parcial &nbsp;❌ ${faltas} falta &nbsp;⬜ ${total-verificados} pend.`;

  const btnC = document.getElementById(`${prefix.replace('cl','btn-concluir').replace('m-cl','m-btn-concluir')}`);
  const btnA = document.getElementById(`${prefix.replace('cl','btn-aguardar').replace('m-cl','m-btn-aguardar')}`);
  // Map prefix to btn ids
  const bcId = prefix === 'cl' ? 'btn-concluir' : 'm-btn-concluir';
  const baId = prefix === 'cl' ? 'btn-aguardar' : 'm-btn-aguardar';
  const bc = document.getElementById(bcId);
  const ba = document.getElementById(baId);

  if (!todosVerif) {
    if(bc){bc.style.display='block';bc.disabled=true;bc.textContent=`🔒 CONCLUIR (${total-verificados} pend.)`}
    if(ba) ba.style.display='none';
  } else if (temProblema) {
    const itensP = itensAtuais.filter(i=>i.status==='falta'||i.status==='parcial');
    // Status que liberam o concluir: encontrado, subiu, abastecido
    const statusOk = ['encontrado','reposto','separado','subiu','abastecido'];
    const statusBloq = ['nao_encontrado','protocolo'];
    const todosResolvidos = itensP.every(i => statusOk.includes(i.aviso_status) || statusBloq.includes(i.aviso_status));
    const temBloqueio = itensP.some(i => statusBloq.includes(i.aviso_status));
    const temPendente = itensP.some(i => !statusOk.includes(i.aviso_status) && !statusBloq.includes(i.aviso_status));

    if (temPendente) {
      // Ainda aguardando repositor resolver
      const qtdP = itensP.filter(i => !statusOk.includes(i.aviso_status) && !statusBloq.includes(i.aviso_status)).length;
      if(bc) bc.style.display='none';
      if(ba){ba.style.display='block';ba.textContent=`⏳ AGUARDANDO REPOSITOR (${qtdP})`;}
    } else if (temBloqueio) {
      // Bloqueado — aguarda supervisor
      const qtdBloq = itensP.filter(i => statusBloq.includes(i.aviso_status)).length;
      if(bc) bc.style.display='none';
      if(ba){ba.style.display='block';ba.textContent=`⛔ BLOQUEADO — AGUARDA SUPERVISOR (${qtdBloq})`;}
    } else {
      // Todos resolvidos pelo repositor
      if(bc){bc.style.display='block';bc.disabled=false;bc.textContent='✅ CONCLUIR PEDIDO';}
      if(ba) ba.style.display='none';
    }
  } else {
    if(bc){bc.style.display='block';bc.disabled=false;bc.textContent='✅ CONCLUIR PEDIDO';}
    if(ba) ba.style.display='none';
  }

  const listEl = document.getElementById(`${prefix}-lista`);
  if (!listEl) return;
  const isMob = prefix.startsWith('m-');
  listEl.innerHTML = itensAtuais.map(item => {
    const icones = { pendente:'⬜', encontrado:'✅', falta:'❌', parcial:'🟡' };
    const v = item.status !== 'pendente';
    const fnVerif  = isMob ? 'verificarItemMobile' : 'verificarItemDesktop';
    const fnToggle = isMob ? 'toggleParcialMobile'  : 'toggleParcialDesktop';
    const fnParcOk = isMob ? 'confirmarParcialMobile' : 'confirmarParcialDesktop';

    if (isMob) {
      // Verifica se caixa foi vinculada — bloqueia botões se não tiver
      const semCaixa = !pedidoCaixaVinculada;
      const corCod = item.status==='encontrado'?'var(--green)':item.status==='falta'?'var(--red)':item.status==='parcial'?'var(--amber)':'var(--accent)';
      const bgCard = item.status==='encontrado'?'#F0FDF4':item.status==='falta'?'#FEF2F2':item.status==='parcial'?'#FFFBEB':'var(--surface)';
      const borderCard = item.status==='encontrado'?'#BBF7D0':item.status==='falta'?'#FECACA':item.status==='parcial'?'#FDE68A':'var(--border)';
      return `<div id="${prefix}-ic-${item.id}" style="border-radius:12px;padding:12px 13px;border:1.5px solid ${borderCard};background:${bgCard};margin-bottom:2px;transition:all .2s">
        <!-- Linha topo: ícone + código + endereço -->
        <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px">
          <div style="width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;background:${borderCard}">${icones[item.status]||'⬜'}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-size:16px;font-weight:800;color:${corCod};font-family:'Space Mono',monospace">${item.codigo||'—'}</span>
              ${(function(){
                const e = item.endereco||'';
                const m = e.split(',')[0].trim().match(/^([A-Za-z]+)/);
                const l = m ? m[1].toUpperCase() : '';
                const verde=['A','B','C','D','E','P','Q','R','S','T','U'];
                const azul=['M','N','O','V','W','X','Y','Z'];
                const verm=['F','G','H','I','J','K','L'];
                const cor = verde.includes(l)?'#16A34A':azul.includes(l)?'#0070C0':verm.includes(l)?'#DC2626':'var(--accent)';
                const bg  = verde.includes(l)?'rgba(22,163,74,.1)':azul.includes(l)?'rgba(0,112,192,.1)':verm.includes(l)?'rgba(220,38,38,.1)':'rgba(37,99,235,.1)';
                const ic  = verde.includes(l)?'🟢':azul.includes(l)?'🔵':verm.includes(l)?'🔴':'📍';
                return `<span style="font-size:15px;font-weight:800;color:${cor};background:${bg};padding:3px 10px;border-radius:6px;border:1px solid ${cor}40">${ic} ${e||'—'}</span>`;
              })()}
            </div>
            <div style="font-size:13px;color:var(--text);margin-top:3px;line-height:1.3">${item.descricao||'—'}</div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:5px;flex-wrap:wrap">
              <span style="background:var(--accent);color:#fff;border-radius:7px;padding:3px 12px;font-size:17px;font-weight:800;font-family:'Space Mono',monospace">x${item.quantidade||1}</span>
              ${item.hora_verificado?`<span style="font-size:11px;color:var(--text3)">${item.hora_verificado}</span>`:''}
            </div>
          </div>
        </div>
        ${item.status==='falta'  ?`<div style="font-size:11px;color:var(--red);font-weight:700;margin-bottom:6px">❌ Falta total — repositor avisado</div>`:''}
        ${item.status==='parcial'?`<div style="font-size:11px;color:var(--amber);font-weight:700;margin-bottom:6px">🟡 ${item.obs||''} — repositor avisado</div>`:''}
        ${(item.status==='falta'||item.status==='parcial')&&item.aviso_status==='reposto'?`<div style="font-size:11px;color:var(--green);font-weight:600;margin-bottom:6px">✅ Repositor repôs!</div>`:''}
        ${(item.status==='falta'||item.status==='parcial')&&item.aviso_status==='nao_encontrado'?`<div style="font-size:11px;color:var(--red);font-weight:600;margin-bottom:6px">🚫 Não encontrado</div>`:''}
        <div class="parcial-wrap" id="${prefix}-pw-${item.id}">
          <label>Qtde encontrada (de ${item.quantidade||1}):</label>
          <div class="parcial-row">
            <input type="number" class="parcial-input" id="${prefix}-pi-${item.id}" min="0" max="${(item.quantidade||1)-1}" placeholder="0" inputmode="numeric"/>
            <button class="btn-parc-ok" onclick="${fnParcOk}(${item.id},${item.quantidade||1},'${prefix}')">OK</button>
          </div>
        </div>
        <!-- Botões ABAIXO — só aparecem se caixa vinculada e item pendente -->
        ${!v && !semCaixa ? `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px">
          <button onclick="${fnVerif}(${item.id},'encontrado','${prefix}')"
            style="padding:12px 0;background:#16A34A;color:#fff;border:none;border-radius:10px;font-size:20px;cursor:pointer;font-weight:700">✔</button>
          <button onclick="${fnToggle}(${item.id},'${prefix}')"
            style="padding:12px 0;background:#D97706;color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:800;cursor:pointer">±</button>
          <button onclick="${fnVerif}(${item.id},'falta','${prefix}')"
            style="padding:12px 0;background:#DC2626;color:#fff;border:none;border-radius:10px;font-size:20px;cursor:pointer;font-weight:700">✖</button>
        </div>` : !v && semCaixa ? `
        <div style="margin-top:8px;padding:8px 10px;background:#FEF3C7;border-radius:8px;font-size:11px;color:#92400E;font-weight:700;text-align:center">
          📦 Vincule a caixa para separar
        </div>` : ''}
      </div>`;
    }

    // Layout desktop — mantém original
    return `<div class="item-card ${item.status}" id="${prefix}-ic-${item.id}">
      <div class="item-ic">${icones[item.status]||'⬜'}</div>
      <div class="item-info">
        <div class="item-cod">${item.codigo||'—'} &nbsp;•&nbsp; 📍 ${item.endereco||'—'}</div>
        <div class="item-desc">${item.descricao||'—'}</div>
        <div class="item-det">
          <span style="background:var(--accent);color:#fff;border-radius:6px;padding:3px 10px;font-size:13px;font-weight:800;font-family:'Space Mono',monospace">x${item.quantidade||1}</span>
          ${item.hora_verificado?`<span style="font-size:11px;color:var(--text3);margin-left:6px">${item.hora_verificado}</span>`:''}
        </div>
        ${item.status==='falta'  ?`<div class="item-aviso">❌ Falta total — repositor avisado</div>`:''}
        ${item.status==='parcial'?`<div class="item-aviso">🟡 ${item.obs||''} — repositor avisado</div>`:''}
        ${(item.status==='falta'||item.status==='parcial')&&item.aviso_status==='reposto'?`<div style="font-size:10px;color:var(--green);margin-top:3px;font-weight:600">✅ Repositor repôs!</div>`:''}
        ${(item.status==='falta'||item.status==='parcial')&&item.aviso_status==='nao_encontrado'?`<div style="font-size:10px;color:var(--red);margin-top:3px;font-weight:600">🚫 Não encontrado</div>`:''}
        <div class="parcial-wrap" id="${prefix}-pw-${item.id}">
          <label>Qtde encontrada (de ${item.quantidade||1}):</label>
          <div class="parcial-row">
            <input type="number" class="parcial-input" id="${prefix}-pi-${item.id}" min="0" max="${(item.quantidade||1)-1}" placeholder="0" inputmode="numeric"/>
            <button class="btn-parc-ok" onclick="${fnParcOk}(${item.id},${item.quantidade||1},'${prefix}')">OK</button>
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:4px">Digite quantas unidades encontrou</div>
        </div>
      </div>
      <div class="item-btns">
        <button class="btn-item ok"   ${v?'disabled':''} onclick="${fnVerif}(${item.id},'encontrado','${prefix}')">✔</button>
        <button class="btn-item parc" ${v?'disabled':''} onclick="${fnToggle}(${item.id},'${prefix}')" title="Parcial">±</button>
        <button class="btn-item nok"  ${v?'disabled':''} onclick="${fnVerif}(${item.id},'falta','${prefix}')">✖</button>
      </div>
    </div>`;
  }).join('');
}

async function carregarChecklist() {
  if (!pedidoAtualId) return;
  try {
    const res = await fetch(`${API}/pedidos/${pedidoAtualId}/itens`, { credentials:'include' });
    itensAtuais = await res.json();
    const wrap = document.getElementById('cl-wrap');
    if (!itensAtuais.length) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';
    renderChecklist('cl');
  } catch(e) { toast('Erro ao carregar itens!','erro'); }
}

async function carregarChecklistMobile() {
  if (!pedidoAtualId) return;
  try {
    const res = await fetch(`${API}/pedidos/${pedidoAtualId}/itens`, { credentials:'include' });
    itensAtuais = await res.json();
    const wrap = document.getElementById('m-cl-wrap');
    if (!itensAtuais.length) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';
    renderChecklist('m-cl');
  } catch(e) { toast('Erro ao carregar itens!','erro'); }
}

function renderChecklistMobile() { renderChecklist('m-cl'); }

async function verificarItem(itemId, status, obs='', qtdFalta=0, prefix, renderPrefix) {
  // Usa separadorAtual se disponível, senão usa dados do usuário logado
  const sepId   = separadorAtual ? separadorAtual.id   : (usuarioAtual?.id   || 0);
  const sepNome = separadorAtual ? separadorAtual.nome  : (usuarioAtual?.nome || '');
  try {
    const item = itensAtuais.find(i=>i.id===itemId);
    const resp = await fetch(`${API}/itens/${itemId}/verificar`, {
      credentials:'include', method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        status, obs,
        qtd_falta: status==='falta' ? (item?.quantidade||1) : qtdFalta,
        separador_id:   sepId,
        separador_nome: sepNome
      })
    });
    if (!resp.ok) { toast('Erro ao verificar item!','erro'); return; }
    if (item) { item.status=status; item.obs=obs; item.aviso_status=''; }
    if (status==='falta')     toast('❌ Falta total — repositor avisado!','aviso');
    if (status==='parcial')   toast('🟡 Parcial — repositor avisado!','aviso');
    // sem toast para encontrado — a linha fica verde
    renderChecklist(renderPrefix);
  } catch(e) { toast('Erro ao verificar item!','erro'); }
}

function verificarItemDesktop(id,status,prefix){ verificarItem(id,status,''  ,0,prefix,'cl'); }

function toggleParcial(id, prefix) {
  const w = document.getElementById(`${prefix}-pw-${id}`); if (!w) return;
  const a = w.classList.toggle('aberto');
  if (a) setTimeout(() => document.getElementById(`${prefix}-pi-${id}`)?.focus(), 100);
}

async function confirmarParcial(id, qtdTotal, prefix, renderPrefix) {
  const input  = document.getElementById(`${prefix}-pi-${id}`);
  const qtdEnc = parseInt(input?.value);
  if (isNaN(qtdEnc)||qtdEnc<0)   { toast('Digite uma quantidade válida!','aviso'); return; }
  if (qtdEnc >= qtdTotal)          { toast('Se encontrou tudo, use ✔!','aviso'); return; }
  const qtdFalta = qtdTotal - qtdEnc;
  await verificarItem(id,'parcial',`Encontrou ${qtdEnc} de ${qtdTotal} — faltam ${qtdFalta}`,qtdFalta,prefix,renderPrefix);
}

function confirmarParcialDesktop(id,qtd,prefix){ confirmarParcial(id,qtd,prefix,'cl'); }

function toggleParcialDesktop(id,prefix){ toggleParcial(id,prefix); }

async function _confirmarPedidoCore(num, inputId, statusId, clWrapId, fnChecklist, fnFila) {
  try {
    const sepId = separadorAtual ? separadorAtual.id : null;
    const res  = await fetch(`${API}/pedidos/bipar`, { credentials:'include', method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({numero_pedido:num, separador_id:sepId}) });
    const data = await res.json();
    if (res.status===404) { toast('❌ Pedido não encontrado!','erro'); document.getElementById(inputId).value=''; return; }
    if (res.status===409||res.status===400) { toast(`⚠️ ${data.erro}`,'aviso'); document.getElementById(inputId).value=''; return; }
    if (!res.ok) { toast(`❌ ${data.erro}`,'erro'); return; }
    pedidoAtualId  = data.pedido_id;
    pedidoAtualNum = num;
    pedidoCaixaVinculada = !!(data.caixa_vinculada || data.numero_caixa);
    const statusEl = document.getElementById(statusId);
    // Monta linha de info com transportadora
    const transpHtml = data.transportadora
      ? `<div style="margin-top:6px;padding:8px 12px;background:linear-gradient(135deg,rgba(37,99,235,.08),rgba(99,102,241,.06));border:1.5px solid var(--accent);border-radius:10px;display:flex;align-items:center;gap:10px">
           <span style="font-size:20px">🚚</span>
           <div>
             <div style="font-size:14px;font-weight:800;color:var(--accent)">${data.transportadora}</div>
             ${data.razao_social ? `<div style="font-size:12px;color:var(--text2);margin-top:1px">👤 ${data.razao_social}</div>` : ''}
           </div>
         </div>` : '';
    const caixaAviso = !data.caixa_vinculada
      ? `<div style="margin-top:6px;padding:8px 12px;background:#FEF3C7;border:1.5px solid #F59E0B;border-radius:10px;font-size:12px;font-weight:700;color:#92400E">
           📦 Vincule uma caixa ao pedido para iniciar a separação
         </div>` : '';
    if (statusEl) {
      statusEl.innerHTML = `<b style="color:var(--text)">#${num}</b> — 🔵 Separando${transpHtml}${caixaAviso}`;
      statusEl.style.display = 'block';
    }
    toast(data.ja_atribuido ? `Pedido ${num} carregado` : `✅ Pedido ${num} → SEPARANDO`, data.ja_atribuido?'info':'sucesso');
    mostrarCampoCaixa(true);
    await fnChecklist();
    fnFila();
  } catch(e) { toast('Erro ao conectar!','erro'); }
}

async function _concluirCore(prefix, fnChecklist, fnFila, fnStats, inputId, statusId) {
  if (!pedidoAtualId) return;
  try {
    const res  = await fetch(`${API}/pedidos/${pedidoAtualId}/concluir`, { credentials:'include', method:'PUT' });
    const data = await res.json();
    if (data.sem_caixa)  { toast('📦 Vincule uma caixa ao pedido antes de concluir!','aviso'); return; }
    if (data.aguardando) { toast('⏳ Ainda aguardando o repositor!','aviso'); return; }
    if (data.bloqueado)  { toast('⛔ Bloqueado! Aguarde o supervisor liberar.','erro'); return; }
    if (data.erro)       { toast(`⚠️ ${data.erro}`,'aviso'); return; }
    toast(`🎉 Pedido ${pedidoAtualNum} CONCLUÍDO!`,'sucesso');
    const wrap = document.getElementById(`${prefix}-wrap`);
    if (wrap) wrap.style.display = 'none';
    const statusEl = document.getElementById(statusId);
    if (statusEl) statusEl.style.display = 'none';
    document.getElementById(inputId).value = '';
    mostrarCampoCaixa(false);
    pedidoAtualId=null; pedidoAtualNum=null; itensAtuais=[]; pedidoCaixaVinculada=false;
    fnFila(); fnStats();
    setTimeout(() => document.getElementById(inputId).focus(), 300);
  } catch(e) { toast('Erro ao concluir!','erro'); }
}

async function confirmarPedido() {
  const num = document.getElementById('input-pedido').value.trim();
  if (!num) { toast('Digite o número!','aviso'); return; }
  await _confirmarPedidoCore(num, 'input-pedido', 'status-atual', 'cl-wrap', carregarChecklist, carregarFila);
}

async function confirmarPedidoMobile() {
  const num = document.getElementById('m-input-pedido').value.trim();
  if (!num) { toast('Digite o número!','aviso'); return; }
  await _confirmarPedidoCore(num, 'm-input-pedido', 'm-status-atual', 'm-cl-wrap', carregarChecklistMobile, carregarFilaMobile);
}

async function concluirPedido() {
  await _concluirCore('cl', carregarChecklist, carregarFila, carregarContadoresSep, 'input-pedido', 'status-atual');
}

async function concluirPedidoMobile() {
  await _concluirCore('m-cl', carregarChecklistMobile, carregarFilaMobile, carregarStatsMobile, 'm-input-pedido', 'm-status-atual');
}

async function carregarContadoresSep() {
  if (!separadorAtual) return;
  try {
    const res   = await fetch(`${API}/produtividade?separador_id=${separadorAtual.id}`, { credentials:'include' });
    const dados = await res.json();
    if (dados.length) {
      document.getElementById('sep-cnt-hoje').textContent = dados[0].hoje||0;
      document.getElementById('sep-cnt-mes').textContent  = dados[0].mes||0;
      document.getElementById('sep-cnt-ano').textContent  = dados[0].total_ano||0;
    }
  } catch(e) {}
}

async function carregarContadoresGerais() {
  await carregarKPIs();
}

async function carregarStatsMobile() {
  try {
    const nomeEl = document.getElementById('m-stat-nome');
    if (nomeEl) nomeEl.textContent = `👤 ${usuarioAtual?.nome || '—'}`;
    if (!separadorAtual) return;
    const res   = await fetch(`${API}/produtividade?separador_id=${separadorAtual.id}`, { credentials:'include' });
    const dados = await res.json();
    if (nomeEl) nomeEl.textContent = `👤 ${separadorAtual.nome||usuarioAtual.nome}`;
    if (dados.length) {
      document.getElementById('m-stat-hoje').textContent = dados[0].hoje||0;
      document.getElementById('m-stat-mes').textContent  = dados[0].mes||0;
      document.getElementById('m-stat-ano').textContent  = dados[0].total_ano||0;
    }
  } catch(e) {}
}

function ativarMobileSep() {
  document.body.classList.add('sep-mobile');
  document.getElementById('sep-mobile-root').style.display = 'flex';
  document.getElementById('sep-tabbar').style.display = 'flex';
  mudarTabSep('separar');
  setTimeout(() => document.getElementById('m-input-pedido').focus(), 400);
  carregarStatsMobile();
  carregarFilaMobile();
  carregarAvisosSeparador();
  setInterval(() => {
    carregarFilaMobile();
    carregarAvisosSeparador();
    if (pedidoAtualId) carregarChecklistMobile();
  }, 30000);
}

function mudarTabSep(tab) {
  ['separar','fila','avisos-sep','stats'].forEach(t => {
    const pg = document.getElementById(`sep-tab-${t}`);
    const bt = document.getElementById(`stab-${t}`);
    if (pg) pg.classList.toggle('ativa', t === tab);
    if (bt) bt.classList.toggle('ativo', t === tab);
  });
  if (tab === 'fila')       carregarFilaMobile();
  if (tab === 'stats')      carregarStatsMobile();
  if (tab === 'avisos-sep') carregarAvisosSeparador();
  if (tab === 'separar' && pedidoAtualId) renderChecklistMobile();
}