/* ══════════════════════════════════════════
   ESTADO GLOBAL
══════════════════════════════════════════ */
const API = window.location.origin;
let usuarioAtual     = null;
let separadorAtual   = null;
let pedidoAtualId    = null;
let pedidoAtualNum   = null;
let itensAtuais      = [];
let todosSeparadores = [];
let pedidosImportar  = [];
let historicoImportacoes = JSON.parse(localStorage.getItem('historico_importacoes') || '[]');
let isMobile = () => window.innerWidth <= 768;

// ── Segurança: escapa HTML para evitar XSS ──
function esc(str) {
  if (!str) return '—';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
let pedidoCaixaVinculada = false;




function hojeLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
const hoje = hojeLocal();
function labelSubtipoRepositor(v) {
  if (v === 'busca') return 'REPOSITOR BUSCA';
  if (v === 'abastecimento') return 'REPOSITOR ABASTECIMENTO';
  return 'REPOSITOR';
}
function modoRepositorAtual() {
  return usuarioAtual?.subtipo_repositor || 'geral';
}
function toggleSubtipoRepositor() {
  const perf = document.getElementById('usr-perfil');
  const wrap = document.getElementById('usr-subtipo-wrap');
  if (!perf || !wrap) return;
  wrap.style.display = perf.value === 'repositor' ? 'block' : 'none';
  // Marca visualmente o perfil principal como ativo e desabilita o checkbox dele
  ['supervisor','separador','repositor','checkout'].forEach(p => {
    const cb  = document.getElementById(`perm-cb-${p}`);
    const lbl = document.getElementById(`perm-${p}`);
    if (!cb || !lbl) return;
    const isMain = p === perf.value;
    cb.disabled = isMain;
    cb.checked  = isMain ? false : cb.checked;
    lbl.style.opacity   = isMain ? '.5' : '1';
    lbl.style.cursor    = isMain ? 'not-allowed' : 'pointer';
    lbl.title = isMain ? 'Este é o perfil principal' : '';
    atualizarPermVisual(p);
  });
}

// Atualiza visual do label quando checkbox muda
function atualizarPermVisual(perfil) {
  const cb  = document.getElementById(`perm-cb-${perfil}`);
  const lbl = document.getElementById(`perm-${perfil}`);
  if (!cb || !lbl) return;
  if (cb.checked && !cb.disabled) {
    lbl.style.borderColor = 'var(--accent)';
    lbl.style.background  = 'rgba(37,99,235,.08)';
    lbl.style.color       = 'var(--accent)';
  } else {
    lbl.style.borderColor = 'var(--border)';
    lbl.style.background  = 'var(--surface2)';
    lbl.style.color       = 'var(--text)';
  }
}




/* ── Relógio ── */
function atualizarRelogio() {
  const agora = new Date();
  const str   = agora.toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo' });
  const el    = document.getElementById('data-hora');
  if (el) el.textContent = str;
}
setInterval(atualizarRelogio, 1000); atualizarRelogio();




/* ── Toast ── */
function toast(msg, tipo='info') {
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.textContent = msg;
  const root = document.getElementById('toast-root');
  root.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}




/* ══════════════════════════════════════════
   LOGIN
══════════════════════════════════════════ */
let perfilSelecionado = '';
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




// ══ SUPERVISOR MOBILE ══
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

function mudarTabSup(tab) {
  ['dashboard','pedidos','reposicao'].forEach(t => {
    const pg = document.getElementById(`sup-tab-${t}`); if(pg) pg.classList.toggle('ativa', t===tab);
    const bt = document.getElementById(`stab-sup-${t}`); if(bt) bt.classList.toggle('ativo', t===tab);
  });
  if (tab==='dashboard') carregarDashboardMobile();
  if (tab==='pedidos')   carregarPedidosMobile();
  if (tab==='reposicao') carregarReposicaoMobile();
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
  if (pag === 'dashboard')       carregarDashboard();
  if (pag === 'pedidos')         { popularSelects(); carregarPedidos(); carregarPedidosBloqueados(); }
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
  ['usuarios','importar','metas'].forEach(t => {
    const el  = document.getElementById(`cad-${t}`);
    const btn = document.getElementById(`ctab-${t}`);
    if (el)  el.style.display  = t===tab ? 'block' : 'none';
    if (btn) btn.className = t===tab ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm';
  });
  if (tab === 'usuarios') carregarUsuarios();
  if (tab === 'importar') renderHistorico();
  if (tab === 'metas')    carregarMetas();
}

async function carregarMetas() {
  try {
    const res = await fetch(`${API}/configuracoes`, { credentials:'include' });
    const cfg = await res.json();
    const elP = document.getElementById('meta-pedidos');
    const elPt= document.getElementById('meta-pontos');
    if (elP)  elP.value  = cfg.meta_pedidos_dia || 25;
    if (elPt) elPt.value = cfg.meta_pontos_dia  || 300;

    // Carrega e exibe layout do estoque
    const resL = await fetch(`${API}/layout-estoque`, { credentials:'include' });
    const layout = await resL.json();
    const el = document.getElementById('layout-estoque-visual');
    if (el) {
      const layoutHtml = Object.entries(layout.corredores).map(([tipo, cors]) => {
        const cor   = tipo==='verde'?'#16A34A':tipo==='azul'?'#0070C0':'#DC2626';
        const bg    = tipo==='verde'?'#F0FDF4':tipo==='azul'?'#EFF6FF':'#FEF2F2';
        const multi = layout.multiplicadores[tipo];
        return `<div style="background:${bg};border:1.5px solid ${cor}30;border-radius:10px;padding:10px 14px;margin-bottom:8px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <span style="font-size:13px;font-weight:700;color:${cor}">${layout.descricoes[tipo]}</span>
            <span style="background:${cor};color:#fff;border-radius:6px;padding:2px 10px;font-size:12px;font-weight:800">×${multi}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${cors.map(c=>`<span style="background:${cor};color:#fff;border-radius:6px;padding:3px 10px;font-size:13px;font-weight:800">${c}</span>`).join('')}
          </div>
        </div>`;
      }).join('');
      el.innerHTML = layoutHtml;
      // Also update the one in pedidos tab
      const el2 = document.getElementById('layout-estoque-visual-ped');
      if (el2) el2.innerHTML = layoutHtml;
    }
  } catch(e) {}
}

async function salvarMetas() {
  const pedidos = parseInt(document.getElementById('meta-pedidos')?.value) || 30;
  const pontos  = parseInt(document.getElementById('meta-pontos')?.value)  || 200;
  try {
    const res = await fetch(`${API}/configuracoes`, {
      method:'PUT', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ meta_pedidos_dia: pedidos, meta_pontos_dia: pontos })
    });
    const data = await res.json();
    if (data.erro) { toast(data.erro,'erro'); return; }
    toast(`✅ Metas salvas! ${pedidos} pedidos / ${pontos} pontos por dia`,'sucesso');
  } catch(e) { toast('Erro ao salvar!','erro'); }
}




/* ══════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════ */
// ══ ALERTAS EM TEMPO REAL ══
let alertaInterval = null;

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

async function carregarDashboard() {
  await popularSelects();
  await carregarKPIs();
  await carregarProdutividade();
  await carregarTimeline();
  await atualizarBadgeRep();
  const el = document.getElementById('dash-ultima-atualizacao');
  if (el) el.textContent = '— atualizado ' + new Date().toLocaleTimeString('pt-BR', {timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'});
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




async function carregarContadoresGerais() {
  await carregarKPIs();
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




async function popularSelects() {
  try {
    const res   = await fetch(`${API}/usuarios`, { credentials:'include' });
    const users = await res.json();
    const seps  = users.filter(u => u.perfil === 'separador');
    todosSeparadores = seps;
    ['filtro-sep-prod','filtro-ped-sep'].forEach(id => {
      const sel = document.getElementById(id); if (!sel) return;
      const val = sel.value;
      sel.innerHTML = '<option value="">Todos</option>' + seps.map(s=>`<option value="${s.id}">${s.nome}</option>`).join('');
      sel.value = val;
    });
  } catch(e) {}
}




/* ══════════════════════════════════════════
   HELPERS
══════════════════════════════════════════ */
function formatarData(iso) {
  if (!iso) return '—';
  const p = iso.split('-');
  if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
  return iso;
}




/* ══════════════════════════════════════════
   PEDIDOS
══════════════════════════════════════════ */
// ══ TABS DE PEDIDOS ══
function trocarPedidosTab(tab) {
  ['lista','metas'].forEach(t => {
    const el  = document.getElementById(`ped-tab-${t}`);
    const btn = document.getElementById(`btn-ped-tab-${t}`);
    if (el)  el.style.display  = t === tab ? 'block' : 'none';
    if (btn) btn.className = t === tab ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm';
  });
  if (tab === 'metas') {
    carregarMetas();
    carregarPlacarHoje();
  }
}

// ══ DISTRIBUIÇÃO AUTOMÁTICA ══
async function distribuirPedidos() {
  const pendentes = document.querySelectorAll('#tbody-pedidos tr').length;
  if (!confirm('Distribuir todos os pedidos pendentes automaticamente entre os separadores ativos?')) return;
  try {
    const res  = await fetch(`${API}/distribuir-pedidos`, {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'}
    });
    const data = await res.json();
    if (data.erro) { toast(data.erro,'erro'); return; }

    // Mostra resumo da distribuição
    let resumoHtml = Object.entries(data.resumo||{})
      .map(([sep,qtd]) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
        <span style="font-weight:600">👤 ${sep}</span>
        <span style="color:var(--accent);font-weight:700">${qtd} pedido${qtd>1?'s':''}</span>
      </div>`).join('');

    const msg = document.createElement('div');
    msg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--surface);border-radius:16px;padding:24px;max-width:400px;width:90%;z-index:9999;box-shadow:0 20px 60px rgba(0,0,0,.3)';
    msg.innerHTML = `
      <div style="font-family:'Space Mono',monospace;font-size:16px;color:var(--text);margin-bottom:16px">✅ Distribuição Concluída!</div>
      <div style="font-size:13px;color:var(--text3);margin-bottom:12px">${data.distribuidos} pedidos distribuídos</div>
      <div style="background:var(--surface2);border-radius:10px;padding:10px 14px;margin-bottom:16px">${resumoHtml}</div>
      <button class="btn btn-primary" style="width:100%" onclick="this.parentNode.remove();carregarPedidos()">OK</button>`;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998';
    overlay.onclick = () => { overlay.remove(); msg.remove(); carregarPedidos(); };
    document.body.appendChild(overlay);
    document.body.appendChild(msg);
  } catch(e) { toast('Erro ao distribuir!','erro'); }
}

// ══ PLACAR DE HOJE ══
async function carregarPlacarHoje() {
  const lista = document.getElementById('placar-hoje-lista');
  if (!lista) return;
  try {
    const res  = await fetch(`${API}/produtividade`, { credentials:'include' });
    const data = await res.json();
    const seps = data.dados || data || [];
    // Load metas
    const cfgRes = await fetch(`${API}/configuracoes`, { credentials:'include' });
    const cfg = await cfgRes.json();
    const metaPts = parseInt(cfg.meta_pontos_dia)||300;
    const metaPed = parseInt(cfg.meta_pedidos_dia)||25;

    if (!seps.length) { lista.innerHTML='<div style="color:var(--text3);text-align:center;padding:20px">Nenhum separador</div>'; return; }

    lista.innerHTML = seps.filter(s=>s.status==='ativo').map(s => {
      const pctPed = Math.min(Math.round(((s.hoje||0)/metaPed)*100),100);
      const pctPts = Math.min(Math.round(((s.pontos_hoje||0)/metaPts)*100),100);
      const corPed = pctPed>=100?'var(--green)':pctPed>=70?'var(--amber)':'var(--accent)';
      const corPts = pctPts>=100?'var(--green)':pctPts>=70?'var(--amber)':'var(--accent)';
      return `<div style="padding:12px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-weight:700;color:var(--text)">${s.nome}</span>
          <div style="display:flex;gap:8px">
            <span style="font-size:12px;font-weight:700;color:${corPed}">📦 ${s.hoje||0}/${metaPed}</span>
            <span style="font-size:12px;font-weight:700;color:${corPts}">⚡ ${s.pontos_hoje||0}/${metaPts}</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:11px;color:var(--text3);width:60px">Pedidos</span>
            <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
              <div style="width:${pctPed}%;height:100%;background:${corPed};border-radius:3px;transition:width .5s"></div>
            </div>
            <span style="font-size:11px;font-weight:700;color:${corPed};width:30px;text-align:right">${pctPed}%</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:11px;color:var(--text3);width:60px">Pontos</span>
            <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
              <div style="width:${pctPts}%;height:100%;background:${corPts};border-radius:3px;transition:width .5s"></div>
            </div>
            <span style="font-size:11px;font-weight:700;color:${corPts};width:30px;text-align:right">${pctPts}%</span>
          </div>
        </div>
      </div>`;
    }).join('');
  } catch(e) {}
}

// Atualiza carregarMetas para usar o id duplicado da aba pedidos também
const _carregarMetasOrig = carregarMetas;

async function carregarPedidos() {
  try {
    const ini    = document.getElementById('filtro-ped-ini').value;
    const fim    = document.getElementById('filtro-ped-fim').value;
    const sepId  = document.getElementById('filtro-ped-sep').value;
    const status = document.getElementById('filtro-ped-status').value;
    const numPed = document.getElementById('filtro-ped-num').value.trim();
    let url = `${API}/pedidos?`;
    if (sepId)  url += `separador_id=${sepId}&`;
    if (status) url += `status=${encodeURIComponent(status)}&`;
    if (numPed) url += `numero_pedido=${encodeURIComponent(numPed)}&`;
    const res = await fetch(url);
    let ps    = await res.json();
    if (ini) ps = ps.filter(p => p.data_pedido >= ini);
    if (fim) ps = ps.filter(p => p.data_pedido <= fim);
    const tbody = document.getElementById('tbody-ped');
    if (!ps.length) { tbody.innerHTML = '<tr><td colspan="7" style="color:var(--text3);text-align:center;padding:28px">Nenhum pedido</td></tr>'; return; }
    tbody.innerHTML = ps.map(p=>`<tr>
      <td style="font-weight:600;color:var(--text)">${p.numero_pedido}</td>
      <td>${p.separador_nome||'—'}</td>
      <td><span class="pill ${(p.status||'').replace(' ','-')}">${p.status}</span></td>
      <td>${p.itens||'—'}</td>
      <td class="data-br">${formatarData(p.data_pedido)}</td>
      <td class="hora-br">${p.hora_pedido||'—'}</td>
      <td>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${(p.peso||0)>0?`<span style="font-size:10px;font-weight:700;color:${(p.peso||0)>=30?'var(--red)':(p.peso||0)>=15?'var(--amber)':'var(--green)'}">⚡ ${p.peso||0} pts &nbsp;•&nbsp; 🛣️ ${p.corredores_count||0} ruas &nbsp;•&nbsp; 📦 ${p.unidades_total||0} un.</span>`:''}
          <select class="sel-sm" onchange="atribuirSeparador(${p.id},this.value)" id="sel-sep-${p.id}">
            <option value="">— atribuir —</option>
            ${todosSeparadores.map(s=>`<option value="${s.id}"${p.separador_id==s.id?' selected':''}>${s.nome}</option>`).join('')}
          </select>
        </div>
      </td>
    </tr>`).join('');
  } catch(e) {}
}




async function sugerirSeparador(pedidoId) {
  try {
    const res  = await fetch(`${API}/sugestao-separador/${pedidoId}`, { credentials:'include' });
    const data = await res.json();
    if (!data.sugestao) { toast('Nenhum separador disponível','aviso'); return; }
    const s = data.sugestao;
    const msg = `💡 Sugestão: ${s.nome}\n📦 ${s.pedidos_hoje} pedidos hoje &nbsp; ⚡ ${s.pontos_hoje} pontos\nAtribuir este separador?`;
    if (!confirm(msg)) return;
    // Seleciona no dropdown e atribui
    const sel = document.getElementById(`sel-sep-${pedidoId}`);
    if (sel) { sel.value = s.id; }
    await atribuirSeparador(pedidoId, s.id);
    // Mostra placar rápido
    toast(`✅ Atribuído para ${s.nome} (${s.pontos_hoje} pts hoje)`,'sucesso');
  } catch(e) { toast('Erro ao buscar sugestão','erro'); }
}

async function atribuirSeparador(pid, sid) {
  if (!sid) return;
  try {
    await fetch(`${API}/pedidos/${pid}/separador`, { credentials:'include', method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({separador_id:sid}) });
    toast('Usuário atribuído!', 'sucesso');
  } catch(e) { toast('Erro ao atribuir!', 'erro'); }
}




/* ══════════════════════════════════════════
   USUÁRIOS
══════════════════════════════════════════ */
function coletarPerfisMarcados() {
  return Array.from(document.querySelectorAll('.usr-perm:checked')).map(el => el.value);
}




async function carregarUsuarios() {
  try {
    const res   = await fetch(`${API}/usuarios`, { credentials:'include' });
    const users = await res.json();
    const tbody = document.getElementById('tbody-usr');
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="color:var(--text3);text-align:center;padding:14px">Nenhum usuário</td></tr>';
      return;
    }
    
    tbody.innerHTML = users.map(u => {
      const acessos = [u.perfil]
        .concat((u.perfis_acesso || '').split(',').filter(Boolean))
        .filter((v,i,arr) => arr.indexOf(v) === i)
        .join(', ');
      
      const perfilIcon = {supervisor:'👔',separador:'📦',repositor:'🔧',checkout:'🏷️'};
      const perfilLabel = {supervisor:'Supervisão',separador:'Separação',repositor:'Reposição',checkout:'Checkout'};
      const acessosHtml = acessos.split(', ').filter(Boolean).map(p =>
        `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;background:rgba(37,99,235,.08);color:var(--accent);border:1px solid rgba(37,99,235,.2);margin:2px">${perfilIcon[p]||''} ${perfilLabel[p]||p}</span>`
      ).join('');
      return `<tr>
        <td style="color:var(--text);font-weight:600;font-size:13px">${u.nome}</td>
        <td style="color:var(--accent);font-size:12px;font-family:'Space Mono',monospace">${u.login}</td>
        <td><span class="pill ${u.perfil}" style="font-size:11px">${perfilIcon[u.perfil]||''} ${perfilLabel[u.perfil]||u.perfil}</span></td>
        <td style="max-width:180px">${acessosHtml||'<span style="color:var(--text3);font-size:11px">—</span>'}</td>
        <td style="font-size:12px;color:var(--text2)">${u.turno||'—'}</td>
        <td><span class="pill ${u.status}">${u.status==='ativo'?'✅ Ativo':'⛔ Inativo'}</span></td>
        <td>
          <div style="display:flex;gap:5px">
            <button class="btn btn-sm" style="background:${u.status==='ativo'?'var(--amber)':'var(--green)'};color:#fff;padding:5px 10px"
              onclick="alterarStatusUsuario(${u.id},'${u.status==='ativo'?'inativo':'ativo'}','${u.nome}','${u.login}','${u.perfil}','${u.turno||''}')">
              ${u.status==='ativo'?'⛔':'✅'}
            </button>
            <button class="btn btn-sm btn-danger" style="padding:5px 10px" onclick="excluirUsuario(${u.id},'${u.nome}')">🗑</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  } catch(e) {}
}




async function cadastrarUsuario() {
  const nome   = document.getElementById('usr-nome').value.trim();
  const login  = document.getElementById('usr-login').value.trim();
  const senha  = document.getElementById('usr-senha').value;
  const perfil = document.getElementById('usr-perfil').value;
  const subtipo_repositor = document.getElementById('usr-subtipo-repositor')?.value || 'geral';
  const turno  = document.getElementById('usr-turno').value;
  const perfis_acesso = coletarPerfisMarcados().filter(p => p !== perfil);
  if (!nome || !login || !senha) { toast('Preencha todos os campos!','aviso'); return; }
  if (senha.length < 6) { toast('Senha mínimo 6 caracteres!','aviso'); return; }
  try {
    const res = await fetch(`${API}/usuarios`, { credentials:'include', method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ nome, login, senha, perfil, subtipo_repositor, turno, perfis_acesso: perfis_acesso }) });
    const data = await res.json();
    if (!res.ok) { toast(data.erro || 'Erro ao cadastrar!','erro'); return; }
    toast('Usuário cadastrado!','sucesso');
    document.getElementById('usr-nome').value = '';
    document.getElementById('usr-login').value = '';
    document.getElementById('usr-senha').value = '';
    document.querySelectorAll('.usr-perm').forEach(el => el.checked = false);
    document.getElementById('usr-perfil').value = 'separador';
    toggleSubtipoRepositor();
    carregarUsuarios();
    popularSelects();
  } catch(e) {
    toast('Erro ao cadastrar!','erro');
  }
}




async function alterarStatusUsuario(id, novoStatus, nome, login, perfil, turno) {
  try {
    await fetch(`${API}/usuarios/${id}`, { credentials:'include', method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({nome,login,perfil,turno:turno||'Manhã',status:novoStatus}) });
    toast(`Usuário ${novoStatus==='ativo'?'ativado':'desativado'}!`,'sucesso');
    carregarUsuarios();
  } catch(e) { toast('Erro!','erro'); }
}




async function excluirUsuario(id, nome) {
  if (!confirm(`Excluir "${nome}"?`)) return;
  try {
    await fetch(`${API}/usuarios/${id}`, { credentials:'include', method:'DELETE' });
    toast('Excluído!','sucesso'); carregarUsuarios();
  } catch(e) { toast('Erro!','erro'); }
}




/* ══════════════════════════════════════════
   IMPORTAÇÃO
══════════════════════════════════════════ */
function handleDrop(e) {
  e.preventDefault(); document.getElementById('upload-area').classList.remove('drag');
  const f = e.dataTransfer.files[0]; if (f) processarArquivoFile(f);
}
function processarArquivo(e) { const f = e.target.files[0]; if (f) processarArquivoFile(f); }




/* Variável global para transportadoras lidas */
let transportadorasImportar = [];

function processarArquivoFile(file) {
  mostrarStatus('⏳ Lendo arquivo...','carregando');
  document.getElementById('preview-importacao').style.display = 'none';
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type:'array' });

      // ── Detecta aba de itens (primeira que tem "codigo" ou "pedido") ──
      function lerAba(sheetName) {
        const ws = wb.Sheets[sheetName];
        return XLSX.utils.sheet_to_json(ws, { defval:'', header:1 });
      }
      function norm(s) { return String(s).toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

      // Procura aba de Itens (tem coluna "codigo" ou "descricao")
      let abaItens = null, abaTransp = null;
      for (const name of wb.SheetNames) {
        const rows = lerAba(name);
        if (!rows.length) continue;
        const cab = rows[0].map(norm);
        const temItens = cab.some(c=>c.includes('cod')) && cab.some(c=>c.includes('desc'));
        const temTransp = cab.some(c=>c.includes('transp')||c.includes('entrega')||c.includes('servico')||c.includes('servi'));
        if (temItens && !abaItens) abaItens = name;
        if (temTransp && !abaTransp) abaTransp = name;
      }
      if (!abaItens) abaItens = wb.SheetNames[0];

      // ── Lê aba de Itens ──
      const rows = lerAba(abaItens);
      if (!rows.length) throw new Error('Arquivo vazio');
      const cab = rows[0].map(norm);
      const temCab = cab.some(c=>c.includes('pedido')||c.includes('codigo')||c.includes('descricao'));
      const ini   = temCab ? 1 : 0;
      const iNum  = temCab ? Math.max(cab.findIndex(c=>c.includes('pedido')||c.includes('numero')),0) : 0;
      const iCod  = temCab ? (cab.findIndex(c=>c.includes('cod'))>=0 ? cab.findIndex(c=>c.includes('cod')) : 1) : 1;
      const iDesc = temCab ? (cab.findIndex(c=>c.includes('desc'))>=0 ? cab.findIndex(c=>c.includes('desc')) : 2) : 2;
      const iQtd  = temCab ? (cab.findIndex(c=>c.includes('qtd')||c.includes('quant'))>=0 ? cab.findIndex(c=>c.includes('qtd')||c.includes('quant')) : 4) : 4;
      const iEnd  = temCab ? (cab.findIndex(c=>c.includes('end')||c.includes('rua')||c.includes('ender'))>=0 ? cab.findIndex(c=>c.includes('end')||c.includes('rua')||c.includes('ender')) : 3) : 3;
      const dados = [];
      for (let i = ini; i < rows.length; i++) {
        const r = rows[i];
        const num = String(r[iNum]||'').trim();
        if (!num) continue;
        dados.push({ numero_pedido:num, codigo:String(r[iCod]||'').trim(), descricao:String(r[iDesc]||'').trim(), quantidade:parseInt(r[iQtd])||1, endereco:String(r[iEnd]||'').trim() });
      }
      if (!dados.length) { mostrarStatus('❌ Nenhuma linha encontrada!','erro'); return; }
      pedidosImportar = dados;

      // ── Lê aba de Transportadora (se existir) ──
      transportadorasImportar = [];
      if (abaTransp) {
        const tRows = lerAba(abaTransp);
        if (tRows.length > 1) {
          const tCab = tRows[0].map(norm);
          const tNum   = tCab.findIndex(c=>c.includes('pedido')||c.includes('numero'));
          // Procura coluna de serviço de entrega
          const tTransp= tCab.findIndex(c=>c.includes('servico')||c.includes('servi')||c.includes('entrega')||c.includes('transp'));
          // Razão social / nome do destinatário
          const tRazao = tCab.findIndex(c=>c.includes('razao')||c.includes('social')||c.includes('nome')||c.includes('destinat'));
          for (let i = 1; i < tRows.length; i++) {
            const r = tRows[i];
            const num = String(r[tNum>=0?tNum:0]||'').trim();
            if (!num) continue;
            transportadorasImportar.push({
              numero_pedido: num,
              transportadora: tTransp>=0 ? String(r[tTransp]||'').trim() : '',
              razao_social:   tRazao>=0  ? String(r[tRazao]||'').trim()  : ''
            });
          }
        }
      }

      const totalP = new Set(dados.map(d=>d.numero_pedido)).size;
      const transpInfo = transportadorasImportar.length > 0 ? ` • 🚚 ${transportadorasImportar.length} transportadoras` : '';
      mostrarStatus(`✅ ${dados.length} linha(s) em ${totalP} pedido(s)${transpInfo} — clique Importar`,'sucesso');
      document.getElementById('tbody-prev').innerHTML =
        dados.slice(0,10).map(d=>`<tr><td>${d.numero_pedido}</td><td style="color:var(--accent)">${d.codigo}</td><td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.descricao}</td><td style="color:var(--amber)">${d.endereco}</td><td style="color:var(--green)">${d.quantidade}</td></tr>`).join('') +
        (dados.length>10?`<tr><td colspan="5" style="color:var(--text3);text-align:center;padding:8px">... +${dados.length-10} linhas</td></tr>`:'');
      document.getElementById('txt-total-import').textContent = `${totalP} pedido(s) • ${dados.length} itens${transpInfo}`;
      document.getElementById('preview-importacao').style.display = 'block';
    } catch(err) { mostrarStatus(`❌ ${err.message}`,'erro'); }
  };
  reader.onerror = () => mostrarStatus('❌ Erro ao abrir arquivo!','erro');
  reader.readAsArrayBuffer(file);
}




 async function confirmarImportacao() {
  if (!pedidosImportar.length) return;
  mostrarStatus('⏳ Importando...', 'carregando');




  // Agrupa por pedido antes de enviar — garante que todos os itens ficam juntos
  const pedMapLocal = {};
  pedidosImportar.forEach(l => {
    const n = String(l.numero_pedido||'').trim();
    if (!n) return;
    if (!pedMapLocal[n]) pedMapLocal[n] = [];
    pedMapLocal[n].push(l);
  });
  const numeros = Object.keys(pedMapLocal);
  const LOTE_PEDIDOS = 20; // lote de 20 pedidos completos por vez
  let totalImportados = 0, totalIgnorados = 0;




  try {
    for (let i = 0; i < numeros.length; i += LOTE_PEDIDOS) {
      const loteNums  = numeros.slice(i, i + LOTE_PEDIDOS);
      const linhasLote = [];
      loteNums.forEach(n => linhasLote.push(...pedMapLocal[n]));
      const progresso = Math.round(((i + loteNums.length) / numeros.length) * 100);
      mostrarStatus(`⏳ Importando... ${progresso}% (${Math.min(i+LOTE_PEDIDOS,numeros.length)}/${numeros.length} pedidos)`, 'carregando');




      const res  = await fetch(`${API}/importar`, {
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ linhas: linhasLote, transportadoras: transportadorasImportar })
      });
      const data = await res.json();
      if (data.erro) { mostrarStatus(`❌ ${data.erro}`, 'erro'); return; }
      totalImportados += data.importados || 0;
      totalIgnorados  += data.ignorados  || 0;
    }




    const reg = {
      data: new Date().toLocaleDateString('pt-BR', {timeZone:'America/Sao_Paulo'}),
      hora: new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', timeZone:'America/Sao_Paulo' }),
      total: numeros.length, ok: totalImportados, erro: totalIgnorados
    };
    historicoImportacoes.unshift(reg);
    if (historicoImportacoes.length > 20) historicoImportacoes = historicoImportacoes.slice(0, 20);
    localStorage.setItem('historico_importacoes', JSON.stringify(historicoImportacoes));
    renderHistorico();
    mostrarStatus(`✅ ${totalImportados} pedido(s) importado(s)!${totalIgnorados > 0 ? ` ⚠️ ${totalIgnorados} já existiam.` : ''}`, 'sucesso');
    document.getElementById('preview-importacao').style.display = 'none';
    pedidosImportar = [];
    document.getElementById('input-arquivo').value = '';
    toast(`${totalImportados} pedidos na fila!`, 'sucesso');
  } catch(e) {
    mostrarStatus('❌ Erro na importação!', 'erro');
  }
}




function renderHistorico() {
  const el = document.getElementById('hist-importacoes');
  if (!historicoImportacoes.length) { el.innerHTML = '<div style="color:var(--text3);font-size:11px;text-align:center;padding:14px">Nenhuma importação</div>'; return; }
  el.innerHTML = historicoImportacoes.map(h=>`
    <div class="hist-item">
      <div><div style="color:var(--green);font-weight:700">✅ ${h.ok} pedido(s)</div>${h.erro>0?`<div style="color:var(--amber);font-size:10px">⚠️ ${h.erro} já existiam</div>`:''}</div>
      <div style="color:var(--text3);font-size:10px">${h.data} às ${h.hora}</div>
    </div>`).join('');
}




function limparHistorico() {
  if (!confirm('Limpar histórico?')) return;
  historicoImportacoes = []; localStorage.removeItem('historico_importacoes');
  renderHistorico(); toast('Histórico limpo!','info');
}




function mostrarStatus(msg, tipo) {
  const cores = { carregando:'background:#EFF6FF;border:1px solid #BFDBFE;color:#1D4ED8', sucesso:'background:#F0FDF4;border:1px solid #BBF7D0;color:#15803D', erro:'background:#FEF2F2;border:1px solid #FECACA;color:#DC2626' };
  const el = document.getElementById('status-leitura');
  el.setAttribute('style', `display:block;margin-top:10px;padding:10px;border-radius:8px;font-size:12px;font-weight:600;text-align:center;${cores[tipo]}`);
  el.textContent = msg;
}




/* ══════════════════════════════════════════
   MOBILE REPOSITOR
══════════════════════════════════════════ */
let repFiltroAtual = '';

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
  } catch(e) { console.error(e); }
}




// Função unificada para marcar aviso no mobile
// Carrega e renderiza o histórico de etapas de um aviso específico
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




// Manter compatibilidade com funções antigas
async function marcarRepostoMobile(id, qtdTotal) { await marcarAvisoMobile(id, qtdTotal, 'encontrado'); }
async function marcarNaoEncontradoMobile(id) { await marcarAvisoMobile(id, 0, 'nao_encontrado'); }
async function marcarProtocoloMobile(id) { await marcarAvisoMobile(id, 0, 'protocolo'); }




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




/* ══════════════════════════════════════════
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
    const res  = await fetch(`${API}/estatisticas/checkout`, { credentials:'include' });
    const data = await res.json();
    const set  = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val ?? 0; };
    set('m-ck-hoje', data.concluidos_hoje);
    set('m-ck-mes',  data.concluidos_mes);
    set('m-ck-pend', data.pendentes);
  } catch(e) {}
}




/* ══════════════════════════════════════════
   ESTATÍSTICAS REPOSITOR (desktop)
══════════════════════════════════════════ */
// ══ PARA GUARDAR — itens que subiram, aguardando ser abastecidos ══
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

// ══ HISTÓRICO COMPLETO — SUPERVISOR ══
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




/* ══════════════════════════════════════════
   ESTATÍSTICAS CHECKOUT (desktop)
══════════════════════════════════════════ */
async function carregarStatsCheckout() {
  try {
    const res  = await fetch(`${API}/estatisticas/checkout`, { credentials:'include' });
    const data = await res.json();
    const set  = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val ?? 0; };
    set('sck-hoje',       data.concluidos_hoje);
    set('sck-mes',        data.concluidos_mes);
    set('sck-ano',        data.concluidos_ano);
    set('sck-pend',       data.pendentes);
    set('sck-importados', data.total_hoje);
    // Carrega lista
    const status = document.getElementById('sck-filtro-status')?.value || '';
    const res2   = await fetch(`${API}/checkout${status?'?status='+status:''}`, { credentials:'include' });
    const rows   = await res2.json();
    const tbody  = document.getElementById('tbody-sck-lista');
    if (tbody) {
      if (!rows.length) { tbody.innerHTML = '<tr><td colspan="6" style="color:var(--text3);text-align:center;padding:18px">Nenhum checkout</td></tr>'; return; }
      tbody.innerHTML = rows.map(r=>`<tr>
        <td style="font-family:'Space Mono',monospace;font-weight:700;color:var(--amber)">${r.numero_caixa||'—'}</td>
        <td style="font-weight:700;color:var(--accent)">${r.numero_pedido}</td>
        <td>${r.separador_nome||'—'}</td>
        <td><span class="pill ${r.status}">${r.status==='concluido'?'Concluído':'Pendente'}</span></td>
        <td class="data-br">${formatarData(r.data_checkout)}</td>
        <td class="hora-br">${r.hora_checkout||r.hora_criacao||'—'}</td>
      </tr>`).join('');
    }
  } catch(e) { toast('Erro ao carregar estatísticas de checkout!','erro'); }
}




/* ══════════════════════════════════════════
   PEDIDOS BLOQUEADOS (supervisor)
══════════════════════════════════════════ */
async function carregarPedidosBloqueados() {
  try {
    const res  = await fetch(`${API}/pedidos/bloqueados`, { credentials:'include' });
    const rows = await res.json();
    const wrap = document.getElementById('dash-bloqueados-wrap');
    const lista= document.getElementById('lista-bloqueados');
    // Atualiza badge no menu Pedidos
    const badge = document.getElementById('menu-badge-bloq');
    if (badge) { badge.textContent = rows.length; badge.style.display = rows.length > 0 ? 'inline' : 'none'; }
    if (!wrap || !lista) return;
    if (!rows.length) { wrap.style.display='none'; return; }
    wrap.style.display = 'block';
    lista.innerHTML = rows.map(r => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-bottom:1px solid #FECACA;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-weight:700;color:var(--red);font-size:14px">⛔ Pedido #${r.numero_pedido}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">
            👤 ${r.separador_nome||'—'} &nbsp;•&nbsp; 
            Itens bloqueados: <b style="color:var(--text)">${r.codigos_bloqueados||'—'}</b>
          </div>
        </div>
        <button class="btn btn-success btn-sm" onclick="desbloquearPedido(${r.id},'${r.numero_pedido}')">✅ Liberar Pedido</button>
      </div>`).join('');
  } catch(e) {}
}




async function desbloquearPedido(id, num) {
  if (!confirm(`Liberar pedido #${num}? Ele será marcado como concluído.`)) return;
  try {
    await fetch(`${API}/pedidos/${id}/desbloquear`, { credentials:'include', method:'PUT' });
    toast(`✅ Pedido #${num} liberado!`,'sucesso');
    carregarPedidosBloqueados();
    carregarKPIs();
  } catch(e) { toast('Erro!','erro'); }
}




async function liberarCaixaDesktop(id) {
  if (!confirm('Liberar esta caixa? Ela ficará disponível para uso.')) return;
  try {
    const res = await fetch(`${API}/checkout/${id}/liberar`, { credentials:'include', method:'PUT' });
    const data = await res.json();
    if (data.erro) { toast(data.erro,'erro'); return; }
    toast('🔓 Caixa liberada!','sucesso');
    carregarCheckoutLista();
  } catch(e) { toast('Erro!','erro'); }
}
function exportarExcel(tipo) {
  let rows = [];
  let nomeArq = 'exportacao';
  try {
    if (tipo === 'pedidos') {
      rows = [['Nº Pedido','Usuário','Status','Itens','Data','Hora']];
      document.querySelectorAll('#tbody-ped tr').forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length > 1) rows.push([tds[0].textContent.trim(), tds[1].textContent.trim(), tds[2].textContent.trim(), tds[3].textContent.trim(), tds[4].textContent.trim(), tds[5].textContent.trim()]);
      });
      nomeArq = `pedidos_${hoje}`;
    } else if (tipo === 'estatisticas') {
      rows = [['Separador','Hoje','Mês','Ano','Status']];
      document.querySelectorAll('#tbody-est-sep tr').forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length > 1) rows.push([tds[0].textContent.trim(), tds[1].textContent.trim(), tds[2].textContent.trim(), tds[3].textContent.trim(), tds[4].textContent.trim()]);
      });
      nomeArq = `estatisticas_separadores_${hoje}`;
    } else if (tipo === 'stats-repositor') {
      rows = [['Repositor','Hoje','Repostos','Não Encontrados','Total']];
      document.querySelectorAll('#tbody-srep-prod tr').forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length > 1) rows.push([tds[0].textContent.trim(), tds[1].textContent.trim(), tds[2].textContent.trim(), tds[3].textContent.trim(), tds[4].textContent.trim()]);
      });
      nomeArq = `estatisticas_repositor_${hoje}`;
    } else if (tipo === 'checkout-lista') {
      rows = [['Caixa','Nº Pedido','Separador','Status','Hora']];
      document.querySelectorAll('#tbody-checkout tr').forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length > 1) rows.push([tds[0].textContent.trim(), tds[1].textContent.trim(), tds[2].textContent.trim(), tds[3].textContent.trim(), tds[4].textContent.trim()]);
      });
      nomeArq = `checkouts_${hoje}`;
    } else if (tipo === 'stats-checkout') {
      rows = [['Caixa','Nº Pedido','Separador','Status','Data','Hora']];
      document.querySelectorAll('#tbody-sck-lista tr').forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length > 1) rows.push([tds[0].textContent.trim(), tds[1].textContent.trim(), tds[2].textContent.trim(), tds[3].textContent.trim(), tds[4].textContent.trim(), tds[5].textContent.trim()]);
      });
      nomeArq = `stats_checkout_${hoje}`;
    }
    if (rows.length <= 1) { toast('Nenhum dado para exportar!','aviso'); return; }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dados');
    XLSX.writeFile(wb, `${nomeArq}.xlsx`);
    toast('✅ Excel exportado!','sucesso');
  } catch(e) { toast('Erro ao exportar!','erro'); }
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




async function confirmarPedido() {
  const num = document.getElementById('input-pedido').value.trim();
  if (!num) { toast('Digite o número!','aviso'); return; }
  await _confirmarPedidoCore(num, 'input-pedido', 'status-atual', 'cl-wrap', carregarChecklist, carregarFila);
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




async function concluirPedido() {
  await _concluirCore('cl', carregarChecklist, carregarFila, carregarContadoresSep, 'input-pedido', 'status-atual');
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




async function carregarFila() {
  try {
    const res   = await fetch(`${API}/pedidos`, { credentials:'include' });
    const todos = await res.json();
    const ativos = todos.filter(p=>p.status!=='concluido');
    const meus   = separadorAtual ? ativos.filter(p=>p.separador_id===separadorAtual.id) : [];
    const bdFila = document.getElementById('badge-fila-d');
    const bdMeus = document.getElementById('badge-meus-d');
    if (bdFila) bdFila.textContent = `${ativos.length} total`;
    if (bdMeus) bdMeus.textContent = meus.length > 0 ? `${meus.length} meus` : '';
    const html = !ativos.length
      ? '<tr><td colspan="5" style="color:var(--text3);text-align:center;padding:18px">Nenhum pedido na fila</td></tr>'
      : ativos.map(p => {
          const eMeu = separadorAtual && p.separador_id===separadorAtual.id;
          const ocup = separadorAtual && p.separador_id && p.separador_id!==separadorAtual.id;
          const sit  = eMeu?`<span class="pill separando">Meu</span>`:ocup?`<span class="pill falta">Ocupado</span>`:`<span class="pill pendente">Livre</span>`;
          const clk  = !ocup ? `onclick="selecionarPedidoFila('${p.numero_pedido}')" style="cursor:pointer"` : '';
          // Peso visual
          const peso = p.peso || 0;
          // Thresholds ajustados para pontuação com dificuldade de corredor
          const pesoCor = peso>=50?'var(--red)':peso>=20?'var(--amber)':'var(--green)';
          const pesoLabel = peso>=50?'🔴 Pesado':peso>=20?'🟡 Médio':'🟢 Leve';
          return `<tr class="${eMeu?'meu':''}" ${clk}>
            <td style="font-weight:${eMeu?700:400};color:${eMeu?'var(--accent)':'var(--text)'}">${p.numero_pedido}</td>
            <td>${p.itens||'—'}</td>
            <td style="font-size:11px">
              <span style="color:${pesoCor};font-weight:700">${pesoLabel}</span>
              <span style="color:var(--text3);margin-left:4px">${peso}pts</span>
            </td>
            <td><span class="pill ${(p.status||'').replace(' ','-')}">${p.status}</span></td>
            <td>${sit}</td>
          </tr>`;
        }).join('');
    const el = document.getElementById('tbody-fila-d');
    if (el) el.innerHTML = html;
  } catch(e) {}
}




function selecionarPedidoFila(num) {
  document.getElementById('input-pedido').value = num;
  confirmarPedido();
}




/* ══════════════════════════════════════════
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
    const res   = await fetch(`${API}/pedidos`, { credentials:'include' });
    const todos = await res.json();
    const ativos = todos.filter(p=>p.status!=='concluido');
    const meus   = separadorAtual ? ativos.filter(p=>p.separador_id===separadorAtual.id) : [];
    const bdFila = document.getElementById('badge-fila-m');
    const bdMeus = document.getElementById('badge-meus-m');
    if (bdFila) bdFila.textContent = `${ativos.length} total`;
    if (bdMeus) bdMeus.textContent = meus.length > 0 ? `${meus.length} meus` : '';
    const badge = document.getElementById('stab-fila-badge');
    if (badge) { badge.textContent = ativos.length; badge.style.display = ativos.length > 0 ? 'inline' : 'none'; }
    const lista = document.getElementById('lista-fila-mobile');
    if (!lista) return;
    if (!ativos.length) { lista.innerHTML = '<div style="color:var(--text3);text-align:center;padding:30px;font-size:13px">Nenhum pedido na fila 🎉</div>'; return; }
    lista.innerHTML = ativos.map(p => {
      const eMeu = separadorAtual && p.separador_id === separadorAtual.id;
      const ocup = separadorAtual && p.separador_id && p.separador_id !== separadorAtual.id;
      return `<div class="fila-card ${eMeu?'meu':''} ${ocup?'ocupado':''}" ${!ocup?`onclick="selecionarPedidoFilaMobile('${p.numero_pedido}')"`:''}">
        <div style="font-size:20px">${eMeu?'📦':ocup?'🔒':'📋'}</div>
        <div style="flex:1">
          <div class="fila-num">${p.numero_pedido}</div>
          <div class="fila-meta"><b>${p.itens||0} itens</b>${p.separador_nome?` • ${p.separador_nome}`:''}</div>
        </div>
        <div>${eMeu?`<span class="pill separando">Meu</span>`:ocup?`<span class="pill falta">Ocupado</span>`:`<span class="pill pendente">Livre</span>`}</div>
      </div>`;
    }).join('');
  } catch(e) {}
}




function selecionarPedidoFilaMobile(num) {
  mudarTabSep('separar');
  document.getElementById('m-input-pedido').value = num;
  confirmarPedidoMobile();
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




/* ══════════════════════════════════════════
   RENDER CHECKLIST (compartilhado)
══════════════════════════════════════════ */
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
    if (status==='falta')     toast('❌ Falta total — repositor avisado!','aviso');
    if (status==='parcial')   toast('🟡 Parcial — repositor avisado!','aviso');
    // sem toast para encontrado — a linha fica verde
    renderChecklist(renderPrefix);
  } catch(e) { toast('Erro ao verificar item!','erro'); }
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
// Compatibilidade
async function marcarReposto(id,q){ await marcarAviso(id,q,'encontrado'); }
async function marcarNaoEncontrado(id){ await marcarAviso(id,0,'nao_encontrado'); }
async function marcarProtocolo(id){ await marcarAviso(id,0,'protocolo'); }




/* ══════════════════════════════════════════
   EVENTOS
══════════════════════════════════════════ */
document.getElementById('input-pedido')?.addEventListener('keypress', e => { if(e.key==='Enter') confirmarPedido(); });
document.getElementById('m-input-pedido')?.addEventListener('keypress', e => { if(e.key==='Enter') confirmarPedidoMobile(); });
document.getElementById('m-ck-input-caixa')?.addEventListener('keypress', e => { if(e.key==='Enter') buscarCaixaMobile(); });




/* Adapta ao redimensionar */
window.addEventListener('resize', () => {
  if (!usuarioAtual) return;
  const perfil = usuarioAtual.perfil;
  const mob = isMobile();




  if (perfil === 'separador') {
    document.body.classList.toggle('sep-mobile', mob);
    document.getElementById('sep-mobile-root').style.display = mob ? 'flex' : 'none';
    document.getElementById('sep-tabbar').style.display      = mob ? 'flex' : 'none';
    document.getElementById('conteudo').style.display = mob ? 'none' : 'block';
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.style.display = mob ? 'none' : '';
  } else if (perfil === 'repositor') {
    const repRoot = document.getElementById('rep-mobile-root');
    const repBar  = document.getElementById('rep-tabbar');
    document.body.classList.toggle('rep-mobile', mob);
    if (repRoot) repRoot.style.display = mob ? 'flex' : 'none';
    if (repBar)  repBar.style.display  = mob ? 'flex' : 'none';
    document.getElementById('conteudo').style.display = mob ? 'none' : 'block';
  } else if (perfil === 'checkout') {
    const ckRoot = document.getElementById('ck-mobile-root');
    const ckBar  = document.getElementById('ck-tabbar');
    document.body.classList.toggle('ck-mobile', mob);
    if (ckRoot) ckRoot.style.display = mob ? 'flex' : 'none';
    if (ckBar)  ckBar.style.display  = mob ? 'flex' : 'none';
    document.getElementById('conteudo').style.display = mob ? 'none' : 'block';
  }
});




/* ══════════════════════════════════════════
   ESTATÍSTICAS
══════════════════════════════════════════ */
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