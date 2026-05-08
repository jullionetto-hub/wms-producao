﻿/* ══════════════════════════════════════════
   SEPARAÇÃO — MOBILE (tabs)
══════════════════════════════════════════ */
async function confirmarPedidoMobile() {
  const num = document.getElementById('m-input-pedido').value.trim();
  if (!num) { toast('Digite o número!','aviso'); return; }
  await _confirmarPedidoCore(num, 'm-input-pedido', 'm-status-atual', 'm-cl-wrap', carregarChecklistMobile, carregarFilaMobile);
}




async function carregarChecklistMobile() {
  if (!pedidoAtualId) return;
  try {
    const res = await fetch(`${API}/pedidos/${pedidoAtualId}/itens`, { credentials:'include' });
    itensAtuais = await res.json();
    const wrap = document.getElementById('m-cl-wrap');
    if (!itensAtuais.length) { wrap.style.display = 'none'; return; }
    // Ordena por rota: rua (ordem do corredor) + número da colméia
    const RUAS_ORD = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
    itensAtuais.sort((a,b) => {
      const ra = String(a.endereco||'').split(',')[0].trim();
      const rb = String(b.endereco||'').split(',')[0].trim();
      const rua_a = ra.match(/^([A-Z]+)/)?.[1] || 'Z';
      const rua_b = rb.match(/^([A-Z]+)/)?.[1] || 'Z';
      const num_a = parseInt(ra.match(/\d+/)?.[0]||0);
      const num_b = parseInt(rb.match(/\d+/)?.[0]||0);
      const ri = (RUAS_ORD.indexOf(rua_a) - RUAS_ORD.indexOf(rua_b));
      return ri !== 0 ? ri : num_a - num_b;
    });
    wrap.style.display = 'block';
    renderChecklist('m-cl');
  } catch(e) { toast('Erro ao carregar itens!','erro'); }
}




function renderChecklistMobile() { renderChecklist('m-cl'); }




async function concluirPedidoMobile() {
  await _concluirCore('m-cl', carregarChecklistMobile, carregarFilaMobile, carregarStatsMobile, 'm-input-pedido', 'm-status-atual');
}




async function carregarFilaMobile() {
  try {
    // Busca pedidos e avisos pendentes em paralelo
    const [resPed, resAv] = await Promise.all([
      fetch(`${API}/pedidos`, { credentials:'include' }),
      fetch(`${API}/repositor/avisos?status=pendente`, { credentials:'include' })
    ]);
    const todos  = await resPed.json();
    const avisos = resAv.ok ? await resAv.json() : [];

    // Pedidos com itens aguardando repositor (deste separador)
    const pedidosComFalta = {};
    avisos
      .filter(a => !separadorAtual || String(a.separador_id) === String(separadorAtual.id))
      .forEach(a => {
        const n = String(a.numero_pedido);
        if (!pedidosComFalta[n]) pedidosComFalta[n] = 0;
        pedidosComFalta[n]++;
      });

    const ativos = todos.filter(p=>p.status!=='concluido');
    const meusMob = separadorAtual ? ativos.filter(p=>p.separador_id===separadorAtual.id) : ativos;
    const ordenadosMob = [...meusMob].sort((a,b)=>(a.itens||0)-(b.itens||0));

    const badge = document.getElementById('stab-fila-badge');
    if (badge) { badge.textContent = ordenadosMob.length; badge.style.display = ordenadosMob.length > 0 ? 'inline' : 'none'; }
    const bdFila = document.getElementById('badge-fila-m');
    if (bdFila) bdFila.textContent = `${ordenadosMob.length} pedidos`;

    const lista = document.getElementById('lista-fila-mobile');
    if (!lista) return;
    if (!ordenadosMob.length) { lista.innerHTML = '<div style="color:var(--text3);text-align:center;padding:30px;font-size:13px">Nenhum pedido na fila</div>'; return; }

    lista.innerHTML = ordenadosMob.map(p => {
      const transp   = String(p.transportadora||'').toUpperCase();
      const isDrive  = transp.includes('DRIVE');
      const isPrime  = p.tem_prime === true;
      const qtdFalta = pedidosComFalta[String(p.numero_pedido)] || 0;
      const temFalta = qtdFalta > 0;

      // Hierarquia visual: falta > drive thru > normal
      const bordLeft  = temFalta ? '3px solid #F59E0B' : isDrive ? '3px solid #DC2626' : '3px solid #2563EB';
      const cardBg    = temFalta ? '#FFFBEB' : '#fff';
      const bordColor = temFalta ? '#FDE68A' : '#E2E8F0';
      const numColor  = isDrive  ? '#DC2626' : '#2563EB';

      return `<div style="background:${cardBg};border:1px solid ${bordColor};border-left:${bordLeft};border-radius:10px;padding:14px 16px;margin-bottom:7px;cursor:pointer"
        onclick="selecionarPedidoFilaMobile('${p.numero_pedido}')">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px;flex-wrap:wrap">
              <span style="font-family:'Space Mono',monospace;font-size:15px;font-weight:700;color:${numColor}">${p.numero_pedido}</span>
              ${isDrive ? `<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px;background:#FEF2F2;color:#DC2626;border:1px solid #FECACA">DRIVE THRU</span>` : ''}
            </div>
            <div style="font-size:11px;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:${temFalta?'5px':'0'}">${p.cliente||'—'}</div>
            ${p.transportadora ? `<div style="font-size:10px;font-weight:600;color:#6366f1;margin-top:2px">${p.transportadora}</div>` : ""}
            ${temFalta ? `<div style="display:inline-flex;align-items:center;gap:5px;background:#FEF3C7;border:1px solid #FDE68A;border-radius:6px;padding:4px 9px;">
              <div style="width:6px;height:6px;border-radius:50%;background:#D97706;flex-shrink:0;"></div>
              <span style="font-size:11px;font-weight:500;color:#92400E;">${qtdFalta} item${qtdFalta>1?'s':''} aguardando repositor</span>
            </div>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:14px;font-weight:700;color:#0F172A">${p.itens||0}</div>
            <div style="font-size:9px;color:#94A3B8;letter-spacing:1px;text-transform:uppercase">itens</div>
          </div>
        </div>
      </div>`;
    }).join('');
  } catch(e) {}
}




function selecionarPedidoFilaMobile(num) {
  // Reseta estado do pedido anterior antes de iniciar novo
  caixaJaVinculada = false;
  const caixaInp = document.getElementById('m-input-caixa');
  const caixaSt  = document.getElementById('m-caixa-status');
  if (caixaInp) caixaInp.value = '';
  if (caixaSt)  { caixaSt.style.display = 'none'; caixaSt.innerHTML = ''; }
  // Esconde placeholder se existir
  const ph = document.getElementById('m-cl-wrap-placeholder');
  if (ph) ph.style.display = 'none';
  mudarTabSep('separar');
  document.getElementById('m-input-pedido').value = num;
  confirmarPedidoMobile();
}




async function carregarStatsMobile() {
  try {
    const nomeEl = document.getElementById('m-stat-nome');
    if (nomeEl) nomeEl.textContent = `👤 ${usuarioAtual?.nome || '—'}`;
    // Tenta com separadorAtual, senão usa /stats/meus
    let dados = [];
    if (separadorAtual) {
      const res = await fetch(`${API}/produtividade?separador_id=${separadorAtual.id}`, { credentials:'include' });
      dados = await res.json();
    } else {
      const res = await fetch(`${API}/stats/meus`, { credentials:'include' });
      const d = await res.json();
      if (d.separacao) dados = [{
        hoje: d.separacao.separados_hoje||0,
        mes: d.separacao.separados_hoje||0,
        total_ano: d.separacao.separados_total||0
      }];
    }
    if (false) { const res = null;
    const dados = await res.json();
    if (nomeEl) nomeEl.textContent = `👤 ${separadorAtual.nome||usuarioAtual.nome}`;
    if (dados.length) {
      document.getElementById('m-stat-hoje').textContent = dados[0].hoje||0;
      document.getElementById('m-stat-mes').textContent  = dados[0].mes||0;
      document.getElementById('m-stat-ano').textContent  = dados[0].total_ano||0;
    }
    }
  } catch(e) {}
}




/* ══════════════════════════════════════════
   CORE COMPARTILHADO (desktop + mobile)
══════════════════════════════════════════ */
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
    const statusEl = document.getElementById(statusId);
    // Busca info de transportadora/cliente
    let infoTransp = '';
    try {
      const tRes = await fetch(`${API}/pedidos/info/${encodeURIComponent(num)}`, { credentials:'include' });
      if (tRes.ok) {
        const tData = await tRes.json();
        if (tData.cliente || tData.transportadora) {
          infoTransp = `<div style="margin-top:6px;padding:8px 10px;background:rgba(37,99,235,.06);border:1px solid rgba(37,99,235,.18);border-radius:8px;font-size:12px">
            ${tData.cliente ? `<div>👤 <b style="color:var(--text)">${tData.cliente}</b></div>` : ''}
            ${tData.transportadora ? `<div>🚚 <b style="color:var(--accent)">${tData.transportadora}</b></div>` : ''}
          </div>`;
        }
      }
    } catch(e) {}
    if (statusEl) { 
      statusEl.innerHTML = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:${infoTransp?'8px':'0'}"><span style="width:8px;height:8px;background:var(--accent);border-radius:50%;flex-shrink:0;display:inline-block"></span><span style="font-size:13px;color:#475569">Pedido <b style="color:#0F172A;font-family:'Space Mono',monospace">${num}</b> — <span style="font-weight:700;color:var(--accent)">Em separação</span></span></div>${infoTransp}`; 
      statusEl.style.display = 'block'; 
    }
    // Drive Thru — destaque vermelho no info card
    const isDrive = (infoTransp||'').toUpperCase().includes('DRIVE');
    if (statusEl && isDrive) {
      statusEl.style.borderLeftColor = 'var(--red)';
    }
    toast(data.ja_atribuido ? `Pedido ${num} carregado` : `Pedido ${num} iniciado`, 'info');

    const clWrap = document.getElementById(clWrapId);
    let phId = clWrapId + '-placeholder';
    let ph = document.getElementById(phId);
    if (!ph) {
      ph = document.createElement('div');
      ph.id = phId;
      clWrap?.parentNode?.insertBefore(ph, clWrap?.nextSibling || clWrap);
    }

    if (data.caixa_vinculada) {
      // Pedido já tinha caixa — libera direto e mostra caixa vinculada
      caixaJaVinculada = true;
      mostrarCampoCaixa(true);
      ph.style.display = 'none';
      // REMOVIDO: nao abre checklist automaticamente quando caixa ja vinculada
      // Busca e exibe o número da caixa já vinculada
      try {
        const rCaixa = await fetch(`${API}/pedidos/info/${encodeURIComponent(num)}`, { credentials:'include' });
        if (rCaixa.ok) {
          const dCaixa = await rCaixa.json();
          if (dCaixa.numero_caixa) {
            const inpMob = document.getElementById('m-input-caixa');
            const inpDesk = document.getElementById('cl-input-caixa');
            const stMob  = document.getElementById('m-caixa-status');
            const stDesk = document.getElementById('cl-caixa-status');
            if (inpMob)  inpMob.value  = dCaixa.numero_caixa;
            if (inpDesk) inpDesk.value = dCaixa.numero_caixa;
            const msg = `<span style="color:var(--green);font-weight:600">✅ Caixa <b>${dCaixa.numero_caixa}</b> já vinculada</span>`;
            if (stMob)  { stMob.style.display='block';  stMob.innerHTML = msg; }
            if (stDesk) { stDesk.style.display='block'; stDesk.innerHTML = msg; }
          }
        }
      } catch(e) {}
      await fnChecklist();
    } else {
      // Exige caixa antes de mostrar itens
      caixaJaVinculada = false;
      mostrarCampoCaixa(true);
      if (clWrap) clWrap.style.display = 'none';
      ph.style.display = 'block';
      ph.innerHTML = `<div style="background:var(--surface);border:1.5px solid #FECACA;border-radius:10px;text-align:center;padding:28px 20px;">
        <div style="width:44px;height:44px;border-radius:50%;background:#FEF2F2;border:1.5px solid #FECACA;display:flex;align-items:center;justify-content:center;margin:0 auto 10px;font-size:20px;">📦</div>
        <div style="font-size:13px;font-weight:700;color:#B91C1C;margin-bottom:4px;">Vincule a caixa para iniciar</div>
        <div style="font-size:11px;color:#94A3B8;">A lista de itens só aparece após vincular o número da caixa</div>
      </div>`;
    }
    fnFila();
  } catch(e) { toast('Erro ao conectar!','erro'); }
}




async function _concluirCore(prefix, fnChecklist, fnFila, fnStats, inputId, statusId) {
  if (!pedidoAtualId) return;
  try {
    const res  = await fetch(`${API}/pedidos/${pedidoAtualId}/concluir`, { credentials:'include', method:'PUT' });
    const data = await res.json();
    if (data.aguardando) { toast('⏳ Ainda aguardando o repositor!','aviso'); return; }
    if (data.bloqueado)  { toast('⛔ Bloqueado! Aguarde o supervisor liberar.','erro'); return; }
    if (data.erro)       { toast(`⚠️ ${data.erro}`,'aviso'); return; }
    toast(`Pedido ${pedidoAtualNum} concluído`, 'sucesso');
    const wrap = document.getElementById(`${prefix}-wrap`);
    if (wrap) wrap.style.display = 'none';
    const statusEl = document.getElementById(statusId);
    if (statusEl) statusEl.style.display = 'none';
    document.getElementById(inputId).value = '';
    // Limpa campos de caixa
    const caixaDesktop = document.getElementById('cl-input-caixa');
    const caixaMobile  = document.getElementById('m-input-caixa');
    const caixaStD = document.getElementById('cl-caixa-status');
    const caixaStM = document.getElementById('m-caixa-status');
    if (caixaDesktop) caixaDesktop.value = '';
    if (caixaMobile)  caixaMobile.value  = '';
    if (caixaStD) { caixaStD.style.display = 'none'; caixaStD.innerHTML = ''; }
    if (caixaStM) { caixaStM.style.display = 'none'; caixaStM.innerHTML = ''; }
    // Esconde placeholders
    ['m-cl-wrap-placeholder','cl-wrap-placeholder'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    mostrarCampoCaixa(false);
    // RESET: obriga vincular caixa no próximo pedido
    caixaJaVinculada = false;
    pedidoAtualId=null; pedidoAtualNum=null; itensAtuais=[];
    fnFila(); fnStats();
    setTimeout(() => document.getElementById(inputId).focus(), 300);
  } catch(e) { toast('Erro ao concluir!','erro'); }
}




/* ══════════════════════════════════════════
   RENDER CHECKLIST (compartilhado)
══════════════════════════════════════════ */
function renderChecklist(prefix) {
  const RUAS_ORD = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
  const total       = itensAtuais.length;
  const verificados = itensAtuais.filter(i=>i.status!=='pendente').length;
  const encontrados = itensAtuais.filter(i=>i.status==='encontrado').length;
  const faltas      = itensAtuais.filter(i=>i.status==='falta').length;
  const parciais    = itensAtuais.filter(i=>i.status==='parcial').length;
  const pct         = total>0 ? Math.round((verificados/total)*100) : 0;
  const todosVerif  = verificados===total;
  const temProblema = faltas>0 || parciais>0;

  // Extrai rua do endereço
  const getRua = (end) => String(end||'').split(',')[0].trim().match(/^([A-Z]+)/)?.[1] || '?';

  // Ruas únicas neste pedido, na ordem do corredor
  const ruasNoPedido = [...new Set(itensAtuais.map(i=>getRua(i.endereco)))]
    .sort((a,b)=>RUAS_ORD.indexOf(a)-RUAS_ORD.indexOf(b));

  // Rua atual = primeira rua com itens pendentes
  const primeirosPendentes = itensAtuais.filter(i=>i.status==='pendente');
  const ruaEmFoco = primeirosPendentes.length ? getRua(primeirosPendentes[0].endereco) : '';

  const tituloEl = document.getElementById(`${prefix}-titulo`);
  const contEl   = document.getElementById(`${prefix}-contador`);
  const barraEl  = document.getElementById(`${prefix}-barra`);
  const resumoEl = document.getElementById(`${prefix}-resumo`);

  if(tituloEl) tituloEl.textContent = `PEDIDO #${pedidoAtualNum}`;
  if(contEl)   contEl.textContent   = `${verificados}/${total} itens`;
  if(barraEl)  barraEl.style.width  = `${pct}%`;

  // Rota no resumo — pills de rua com destaque na atual
  if(resumoEl) {
    resumoEl.innerHTML = ruasNoPedido.map(r => {
      const ruaOk = itensAtuais.filter(i=>getRua(i.endereco)===r).every(i=>i.status!=='pendente');
      const ativo = r === ruaEmFoco;
      const bg  = ativo?'#185FA5':ruaOk?'#EAF3DE':'#F1F5F9';
      const cor = ativo?'#fff':ruaOk?'#27500A':'#64748B';
      const bord= ativo?'#185FA5':ruaOk?'#97C459':'#CBD5E1';
      return `<span style="display:inline-block;font-size:11px;font-weight:500;padding:2px 9px;border-radius:20px;background:${bg};color:${cor};border:1px solid ${bord};margin:2px 2px 2px 0;">${r}</span>`;
    }).join('');
  }




  const btnC = document.getElementById(`${prefix.replace('cl','btn-concluir').replace('m-cl','m-btn-concluir')}`);
  const btnA = document.getElementById(`${prefix.replace('cl','btn-aguardar').replace('m-cl','m-btn-aguardar')}`);
  // Map prefix to btn ids
  const bcId = prefix === 'cl' ? 'btn-concluir' : 'm-btn-concluir';
  const baId = prefix === 'cl' ? 'btn-aguardar' : 'm-btn-aguardar';
  const bc = document.getElementById(bcId);
  const ba = document.getElementById(baId);




  // Verifica se caixa foi vinculada
  const inputCaixa = document.getElementById(prefix === 'cl' ? 'cl-input-caixa' : 'm-input-caixa');
  const statusCaixaEl = document.getElementById(prefix === 'cl' ? 'cl-caixa-status' : 'm-caixa-status');
  const caixaVinculada = statusCaixaEl && statusCaixaEl.style.display !== 'none' && statusCaixaEl.textContent.includes('✅');

  if (!todosVerif) {
    if(bc){bc.style.display='block';bc.disabled=true;bc.textContent=`🔒 CONCLUIR (${total-verificados} pend.)`}
    if(ba) ba.style.display='none';
  } else if (!caixaVinculada && pedidoAtualId) {
    if(bc){bc.style.display='block';bc.disabled=true;bc.textContent='📦 VINCULE A CAIXA ANTES DE CONCLUIR'}
    if(ba) ba.style.display='none';
  } else if (temProblema) {
    const itensP = itensAtuais.filter(i=>i.status==='falta'||i.status==='parcial');
    // Status que liberam o concluir: encontrado, subiu, abastecido
    const statusOk = ['encontrado','reposto','subiu','abastecido'];
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
  const isMob = prefix.startsWith('m-') || document.body.classList.contains('sep-mobile');
  listEl.innerHTML = itensAtuais.map(item => {
    const icones = { pendente:'⬜', encontrado:'✅', falta:'❌', parcial:'🟡' };
    const v = item.status !== 'pendente';
    const fnVerif  = isMob ? 'verificarItemMobile' : 'verificarItemDesktop';
    const fnToggle = isMob ? 'toggleParcialMobile'  : 'toggleParcialDesktop';
    const fnParcOk = isMob ? 'confirmarParcialMobile' : 'confirmarParcialDesktop';




    if (isMob) {
      // Agrupamento por rua — injeta header antes do primeiro item de cada rua
      const itemRua = getRua ? getRua(item.endereco) : String(item.endereco||'').split(',')[0].trim().match(/^([A-Z]+)/)?.[1]||'?';
      const idxNoGrupo = itensAtuais.filter(i2 => {
        const r2 = String(i2.endereco||'').split(',')[0].trim().match(/^([A-Z]+)/)?.[1]||'?';
        return r2 === itemRua;
      }).indexOf(item);
      const grupoOk = itensAtuais.filter(i2=>{
        const r2=String(i2.endereco||'').split(',')[0].trim().match(/^([A-Z]+)/)?.[1]||'?';
        return r2===itemRua;
      }).every(i2=>i2.status!=='pendente');
      const grupoAlgum = itensAtuais.filter(i2=>{
        const r2=String(i2.endereco||'').split(',')[0].trim().match(/^([A-Z]+)/)?.[1]||'?';
        return r2===itemRua;
      }).some(i2=>i2.status!=='pendente');
      const grupoCount = itensAtuais.filter(i2=>{
        const r2=String(i2.endereco||'').split(',')[0].trim().match(/^([A-Z]+)/)?.[1]||'?';
        return r2===itemRua;
      });
      const headerHtml = idxNoGrupo === 0 ? `<div style="display:flex;align-items:center;gap:8px;padding:8px 4px 4px;margin-top:${listEl.innerHTML?'8px':'0'}">
        <div style="width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:500;
          background:${grupoOk?'#EAF3DE':grupoAlgum?'#FAEEDA':'#F1F5F9'};
          color:${grupoOk?'#27500A':grupoAlgum?'#633806':'#475569'};
          border:1px solid ${grupoOk?'#97C459':grupoAlgum?'#EF9F27':'#CBD5E1'};">${itemRua}</div>
        <span style="font-size:11px;color:#94A3B8;">${grupoCount.filter(i2=>i2.status!=='pendente').length} / ${grupoCount.length} coletados</span>
      </div>` : '';

      // Estado visual do card
      const cardBg = item.status==='encontrado'?'#F8FFFE':item.status==='falta'?'#FFF8F8':item.status==='parcial'?'#FFFCF0':'var(--surface)';
      const cardBord = item.status==='encontrado'?'#C6F6D5':item.status==='falta'?'#FED7D7':item.status==='parcial'?'#FEF08A':'var(--border)';
      const cardAccent = item.status==='encontrado'?'var(--green)':item.status==='falta'?'var(--red)':item.status==='parcial'?'var(--amber)':'var(--border)';
      const statusLabel = item.status==='encontrado'?'COLETADO':item.status==='falta'?'FALTA':item.status==='parcial'?'PARCIAL':'PENDENTE';
      const avisoStatus = item.aviso_status||'';
      return headerHtml + `<div id="${prefix}-ic-${item.id}" style="background:${cardBg};border:1px solid ${cardBord};border-left:4px solid ${cardAccent};border-radius:10px;padding:14px;margin-bottom:6px;margin-left:8px">
        <!-- Linha 1: Código + Endereço + Status badge -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">
          <div style="flex:1;min-width:0">
            <div style="font-family:'Space Mono',monospace;font-size:16px;font-weight:700;color:#0F172A;letter-spacing:-.3px;margin-bottom:3px">${item.codigo||'—'}</div>
            <div style="font-size:15px;font-weight:700;color:#0F172A;letter-spacing:.5px">${item.endereco||'—'}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;margin-left:10px">
            ${item.status!=='pendente'?`<span style="font-size:9px;font-weight:800;letter-spacing:1.5px;padding:3px 8px;border-radius:4px;background:${cardAccent};color:#fff">${statusLabel}</span>`:''}
            <span style="font-family:'Space Mono',monospace;font-size:28px;font-weight:800;color:#0F172A;line-height:1">×${item.quantidade||1}</span>
          </div>
        </div>
        <!-- Linha 2: Descrição -->
        <div style="font-size:12px;color:#475569;line-height:1.4;margin-bottom:10px">${item.descricao||'—'}</div>
        <!-- Avisos repositor -->
        ${item.status==='falta'?`<div style="font-size:11px;font-weight:600;color:var(--red);margin-bottom:8px;padding:5px 8px;background:#FEF2F2;border-radius:5px">Repositor notificado — aguardando reposição</div>`:``}
        ${item.status==='parcial'?`<div style="font-size:11px;font-weight:600;color:var(--amber);margin-bottom:8px;padding:5px 8px;background:#FFFBEB;border-radius:5px">${item.obs||'Parcial'} — repositor notificado</div>`:``}
        ${(item.status==='falta'||item.status==='parcial')&&avisoStatus==='reposto'?`<div style="font-size:11px;font-weight:600;color:var(--green);margin-bottom:8px;padding:5px 8px;background:#F0FDF4;border-radius:5px">Repositor confirmou reposição</div>`:``}
        ${(item.status==='falta'||item.status==='parcial')&&avisoStatus==='nao_encontrado'?`<div style="font-size:11px;font-weight:600;color:var(--indigo);margin-bottom:8px;padding:5px 8px;background:#F5F3FF;border-radius:5px">Repositor: item não localizado</div>`:``}
        ${item.hora_verificado?`<div style="font-size:10px;color:#94A3B8;margin-bottom:8px">Verificado às ${item.hora_verificado}</div>`:''}
        <!-- Campo parcial -->
        <div class="parcial-wrap" id="${prefix}-pw-${item.id}" style="margin-bottom:8px">
          <label style="font-size:11px;color:var(--amber);font-weight:700">Qtde encontrada (de ${item.quantidade||1}):</label>
          <div class="parcial-row">
            <input type="number" class="parcial-input" id="${prefix}-pi-${item.id}" min="0" max="${(item.quantidade||1)-1}" placeholder="0" inputmode="numeric"/>
            <button class="btn-parc-ok" onclick="${fnParcOk}(${item.id},${item.quantidade||1},'${prefix}')">OK</button>
          </div>
        </div>
        <!-- Botões EMBAIXO — layout horizontal de 3 -->
        ${!v?`<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:4px">
          <button onclick="${fnVerif}(${item.id},'encontrado','${prefix}')"
            style="padding:12px 0;border:1.5px solid #C6F6D5;border-radius:8px;background:#F0FDF4;color:#15803D;font-size:12px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;letter-spacing:.3px">
            COLETADO
          </button>
          <button onclick="${fnToggle}(${item.id},'${prefix}')"
            style="padding:12px 0;border:1.5px solid #FEF08A;border-radius:8px;background:#FFFBEB;color:#92400E;font-size:12px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;letter-spacing:.3px">
            PARCIAL
          </button>
          <button onclick="${fnVerif}(${item.id},'falta','${prefix}')"
            style="padding:12px 0;border:1.5px solid #FED7D7;border-radius:8px;background:#FEF2F2;color:#B91C1C;font-size:12px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;letter-spacing:.3px">
            FALTA
          </button>
        </div>`:`<div style="font-size:11px;color:#94A3B8;text-align:center;padding:6px 0">Item verificado</div>`}
      </div>`;
    }




    // Layout desktop — redesenhado
    const avisoSt = item.aviso_status||'';
    const dCardBord = item.status==='encontrado'?'#C6F6D5':item.status==='falta'?'#FED7D7':item.status==='parcial'?'#FEF08A':'var(--border)';
    const dCardLeft = item.status==='encontrado'?'var(--green)':item.status==='falta'?'var(--red)':item.status==='parcial'?'var(--amber)':'var(--border)';
    const dCardBg = item.status==='encontrado'?'#FAFFFE':item.status==='falta'?'#FFFAFA':item.status==='parcial'?'#FFFDFA':'var(--surface)';
    return `<div id="${prefix}-ic-${item.id}" style="background:${dCardBg};border:1px solid ${dCardBord};border-left:3px solid ${dCardLeft};border-radius:9px;padding:12px 14px;margin-bottom:7px;display:flex;align-items:center;gap:14px">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
          <span style="font-family:'Space Mono',monospace;font-size:13px;font-weight:700;color:#0F172A">${item.codigo||'—'}</span>
          <span style="font-size:12px;font-weight:700;color:#0F172A;background:var(--surface2);padding:2px 8px;border-radius:5px;border:1px solid var(--border)">${item.endereco||'—'}</span>
          <span style="font-family:'Space Mono',monospace;font-size:13px;font-weight:700;color:#0F172A;background:var(--surface2);padding:2px 8px;border-radius:5px;border:1px solid var(--border)">×${item.quantidade||1}</span>
          ${item.hora_verificado?`<span style="font-size:10px;color:#94A3B8">${item.hora_verificado}</span>`:''}
        </div>
        <div style="font-size:12px;color:#475569;line-height:1.35">${item.descricao||'—'}</div>
        ${item.status==='falta'?`<div style="font-size:11px;color:var(--red);font-weight:600;margin-top:4px">Repositor notificado — aguardando reposição</div>`:''}
        ${item.status==='parcial'?`<div style="font-size:11px;color:var(--amber);font-weight:600;margin-top:4px">${item.obs||'Parcial'} — repositor notificado</div>`:''}
        ${(item.status==='falta'||item.status==='parcial')&&avisoSt==='reposto'?`<div style="font-size:11px;color:var(--green);font-weight:600;margin-top:4px">Repositor confirmou reposição</div>`:''}
        ${(item.status==='falta'||item.status==='parcial')&&avisoSt==='nao_encontrado'?`<div style="font-size:11px;color:var(--indigo);font-weight:600;margin-top:4px">Repositor: item não localizado</div>`:''}
        <div class="parcial-wrap" id="${prefix}-pw-${item.id}" style="margin-top:8px">
          <label>Qtde encontrada (de ${item.quantidade||1}):</label>
          <div class="parcial-row">
            <input type="number" class="parcial-input" id="${prefix}-pi-${item.id}" min="0" max="${(item.quantidade||1)-1}" placeholder="0" inputmode="numeric"/>
            <button class="btn-parc-ok" onclick="${fnParcOk}(${item.id},${item.quantidade||1},'${prefix}')">OK</button>
          </div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0">
        <button style="width:80px;padding:8px 0;border:1px solid ${v?'var(--border)':'#C6F6D5'};border-radius:7px;background:${v?'var(--surface2)':'#F0FDF4'};color:${v?'var(--text3)':'#15803D'};font-size:11px;font-weight:700;cursor:${v?'not-allowed':'pointer'};font-family:'DM Sans',sans-serif;letter-spacing:.5px" ${v?'disabled':''} onclick="${fnVerif}(${item.id},'encontrado','${prefix}')">COLETADO</button>
        <button style="width:80px;padding:8px 0;border:1px solid ${v?'var(--border)':'#FEF08A'};border-radius:7px;background:${v?'var(--surface2)':'#FFFBEB'};color:${v?'var(--text3)':'#92400E'};font-size:11px;font-weight:700;cursor:${v?'not-allowed':'pointer'};font-family:'DM Sans',sans-serif;letter-spacing:.5px" ${v?'disabled':''} onclick="${fnToggle}(${item.id},'${prefix}')">PARCIAL</button>
        <button style="width:80px;padding:8px 0;border:1px solid ${v?'var(--border)':'#FED7D7'};border-radius:7px;background:${v?'var(--surface2)':'#FEF2F2'};color:${v?'var(--text3)':'#B91C1C'};font-size:11px;font-weight:700;cursor:${v?'not-allowed':'pointer'};font-family:'DM Sans',sans-serif;letter-spacing:.5px" ${v?'disabled':''} onclick="${fnVerif}(${item.id},'falta','${prefix}')">FALTA</button>
      </div>
    </div>`;
  }).join('');
}




/* Wrappers verificar/parcial para desktop e mobile */
function verificarItemDesktop(id,status,prefix){ verificarItem(id,status,''  ,0,prefix,'cl'); }
function verificarItemMobile (id,status,prefix){ verificarItem(id,status,''  ,0,prefix,'m-cl'); }
function toggleParcialDesktop(id,prefix){ toggleParcial(id,prefix); }
function toggleParcialMobile (id,prefix){ toggleParcial(id,prefix); }
function confirmarParcialDesktop(id,qtd,prefix){ confirmarParcial(id,qtd,prefix,'cl'); }
function confirmarParcialMobile (id,qtd,prefix){ confirmarParcial(id,qtd,prefix,'m-cl'); }




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
    if (status==='falta')     toast('❌ Falta — repositor avisado!','aviso');
    if (status==='parcial')   toast('🟡 Parcial — repositor avisado!','aviso');
    // sem toast para encontrado — evita poluição visual
    renderChecklist(renderPrefix);
  } catch(e) { toast('Erro ao verificar item!','erro'); }
}




/* ══════════════════════════════════════════
   VINCULAR CAIXA — SEPARADOR
══════════════════════════════════════════ */
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
    toast(`Caixa ${caixa} vinculada`, 'sucesso');
    const statusEl = document.getElementById(inputStatusId);
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.innerHTML = `<span style="color:var(--green);font-weight:600">✅ Caixa <b>${caixa}</b> vinculada — Pedido #${pedidoAtualNum}</span>`;
    }
    // Esconde placeholder e mostra checklist real
    caixaJaVinculada = true;
    // Esconde placeholder se existir
    ['m-cl-wrap-placeholder','cl-wrap-placeholder'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    const isMobileNow = window.innerWidth <= 768;
    if (isMobileNow) {
      const wrap = document.getElementById('m-cl-wrap');
      if (wrap) wrap.style.display = 'block';
      await carregarChecklistMobile();
    } else {
      const wrap = document.getElementById('cl-wrap');
      if (wrap) wrap.style.display = 'block';
      await carregarChecklist();
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




// Mostra campo caixa quando pedido é carregado
function mostrarCampoCaixa(show) {
  const d = document.getElementById('cl-caixa-wrap');
  const m = document.getElementById('m-caixa-wrap');
  if (d) d.style.display = show ? 'block' : 'none';
  if (m) m.style.display = show ? 'block' : 'none';
}




/* Eventos caixa */
document.getElementById('cl-input-caixa')?.addEventListener('keypress', e => { if(e.key==='Enter') vincularCaixaDesktop(); });
document.getElementById('m-input-caixa')?.addEventListener('keypress', e => { if(e.key==='Enter') vincularCaixaMobile(); });
document.getElementById('ck-input-caixa')?.addEventListener('keypress', e => { if(e.key==='Enter') buscarCaixa(); });




/* Datas padrão estatísticas */
(function() {
  const ini = document.getElementById('est-ini');
  const fim = document.getElementById('est-fim');
  if (ini) ini.value = hoje;
  if (fim) fim.value = hoje;
})();
(async function verificarSessao() {
  try {
    const res  = await fetch(`${API}/auth/me`, { credentials:'include' });
    if (!res.ok) return;
    const data = await res.json();
    usuarioAtual      = data.usuario;
    separadorAtual    = data.separador;
    perfilSelecionado = data.usuario.perfil;
    ativarApp();
  } catch(e) {}
})();

async function carregarMeusStats() {
  try {
    const res = await fetch(`${API}/stats/meus`, { credentials:'include' });
    if (!res.ok) return;
    const d = await res.json();
    const el = document.getElementById('m-meus-stats');
    if (!el) return;

    if (d.perfil === 'separador' && d.separacao) {
      el.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:12px 0">
          <div style="text-align:center;background:#eff6ff;border-radius:10px;padding:12px 8px">
            <div style="font-size:26px;font-weight:800;color:#2563eb">${d.separacao.separados_hoje||0}</div>
            <div style="font-size:9px;color:#2563eb;text-transform:uppercase;letter-spacing:1px">Hoje</div>
          </div>
          <div style="text-align:center;background:#f0fdf4;border-radius:10px;padding:12px 8px">
            <div style="font-size:26px;font-weight:800;color:#16a34a">${d.separacao.total_hoje||0}</div>
            <div style="font-size:9px;color:#16a34a;text-transform:uppercase;letter-spacing:1px">Recebidos</div>
          </div>
          <div style="text-align:center;background:var(--surface2);border-radius:10px;padding:12px 8px">
            <div style="font-size:26px;font-weight:800;color:var(--text)">${d.separacao.separados_total||0}</div>
            <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Total</div>
          </div>
        </div>`;
    } else if (d.perfil === 'repositor' && d.reposicao) {
      el.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;padding:12px 0">
          <div style="text-align:center;background:#f0fdf4;border-radius:10px;padding:10px 6px">
            <div style="font-size:22px;font-weight:800;color:#16a34a">${d.reposicao.resolvidos_hoje||0}</div>
            <div style="font-size:9px;color:#16a34a;text-transform:uppercase;letter-spacing:.5px">Resolvidas</div>
          </div>
          <div style="text-align:center;background:#fef2f2;border-radius:10px;padding:10px 6px">
            <div style="font-size:22px;font-weight:800;color:#dc2626">${d.reposicao.nao_encontrados_hoje||0}</div>
            <div style="font-size:9px;color:#dc2626;text-transform:uppercase;letter-spacing:.5px">Nao encon.</div>
          </div>
          <div style="text-align:center;background:#fefce8;border-radius:10px;padding:10px 6px">
            <div style="font-size:22px;font-weight:800;color:#ca8a04">${d.reposicao.pendentes_hoje||0}</div>
            <div style="font-size:9px;color:#ca8a04;text-transform:uppercase;letter-spacing:.5px">Pendentes</div>
          </div>
          <div style="text-align:center;background:var(--surface2);border-radius:10px;padding:10px 6px">
            <div style="font-size:22px;font-weight:800;color:var(--text)">${d.reposicao.avisos_hoje||0}</div>
            <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Total</div>
          </div>
        </div>`;
    } else if (d.perfil === 'checkout' && d.checkout) {
      el.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:12px 0">
          <div style="text-align:center;background:#f5f3ff;border-radius:10px;padding:12px 8px">
            <div style="font-size:26px;font-weight:800;color:#7c3aed">${d.checkout.expedidos_hoje||0}</div>
            <div style="font-size:9px;color:#7c3aed;text-transform:uppercase;letter-spacing:1px">Expedidas</div>
          </div>
          <div style="text-align:center;background:var(--surface2);border-radius:10px;padding:12px 8px">
            <div style="font-size:26px;font-weight:800;color:var(--text)">${d.checkout.total_hoje||0}</div>
            <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Recebidas</div>
          </div>
          <div style="text-align:center;background:#fefce8;border-radius:10px;padding:12px 8px">
            <div style="font-size:26px;font-weight:800;color:#ca8a04">${d.checkout.pendentes||0}</div>
            <div style="font-size:9px;color:#ca8a04;text-transform:uppercase;letter-spacing:1px">Pendentes</div>
          </div>
        </div>`;
    }
  } catch(e) {}
}
