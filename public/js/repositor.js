/* ═══════════════════════════════════════
   ESTADO GLOBAL REPOSITOR
═══════════════════════════════════════ */
let _todosUsuarios = [];
let _filtroSituacaoRep = '';
let _avisosCache = [];

/* ═══════════════════════════════════════
   INICIALIZAÇÃO MOBILE
═══════════════════════════════════════ */
function ativarMobileRep() {
  document.body.classList.add('rep-mobile');
  document.getElementById('rep-mobile-root').style.display = 'flex';
  document.getElementById('rep-tabbar').style.display = 'flex';
  mudarTabRep('avisos');
  carregarUsuariosParaRep().then(() => carregarAvisosMobile());
  setInterval(() => carregarAvisosMobile(), 30000);
}

function mudarTabRep(tab) {
  ['avisos','stats'].forEach(t => {
    const tabEl = document.getElementById(`rep-tab-${t}`);
    const btnEl = document.getElementById(`rep-tab-${t}`);
    if (document.getElementById(`rtab-${t}`)) {
      document.getElementById(`rtab-${t}`).classList.toggle('ativo', t === tab);
    }
    if (tabEl) tabEl.classList.toggle('ativa', t === tab);
  });
  if (tab === 'avisos') carregarAvisosMobile();
  if (tab === 'stats')  carregarStatsRepMobile();
}

/* ═══════════════════════════════════════
   CARREGAR USUÁRIOS (compartilhado)
═══════════════════════════════════════ */
async function carregarUsuariosParaRep() {
  try {
    const res = await fetch(`${API}/usuarios`, { credentials:'include' });
    _todosUsuarios = res.ok ? await res.json() : [];
  } catch(e) { _todosUsuarios = []; }
}

function optionsUsuarios(selecionado='') {
  const lista = _todosUsuarios
    .filter(u => u.status === 'ativo')
    .sort((a,b) => a.nome.localeCompare(b.nome));
  return `<option value="">— Selecionar —</option>` +
    lista.map(u => `<option value="${u.nome}" ${u.nome===selecionado?'selected':''}>${u.nome}</option>`).join('');
}

function optionsSituacao(selecionado='') {
  const opts = [
    {v:'pendente',       l:'⏳ Pendente',        c:'#f59e0b'},
    {v:'verificando',    l:'🔍 Verificando',      c:'#8b5cf6'},
    {v:'subiu',          l:'⬆️ Subiu',            c:'#3b82f6'},
    {v:'abastecido',     l:'✅ Abastecido',       c:'#10b981'},
    {v:'protocolo',      l:'📋 Protocolo',        c:'#6b7280'},
    {v:'nao_encontrado', l:'❌ Não encontrado',   c:'#ef4444'},
  ];
  return opts.map(o => `<option value="${o.v}" ${o.v===selecionado?'selected':''}>${o.l}</option>`).join('');
}

function corSituacao(sit) {
  const cores = {
    pendente:'#f59e0b', verificando:'#8b5cf6', subiu:'#3b82f6',
    abastecido:'#10b981', protocolo:'#6b7280', nao_encontrado:'#ef4444'
  };
  return cores[sit] || '#6b7280';
}

/* ═══════════════════════════════════════
   MOBILE — LISTA DE AVISOS
═══════════════════════════════════════ */
async function carregarAvisosMobile() {
  const el = document.getElementById('m-lista-avisos');
  const cntEl = document.getElementById('m-rep-pend');
  if (!el) return;
  try {
    const filtro = document.getElementById('m-filtro-rep-status')?.value || '';
    let url = `${API}/repositor/avisos`;
    if (filtro) url += `?status=${filtro}`;
    const res = await fetch(url, { credentials:'include' });
    const avisos = res.ok ? await res.json() : [];
    _avisosCache = avisos;
    const pendentes = avisos.filter(a => a.status === 'pendente' || a.situacao === 'pendente');
    if (cntEl) cntEl.textContent = pendentes.length;
    if (!avisos.length) {
      el.innerHTML = `<div style="text-align:center;padding:48px 16px">
        <div style="font-size:40px;margin-bottom:8px">✅</div>
        <div style="color:var(--text3);font-size:14px">Nenhum item em falta</div>
      </div>`;
      return;
    }
    el.innerHTML = avisos.map(a => {
      const sit = a.situacao || a.status || 'pendente';
      const cor = corSituacao(sit);
      const sitLabel = {
        pendente:'⏳ Pendente', verificando:'🔍 Verificando', subiu:'⬆️ Subiu',
        abastecido:'✅ Abastecido', protocolo:'📋 Protocolo', nao_encontrado:'❌ Não encontrado'
      }[sit] || sit;
      return `
      <div style="background:var(--surface);border:1px solid var(--border);border-left:4px solid ${cor};border-radius:12px;padding:16px;margin-bottom:12px">
        <!-- Header do card -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
          <div>
            <div style="font-weight:700;font-size:15px;color:var(--text)">${a.codigo||'—'}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">${a.descricao||''}</div>
          </div>
          <span style="font-size:11px;font-weight:600;color:${cor};background:${cor}18;padding:3px 8px;border-radius:20px;white-space:nowrap">${sitLabel}</span>
        </div>
        <!-- Infos -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;font-size:12px">
          <div style="color:var(--text3)">📦 Separador</div>
          <div style="color:var(--text);font-weight:500">${a.separador_nome||'—'}</div>
          <div style="color:var(--text3)">🚚 Forma de envio</div>
          <div style="color:var(--text);font-weight:500">${a.forma_envio||'—'}</div>
          <div style="color:var(--text3)">📍 Endereço</div>
          <div style="color:var(--text);font-weight:500">${a.endereco||'—'}</div>
          <div style="color:var(--text3)">🕐 Horário</div>
          <div style="color:var(--text);font-weight:500">${a.hora_aviso||'—'}</div>
        </div>
        <!-- Campos editáveis -->
        <div style="display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--border);padding-top:12px">
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--text3);display:block;margin-bottom:4px">QUEM PEGOU</label>
            <select onchange="salvarCampoAvisoMobile(${a.id},'quem_pegou',this.value)"
              style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:13px">
              ${optionsUsuarios(a.quem_pegou||'')}
            </select>
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--text3);display:block;margin-bottom:4px">QUEM GUARDOU</label>
            <select onchange="salvarCampoAvisoMobile(${a.id},'quem_guardou',this.value)"
              style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:13px">
              ${optionsUsuarios(a.quem_guardou||'')}
            </select>
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--text3);display:block;margin-bottom:4px">SITUAÇÃO</label>
            <select onchange="salvarCampoAvisoMobile(${a.id},'situacao',this.value)"
              style="width:100%;padding:8px 10px;border:1px solid ${cor};border-radius:8px;background:var(--surface2);color:${cor};font-size:13px;font-weight:600">
              ${optionsSituacao(sit)}
            </select>
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--text3);display:block;margin-bottom:4px">OBSERVAÇÃO</label>
            <input type="text" value="${(a.obs||'').replace(/"/g,'&quot;')}" placeholder="Escreva uma obs..."
              onblur="salvarCampoAvisoMobile(${a.id},'obs',this.value)"
              style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:13px;box-sizing:border-box">
          </div>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    el.innerHTML = `<div style="color:var(--danger);text-align:center;padding:24px">Erro ao carregar. Tente novamente.</div>`;
  }
}

async function salvarCampoAvisoMobile(id, campo, valor) {
  try {
    const body = { [campo]: valor };
    if (campo === 'situacao') body.status = valor;
    const res = await fetch(`${API}/repositor/avisos/${id}`, {
      credentials:'include', method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    if (res.ok) toast('Salvo!', 'success');
    else toast('Erro ao salvar', 'danger');
  } catch(e) { toast('Sem conexão', 'danger'); }
}

async function carregarStatsRepMobile() {
  const el = document.getElementById('rep-stats-content');
  if (!el) return;
  try {
    const res = await fetch(`${API}/estatisticas/repositor`, { credentials:'include' });
    const data = res.ok ? await res.json() : {};
    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:4px 0">
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:32px;font-weight:700;color:#10b981">${data.reposto_hoje||0}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px">Abastecidos hoje</div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:32px;font-weight:700;color:#ef4444">${data.nao_encontrado_hoje||0}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px">Não encontrados</div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:32px;font-weight:700;color:#3b82f6">${data.reposto_mes||0}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px">Este mês</div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:32px;font-weight:700;color:#f59e0b">${data.reposto_ano||0}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px">Este ano</div>
        </div>
      </div>`;
  } catch(e) {}
}

/* ═══════════════════════════════════════
   DESKTOP — TABELA DE REPOSIÇÃO
═══════════════════════════════════════ */
async function carregarReposicaoDesktop() {
  await carregarUsuariosParaRep();
  await carregarTabelaReposicao();
}

async function carregarTabelaReposicao() {
  const tbody = document.getElementById('tbody-reposicao');
  const totalEl = document.getElementById('rep-total');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text3)">
    <div style="font-size:20px;margin-bottom:8px">⏳</div>Carregando...</td></tr>`;
  try {
    let url = `${API}/repositor/avisos`;
    if (_filtroSituacaoRep) url += `?status=${_filtroSituacaoRep}`;
    const res = await fetch(url, { credentials:'include' });
    const avisos = res.ok ? await res.json() : [];
    _avisosCache = avisos;
    if (totalEl) totalEl.textContent = avisos.length;
    if (!avisos.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:48px;color:var(--text3)">
        <div style="font-size:32px;margin-bottom:8px">✅</div>
        Nenhum item encontrado</td></tr>`;
      return;
    }
    tbody.innerHTML = avisos.map(a => {
      const sit = a.situacao || a.status || 'pendente';
      const cor = corSituacao(sit);
      return `<tr id="rep-row-${a.id}" style="border-bottom:1px solid var(--border);transition:background .15s" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
        <td style="padding:10px 12px;font-weight:600;font-size:13px;white-space:nowrap">${a.codigo||'—'}</td>
        <td style="padding:10px 12px;font-size:12px;color:var(--text2);white-space:nowrap">${a.forma_envio||'—'}</td>
        <td style="padding:10px 12px;font-size:12px;white-space:nowrap;max-width:150px;overflow:hidden;text-overflow:ellipsis">${a.separador_nome||'—'}</td>
        <td style="padding:8px 10px;min-width:140px">
          <select onchange="salvarCampoAviso(${a.id},'quem_pegou',this.value)"
            style="width:100%;font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text)">
            ${optionsUsuarios(a.quem_pegou||'')}
          </select>
        </td>
        <td style="padding:8px 10px;min-width:140px">
          <select onchange="salvarCampoAviso(${a.id},'quem_guardou',this.value)"
            style="width:100%;font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text)">
            ${optionsUsuarios(a.quem_guardou||'')}
          </select>
        </td>
        <td style="padding:8px 10px;min-width:150px">
          <select onchange="salvarCampoAviso(${a.id},'situacao',this.value)"
            style="width:100%;font-size:12px;padding:5px 8px;border:1px solid ${cor};border-radius:6px;background:var(--surface);color:${cor};font-weight:600">
            ${optionsSituacao(sit)}
          </select>
        </td>
        <td style="padding:8px 10px;min-width:160px">
          <input type="text" value="${(a.obs||'').replace(/"/g,'&quot;')}" placeholder="Observação..."
            onblur="salvarCampoAviso(${a.id},'obs',this.value)"
            style="width:100%;font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);box-sizing:border-box">
        </td>
        <td style="padding:10px 12px;font-size:11px;color:var(--text3);white-space:nowrap">${a.hora_aviso||'—'}</td>
      </tr>`;
    }).join('');
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="8" style="color:var(--danger);text-align:center;padding:24px">Erro: ${e.message}</td></tr>`;
  }
}

async function salvarCampoAviso(id, campo, valor) {
  try {
    const body = { [campo]: valor };
    if (campo === 'situacao') body.status = valor;
    const res = await fetch(`${API}/repositor/avisos/${id}`, {
      credentials:'include', method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    if (res.ok) {
      toast('Salvo!', 'success');
      // Atualiza cor do select de situação inline
      if (campo === 'situacao') {
        const row = document.getElementById(`rep-row-${id}`);
        if (row) {
          const sel = row.querySelectorAll('select')[2];
          if (sel) { sel.style.color = corSituacao(valor); sel.style.borderColor = corSituacao(valor); }
        }
      }
    } else { toast('Erro ao salvar', 'danger'); }
  } catch(e) { toast('Sem conexão', 'danger'); }
}

function filtrarReposicao(situacao) {
  _filtroSituacaoRep = situacao;
  document.querySelectorAll('.rep-filtro-btn').forEach(btn => {
    const isActive = btn.dataset.sit === situacao;
    btn.style.background = isActive ? 'var(--accent)' : 'transparent';
    btn.style.color = isActive ? '#fff' : 'var(--text2)';
    btn.style.borderColor = isActive ? 'var(--accent)' : 'var(--border)';
    btn.style.fontWeight = isActive ? '700' : '500';
  });
  carregarTabelaReposicao();
}

function mudarAbaRep(aba) {
  ['avisos','stats'].forEach(t => {
    const el = document.getElementById(`rep-aba-${t}`);
    const btn = document.getElementById(`rep-ababtn-${t}`);
    if (el) el.style.display = t===aba ? 'block' : 'none';
    if (btn) {
      btn.style.borderBottom = t===aba ? '2px solid var(--accent)' : '2px solid transparent';
      btn.style.color = t===aba ? 'var(--accent)' : 'var(--text3)';
    }
  });
  if (aba==='avisos') carregarTabelaReposicao();
  if (aba==='stats')  carregarEstatisticasRep();
}

async function carregarEstatisticasRep() {
  const el = document.getElementById('rep-stats-desktop');
  if (!el) return;
  el.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text3)">Carregando...</div>`;
  try {
    const resAv = await fetch(`${API}/repositor/avisos`, { credentials:'include' });
    const avisos = resAv.ok ? await resAv.json() : [];
    const stats = {};
    avisos.forEach(a => {
      [['quem_pegou','pegou'],['quem_guardou','guardou']].forEach(([campo,key]) => {
        if (a[campo]) {
          if (!stats[a[campo]]) stats[a[campo]] = {pegou:0,guardou:0,abastecido:0,nao_enc:0};
          stats[a[campo]][key]++;
          if ((a.situacao||a.status)==='abastecido') stats[a[campo]].abastecido++;
          if ((a.situacao||a.status)==='nao_encontrado') stats[a[campo]].nao_enc++;
        }
      });
    });
    const rows = Object.entries(stats).sort((a,b)=>(b[1].pegou+b[1].guardou)-(a[1].pegou+a[1].guardou));
    if (!rows.length) {
      el.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text3)">
        <div style="font-size:32px;margin-bottom:8px">📊</div>
        Nenhum dado ainda. Registre "Quem Pegou" e "Quem Guardou" nos itens.</div>`;
      return;
    }
    el.innerHTML = `
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--surface2)">
            <th style="padding:12px 16px;text-align:left;font-size:11px;color:var(--text3);letter-spacing:.5px">COLABORADOR</th>
            <th style="padding:12px 16px;text-align:center;font-size:11px;color:var(--text3);letter-spacing:.5px">PEGOU</th>
            <th style="padding:12px 16px;text-align:center;font-size:11px;color:var(--text3);letter-spacing:.5px">GUARDOU</th>
            <th style="padding:12px 16px;text-align:center;font-size:11px;color:var(--text3);letter-spacing:.5px">ABASTECIDOS</th>
            <th style="padding:12px 16px;text-align:center;font-size:11px;color:var(--text3);letter-spacing:.5px">NÃO ENC.</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(([nome,s],i) => `
            <tr style="border-bottom:1px solid var(--border)">
              <td style="padding:12px 16px;font-size:13px;font-weight:600">
                <div style="display:flex;align-items:center;gap:10px">
                  <div style="width:32px;height:32px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0">${nome.charAt(0).toUpperCase()}</div>
                  ${nome}
                </div>
              </td>
              <td style="padding:12px 16px;text-align:center;font-size:14px;font-weight:700;color:var(--accent)">${s.pegou}</td>
              <td style="padding:12px 16px;text-align:center;font-size:14px;font-weight:700;color:#3b82f6">${s.guardou}</td>
              <td style="padding:12px 16px;text-align:center;font-size:14px;font-weight:700;color:#10b981">${s.abastecido}</td>
              <td style="padding:12px 16px;text-align:center;font-size:14px;font-weight:700;color:#ef4444">${s.nao_enc}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch(e) { el.innerHTML = `<div style="color:var(--danger);padding:16px">Erro: ${e.message}</div>`; }
}

/* ═══════════════════════════════════════
   ESTATISTICAS REPOSITOR
═══════════════════════════════════════ */
async function carregarStatsRepositor() {
  try {
    const res = await fetch(`${API}/estatisticas/repositor`, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? 0; };
    set('rep-hoje',    data.reposto_hoje);
    set('rep-mes',     data.reposto_mes);
    set('rep-ano',     data.reposto_ano);
    set('rep-nao-enc', data.nao_encontrado_hoje);
  } catch(e) {}
}
