/* ══ AUTH.JS ══ WMS Miess ══ */

function selecionarPerfil(p, btn) {
  perfilSelecionado = p;
  // Reset all perfil buttons
  ['supervisor','repositor','separador','checkout'].forEach(perfil => {
    const el = document.getElementById('pbtn-' + perfil);
    if (el) {
      el.style.borderColor = 'rgba(255,255,255,.15)';
      el.style.background  = 'rgba(255,255,255,.05)';
      el.style.color       = 'rgba(255,255,255,.5)';
    }
  });
  // Highlight selected button
  const selected = document.getElementById('pbtn-' + p);
  if (selected) {
    selected.style.borderColor = '#3B82F6';
    selected.style.background  = 'rgba(37,99,235,.3)';
    selected.style.color       = '#93C5FD';
  }
  const erroEl = document.getElementById('login-erro');
  if (erroEl) erroEl.style.display = 'none';
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
  // Inject alert animation CSS once
  if (!document.getElementById('wms-alert-css')) {
    const s = document.createElement('style');
    s.id = 'wms-alert-css';
    s.textContent = '@keyframes pulseAlert{0%,100%{opacity:1}50%{opacity:.75}}#alertas-banner{transition:all .3s}';
    document.head.appendChild(s);
  }
  document.getElementById('tela-login').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('hdr-nome').textContent   = usuarioAtual.nome;
  document.getElementById('hdr-perfil').textContent = usuarioAtual.perfil === 'repositor' ? labelSubtipoRepositor(usuarioAtual.subtipo_repositor) : usuarioAtual.perfil.toUpperCase();

  const perfil = usuarioAtual.perfil;
  const mob = isMobile();

  if (perfil === 'supervisor' && mob) {
    ativarMobileSup();
  } else if (perfil === 'separador' && mob) {
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

function sair() {
  if (!confirm('Deseja sair do sistema?')) return;
  fetch(`${API}/auth/logout`, { method:'POST', credentials:'include' }).catch(()=>{});
  usuarioAtual = null; separadorAtual = null; pedidoAtualId = null; pedidoAtualNum = null; itensAtuais = [];
  document.body.classList.remove('sep-mobile','rep-mobile','ck-mobile');
  if (alertaInterval) { clearInterval(alertaInterval); alertaInterval=null; }
  document.getElementById('app').style.display     = 'none';
  document.getElementById('sep-mobile-root').style.display = 'none';
  document.getElementById('sep-tabbar').style.display      = 'none';
  const supRoot = document.getElementById('sup-mobile-root');
  const supBar  = document.getElementById('sup-tabbar');
  if (supRoot) supRoot.style.display = 'none';
  if (supBar)  supBar.style.display  = 'none';
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

function montarSidebar() {
  const sb = document.getElementById('sidebar');
  const menus = {
    supervisor: `
      <div class="mg">SUPERVISÃO</div>
      <a class="mi ativo" onclick="irPara('dashboard',this)"><span class="mi-ic">📊</span>Dashboard</a>
      <a class="mi" onclick="irPara('pedidos',this)"><span class="mi-ic">📋</span>Pedidos <span class="mbadge" id="menu-badge-bloq" style="display:none;background:var(--red)">!</span></a>
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

function iniciarPorPerfil() {
  if (usuarioAtual.perfil === 'supervisor') {
    document.getElementById('pag-dashboard').classList.add('ativa');
    const setVal = (id, v) => { const e = document.getElementById(id); if(e) e.value = v; };
    setVal('filtro-data-ini', hoje); setVal('filtro-data-fim', hoje);
    setVal('filtro-ped-ini',  hoje); setVal('filtro-ped-fim',  hoje);
    setVal('filtro-tl-data',  hoje);
    carregarDashboard();
    setInterval(atualizarBadgeRep, 15000);
    atualizarBadgeRep();
    setInterval(carregarPedidosBloqueados, 20000);
    carregarPedidosBloqueados();
    // Alertas em tempo real — verifica a cada 2 minutos
    carregarAlertas();
    alertaInterval = setInterval(carregarAlertas, 120000);
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

function irPara(pag, el) {
  document.querySelectorAll('.pagina').forEach(p => p.classList.remove('ativa'));
  document.querySelectorAll('.mi').forEach(m => m.classList.remove('ativo'));
  const pg = document.getElementById(`pag-${pag}`);
  if (pg) pg.classList.add('ativa');
  if (el) el.classList.add('ativo');
  if (pag === 'dashboard')       carregarDashboard();
  if (pag === 'pedidos')         { popularSelects(); carregarPedidos(); carregarPedidosBloqueados(); trocarPedidosTab('lista'); }
  if (pag === 'cadastros')       { trocarCadastroTab('usuarios'); carregarUsuarios(); }
  if (pag === 'separacao')       { carregarFila(); if (separadorAtual) carregarContadoresSep(); }
  if (pag === 'estatisticas')    { carregarEstatisticas(); carregarCheckoutLista(); }
  if (pag === 'reposicao')       { carregarAvisos(); verificarDuplicatas(); }
  if (pag === 'historico-rep')   {
    const hoje = hojeLocal();
    const el = document.getElementById('hist-completo-data');
    if (el && !el.value) el.value = hoje;
    carregarHistoricoCompleto();
  }
  if (pag === 'checkout')        { const el2 = document.getElementById('ck-input-caixa'); if(el2) setTimeout(()=>el2.focus(),200); }
  if (pag === 'stats-repositor') carregarStatsRepositor();
  if (pag === 'stats-checkout')  carregarStatsCheckout();
}