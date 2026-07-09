﻿/* ══════════════════════════════════════════
   MOBILE CHECKOUT
══════════════════════════════════════════ */
function ativarMobileCk() {
  document.body.classList.add('ck-mobile');
  document.getElementById('ck-mobile-root').style.display = 'flex';
  document.getElementById('ck-tabbar').style.display = 'flex';
  mudarTabCk('fila');
}

function mudarTabCk(tab) {
  ['fila','busca','feitos','aguardando'].forEach(t => {
    const page = document.getElementById(`ck-tab-${t}`);
    const btn  = document.getElementById(`cktab-${t}`);
    if (page) page.classList.toggle('ativa', t === tab);
    if (btn)  btn.classList.toggle('ativo', t === tab);
  });
  if (tab === 'fila')       carregarFilaCkMobile();
  if (tab === 'feitos')     carregarFeitosCkMobile();
  if (tab === 'aguardando') carregarAguardandoCkMobile();
}

/* ── Estado dos itens marcados como faltando (por checkout_id) ──── */
let _ckItensFalta = {}; // { [ckId]: [{codigo,descricao,quantidade}, ...] }

let _ckFilaPedidos = [];

/* Inicia checkout a partir da fila: preenche input na aba CHECKOUT + busca automaticamente */
function iniciarCkMobile(numero) {
  const inp = document.getElementById('m-ck-input-caixa');
  if (inp) inp.value = numero;
  mudarTabCk('busca');
  setTimeout(() => buscarCaixaMobile(), 250);
}

function escanearQrFila() {
  escanearQr('m-ck-input-caixa', function() {
    const num = document.getElementById('m-ck-input-caixa')?.value?.trim();
    if (num) iniciarCkMobile(num);
  });
}

async function carregarFilaCkMobile() {
  const el = document.getElementById('m-ck-fila-lista');
  const badge = document.getElementById('cktab-fila-badge');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:24px;font-size:13px">🔄 Carregando...</div>';
  try {
    const hoje = new Date().toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}).split('/').reverse().join('-');
    const [resPedidos, resAguardando] = await Promise.all([
      fetch(`${API}/pedidos?status=concluido&data=${hoje}`, { credentials:'include' }),
      fetch(`${API}/checkout/aguardando`, { credentials:'include' })
    ]);
    const pedidos    = resPedidos.ok    ? await resPedidos.json()    : [];
    const aguardando = resAguardando.ok ? await resAguardando.json() : [];
    // IDs de pedidos que estão na fila de aguardando_item (não devem aparecer na fila normal)
    const aguardandoIds = new Set(aguardando.map(a => String(a.numero_pedido)));
    const fila = pedidos.filter(p =>
      (!p.status_embalagem || p.status_embalagem === 'nao_iniciado') &&
      !aguardandoIds.has(String(p.numero_pedido))
    );
    _ckFilaPedidos = fila;
    if (badge) {
      badge.textContent = fila.length;
      badge.style.display = fila.length > 0 ? 'inline' : 'none';
    }
    _renderFilaCkMobile(fila);
  } catch(e) {
    if (el) el.innerHTML = '<div style="color:var(--red);padding:20px;text-align:center">Erro ao carregar fila</div>';
  }
}

function _renderFilaCkMobile(fila) {
  const el = document.getElementById('m-ck-fila-lista');
  if (!el) return;
  if (!fila.length) {
    el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:32px;font-size:13px">✅ Nenhum pedido aguardando checkout</div>';
    return;
  }
  el.innerHTML = fila.map(p => {
    const temFalta = p.itens_em_falta > 0;
    const bordaCor = temFalta ? '#f97316' : 'var(--border)';
    return `
    <div data-pedido="${p.numero_pedido}" style="border:1.5px solid ${bordaCor};border-radius:12px;padding:12px 14px;margin-bottom:8px;background:var(--surface)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="font-size:20px;font-weight:800;color:var(--accent);font-family:'Space Mono',monospace">#${p.numero_pedido}</div>
        <span class="pill pendente" style="font-size:10px">aguardando ck</span>
      </div>
      <div style="display:flex;gap:12px;font-size:12px;color:var(--text2)">
        <span>📦 <b style="color:var(--text)">${p.itens||0} itens</b></span>
        <span>👤 ${p.separador_nome||'—'}</span>
        ${p.numero_caixa ? `<span>📦 Cx: <b style="color:var(--indigo)">${p.numero_caixa}</b></span>` : ''}
      </div>
      ${temFalta ? `<div style="margin-top:6px;background:#fff7ed;border:1px solid #f97316;border-radius:8px;padding:6px 10px;font-size:11px;font-weight:700;color:#c2410c">⚠️ ${p.itens_em_falta} item(s) aguardando repositor</div>` : ''}
      ${p.concluido_em ? `<div style="font-size:11px;color:var(--text3);margin-top:4px">✓ Sep às ${(p.concluido_em||'').substring(11,16)}</div>` : ''}
      <button class="btn btn-primary btn-sm" style="width:100%;margin-top:8px;padding:10px"
        onclick="iniciarCkMobile('${p.numero_caixa||p.numero_pedido||''}')">
        🏷️ Iniciar Checkout
      </button>
    </div>`;
  }).join('');
}


async function carregarFeitosCkMobile() {
  const el  = document.getElementById('m-ck-feitos-lista');
  const cnt = document.getElementById('m-ck-feitos-cnt');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:24px;font-size:13px">🔄 Carregando...</div>';
  try {
    const hoje = new Date().toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}).split('/').reverse().join('-');
    const res  = await fetch(`${API}/checkout?status=concluido&data=${hoje}`, { credentials:'include' });
    const rows = res.ok ? await res.json() : [];
    if (cnt) cnt.textContent = rows.length + ' feitos';
    if (!rows.length) {
      el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:32px;font-size:13px">Nenhum checkout concluído hoje</div>';
      return;
    }
    el.innerHTML = rows.map(r => `
      <div style="border:1.5px solid #BBF7D0;border-radius:12px;padding:12px 14px;margin-bottom:8px;background:#F0FDF4">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div style="font-size:20px;font-weight:800;color:var(--green);font-family:'Space Mono',monospace">#${r.numero_pedido||'—'}</div>
          <span style="font-size:11px;color:var(--green);font-weight:700">✅ ${r.hora_checkout||'—'}</span>
        </div>
        <div style="display:flex;gap:12px;font-size:12px;color:var(--text2)">
          <span>📦 <b style="color:var(--text)">${r.ped_itens||0} itens</b></span>
          <span>👤 ${r.separador_nome_join||r.separador_nome||'—'}</span>
          ${r.operador_nome ? `<span>🏷️ ${r.operador_nome}</span>` : ''}
        </div>
      </div>`).join('');
  } catch(e) {
    if (el) el.innerHTML = '<div style="color:var(--red);padding:20px;text-align:center">Erro ao carregar</div>';
  }
}




/* ── Fila AGUARDANDO ITEM (mobile) ──────────────────────────────── */
async function carregarAguardandoCkMobile() {
  const el    = document.getElementById('m-ck-aguardando-lista');
  const badge = document.getElementById('cktab-aguardando-badge');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:24px;font-size:13px">🔄 Carregando...</div>';
  try {
    const res  = await fetch(`${API}/checkout/aguardando`, { credentials:'include' });
    const rows = res.ok ? await res.json() : [];
    if (badge) { badge.textContent = rows.length; badge.style.display = rows.length ? 'inline' : 'none'; }
    if (!rows.length) {
      el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:32px;font-size:13px">✅ Nenhum pedido aguardando item</div>';
      return;
    }
    el.innerHTML = rows.map(r => {
      const itens = Array.isArray(r.itens_falta) ? r.itens_falta : (r.itens_falta ? JSON.parse(r.itens_falta) : []);
      return `
      <div style="border:2px solid #f97316;border-radius:12px;padding:12px 14px;margin-bottom:10px;background:#fff7ed">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div style="font-size:20px;font-weight:800;color:#c2410c;font-family:'Space Mono',monospace">#${r.numero_pedido}</div>
          <span style="background:#fed7aa;color:#c2410c;border-radius:20px;padding:3px 10px;font-size:10px;font-weight:800">⏳ AGUARDANDO</span>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:6px">
          📦 <b>${r.ped_itens||0} itens</b> &nbsp;•&nbsp; 👤 ${r.separador_nome||'—'}
          ${r.numero_caixa ? ` &nbsp;•&nbsp; 📦 Cx: <b>${r.numero_caixa}</b>` : ''}
        </div>
        ${itens.length ? `
        <div style="background:#fff;border:1px solid #fed7aa;border-radius:8px;padding:8px 10px;margin-bottom:8px">
          <div style="font-size:10px;font-weight:700;color:#c2410c;letter-spacing:.5px;margin-bottom:4px">ITENS FALTANDO</div>
          ${itens.map(it=>`<div style="font-size:12px;color:var(--text);padding:2px 0">❌ <b>${it.codigo}</b> · ${it.descricao} · x${it.quantidade}</div>`).join('')}
        </div>` : ''}
        <button onclick="retomarCheckoutMobile(${r.id})" style="width:100%;background:#f97316;color:#fff;border:none;border-radius:8px;padding:11px;font-size:13px;font-weight:700;cursor:pointer">
          ▶ Retomar Checkout
        </button>
      </div>`;
    }).join('');
  } catch(e) {
    if (el) el.innerHTML = '<div style="color:var(--red);padding:20px;text-align:center">Erro ao carregar</div>';
  }
}

async function retomarCheckoutMobile(id) {
  try {
    const res  = await fetch(`${API}/checkout/${id}/retomar`, { credentials:'include', method:'PUT' });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) { toast(data.erro||'Erro ao retomar','erro'); return; }
    toast('▶ Checkout retomado!', 'sucesso');
    const num = data.numero_caixa || data.numero_pedido || '';
    const inp = document.getElementById('m-ck-input-caixa');
    if (inp) inp.value = num;
    mudarTabCk('busca');
    setTimeout(() => buscarCaixaMobile(), 300);
  } catch(e) { toast('Erro de rede','erro'); }
}

async function registrarPendenciaMobile(id) {
  const faltando = _ckItensFalta[id] || [];
  if (!faltando.length) { toast('Marque pelo menos um item como faltando!', 'aviso'); return; }
  try {
    const res  = await fetch(`${API}/checkout/${id}/pendencia`, {
      credentials:'include', method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ itens_falta: faltando })
    });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) { toast(data.erro||'Erro','erro'); return; }
    toast('⏳ Pendência registrada! Pedido na fila de espera.', 'sucesso');
    delete _ckItensFalta[id];
    document.getElementById('m-ck-input-caixa').value = '';
    document.getElementById('m-ck-resultado').innerHTML = '';
    mudarTabCk('aguardando');
  } catch(e) { toast('Erro de rede','erro'); }
}

function marcarItemFaltandoMobile(ckId, codigo, descricao, quantidade, btn) {
  if (!_ckItensFalta[ckId]) _ckItensFalta[ckId] = [];
  const lista = _ckItensFalta[ckId];
  const idx   = lista.findIndex(i => i.codigo === codigo);
  if (idx >= 0) {
    lista.splice(idx, 1);
    btn.style.background = '#e2e8f0';
    btn.style.color      = '#64748b';
    btn.textContent      = '❌ Marcar Falta';
  } else {
    lista.push({ codigo, descricao, quantidade });
    btn.style.background = '#fee2e2';
    btn.style.color      = '#dc2626';
    btn.textContent      = '✓ Falta Marcada';
  }
  // Mostra/esconde botão de registrar pendência
  const btnPend = document.getElementById(`ck-btn-pendencia-${ckId}`);
  if (btnPend) btnPend.style.display = lista.length ? 'block' : 'none';
}

function marcarItemFaltandoDesk(ckId, codigo, descricao, quantidade, btn) {
  if (!_ckItensFalta[ckId]) _ckItensFalta[ckId] = [];
  const lista = _ckItensFalta[ckId];
  const idx   = lista.findIndex(i => i.codigo === codigo);
  if (idx >= 0) {
    lista.splice(idx, 1);
    btn.style.background = '#e2e8f0';
    btn.style.color      = '#64748b';
    btn.textContent      = '❌ Marcar Falta';
  } else {
    lista.push({ codigo, descricao, quantidade });
    btn.style.background = '#fee2e2';
    btn.style.color      = '#dc2626';
    btn.textContent      = '✓ Falta Marcada';
  }
  const btnPend = document.getElementById(`ck-btn-pendencia-desk-${ckId}`);
  if (btnPend) btnPend.style.display = lista.length ? 'inline-block' : 'none';
}

async function registrarPendenciaDesk(id) {
  const faltando = _ckItensFalta[id] || [];
  if (!faltando.length) { toast('Marque pelo menos um item como faltando!', 'aviso'); return; }
  try {
    const res = await fetch(`${API}/checkout/${id}/pendencia`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itens_falta: faltando })
    });
    if (!res.ok) throw new Error();
    delete _ckItensFalta[id];
    toast('Pendência registrada! Pedido enviado para fila de espera.', 'sucesso');
    document.getElementById('ck-input-caixa').value = '';
    document.getElementById('ck-resultado').innerHTML = '';
    if (typeof carregarFilaCk === 'function') carregarFilaCk();
  } catch { toast('Erro ao registrar pendência!', 'erro'); }
}

function _renderSessoesCk(sessoes) {
  if (!sessoes || !sessoes.length) return '';
  return `
    <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px">
      <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:1px;margin-bottom:6px">HISTÓRICO DE CHECKOUT</div>
      ${sessoes.map(s => {
        const cor  = s.acao==='concluido'?'#16a34a':s.acao==='aguardando_item'?'#f97316':s.acao==='pausado'?'#7c3aed':'#3b82f6';
        const icon = s.acao==='concluido'?'✅':s.acao==='aguardando_item'?'⏳':s.acao==='pausado'?'⏸':s.acao==='retomado'?'▶':'🔓';
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;background:var(--surface2);border-radius:6px;margin-bottom:3px;font-size:11px">
          <span style="color:var(--text2);font-weight:600">${icon} ${s.operador_nome||'—'}</span>
          <span style="color:var(--text3)">${s.hora_inicio||'—'} → ${s.hora_fim||'em andamento'}</span>
          <span style="font-weight:700;color:${cor}">${s.tempo_min > 0 ? s.tempo_min+'min' : '—'}</span>
        </div>`;
      }).join('')}
    </div>`;
}

async function pausarCheckoutMobile(id) {
  try {
    const res  = await fetch(`${API}/checkout/${id}/pausar`, { credentials:'include', method:'PUT' });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) { toast(data.erro || 'Erro ao pausar','erro'); return; }
    toast('⏸ Checkout pausado! Disponível na aba Aguardando.', 'aviso');
    document.getElementById('m-ck-input-caixa').value = '';
    document.getElementById('m-ck-resultado').innerHTML = '';
    mudarTabCk('aguardando');
  } catch(e) { toast('Erro de rede','erro'); }
}

async function pausarCheckoutDesk(id) {
  try {
    const res  = await fetch(`${API}/checkout/${id}/pausar`, { credentials:'include', method:'PUT' });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) { toast(data.erro || 'Erro ao pausar','erro'); return; }
    toast('⏸ Checkout pausado!', 'aviso');
    const inp = document.getElementById('ck-input-caixa');
    if (inp) inp.value = '';
    const wrap = document.getElementById('ck-resultado');
    if (wrap) wrap.style.display = 'none';
    if (typeof carregarFilaCk === 'function') carregarFilaCk();
    if (typeof carregarContadoresCk === 'function') carregarContadoresCk();
  } catch(e) { toast('Erro de rede','erro'); }
}

async function buscarCaixaMobile() {
  const num = document.getElementById('m-ck-input-caixa')?.value?.trim();
  if (!num) { toast('Digite o número da caixa!','aviso'); return; }
  const cont = document.getElementById('m-ck-resultado');
  if (cont) cont.innerHTML = '<div style="color:var(--text3);padding:16px;text-align:center">🔍 Buscando...</div>';
  try {
    const res  = await fetch(`${API}/checkout/caixa/${encodeURIComponent(num)}`, { credentials:'include' });
    const rows = await res.json();
    if (!rows.length) {
      if (cont) cont.innerHTML = `<div style="color:var(--text3);padding:20px;text-align:center;font-size:14px;background:var(--surface);border-radius:12px;border:1px solid var(--border)">📦 Nenhum pedido vinculado à caixa <b>${num}</b></div>`;
      return;
    }
    if (cont) cont.innerHTML = rows.map(r => {
      const concluido = r.status === 'concluido';
      const liberado  = r.status === 'liberado';
      const itensHtml = (r.itens_lista||[]).length > 0 && !concluido && !liberado
        ? `<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
            <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:1px;margin-bottom:8px">ITENS DO PEDIDO — marque os que estão faltando</div>
            ${r.itens_lista.map(it => `
              <div style="padding:8px 10px;background:var(--surface);border-radius:8px;margin-bottom:5px;border:1.5px solid ${it.status==='encontrado'?'#BBF7D0':it.status==='falta'?'#FECACA':'var(--border)'}">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <div style="flex:1;min-width:0">
                    <div style="font-size:12px;font-weight:700;color:var(--accent)">${it.codigo||'—'}</div>
                    <div style="font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${it.descricao||'—'}</div>
                    <div style="font-size:11px;color:var(--text3)">📍 ${it.endereco||'—'} &nbsp;•&nbsp; x${it.quantidade||1}</div>
                  </div>
                  <button onclick="marcarItemFaltandoMobile(${r.id},'${it.codigo}','${(it.descricao||'').replace(/'/g,"\\'")}',${it.quantidade||1},this)"
                    style="flex-shrink:0;margin-left:8px;padding:5px 10px;background:#e2e8f0;color:#64748b;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap">
                    ❌ Marcar Falta
                  </button>
                </div>
              </div>`).join('')}
          </div>` : (r.itens_lista||[]).length > 0 ? `<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
            <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:1px;margin-bottom:8px">ITENS DO PEDIDO</div>
            ${r.itens_lista.map(it=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:var(--surface);border-radius:8px;margin-bottom:4px;border:1.5px solid ${it.status==='encontrado'?'#BBF7D0':it.status==='falta'?'#FECACA':'var(--border)'}">
              <div><span style="font-size:12px;font-weight:700;color:var(--accent)">${it.codigo||'—'}</span>
              <span style="font-size:12px;color:var(--text);margin-left:6px">${it.descricao||'—'}</span></div>
              <span style="font-size:13px;font-weight:800">x${it.quantidade||1}</span>
            </div>`).join('')}
          </div>` : '';
      return `
      <div data-ck-id="${r.id}" data-numero-pedido="${r.numero_pedido}" style="border:1.5px solid ${concluido?'#BBF7D0':liberado?'#DDD6FE':'var(--accent)'};border-radius:12px;padding:14px;margin-bottom:10px;background:${concluido?'#F0FDF4':liberado?'#F5F3FF':'var(--surface)'}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div>
            <div style="font-size:22px;font-weight:800;color:var(--accent);font-family:'Space Mono',monospace">#${r.numero_pedido}</div>
            <div style="font-size:12px;color:var(--text3);margin-top:2px">
              📦 <b style="color:var(--text)">${r.ped_itens||0} itens</b> &nbsp;•&nbsp; 👤 ${r.sep_nome||r.separador_nome||'—'}
            </div>
            ${r.hora_criacao?`<div style="font-size:11px;color:var(--text3)">🕐 Iniciado às ${r.hora_criacao}</div>`:''}
          </div>
          <div style="font-size:28px">${concluido?'✅':liberado?'🔓':'📦'}</div>
        </div>
        <div style="margin-bottom:10px">
          ${!concluido && !liberado ? `
            <button class="btn btn-success" style="width:100%;padding:14px;font-size:15px;font-weight:700;border-radius:10px;margin-bottom:8px" onclick="confirmarCheckoutMobile(${r.id})">✅ CONFIRMAR CHECKOUT</button>
            <button id="ck-btn-pendencia-${r.id}" onclick="registrarPendenciaMobile(${r.id})" style="display:none;width:100%;padding:12px;font-size:13px;font-weight:700;background:#f97316;color:#fff;border:none;border-radius:10px;cursor:pointer;margin-bottom:8px">⏳ REGISTRAR PENDÊNCIA (itens faltando)</button>
            <button onclick="pausarCheckoutMobile(${r.id})" style="width:100%;padding:11px;font-size:13px;font-weight:700;background:#ede9fe;color:#7c3aed;border:1.5px solid #c4b5fd;border-radius:10px;cursor:pointer;margin-bottom:8px">⏸ Pausar Checkout</button>
            <button class="btn" style="width:100%;padding:11px;font-size:13px;background:var(--surface2);border:1.5px solid var(--border);color:var(--text2);border-radius:10px" onclick="liberarCaixaMobile(${r.id})">🔓 Liberar Caixa Sem Checkout</button>`
          : concluido
            ? `<div style="text-align:center;padding:10px;background:#F0FDF4;border-radius:10px;color:var(--green);font-weight:700;font-size:14px">✅ Checkout às ${r.hora_checkout||'—'}</div>`
            : `<div style="text-align:center;padding:10px;background:#F5F3FF;border-radius:10px;color:var(--indigo);font-weight:700;font-size:14px">🔓 Caixa Liberada</div>`}
        </div>
        ${gerarCodigoBarrasSVG(r.numero_pedido)}
        ${_renderSessoesCk(r.sessoes)}
        ${itensHtml}
      </div>`;
    }).join('');
  } catch(e) { if(cont) cont.innerHTML='<div style="color:var(--red);padding:10px;text-align:center">Erro ao buscar!</div>'; }
}




async function confirmarCheckoutMobile(id) {
  try {
    const res  = await fetch(`${API}/checkout/${id}/confirmar`, { credentials:'include', method:'PUT' });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) { toast(data.erro || 'Erro ao confirmar checkout!','erro'); buscarCaixaMobile(); return; }
    toast('✅ Checkout confirmado! Caixa liberada automaticamente.','sucesso');
    // Limpa resultado, volta para FILA (atualizada) e notifica a contagem
    document.getElementById('m-ck-input-caixa').value = '';
    document.getElementById('m-ck-resultado').innerHTML = '';
    mudarTabCk('fila');   // vai para FILA já atualizada (pedido sumiu)
    if (typeof carregarContadoresCk === 'function') carregarContadoresCk();
  } catch(e) { toast('Erro de rede ao confirmar!','erro'); }
}




function liberarCaixaMobile(id) {
  wmsConfirm({
    icone: '🔓',
    titulo: 'Liberar esta caixa?',
    sub: 'Ela ficará disponível para uso.',
    btnOk: 'Liberar',
    btnOkClass: 'btn-primary',
  }, async () => {
  try {
    const res = await fetch(`${API}/checkout/${id}/liberar`, { credentials:'include', method:'PUT' });
    const data = await res.json();
    if (data.erro) { toast(data.erro,'erro'); return; }
    toast('🔓 Caixa liberada!','sucesso');
    document.getElementById('m-ck-input-caixa').value = '';
    document.getElementById('m-ck-resultado').innerHTML = '';
    carregarStatsCkMobile();
  } catch(e) { toast('Erro ao liberar!','erro'); }
  });
}




// Mantida por compatibilidade com chamadas antigas, redireciona para a nova fila
async function carregarStatsCkMobile() {
  carregarFilaCkMobile();
}




/* ══════════════════════════════════════════
   CHECKOUT
══════════════════════════════════════════ */
// Gera SVG de código de barras Code 128 real (legível por qualquer coletor)
function gerarCodigoBarrasSVG(texto) {
  const svgId = 'ck-barcode-svg-' + Math.random().toString(36).slice(2);
  // Retorna placeholder com id; o SVG é preenchido por renderizarBarcode() após inserção no DOM
  return `<svg id="${svgId}" data-barcode="${texto}" style="max-width:100%;min-width:300px;display:block;margin:0 auto"></svg>`;
}

function renderizarBarcodes() {
  document.querySelectorAll('svg[data-barcode]').forEach(el => {
    try {
      JsBarcode(el, el.dataset.barcode, {
        format: 'CODE128',
        width: 3,
        height: 100,
        displayValue: true,
        fontSize: 18,
        margin: 16,
        background: '#ffffff',
        lineColor: '#000000'
      });
      el.removeAttribute('data-barcode');
    } catch(e) { console.warn('Barcode error:', e); }
  });
}




async function buscarCaixa() {
  const num = document.getElementById('ck-input-caixa')?.value?.trim();
  if (!num) { toast('Digite o número da caixa!','aviso'); return; }
  const wrap = document.getElementById('ck-resultado');
  const cont = document.getElementById('ck-res-conteudo');
  const tit  = document.getElementById('ck-res-titulo');
  if (wrap) wrap.style.display = 'block';
  if (cont) cont.innerHTML = '<div style="color:var(--text3);padding:16px;text-align:center">🔍 Buscando...</div>';
  try {
    const res  = await fetch(`${API}/checkout/caixa/${encodeURIComponent(num)}`, { credentials:'include' });
    const rows = await res.json();
    if (tit) tit.textContent = `CAIXA ${num}`;
    if (!rows.length) {
      if (cont) cont.innerHTML = '<div style="color:var(--text3);padding:20px;text-align:center;font-size:14px">Nenhum pedido vinculado a esta caixa.</div>';
      return;
    }
    if (cont) cont.innerHTML = rows.map(r => {
      const concluido = r.status === 'concluido';
      const liberado  = r.status === 'liberado';
      const itensHtml = (r.itens_lista||[]).length > 0 && !concluido && !liberado
        ? `<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px">
            <div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:1px;margin-bottom:6px">ITENS DO PEDIDO — marque os que estão faltando</div>
            ${r.itens_lista.map(it=>`
              <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:var(--surface);border-radius:8px;margin-bottom:4px;border:1.5px solid var(--border)">
                <div>
                  <span style="font-size:12px;font-weight:700;color:var(--accent)">${it.codigo||'—'}</span>
                  <span style="font-size:12px;color:var(--text);margin-left:8px">${it.descricao||'—'}</span>
                  <span style="font-size:11px;color:var(--text3);margin-left:6px">📍${it.endereco||'—'} · x${it.quantidade||1}</span>
                </div>
                <button onclick="marcarItemFaltandoDesk(${r.id},'${it.codigo}','${(it.descricao||'').replace(/'/g,"\\'")}',${it.quantidade||1},this)"
                  style="flex-shrink:0;margin-left:8px;padding:5px 12px;background:#e2e8f0;color:#64748b;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap">
                  ❌ Marcar Falta
                </button>
              </div>`).join('')}
          </div>`
        : (r.itens_lista||[]).length > 0
          ? `<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px">
              <div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:1px;margin-bottom:6px">ITENS DO PEDIDO</div>
              ${r.itens_lista.map(it=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:var(--surface);border-radius:8px;margin-bottom:4px;border:1.5px solid ${it.status==='encontrado'?'#BBF7D0':it.status==='falta'?'#FECACA':'var(--border)'}">
                <div><span style="font-size:12px;font-weight:700;color:var(--accent)">${it.codigo||'—'}</span><span style="font-size:12px;color:var(--text);margin-left:8px">${it.descricao||'—'}</span></div>
                <span style="font-weight:800">x${it.quantidade||1}</span>
              </div>`).join('')}
            </div>` : '';
      return `
      <div data-ck-id="${r.id}" data-numero-pedido="${r.numero_pedido}" style="border:1.5px solid ${concluido?'#BBF7D0':liberado?'#DDD6FE':'var(--border)'};border-radius:12px;padding:14px;margin-bottom:10px;background:${concluido?'#F0FDF4':liberado?'#F5F3FF':'var(--surface2)'}">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px">
          <div>
            <div style="font-size:22px;font-weight:800;color:var(--accent);font-family:'Space Mono',monospace">#${r.numero_pedido}</div>
            <div style="font-size:13px;color:var(--text3);margin-top:2px">
              📦 ${r.ped_itens||0} itens &nbsp;•&nbsp; 👤 ${r.sep_nome||r.separador_nome||'—'} &nbsp;•&nbsp;
              <span class="pill ${r.ped_status||r.status}" style="font-size:10px">${r.ped_status||r.status}</span>
            </div>
            ${r.hora_criacao?`<div style="font-size:11px;color:var(--text3);margin-top:2px">🕐 Iniciado às ${r.hora_criacao}</div>`:''}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            ${!concluido && !liberado ? `
              <button class="btn btn-success" onclick="confirmarCheckout(${r.id})">✅ Confirmar Checkout</button>
              <button id="ck-btn-pendencia-desk-${r.id}" onclick="registrarPendenciaDesk(${r.id})" style="display:none;padding:9px 16px;background:#f97316;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">⏳ Registrar Pendência</button>
              <button onclick="pausarCheckoutDesk(${r.id})" style="padding:9px 16px;background:#ede9fe;color:#7c3aed;border:1.5px solid #c4b5fd;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">⏸ Pausar</button>
              <button class="btn btn-outline" onclick="liberarCaixaDesktop(${r.id})">🔓 Liberar</button>`
            : concluido
              ? `<span class="pill concluido" style="font-size:12px">✅ Checkout às ${r.hora_checkout||'—'}</span>`
              : `<span class="pill" style="background:#F5F3FF;color:var(--indigo);border:1px solid #DDD6FE;font-size:12px">🔓 Caixa Liberada</span>`}
          </div>
        </div>
        <div style="text-align:center;background:#fff;padding:16px;border-radius:8px;border:1px solid var(--border);overflow-x:auto">
          <div style="font-size:11px;color:var(--text3);margin-bottom:8px;font-weight:700;letter-spacing:1px">CÓDIGO DO PEDIDO — BIPE PARA CHECKOUT</div>
          ${gerarCodigoBarrasSVG(r.numero_pedido)}
        </div>
        ${_renderSessoesCk(r.sessoes)}
        ${itensHtml}
      </div>`;
    }).join('');
    setTimeout(renderizarBarcodes, 50);
  } catch(e) {
    if (cont) cont.innerHTML = '<div style="color:var(--red);padding:20px;text-align:center">Erro ao buscar!</div>';
  }
}




async function confirmarCheckout(id) {
  try {
    const res  = await fetch(`${API}/checkout/${id}/confirmar`, { credentials:'include', method:'PUT' });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) { toast(data.erro || 'Erro ao confirmar checkout!','erro'); buscarCaixa(); return; }
    toast('✅ Checkout confirmado! Caixa liberada automaticamente.','sucesso');
    const inp = document.getElementById('ck-input-caixa');
    if (inp) inp.value = '';
    const wrap = document.getElementById('ck-resultado');
    if (wrap) wrap.style.display = 'none';
    if (typeof carregarFilaCkDesk === 'function') carregarFilaCkDesk();
    if (typeof carregarContadoresCk === 'function') carregarContadoresCk();
  } catch(e) { toast('Erro de rede ao confirmar!','erro'); }
}




async function carregarCheckoutLista() {
  try {
    const status = document.getElementById('filtro-ck-status')?.value || '';
    const url = `${API}/checkout${status ? '?status='+status : ''}`;
    const res  = await fetch(url, { credentials:'include' });
    const rows = await res.json();
    const tbody = document.getElementById('tbody-checkout');
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="color:var(--text3);text-align:center;padding:24px">Nenhum checkout</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => `<tr>
      <td style="font-family:'Space Mono',monospace;font-weight:700;font-size:14px;color:var(--amber)">${r.numero_caixa||'—'}</td>
      <td style="font-weight:700;color:var(--accent)">${r.numero_pedido}</td>
      <td>${r.separador_nome||'—'}</td>
      <td><span class="pill ${r.status}">${r.status==='concluido'?'Concluído':'Pendente'}</span></td>
      <td style="font-size:11px;color:var(--text3)" class="hora-br">${r.hora_checkout||r.hora_criacao||'—'}</td>
      <td>${r.status==='pendente'
        ? `<button class="btn btn-success btn-sm" onclick="confirmarCheckout(${r.id})">✅ OK</button>`
        : r.status==='concluido'
          ? `<span style="color:var(--green);font-size:11px">✓ Feito</span>`
          : `<span style="color:var(--text3);font-size:11px">Liberado</span>`}
      </td>
    </tr>`).join('');
  } catch(e) { console.warn(e); }
}