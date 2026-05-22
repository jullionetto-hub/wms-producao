/* ══════════════════════════════════════════
   LOGIN
══════════════════════════════════════════ */
let perfilSelecionado = '';
function selecionarPerfil(p, btn) {
  perfilSelecionado = p;
  document.querySelectorAll('.perfil-btn').forEach(b => b.classList.remove('ativo'));
  if (btn) btn.classList.add('ativo');
  const erroEl = document.getElementById('login-erro');
  if (erroEl) erroEl.style.display = 'none';
}
function selecionarPerfilSelect() {
  const sel = document.getElementById('login-perfil');
  if (sel && sel.value) {
    perfilSelecionado = sel.value;
    const erroEl = document.getElementById('login-erro');
    if (erroEl) erroEl.style.display = 'none';
    // Foca no campo usuário após selecionar
    setTimeout(() => { const u = document.getElementById('login-usuario'); if(u) u.focus(); }, 50);
  }
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
  // Lê do select caso onchange não tenha sido disparado
  const sel = document.getElementById('login-perfil');
  if (sel && sel.value) perfilSelecionado = sel.value;
  const login  = document.getElementById('login-usuario').value.trim();
  const senha  = document.getElementById('login-senha').value;
  const erroEl = document.getElementById('login-erro');
  if (!perfilSelecionado) { erroEl.textContent = 'Selecione um perfil!'; erroEl.style.display = 'block'; return; }
  if (!login || !senha)   { erroEl.textContent = 'Preencha usuário e senha!'; erroEl.style.display = 'block'; return; }
  try {
    const res  = await fetch(`${API}/auth/login`, { credentials:'include', method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({login,senha,perfil:perfilSelecionado}) });
    const data = await res.json();
    if (!res.ok) { erroEl.textContent = data.erro || 'Erro ao entrar!'; erroEl.style.display = 'block'; return; }
    if (data.senha_temporaria) {
      document.getElementById('login-box').style.display = 'none';
      const tBox = document.getElementById('trocar-senha-box');
      if (tBox) tBox.style.display = 'flex';
      const hid = document.getElementById('trocar-login-hidden');
      if (hid) hid.value = login;
      return;
    }
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
  } else if (perfil === 'embalador' && mob) {
    ativarMobileEmb();
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
  // Mostra modal bonito de confirmacao
  const modal = document.getElementById('modal-sair');
  if (modal) { modal.style.display = 'flex'; return; }
  _confirmarSair();
}
function _confirmarSair() {
  fetch(`${API}/auth/logout`, { method:'POST', credentials:'include' }).catch(()=>{});
  usuarioAtual = null; separadorAtual = null; pedidoAtualId = null; pedidoAtualNum = null; itensAtuais = [];
  document.body.classList.remove('sep-mobile','rep-mobile','ck-mobile','emb-mobile');
  document.getElementById('app').style.display     = 'none';
  document.getElementById('sep-mobile-root').style.display = 'none';
  document.getElementById('sep-tabbar').style.display      = 'none';
  const repRoot = document.getElementById('rep-mobile-root');
  const repBar  = document.getElementById('rep-tabbar');
  const ckRoot  = document.getElementById('ck-mobile-root');
  const ckBar   = document.getElementById('ck-tabbar');
  const embRoot = document.getElementById('emb-mobile-root');
  if (repRoot)  repRoot.style.display  = 'none';
  if (repBar)   repBar.style.display   = 'none';
  if (ckRoot)   ckRoot.style.display   = 'none';
  if (ckBar)    ckBar.style.display    = 'none';
  if (embRoot)  embRoot.style.display  = 'none';
  // Restaura elementos que ativarMobileEmb pode ter escondido via inline style
  const hdr = document.querySelector('#app header');
  if (hdr) hdr.style.display = '';
  const sb  = document.getElementById('sidebar');
  if (sb)  sb.style.display  = '';
  const ct  = document.getElementById('conteudo');
  if (ct)  ct.style.display  = '';
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
      const isSubiu    = a.status === 'subiu';
      const isAbast    = a.status === 'abastecido';
      const isAguard   = a.status === 'aguardando_abastecer';
      const bg    = isSubiu ? '#F0FDF4' : isAguard ? '#FFFBEB' : '#EFF6FF';
      const bord  = isSubiu ? '#BBF7D0' : isAguard ? '#FDE68A' : '#BFDBFE';
      const icon  = isSubiu ? '⬆️' : isAguard ? '🕐' : '📦';
      const label = isSubiu ? 'SUBIU' : isAguard ? 'AGUARD. GUARDAR' : 'ABASTECIDO';
      const cor   = isSubiu ? 'var(--green)' : isAguard ? '#92400e' : 'var(--accent)';
      const nomeLogado = usuarioAtual?.nome || '';
      const btnGuardei = isAguard
        ? `<button onclick="sepGuardeiItem(${a.id},'${nomeLogado.replace(/'/g,"\\'")}',this)"
            style="width:100%;margin-top:12px;padding:13px;background:#10b981;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer">
            🏠 Guardei este item eu mesmo
           </button>`
        : `<button onclick="sepCienteAviso(${a.id},this)"
            style="width:100%;margin-top:12px;padding:10px;background:transparent;color:var(--text3);border:1.5px solid var(--border);border-radius:12px;font-size:13px;font-weight:700;cursor:pointer">
            ✓ Ciente — remover notificação
           </button>`;
      return `
      <div style="background:${bg};border:2px solid ${bord};border-radius:14px;padding:14px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <div style="font-size:30px">${icon}</div>
          <div>
            <div style="font-size:12px;font-weight:800;color:${cor};letter-spacing:1px">${label}</div>
            <div style="font-size:11px;color:var(--text3)">Pedido <b style="color:var(--text)">#${a.numero_pedido}</b> &nbsp;•&nbsp; ${a.hora_reposto||a.hora_aviso||'—'}</div>
          </div>
        </div>
        <div style="font-size:16px;font-weight:800;color:var(--accent);font-family:'Space Mono',monospace">${a.codigo||'—'}</div>
        <div style="font-size:13px;font-weight:600;color:var(--text);margin:4px 0">${a.descricao||'—'}</div>
        <div style="font-size:12px;color:var(--text2)">📍 <b>${a.endereco||'—'}</b> &nbsp;•&nbsp; Qtde: <b>${a.qtd_encontrada||a.quantidade||1}</b></div>
        ${a.quem_pegou ? `<div style="font-size:11px;color:var(--text3);margin-top:4px">📦 Buscado por: <b>${a.quem_pegou}</b></div>` : ''}
        ${a.repositor_nome && !a.quem_pegou ? `<div style="font-size:11px;color:var(--text3);margin-top:4px">👷 ${a.repositor_nome}</div>` : ''}
        ${btnGuardei}
      </div>`;
    }).join('');
  } catch(e) {
    lista.innerHTML = '<div style="color:var(--red);text-align:center;padding:20px">Erro ao carregar avisos</div>';
  }
}

async function sepCienteAviso(id, btn) {
  btn.disabled = true;
  try {
    await fetch(`${API}/repositor/avisos/${id}/lido-separador`, {
      credentials:'include', method:'PUT',
      headers:{'Content-Type':'application/json'}
    });
    carregarAvisosSeparador();
  } catch(e) { btn.disabled = false; }
}

async function sepGuardeiItem(id, nome, btn) {
  btn.disabled = true;
  btn.textContent = 'Salvando...';
  try {
    const res = await fetch(`${API}/repositor/avisos/${id}`, {
      credentials:'include', method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ quem_guardou: nome, situacao:'abastecido', status:'abastecido' })
    });
    if (res.ok) {
      toast('Registrado! ✅', 'sucesso');
      carregarAvisosSeparador();
    } else {
      btn.disabled = false;
      btn.textContent = '🏠 Guardei este item eu mesmo';
      toast('Erro ao salvar', 'erro');
    }
  } catch(e) {
    btn.disabled = false;
    btn.textContent = '🏠 Guardei este item eu mesmo';
    toast('Sem conexão', 'erro');
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
      <a class="mi" onclick="irPara('liberacao',this)"><span class="mi-ic">🔓</span>Liberação <span class="mbadge" id="menu-badge-lib" style="display:none;background:var(--red)">0</span></a>
      <a class="mi" onclick="irPara('performance',this)"><span class="mi-ic">🏆</span>Performance</a>
      <a class="mi" onclick="irPara('relatorios',this)"><span class="mi-ic">📅</span>Relatórios</a>
      <a class="mi" onclick="irPara('auditoria',this)"><span class="mi-ic">🔍</span>Auditoria</a>
      <a class="mi" onclick="irPara('diario',this)"><span class="mi-ic">📋</span>Diário de Bordo</a>
      <a class="mi" onclick="irPara('cadastros',this)"><span class="mi-ic">⚙️</span>Cadastros</a>
      <a class="mi" onclick="irPara('protocolo',this);carregarProtocolo()"><span class="mi-ic">📋</span>Protocolo<span class="mbadge" id="menu-badge-proto" style="display:none">0</span></a>
      <a class="mi" onclick="irPara('passagem',this)"><span class="mi-ic">🔄</span>Passagem de Turno<span class="mbadge" id="menu-badge-passagem" style="display:none;background:var(--red)">!</span></a>
      <div class="mg">OPERAÇÃO</div>
      <a class="mi" onclick="irPara('separacao',this)"><span class="mi-ic">📦</span>Separação</a>
      <a class="mi" onclick="irPara('reposicao',this)"><span class="mi-ic">🔧</span>Reposição <span class="mbadge" id="menu-badge-rep" style="display:none">0</span></a>
      <a class="mi" onclick="irPara('checkout',this)"><span class="mi-ic">🏷️</span>Checkout</a>
      <a class="mi" onclick="irPara('embalagem',this)"><span class="mi-ic">📫</span>Embalagem</a>`,
    separador: `
      <div class="mg">SEPARAÇÃO</div>
      <a class="mi ativo" onclick="irPara('separacao',this)"><span class="mi-ic">📦</span>Pedidos</a>
      <a class="mi" onclick="irPara('estatisticas-sep',this);carregarEstatisticasSep()"><span class="mi-ic">📊</span>Estatísticas</a>`,
    repositor: `
      <div class="mg">REPOSIÇÃO</div>
      <a class="mi ativo" onclick="irPara('reposicao',this)"><span class="mi-ic">🔧</span>Solicitações <span class="mbadge" id="menu-badge-rep" style="display:none">0</span></a>
      <a class="mi" onclick="irPara('protocolo-rep',this)"><span class="mi-ic">📋</span>Protocolo</a>
      <div class="mg">ANÁLISE</div>
      <a class="mi" onclick="irPara('stats-repositor',this)"><span class="mi-ic">📈</span>Estatísticas</a>`,
    checkout: `
      <div class="mg">CHECKOUT</div>
      <a class="mi ativo" onclick="irPara('checkout',this)"><span class="mi-ic">🏷️</span>Checkout</a>
      <div class="mg">ANÁLISE</div>
      <a class="mi" onclick="irPara('estatisticas-ck',this)"><span class="mi-ic">📈</span>Estatísticas</a>`,
    embalador: `
      <div class="mg">EMBALAGEM</div>
      <a class="mi ativo" onclick="irPara('embalagem',this)"><span class="mi-ic">📫</span>Embalar</a>`,
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
  if (pag === 'pedidos') { popularSelects(); var _pi=document.getElementById('filtro-ped-ini'),_pf=document.getElementById('filtro-ped-fim'); if(_pi&&!_pi.value)_pi.value=hojeLocal(); if(_pf&&!_pf.value)_pf.value=hojeLocal(); carregarPedidos(); carregarPedidosBloqueados(); }
  if (pag === 'cadastros')       { trocarCadastroTab('usuarios'); carregarUsuarios(); }
  if (pag === 'separacao')       { var _si=document.getElementById('sep-ini'),_sf=document.getElementById('sep-fim'); if(_si&&!_si.value)_si.value=hojeLocal(); if(_sf&&!_sf.value)_sf.value=hojeLocal(); carregarFila(); carregarContadoresSep(); }
  if (pag === 'estatisticas')    { carregarEstatisticas(); carregarCheckoutLista(); }
  if (pag === 'reposicao')       { carregarAvisos(); verificarDuplicatas(); }

  if (pag === 'checkout')        { var _ci=document.getElementById('ck-ini'),_cf=document.getElementById('ck-fim'); if(_ci&&!_ci.value)_ci.value=hojeLocal(); if(_cf&&!_cf.value)_cf.value=hojeLocal(); carregarContadoresCk(); setTimeout(()=>{ const el2=document.getElementById('ck-input-caixa'); if(el2)el2.focus(); },200); }
  if (pag === 'stats-repositor') carregarStatsRepositor();
  if (pag === 'stats-checkout')  carregarStatsCheckout();
  if (pag === 'liberacao')    { carregarLiberacao(); }
  if (pag === 'performance')  { carregarPerformance(); carregarColaboradores(); }
  if (pag === 'relatorios')   { carregarListaRelatorios(); }
  if (pag === 'auditoria')    { var hj=hojeLocal(); var ea=document.getElementById('aud-ini'); if(ea&&!ea.value)ea.value=hj; carregarAuditoria(); }
  if (pag === 'diario')       { iniciarDiario(); }
  if (pag === 'passagem')     { iniciarPassagem(); }
  if (pag === 'embalagem')    { var _ei=document.getElementById('emb-ini'),_ef=document.getElementById('emb-fim'); if(_ei&&!_ei.value)_ei.value=hojeLocal(); if(_ef&&!_ef.value)_ef.value=hojeLocal(); carregarEmbalagem(); }
  if (pag === 'protocolo')    { carregarProtocolo(); }
  if (pag === 'protocolo-rep') {
    // reusa pag-protocolo (mesmo conteúdo, papel diferente)
    document.querySelectorAll('.pagina').forEach(p => p.classList.remove('ativa'));
    const pgProto = document.getElementById('pag-protocolo');
    if (pgProto) pgProto.classList.add('ativa');
    carregarProtocolo();
  }
  if (pag === 'estatisticas-sep') { carregarEstatisticasSep(); }
  if (pag === 'estatisticas-ck')  { carregarEstatisticasCk(); }
  if (pag === 'passagem')         { iniciarPassagem(); }
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
    var _si=document.getElementById('sep-ini'),_sf=document.getElementById('sep-fim');
    if(_si&&!_si.value)_si.value=hojeLocal(); if(_sf&&!_sf.value)_sf.value=hojeLocal();
    carregarFila();
    carregarContadoresSep();
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
  } catch(e) { console.warn(e); }
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
/* RELATORIOS */
async function carregarListaRelatorios() {
  var el = document.getElementById('rel-lista');
  if (!el) return;
  try {
    var res = await fetch(API + '/relatorio/lista', { credentials:'include' });
    var lista = res.ok ? await res.json() : [];
    if (!lista.length) { el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px 0">Nenhum relatorio gerado. Clique em Gerar Hoje.</div>'; return; }
    el.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">' +
      lista.map(function(r) { return '<button onclick="verRelatorioData(\'' + r.data + '\')" style="padding:8px 14px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);cursor:pointer;font-size:12px;text-align:left"><div style="font-weight:700">' + r.data + '</div><div style="font-size:11px;color:var(--text3)">' + r.total_pedidos + ' pedidos</div></button>'; }).join('') + '</div>';
  } catch(e) { console.warn(e); }
}
async function verRelatorio() {
  var data = document.getElementById('rel-data') ? document.getElementById('rel-data').value : '';
  if (!data) { toast('Selecione uma data','aviso'); return; }
  await verRelatorioData(data);
}
async function verRelatorioData(data) {
  var el = document.getElementById('rel-detalhe');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text3)">Carregando...</div>';
  try {
    var res = await fetch(API + '/relatorio/diario?data=' + data, { credentials:'include' });
    var r = res.ok ? await res.json() : null;
    if (!r) { el.innerHTML = '<div style="color:var(--text3);padding:16px">Nenhum relatorio para esta data.</div>'; return; }
    var pct = r.total_pedidos > 0 ? Math.round((r.pedidos_concluidos/r.total_pedidos)*100) : 0;
    el.innerHTML = '<div style="border-top:1px solid var(--border);padding-top:16px;margin-top:8px"><div style="font-weight:700;margin-bottom:12px">Relatorio de ' + data + '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-bottom:16px">' +
      [['Pedidos',r.total_pedidos],['Concluidos',r.pedidos_concluidos],['Pendentes',r.pedidos_pendentes],['Faltas',r.total_faltas],['Checkouts',r.total_checkouts]].map(function(x){
        return '<div style="background:var(--surface2);border-radius:8px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:700">' + x[1] + '</div><div style="font-size:11px;color:var(--text3)">' + x[0] + '</div></div>';
      }).join('') + '</div>' +
      '<div style="background:var(--surface2);border-radius:8px;padding:8px"><div style="font-size:11px;color:var(--text3);margin-bottom:4px">Conclusao</div><div style="background:var(--border);border-radius:4px;height:8px;overflow:hidden"><div style="background:#10b981;height:100%;width:' + pct + '%;border-radius:4px"></div></div><div style="font-size:12px;font-weight:700;color:#10b981;margin-top:4px">' + pct + '%</div></div></div>';
  } catch(e) { el.innerHTML = '<div style="color:#ef4444;padding:16px">Erro: ' + e.message + '</div>'; }
}
async function gerarRelatorioHoje() {
  try {
    var hj = hojeLocal();
    var res = await fetch(API + '/relatorio/gerar', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ data: hj }) });
    if (res.ok) { toast('Relatorio gerado!','sucesso'); carregarListaRelatorios(); verRelatorioData(hj); }
  } catch(e) { toast('Erro ao gerar','erro'); }
}
async function exportarRelatorioExcel() {
  var data = (document.getElementById('rel-data') ? document.getElementById('rel-data').value : '') || hojeLocal();
  try {
    var res = await fetch(API + '/relatorio/diario?data=' + data, { credentials:'include' });
    var r = res.ok ? await res.json() : null;
    if (!r) { toast('Gere o relatorio primeiro','aviso'); return; }
    var wb = XLSX.utils.book_new();
    var resumo = [['RELATORIO WMS MIESS'],['Data:',data],[''],['Total Pedidos',r.total_pedidos],['Concluidos',r.pedidos_concluidos],['Pendentes',r.pedidos_pendentes],[''],['Faltas',r.total_faltas],['Checkouts',r.total_checkouts],['Separadores',r.separadores_ativos]];
    var ws = XLSX.utils.aoa_to_sheet(resumo);
    XLSX.utils.book_append_sheet(wb, ws, 'Resumo');
    XLSX.writeFile(wb, 'relatorio_' + data + '.xlsx');
    toast('Excel exportado!','sucesso');
  } catch(e) { toast('Erro ao exportar','erro'); }
}

/* AUDITORIA */
async function carregarAuditoria() {
  var tbody = document.getElementById('tbody-auditoria');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text3)">Carregando...</td></tr>';
  try {
    var ini = document.getElementById('aud-ini') ? document.getElementById('aud-ini').value : '';
    var fim = document.getElementById('aud-fim') ? document.getElementById('aud-fim').value : '';
    var usuario = document.getElementById('aud-usuario') ? document.getElementById('aud-usuario').value : '';
    var acao = document.getElementById('aud-acao') ? document.getElementById('aud-acao').value : '';
    var params = new URLSearchParams();
    if (ini) params.set('data_ini', ini);
    if (fim) params.set('data_fim', fim);
    if (usuario) params.set('usuario', usuario);
    if (acao) params.set('acao', acao);
    params.set('limit', '200');
    var res = await fetch(API + '/auditoria?' + params, { credentials:'include' });
    var logs = res.ok ? await res.json() : [];
    if (!logs.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text3)">Nenhum registro encontrado</td></tr>'; return; }
    tbody.innerHTML = logs.map(function(l) {
      return '<tr style="border-bottom:1px solid var(--border)"><td style="padding:10px 12px;font-size:12px">' + (l.data||'') + ' ' + (l.hora||'') + '</td><td style="padding:10px 12px;font-size:13px;font-weight:600">' + (l.usuario_nome||l.usuario_login||'&mdash;') + '</td><td style="padding:10px 12px"><span style="font-size:11px;font-weight:700;color:var(--accent);background:rgba(99,102,241,.1);padding:3px 8px;border-radius:20px">' + l.acao + '</span></td><td style="padding:10px 12px;font-size:12px;color:var(--text2)">' + (l.entidade||'&mdash;') + (l.entidade_id?' #'+l.entidade_id:'') + '</td><td style="padding:10px 12px;font-size:11px;color:var(--text3)">' + (l.ip||'&mdash;') + '</td></tr>';
    }).join('');
  } catch(e) { tbody.innerHTML = '<tr><td colspan="5" style="color:#ef4444;padding:16px">Erro: ' + e.message + '</td></tr>'; }
}

/* EDITAR USUARIO */
async function abrirEditarUsuario(id) {
  try {
    var res = await fetch(API + '/usuarios', { credentials:'include' });
    var users = await res.json();
    var u = users.find(function(x) { return x.id === id; });
    if (!u) { toast('Usuario nao encontrado!','erro'); return; }
    document.getElementById('edit-usr-id').value     = u.id;
    document.getElementById('edit-usr-nome').value   = u.nome;
    document.getElementById('edit-usr-login').value  = u.login;
    document.getElementById('edit-usr-senha').value  = '';
    var cbTemp = document.getElementById('edit-usr-senha-temp'); if (cbTemp) cbTemp.checked = false;
    var cbTemp = document.getElementById('edit-usr-senha-temp');
    if (cbTemp) cbTemp.checked = false;
    document.getElementById('edit-usr-perfil').value = u.perfil;
    var turnoEl = document.getElementById('edit-usr-turno');
    if (turnoEl) { var tv = (u.turno||'Manha').replace('\u00e3','a').replace('Manh\u00e3','Manha'); turnoEl.value = tv; }
    document.querySelectorAll('.edit-usr-perm').forEach(function(cb) {
      var ac = (u.perfis_acesso||'').split(',').map(function(s){return s.trim();});
      cb.checked = ac.includes(cb.value) || cb.value === u.perfil;
    });
    var sw = document.getElementById('edit-usr-subtipo-wrap');
    if (sw) sw.style.display = u.perfil === 'repositor' ? 'block' : 'none';
    var ss = document.getElementById('edit-usr-subtipo-repositor');
    if (ss) ss.value = u.subtipo_repositor || 'geral';
    document.getElementById('modal-editar-usuario').style.display = 'flex';
  } catch(e) { toast('Erro ao carregar!','erro'); }
}
function fecharEditarUsuario() {
  document.getElementById('modal-editar-usuario').style.display = 'none';
}
function toggleSubtipoRepositorEdit() {
  var perf = document.getElementById('edit-usr-perfil');
  var wrap = document.getElementById('edit-usr-subtipo-wrap');
  if (wrap) wrap.style.display = perf && perf.value === 'repositor' ? 'block' : 'none';
}
async function salvarEdicaoUsuario() {
  var id      = document.getElementById('edit-usr-id').value;
  var nome    = document.getElementById('edit-usr-nome').value.trim();
  var login   = document.getElementById('edit-usr-login').value.trim();
  var senha   = document.getElementById('edit-usr-senha').value;
  var perfil  = document.getElementById('edit-usr-perfil').value;
  var turno   = document.getElementById('edit-usr-turno') ? document.getElementById('edit-usr-turno').value : 'Manha';
  var subtipo = document.getElementById('edit-usr-subtipo-repositor') ? document.getElementById('edit-usr-subtipo-repositor').value : 'geral';
  var perfis_acesso = Array.from(document.querySelectorAll('.edit-usr-perm:checked')).map(function(cb){return cb.value;}).filter(function(p){return p!==perfil;});
  if (!nome || !login) { toast('Preencha nome e login!','aviso'); return; }
  if (senha && senha.length < 6) { toast('Senha minimo 6 caracteres!','aviso'); return; }
  try {
    var body = { nome: nome, login: login, perfil: perfil, turno: turno, status:'ativo', perfis_acesso: perfis_acesso, subtipo_repositor: subtipo };
    if (senha) { body.senha = senha; body.senha_temporaria = document.getElementById('edit-usr-senha-temp')?.checked || false; }
    var res = await fetch(API + '/usuarios/' + id, { credentials:'include', method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    var data = await res.json();
    if (!res.ok) { toast(data.erro||'Erro ao salvar!','erro'); return; }
    toast('Usuario atualizado!','sucesso');
    fecharEditarUsuario();
    carregarUsuarios();
  } catch(e) { toast('Erro ao salvar!','erro'); }
}
async function confirmarZerarDados() {
  var conf = confirm('ATENCAO - Isso vai apagar TODOS os pedidos, reposicoes e checkouts. Usuarios NAO serao apagados. Tem certeza?');
  if (!conf) return;
  var conf2 = confirm('Tem ABSOLUTA certeza? Esta acao nao pode ser desfeita.');
  if (!conf2) return;
  try {
    var res = await fetch(API + '/admin/zerar-dados', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({confirmar:'ZERAR_TUDO_CONFIRMO'}) });
    var data = await res.json();
    if (res.ok) { toast('Dados zerados!','sucesso'); } else { toast('Erro: '+data.erro,'erro'); }
  } catch(e) { toast('Erro ao zerar','erro'); }
}


/* DIARIO DE BORDO */
let _diarioAnterior = null;
let _leuAnterior = false;

async function iniciarDiario() {
  const hj = hojeLocal();
  const dataEl = document.getElementById('diario-data');
  if (dataEl && !dataEl.value) dataEl.value = hj;
  await verificarTurnoAnterior();
  await carregarDadosDiario();
  await carregarListaDiarios();
}

async function verificarTurnoAnterior() {
  const data = document.getElementById('diario-data')?.value || hojeLocal();
  const turno = document.getElementById('diario-turno')?.value || 'Manha';
  const aviso = document.getElementById('diario-aviso-anterior');
  _leuAnterior = false;
  try {
    const res = await fetch(`${API}/diario/anterior?data=${data}&turno=${turno}`, { credentials:'include' });
    _diarioAnterior = res.ok ? await res.json() : null;
    if (!aviso) return;
    if (!_diarioAnterior) { aviso.style.display = 'none'; return; }
    const d = _diarioAnterior;
    const obs = d.observacoes || {};
    const turnoIcon = d.turno === 'Manha' ? '☀️' : d.turno === 'Tarde' ? '🌅' : '🌙';
    aviso.style.display = 'block';
    aviso.innerHTML = `
      <div style="background:#fefce8;border:1.5px solid #fde68a;border-radius:10px;padding:16px;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <span style="font-size:20px">${turnoIcon}</span>
          <div>
            <div style="font-weight:700;font-size:14px;color:#92400e">Leitura obrigatória — Turno anterior</div>
            <div style="font-size:12px;color:#b45309">${d.data} · ${d.turno} · ${d.supervisor}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px">
          <div style="background:#fff;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:18px;font-weight:700;color:#0f172a">${d.dados?.separacao?.concluidos||0}/${d.dados?.separacao?.total||0}</div>
            <div style="font-size:10px;color:#64748b;text-transform:uppercase">Separação</div>
          </div>
          <div style="background:#fff;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:18px;font-weight:700;color:#0f172a">${d.dados?.checkout?.concluidos||0}/${d.dados?.checkout?.total||0}</div>
            <div style="font-size:10px;color:#64748b;text-transform:uppercase">Checkout</div>
          </div>
          <div style="background:#fff;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:18px;font-weight:700;color:#dc2626">${d.dados?.reposicao?.nao_encontrados||0}</div>
            <div style="font-size:10px;color:#64748b;text-transform:uppercase">Não encontr.</div>
          </div>
        </div>
        ${obs.separacao ? `<div style="margin-bottom:6px"><b style="font-size:11px;color:#92400e">Obs. Separação:</b> <span style="font-size:12px">${obs.separacao}</span></div>` : ''}
        ${obs.checkout ? `<div style="margin-bottom:6px"><b style="font-size:11px;color:#92400e">Obs. Checkout:</b> <span style="font-size:12px">${obs.checkout}</span></div>` : ''}
        ${obs.reposicao ? `<div style="margin-bottom:6px"><b style="font-size:11px;color:#92400e">Obs. Reposição:</b> <span style="font-size:12px">${obs.reposicao}</span></div>` : ''}
        ${obs.geral ? `<div style="margin-bottom:6px"><b style="font-size:11px;color:#92400e">Obs. Geral:</b> <span style="font-size:12px">${obs.geral}</span></div>` : ''}
        <button onclick="confirmarLeitura()" style="width:100%;padding:10px;background:#d97706;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;margin-top:8px">
          ✓ Confirmo que li o relatório do turno anterior
        </button>
      </div>`;
  } catch(e) { if (aviso) aviso.style.display = 'none'; }
}

function confirmarLeitura() {
  _leuAnterior = true;
  const aviso = document.getElementById('diario-aviso-anterior');
  if (aviso) aviso.innerHTML = `
    <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
      <span style="font-size:20px">✅</span>
      <div style="font-size:13px;font-weight:600;color:#166534">Turno anterior lido e confirmado</div>
    </div>`;
  toast('Leitura confirmada!','sucesso');
}

async function carregarDadosDiario() {
  const data = document.getElementById('diario-data')?.value || hojeLocal();
  const turno = document.getElementById('diario-turno')?.value || 'Manha';
  try {
    const res = await fetch(`${API}/diario/dados/turno?data=${data}&turno=${turno}`, { credentials:'include' });
    const d = await res.json();
    if (!res.ok) { toast('Erro ao carregar dados','erro'); return; }
    document.getElementById('diario-sep-total').textContent = d.separacao.total;
    document.getElementById('diario-sep-conc').textContent = d.separacao.concluidos;
    document.getElementById('diario-sep-pend').textContent = d.separacao.pendentes;
    document.getElementById('diario-sep-sep').textContent = d.separacao.separando;
    document.getElementById('diario-ck-total').textContent = d.checkout.total;
    document.getElementById('diario-ck-conc').textContent = d.checkout.concluidos;
    document.getElementById('diario-ck-pend').textContent = d.checkout.pendentes;
    document.getElementById('diario-rep-total').textContent = d.reposicao.total;
    document.getElementById('diario-rep-res').textContent = d.reposicao.resolvidas;
    document.getElementById('diario-rep-pend').textContent = d.reposicao.pendentes;
    document.getElementById('diario-rep-nao').textContent = d.reposicao.nao_encontrados;
    if (d.embalagem) {
      const embTotal = document.getElementById('diario-emb-total');
      const embEmb   = document.getElementById('diario-emb-emb');
      const embPend  = document.getElementById('diario-emb-pend');
      if (embTotal) embTotal.textContent = d.embalagem.total;
      if (embEmb)   embEmb.textContent   = d.embalagem.embalados;
      if (embPend)  embPend.textContent  = d.embalagem.pendentes;
    }
    const tbProb = document.getElementById('tbody-diario-prob');
    if (tbProb) {
      if (!d.problemas.length) {
        tbProb.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text3);padding:16px">Nenhum problema registrado</td></tr>';
      } else {
        tbProb.innerHTML = d.problemas.map(p =>
          `<tr><td style="padding:8px 12px;font-size:12px;font-weight:700">${p.pedido||'-'}</td>
           <td style="padding:8px 12px;font-size:12px">${p.cliente||'-'}</td>
           <td style="padding:8px 12px;font-size:12px">${p.codigo||'-'} — ${p.item||'-'}</td></tr>`
        ).join('');
      }
    }
    window._dadosDiario = d;
    // toast removido - nao mostrar ao carregar automaticamente
  } catch(e) { toast('Erro ao carregar dados','erro'); }
}

async function salvarDiario() {
  const data = document.getElementById('diario-data')?.value;
  const turno = document.getElementById('diario-turno')?.value;
  if (!data || !turno) { toast('Selecione data e turno','aviso'); return; }
  if (_diarioAnterior && !_leuAnterior) {
    toast('Confirme a leitura do turno anterior antes de salvar!','aviso');
    document.getElementById('diario-aviso-anterior')?.scrollIntoView({behavior:'smooth'});
    return;
  }
  const observacoes = {
    separacao: document.getElementById('diario-obs-sep')?.value || '',
    checkout: document.getElementById('diario-obs-ck')?.value || '',
    reposicao: document.getElementById('diario-obs-rep')?.value || '',
    embalagem: document.getElementById('diario-obs-emb')?.value || '',
    geral: document.getElementById('diario-obs-geral')?.value || '',
  };
  try {
    const res = await fetch(`${API}/diario`, {
      method: 'POST', credentials: 'include',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ data, turno, dados: window._dadosDiario||{}, observacoes, leu_anterior: _leuAnterior })
    });
    const r = await res.json();
    if (!res.ok) { toast(r.erro||'Erro ao salvar','erro'); return; }
    toast('Diário salvo!','sucesso');
    await carregarListaDiarios();
  } catch(e) { toast('Erro ao salvar','erro'); }
}

async function carregarListaDiarios() {
  const el = document.getElementById('lista-diarios');
  if (!el) return;
  try {
    const res = await fetch(`${API}/diario`, { credentials:'include' });
    const lista = await res.json();
    if (!lista.length) { el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px">Nenhum diário salvo ainda</div>'; return; }
    el.innerHTML = lista.map(d => {
      const turnoIcon = d.turno === 'Manha' ? '☀️' : d.turno === 'Tarde' ? '🌅' : '🌙';
      const leuBadge = d.leu_anterior ? '<span style="font-size:9px;background:#f0fdf4;color:#166534;border:1px solid #86efac;border-radius:10px;padding:1px 6px">✓ leu</span>' : '';
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);cursor:pointer;margin-bottom:6px" onclick="verDiario(${d.id})">
        <div style="font-size:18px">${turnoIcon}</div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:13px">${d.data} — ${d.turno} ${leuBadge}</div>
          <div style="font-size:11px;color:var(--text3)">${d.supervisor}</div>
        </div>
        <button onclick="event.stopPropagation();exportarDiarioExcel(${d.id})" style="padding:4px 10px;background:#10b981;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px">Excel</button>
      </div>`;
    }).join('');
  } catch(e) { console.warn(e); }
}

async function verDiario(id) {
  try {
    const res = await fetch(`${API}/diario/${id}`, { credentials:'include' });
    const d = await res.json();
    if (!res.ok) return;
    if (document.getElementById('diario-data')) document.getElementById('diario-data').value = d.data;
    if (document.getElementById('diario-turno')) document.getElementById('diario-turno').value = d.turno;
    const obs = typeof d.observacoes === 'string' ? JSON.parse(d.observacoes||'{}') : (d.observacoes||{});
    if (document.getElementById('diario-obs-sep')) document.getElementById('diario-obs-sep').value = obs.separacao||'';
    if (document.getElementById('diario-obs-ck')) document.getElementById('diario-obs-ck').value = obs.checkout||'';
    if (document.getElementById('diario-obs-rep')) document.getElementById('diario-obs-rep').value = obs.reposicao||'';
    if (document.getElementById('diario-obs-geral')) document.getElementById('diario-obs-geral').value = obs.geral||'';
    window._dadosDiario = d.dados;
    const dd = d.dados||{};
    if (dd.separacao) {
      document.getElementById('diario-sep-total').textContent = dd.separacao.total||0;
      document.getElementById('diario-sep-conc').textContent = dd.separacao.concluidos||0;
      document.getElementById('diario-sep-pend').textContent = dd.separacao.pendentes||0;
      document.getElementById('diario-sep-sep').textContent = dd.separacao.separando||0;
    }
    if (dd.checkout) {
      document.getElementById('diario-ck-total').textContent = dd.checkout.total||0;
      document.getElementById('diario-ck-conc').textContent = dd.checkout.concluidos||0;
      document.getElementById('diario-ck-pend').textContent = dd.checkout.pendentes||0;
    }
    if (dd.reposicao) {
      document.getElementById('diario-rep-total').textContent = dd.reposicao.total||0;
      document.getElementById('diario-rep-res').textContent = dd.reposicao.resolvidas||0;
      document.getElementById('diario-rep-pend').textContent = dd.reposicao.pendentes||0;
      document.getElementById('diario-rep-nao').textContent = dd.reposicao.nao_encontrados||0;
    }
  } catch(e) { console.warn(e); }
}

async function exportarDiarioExcel(id) {
  try {
    const res = await fetch(`${API}/diario/${id}`, { credentials:'include' });
    const d = await res.json();
    if (!res.ok) return;
    const dd = d.dados||{};
    const obs = typeof d.observacoes === 'string' ? JSON.parse(d.observacoes||'{}') : (d.observacoes||{});
    const wb = XLSX.utils.book_new();
    const rows = [
      ['DIARIO DE BORDO — WMS MIESS'],
      ['Data:', d.data, 'Turno:', d.turno, 'Supervisor:', d.supervisor, 'Leu anterior:', d.leu_anterior ? 'Sim' : 'Nao'],
      [''],
      ['SEPARACAO'],
      ['Total', 'Concluidos', 'Pendentes', 'Separando'],
      [dd.separacao?.total||0, dd.separacao?.concluidos||0, dd.separacao?.pendentes||0, dd.separacao?.separando||0],
      ['Observacoes:', obs.separacao||''],
      [''],
      ['CHECKOUT'],
      ['Total', 'Concluidos', 'Pendentes'],
      [dd.checkout?.total||0, dd.checkout?.concluidos||0, dd.checkout?.pendentes||0],
      ['Observacoes:', obs.checkout||''],
      [''],
      ['REPOSICAO'],
      ['Total', 'Resolvidas', 'Pendentes', 'Nao Encontrados'],
      [dd.reposicao?.total||0, dd.reposicao?.resolvidas||0, dd.reposicao?.pendentes||0, dd.reposicao?.nao_encontrados||0],
      ['Observacoes:', obs.reposicao||''],
      [''],
      ['PEDIDOS COM PROBLEMA'],
      ['Pedido', 'Cliente', 'Item'],
    ];
    if (dd.problemas?.length) {
      dd.problemas.forEach(p => rows.push([p.pedido||'-', p.cliente||'-', `${p.codigo||''} ${p.item||''}`]));
    } else { rows.push(['Nenhum problema']); }
    rows.push([''], ['OBSERVACOES GERAIS'], [obs.geral||'']);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{wch:20},{wch:25},{wch:20},{wch:20}];
    XLSX.utils.book_append_sheet(wb, ws, 'Diario');
    XLSX.writeFile(wb, `diario_${d.data}_${d.turno}.xlsx`);
    toast('Excel exportado!','sucesso');
  } catch(e) { toast('Erro ao exportar','erro'); }
}

/* EMBALAGEM DESKTOP */
function rowEmb(p) {
  const isDrive    = String(p.transportadora||'').toUpperCase().includes('DRIVE');
  const isPrime    = p.tem_prime;
  const st         = p.status_embalagem || 'pendente';
  const isEmbalado  = st === 'embalado';
  const isEmbalando = st === 'embalando';

  // Status pill
  let pillClass, pillText;
  if (isEmbalado)       { pillClass = 'concluido'; pillText = '✅ Embalado'; }
  else if (isEmbalando) { pillClass = 'separando'; pillText = '⏱ Embalando'; }
  else                  { pillClass = 'pendente';  pillText = '⏳ Pendente'; }

  // Transportadora + badges
  const transp     = p.transportadora || '—';
  const driveBadge = isDrive ? '<span style="font-size:10px;font-weight:800;padding:2px 7px;border-radius:20px;background:#dc2626;color:#fff;margin-left:5px">DRIVE</span>' : '';
  const primeBadge = isPrime ? '<span style="font-size:10px;font-weight:800;padding:2px 7px;border-radius:20px;background:#7c3aed;color:#fff;margin-left:5px">PRIME</span>' : '';

  // Botão de ação
  let acao;
  if (isEmbalado) {
    acao = '<span style="font-size:11px;color:var(--text3)">—</span>';
  } else if (isEmbalando) {
    acao = `<div style="display:flex;gap:5px;flex-wrap:nowrap">
      <button onclick="iniciarEmbalagemDesk(${p.id})" class="btn btn-outline btn-sm" title="Reiniciar">🔄</button>
      <button onclick="encerrarEmbalagemDesk(${p.id})" class="btn btn-success btn-sm">✅ Encerrar</button>
    </div>`;
  } else {
    acao = `<button onclick="iniciarEmbalagemDesk(${p.id})" class="btn btn-primary btn-sm">▶️ Iniciar</button>`;
  }

  return `<tr style="${isEmbalando ? 'background:rgba(37,99,235,.04)' : isEmbalado ? 'opacity:.65' : ''}">
    <td style="font-weight:700;font-family:'Space Mono',monospace;font-size:12px">
      <span style="color:${isDrive ? 'var(--red)' : 'var(--accent)'}">${p.numero_pedido}</span>
    </td>
    <td style="font-size:11px;color:var(--text2);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${p.cliente||''}">${p.cliente||'—'}</td>
    <td style="font-size:11px;font-weight:700;color:${isDrive ? 'var(--red)' : 'var(--indigo)'}">
      ${transp}${driveBadge}${primeBadge}
    </td>
    <td style="font-size:11px;color:var(--text2);white-space:nowrap">${p.hora_checkout||'—'}</td>
    <td style="font-size:11px;color:${isEmbalando ? '#2563eb' : 'var(--text2)'};font-weight:${isEmbalando ? 700 : 400};white-space:nowrap">${p.embalagem_iniciado_em||'—'}</td>
    <td><span class="pill ${pillClass}">${pillText}</span></td>
    <td style="font-size:11px;color:var(--text2)">${p.embalado_por||'—'}</td>
    <td style="font-weight:600;color:${(p.itens||0)>20 ? 'var(--red)' : (p.itens||0)>10 ? 'var(--amber)' : 'var(--text)'}">${p.itens||'—'}</td>
    <td style="white-space:nowrap">${acao}</td>
  </tr>`;
}

async function carregarEmbalagem() {
  const el      = document.getElementById('tbody-embalagem');
  const elTotal = document.getElementById('emb-total');
  const elPend  = document.getElementById('emb-pendentes');
  const elEmb   = document.getElementById('emb-embalados');
  if (!el) return;
  el.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text3)">Carregando...</td></tr>';
  try {
    const ini    = document.getElementById('emb-ini')?.value    || hojeLocal();
    const fim    = document.getElementById('emb-fim')?.value    || ini;
    const status = document.getElementById('emb-status')?.value || '';
    const res = await fetch(`${API}/embalagem?ini=${ini}&fim=${fim}&status=${status}`, { credentials:'include' });
    const pedidos = await res.json();
    if (elTotal) elTotal.textContent = pedidos.length;
    const pend = pedidos.filter(p => p.status_embalagem !== 'embalado').length;
    const emb  = pedidos.filter(p => p.status_embalagem === 'embalado').length;
    if (elPend) elPend.textContent = pend;
    if (elEmb)  elEmb.textContent  = emb;
    if (!pedidos.length) {
      el.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:60px;color:var(--text3);font-size:15px">✅ Nenhum pedido para embalar</td></tr>';
      return;
    }
    const embalando = pedidos.filter(p => p.status_embalagem === 'embalando');
    const pendentes = pedidos.filter(p => !p.status_embalagem || p.status_embalagem === 'pendente' || p.status_embalagem === 'nao_iniciado');
    const embalados = pedidos.filter(p => p.status_embalagem === 'embalado');
    el.innerHTML = [
      ...embalando.map(p => rowEmb(p)),
      ...pendentes.map(p => rowEmb(p)),
      ...embalados.map(p => rowEmb(p)),
    ].join('');
    // Limpa resultado do scan ao recarregar
    const cont = document.getElementById('emb-desk-scan-resultado');
    if (cont && !document.getElementById('emb-desk-scan')?.value) cont.innerHTML = '';
  } catch(e) {
    if (el) el.innerHTML = '<tr><td colspan="9" style="color:#ef4444;text-align:center;padding:24px">Erro ao carregar</td></tr>';
  }
}

async function iniciarEmbalagemDesk(id) {
  try {
    const res = await fetch(`${API}/embalagem/${id}/iniciar`, { method:'PUT', credentials:'include' });
    const r = await res.json();
    if (!res.ok) { toast(r.erro||'Erro','erro'); return; }
    toast(`Embalagem iniciada às ${r.hora_inicio}!`, 'sucesso');
    carregarEmbalagem();
    const scanVal = document.getElementById('emb-desk-scan')?.value?.trim();
    if (scanVal) buscarEmbalagemDesk();
  } catch(e) { toast('Erro ao iniciar','erro'); }
}

async function encerrarEmbalagemDesk(id) {
  try {
    const res = await fetch(`${API}/embalagem/${id}/confirmar`, { method:'PUT', credentials:'include' });
    const r = await res.json();
    if (!res.ok) { toast(r.erro||'Erro','erro'); return; }
    toast('Embalagem concluída! 📦', 'sucesso');
    const scanInput = document.getElementById('emb-desk-scan');
    if (scanInput) scanInput.value = '';
    const cont = document.getElementById('emb-desk-scan-resultado');
    if (cont) cont.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;color:#16a34a;font-weight:700;font-size:13px">
      ✅ Embalagem concluída! Bipe o próximo pedido.
    </div>`;
    carregarEmbalagem();
  } catch(e) { toast('Erro ao encerrar','erro'); }
}

async function buscarEmbalagemDesk() {
  const num  = (document.getElementById('emb-desk-scan')?.value || '').trim();
  const cont = document.getElementById('emb-desk-scan-resultado');
  if (!num) { toast('Digite o número do pedido!','aviso'); return; }
  if (cont) cont.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px">🔍 Buscando...</div>';
  try {
    const ini  = document.getElementById('emb-ini')?.value || hojeLocal();
    const fim  = document.getElementById('emb-fim')?.value || ini;
    const res  = await fetch(`${API}/embalagem?ini=${ini}&fim=${fim}`, { credentials:'include' });
    if (!res.ok) throw new Error();
    const pedidos = await res.json();
    const p = pedidos.find(x => String(x.numero_pedido) === num);
    if (!p) {
      if (cont) cont.innerHTML = `<div style="padding:12px 16px;background:#fef2f2;border:1.5px solid #fecaca;border-radius:10px;color:#dc2626;font-weight:700;font-size:13px">
        ❌ Pedido <b>${num}</b> não encontrado na fila de embalagem
      </div>`;
      return;
    }
    if (cont) cont.innerHTML = renderCardEmb(p, p.status_embalagem === 'embalando', 'desk');
  } catch(e) { if (cont) cont.innerHTML = '<div style="color:#ef4444;font-size:13px;padding:8px">Erro ao buscar</div>'; }
}

// Mantém compatibilidade com código antigo
async function confirmarEmbalagem(id) {
  await encerrarEmbalagemDesk(id);
}

async function exportarEmbalagemExcel() {
  try {
    const ini = document.getElementById('emb-ini')?.value || hojeLocal();
    const fim = document.getElementById('emb-fim')?.value || ini;
    const res = await fetch(`${API}/embalagem?ini=${ini}&fim=${fim}`, { credentials:'include' });
    const pedidos = await res.json();
    const wb = XLSX.utils.book_new();
    const rows = [['Nr Pedido','Cliente','Transportadora','Status','Embalado Por','Hora','Drive','Prime']];
    pedidos.forEach(p => rows.push([
      p.numero_pedido, p.cliente||'', p.transportadora||'',
      p.status_embalagem||'pendente', p.embalado_por||'', p.embalado_em||'',
      String(p.transportadora||'').toUpperCase().includes('DRIVE')?'Sim':'Nao',
      p.tem_prime?'Sim':'Nao'
    ]));
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{wch:12},{wch:25},{wch:18},{wch:12},{wch:20},{wch:8},{wch:8},{wch:8}];
    XLSX.utils.book_append_sheet(wb, ws, 'Embalagem');
    XLSX.writeFile(wb, `embalagem_${ini}_${fim}.xlsx`);
    toast('Excel exportado!','sucesso');
  } catch(e) { toast('Erro ao exportar','erro'); }
}

/* CHECKOUT COUNTERS */
async function carregarContadoresCk() {
  try {
    const ini = document.getElementById('ck-ini')?.value || '';
    const fim = document.getElementById('ck-fim')?.value || '';
    const res = await fetch(`${API}/checkout`, { credentials:'include' });
    let rows = await res.json();
    if (ini) rows = rows.filter(r => (r.data_checkout||'') >= ini);
    if (fim) rows = rows.filter(r => (r.data_checkout||'') <= fim);
    const total     = rows.length;
    const checkouts = rows.filter(r => r.status === 'concluido').length;
    const pendentes = rows.filter(r => r.status !== 'concluido').length;
    const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setEl('ck-cnt-total',     total);
    setEl('ck-cnt-pendentes', pendentes);
    setEl('ck-cnt-checkouts', checkouts);
  } catch(e) { console.warn(e); }
}

/* EMBALAGEM MOBILE */
let _embPedidos = [];

async function ativarMobileEmb() {
  const root = document.getElementById('emb-mobile-root');
  if (root) root.style.display = 'flex';
  mudarTabEmb('fila');
  carregarEmbalagemMobile();
  setInterval(carregarEmbalagemMobile, 30000);
}

function mudarTabEmb(tab) {
  ['fila','scan'].forEach(t => {
    const el  = document.getElementById(`emb-tab-${t}`);
    const btn = document.getElementById(`emb-tab-${t}-btn`);
    const ativo = t === tab;
    if (el)  { el.style.display = ativo ? 'flex' : 'none'; el.style.flexDirection = 'column'; }
    if (btn) {
      btn.style.color            = ativo ? '#4f46e5' : 'var(--text3,#94a3b8)';
      btn.style.borderBottomColor= ativo ? '#4f46e5' : 'transparent';
    }
  });
  if (tab === 'scan') setTimeout(() => document.getElementById('m-emb-scan-input')?.focus(), 200);
}

async function buscarPedidoEmbMobile() {
  const num  = (document.getElementById('m-emb-scan-input')?.value || '').trim();
  const cont = document.getElementById('m-emb-scan-resultado');
  if (!num) { toast('Digite o número do pedido!','aviso'); return; }
  if (cont) cont.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">🔍 Buscando...</div>';

  // Garante lista atualizada
  if (!_embPedidos.length) {
    try {
      const res = await fetch(`${API}/embalagem?status=pendente`, { credentials:'include' });
      if (res.ok) _embPedidos = await res.json();
    } catch(e) {}
  }

  const pedido = _embPedidos.find(p => String(p.numero_pedido) === num);
  if (!pedido) {
    // Tenta recarregar e busca novamente
    try {
      const res = await fetch(`${API}/embalagem?status=pendente`, { credentials:'include' });
      if (res.ok) {
        _embPedidos = await res.json();
        const p2 = _embPedidos.find(p => String(p.numero_pedido) === num);
        if (p2) { if (cont) cont.innerHTML = renderCardEmb(p2, p2.status_embalagem==='embalando', 'mobile'); return; }
      }
    } catch(e) {}
    if (cont) cont.innerHTML = `<div style="text-align:center;padding:50px 20px">
      <div style="font-size:40px;margin-bottom:12px">🔍</div>
      <div style="font-weight:700;color:var(--text)">Pedido ${num} não encontrado</div>
      <div style="color:var(--text3);font-size:13px;margin-top:6px">Não está na fila de embalagem</div>
    </div>`;
    return;
  }
  if (cont) cont.innerHTML = renderCardEmb(pedido, pedido.status_embalagem === 'embalando', 'mobile');
}

function filtrarEmbalagemMobile() {
  const busca = (document.getElementById('m-emb-busca')?.value || '').trim().toLowerCase();
  const el = document.getElementById('m-emb-lista');
  if (!el) return;
  if (!_embPedidos.length) return;
  const filtrados = busca
    ? _embPedidos.filter(p => String(p.numero_pedido).toLowerCase().includes(busca))
    : _embPedidos;
  if (!filtrados.length) {
    el.innerHTML = `<div style="text-align:center;padding:40px 16px">
      <div style="font-size:40px;margin-bottom:12px">🔍</div>
      <div style="font-weight:700;color:var(--text)">Nenhum pedido encontrado</div>
      <div style="color:var(--text3);font-size:13px;margin-top:4px">"${busca}" não corresponde a nenhum pedido</div>
    </div>`;
    return;
  }
  const embalando = filtrados.filter(p => p.status_embalagem === 'embalando');
  const pendentes = filtrados.filter(p => !p.status_embalagem || p.status_embalagem === 'pendente');
  el.innerHTML = [...embalando.map(p => renderCardEmb(p, true, 'mobile')), ...pendentes.map(p => renderCardEmb(p, false, 'mobile'))].join('');
}

function renderCardEmb(p, emAndamento, mode) {
  // mode: 'mobile' (default) | 'desk'
  const isDesk   = mode === 'desk';
  const initFn   = isDesk ? 'iniciarEmbalagemDesk'   : 'iniciarEmbalagemMobile';
  const endFn    = isDesk ? 'encerrarEmbalagemDesk'  : 'encerrarEmbalagemMobile';
  const fmtDt = d => { if (!d) return '—'; const [y,m,dd] = d.split('-'); return `${dd}/${m}/${y}`; };
  const isDrive  = String(p.transportadora||'').toUpperCase().includes('DRIVE');
  const isPrime  = p.tem_prime;
  const isEmbalado = p.status_embalagem === 'embalado';
  const corBorda = isEmbalado ? '#16a34a' : emAndamento ? '#2563eb' : isDrive ? '#dc2626' : isPrime ? '#7c3aed' : '#64748b';
  const corFundo = isEmbalado ? '#f0fdf4' : emAndamento ? '#eff6ff' : isDrive ? '#fef2f2' : isPrime ? '#f5f3ff' : '#f8fafc';
  const statusBadge = isEmbalado
    ? `<span style="font-size:10px;font-weight:800;padding:3px 10px;border-radius:20px;background:#16a34a;color:#fff">✅ EMBALADO</span>`
    : emAndamento
      ? `<span style="font-size:10px;font-weight:800;padding:3px 10px;border-radius:20px;background:#2563eb;color:#fff;animation:pulse 1.5s infinite">⏱ EM ANDAMENTO</span>`
      : '';
  const botoes = isEmbalado
    ? `<div style="padding:12px 16px;background:#f0fdf4;border-top:1px solid #bbf7d0">
         <div style="font-size:12px;color:#16a34a;font-weight:700">✅ Embalado por <b>${p.embalado_por||'—'}</b></div>
       </div>`
    : `<div style="padding:14px 16px;display:grid;grid-template-columns:${emAndamento?'1fr 1fr':'1fr'};gap:10px">
        ${emAndamento ? `
          <button onclick="${initFn}(${p.id})"
            style="padding:14px;background:#f1f5f9;color:#64748b;border:2px solid #cbd5e1;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer">
            🔄 Reiniciar
          </button>
          <button onclick="${endFn}(${p.id})"
            style="padding:14px;background:#16a34a;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(22,163,74,.3)">
            ✅ Encerrar
          </button>
        ` : `
          <button onclick="${initFn}(${p.id})"
            style="padding:16px;background:#4f46e5;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(79,70,229,.3)">
            ▶️ Iniciar Embalagem
          </button>
        `}
       </div>`;
  return `
    <div style="background:var(--surface);border-radius:16px;${!isDesk?'margin-bottom:14px;':''}overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);${isEmbalado?'opacity:.7':''}">
      <div style="background:${corFundo};border-left:5px solid ${corBorda};padding:14px 16px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div style="flex:1;min-width:0">
            <div style="font-family:'Space Mono',monospace;font-size:19px;font-weight:700;color:var(--text)">${p.numero_pedido}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:3px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.cliente||'—'}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;flex-shrink:0">
            ${statusBadge}
            ${isDrive?'<span style="font-size:10px;font-weight:800;padding:3px 10px;border-radius:20px;background:#dc2626;color:#fff">DRIVE</span>':''}
            ${isPrime?'<span style="font-size:10px;font-weight:800;padding:3px 10px;border-radius:20px;background:#7c3aed;color:#fff">PRIME</span>':''}
          </div>
        </div>
      </div>
      <div style="padding:12px 16px;display:grid;grid-template-columns:1fr 1fr;gap:8px;border-bottom:1px solid var(--border)">
        <div style="background:var(--surface2);border-radius:10px;padding:8px 10px;text-align:center">
          <div style="font-size:10px;color:var(--text3);font-weight:600;letter-spacing:.5px;margin-bottom:2px">DATA</div>
          <div style="font-size:13px;font-weight:700;color:var(--text)">${fmtDt(p.data_pedido)}</div>
        </div>
        <div style="background:var(--surface2);border-radius:10px;padding:8px 10px;text-align:center">
          <div style="font-size:10px;color:var(--text3);font-weight:600;letter-spacing:.5px;margin-bottom:2px">ITENS</div>
          <div style="font-size:16px;font-weight:800;color:#4f46e5">${p.itens||0}</div>
        </div>
        <div style="background:var(--surface2);border-radius:10px;padding:8px 10px;text-align:center">
          <div style="font-size:10px;color:var(--text3);font-weight:600;letter-spacing:.5px;margin-bottom:2px">SAIU CHECKOUT</div>
          <div style="font-size:13px;font-weight:700;color:var(--text)">${p.hora_checkout||'—'}</div>
        </div>
        <div style="background:var(--surface2);border-radius:10px;padding:8px 10px;text-align:center">
          <div style="font-size:10px;color:var(--text3);font-weight:600;letter-spacing:.5px;margin-bottom:2px">INÍCIO EMB.</div>
          <div style="font-size:13px;font-weight:700;color:${emAndamento?'#2563eb':'var(--text3)'}">${p.embalagem_iniciado_em||'—'}</div>
        </div>
      </div>
      <div style="padding:8px 16px;border-bottom:1px solid var(--border)">
        <span style="font-size:11px;color:var(--text2)">🚚 ${p.transportadora||'—'}</span>
      </div>
      ${botoes}
    </div>`;
}

async function carregarEmbalagemMobile() {
  const el = document.getElementById('m-emb-lista');
  const cnt = document.getElementById('m-emb-pend');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">Carregando...</div>';
  try {
    const res = await fetch(`${API}/embalagem?status=pendente`, { credentials:'include' });
    const pedidos = await res.json();
    _embPedidos = pedidos;
    if (cnt) cnt.textContent = pedidos.length;
    // Limpa busca ao recarregar lista completa
    const busca = document.getElementById('m-emb-busca');
    if (busca) busca.value = '';
    if (!pedidos.length) {
      el.innerHTML = `<div style="text-align:center;padding:60px 16px">
        <div style="font-size:56px;margin-bottom:16px">✅</div>
        <div style="font-weight:700;font-size:16px;color:var(--text);margin-bottom:6px">Tudo embalado!</div>
        <div style="color:var(--text3);font-size:13px">Nenhum pedido pendente</div>
      </div>`;
      return;
    }
    const embalando = pedidos.filter(p => p.status_embalagem === 'embalando');
    const pendentes = pedidos.filter(p => !p.status_embalagem || p.status_embalagem === 'pendente');
    el.innerHTML = [
      ...embalando.map(p => renderCardEmb(p, true,  'mobile')),
      ...pendentes.map(p => renderCardEmb(p, false, 'mobile')),
    ].join('');
  } catch(e) { if(el) el.innerHTML = '<div style="color:#ef4444;text-align:center;padding:24px">Erro ao carregar</div>'; }
}

async function iniciarEmbalagemMobile(id) {
  try {
    const btn = event?.currentTarget;
    if (btn) { btn.disabled = true; btn.textContent = 'Iniciando...'; }
    const res = await fetch(`${API}/embalagem/${id}/iniciar`, { method:'PUT', credentials:'include' });
    const r = await res.json();
    if (!res.ok) { toast(r.erro||'Erro','erro'); if(btn){btn.disabled=false;btn.textContent='▶️ Iniciar Embalagem';} return; }
    toast(`Embalagem iniciada às ${r.hora_inicio}!`, 'sucesso');
    await carregarEmbalagemMobile();
    // Atualiza card na aba scan se estiver visível
    const scanInput = document.getElementById('m-emb-scan-input');
    if (scanInput?.value.trim() && document.getElementById('emb-tab-scan')?.style.display !== 'none') buscarPedidoEmbMobile();
  } catch(e) { toast('Erro ao iniciar','erro'); }
}

async function encerrarEmbalagemMobile(id) {
  try {
    const btn = event?.currentTarget;
    if (btn) { btn.disabled = true; btn.textContent = 'Encerrando...'; }
    const res = await fetch(`${API}/embalagem/${id}/confirmar`, { method:'PUT', credentials:'include' });
    const r = await res.json();
    if (!res.ok) { toast(r.erro||'Erro','erro'); if(btn){btn.disabled=false;btn.textContent='✅ Encerrar';} return; }
    toast('Embalagem concluída! 📦', 'sucesso');
    // Limpa input e resultado na aba scan
    const scanInput = document.getElementById('m-emb-scan-input');
    if (scanInput) scanInput.value = '';
    const cont = document.getElementById('m-emb-scan-resultado');
    if (cont) cont.innerHTML = `<div style="text-align:center;padding:50px 20px;color:var(--text3)">
      <div style="font-size:48px;margin-bottom:12px">✅</div>
      <div style="font-size:14px;font-weight:700;color:#16a34a">Embalagem concluída!</div>
      <div style="font-size:12px;margin-top:6px">Bipe o próximo pedido</div>
    </div>`;
    await carregarEmbalagemMobile();
  } catch(e) { toast('Erro ao encerrar','erro'); }
}

// Mantém compatibilidade com o botão antigo
async function confirmarEmbalagemMobile(id) {
  await encerrarEmbalagemMobile(id);
}

/* REDEFINIR SENHA PRÓPRIA */
function abrirRedefinirSenha() {
  const modal = document.getElementById('modal-redef-senha');
  if (modal) modal.style.display = 'flex';
}
function fecharRedefinirSenha() {
  const modal = document.getElementById('modal-redef-senha');
  if (modal) modal.style.display = 'none';
  ['redef-senha-atual','redef-senha-nova','redef-senha-conf'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}
async function salvarRedefinirSenha() {
  const atual = document.getElementById('redef-senha-atual')?.value || '';
  const nova  = document.getElementById('redef-senha-nova')?.value  || '';
  const conf  = document.getElementById('redef-senha-conf')?.value  || '';
  if (!atual || !nova || !conf) { toast('Preencha todos os campos','aviso'); return; }
  if (nova.length < 6) { toast('Nova senha minimo 6 caracteres','aviso'); return; }
  if (nova !== conf) { toast('Nova senha e confirmacao nao conferem','aviso'); return; }
  try {
    const res = await fetch(`${API}/auth/redefinir-senha`, {
      method: 'POST', credentials: 'include',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ senha_atual: atual, senha_nova: nova })
    });
    const r = await res.json();
    if (!res.ok) { toast(r.erro || 'Erro ao redefinir','erro'); return; }
    toast('Senha redefinida com sucesso!','sucesso');
    fecharRedefinirSenha();
  } catch(e) { toast('Erro ao redefinir senha','erro'); }
}

async function trocarSenhaTemp() {
  const login = document.getElementById('trocar-login-hidden')?.value || '';
  const nova  = document.getElementById('trocar-senha-nova')?.value  || '';
  const conf  = document.getElementById('trocar-senha-conf')?.value  || '';
  const erroEl = document.getElementById('trocar-erro');
  if (!nova || !conf) { if(erroEl) erroEl.textContent='Preencha todos os campos'; return; }
  if (nova.length < 6) { if(erroEl) erroEl.textContent='Minimo 6 caracteres'; return; }
  if (nova !== conf) { if(erroEl) erroEl.textContent='Senhas nao conferem'; return; }
  try {
    const res = await fetch(`${API}/auth/trocar-senha-temp`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ login, senha_nova: nova, senha_conf: conf })
    });
    const r = await res.json();
    if (!res.ok) { if(erroEl) erroEl.textContent = r.erro||'Erro'; return; }
    // Volta para login com mensagem
    document.getElementById('trocar-senha-box').style.display = 'none';
    document.getElementById('login-box').style.display = 'flex';
    const erroLogin = document.getElementById('login-erro');
    if (erroLogin) { erroLogin.textContent = '✅ Senha alterada! Faça o login.'; erroLogin.style.display='block'; erroLogin.style.color='#16a34a'; }
  } catch(e) { if(erroEl) erroEl.textContent='Erro ao salvar'; }
}

/* ══════════════════════════════════════════
   PASSAGEM DE TURNO
══════════════════════════════════════════ */
let _passagemPendente = null;

function mudarPassagemTab(tab, btn) {
  ['registrar','validar','placar','historico'].forEach(t => {
    const sec = document.getElementById(`pass-sec-${t}`);
    const bt  = document.getElementById(`ptab-${t}`);
    if (sec) sec.style.display = t === tab ? '' : 'none';
    if (bt) {
      bt.style.background = t === tab ? '#2563EB' : '#fff';
      bt.style.color = t === tab ? '#fff' : '#64748B';
      bt.style.border = t === tab ? 'none' : '1.5px solid #E2E8F0';
    }
  });
  if (tab === 'historico') carregarHistoricoPassagens();
  if (tab === 'placar')    carregarPlacar();
}

async function iniciarPassagem() {
  // Set today's date
  const dtEl = document.getElementById('pass-data');
  if (dtEl && !dtEl.value) dtEl.value = hojeLocal();
  mudarPassagemTab('registrar', document.getElementById('ptab-registrar'));
  await Promise.all([carregarPlacar(), carregarHistoricoPassagens(), verificarPassagemPendente()]);
}

async function carregarPlacar() {
  try {
    const res = await fetch(`${API}/passagem/placar`, { credentials:'include' });
    if (!res.ok) return;
    const { placar } = await res.json();
    const el = document.getElementById('pass-placar-content');
    if (!el) return;
    const COR = { Manha:'#F59E0B', Tarde:'#3B82F6', Noite:'#8B5CF6' };
    const EMO = { Manha:'☀️', Tarde:'🌤️', Noite:'🌙' };
    el.innerHTML = `
      <div style="margin-bottom:16px">
        ${placar.map((p,i) => `
          <div style="background:#fff;border:1px solid #E2E8F0;border-left:4px solid ${COR[p.turno]||'#CBD5E1'};border-radius:10px;padding:14px 16px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-size:12px;font-weight:700;color:#0F172A">${i===0?'🥇':i===1?'🥈':'🥉'} ${EMO[p.turno]||''} ${p.turno}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:22px;font-weight:800;color:${COR[p.turno]||'#334155'}">${p.pontos}</div>
              <div style="font-size:10px;color:#94A3B8">pontos</div>
            </div>
          </div>`).join('')}
      </div>
      <button onclick="resetarPlacar(prompt('Turno para resetar (Manha/Tarde/Noite):'))"
        style="width:100%;padding:10px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;font-size:12px;color:#64748B;cursor:pointer">
        🔄 Resetar pontuação de turno
      </button>`;
  } catch(e) { console.warn(e); }
}

async function resetarPlacar(turno) {
  if (!turno || !['Manha','Tarde','Noite'].includes(turno)) { toast('Turno inválido','aviso'); return; }
  try {
    const res = await fetch(`${API}/passagem/placar/resetar`, {
      method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ turno })
    });
    const r = await res.json();
    if (!res.ok) { toast(r.erro||'Erro','erro'); return; }
    toast(r.mensagem, 'info');
    carregarPlacar();
  } catch(e) { console.warn(e); toast('Erro ao resetar','erro'); }
}

async function verificarPassagemPendente() {
  try {
    const res = await fetch(`${API}/passagem/pendente`, { credentials:'include' });
    if (!res.ok) return;
    _passagemPendente = await res.json();
    const badge    = document.getElementById('menu-badge-passagem');
    const badgeTab = document.getElementById('menu-badge-passagem-tab');
    const secValEl = document.getElementById('pass-sec-validar');
    if (_passagemPendente) {
      if (badge)    badge.style.display    = 'inline';
      if (badgeTab) badgeTab.style.display = 'inline';
      if (secValEl) renderFormValidacao(_passagemPendente);
    } else {
      if (badge)    badge.style.display    = 'none';
      if (badgeTab) badgeTab.style.display = 'none';
      if (secValEl) secValEl.innerHTML = '<div style="color:var(--text3);text-align:center;padding:30px;font-size:13px">Nenhuma passagem aguardando validação.</div>';
    }
  } catch(e) { console.warn(e); }
}

function renderFormValidacao(p) {
  const sec = document.getElementById('pass-sec-validar');
  if (!sec) return;
  const SECOES = [
    {
      titulo: '📦 Separação', cor: '#2563EB', fundo: '#EFF6FF', borda: '#BFDBFE',
      campos: [
        { key:'sep_separados',    label:'Separados',      val: p.sep_separados,    pts: 75 },
        { key:'sep_pendentes',    label:'Pendentes',      val: p.sep_pendentes,    pts: 75 },
        { key:'sep_em_separacao', label:'Em Separação',   val: p.sep_em_separacao, pts: 50 },
      ]
    },
    {
      titulo: '✅ Checkout', cor: '#16a34a', fundo: '#F0FDF4', borda: '#BBF7D0',
      campos: [
        { key:'ck_feitos',    label:'Realizados', val: p.ck_feitos,    pts: 75 },
        { key:'ck_pendentes', label:'Pendentes',  val: p.ck_pendentes, pts: 75 },
      ]
    },
    {
      titulo: '📫 Embalagem', cor: '#7C3AED', fundo: '#F5F3FF', borda: '#DDD6FE',
      campos: [
        { key:'emb_embalados', label:'Embalados', val: p.emb_embalados, pts: 75 },
        { key:'emb_pendentes', label:'Pendentes', val: p.emb_pendentes, pts: 75 },
      ]
    },
    {
      titulo: '⚠️ Reposição — Pendências', cor: '#DC2626', fundo: '#FEF2F2', borda: '#FECACA',
      campos: [
        { key:'rep_procurando', label:'Procurando Itens', val: p.rep_procurando, pts: 75 },
        { key:'rep_na_rua',     label:'Caixas na Rua',    val: p.rep_na_rua,     pts: 75 },
      ]
    },
    {
      titulo: '📝 Informações Gerais', cor: '#475569', fundo: '#F8FAFC', borda: '#E2E8F0',
      campos: [
        { key:'separadores_presentes', label:'Separadores Presentes', val: p.separadores_presentes, pts: 25 },
        { key:'ocorrencias',           label:'Ocorrências',           val: p.ocorrencias,           pts: 25 },
      ]
    },
  ];
  const campoHTML = (c) => `
    <div style="background:#fff;border:1px solid #E2E8F0;border-radius:8px;padding:12px;margin-bottom:8px" id="val-card-${c.key}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div style="flex:1">
          <div style="font-size:10px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.5px">${c.label}</div>
          <div style="font-size:15px;font-weight:700;color:#0F172A;margin-top:2px">${c.val !== null && c.val !== undefined && c.val !== '' ? c.val : '—'}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button onclick="marcarCampo('${c.key}',true)" id="btn-ok-${c.key}"
            style="padding:6px 12px;border-radius:7px;border:1.5px solid #BBF7D0;background:#F0FDF4;color:#15803D;font-size:11px;font-weight:600;cursor:pointer">
            ✓ Correto
          </button>
          <button onclick="marcarCampo('${c.key}',false)" id="btn-no-${c.key}"
            style="padding:6px 12px;border-radius:7px;border:1.5px solid #FECACA;background:#FEF2F2;color:#DC2626;font-size:11px;font-weight:600;cursor:pointer">
            ✗ Incorreto <span style="font-size:9px">(-${c.pts}pts)</span>
          </button>
        </div>
      </div>
    </div>`;
  sec.innerHTML = `
    <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:10px;padding:14px 16px;margin-bottom:16px">
      <div style="font-size:12px;font-weight:700;color:#92400E">📋 Passagem pendente de validação</div>
      <div style="font-size:11px;color:#78350F;margin-top:4px">Turno: <b>${p.turno}</b> | Data: <b>${p.data}</b> | Supervisor: <b>${p.supervisor}</b></div>
    </div>
    ${SECOES.map(s => `
      <div style="border:1.5px solid ${s.borda};border-radius:10px;padding:12px 14px;margin-bottom:12px;background:${s.fundo}">
        <div style="font-size:12px;font-weight:700;color:${s.cor};margin-bottom:10px">${s.titulo}</div>
        ${s.campos.map(campoHTML).join('')}
      </div>`).join('')}
    <div style="margin-top:6px">
      <label style="font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase">Observação geral</label>
      <textarea id="val-obs-geral" rows="2" placeholder="Comentário sobre a passagem (opcional)"
        style="width:100%;margin-top:4px;padding:10px;border:1px solid #E2E8F0;border-radius:8px;font-size:13px;resize:none;box-sizing:border-box"></textarea>
    </div>
    <div style="margin-top:6px">
      <label style="font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase">Turno que está ENTRANDO</label>
      <select id="val-turno-entrando" style="width:100%;margin-top:4px;padding:10px;border:1px solid #E2E8F0;border-radius:8px;font-size:13px;box-sizing:border-box">
        <option value="Manha">☀️ Manhã</option>
        <option value="Tarde">🌤️ Tarde</option>
        <option value="Noite">🌙 Noite</option>
      </select>
    </div>
    <button onclick="confirmarValidacao(${p.id})"
      style="width:100%;margin-top:14px;padding:14px;background:#2563EB;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer">
      Confirmar Validação
    </button>`;
}

const _valResultados = {};
function marcarCampo(campo, ok) {
  _valResultados[campo] = ok;
  const card  = document.getElementById(`val-card-${campo}`);
  const btnOk = document.getElementById(`btn-ok-${campo}`);
  const btnNo = document.getElementById(`btn-no-${campo}`);
  if (card) { card.style.borderColor = ok ? '#86EFAC' : '#FCA5A5'; card.style.background = ok ? '#F0FDF4' : '#FEF2F2'; }
  if (btnOk) { btnOk.style.background = ok ? '#16a34a' : '#F0FDF4'; btnOk.style.color = ok ? '#fff' : '#15803D'; }
  if (btnNo) { btnNo.style.background = !ok ? '#DC2626' : '#FEF2F2'; btnNo.style.color = !ok ? '#fff' : '#DC2626'; }
}

async function confirmarValidacao(passagem_id) {
  const CAMPOS = ['sep_separados','sep_pendentes','sep_em_separacao','ck_feitos','ck_pendentes','emb_embalados','emb_pendentes','rep_procurando','rep_na_rua','separadores_presentes','ocorrencias'];
  const naoMarcados = CAMPOS.filter(c => _valResultados[c] === undefined);
  if (naoMarcados.length) { toast(`Marque todos os ${naoMarcados.length} campo(s) antes de confirmar.`,'aviso'); return; }
  const turno_entrando = document.getElementById('val-turno-entrando')?.value;
  const obs_geral = document.getElementById('val-obs-geral')?.value || '';
  try {
    const res = await fetch(`${API}/passagem/${passagem_id}/validar`, {
      method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ turno_entrando, resultados: _valResultados, obs_geral })
    });
    const r = await res.json();
    if (!res.ok) { toast(r.erro||'Erro','erro'); return; }
    const status = r.status === 'contestado' ? '⚠️ Passagem contestada' : '✅ Passagem validada';
    const msg = r.pontos_perdidos > 0 ? `${status} — ${r.pontos_perdidos} pontos descontados!` : `${status} sem penalidades.`;
    toast(msg, r.pontos_perdidos > 0 ? 'aviso' : 'info');
    Object.keys(_valResultados).forEach(k => delete _valResultados[k]);
    await iniciarPassagem();
  } catch(e) { console.warn(e); toast('Erro ao validar','erro'); }
}

async function salvarPassagem() {
  const data  = document.getElementById('pass-data')?.value;
  const turno = document.getElementById('pass-turno')?.value;
  if (!data || !turno) { toast('Preencha data e turno','aviso'); return; }
  const n = id => parseInt(document.getElementById(id)?.value)||0;
  const body = {
    data, turno,
    sep_separados:    n('pass-sep-sep'),
    sep_pendentes:    n('pass-sep-pend'),
    sep_em_separacao: n('pass-sep-em'),
    ck_feitos:        n('pass-ck-feitos'),
    ck_pendentes:     n('pass-ck-pend'),
    emb_embalados:    n('pass-emb-emb'),
    emb_pendentes:    n('pass-emb-pend'),
    rep_procurando:   n('pass-rep-proc'),
    rep_na_rua:       n('pass-rep-rua'),
    separadores_presentes: document.getElementById('pass-seps')?.value||'',
    ocorrencias:       document.getElementById('pass-ocorr')?.value||'',
  };
  try {
    const res = await fetch(`${API}/passagem`, {
      method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const r = await res.json();
    if (!res.ok) { toast(r.erro||'Erro','erro'); return; }
    toast(r.mensagem, 'info');
    carregarHistoricoPassagens();
    verificarPassagemPendente();
  } catch(e) { console.warn(e); toast('Erro ao salvar','erro'); }
}

async function carregarHistoricoPassagens() {
  try {
    const res = await fetch(`${API}/passagem`, { credentials:'include' });
    if (!res.ok) return;
    const lista = await res.json();
    const el = document.getElementById('pass-historico');
    if (!el) return;
    const STATUS_COR  = { pendente:'#F59E0B', validado:'#16a34a', contestado:'#DC2626' };
    const STATUS_NOME = { pendente:'⏳ Pendente', validado:'✅ Validado', contestado:'⚠️ Contestado' };
    el.innerHTML = lista.length ? lista.map(p => `
      <div style="background:#fff;border:1px solid #E2E8F0;border-left:3px solid ${STATUS_COR[p.status]||'#CBD5E1'};border-radius:8px;padding:12px 14px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
          <div>
            <span style="font-size:13px;font-weight:700;color:#0F172A">${p.data} — ${p.turno}</span>
            <span style="margin-left:8px;font-size:11px;font-weight:600;color:${STATUS_COR[p.status]||'#64748B'}">${STATUS_NOME[p.status]||p.status}</span>
          </div>
          <div style="font-size:11px;color:#64748B">${p.supervisor}</div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;font-size:11px;color:#475569">
          <span>📦 ${p.sep_separados||0} sep / ${p.sep_pendentes||0} pend</span>
          <span>✅ ${p.ck_feitos||0} ck / ${p.ck_pendentes||0} pend</span>
          <span>📫 ${p.emb_embalados||0} emb / ${p.emb_pendentes||0} pend</span>
          <span>⚠️ ${p.rep_procurando||0} proc / ${p.rep_na_rua||0} rua</span>
          ${p.pontos_perdidos ? `<span style="color:#DC2626;font-weight:700">-${p.pontos_perdidos} pts</span>` : ''}
        </div>
      </div>`).join('') : '<div style="color:var(--text3);text-align:center;padding:20px;font-size:13px">Nenhuma passagem registrada</div>';
  } catch(e) { console.warn(e); }
}
