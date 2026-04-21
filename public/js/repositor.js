﻿/* ══════════════════════════════════════════
   MOBILE REPOSITOR
══════════════════════════════════════════ */
function ativarMobileRep() {
  document.body.classList.add('rep-mobile');
  document.getElementById('rep-mobile-root').style.display = 'flex';
  document.getElementById('rep-tabbar').style.display = 'flex';
  mudarTabRep('avisos');
  carregarAvisosMobile();
  setInterval(() => { carregarAvisosMobile(); }, 30000);
}




function mudarTabRep(tab) {
  ['avisos','stats'].forEach(t => {
    document.getElementById(`rep-tab-${t}`).classList.toggle('ativa', t === tab);
    document.getElementById(`rtab-${t}`).classList.toggle('ativo', t === tab);
  });
  if (tab === 'avisos') carregarAvisosMobile();
  if (tab === 'stats')  carregarStatsRepMobile();
}




async function carregarAvisosMobile() {
  try {
    // Carrega duplicatas do dia primeiro
    const resDup = await fetch(`${API}/repositor/duplicatas-dia`, { credentials:'include' });
    const dups   = resDup.ok ? await resDup.json() : [];




    const filtroEl = document.getElementById('m-filtro-rep-status');
    const status   = filtroEl ? filtroEl.value : '';
    let url = `${API}/repositor/avisos`;
    const params = [];
    if (status) params.push(`status=${status}`);
    // Repositor vê apenas seus próprios avisos no desktop
    if (usuarioAtual?.perfil === 'repositor') params.push(`repositor_nome=${encodeURIComponent(usuarioAtual.nome)}`);
    if (params.length) url += '?' + params.join('&');
    const r      = await fetch(url, { credentials:'include' });
    if (!r.ok) return;
    const avisos = await r.json();
    const pend   = avisos.filter(a=>a.status==='pendente').length;
    const elPend = document.getElementById('m-rep-pend');
    if (elPend) elPend.textContent = pend;
    const badge = document.getElementById('rtab-badge');
    if (badge) { badge.textContent=pend; badge.style.display=pend>0?'inline':'none'; }
    const lista = document.getElementById('m-lista-avisos');
    if (!lista) return;




    // Mapa de duplicatas por código
    const dupMap = {};
    dups.forEach(d => { dupMap[d.codigo] = d; });




    let html = '';




    // Banner de duplicatas
    if (dups.length > 0) {
      html += dups.map(d => `
        <div style="background:#FEF3C7;border:2px solid #F59E0B;border-radius:12px;padding:12px 14px;margin-bottom:10px">
          <div style="font-size:13px;font-weight:800;color:#92400E">⚠️ ATENÇÃO — ITEM DUPLICADO HOJE</div>
          <div style="font-size:13px;font-weight:700;color:var(--text);margin-top:4px">${d.codigo} — ${d.descricao||'—'}</div>
          <div style="font-size:12px;color:#78350F;margin-top:3px">Já solicitado hoje para os pedidos: <b>${d.pedidos}</b></div>
        </div>`).join('');
    }




    if (!avisos.length) {
      html += '<div style="color:var(--text3);text-align:center;padding:36px;font-size:14px">✅ Nenhum item</div>';
      lista.innerHTML = html;
      return;
    }




    html += avisos.map(a => {
      const isPend  = a.status==='pendente';
      const isEnc   = a.status==='encontrado'||a.status==='reposto';
      const isSubiu = a.status==='subiu';
      const isAbast = a.status==='abastecido';
      const isNE    = a.status==='nao_encontrado';
      const isProto = a.status==='protocolo';
      const icon    = isEnc?'✅':isSubiu?'⬆️':isAbast?'📦':isNE?'🚫':isProto?'📋':'🔴';
      const bgCard  = isPend?'background:#FEF2F2;border-color:#FECACA':isEnc||isSubiu||isAbast?'background:#F0FDF4;border-color:#BBF7D0':isNE?'background:#F5F3FF;border-color:#DDD6FE':'background:#FFFBEB;border-color:#FDE68A';




      // Alerta de duplicata inline
      const dupAlerta = dupMap[a.codigo] && isPend ? `
        <div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:7px 10px;margin-bottom:8px;font-size:11px;color:#92400E;font-weight:700">
          ⚠️ Este item também foi solicitado para: <b>${dupMap[a.codigo].pedidos}</b>
        </div>` : '';




      return `
      <div style="border:2px solid;border-radius:14px;padding:14px;margin-bottom:12px;${bgCard}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
          <div style="flex:1">
            <div style="font-size:16px;font-weight:800;color:${isPend?'var(--red)':isEnc||isSubiu||isAbast?'var(--green)':'var(--indigo)'}">
              ${icon} ${a.codigo||'—'}
            </div>
            <div style="font-size:12px;color:var(--text3);margin-top:2px">Pedido <b style="color:var(--text)">#${a.numero_pedido}</b> &nbsp;•&nbsp; Sep: ${a.separador_nome||'—'}</div>
          </div>
          <div style="text-align:center;background:${isPend?'var(--red)':'var(--text3)'};color:#fff;border-radius:10px;padding:6px 12px;flex-shrink:0;margin-left:8px">
            <div style="font-size:9px;font-weight:700;letter-spacing:1px;opacity:.85">QTDE</div>
            <div style="font-size:28px;font-weight:800;font-family:'Space Mono',monospace;line-height:1">${a.quantidade||1}</div>
          </div>
        </div>
        ${dupAlerta}
        <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:6px;line-height:1.3">${a.descricao||'—'}</div>
        <div style="font-size:13px;color:var(--text2);margin-bottom:8px">📍 <b>${a.endereco||'—'}</b></div>




        ${isPend ? `
        <div style="background:var(--red);color:#fff;border-radius:10px;padding:10px 14px;margin-bottom:10px;text-align:center">
          <div style="font-size:11px;font-weight:700;letter-spacing:1px;opacity:.9">FALTA TOTAL</div>
          <div style="font-size:26px;font-weight:800;font-family:'Space Mono',monospace;line-height:1.2">${a.quantidade||1} unidade${(a.quantidade||1)>1?'s':''}</div>
          ${a.obs ? '<div style="font-size:11px;opacity:.85;margin-top:4px">📝 '+a.obs+'</div>' : ''}
        </div>
        <div style="font-size:11px;color:var(--red);font-weight:700;margin-bottom:8px">⏱ Aviso às ${a.hora_aviso||'—'}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;background:#fff;border:1.5px solid #FDE68A;border-radius:10px;padding:10px 12px">
          <span style="font-size:12px;color:var(--amber);font-weight:700;white-space:nowrap">Qtde encontrada:</span>
          <input type="number" style="flex:1;padding:8px;background:transparent;border:none;outline:none;font-size:22px;font-weight:800;font-family:'Space Mono',monospace;color:var(--text);text-align:center;min-width:0"
            id="m-qtd-enc-${a.id}" min="0" max="${a.quantidade||99}" placeholder="0" inputmode="numeric"/>
          <span style="font-size:12px;color:var(--text3);white-space:nowrap">de <b>${a.quantidade||'?'}</b></span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button style="width:100%;padding:14px;background:var(--green);color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif" onclick="marcarAvisoMobile(${a.id},${a.quantidade||0},'encontrado')">✅ Encontrado</button>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <button style="padding:12px;background:#0D9488;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif" onclick="marcarAvisoMobile(${a.id},${a.quantidade||0},'subiu')">⬆️ Subiu</button>
            <button style="padding:12px;background:var(--accent);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif" onclick="marcarAvisoMobile(${a.id},${a.quantidade||0},'abastecido')">📦 Abastecido</button>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <button style="padding:12px;background:var(--indigo);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif" onclick="marcarAvisoMobile(${a.id},0,'nao_encontrado')">🚫 Não Encontrei</button>
            <button style="padding:12px;background:var(--amber);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif" onclick="marcarAvisoMobile(${a.id},0,'protocolo')">📋 Protocolo</button>
          </div>
        </div>
        ` : '<div style="margin-top:4px">' +
          (isEnc   ? '<div style="font-size:13px;color:var(--green);font-weight:700">✅ Encontrado às '+(a.hora_reposto||'—')+(a.qtd_encontrada>0?' — '+a.qtd_encontrada+' un.':'')+'</div>' : '') +
          (isSubiu ? '<div style="font-size:13px;color:#0D9488;font-weight:700">⬆️ Subiu às '+(a.hora_reposto||'—')+(a.qtd_encontrada>0?' — '+a.qtd_encontrada+' un.':'')+'</div>' : '') +
          (isAbast ? '<div style="font-size:13px;color:var(--accent);font-weight:700">📦 Abastecido às '+(a.hora_reposto||'—')+(a.qtd_encontrada>0?' — '+a.qtd_encontrada+' un.':'')+'</div>' : '') +
          (isNE    ? '<div style="font-size:13px;color:var(--indigo);font-weight:700">🚫 Não encontrado às '+(a.hora_reposto||'—')+'</div>' : '') +
          (isProto ? '<div style="font-size:13px;color:var(--amber);font-weight:700">📋 Protocolo às '+(a.hora_reposto||'—')+'</div>' : '') +
          (a.obs   ? '<div style="font-size:11px;color:var(--text2);margin-top:3px">📝 '+a.obs+'</div>' : '') +
          '</div>'}
      </div>`;
    }).join('');
    lista.innerHTML = html;
  } catch(e) { console.error(e); }
}




// Função unificada para marcar aviso no mobile
async function marcarAvisoMobile(id, qtdTotal, acao) {
  if ((acao==='nao_encontrado'||acao==='protocolo') && !confirm(`Confirmar: ${acao==='nao_encontrado'?'Não encontrado':'Protocolo'}? O supervisor será notificado.`)) return;
  const input  = document.getElementById(`m-qtd-enc-${id}`);
  const qtdEnc = (acao==='nao_encontrado'||acao==='protocolo') ? 0 : (parseInt(input?.value) || qtdTotal || 0);
  const nome   = usuarioAtual?.nome || '';
  try {
    const res = await fetch(`${API}/repositor/avisos/${id}/${acao}`, {
      credentials:'include', method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ qtd_encontrada: qtdEnc, repositor_nome: nome })
    });
    const data = await res.json();
    if (data.erro) { toast(data.erro,'erro'); return; }
    const msgs = { encontrado:'✅ Encontrado!', subiu:'⬆️ Subiu!', abastecido:'📦 Abastecido!', nao_encontrado:'🚫 Não encontrado!', protocolo:'📋 Protocolo!' };
    const tipos = { encontrado:'sucesso', subiu:'sucesso', abastecido:'sucesso', nao_encontrado:'aviso', protocolo:'aviso' };
    toast(msgs[acao]||'OK', tipos[acao]||'info');
    carregarAvisosMobile();
  } catch(e) { toast('Erro!','erro'); }
}




// Manter compatibilidade com funções antigas
async function marcarRepostoMobile(id, qtdTotal) { await marcarAvisoMobile(id, qtdTotal, 'encontrado'); }
async function marcarNaoEncontradoMobile(id) { await marcarAvisoMobile(id, 0, 'nao_encontrado'); }
async function marcarProtocoloMobile(id) { await marcarAvisoMobile(id, 0, 'protocolo'); }




async function carregarStatsRepMobile() {
  try {
    const nomeEl = document.getElementById('m-rep-nome');
    if (nomeEl) nomeEl.textContent = `👤 ${usuarioAtual?.nome || '—'}`;
    const res  = await fetch(`${API}/estatisticas/repositor`, { credentials:'include' });
    const data = await res.json();
    const set  = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val ?? 0; };
    set('m-rep-hoje',      data.repostos_hoje);
    set('m-rep-mes',       data.repostos_mes);
    set('m-rep-pendentes', data.pendentes_total);
  } catch(e) {}
}




/* ══════════════════════════════════════════
   REPOSIÇÃO
══════════════════════════════════════════ */
/* ══════════════════════════════════════════
   REPOSIÇÃO — funções completas
══════════════════════════════════════════ */
async function verificarDuplicatas() {
  try {
    const res  = await fetch(`${API}/repositor/duplicatas`);
    if (!res.ok) return;
    const dups = await res.json();
    const wrap = document.getElementById('rep-duplicatas-wrap');
    if (!wrap) return;
    if (!dups || !dups.length) { wrap.style.display='none'; return; }
    wrap.style.display = 'block';
    wrap.innerHTML = dups.map(d=>`
      <div class="aviso-duplicata">
        <span style="font-size:22px">⚠️</span>
        <div>
          <div>Produto <b>${d.codigo}</b> em <b>${d.total_pedidos}</b> pedidos diferentes!</div>
          <div style="font-size:11px;font-weight:400;margin-top:2px;color:#9A3412">Pedidos: ${d.pedidos}</div>
          <div style="font-size:11px;font-weight:400;color:#9A3412">${d.descricao||''}</div>
        </div>
      </div>`).join('');
  } catch(e) {}
}




async function buscarProdutoRepositor() {
  const cod = document.getElementById('rep-input-cod')?.value?.trim();
  if (!cod) { toast('Digite um código!','aviso'); return; }
  const resEl = document.getElementById('rep-busca-resultado');
  if (!resEl) return;
  resEl.style.display = 'block';
  resEl.innerHTML = '<div style="color:var(--text3);padding:10px">🔍 Buscando...</div>';
  try {
    const r    = await fetch(`${API}/repositor/buscar-produto?codigo=${encodeURIComponent(cod)}`);
    const rows = await r.json();
    if (!rows.length) { resEl.innerHTML = '<div style="color:var(--text3);padding:10px">Nenhum pedido com este código.</div>'; return; }
    const pedidos = [...new Set(rows.map(x=>x.numero_pedido))];
    resEl.innerHTML = `
      <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:8px">
        📦 <b>${rows.length}</b> item(ns) em <b>${pedidos.length}</b> pedido(s): ${pedidos.join(', ')}
      </div>
      ${pedidos.length>1?`<div class="aviso-duplicata" style="margin-bottom:8px"><span>⚠️</span> Este produto aparece em múltiplos pedidos!</div>`:''}
      <div style="display:flex;flex-direction:column;gap:6px">
        ${rows.map(item=>`
          <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 13px">
            <div style="font-weight:700;color:var(--accent)">${item.codigo} &nbsp;•&nbsp; Pedido #${item.numero_pedido}</div>
            <div style="font-weight:600;color:var(--text);margin:2px 0">${item.descricao||'—'}</div>
            <div style="color:var(--text3);font-size:11px">📍 ${item.endereco||'—'} &nbsp;•&nbsp; Qtde: ${item.quantidade||1} &nbsp;•&nbsp; Status: <b>${item.status}</b></div>
          </div>`).join('')}
      </div>`;
  } catch(e) { resEl.innerHTML = '<div style="color:var(--red);padding:10px">Erro ao buscar.</div>'; }
}





/* ══════════════════════════════════════════
   ABAS DA REPOSIÇÃO
══════════════════════════════════════════ */
function mudarRepTab(tab) {
  ['avisos','analise'].forEach(t => {
    const panel = document.getElementById(`reptab-${t}`);
    const btn   = document.getElementById(`reptab-btn-${t}`);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
    if (btn) {
      btn.style.color = t === tab ? 'var(--accent)' : 'var(--text3)';
      btn.style.borderBottomColor = t === tab ? 'var(--accent)' : 'transparent';
    }
  });
  if (tab === 'analise') carregarAnaliseFaltas();
}

async function carregarAnaliseFaltas() {
  try {
    const res = await fetch(`${API}/repositor/avisos`, { credentials:'include' });
    const avisos = await res.json();

    // Agrupa por produto
    const porProd = {};
    const porRua  = {};
    avisos.forEach(a => {
      // Por produto
      const key = a.codigo || a.descricao || 'Desconhecido';
      const desc = a.descricao || a.codigo || '—';
      if (!porProd[key]) porProd[key] = { desc, total:0, pendentes:0, repostos:0 };
      porProd[key].total++;
      if (a.status === 'pendente')    porProd[key].pendentes++;
      if (a.status === 'reposto')     porProd[key].repostos++;

      // Por rua
      const end = String(a.endereco||'').split(',')[0].trim();
      const m = end.match(/^([A-Z]+)/);
      if (m) {
        const rua = m[1];
        if (!porRua[rua]) porRua[rua] = { total:0, pendentes:0 };
        porRua[rua].total++;
        if (a.status === 'pendente') porRua[rua].pendentes++;
      }
    });

    // Produtos — top 10 por total de ocorrências
    const prods = Object.values(porProd).sort((a,b)=>b.total-a.total).slice(0,10);
    const maxP  = Math.max(...prods.map(p=>p.total), 1);
    const prodEl = document.getElementById('analise-produtos');
    if (prodEl) {
      if (!prods.length) {
        prodEl.innerHTML = '<div style="color:var(--text3);text-align:center;padding:20px;font-size:13px">Nenhuma falta registrada</div>';
      } else {
        prodEl.innerHTML = prods.map((p,i) => `
          <div style="padding:8px 4px;border-bottom:0.5px solid var(--border)">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <div style="flex:1;min-width:0;font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${p.desc}">${p.desc}</div>
              <div style="display:flex;gap:8px;flex-shrink:0;margin-left:8px;font-size:11px">
                ${p.pendentes>0?`<span style="color:var(--red);font-weight:600">${p.pendentes} pend.</span>`:''}
                ${p.repostos>0?`<span style="color:var(--green)">${p.repostos} repos.</span>`:''}
                <span style="color:var(--text3)">${p.total}x</span>
              </div>
            </div>
            <div style="height:5px;background:var(--surface2);border-radius:3px;overflow:hidden">
              <div style="height:100%;background:${p.pendentes>0?'linear-gradient(90deg,#DC2626,#F87171)':'linear-gradient(90deg,#16A34A,#4ADE80)'};width:${Math.round((p.total/maxP)*100)}%;border-radius:3px"></div>
            </div>
          </div>`).join('');
      }
    }

    // Ruas — ordenadas por total
    const ruas = Object.entries(porRua).sort((a,b)=>b[1].total-a[1].total);
    const maxR = Math.max(...ruas.map(r=>r[1].total), 1);
    const dificuldadeRua = r => {
      if ('ABCDEPQRSTU'.includes(r)) return {cor:'#15803D',bg:'#F0FDF4'};
      if ('MNOUVWXYZ'.includes(r))   return {cor:'#92400E',bg:'#FFFBEB'};
      return {cor:'#991B1B',bg:'#FEF2F2'};
    };
    const ruaEl = document.getElementById('analise-ruas');
    if (ruaEl) {
      if (!ruas.length) {
        ruaEl.innerHTML = '<div style="color:var(--text3);text-align:center;padding:20px;font-size:13px">Nenhuma falta registrada</div>';
      } else {
        ruaEl.innerHTML = ruas.map(([rua, d]) => {
          const dif = dificuldadeRua(rua);
          return `<div style="display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:0.5px solid var(--border)">
            <div style="width:32px;height:32px;border-radius:50%;background:${dif.bg};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:${dif.cor};flex-shrink:0">${rua}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                <span style="font-size:12px;color:var(--text2)">${d.total} ocorrência${d.total>1?'s':''}</span>
                ${d.pendentes>0?`<span style="font-size:11px;color:var(--red);font-weight:600">${d.pendentes} pendente${d.pendentes>1?'s':''}</span>`:'<span style="font-size:11px;color:var(--green)">resolvido</span>'}
              </div>
              <div style="height:5px;background:var(--surface2);border-radius:3px;overflow:hidden">
                <div style="height:100%;background:${d.pendentes>0?'linear-gradient(90deg,#DC2626,#F87171)':'linear-gradient(90deg,#16A34A,#4ADE80)'};width:${Math.round((d.total/maxR)*100)}%;border-radius:3px"></div>
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0;font-size:18px;font-weight:700;color:${d.pendentes>0?'var(--red)':'var(--green)'}">${d.total}</div>
          </div>`;
        }).join('');
      }
    }
  } catch(e) { console.error(e); }
}