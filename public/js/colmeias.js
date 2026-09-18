/* ══ WMS — Colmeias ══
   Estoque manual por SKU (bancadas/colmeias pré-abastecidas). Cada colmeia
   guarda quanto foi abastecido de um código; o saldo é calculado ao vivo no
   backend (quantidade abastecida menos o que já saiu em pedidos concluídos
   daquele código desde o abastecimento) — ver routes/colmeias.js. Quando o
   saldo cai até o estoque mínimo cadastrado, a colmeia entra em alerta.
══════════════════════════════════════════════════════════════════════ */

'use strict';

let _colmeias = [];
let _colmeiaAbastecerId = null;
let _colmeiaMinimoId = null;
let _colmeiaEnderecoId = null;

function renderizarPagColmeias() {
  const pag = document.getElementById('pag-colmeias');
  if (!pag) return;

  pag.innerHTML = `
  <div style="padding:0 0 32px">
    <div class="pg-title" style="margin-bottom:16px">
      Colmeias
      <button onclick="abrirModalNovaColmeia()" class="btn btn-primary btn-sm" style="float:right"><i class="ti ti-plus" aria-hidden="true"></i> Nova Colmeia</button>
    </div>

    <div id="colmeias-alerta"></div>

    <div id="colmeias-resumo" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px"></div>

    <div class="card" style="padding:0;overflow:hidden">
      <div class="tabela-wrap">
        <table>
          <thead>
            <tr>
              <th>CÓDIGO</th>
              <th>ENDEREÇO</th>
              <th>DESCRIÇÃO</th>
              <th>CADASTRADO</th>
              <th>CONSUMIDO</th>
              <th>SALDO</th>
              <th>MÍNIMO</th>
              <th>SITUAÇÃO</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="colmeias-tbody">
            <tr><td colspan="9" style="padding:32px;text-align:center;color:var(--text3)">Carregando...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- MODAL: Nova Colmeia -->
  <div id="modal-colmeia" class="modal-overlay">
    <div class="modal-card" style="max-width:400px;text-align:left">
      <div class="modal-hd">Nova Colmeia</div>
      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:22px">
        <div>
          <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.3px;margin-bottom:4px">CÓDIGO DO PRODUTO</div>
          <input id="colmeia-codigo" placeholder="ex: MVELS8008" class="input"
            style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px">
        </div>
        <div>
          <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.3px;margin-bottom:4px">ENDEREÇO DA COLMEIA</div>
          <input id="colmeia-endereco" placeholder="ex: Bancada 3 / Colmeia B12" class="input"
            style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px">
          <div style="font-size:11px;color:var(--text3);margin-top:4px">Onde essa colmeia fica fisicamente — pra identificar qual é qual.</div>
        </div>
        <div>
          <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.3px;margin-bottom:4px">DESCRIÇÃO (OPCIONAL)</div>
          <input id="colmeia-descricao" placeholder="ex: MyHoney Mel Estimulante 8ml" class="input"
            style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px">
        </div>
        <div>
          <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.3px;margin-bottom:4px">QUANTIDADE ABASTECIDA</div>
          <input id="colmeia-quantidade" type="number" min="1" placeholder="ex: 485" class="input"
            style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px">
        </div>
        <div>
          <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.3px;margin-bottom:4px">ESTOQUE MÍNIMO (ALERTA)</div>
          <input id="colmeia-minimo" type="number" min="0" placeholder="ex: 50" class="input"
            style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px">
          <div style="font-size:11px;color:var(--text3);margin-top:4px">Quando o saldo cair pra esse valor ou menos, a colmeia entra em alerta.</div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="fecharModalColmeia()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarNovaColmeia()">Salvar</button>
      </div>
    </div>
  </div>

  <!-- MODAL: Abastecer -->
  <div id="modal-colmeia-abastecer" class="modal-overlay">
    <div class="modal-card" style="max-width:360px;text-align:left">
      <div class="modal-hd">Abastecer colmeia</div>
      <div id="colmeia-abastecer-sub" class="modal-body" style="text-align:left;margin-bottom:12px"></div>
      <div style="margin-bottom:22px">
        <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.3px;margin-bottom:4px">QUANTIDADE A ADICIONAR</div>
        <input id="colmeia-qtd-abastecer" type="number" min="1" placeholder="ex: 200" class="input"
          style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px">
      </div>
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="fecharModalAbastecer()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarAbastecimento()">Adicionar</button>
      </div>
    </div>
  </div>

  <!-- MODAL: Editar estoque mínimo -->
  <div id="modal-colmeia-minimo" class="modal-overlay">
    <div class="modal-card" style="max-width:340px;text-align:left">
      <div class="modal-hd">Estoque mínimo</div>
      <div id="colmeia-minimo-sub" class="modal-body" style="text-align:left;margin-bottom:12px"></div>
      <div style="margin-bottom:22px">
        <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.3px;margin-bottom:4px">NOVO ESTOQUE MÍNIMO</div>
        <input id="colmeia-novo-minimo" type="number" min="0" placeholder="ex: 50" class="input"
          style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px">
      </div>
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="fecharModalMinimo()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarMinimo()">Salvar</button>
      </div>
    </div>
  </div>

  <!-- MODAL: Editar endereço -->
  <div id="modal-colmeia-endereco" class="modal-overlay">
    <div class="modal-card" style="max-width:360px;text-align:left">
      <div class="modal-hd">Endereço da colmeia</div>
      <div id="colmeia-endereco-sub" class="modal-body" style="text-align:left;margin-bottom:12px"></div>
      <div style="margin-bottom:22px">
        <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.3px;margin-bottom:4px">NOVO ENDEREÇO</div>
        <input id="colmeia-novo-endereco" placeholder="ex: Bancada 3 / Colmeia B12" class="input"
          style="width:100%;padding:9px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px">
      </div>
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="fecharModalEndereco()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarEndereco()">Salvar</button>
      </div>
    </div>
  </div>
  `;

  carregarColmeias();
}

async function carregarColmeias() {
  const tbody = document.getElementById('colmeias-tbody');
  const dados = await apiFetch('/colmeias');
  if (!dados || dados.erro) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="padding:32px;text-align:center;color:var(--red)">Erro ao carregar colmeias.</td></tr>`;
    return;
  }
  _colmeias = dados;
  renderAlertaColmeias();
  renderResumoColmeias();
  renderTabelaColmeias();
}

// Em alerta = saldo já bateu (ou passou) o estoque mínimo cadastrado. Colmeia
// sem mínimo definido (0) nunca entra aqui, só quando esgota de fato.
function _emAlerta(c) {
  return c.estoque_minimo > 0 && c.saldo <= c.estoque_minimo;
}

function renderAlertaColmeias() {
  const wrap = document.getElementById('colmeias-alerta');
  if (!wrap) return;
  const emAlerta = _colmeias.filter(_emAlerta);
  if (!emAlerta.length) { wrap.innerHTML = ''; return; }

  wrap.innerHTML = `
    <div style="background:rgba(201,82,79,.1);border:1px solid rgba(201,82,79,.35);border-radius:var(--r-sm);padding:12px 16px;margin-bottom:16px;display:flex;gap:10px;align-items:flex-start">
      <i class="ti ti-alert-triangle" aria-hidden="true" style="color:var(--red);font-size:18px;margin-top:1px"></i>
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--red);margin-bottom:4px">${emAlerta.length} colmeia${emAlerta.length > 1 ? 's' : ''} no estoque mínimo</div>
        <div style="font-size:12px;color:var(--text2)">${emAlerta.map(c => `${c.codigo} (saldo ${c.saldo.toLocaleString('pt-BR')} / mín. ${c.estoque_minimo.toLocaleString('pt-BR')})`).join(' · ')}</div>
      </div>
    </div>`;
}

function renderResumoColmeias() {
  const wrap = document.getElementById('colmeias-resumo');
  if (!wrap) return;
  const totalCadastrado = _colmeias.reduce((s, c) => s + c.quantidade_total, 0);
  const totalConsumido  = _colmeias.reduce((s, c) => s + c.consumido, 0);
  const totalSaldo      = totalCadastrado - totalConsumido;
  const esgotadas       = _colmeias.filter(c => c.saldo <= 0).length;
  const emAlerta        = _colmeias.filter(_emAlerta).length;

  const cards = [
    ['Colmeias ativas', _colmeias.length, 'var(--text)'],
    ['Total cadastrado', totalCadastrado.toLocaleString('pt-BR'), 'var(--text)'],
    ['Total consumido', totalConsumido.toLocaleString('pt-BR'), 'var(--amber)'],
    ['Saldo total', totalSaldo.toLocaleString('pt-BR'), totalSaldo > 0 ? 'var(--green)' : 'var(--red)'],
    ['Em alerta', emAlerta, emAlerta > 0 ? 'var(--red)' : 'var(--text3)'],
    ['Esgotadas', esgotadas, esgotadas > 0 ? 'var(--red)' : 'var(--text3)'],
  ];
  wrap.innerHTML = cards.map(([label, value, color]) => `
    <div class="stat-card">
      <div class="stat-card-label">${label}</div>
      <div class="stat-card-value" style="color:${color};font-size:22px">${value}</div>
    </div>`).join('');
}

function _situacaoColmeia(c) {
  if (c.saldo <= 0) return { label: 'Esgotado', cls: 'badge-danger' };
  if (_emAlerta(c))  return { label: 'Alerta', cls: 'badge-danger' };
  const pct = c.quantidade_total > 0 ? c.saldo / c.quantidade_total : 0;
  if (pct <= 0.2)   return { label: 'Baixo', cls: 'badge-warning' };
  return { label: 'OK', cls: 'badge-success' };
}

function renderTabelaColmeias() {
  const tbody = document.getElementById('colmeias-tbody');
  if (!tbody) return;
  if (!_colmeias.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="padding:40px;text-align:center;color:var(--text3)">Nenhuma colmeia cadastrada ainda.</td></tr>`;
    return;
  }
  tbody.innerHTML = _colmeias.map(c => {
    const sit = _situacaoColmeia(c);
    const pct = c.quantidade_total > 0 ? Math.max(0, Math.min(100, c.saldo / c.quantidade_total * 100)) : 0;
    const barColor = sit.cls === 'badge-danger' ? 'var(--red)' : sit.cls === 'badge-warning' ? 'var(--amber)' : 'var(--green)';
    return `
    <tr>
      <td style="font-weight:700;font-family:'Space Mono',monospace">${c.codigo}</td>
      <td>
        <span style="color:var(--text2)">${c.endereco || '—'}</span>
        <button onclick='abrirModalEndereco(${c.id},${JSON.stringify(c.codigo)},${JSON.stringify(c.endereco||"")})' class="btn btn-outline btn-sm" title="Editar endereço" style="padding:3px 6px;margin-left:4px"><i class="ti ti-pencil" aria-hidden="true"></i></button>
      </td>
      <td style="color:var(--text2);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.descricao || '—'}</td>
      <td>${c.quantidade_total.toLocaleString('pt-BR')}</td>
      <td style="color:var(--amber)">${c.consumido.toLocaleString('pt-BR')}</td>
      <td>
        <div style="font-weight:700;margin-bottom:3px">${c.saldo.toLocaleString('pt-BR')}</div>
        <div style="background:var(--surface2);border-radius:4px;height:5px;width:70px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${barColor};border-radius:4px"></div>
        </div>
      </td>
      <td>
        <span style="color:var(--text3)">${c.estoque_minimo > 0 ? c.estoque_minimo.toLocaleString('pt-BR') : '—'}</span>
        <button onclick="abrirModalMinimo(${c.id},'${c.codigo}',${c.estoque_minimo})" class="btn btn-outline btn-sm" title="Editar estoque mínimo" style="padding:3px 6px;margin-left:4px"><i class="ti ti-pencil" aria-hidden="true"></i></button>
      </td>
      <td><span class="badge ${sit.cls}">${sit.label}</span></td>
      <td style="text-align:right;white-space:nowrap">
        <button onclick="abrirModalAbastecer(${c.id},'${c.codigo}')" class="btn btn-outline btn-sm" title="Abastecer"><i class="ti ti-plus" aria-hidden="true"></i></button>
        <button onclick="excluirColmeia(${c.id},'${c.codigo}')" class="btn btn-outline btn-sm" title="Remover" style="color:var(--red)"><i class="ti ti-trash" aria-hidden="true"></i></button>
      </td>
    </tr>`;
  }).join('');
}

function abrirModalNovaColmeia() {
  document.getElementById('colmeia-codigo').value = '';
  document.getElementById('colmeia-endereco').value = '';
  document.getElementById('colmeia-descricao').value = '';
  document.getElementById('colmeia-quantidade').value = '';
  document.getElementById('colmeia-minimo').value = '';
  document.getElementById('modal-colmeia').style.display = 'flex';
}
function fecharModalColmeia() {
  document.getElementById('modal-colmeia').style.display = 'none';
}

async function salvarNovaColmeia() {
  const codigo = document.getElementById('colmeia-codigo').value.trim();
  const endereco = document.getElementById('colmeia-endereco').value.trim();
  const descricao = document.getElementById('colmeia-descricao').value.trim();
  const quantidade = parseInt(document.getElementById('colmeia-quantidade').value);
  const estoque_minimo = parseInt(document.getElementById('colmeia-minimo').value) || 0;
  if (!codigo) { toast('Informe o código do produto', 'erro'); return; }
  if (!quantidade || quantidade <= 0) { toast('Informe uma quantidade válida', 'erro'); return; }
  if (estoque_minimo < 0) { toast('Estoque mínimo inválido', 'erro'); return; }

  const r = await apiFetch('/colmeias', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo, endereco, descricao, quantidade, estoque_minimo }),
  });
  if (!r || r.erro) return;
  toast('Colmeia cadastrada!', 'sucesso');
  fecharModalColmeia();
  carregarColmeias();
}

function abrirModalAbastecer(id, codigo) {
  _colmeiaAbastecerId = id;
  document.getElementById('colmeia-abastecer-sub').textContent = `Código ${codigo}`;
  document.getElementById('colmeia-qtd-abastecer').value = '';
  document.getElementById('modal-colmeia-abastecer').style.display = 'flex';
}
function fecharModalAbastecer() {
  document.getElementById('modal-colmeia-abastecer').style.display = 'none';
  _colmeiaAbastecerId = null;
}

async function salvarAbastecimento() {
  const quantidade = parseInt(document.getElementById('colmeia-qtd-abastecer').value);
  if (!quantidade || quantidade <= 0) { toast('Informe uma quantidade válida', 'erro'); return; }
  const r = await apiFetch(`/colmeias/${_colmeiaAbastecerId}/abastecer`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantidade }),
  });
  if (!r || r.erro) return;
  toast('Abastecimento registrado!', 'sucesso');
  fecharModalAbastecer();
  carregarColmeias();
}

function abrirModalMinimo(id, codigo, minimoAtual) {
  _colmeiaMinimoId = id;
  document.getElementById('colmeia-minimo-sub').textContent = `Código ${codigo}`;
  document.getElementById('colmeia-novo-minimo').value = minimoAtual || '';
  document.getElementById('modal-colmeia-minimo').style.display = 'flex';
}
function fecharModalMinimo() {
  document.getElementById('modal-colmeia-minimo').style.display = 'none';
  _colmeiaMinimoId = null;
}

async function salvarMinimo() {
  const estoque_minimo = parseInt(document.getElementById('colmeia-novo-minimo').value);
  if (isNaN(estoque_minimo) || estoque_minimo < 0) { toast('Informe um valor válido', 'erro'); return; }
  const r = await apiFetch(`/colmeias/${_colmeiaMinimoId}/minimo`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ estoque_minimo }),
  });
  if (!r || r.erro) return;
  toast('Estoque mínimo atualizado!', 'sucesso');
  fecharModalMinimo();
  carregarColmeias();
}

function abrirModalEndereco(id, codigo, enderecoAtual) {
  _colmeiaEnderecoId = id;
  document.getElementById('colmeia-endereco-sub').textContent = `Código ${codigo}`;
  document.getElementById('colmeia-novo-endereco').value = enderecoAtual || '';
  document.getElementById('modal-colmeia-endereco').style.display = 'flex';
}
function fecharModalEndereco() {
  document.getElementById('modal-colmeia-endereco').style.display = 'none';
  _colmeiaEnderecoId = null;
}

async function salvarEndereco() {
  const endereco = document.getElementById('colmeia-novo-endereco').value.trim();
  const r = await apiFetch(`/colmeias/${_colmeiaEnderecoId}/endereco`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endereco }),
  });
  if (!r || r.erro) return;
  toast('Endereço atualizado!', 'sucesso');
  fecharModalEndereco();
  carregarColmeias();
}

function excluirColmeia(id, codigo) {
  wmsConfirm(
    { titulo: 'Remover colmeia?', sub: `A colmeia do código ${codigo} será removida da lista.`, btnOk: 'Remover' },
    async () => {
      const r = await apiFetch(`/colmeias/${id}`, { method: 'DELETE' });
      if (!r || r.erro) return;
      toast('Colmeia removida!', 'sucesso');
      carregarColmeias();
    }
  );
}
