/* ══ REPOSICAO.JS ══ WMS Miess ══ */

function setFiltroRep(status, btn) {
  repFiltroAtual = status;
  document.querySelectorAll('.rep-filtro-btn').forEach(b => b.classList.remove('ativo'));
  if (btn) btn.classList.add('ativo');
  carregarAvisosMobile();
}

function ativarMobileRep() {
  document.body.classList.add('rep-mobile');
  document.getElementById('rep-mobile-root').style.display = 'flex';
  document.getElementById('rep-tabbar').style.display = 'flex';
  mudarTabRep('avisos');
  carregarAvisosMobile();
  carregarParaGuardar(); // pré-carrega badge
  setInterval(() => {
    carregarAvisosMobile();
    if (document.getElementById('rep-tab-historico')?.classList.contains('ativa')) carregarHistoricoDia();
  }, 20000);
}

function mudarTabRep(tab) {
  ['avisos','guardar','historico','stats'].forEach(t => {
    const pg = document.getElementById(`rep-tab-${t}`); if(pg) pg.classList.toggle('ativa', t === tab);
    const bt = document.getElementById(`rtab-${t}`);    if(bt) bt.classList.toggle('ativo', t === tab);
  });
  if (tab === 'avisos')    carregarAvisosMobile();
  if (tab === 'guardar')   carregarParaGuardar();
  if (tab === 'historico') carregarHistoricoDia();
  if (tab === 'stats')     carregarStatsRepMobile();
}

async function carregarAvisos() {
  try {
    // Carrega duplicatas do dia
    const resDup = await fetch(`${API}/repositor/duplicatas-dia`, { credentials:'include' });
    const dups   = resDup.ok ? await resDup.json() : [];
    const dupMap = {};
    dups.forEach(d => { dupMap[d.codigo] = d; });

    const filtroEl = document.getElementById('filtro-rep-status');
    const status   = filtroEl ? filtroEl.value : '';
    let url = `${API}/repositor/avisos`; if (status) url += `?status=${status}`;
    const r      = await fetch(url, { credentials:'include' });
    if (!r.ok) return;
    const avisos = await r.json();
    const pend   = avisos.filter(a=>a.status==='pendente').length;
    const enc    = avisos.filter(a=>['encontrado','reposto','subiu','abastecido'].includes(a.status)).length;
    const elPend = document.getElementById('rep-pend');
    const elRep  = document.getElementById('rep-rep');
    if (elPend) elPend.textContent = pend;
    if (elRep)  elRep.textContent  = enc;
    const badge = document.getElementById('menu-badge-rep');
    if (badge) { badge.textContent=pend; badge.style.display=pend>0?'inline':'none'; }
    const lista = document.getElementById('lista-avisos');
    if (!lista) return;

    let html = '';
    // Banner de duplicatas do dia
    if (dups.length > 0) {
      html += `<div style="margin-bottom:12px">${dups.map(d=>`
        <div class="aviso-duplicata">
          <span style="font-size:20px">⚠️</span>
          <div>
            <div style="font-size:13px;font-weight:800">ATENÇÃO — Item duplicado hoje: <b>${d.codigo}</b> — ${d.descricao||''}</div>
            <div style="font-size:12px;font-weight:400;margin-top:2px">Já solicitado hoje para os pedidos: <b>${d.pedidos}</b></div>
          </div>
        </div>`).join('')}</div>`;
    }

    if (!avisos.length) {
      html += '<div style="color:var(--text3);text-align:center;padding:36px;font-size:14px">✅ Nenhum item encontrado</div>';
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
      const dupAlerta = dupMap[a.codigo] && isPend
        ? `<div style="font-size:11px;color:#92400E;font-weight:700;background:#FEF3C7;border:1px solid #F59E0B;border-radius:6px;padding:5px 8px;margin-top:5px">⚠️ Já solicitado hoje para: <b>${dupMap[a.codigo].pedidos}</b></div>` : '';
      return `
      <div class="aviso-card ${a.status}">
        <div style="font-size:26px;flex-shrink:0">${icon}</div>
        <div class="aviso-info">
          <div class="aviso-cod">${a.codigo||'—'} <span style="font-size:11px;font-weight:500;color:var(--text3);margin-left:6px">Pedido #${a.numero_pedido}</span></div>
          <div class="aviso-desc">${a.descricao||'—'}</div>
          <div class="aviso-det">📍 ${a.endereco||'—'} &nbsp;•&nbsp; Qtde: <b>${a.quantidade||'—'}</b></div>
          ${dupAlerta}
          ${isEnc   ? `<div style="font-size:12px;color:var(--green);margin-top:4px;font-weight:700">✅ Encontrado às ${a.hora_reposto||'—'}${a.qtd_encontrada>0?' — '+a.qtd_encontrada+' un.':''}</div>` : ''}
          ${isSubiu ? `<div style="font-size:12px;color:#0D9488;margin-top:4px;font-weight:700">⬆️ Subiu às ${a.hora_reposto||'—'}${a.qtd_encontrada>0?' — '+a.qtd_encontrada+' un.':''}</div>` : ''}
          ${isAbast ? `<div style="font-size:12px;color:var(--accent);margin-top:4px;font-weight:700">📦 Abastecido às ${a.hora_reposto||'—'}${a.qtd_encontrada>0?' — '+a.qtd_encontrada+' un.':''}</div>` : ''}
          ${isNE    ? `<div style="font-size:12px;color:var(--indigo);margin-top:4px;font-weight:700">🚫 Não encontrado às ${a.hora_reposto||'—'}</div>` : ''}
          ${isProto ? `<div style="font-size:12px;color:var(--amber);margin-top:4px;font-weight:700">📋 Protocolo às ${a.hora_reposto||'—'}</div>` : ''}
          ${isPend  ? `<div style="font-size:12px;color:var(--red);margin-top:4px;font-weight:700">⏱ Aviso às ${a.hora_aviso||'—'} &nbsp;•&nbsp; Sep: ${a.separador_nome||'—'}</div>` : ''}
          ${a.obs   ? `<div style="font-size:11px;color:var(--text2);margin-top:3px">📝 ${a.obs}</div>` : ''}
          ${isPend  ? `
            <div class="qtd-enc-wrap">
              <label>Qtde encontrada:</label>
              <input type="number" class="qtd-enc-input" id="qtd-enc-${a.id}" min="0" max="${a.quantidade||99}" placeholder="0" inputmode="numeric"/>
              <span style="font-size:11px;color:var(--text3)">de ${a.quantidade||'?'}</span>
            </div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:7px;align-items:flex-end;flex-shrink:0">
          ${isPend ? `
            <button class="btn btn-success btn-sm" style="min-width:110px" onclick="marcarAviso(${a.id},${a.quantidade||0},'encontrado')">✅ Encontrado</button>
            <button class="btn btn-sm" style="background:#0D9488;color:#fff;min-width:110px" onclick="marcarAviso(${a.id},${a.quantidade||0},'subiu')">⬆️ Subiu</button>
            <button class="btn btn-sm" style="background:var(--accent);color:#fff;min-width:110px" onclick="marcarAviso(${a.id},${a.quantidade||0},'abastecido')">📦 Abastecido</button>
            <button class="btn btn-sm" style="background:var(--indigo);color:#fff;min-width:110px" onclick="marcarAviso(${a.id},0,'nao_encontrado')">🚫 Não encontrei</button>
            <button class="btn btn-sm" style="background:var(--amber);color:#fff;min-width:110px" onclick="marcarAviso(${a.id},0,'protocolo')">📋 Protocolo</button>
          ` : `<span class="pill ${isEnc?'reposto':isSubiu?'ciano':isAbast?'separador':isProto?'protocolo':isNE?'inativo':'pendente'}">${isEnc?'Encontrado':isSubiu?'Subiu':isAbast?'Abastecido':isProto?'Protocolo':'Não encontrado'}</span>`}
        </div>
      </div>`;
    }).join('');
    lista.innerHTML = html;
  } catch(e) {
    const lista = document.getElementById('lista-avisos');
    if (lista) lista.innerHTML = '<div style="color:var(--red);text-align:center;padding:20px">Erro ao carregar</div>';
  }
}

async function carregarAvisosMobile() {
  try {
    // Carrega duplicatas do dia primeiro
    const resDup = await fetch(`${API}/repositor/duplicatas-dia`, { credentials:'include' });
    const dups   = resDup.ok ? await resDup.json() : [];

    const status = repFiltroAtual || '';
    let url = `${API}/repositor/avisos`; if (status) url += `?status=${status}`;
    // Mostra nome do usuário logado
    const userInfoEl = document.getElementById('m-rep-user-info');
    if (userInfoEl) userInfoEl.textContent = `👤 ${usuarioAtual?.nome||'—'}`;
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
        <!-- Destaque FALTA -->
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:10px 12px;background:#FEF2F2;border:1.5px solid #FECACA;border-radius:10px">
          <div style="text-align:center;background:var(--red);color:#fff;border-radius:10px;padding:6px 14px;flex-shrink:0">
            <div style="font-size:9px;font-weight:700;letter-spacing:1px;opacity:.9">FALTA</div>
            <div style="font-size:28px;font-weight:800;font-family:'Space Mono',monospace;line-height:1.1">${a.quantidade||1}</div>
            <div style="font-size:9px;opacity:.8">un.</div>
          </div>
          <div style="font-size:12px;color:var(--red);font-weight:600;line-height:1.6">
            ⏱ Aviso às ${a.hora_aviso||'—'}<br>
            👤 ${a.separador_nome||'—'}
            ${a.obs?'<br>📝 '+a.obs:''}
          </div>
        </div>
        <!-- Campo qtde encontrada -->
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;background:#fff;border:1.5px solid #FDE68A;border-radius:10px;padding:10px 12px">
          <span style="font-size:12px;color:var(--amber);font-weight:700;white-space:nowrap">Qtde encontrada:</span>
          <input type="number" style="flex:1;padding:8px;background:transparent;border:none;outline:none;font-size:22px;font-weight:800;font-family:'Space Mono',monospace;color:var(--text);text-align:center;min-width:0"
            id="m-qtd-enc-${a.id}" min="0" max="${a.quantidade||99}" value="" placeholder="0" inputmode="numeric"/>
          <span style="font-size:12px;color:var(--text3);white-space:nowrap">de <b>${a.quantidade||'?'}</b></span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-bottom:8px">
          <button style="padding:11px 4px;background:#16A34A;color:#fff;border:none;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;display:flex;flex-direction:column;align-items:center;gap:3px" onclick="marcarAvisoMobile(${a.id},${a.quantidade||0},'separado')"><span style="font-size:17px">✅</span>Separado</button>
          <button style="padding:11px 4px;background:#0D9488;color:#fff;border:none;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;display:flex;flex-direction:column;align-items:center;gap:3px" onclick="marcarAvisoMobile(${a.id},${a.quantidade||0},'subiu')"><span style="font-size:17px">⬆️</span>Subiu</button>
          <button style="padding:11px 4px;background:#2563EB;color:#fff;border:none;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;display:flex;flex-direction:column;align-items:center;gap:3px" onclick="marcarAvisoMobile(${a.id},${a.quantidade||0},'abastecido')"><span style="font-size:17px">📦</span>Abastecido</button>
          <button style="padding:11px 4px;background:#6366F1;color:#fff;border:none;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;display:flex;flex-direction:column;align-items:center;gap:3px" onclick="marcarAvisoMobile(${a.id},0,'verificando')"><span style="font-size:17px">🔍</span>Verificando</button>
          <button style="padding:11px 4px;background:#D97706;color:#fff;border:none;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;display:flex;flex-direction:column;align-items:center;gap:3px" onclick="marcarAvisoMobile(${a.id},0,'protocolo')"><span style="font-size:17px">📋</span>Protocolo</button>
          <button style="padding:11px 4px;background:#7C3AED;color:#fff;border:none;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;display:flex;flex-direction:column;align-items:center;gap:3px" onclick="marcarAvisoMobile(${a.id},0,'devolucao')"><span style="font-size:17px">↩️</span>Devolução</button>
        </div>
        ` : '<div style="margin-top:4px">' +
          (isEnc   ? '<div style="font-size:13px;color:var(--green);font-weight:700">✅ Separado às '+(a.hora_reposto||'—')+(a.qtd_encontrada>0?' — '+a.qtd_encontrada+' un.':'')+(a.repositor_nome?' 👤 '+a.repositor_nome:'')+'</div>' : '') +
          (isSubiu ? '<div style="font-size:13px;color:#0D9488;font-weight:700">⬆️ Subiu às '+(a.hora_reposto||'—')+(a.qtd_encontrada>0?' — '+a.qtd_encontrada+' un.':'')+(a.repositor_nome?' 👤 '+a.repositor_nome:'')+'</div>' : '') +
          (isAbast ? '<div style="font-size:13px;color:var(--accent);font-weight:700">📦 Abastecido às '+(a.hora_reposto||'—')+(a.qtd_encontrada>0?' — '+a.qtd_encontrada+' un.':'')+(a.repositor_nome?' 👤 '+a.repositor_nome:'')+'</div>' : '') +
          (isNE    ? '<div style="font-size:13px;color:var(--indigo);font-weight:700">🚫 Não encontrado às '+(a.hora_reposto||'—')+'</div>' : '') +
          (isProto ? '<div style="font-size:13px;color:var(--amber);font-weight:700">📋 Protocolo às '+(a.hora_reposto||'—')+'</div>' : '') +
          (a.obs   ? '<div style="font-size:11px;color:var(--text2);margin-top:3px">📝 '+a.obs+'</div>' : '') +
          `<div id="hist-mob-${a.id}" style="margin-top:6px"></div>` +
          '</div>'}
      </div>`;
    }).join('');
    lista.innerHTML = html;
    // Carrega histórico de etapas de cada aviso
    for (const a of avisos) { carregarHistoricoAviso(a.id, `hist-mob-${a.id}`); }
  } catch(e) {
 }
}

async function carregarAvisosSeparador() {
  if (!separadorAtual) return;
  const lista = document.getElementById('sep-avisos-lista');
  if (!lista) return;
  try {
    const res  = await fetch(`${API}/repositor/avisos/separador/${separadorAtual.id}`, { credentials:'include' });
    const avisos = await res.json();
    // Atualiza badge
    const badge = document.getElementById('stab-avisos-sep-badge');
    if (badge) { badge.textContent = avisos.length; badge.style.display = avisos.length > 0 ? 'inline' : 'none'; }
    if (!avisos.length) {
      lista.innerHTML = '<div style="color:var(--text3);text-align:center;padding:40px;font-size:13px">✅ Nenhum aviso do repositor hoje</div>';
      return;
    }
    lista.innerHTML = avisos.map(a => {
      const isSubiu = a.status === 'subiu';
      const isAbast = a.status === 'abastecido';
      const bg    = isSubiu ? '#F0FDF4' : '#EFF6FF';
      const bord  = isSubiu ? '#BBF7D0' : '#BFDBFE';
      const icon  = isSubiu ? '⬆️' : '📦';
      const label = isSubiu ? 'SUBIU' : 'ABASTECIDO';
      const cor   = isSubiu ? 'var(--green)' : 'var(--accent)';
      return `
      <div style="background:${bg};border:2px solid ${bord};border-radius:14px;padding:14px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <div style="font-size:30px">${icon}</div>
          <div>
            <div style="font-size:12px;font-weight:800;color:${cor};letter-spacing:1px">${label}</div>
            <div style="font-size:11px;color:var(--text3)">Pedido <b style="color:var(--text)">#${a.numero_pedido}</b> &nbsp;•&nbsp; ${a.hora_reposto||'—'}</div>
          </div>
        </div>
        <div style="font-size:16px;font-weight:800;color:var(--accent);font-family:'Space Mono',monospace">${a.codigo||'—'}</div>
        <div style="font-size:13px;font-weight:600;color:var(--text);margin:4px 0">${a.descricao||'—'}</div>
        <div style="font-size:12px;color:var(--text2)">📍 <b>${a.endereco||'—'}</b> &nbsp;•&nbsp; Qtde: <b>${a.qtd_encontrada||a.quantidade||1}</b></div>
        ${a.repositor_nome ? `<div style="font-size:11px;color:var(--text3);margin-top:4px">👷 ${a.repositor_nome}</div>` : ''}
      </div>`;
    }).join('');
  } catch(e) {
    lista.innerHTML = '<div style="color:var(--red);text-align:center;padding:20px">Erro ao carregar avisos</div>';
  }
}

async function atualizarBadgeRep() {
  try {
    const res = await fetch(`${API}/repositor/avisos?status=pendente`, { credentials:'include' });
    const av  = await res.json();
    const n   = av.length;
    ['menu-badge-rep','dash-repositor'].forEach(id => {
      const el = document.getElementById(id); if (!el) return;
      if (id.includes('badge')) { el.textContent=n; el.style.display=n>0?'inline':'none'; }
      else el.textContent = n;
    });
  } catch(e) {}
}

async function carregarHistoricoAviso(avisoId, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  try {
    const res  = await fetch(`${API}/repositor/historico/${avisoId}`, { credentials:'include' });
    const rows = await res.json();
    if (!rows.length) return;
    const etapaLabel = {
    separado:'✅ Separado', subiu:'⬆️ Subiu', abastecido:'📦 Abastecido',
    verificando:'🔍 Verificando', protocolo:'📋 Protocolo', devolucao:'↩️ Devolução',
    encontrado:'✅ Separado', nao_encontrado:'🚫 Não encontrado'
  };
    const etapaCor = {
      separado:'#16A34A', subiu:'#0D9488', abastecido:'#2563EB',
      verificando:'#6366F1', protocolo:'#D97706', devolucao:'#7C3AED',
      encontrado:'#16A34A', nao_encontrado:'#DC2626'
    };
    el.innerHTML = `
      <div style="border-top:1px solid var(--border);padding-top:8px;margin-top:4px">
        <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:1px;margin-bottom:6px">HISTÓRICO DE ETAPAS</div>
        ${rows.map(r => `
          <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
            <div style="width:8px;height:8px;border-radius:50%;background:${etapaCor[r.etapa]||'var(--text3)'};flex-shrink:0"></div>
            <div style="flex:1;min-width:0">
              <span style="font-size:12px;font-weight:700;color:${etapaCor[r.etapa]||'var(--text2)'}">
                ${etapaLabel[r.etapa]||r.etapa}
              </span>
              ${r.qtd_encontrada > 0 ? `<span style="font-size:11px;color:var(--text3)"> — ${r.qtd_encontrada} un.</span>` : ''}
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-size:11px;font-weight:700;color:var(--text2)">${r.funcionario||'—'}</div>
              <div style="font-size:10px;color:var(--text3)">${r.hora||'—'}</div>
            </div>
          </div>`).join('')}
      </div>`;
  } catch(e) {}
}

async function carregarHistoricoDia() {
  const lista = document.getElementById('rep-tab-historico-lista');
  if (!lista) return;
  lista.innerHTML = '<div style="color:var(--text3);text-align:center;padding:24px">Carregando...</div>';
  try {
    const res  = await fetch(`${API}/repositor/historico-dia`, { credentials:'include' });
    let rows = await res.json();
    const nomeAtual = usuarioAtual?.nome || '';
    if (nomeAtual) rows = rows.filter(r => r.funcionario === nomeAtual);
    const lblEl = document.getElementById('m-hist-user-label');
    if (lblEl) lblEl.textContent = nomeAtual ? `👤 ${nomeAtual} — ações de hoje` : 'Suas ações de hoje';
    if (!rows.length) {
      lista.innerHTML = '<div style="color:var(--text3);text-align:center;padding:36px;font-size:14px">Nenhuma etapa registrada hoje</div>';
      return;
    }
    const etapaIcon = { separado:'✅', subiu:'⬆️', abastecido:'📦', verificando:'🔍', protocolo:'📋', devolucao:'↩️', encontrado:'✅', nao_encontrado:'🚫' };
    const etapaColor = { separado:'#16A34A', subiu:'#0D9488', abastecido:'#2563EB', verificando:'#6366F1', protocolo:'#D97706', devolucao:'#7C3AED', encontrado:'#16A34A', nao_encontrado:'#DC2626' };
    const etapaLabel = { separado:'Separado', subiu:'Subiu', abastecido:'Abastecido', verificando:'Verificando', protocolo:'Protocolo', devolucao:'Devolução', encontrado:'Encontrado', nao_encontrado:'Não encontrado' };
    lista.innerHTML = rows.map(r => `
      <div style="border:1.5px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:8px;background:var(--surface)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:20px">${etapaIcon[r.etapa]||'•'}</span>
            <span style="font-size:14px;font-weight:800;color:${etapaColor[r.etapa]||'var(--text)'}">${etapaLabel[r.etapa]||r.etapa}</span>
          </div>
          <span style="font-size:11px;color:var(--text3);font-family:'Space Mono',monospace">${r.hora||'—'}</span>
        </div>
        <div style="font-size:12px;font-weight:700;color:var(--accent);font-family:'Space Mono',monospace">Pedido #${r.numero_pedido||'—'}</div>
        <div style="font-size:13px;color:var(--text);margin:3px 0">${r.codigo||'—'} — ${r.descricao||'—'}</div>
        <div style="font-size:11px;color:var(--text3)">📍 ${r.endereco||'—'}${r.qtd_encontrada>0?' &nbsp;•&nbsp; Qtde: <b>'+r.qtd_encontrada+'</b>':''}</div>
        <div style="margin-top:6px;padding:5px 10px;background:var(--surface2);border-radius:8px;font-size:12px;font-weight:700;color:var(--text2)">
          👤 ${r.funcionario||'—'}
        </div>
      </div>`).join('');
  } catch(e) {
    lista.innerHTML = '<div style="color:var(--red);text-align:center;padding:20px">Erro ao carregar</div>';
  }
}

async function carregarParaGuardar() {
  const lista = document.getElementById('rep-para-guardar-lista');
  if (!lista) return;
  lista.innerHTML = '<div style="color:var(--text3);text-align:center;padding:28px">Carregando...</div>';
  try {
    const res  = await fetch(`${API}/repositor/para-guardar`, { credentials:'include' });
    const rows = await res.json();

    const badge = document.getElementById('stab-guardar-badge') || document.getElementById('rtab-guardar-badge');
    if (badge) { badge.textContent = rows.length; badge.style.display = rows.length > 0 ? 'inline' : 'none'; }

    if (!rows.length) {
      lista.innerHTML = '<div style="color:var(--text3);text-align:center;padding:40px;font-size:14px">✅ Nenhum item aguardando ser guardado</div>';
      return;
    }

    lista.innerHTML = rows.map(r => {
      const etapas = r.etapas || [];
      const etapaLabel = {separado:'✅ Separado',subiu:'⬆️ Subiu',abastecido:'📦 Abastecido',verificando:'🔍 Verificando',protocolo:'📋 Protocolo',devolucao:'↩️ Devolução',encontrado:'✅ Separado'};
      const etapaCor   = {separado:'#16A34A',subiu:'#0D9488',abastecido:'#2563EB',verificando:'#6366F1',protocolo:'#D97706',encontrado:'#16A34A'};

      const etapasHtml = etapas.map((e,i) => `
        <div style="display:flex;align-items:center;gap:8px;padding:5px 0;${i<etapas.length-1?'border-bottom:1px solid var(--border)':''}">
          <div style="width:8px;height:8px;border-radius:50%;background:${etapaCor[e.etapa]||'var(--text3)'};flex-shrink:0"></div>
          <div style="flex:1;font-size:12px;font-weight:700;color:${etapaCor[e.etapa]||'var(--text2)'}">
            ${etapaLabel[e.etapa]||e.etapa}
          </div>
          <div style="text-align:right">
            <div style="font-size:12px;font-weight:700;color:var(--text2)">👤 ${e.funcionario||'—'}</div>
            <div style="font-size:10px;color:var(--text3);font-family:'Space Mono',monospace">${e.hora||'—'}</div>
          </div>
        </div>`).join('');

      return `
      <div style="background:var(--surface);border:1.5px solid #99F6E4;border-radius:14px;padding:14px;margin-bottom:12px;box-shadow:var(--sh)">
        <!-- Header do item -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-size:15px;font-weight:800;color:var(--teal,#0D9488);font-family:'Space Mono',monospace">${r.codigo||'—'}</span>
              <span style="font-size:12px;color:var(--text3)">Pedido <b style="color:var(--text)">#${r.numero_pedido}</b></span>
            </div>
            <div style="font-size:13px;color:var(--text);margin:4px 0;line-height:1.3;font-weight:500">${r.descricao||'—'}</div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px">
              <span style="font-size:15px;font-weight:800;color:var(--accent);background:rgba(37,99,235,.1);padding:3px 12px;border-radius:7px;border:1px solid rgba(37,99,235,.2)">📍 ${r.endereco||'—'}</span>
              <span style="background:#0D9488;color:#fff;border-radius:7px;padding:3px 10px;font-size:13px;font-weight:800;font-family:'Space Mono',monospace">x${r.quantidade||1}</span>
            </div>
          </div>
          <!-- Destaque SUBIU -->
          <div style="text-align:center;background:#F0FDFA;border:1.5px solid #99F6E4;border-radius:10px;padding:8px 12px;flex-shrink:0">
            <div style="font-size:10px;font-weight:700;color:#0D9488;letter-spacing:1px">SUBIU</div>
            <div style="font-size:22px">⬆️</div>
            <div style="font-size:10px;color:var(--text3)">${r.hora_reposto||'—'}</div>
          </div>
        </div>

        <!-- Histórico de etapas -->
        <div style="background:var(--surface2);border-radius:10px;padding:10px 12px;margin-bottom:10px">
          <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:1.5px;margin-bottom:8px;text-transform:uppercase">Histórico</div>
          ${etapasHtml}
        </div>

        <!-- Botão GUARDAR (Abastecer) -->
        <button onclick="guardarItem(${r.id},${r.quantidade||1})"
          style="width:100%;padding:13px;background:linear-gradient(135deg,#2563EB,#6366F1);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:800;cursor:pointer;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px">
          <span style="font-size:20px">📦</span> Guardar no Estoque (Abastecer)
        </button>
      </div>`;
    }).join('');
  } catch(e) {
    if (lista) lista.innerHTML='<div style="color:var(--red);text-align:center;padding:20px">Erro ao carregar</div>';
  }
}

async function guardarItem(avisoId, qtd) {
  const nome = usuarioAtual?.nome || '';
  try {
    const res  = await fetch(`${API}/repositor/avisos/${avisoId}/abastecido`, {
      method:'PUT', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ qtd_encontrada: qtd, repositor_nome: nome })
    });
    const data = await res.json();
    if (data.erro) { toast(data.erro,'erro'); return; }
    toast('📦 Item guardado no estoque!','sucesso');
    carregarParaGuardar();
    carregarAvisosMobile && carregarAvisosMobile();
  } catch(e) { toast('Erro!','erro'); }
}

async function marcarAviso(id, qtdTotal, acao) {
  if ((acao==='nao_encontrado'||acao==='protocolo') && !confirm(`Confirmar: ${acao==='nao_encontrado'?'Não encontrado':'Protocolo'}? O supervisor será notificado.`)) return;
  const input  = document.getElementById(`qtd-enc-${id}`);
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
    carregarAvisos();
  } catch(e) { toast('Erro!','erro'); }
}

async function marcarAvisoMobile(id, qtdTotal, acao) {
  if ((acao==='protocolo'||acao==='devolucao') && !confirm(`Confirmar: ${acao==='protocolo'?'Protocolo':'Devolução'}? O supervisor será notificado.`)) return;
  const input  = document.getElementById(`m-qtd-enc-${id}`);
  const qtdEnc = ['nao_encontrado','protocolo','verificando','devolucao'].includes(acao) ? 0 : (parseInt(input?.value) || qtdTotal || 0);
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

async function marcarReposto(id,q){ await marcarAviso(id,q,'encontrado'); }

async function marcarRepostoMobile(id, qtdTotal) { await marcarAvisoMobile(id, qtdTotal, 'encontrado'); }

async function marcarNaoEncontrado(id){ await marcarAviso(id,0,'nao_encontrado'); }

async function marcarNaoEncontradoMobile(id) { await marcarAvisoMobile(id, 0, 'nao_encontrado'); }

async function marcarProtocolo(id){ await marcarAviso(id,0,'protocolo'); }

async function marcarProtocoloMobile(id) { await marcarAvisoMobile(id, 0, 'protocolo'); }

async function carregarStatsRepositor() {
  try {
    const ini = document.getElementById('srep-ini')?.value || '';
    const fim = document.getElementById('srep-fim')?.value || '';
    const res  = await fetch(`${API}/estatisticas/repositor`, { credentials:'include' });
    const data = await res.json();
    const set  = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val ?? 0; };
    set('srep-rep-hoje',  data.repostos_hoje);
    set('srep-rep-mes',   data.repostos_mes);
    set('srep-pendentes', data.pendentes_total);
    set('srep-nao-enc',   data.nao_encontrados);
    set('srep-proto',     data.protocolos);
    set('srep-ano',       data.avisos_ano);
    const tbody = document.getElementById('tbody-srep-prod');
    if (tbody) {
      const prod = data.produtividade || [];
      if (!prod.length) { tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text3);text-align:center;padding:20px">Nenhum repositor com atividade</td></tr>'; }
      else tbody.innerHTML = prod.map(d=>`<tr>
        <td style="font-weight:600;color:var(--text)">${d.nome||'—'}</td>
        <td style="color:var(--green);font-weight:700">${d.hoje||0}</td>
        <td style="color:var(--accent)">${d.repostos||0}</td>
        <td style="color:var(--red)">${d.nao_encontrados||0}</td>
        <td style="color:var(--text2)">${d.total||0}</td>
      </tr>`).join('');
    }
  } catch(e) { toast('Erro ao carregar estatísticas de reposição!','erro'); }
}

async function carregarStatsRepMobile() {
  try {
    const nomeEl = document.getElementById('m-rep-nome');
    if (nomeEl) nomeEl.textContent = `👤 ${usuarioAtual?.nome || '—'}`;
    const nomeRep = usuarioAtual?.nome || '';
    const urlStats = nomeRep ? `${API}/estatisticas/repositor?repositor_nome=${encodeURIComponent(nomeRep)}` : `${API}/estatisticas/repositor`;
    const res  = await fetch(urlStats, { credentials:'include' });
    const data = await res.json();
    const set  = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val ?? 0; };
    set('m-rep-hoje',      data.repostos_hoje);
    set('m-rep-mes',       data.repostos_mes);
    set('m-rep-pendentes', data.pendentes_total);
  } catch(e) {}
}

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

function exportarAvisosExcel() {
  try {
    // Collect from current avisos state via the carregarAvisos data
    const rows = [['Código','Descrição','Endereço','Pedido','Qtde','Status','Hora Aviso']];
    document.querySelectorAll('#lista-avisos .aviso-card').forEach(card => {
      const cod    = card.querySelector('.aviso-cod')?.textContent?.trim().split('\n')[0]?.split(' ')[0] || '—';
      const pedido = card.querySelector('.aviso-cod span')?.textContent?.replace('Pedido #','').trim() || '—';
      const desc   = card.querySelector('.aviso-desc')?.textContent?.trim() || '—';
      const det    = card.querySelector('.aviso-det')?.textContent?.trim() || '';
      const cls    = [...card.classList].find(c => ['pendente','reposto','nao_encontrado','protocolo'].includes(c)) || '—';
      const hora   = card.querySelector('[style*="hora_aviso"], [style*="hora_reposto"]')?.textContent?.trim() || '—';
      rows.push([cod, desc, det, pedido, '', cls, hora]);
    });
    if (rows.length <= 1) { toast('Nenhum aviso para exportar!','aviso'); return; }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Avisos');
    XLSX.writeFile(wb, `avisos_reposicao_${hoje}.xlsx`);
    toast('✅ Excel exportado!','sucesso');
  } catch(e) { toast('Erro ao exportar!','erro'); }
}