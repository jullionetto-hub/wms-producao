/* ══════════════════════════════════════════
   PEDIDOS
══════════════════════════════════════════ */

function filtrarPedidosHoje() {
  const h = hojeLocal();
  document.getElementById('filtro-ped-ini').value = h;
  document.getElementById('filtro-ped-fim').value = h;
  carregarPedidos();
}
function filtrarPedidosSemana() {
  const fim = hojeLocal();
  const ini = new Date(); ini.setDate(ini.getDate()-6);
  const p = n=>String(n).padStart(2,'0');
  const iniStr = `${ini.getFullYear()}-${p(ini.getMonth()+1)}-${p(ini.getDate())}`;
  document.getElementById('filtro-ped-ini').value = iniStr;
  document.getElementById('filtro-ped-fim').value = fim;
  carregarPedidos();
}
function filtrarPedidosTodos() {
  document.getElementById('filtro-ped-ini').value = '';
  document.getElementById('filtro-ped-fim').value = '';
  carregarPedidos();
}

let _pedidosLista  = [];
let _filtroTransp  = '';
let _filtroTurno   = '';

function _turnoHora(p) {
  // Usa turno_distribuicao — definido pelo supervisor na hora de distribuir
  // Retorna null se o pedido ainda não foi distribuído com turno
  return p.turno_distribuicao || null;
}

function filtrarPedidosTurno(turno) {
  _filtroTurno = turno;
  const sel = document.getElementById('sel-fturno');
  if (sel) sel.value = turno;
  _renderTabelaPedidos();
}

async function carregarPedidos() {
  try {
    const ini    = document.getElementById('filtro-ped-ini').value;
    const fim    = document.getElementById('filtro-ped-fim').value;
    const usrId  = document.getElementById('filtro-ped-sep').value;
    const status = document.getElementById('filtro-ped-status').value;
    const numPed = document.getElementById('filtro-ped-num').value.trim();
    let url = `${API}/pedidos?`;
    if (status) url += `status=${encodeURIComponent(status)}&`;
    if (numPed) url += `numero_pedido=${encodeURIComponent(numPed)}&`;
    const res = await fetch(url, { credentials:'include' });
    let ps = await res.json();
    if (ini) ps = ps.filter(p => p.data_pedido >= ini);
    if (fim) ps = ps.filter(p => p.data_pedido <= fim);
    if (usrId) ps = ps.filter(p => p.separador_nome === usrId);
    _pedidosLista = ps;
    _filtroTurno  = '';
    _filtroTransp = '';
    const selT = document.getElementById('sel-fturno'); if (selT) selT.value = '';
    document.querySelectorAll('.btn-transp').forEach(b => b.classList.remove('ativo'));
    _atualizarBadgesFiltroTransp(ps);
    _renderTabelaPedidos();
  } catch(e) { console.warn(e); }
}

function filtrarPedidosTransp(tipo) {
  // Toggle: clicar no botão ativo desativa o filtro
  _filtroTransp = (_filtroTransp === tipo) ? '' : tipo;
  document.querySelectorAll('.btn-transp').forEach(b => b.classList.remove('ativo'));
  const mapa = { 'DRIVE':'ftransp-drive', 'PRIME':'ftransp-prime',
                 'SEDEX':'ftransp-sedex', 'PAC':'ftransp-pac', 'MOTOBOY':'ftransp-motoboy' };
  if (_filtroTransp) {
    const btnEl = document.getElementById(mapa[_filtroTransp]);
    if (btnEl) btnEl.classList.add('ativo');
  }
  _renderTabelaPedidos();
}

function _atualizarBadgesFiltroTransp(lista) {
  const c = (fn) => lista.filter(fn).length;
  const t = (k)  => String(k||'').toUpperCase();
  // Atualiza opções do select de turno com contagem individual
  const sel = document.getElementById('sel-fturno');
  if (sel) {
    const nM = c(p => p.turno_distribuicao === 'Manha');
    const nT = c(p => p.turno_distribuicao === 'Tarde');
    const nN = c(p => p.turno_distribuicao === 'Noite');
    sel.options[0].text = `Todos (${lista.length})`;
    sel.options[1].text = `☀️ Manhã (${nM})`;
    sel.options[2].text = `🌤️ Tarde (${nT})`;
    sel.options[3].text = `🌙 Noite (${nN})`;
  }
  // Botões de transportadora
  const badges = {
    'ftransp-drive':   `🚗 Drive Thru (${c(p=>t(p.transportadora).includes('DRIVE'))})`,
    'ftransp-prime':   `⭐ Prime (${c(p=>p.tem_prime)})`,
    'ftransp-sedex':   `SEDEX (${c(p=>t(p.transportadora).includes('SEDEX'))})`,
    'ftransp-pac':     `PAC (${c(p=>t(p.transportadora).includes('PAC'))})`,
    'ftransp-motoboy': `MOTOBOY (${c(p=>t(p.transportadora).includes('MOTOBOY'))})`,
  };
  Object.entries(badges).forEach(([id, txt]) => {
    const el = document.getElementById(id); if (el) el.textContent = txt;
  });
}

function _renderTabelaPedidos() {
  const tbody = document.getElementById('tbody-ped');
  if (!tbody) return;
  let lista = _pedidosLista;
  // Filtro de turno (pelo turno_distribuicao — definido na distribuição)
  if (_filtroTurno) lista = lista.filter(p => p.turno_distribuicao === _filtroTurno);
  // Filtro de transportadora / tipo
  if (_filtroTransp === 'PRIME') {
    lista = lista.filter(p => p.tem_prime);
  } else if (_filtroTransp === 'DRIVE') {
    lista = lista.filter(p => String(p.transportadora||'').toUpperCase().includes('DRIVE'));
  } else if (_filtroTransp) {
    lista = lista.filter(p => String(p.transportadora||'').toUpperCase().includes(_filtroTransp));
  }
  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="color:var(--text3);text-align:center;padding:28px">Nenhum pedido</td></tr>';
    return;
  }
  const isDrive = p => String(p.transportadora||'').toUpperCase().includes('DRIVE');
  tbody.innerHTML = lista.map(p => {
    const corNum   = isDrive(p) ? 'var(--red)' : 'var(--accent)';
    const corTransp = isDrive(p) ? 'var(--red)' : 'var(--indigo)';
    const primeBadge = p.tem_prime
      ? '<span style="margin-left:5px;font-size:9px;background:#D97706;color:#fff;border-radius:4px;padding:2px 5px;font-weight:700;vertical-align:middle">⭐ PRIME</span>'
      : '';
    return `<tr>
      <td style="font-weight:700;font-family:'Space Mono',monospace;font-size:12px"><span style="color:${corNum}">${p.numero_pedido}</span></td>
      <td style="font-size:11px;color:var(--text2);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${p.cliente||''}">${p.cliente||'—'}</td>
      <td style="font-size:11px;font-weight:700;color:${corTransp}">${p.transportadora||'—'}${primeBadge}</td>
      <td style="font-size:11px;color:var(--amber);font-weight:600;white-space:nowrap">${p.aguardando_desde||'—'}</td>
      <td style="font-size:12px;color:var(--text2)">${p.separador_nome||'—'}</td>
      <td><span class="pill ${(p.status||'').replace(' ','-')}">${p.status}</span></td>
      <td style="font-weight:600;text-align:center;color:var(--text2)">${p.itens||'—'}</td>
      <td style="font-weight:700;text-align:center;color:${(p.total_itens||p.itens||0)>100?'var(--red)':(p.total_itens||p.itens||0)>30?'var(--amber)':'var(--text)'}">${p.total_itens||p.itens||'—'}</td>
    </tr>`;
  }).join('');
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
    const el = document.getElementById('lista-usuarios');
    if (!el) return;
    if (!users.length) {
      el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:24px;font-size:13px">Nenhum usuário cadastrado</div>';
      return;
    }
    const countEl = document.getElementById('usr-count');
    if (countEl) countEl.textContent = `• ${users.length} usuário(s)`;
    el.innerHTML = users.map(u => {
      const perfisExtra = (u.perfis_acesso || '').split(',').filter(Boolean).filter(p => p !== u.perfil);
      const todosAcessos = [u.perfil, ...perfisExtra];
      const iniciais = u.nome.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase();
      const perfIcons = {supervisor:'👔',separador:'📦',repositor:'🔧',checkout:'🏷️',embalador:'📫'};
      return `<div class="usr-card ${u.status}">
        <div class="usr-avatar">${iniciais}</div>
        <div class="usr-info">
          <div class="usr-name">${u.nome}</div>
          <div class="usr-login">@${u.login}</div>
          <div class="usr-pills">
            ${todosAcessos.map(p=>`<span class="usr-pill ${p}">${perfIcons[p]||''} ${p}</span>`).join('')}
            <span class="usr-pill turno">⏰ ${u.turno||'—'}</span>
            <span class="pill ${u.status}" style="font-size:9px;padding:2px 7px">${u.status}</span>
          </div>
        </div>
        <div class="usr-actions">
          <button class="usr-btn ${u.status==='ativo'?'toggle-on':'toggle-off'}" title="${u.status==='ativo'?'Desativar':'Ativar'}"
            onclick="alterarStatusUsuario(${u.id},'${u.status==='ativo'?'inativo':'ativo'}','${u.nome}','${u.login}','${u.perfil}','${u.turno||''}')">
            ${u.status==='ativo'?'⏸':'▶'}
          </button>
          <button class="usr-btn" style="background:#3b82f6;color:#fff;border:none;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:12px;margin-right:4px" onclick="abrirEditarUsuario(${u.id})">Editar</button>
          <button class="usr-btn del" title="Excluir" onclick="excluirUsuario(${u.id},'${u.nome}')">🗑</button>
        </div>
      </div>`;
    }).join('');
  } catch(e) { console.warn(e); }
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
    const res = await fetch(`${API}/usuarios`, { credentials:'include', method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ nome, login, senha, perfil, subtipo_repositor, turno, perfis_acesso }) });
    const data = await res.json();
    if (!res.ok) { toast(data.erro || 'Erro ao cadastrar!','erro'); return; }
    toast('Usuário cadastrado!','sucesso');
    document.getElementById('usr-nome').value = '';
    document.getElementById('usr-login').value = '';
    document.getElementById('usr-senha').value = '';
    document.querySelectorAll('.usr-perm').forEach(el => {
      el.checked = false;
      const opt = el.closest('.perm-sel-opt');
      if (opt) opt.classList.remove('selecionado');
    });
    var addWrap = document.querySelector('#cad-usuarios .perm-sel-wrap');
    if (addWrap && typeof _atualizarPermSelValor === 'function') _atualizarPermSelValor(addWrap);
    carregarUsuarios();
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




function processarArquivoFile(file) {
  mostrarStatus('⏳ Lendo arquivo...','carregando');
  document.getElementById('preview-importacao').style.display = 'none';
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const wb   = XLSX.read(new Uint8Array(e.target.result), { type:'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval:'', header:1 });
      if (!rows.length) throw new Error('Arquivo vazio');
      // Mapeamento flexível: Pedido, Codigo, Descricao, Qtde, Endereço
      const cab = rows[0].map(c => String(c).toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,''));
      const temCab = cab.some(c => c.includes('pedido') || c.includes('codigo') || c.includes('descricao'));
      const ini  = temCab ? 1 : 0;
      const iNum  = temCab ? Math.max(cab.findIndex(c=>c.includes('pedido')||c.includes('numero')), 0) : 0;
      const iCod  = temCab ? (cab.findIndex(c=>c.includes('cod')) >= 0 ? cab.findIndex(c=>c.includes('cod')) : 1) : 1;
      const iDesc = temCab ? (cab.findIndex(c=>c.includes('desc')) >= 0 ? cab.findIndex(c=>c.includes('desc')) : 2) : 2;
      const iQtd  = temCab ? (cab.findIndex(c=>c.includes('qtd')||c.includes('quant')) >= 0 ? cab.findIndex(c=>c.includes('qtd')||c.includes('quant')) : 4) : 4;
      const iEnd  = temCab ? (cab.findIndex(c=>c.includes('end')||c.includes('rua')||c.includes('ender')) >= 0 ? cab.findIndex(c=>c.includes('end')||c.includes('rua')||c.includes('ender')) : 3) : 3;
      const dados = [];
      for (let i = ini; i < rows.length; i++) {
        const r   = rows[i];
        const num = String(r[iNum] || '').trim();
        // Ignora linhas vazias, cabeçalhos repetidos e linhas sem dígitos no número do pedido
        if (!num || !/\d/.test(num)) continue;
        dados.push({ numero_pedido:num, codigo:String(r[iCod]||'').trim(), descricao:String(r[iDesc]||'').trim(), quantidade:parseInt(r[iQtd])||1, endereco:String(r[iEnd]||'').trim() });
      }
      if (!dados.length) { mostrarStatus('❌ Nenhuma linha encontrada!','erro'); return; }
      pedidosImportar = dados;
      const totalP   = new Set(dados.map(d=>d.numero_pedido)).size;
      const totalQtd = dados.reduce((s,d)=>s+(d.quantidade||1),0);
      mostrarStatus(`✅ ${dados.length} SKU(s) em ${totalP} pedido(s) — clique Importar`,'sucesso');
      document.getElementById('tbody-prev').innerHTML =
        dados.slice(0,10).map(d=>`<tr><td>${d.numero_pedido}</td><td style="color:var(--accent)">${d.codigo}</td><td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.descricao}</td><td style="color:var(--amber)">${d.endereco}</td><td style="color:var(--green)">${d.quantidade}</td></tr>`).join('') +
        (dados.length>10?`<tr><td colspan="5" style="color:var(--text3);text-align:center;padding:8px">... +${dados.length-10} linhas</td></tr>`:'');
      document.getElementById('txt-total-import').textContent = `${totalP} pedido(s) • ${dados.length} SKUs • ${totalQtd} itens`;
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




      const res  = await fetch(`${API}/pedidos/importar`, {
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ linhas: linhasLote })
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
  const cores = { carregando:'background:#EFF6FF;border:1px solid #BFDBFE;color:#1D4ED8', sucesso:'background:#F0FDF4;border:1px solid #BBF7D0;color:#15803D', erro:'background:#FEF2F2;border:1px solid #FECACA;color:#DC2626', aviso:'background:#FFFBEB;border:1px solid #FDE68A;color:#D97706' };
  const el = document.getElementById('status-leitura');
  el.setAttribute('style', `display:block;margin-top:10px;padding:10px;border-radius:8px;font-size:12px;font-weight:600;text-align:center;${cores[tipo]}`);
  el.textContent = msg;
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
  } catch(e) { console.warn(e); }
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
    // Define largura das colunas automaticamente baseado no conteúdo
    const colWidths = rows[0].map((_, ci) => ({
      wch: Math.max(...rows.map(r => String(r[ci]||'').length), String(rows[0][ci]||'').length) + 2
    }));
    ws['!cols'] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dados');
    XLSX.writeFile(wb, `${nomeArq}.xlsx`);
    toast('Excel exportado!','sucesso');
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
  if (!caixaJaVinculada) return; // não mostra itens sem caixa vinculada
  try {
    const res = await fetch(`${API}/pedidos/${pedidoAtualId}/itens`, { credentials:'include' });
    itensAtuais = await res.json();
    const wrap = document.getElementById('cl-wrap');
    if (!itensAtuais.length) { wrap.style.display = 'none'; return; }
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
    renderChecklist('cl');
  } catch(e) { toast('Erro ao carregar itens!','erro'); }
}




async function concluirPedido() {
  await _concluirCore('cl', carregarChecklist, carregarFila, carregarContadoresSep, 'input-pedido', 'status-atual');
}




async function carregarContadoresSep() {
  try {
    const ini = document.getElementById('sep-ini')?.value || '';
    const fim = document.getElementById('sep-fim')?.value || '';
    const res = await fetch(`${API}/pedidos`, { credentials:'include' });
    let ps = await res.json();
    if (ini) ps = ps.filter(p => (p.data_pedido||'') >= ini);
    if (fim) ps = ps.filter(p => (p.data_pedido||'') <= fim);
    const total     = ps.length;
    const separados = ps.filter(p => p.status === 'concluido').length;
    const pendentes = total - separados;
    const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setEl('sep-cnt-total',     total);
    setEl('sep-cnt-pendentes', pendentes);
    setEl('sep-cnt-separados', separados);
  } catch(e) { console.warn(e); }
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
    // Só mostra pedidos atribuídos a mim, ordenados por itens ASC (menor primeiro)
    const meusFila = separadorAtual ? ativos.filter(p=>p.separador_id===separadorAtual.id) : ativos;
    const ordenadosFila = [...meusFila].sort((a,b)=>(a.itens||0)-(b.itens||0));
    if (bdFila) bdFila.textContent = `${meusFila.length} meus`;
    const html = !ordenadosFila.length
      ? '<tr><td colspan="4" style="color:var(--text3);text-align:center;padding:18px">Nenhum pedido na fila</td></tr>'
      : ordenadosFila.map(p => {
          return `<tr class="meu" onclick="selecionarPedidoFila('${p.numero_pedido}')" style="cursor:pointer">
            <td style="font-weight:700;color:var(--accent)">${p.numero_pedido}</td>
            <td style="color:var(--green);font-weight:600">${p.itens||'—'}</td>
            <td><span class="pill ${(p.status||'').replace(' ','-')}">${p.status}</span></td>
            <td><span class="pill separando">Meu</span></td>
          </tr>`;
        }).join('');
    const el = document.getElementById('tbody-fila-d');
    if (el) el.innerHTML = html;
  } catch(e) { console.warn(e); }
}




function selecionarPedidoFila(num) {
  // Reseta estado do pedido anterior antes de iniciar novo
  caixaJaVinculada = false;
  const caixaInp = document.getElementById('cl-input-caixa');
  const caixaSt  = document.getElementById('cl-caixa-status');
  if (caixaInp) caixaInp.value = '';
  if (caixaSt)  { caixaSt.style.display = 'none'; caixaSt.innerHTML = ''; }
  document.getElementById('input-pedido').value = num;
  confirmarPedido();
}




/* ══════════════════════════════════════════
   PEDIDOS PENDENTES DE REPOSIÇÃO (separador)
══════════════════════════════════════════ */
async function carregarPedidosPendentesReposicao() {
  if (!separadorAtual) return;
  const el = document.getElementById('sep-pedidos-reposicao');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:16px;font-size:13px">Carregando...</div>';
  try {
    // Busca todos os avisos pendentes do repositor para este separador
    const res = await fetch(`${API}/repositor/avisos?status=pendente`, { credentials:'include' });
    const avisos = await res.json();

    // Filtra apenas os do separador atual
    const meus = avisos.filter(a => String(a.separador_id) === String(separadorAtual.id));

    if (!meus.length) {
      el.innerHTML = '<div style="background:#F0FDF4;border:1px solid #C6F6D5;border-radius:10px;padding:14px 16px;text-align:center;">' +
        '<div style="font-size:13px;font-weight:500;color:#15803D;">Nenhum item aguardando reposição</div>' +
        '<div style="font-size:11px;color:#16A34A;margin-top:4px;">Todos os seus pedidos estão completos</div>' +
        '</div>';
      return;
    }

    // Agrupa por pedido
    const porPedido = {};
    meus.forEach(a => {
      if (!porPedido[a.numero_pedido]) porPedido[a.numero_pedido] = [];
      porPedido[a.numero_pedido].push(a);
    });

    const numPedidos = Object.keys(porPedido).length;
    const totalItens = meus.length;

    // Atualiza badge da aba
    const badge = document.getElementById('stab-avisos-sep-badge');
    if (badge) { badge.textContent = totalItens; badge.style.display = totalItens > 0 ? 'inline' : 'none'; }

    let html = `<div style="display:flex;gap:8px;margin-bottom:10px;">
      <div style="flex:1;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:20px;font-weight:500;color:#B91C1C;">${numPedidos}</div>
        <div style="font-size:10px;color:#DC2626;letter-spacing:.5px;">PEDIDOS</div>
      </div>
      <div style="flex:1;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:20px;font-weight:500;color:#B91C1C;">${totalItens}</div>
        <div style="font-size:10px;color:#DC2626;letter-spacing:.5px;">ITENS</div>
      </div>
    </div>`;

    Object.entries(porPedido).forEach(([numPed, itensAviso]) => {
      const tempoMaisAntigo = itensAviso.reduce((m, a) => a.hora_aviso < m ? a.hora_aviso : m, itensAviso[0].hora_aviso);
      html += `<div style="background:var(--surface);border:1px solid #FECACA;border-left:3px solid #DC2626;border-radius:0 10px 10px 0;margin-bottom:8px;overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#FFF8F8;">
          <div>
            <span style="font-family:'Space Mono',monospace;font-size:14px;font-weight:500;color:#0F172A;">#${numPed}</span>
            <span style="font-size:10px;color:#94A3B8;margin-left:8px;">desde ${tempoMaisAntigo||'—'}</span>
          </div>
          <span style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px;background:#FEF2F2;color:#B91C1C;border:1px solid #FECACA;">${itensAviso.length} item${itensAviso.length>1?'s':''}</span>
        </div>`;

      itensAviso.forEach(a => {
        html += `<div style="padding:10px 14px;border-top:0.5px solid #FECACA;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
                <span style="font-family:'Space Mono',monospace;font-size:12px;font-weight:500;color:#0F172A;">${a.endereco||'—'}</span>
                <span style="font-size:10px;font-weight:500;padding:1px 6px;border-radius:4px;background:#FEF2F2;color:#B91C1C;">aguardando</span>
              </div>
              <div style="font-size:10px;color:#64748B;font-family:monospace;">${a.codigo||'—'}</div>
              <div style="font-size:12px;color:#0F172A;line-height:1.3;margin-top:1px;">${a.descricao||'—'}</div>
            </div>
            <div style="font-size:20px;font-weight:500;color:#0F172A;flex-shrink:0;">×${a.quantidade||1}</div>
          </div>
        </div>`;
      });

      // Botão para ir ao pedido
      html += `<div style="padding:10px 14px;border-top:0.5px solid #FECACA;background:#FFF8F8;">
        <button onclick="irParaPedidoComFalta('${numPed}')" style="width:100%;padding:9px;border-radius:8px;border:1px solid #FECACA;background:#FEF2F2;color:#B91C1C;font-size:12px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;">
          Abrir pedido #${numPed}
        </button>
      </div></div>`;
    });

    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = '<div style="color:var(--red);text-align:center;padding:16px;font-size:13px">Erro ao carregar</div>';
  }
}

function irParaPedidoComFalta(numPed) {
  mudarTabSep('separar');
  document.getElementById('m-input-pedido').value = numPed;
  confirmarPedidoMobile();
}

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
   MODAL IMPORTAR (na tela de Pedidos)
══════════════════════════════════════════ */
let pedidosImportarModal = [];

function abrirModalImportar() {
  document.getElementById('modal-importar').style.display = 'flex';
  renderHistoricoModal();
}
function fecharModalImportar() {
  document.getElementById('modal-importar').style.display = 'none';
  pedidosImportarModal = [];
  document.getElementById('modal-preview-importacao').style.display = 'none';
  document.getElementById('modal-input-arquivo').value = '';
  mostrarStatusModal('', '');
}
function handleDropModal(e) {
  e.preventDefault();
  document.getElementById('modal-upload-area').classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (f) processarArquivoModalFile(f);
}
function processarArquivoModal(e) {
  const f = e.target.files[0];
  if (f) processarArquivoModalFile(f);
}
function processarArquivoModalFile(file) {
  mostrarStatusModal('⏳ Lendo arquivo...','carregando');
  document.getElementById('modal-preview-importacao').style.display = 'none';
  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const wb = XLSX.read(new Uint8Array(evt.target.result), { type:'array' });
      let itensSheet = wb.SheetNames.includes('Itens') ? wb.Sheets['Itens'] : wb.Sheets[wb.SheetNames[0]];
      let transpSheet = wb.SheetNames.includes('Transportadora') ? wb.Sheets['Transportadora'] : null;
      const rows = XLSX.utils.sheet_to_json(itensSheet, { defval:'', header:1 });
      if (!rows.length) throw new Error('Arquivo vazio');
      const cab = rows[0].map(c => String(c).toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,''));
      const temCab = cab.some(c => c.includes('pedido') || c.includes('codigo') || c.includes('descricao'));
      const ini  = temCab ? 1 : 0;
      const iCod  = Math.max(cab.findIndex(c=>c.includes('cod')), 0);
      const iNum  = cab.findIndex(c=>c.includes('pedido')||c.includes('numero')) >= 0 ? cab.findIndex(c=>c.includes('pedido')||c.includes('numero')) : 1;
      const iDesc = cab.findIndex(c=>c.includes('desc')) >= 0 ? cab.findIndex(c=>c.includes('desc')) : 2;
      const iQtd  = cab.findIndex(c=>c.includes('qtd')||c.includes('quant')) >= 0 ? cab.findIndex(c=>c.includes('qtd')||c.includes('quant')) : 3;
      const iEnd  = cab.findIndex(c=>c.includes('end')||c.includes('rua')||c.includes('ender')||c.includes('estoque')) >= 0 ? cab.findIndex(c=>c.includes('end')||c.includes('rua')||c.includes('ender')||c.includes('estoque')) : 4;
      const dados = [];
      for (let i = ini; i < rows.length; i++) {
        const r = rows[i];
        const num = String(r[iNum] || '').trim();
        // Ignora linhas vazias, cabeçalhos repetidos e linhas sem dígitos no número do pedido
        if (!num || !/\d/.test(num)) continue;
        dados.push({ numero_pedido:num, codigo:String(r[iCod]||'').trim(), descricao:String(r[iDesc]||'').trim(), quantidade:parseInt(r[iQtd])||1, endereco:String(r[iEnd]||'').trim() });
      }
      let transpData = {};
      if (transpSheet) {
        const tRows = XLSX.utils.sheet_to_json(transpSheet, { defval:'', header:1 });
        const tCab = (tRows[0]||[]).map(c => String(c).toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g,''));
        const iPed  = tCab.findIndex(c=>c.includes('pedido')) >= 0 ? tCab.findIndex(c=>c.includes('pedido')) : 0;
        const iCli  = tCab.findIndex(c=>c.includes('razao')||c.includes('cliente')||c.includes('nome')) >= 0 ? tCab.findIndex(c=>c.includes('razao')||c.includes('cliente')||c.includes('nome')) : 2;
        const iServ = tCab.findIndex(c=>c.includes('servico')||c.includes('entrega')||c.includes('transport')) >= 0 ? tCab.findIndex(c=>c.includes('servico')||c.includes('entrega')||c.includes('transport')) : 3;
        for (let i = 1; i < tRows.length; i++) {
          const r = tRows[i];
          const num = String(r[iPed]||'').trim();
          if (!num) continue;
          // Aba Transportadora: Nº pedido | Aguardando desde | Razão social | Qtde | Tipo entrega
          const iAg = tCab.findIndex(c=>c.includes('aguardando')||c.includes('desde')) >= 0 
            ? tCab.findIndex(c=>c.includes('aguardando')||c.includes('desde')) : 1;
          let agVal = '';
          if (r[iAg] !== undefined && r[iAg] !== null && r[iAg] !== '') {
            const raw = r[iAg];
            const pad = n => String(n).padStart(2,'0');
            if (typeof raw === 'number') {
              // Serial Excel: parte inteira = dias desde 1899-12-30
              // parte decimal = fração do dia (0.5 = 12:00)
              // Converte para ms: (serial - 25569) * 86400000 → UTC
              // Ajusta para horário de Brasília (UTC-3)
              try {
                const d = XLSX.SSF.parse_date_code(raw, {date1904: false});
                if (d && d.y > 2000) {
                  agVal = `${pad(d.d)}/${pad(d.m)}/${d.y} ${pad(d.H)}:${pad(d.M)}`;
                } else {
                  // Fallback: conversão manual
                  const ms = Math.round((raw - 25569) * 86400 * 1000);
                  const dt = new Date(ms);
                  // Ajusta UTC-3 (Brasília)
                  const brMs = ms - 3 * 3600 * 1000;
                  const brDt = new Date(brMs);
                  agVal = `${pad(brDt.getUTCDate())}/${pad(brDt.getUTCMonth()+1)}/${brDt.getUTCFullYear()} ${pad(brDt.getUTCHours())}:${pad(brDt.getUTCMinutes())}`;
                }
              } catch(ex) { agVal = String(raw); }
            } else if (raw instanceof Date) {
              // Date JS — usar horário local do browser
              agVal = `${pad(raw.getDate())}/${pad(raw.getMonth()+1)}/${raw.getFullYear()} ${pad(raw.getHours())}:${pad(raw.getMinutes())}`;
            } else {
              agVal = String(raw).trim();
            }
          }
          transpData[num] = { cliente:String(r[iCli]||'').trim(), transportadora:String(r[iServ]||'').trim(), aguardando_desde:agVal };
        }
      }
      // Filtra: só importa pedidos que existem na aba Transportadora
      // (pedidos sem correspondência são de outros lotes/datas e devem ser ignorados)
      let dadosFiltrados = dados;
      if (transpSheet && Object.keys(transpData).length > 0) {
        const antes = new Set(dados.map(d=>d.numero_pedido)).size;
        dadosFiltrados = dados.filter(d => transpData[d.numero_pedido]);
        dadosFiltrados.forEach(d => { const t = transpData[d.numero_pedido]; d.cliente = t.cliente; d.transportadora = t.transportadora; d.aguardando_desde = t.aguardando_desde||''; });
        const depois = new Set(dadosFiltrados.map(d=>d.numero_pedido)).size;
        const ignorados = antes - depois;
        if (ignorados > 0) {
          mostrarStatusModal(`⚠️ ${ignorados} pedido(s) da aba Itens não encontrados na aba Transportadora foram ignorados.`, 'aviso');
          setTimeout(() => mostrarStatusModal('', ''), 4000);
        }
        // Inclui pedidos da Transportadora que não têm itens na aba Itens
        // (serão importados com 0 itens para constar na fila)
        const pedidosComItens = new Set(dadosFiltrados.map(d => d.numero_pedido));
        let semItens = 0;
        Object.keys(transpData).forEach(num => {
          if (!pedidosComItens.has(num)) {
            const t = transpData[num];
            dadosFiltrados.push({ numero_pedido:num, codigo:'', descricao:'', quantidade:0, endereco:'', cliente:t.cliente, transportadora:t.transportadora, aguardando_desde:t.aguardando_desde||'' });
            semItens++;
          }
        });
        if (semItens > 0) {
          mostrarStatusModal(`⚠️ ${semItens} pedido(s) da Transportadora sem itens — serão importados com 0 itens.`, 'aviso');
          setTimeout(() => mostrarStatusModal('', ''), 5000);
        }
      } else {
        dadosFiltrados.forEach(d => { const t = transpData[d.numero_pedido]; if (t) { d.cliente = t.cliente; d.transportadora = t.transportadora; d.aguardando_desde = t.aguardando_desde||''; } });
      }
      const dados_final = dadosFiltrados;
      const dadosUsar = (typeof dados_final !== 'undefined') ? dados_final : dados;
      if (!dadosUsar.length) { mostrarStatusModal('❌ Nenhuma linha encontrada!','erro'); return; }
      pedidosImportarModal = dadosUsar;
      const totalP    = new Set(dadosUsar.map(d=>d.numero_pedido)).size;
      const totalQtd  = dadosUsar.reduce((s,d)=>s+(d.quantidade||1),0);
      mostrarStatusModal(`✅ ${dadosUsar.length} SKU(s) em ${totalP} pedido(s)${transpSheet?' — Transportadora OK':''}`, 'sucesso');
      document.getElementById('modal-tbody-prev').innerHTML =
        dadosUsar.slice(0,10).map(d=>`<tr><td>${d.numero_pedido}</td><td style="color:var(--accent)">${d.codigo}</td><td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.descricao}</td><td style="color:var(--amber)">${d.endereco}</td><td style="color:var(--green)">${d.quantidade}</td></tr>`).join('') +
        (dadosUsar.length>10?`<tr><td colspan="5" style="color:var(--text3);text-align:center;padding:8px">... +${dadosUsar.length-10} linhas</td></tr>`:'');
      document.getElementById('modal-txt-total-import').textContent = `${totalP} pedido(s) • ${dadosUsar.length} SKUs • ${totalQtd} itens${transpSheet?' • Transportadora OK':''}`;
      document.getElementById('modal-preview-importacao').style.display = 'block';
    } catch(err) { mostrarStatusModal(`❌ ${err.message}`,'erro'); }
  };
  reader.onerror = () => mostrarStatusModal('❌ Erro ao abrir arquivo!','erro');
  reader.readAsArrayBuffer(file);
}
async function confirmarImportacaoModal() {
  if (!pedidosImportarModal.length) return;
  mostrarStatusModal('⏳ Importando...', 'carregando');
  const pedMapLocal = {};
  pedidosImportarModal.forEach(l => { const n = String(l.numero_pedido||'').trim(); if (!n) return; if (!pedMapLocal[n]) pedMapLocal[n] = []; pedMapLocal[n].push(l); });
  const numeros = Object.keys(pedMapLocal);
  let totalImportados = 0, totalIgnorados = 0;
  try {
    for (let i = 0; i < numeros.length; i += 20) {
      const loteNums = numeros.slice(i, i + 20);
      const linhasLote = [];
      loteNums.forEach(n => linhasLote.push(...pedMapLocal[n]));
      mostrarStatusModal(`⏳ Importando... ${Math.round(((i+loteNums.length)/numeros.length)*100)}%`, 'carregando');
      const res  = await fetch(`${API}/pedidos/importar`, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ linhas: linhasLote }) });
      const data = await res.json();
      if (data.erro) { mostrarStatusModal(`❌ ${data.erro}`, 'erro'); return; }
      totalImportados += data.importados || 0;
      totalIgnorados  += data.ignorados  || 0;
    }
    const reg = { data:new Date().toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}), hora:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}), total:numeros.length, ok:totalImportados, erro:totalIgnorados };
    historicoImportacoes.unshift(reg);
    if (historicoImportacoes.length > 20) historicoImportacoes = historicoImportacoes.slice(0,20);
    localStorage.setItem('historico_importacoes', JSON.stringify(historicoImportacoes));
    renderHistoricoModal();
    mostrarStatusModal(`✅ ${totalImportados} pedido(s) importado(s)!${totalIgnorados>0?` ⚠️ ${totalIgnorados} já existiam.`:''}`, 'sucesso');
    document.getElementById('modal-preview-importacao').style.display = 'none';
    pedidosImportarModal = [];
    document.getElementById('modal-input-arquivo').value = '';
    toast(`${totalImportados} pedidos na fila!`, 'sucesso');
    carregarPedidos();
  } catch(e) { mostrarStatusModal('❌ Erro na importação!', 'erro'); }
}
function renderHistoricoModal() {
  const el = document.getElementById('modal-hist-importacoes');
  if (!el) return;
  if (!historicoImportacoes.length) { el.innerHTML = '<div style="color:var(--text3);font-size:11px;text-align:center;padding:14px">Nenhuma importação</div>'; return; }
  el.innerHTML = historicoImportacoes.map(h=>`<div class="hist-item"><div><div style="color:var(--green);font-weight:700">✅ ${h.ok} pedido(s)</div>${h.erro>0?`<div style="color:var(--amber);font-size:10px">⚠️ ${h.erro} já existiam</div>`:''}</div><div style="color:var(--text3);font-size:10px">${h.data} às ${h.hora}</div></div>`).join('');
}
function mostrarStatusModal(msg, tipo) {
  const cores = { carregando:'background:#EFF6FF;border:1px solid #BFDBFE;color:#1D4ED8', sucesso:'background:#F0FDF4;border:1px solid #BBF7D0;color:#15803D', erro:'background:#FEF2F2;border:1px solid #FECACA;color:#DC2626', aviso:'background:#FFFBEB;border:1px solid #FDE68A;color:#D97706' };
  const el = document.getElementById('modal-status-leitura');
  if (!el) return;
  if (!msg) { el.style.display='none'; return; }
  el.setAttribute('style', `display:block;margin-top:10px;padding:10px;border-radius:8px;font-size:12px;font-weight:600;text-align:center;${cores[tipo]||''}`);
  el.textContent = msg;
}

/* ══════════════════════════════════════════
   MODAL DISTRIBUIÇÃO JUSTA
══════════════════════════════════════════ */
let distribuicaoPlano = null;
let _modoPrime = false;

async function abrirModalDistribuicao() {
  document.getElementById('modal-distribuicao').style.display = 'flex';
  document.getElementById('dist-resultado').style.display = 'none';
  document.getElementById('btn-confirmar-dist').style.display = 'none';
  document.getElementById('btn-calcular-dist').style.display = 'inline-flex';
  distribuicaoPlano = null;
  _turnoAtivoDistribuicao = '';
  // Reseta modo Prime
  _modoPrime = false;
  _aplicarEstadoPrime();
  // Recalcula pontuação de pedidos antigos em background
  fetch(`${API}/pedidos/recalcular-pontuacao`, { method:'POST', credentials:'include' }).catch(()=>{});
  await carregarSeparadoresDistribuicao();
  await carregarPedidosDistribuicao();
}

function togglePrimeDistribuicao() {
  _modoPrime = !_modoPrime;
  _aplicarEstadoPrime();
  // Reseta cálculo anterior ao trocar de modo
  document.getElementById('dist-resultado').style.display = 'none';
  document.getElementById('btn-confirmar-dist').style.display = 'none';
  document.getElementById('btn-calcular-dist').style.display = 'inline-flex';
  distribuicaoPlano = null;
  carregarPedidosDistribuicao();
}

function _aplicarEstadoPrime() {
  const btn   = document.getElementById('btn-prime-dist');
  const aviso = document.getElementById('dist-prime-aviso');
  if (!btn) return;
  if (_modoPrime) {
    btn.style.background = '#D97706';
    btn.style.color      = '#fff';
    btn.textContent      = '⭐ Modo Prime ATIVO';
    if (aviso) aviso.style.display = 'block';
  } else {
    btn.style.background = 'transparent';
    btn.style.color      = '#D97706';
    btn.textContent      = '⭐ Incluir Prime';
    if (aviso) aviso.style.display = 'none';
  }
}
function fecharModalDistribuicao() {
  document.getElementById('modal-distribuicao').style.display = 'none';
  distribuicaoPlano = null;
  _turnoAtivoDistribuicao = '';
}
async function carregarSeparadoresDistribuicao() {
  try {
    const res = await fetch(`${API}/usuarios`, { credentials:'include' });
    const users = await res.json();
    _todosSepsDistribuicao = users.filter(u => u.status === 'ativo');
    // Mostra contagem por turno nos botões
    _atualizarBadgesTurnoDistribuicao();
    // Auto-seleciona o turno atual pelo horário
    filtrarTurnoDistribuicao(_turnoAtualParaDistribuicao());
  } catch(e) { console.warn(e); }
}
async function carregarPedidosDistribuicao() {
  try {
    const res = await fetch(`${API}/pedidos?status=pendente`, { credentials:'include' });
    const pedidos = await res.json();
    const el = document.getElementById('dist-preview');
    if (!pedidos.length) { el.innerHTML = '<div style="color:var(--text3);font-size:12px;text-align:center;padding:20px">Nenhum pedido pendente para distribuir</div>'; return; }
    const qtdInput       = parseInt(document.getElementById('dist-quantidade')?.value)||0;
    const apenasSemCheck = document.getElementById('dist-apenas-sem-sep')?.checked !== false;
    const respHora       = document.getElementById('dist-respeitar-hora')?.checked !== false;
    let lista = apenasSemCheck ? pedidos.filter(p=>!p.separador_id) : pedidos;
    // Filtro Prime obrigatório — nunca mistura
    if (_modoPrime) {
      lista = lista.filter(p => p.tem_prime);
    } else {
      lista = lista.filter(p => !p.tem_prime);
    }
    if (respHora) lista.sort((a,b)=>(a.aguardando_desde||a.hora_pedido||'').localeCompare(b.aguardando_desde||b.hora_pedido||''));
    const totalDisponivel = lista.length;
    if (qtdInput > 0) lista = lista.slice(0, qtdInput);
    const labelModo = _modoPrime
      ? `<span style="color:#D97706;font-weight:800">⭐ ${lista.length} pedido(s) Prime</span> de ${totalDisponivel} disponíveis`
      : `${lista.length} de ${totalDisponivel} pedido(s) serão distribuídos`;
    if (!lista.length) {
      el.innerHTML = `<div style="font-size:11px;color:var(--text3);margin-bottom:8px">${labelModo}</div><div style="color:var(--text3);font-size:12px;text-align:center;padding:20px">${_modoPrime ? 'Nenhum pedido Prime pendente' : 'Nenhum pedido normal pendente'}</div>`;
      return;
    }
    el.innerHTML = `<div style="font-size:11px;color:var(--text3);margin-bottom:8px">${labelModo}</div><div class="tabela-wrap" style="max-height:240px;overflow-y:auto"><table><thead><tr><th>PEDIDO</th><th>CLIENTE</th><th>HORÁRIO</th><th>ITENS</th><th>PONTUAÇÃO</th><th>STATUS</th></tr></thead><tbody>${lista.map(p=>`<tr${p.tem_prime?' style="background:rgba(217,119,6,.06)"':''}><td style="font-weight:700;color:var(--text);font-family:'Space Mono',monospace;font-size:11px">${p.numero_pedido}${p.tem_prime?' <span style="font-size:9px;background:#D97706;color:#fff;border-radius:4px;padding:1px 4px;vertical-align:middle">PRIME</span>':''}</td><td style="font-size:11px;color:var(--text2);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.cliente||'—'}</td><td style="font-size:11px;color:var(--amber);font-weight:600;white-space:nowrap">${p.aguardando_desde||p.hora_pedido||'—'}</td><td style="font-weight:600">${p.itens||0}</td><td><span style="font-family:'Space Mono',monospace;color:var(--indigo);font-weight:700">${p.pontuacao||'—'}</span></td><td><span class="pill ${(p.status||'pendente')}">${p.status||'pendente'}</span></td></tr>`).join('')}</tbody></table></div>`;
  } catch(e) { console.warn(e); }
}
async function calcularDistribuicao() {
  const checks = document.querySelectorAll('.dist-sep-check:checked');
  if (!checks.length) { toast('Selecione pelo menos um separador!', 'aviso'); return; }
  const seps = Array.from(checks).map(c => ({ id:parseInt(c.value), nome:c.dataset.nome }));
  try {
    const quantidade = parseInt(document.getElementById('dist-quantidade')?.value) || 0;
    const apenasSem = document.getElementById('dist-apenas-sem-sep')?.checked !== false;
    const respeitarHora = document.getElementById('dist-respeitar-hora')?.checked !== false;
    const res = await fetch(`${API}/pedidos/distribuicao`, { credentials:'include', method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ separadores:seps.map(s=>s.id), quantidade: quantidade||null, apenas_sem_sep:apenasSem, respeitar_hora:respeitarHora, apenas_prime:_modoPrime }) });
    const data = await res.json();
    if (data.erro) { toast(data.erro, 'erro'); return; }
    distribuicaoPlano = data.plano;
    const resEl = document.getElementById('dist-resultado');
    resEl.style.display = 'block';
    const totalDist = data.total_distribuidos ?? data.plano.reduce((s,p)=>s+p.pedidos.length,0);
    const totalItens = data.plano.reduce((s,p)=>s+(p.itens_total||0),0);
    const restantes = data.total_pedidos - totalDist;
    // Calcula desvio de itens para colorir a coluna (fairness visual)
    const avgItens = data.plano.length ? totalItens / data.plano.length : 0;
    let html = `<div style="font-size:11px;font-weight:700;color:${_modoPrime?'#D97706':'var(--accent)'};letter-spacing:1px;margin-bottom:10px">${_modoPrime?'⭐ RESULTADO DA DISTRIBUIÇÃO PRIME':'RESULTADO DA DISTRIBUIÇÃO'}</div>`;
    html += '<div class="tabela-wrap"><table><thead><tr><th>COLABORADOR</th><th>PEDIDOS</th><th>ITENS</th><th>PONTUAÇÃO</th><th>LISTA</th></tr></thead><tbody>';
    data.plano.forEach(item => {
      const desvio = avgItens > 0 ? Math.abs((item.itens_total||0) - avgItens) / avgItens : 0;
      const corItens = desvio < 0.1 ? 'var(--green)' : desvio < 0.25 ? 'var(--amber)' : 'var(--red)';
      html += `<tr>
        <td style="font-weight:700;color:var(--text)">👤 ${item.separador_nome}</td>
        <td style="color:var(--green);font-weight:700">${item.pedidos.length}</td>
        <td style="font-weight:800;font-size:14px;color:${corItens}">${item.itens_total||0} itens</td>
        <td><span style="font-family:'Space Mono',monospace;color:var(--indigo);font-size:11px">${item.pontuacao_total} pts</span></td>
        <td style="font-size:11px;color:var(--text3)">${item.pedidos.join(', ')}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
    html += `<div style="margin-top:10px;display:flex;gap:16px;flex-wrap:wrap;align-items:center">`;
    html += `<span style="font-size:13px;font-weight:700;color:var(--green)">✅ ${totalDist} pedido(s) · ${totalItens} itens distribuídos para ${seps.length} colaborador(es)</span>`;
    if (restantes > 0) html += `<span style="font-size:12px;color:var(--amber)">⏳ ${restantes} pedido(s) ficam na fila</span>`;
    html += `</div>`;
    resEl.innerHTML = html;
    document.getElementById('btn-calcular-dist').style.display = 'none';
    document.getElementById('btn-confirmar-dist').style.display = 'inline-flex';
  } catch(e) { toast('Erro ao calcular distribuição!', 'erro'); }
}
async function confirmarDistribuicao() {
  if (!distribuicaoPlano) return;
  try {
    // Passa o turno do botão ativo para que os pedidos entrem no lote correto
    const turnoLote = _turnoAtivoDistribuicao || null;
    const res = await fetch(`${API}/pedidos/distribuicao/confirmar`, { credentials:'include', method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ plano:distribuicaoPlano, turno_lote: turnoLote }) });
    const data = await res.json();
    if (data.erro) { toast(data.erro, 'erro'); return; }
    const turnoLabel = turnoLote ? ` · Lote ${turnoLote}` : '';
    toast(`✅ ${data.distribuidos} pedidos distribuídos!${turnoLabel}`, 'sucesso');
    fecharModalDistribuicao();
    carregarPedidos();
  } catch(e) { toast('Erro ao confirmar distribuição!', 'erro'); }
}

window.addEventListener('click', e => {
  if (e.target.id === 'modal-importar') fecharModalImportar();
  if (e.target.id === 'modal-distribuicao') fecharModalDistribuicao();
});
let _todosSepsDistribuicao = [];
let _turnoAtivoDistribuicao = ''; // '' = Todos

// Retorna o turno atual com base no hor\u00e1rio do rel\u00f3gio
function _turnoAtualParaDistribuicao() {
  var h = new Date().getHours();
  if (h >= 6 && h < 14) return 'Manha';
  if (h >= 14 && h < 22) return 'Tarde';
  return 'Noite';
}

// Atualiza os badges de contagem nos bot\u00f5es de turno
function _atualizarBadgesTurnoDistribuicao() {
  var counts = { '': 0, Manha: 0, Tarde: 0, Noite: 0 };
  _todosSepsDistribuicao.forEach(function(s) {
    counts['']++;
    var t = s.turno || 'Manha';
    if (counts[t] !== undefined) counts[t]++;
    else counts[t] = 1;
  });
  var map = {
    todos: 'Todos (' + counts[''] + ')',
    manha: 'Manh\u00e3 (' + (counts['Manha'] || 0) + ')',
    tarde: 'Tarde (' + (counts['Tarde'] || 0) + ')',
    noite: 'Noite (' + (counts['Noite'] || 0) + ')'
  };
  Object.keys(map).forEach(function(k) {
    var btn = document.getElementById('dist-turno-' + k);
    if (btn) btn.textContent = map[k];
  });
}

function filtrarTurnoDistribuicao(turno) {
  _turnoAtivoDistribuicao = turno; // '' = Todos, 'Manha'/'Tarde'/'Noite' = turno espec\u00edfico
  var el = document.getElementById('dist-separadores-lista');
  if (!el) return;
  ['todos','manha','tarde','noite'].forEach(function(t) {
    var btn = document.getElementById('dist-turno-' + t);
    if (!btn) return;
    var ativo = (turno === '' && t === 'todos') || turno.toLowerCase() === t;
    btn.classList.toggle('ativo', ativo);
    btn.style.background = btn.style.color = btn.style.border = '';
  });
  var seps = turno ? _todosSepsDistribuicao.filter(function(s) {
    var t = (s.turno || '').toLowerCase();
    var tb = turno.toLowerCase().replace('\u00e3','a').replace('\u00e2','a');
    var tc = t.replace('\u00e3','a').replace('\u00e2','a');
    return tc.startsWith(tb.substring(0,4));
  }) : _todosSepsDistribuicao;
  if (!seps.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:12px">Nenhum colaborador neste turno</div>';
    return;
  }
  el.innerHTML = seps.map(function(s) {
    return '<label style="display:flex;align-items:center;gap:6px;padding:6px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface2);cursor:pointer;font-size:12px;font-weight:600"><input type="checkbox" class="dist-sep-check" value="' + s.id + '" data-nome="' + s.nome + '" checked style="accent-color:var(--accent)"> ' + s.nome + '</label>';
  }).join('');
}
