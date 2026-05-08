﻿/* ══════════════════════════════════════════
   MOBILE CHECKOUT
══════════════════════════════════════════ */
function ativarMobileCk() {
  document.body.classList.add('ck-mobile');
  document.getElementById('ck-mobile-root').style.display = 'flex';
  document.getElementById('ck-tabbar').style.display = 'flex';
  mudarTabCk('busca');
  setTimeout(() => document.getElementById('m-ck-input-caixa')?.focus(), 400);
}




function mudarTabCk(tab) {
  ['busca','stats'].forEach(t => {
    document.getElementById(`ck-tab-${t}`).classList.toggle('ativa', t === tab);
    document.getElementById(`cktab-${t}`).classList.toggle('ativo', t === tab);
  });
  if (tab === 'busca')  setTimeout(() => document.getElementById('m-ck-input-caixa')?.focus(), 200);
  if (tab === 'stats')  carregarStatsCkMobile();
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
      const itensHtml = (r.itens_lista||[]).length > 0
        ? `<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
            <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:1px;margin-bottom:8px">ITENS DO PEDIDO</div>
            ${r.itens_lista.map(it => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--surface);border-radius:8px;margin-bottom:5px;border:1.5px solid ${it.status==='encontrado'?'#BBF7D0':it.status==='falta'?'#FECACA':'var(--border)'}">
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;font-weight:700;color:var(--accent)">${it.codigo||'—'}</div>
                  <div style="font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${it.descricao||'—'}</div>
                  <div style="font-size:11px;color:var(--text3)">📍 ${it.endereco||'—'}</div>
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;margin-left:8px">
                  <span style="font-size:15px;font-weight:800;color:var(--text)">x${it.quantidade||1}</span>
                  <span class="pill ${it.status||'pendente'}" style="font-size:9px">${it.status||'pendente'}</span>
                </div>
              </div>`).join('')}
          </div>` : '';
      return `
      <div style="border:1.5px solid ${concluido?'#BBF7D0':liberado?'#DDD6FE':'var(--accent)'};border-radius:12px;padding:14px;margin-bottom:10px;background:${concluido?'#F0FDF4':liberado?'#F5F3FF':'var(--surface)'}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div>
            <div style="font-size:22px;font-weight:800;color:var(--accent);font-family:'Space Mono',monospace">#${r.numero_pedido}</div>
            <div style="font-size:12px;color:var(--text3);margin-top:2px">
              📦 <b style="color:var(--text)">${r.ped_itens||0} itens</b> &nbsp;•&nbsp; 👤 ${r.sep_nome||r.separador_nome||'—'}
            </div>
            ${r.hora_criacao?`<div style="font-size:11px;color:var(--text3)">🕐 Vinculado às ${r.hora_criacao}</div>`:''}
          </div>
          <div style="font-size:28px">${concluido?'✅':liberado?'🔓':'📦'}</div>
        </div>
        <div style="margin-bottom:10px">
          ${!concluido && !liberado
            ? `<button class="btn btn-success" style="width:100%;padding:14px;font-size:15px;font-weight:700;border-radius:10px;margin-bottom:8px" onclick="confirmarCheckoutMobile(${r.id})">✅ CONFIRMAR CHECKOUT</button>
               <button class="btn" style="width:100%;padding:11px;font-size:13px;background:var(--surface2);border:1.5px solid var(--border);color:var(--text2);border-radius:10px" onclick="liberarCaixaMobile(${r.id})">🔓 Liberar Caixa Sem Checkout</button>`
            : concluido
              ? `<div style="text-align:center;padding:10px;background:#F0FDF4;border-radius:10px;color:var(--green);font-weight:700;font-size:14px">✅ Checkout realizado às ${r.hora_checkout||'—'}</div>
                 <button class="btn" style="width:100%;padding:11px;font-size:13px;background:var(--surface2);border:1.5px solid var(--border);color:var(--text2);border-radius:10px;margin-top:8px" onclick="liberarCaixaMobile(${r.id})">🔓 Liberar Caixa</button>`
              : `<div style="text-align:center;padding:10px;background:#F5F3FF;border-radius:10px;color:var(--indigo);font-weight:700;font-size:14px">🔓 Caixa Liberada</div>`}
        </div>
        ${gerarCodigoBarrasSVG(r.numero_pedido)}
        ${itensHtml}
      </div>`;
    }).join('');
  } catch(e) { if(cont) cont.innerHTML='<div style="color:var(--red);padding:10px;text-align:center">Erro ao buscar!</div>'; }
}




async function confirmarCheckoutMobile(id) {
  try {
    await fetch(`${API}/checkout/${id}/confirmar`, { credentials:'include', method:'PUT' });
    toast('✅ Checkout confirmado!','sucesso');
    buscarCaixaMobile();
  } catch(e) { toast('Erro ao confirmar!','erro'); }
}




async function liberarCaixaMobile(id) {
  if (!confirm('Liberar esta caixa? Ela ficará disponível para uso.')) return;
  try {
    const res = await fetch(`${API}/checkout/${id}/liberar`, { credentials:'include', method:'PUT' });
    const data = await res.json();
    if (data.erro) { toast(data.erro,'erro'); return; }
    toast('🔓 Caixa liberada!','sucesso');
    document.getElementById('m-ck-input-caixa').value = '';
    document.getElementById('m-ck-resultado').innerHTML = '';
    carregarStatsCkMobile();
  } catch(e) { toast('Erro ao liberar!','erro'); }
}




async function carregarStatsCkMobile() {
  try {
    const res  = await fetch(`${API}/stats/meus`, { credentials:'include' });
    const data = res.ok ? await res.json() : {};
    const d = data.checkout || {};
    const set  = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val ?? 0; };
    set('m-ck-hoje', d.expedidos_hoje);
    set('m-ck-mes',  d.expedidos_hoje);
    set('m-ck-pend', d.pendentes);
  } catch(e) {}
}




/* ══════════════════════════════════════════
   CHECKOUT
══════════════════════════════════════════ */
// Gera SVG de código de barras Code-128 — tamanho grande para leitura por coletor
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
      const itensHtml = (r.itens_lista||[]).length > 0
        ? `<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px">
            <div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:1px;margin-bottom:6px">ITENS DO PEDIDO</div>
            ${r.itens_lista.map(it=>`
              <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:var(--surface);border-radius:8px;margin-bottom:4px;border:1.5px solid ${it.status==='encontrado'?'#BBF7D0':it.status==='falta'?'#FECACA':'var(--border)'}">
                <div>
                  <span style="font-size:12px;font-weight:700;color:var(--accent)">${it.codigo||'—'}</span>
                  <span style="font-size:12px;color:var(--text);margin-left:8px">${it.descricao||'—'}</span>
                  <span style="font-size:11px;color:var(--text3);margin-left:6px">📍${it.endereco||'—'}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
                  <span style="background:var(--accent);color:#fff;border-radius:6px;padding:2px 8px;font-size:13px;font-weight:800;font-family:'Space Mono',monospace">x${it.quantidade||1}</span>
                  <span class="pill ${it.status||'pendente'}" style="font-size:9px">${it.status||'pendente'}</span>
                </div>
              </div>`).join('')}
          </div>` : '';
      return `
      <div style="border:1.5px solid ${concluido?'#BBF7D0':liberado?'#DDD6FE':'var(--border)'};border-radius:12px;padding:14px;margin-bottom:10px;background:${concluido?'#F0FDF4':liberado?'#F5F3FF':'var(--surface2)'}">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px">
          <div>
            <div style="font-size:22px;font-weight:800;color:var(--accent);font-family:'Space Mono',monospace">#${r.numero_pedido}</div>
            <div style="font-size:13px;color:var(--text3);margin-top:2px">
              📦 ${r.ped_itens||0} itens &nbsp;•&nbsp;
              👤 ${r.sep_nome||r.separador_nome||'—'} &nbsp;•&nbsp;
              <span class="pill ${r.ped_status||r.status}" style="font-size:10px">${r.ped_status||r.status}</span>
            </div>
            ${r.hora_criacao?`<div style="font-size:11px;color:var(--text3);margin-top:2px">🕐 Vinculado às ${r.hora_criacao}</div>`:''}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${!concluido && !liberado
              ? `<button class="btn btn-success" onclick="confirmarCheckout(${r.id})">✅ Confirmar Checkout</button>
                 <button class="btn btn-outline" onclick="liberarCaixaDesktop(${r.id})">🔓 Liberar Caixa</button>`
              : concluido
                ? `<span class="pill concluido" style="font-size:12px">✅ Checkout às ${r.hora_checkout||'—'}</span>
                   <button class="btn btn-outline btn-sm" onclick="liberarCaixaDesktop(${r.id})">🔓 Liberar Caixa</button>`
                : `<span class="pill" style="background:#F5F3FF;color:var(--indigo);border:1px solid #DDD6FE;font-size:12px">🔓 Caixa Liberada</span>`}
          </div>
        </div>
        <div style="text-align:center;background:#fff;padding:16px;border-radius:8px;border:1px solid var(--border);overflow-x:auto">
          <div style="font-size:11px;color:var(--text3);margin-bottom:8px;font-weight:700;letter-spacing:1px">CÓDIGO DO PEDIDO — BIPE PARA CHECKOUT</div>
          ${gerarCodigoBarrasSVG(r.numero_pedido)}
        </div>
        ${itensHtml}
      </div>`;
    }).join('');
  } catch(e) {
    if (cont) cont.innerHTML = '<div style="color:var(--red);padding:20px;text-align:center">Erro ao buscar!</div>';
  }
}




async function confirmarCheckout(id) {
  try {
    await fetch(`${API}/checkout/${id}/confirmar`, { credentials:'include', method:'PUT' });
    toast('✅ Checkout confirmado!','sucesso');
    buscarCaixa();
    carregarCheckoutLista();
  } catch(e) { toast('Erro ao confirmar!','erro'); }
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
          ? `<span style="display:flex;gap:5px;align-items:center"><span style="color:var(--green);font-size:11px">✓ Feito</span><button class="btn btn-sm btn-outline" onclick="liberarCaixaDesktop(${r.id})" title="Liberar caixa">🔓</button></span>`
          : `<span style="color:var(--text3);font-size:11px">Liberado</span>`}
      </td>
    </tr>`).join('');
  } catch(e) {}
}