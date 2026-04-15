/* ══ SUPERVISAO.JS ══ WMS Miess ══ */

async function carregarDashboard() {
  await popularSelects();
  await carregarKPIs();
  await carregarProdutividade();
  await carregarTimeline();
  await atualizarBadgeRep();
  const el = document.getElementById('dash-ultima-atualizacao');
  if (el) el.textContent = '— atualizado ' + new Date().toLocaleTimeString('pt-BR', {timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'});
}

async function carregarDashboardMobile() {
  try {
    // KPIs
    const res  = await fetch(`${API}/kpis`, { credentials:'include' });
    const data = await res.json();
    const set  = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v??0; };
    set('m-sup-hoje',   data.concluidos_hoje);
    set('m-sup-sep',    data.em_separacao);
    set('m-sup-faltas', data.faltas_abertas);
    set('m-sup-pend',   data.pendentes);
    set('m-sup-ck',     data.checkout_hoje);
    set('m-sup-ativos', data.seps_ativos);

    // Alertas
    const resA = await fetch(`${API}/alertas`, { credentials:'include' });
    const alertas = await resA.json();
    window._lastAlertas = alertas;

    const supAlertasEl = document.getElementById('sup-alertas-mobile');
    const supAlertasTxt = document.getElementById('sup-alertas-txt');
    if (supAlertasEl) {
      const total = (alertas.pedidos_bloqueados?.length||0) + (alertas.pedidos_travados?.length||0) + (alertas.faltas_sem_resposta?.length||0);
      supAlertasEl.style.display = total > 0 ? 'block' : 'none';
      if (supAlertasTxt) {
        let partes = [];
        if (alertas.pedidos_bloqueados?.length)  partes.push(`⛔ ${alertas.pedidos_bloqueados.length} bloqueado(s)`);
        if (alertas.pedidos_travados?.length)    partes.push(`⏱ ${alertas.pedidos_travados.length} travado(s)`);
        if (alertas.faltas_sem_resposta?.length) partes.push(`🔴 ${alertas.faltas_sem_resposta.length} falta(s) +30min`);
        supAlertasTxt.textContent = partes.join(' • ');
      }
    }

    // Pedidos travados
    const travWrap = document.getElementById('sup-travados-wrap');
    const travLista = document.getElementById('sup-travados-lista');
    if (travWrap && travLista) {
      if (alertas.pedidos_travados?.length) {
        travWrap.style.display = 'block';
        travLista.innerHTML = alertas.pedidos_travados.map(p=>`
          <div style="background:#FFFBEB;border:1.5px solid #FDE68A;border-radius:10px;padding:10px 12px;margin-bottom:6px">
            <div style="font-weight:700;color:var(--amber)">Pedido #${p.numero_pedido}</div>
            <div style="font-size:12px;color:var(--text3)">👤 ${p.separador_nome||'—'} &nbsp;•&nbsp; ${p.minutos>=60?Math.floor(p.minutos/60)+'h '+p.minutos%60+'min':p.minutos+'min'} em separação</div>
          </div>`).join('');
      } else travWrap.style.display = 'none';
    }

    // Pedidos bloqueados
    const bloqWrap  = document.getElementById('sup-bloq-wrap');
    const bloqLista = document.getElementById('sup-bloq-lista');
    if (bloqWrap && bloqLista) {
      if (alertas.pedidos_bloqueados?.length) {
        bloqWrap.style.display = 'block';
        const badge = document.getElementById('stab-sup-rep-badge');
        if (badge) { badge.textContent=alertas.pedidos_bloqueados.length; badge.style.display='inline'; }
        bloqLista.innerHTML = alertas.pedidos_bloqueados.map(p=>`
          <div style="background:#FEF2F2;border:1.5px solid #FECACA;border-radius:10px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;gap:8px">
            <div>
              <div style="font-weight:700;color:var(--red)">Pedido #${p.numero_pedido}</div>
              <div style="font-size:12px;color:var(--text3)">👤 ${p.separador_nome||'—'}</div>
            </div>
            <button class="btn btn-success btn-sm" onclick="desbloquearPedido(${p.id},'${p.numero_pedido}')">✅</button>
          </div>`).join('');
      } else { bloqWrap.style.display='none'; }
    }
  } catch(e) {}
}

function mudarTabSup(tab) {
  ['dashboard','pedidos','reposicao'].forEach(t => {
    const pg = document.getElementById(`sup-tab-${t}`); if(pg) pg.classList.toggle('ativa', t===tab);
    const bt = document.getElementById(`stab-sup-${t}`); if(bt) bt.classList.toggle('ativo', t===tab);
  });
  if (tab==='dashboard') carregarDashboardMobile();
  if (tab==='pedidos')   carregarPedidosMobile();
  if (tab==='reposicao') carregarReposicaoMobile();
}

function ativarMobileSup() {
  document.body.classList.add('sep-mobile');
  document.getElementById('sup-mobile-root').style.display = 'flex';
  document.getElementById('sup-tabbar').style.display = 'flex';
  mudarTabSup('dashboard');
  carregarDashboardMobile();
  carregarAlertas();
  alertaInterval = setInterval(() => {
    carregarDashboardMobile();
    carregarAlertas();
  }, 30000);
}

async function carregarPedidosMobile() {
  const lista  = document.getElementById('sup-pedidos-lista');
  const status = document.getElementById('m-filtro-ped-status')?.value || '';
  if (!lista) return;
  try {
    let url = `${API}/pedidos`;
    if (status) url += `?status=${status}`;
    const res = await fetch(url, { credentials:'include' });
    const ps  = await res.json();
    if (!ps.length) { lista.innerHTML='<div style="color:var(--text3);text-align:center;padding:30px">Nenhum pedido</div>'; return; }
    lista.innerHTML = ps.slice(0,50).map(p=>`
      <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:8px;box-shadow:var(--sh)">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-family:'Space Mono',monospace;font-weight:700;font-size:15px;color:var(--accent)">#${p.numero_pedido}</div>
            <div style="font-size:12px;color:var(--text3);margin-top:2px">👤 ${p.separador_nome||'—'} &nbsp;•&nbsp; ${p.itens||0} itens &nbsp;•&nbsp; ${p.hora_pedido||'—'}</div>
          </div>
          <span class="pill ${p.status}">${p.status}</span>
        </div>
      </div>`).join('');
  } catch(e) {}
}

async function carregarReposicaoMobile() {
  const lista = document.getElementById('sup-rep-lista');
  if (!lista) return;
  try {
    const res    = await fetch(`${API}/repositor/avisos`, { credentials:'include' });
    const avisos = await res.json();
    const pend   = avisos.filter(a=>a.status==='pendente').length;
    const badge  = document.getElementById('stab-sup-rep-badge');
    if (badge) { badge.textContent=pend; badge.style.display=pend>0?'inline':'none'; }
    if (!avisos.length) { lista.innerHTML='<div style="color:var(--text3);text-align:center;padding:30px">✅ Nenhum aviso</div>'; return; }
    const sIcon = s=>({pendente:'🔴',encontrado:'✅',separado:'✅',subiu:'⬆️',abastecido:'📦',verificando:'🔍',protocolo:'📋',devolucao:'↩️',nao_encontrado:'🚫'}[s]||'•');
    lista.innerHTML = avisos.map(a=>`
      <div style="background:var(--surface);border:1.5px solid ${a.status==='pendente'?'#FECACA':'var(--border)'};border-radius:12px;padding:12px 14px;margin-bottom:8px;background:${a.status==='pendente'?'#FEF2F2':'var(--surface)'}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;color:${a.status==='pendente'?'var(--red)':'var(--green)'};font-size:13px">${sIcon(a.status)} ${a.codigo||'—'} <span style="font-size:11px;color:var(--text3);font-weight:400">Pedido #${a.numero_pedido}</span></div>
            <div style="font-size:12px;color:var(--text);margin:2px 0">${a.descricao||'—'}</div>
            <div style="font-size:11px;color:var(--text3)">📍 ${a.endereco||'—'} &nbsp;•&nbsp; Qtde: ${a.quantidade||1}</div>
            ${a.status==='pendente'?`<div style="font-size:11px;color:var(--red);font-weight:600;margin-top:3px">⏱ ${a.hora_aviso||'—'} &nbsp;•&nbsp; Sep: ${a.separador_nome||'—'}</div>`:''}
          </div>
        </div>
      </div>`).join('');
  } catch(e) {}
}

async function carregarAlertas() {
  if (usuarioAtual?.perfil !== 'supervisor') return;
  try {
    const res  = await fetch(`${API}/alertas`, { credentials:'include' });
    const data = await res.json();
    renderAlertasBanner(data);
  } catch(e) {}
}

function renderAlertasBanner(data) {
  let banner = document.getElementById('alertas-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'alertas-banner';
    // Insere depois do header
    const header = document.querySelector('header');
    if (header?.nextSibling) header.parentNode.insertBefore(banner, header.nextSibling);
    else document.body.prepend(banner);
  }

  const total = (data.pedidos_bloqueados?.length||0) + (data.pedidos_travados?.length||0) + (data.faltas_sem_resposta?.length||0);
  if (!data.tem_alerta || total === 0) { banner.style.display='none'; return; }

  banner.style.cssText = 'display:block;background:linear-gradient(135deg,#7F1D1D,#991B1B);color:#fff;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;z-index:49;animation:pulseAlert 2s infinite';
  banner.onclick = () => mostrarModalAlertas(data);

  let partes = [];
  if (data.pedidos_bloqueados?.length)  partes.push(`⛔ ${data.pedidos_bloqueados.length} pedido(s) bloqueado(s)`);
  if (data.pedidos_travados?.length)    partes.push(`⏱ ${data.pedidos_travados.length} pedido(s) travado(s) +30min`);
  if (data.faltas_sem_resposta?.length) partes.push(`🔴 ${data.faltas_sem_resposta.length} falta(s) sem resposta +30min`);

  banner.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;max-width:1200px;margin:0 auto">
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-size:20px;animation:pulseAlert 1s infinite">🚨</span>
        <span>${partes.join(' &nbsp;•&nbsp; ')}</span>
      </div>
      <span style="font-size:11px;opacity:.8;text-decoration:underline">Clique para ver detalhes →</span>
    </div>`;
}

function mostrarModalAlertas(data) {
  let modal = document.getElementById('alertas-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'alertas-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9998;display:flex;align-items:center;justify-content:center;padding:20px';
    modal.onclick = (e) => { if(e.target===modal) modal.style.display='none'; };
    document.body.appendChild(modal);
  }

  const fmtMin = (m) => m >= 60 ? `${Math.floor(m/60)}h ${m%60}min` : `${m}min`;

  let html = `<div style="background:var(--surface);border-radius:16px;padding:24px;max-width:600px;width:100%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.4)">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <div style="font-family:'Space Mono',monospace;font-size:17px;color:var(--text)">🚨 Alertas Ativos</div>
      <button onclick="document.getElementById('alertas-modal').style.display='none'" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text3)">✕</button>
    </div>`;

  if (data.pedidos_bloqueados?.length) {
    html += `<div style="margin-bottom:16px">
      <div style="font-size:11px;font-weight:800;color:var(--red);letter-spacing:1.5px;margin-bottom:8px">⛔ PEDIDOS BLOQUEADOS</div>
      ${data.pedidos_bloqueados.map(p=>`
        <div style="background:#FEF2F2;border:1.5px solid #FECACA;border-radius:10px;padding:10px 14px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-weight:700;color:var(--red)">Pedido #${p.numero_pedido}</div>
            <div style="font-size:12px;color:var(--text3)">👤 ${p.separador_nome||'—'} &nbsp;•&nbsp; Itens: ${p.codigos||'—'}</div>
          </div>
          <button class="btn btn-success btn-sm" onclick="desbloquearPedido(${p.id},'${p.numero_pedido}');document.getElementById('alertas-modal').style.display='none'">✅ Liberar</button>
        </div>`).join('')}
    </div>`;
  }

  if (data.pedidos_travados?.length) {
    html += `<div style="margin-bottom:16px">
      <div style="font-size:11px;font-weight:800;color:var(--amber);letter-spacing:1.5px;margin-bottom:8px">⏱ PEDIDOS TRAVADOS (+30 MIN)</div>
      ${data.pedidos_travados.map(p=>`
        <div style="background:#FFFBEB;border:1.5px solid #FDE68A;border-radius:10px;padding:10px 14px;margin-bottom:6px">
          <div style="font-weight:700;color:var(--amber)">Pedido #${p.numero_pedido} — ${fmtMin(p.minutos)}</div>
          <div style="font-size:12px;color:var(--text3)">👤 ${p.separador_nome||'—'} &nbsp;•&nbsp; Iniciou às ${p.hora_pedido||'—'}</div>
        </div>`).join('')}
    </div>`;
  }

  if (data.faltas_sem_resposta?.length) {
    html += `<div style="margin-bottom:16px">
      <div style="font-size:11px;font-weight:800;color:var(--red);letter-spacing:1.5px;margin-bottom:8px">🔴 FALTAS SEM RESPOSTA (+30 MIN)</div>
      ${data.faltas_sem_resposta.map(a=>`
        <div style="background:#FEF2F2;border:1.5px solid #FECACA;border-radius:10px;padding:10px 14px;margin-bottom:6px">
          <div style="font-weight:700;color:var(--red)">${a.codigo} — ${a.descricao||'—'}</div>
          <div style="font-size:12px;color:var(--text3)">Pedido #${a.numero_pedido} &nbsp;•&nbsp; Aviso às ${a.hora_aviso||'—'} &nbsp;•&nbsp; ${fmtMin(a.minutos)} sem resposta</div>
        </div>`).join('')}
    </div>`;
  }

  html += `<div style="text-align:center;margin-top:8px">
    <button class="btn btn-outline" onclick="document.getElementById('alertas-modal').style.display='none'">Fechar</button>
  </div></div>`;

  modal.innerHTML = html;
  modal.style.display = 'flex';
}

async function carregarKPIs() {
  try {
    const res  = await fetch(`${API}/kpis`, { credentials:'include' });
    const data = await res.json();
    const set  = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val ?? 0; };
    set('dash-hoje',       data.concluidos_hoje);
    set('dash-separando',  data.em_separacao);
    set('dash-repositor',  data.faltas_abertas);
    set('dash-pendentes',  data.pendentes);
    set('kpi-ck-hoje',     data.checkout_hoje);
    set('kpi-ck-pend',     data.checkout_pendente);
    set('kpi-seps-ativos', data.seps_ativos);
    set('kpi-nao-enc',     data.nao_encontrados_hoje);
  } catch(e) {}
}

async function carregarTimeline() {
  try {
    const data = document.getElementById('filtro-tl-data').value || hoje;
    const res  = await fetch(`${API}/pedidos?data=${data}`, { credentials:'include' });
    const ps   = await res.json();
    const el   = document.getElementById('tl-lista');
    if (!ps.length) { el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:24px;font-size:13px">Nenhum pedido nesta data</div>'; return; }
    const sorted = [...ps].sort((a,b) => (a.hora_pedido||'').localeCompare(b.hora_pedido||''));
    el.innerHTML = sorted.map(p => `
      <div class="tl-item">
        <div class="tl-hora">${p.hora_pedido||'--:--'}</div>
        <div class="tl-dot ${p.status}"></div>
        <div style="flex:1">
          <div class="tl-titulo">Pedido #${p.numero_pedido}</div>
          <div class="tl-sub">${p.separador_nome||'Sem usuário'} &nbsp;•&nbsp; <span class="pill ${p.status}" style="font-size:9px;padding:2px 7px">${p.status}</span> &nbsp;•&nbsp; ${p.itens||0} itens &nbsp;•&nbsp; ${formatarData(p.data_pedido)}</div>
        </div>
      </div>`).join('');
  } catch(e) {}
}

async function carregarProdutividade() {
  try {
    const sepId = document.getElementById('filtro-sep-prod').value;
    const res   = await fetch(`${API}/produtividade${sepId?'?separador_id='+sepId:''}`, { credentials:'include' });
    const dados = await res.json();
    const tbody = document.getElementById('tbody-prod');
    if (!dados.length) { tbody.innerHTML = '<tr><td colspan="6" style="color:var(--text3);text-align:center;padding:20px">Nenhum usuário</td></tr>'; return; }
    const max = Math.max(...dados.map(d=>d.hoje||0), 1);
    // Busca metas
    let metaPontos = 200, metaPedidos = 30;
    try {
      const cfgRes = await fetch(`${API}/configuracoes`, { credentials:'include' });
      const cfg = await cfgRes.json();
      metaPontos  = parseInt(cfg.meta_pontos_dia)  || 200;
      metaPedidos = parseInt(cfg.meta_pedidos_dia) || 30;
    } catch(e) {}

    const maxPontos = Math.max(...dados.map(d=>d.pontos_hoje||0), metaPontos);
    tbody.innerHTML = dados.map(d=>{
      const pctPedidos = Math.min(Math.round(((d.hoje||0)/metaPedidos)*100),100);
      const pctPontos  = Math.min(Math.round(((d.pontos_hoje||0)/metaPontos)*100),100);
      const corPed = pctPedidos>=100?'var(--green)':pctPedidos>=70?'var(--amber)':'var(--accent)';
      const corPts = pctPontos>=100?'var(--green)':pctPontos>=70?'var(--amber)':'var(--accent)';
      return `<tr>
        <td style="font-weight:600;color:var(--text)">${d.nome}</td>
        <td style="color:var(--green);font-weight:700">${d.hoje||0}</td>
        <td style="color:var(--amber)">${d.mes||0}</td>
        <td style="color:var(--accent)">${d.total_ano||0}</td>
        <td style="min-width:140px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span style="font-size:10px;color:var(--text3);white-space:nowrap">📦 ${d.hoje||0}/${metaPedidos}</span>
            <div class="prod-bar" style="flex:1"><div class="prod-bar-fill" style="width:${pctPedidos}%;background:${corPed}"></div></div>
            <span style="font-size:10px;font-weight:700;color:${corPed}">${pctPedidos}%</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:10px;color:var(--text3);white-space:nowrap">⚡ ${d.pontos_hoje||0}/${metaPontos}</span>
            <div class="prod-bar" style="flex:1"><div class="prod-bar-fill" style="width:${pctPontos}%;background:${corPts}"></div></div>
            <span style="font-size:10px;font-weight:700;color:${corPts}">${pctPontos}%</span>
          </div>
        </td>
        <td><span class="pill ${d.status}">${d.status}</span></td>
      </tr>`;
    }).join('');
  } catch(e) {}
}

async function carregarEstatisticas() {
  try {
    const ini = document.getElementById('est-ini')?.value || '';
    const fim = document.getElementById('est-fim')?.value || '';
    let url = `${API}/estatisticas/pedidos`;
    if (ini && fim) url += `?data_ini=${ini}&data_fim=${fim}`;
    const res  = await fetch(url, { credentials:'include' });
    const data = await res.json();

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? 0; };
    set('est-hoje-c', data.concluidos_hoje);
    set('est-hoje-t', data.total_hoje);
    set('est-mes-c',  data.concluidos_mes);
    set('est-mes-t',  data.total_mes);
    set('est-ano-c',  data.concluidos_ano);
    set('est-ano-t',  data.total_ano);

    const periodoWrap = document.getElementById('est-periodo-wrap');
    if (ini && fim && periodoWrap) {
      periodoWrap.style.display = 'block';
      set('est-per-c', data.concluidos_periodo);
      set('est-per-t', data.total_periodo);
    } else if (periodoWrap) {
      periodoWrap.style.display = 'none';
    }

    // Produtividade por separador
    const res2   = await fetch(`${API}/produtividade`, { credentials:'include' });
    const prods  = await res2.json();
    const tbody  = document.getElementById('tbody-est-sep');
    if (tbody) {
      if (!prods.length) { tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text3);text-align:center;padding:20px">Nenhum separador</td></tr>'; }
      else tbody.innerHTML = prods.map(d => `<tr>
        <td style="font-weight:600;color:var(--text)">${d.nome}</td>
        <td style="color:var(--green);font-weight:700">${d.hoje||0}</td>
        <td style="color:var(--amber)">${d.mes||0}</td>
        <td style="color:var(--accent)">${d.total_ano||0}</td>
        <td><span class="pill ${d.status}">${d.status}</span></td>
      </tr>`).join('');
    }
  } catch(e) { toast('Erro ao carregar estatísticas!','erro'); }
}

async function carregarHistoricoCompleto() {
  const lista = document.getElementById('hist-completo-lista');
  if (!lista) return;
  lista.innerHTML = '<div style="color:var(--text3);text-align:center;padding:24px">Carregando...</div>';
  try {
    const dataFiltro = document.getElementById('hist-completo-data')?.value || '';
    const funcFiltro = document.getElementById('hist-completo-func')?.value || '';
    const url = `${API}/repositor/historico-completo${dataFiltro?'?data='+dataFiltro:''}`;
    const res  = await fetch(url, { credentials:'include' });
    let rows   = await res.json();
    if (funcFiltro) rows = rows.filter(r => r.funcionario === funcFiltro);

    // Atualiza select de funcionários
    const funcs = [...new Set(rows.map(r=>r.funcionario).filter(Boolean))];
    const selFunc = document.getElementById('hist-completo-func');
    if (selFunc) {
      const cur = selFunc.value;
      selFunc.innerHTML = '<option value="">Todos os colaboradores</option>' +
        funcs.map(f=>`<option value="${f}"${f===cur?' selected':''}>${f}</option>`).join('');
    }

    if (!rows.length) { lista.innerHTML='<div style="color:var(--text3);text-align:center;padding:40px">Nenhuma etapa registrada</div>'; return; }

    const etapaLabel={separado:'✅ Separado',subiu:'⬆️ Subiu',abastecido:'📦 Abastecido',verificando:'🔍 Verificando',protocolo:'📋 Protocolo',devolucao:'↩️ Devolução',encontrado:'✅ Separado',nao_encontrado:'🚫 Não encontrado'};
    const etapaCor  ={separado:'#16A34A',subiu:'#0D9488',abastecido:'#2563EB',verificando:'#6366F1',protocolo:'#D97706',devolucao:'#7C3AED',encontrado:'#16A34A',nao_encontrado:'#DC2626'};
    const etapaBg   ={separado:'#F0FDF4',subiu:'#F0FDFA',abastecido:'#EFF6FF',verificando:'#F5F3FF',protocolo:'#FFFBEB',devolucao:'#FAF5FF',encontrado:'#F0FDF4',nao_encontrado:'#F5F3FF'};

    lista.innerHTML = rows.map(r=>`
      <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:12px;padding:12px 16px;margin-bottom:8px;display:flex;align-items:flex-start;gap:12px;box-shadow:var(--sh)">
        <span style="font-size:11px;font-weight:800;padding:4px 11px;border-radius:20px;white-space:nowrap;flex-shrink:0;margin-top:2px;background:${etapaBg[r.etapa]||'var(--surface2)'};color:${etapaCor[r.etapa]||'var(--text2)'};border:1px solid ${etapaCor[r.etapa]||'var(--border)'}40">
          ${etapaLabel[r.etapa]||r.etapa}
        </span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:700;color:var(--accent);font-family:'Space Mono',monospace">Pedido #${r.numero_pedido||'—'}</div>
          <div style="font-size:13px;color:var(--text);margin:2px 0">${r.codigo||'—'} — ${r.descricao||'—'}</div>
          <div style="font-size:11px;color:var(--text3)">📍 ${r.endereco||'—'}${r.qtd_encontrada>0?' &nbsp;•&nbsp; Qtde: <b>'+r.qtd_encontrada+'</b>':''}</div>
          <div style="margin-top:5px;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:rgba(37,99,235,.06);border-radius:8px;border:1px solid rgba(37,99,235,.15)">
            <span style="font-size:13px">👤</span>
            <span style="font-size:12px;font-weight:700;color:var(--accent)">${r.funcionario||'—'}</span>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:11px;color:var(--text3);font-family:'Space Mono',monospace">${r.hora||'—'}</div>
        </div>
      </div>`).join('');
  } catch(e) {
    if (lista) lista.innerHTML='<div style="color:var(--red);text-align:center;padding:20px">Erro ao carregar</div>';
  }
}