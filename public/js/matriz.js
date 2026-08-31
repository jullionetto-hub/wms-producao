'use strict';

/* ══════════════════════════════════════════
   MATRIZ DE RESPONSABILIDADES — todas as telas do sistema original
══════════════════════════════════════════ */

let _mzTab = 'raci';
let _mzUsandoBanco = true; // rotas já leem/escrevem direto no banco do WMS (não fazem mais proxy pro serviço externo)
let _mzColaboradores = [];
let _mzRaci = [];
let _mzFeedbacks = [];
let _mzClassificacoes = [];
let _mzAusencias = [];
let _mzBancoHoras = [];
let _mzBancoHorasPeriodo = null;
let _mzFerias = [];
let _mzCargos = [];
let _mzIncentivo = null;
let _mzCarreira = null;
let _mzPainelColabId = null;
let _mzCarregado = {
  colaboradores: false, raci: false, feedbacks: false, classificacoes: false,
  ausencias: false, bancoHoras: false, ferias: false, cargos: false, incentivo: false, carreira: false,
};

const MZ_TIER_LABEL = { gerente:'Gerente', coordenador:'Coordenador', supervisor:'Supervisor', analista:'Analista', assistente:'Assistente', auxiliar:'Auxiliar' };
const MZ_STATUS_OPCOES = ['Executa','Garante','Acompanha','Apoia','Sim','Não'];
const MZ_STATUS_COR = { Sim:'#dc2626', Garante:'#7c3aed', Acompanha:'#d97706', Apoia:'#c2703d', Executa:'#16a34a', 'Não':'#6b7280' };
const MZ_STATUS_DESC = {
  Sim: 'É o dono principal da atividade. Faz acontecer e responde primeiro pela entrega.',
  Garante: 'Cobra, verifica e assegura que a atividade seja executada corretamente.',
  Acompanha: 'Tem visibilidade do resultado e evolução, mas não participa necessariamente da rotina.',
  Apoia: 'Contribui com a atividade, mas não é quem decide nem quem responde por ela.',
  Executa: 'Realiza a atividade na prática, no dia a dia.',
  'Não': 'Sem envolvimento nessa atividade.',
};
const MZ_STATUS_ROTULO = { Sim:'Responsável Direto', Garante:'Garante', Acompanha:'Acompanha', Apoia:'Apoia', Executa:'Executa', 'Não':'Não' };

function renderizarPagMatriz() {
  const root = document.getElementById('pag-matriz');
  if (!root) return;
  root.innerHTML = `
<div style="display:flex;flex-direction:column;height:100%;min-height:0">
  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding:16px 24px 12px;border-bottom:1px solid var(--border);flex-shrink:0">
    <div>
      <div style="font-family:'Space Mono',monospace;font-size:17px;font-weight:800;color:var(--text)">Matriz de Responsabilidades</div>
      <div style="font-size:11px;color:var(--text3);margin-top:3px;font-weight:600" id="mz-fonte-label">Carregando origem dos dados...</div>
    </div>
    <button class="btn btn-outline btn-sm" onclick="mzToggleMigracao()">Migração ▾</button>
  </div>
  <div id="mz-painel-migracao" style="display:none;padding:14px 24px;border-bottom:1px solid var(--border);background:var(--surface2);flex-shrink:0">
    <div style="font-size:12px;color:var(--text2);margin-bottom:10px;line-height:1.6">
      Copia tudo do sistema separado (Railway) pra dentro do banco do próprio WMS. Pode rodar quantas vezes quiser — atualiza em vez de duplicar.
      <b>Não apaga nada na origem.</b> Só depois de conferir as contagens abaixo é seguro desligar o Railway da Matriz.
    </div>
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <button class="btn btn-primary btn-sm" onclick="mzRodarMigracao()">Migrar agora</button>
      <button class="btn btn-outline btn-sm" onclick="mzConferirMigracao()">Conferir contagens</button>
    </div>
    <div id="mz-migracao-resultado"></div>
  </div>
  <div style="display:flex;gap:6px;padding:12px 24px 0;border-bottom:1px solid var(--border);flex-shrink:0" id="mz-tabs"></div>
  <div style="flex:1;overflow-y:auto;padding:16px 24px" id="mz-conteudo"></div>
</div>`;
  document.getElementById('mz-fonte-label').textContent = _mzUsandoBanco
    ? 'Dados no banco do próprio WMS'
    : 'Sistema separado — os dados ainda ficam lá, aqui é só a tela';
  _mzRenderTabs();
  mzTrocarTab('raci');
}

function mzToggleMigracao() {
  const el = document.getElementById('mz-painel-migracao');
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function mzRodarMigracao() {
  const out = document.getElementById('mz-migracao-resultado');
  out.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:8px 0">Migrando... pode levar um tempinho.</div>';
  try {
    const r = await _mzFetch('/matriz/migrar', { method:'POST' });
    out.innerHTML = `
      <div style="background:rgba(22,163,74,.12);border-radius:8px;padding:10px 12px;font-size:12px;color:var(--green)">
        Migração concluída! Rode "Conferir contagens" pra validar antes de mexer no Railway.
      </div>
      <pre style="font-size:10.5px;color:var(--text3);margin-top:8px;white-space:pre-wrap;overflow-x:auto">${pfEsc(JSON.stringify(r, null, 2))}</pre>`;
    toast('Migração concluída!','sucesso');
  } catch(e) {
    out.innerHTML = `<div style="background:rgba(220,38,38,.12);border-radius:8px;padding:10px 12px;font-size:12px;color:var(--red)">Erro na migração: ${pfEsc(e.message)}</div>`;
  }
}

async function mzConferirMigracao() {
  const out = document.getElementById('mz-migracao-resultado');
  out.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:8px 0">Conferindo...</div>';
  try {
    const r = await _mzFetch('/matriz/migrar/conferencia');
    const linhas = Object.entries(r).map(([k,v]) => {
      const bate = v.origem === v.wms;
      return `<tr style="border-top:1px solid var(--border)">
        <td style="padding:6px 10px">${pfEsc(k)}</td>
        <td style="padding:6px 10px;text-align:center;font-family:monospace">${v.origem}</td>
        <td style="padding:6px 10px;text-align:center;font-family:monospace">${v.wms}</td>
        <td style="padding:6px 10px;text-align:center;font-weight:800;color:${bate?'var(--green)':'var(--red)'}">${bate?'OK':'DIFERENTE'}</td>
      </tr>`;
    }).join('');
    const tudoOk = Object.values(r).every(v => v.origem === v.wms);
    out.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-top:4px">
        <thead><tr style="background:var(--surface)"><th style="padding:6px 10px;text-align:left;font-size:9px;color:var(--text3)">TABELA</th><th style="padding:6px 10px;font-size:9px;color:var(--text3)">ORIGEM</th><th style="padding:6px 10px;font-size:9px;color:var(--text3)">WMS</th><th style="padding:6px 10px;font-size:9px;color:var(--text3)">STATUS</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <div style="margin-top:10px;font-size:12px;font-weight:700;color:${tudoOk?'var(--green)':'var(--red)'}">
        ${tudoOk ? 'Tudo bateu — migração está completa.' : 'Tem diferença — roda "Migrar agora" de novo antes de considerar desligar o Railway.'}
      </div>`;
  } catch(e) {
    out.innerHTML = `<div style="background:rgba(220,38,38,.12);border-radius:8px;padding:10px 12px;font-size:12px;color:var(--red)">Erro: ${pfEsc(e.message)}</div>`;
  }
}

function _mzRenderTabs() {
  const tabs = [
    ['raci','Responsabilidades'],
    ['cargos','Cargos'],
    ['banco-horas','Banco de Horas'],
    ['ferias','Férias'],
    ['organograma','Organograma'],
    ['classificacoes','Classificação'],
    ['painel','Painel do Colaborador'],
    ['incentivo','Incentivo'],
    ['ausencias','Ausências'],
    ['carreira','Plano de Carreira'],
  ];
  document.getElementById('mz-tabs').innerHTML = `<div style="display:flex;gap:4px;flex-wrap:wrap;padding-bottom:8px">` + tabs.map(([id,label]) => `
    <button onclick="mzTrocarTab('${id}')"
      style="padding:7px 13px;background:${_mzTab===id?'var(--accent)':'var(--surface2)'};border:none;border-radius:20px;color:${_mzTab===id?'#fff':'var(--text2)'};font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap">
      ${label}
    </button>`).join('') + `</div>`;
}

const MZ_LOADERS = {
  raci:           { deps:['colaboradores','raci'],                   render:'_mzRenderRaci' },
  classificacoes: { deps:['colaboradores','classificacoes'],          render:'_mzRenderClassificacoes' },
  ausencias:      { deps:['colaboradores','ausencias'],                render:'_mzRenderAusencias' },
  'banco-horas':  { deps:['colaboradores','bancoHoras'],               render:'_mzRenderBancoHoras' },
  ferias:         { deps:['colaboradores','ferias'],                   render:'_mzRenderFerias' },
  cargos:         { deps:['cargos'],                                   render:'_mzRenderCargos' },
  incentivo:      { deps:['colaboradores','classificacoes','incentivo'], render:'_mzRenderIncentivo' },
  carreira:       { deps:['carreira','cargos'],                        render:'_mzRenderCarreira' },
  organograma:    { deps:['colaboradores'],                            render:'_mzRenderOrganograma' },
  painel:         { deps:['colaboradores','feedbacks','classificacoes','ausencias','bancoHoras','ferias','raci','cargos','carreira'], render:'_mzRenderPainel' },
};
const MZ_CARREGAR_FN = {
  colaboradores: mzCarregarColaboradoresRef, raci: () => mzCarregarRaci(), feedbacks: () => mzCarregarFeedbacks(),
  classificacoes: () => mzCarregarClassificacoes(), ausencias: () => mzCarregarAusencias(),
  bancoHoras: () => mzCarregarBancoHoras(), ferias: () => mzCarregarFerias(), cargos: () => mzCarregarCargos(),
  incentivo: () => mzCarregarIncentivo(), carreira: () => mzCarregarCarreira(),
};
function mzCarregarColaboradoresRef() { return mzCarregarColaboradores(); }

async function mzTrocarTab(tab) {
  _mzTab = tab;
  _mzRenderTabs();
  const cont = document.getElementById('mz-conteudo');
  cont.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:20px;text-align:center">Carregando...</div>';
  try {
    const cfg = MZ_LOADERS[tab];
    if (!cfg) { cont.innerHTML = ''; return; }
    const faltando = cfg.deps.filter(d => !_mzCarregado[d]);
    if (faltando.length) await Promise.all(faltando.map(d => MZ_CARREGAR_FN[d]()));
    window[cfg.render]();
  } catch(e) {
    cont.innerHTML = `<div style="color:var(--red);font-size:12px;padding:20px;text-align:center">Erro ao carregar: ${pfEsc(e.message||'')}</div>`;
  }
}

async function _mzFetch(path, opts) {
  const res = await fetch(`${API}${path}`, { credentials:'include', ...opts });
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(dados.erro || `Erro ${res.status}`);
  return dados;
}

function _mzColNome(id) { return _mzColaboradores.find(c => c.id === id)?.nome || `#${id}`; }

/* ── Colaboradores ── */
async function mzCarregarColaboradores() {
  _mzColaboradores = await _mzFetch('/matriz/colaboradores');
  _mzCarregado.colaboradores = true;
}

function mzAbrirColaborador(id, turnoDefault) {
  const c = id ? _mzColaboradores.find(x => x.id === id) : null;
  const editando = !!c;
  const turnoAtual = editando ? c.turno : (turnoDefault || '');
  const modal = document.createElement('div');
  modal.id = 'mz-modal-colab';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:22px;max-width:440px;width:100%">
      <div style="font-weight:900;font-size:15px;margin-bottom:14px">${editando?'Editar':'Novo'} colaborador</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">NOME</label>
          <input id="mzc-nome" value="${editando?pfEsc(c.nome):''}" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
        <div style="display:flex;gap:10px">
          <div style="flex:1"><label style="font-size:10px;font-weight:700;color:var(--text3)">CARGO</label>
            <input id="mzc-cargo" value="${editando?pfEsc(c.cargo||''):''}" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
          <div style="width:140px"><label style="font-size:10px;font-weight:700;color:var(--text3)">NÍVEL</label>
            <select id="mzc-tier" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px">
              ${Object.entries(MZ_TIER_LABEL).map(([v,l])=>`<option value="${v}" ${editando&&c.tier===v?'selected':''}>${l}</option>`).join('')}
            </select></div>
        </div>
        <div style="display:flex;gap:10px">
          <div style="flex:1"><label style="font-size:10px;font-weight:700;color:var(--text3)">ÁREA</label>
            <input id="mzc-area" value="${editando?pfEsc(c.area||''):''}" placeholder="Separação, Checkout..." style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
          <div style="width:140px"><label style="font-size:10px;font-weight:700;color:var(--text3)">TURNO</label>
            <select id="mzc-turno" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px">
              <option value="">—</option>
              <option value="1° Turno" ${turnoAtual==='1° Turno'?'selected':''}>1° Turno</option>
              <option value="2° Turno" ${turnoAtual==='2° Turno'?'selected':''}>2° Turno</option>
              <option value="3° Turno" ${turnoAtual==='3° Turno'?'selected':''}>3° Turno</option>
            </select></div>
        </div>
        <div style="display:flex;gap:16px;margin-top:2px">
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer"><input type="checkbox" id="mzc-ativo" ${!editando||c.ativo?'checked':''}> Ativo</label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer"><input type="checkbox" id="mzc-vaga" ${editando&&c.vaga?'checked':''}> Vaga em aberto</label>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:18px">
        <button class="btn btn-outline" style="flex:1" onclick="document.getElementById('mz-modal-colab').remove()">Cancelar</button>
        <button class="btn btn-primary" style="flex:1" onclick="mzSalvarColaborador(${editando?c.id:'null'})">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function mzSalvarColaborador(id) {
  const body = {
    nome: document.getElementById('mzc-nome').value.trim(),
    cargo: document.getElementById('mzc-cargo').value.trim(),
    tier: document.getElementById('mzc-tier').value,
    area: document.getElementById('mzc-area').value.trim(),
    turno: document.getElementById('mzc-turno').value || null,
    ativo: document.getElementById('mzc-ativo').checked,
    vaga: document.getElementById('mzc-vaga').checked,
  };
  if (!body.nome) { toast('Informe o nome.','aviso'); return; }
  try {
    if (id) await _mzFetch(`/matriz/colaboradores/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    else    await _mzFetch('/matriz/colaboradores', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    document.getElementById('mz-modal-colab')?.remove();
    toast('Salvo!','sucesso');
    _mzCarregado.colaboradores = false;
    await mzCarregarColaboradores();
    _mzRenderOrganograma();
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
}

function mzExcluirColaborador(id) {
  const nome = _mzColNome(id);
  wmsConfirm({
    titulo: `Excluir "${nome}"?`,
    sub: 'Remove o colaborador e todos os registros ligados a ele na Matriz (feedbacks, ausências, etc). Ação permanente.',
    btnOk: 'Excluir', btnOkClass: 'btn-danger',
  }, async () => {
    try {
      await _mzFetch(`/matriz/colaboradores/${id}`, { method:'DELETE' });
      toast('Excluído!','sucesso');
      _mzCarregado.colaboradores = false;
      await mzCarregarColaboradores();
      _mzRenderOrganograma();
    } catch(e) { toast('Erro: ' + e.message, 'erro'); }
  });
}

/* ── Grade RACI ── */
async function mzCarregarRaci() {
  _mzRaci = await _mzFetch('/matriz/raci');
  _mzCarregado.raci = true;
}

function _mzStatusByRole(atividade) {
  const m = {};
  (atividade.status||[]).forEach(s => { m[s.role_id] = s.status; });
  return m;
}
function _mzContarResponsaveisPorPapel(area, atividades) {
  return area.roles.map(role => atividades.filter(a => _mzStatusByRole(a)[role.id]==='Sim').length);
}
function _mzBreakdownLabel(area, counts) {
  return area.roles.map((r,i) => `${(r.nome[0]||'?')}:${counts[i]}`).join(' · ');
}

let _mzRaciAreaId = null;
let _mzRaciCategoriaFiltro = 'Todas';
let _mzRaciPapeisAberto = false;
let _mzRaciEscalonamentoAberto = false;
let _mzRaciEstruturaAberto = false;

function _mzColapsavel(varName, aberto, titulo, corpo) {
  return `
    <div class="card" style="margin-bottom:10px;padding:0;overflow:hidden">
      <div onclick="${varName}=!${varName};_mzRenderRaci()" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;cursor:pointer">
        <div style="font-weight:800;font-size:12.5px">${titulo}</div>
        <span style="font-size:11px;color:var(--text3)">${aberto?'▲':'▾'}</span>
      </div>
      ${aberto ? `<div style="padding:0 16px 16px">${corpo}</div>` : ''}
    </div>`;
}

function _mzRenderRaci() {
  const cont = document.getElementById('mz-conteudo');
  if (!_mzRaci.length) {
    cont.innerHTML = `<div class="card" style="text-align:center;color:var(--text3);padding:30px">Nenhuma área cadastrada na Matriz ainda.</div>`;
    return;
  }
  if (!_mzRaciAreaId || !_mzRaci.find(a=>a.id===_mzRaciAreaId)) _mzRaciAreaId = _mzRaci[0].id;
  const area = _mzRaci.find(a => a.id === _mzRaciAreaId);
  const podeEditar = usuarioAtual?.perfil === 'gestor';

  const categorias = [...new Set(area.atividades.map(a=>a.categoria).filter(Boolean))];
  let categoriaCardsHtml = '';
  let categoriasVisiveis = null;
  if (categorias.length) {
    const cards = [
      { nome:'Todas', count: area.atividades.length, counts: _mzContarResponsaveisPorPapel(area, area.atividades) },
      ...categorias.map(nome => {
        const rows = area.atividades.filter(a=>a.categoria===nome);
        return { nome, count: rows.length, counts: _mzContarResponsaveisPorPapel(area, rows) };
      }),
    ];
    categoriaCardsHtml = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:14px">
      ${cards.map(c => `<div onclick="_mzRaciCategoriaFiltro='${c.nome.replace(/'/g,"\\'")}';_mzRenderRaci()" style="cursor:pointer;background:${c.nome===_mzRaciCategoriaFiltro?'var(--accent)':'var(--surface2)'};border-radius:10px;padding:10px 12px">
        <div style="font-size:11px;font-weight:700;color:${c.nome===_mzRaciCategoriaFiltro?'#fff':'var(--text)'}">${pfEsc(c.nome)}</div>
        <div style="font-size:18px;font-weight:800;color:${c.nome===_mzRaciCategoriaFiltro?'#fff':'var(--text)'};margin-top:2px">${c.count}<span style="font-size:10px;font-weight:600"> ativ.</span></div>
        <div style="font-size:9.5px;color:${c.nome===_mzRaciCategoriaFiltro?'rgba(255,255,255,.8)':'var(--text3)'};margin-top:2px">${_mzBreakdownLabel(area,c.counts)}</div>
      </div>`).join('')}
    </div>`;
    categoriasVisiveis = (_mzRaciCategoriaFiltro==='Todas' ? categorias : categorias.filter(c=>c===_mzRaciCategoriaFiltro))
      .map(nome => ({ nome, rows: area.atividades.filter(a=>a.categoria===nome) }));
  }

  const legendHtml = `<div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:14px;font-size:11px;color:var(--text2)">
    ${MZ_STATUS_OPCOES.concat(['Sim']).filter((v,i,arr)=>arr.indexOf(v)===i).map(st => `<div style="display:flex;align-items:center;gap:5px"><span style="width:9px;height:9px;border-radius:50%;background:${MZ_STATUS_COR[st]};display:inline-block"></span>${st==='Sim'?'Responsável':pfEsc(st)} — ${MZ_STATUS_DESC[st]}</div>`).join('')}
  </div>`;

  const papeisHtml = _mzColapsavel('_mzRaciPapeisAberto', _mzRaciPapeisAberto, 'Definição dos Papéis', `
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:var(--surface2)"><th style="padding:6px 10px;text-align:left;font-size:10px;color:var(--text3)">PAPEL</th><th style="padding:6px 10px;text-align:left;font-size:10px;color:var(--text3)">SIGNIFICADO</th></tr></thead>
      <tbody>${['Sim','Garante','Acompanha','Apoia','Executa','Não'].map(st => `<tr style="border-top:1px solid var(--border)"><td style="padding:6px 10px"><span style="width:9px;height:9px;border-radius:50%;background:${MZ_STATUS_COR[st]};display:inline-block;margin-right:6px"></span>${MZ_STATUS_ROTULO[st]}</td><td style="padding:6px 10px;color:var(--text2)">${MZ_STATUS_DESC[st]}</td></tr>`).join('')}</tbody>
    </table>`);

  const escalonamentoHtml = _mzColapsavel('_mzRaciEscalonamentoAberto', _mzRaciEscalonamentoAberto, 'Regra de Escalonamento', `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:14px">
      <div style="background:rgba(37,99,235,.1);border-radius:8px;padding:10px 12px"><div style="font-size:11.5px;color:var(--text2)">Aconteceu hoje</div><div style="font-weight:800;font-size:12.5px;margin-top:4px">→ Analista resolve</div></div>
      <div style="background:rgba(124,58,237,.1);border-radius:8px;padding:10px 12px"><div style="font-size:11.5px;color:var(--text2)">Está acontecendo repetidamente</div><div style="font-weight:800;font-size:12.5px;margin-top:4px">→ Coordenador resolve</div></div>
      <div style="background:rgba(220,38,38,.1);border-radius:8px;padding:10px 12px"><div style="font-size:11.5px;color:var(--text2)">Exige mudança estrutural, capacidade, investimento ou pessoas</div><div style="font-weight:800;font-size:12.5px;margin-top:4px">→ Gerente resolve</div></div>
    </div>
    <div style="font-weight:800;font-size:12px;margin-bottom:8px">Segunda regra</div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11.5px;font-weight:700">
      <span style="background:rgba(37,99,235,.15);padding:6px 12px;border-radius:20px">Analista executa</span> →
      <span style="background:rgba(124,58,237,.15);padding:6px 12px;border-radius:20px">Coordenador garante</span> →
      <span style="background:rgba(220,38,38,.15);padding:6px 12px;border-radius:20px">Gerente acompanha o resultado</span>
    </div>`);

  const estruturaHtml = _mzColapsavel('_mzRaciEstruturaAberto', _mzRaciEstruturaAberto, 'O Desenho da Estrutura', `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:14px">
      <div style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-weight:800;font-size:12.5px">Gerente</div><div style="font-size:11px;color:var(--text3);font-style:italic;margin-top:2px">Faz a operação evoluir.</div><div style="font-size:11.5px;color:var(--text2);margin-top:6px">Não fica presa ao que está acontecendo na colmeia às 14h. Está olhando capacidade, produtividade, estrutura, custo, indicadores, liderança e próximos passos.</div></div>
      <div style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-weight:800;font-size:12.5px">Coordenador</div><div style="font-size:11px;color:var(--text3);font-style:italic;margin-top:2px">Faz a operação funcionar.</div><div style="font-size:11.5px;color:var(--text2);margin-top:6px">É o principal responsável por processos, rotina, produtividade, equipe e funcionamento dos três turnos.</div></div>
      <div style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-weight:800;font-size:12.5px">Analista do Turno</div><div style="font-size:11px;color:var(--text3);font-style:italic;margin-top:2px">Faz o turno acontecer.</div><div style="font-size:11.5px;color:var(--text2);margin-top:6px">Executa, acompanha, organiza, orienta, identifica desvios e resolve o primeiro nível de problemas.</div></div>
    </div>
    <div style="font-weight:800;font-size:12px;margin-bottom:8px">Fluxo de Responsabilidade</div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
      <div style="background:var(--surface2);border-radius:8px;padding:8px 16px;text-align:center"><b style="font-size:12px">Analista</b><div style="font-size:10.5px;color:var(--text3)">Execução do turno</div></div>
      <div style="font-size:14px;color:var(--text3)">↓</div>
      <div style="background:var(--surface2);border-radius:8px;padding:8px 16px;text-align:center"><b style="font-size:12px">Coordenador</b><div style="font-size:10.5px;color:var(--text3)">Garantia da operação</div></div>
      <div style="font-size:14px;color:var(--text3)">↓</div>
      <div style="background:var(--surface2);border-radius:8px;padding:8px 16px;text-align:center"><b style="font-size:12px">Gerente</b><div style="font-size:10.5px;color:var(--text3)">Resultado + estratégia + evolução</div></div>
    </div>`);

  const dot = (atividadeId, roleId, statusAtual) => {
    const cor = MZ_STATUS_COR[statusAtual] || 'var(--text3)';
    if (podeEditar) {
      return `<select onchange="mzDefinirStatus(${atividadeId},${roleId},this.value)" style="padding:3px 6px;border-radius:6px;border:1.5px solid ${cor};background:transparent;color:${cor};font-size:11px;font-weight:700;cursor:pointer">
        <option value="" ${!statusAtual?'selected':''}>—</option>
        ${MZ_STATUS_OPCOES.map(o => `<option value="${o}" ${statusAtual===o?'selected':''}>${o}</option>`).join('')}
      </select>`;
    }
    return `<span style="font-size:10.5px;font-weight:700;color:${cor}">${statusAtual==='Sim'?'Responsável':(statusAtual||'—')}</span>`;
  };

  const colspanTotal = area.roles.length + 3 + (podeEditar?1:0);
  const renderRowsHtml = rows => rows.map(at => {
    const statusByRole = _mzStatusByRole(at);
    const diretos = area.roles.filter(r => statusByRole[r.id]==='Sim').map(r=>r.nome).join(', ') || '—';
    const garantidores = area.roles.filter(r => statusByRole[r.id]==='Garante').map(r=>r.nome).join(', ') || '—';
    return `<tr style="border-top:1px solid var(--border)">
      <td style="padding:6px 10px;font-weight:600">${pfEsc(at.nome)}${at.sugestao?`<span title="${pfEsc(at.sugestao)}" style="margin-left:4px;cursor:help">💡</span>`:''}</td>
      ${area.roles.map(r => `<td style="padding:4px 8px;text-align:center">${dot(at.id, r.id, statusByRole[r.id])}</td>`).join('')}
      <td style="padding:6px 10px;font-size:10.5px;color:var(--text2)">${pfEsc(diretos)}</td>
      <td style="padding:6px 10px;font-size:10.5px;color:var(--text2)">${pfEsc(garantidores)}</td>
      ${podeEditar?`<td style="padding:6px 10px;text-align:right"><button class="btn btn-outline btn-sm" style="padding:2px 8px;font-size:10px;color:var(--red);border-color:var(--red)" onclick="mzExcluirAtividade(${at.id})">excluir</button></td>`:''}
    </tr>`;
  }).join('');

  let tbodyHtml = '';
  let todasAsAtividades = [];
  if (categoriasVisiveis) {
    categoriasVisiveis.forEach(cat => {
      const counts = _mzContarResponsaveisPorPapel(area, cat.rows);
      tbodyHtml += `<tr style="border-top:1.5px solid var(--border);background:var(--surface2)"><td colspan="${colspanTotal}" style="padding:6px 10px;font-weight:800;font-size:11px">${pfEsc(cat.nome)} <span style="font-weight:400;color:var(--text3);font-size:10px">${_mzBreakdownLabel(area,counts)}</span></td></tr>`;
      tbodyHtml += renderRowsHtml(cat.rows);
      todasAsAtividades = todasAsAtividades.concat(cat.rows);
    });
  } else {
    const rows = [...area.atividades].sort((a,b)=>(a.ordem||0)-(b.ordem||0));
    tbodyHtml = renderRowsHtml(rows);
    todasAsAtividades = rows;
  }

  const summaryBar = `<div style="display:grid;grid-template-columns:repeat(${area.roles.length},1fr);gap:8px;padding:12px 16px;border-top:1px solid var(--border)">
    ${area.roles.map(role => {
      const simCount = todasAsAtividades.filter(a => _mzStatusByRole(a)[role.id]==='Sim').length;
      return `<div><div style="font-size:10px;font-weight:800;color:var(--text3)">${pfEsc(role.nome)}</div><div style="font-size:13px;font-weight:800;margin-top:2px">${simCount}<span style="font-size:9.5px;color:var(--text3);font-weight:400"> / ${todasAsAtividades.length} sob resp. direta</span></div></div>`;
    }).join('')}
  </div>`;

  cont.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${_mzRaci.map(a => `<button onclick="_mzRaciAreaId=${a.id};_mzRaciCategoriaFiltro='Todas';_mzRenderRaci()" style="padding:6px 12px;background:${a.id===_mzRaciAreaId?'var(--accent)':'var(--surface2)'};border:none;border-radius:20px;color:${a.id===_mzRaciAreaId?'#fff':'var(--text2)'};font-size:11.5px;font-weight:700;cursor:pointer">${pfEsc(a.nome)}</button>`).join('')}
      </div>
      ${podeEditar?`<button class="btn btn-outline btn-sm" onclick="mzAbrirNovaAreaRaci()">+ Nova área</button>`:''}
    </div>
    ${categoriaCardsHtml}
    ${legendHtml}
    ${papeisHtml}
    ${escalonamentoHtml}
    ${estruturaHtml}
    <div class="card" style="padding:0;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:11.5px;min-width:${300+area.roles.length*110}px">
        <thead><tr style="background:var(--surface2)">
          <th style="padding:6px 10px;text-align:left;font-size:10px;font-weight:800;color:var(--text3);min-width:200px">ATIVIDADE</th>
          ${area.roles.map(r => `<th style="padding:6px 10px;text-align:center;font-size:10px;font-weight:800;color:var(--text3);min-width:110px">${pfEsc(r.nome)}</th>`).join('')}
          <th style="padding:6px 10px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">RESPONSÁVEL DIRETO</th>
          <th style="padding:6px 10px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">GARANTE</th>
          ${podeEditar?'<th style="padding:6px 10px"></th>':''}
        </tr></thead>
        <tbody>${tbodyHtml || `<tr><td colspan="${colspanTotal}" style="text-align:center;color:var(--text3);padding:14px">Sem atividades nessa área</td></tr>`}</tbody>
      </table>
      ${summaryBar}
      ${podeEditar?`<div style="padding:14px 16px"><button class="btn btn-outline btn-sm" onclick="mzAbrirNovaAtividade(${area.id})">+ Nova atividade</button></div>`:''}
    </div>`;
}

async function mzDefinirStatus(atividadeId, roleId, status) {
  try {
    await _mzFetch(`/matriz/raci/atividades/${atividadeId}/status`, {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ role_id: roleId, status }),
    });
    toast('Atualizado!','sucesso');
    _mzCarregado.raci = false;
    await mzCarregarRaci();
    _mzRenderRaci();
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
}

function mzExcluirAtividade(id) {
  wmsConfirm({ titulo:'Excluir esta atividade?', sub:'Ação permanente.', btnOk:'Excluir', btnOkClass:'btn-danger' }, async () => {
    try {
      await _mzFetch(`/matriz/raci/atividades/${id}`, { method:'DELETE' });
      toast('Excluída!','sucesso');
      _mzCarregado.raci = false;
      await mzCarregarRaci();
      _mzRenderRaci();
    } catch(e) { toast('Erro: ' + e.message, 'erro'); }
  });
}

function mzAbrirNovaAreaRaci() {
  const modal = document.createElement('div');
  modal.id = 'mz-modal-novaarea';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:22px;max-width:400px;width:100%">
      <div style="font-weight:900;font-size:15px;margin-bottom:14px">Nova área</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">NOME DA ÁREA</label>
          <input id="mzra-nome" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">PAPÉIS (um por linha, ex: Gerente)</label>
          <textarea id="mzra-roles" style="width:100%;min-height:80px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;resize:vertical;box-sizing:border-box"></textarea></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:18px">
        <button class="btn btn-outline" style="flex:1" onclick="document.getElementById('mz-modal-novaarea').remove()">Cancelar</button>
        <button class="btn btn-primary" style="flex:1" onclick="mzSalvarNovaAreaRaci()">Criar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function mzSalvarNovaAreaRaci() {
  const nome = document.getElementById('mzra-nome').value.trim();
  if (!nome) { toast('Informe o nome da área.','aviso'); return; }
  const roles = document.getElementById('mzra-roles').value.split('\n').map(s=>s.trim()).filter(Boolean);
  try {
    await _mzFetch('/matriz/raci', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ nome, ordem: _mzRaci.length, roles }) });
    document.getElementById('mz-modal-novaarea')?.remove();
    toast('Área criada!','sucesso');
    _mzCarregado.raci = false;
    await mzCarregarRaci();
    _mzRaciAreaId = null;
    _mzRenderRaci();
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
}

function mzAbrirNovaAtividade(areaId) {
  const area = _mzRaci.find(a => a.id === areaId);
  if (!area) return;
  const categoriasExistentes = [...new Set(area.atividades.map(a=>a.categoria).filter(Boolean))];
  const modal = document.createElement('div');
  modal.id = 'mz-modal-novaatividade';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:22px;max-width:460px;width:100%;max-height:90vh;overflow-y:auto">
      <div style="font-weight:900;font-size:15px;margin-bottom:14px">Nova atividade — ${pfEsc(area.nome)}</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">CATEGORIA</label>
          <input id="mzat-categoria" list="mzat-categoria-list" placeholder="ex: Metas e Resultados" value="${_mzRaciCategoriaFiltro!=='Todas'?pfEsc(_mzRaciCategoriaFiltro):''}" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box">
          <datalist id="mzat-categoria-list">${categoriasExistentes.map(c=>`<option value="${pfEsc(c)}">`).join('')}</datalist></div>
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">ATIVIDADE</label>
          <input id="mzat-nome" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">SUGESTÃO (OPCIONAL)</label>
          <textarea id="mzat-sugestao" placeholder="Nota de melhoria futura, mostrada como dica 💡" style="width:100%;min-height:50px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;resize:vertical;box-sizing:border-box"></textarea></div>
        ${area.roles.map(r => `<div><label style="font-size:10px;font-weight:700;color:var(--text3)">${pfEsc(r.nome)}</label>
          <select id="mzat-role-${r.id}" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px">
            <option value="">—</option>
            ${MZ_STATUS_OPCOES.map(o=>`<option value="${o}">${o}</option>`).join('')}
          </select></div>`).join('')}
      </div>
      <div style="display:flex;gap:10px;margin-top:18px">
        <button class="btn btn-outline" style="flex:1" onclick="document.getElementById('mz-modal-novaatividade').remove()">Cancelar</button>
        <button class="btn btn-primary" style="flex:1" onclick="mzSalvarNovaAtividade(${areaId})">Criar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function mzSalvarNovaAtividade(areaId) {
  const nome = document.getElementById('mzat-nome').value.trim();
  if (!nome) { toast('Informe o nome da atividade.','aviso'); return; }
  const area = _mzRaci.find(a => a.id === areaId);
  const status = area.roles.map(r => ({ role_id: r.id, status: document.getElementById(`mzat-role-${r.id}`).value })).filter(s => s.status);
  const body = {
    nome,
    ordem: area.atividades.length,
    categoria: document.getElementById('mzat-categoria').value.trim() || null,
    sugestao: document.getElementById('mzat-sugestao').value.trim() || null,
    status,
  };
  try {
    await _mzFetch(`/matriz/raci/areas/${areaId}/atividades`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    document.getElementById('mz-modal-novaatividade')?.remove();
    toast('Atividade criada!','sucesso');
    _mzCarregado.raci = false;
    await mzCarregarRaci();
    _mzRenderRaci();
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
}

/* ── Feedbacks ── */
async function mzCarregarFeedbacks() {
  _mzFeedbacks = await _mzFetch('/matriz/feedbacks');
  _mzCarregado.feedbacks = true;
}

function mzAbrirFeedback(id) {
  const fb = id ? _mzFeedbacks.find(x => x.id === id) : null;
  const editando = !!fb;
  const col = _mzColaboradores.find(c => c.id === _mzPainelColabId);
  const modal = document.createElement('div');
  modal.id = 'mz-modal-fb';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  const v = k => editando ? (fb[k] ?? '') : '';
  modal.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:22px;max-width:560px;width:100%;max-height:90vh;overflow-y:auto">
      <div style="font-weight:900;font-size:15px;margin-bottom:14px">${editando?'Editar':'Novo'} feedback${col?` — ${pfEsc(col.nome)}`:''}</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;gap:10px">
          <div style="flex:1"><label style="font-size:10px;font-weight:700;color:var(--text3)">MÊS</label>
            <input id="mzf-mes" placeholder="Agosto 2026" value="${pfEsc(v('mes'))}" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
          <div style="flex:1"><label style="font-size:10px;font-weight:700;color:var(--text3)">CARGO</label>
            <input id="mzf-cargo" value="${editando?pfEsc(v('cargo_snapshot')):pfEsc(col?.cargo||'')}" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
          <div style="flex:1"><label style="font-size:10px;font-weight:700;color:var(--text3)">ÁREA</label>
            <input id="mzf-area" value="${editando?pfEsc(v('area_snapshot')):pfEsc(col?.area||'')}" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
        </div>

        <div style="font-size:10px;font-weight:800;color:var(--text3);margin-top:4px">1 — META X ENTREGUE</div>
        <div style="display:flex;gap:10px">
          <input id="mzf-meta" type="number" placeholder="Meta" value="${v('meta')}" style="flex:1;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box">
          <input id="mzf-entregue" type="number" placeholder="Entregue" value="${v('entregue')}" style="flex:1;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box">
        </div>

        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">2 — PONTOS POSITIVOS</label>
          <textarea id="mzf-pos" style="width:100%;min-height:50px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;resize:vertical;box-sizing:border-box">${pfEsc(v('pontos_positivos'))}</textarea></div>
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">3 — PONTOS CONSTRUTIVOS</label>
          <textarea id="mzf-cons" style="width:100%;min-height:50px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;resize:vertical;box-sizing:border-box">${pfEsc(v('pontos_construtivos'))}</textarea></div>

        <div style="font-size:10px;font-weight:800;color:var(--text3);margin-top:4px">4 — ABSENTEÍSMO DO MÊS</div>
        <div style="display:flex;gap:10px">
          <input id="mzf-atrasos" type="number" placeholder="Atrasos (min)" value="${v('atrasos')}" style="flex:1;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box">
          <input id="mzf-faltas" type="number" placeholder="Faltas injust." value="${v('faltas_injustificadas')}" style="flex:1;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box">
          <input id="mzf-ausj" type="number" placeholder="Ausências just." value="${v('ausencias_justificadas')}" style="flex:1;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box">
        </div>
        <textarea id="mzf-absmes" placeholder="Detalhes (datas, minutos, ocorrências)" style="width:100%;min-height:40px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;resize:vertical;box-sizing:border-box">${pfEsc(v('absenteismo_mes'))}</textarea>

        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">5 — RETORNO ANTECIPADO DO ALMOÇO</label>
          <textarea id="mzf-retorno" style="width:100%;min-height:40px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;resize:vertical;box-sizing:border-box">${pfEsc(v('retorno_antecipado'))}</textarea></div>
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">6 — RECORRÊNCIA DE AUSÊNCIA</label>
          <textarea id="mzf-recorrencia" style="width:100%;min-height:40px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;resize:vertical;box-sizing:border-box">${pfEsc(v('recorrencia_ausencia'))}</textarea></div>
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">7 — OUTROS PONTOS</label>
          <textarea id="mzf-outros" style="width:100%;min-height:40px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;resize:vertical;box-sizing:border-box">${pfEsc(v('outros_pontos'))}</textarea></div>
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">8 — SALDO DE BANCO DE HORAS</label>
          <input id="mzf-saldobh" value="${pfEsc(v('saldo_banco_horas'))}" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">9 — COMBINADO DESTE MÊS</label>
          <textarea id="mzf-comb" style="width:100%;min-height:44px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;resize:vertical;box-sizing:border-box">${pfEsc(v('combinado_mes'))}</textarea></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:18px">
        <button class="btn btn-outline" style="flex:1" onclick="document.getElementById('mz-modal-fb').remove()">Cancelar</button>
        <button class="btn btn-primary" style="flex:1" onclick="mzSalvarFeedback(${editando?fb.id:'null'})">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function mzSalvarFeedback(id) {
  if (!_mzPainelColabId) { toast('Selecione o colaborador.','aviso'); return; }
  const num = v => v === '' ? null : parseInt(v);
  const body = {
    colaborador_id: _mzPainelColabId,
    mes: document.getElementById('mzf-mes').value.trim(),
    cargo_snapshot: document.getElementById('mzf-cargo').value.trim(),
    area_snapshot: document.getElementById('mzf-area').value.trim(),
    meta: num(document.getElementById('mzf-meta').value),
    entregue: num(document.getElementById('mzf-entregue').value),
    pontos_positivos: document.getElementById('mzf-pos').value.trim(),
    pontos_construtivos: document.getElementById('mzf-cons').value.trim(),
    atrasos: num(document.getElementById('mzf-atrasos').value),
    faltas_injustificadas: num(document.getElementById('mzf-faltas').value),
    ausencias_justificadas: num(document.getElementById('mzf-ausj').value),
    absenteismo_mes: document.getElementById('mzf-absmes').value.trim(),
    retorno_antecipado: document.getElementById('mzf-retorno').value.trim(),
    recorrencia_ausencia: document.getElementById('mzf-recorrencia').value.trim(),
    outros_pontos: document.getElementById('mzf-outros').value.trim(),
    saldo_banco_horas: document.getElementById('mzf-saldobh').value.trim(),
    combinado_mes: document.getElementById('mzf-comb').value.trim(),
  };
  try {
    if (id) await _mzFetch(`/matriz/feedbacks/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    else    await _mzFetch('/matriz/feedbacks', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    document.getElementById('mz-modal-fb')?.remove();
    toast('Feedback salvo!','sucesso');
    _mzCarregado.feedbacks = false;
    await mzCarregarFeedbacks();
    _mzRenderPainel();
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
}

function mzExcluirFeedback(id) {
  wmsConfirm({ titulo:'Excluir feedback?', sub:'Ação permanente.', btnOk:'Excluir', btnOkClass:'btn-danger' }, async () => {
    try {
      await _mzFetch(`/matriz/feedbacks/${id}`, { method:'DELETE' });
      toast('Excluído!','sucesso');
      _mzCarregado.feedbacks = false;
      await mzCarregarFeedbacks();
      _mzRenderPainel();
    } catch(e) { toast('Erro: ' + e.message, 'erro'); }
  });
}

/* ── Classificações mensais (absenteísmo/performance/comportamento) ── */
const MZ_SEMAFORO = { green:'#16a34a', yellow:'#d97706', red:'#dc2626' };
const MZ_SEMAFORO_CICLO = [null, 'green', 'yellow', 'red'];

async function mzCarregarClassificacoes() {
  _mzClassificacoes = await _mzFetch('/matriz/classificacoes');
  _mzCarregado.classificacoes = true;
}

let _mzClassPeriodo = null;
let _mzClassTurnoFiltro = 'Todos';
let _mzClassAlertaFiltro = 'Todos';
let _mzClassCriteriosAberto = false;
const MZ_CLASS_SCORE = { green:0, yellow:1, red:2 };

function _mzClassPeriodos() { return [...new Set(_mzClassificacoes.map(c => c.periodo_label))]; }

function _mzClassRows(periodo) {
  return [..._mzColaboradores].filter(c=>c.ativo).map(c => {
    const cl = _mzClassificacoes.find(x => x.colaborador_id === c.id && x.periodo_label === periodo);
    return { colaborador_id: c.id, nome: c.nome, turno: c.turno, abs: cl?cl.absenteismo:null, perf: cl?cl.performance:null, comp: cl?cl.comportamento:null };
  });
}
function _mzClassRisco(r) { return (MZ_CLASS_SCORE[r.abs]||0) + (MZ_CLASS_SCORE[r.perf]||0) + (MZ_CLASS_SCORE[r.comp]||0); }

function _mzRenderClassificacoes() {
  const cont = document.getElementById('mz-conteudo');
  const periodos = _mzClassPeriodos();
  if (!_mzClassPeriodo || (periodos.length && !periodos.includes(_mzClassPeriodo))) _mzClassPeriodo = periodos[periodos.length-1] || _mzPeriodoAtualLabel();
  const periodo = _mzClassPeriodo;
  const rows = _mzClassRows(periodo);

  const ruins = rows.filter(r=>_mzClassRisco(r)>=3).length;
  const medianos = rows.filter(r=>{ const s=_mzClassRisco(r); return s>=1 && s<3; }).length;
  const otimos = rows.filter(r=>_mzClassRisco(r)===0).length;

  const dims = [['abs','Absenteísmo'],['perf','Performance'],['comp','Comportamento']];
  const breakdownHtml = dims.map(([key,label]) => {
    const total = rows.length || 1;
    const g = rows.filter(r=>r[key]==='green').length;
    const y = rows.filter(r=>r[key]==='yellow').length;
    const rC = rows.filter(r=>r[key]==='red').length;
    return `<div style="margin-bottom:10px">
      <div style="font-size:11px;font-weight:700;margin-bottom:4px">${label}</div>
      <div style="display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--surface2)">
        <span style="width:${g/total*100}%;background:var(--green)"></span>
        <span style="width:${y/total*100}%;background:var(--amber)"></span>
        <span style="width:${rC/total*100}%;background:var(--red)"></span>
      </div>
      <div style="font-size:10px;color:var(--text3);margin-top:3px">${g} ótimo · ${y} mediano · ${rC} ruim</div>
    </div>`;
  }).join('');

  const turnos = ['Todos', ...new Set(rows.map(r=>r.turno).filter(Boolean))];
  const alertas = ['Todos','Problema','Mediano','Ótimo'];

  let lista = rows;
  if (_mzClassTurnoFiltro!=='Todos') lista = lista.filter(r=>r.turno===_mzClassTurnoFiltro);
  if (_mzClassAlertaFiltro!=='Todos') {
    lista = lista.filter(r => {
      const s = _mzClassRisco(r);
      if (_mzClassAlertaFiltro==='Problema') return s>=3;
      if (_mzClassAlertaFiltro==='Mediano') return s>=1 && s<3;
      return s===0;
    });
  }
  lista = [...lista].sort((a,b)=>_mzClassRisco(b)-_mzClassRisco(a));

  const dot = (colId, campo, valor) => {
    const cor = MZ_SEMAFORO[valor] || 'var(--border)';
    return `<button onclick="mzCicloClassificacao(${colId},'${campo}')" title="Clique pra mudar"
      style="width:22px;height:22px;border-radius:50%;background:${cor};border:2px solid ${valor?cor:'var(--border)'};cursor:pointer"></button>`;
  };

  cont.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${periodos.map(p => `<button onclick="_mzClassPeriodo='${p.replace(/'/g,"\\'")}';_mzRenderClassificacoes()" style="padding:6px 12px;background:${p===periodo?'var(--accent)':'var(--surface2)'};border:none;border-radius:20px;color:${p===periodo?'#fff':'var(--text2)'};font-size:11.5px;font-weight:700;cursor:pointer">${pfEsc(p)}</button>`).join('')}
      </div>
      <button class="btn btn-outline btn-sm" onclick="mzNovoCicloClassificacao()">+ Novo ciclo</button>
    </div>

    <div class="card" style="margin-bottom:14px;padding:0;overflow:hidden">
      <div onclick="_mzClassCriteriosAberto=!_mzClassCriteriosAberto;_mzRenderClassificacoes()" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;cursor:pointer">
        <div style="font-weight:800;font-size:13px">Critérios de Classificação</div>
        <span style="font-size:12px;color:var(--text3)">${_mzClassCriteriosAberto?'▲':'▾'}</span>
      </div>
      ${_mzClassCriteriosAberto ? `<div style="padding:0 16px 16px">${_mzCriteriosClassificacaoHtml()}</div>` : ''}
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px">
      <div class="tile" style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:10px;color:var(--text3)">COLABORADORES</div><div style="font-size:18px;font-weight:800;margin-top:4px">${rows.length}</div></div>
      <div class="tile" style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:10px;color:var(--text3)">PERFIL PROBLEMA</div><div style="font-size:18px;font-weight:800;margin-top:4px;color:var(--red)">${ruins}</div></div>
      <div class="tile" style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:10px;color:var(--text3)">PERFIL MEDIANO</div><div style="font-size:18px;font-weight:800;margin-top:4px;color:var(--amber)">${medianos}</div></div>
      <div class="tile" style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:10px;color:var(--text3)">PERFIL ÓTIMO</div><div style="font-size:18px;font-weight:800;margin-top:4px;color:var(--green)">${otimos}</div></div>
    </div>

    <div class="card" style="margin-bottom:14px">${breakdownHtml}</div>

    <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">
      ${turnos.map(t => `<button onclick="_mzClassTurnoFiltro='${t.replace(/'/g,"\\'")}';_mzRenderClassificacoes()" style="padding:6px 12px;background:${t===_mzClassTurnoFiltro?'var(--accent)':'var(--surface2)'};border:none;border-radius:20px;color:${t===_mzClassTurnoFiltro?'#fff':'var(--text2)'};font-size:11.5px;font-weight:700;cursor:pointer">${pfEsc(t)}</button>`).join('')}
    </div>
    <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">
      ${alertas.map(a => `<button onclick="_mzClassAlertaFiltro='${a}';_mzRenderClassificacoes()" style="padding:6px 12px;background:${a===_mzClassAlertaFiltro?'var(--accent)':'var(--surface2)'};border:none;border-radius:20px;color:${a===_mzClassAlertaFiltro?'#fff':'var(--text2)'};font-size:11.5px;font-weight:700;cursor:pointer">${pfEsc(a)}</button>`).join('')}
    </div>

    <div class="card" style="padding:0;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead><tr style="background:var(--surface2)">
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">COLABORADOR</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">TURNO</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3)">ABSENTEÍSMO</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3)">PERFORMANCE</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3)">COMPORTAMENTO</th>
        </tr></thead>
        <tbody>${lista.map(r => `
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:8px 12px;font-weight:700">${pfEsc(r.nome)}</td>
            <td style="padding:8px 12px;color:var(--text2)">${pfEsc(r.turno||'—')}</td>
            <td style="padding:8px 12px;text-align:center">${dot(r.colaborador_id,'absenteismo',r.abs)}</td>
            <td style="padding:8px 12px;text-align:center">${dot(r.colaborador_id,'performance',r.perf)}</td>
            <td style="padding:8px 12px;text-align:center">${dot(r.colaborador_id,'comportamento',r.comp)} <button class="btn btn-outline btn-sm" style="padding:2px 8px;font-size:10px;margin-left:4px" onclick="mzAbrirComportamento(${r.colaborador_id})">calcular</button></td>
          </tr>`).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:20px">Nenhum colaborador</td></tr>`}
        </tbody>
      </table>
    </div>
    <p style="font-size:11px;color:var(--text3);margin-top:8px">Clique na bolinha pra alternar: sem cor → verde → amarelo → vermelho → sem cor.</p>`;
}

function _mzPeriodoAtualLabel() {
  return new Date().toLocaleDateString('pt-BR', { month:'long', year:'numeric' });
}

function mzNovoCicloClassificacao() {
  const nome = prompt('Nome do novo ciclo (ex: Julho 2026):');
  if (!nome) return;
  _mzClassPeriodo = nome.trim();
  _mzClassTurnoFiltro = 'Todos';
  _mzClassAlertaFiltro = 'Todos';
  _mzRenderClassificacoes();
}

function _mzCriteriosClassificacaoHtml() {
  const col = (titulo, otimo, mediano, ruim) => `
    <div style="flex:1;min-width:200px">
      <div style="font-weight:800;font-size:12px;margin-bottom:8px">${titulo}</div>
      <div style="background:rgba(22,163,74,.1);border-radius:8px;padding:8px 10px;margin-bottom:6px">
        <div style="font-size:11px;font-weight:700;color:var(--green);margin-bottom:3px">🟢 Ótimo</div>
        <ul style="margin:0;padding-left:16px;font-size:11px;color:var(--text2)">${otimo.map(x=>`<li>${x}</li>`).join('')}</ul>
      </div>
      <div style="background:rgba(217,119,6,.1);border-radius:8px;padding:8px 10px;margin-bottom:6px">
        <div style="font-size:11px;font-weight:700;color:var(--amber);margin-bottom:3px">🟡 Mediano</div>
        <ul style="margin:0;padding-left:16px;font-size:11px;color:var(--text2)">${mediano.map(x=>`<li>${x}</li>`).join('')}</ul>
      </div>
      <div style="background:rgba(220,38,38,.1);border-radius:8px;padding:8px 10px">
        <div style="font-size:11px;font-weight:700;color:var(--red);margin-bottom:3px">🔴 Ruim</div>
        <ul style="margin:0;padding-left:16px;font-size:11px;color:var(--text2)">${ruim.map(x=>`<li>${x}</li>`).join('')}</ul>
      </div>
    </div>`;
  return `
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px">
      ${col('Absenteísmo', ['0 atrasos','0 ausência'], ['0 falta injustificada','Máximo 3 atrasos','Até 2 ausências justificadas'], ['Acima de 1 falta injustificada','Acima de 3 atrasos','Padrão repetitivo de ausência'])}
      ${col('Performance', ['Bate meta com frequência (90%)','Entrega volume + qualidade'], ['Entrega parcial (abaixo de 89%)','+2 erros'], ['Não bate meta','Gera retrabalho','Abaixo de 70%'])}
      ${col('Comportamento', ['Assume responsabilidade','Resolve problema','Ajuda o time'], ['Faz o básico','Não atrapalha, mas também não puxa'], ['Reclama','Transfere culpa','Influencia negativamente'])}
    </div>
    <div style="font-weight:800;font-size:12px;margin-bottom:8px">Perfil Geral</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      <div style="flex:1;min-width:180px;background:rgba(22,163,74,.1);border-radius:8px;padding:10px 12px"><div style="font-weight:700;font-size:11.5px;color:var(--green)">🟢 Ótimo <span style="font-weight:400;color:var(--text3)">(reter e desenvolver)</span></div><div style="font-size:11px;color:var(--text2);margin-top:4px">Absenteísmo 🟢 · Performance 🟢 · Comportamento 🟢</div></div>
      <div style="flex:1;min-width:180px;background:rgba(217,119,6,.1);border-radius:8px;padding:10px 12px"><div style="font-weight:700;font-size:11.5px;color:var(--amber)">🟡 Mediano <span style="font-weight:400;color:var(--text3)">(direcionar)</span></div><div style="font-size:11px;color:var(--text2);margin-top:4px">Mistura de 🟢 e 🟡. Precisa de mais cobrança, mais clareza, mais acompanhamento.</div></div>
      <div style="flex:1;min-width:180px;background:rgba(220,38,38,.1);border-radius:8px;padding:10px 12px"><div style="font-weight:700;font-size:11.5px;color:var(--red)">🔴 Problema <span style="font-weight:400;color:var(--text3)">(agir rápido)</span></div><div style="font-size:11px;color:var(--text2);margin-top:4px">Qualquer combinação com 🔴 forte. Ex: falta muito mesmo entregando; entrega pouco mesmo presente; comportamento ruim contamina o time.</div></div>
    </div>
    <div style="font-weight:800;font-size:12px;margin-bottom:8px">Decisão</div>
    <table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:16px">
      <thead><tr style="background:var(--surface2)"><th style="padding:6px 10px;text-align:left;font-size:10px;color:var(--text3)">PERFIL</th><th style="padding:6px 10px;text-align:left;font-size:10px;color:var(--text3)">DECISÃO</th></tr></thead>
      <tbody>
        <tr style="border-top:1px solid var(--border)"><td style="padding:6px 10px">🟢 🟢 🟢</td><td style="padding:6px 10px">Desenvolver / reconhecer</td></tr>
        <tr style="border-top:1px solid var(--border)"><td style="padding:6px 10px">🟢 🟡 🟡</td><td style="padding:6px 10px">Ajustar e acompanhar</td></tr>
        <tr style="border-top:1px solid var(--border)"><td style="padding:6px 10px">🔴 em qualquer</td><td style="padding:6px 10px">Plano imediato ou substituir</td></tr>
      </tbody>
    </table>
    <div style="font-weight:800;font-size:12px;margin-bottom:6px">Regras</div>
    <ol style="margin:0;padding-left:18px;font-size:11.5px;color:var(--text2)">
      <li>Presença vem antes de performance</li>
      <li>Comportamento sustenta resultado</li>
      <li>Não sustentar 🔴</li>
    </ol>`;
}

const MZ_COMPORTAMENTO_ITENS = [
  { key:'assume', label:'Assume responsabilidade', peso:2 },
  { key:'resolve', label:'Resolve problema', peso:3 },
  { key:'ajuda', label:'Ajuda o time', peso:3 },
  { key:'basico', label:'Faz o básico', peso:1 },
  { key:'neutro', label:'Não atrapalha, mas também não puxa', peso:0 },
  { key:'espera', label:'Espera ser cobrado para agir', peso:0 },
  { key:'reclama', label:'Reclama', peso:-2 },
  { key:'culpa', label:'Transfere culpa', peso:-2 },
  { key:'negativo', label:'Influencia negativamente', peso:-3 },
];
function _mzComportamentoScore(freq) {
  return MZ_COMPORTAMENTO_ITENS.reduce((acc,it)=>acc + it.peso*(freq[it.key]||0), 0);
}
function _mzComportamentoClasse(freq) {
  if ((freq.negativo||0) >= 2) return 'red';
  const score = _mzComportamentoScore(freq);
  if (score >= 8) return 'green';
  if (score >= 1) return 'yellow';
  return 'red';
}
function _mzLerFrequenciasComportamento() {
  const freq = {};
  MZ_COMPORTAMENTO_ITENS.forEach(it => { freq[it.key] = parseInt(document.getElementById(`mzcc-${it.key}`)?.value || '0'); });
  return freq;
}

function mzAbrirComportamento(colId) {
  const modal = document.createElement('div');
  modal.id = 'mz-modal-comp';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:22px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto">
      <div style="font-weight:900;font-size:15px;margin-bottom:6px">Calcular Comportamento — ${pfEsc(_mzColNome(colId))}</div>
      <p style="font-size:11.5px;color:var(--text3);margin:0 0 14px">Informe quantas vezes cada comportamento foi observado no período. Ótimo ≥8 pts · Mediano 1–7 pts · Ruim ≤0 pts (ou "influencia negativamente" 2+ vezes, que zera a nota).</p>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${MZ_COMPORTAMENTO_ITENS.map(it => `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
            <label style="font-size:12px">${pfEsc(it.label)} <span style="color:var(--text3);font-size:10.5px">(peso ${it.peso>0?'+':''}${it.peso})</span></label>
            <input id="mzcc-${it.key}" type="number" min="0" value="0" style="width:64px;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:12px;text-align:center">
          </div>`).join('')}
      </div>
      <div id="mzcc-resultado" style="margin-top:14px;padding:10px 12px;border-radius:8px;background:var(--surface);font-size:12.5px">Preencha os campos e clique em "Pré-visualizar".</div>
      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn btn-outline" style="flex:1" onclick="mzPreviewComportamento()">Pré-visualizar</button>
        <button class="btn btn-primary" style="flex:1" onclick="mzSalvarComportamento(${colId})">Salvar</button>
      </div>
      <div style="margin-top:10px;text-align:right">
        <button class="btn btn-outline btn-sm" onclick="document.getElementById('mz-modal-comp').remove()">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function mzPreviewComportamento() {
  const freq = _mzLerFrequenciasComportamento();
  const score = _mzComportamentoScore(freq);
  const classe = _mzComportamentoClasse(freq);
  const label = { green:'🟢 Ótimo', yellow:'🟡 Mediano', red:'🔴 Ruim' }[classe];
  const vetoUsado = (freq.negativo||0) >= 2;
  document.getElementById('mzcc-resultado').innerHTML =
    `Pontuação: <b>${score}</b> → ${label}` +
    (vetoUsado ? `<br><span style="color:var(--red);font-size:11px">Regra de exceção aplicada: "influencia negativamente" observado 2+ vezes.</span>` : '');
}

async function mzSalvarComportamento(colId) {
  const freq = _mzLerFrequenciasComportamento();
  const classe = _mzComportamentoClasse(freq);
  const periodo = _mzClassPeriodo || _mzPeriodoAtualLabel();
  const reg = _mzClassificacoes.find(x => x.colaborador_id === colId && x.periodo_label === periodo);
  const body = {
    colaborador_id: colId, periodo_label: periodo,
    absenteismo: reg?.absenteismo ?? null, performance: reg?.performance ?? null, comportamento: classe,
  };
  try {
    const salvo = await _mzFetch('/matriz/classificacoes', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const i = _mzClassificacoes.findIndex(x => x.id === salvo.id);
    if (i >= 0) _mzClassificacoes[i] = salvo; else _mzClassificacoes.push(salvo);
    document.getElementById('mz-modal-comp')?.remove();
    toast('Comportamento calculado e salvo!','sucesso');
    _mzRenderClassificacoes();
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
}

async function mzCicloClassificacao(colaboradorId, campo) {
  const periodo = _mzClassPeriodo || _mzPeriodoAtualLabel();
  let reg = _mzClassificacoes.find(x => x.colaborador_id === colaboradorId && x.periodo_label === periodo);
  const atual = reg ? reg[campo] : null;
  const idx = MZ_SEMAFORO_CICLO.indexOf(atual || null);
  const novo = MZ_SEMAFORO_CICLO[(idx + 1) % MZ_SEMAFORO_CICLO.length];
  const body = {
    colaborador_id: colaboradorId,
    periodo_label: periodo,
    absenteismo: reg?.absenteismo ?? null,
    performance: reg?.performance ?? null,
    comportamento: reg?.comportamento ?? null,
  };
  body[campo] = novo;
  try {
    const salvo = await _mzFetch('/matriz/classificacoes', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const i = _mzClassificacoes.findIndex(x => x.id === salvo.id);
    if (i >= 0) _mzClassificacoes[i] = salvo; else _mzClassificacoes.push(salvo);
    _mzRenderClassificacoes();
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
}

/* ── Ausências ── */
async function mzCarregarAusencias() {
  _mzAusencias = await _mzFetch('/matriz/ausencias');
  _mzCarregado.ausencias = true;
}

let _mzAusPeriodo = null;
let _mzAusTurno = 'Todos';

function _mzAusPeriodos() { return [...new Set(_mzAusencias.map(a=>a.periodo_label))]; }
function _mzAusRows(periodo) {
  return _mzAusencias.filter(a=>a.periodo_label===periodo).map(a => {
    const col = _mzColaboradores.find(c=>c.id===a.colaborador_id);
    return { id:a.id, colaborador_id:a.colaborador_id, nome: col?col.nome:'—', turno: col?col.turno:null, dias:a.dias||1, data:a.data, motivo:a.motivo, ativo: col?col.ativo:true };
  });
}
function _mzAusStatus(motivo) {
  motivo = motivo || '';
  if (motivo.startsWith('Ainda não apresentou')) return { label:'Pendente', cor:'var(--amber)' };
  if (motivo.startsWith('Ausência convertida')) return { label:'Convertida (BH)', cor:'#2563eb' };
  if (motivo === 'Falta' || motivo.startsWith('Desconto')) return { label:'Não justificada', cor:'var(--red)' };
  return { label:'Justificada', cor:'var(--green)' };
}
function _mzAbreviaMes(periodo) { return (periodo.split(' ')[0]||'').slice(0,3).toLowerCase(); }
function _mzDiasPorTurno(rows) { const out={}; rows.forEach(r=>{ if(r.turno) out[r.turno]=(out[r.turno]||0)+r.dias; }); return out; }

function _mzRenderAusencias() {
  const cont = document.getElementById('mz-conteudo');
  const periodos = _mzAusPeriodos();
  if (!_mzAusPeriodo || !periodos.includes(_mzAusPeriodo)) _mzAusPeriodo = periodos[periodos.length-1];
  const rows = _mzAusPeriodo ? _mzAusRows(_mzAusPeriodo) : [];

  const idxAtual = periodos.indexOf(_mzAusPeriodo);
  let comparativoHtml = '';
  if (idxAtual > 0) {
    const periodoAnterior = periodos[idxAtual-1];
    const rowsAnterior = _mzAusRows(periodoAnterior);
    const diasAnterior = _mzDiasPorTurno(rowsAnterior);
    const diasAtual = _mzDiasPorTurno(rows);
    const turnos = [...new Set([...Object.keys(diasAnterior), ...Object.keys(diasAtual)])].sort();
    const totalAnterior = rowsAnterior.reduce((a,r)=>a+r.dias,0);
    const totalAtual = rows.reduce((a,r)=>a+r.dias,0);
    const colabAnterior = new Set(rowsAnterior.map(r=>r.colaborador_id)).size;
    const colabAtual = new Set(rows.map(r=>r.colaborador_id)).size;
    const pctTotal = totalAnterior ? Math.round(((totalAtual-totalAnterior)/totalAnterior)*100) : 0;
    comparativoHtml = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px">
        ${turnos.map(t => {
          const antes = diasAnterior[t]||0, depois = diasAtual[t]||0;
          const pct = antes ? Math.round(((depois-antes)/antes)*100) : (depois>0?100:0);
          const melhorou = depois <= antes;
          return `<div style="background:var(--surface2);border-radius:10px;padding:10px 14px;min-width:140px">
            <div style="font-size:10px;font-weight:800;color:var(--text3)">${pfEsc(t)}</div>
            <div style="font-size:14px;font-weight:800;margin-top:2px">${antes}d → ${depois}d</div>
            <div style="font-size:11px;font-weight:700;color:${melhorou?'var(--green)':'var(--red)'};margin-top:2px">${melhorou?'▼':'▲'} ${Math.abs(pct)}% ${_mzAbreviaMes(periodoAnterior)}→${_mzAbreviaMes(_mzAusPeriodo)}</div>
          </div>`;
        }).join('')}
      </div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:14px">
        Total: ${totalAnterior} dias (${colabAnterior} colaborador${colabAnterior!==1?'es':''}) em ${pfEsc(periodoAnterior)} → ${totalAtual} dias (${colabAtual} colaborador${colabAtual!==1?'es':''}) em ${pfEsc(_mzAusPeriodo)}
        · ${pctTotal<=0?'queda':'aumento'} de ${Math.abs(pctTotal)}%
      </div>`;
  }

  const justificadas = rows.filter(r=>_mzAusStatus(r.motivo).label==='Justificada').length;
  const pendentes = rows.filter(r=>_mzAusStatus(r.motivo).label==='Pendente').length;
  const naoJust = rows.filter(r=>_mzAusStatus(r.motivo).label==='Não justificada').length;

  const turnosFiltro = ['Todos', ...new Set(rows.map(r=>r.turno).filter(Boolean))];
  const turnosParaMostrar = _mzAusTurno==='Todos' ? [...new Set(rows.map(r=>r.turno).filter(Boolean))].sort() : [_mzAusTurno];

  cont.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${periodos.map(p => `<button onclick="_mzAusPeriodo='${p.replace(/'/g,"\\'")}';_mzAusTurno='Todos';_mzRenderAusencias()" style="padding:6px 12px;background:${p===_mzAusPeriodo?'var(--accent)':'var(--surface2)'};border:none;border-radius:20px;color:${p===_mzAusPeriodo?'#fff':'var(--text2)'};font-size:11.5px;font-weight:700;cursor:pointer">${pfEsc(p)}</button>`).join('')}
      </div>
      <button class="btn btn-primary btn-sm" onclick="mzAbrirAusencia()">+ Nova ausência</button>
    </div>
    ${comparativoHtml}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px">
      <div class="tile" style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:10px;color:var(--text3)">TOTAL DE REGISTROS</div><div style="font-size:18px;font-weight:800;margin-top:4px">${rows.length}</div></div>
      <div class="tile" style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:10px;color:var(--text3)">JUSTIFICADAS</div><div style="font-size:18px;font-weight:800;margin-top:4px;color:var(--green)">${justificadas}</div></div>
      <div class="tile" style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:10px;color:var(--text3)">PENDENTES DE JUSTIFICATIVA</div><div style="font-size:18px;font-weight:800;margin-top:4px;color:var(--amber)">${pendentes}</div></div>
      <div class="tile" style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:10px;color:var(--text3)">NÃO JUSTIFICADAS</div><div style="font-size:18px;font-weight:800;margin-top:4px;color:var(--red)">${naoJust}</div></div>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">
      ${turnosFiltro.map(t => {
        const n = t==='Todos' ? rows.length : rows.filter(r=>r.turno===t).length;
        return `<button onclick="_mzAusTurno='${t.replace(/'/g,"\\'")}';_mzRenderAusencias()" style="padding:6px 12px;background:${t===_mzAusTurno?'var(--accent)':'var(--surface2)'};border:none;border-radius:20px;color:${t===_mzAusTurno?'#fff':'var(--text2)'};font-size:11.5px;font-weight:700;cursor:pointer">${pfEsc(t)} (${n})</button>`;
      }).join('')}
    </div>
    ${turnosParaMostrar.map(turno => {
      const registros = rows.filter(r=>r.turno===turno);
      return `<div style="margin-bottom:16px">
        <div style="font-size:12px;font-weight:800;margin-bottom:8px">${pfEsc(turno)} — ${registros.length} registro${registros.length!==1?'s':''}</div>
        <div class="card" style="padding:0;overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr style="background:var(--surface2)">
              <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">COLABORADOR</th>
              <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3)">DIAS</th>
              <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">DATA</th>
              <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">MOTIVO</th>
              <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3)">STATUS</th>
              <th style="padding:8px 12px"></th>
            </tr></thead>
            <tbody>${registros.map(r => {
              const st = _mzAusStatus(r.motivo);
              return `<tr style="border-top:1px solid var(--border)">
                <td style="padding:8px 12px;font-weight:700">${pfEsc(r.nome)}${!r.ativo?' <span style="font-size:9px;color:var(--text3)">(desligado)</span>':''}</td>
                <td style="padding:8px 12px;text-align:center">${r.dias}</td>
                <td style="padding:8px 12px;color:var(--text2)">${pfEsc(r.data||'—')}</td>
                <td style="padding:8px 12px;color:var(--text2)">${pfEsc(r.motivo||'—')}</td>
                <td style="padding:8px 12px;text-align:center"><span style="font-size:10px;font-weight:700;color:${st.cor}">${st.label}</span></td>
                <td style="padding:8px 12px;text-align:right;white-space:nowrap">
                  <button class="btn btn-outline btn-sm" onclick="mzAbrirAusencia(${r.id})">Editar</button>
                  <button class="btn btn-outline btn-sm" style="color:var(--red);border-color:var(--red)" onclick="mzExcluirAusencia(${r.id})">Excluir</button>
                </td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>
      </div>`;
    }).join('') || `<div class="card" style="text-align:center;color:var(--text3);padding:20px">Nenhuma ausência registrada nesse período</div>`}`;
}

function mzAbrirAusencia(id) {
  const au = id ? _mzAusencias.find(a => a.id === id) : null;
  const editando = !!au;
  const modal = document.createElement('div');
  modal.id = 'mz-modal-aus';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  const colOpts = [..._mzColaboradores].sort((a,b)=>(a.nome||'').localeCompare(b.nome||'')).map(c=>`<option value="${c.id}" ${editando&&au.colaborador_id===c.id?'selected':''}>${pfEsc(c.nome)}</option>`).join('');
  modal.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:22px;max-width:420px;width:100%">
      <div style="font-weight:900;font-size:15px;margin-bottom:14px">${editando?'Editar':'Nova'} ausência</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">COLABORADOR</label>
          <select id="mza-colab" ${editando?'disabled':''} style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px">${colOpts}</select></div>
        <div style="display:flex;gap:10px">
          <div style="flex:1"><label style="font-size:10px;font-weight:700;color:var(--text3)">PERÍODO</label>
            <input id="mza-periodo" placeholder="Agosto 2026" value="${editando?pfEsc(au.periodo_label):pfEsc(_mzAusPeriodo||'')}" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
          <div style="width:80px"><label style="font-size:10px;font-weight:700;color:var(--text3)">DIAS</label>
            <input id="mza-dias" type="number" value="${editando?au.dias:1}" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
        </div>
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">DATA(S)</label>
          <input id="mza-data" placeholder="17/08 e 18/08" value="${editando?pfEsc(au.data||''):''}" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">MOTIVO</label>
          <textarea id="mza-motivo" placeholder="ex: Falta, Atestado (CID: ...), Ainda não apresentou justificativa..." style="width:100%;min-height:60px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;resize:vertical;box-sizing:border-box">${editando?pfEsc(au.motivo||''):''}</textarea></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:18px">
        <button class="btn btn-outline" style="flex:1" onclick="document.getElementById('mz-modal-aus').remove()">Cancelar</button>
        <button class="btn btn-primary" style="flex:1" onclick="mzSalvarAusencia(${editando?au.id:'null'})">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function mzSalvarAusencia(id) {
  const body = {
    periodo_label: document.getElementById('mza-periodo').value.trim(),
    dias: parseInt(document.getElementById('mza-dias').value) || 1,
    data: document.getElementById('mza-data').value.trim(),
    motivo: document.getElementById('mza-motivo').value.trim(),
  };
  if (!body.periodo_label) { toast('Informe o período.','aviso'); return; }
  try {
    if (id) {
      await _mzFetch(`/matriz/ausencias/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    } else {
      const colId = parseInt(document.getElementById('mza-colab').value);
      if (!colId) { toast('Selecione o colaborador.','aviso'); return; }
      body.colaborador_id = colId;
      await _mzFetch('/matriz/ausencias', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    }
    document.getElementById('mz-modal-aus')?.remove();
    toast('Ausência salva!','sucesso');
    _mzCarregado.ausencias = false;
    await mzCarregarAusencias();
    _mzRenderAusencias();
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
}

function mzExcluirAusencia(id) {
  wmsConfirm({ titulo:'Excluir ausência?', sub:'Ação permanente.', btnOk:'Excluir', btnOkClass:'btn-danger' }, async () => {
    try {
      await _mzFetch(`/matriz/ausencias/${id}`, { method:'DELETE' });
      toast('Excluída!','sucesso');
      _mzCarregado.ausencias = false;
      await mzCarregarAusencias();
      _mzRenderAusencias();
    } catch(e) { toast('Erro: ' + e.message, 'erro'); }
  });
}

/* ── Banco de Horas ── */
async function mzCarregarBancoHoras() {
  const [lista, periodo] = await Promise.all([
    _mzFetch('/matriz/banco-horas'),
    _mzFetch('/matriz/banco-horas/periodo'),
  ]);
  _mzBancoHoras = lista;
  _mzBancoHorasPeriodo = periodo;
  _mzCarregado.bancoHoras = true;
}

let _mzBancoFiltro = 'todos';
function _mzFmtH(n) { return `${n > 0 ? '+' : ''}${n}h`; }

function _mzBancoRows() {
  return [..._mzColaboradores].filter(c => c.ativo).map(c => {
    const bh = _mzBancoHoras.find(b => b.colaborador_id === c.id) || { saldo_atual:0, delta:0 };
    return { colaborador_id: c.id, nome: c.nome, atual: bh.saldo_atual||0, delta: bh.delta||0, inicio: (bh.saldo_atual||0) - (bh.delta||0) };
  });
}

function _mzRenderBancoHoras() {
  const cont = document.getElementById('mz-conteudo');
  const rows = _mzBancoRows();
  const periodo = _mzBancoHorasPeriodo || { inicio_label:'', fim_label:'' };

  const somaInicio = rows.reduce((a,r)=>a+r.inicio,0);
  const somaAtual  = rows.reduce((a,r)=>a+r.atual,0);
  const somaDelta  = rows.reduce((a,r)=>a+r.delta,0);
  const pct = somaInicio ? ((somaDelta/somaInicio)*100).toFixed(1) : '0.0';

  const tiers = [
    { label:'Acima de 160h', test:v=>v>=160, cor:'var(--red)' },
    { label:'101h – 159h',   test:v=>v>=101 && v<160, cor:'var(--amber)' },
    { label:'41h – 100h',    test:v=>v>=41 && v<=100, cor:'#2563eb' },
    { label:'Até 40h',       test:v=>v<=40, cor:'var(--green)' },
  ];
  const totalRows = rows.length;

  const filtros = [
    { key:'todos',    label:`Todos (${rows.length})` },
    { key:'reduziu',  label:`Reduziram (${rows.filter(r=>r.delta<0).length})` },
    { key:'estavel',  label:`Estáveis (${rows.filter(r=>r.delta===0).length})` },
    { key:'aumentou', label:`Aumentaram (${rows.filter(r=>r.delta>0).length})` },
  ];
  let lista = rows;
  if (_mzBancoFiltro==='reduziu')  lista = rows.filter(r=>r.delta<0);
  if (_mzBancoFiltro==='estavel')  lista = rows.filter(r=>r.delta===0);
  if (_mzBancoFiltro==='aumentou') lista = rows.filter(r=>r.delta>0);
  lista = [...lista].sort((a,b)=>b.atual-a.atual);

  cont.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <div style="font-size:12px;color:var(--text3)">${pfEsc(periodo.inicio_label)} → ${pfEsc(periodo.fim_label)} · ${totalRows} colaboradores</div>
      <button class="btn btn-outline btn-sm" onclick="mzAbrirPeriodoBH()">Editar período</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:14px">
      <div class="tile" style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:10px;color:var(--text3)">SALDO ${pfEsc(periodo.inicio_label||'INÍCIO')}</div><div style="font-size:18px;font-weight:800;margin-top:4px">${somaInicio.toLocaleString('pt-BR')}h</div></div>
      <div class="tile" style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:10px;color:var(--text3)">SALDO ${pfEsc(periodo.fim_label||'ATUAL')}</div><div style="font-size:18px;font-weight:800;margin-top:4px">${somaAtual.toLocaleString('pt-BR')}h</div></div>
      <div class="tile" style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:10px;color:var(--text3)">REDUÇÃO LÍQUIDA</div><div style="font-size:18px;font-weight:800;margin-top:4px;color:var(--green)">${somaDelta.toLocaleString('pt-BR')}h</div></div>
      <div class="tile" style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:10px;color:var(--text3)">VARIAÇÃO DO PERÍODO</div><div style="font-size:18px;font-weight:800;margin-top:4px;color:var(--green)">${pct}%</div></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">
      ${tiers.map(t => {
        const n = rows.filter(r=>t.test(r.atual)).length;
        const p = totalRows ? Math.round(n/totalRows*100) : 0;
        return `<div style="display:flex;align-items:center;gap:10px">
          <div style="width:110px;font-size:11px;color:var(--text3)">${t.label}</div>
          <div style="flex:1;height:8px;border-radius:4px;background:var(--surface2);overflow:hidden"><div style="width:${p}%;height:100%;background:${t.cor}"></div></div>
          <div style="width:70px;text-align:right;font-size:11px;color:var(--text2)">${n}/${totalRows} · ${p}%</div>
        </div>`;
      }).join('')}
    </div>
    <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
      ${filtros.map(f => `<button onclick="_mzBancoFiltro='${f.key}';_mzRenderBancoHoras()" style="padding:6px 12px;background:${_mzBancoFiltro===f.key?'var(--accent)':'var(--surface2)'};border:none;border-radius:20px;color:${_mzBancoFiltro===f.key?'#fff':'var(--text2)'};font-size:11.5px;font-weight:700;cursor:pointer">${f.label}</button>`).join('')}
    </div>
    <div class="card" style="padding:0;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead><tr style="background:var(--surface2)">
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">#</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">COLABORADOR</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3)">${pfEsc(periodo.inicio_label||'INÍCIO')}</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3)">${pfEsc(periodo.fim_label||'ATUAL')}</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3)">VARIAÇÃO</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3)">%</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3)">STATUS</th>
          <th style="padding:8px 12px"></th>
        </tr></thead>
        <tbody>${lista.map((r,i) => {
          const cor = r.delta<0 ? 'var(--green)' : r.delta>0 ? 'var(--red)' : 'var(--text3)';
          const pctR = r.inicio !== 0 ? Math.round(r.delta/r.inicio*100)+'%' : '—';
          const statusLabel = r.delta<0 ? 'Reduziu' : r.delta>0 ? 'Aumentou' : 'Estável';
          return `<tr style="border-top:1px solid var(--border)">
            <td style="padding:8px 12px;color:var(--text3)">${i+1}</td>
            <td style="padding:8px 12px;font-weight:700">${pfEsc(r.nome)}</td>
            <td style="padding:8px 12px;text-align:center">${r.inicio}h</td>
            <td style="padding:8px 12px;text-align:center">${r.atual}h</td>
            <td style="padding:8px 12px;text-align:center;color:${cor};font-weight:700">${_mzFmtH(r.delta)}</td>
            <td style="padding:8px 12px;text-align:center;color:${cor}">${pctR}</td>
            <td style="padding:8px 12px;text-align:center;font-size:11px;font-weight:700;color:${cor}">${statusLabel}</td>
            <td style="padding:8px 12px;text-align:right"><button class="btn btn-outline btn-sm" onclick="mzAbrirBancoHoras(${r.colaborador_id})">Editar</button></td>
          </tr>`;
        }).join('') || `<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:20px">Nenhum colaborador ativo</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function mzAbrirPeriodoBH() {
  const periodo = _mzBancoHorasPeriodo || { inicio_label:'', fim_label:'' };
  const modal = document.createElement('div');
  modal.id = 'mz-modal-bhperiodo';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:22px;max-width:360px;width:100%">
      <div style="font-weight:900;font-size:15px;margin-bottom:14px">Período do Banco de Horas</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">RÓTULO DO INÍCIO</label>
          <input id="mzbhp-inicio" placeholder="ex: Jan/Fev 2026" value="${pfEsc(periodo.inicio_label||'')}" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">RÓTULO DO FIM</label>
          <input id="mzbhp-fim" placeholder="ex: Jun 2026" value="${pfEsc(periodo.fim_label||'')}" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:18px">
        <button class="btn btn-outline" style="flex:1" onclick="document.getElementById('mz-modal-bhperiodo').remove()">Cancelar</button>
        <button class="btn btn-primary" style="flex:1" onclick="mzSalvarPeriodoBH()">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function mzSalvarPeriodoBH() {
  const body = { inicio_label: document.getElementById('mzbhp-inicio').value.trim(), fim_label: document.getElementById('mzbhp-fim').value.trim() };
  try {
    _mzBancoHorasPeriodo = await _mzFetch('/matriz/banco-horas/periodo', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    document.getElementById('mz-modal-bhperiodo')?.remove();
    toast('Período salvo!','sucesso');
    _mzRenderBancoHoras();
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
}

function mzAbrirBancoHoras(colId) {
  const bh = _mzBancoHoras.find(b => b.colaborador_id === colId) || { saldo_atual:0, delta:0 };
  const modal = document.createElement('div');
  modal.id = 'mz-modal-bh';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:22px;max-width:360px;width:100%">
      <div style="font-weight:900;font-size:15px;margin-bottom:14px">Editar Banco de Horas — ${pfEsc(_mzColNome(colId))}</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">SALDO ATUAL (h)</label>
          <input id="mzbh-saldo" type="number" value="${bh.saldo_atual||0}" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">VARIAÇÃO DO PERÍODO (h)</label>
          <input id="mzbh-delta" type="number" value="${bh.delta||0}" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:18px">
        <button class="btn btn-outline" style="flex:1" onclick="document.getElementById('mz-modal-bh').remove()">Cancelar</button>
        <button class="btn btn-primary" style="flex:1" onclick="mzSalvarBancoHoras(${colId})">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function mzSalvarBancoHoras(colId) {
  const body = {
    colaborador_id: colId,
    saldo_atual: parseInt(document.getElementById('mzbh-saldo').value) || 0,
    delta: parseInt(document.getElementById('mzbh-delta').value) || 0,
  };
  try {
    const salvo = await _mzFetch('/matriz/banco-horas', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const i = _mzBancoHoras.findIndex(b => b.colaborador_id === colId);
    if (i >= 0) _mzBancoHoras[i] = salvo; else _mzBancoHoras.push(salvo);
    document.getElementById('mz-modal-bh')?.remove();
    toast('Salvo!','sucesso');
    _mzRenderBancoHoras();
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
}

/* ── Férias ── */
async function mzCarregarFerias() {
  _mzFerias = await _mzFetch('/matriz/ferias');
  _mzCarregado.ferias = true;
}

let _mzFeriasSetorFiltro = 'Todos';
let _mzFeriasTurnoFiltro = 'Todos';

function _mzFeriasRows() {
  const byColab = {};
  _mzFerias.forEach(f => { (byColab[f.colaborador_id] = byColab[f.colaborador_id] || {})[f.tipo] = f; });
  return Object.entries(byColab).map(([cid, tipos]) => {
    const col = _mzColaboradores.find(c => c.id === parseInt(cid));
    if (!col) return null;
    return { colaborador_id: parseInt(cid), nome: col.nome, turno: col.turno, setor: col.area, limite: tipos.limite, p1: tipos.p1, p2: tipos.p2 };
  }).filter(Boolean);
}
function _mzFeriasDiasProgramados(r) { return (r.p1?r.p1.dias:0) + (r.p2?r.p2.dias:0); }
function _mzFeriasStatus(r) {
  const prog = _mzFeriasDiasProgramados(r);
  const total = r.limite ? r.limite.dias : 30;
  if (prog >= total) return 'completo';
  if (prog > 0) return 'parcial';
  return 'pendente';
}

function _mzRenderFerias() {
  const cont = document.getElementById('mz-conteudo');
  const rows = _mzFeriasRows();
  const hoje = new Date();
  const diasAte = r => r.limite ? (new Date(r.limite.data_inicio) - hoje) / 86400000 : null;
  const completos = rows.filter(r => _mzFeriasStatus(r)==='completo').length;
  const vencendo  = rows.filter(r => { const d = diasAte(r); return d!=null && d<=60 && d>=0; }).length;
  const vencidos  = rows.filter(r => { const d = diasAte(r); return d!=null && d<0; }).length;

  const setores = ['Todos', ...new Set(rows.map(r=>r.setor).filter(Boolean))];
  const turnos  = ['Todos', ...new Set(rows.map(r=>r.turno).filter(Boolean))];
  let lista = rows;
  if (_mzFeriasSetorFiltro!=='Todos') lista = lista.filter(r=>r.setor===_mzFeriasSetorFiltro);
  if (_mzFeriasTurnoFiltro!=='Todos') lista = lista.filter(r=>r.turno===_mzFeriasTurnoFiltro);

  const pill = (label, ativo, onclick) => `<button onclick="${onclick}" style="padding:6px 12px;background:${ativo?'var(--accent)':'var(--surface2)'};border:none;border-radius:20px;color:${ativo?'#fff':'var(--text2)'};font-size:11.5px;font-weight:700;cursor:pointer">${pfEsc(label)}</button>`;
  const fmtCell = p => p ? `<div>${fmtData(p.data_inicio)}<div style="font-size:10px;color:var(--text3)">${p.dias} dias</div></div>` : '<span style="color:var(--text3);font-size:11px">não programado</span>';

  cont.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:14px">
      <div class="tile" style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:10px;color:var(--text3)">COLABORADORES</div><div style="font-size:18px;font-weight:800;margin-top:4px">${rows.length}</div></div>
      <div class="tile" style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:10px;color:var(--text3)">PROGRAMAÇÃO COMPLETA</div><div style="font-size:18px;font-weight:800;margin-top:4px;color:var(--green)">${completos}</div></div>
      <div class="tile" style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:10px;color:var(--text3)">LIMITE EM ATÉ 60 DIAS</div><div style="font-size:18px;font-weight:800;margin-top:4px;color:var(--amber)">${vencendo}</div></div>
      <div class="tile" style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:10px;color:var(--text3)">LIMITE VENCIDO</div><div style="font-size:18px;font-weight:800;margin-top:4px;color:var(--red)">${vencidos}</div></div>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">
      ${setores.map(s => pill(s, s===_mzFeriasSetorFiltro, `_mzFeriasSetorFiltro='${s.replace(/'/g,"\\'")}';_mzRenderFerias()`)).join('')}
    </div>
    <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">
      ${turnos.map(t => pill(t, t===_mzFeriasTurnoFiltro, `_mzFeriasTurnoFiltro='${t.replace(/'/g,"\\'")}';_mzRenderFerias()`)).join('')}
    </div>
    <div class="card" style="padding:0;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:var(--surface2)">
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">COLABORADOR</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">TURNO</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">SETOR</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">LIMITE LEGAL</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">PERÍODO 1</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">PERÍODO 2</th>
          <th style="padding:8px 12px"></th>
        </tr></thead>
        <tbody>${lista.map(r => `
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:8px 12px;font-weight:700;white-space:nowrap">${pfEsc(r.nome)}</td>
            <td style="padding:8px 12px;color:var(--text2)">${pfEsc(r.turno||'—')}</td>
            <td style="padding:8px 12px;color:var(--text2)">${pfEsc(r.setor||'—')}</td>
            <td style="padding:8px 12px">${fmtCell(r.limite)}</td>
            <td style="padding:8px 12px">${fmtCell(r.p1)}</td>
            <td style="padding:8px 12px">${fmtCell(r.p2)}</td>
            <td style="padding:8px 12px;text-align:right"><button class="btn btn-outline btn-sm" onclick="mzAbrirFerias(${r.colaborador_id})">Editar</button></td>
          </tr>`).join('') || `<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px">Nenhum colaborador</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function mzAbrirFerias(colId) {
  const row = _mzFeriasRows().find(r => r.colaborador_id === colId) || {};
  const modal = document.createElement('div');
  modal.id = 'mz-modal-ferias';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  const campo = (tipo, label, def) => {
    const p = row[tipo];
    return `<div style="display:flex;gap:10px;align-items:flex-end">
      <div style="flex:1"><label style="font-size:10px;font-weight:700;color:var(--text3)">${label} — DATA</label>
        <input id="mzfr-${tipo}-data" type="date" value="${p?p.data_inicio:''}" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
      <div style="width:80px"><label style="font-size:10px;font-weight:700;color:var(--text3)">DIAS</label>
        <input id="mzfr-${tipo}-dias" type="number" value="${p?p.dias:def}" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
    </div>`;
  };
  modal.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:22px;max-width:420px;width:100%">
      <div style="font-weight:900;font-size:15px;margin-bottom:14px">Editar Férias — ${pfEsc(_mzColNome(colId))}</div>
      <div style="display:flex;flex-direction:column;gap:12px">
        ${campo('limite','LIMITE LEGAL',30)}
        ${campo('p1','PERÍODO 1','')}
        ${campo('p2','PERÍODO 2','')}
      </div>
      <div style="display:flex;gap:10px;margin-top:18px">
        <button class="btn btn-outline" style="flex:1" onclick="document.getElementById('mz-modal-ferias').remove()">Cancelar</button>
        <button class="btn btn-primary" style="flex:1" onclick="mzSalvarFerias(${colId})">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function mzSalvarFerias(colId) {
  try {
    for (const tipo of ['limite','p1','p2']) {
      const dataEl = document.getElementById(`mzfr-${tipo}-data`);
      const diasEl = document.getElementById(`mzfr-${tipo}-dias`);
      if (!dataEl.value && !diasEl.value) continue;
      const salvo = await _mzFetch('/matriz/ferias', {
        method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ colaborador_id: colId, tipo, data_inicio: dataEl.value||null, dias: diasEl.value?parseInt(diasEl.value):null }),
      });
      const i = _mzFerias.findIndex(f => f.colaborador_id === colId && f.tipo === tipo);
      if (i >= 0) _mzFerias[i] = salvo; else _mzFerias.push(salvo);
    }
    document.getElementById('mz-modal-ferias')?.remove();
    toast('Férias salvas!','sucesso');
    _mzRenderFerias();
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
}

/* ── Cargos (descrição de cargo) ── */
async function mzCarregarCargos() {
  _mzCargos = await _mzFetch('/matriz/cargos');
  _mzCarregado.cargos = true;
}

let _mzCargoFiltro = 'Todos';

function _mzRenderCargos() {
  const cont = document.getElementById('mz-conteudo');
  const areas = ['Todos', ...new Set(_mzCargos.map(c => c.area).filter(Boolean))];
  const filtrados = _mzCargoFiltro === 'Todos' ? _mzCargos : _mzCargos.filter(c => c.area === _mzCargoFiltro);
  cont.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${areas.map(a => {
          const n = a==='Todos' ? _mzCargos.length : _mzCargos.filter(c=>c.area===a).length;
          return `<button onclick="_mzCargoFiltro='${a.replace(/'/g,"\\'")}';_mzRenderCargos()" style="padding:6px 12px;background:${_mzCargoFiltro===a?'var(--accent)':'var(--surface2)'};border:none;border-radius:20px;color:${_mzCargoFiltro===a?'#fff':'var(--text2)'};font-size:11.5px;font-weight:700;cursor:pointer">${pfEsc(a)} (${n})</button>`;
        }).join('')}
      </div>
      <button class="btn btn-primary btn-sm" onclick="mzAbrirCargo()">+ Novo cargo</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${filtrados.map(_mzCargoCardHtml).join('') || `<div class="card" style="text-align:center;color:var(--text3);padding:20px">Nenhum cargo cadastrado</div>`}
    </div>`;
}

function _mzCargoCardHtml(c) {
  const lista = (arr, titulo) => (arr && arr.length) ? `<div style="margin-top:10px"><div style="font-size:10px;font-weight:800;color:var(--text3);margin-bottom:4px">${titulo}</div><ul style="margin:0;padding-left:18px;font-size:12px;color:var(--text2)">${arr.map(x=>`<li>${pfEsc(x)}</li>`).join('')}</ul></div>` : '';
  return `
    <div style="background:var(--surface2);border-radius:10px;overflow:hidden">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 14px;cursor:pointer" onclick="mzToggleCargo(${c.id})">
        <div>
          <div style="font-weight:800;font-size:13px">${pfEsc(c.cargo)}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${pfEsc(c.area||'—')}${c.gestor?` · Gestor: ${pfEsc(c.gestor)}`:''}</div>
        </div>
        <span id="mzcg-chevron-${c.id}" style="font-size:11px;color:var(--text3);transition:transform .2s ease">▾</span>
      </div>
      <div id="mzcg-body-${c.id}" style="display:none;padding:0 14px 14px">
        ${c.descricao?`<div><div style="font-size:10px;font-weight:800;color:var(--text3);margin-bottom:4px">DESCRIÇÃO</div><p style="font-size:12px;color:var(--text2);margin:0">${pfEsc(c.descricao)}</p></div>`:''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">
          ${c.perfil?`<div><div style="font-size:10px;font-weight:800;color:var(--text3);margin-bottom:4px">PERFIL</div><p style="font-size:12px;color:var(--text2);margin:0">${pfEsc(c.perfil)}</p></div>`:''}
          ${c.formacao?`<div><div style="font-size:10px;font-weight:800;color:var(--text3);margin-bottom:4px">FORMAÇÃO</div><p style="font-size:12px;color:var(--text2);margin:0">${pfEsc(c.formacao)}</p></div>`:''}
        </div>
        ${lista(c.funcoes,'FUNÇÕES DETALHADAS')}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          ${lista(c.tecnicas,'HABILIDADES TÉCNICAS')}
          ${lista(c.comportamentais,'HABILIDADES COMPORTAMENTAIS')}
        </div>
        ${lista(c.atitudes,'ATITUDES ESPERADAS')}
        ${(c.graduacoes&&c.graduacoes.length)?`<div style="margin-top:10px"><div style="font-size:10px;font-weight:800;color:var(--text3);margin-bottom:4px">GRADUAÇÕES</div><div style="display:flex;flex-wrap:wrap;gap:6px">${c.graduacoes.map(g=>`<span style="padding:4px 10px;border-radius:20px;background:var(--surface);font-size:11px">${pfEsc(c.cargo)} ${pfEsc(g)}</span>`).join('')}</div></div>`:''}
        <div style="display:flex;gap:8px;margin-top:14px">
          <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();mzAbrirCargo(${c.id})">Editar</button>
          <button class="btn btn-outline btn-sm" style="color:var(--red);border-color:var(--red)" onclick="event.stopPropagation();mzExcluirCargo(${c.id})">Excluir</button>
        </div>
      </div>
    </div>`;
}

function mzToggleCargo(id) {
  const body = document.getElementById(`mzcg-body-${id}`);
  const chevron = document.getElementById(`mzcg-chevron-${id}`);
  if (!body) return;
  const abrindo = body.style.display === 'none';
  body.style.display = abrindo ? 'block' : 'none';
  if (chevron) chevron.style.transform = abrindo ? 'rotate(180deg)' : '';
}

function mzAbrirCargo(id) {
  const c = id ? _mzCargos.find(x => x.id === id) : null;
  const editando = !!c;
  const arr = v => (v||[]).join('\n');
  const modal = document.createElement('div');
  modal.id = 'mz-modal-cargo';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:22px;max-width:560px;width:100%;max-height:90vh;overflow-y:auto">
      <div style="font-weight:900;font-size:15px;margin-bottom:14px">${editando?'Editar':'Novo'} cargo</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;gap:10px">
          <div style="flex:1"><label style="font-size:10px;font-weight:700;color:var(--text3)">CARGO</label>
            <input id="mzcg-cargo" value="${editando?pfEsc(c.cargo):''}" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
          <div style="flex:1"><label style="font-size:10px;font-weight:700;color:var(--text3)">ÁREA</label>
            <input id="mzcg-area" value="${editando?pfEsc(c.area||''):''}" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
        </div>
        <div style="display:flex;gap:10px">
          <div style="flex:1"><label style="font-size:10px;font-weight:700;color:var(--text3)">GESTOR</label>
            <input id="mzcg-gestor" value="${editando?pfEsc(c.gestor||''):''}" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
          <div style="flex:1"><label style="font-size:10px;font-weight:700;color:var(--text3)">PERFIL</label>
            <input id="mzcg-perfil" value="${editando?pfEsc(c.perfil||''):''}" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
        </div>
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">DESCRIÇÃO</label>
          <textarea id="mzcg-descricao" style="width:100%;min-height:50px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;resize:vertical;box-sizing:border-box">${editando?pfEsc(c.descricao||''):''}</textarea></div>
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">FORMAÇÃO</label>
          <textarea id="mzcg-formacao" style="width:100%;min-height:40px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;resize:vertical;box-sizing:border-box">${editando?pfEsc(c.formacao||''):''}</textarea></div>
        <div style="font-size:10px;color:var(--text3);margin-top:4px">Campos abaixo: um item por linha.</div>
        <div style="display:flex;gap:10px">
          <div style="flex:1"><label style="font-size:10px;font-weight:700;color:var(--text3)">GRADUAÇÕES</label>
            <textarea id="mzcg-graduacoes" style="width:100%;min-height:60px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;resize:vertical;box-sizing:border-box">${editando?pfEsc(arr(c.graduacoes)):''}</textarea></div>
          <div style="flex:1"><label style="font-size:10px;font-weight:700;color:var(--text3)">FUNÇÕES</label>
            <textarea id="mzcg-funcoes" style="width:100%;min-height:60px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;resize:vertical;box-sizing:border-box">${editando?pfEsc(arr(c.funcoes)):''}</textarea></div>
        </div>
        <div style="display:flex;gap:10px">
          <div style="flex:1"><label style="font-size:10px;font-weight:700;color:var(--text3)">TÉCNICAS</label>
            <textarea id="mzcg-tecnicas" style="width:100%;min-height:60px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;resize:vertical;box-sizing:border-box">${editando?pfEsc(arr(c.tecnicas)):''}</textarea></div>
          <div style="flex:1"><label style="font-size:10px;font-weight:700;color:var(--text3)">COMPORTAMENTAIS</label>
            <textarea id="mzcg-comportamentais" style="width:100%;min-height:60px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;resize:vertical;box-sizing:border-box">${editando?pfEsc(arr(c.comportamentais)):''}</textarea></div>
        </div>
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">ATITUDES</label>
          <textarea id="mzcg-atitudes" style="width:100%;min-height:50px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;resize:vertical;box-sizing:border-box">${editando?pfEsc(arr(c.atitudes)):''}</textarea></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:18px">
        <button class="btn btn-outline" style="flex:1" onclick="document.getElementById('mz-modal-cargo').remove()">Cancelar</button>
        <button class="btn btn-primary" style="flex:1" onclick="mzSalvarCargo(${editando?c.id:'null'})">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function mzSalvarCargo(id) {
  const linhas = v => v.split('\n').map(s=>s.trim()).filter(Boolean);
  const body = {
    cargo: document.getElementById('mzcg-cargo').value.trim(),
    area: document.getElementById('mzcg-area').value.trim(),
    gestor: document.getElementById('mzcg-gestor').value.trim(),
    perfil: document.getElementById('mzcg-perfil').value.trim(),
    descricao: document.getElementById('mzcg-descricao').value.trim(),
    formacao: document.getElementById('mzcg-formacao').value.trim(),
    graduacoes: linhas(document.getElementById('mzcg-graduacoes').value),
    funcoes: linhas(document.getElementById('mzcg-funcoes').value),
    tecnicas: linhas(document.getElementById('mzcg-tecnicas').value),
    comportamentais: linhas(document.getElementById('mzcg-comportamentais').value),
    atitudes: linhas(document.getElementById('mzcg-atitudes').value),
  };
  if (!body.cargo) { toast('Informe o nome do cargo.','aviso'); return; }
  try {
    if (id) await _mzFetch(`/matriz/cargos/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    else    await _mzFetch('/matriz/cargos', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    document.getElementById('mz-modal-cargo')?.remove();
    toast('Salvo!','sucesso');
    _mzCarregado.cargos = false;
    await mzCarregarCargos();
    _mzRenderCargos();
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
}

function mzExcluirCargo(id) {
  wmsConfirm({ titulo:'Excluir cargo?', sub:'Ação permanente.', btnOk:'Excluir', btnOkClass:'btn-danger' }, async () => {
    try {
      await _mzFetch(`/matriz/cargos/${id}`, { method:'DELETE' });
      toast('Excluído!','sucesso');
      _mzCarregado.cargos = false;
      await mzCarregarCargos();
      _mzRenderCargos();
    } catch(e) { toast('Erro: ' + e.message, 'erro'); }
  });
}

/* ── Incentivo (pontuação por critério) ── */
async function mzCarregarIncentivo() {
  _mzIncentivo = await _mzFetch('/matriz/incentivo');
  _mzCarregado.incentivo = true;
}

let _mzIncentivoPeriodo = null;
let _mzIncentivoTurnoFiltro = 'Todos';

function _mzCalcIncentivo(r) {
  const cfg = _mzIncentivo;
  if (!cfg) return null;
  const pa = { green:cfg.abs_green, yellow:cfg.abs_yellow, red:cfg.abs_red }[r.abs];
  const pp = { green:cfg.perf_green, yellow:cfg.perf_yellow, red:cfg.perf_red }[r.perf];
  const pc = { green:cfg.comp_green, yellow:cfg.comp_yellow, red:cfg.comp_red }[r.comp];
  if (pa===undefined || pp===undefined || pc===undefined) return null;
  const total = pa + pp + pc;
  let tier;
  if (total>=90) tier = { label:'🏆 Destaque', valor:'R$ 200,00', cor:'var(--accent)' };
  else if (total>=70) tier = { label:'⭐ Bom', valor:'R$ 100,00', cor:'var(--green)' };
  else if (total>=50) tier = { label:'👍 Regular', valor:'—', cor:'var(--amber)' };
  else tier = { label:'📋 Atenção', valor:'—', cor:'var(--red)' };
  return { total, ...tier };
}

function _mzRenderIncentivo() {
  const cont = document.getElementById('mz-conteudo');
  const periodos = _mzClassPeriodos();
  if (!_mzIncentivoPeriodo || (periodos.length && !periodos.includes(_mzIncentivoPeriodo))) _mzIncentivoPeriodo = periodos[periodos.length-1] || _mzPeriodoAtualLabel();
  const periodo = _mzIncentivoPeriodo;
  const rows = _mzClassRows(periodo).map(r => ({ ...r, calc: _mzCalcIncentivo(r) }));

  const destaque = rows.filter(r=>r.calc && r.calc.label.includes('Destaque')).length;
  const bom      = rows.filter(r=>r.calc && r.calc.label.includes('Bom')).length;
  const regular  = rows.filter(r=>r.calc && r.calc.label.includes('Regular')).length;
  const atencao  = rows.filter(r=>r.calc && r.calc.label.includes('Atenção')).length;

  const turnos = ['Todos', ...new Set(rows.map(r=>r.turno).filter(Boolean))];
  let lista = rows;
  if (_mzIncentivoTurnoFiltro!=='Todos') lista = lista.filter(r=>r.turno===_mzIncentivoTurnoFiltro);

  cont.innerHTML = `
    <div class="card" style="margin-bottom:14px;padding:14px 16px">
      <p style="font-size:12px;color:var(--text2);margin:0">Bonificação calculada a partir da Classificação do ciclo — Absenteísmo (${_mzIncentivo?.abs_green ?? 30} pts) + Performance (${_mzIncentivo?.perf_green ?? 40} pts) + Comportamento (${_mzIncentivo?.comp_green ?? 30} pts).</p>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${periodos.map(p => `<button onclick="_mzIncentivoPeriodo='${p.replace(/'/g,"\\'")}';_mzRenderIncentivo()" style="padding:6px 12px;background:${p===periodo?'var(--accent)':'var(--surface2)'};border:none;border-radius:20px;color:${p===periodo?'#fff':'var(--text2)'};font-size:11.5px;font-weight:700;cursor:pointer">${pfEsc(p)}</button>`).join('')}
      </div>
      <button class="btn btn-outline btn-sm" onclick="mzAbrirIncentivoConfig()">Editar pontuação</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px">
      <div class="tile" style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:10px;color:var(--text3)">🏆 DESTAQUE</div><div style="font-size:18px;font-weight:800;margin-top:4px">${destaque}</div></div>
      <div class="tile" style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:10px;color:var(--text3)">⭐ BOM</div><div style="font-size:18px;font-weight:800;margin-top:4px">${bom}</div></div>
      <div class="tile" style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:10px;color:var(--text3)">👍 REGULAR</div><div style="font-size:18px;font-weight:800;margin-top:4px">${regular}</div></div>
      <div class="tile" style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:10px;color:var(--text3)">📋 ATENÇÃO</div><div style="font-size:18px;font-weight:800;margin-top:4px">${atencao}</div></div>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">
      ${turnos.map(t => `<button onclick="_mzIncentivoTurnoFiltro='${t.replace(/'/g,"\\'")}';_mzRenderIncentivo()" style="padding:6px 12px;background:${t===_mzIncentivoTurnoFiltro?'var(--accent)':'var(--surface2)'};border:none;border-radius:20px;color:${t===_mzIncentivoTurnoFiltro?'#fff':'var(--text2)'};font-size:11.5px;font-weight:700;cursor:pointer">${pfEsc(t)}</button>`).join('')}
    </div>
    <div class="card" style="padding:0;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead><tr style="background:var(--surface2)">
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">COLABORADOR</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">TURNO</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3)">PONTUAÇÃO</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">CLASSIFICAÇÃO</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3)">BÔNUS</th>
        </tr></thead>
        <tbody>${lista.map(r => {
          if (!r.calc) return `<tr style="border-top:1px solid var(--border)"><td style="padding:8px 12px;font-weight:700">${pfEsc(r.nome)}</td><td style="padding:8px 12px;color:var(--text2)">${pfEsc(r.turno||'—')}</td><td colspan="3" style="padding:8px 12px;text-align:center;color:var(--text3);font-size:11px">ciclo incompleto</td></tr>`;
          return `<tr style="border-top:1px solid var(--border)">
            <td style="padding:8px 12px;font-weight:700">${pfEsc(r.nome)}</td>
            <td style="padding:8px 12px;color:var(--text2)">${pfEsc(r.turno||'—')}</td>
            <td style="padding:8px 12px;text-align:center;font-weight:800">${r.calc.total} pts</td>
            <td style="padding:8px 12px;color:${r.calc.cor};font-weight:700">${r.calc.label}</td>
            <td style="padding:8px 12px;text-align:center">${r.calc.valor}</td>
          </tr>`;
        }).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:20px">Nenhum colaborador</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function mzAbrirIncentivoConfig() {
  const c = _mzIncentivo;
  const modal = document.createElement('div');
  modal.id = 'mz-modal-incentivo';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  const linha = (label, key) => `
    <div style="margin-bottom:10px">
      <label style="font-size:10px;font-weight:700;color:var(--text3)">${label} — ÓTIMO / MEDIANO / RUIM</label>
      <div style="display:flex;gap:8px;margin-top:4px">
        <input id="mzin-${key}_green" type="number" value="${c[key+'_green']}" style="flex:1;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;background:var(--surface);color:var(--green);font-weight:700;text-align:center">
        <input id="mzin-${key}_yellow" type="number" value="${c[key+'_yellow']}" style="flex:1;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;background:var(--surface);color:var(--amber);font-weight:700;text-align:center">
        <input id="mzin-${key}_red" type="number" value="${c[key+'_red']}" style="flex:1;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;background:var(--surface);color:var(--red);font-weight:700;text-align:center">
      </div>
    </div>`;
  modal.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:22px;max-width:420px;width:100%">
      <div style="font-weight:900;font-size:15px;margin-bottom:14px">Pontos por nível</div>
      ${linha('Absenteísmo','abs')}
      ${linha('Performance','perf')}
      ${linha('Comportamento','comp')}
      <div style="display:flex;gap:10px;margin-top:8px">
        <button class="btn btn-outline" style="flex:1" onclick="document.getElementById('mz-modal-incentivo').remove()">Cancelar</button>
        <button class="btn btn-primary" style="flex:1" onclick="mzSalvarIncentivo()">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function mzSalvarIncentivo() {
  const campos = ['abs_green','abs_yellow','abs_red','perf_green','perf_yellow','perf_red','comp_green','comp_yellow','comp_red'];
  const body = {};
  campos.forEach(c => { body[c] = parseInt(document.getElementById(`mzin-${c}`).value) || 0; });
  try {
    _mzIncentivo = await _mzFetch('/matriz/incentivo', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    document.getElementById('mz-modal-incentivo')?.remove();
    toast('Configuração de incentivo salva!','sucesso');
    _mzRenderIncentivo();
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
}

/* ── Plano de Carreira ── */
async function mzCarregarCarreira() {
  _mzCarreira = await _mzFetch('/matriz/carreira');
  _mzCarregado.carreira = true;
}

function _mzNormalizeName(s) {
  return (s||'').toString().normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[°.]/g,'').trim().replace(/\s+/g,' ');
}
function _mzCarreiraCargoIndex(area, cargoAtual) {
  const ladder = (_mzCarreira?.ladder || {})[area];
  if (!ladder) return -1;
  const cargoNorm = _mzNormalizeName(cargoAtual).replace(/\bn1\b/,'').trim();
  return ladder.findIndex(c => _mzNormalizeName(c) === cargoNorm);
}
function _mzProximoNivel(area, cargoAtual) {
  const ladder = (_mzCarreira?.ladder || {})[area];
  if (!ladder) return null;
  const idx = _mzCarreiraCargoIndex(area, cargoAtual);
  if (idx === -1) return null;
  if (idx < ladder.length-1) return { cargo: ladder[idx+1], area, transversal:false };
  if (area !== 'Estoque') return { cargo:'Coordenador de Logística', area:'Logística', transversal:true };
  return null;
}
function _mzFindJDCarreira(cargo, area) {
  if (!cargo) return null;
  const cargoNorm = _mzNormalizeName(cargo).replace(/\bn1\b/,'').trim();
  let jd = _mzCargos.find(j => _mzNormalizeName(j.cargo)===cargoNorm && _mzNormalizeName(j.area)===_mzNormalizeName(area||''));
  if (jd) return jd;
  jd = _mzCargos.find(j => _mzNormalizeName(j.cargo)===cargoNorm);
  if (jd) return jd;
  const fallback = { 'auxiliar de estoque': {cargo:'Estoquista', area:'Estoque'} };
  const fb = fallback[_mzNormalizeName(cargo)];
  if (fb) return _mzCargos.find(j => _mzNormalizeName(j.cargo)===_mzNormalizeName(fb.cargo) && _mzNormalizeName(j.area)===_mzNormalizeName(fb.area));
  return null;
}

function _mzPlanoCarreiraHtml(col) {
  if (!col.area || !col.cargo) return '<div style="font-size:11px;color:var(--text3)">Sem cargo/área confirmado — não é possível montar o plano de carreira.</div>';
  const proximo = _mzProximoNivel(col.area, col.cargo);
  const atualJd = _mzFindJDCarreira(col.cargo, col.area);
  const box = (label, cargo, area, jd) => `
    <div style="flex:1;min-width:180px;background:var(--surface2);border-radius:10px;padding:10px 12px">
      <div style="font-size:9px;font-weight:800;color:var(--text3)">${label}</div>
      <div style="font-weight:800;font-size:13px;margin-top:2px">${pfEsc(cargo)} — ${pfEsc(area)}</div>
      ${jd && (jd.funcoes||[]).length ? `<ul style="margin:6px 0 0;padding-left:16px;font-size:11px;color:var(--text2)">${jd.funcoes.slice(0,3).map(f=>`<li>${pfEsc(f)}</li>`).join('')}</ul>` : '<div style="font-size:10.5px;color:var(--text3);margin-top:4px">Job description não cadastrado.</div>'}
    </div>`;
  if (!proximo) {
    return `<div style="display:flex;gap:10px;flex-wrap:wrap">${box('HOJE', col.cargo, col.area, atualJd)}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:8px">Este colaborador já está no topo da trilha de carreira mapeada para esta área.</div>`;
  }
  const proxJd = _mzFindJDCarreira(proximo.cargo, proximo.area);
  return `<div style="display:flex;gap:10px;flex-wrap:wrap">
    ${box('HOJE', col.cargo, col.area, atualJd)}
    ${box(`PRÓXIMO NÍVEL${proximo.transversal?' (transversal)':''}`, proximo.cargo, proximo.area, proxJd)}
  </div>`;
}

let _mzCarreiraArea = null;

function _mzRenderCarreira() {
  const cont = document.getElementById('mz-conteudo');
  const ladder = _mzCarreira?.ladder || {};
  const areas = Object.keys(ladder);
  if (!_mzCarreiraArea || !areas.includes(_mzCarreiraArea)) _mzCarreiraArea = areas[0];

  const trilha = _mzCarreiraArea ? (ladder[_mzCarreiraArea]||[]) : [];
  const trilhaHtml = trilha.map((cargo,i) => {
    const jd = _mzFindJDCarreira(cargo, _mzCarreiraArea);
    return `<div style="display:flex;gap:12px;margin-bottom:10px">
      <div style="width:26px;flex-shrink:0;display:flex;flex-direction:column;align-items:center">
        <div style="width:10px;height:10px;border-radius:50%;background:var(--accent);flex-shrink:0"></div>
        ${i<trilha.length-1?'<div style="flex:1;width:2px;background:var(--border);margin-top:4px"></div>':''}
      </div>
      <div class="card" style="margin-bottom:0;flex:1">
        <div style="font-size:9px;font-weight:800;color:var(--text3)">NÍVEL ${i+1}</div>
        <div style="font-weight:800;font-size:13px;margin-top:2px">${pfEsc(cargo)}</div>
        ${jd ? `${jd.descricao?`<div style="font-size:11.5px;color:var(--text2);margin-top:6px">${pfEsc(jd.descricao)}</div>`:''}${(jd.funcoes||[]).length?`<ul style="margin:6px 0 0;padding-left:16px;font-size:11px;color:var(--text2)">${jd.funcoes.slice(0,3).map(f=>`<li>${pfEsc(f)}</li>`).join('')}</ul>`:''}` : '<div style="font-size:11px;color:var(--text3);margin-top:6px">Job description ainda não cadastrado.</div>'}
      </div>
    </div>`;
  }).join('') + (_mzCarreiraArea && _mzCarreiraArea!=='Estoque' ? `
    <div style="display:flex;gap:12px">
      <div style="width:26px;flex-shrink:0;display:flex;flex-direction:column;align-items:center">
        <div style="width:10px;height:10px;border-radius:50%;background:var(--amber);flex-shrink:0"></div>
      </div>
      <div class="card" style="margin-bottom:0;flex:1;border-style:dashed;background:transparent">
        <div style="font-size:9px;font-weight:800;color:var(--amber)">PRÓXIMO PASSO</div>
        <div style="font-weight:800;font-size:14px;margin-top:2px">Coordenador de Logística → Gerente de Logística</div>
        <div style="font-size:11.5px;color:var(--text2);margin-top:6px">Ao chegar ao topo da trilha operacional, o crescimento passa a ser transversal — deixa de ser específico de uma área e passa a coordenar/gerenciar as quatro (Reposição, Separação, Checkout, Embalagem) ao mesmo tempo.</div>
      </div>
    </div>` : '');

  cont.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${areas.map(a => `<button onclick="_mzCarreiraArea='${a.replace(/'/g,"\\'")}';_mzRenderCarreira()" style="padding:6px 12px;background:${a===_mzCarreiraArea?'var(--accent)':'var(--surface2)'};border:none;border-radius:20px;color:${a===_mzCarreiraArea?'#fff':'var(--text2)'};font-size:11.5px;font-weight:700;cursor:pointer">${pfEsc(a)}</button>`).join('')}
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline btn-sm" onclick="mzNovaAreaCarreira()">+ Nova área</button>
        <button class="btn btn-outline btn-sm" onclick="mzAbrirEditarCarreira()">Editar trilhas</button>
      </div>
    </div>
    ${areas.length ? trilhaHtml : '<div class="card" style="text-align:center;color:var(--text3);padding:20px">Nenhuma trilha cadastrada</div>'}`;
}

async function mzNovaAreaCarreira() {
  const nome = prompt('Nome da nova área:');
  if (!nome) return;
  const ladder = { ...(_mzCarreira?.ladder || {}) };
  if (ladder[nome]) { toast('Essa área já existe.','aviso'); return; }
  ladder[nome] = [];
  try {
    _mzCarreira = await _mzFetch('/matriz/carreira', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ladder }) });
    _mzCarreiraArea = nome;
    toast('Área criada!','sucesso');
    _mzRenderCarreira();
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
}

function mzAbrirEditarCarreira() {
  const ladder = _mzCarreira?.ladder || {};
  const texto = Object.entries(ladder).map(([area,cargos]) => `${area}: ${(cargos||[]).join(', ')}`).join('\n');
  const modal = document.createElement('div');
  modal.id = 'mz-modal-carreira';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:22px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto">
      <div style="font-weight:900;font-size:15px;margin-bottom:8px">Editar trilhas de carreira</div>
      <p style="font-size:11.5px;color:var(--text3);margin:0 0 10px">Uma área por linha, no formato "Área: Cargo nível 1, Cargo nível 2, Cargo nível 3". Pode adicionar áreas novas ou remover linhas — só não pode ficar em branco.</p>
      <textarea id="mzcr-texto" style="width:100%;min-height:220px;padding:10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12.5px;resize:vertical;box-sizing:border-box;font-family:inherit">${pfEsc(texto)}</textarea>
      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn btn-outline" style="flex:1" onclick="document.getElementById('mz-modal-carreira').remove()">Cancelar</button>
        <button class="btn btn-primary" style="flex:1" onclick="mzSalvarCarreira()">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function mzSalvarCarreira() {
  const linhas = document.getElementById('mzcr-texto').value.split('\n').map(l=>l.trim()).filter(Boolean);
  const ladder = {};
  linhas.forEach(linha => {
    const idx = linha.indexOf(':');
    if (idx===-1) return;
    const area = linha.slice(0,idx).trim();
    const cargos = linha.slice(idx+1).split(',').map(c=>c.trim()).filter(Boolean);
    if (area && cargos.length) ladder[area] = cargos;
  });
  if (!Object.keys(ladder).length) { toast('Informe pelo menos uma área com cargos.','aviso'); return; }
  try {
    _mzCarreira = await _mzFetch('/matriz/carreira', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ladder }) });
    _mzCarreiraArea = null;
    document.getElementById('mz-modal-carreira')?.remove();
    toast('Plano de carreira salvo!','sucesso');
    _mzRenderCarreira();
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
}

/* ── Organograma (liderança + times por turno, com CRUD de colaborador) ── */
const MZ_TURNOS = ['1° Turno', '2° Turno', '3° Turno'];
let _mzOrgTurno = '1° Turno';

function _mzRenderOrganograma() {
  const cont = document.getElementById('mz-conteudo');
  const gerente = _mzColaboradores.find(c => c.tier === 'gerente');
  const coordenador = _mzColaboradores.find(c => c.tier === 'coordenador');
  const branches = _mzColaboradores.filter(c => c.tier === 'supervisor' && (c.area === 'Supervisão' || c.area === 'Prevenção de Protocolos'));

  const membros = _mzColaboradores.filter(c => c.turno === _mzOrgTurno && c.tier !== 'gerente' && c.tier !== 'coordenador' && c.ativo);
  const porArea = {};
  membros.forEach(p => { const a = p.area || 'Sem área'; (porArea[a] = porArea[a] || []).push(p); });

  const desligados = [..._mzColaboradores].filter(c => !c.ativo).sort((a,b) => (a.nome||'').localeCompare(b.nome||''));

  cont.innerHTML = `
    ${(gerente || coordenador || branches.length) ? `
    <div class="card" style="margin-bottom:14px;text-align:center">
      ${gerente ? `<div style="display:inline-block;padding:10px 18px;border-radius:10px;background:var(--surface2);font-weight:800;font-size:13px">${pfEsc(gerente.nome)}<div style="font-size:10px;color:var(--text3);font-weight:600">${pfEsc(gerente.cargo||'')}</div></div>` : ''}
      ${coordenador ? `<div style="margin:8px auto 0;display:inline-block;padding:10px 18px;border-radius:10px;background:var(--surface2);font-weight:800;font-size:13px">${pfEsc(coordenador.nome)}<div style="font-size:10px;color:var(--text3);font-weight:600">${pfEsc(coordenador.cargo||'')}</div></div>` : ''}
      ${branches.length ? `<div style="display:flex;justify-content:center;flex-wrap:wrap;gap:8px;margin-top:12px">
        ${branches.map(b => `<div style="padding:8px 14px;border-radius:10px;background:var(--surface2);font-size:12px;font-weight:700;${b.vaga?'border:1.5px dashed var(--amber);color:var(--amber)':''}">${pfEsc(b.nome)}${b.vaga?' (vaga)':''}<div style="font-size:9px;color:var(--text3);font-weight:600">${pfEsc(b.cargo||'')}${b.turno?' · '+pfEsc(b.turno):''}</div></div>`).join('')}
      </div>` : ''}
    </div>` : ''}

    <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">
      ${MZ_TURNOS.map(t => `<button onclick="_mzOrgTurno='${t}';_mzRenderOrganograma()" style="padding:7px 13px;background:${_mzOrgTurno===t?'var(--accent)':'var(--surface2)'};border:none;border-radius:20px;color:${_mzOrgTurno===t?'#fff':'var(--text2)'};font-size:11.5px;font-weight:700;cursor:pointer">${t}</button>`).join('')}
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
      ${Object.entries(porArea).map(([area, pessoas]) => `
        <div class="card" style="margin-bottom:0">
          <div style="font-weight:800;font-size:12.5px;margin-bottom:8px">${pfEsc(area)}</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${pessoas.map(p => `
              <div style="background:var(--surface2);border-radius:8px;padding:8px 10px">
                <div style="font-weight:700;font-size:12px">${pfEsc(p.nome)}</div>
                <div style="font-size:10.5px;color:var(--text3);margin-top:1px">${pfEsc(p.cargo||'')}</div>
                <button class="btn btn-outline btn-sm" style="margin-top:6px;padding:3px 8px;font-size:10.5px" onclick="mzAbrirColaborador(${p.id})">Editar</button>
              </div>`).join('')}
          </div>
        </div>`).join('') || `<div class="card" style="text-align:center;color:var(--text3);padding:20px">Nenhum colaborador nesse turno</div>`}
    </div>
    <div style="margin-top:14px">
      <button class="btn btn-outline btn-sm" onclick="mzAbrirColaborador(null,'${_mzOrgTurno}')">+ novo colaborador — ${_mzOrgTurno}</button>
    </div>

    ${desligados.length ? `
    <div style="margin-top:28px">
      <div style="font-weight:800;font-size:13px;margin-bottom:6px">Ex-colaboradores</div>
      <p style="font-size:11px;color:var(--text3);margin-bottom:10px">Desligados, mantidos só para histórico. Excluir aqui apaga a pessoa e todo o histórico dela (banco de horas, férias, classificações, feedbacks) permanentemente.</p>
      <div class="card" style="padding:0;overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <thead><tr style="background:var(--surface2)">
            <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">NOME</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">CARGO</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">TURNO</th>
            <th style="padding:8px 12px"></th>
          </tr></thead>
          <tbody>${desligados.map(c => `
            <tr style="border-top:1px solid var(--border)">
              <td style="padding:8px 12px;font-weight:700">${pfEsc(c.nome)}</td>
              <td style="padding:8px 12px;color:var(--text2)">${pfEsc(c.cargo||'—')}</td>
              <td style="padding:8px 12px;color:var(--text2)">${pfEsc(c.turno||'—')}</td>
              <td style="padding:8px 12px;text-align:right"><button class="btn btn-outline btn-sm" style="color:var(--red);border-color:var(--red)" onclick="mzExcluirColaborador(${c.id})">Excluir</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}`;
}

/* ── Painel do Colaborador (visão agregada de tudo, um por vez) ── */

// Critério "3.2 Performance": Ótimo ≥90% · Mediano 70–89% · Ruim <70%
function _mzPerformancePct(meta, entregue) {
  const m = parseFloat(meta), e = parseFloat(entregue);
  if (!m || isNaN(m) || isNaN(e)) return null;
  return Math.round((e / m) * 100);
}
function _mzStatusPorFaixa(pct) {
  if (pct == null) return null;
  if (pct >= 90) return { cor:'var(--green)', bg:'rgba(22,163,74,.12)', label:'🟢 Ótimo' };
  if (pct >= 70) return { cor:'var(--amber)', bg:'rgba(217,119,6,.12)', label:'🟡 Mediano' };
  return { cor:'var(--red)', bg:'rgba(220,38,38,.12)', label:'🔴 Ruim' };
}
// Critério "3.1 Absenteísmo": atrasos em minutos no mês (não qtd de ocorrências).
// Ótimo: 0 faltas injust. · até 10min atraso · 0 ausências | Mediano: 0 faltas · até 30min · até 1 ausência | Ruim: senão
function _mzStatusAbsenteismo(atrasosMin, faltasInj, ausJust) {
  if (atrasosMin == null && faltasInj == null && ausJust == null) return null;
  const min = Number(atrasosMin) || 0, fi = Number(faltasInj) || 0, aj = Number(ausJust) || 0;
  if (fi >= 1 || min > 30 || aj >= 2) return { cor:'var(--red)', bg:'rgba(220,38,38,.12)', label:'🔴 Ruim' };
  if (min <= 10 && aj === 0) return { cor:'var(--green)', bg:'rgba(22,163,74,.12)', label:'🟢 Ótimo' };
  return { cor:'var(--amber)', bg:'rgba(217,119,6,.12)', label:'🟡 Mediano' };
}

function _mzFeedbackCardHtml(f) {
  const pct = (f.meta != null && f.entregue != null) ? _mzPerformancePct(f.meta, f.entregue) : null;
  const stPerf = _mzStatusPorFaixa(pct);
  const stAbs = _mzStatusAbsenteismo(f.atrasos, f.faltas_injustificadas, f.ausencias_justificadas);
  const grid = (bg, cols) => `<div style="display:grid;grid-template-columns:repeat(${cols.length},1fr);gap:8px;background:${bg};border-radius:8px;padding:10px 12px">
    ${cols.map(([label,valor,cor]) => `<div><div style="font-size:9px;color:var(--text3)">${label}</div><div style="font-size:13px;font-weight:800;${cor?`color:${cor}`:''}">${valor}</div></div>`).join('')}
  </div>`;
  return `
    <div style="background:var(--surface2);border-radius:10px;margin-bottom:8px;overflow:hidden">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px;cursor:pointer" onclick="mzToggleFeedback(${f.id})">
        <div style="font-weight:800;font-size:12.5px">${pfEsc(f.mes||'Sem data')}${f.cargo_snapshot?` · ${pfEsc(f.cargo_snapshot)}`:''}${f.area_snapshot?` · ${pfEsc(f.area_snapshot)}`:''}</div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
          <button class="btn btn-outline btn-sm" style="padding:3px 8px;font-size:10.5px" onclick="event.stopPropagation();mzAbrirFeedback(${f.id})">Editar</button>
          <button class="btn btn-outline btn-sm" style="padding:3px 8px;font-size:10.5px;color:var(--red);border-color:var(--red)" onclick="event.stopPropagation();mzExcluirFeedback(${f.id})">Excluir</button>
          <span id="mzfb-chevron-${f.id}" style="font-size:11px;color:var(--text3);transition:transform .2s ease">▾</span>
        </div>
      </div>
      <div id="mzfb-body-${f.id}" style="display:none;padding:0 12px 12px">
        ${pct != null ? `<div style="margin-top:2px">
          <div style="font-size:10px;font-weight:800;color:var(--text3);margin-bottom:4px">1 — META X ENTREGUE</div>
          ${grid(stPerf.bg, [['META',f.meta],['ENTREGUE',f.entregue],['%',pct+'%',stPerf.cor],['STATUS',stPerf.label,stPerf.cor]])}
        </div>` : ''}
        ${f.pontos_positivos?`<div style="font-size:11.5px;margin-top:8px"><b>2 — Pontos positivos:</b> ${pfEsc(f.pontos_positivos)}</div>`:''}
        ${f.pontos_construtivos?`<div style="font-size:11.5px;margin-top:6px"><b>3 — Pontos construtivos:</b> ${pfEsc(f.pontos_construtivos)}</div>`:''}
        ${stAbs ? `<div style="margin-top:8px">
          <div style="font-size:10px;font-weight:800;color:var(--text3);margin-bottom:4px">4 — ABSENTEÍSMO DO MÊS: RESUMO</div>
          ${grid(stAbs.bg, [['ATRASOS (MIN)',f.atrasos||0],['FALTAS INJUST.',f.faltas_injustificadas||0],['AUSÊNCIAS JUST.',f.ausencias_justificadas||0],['STATUS',stAbs.label,stAbs.cor]])}
        </div>` : ''}
        ${f.absenteismo_mes?`<div style="font-size:11.5px;margin-top:8px"><b>4 — Absenteísmo do mês: detalhes</b><div style="color:var(--text2);margin-top:2px">${pfEsc(f.absenteismo_mes)}</div></div>`:''}
        ${f.retorno_antecipado?`<div style="font-size:11.5px;margin-top:6px"><b>5 — Retorno antecipado:</b> ${pfEsc(f.retorno_antecipado)}</div>`:''}
        ${f.recorrencia_ausencia?`<div style="font-size:11.5px;margin-top:6px"><b>6 — Recorrência de ausência:</b> ${pfEsc(f.recorrencia_ausencia)}</div>`:''}
        ${f.outros_pontos?`<div style="font-size:11.5px;margin-top:6px"><b>7 — Outros pontos:</b> ${pfEsc(f.outros_pontos)}</div>`:''}
        ${f.saldo_banco_horas?`<div style="font-size:11.5px;margin-top:6px"><b>8 — Saldo banco de horas:</b> ${pfEsc(f.saldo_banco_horas)}</div>`:''}
        ${f.combinado_mes?`<div style="font-size:11.5px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)"><b>9 — Combinado deste mês:</b> ${pfEsc(f.combinado_mes)}</div>`:''}
      </div>
    </div>`;
}

function mzToggleFeedback(id) {
  const body = document.getElementById(`mzfb-body-${id}`);
  const chevron = document.getElementById(`mzfb-chevron-${id}`);
  if (!body) return;
  const abrindo = body.style.display === 'none';
  body.style.display = abrindo ? 'block' : 'none';
  if (chevron) chevron.style.transform = abrindo ? 'rotate(180deg)' : '';
}

function _mzRenderPainel() {
  const cont = document.getElementById('mz-conteudo');
  const ativos = [..._mzColaboradores].sort((a,b)=>(a.nome||'').localeCompare(b.nome||''));
  if (!_mzPainelColabId && ativos.length) _mzPainelColabId = ativos[0].id;
  const opts = ativos.map(c => `<option value="${c.id}" ${c.id===_mzPainelColabId?'selected':''}>${pfEsc(c.nome)}</option>`).join('');
  cont.innerHTML = `
    <div style="margin-bottom:14px">
      <select onchange="_mzPainelColabId=parseInt(this.value);_mzRenderPainel()" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;font-weight:700">${opts}</select>
    </div>
    <div id="mz-painel-corpo"></div>`;
  const c = _mzColaboradores.find(x => x.id === _mzPainelColabId);
  const corpo = document.getElementById('mz-painel-corpo');
  if (!c) { corpo.innerHTML = ''; return; }

  const fbs = _mzFeedbacks.filter(f => f.colaborador_id === c.id).sort((a,b)=>(a.created_at||'').localeCompare(b.created_at||''));
  const ultimoFb = fbs.length ? fbs[fbs.length-1] : null;
  const cls = _mzClassificacoes.filter(x => x.colaborador_id === c.id).sort((a,b)=>(b.periodo_label||'').localeCompare(a.periodo_label||''))[0];
  const aus = _mzAusencias.filter(a => a.colaborador_id === c.id);
  const bh = _mzBancoHoras.find(b => b.colaborador_id === c.id);
  const fer = _mzFerias.filter(f => f.colaborador_id === c.id);
  const dot = v => `<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${MZ_SEMAFORO[v]||'var(--border)'}"></span>`;

  const jd = _mzFindJDCarreira(c.cargo, c.area);
  const jdHtml = !jd
    ? '<div style="font-size:12px;color:var(--text3)">Nenhuma descrição de cargo cadastrada para este cargo.</div>'
    : `${jd.descricao?`<p style="font-size:12px;color:var(--text2);margin:0 0 8px">${pfEsc(jd.descricao)}</p>`:''}${(jd.funcoes||[]).length?`<div style="font-size:10px;font-weight:800;color:var(--text3);margin-bottom:4px">FUNÇÕES</div><ul style="margin:0;padding-left:18px;font-size:12px;color:var(--text2)">${jd.funcoes.map(f=>`<li>${pfEsc(f)}</li>`).join('')}</ul>`:''}`;
  const planoCarreiraHtml = _mzPlanoCarreiraHtml(c);

  corpo.innerHTML = `
    <div class="card" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
        <div>
          <div style="font-weight:900;font-size:16px">${pfEsc(c.nome)}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px">${pfEsc(c.cargo||'—')} · ${pfEsc(c.area||'—')} · ${pfEsc(c.turno||'sem turno')}</div>
        </div>
        ${cls ? `<div style="display:flex;gap:14px;text-align:center">
          <div>${dot(cls.absenteismo)}<div style="font-size:9px;color:var(--text3);margin-top:3px">ABSENT.</div></div>
          <div>${dot(cls.performance)}<div style="font-size:9px;color:var(--text3);margin-top:3px">PERFORM.</div></div>
          <div>${dot(cls.comportamento)}<div style="font-size:9px;color:var(--text3);margin-top:3px">COMPORT.</div></div>
        </div>` : '<span style="font-size:11px;color:var(--text3)">Sem classificação no período</span>'}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:12px">
      <div class="tile" style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:10px;color:var(--text3)">BANCO DE HORAS</div><div style="font-size:18px;font-weight:800;margin-top:4px">${bh?_mzFmtH(bh.saldo_atual||0):'—'}</div></div>
      <div class="tile" style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:10px;color:var(--text3)">AUSÊNCIAS REGISTRADAS</div><div style="font-size:18px;font-weight:800;margin-top:4px">${aus.length}</div></div>
      <div class="tile" style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:10px;color:var(--text3)">FEEDBACKS</div><div style="font-size:18px;font-weight:800;margin-top:4px">${fbs.length}</div></div>
    </div>
    <div class="card" style="margin-bottom:12px">
      <div style="font-weight:800;font-size:12px;margin-bottom:8px">Férias</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px">
        ${['limite','p1','p2'].map(t => { const f = fer.find(x=>x.tipo===t); return `<div><b>${t==='limite'?'Limite':t.toUpperCase()}:</b> ${f?.data_inicio?fmtData(f.data_inicio):'—'}${f?.dias?` (${f.dias}d)`:''}</div>`; }).join('')}
      </div>
    </div>
    <div class="card" style="margin-bottom:12px">
      <div style="font-weight:800;font-size:12px;margin-bottom:8px">Ausências</div>
      ${aus.slice(0,5).map(a => `<div style="padding:6px 0;border-top:1px solid var(--border);font-size:12px">${pfEsc(a.periodo_label)} — ${a.dias} dia(s) ${a.motivo?`· ${pfEsc(a.motivo)}`:''}</div>`).join('') || '<div style="font-size:12px;color:var(--text3)">Nenhuma ausência registrada</div>'}
    </div>
    <div class="card" style="margin-bottom:12px">
      <div style="font-weight:800;font-size:12px;margin-bottom:8px">Job Description</div>
      ${jdHtml}
    </div>
    <div class="card" style="margin-bottom:12px">
      <div style="font-weight:800;font-size:12px;margin-bottom:8px">Plano de Carreira</div>
      ${planoCarreiraHtml}
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="font-weight:800;font-size:12px">Registro Mensal</div>
        <button class="btn btn-primary btn-sm" onclick="mzAbrirFeedback()">+ Novo feedback</button>
      </div>
      <p style="font-size:10.5px;color:var(--text3);margin-bottom:10px;line-height:1.5">Regra de ouro: antes de cada nova conversa, releia o "Combinado deste mês" da linha anterior. Uma linha = uma conversa. O histórico se acumula mês a mês.</p>
      ${ultimoFb ? `<div style="background:rgba(217,119,6,.12);border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:11.5px">
        <b>📌 Combinado do último ciclo (${pfEsc(ultimoFb.mes||'—')}):</b> ${pfEsc(ultimoFb.combinado_mes || 'Nenhum combinado foi registrado no último ciclo.')}
      </div>` : ''}
      ${fbs.length ? fbs.map(_mzFeedbackCardHtml).join('') : '<div style="font-size:12px;color:var(--text3)">Nenhum feedback registrado ainda</div>'}
    </div>`;
}
