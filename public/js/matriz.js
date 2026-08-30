'use strict';

/* ══════════════════════════════════════════
   MATRIZ DE RESPONSABILIDADES
   Fase 1: Colaboradores · Grade RACI · Feedbacks · Classificações
   (Férias, Banco de Horas, Cargos, Incentivo, Carreira ficam pra próxima fase)
══════════════════════════════════════════ */

let _mzTab = 'colaboradores';
let _mzUsandoBanco = true; // rotas já leem/escrevem direto no banco do WMS (não fazem mais proxy pro serviço externo)
let _mzColaboradores = [];
let _mzRaci = [];
let _mzFeedbacks = [];
let _mzClassificacoes = [];
let _mzCarregado = { colaboradores: false, raci: false, feedbacks: false, classificacoes: false };

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
  mzTrocarTab('colaboradores');
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
    ['colaboradores','Colaboradores'],
    ['raci','Grade RACI'],
    ['feedbacks','Feedbacks'],
    ['classificacoes','Classificações'],
  ];
  document.getElementById('mz-tabs').innerHTML = tabs.map(([id,label]) => `
    <button onclick="mzTrocarTab('${id}')"
      style="padding:8px 14px;background:transparent;border:none;border-bottom:2px solid ${_mzTab===id?'var(--accent)':'transparent'};color:${_mzTab===id?'var(--text)':'var(--text3)'};font-size:12.5px;font-weight:700;cursor:pointer">
      ${label}
    </button>`).join('');
}

async function mzTrocarTab(tab) {
  _mzTab = tab;
  _mzRenderTabs();
  const cont = document.getElementById('mz-conteudo');
  cont.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:20px;text-align:center">Carregando...</div>';
  try {
    if (tab === 'colaboradores') { if (!_mzCarregado.colaboradores) await mzCarregarColaboradores(); _mzRenderColaboradores(); }
    if (tab === 'raci')          { if (!_mzCarregado.raci || !_mzCarregado.colaboradores) { await Promise.all([mzCarregarColaboradores(), mzCarregarRaci()]); } _mzRenderRaci(); }
    if (tab === 'feedbacks')     { if (!_mzCarregado.feedbacks || !_mzCarregado.colaboradores) { await Promise.all([mzCarregarColaboradores(), mzCarregarFeedbacks()]); } _mzRenderFeedbacks(); }
    if (tab === 'classificacoes'){ if (!_mzCarregado.classificacoes || !_mzCarregado.colaboradores) { await Promise.all([mzCarregarColaboradores(), mzCarregarClassificacoes()]); } _mzRenderClassificacoes(); }
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

function _mzRenderColaboradores() {
  const cont = document.getElementById('mz-conteudo');
  const lista = [..._mzColaboradores].sort((a,b) => (a.nome||'').localeCompare(b.nome||''));
  cont.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
      <button class="btn btn-primary btn-sm" onclick="mzAbrirColaborador()">+ Novo colaborador</button>
    </div>
    <div class="card" style="padding:0;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead><tr style="background:var(--surface2)">
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">NOME</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">CARGO</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">NÍVEL</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">ÁREA</th>
          <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:800;color:var(--text3)">TURNO</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:800;color:var(--text3)">STATUS</th>
          <th style="padding:8px 12px"></th>
        </tr></thead>
        <tbody>${lista.map(c => `
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:8px 12px;font-weight:700">${pfEsc(c.nome)}</td>
            <td style="padding:8px 12px;color:var(--text2)">${pfEsc(c.cargo||'—')}</td>
            <td style="padding:8px 12px;color:var(--text2)">${MZ_TIER_LABEL[c.tier]||c.tier}</td>
            <td style="padding:8px 12px;color:var(--text2)">${pfEsc(c.area||'—')}</td>
            <td style="padding:8px 12px;color:var(--text2)">${pfEsc(c.turno||'—')}</td>
            <td style="padding:8px 12px;text-align:center">
              ${c.vaga ? '<span style="font-size:10px;font-weight:800;color:var(--amber)">VAGA</span>' : c.ativo ? '<span style="font-size:10px;font-weight:800;color:var(--green)">ATIVO</span>' : '<span style="font-size:10px;font-weight:800;color:var(--text3)">INATIVO</span>'}
            </td>
            <td style="padding:8px 12px;text-align:right;white-space:nowrap">
              <button class="btn btn-outline btn-sm" onclick="mzAbrirColaborador(${c.id})">Editar</button>
              <button class="btn btn-outline btn-sm" style="color:var(--red);border-color:var(--red)" onclick="mzExcluirColaborador(${c.id})">Excluir</button>
            </td>
          </tr>`).join('') || `<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px">Nenhum colaborador cadastrado</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function mzAbrirColaborador(id) {
  const c = id ? _mzColaboradores.find(x => x.id === id) : null;
  const editando = !!c;
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
              <option value="1° Turno" ${editando&&c.turno==='1° Turno'?'selected':''}>1° Turno</option>
              <option value="2° Turno" ${editando&&c.turno==='2° Turno'?'selected':''}>2° Turno</option>
              <option value="3° Turno" ${editando&&c.turno==='3° Turno'?'selected':''}>3° Turno</option>
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
    _mzRenderColaboradores();
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
      _mzRenderColaboradores();
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

function _mzRenderFeedbacks() {
  const cont = document.getElementById('mz-conteudo');
  const lista = [..._mzFeedbacks].sort((a,b) => (b.created_at||'').localeCompare(a.created_at||''));
  cont.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
      <button class="btn btn-primary btn-sm" onclick="mzAbrirFeedback()">+ Novo feedback</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${lista.map(f => `
        <div class="card" style="margin-bottom:0">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
            <div>
              <div style="font-weight:800;font-size:13px">${pfEsc(_mzColNome(f.colaborador_id))}</div>
              <div style="font-size:11px;color:var(--text3)">${pfEsc(f.mes||'—')}${f.meta!=null?` · Meta ${f.meta} / Entregue ${f.entregue??'—'}`:''}</div>
            </div>
            <button class="btn btn-outline btn-sm" style="color:var(--red);border-color:var(--red)" onclick="mzExcluirFeedback(${f.id})">Excluir</button>
          </div>
          ${f.pontos_positivos?`<div style="font-size:12px;margin-top:8px"><b>Pontos positivos:</b> ${pfEsc(f.pontos_positivos)}</div>`:''}
          ${f.pontos_construtivos?`<div style="font-size:12px;margin-top:4px"><b>Pontos construtivos:</b> ${pfEsc(f.pontos_construtivos)}</div>`:''}
        </div>`).join('') || `<div class="card" style="text-align:center;color:var(--text3);padding:20px">Nenhum feedback registrado</div>`}
    </div>`;
}

function mzAbrirFeedback() {
  const modal = document.createElement('div');
  modal.id = 'mz-modal-fb';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  const colOpts = [..._mzColaboradores].sort((a,b)=>(a.nome||'').localeCompare(b.nome||'')).map(c=>`<option value="${c.id}">${pfEsc(c.nome)}</option>`).join('');
  modal.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:22px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto">
      <div style="font-weight:900;font-size:15px;margin-bottom:14px">Novo feedback</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">COLABORADOR</label>
          <select id="mzf-colab" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px">${colOpts}</select></div>
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">MÊS</label>
          <input id="mzf-mes" placeholder="Agosto 2026" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
        <div style="display:flex;gap:10px">
          <div style="flex:1"><label style="font-size:10px;font-weight:700;color:var(--text3)">META</label>
            <input id="mzf-meta" type="number" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
          <div style="flex:1"><label style="font-size:10px;font-weight:700;color:var(--text3)">ENTREGUE</label>
            <input id="mzf-entregue" type="number" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box"></div>
        </div>
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">PONTOS POSITIVOS</label>
          <textarea id="mzf-pos" style="width:100%;min-height:60px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;resize:vertical;box-sizing:border-box"></textarea></div>
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">PONTOS CONSTRUTIVOS</label>
          <textarea id="mzf-cons" style="width:100%;min-height:60px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;resize:vertical;box-sizing:border-box"></textarea></div>
        <div><label style="font-size:10px;font-weight:700;color:var(--text3)">COMBINADO DO MÊS</label>
          <textarea id="mzf-comb" style="width:100%;min-height:44px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:12px;resize:vertical;box-sizing:border-box"></textarea></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:18px">
        <button class="btn btn-outline" style="flex:1" onclick="document.getElementById('mz-modal-fb').remove()">Cancelar</button>
        <button class="btn btn-primary" style="flex:1" onclick="mzSalvarFeedback()">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function mzSalvarFeedback() {
  const colId = parseInt(document.getElementById('mzf-colab').value);
  if (!colId) { toast('Selecione o colaborador.','aviso'); return; }
  const num = v => v === '' ? null : parseInt(v);
  const body = {
    colaborador_id: colId,
    mes: document.getElementById('mzf-mes').value.trim(),
    meta: num(document.getElementById('mzf-meta').value),
    entregue: num(document.getElementById('mzf-entregue').value),
    pontos_positivos: document.getElementById('mzf-pos').value.trim(),
    pontos_construtivos: document.getElementById('mzf-cons').value.trim(),
    combinado_mes: document.getElementById('mzf-comb').value.trim(),
  };
  try {
    await _mzFetch('/matriz/feedbacks', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    document.getElementById('mz-modal-fb')?.remove();
    toast('Feedback salvo!','sucesso');
    _mzCarregado.feedbacks = false;
    await mzCarregarFeedbacks();
    _mzRenderFeedbacks();
  } catch(e) { toast('Erro: ' + e.message, 'erro'); }
}

function mzExcluirFeedback(id) {
  wmsConfirm({ titulo:'Excluir feedback?', sub:'Ação permanente.', btnOk:'Excluir', btnOkClass:'btn-danger' }, async () => {
    try {
      await _mzFetch(`/matriz/feedbacks/${id}`, { method:'DELETE' });
      toast('Excluído!','sucesso');
      _mzCarregado.feedbacks = false;
      await mzCarregarFeedbacks();
      _mzRenderFeedbacks();
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
