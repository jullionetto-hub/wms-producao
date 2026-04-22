/* REPOSITOR — fluxo em 3 etapas */

let _todosUsuarios = [];
let _filtroSituacaoRep = '';

/* ── Inicialização ─────────────────────────────────────────────────── */
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
    const pg = document.getElementById(`rep-tab-${t}`);
    const bt = document.getElementById(`rtab-${t}`);
    if (pg) pg.classList.toggle('ativa', t === tab);
    if (bt) bt.classList.toggle('ativo', t === tab);
  });
  if (tab === 'avisos') carregarAvisosMobile();
  if (tab === 'stats')  carregarStatsRepMobile();
}

/* ── Usuários ──────────────────────────────────────────────────────── */
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
    lista.map(u =>
      `<option value="${u.nome}" ${u.nome===selecionado?'selected':''}>${u.nome}</option>`
    ).join('');
}

function corSituacao(sit) {
  return {
    pendente:'#f59e0b', verificando:'#8b5cf6', buscado:'#3b82f6',
    aguardando_abastecer:'#f97316', abastecido:'#10b981',
    protocolo:'#6b7280', nao_encontrado:'#ef4444'
  }[sit] || '#6b7280';
}

function labelSituacao(sit) {
  return {
    pendente:'⏳ Pendente', verificando:'🔍 Verificando',
    buscado:'📦 Buscado', aguardando_abastecer:'🕐 Aguard. Abastecer',
    abastecido:'✅ Abastecido', protocolo:'📋 Protocolo',
    nao_encontrado:'❌ Não encontrado'
  }[sit] || sit;
}

/* ══════════════════════════════════════════════════════════════════
   MOBILE — LISTA DE AVISOS
══════════════════════════════════════════════════════════════════ */
async function carregarAvisosMobile() {
  const el  = document.getElementById('m-lista-avisos');
  const cnt = document.getElementById('m-rep-pend');
  if (!el) return;
  try {
    const filtro = document.getElementById('m-filtro-rep-status')?.value || '';
    const url = `${API}/repositor/avisos${filtro?'?status='+filtro:''}`;
    const res = await fetch(url, { credentials:'include' });
    const avisos = res.ok ? await res.json() : [];
    const pend = avisos.filter(a => ['pendente','verificando','buscado','aguardando_abastecer'].includes(a.situacao||a.status)).length;
    if (cnt) cnt.textContent = pend;

    if (!avisos.length) {
      el.innerHTML = `<div style="text-align:center;padding:60px 16px">
        <div style="font-size:48px;margin-bottom:12px">✅</div>
        <div style="color:var(--text3);font-size:15px;font-weight:500">Nenhum item em falta</div>
      </div>`;
      return;
    }

    el.innerHTML = avisos.map(a => renderCardMobile(a)).join('');
  } catch(e) {
    el.innerHTML = `<div style="color:#ef4444;text-align:center;padding:24px">Erro ao carregar</div>`;
  }
}

function renderCardMobile(a) {
  const sit = a.situacao || a.status || 'pendente';
  const cor = corSituacao(sit);
  const lbl = labelSituacao(sit);
  const nomeLogado = usuarioAtual?.nome || '';
  const jaTemPegou   = !!a.quem_pegou;
  const jaTemGuardou = !!a.quem_guardou;

  // Botões de ação baseados na etapa atual
  let botoesEtapa = '';

  if (sit === 'pendente' || sit === 'verificando') {
    // ETAPA 2: Repositor vai buscar
    botoesEtapa = `
      <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:14px">
        <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:8px;letter-spacing:.5px">O QUE VOCÊ FEZ?</div>
        <div style="margin-bottom:10px">
          <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:4px">QUANTIDADE ENCONTRADA</label>
          <input type="number" id="qtd-${a.id}" min="0" max="${a.quantidade||99}" value="${a.qtd_encontrada||0}"
            style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:16px;box-sizing:border-box">
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button onclick="acaoRepositor(${a.id},'busquei_e_abasteci','${nomeLogado}')"
            style="width:100%;padding:12px;background:#10b981;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:.3px">
            ✅ BUSQUEI E ABASTECI
          </button>
          <button onclick="acaoRepositor(${a.id},'so_busquei','${nomeLogado}')"
            style="width:100%;padding:12px;background:#3b82f6;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:.3px">
            📦 SÓ BUSQUEI — outro vai guardar
          </button>
          <button onclick="acaoRepositor(${a.id},'nao_encontrei','${nomeLogado}')"
            style="width:100%;padding:12px;background:transparent;color:#ef4444;border:1.5px solid #ef4444;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer">
            ❌ NÃO ENCONTREI
          </button>
        </div>
      </div>`;
  } else if (sit === 'buscado' || sit === 'aguardando_abastecer') {
    // ETAPA 3: Repositor vai abastecer
    botoesEtapa = `
      <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:14px">
        <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:8px;letter-spacing:.5px">
          📦 Buscado por: <span style="color:var(--text)">${a.quem_pegou||'—'}</span>
        </div>
        <button onclick="acaoRepositor(${a.id},'abasteci','${nomeLogado}')"
          style="width:100%;padding:12px;background:#10b981;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:.3px">
          ✅ ABASTECI O PRODUTO
        </button>
      </div>`;
  } else if (sit === 'abastecido') {
    botoesEtapa = `
      <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px;font-size:12px;color:var(--text3)">
        📦 Pegou: <strong>${a.quem_pegou||'—'}</strong> &nbsp;·&nbsp; 🏠 Guardou: <strong>${a.quem_guardou||'—'}</strong>
      </div>`;
  }

  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-left:4px solid ${cor};border-radius:14px;padding:16px;margin-bottom:14px">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <div>
          <div style="font-weight:700;font-size:16px;color:var(--text)">${a.codigo||'—'}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px;line-height:1.4">${a.descricao||''}</div>
        </div>
        <span style="font-size:11px;font-weight:700;color:${cor};background:${cor}18;padding:4px 10px;border-radius:20px;white-space:nowrap;margin-left:8px">${lbl}</span>
      </div>
      <!-- Infos -->
      <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12px;margin-bottom:4px">
        <span style="color:var(--text3)">📦 Separador</span>
        <span style="color:var(--text);font-weight:500">${a.separador_nome||'—'}</span>
        ${a.forma_envio ? `<span style="color:var(--text3)">🚚 Envio</span><span style="color:var(--text)">${a.forma_envio}</span>` : ''}
        <span style="color:var(--text3)">📍 Endereço</span>
        <span style="color:var(--text)">${a.endereco||'—'}</span>
        <span style="color:var(--text3)">📦 Qtd falta</span>
        <span style="color:#ef4444;font-weight:700">${a.quantidade||0} un</span>
        <span style="color:var(--text3)">🕐 Horário</span>
        <span style="color:var(--text)">${a.hora_aviso||'—'}</span>
      </div>
      ${a.obs ? `<div style="font-size:11px;color:var(--text3);background:var(--surface2);border-radius:6px;padding:6px 8px;margin-top:6px">💬 ${a.obs}</div>` : ''}
      <!-- Botões de ação -->
      ${botoesEtapa}
    </div>`;
}

async function acaoRepositor(id, acao, nomeLogado) {
  const qtdInput = document.getElementById(`qtd-${id}`);
  const qtd = qtdInput ? parseInt(qtdInput.value) || 0 : 0;

  let body = {};
  if (acao === 'busquei_e_abasteci') {
    body = { situacao:'abastecido', status:'abastecido', quem_pegou: nomeLogado, quem_guardou: nomeLogado, qtd_encontrada: qtd };
  } else if (acao === 'so_busquei') {
    body = { situacao:'aguardando_abastecer', status:'aguardando_abastecer', quem_pegou: nomeLogado, qtd_encontrada: qtd };
  } else if (acao === 'nao_encontrei') {
    body = { situacao:'nao_encontrado', status:'nao_encontrado', quem_pegou: nomeLogado, qtd_encontrada: 0 };
  } else if (acao === 'abasteci') {
    body = { situacao:'abastecido', status:'abastecido', quem_guardou: nomeLogado };
  }

  try {
    const res = await fetch(`${API}/repositor/avisos/${id}`, {
      credentials:'include', method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    if (res.ok) {
      toast(acao === 'nao_encontrei' ? 'Registrado!' : 'Salvo!', 'success');
      await carregarAvisosMobile();
    } else { toast('Erro ao salvar', 'danger'); }
  } catch(e) { toast('Sem conexão', 'danger'); }
}

async function carregarStatsRepMobile() {
  const el = document.getElementById('rep-stats-content');
  if (!el) return;
  try {
    const res = await fetch(`${API}/estatisticas/repositor`, { credentials:'include' });
    const data = res.ok ? await res.json() : {};
    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:4px 0">
        ${[
          ['✅','#10b981','Abastecidos hoje', data.reposto_hoje||0],
          ['❌','#ef4444','Não encontrados',  data.nao_encontrado_hoje||0],
          ['📦','#3b82f6','Este mês',         data.reposto_mes||0],
          ['📅','#f59e0b','Este ano',          data.reposto_ano||0],
        ].map(([ico,cor,lbl,val]) => `
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center">
            <div style="font-size:28px;margin-bottom:4px">${ico}</div>
            <div style="font-size:28px;font-weight:700;color:${cor}">${val}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:4px">${lbl}</div>
          </div>`).join('')}
      </div>`;
  } catch(e) {}
}

/* ══════════════════════════════════════════════════════════════════
   DESKTOP — TABELA DE REPOSIÇÃO
══════════════════════════════════════════════════════════════════ */

function atualizarUltimaAtualizacaoRep() {
  const el = document.getElementById('rep-ultima-atualizacao');
  if (!el) return;
  const agora = new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'});
  el.textContent = `— atualizado ${agora}`;
}

async function carregarReposicaoDesktop() {
  await carregarUsuariosParaRep();
  await carregarTabelaReposicao();
}

async function carregarAvisos() {
  await carregarReposicaoDesktop();
}

function verificarDuplicatas() {}

async function carregarTabelaReposicao() {
  const tbody   = document.getElementById('tbody-reposicao');
  const totalEl = document.getElementById('rep-total');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text3)">⏳ Carregando...</td></tr>`;
  try {
    const ini    = document.getElementById('rep-filtro-ini')?.value || '';
    const fim    = document.getElementById('rep-filtro-fim')?.value || '';
    const codigo = document.getElementById('rep-filtro-codigo')?.value || '';
    const params = new URLSearchParams();
    if (_filtroSituacaoRep) params.set('status', _filtroSituacaoRep);
    if (ini) params.set('data_ini', ini);
    if (fim) params.set('data_fim', fim);
    if (codigo) params.set('codigo', codigo);
    const url = `${API}/repositor/avisos${params.toString()?'?'+params.toString():''}`;
    const res = await fetch(url, { credentials:'include' });
    const avisos = res.ok ? await res.json() : [];
    if (totalEl) totalEl.textContent = avisos.length;

    if (!avisos.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:48px;color:var(--text3)">
        <div style="font-size:32px;margin-bottom:8px">✅</div>Nenhum item</td></tr>`;
      return;
    }

    atualizarUltimaAtualizacaoRep();
    tbody.innerHTML = avisos.map(a => {
      const sit = a.situacao || a.status || 'pendente';
      const cor = corSituacao(sit);
      const lbl = labelSituacao(sit);
      return `<tr id="rep-row-${a.id}" style="border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
        <td style="padding:10px 12px;min-width:140px">
          <div style="font-weight:700;font-size:13px;color:var(--text)">${a.codigo||'—'}</div>
          ${a.descricao?`<div style="font-size:11px;color:var(--text3);margin-top:2px;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.descricao}</div>`:''}
        </td>
        <td style="padding:10px 12px;font-size:12px;white-space:nowrap">
          ${a.forma_envio && a.forma_envio.toUpperCase().includes('DRIVE')
            ? `<span style="background:#ef444418;color:#ef4444;font-weight:700;font-size:11px;padding:2px 8px;border-radius:20px">🚗 ${a.forma_envio}</span>`
            : `<span style="color:var(--text2)">${a.forma_envio||'—'}</span>`}
        </td>
        <td style="padding:10px 12px;font-size:12px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.separador_nome||'—'}</td>
        <td style="padding:10px 12px;font-size:12px;color:var(--text2)">${a.quem_pegou||'—'}</td>
        <td style="padding:10px 12px;font-size:12px;color:var(--text2)">${a.quem_guardou||'—'}</td>
        <td style="padding:8px 10px;min-width:160px">
          <select onchange="salvarCampoAviso(${a.id},'situacao',this.value)"
            style="width:100%;font-size:12px;padding:5px 8px;border:1px solid ${cor};border-radius:6px;background:var(--surface);color:${cor};font-weight:600">
            ${['pendente','verificando','buscado','aguardando_abastecer','abastecido','protocolo','nao_encontrado']
              .map(s=>`<option value="${s}" ${s===sit?'selected':''}>${labelSituacao(s)}</option>`).join('')}
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
    tbody.innerHTML = `<tr><td colspan="8" style="color:#ef4444;padding:24px">Erro: ${e.message}</td></tr>`;
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
      if (campo === 'situacao') {
        const row = document.getElementById(`rep-row-${id}`);
        if (row) {
          const sel = row.querySelectorAll('select')[2];
          const cor = corSituacao(valor);
          if (sel) { sel.style.color = cor; sel.style.borderColor = cor; }
        }
      }
    } else { toast('Erro ao salvar', 'danger'); }
  } catch(e) { toast('Sem conexão', 'danger'); }
}

function filtrarReposicao(situacao) {
  _filtroSituacaoRep = situacao;
  document.querySelectorAll('.rep-filtro-btn').forEach(btn => {
    const active = btn.dataset.sit === situacao;
    btn.style.background   = active ? 'var(--accent)' : 'transparent';
    btn.style.color        = active ? '#fff' : 'var(--text2)';
    btn.style.borderColor  = active ? 'var(--accent)' : 'var(--border)';
    btn.style.fontWeight   = active ? '700' : '500';
  });
  carregarTabelaReposicao();
}

function mudarAbaRep(aba) {
  ['avisos','stats','ranking'].forEach(t => {
    const el  = document.getElementById(`rep-aba-${t}`);
    const btn = document.getElementById(`rep-ababtn-${t}`);
    if (el)  el.style.display    = t===aba ? 'block' : 'none';
    if (btn) {
      btn.style.borderBottom = t===aba ? '2px solid var(--accent)' : '2px solid transparent';
      btn.style.color        = t===aba ? 'var(--accent)' : 'var(--text3)';
    }
  });
  if (aba==='avisos')  carregarTabelaReposicao();
  if (aba==='stats')   carregarEstatisticasRep();
  if (aba==='ranking') carregarRankingProdutos();
}

/* ── Indicadores ────────────────────────────────────────────────── */
async function carregarEstatisticasRep() {
  const el = document.getElementById('rep-stats-desktop');
  if (!el) return;
  el.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text3)">⏳ Carregando...</div>`;
  try {
    const sIni = document.getElementById('rep-stats-ini')?.value || '';
    const sFim = document.getElementById('rep-stats-fim')?.value || '';
    const sParams = new URLSearchParams();
    if (sIni) sParams.set('data_ini', sIni);
    if (sFim) sParams.set('data_fim', sFim);
    const res = await fetch(`${API}/repositor/avisos${sParams.toString()?'?'+sParams.toString():''}`, { credentials:'include' });
    const avisos = res.ok ? await res.json() : [];
    const stats = {};
    const inc = (nome, campo) => {
      if (!nome) return;
      if (!stats[nome]) stats[nome] = {pegou:0,guardou:0,abastecido:0,nao_enc:0};
      stats[nome][campo]++;
    };
    avisos.forEach(a => {
      const sit = a.situacao || a.status;
      inc(a.quem_pegou,   'pegou');
      inc(a.quem_guardou, 'guardou');
      if (sit==='abastecido')     inc(a.quem_guardou||a.quem_pegou, 'abastecido');
      if (sit==='nao_encontrado') inc(a.quem_pegou, 'nao_enc');
    });
    const rows = Object.entries(stats).sort((a,b)=>(b[1].pegou+b[1].guardou)-(a[1].pegou+a[1].guardou));
    if (!rows.length) {
      el.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text3)">
        Nenhum dado ainda. Registre as ações no mobile.</div>`;
      return;
    }
    el.innerHTML = `
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--surface2)">
            <th style="padding:12px 16px;text-align:left;font-size:11px;color:var(--text3)">COLABORADOR</th>
            <th style="padding:12px 16px;text-align:center;font-size:11px;color:var(--text3)">PEGOU</th>
            <th style="padding:12px 16px;text-align:center;font-size:11px;color:var(--text3)">GUARDOU</th>
            <th style="padding:12px 16px;text-align:center;font-size:11px;color:var(--text3)">ABASTECIDOS</th>
            <th style="padding:12px 16px;text-align:center;font-size:11px;color:var(--text3)">NÃO ENC.</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(([nome,s]) => `
            <tr style="border-bottom:1px solid var(--border)">
              <td style="padding:12px 16px">
                <div style="display:flex;align-items:center;gap:10px">
                  <div style="width:34px;height:34px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700;flex-shrink:0">${nome.charAt(0).toUpperCase()}</div>
                  <span style="font-size:13px;font-weight:600">${nome}</span>
                </div>
              </td>
              <td style="text-align:center;font-size:15px;font-weight:700;color:var(--accent)">${s.pegou}</td>
              <td style="text-align:center;font-size:15px;font-weight:700;color:#3b82f6">${s.guardou}</td>
              <td style="text-align:center;font-size:15px;font-weight:700;color:#10b981">${s.abastecido}</td>
              <td style="text-align:center;font-size:15px;font-weight:700;color:#ef4444">${s.nao_enc}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch(e) { el.innerHTML = `<div style="color:#ef4444;padding:16px">Erro: ${e.message}</div>`; }
}

async function carregarStatsRepositor() {
  try {
    const res = await fetch(`${API}/estatisticas/repositor`, { credentials:'include' });
    if (!res.ok) return;
    const data = await res.json();
    const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v??0; };
    set('rep-hoje',data.reposto_hoje); set('rep-mes',data.reposto_mes);
    set('rep-ano',data.reposto_ano);   set('rep-nao-enc',data.nao_encontrado_hoje);
  } catch(e) {}
}

/* RANKING DE PRODUTOS */
async function carregarRankingProdutos() {
  const el = document.getElementById('rep-ranking-lista');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text3)">⏳ Carregando...</div>';
  try {
    const ini = document.getElementById('rep-rank-ini')?.value || '';
    const fim = document.getElementById('rep-rank-fim')?.value || '';
    const params = new URLSearchParams();
    if (ini) params.set('data_ini', ini);
    if (fim) params.set('data_fim', fim);
    const res = await fetch(`${API}/repositor/ranking-produtos${params.toString()?'?'+params.toString():''}`, { credentials:'include' });
    const produtos = res.ok ? await res.json() : [];
    if (!produtos.length) {
      el.innerHTML = '<div style="text-align:center;padding:48px;color:var(--text3)">Nenhum dado</div>';
      return;
    }
    const maxTotal = produtos[0]?.total || 1;
    el.innerHTML = `
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--surface2)">
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:var(--text3)">#</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:var(--text3)">CÓDIGO / PRODUTO</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;color:var(--text3)">TOTAL</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;color:var(--text3)">ABASTECIDOS</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;color:var(--text3)">NÃO ENC.</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:var(--text3)">FREQUÊNCIA</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:var(--text3)">ÚLTIMA VEZ</th>
          </tr>
        </thead>
        <tbody>
          ${produtos.map((p,i) => `
            <tr style="border-bottom:1px solid var(--border)" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
              <td style="padding:10px 12px;font-size:13px;font-weight:700;color:var(--text3)">${i+1}</td>
              <td style="padding:10px 12px">
                <div style="font-weight:700;font-size:13px">${p.codigo}</div>
                ${p.descricao?`<div style="font-size:11px;color:var(--text3)">${p.descricao}</div>`:''}
              </td>
              <td style="padding:10px 12px;text-align:center;font-size:15px;font-weight:700;color:#ef4444">${p.total}</td>
              <td style="padding:10px 12px;text-align:center;font-size:14px;font-weight:600;color:#10b981">${p.abastecidos}</td>
              <td style="padding:10px 12px;text-align:center;font-size:14px;font-weight:600;color:#ef4444">${p.nao_encontrados}</td>
              <td style="padding:10px 12px;min-width:120px">
                <div style="background:var(--surface2);border-radius:4px;height:8px;overflow:hidden">
                  <div style="background:#ef4444;height:100%;width:${Math.round((p.total/maxTotal)*100)}%;border-radius:4px"></div>
                </div>
              </td>
              <td style="padding:10px 12px;font-size:12px;color:var(--text3)">${p.ultima_vez||'—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch(e) { el.innerHTML = `<div style="color:#ef4444;padding:16px">Erro: ${e.message}</div>`; }
}

/* ENTRADA MANUAL */
function abrirEntradaManual() {
  const modal = document.getElementById('modal-entrada-manual');
  if (!modal) return;
  // Popula dropdown de repositores
  const sel = document.getElementById('em-repositor');
  if (sel) {
    sel.innerHTML = '<option value="">— Selecionar —</option>' +
      _todosUsuarios.filter(u=>u.status==='ativo').sort((a,b)=>a.nome.localeCompare(b.nome))
        .map(u=>`<option value="${u.nome}">${u.nome}</option>`).join('');
  }
  modal.style.display = 'flex';
}

function fecharEntradaManual() {
  const modal = document.getElementById('modal-entrada-manual');
  if (modal) modal.style.display = 'none';
}

async function salvarEntradaManual() {
  const codigo    = document.getElementById('em-codigo')?.value?.trim();
  const descricao = document.getElementById('em-descricao')?.value?.trim();
  const quantidade= parseInt(document.getElementById('em-quantidade')?.value) || 1;
  const repositor = document.getElementById('em-repositor')?.value;
  const obs       = document.getElementById('em-obs')?.value?.trim();

  if (!codigo) { toast('Informe o código do produto', 'danger'); return; }
  if (!repositor) { toast('Selecione quem guardou', 'danger'); return; }

  try {
    const res = await fetch(`${API}/repositor/entrada-manual`, {
      credentials:'include', method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ codigo, descricao, quantidade, repositor_nome: repositor, quem_guardou: repositor, obs, situacao:'abastecido' })
    });
    if (res.ok) {
      toast('Entrada registrada!', 'success');
      fecharEntradaManual();
      // Limpa campos
      ['em-codigo','em-descricao','em-obs'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
      const q=document.getElementById('em-quantidade'); if(q) q.value='1';
      carregarTabelaReposicao();
    } else {
      const err = await res.json();
      toast(err.erro || 'Erro ao salvar', 'danger');
    }
  } catch(e) { toast('Sem conexão', 'danger'); }
}
