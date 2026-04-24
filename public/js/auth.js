/* ══════════════════════════════════════════
   LOGIN
══════════════════════════════════════════ */
let perfilSelecionado = '';
function selecionarPerfil(p, btn) {
  perfilSelecionado = p;
  document.querySelectorAll('.perfil-btn').forEach(b => b.classList.remove('ativo'));
  btn.classList.add('ativo');
  document.getElementById('login-erro').style.display = 'none';
}




function toggleSenha() {
  const inp = document.getElementById('login-senha');
  const aberto = document.getElementById('ico-olho-aberto');
  const fechado = document.getElementById('ico-olho-fechado');
  if (inp.type === 'password') {
    inp.type = 'text';
    aberto.style.display = 'none';
    fechado.style.display = 'block';
  } else {
    inp.type = 'password';
    aberto.style.display = 'block';
    fechado.style.display = 'none';
  }
}

async function fazerLogin() {
  const login  = document.getElementById('login-usuario').value.trim();
  const senha  = document.getElementById('login-senha').value;
  const erroEl = document.getElementById('login-erro');
  if (!perfilSelecionado) { erroEl.textContent = 'Selecione um perfil!'; erroEl.style.display = 'block'; return; }
  if (!login || !senha)   { erroEl.textContent = 'Preencha usuário e senha!'; erroEl.style.display = 'block'; return; }
  try {
    const res  = await fetch(`${API}/auth/login`, { credentials:'include', method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({login,senha,perfil:perfilSelecionado}) });
    const data = await res.json();
    if (!res.ok) { erroEl.textContent = data.erro || 'Erro ao entrar!'; erroEl.style.display = 'block'; return; }
    usuarioAtual   = data.usuario;
    separadorAtual = data.separador;
    erroEl.style.display = 'none';
    ativarApp();
  } catch(e) { erroEl.textContent = 'Erro ao conectar com o servidor!'; erroEl.style.display = 'block'; }
}




function ativarApp() {
  document.getElementById('tela-login').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('hdr-nome').textContent   = usuarioAtual.nome;
  document.getElementById('hdr-perfil').textContent = usuarioAtual.perfil === 'repositor' ? labelSubtipoRepositor(usuarioAtual.subtipo_repositor) : usuarioAtual.perfil.toUpperCase();




  const perfil = usuarioAtual.perfil;
  const mob = isMobile();




  if (perfil === 'separador' && mob) {
    ativarMobileSep();
  } else if (perfil === 'repositor' && mob) {
    ativarMobileRep();
  } else if (perfil === 'checkout' && mob) {
    ativarMobileCk();
  } else {
    montarSidebar();
    iniciarPorPerfil();
  }
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
  carregarPedidosPendentesReposicao();
  setInterval(() => {
    carregarFilaMobile();
    carregarAvisosSeparador();
    if (pedidoAtualId) carregarChecklistMobile();
  }, 30000);
}




function sair() {
  if (!confirm('Deseja sair do sistema?')) return;
  fetch(`${API}/auth/logout`, { method:'POST', credentials:'include' }).catch(()=>{});
  usuarioAtual = null; separadorAtual = null; pedidoAtualId = null; pedidoAtualNum = null; itensAtuais = [];
  document.body.classList.remove('sep-mobile','rep-mobile','ck-mobile');
  document.getElementById('app').style.display     = 'none';
  document.getElementById('sep-mobile-root').style.display = 'none';
  document.getElementById('sep-tabbar').style.display      = 'none';
  const repRoot = document.getElementById('rep-mobile-root');
  const repBar  = document.getElementById('rep-tabbar');
  const ckRoot  = document.getElementById('ck-mobile-root');
  const ckBar   = document.getElementById('ck-tabbar');
  if (repRoot) repRoot.style.display = 'none';
  if (repBar)  repBar.style.display  = 'none';
  if (ckRoot)  ckRoot.style.display  = 'none';
  if (ckBar)   ckBar.style.display   = 'none';
  document.getElementById('tela-login').style.display      = 'flex';
  document.getElementById('login-usuario').value = '';
  document.getElementById('login-senha').value   = '';
  perfilSelecionado = '';
  document.querySelectorAll('.perfil-btn').forEach(b => b.classList.remove('ativo'));
}




/* ══════════════════════════════════════════
   TABS MOBILE DO SEPARADOR
══════════════════════════════════════════ */
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




/* ══════════════════════════════════════════
   SIDEBAR (supervisor / desktop)
══════════════════════════════════════════ */
function montarSidebar() {
  const sb = document.getElementById('sidebar');
  const menus = {
    supervisor: `
      <div class="mg">SUPERVISÃO</div>
      <a class="mi ativo" onclick="irPara('dashboard',this)"><span class="mi-ic">📊</span>Dashboard</a>
      <a class="mi" onclick="irPara('pedidos',this)"><span class="mi-ic">📋</span>Pedidos <span class="mbadge" id="menu-badge-bloq" style="display:none;background:var(--red)">!</span></a>
      <a class="mi" onclick="irPara('performance',this)"><span class="mi-ic">🏆</span>Performance</a>
      <a class="mi" onclick="irPara('relatorios',this)"><span class="mi-ic">📅</span>Relatórios</a>
      <a class="mi" onclick="irPara('auditoria',this)"><span class="mi-ic">🔍</span>Auditoria</a>
      <a class="mi" onclick="irPara('cadastros',this)"><span class="mi-ic">⚙️</span>Cadastros</a>
      <div class="mg">OPERAÇÃO</div>
      <a class="mi" onclick="irPara('separacao',this)"><span class="mi-ic">📦</span>Separação</a>
      <a class="mi" onclick="irPara('estatisticas',this)"><span class="mi-ic">📈</span>Estatísticas</a>
      <a class="mi" onclick="irPara('reposicao',this)"><span class="mi-ic">🔧</span>Reposição <span class="mbadge" id="menu-badge-rep" style="display:none">0</span></a>
      <a class="mi" onclick="irPara('checkout',this)"><span class="mi-ic">🏷️</span>Checkout</a>`,
    separador: `
      <div class="mg">SEPARAÇÃO</div>
      <a class="mi ativo" onclick="irPara('separacao',this)"><span class="mi-ic">📦</span>Pedidos</a>`,
    repositor: `
      <div class="mg">REPOSIÇÃO</div>
      <a class="mi ativo" onclick="irPara('reposicao',this)"><span class="mi-ic">🔧</span>Solicitações <span class="mbadge" id="menu-badge-rep" style="display:none">0</span></a>
      <a class="mi" onclick="irPara('checkout',this)"><span class="mi-ic">🏷️</span>Checkout</a>
      <div class="mg">ANÁLISE</div>
      <a class="mi" onclick="irPara('stats-repositor',this)"><span class="mi-ic">📈</span>Estatísticas</a>`,
    checkout: `
      <div class="mg">CHECKOUT</div>
      <a class="mi ativo" onclick="irPara('checkout',this)"><span class="mi-ic">🏷️</span>Checkout</a>
      <div class="mg">ANÁLISE</div>
      <a class="mi" onclick="irPara('stats-checkout',this)"><span class="mi-ic">📈</span>Estatísticas</a>`,
  };
  sb.innerHTML = menus[usuarioAtual.perfil] || '';
}




function irPara(pag, el) {
  document.querySelectorAll('.pagina').forEach(p => p.classList.remove('ativa'));
  document.querySelectorAll('.mi').forEach(m => m.classList.remove('ativo'));
  const pg = document.getElementById(`pag-${pag}`);
  if (pg) pg.classList.add('ativa');
  if (el) el.classList.add('ativo');
  if (pag === 'dashboard')       { carregarDashboard(); mudarDashTab('operacao'); }
  if (pag === 'pedidos') { popularSelects(); const _pi=document.getElementById('filtro-ped-ini'),_pf=document.getElementById('filtro-ped-fim'); if(_pi&&!_pi.value)_pi.value=hojeLocal(); if(_pf&&!_pf.value)_pf.value=hojeLocal(); carregarPedidos(); carregarPedidosBloqueados(); }
  if (pag === 'cadastros')       { trocarCadastroTab('usuarios'); carregarUsuarios(); }
  if (pag === 'separacao')       { carregarFila(); if (separadorAtual) carregarContadoresSep(); }
  if (pag === 'estatisticas')    { carregarEstatisticas(); carregarCheckoutLista(); }
  if (pag === 'reposicao') {
    fetch(`${API}/admin/sincronizar-forma-envio`, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'} }).catch(()=>{});
    carregarUsuariosParaRep().then(() => carregarTabelaReposicao());
    if (window._repInterval) clearInterval(window._repInterval);
    window._repInterval = setInterval(() => { carregarTabelaReposicao(); }, 30000);
  }
  if (pag === 'checkout')        { const el2 = document.getElementById('ck-input-caixa'); if(el2) setTimeout(()=>el2.focus(),200); }
  if (pag === 'stats-repositor') carregarStatsRepositor();
  if (pag === 'stats-checkout')  carregarStatsCheckout();
  if (pag === 'performance')  carregarPerformance();
  if (pag === 'relatorios')   { carregarListaRelatorios(); }
  if (pag === 'auditoria')    { const hj=hojeLocal(); const ea=document.getElementById('aud-ini'); if(ea&&!ea.value)ea.value=hj; carregarAuditoria(); }
}




function iniciarPorPerfil() {
  if (usuarioAtual.perfil === 'supervisor') {
    document.getElementById('pag-dashboard').classList.add('ativa');
    const setVal = (id, v) => { const e = document.getElementById(id); if(e) e.value = v; };
    setVal('filtro-data-ini', hoje); setVal('filtro-data-fim', hoje);
    setVal('filtro-ped-ini',  hoje); setVal('filtro-ped-fim',  hoje); // padrão: hoje
    setVal('filtro-tl-ini',   hoje); setVal('filtro-tl-fim',   hoje);
    setVal('perf-ini', hoje); setVal('perf-fim', hoje);
    setVal('filtro-tl-data',  hoje);
    carregarDashboard();
    setInterval(atualizarBadgeRep, 15000);
    atualizarBadgeRep();
    // Verifica bloqueados periodicamente para manter badge atualizado
    setInterval(carregarPedidosBloqueados, 20000);
    carregarPedidosBloqueados();
  }
  if (usuarioAtual.perfil === 'separador') {
    document.getElementById('pag-separacao').classList.add('ativa');
    carregarFila();
    if (separadorAtual) carregarContadoresSep();
    setInterval(() => { carregarFila(); if(pedidoAtualId) carregarChecklist(); }, 30000);
    setTimeout(() => { const el = document.getElementById('input-pedido'); if (el) el.focus(); }, 300);
  }
  if (usuarioAtual.perfil === 'repositor') {
    document.getElementById('pag-reposicao').classList.add('ativa');
    carregarAvisos();
    verificarDuplicatas();
    setInterval(() => { carregarAvisos(); verificarDuplicatas(); }, 30000);
  }
  if (usuarioAtual.perfil === 'checkout') {
    document.getElementById('pag-checkout').classList.add('ativa');
    setTimeout(() => { const el = document.getElementById('ck-input-caixa'); if(el) el.focus(); }, 300);
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




function trocarCadastroTab(tab) {
  ['usuarios','importar'].forEach(t => {
    const el  = document.getElementById(`cad-${t}`);
    const btn = document.getElementById(`ctab-${t}`);
    if (el)  el.style.display  = t===tab ? 'block' : 'none';
    if (btn) btn.className = t===tab ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm';
  });
  if (tab === 'usuarios') carregarUsuarios();
}
/* ══ RELATÓRIOS ══ */
async function carregarListaRelatorios() {
  const el = document.getElementById('rel-lista');
  if (!el) return;
  try {
    const res = await fetch(`${API}/relatorio/lista`, { credentials:'include' });
    const lista = res.ok ? await res.json() : [];
    if (!lista.length) {
      el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px 0">Nenhum relatorio gerado. Clique em "Gerar Hoje".</div>';
      return;
    }
    el.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">' +
      lista.map(r => '<button onclick="verRelatorioData(\'' + r.data + '\')" style="padding:8px 14px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);cursor:pointer;font-size:12px;text-align:left"><div style="font-weight:700">' + r.data + '</div><div style="font-size:11px;color:var(--text3)">' + r.total_pedidos + ' pedidos - ' + r.pedidos_concluidos + ' concluidos</div></button>').join('') +
      '</div>';
  } catch(e) {}
}
async function verRelatorio() {
  const data = document.getElementById('rel-data')?.value;
  if (!data) { toast('Selecione uma data','aviso'); return; }
  await verRelatorioData(data);
}
async function verRelatorioData(data) {
  const el = document.getElementById('rel-detalhe');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text3)">Carregando...</div>';
  try {
    const res = await fetch(`${API}/relatorio/diario?data=${data}`, { credentials:'include' });
    const r = res.ok ? await res.json() : null;
    if (!r) { el.innerHTML = '<div style="color:var(--text3);padding:16px">Nenhum relatorio para esta data.</div>'; return; }
    const pct = r.total_pedidos > 0 ? Math.round((r.pedidos_concluidos/r.total_pedidos)*100) : 0;
    el.innerHTML = `
      <div style="border-top:1px solid var(--border);padding-top:16px;margin-top:8px">
        <div style="font-weight:700;font-size:14px;margin-bottom:12px">Relatorio de ${data}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-bottom:16px">
          ${[['Pedidos',r.total_pedidos,'var(--text)'],['Concluidos',r.pedidos_concluidos,'#10b981'],
             ['Pendentes',r.pedidos_pendentes,'#f59e0b'],['Faltas',r.total_faltas,'#ef4444'],
             ['Checkouts',r.total_checkouts,'#3b82f6'],['Separadores',r.separadores_ativos,'var(--accent)']
            ].map(([lb,vl,cr])=>`<div style="background:var(--surface2);border-radius:8px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:700;color:${cr}">${vl}</div><div style="font-size:11px;color:var(--text3)">${lb}</div></div>`).join('')}
        </div>
        <div style="background:var(--surface2);border-radius:8px;padding:8px">
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Conclusao</div>
          <div style="background:var(--border);border-radius:4px;height:8px;overflow:hidden"><div style="background:#10b981;height:100%;width:${pct}%;border-radius:4px"></div></div>
          <div style="font-size:12px;font-weight:700;color:#10b981;margin-top:4px">${pct}%</div>
        </div>
      </div>`;
  } catch(e) { el.innerHTML = `<div style="color:#ef4444;padding:16px">Erro: ${e.message}</div>`; }
}
async function gerarRelatorioHoje() {
  try {
    const hj = hojeLocal();
    const res = await fetch(`${API}/relatorio/gerar`, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ data: hj }) });
    if (res.ok) { toast('Relatorio gerado!','sucesso'); carregarListaRelatorios(); verRelatorioData(hj); }
  } catch(e) { toast('Erro ao gerar','erro'); }
}
async function exportarRelatorioExcel() {
  const data = document.getElementById('rel-data')?.value || hojeLocal();
  try {
    const res = await fetch(`${API}/relatorio/diario?data=${data}`, { credentials:'include' });
    const r = res.ok ? await res.json() : null;
    if (!r) { toast('Gere o relatorio primeiro','aviso'); return; }
    const wb = XLSX.utils.book_new();
    const resumo = [['RELATORIO DIARIO WMS MIESS'],['Data:',data],[''],
      ['PEDIDOS',''],['Total',r.total_pedidos],['Concluidos',r.pedidos_concluidos],['Pendentes',r.pedidos_pendentes],[''],
      ['REPOSICAO',''],['Total faltas',r.total_faltas],['Abastecidas',r.faltas_abastecidas||0],[''],
      ['CHECKOUT',''],['Concluidos',r.total_checkouts],[''],['SEPARADORES ATIVOS',r.separadores_ativos]];
    const ws = XLSX.utils.aoa_to_sheet(resumo);
    ws['!cols'] = [{wch:25},{wch:15}];
    XLSX.utils.book_append_sheet(wb, ws, 'Resumo');
    if (r.dados_json) {
      try {
        const dados = JSON.parse(r.dados_json);
        if (dados.porSep) {
          const rows = [['SEPARADOR','CONCLUIDOS','PENDENTES','ITENS']];
          Object.entries(dados.porSep).forEach(([n,s])=>rows.push([n,s.concluidos,s.pendentes,s.itens]));
          const ws2 = XLSX.utils.aoa_to_sheet(rows);
          XLSX.utils.book_append_sheet(wb, ws2, 'Por Separador');
        }
      } catch(e) {}
    }
    XLSX.writeFile(wb, `relatorio_${data}.xlsx`);
    toast('Excel exportado!','sucesso');
  } catch(e) { toast('Erro ao exportar','erro'); }
}

/* ══ AUDITORIA ══ */
async function carregarAuditoria() {
  const tbody = document.getElementById('tbody-auditoria');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text3)">Carregando...</td></tr>';
  try {
    const ini = document.getElementById('aud-ini')?.value || '';
    const fim = document.getElementById('aud-fim')?.value || '';
    const usuario = document.getElementById('aud-usuario')?.value || '';
    const acao = document.getElementById('aud-acao')?.value || '';
    const params = new URLSearchParams();
    if (ini) params.set('data_ini', ini);
    if (fim) params.set('data_fim', fim);
    if (usuario) params.set('usuario', usuario);
    if (acao) params.set('acao', acao);
    params.set('limit', '200');
    const res = await fetch(`${API}/auditoria?${params}`, { credentials:'include' });
    const logs = res.ok ? await res.json() : [];
    if (!logs.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text3)">Nenhum registro encontrado</td></tr>'; return; }
    const acaoCor = { login:'#10b981', logout:'#6b7280', zerar_dados:'#ef4444', distribuicao_confirmada:'#3b82f6', relatorio_gerado:'#8b5cf6' };
    tbody.innerHTML = logs.map(l => {
      const cor = acaoCor[l.acao] || 'var(--text2)';
      return `<tr style="border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
        <td style="padding:10px 12px;font-size:12px;white-space:nowrap">${l.data||''} ${l.hora||''}</td>
        <td style="padding:10px 12px;font-size:13px;font-weight:600">${l.usuario_nome||l.usuario_login||'—'}</td>
        <td style="padding:10px 12px"><span style="font-size:11px;font-weight:700;color:${cor};background:${cor}18;padding:3px 8px;border-radius:20px">${l.acao}</span></td>
        <td style="padding:10px 12px;font-size:12px;color:var(--text2)">${l.entidade||'—'}${l.entidade_id?' #'+l.entidade_id:''}</td>
        <td style="padding:10px 12px;font-size:11px;color:var(--text3)">${l.ip||'—'}</td>
      </tr>`;
    }).join('');
  } catch(e) { tbody.innerHTML = `<tr><td colspan="5" style="color:#ef4444;padding:16px">Erro: ${e.message}</td></tr>`; }
}

/* ══ EDITAR USUARIO ══ */
async function abrirEditarUsuario(id) {
  try {
    const res = await fetch(`${API}/usuarios`, { credentials:'include' });
    const users = await res.json();
    const u = users.find(x => x.id === id);
    if (!u) { toast('Usuario nao encontrado!','erro'); return; }
    document.getElementById('edit-usr-id').value     = u.id;
    document.getElementById('edit-usr-nome').value   = u.nome;
    document.getElementById('edit-usr-login').value  = u.login;
    document.getElementById('edit-usr-senha').value  = '';
    document.getElementById('edit-usr-perfil').value = u.perfil;
    const turnoEl = document.getElementById('edit-usr-turno');
    if (turnoEl) { const tv = (u.turno||'Manha').replace('ã','a').replace('Manhã','Manha'); turnoEl.value = tv; }
    document.querySelectorAll('.edit-usr-perm').forEach(cb => {
      const ac = (u.perfis_acesso||'').split(',').map(s=>s.trim());
      cb.checked = ac.includes(cb.value) || cb.value === u.perfil;
    });
    const sw = document.getElementById('edit-usr-subtipo-wrap');
    if (sw) sw.style.display = u.perfil === 'repositor' ? 'block' : 'none';
    const ss = document.getElementById('edit-usr-subtipo-repositor');
    if (ss) ss.value = u.subtipo_repositor || 'geral';
    document.getElementById('modal-editar-usuario').style.display = 'flex';
  } catch(e) { toast('Erro ao carregar!','erro'); }
}
function fecharEditarUsuario() {
  document.getElementById('modal-editar-usuario').style.display = 'none';
}
function toggleSubtipoRepositorEdit() {
  const perf = document.getElementById('edit-usr-perfil');
  const wrap = document.getElementById('edit-usr-subtipo-wrap');
  if (wrap) wrap.style.display = perf && perf.value === 'repositor' ? 'block' : 'none';
}
async function salvarEdicaoUsuario() {
  const id      = document.getElementById('edit-usr-id').value;
  const nome    = document.getElementById('edit-usr-nome').value.trim();
  const login   = document.getElementById('edit-usr-login').value.trim();
  const senha   = document.getElementById('edit-usr-senha').value;
  const perfil  = document.getElementById('edit-usr-perfil').value;
  const turno   = document.getElementById('edit-usr-turno')?.value || 'Manha';
  const subtipo = document.getElementById('edit-usr-subtipo-repositor')?.value || 'geral';
  const perfis_acesso = Array.from(document.querySelectorAll('.edit-usr-perm:checked')).map(cb=>cb.value).filter(p=>p!==perfil);
  if (!nome || !login) { toast('Preencha nome e login!','aviso'); return; }
  if (senha && senha.length < 6) { toast('Senha minimo 6 caracteres!','aviso'); return; }
  try {
    const body = { nome, login, perfil, turno, status:'ativo', perfis_acesso, subtipo_repositor: subtipo };
    if (senha) body.senha = senha;
    const res = await fetch(`${API}/usuarios/${id}`, { credentials:'include', method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { toast(data.erro||'Erro ao salvar!','erro'); return; }
    toast('Usuario atualizado!','sucesso');
    fecharEditarUsuario();
    carregarUsuarios();
  } catch(e) { toast('Erro ao salvar!','erro'); }
}

/* ══ ZERAR DADOS ══ */
async function confirmarZerarDados() {
  const conf = confirm('ATENCAO - Isso vai apagar TODOS os pedidos, reposicoes e checkouts.\nUsuarios NAO serao apagados.\nTem certeza?');
  if (!conf) return;
  const conf2 = confirm('Tem ABSOLUTA certeza? Esta acao nao pode ser desfeita.');
  if (!conf2) return;
  try {
    const res = await fetch(`${API}/admin/zerar-dados`, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({confirmar:'ZERAR_TUDO_CONFIRMO'}) });
    const data = await res.json();
    if (res.ok) { toast('Dados zerados!','sucesso'); } else { toast('Erro: '+data.erro,'erro'); }
  } catch(e) { toast('Erro ao zerar','erro'); }
}
