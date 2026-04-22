/* MOBILE REPOSITOR */
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
  const el = document.getElementById('rep-lista-avisos');
  if (!el) return;
  try {
    const res = await fetch(`${API}/repositor/avisos?status=pendente`, { credentials:'include' });
    const avisos = res.ok ? await res.json() : [];
    if (!avisos.length) { el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text3)">Nenhuma falta pendente</div>'; return; }
    el.innerHTML = avisos.map(a => `
      <div class="aviso-card" style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px">
        <div style="font-weight:700;font-size:14px;margin-bottom:4px">${a.codigo||'—'}</div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:8px">${a.descricao||''} ${a.endereco?'· '+a.endereco:''}</div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:10px">Separador: ${a.separador_nome||'—'} · Pedido: ${a.numero_pedido||'—'}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button onclick="atualizarAvisoMobile(${a.id},'abastecido')" class="btn btn-success btn-sm">✅ Abastecido</button>
          <button onclick="atualizarAvisoMobile(${a.id},'subiu')" class="btn btn-outline btn-sm">⬆ Subiu</button>
          <button onclick="atualizarAvisoMobile(${a.id},'nao_encontrado')" class="btn btn-danger btn-sm">❌ Não enc.</button>
        </div>
      </div>`).join('');
  } catch(e) { el.innerHTML = '<div style="color:var(--danger);padding:16px">Erro ao carregar</div>'; }
}

async function atualizarAvisoMobile(id, situacao) {
  try {
    await fetch(`${API}/repositor/avisos/${id}`, {
      credentials:'include', method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ situacao, status: situacao })
    });
    carregarAvisosMobile();
    toast('Atualizado!', 'success');
  } catch(e) { toast('Erro ao atualizar', 'danger'); }
}

async function carregarStatsRepMobile() {
  const el = document.getElementById('rep-stats-content');
  if (!el) return;
  try {
    const res = await fetch(`${API}/estatisticas/repositor`, { credentials:'include' });
    const data = res.ok ? await res.json() : {};
    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:16px">
        <div style="background:var(--surface);border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:24px;font-weight:700;color:var(--success)">${data.reposto_hoje||0}</div>
          <div style="font-size:11px;color:var(--text3)">Abastecidos hoje</div>
        </div>
        <div style="background:var(--surface);border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:24px;font-weight:700;color:var(--danger)">${data.nao_encontrado_hoje||0}</div>
          <div style="font-size:11px;color:var(--text3)">Não encontrados</div>
        </div>
      </div>`;
  } catch(e) {}
}

/* REPOSITOR DESKTOP */

let _todosUsuarios = [];
let _filtroSituacaoRep = '';

async function carregarReposicaoDesktop() {
  await carregarUsuariosParaRep();
  await carregarTabelaReposicao();
}

async function carregarUsuariosParaRep() {
  try {
    const res = await fetch(`${API}/usuarios`, { credentials:'include' });
    _todosUsuarios = res.ok ? await res.json() : [];
  } catch(e) { _todosUsuarios = []; }
}

function optionsUsuarios(selecionado='') {
  const opts = _todosUsuarios
    .filter(u => u.status === 'ativo')
    .sort((a,b) => a.nome.localeCompare(b.nome))
    .map(u => `<option value="${u.nome}" ${u.nome===selecionado?'selected':''}>${u.nome}</option>`)
    .join('');
  return `<option value="">—</option>${opts}`;
}

function optionsSituacao(selecionado='') {
  const opts = [
    {v:'pendente',    l:'⏳ Pendente'},
    {v:'verificando', l:'🔍 Verificando'},
    {v:'subiu',       l:'⬆ Subiu'},
    {v:'abastecido',  l:'✅ Abastecido'},
    {v:'protocolo',   l:'📋 Protocolo'},
    {v:'nao_encontrado', l:'❌ Não encontrado'},
  ];
  return opts.map(o => `<option value="${o.v}" ${o.v===selecionado?'selected':''}>${o.l}</option>`).join('');
}

async function carregarTabelaReposicao() {
  const tbody = document.getElementById('tbody-reposicao');
  const totalEl = document.getElementById('rep-total');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text3)">Carregando...</td></tr>';
  try {
    let url = `${API}/repositor/avisos`;
    if (_filtroSituacaoRep) url += `?status=${_filtroSituacaoRep}`;
    const res = await fetch(url, { credentials:'include' });
    const avisos = res.ok ? await res.json() : [];
    if (totalEl) totalEl.textContent = avisos.length;
    if (!avisos.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text3)">Nenhum item encontrado</td></tr>';
      return;
    }
    tbody.innerHTML = avisos.map(a => {
      const sit = a.situacao || a.status || 'pendente';
      const sitColor = {
        pendente:'var(--amber)', verificando:'#8b5cf6', subiu:'#3b82f6',
        abastecido:'var(--success)', protocolo:'var(--text3)', nao_encontrado:'var(--danger)'
      }[sit] || 'var(--text3)';
      return `<tr id="rep-row-${a.id}">
        <td style="font-weight:600;font-size:13px">${a.codigo||'—'}</td>
        <td style="font-size:12px;color:var(--text2)">${a.forma_envio||'—'}</td>
        <td style="font-size:12px">${a.separador_nome||'—'}</td>
        <td>
          <select onchange="salvarCampoAviso(${a.id},'quem_pegou',this.value)"
            style="width:100%;font-size:12px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text)">
            ${optionsUsuarios(a.quem_pegou||'')}
          </select>
        </td>
        <td>
          <select onchange="salvarCampoAviso(${a.id},'quem_guardou',this.value)"
            style="width:100%;font-size:12px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text)">
            ${optionsUsuarios(a.quem_guardou||'')}
          </select>
        </td>
        <td>
          <select onchange="salvarCampoAviso(${a.id},'situacao',this.value)"
            style="width:100%;font-size:12px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:${sitColor}">
            ${optionsSituacao(sit)}
          </select>
        </td>
        <td style="font-size:11px;color:var(--text3);max-width:160px">
          <input type="text" value="${a.obs||''}" placeholder="Observação..."
            onblur="salvarCampoAviso(${a.id},'obs',this.value)"
            style="width:100%;font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text)">
        </td>
        <td style="font-size:11px;color:var(--text3);white-space:nowrap">${a.hora_aviso||'—'}</td>
      </tr>`;
    }).join('');
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="8" style="color:var(--danger);padding:16px">Erro: ${e.message}</td></tr>`;
  }
}

async function salvarCampoAviso(id, campo, valor) {
  try {
    const body = { [campo]: valor };
    if (campo === 'situacao') body.status = valor;
    await fetch(`${API}/repositor/avisos/${id}`, {
      credentials:'include', method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    toast('Salvo!', 'success');
    // Atualiza cor da situacao inline sem recarregar tudo
    if (campo === 'situacao') {
      const sel = document.querySelector(`#rep-row-${id} select:nth-child(1)`);
    }
  } catch(e) { toast('Erro ao salvar', 'danger'); }
}

function filtrarReposicao(situacao) {
  _filtroSituacaoRep = situacao;
  // Atualiza botoes
  document.querySelectorAll('.rep-filtro-btn').forEach(btn => {
    btn.classList.toggle('btn-primary', btn.dataset.sit === situacao);
    btn.classList.toggle('btn-outline', btn.dataset.sit !== situacao);
  });
  carregarTabelaReposicao();
}

/* ABAS DA REPOSICAO */
function mudarAbaRep(aba) {
  ['avisos','stats'].forEach(t => {
    const el = document.getElementById(`rep-aba-${t}`);
    const btn = document.getElementById(`rep-ababtn-${t}`);
    if (el) el.style.display = t===aba?'block':'none';
    if (btn) {
      btn.style.borderBottom = t===aba?'2px solid var(--accent)':'2px solid transparent';
      btn.style.color = t===aba?'var(--accent)':'var(--text3)';
    }
  });
  if (aba==='avisos') carregarTabelaReposicao();
  if (aba==='stats')  carregarEstatisticasRep();
}

async function carregarEstatisticasRep() {
  const el = document.getElementById('rep-stats-desktop');
  if (!el) return;
  try {
    const res = await fetch(`${API}/estatisticas/repositor`, { credentials:'include' });
    const data = res.ok ? await res.json() : {};
    // Indicadores por repositor — quem_pegou e quem_guardou
    const resAv = await fetch(`${API}/repositor/avisos`, { credentials:'include' });
    const avisos = resAv.ok ? await resAv.json() : [];
    const stats = {};
    avisos.forEach(a => {
      if (a.quem_pegou) {
        if (!stats[a.quem_pegou]) stats[a.quem_pegou] = { pegou:0, guardou:0 };
        stats[a.quem_pegou].pegou++;
      }
      if (a.quem_guardou) {
        if (!stats[a.quem_guardou]) stats[a.quem_guardou] = { pegou:0, guardou:0 };
        stats[a.quem_guardou].guardou++;
      }
    });
    const rows = Object.entries(stats).sort((a,b)=>(b[1].pegou+b[1].guardou)-(a[1].pegou+a[1].guardou));
    el.innerHTML = `
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--surface2)">
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:var(--text3)">COLABORADOR</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;color:var(--text3)">QUEM PEGOU</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;color:var(--text3)">QUEM GUARDOU</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map(([nome,s])=>`
            <tr style="border-bottom:1px solid var(--border)">
              <td style="padding:10px 12px;font-size:13px;font-weight:500">${nome}</td>
              <td style="padding:10px 12px;text-align:center;font-size:13px;color:var(--accent)">${s.pegou}</td>
              <td style="padding:10px 12px;text-align:center;font-size:13px;color:var(--success)">${s.guardou}</td>
            </tr>`).join('') : '<tr><td colspan="3" style="padding:24px;text-align:center;color:var(--text3)">Sem dados</td></tr>'}
        </tbody>
      </table>`;
  } catch(e) { el.innerHTML = `<div style="color:var(--danger);padding:16px">Erro: ${e.message}</div>`; }
}

/* ESTATISTICAS REPOSITOR (desktop) */
async function carregarStatsRepositor() {
  try {
    const res = await fetch(`${API}/estatisticas/repositor`, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? 0; };
    set('rep-hoje',     data.reposto_hoje);
    set('rep-mes',      data.reposto_mes);
    set('rep-ano',      data.reposto_ano);
    set('rep-nao-enc',  data.nao_encontrado_hoje);
  } catch(e) {}
}
