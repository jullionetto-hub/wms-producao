/* ══ CADASTROS.JS ══ WMS Miess ══ */

function coletarPerfisMarcados() {
  return Array.from(document.querySelectorAll('.usr-perm:checked')).map(el => el.value);
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

function trocarCadastroTab(tab) {
  ['usuarios'].forEach(t => {
    const el  = document.getElementById(`cad-${t}`);
    const btn = document.getElementById(`ctab-${t}`);
    if (el)  el.style.display  = t===tab ? 'block' : 'none';
    if (btn) btn.className = t===tab ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm';
  });
  if (tab === 'usuarios') carregarUsuarios();
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