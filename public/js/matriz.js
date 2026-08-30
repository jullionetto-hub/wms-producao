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
const MZ_STATUS_COR = { Executa:'#16a34a', Garante:'#2563eb', Acompanha:'#7c3aed', Apoia:'#d97706', Sim:'#16a34a', 'Não':'#6b7280' };

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
  incentivo:      { deps:['incentivo'],                                render:'_mzRenderIncentivo' },
  carreira:       { deps:['carreira'],                                 render:'_mzRenderCarreira' },
  organograma:    { deps:['colaboradores'],                            render:'_mzRenderOrganograma' },
  painel:         { deps:['colaboradores','feedbacks','classificacoes','ausencias','bancoHoras','ferias','raci'], render:'_mzRenderPainel' },
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

function _mzRenderRaci() {
  const cont = document.getElementById('mz-conteudo');
  if (!_mzRaci.length) {
    cont.innerHTML = `<div class="card" style="text-align:center;color:var(--text3);padding:30px">Nenhuma área cadastrada na Matriz ainda.</div>`;
    return;
  }
  cont.innerHTML = _mzRaci.map(area => `
    <div class="card" style="margin-bottom:14px;overflow-x:auto">
      <div style="font-weight:800;font-size:13px;margin-bottom:10px">${pfEsc(area.nome)}</div>
      <table style="width:100%;border-collapse:collapse;font-size:11.5px;min-width:${300+area.roles.length*130}px">
        <thead><tr style="background:var(--surface2)">
          <th style="padding:6px 10px;text-align:left;font-size:10px;font-weight:800;color:var(--text3);min-width:220px">ATIVIDADE</th>
          ${area.roles.map(r => `<th style="padding:6px 10px;text-align:center;font-size:10px;font-weight:800;color:var(--text3);min-width:120px">${pfEsc(r.nome)}</th>`).join('')}
        </tr></thead>
        <tbody>${area.atividades.map(at => `
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:6px 10px;font-weight:600">${pfEsc(at.nome)}${at.categoria?`<div style="font-size:9px;color:var(--text3);font-weight:400">${pfEsc(at.categoria)}</div>`:''}</td>
            ${area.roles.map(r => {
              const st = at.status.find(s => s.role_id === r.id)?.status || '';
              const cor = MZ_STATUS_COR[st] || 'var(--text3)';
              return `<td style="padding:4px 8px;text-align:center">
                <select onchange="mzDefinirStatus(${at.id},${r.id},this.value)" style="padding:3px 6px;border-radius:6px;border:1.5px solid ${cor};background:transparent;color:${cor};font-size:11px;font-weight:700;cursor:pointer">
                  <option value="" ${!st?'selected':''}>—</option>
                  ${MZ_STATUS_OPCOES.map(o => `<option value="${o}" ${st===o?'selected':''}>${o}</option>`).join('')}
                </select>
              </td>`;
            }).join('')}
          </tr>`).join('') || `<tr><td colspan="${area.roles.length+1}" style="text-align:center;color:var(--text3);padding:14px">Sem atividades nessa área</td></tr>`}
        </tbody>
      </table>
    </div>`).join('');
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

let _mzPeriodoSel = null;

function _mzRenderClassificacoes() {
  const cont = document.getElementById('mz-conteudo');
  if (!_mzPeriodoSel) {
    const periodos = [...new Set(_mzClassificacoes.map(c => c.periodo_label))].sort().reverse();
    _mzPeriodoSel = periodos[0] || _mzPeriodoAtualLabel();
  }
  const periodoSel = _mzPeriodoSel;
  cont.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <label style="font-size:11px;font-weight:700;color:var(--text3)">PERÍODO</label>
      <input id="mz-cl-periodo" value="${pfEsc(periodoSel)}" style="padding:6px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px" onchange="_mzPeriodoSel=this.value;_mzRenderClassificacoes()">
    </div>
    <div class="card" style="padding:0;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead><tr style="background:var(--surface2)">
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">COLABORADOR</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3)">ABSENTEÍSMO</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3)">PERFORMANCE</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3)">COMPORTAMENTO</th>
        </tr></thead>
        <tbody>${[..._mzColaboradores].filter(c=>c.ativo).sort((a,b)=>(a.nome||'').localeCompare(b.nome||'')).map(c => {
          const cl = _mzClassificacoes.find(x => x.colaborador_id === c.id && x.periodo_label === periodoSel) || {};
          const dot = (campo, valor) => {
            const cor = MZ_SEMAFORO[valor] || 'var(--border)';
            return `<button onclick="mzCicloClassificacao(${c.id},'${campo}',this)" data-campo="${campo}" data-colab="${c.id}" title="Clique pra mudar"
              style="width:22px;height:22px;border-radius:50%;background:${cor};border:2px solid ${valor?cor:'var(--border)'};cursor:pointer"></button>`;
          };
          return `<tr style="border-top:1px solid var(--border)">
            <td style="padding:8px 12px;font-weight:700">${pfEsc(c.nome)}</td>
            <td style="padding:8px 12px;text-align:center">${dot('absenteismo', cl.absenteismo)}</td>
            <td style="padding:8px 12px;text-align:center">${dot('performance', cl.performance)}</td>
            <td style="padding:8px 12px;text-align:center">${dot('comportamento', cl.comportamento)}</td>
          </tr>`;
        }).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:20px">Nenhum colaborador ativo</td></tr>`}
        </tbody>
      </table>
    </div>
    <p style="font-size:11px;color:var(--text3);margin-top:8px">Clique na bolinha pra alternar: sem cor → verde → amarelo → vermelho → sem cor.</p>`;
}

function _mzPeriodoAtualLabel() {
  return new Date().toLocaleDateString('pt-BR', { month:'long', year:'numeric' });
}

async function mzCicloClassificacao(colaboradorId, campo, btnEl) {
  const periodo = _mzPeriodoSel || _mzPeriodoAtualLabel();
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

function _mzRenderAusencias() {
  const cont = document.getElementById('mz-conteudo');
  const lista = [..._mzAusencias].sort((a,b) => (b.data||'').localeCompare(a.data||''));
  cont.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
      <button class="btn btn-primary btn-sm" onclick="mzAbrirAusencia()">+ Nova ausência</button>
    </div>
    <div class="card" style="padding:0;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead><tr style="background:var(--surface2)">
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">COLABORADOR</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">PERÍODO</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3)">DIAS</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">DATA</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">MOTIVO</th>
          <th style="padding:8px 12px"></th>
        </tr></thead>
        <tbody>${lista.map(a => `
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:8px 12px;font-weight:700">${pfEsc(_mzColNome(a.colaborador_id))}</td>
            <td style="padding:8px 12px;color:var(--text2)">${pfEsc(a.periodo_label||'—')}</td>
            <td style="padding:8px 12px;text-align:center">${a.dias??1}</td>
            <td style="padding:8px 12px;color:var(--text2)">${pfEsc(a.data||'—')}</td>
            <td style="padding:8px 12px;color:var(--text2)">${pfEsc(a.motivo||'—')}</td>
            <td style="padding:8px 12px;text-align:right"><button class="btn btn-outline btn-sm" style="color:var(--red);border-color:var(--red)" onclick="mzExcluirAusencia(${a.id})">Excluir</button></td>
          </tr>`).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:20px">Nenhuma ausência registrada</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function mzAbrirAusencia() {
  const modal = document.createElement('div');
  modal.id = 'mz-modal-aus';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  const colOpts = [..._mzColaboradores].sort((a,b)=>(a.nome||'').localeCompare(b.nome||'')).map(c=>`<option value="${c.id}">${pfEsc(c.nome)}</option>`).join('');
  modal.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:22px;max-width:420px;width:100%">
      <div style="font-weight:900;font-size:15px;margin-bottom:14px">Nova ausência</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">COLABORADOR</label>
          <select id="mza-colab" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px">${colOpts}</select></div>
        <div style="display:flex;gap:10px">
          <div style="flex:1"><label style="font-size:10px;font-weight:700;color:var(--text3)">PERÍODO</label>
            <input id="mza-periodo" placeholder="Agosto 2026" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
          <div style="width:80px"><label style="font-size:10px;font-weight:700;color:var(--text3)">DIAS</label>
            <input id="mza-dias" type="number" value="1" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
        </div>
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">DATA(S)</label>
          <input id="mza-data" placeholder="17/08 e 18/08" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">MOTIVO</label>
          <textarea id="mza-motivo" style="width:100%;min-height:60px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;resize:vertical;box-sizing:border-box"></textarea></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:18px">
        <button class="btn btn-outline" style="flex:1" onclick="document.getElementById('mz-modal-aus').remove()">Cancelar</button>
        <button class="btn btn-primary" style="flex:1" onclick="mzSalvarAusencia()">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function mzSalvarAusencia() {
  const colId = parseInt(document.getElementById('mza-colab').value);
  if (!colId) { toast('Selecione o colaborador.','aviso'); return; }
  const body = {
    colaborador_id: colId,
    periodo_label: document.getElementById('mza-periodo').value.trim(),
    dias: parseInt(document.getElementById('mza-dias').value) || 1,
    data: document.getElementById('mza-data').value.trim(),
    motivo: document.getElementById('mza-motivo').value.trim(),
  };
  if (!body.periodo_label) { toast('Informe o período.','aviso'); return; }
  try {
    await _mzFetch('/matriz/ausencias', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
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

function _mzRenderBancoHoras() {
  const cont = document.getElementById('mz-conteudo');
  const ativos = [..._mzColaboradores].filter(c=>c.ativo).sort((a,b)=>(a.nome||'').localeCompare(b.nome||''));
  cont.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div style="font-size:10px;font-weight:800;color:var(--text3);margin-bottom:8px">PERÍODO ATUAL</div>
      <div style="display:flex;gap:10px;align-items:flex-end">
        <div style="flex:1"><label style="font-size:10px;color:var(--text3)">INÍCIO</label>
          <input id="mzbh-inicio" value="${pfEsc(_mzBancoHorasPeriodo?.inicio_label||'')}" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;box-sizing:border-box"></div>
        <div style="flex:1"><label style="font-size:10px;color:var(--text3)">FIM</label>
          <input id="mzbh-fim" value="${pfEsc(_mzBancoHorasPeriodo?.fim_label||'')}" style="width:100%;padding:7px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;box-sizing:border-box"></div>
        <button class="btn btn-outline btn-sm" onclick="mzSalvarPeriodoBH()">Salvar período</button>
      </div>
    </div>
    <div class="card" style="padding:0;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead><tr style="background:var(--surface2)">
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">COLABORADOR</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3)">SALDO ATUAL (min)</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3)">DELTA (min)</th>
          <th style="padding:8px 12px"></th>
        </tr></thead>
        <tbody>${ativos.map(c => {
          const bh = _mzBancoHoras.find(b => b.colaborador_id === c.id) || {};
          return `<tr style="border-top:1px solid var(--border)">
            <td style="padding:8px 12px;font-weight:700">${pfEsc(c.nome)}</td>
            <td style="padding:6px 12px;text-align:center"><input id="mzbh-saldo-${c.id}" type="number" value="${bh.saldo_atual||0}" style="width:90px;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:12px;text-align:center"></td>
            <td style="padding:6px 12px;text-align:center"><input id="mzbh-delta-${c.id}" type="number" value="${bh.delta||0}" style="width:90px;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:12px;text-align:center"></td>
            <td style="padding:6px 12px;text-align:right"><button class="btn btn-outline btn-sm" onclick="mzSalvarBancoHoras(${c.id})">Salvar</button></td>
          </tr>`;
        }).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:20px">Nenhum colaborador ativo</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

async function mzSalvarPeriodoBH() {
  const body = { inicio_label: document.getElementById('mzbh-inicio').value.trim(), fim_label: document.getElementById('mzbh-fim').value.trim() };
  try {
    _mzBancoHorasPeriodo = await _mzFetch('/matriz/banco-horas/periodo', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    toast('Período salvo!','sucesso');
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
}

async function mzSalvarBancoHoras(colId) {
  const body = {
    colaborador_id: colId,
    saldo_atual: parseInt(document.getElementById(`mzbh-saldo-${colId}`).value) || 0,
    delta: parseInt(document.getElementById(`mzbh-delta-${colId}`).value) || 0,
  };
  try {
    const salvo = await _mzFetch('/matriz/banco-horas', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const i = _mzBancoHoras.findIndex(b => b.colaborador_id === colId);
    if (i >= 0) _mzBancoHoras[i] = salvo; else _mzBancoHoras.push(salvo);
    toast('Salvo!','sucesso');
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
}

/* ── Férias ── */
async function mzCarregarFerias() {
  _mzFerias = await _mzFetch('/matriz/ferias');
  _mzCarregado.ferias = true;
}

function _mzRenderFerias() {
  const cont = document.getElementById('mz-conteudo');
  const ativos = [..._mzColaboradores].filter(c=>c.ativo).sort((a,b)=>(a.nome||'').localeCompare(b.nome||''));
  const campo = (colId, tipo, dado) => {
    const f = _mzFerias.find(x => x.colaborador_id === colId && x.tipo === tipo) || {};
    return `
      <input id="mzf-${tipo}-data-${colId}" type="date" value="${f.data_inicio||''}" style="width:128px;padding:5px 6px;border:1.5px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:11px">
      <input id="mzf-${tipo}-dias-${colId}" type="number" placeholder="dias" value="${f.dias??''}" style="width:56px;padding:5px 6px;border:1.5px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:11px">`;
  };
  cont.innerHTML = `
    <div class="card" style="padding:0;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:var(--surface2)">
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">COLABORADOR</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">LIMITE</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">1º PERÍODO</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">2º PERÍODO</th>
          <th style="padding:8px 12px"></th>
        </tr></thead>
        <tbody>${ativos.map(c => `
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:8px 12px;font-weight:700;white-space:nowrap">${pfEsc(c.nome)}</td>
            <td style="padding:6px 12px;white-space:nowrap">${campo(c.id,'limite')}</td>
            <td style="padding:6px 12px;white-space:nowrap">${campo(c.id,'p1')}</td>
            <td style="padding:6px 12px;white-space:nowrap">${campo(c.id,'p2')}</td>
            <td style="padding:6px 12px;text-align:right"><button class="btn btn-outline btn-sm" onclick="mzSalvarFerias(${c.id})">Salvar</button></td>
          </tr>`).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:20px">Nenhum colaborador ativo</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

async function mzSalvarFerias(colId) {
  try {
    for (const tipo of ['limite','p1','p2']) {
      const dataEl = document.getElementById(`mzf-${tipo}-data-${colId}`);
      const diasEl = document.getElementById(`mzf-${tipo}-dias-${colId}`);
      if (!dataEl.value && !diasEl.value) continue;
      const salvo = await _mzFetch('/matriz/ferias', {
        method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ colaborador_id: colId, tipo, data_inicio: dataEl.value||null, dias: diasEl.value?parseInt(diasEl.value):null }),
      });
      const i = _mzFerias.findIndex(f => f.colaborador_id === colId && f.tipo === tipo);
      if (i >= 0) _mzFerias[i] = salvo; else _mzFerias.push(salvo);
    }
    toast('Férias salvas!','sucesso');
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
}

/* ── Cargos (descrição de cargo) ── */
async function mzCarregarCargos() {
  _mzCargos = await _mzFetch('/matriz/cargos');
  _mzCarregado.cargos = true;
}

function _mzRenderCargos() {
  const cont = document.getElementById('mz-conteudo');
  cont.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
      <button class="btn btn-primary btn-sm" onclick="mzAbrirCargo()">+ Novo cargo</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${_mzCargos.map(c => `
        <div class="card" style="margin-bottom:0;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:800;font-size:13px">${pfEsc(c.cargo)}</div>
            <div style="font-size:11px;color:var(--text3)">${pfEsc(c.area||'—')}${c.gestor?` · Gestor: ${pfEsc(c.gestor)}`:''}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-outline btn-sm" onclick="mzAbrirCargo(${c.id})">Editar</button>
            <button class="btn btn-outline btn-sm" style="color:var(--red);border-color:var(--red)" onclick="mzExcluirCargo(${c.id})">Excluir</button>
          </div>
        </div>`).join('') || `<div class="card" style="text-align:center;color:var(--text3);padding:20px">Nenhum cargo cadastrado</div>`}
    </div>`;
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

function _mzRenderIncentivo() {
  const cont = document.getElementById('mz-conteudo');
  const linha = (label, key) => `
    <tr style="border-top:1px solid var(--border)">
      <td style="padding:8px 12px;font-weight:700">${label}</td>
      <td style="padding:6px 12px;text-align:center"><input id="mzin-${key}_green" type="number" value="${_mzIncentivo[key+'_green']}" style="width:70px;padding:5px;border:1.5px solid var(--border);border-radius:6px;background:var(--surface);color:var(--green);font-weight:700;text-align:center"></td>
      <td style="padding:6px 12px;text-align:center"><input id="mzin-${key}_yellow" type="number" value="${_mzIncentivo[key+'_yellow']}" style="width:70px;padding:5px;border:1.5px solid var(--border);border-radius:6px;background:var(--surface);color:var(--amber);font-weight:700;text-align:center"></td>
      <td style="padding:6px 12px;text-align:center"><input id="mzin-${key}_red" type="number" value="${_mzIncentivo[key+'_red']}" style="width:70px;padding:5px;border:1.5px solid var(--border);border-radius:6px;background:var(--surface);color:var(--red);font-weight:700;text-align:center"></td>
    </tr>`;
  cont.innerHTML = `
    <div class="card" style="padding:0;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead><tr style="background:var(--surface2)">
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">CRITÉRIO</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--green)">ÓTIMO</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--amber)">MEDIANO</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--red)">RUIM</th>
        </tr></thead>
        <tbody>
          ${linha('Absenteísmo','abs')}
          ${linha('Performance','perf')}
          ${linha('Comportamento','comp')}
        </tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:10px">
      <button class="btn btn-primary btn-sm" onclick="mzSalvarIncentivo()">Salvar</button>
    </div>`;
}

async function mzSalvarIncentivo() {
  const campos = ['abs_green','abs_yellow','abs_red','perf_green','perf_yellow','perf_red','comp_green','comp_yellow','comp_red'];
  const body = {};
  campos.forEach(c => { body[c] = parseInt(document.getElementById(`mzin-${c}`).value) || 0; });
  try {
    _mzIncentivo = await _mzFetch('/matriz/incentivo', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    toast('Configuração de incentivo salva!','sucesso');
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
}

/* ── Plano de Carreira ── */
async function mzCarregarCarreira() {
  _mzCarreira = await _mzFetch('/matriz/carreira');
  _mzCarregado.carreira = true;
}

function _mzRenderCarreira() {
  const cont = document.getElementById('mz-conteudo');
  const ladder = _mzCarreira?.ladder || {};
  cont.innerHTML = `
    <p style="font-size:11px;color:var(--text3);margin-bottom:10px">Um cargo por linha, na ordem da trilha (o primeiro é o nível de entrada).</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">
      ${Object.entries(ladder).map(([area, cargos]) => `
        <div class="card" style="margin-bottom:0">
          <div style="font-weight:800;font-size:13px;margin-bottom:8px">${pfEsc(area)}</div>
          <textarea id="mzcr-${pfEsc(area).replace(/[^a-zA-Z0-9]/g,'_')}" data-area="${pfEsc(area)}" class="mzcr-area" style="width:100%;min-height:100px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;resize:vertical;box-sizing:border-box">${(cargos||[]).join('\n')}</textarea>
        </div>`).join('') || '<div class="card" style="text-align:center;color:var(--text3);padding:20px">Nenhuma trilha cadastrada</div>'}
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-outline btn-sm" onclick="mzNovaAreaCarreira()">+ Nova área</button>
      <button class="btn btn-primary btn-sm" onclick="mzSalvarCarreira()">Salvar tudo</button>
    </div>`;
}

function mzNovaAreaCarreira() {
  const nome = prompt('Nome da área:');
  if (!nome) return;
  if (!_mzCarreira) _mzCarreira = { ladder: {} };
  if (!_mzCarreira.ladder) _mzCarreira.ladder = {};
  _mzCarreira.ladder[nome] = _mzCarreira.ladder[nome] || [];
  _mzRenderCarreira();
}

async function mzSalvarCarreira() {
  const ladder = {};
  document.querySelectorAll('.mzcr-area').forEach(el => {
    ladder[el.dataset.area] = el.value.split('\n').map(s=>s.trim()).filter(Boolean);
  });
  try {
    _mzCarreira = await _mzFetch('/matriz/carreira', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ladder }) });
    toast('Plano de carreira salvo!','sucesso');
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
      <div class="tile" style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:10px;color:var(--text3)">BANCO DE HORAS</div><div style="font-size:18px;font-weight:800;margin-top:4px">${bh?`${bh.saldo_atual>0?'+':''}${bh.saldo_atual} min`:'—'}</div></div>
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
