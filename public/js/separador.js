// Rota física do estoque — separadores partem de A (ponto de acúmulo)
// 1. Começa em A, sobe ramal: A → B → C → D → E
// 2. Sobe ao corredor principal, varre esquerda até F: Q → P → O → N → M → L → K → J → I → H → Arara → G → F → ZA
// 3. Varre direita até Z: R → S → T → U → V → W → X → Y → Z
const ROTA_FISICA = ['A','B','C','D','E','Q','P','O','N','M','L','K','J','I','H','ARARA','G','F','ZA','R','S','T','U','V','W','X','Y','Z'];
const _checklistSortDir = 1;
const CAIXA_OBRIGATORIA = false; // mudar para true para reativar vínculo de caixa

/* ══════════════════════════════════════════
   SEPARAÇÃO EM LOTE — TURNO NOITE
══════════════════════════════════════════ */
let _loteAtual         = [];   // [{id, numero_pedido, total_itens}, ...]
let _loteItens         = [];   // itens mesclados com caixa_num
let _lotePendentes     = [];   // pedidos elegíveis para o lote (usado pelo card)
let _gruposLoteSistema   = {}; // lote_id -> pedidos pendentes, formados pelo supervisor (Formar Lotes)
let _gruposLoteAndamento = {}; // lote_id -> pedidos já iniciados (status 'separando')
let _loteIdAtual       = null; // id do lote (lotes_separacao.id), pra exibir "Lote 001"
let _loteEndIdx        = 0;    // posição atual na navegação passo-a-passo
let _lotePedidosAbertos = true; // seção "Pedidos do lote" expandida/recolhida
let _loteAcaoAberta    = null; // "p:<ids>" ou "f:<ids>" — grupo com Parcial/Falta aberto

// Paleta discreta pra diferenciar até 5 pedidos no mesmo lote — variações de
// azul/slate/violeta (mesma família do --accent do sistema), sem cores
// "arco-íris" (evitar tons quentes/saturados que destoam do tema corporativo).
const _CX_CORES = ['#4F46E5','#0891B2','#64748B','#7C3AED','#334155'];
const MOTIVOS_FALTA_LOTE = ['Estoque vazio', 'Produto não localizado', 'Divergência de estoque'];

function _loteScreens(ativa) {
  ['m-lote-prep','m-lote-lista','m-lote-conclusao','m-cl-wrap','m-caixa-wrap'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = id === ativa ? (id === 'm-cl-wrap' ? '' : 'block') : 'none';
  });
}

// Abre um lote já formado pelo supervisor (Formar Lotes) — os pedidos já
// vieram agrupados e atribuídos, então pula a tela de escolher caixa e vai
// direto pra lista mesclada (caixa_num é numerado automaticamente pelo
// backend, na ordem dos ids enviados).
async function abrirLoteSistema(loteId) {
  const peds = _gruposLoteSistema[loteId];
  if (!peds?.length) { toast('Lote não encontrado — atualize a fila', 'erro'); return; }
  const ids = peds.map(p => p.id);
  try {
    const res = await fetch(`${API}/pedidos/lote/iniciar`, {
      method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ pedido_ids: ids })
    });
    const data = await res.json();
    if (!res.ok) { toast(data.erro||'Erro ao iniciar lote', 'erro'); return; }
    _loteIdAtual = loteId;
    mudarTabSep('separar');
    await carregarListaLote(ids);
  } catch(e) { toast('Erro de rede', 'erro'); }
}

// Lote já iniciado (status 'separando') — reabre direto na lista mesclada,
// sem chamar /pedidos/lote/iniciar de novo (os pedidos já estão nesse status).
function continuarLoteSistema(loteId) {
  const peds = _gruposLoteAndamento[loteId];
  if (!peds?.length) { toast('Lote não encontrado — atualize a fila', 'erro'); return; }
  _loteIdAtual = loteId;
  mudarTabSep('separar');
  carregarListaLote(peds.map(p => p.id));
}

// Menu "Lotes concluídos" — histórico só de lotes 100% finalizados do
// separador logado, pra conferir depois quais pedidos foram em qual lote.
async function abrirHistoricoLotes() {
  const modal = document.getElementById('m-lote-historico-modal');
  const body  = document.getElementById('m-lote-historico-body');
  if (!modal || !body) return;
  modal.style.display = 'block';
  body.innerHTML = '<div style="color:var(--text3);text-align:center;padding:30px;font-size:13px">Carregando...</div>';
  try {
    const sepId = separadorAtual?.id || 0;
    const res = await fetch(`${API}/pedidos/lote/historico?separador_id=${sepId}`, { credentials:'include' });
    const data = await res.json();
    if (!data.lotes?.length) {
      body.innerHTML = '<div style="color:var(--text3);text-align:center;padding:30px;font-size:13px">Nenhum lote concluído ainda</div>';
      return;
    }
    body.innerHTML = data.lotes.map(l => `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span style="font-size:13px;font-weight:700;color:var(--text)">Lote ${String(l.lote_id).padStart(3,'0')}</span>
          <span style="font-size:11px;color:var(--text3)">${l.total} pedido${l.total===1?'':'s'}</span>
        </div>
        ${l.pedidos.map((p,i) => `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-top:${i===0?'none':'1px solid var(--border)'}">
          <span style="width:18px;height:18px;border-radius:5px;background:${_CX_CORES[i%_CX_CORES.length]};color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</span>
          <span style="font-size:12px;color:var(--text2);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">#${p.numero_pedido} · ${p.cliente||'—'}</span>
          <span style="font-size:11px;color:var(--text3);flex-shrink:0">${p.total_itens||p.itens||0} itens</span>
        </div>`).join('')}
      </div>`).join('');
  } catch(e) { body.innerHTML = '<div style="color:var(--red);text-align:center;padding:20px;font-size:13px">Erro ao carregar</div>'; }
}

function fecharHistoricoLotes() {
  const modal = document.getElementById('m-lote-historico-modal');
  if (modal) modal.style.display = 'none';
}

// Mostra todos os itens de UM pedido do lote (não a posição atual) — pra o
// separador conferir a caixa inteira antes de fechar e mandar pro checkout.
function verDetalhePedidoLote(cx) {
  const p = _loteAtual[cx-1];
  const modal = document.getElementById('m-lote-pedido-detalhe-modal');
  const body = document.getElementById('m-lote-pedido-detalhe-body');
  const titulo = document.getElementById('m-lote-pedido-detalhe-titulo');
  if (!p || !modal || !body) return;
  const itensDoPedido = _loteItens.filter(i => i.caixa_num === cx);
  const total = itensDoPedido.length;
  const feitos = itensDoPedido.filter(i => i.status !== 'pendente').length;
  const faltas = itensDoPedido.filter(i => i.status === 'falta').length;
  if (titulo) titulo.textContent = `Pedido #${p.numero_pedido}`;

  const resumoHtml = feitos < total
    ? `<div style="background:rgba(224,168,62,.12);border:1px solid var(--amber);border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:var(--amber);font-weight:700">Faltam ${total-feitos} de ${total} itens — ainda não está pronto pro checkout</div>`
    : faltas > 0
      ? `<div style="background:rgba(224,168,62,.12);border:1px solid var(--amber);border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:var(--amber);font-weight:700">${faltas} item(ns) em falta — aguardando repositor</div>`
      : `<div style="background:rgba(87,185,129,.12);border:1px solid var(--green);border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:var(--green);font-weight:700">Tudo separado — pode fechar a caixa</div>`;

  body.innerHTML = resumoHtml + itensDoPedido.map(item => {
    const cor = item.status==='encontrado' ? 'var(--green)' : item.status==='falta' ? 'var(--red)' : item.status==='parcial' ? 'var(--amber)' : 'var(--border)';
    const bg  = item.status==='encontrado' ? 'rgba(87,185,129,.08)' : item.status==='falta' ? 'rgba(201,82,79,.08)' : item.status==='parcial' ? 'rgba(224,168,62,.08)' : 'var(--surface)';
    const label = item.status==='encontrado' ? 'COLETADO' : item.status==='falta' ? 'FALTA' : item.status==='parcial' ? 'PARCIAL' : 'PENDENTE';
    return `<div style="background:${bg};border:1px solid var(--border);border-left:3px solid ${cor};border-radius:8px;padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:2px">
        <span style="font-size:13px;font-weight:600;color:var(--text)">${item.descricao||item.codigo||'—'}</span>
        <span style="font-size:9px;font-weight:800;letter-spacing:.5px;color:${cor};flex-shrink:0">${label}</span>
      </div>
      ${item.codigo ? `<div style="font-size:12px;font-weight:700;color:var(--accent);font-family:monospace;margin-bottom:2px">Cód: ${item.codigo}</div>` : ''}
      <div style="font-size:11px;color:var(--text3);font-family:monospace">${item.endereco||'—'} · x${item.quantidade||1}</div>
    </div>`;
  }).join('');

  modal.style.display = 'block';
}

function fecharDetalhePedidoLote() {
  const modal = document.getElementById('m-lote-pedido-detalhe-modal');
  if (modal) modal.style.display = 'none';
}

function abrirPreparacaoLote(pedidos) {
  _loteAtual = pedidos;
  _loteScreens('m-lote-prep');
  mudarTabSep('separar');

  document.getElementById('m-lote-caixas').innerHTML = pedidos.map(p => `
    <div style="margin:6px 12px;border-radius:10px;border:0.5px solid var(--border);background:var(--surface);padding:10px 14px;display:flex;align-items:center;gap:12px">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;color:var(--text)">#${p.numero_pedido}</div>
        <div style="font-size:11px;color:var(--text3)">${p.total_itens||p.itens||'?'} itens</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <span style="font-size:11px;color:var(--text3)">Caixa</span>
        <input id="cx-input-${p.id}" type="number" min="1" placeholder="Nº" inputmode="numeric"
          style="width:62px;padding:8px 6px;border:1.5px solid var(--border);border-radius:8px;font-size:16px;font-weight:700;text-align:center;background:var(--surface);color:var(--text);outline:none"
          oninput="this.style.borderColor=this.value?'#f97316':'var(--border)'">
      </div>
    </div>`).join('');
}

async function iniciarSepLote() {
  const caixas = [];
  const usados = new Set();
  for (const p of _loteAtual) {
    const input = document.getElementById(`cx-input-${p.id}`);
    const val = (input?.value||'').trim();
    if (!val) {
      toast(`Informe o número da caixa para o pedido #${p.numero_pedido}`, 'erro');
      input?.focus(); return;
    }
    if (usados.has(val)) {
      toast(`Caixa "${val}" já foi usada em outro pedido`, 'erro'); return;
    }
    usados.add(val);
    caixas.push({ pedido_id: p.id, caixa_lote: val });
    p.caixa_lote = val; // guarda localmente para exibição imediata
  }

  const ids = _loteAtual.map(p => p.id);
  try {
    const res = await fetch(`${API}/pedidos/lote/iniciar`, {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ pedido_ids: ids, caixas })
    });
    const data = await res.json();
    if (!res.ok) { toast(data.erro||'Erro ao iniciar lote','erro'); return; }
    await carregarListaLote(ids);
  } catch(e) { toast('Erro de rede','erro'); }
}

async function carregarListaLote(ids) {
  try {
    const res = await fetch(`${API}/pedidos/lote-itens?pedido_ids=${ids.join(',')}`, { credentials:'include' });
    const data = await res.json();
    if (!res.ok) { toast(data.erro||'Erro ao carregar lote','erro'); return; }
    _loteItens = data.itens;
    _loteAtual = data.pedidos;
    _loteEndIdx = 0;
    _loteAcaoAberta = null;
    _lotePedidosAbertos = true;
    _renderizarListaLote();
    _loteScreens('m-lote-lista');
  } catch(e) { toast('Erro de rede','erro'); }
}

// Agrupa os itens do lote por endereço (posição), ordenados pela rota física —
// usado tanto pra renderizar quanto pra navegar (próxima/anterior/revisar).
function _loteAgruparPorEndereco() {
  const gruposPorEnd = {};
  for (const item of _loteItens) {
    const end = String(item.endereco||'S/END').split(',')[0].trim().toUpperCase();
    if (!gruposPorEnd[end]) gruposPorEnd[end] = [];
    gruposPorEnd[end].push(item);
  }
  // Rua não reconhecida (fora da ROTA_FISICA) vai pro fim, não pro meio — 999999
  // é maior que qualquer índice válido (máx. 27*10000+9999), senão uma rua
  // desconhecida podia aparecer antes de ruas reais do fim da rota (R a Z).
  const rotaIdx = e => { const l = e.replace(/\d+.*/,''); const i = ROTA_FISICA.indexOf(l); return i >= 0 ? i*10000 + (parseInt(e.match(/\d+/)?.[0])||0) : 999999; };
  const endsOrdenados = Object.keys(gruposPorEnd).sort((a,b) => rotaIdx(a) - rotaIdx(b));
  return { gruposPorEnd, endsOrdenados };
}

function _renderizarListaLote() {
  const itens = _loteItens;
  const total = itens.length;
  const { gruposPorEnd, endsOrdenados } = _loteAgruparPorEndereco();
  const totalSkus = new Set(itens.map(i => i.codigo || '_sem_cod_')).size;

  document.getElementById('m-lote-badge').textContent = _loteIdAtual
    ? `Lote ${String(_loteIdAtual).padStart(3,'0')}` : `${_loteAtual.length} pedidos`;

  // 4 cards de estatística
  const statsEl = document.getElementById('m-lote-stats');
  if (statsEl) {
    const stats = [['Pedidos',_loteAtual.length], ['Itens',total], ['SKUs',totalSkus], ['Posições',endsOrdenados.length]];
    statsEl.innerHTML = stats.map(([lab,val]) => `
      <div style="flex:1;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:7px 4px;text-align:center">
        <div style="font-size:15px;font-weight:800;color:var(--text);line-height:1.3">${val}</div>
        <div style="font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">${lab}</div>
      </div>`).join('');
  }

  // Progresso geral — 'parcial' também conta como processado (só 'pendente' bloqueia,
  // igual ao backend em PUT /pedidos/lote/concluir).
  const processados = itens.filter(i => i.status !== 'pendente').length;
  _atualizarBotaoConcluirLote(itens, total - processados);
  document.getElementById('m-lote-prog-cnt').textContent = `${processados} / ${total} itens`;
  document.getElementById('m-lote-prog-fill').style.width = total ? Math.round(processados/total*100)+'%' : '0%';

  // "Pedidos do lote" — legenda colorida recolhível; cada chip é clicável e
  // abre a lista completa dos itens DAQUELE pedido, pra conferir tudo antes
  // de fechar a caixa e mandar pro checkout.
  document.getElementById('m-lote-chips').innerHTML = _loteAtual.map((p, idx) => {
    const cx = idx + 1;
    const cor = _CX_CORES[idx % _CX_CORES.length];
    const itensDoPedido = itens.filter(i => i.caixa_num === cx);
    const totalP  = itensDoPedido.length;
    const feitosP = itensDoPedido.filter(i => i.status !== 'pendente').length;
    const completoP = totalP > 0 && feitosP === totalP;
    return `<span onclick="verDetalhePedidoLote(${cx})" style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;padding:3px 10px 3px 3px;border-radius:7px;white-space:nowrap;cursor:pointer;
        background:${completoP ? 'rgba(87,185,129,.12)' : 'var(--surface)'};
        border:1px solid ${completoP ? 'var(--green)' : 'var(--border)'}">
        <span style="width:19px;height:19px;border-radius:5px;background:${cor};color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0">${completoP ? '✓' : cx}</span>
        <span style="color:${completoP ? 'var(--green)' : 'var(--text2)'}">#${p.numero_pedido} · ${feitosP}/${totalP}</span>
      </span>`;
  }).join('');
  const chipsWrap = document.getElementById('m-lote-chips');
  if (chipsWrap) chipsWrap.style.display = _lotePedidosAbertos ? 'flex' : 'none';
  const chevEl = document.getElementById('m-lote-chips-chevron');
  if (chevEl) chevEl.textContent = _lotePedidosAbertos ? '▾' : '▸';

  const body = document.getElementById('m-lote-lista-body');
  const btnProx = document.getElementById('m-lote-btn-prox');

  // Passou da última posição — mostra o resumo em vez de um card de posição.
  if (_loteEndIdx >= endsOrdenados.length) {
    const faltas = itens.filter(i => i.status === 'falta').length;
    const pedidosCompletos = _loteAtual.filter((p, idx) => {
      const itensDoPedido = itens.filter(i => i.caixa_num === idx+1);
      return itensDoPedido.length > 0 && itensDoPedido.every(i => i.status !== 'pendente');
    }).length;
    if (body) body.innerHTML = faltas > 0 ? `
      <div style="padding:28px 18px;text-align:center">
        <div style="width:44px;height:44px;border-radius:8px;background:rgba(224,168,62,.12);border:1px solid var(--amber);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:20px;color:var(--amber)">!</div>
        <div style="font-size:15px;font-weight:700;color:var(--amber);margin-bottom:6px">Existem divergências</div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:16px">${processados-faltas} separados · ${faltas} em falta de ${total} itens previstos</div>
        <button onclick="loteRevisarDivergencias()" style="background:rgba(224,168,62,.15);border:1.5px solid var(--amber);color:var(--amber);font-size:13px;font-weight:700;padding:10px 20px;border-radius:8px;cursor:pointer">Revisar divergências</button>
      </div>` : `
      <div style="padding:28px 18px;text-align:center">
        <div style="width:44px;height:44px;border-radius:8px;background:rgba(87,185,129,.12);border:1px solid var(--green);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:20px;color:var(--green)">✓</div>
        <div style="font-size:15px;font-weight:700;color:var(--green);margin-bottom:6px">Tudo separado</div>
        <div style="font-size:12px;color:var(--text3)">${total}/${total} itens · ${pedidosCompletos}/${_loteAtual.length} pedidos</div>
      </div>`;
    if (btnProx) { btnProx.textContent = 'Concluir lote'; btnProx.onclick = concluirLoteMobile; btnProx.disabled = false; btnProx.style.opacity = '1'; }
    return;
  }

  // Card da posição atual — um bloco por SKU quando a posição tiver mais de um.
  const end = endsOrdenados[_loteEndIdx];
  const itemsEnd = gruposPorEnd[end];
  const rua = end.match(/^([A-Z]+)/)?.[1] || end;
  const porSku = {};
  for (const item of itemsEnd) {
    const cod = item.codigo || '_sem_cod_';
    if (!porSku[cod]) porSku[cod] = [];
    porSku[cod].push(item);
  }
  const posicaoCompleta = itemsEnd.every(i => i.status !== 'pendente');

  let html = `<div style="padding:12px 14px 4px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <span style="font-size:10px;font-weight:800;color:var(--accent);letter-spacing:1px">PRÓXIMA POSIÇÃO</span>
      <span style="font-size:11px;font-weight:700;color:var(--text2);background:var(--surface2);border:1px solid var(--border);padding:2px 9px;border-radius:6px">RUA ${rua}</span>
    </div>
    <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px">
      <span style="font-family:'Space Mono',monospace;font-size:24px;font-weight:800;color:var(--text)">${end}</span>
      <span style="font-size:12px;color:var(--text3);font-weight:600">${_loteEndIdx+1}/${endsOrdenados.length}</span>
    </div>
  </div>`;

  for (const [cod, items] of Object.entries(porSku)) {
    const todosProc = items.every(i => i.status !== 'pendente');
    const temFalta  = items.some(i => i.status === 'falta');
    const totalQty  = items.reduce((s, i) => s + (parseInt(i.quantidade)||1), 0);
    const ids = items.map(i => i.id).join(',');

    const porCaixa = {};
    for (const item of items) {
      const cx = item.caixa_num;
      if (!porCaixa[cx]) porCaixa[cx] = 0;
      porCaixa[cx] += parseInt(item.quantidade)||1;
    }
    const cxEntries = Object.entries(porCaixa).sort((a,b) => Number(a[0]) - Number(b[0]));
    const distribHtml = cxEntries.map(([cx, qty]) => {
      const cor = _CX_CORES[(Number(cx)-1) % _CX_CORES.length];
      const numPedido = _loteAtual[Number(cx)-1]?.numero_pedido || cx;
      // Nº da caixa em texto, não só a bolinha colorida — com lote de 6-8
      // pedidos, a paleta de 5 cores repete (caixa 3 e caixa 8 saem com a
      // mesma cor) e a bolinha sozinha não dá pra distinguir qual é qual.
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0">
        <span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--text2)">
          <span style="width:9px;height:9px;border-radius:50%;background:${cor};flex-shrink:0"></span>
          Caixa ${cx} · Pedido #${numPedido}
        </span>
        <span style="font-size:12px;font-weight:700;color:var(--text)">${qty} un.</span>
      </div>`;
    }).join('');

    const parcialAberto = _loteAcaoAberta === `p:${ids}`;
    const motivoAberto  = _loteAcaoAberta === `f:${ids}`;
    const primeiroId = ids.split(',')[0];

    html += `<div style="margin:0 14px 12px;border-radius:10px;border:1px solid ${todosProc?(temFalta?'var(--amber)':'var(--green)'):'var(--border)'};background:var(--surface);padding:14px;${todosProc?'opacity:0.6':''}">
      <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:4px">${items[0].descricao||cod}</div>
      <div style="font-size:11px;color:var(--text3);font-family:monospace;margin-bottom:10px">SKU: ${cod}</div>
      <div style="display:inline-flex;align-items:center;gap:6px;background:rgba(79,70,229,.12);border:1px solid var(--accent);color:var(--accent);font-size:13px;font-weight:700;padding:7px 14px;border-radius:8px;margin-bottom:12px">
        PEGAR ${totalQty} UNIDADE${totalQty===1?'':'S'}
      </div>
      <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.5px;margin-bottom:2px">DISTRIBUIÇÃO POR PEDIDO</div>
      <div style="margin-bottom:${todosProc?'0':'12px'}">${distribHtml}</div>
      ${!todosProc ? `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <button onclick="verificarGrupoLote('${ids}')" style="padding:10px 0;border:1.5px solid var(--green);border-radius:8px;background:rgba(87,185,129,.12);color:var(--green);font-size:12px;font-weight:700;cursor:pointer">Encontrei tudo</button>
          <button onclick="toggleParcialLote('${ids}')" style="padding:10px 0;border:1.5px solid var(--accent);border-radius:8px;background:rgba(79,70,229,.12);color:var(--accent);font-size:12px;font-weight:700;cursor:pointer">Parcial</button>
          <button onclick="toggleFaltaLote('${ids}')" style="padding:10px 0;border:1.5px solid var(--amber);border-radius:8px;background:rgba(224,168,62,.12);color:var(--amber);font-size:12px;font-weight:700;cursor:pointer">Falta</button>
        </div>` : `<div style="font-size:11px;font-weight:700;color:${temFalta?'var(--amber)':'var(--green)'};text-align:center">${temFalta?'Aguardando repositor':'Coletado'}</div>`}
      ${parcialAberto ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
          <label style="font-size:11px;color:var(--amber);font-weight:700">Quantas unidades encontrou (de ${totalQty}):</label>
          <div style="display:flex;gap:8px;margin-top:6px">
            <input type="number" id="lote-parc-input-${primeiroId}" min="0" max="${totalQty-1}" placeholder="0" inputmode="numeric"
              style="flex:1;padding:9px 10px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:15px;font-weight:700;text-align:center"/>
            <button onclick="confirmarParcialLote('${ids}',${totalQty})" style="background:var(--accent);border:none;color:#fff;font-weight:700;padding:0 18px;border-radius:8px;cursor:pointer">OK</button>
          </div>
        </div>` : ''}
      ${motivoAberto ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
          <label style="font-size:11px;color:var(--amber);font-weight:700;display:block;margin-bottom:6px">Motivo da falta:</label>
          ${MOTIVOS_FALTA_LOTE.map(m => `<button onclick="confirmarFaltaLote('${ids}',${totalQty},'${m.replace(/'/g,"\\'")}')"
            style="display:block;width:100%;text-align:left;padding:9px 12px;margin-bottom:6px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text2);font-size:12px;font-weight:600;cursor:pointer">${m}</button>`).join('')}
        </div>` : ''}
    </div>`;
  }

  if (body) body.innerHTML = html;

  if (btnProx) {
    btnProx.textContent = 'Próxima posição';
    btnProx.onclick = loteProximaPosicao;
    btnProx.disabled = !posicaoCompleta;
    btnProx.style.opacity = posicaoCompleta ? '1' : '0.5';
  }
}

// Botão "Concluir lote" sempre visível no rodapé — antes só aparecia depois de
// avançar "Próxima posição" por TODAS as ruas (e "Revisar divergências" ainda
// jogava de volta pra uma rua do meio, obrigando a andar tudo de novo). Mesma
// regra do backend (POST /pedidos/lote/concluir): só item 'pendente' bloqueia;
// falta/parcial conta como processado e o pedido vai pra "aguardando repositor".
// Com pendentes, o botão vira atalho pra próxima posição com item pendente.
function _atualizarBotaoConcluirLote(itens, pendentes) {
  const btn = document.getElementById('m-lote-btn-concluir');
  if (!btn) return;
  if (pendentes > 0) {
    btn.textContent = `Faltam ${pendentes} item(ns) — ir pro próximo pendente`;
    btn.style.background = 'var(--amber)';
  } else {
    const divergencias = itens.filter(i => i.status === 'falta' || i.status === 'parcial').length;
    btn.textContent = divergencias > 0 ? `Concluir lote (${divergencias} com divergência)` : 'Concluir lote';
    btn.style.background = 'var(--green)';
  }
}

function loteConcluirOuIrPendente() {
  const pendentes = _loteItens.filter(i => i.status === 'pendente').length;
  if (pendentes > 0) {
    const { gruposPorEnd, endsOrdenados } = _loteAgruparPorEndereco();
    const idx = endsOrdenados.findIndex(end => gruposPorEnd[end].some(i => i.status === 'pendente'));
    if (idx !== -1) { _loteEndIdx = idx; _loteAcaoAberta = null; _renderizarListaLote(); }
    return;
  }
  const divergencias = _loteItens.filter(i => i.status === 'falta' || i.status === 'parcial').length;
  if (divergencias > 0 && typeof wmsConfirm === 'function') {
    wmsConfirm({
      icone: '⚠️', titulo: 'Concluir com divergências?',
      sub: `${divergencias} item(ns) em falta/parcial vão pro repositor. Os pedidos com divergência ficam aguardando reposição.`,
      btnOk: 'Concluir lote',
    }, concluirLoteMobile);
    return;
  }
  concluirLoteMobile();
}

function toggleLotePedidos() {
  _lotePedidosAbertos = !_lotePedidosAbertos;
  _renderizarListaLote();
}

function toggleParcialLote(ids) {
  _loteAcaoAberta = _loteAcaoAberta === `p:${ids}` ? null : `p:${ids}`;
  _renderizarListaLote();
  if (_loteAcaoAberta) setTimeout(() => document.getElementById(`lote-parc-input-${ids.split(',')[0]}`)?.focus(), 100);
}

function toggleFaltaLote(ids) {
  _loteAcaoAberta = _loteAcaoAberta === `f:${ids}` ? null : `f:${ids}`;
  _renderizarListaLote();
}

// Depois de Encontrei tudo / Parcial / Falta: se a posição atual ficou toda
// resolvida (posição com vários SKUs só avança quando o último for marcado),
// vai sozinho pra próxima — o separador não precisa apertar "Próxima posição".
// Só é chamada logo após uma ação, nunca ao renderizar, então voltar pra uma
// posição já concluída (botão Voltar / Revisar divergências) não pula sozinho.
let _loteAvancando = false;
function _loteAutoAvancar() {
  if (_loteAvancando) return;
  const { gruposPorEnd, endsOrdenados } = _loteAgruparPorEndereco();
  if (_loteEndIdx >= endsOrdenados.length) return;
  if (!gruposPorEnd[endsOrdenados[_loteEndIdx]].every(i => i.status !== 'pendente')) return;
  _loteAvancando = true;
  loteProximaPosicao().finally(() => { _loteAvancando = false; });
}

// Avança pra próxima posição — mostra um flash de "concluído" antes de trocar.
async function loteProximaPosicao() {
  const { endsOrdenados } = _loteAgruparPorEndereco();
  if (_loteEndIdx >= endsOrdenados.length) return;
  const end = endsOrdenados[_loteEndIdx];
  const body = document.getElementById('m-lote-lista-body');
  if (body) body.innerHTML = `<div style="padding:60px 18px;text-align:center">
    <div style="width:44px;height:44px;border-radius:8px;background:rgba(87,185,129,.12);border:1px solid var(--green);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:20px;color:var(--green)">✓</div>
    <div style="font-size:15px;font-weight:700;color:var(--green)">${end} concluído</div>
  </div>`;
  const btnProx = document.getElementById('m-lote-btn-prox');
  if (btnProx) btnProx.disabled = true;
  await new Promise(r => setTimeout(r, 500));
  _loteEndIdx++;
  _loteAcaoAberta = null;
  _renderizarListaLote();
}

// Volta uma posição; na primeira, sai do lote (mesmo comportamento da seta do topo).
function loteVoltarPosicao() {
  if (_loteEndIdx > 0) { _loteEndIdx--; _loteAcaoAberta = null; _renderizarListaLote(); }
  else voltarFilaLote();
}

// Pula direto pra primeira posição com item em falta (link do painel de resumo).
function loteRevisarDivergencias() {
  const { gruposPorEnd, endsOrdenados } = _loteAgruparPorEndereco();
  const idx = endsOrdenados.findIndex(end => gruposPorEnd[end].some(i => i.status === 'falta'));
  _loteEndIdx = idx === -1 ? 0 : idx;
  _renderizarListaLote();
}

// Marca todos os itens de um mesmo produto+endereço de uma vez
async function verificarGrupoLote(idsStr) {
  const ids  = idsStr.split(',').map(Number);
  const sep  = separadorAtual;
  try {
    await Promise.all(ids.map(id =>
      fetch(`${API}/itens/${id}/verificar`, {
        method:'PUT', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ status:'encontrado', obs:'', qtd_falta:0, separador_id: sep?.id, separador_nome: sep?.nome })
      })
    ));
    for (const id of ids) {
      const item = _loteItens.find(i => i.id === id);
      if (item) item.status = 'encontrado';
    }
    feedbackColetor('sucesso');
    _renderizarListaLote();
    _loteAutoAvancar();
  } catch(e) { toast('Erro de rede','erro'); }
}

// Confirma o campo inline de Parcial (reaproveita o mesmo padrão de toggleParcial/
// confirmarParcial da tela normal de separação, sem window.prompt).
async function confirmarParcialLote(idsStr, qtdTotal) {
  const input = document.getElementById(`lote-parc-input-${idsStr.split(',')[0]}`);
  const qtdEnc = parseInt(input?.value);
  if (isNaN(qtdEnc) || qtdEnc < 0) { toast('Digite uma quantidade válida!','aviso'); return; }
  if (qtdEnc >= qtdTotal) { _loteAcaoAberta = null; await verificarGrupoLote(idsStr); return; }
  _loteAcaoAberta = null;
  if (qtdEnc === 0) { await faltaGrupoLote(idsStr, qtdTotal, MOTIVOS_FALTA_LOTE[0]); return; }
  await parcialGrupoLote(idsStr, qtdTotal, qtdEnc);
}

// Distribui a quantidade encontrada pelas caixas/pedidos em ordem
async function parcialGrupoLote(idsStr, qtdTotal, qtdEncontrada) {
  const ids = idsStr.split(',').map(Number);
  const sep = separadorAtual;
  let restante = qtdEncontrada;

  for (const id of ids) {
    const item = _loteItens.find(i => i.id === id);
    if (!item) continue;
    const qty = parseInt(item.quantidade)||1;

    let status, qtd_falta;
    if (restante >= qty)      { status = 'encontrado'; qtd_falta = 0;           restante -= qty; }
    else if (restante > 0)    { status = 'parcial';    qtd_falta = qty-restante; restante  = 0;  }
    else                      { status = 'falta';      qtd_falta = qty;                          }

    try {
      await fetch(`${API}/itens/${id}/verificar`, {
        method:'PUT', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ status, obs: status==='falta' ? MOTIVOS_FALTA_LOTE[0] : 'Parcial no lote', qtd_falta, separador_id: sep?.id, separador_nome: sep?.nome })
      });
      item.status = status;
    } catch(e) { /* segue */ }
  }

  feedbackColetor('parcial');
  toast(`${qtdEncontrada} de ${qtdTotal} unidades registradas`,'aviso');
  _renderizarListaLote();
  _loteAutoAvancar();
}

// Confirma o motivo escolhido pra Falta (fecha o seletor e reporta ao repositor)
async function confirmarFaltaLote(idsStr, qtdTotal, motivo) {
  _loteAcaoAberta = null;
  await faltaGrupoLote(idsStr, qtdTotal, motivo);
}

// Reporta falta para o repositor — marca os itens como falta e aciona aviso
async function faltaGrupoLote(idsStr, qtdTotal, motivo) {
  const ids = idsStr.split(',').map(Number);
  const sep = separadorAtual;
  const obs = motivo || 'Falta no lote';
  try {
    await Promise.all(ids.map(id =>
      fetch(`${API}/itens/${id}/verificar`, {
        method:'PUT', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ status:'falta', obs, qtd_falta: parseInt(qtdTotal)||1, separador_id: sep?.id, separador_nome: sep?.nome })
      })
    ));
    for (const id of ids) {
      const item = _loteItens.find(i => i.id === id);
      if (item) item.status = 'falta';
    }
    feedbackColetor('falta');
    toast('Repositor acionado','aviso');
    _renderizarListaLote();
    _loteAutoAvancar();
  } catch(e) { toast('Erro de rede','erro'); }
}

async function concluirLoteMobile() {
  const ids = _loteAtual.map(p => p.id);
  try {
    const res = await fetch(`${API}/pedidos/lote/concluir`, {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ pedido_ids: ids })
    });
    const data = await res.json();
    if (!res.ok) { toast(data.erro||'Erro ao concluir lote','erro'); return; }

    if (data.aguardando) { feedbackColetor('parcial'); toast('Lote enviado para aguardando repositor','aviso'); }
    else { feedbackColetor('sucesso'); toast('Lote concluído!','sucesso'); }

    // Tela de conclusão
    document.getElementById('m-lote-conclusao-body').innerHTML = _loteAtual.map((p,i) => {
      const r = data.resultados?.find(r => r.id === p.id);
      const ok = r?.ok; const ag = r?.aguardando;
      const label = ok ? 'Concluído' : ag ? 'Aguardando repositor' : (r?.erro||'Erro');
      const cor = ok ? 'var(--green)' : ag ? 'var(--amber)' : 'var(--red)';
      return `<div style="margin:6px 0;border-radius:10px;border:0.5px solid var(--border);background:var(--surface);padding:10px 14px;display:flex;align-items:center;gap:10px;text-align:left">
        <div style="width:30px;height:30px;border-radius:6px;background:${_CX_CORES[i%_CX_CORES.length]};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:500;color:#fff;flex-shrink:0">${i+1}</div>
        <div style="flex:1"><div style="font-size:13px;font-weight:500;color:var(--text)">#${p.numero_pedido}</div><div style="font-size:11px;color:var(--text3)">${label}</div></div>
        <span style="color:${cor};font-size:18px;font-weight:700">${ok?'✓':'✗'}</span>
      </div>`;
    }).join('');
    _loteScreens('m-lote-conclusao');
  } catch(e) { toast('Erro de rede','erro'); }
}

function voltarFilaLote() {
  _loteAtual = []; _loteItens = []; _loteIdAtual = null; _loteEndIdx = 0; _loteAcaoAberta = null;
  _loteScreens('m-cl-wrap');
  mudarTabSep('fila');
  carregarFilaMobile();
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
  if (CAIXA_OBRIGATORIA && !caixaJaVinculada) return;
  try {
    const res = await fetch(`${API}/pedidos/${pedidoAtualId}/itens`, { credentials:'include' });
    itensAtuais = await res.json();
    const wrap = document.getElementById('m-cl-wrap');
    if (!itensAtuais.length) { wrap.style.display = 'none'; return; }
    // Ordena pela rota física do estoque, sempre partindo do corredor E
    itensAtuais.sort((a,b) => {
      const ra = String(a.endereco||'').split(',')[0].trim();
      const rb = String(b.endereco||'').split(',')[0].trim();
      const rua_a = ra.match(/^([A-Z]+)/)?.[1] || '';
      const rua_b = rb.match(/^([A-Z]+)/)?.[1] || '';
      const num_a = parseInt(ra.match(/\d+/)?.[0]||0);
      const num_b = parseInt(rb.match(/\d+/)?.[0]||0);
      const ri = rua_a.localeCompare(rua_b) * _checklistSortDir;
      return ri !== 0 ? ri : (num_a - num_b) * _checklistSortDir;
    });
    wrap.style.display = 'block';
    renderChecklist('m-cl');
  } catch(e) { toast('Erro ao carregar itens!','erro'); }
}




function renderChecklistMobile() { renderChecklist('m-cl'); }




async function concluirPedidoMobile() {
  await _concluirCore('m-cl', carregarChecklistMobile, carregarFilaMobile, carregarStatsMobile, 'm-input-pedido', 'm-status-atual');
}

async function concluirComFaltaMobile() {
  await _concluirComFaltaCore('m-cl', carregarChecklistMobile, carregarFilaMobile, carregarStatsMobile, 'm-input-pedido', 'm-status-atual');
}




async function carregarFilaMobile() {
  try {
    const sepId = separadorAtual?.id || 0;
    const [resPed, resAv, resAguard, resRep] = await Promise.all([
      fetch(`${API}/pedidos${sepId ? `?separador_id=${sepId}` : ''}`, { credentials:'include' }),
      fetch(`${API}/repositor/avisos?status=pendente,aguardando_abastecer,verificando`, { credentials:'include' }),
      fetch(`${API}/repositor/avisos?status=nao_encontrado`, { credentials:'include' }),
      fetch(`${API}/repositor/avisos/separador/${sepId}`, { credentials:'include' })
    ]);
    const todos  = await resPed.json();
    const avisos = resAv.ok ? await resAv.json() : [];

    // Pedidos aguardando repositor (repositor ainda não resolveu)
    const pedidosComFalta = {};
    avisos.forEach(a => {
      const n = String(a.numero_pedido);
      if (!pedidosComFalta[n]) pedidosComFalta[n] = 0;
      pedidosComFalta[n]++;
    });

    // Pedidos aguardando supervisor (nao_encontrado)
    const aguardSup = resAguard.ok ? await resAguard.json() : [];
    const pedidosAguardSup = {};
    aguardSup.forEach(a => {
      const n = String(a.numero_pedido);
      if (!pedidosAguardSup[n]) pedidosAguardSup[n] = 0;
      pedidosAguardSup[n]++;
    });

    // Pedidos com item já reposto pelo repositor (separador ainda não foi buscar)
    const avisosSep = resRep.ok ? await resRep.json() : [];
    const pedidosReposto = {};
    avisosSep.forEach(a => {
      if (a.status === 'abastecido' || a.status === 'subiu' || a.status === 'reposto') {
        const n = String(a.numero_pedido);
        if (!pedidosReposto[n]) pedidosReposto[n] = 0;
        pedidosReposto[n]++;
      }
    });

    const ativos = todos.filter(p=>p.status!=='concluido');
    const meusMob = separadorAtual ? ativos.filter(p=>p.separador_id===separadorAtual.id) : [];
    const ordenadosMob = [...meusMob].sort(_compararOrdemFila);

    const badge = document.getElementById('stab-fila-badge');
    if (badge) { badge.textContent = ordenadosMob.length; badge.style.display = ordenadosMob.length > 0 ? 'inline' : 'none'; }
    const bdFila = document.getElementById('badge-fila-m');
    if (bdFila) bdFila.textContent = `${ordenadosMob.length} pedidos`;

    const lista = document.getElementById('lista-fila-mobile');
    if (!lista) return;
    if (!separadorAtual) {
      lista.innerHTML = '<div style="color:#dc2626;text-align:center;padding:30px;font-size:13px;background:#fee2e2;border-radius:10px;margin:12px">Usuário não vinculado a um separador. Fale com o supervisor.</div>';
      return;
    }
    if (!ordenadosMob.length) { lista.innerHTML = `<div style="color:var(--text3);text-align:center;padding:30px;font-size:13px">Nenhum pedido na fila<br><span style="font-size:10px;opacity:0.5">sep #${separadorAtual.id} · ${ativos.length} pedido(s) carregado(s)</span></div>`; return; }

    await carregarTaxaSeparacao();

    // Card de separação em lote — desabilitado temporariamente para todos os turnos
    const pendentesLote = ordenadosMob.filter(p => p.status !== 'separando' && p.status !== 'concluido');
    _lotePendentes = pendentesLote.map(p => ({ id: p.id, numero_pedido: p.numero_pedido, total_itens: p.total_itens || p.itens || 0 }));
    const turnoLabel = separadorAtual?.turno || 'Lote';
    const loteCard = (false)
      ? `<div onclick="abrirPreparacaoLote(_lotePendentes)"
           style="border:2px solid #7c3aed;border-radius:12px;padding:14px;margin-bottom:12px;background:linear-gradient(135deg,#faf5ff,#ede9fe);cursor:pointer">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <div style="width:38px;height:38px;border-radius:10px;background:#7c3aed;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0">${turnoLabel[0].toUpperCase()}</div>
            <div>
              <div style="font-size:14px;font-weight:700;color:#4c1d95">Separação em Lote — ${turnoLabel}</div>
              <div style="font-size:11px;color:#6d28d9">${pendentesLote.length} pedidos · todos de uma vez</div>
            </div>
            <span style="margin-left:auto;font-size:18px;color:#7c3aed">›</span>
          </div>
          <div style="display:flex;gap:5px;flex-wrap:wrap">
            ${pendentesLote.slice(0,5).map((p,i)=>`<span style="background:${_CX_CORES[i%_CX_CORES.length]}22;border:1px solid ${_CX_CORES[i%_CX_CORES.length]}44;color:${_CX_CORES[i%_CX_CORES.length]};border-radius:8px;padding:2px 8px;font-size:11px">#${p.numero_pedido}</span>`).join('')}
            ${pendentesLote.length>5?`<span style="font-size:11px;color:#6d28d9;padding:2px 4px">+${pendentesLote.length-5}</span>`:''}
          </div>
          <div style="margin-top:10px;background:#7c3aed;color:#fff;border-radius:8px;padding:8px;text-align:center;font-size:13px;font-weight:600">
            Iniciar Lote
          </div>
        </div>`
      : '';

    // Lote formado automaticamente pelo supervisor (Formar Lotes) — agrupa
    // pelos pedidos da própria fila que compartilham lote_id. Diferente do
    // card acima (self-service, desligado): aqui o agrupamento já veio
    // pronto do servidor (proximidade + justiça), então só precisa detectar
    // e abrir — sem tela de escolher caixa. Um lote SEMPRE aparece como UM
    // card (pronto pra começar ou em andamento), nunca como pedidos soltos
    // na lista abaixo — por isso o filtro no final exclui qualquer pedido
    // com lote_id, seja qual for o status.
    _gruposLoteSistema = {};
    _gruposLoteAndamento = {};
    ordenadosMob.forEach(p => {
      if (!p.lote_id) return;
      if (p.status === 'pendente') (_gruposLoteSistema[p.lote_id] = _gruposLoteSistema[p.lote_id] || []).push(p);
      else if (p.status === 'separando') (_gruposLoteAndamento[p.lote_id] = _gruposLoteAndamento[p.lote_id] || []).push(p);
    });

    // Cor do card do lote: mesma hierarquia das linhas individuais — se
    // qualquer pedido do lote tiver falta/parcial (aviso ao repositor) ou
    // estiver aguardando o supervisor, o card do lote inteiro sinaliza isso.
    const _corLote = (peds) => {
      const temSup   = peds.some(p => (pedidosAguardSup[String(p.numero_pedido)]||0) > 0);
      const temFalta = peds.some(p => (pedidosComFalta[String(p.numero_pedido)]||0) > 0);
      if (temSup)   return { bord:'var(--indigo)', txt:'var(--text)', sub:'var(--indigo)', tag:'aguardando supervisor' };
      if (temFalta) return { bord:'var(--amber)', txt:'var(--text)', sub:'var(--amber)', tag:'aguardando repositor' };
      return { bord:'var(--accent)', txt:'var(--text)', sub:'var(--text3)', tag:'' };
    };

    const _renderLoteCard = (loteId, peds, { emAndamento }) => {
      const cor = _corLote(peds);
      const onclickFn = emAndamento ? `continuarLoteSistema(${loteId})` : `abrirLoteSistema(${loteId})`;
      const titulo = emAndamento ? `Lote em andamento — #${loteId}` : `Lote pronto — #${loteId}`;
      const sub = cor.tag ? `${cor.tag} · toque pra continuar` : (emAndamento ? `${peds.length} pedidos · toque pra continuar` : `${peds.length} pedidos · toque pra começar`);
      return `<div onclick="${onclickFn}"
           style="border:1px solid var(--border);border-left:3px solid ${cor.bord};border-radius:10px;padding:14px;margin-bottom:12px;background:var(--surface);cursor:pointer">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <div>
            <div style="font-size:14px;font-weight:700;color:${cor.txt}">${titulo}</div>
            <div style="font-size:11px;color:${cor.sub}">${sub}</div>
          </div>
          <span style="margin-left:auto;font-size:16px;color:var(--text3)">›</span>
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap">
          ${peds.slice(0,6).map((p,i)=>`<span style="background:var(--surface2);border:1px solid var(--border);color:var(--text2);border-radius:6px;padding:2px 8px;font-size:11px">#${p.numero_pedido}</span>`).join('')}
          ${peds.length>6?`<span style="font-size:11px;color:var(--text3);padding:2px 4px">+${peds.length-6}</span>`:''}
        </div>
      </div>`;
    };

    const loteSistemaCard = Object.entries(_gruposLoteSistema).map(([loteId, peds]) => _renderLoteCard(loteId, peds, { emAndamento:false })).join('')
      + Object.entries(_gruposLoteAndamento).map(([loteId, peds]) => _renderLoteCard(loteId, peds, { emAndamento:true })).join('');

    lista.innerHTML = loteSistemaCard + loteCard + ordenadosMob.filter(p => !p.lote_id).map(p => {
      const transp   = String(p.transportadora||'').toUpperCase();
      const isDrive  = transp.includes('DRIVE');
      const isPrime  = p.tem_prime === true;
      const qtdFalta   = pedidosComFalta[String(p.numero_pedido)] || 0;
      const temFalta   = qtdFalta > 0;
      const qtdSup     = pedidosAguardSup[String(p.numero_pedido)] || 0;
      const temSup     = qtdSup > 0;
      const qtdReposto = (!temFalta && !temSup) ? (pedidosReposto[String(p.numero_pedido)] || 0) : 0;
      const temReposto = qtdReposto > 0;

      // Hierarquia: supervisor (roxo) > falta (âmbar) > reposto (verde) > drive > normal
      const bordColor = temSup ? 'var(--indigo)' : temFalta ? 'var(--amber)' : temReposto ? 'var(--green)' : isDrive ? 'var(--red)' : 'var(--border)';
      const bgColor   = temSup ? 'rgba(139,92,246,.1)' : temFalta ? 'rgba(224,168,62,.1)' : temReposto ? 'rgba(87,185,129,.1)' : isDrive ? 'rgba(201,82,79,.1)' : 'var(--surface)';
      const numColor  = isDrive ? 'var(--red)' : temSup ? 'var(--indigo)' : temFalta ? 'var(--amber)' : temReposto ? 'var(--green)' : 'var(--accent)';
      const pillTxt   = temSup ? 'supervisor' : temFalta ? 'aguard. repositor' : temReposto ? 'pode continuar!' : isDrive ? 'drive thru' : 'aguardando sep';
      const pillCls   = temSup ? 'separando' : temReposto ? 'separando' : 'pendente';
      const bordWidth = (temSup || temFalta || temReposto) ? '2.5px' : '1.5px';

      return _filaDragWrap(p.id, `<div style="border:${bordWidth} solid ${bordColor};border-radius:12px;padding:12px 14px;margin-bottom:8px;background:${bgColor}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div style="font-size:20px;font-weight:800;color:${numColor};font-family:'Space Mono',monospace">#${p.numero_pedido}</div>
          <div style="display:flex;gap:6px;align-items:center">
            ${badgeTempoSep(p.total_itens||p.itens, p.pontuacao, p.itens)}
            <span class="pill ${pillCls}" style="font-size:10px;${temReposto?'background:rgba(87,185,129,.15);color:var(--green);border-color:rgba(87,185,129,.4)':''}">${pillTxt}</span>
          </div>
        </div>
        <div style="display:flex;gap:10px;font-size:12px;color:var(--text2);flex-wrap:wrap;margin-bottom:4px">
          <span><b style="color:var(--text)">${p.total_itens||p.itens||0} itens</b></span>
          <span><b style="color:var(--text)">${p.itens||0} SKUs</b></span>
          ${p.cliente ? `<span>${p.cliente}</span>` : ''}
          ${p.transportadora ? `<span>${p.transportadora}</span>` : ''}
        </div>
        ${temSup ? `<div style="display:flex;align-items:center;gap:5px;background:rgba(139,92,246,.15);border:1px solid rgba(139,92,246,.4);border-radius:6px;padding:5px 9px;margin-bottom:5px">
          <span style="font-size:11px;font-weight:700;color:var(--indigo)">${qtdSup} item${qtdSup>1?'s':''} aguardando supervisor</span>
        </div>` : ''}
        ${temFalta ? `<div style="display:flex;align-items:center;gap:5px;background:rgba(224,168,62,.15);border:1px solid rgba(224,168,62,.4);border-radius:6px;padding:5px 9px;margin-bottom:5px">
          <span style="font-size:11px;font-weight:700;color:var(--amber)">⏳ ${qtdFalta} item${qtdFalta>1?'s':''} aguardando repositor — não pegue ainda!</span>
        </div>` : ''}
        ${temReposto ? `<div style="display:flex;align-items:center;gap:6px;background:rgba(87,185,129,.15);border:1px solid rgba(87,185,129,.4);border-radius:6px;padding:6px 10px;margin-bottom:5px">

          <span style="font-size:11px;font-weight:700;color:var(--green)">${qtdReposto} item${qtdReposto>1?'s':''} reposto${qtdReposto>1?'s':''} pelo repositor — volte para este pedido!</span>
        </div>` : ''}
        <button class="btn btn-primary btn-sm" style="width:100%;margin-top:8px;padding:10px;font-size:14px;font-weight:700${temReposto?';background:#16a34a':''}"
          onclick="selecionarPedidoFilaMobile('${p.numero_pedido}')">
          ${temReposto ? 'Continuar Separação' : 'Iniciar Separação'}
        </button>
      </div>`);
    }).join('');
    _initFilaDragReorder(lista);
  } catch(e) { console.warn(e); }
}




function selecionarPedidoFilaMobile(num) {
  // Reseta estado do pedido anterior antes de iniciar novo
  caixaJaVinculada = false;
  const caixaInp = document.getElementById('m-input-caixa');
  const caixaSt  = document.getElementById('m-caixa-status');
  if (caixaInp) caixaInp.value = '';
  if (caixaSt)  { caixaSt.style.display = 'none'; caixaSt.innerHTML = ''; }
  // Esconde placeholder se existir
  const ph = document.getElementById('m-cl-wrap-placeholder');
  if (ph) ph.style.display = 'none';
  // ── ALTERADO: vai para aba 'separar' (2ª aba) ao selecionar pedido ──
  mudarTabSep('separar');
  document.getElementById('m-input-pedido').value = num;
  confirmarPedidoMobile();
}




async function carregarAguardandoMobile() {
  const el      = document.getElementById('sep-lista-aguardando');
  const cntEl   = document.getElementById('sep-cnt-aguardando');
  const badgeEl = document.getElementById('stab-aguardando-badge');
  if (!el) return;
  try {
    const res = await fetch(`${API}/repositor/avisos?status=nao_encontrado,protocolo`, { credentials:'include' });
    if (!res.ok) throw new Error();
    const av = await res.json();
    // Filtra apenas avisos do separador logado
    const meus = separadorAtual
      ? av.filter(a => a.separador_nome === separadorAtual.nome || String(a.separador_id) === String(separadorAtual.id))
      : av;
    const n = meus.length;
    if (cntEl)   cntEl.textContent = n;
    if (badgeEl) { badgeEl.textContent = n; badgeEl.style.display = n ? 'inline-flex' : 'none'; }
    if (!n) {
      el.innerHTML = '<div style="text-align:center;color:var(--text3);padding:40px;font-size:13px">Nenhum item aguardando</div>';
      return;
    }
    // Agrupa por numero_pedido
    const porPedido = {};
    meus.forEach(a => {
      const key = a.numero_pedido || '—';
      if (!porPedido[key]) porPedido[key] = [];
      porPedido[key].push(a);
    });
    el.innerHTML = Object.entries(porPedido).map(([ped, itens]) => {
      const temProtocolo = itens.some(a => a.status === 'protocolo');
      const borderColor  = temProtocolo ? '#8B5CF6' : '#f59e0b';
      const bgColor      = temProtocolo ? 'rgba(139,92,246,.1)' : 'rgba(224,168,62,.1)';
      const labelTxt     = temProtocolo ? 'PROTOCOLO' : 'NÃO ENCONTRADO';
      const labelColor   = temProtocolo ? '#7c3aed'   : '#d97706';
      return `<div style="background:${bgColor};border:1px solid ${borderColor}44;border-left:3px solid ${borderColor};border-radius:10px;padding:14px;margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-family:'Space Mono',monospace;font-size:15px;font-weight:700;color:var(--text)">Pedido #${ped}</span>
          <span style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:12px;background:${borderColor}22;color:${labelColor};border:1px solid ${borderColor}66">${labelTxt}</span>
        </div>
        ${itens.map(a => `
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:7px;padding:10px;margin-bottom:6px">
            <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:2px">${a.codigo||'—'}</div>
            <div style="font-size:11px;color:var(--text2);margin-bottom:3px">${a.descricao||'—'}</div>
            <div style="font-size:11px;color:var(--text3)">Qtd: <b>${a.quantidade||1}</b>${a.endereco?' | End: '+a.endereco:''}${a.hora_aviso?' | '+a.hora_aviso:''}</div>
          </div>
        `).join('')}
      </div>`;
    }).join('');
  } catch(e) {
    el.innerHTML = '<div style="text-align:center;color:var(--red);padding:24px;font-size:13px">Erro ao carregar</div>';
  }
}




async function carregarStatsMobile() {
  try {
    const nomeEl = document.getElementById('m-stat-nome');
    if (nomeEl) nomeEl.textContent = `${separadorAtual?.nome || usuarioAtual?.nome || '—'}`;
    let dados = [];
    if (separadorAtual) {
      const res = await fetch(`${API}/produtividade?separador_id=${separadorAtual.id}`, { credentials:'include' });
      if (res.ok) dados = await res.json();
    }
    if (dados.length) {
      const d = dados[0];
      document.getElementById('m-stat-hoje').textContent = d.hoje || 0;
      document.getElementById('m-stat-mes').textContent  = d.mes  || 0;
      document.getElementById('m-stat-ano').textContent  = d.total_ano || 0;
    }
  } catch(e) { console.warn(e); }
}




/* ══════════════════════════════════════════
   SEPARAÇÃO DESKTOP — FILA
══════════════════════════════════════════ */
async function carregarFilaDesk() {
  const lista    = document.getElementById('d-sep-fila');
  const badgeBd  = document.getElementById('badge-fila-d');
  const badgeTab = document.getElementById('d-sep-fila-badge');
  if (!lista) return;
  lista.innerHTML = '<div style="color:var(--text3);text-align:center;padding:30px;font-size:13px">Carregando fila...</div>';
  try {
    const sepId = separadorAtual?.id || 0;
    const [resPed, resAv, resAguard, resRep] = await Promise.all([
      fetch(`${API}/pedidos${sepId ? `?separador_id=${sepId}` : ''}`, { credentials:'include' }),
      fetch(`${API}/repositor/avisos?status=pendente,aguardando_abastecer,verificando`, { credentials:'include' }),
      fetch(`${API}/repositor/avisos?status=nao_encontrado`, { credentials:'include' }),
      fetch(`${API}/repositor/avisos/separador/${sepId}`, { credentials:'include' })
    ]);
    const todos  = await resPed.json();
    const avisos = resAv.ok ? await resAv.json() : [];

    const pedidosComFalta = {};
    avisos.forEach(a => {
      const n = String(a.numero_pedido);
      if (!pedidosComFalta[n]) pedidosComFalta[n] = 0;
      pedidosComFalta[n]++;
    });

    const aguardSup = resAguard.ok ? await resAguard.json() : [];
    const pedidosAguardSup = {};
    aguardSup.forEach(a => {
      const n = String(a.numero_pedido);
      if (!pedidosAguardSup[n]) pedidosAguardSup[n] = 0;
      pedidosAguardSup[n]++;
    });

    const avisosSep = resRep.ok ? await resRep.json() : [];
    const pedidosReposto = {};
    avisosSep.forEach(a => {
      if (a.status === 'abastecido' || a.status === 'subiu' || a.status === 'reposto') {
        const n = String(a.numero_pedido);
        if (!pedidosReposto[n]) pedidosReposto[n] = 0;
        pedidosReposto[n]++;
      }
    });

    const ativos     = todos.filter(p => p.status !== 'concluido');
    const meusDsk    = separadorAtual ? ativos.filter(p => p.separador_id === separadorAtual.id) : [];
    const ordenados  = [...meusDsk].sort(_compararOrdemFila);

    if (badgeBd)  badgeBd.textContent  = `${ordenados.length} pedidos`;
    if (badgeTab) { badgeTab.textContent = ordenados.length; badgeTab.style.display = ordenados.length > 0 ? 'inline' : 'none'; }

    if (!ordenados.length) {
      lista.innerHTML = '<div style="color:var(--text3);text-align:center;padding:30px;font-size:13px">Nenhum pedido na fila</div>';
      return;
    }

    lista.innerHTML = ordenados.map(p => {
      const transp   = String(p.transportadora||'').toUpperCase();
      const isDrive  = transp.includes('DRIVE');
      const qtdFalta   = pedidosComFalta[String(p.numero_pedido)] || 0;
      const temFalta   = qtdFalta > 0;
      const qtdSup     = pedidosAguardSup[String(p.numero_pedido)] || 0;
      const temSup     = qtdSup > 0;
      const qtdReposto = (!temFalta && !temSup) ? (pedidosReposto[String(p.numero_pedido)] || 0) : 0;
      const temReposto = qtdReposto > 0;

      // Hierarquia: supervisor (roxo) > falta (âmbar) > reposto (verde) > drive > normal
      const bordColor = temSup ? 'var(--indigo)' : temFalta ? 'var(--amber)' : temReposto ? 'var(--green)' : isDrive ? 'var(--red)' : 'var(--border)';
      const bgColor   = temSup ? 'rgba(139,92,246,.1)' : temFalta ? 'rgba(224,168,62,.1)' : temReposto ? 'rgba(87,185,129,.1)' : 'var(--surface)';
      const numColor  = isDrive ? 'var(--red)' : temSup ? 'var(--indigo)' : temReposto ? 'var(--green)' : 'var(--accent)';
      const pillTxt   = temSup ? 'supervisor' : temFalta ? 'repositor' : temReposto ? 'pode continuar!' : isDrive ? 'drive thru' : 'aguardando sep';
      const pillCls   = temSup ? 'separando' : temReposto ? 'separando' : 'pendente';
      const bordWidth = (temSup || temFalta || temReposto) ? '2px' : '1.5px';

      return _filaDragWrap(p.id, `<div style="border:${bordWidth} solid ${bordColor};border-radius:12px;padding:12px 14px;margin-bottom:8px;background:${bgColor}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div style="font-size:20px;font-weight:800;color:${numColor};font-family:'Space Mono',monospace">#${p.numero_pedido}</div>
          <span class="pill ${pillCls}" style="font-size:10px;${temReposto?'background:rgba(87,185,129,.15);color:var(--green);border-color:rgba(87,185,129,.4)':''}">${pillTxt}</span>
        </div>
        <div style="display:flex;gap:10px;font-size:12px;color:var(--text2);flex-wrap:wrap;margin-bottom:4px">
          <span><b style="color:var(--text)">${p.total_itens||p.itens||0} itens</b></span>
          <span><b style="color:var(--text)">${p.itens||0} SKUs</b></span>
          ${p.cliente ? `<span>${p.cliente}</span>` : ''}
          ${p.transportadora ? `<span>${p.transportadora}</span>` : ''}
        </div>
        ${temSup ? `<div style="display:flex;align-items:center;gap:5px;background:rgba(139,92,246,.12);border:1px solid rgba(139,92,246,.35);border-radius:6px;padding:5px 9px;margin-bottom:5px">
          <span style="font-size:11px;font-weight:600;color:var(--indigo)">${qtdSup} item${qtdSup>1?'s':''} aguardando supervisor</span>
        </div>` : ''}
        ${temFalta ? `<div style="display:flex;align-items:center;gap:5px;background:rgba(224,168,62,.12);border:1px solid rgba(224,168,62,.35);border-radius:6px;padding:5px 9px;margin-bottom:5px">
          <span style="font-size:11px;font-weight:600;color:var(--amber)">${qtdFalta} item${qtdFalta>1?'s':''} aguardando repositor</span>
        </div>` : ''}
        ${temReposto ? `<div style="display:flex;align-items:center;gap:6px;background:rgba(87,185,129,.15);border:1px solid rgba(87,185,129,.4);border-radius:6px;padding:6px 10px;margin-bottom:5px">

          <span style="font-size:11px;font-weight:700;color:var(--green)">${qtdReposto} item${qtdReposto>1?'s':''} reposto${qtdReposto>1?'s':''} pelo repositor — volte para este pedido!</span>
        </div>` : ''}
        <button class="btn btn-primary btn-sm" style="width:100%;margin-top:8px;padding:10px;font-size:14px;font-weight:700${temReposto?';background:#16a34a':''}"
          onclick="selecionarPedidoFilaDesk('${p.numero_pedido}')">
          ${temReposto ? 'Continuar Separação' : 'Iniciar Separação'}
        </button>
      </div>`);
    }).join('');
    _initFilaDragReorder(lista);
  } catch(e) { console.warn(e); }
}

/* ── Ordem manual da fila do separador (drag-and-drop) ────────────────────
   Itens já reordenados manualmente (ordem_fila>0) vêm primeiro, na sequência
   escolhida; os demais mantêm o critério padrão (menos itens primeiro). */
function _compararOrdemFila(a, b) {
  const oa = a.ordem_fila || 0, ob = b.ordem_fila || 0;
  if (oa > 0 || ob > 0) {
    if (oa > 0 && ob > 0) return oa - ob;
    return oa > 0 ? -1 : 1;
  }
  return (a.itens||0) - (b.itens||0);
}

function _filaDragWrap(id, innerHtml) {
  return `<div class="fila-drag-block" data-id="${id}" style="display:flex;align-items:stretch;gap:2px">
    <div class="fila-drag-handle" style="display:flex;align-items:center;justify-content:center;width:26px;flex-shrink:0;touch-action:none;cursor:grab;color:var(--text3)">
      <svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor" aria-hidden="true">
        <circle cx="3" cy="3" r="1.6"/><circle cx="9" cy="3" r="1.6"/>
        <circle cx="3" cy="9" r="1.6"/><circle cx="9" cy="9" r="1.6"/>
        <circle cx="3" cy="15" r="1.6"/><circle cx="9" cy="15" r="1.6"/>
      </svg>
    </div>
    <div style="flex:1;min-width:0">${innerHtml}</div>
  </div>`;
}

function _initFilaDragReorder(container) {
  if (!container) return;
  container.querySelectorAll('.fila-drag-handle').forEach(handle => {
    handle.onpointerdown = (ev) => _filaDragStart(ev, container);
  });
}

function _filaDragStart(ev, container) {
  ev.preventDefault();
  const block = ev.currentTarget.closest('.fila-drag-block');
  if (!block) return;
  const blocks = Array.from(container.querySelectorAll('.fila-drag-block'));
  const startIndex = blocks.indexOf(block);
  if (startIndex < 0) return;
  // Mede as posições UMA vez no início — referência fixa durante todo o arraste,
  // evita reflow a cada pixel (era a causa da "travada").
  const rects = blocks.map(b => b.getBoundingClientRect());
  const draggedHeight = rects[startIndex].height + 8; // + gap aproximado entre blocos
  const startY = ev.clientY;
  let currentIndex = startIndex;

  block.style.position   = 'relative';
  block.style.zIndex     = '50';
  block.style.opacity    = '.92';
  block.style.background = 'var(--surface)';
  block.style.boxShadow  = '0 4px 14px rgba(0,0,0,.18)';
  block.style.pointerEvents = 'none';
  try { block.setPointerCapture(ev.pointerId); } catch(e) {}
  blocks.forEach(b => { if (b !== block) b.style.transition = 'transform .12s ease'; });

  const onMove = (e) => {
    const dy = e.clientY - startY;
    block.style.transform = `translateY(${dy}px)`;
    const draggedMid = rects[startIndex].top + rects[startIndex].height / 2 + dy;

    let newIndex = currentIndex;
    if (dy > 0) {
      for (let i = currentIndex + 1; i < rects.length; i++) {
        if (draggedMid > rects[i].top + rects[i].height / 2) newIndex = i; else break;
      }
    } else if (dy < 0) {
      for (let i = currentIndex - 1; i >= 0; i--) {
        if (draggedMid < rects[i].top + rects[i].height / 2) newIndex = i; else break;
      }
    }
    if (newIndex !== currentIndex) {
      currentIndex = newIndex;
      blocks.forEach((b, i) => {
        if (b === block) return;
        let shift = 0;
        if (i > startIndex && i <= currentIndex) shift = -draggedHeight;
        else if (i < startIndex && i >= currentIndex) shift = draggedHeight;
        b.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    }
  };

  const onUp = async () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    blocks.forEach(b => { b.style.transition = ''; b.style.transform = ''; });
    block.style.position    = '';
    block.style.zIndex      = '';
    block.style.opacity     = '';
    block.style.background  = '';
    block.style.boxShadow   = '';
    block.style.pointerEvents = '';
    if (currentIndex !== startIndex) {
      if (currentIndex > startIndex) container.insertBefore(block, blocks[currentIndex].nextSibling);
      else container.insertBefore(block, blocks[currentIndex]);
    }
    await _filaSalvarOrdem(container);
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

async function _filaSalvarOrdem(container) {
  const blocks = Array.from(container.querySelectorAll('.fila-drag-block'));
  const ids = blocks.map(b => parseInt(b.dataset.id)).filter(Boolean);
  if (!ids.length) return;
  try {
    await fetch(`${API}/pedidos/reordenar-fila`, {
      credentials: 'include', method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
  } catch(e) { toast('Erro ao salvar nova ordem.', 'erro'); }
}

function selecionarPedidoFilaDesk(num) {
  caixaJaVinculada = false;
  const caixaInp = document.getElementById('cl-input-caixa');
  const caixaSt  = document.getElementById('cl-caixa-status');
  if (caixaInp) caixaInp.value = '';
  if (caixaSt)  { caixaSt.style.display = 'none'; caixaSt.innerHTML = ''; }
  const ph = document.getElementById('cl-wrap-placeholder');
  if (ph) ph.style.display = 'none';
  mudarTabSepDesk('separar');
  document.getElementById('input-pedido').value = num;
  confirmarPedido();
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
    if (res.status===404) { toast('Pedido não encontrado!','erro'); document.getElementById(inputId).value=''; return; }
    if (res.status===409||res.status===400) { toast(`${data.erro}`,'aviso'); document.getElementById(inputId).value=''; return; }
    if (!res.ok) { toast(`${data.erro}`,'erro'); return; }
    pedidoAtualId  = data.pedido_id;
    pedidoAtualNum = num;
    const statusEl = document.getElementById(statusId);
    // Busca info de transportadora/cliente
    let infoTransp = '';
    try {
      const tRes = await fetch(`${API}/pedidos/info/${encodeURIComponent(num)}`, { credentials:'include' });
      if (tRes.ok) {
        const tData = await tRes.json();
        if (tData.cliente || tData.transportadora) {
          infoTransp = `<div style="margin-top:6px;padding:8px 10px;background:rgba(79,70,229,.06);border:1px solid rgba(79,70,229,.18);border-radius:8px;font-size:12px">
            ${tData.cliente ? `<div><b style="color:var(--text)">${tData.cliente}</b></div>` : ''}
            ${tData.transportadora ? `<div><b style="color:var(--accent)">${tData.transportadora}</b></div>` : ''}
          </div>`;
        }
      }
    } catch(e) { console.warn(e); }
    if (statusEl) { 
      statusEl.innerHTML = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:${infoTransp?'8px':'0'}"><span style="width:8px;height:8px;background:var(--accent);border-radius:50%;flex-shrink:0;display:inline-block"></span><span style="font-size:13px;color:var(--text2)">Pedido <b style="color:var(--text);font-family:'Space Mono',monospace">${num}</b> — <span style="font-weight:700;color:var(--accent)">Em separação</span></span></div>${infoTransp}`;
      statusEl.style.display = 'block'; 
    }
    // Drive Thru — destaque vermelho no info card
    const isDrive = (infoTransp||'').toUpperCase().includes('DRIVE');
    if (statusEl && isDrive) {
      statusEl.style.borderLeftColor = 'var(--red)';
    }
    toast(data.ja_atribuido ? `Pedido ${num} carregado` : `Pedido ${num} iniciado`, 'info');

    const clWrap = document.getElementById(clWrapId);
    let phId = clWrapId + '-placeholder';
    let ph = document.getElementById(phId);
    if (!ph) {
      ph = document.createElement('div');
      ph.id = phId;
      clWrap?.parentNode?.insertBefore(ph, clWrap?.nextSibling || clWrap);
    }

    if (data.caixa_vinculada) {
      // Pedido já tinha caixa — libera direto e mostra caixa vinculada
      caixaJaVinculada = true;
      mostrarCampoCaixa(true, true); // jaVinculada=true → modo compacto verde
      ph.style.display = 'none';
      // Busca e exibe o número da caixa já vinculada
      try {
        const rCaixa = await fetch(`${API}/pedidos/info/${encodeURIComponent(num)}`, { credentials:'include' });
        if (rCaixa.ok) {
          const dCaixa = await rCaixa.json();
          if (dCaixa.numero_caixa) {
            const inpMob = document.getElementById('m-input-caixa');
            const inpDesk = document.getElementById('cl-input-caixa');
            const stMob  = document.getElementById('m-caixa-status');
            const stDesk = document.getElementById('cl-caixa-status');
            if (inpMob)  inpMob.value  = dCaixa.numero_caixa;
            if (inpDesk) inpDesk.value = dCaixa.numero_caixa;
            const msg = `<span style="color:var(--green);font-weight:600">Caixa <b>${dCaixa.numero_caixa}</b> já vinculada</span>`;
            if (stMob)  { stMob.style.display='block';  stMob.innerHTML = msg; }
            if (stDesk) { stDesk.style.display='block'; stDesk.innerHTML = msg; }
          }
        }
      } catch(e) { console.warn(e); }
      await fnChecklist();
    } else if (CAIXA_OBRIGATORIA) {
      // Exige caixa antes de mostrar itens
      caixaJaVinculada = false;
      mostrarCampoCaixa(true);
      if (clWrap) clWrap.style.display = 'none';
      ph.style.display = 'block';
      ph.innerHTML = `<div style="background:var(--surface);border:1.5px solid rgba(201,82,79,.4);border-radius:10px;text-align:center;padding:28px 20px;">
        <div style="width:44px;height:44px;border-radius:50%;background:rgba(201,82,79,.15);border:1.5px solid rgba(201,82,79,.4);display:flex;align-items:center;justify-content:center;margin:0 auto 10px;display:none">
        <div style="font-size:13px;font-weight:700;color:var(--red);margin-bottom:4px;">Vincule a caixa para iniciar</div>
        <div style="font-size:11px;color:var(--text3);">A lista de itens só aparece após vincular o número da caixa</div>
      </div>`;
    } else {
      // Caixa desabilitada — libera checklist direto
      caixaJaVinculada = true;
      mostrarCampoCaixa(false);
      ph.style.display = 'none';
      await fnChecklist();
    }
    fnFila();
  } catch(e) { toast('Erro ao conectar!','erro'); }
}




async function _concluirComFaltaCore(prefix, fnChecklist, fnFila, fnStats, inputId, statusId) {
  if (!pedidoAtualId) return;
  try {
    const res  = await fetch(`${API}/pedidos/${pedidoAtualId}/concluir-com-falta`, { credentials:'include', method:'PUT' });
    const data = await res.json();
    if (!res.ok) {
      toast(data.erro || 'Erro ao concluir com falta!', 'erro');
      // A falta pode já ter sido resolvida pelo repositor sem a tela ter atualizado
      // ainda (poll de 30s) — recarrega o checklist agora pra liberar o botão
      // "CONCLUIR" normal na hora, em vez de deixar o separador travado.
      await fnChecklist();
      return;
    }
    toast(`Pedido ${pedidoAtualNum} enviado para AGUARDANDO (${data.itens_falta} item(s) faltando)`, 'aviso');
    const wrap = document.getElementById(`${prefix}-wrap`);
    if (wrap) wrap.style.display = 'none';
    const statusEl = document.getElementById(statusId);
    if (statusEl) statusEl.style.display = 'none';
    document.getElementById(inputId).value = '';
    const caixaDesktop = document.getElementById('cl-input-caixa');
    const caixaMobile  = document.getElementById('m-input-caixa');
    const caixaStD = document.getElementById('cl-caixa-status');
    const caixaStM = document.getElementById('m-caixa-status');
    if (caixaDesktop) caixaDesktop.value = '';
    if (caixaMobile)  caixaMobile.value  = '';
    if (caixaStD) { caixaStD.style.display = 'none'; caixaStD.innerHTML = ''; }
    if (caixaStM) { caixaStM.style.display = 'none'; caixaStM.innerHTML = ''; }
    ['m-cl-wrap-placeholder','cl-wrap-placeholder'].forEach(id => {
      const el = document.getElementById(id); if (el) el.style.display = 'none';
    });
    mostrarCampoCaixa(false);
    caixaJaVinculada = false;
    pedidoAtualId=null; pedidoAtualNum=null; itensAtuais=[];
    fnFila(); fnStats();
    setTimeout(() => document.getElementById(inputId).focus(), 300);
  } catch(e) { toast('Erro ao concluir com falta!','erro'); }
}

async function _concluirCore(prefix, fnChecklist, fnFila, fnStats, inputId, statusId) {
  if (!pedidoAtualId) return;
  try {
    const res  = await fetch(`${API}/pedidos/${pedidoAtualId}/concluir`, { credentials:'include', method:'PUT' });
    const data = await res.json();
    if (data.aguardando || data.bloqueado || data.erro) {
      if (data.aguardando) toast('⏳ Ainda aguardando o repositor!','aviso');
      else if (data.bloqueado) toast('Bloqueado! Aguarde o supervisor liberar.','erro');
      else toast(`${data.erro}`,'aviso');
      // Estado pode ter mudado (repositor resolveu, supervisor liberou) sem a tela
      // ter atualizado ainda — recarrega o checklist pra refletir a situação atual.
      await fnChecklist();
      return;
    }
    toast(`Pedido ${pedidoAtualNum} concluído`, 'sucesso');
    const wrap = document.getElementById(`${prefix}-wrap`);
    if (wrap) wrap.style.display = 'none';
    const statusEl = document.getElementById(statusId);
    if (statusEl) statusEl.style.display = 'none';
    document.getElementById(inputId).value = '';
    // Limpa campos de caixa
    const caixaDesktop = document.getElementById('cl-input-caixa');
    const caixaMobile  = document.getElementById('m-input-caixa');
    const caixaStD = document.getElementById('cl-caixa-status');
    const caixaStM = document.getElementById('m-caixa-status');
    if (caixaDesktop) caixaDesktop.value = '';
    if (caixaMobile)  caixaMobile.value  = '';
    if (caixaStD) { caixaStD.style.display = 'none'; caixaStD.innerHTML = ''; }
    if (caixaStM) { caixaStM.style.display = 'none'; caixaStM.innerHTML = ''; }
    // Esconde placeholders
    ['m-cl-wrap-placeholder','cl-wrap-placeholder'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    mostrarCampoCaixa(false);
    // RESET: obriga vincular caixa no próximo pedido
    caixaJaVinculada = false;
    pedidoAtualId=null; pedidoAtualNum=null; itensAtuais=[];
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

  // Extrai rua do endereço
  const getRua = (end) => String(end||'').split(',')[0].trim().match(/^([A-Z]+)/)?.[1] || '?';

  // Ruas únicas neste pedido, em ordem alfabética
  const ruasNoPedido = [...new Set(itensAtuais.map(i=>getRua(i.endereco)))]
    .sort((a,b)=>a.localeCompare(b)*_checklistSortDir);

  // Rua atual = primeira rua com itens pendentes
  const primeirosPendentes = itensAtuais.filter(i=>i.status==='pendente');
  const ruaEmFoco = primeirosPendentes.length ? getRua(primeirosPendentes[0].endereco) : '';

  const tituloEl = document.getElementById(`${prefix}-titulo`);
  const contEl   = document.getElementById(`${prefix}-contador`);
  const barraEl  = document.getElementById(`${prefix}-barra`);
  const resumoEl = document.getElementById(`${prefix}-resumo`);

  if(tituloEl) tituloEl.textContent = `PEDIDO #${pedidoAtualNum}`;
  if(contEl)   contEl.textContent   = `${verificados}/${total} itens`;
  if(barraEl)  barraEl.style.width  = `${pct}%`;

  // Rota no resumo — pills de rua com destaque na atual
  if(resumoEl) {
    resumoEl.innerHTML = ruasNoPedido.map(r => {
      const ruaOk = itensAtuais.filter(i=>getRua(i.endereco)===r).every(i=>i.status!=='pendente');
      const ativo = r === ruaEmFoco;
      const bg  = ativo?'#185FA5':ruaOk?'#EAF3DE':'#F1F5F9';
      const cor = ativo?'#fff':ruaOk?'#27500A':'#64748B';
      const bord= ativo?'#185FA5':ruaOk?'#97C459':'#CBD5E1';
      return `<span style="display:inline-block;font-size:11px;font-weight:500;padding:2px 9px;border-radius:20px;background:${bg};color:${cor};border:1px solid ${bord};margin:2px 2px 2px 0;">${r}</span>`;
    }).join('');
  }




  const btnC = document.getElementById(`${prefix.replace('cl','btn-concluir').replace('m-cl','m-btn-concluir')}`);
  const btnA = document.getElementById(`${prefix.replace('cl','btn-aguardar').replace('m-cl','m-btn-aguardar')}`);
  // Map prefix to btn ids
  const bcId = prefix === 'cl' ? 'btn-concluir'       : 'm-btn-concluir';
  const baId = prefix === 'cl' ? 'btn-aguardar'       : 'm-btn-aguardar';
  const bfId = prefix === 'cl' ? 'btn-concluir-falta' : 'm-btn-concluir-falta';
  const bc = document.getElementById(bcId);
  const ba = document.getElementById(baId);
  const bf = document.getElementById(bfId);




  // Verifica se caixa foi vinculada — usa variável global (mais confiável que ler o DOM)
  const statusCaixaEl = document.getElementById(prefix === 'cl' ? 'cl-caixa-status' : 'm-caixa-status');
  const caixaVinculadaDOM = statusCaixaEl && statusCaixaEl.style.display !== 'none' && statusCaixaEl.textContent.includes('✅');
  const caixaVinculada = caixaJaVinculada || caixaVinculadaDOM;

  if (!todosVerif) {
    if(bc){bc.style.display='block';bc.disabled=true;bc.textContent=`CONCLUIR (${total-verificados} pend.)`}
    if(ba) ba.style.display='none';
    if(bf) bf.style.display='none';
  } else if (CAIXA_OBRIGATORIA && !caixaVinculada && pedidoAtualId) {
    if(bc){bc.style.display='block';bc.disabled=true;bc.textContent='VINCULE A CAIXA ANTES DE CONCLUIR'}
    if(ba) ba.style.display='none';
    if(bf) bf.style.display='none';
  } else if (temProblema) {
    const itensP = itensAtuais.filter(i=>i.status==='falta'||i.status==='parcial');
    const statusOk   = ['encontrado','reposto','subiu','abastecido','protocolo'];
    const statusBloq = ['nao_encontrado'];
    const temBloqueio = itensP.some(i => statusBloq.includes(i.aviso_status));
    const temPendente = itensP.some(i => !statusOk.includes(i.aviso_status) && !statusBloq.includes(i.aviso_status));

    if (temPendente) {
      const qtdP = itensP.filter(i => !statusOk.includes(i.aviso_status) && !statusBloq.includes(i.aviso_status)).length;
      if(bc) bc.style.display='none';
      if(ba){ba.style.display='block';ba.textContent=`⏳ AGUARDANDO REPOSITOR (${qtdP})`;}
      if(bf) bf.style.display='block';
    } else if (temBloqueio) {
      const qtdBloq = itensP.filter(i => statusBloq.includes(i.aviso_status)).length;
      if(bc){
        bc.style.display='block';
        bc.disabled=true;
        bc.textContent=`AGUARDANDO SUPERVISOR (${qtdBloq})`;
        bc.style.background='rgba(139,92,246,.15)';
        bc.style.color='var(--indigo)';
        bc.style.border='2px solid rgba(139,92,246,.4)';
        bc.style.cursor='not-allowed';
      }
      if(ba) ba.style.display='none';
      if(bf) bf.style.display='none';
    } else {
      if(bc){
        bc.style.display='block';
        bc.disabled=false;
        bc.textContent='CONCLUIR PEDIDO';
        bc.style.background='';
        bc.style.color='';
        bc.style.border='';
        bc.style.cursor='';
      }
      if(ba) ba.style.display='none';
      if(bf) bf.style.display='none';
    }
  } else {
    if(bc){
      bc.style.display='block';
      bc.disabled=false;
      bc.textContent='CONCLUIR PEDIDO';
      bc.style.background='';
      bc.style.color='';
      bc.style.border='';
      bc.style.cursor='';
    }
    if(ba) ba.style.display='none';
    if(bf) bf.style.display='none';
  }




  const listEl = document.getElementById(`${prefix}-lista`);
  if (!listEl) return;
  const isMob = prefix.startsWith('m-') || document.body.classList.contains('sep-mobile');
  listEl.innerHTML = itensAtuais.map(item => {
    const icones = { pendente:'○', encontrado:'●', falta:'✗', parcial:'◑' };
    const v = item.status !== 'pendente';
    const fnVerif  = isMob ? 'verificarItemMobile' : 'verificarItemDesktop';
    const fnToggle = isMob ? 'toggleParcialMobile'  : 'toggleParcialDesktop';
    const fnParcOk = isMob ? 'confirmarParcialMobile' : 'confirmarParcialDesktop';




    if (isMob) {
      // Agrupamento por rua — injeta header antes do primeiro item de cada rua
      const itemRua = getRua ? getRua(item.endereco) : String(item.endereco||'').split(',')[0].trim().match(/^([A-Z]+)/)?.[1]||'?';
      const idxNoGrupo = itensAtuais.filter(i2 => {
        const r2 = String(i2.endereco||'').split(',')[0].trim().match(/^([A-Z]+)/)?.[1]||'?';
        return r2 === itemRua;
      }).indexOf(item);
      const grupoOk = itensAtuais.filter(i2=>{
        const r2=String(i2.endereco||'').split(',')[0].trim().match(/^([A-Z]+)/)?.[1]||'?';
        return r2===itemRua;
      }).every(i2=>i2.status!=='pendente');
      const grupoAlgum = itensAtuais.filter(i2=>{
        const r2=String(i2.endereco||'').split(',')[0].trim().match(/^([A-Z]+)/)?.[1]||'?';
        return r2===itemRua;
      }).some(i2=>i2.status!=='pendente');
      const grupoCount = itensAtuais.filter(i2=>{
        const r2=String(i2.endereco||'').split(',')[0].trim().match(/^([A-Z]+)/)?.[1]||'?';
        return r2===itemRua;
      });
      const headerHtml = idxNoGrupo === 0 ? `<div style="display:flex;align-items:center;gap:8px;padding:8px 4px 4px;margin-top:${listEl.innerHTML?'8px':'0'}">
        <div style="width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:500;
          background:${grupoOk?'#EAF3DE':grupoAlgum?'#FAEEDA':'#F1F5F9'};
          color:${grupoOk?'#27500A':grupoAlgum?'#633806':'#475569'};
          border:1px solid ${grupoOk?'#97C459':grupoAlgum?'#EF9F27':'#CBD5E1'};">${itemRua}</div>
        <span style="font-size:11px;color:#94A3B8;">${grupoCount.filter(i2=>i2.status!=='pendente').length} / ${grupoCount.length} coletados</span>
      </div>` : '';

      // Estado visual do card
      const cardBg = item.status==='encontrado'?'rgba(87,185,129,.08)':item.status==='falta'?'rgba(201,82,79,.08)':item.status==='parcial'?'rgba(224,168,62,.08)':'var(--surface)';
      const cardBord = item.status==='encontrado'?'rgba(87,185,129,.4)':item.status==='falta'?'rgba(201,82,79,.4)':item.status==='parcial'?'rgba(224,168,62,.4)':'var(--border)';
      const cardAccent = item.status==='encontrado'?'var(--green)':item.status==='falta'?'var(--red)':item.status==='parcial'?'var(--amber)':'var(--border)';
      const statusLabel = item.status==='encontrado'?'COLETADO':item.status==='falta'?'FALTA':item.status==='parcial'?'PARCIAL':'PENDENTE';
      const avisoStatus = item.aviso_status||'';
      return headerHtml + `<div id="${prefix}-ic-${item.id}" style="background:${cardBg};border:1px solid ${cardBord};border-left:4px solid ${cardAccent};border-radius:10px;padding:14px;margin-bottom:6px;margin-left:8px">
        <!-- Linha 1: Código + Status badge + Quantidade -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px">
          <div style="flex:1;min-width:0">
            <div style="font-family:'Space Mono',monospace;font-size:14px;font-weight:700;color:var(--text3);letter-spacing:-.3px;margin-bottom:2px">${item.codigo||'—'}</div>
            <div style="font-size:16px;font-weight:800;color:var(--text);line-height:1.3;margin-bottom:4px">${item.descricao||'<span style="color:var(--text3);font-style:italic">Sem descrição</span>'}</div>
            <div style="font-size:15px;font-weight:700;color:#818CF8;letter-spacing:.5px">${item.endereco||'—'}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;margin-left:10px">
            ${item.status!=='pendente'?`<span style="font-size:9px;font-weight:800;letter-spacing:1.5px;padding:3px 8px;border-radius:4px;background:${cardAccent};color:#fff">${statusLabel}</span>`:''}
            <span style="font-family:'Space Mono',monospace;font-size:28px;font-weight:800;color:var(--text);line-height:1">×${item.quantidade||1}</span>
          </div>
        </div>
        <!-- Avisos repositor -->
        ${item.status==='falta'?`<div style="font-size:11px;font-weight:600;color:var(--red);margin-bottom:8px;padding:5px 8px;background:rgba(201,82,79,.12);border-radius:5px">Repositor notificado — aguardando reposição</div>`:``}
        ${item.status==='parcial'?`<div style="font-size:11px;font-weight:600;color:var(--amber);margin-bottom:8px;padding:5px 8px;background:rgba(224,168,62,.12);border-radius:5px">${item.obs||'Parcial'} — repositor notificado</div>`:``}
        ${(item.status==='falta'||item.status==='parcial')&&avisoStatus==='subiu'&&(item.aviso_qtd_encontrada>0)&&(item.aviso_qtd_encontrada<(item.quantidade||1))?`<div style="font-size:11px;font-weight:700;color:var(--orange);margin-bottom:8px;padding:6px 8px;background:rgba(251,146,60,.12);border:1px solid rgba(251,146,60,.4);border-radius:5px">⬆️ Repositor enviou <strong>${item.aviso_qtd_encontrada}/${item.quantidade||1}</strong> unidades — confirme a quantidade ao coletar</div>`:``}
        ${(item.status==='falta'||item.status==='parcial')&&avisoStatus==='subiu'&&(!(item.aviso_qtd_encontrada>0)||item.aviso_qtd_encontrada>=(item.quantidade||1))?`<div style="font-size:11px;font-weight:600;color:var(--info);margin-bottom:8px;padding:5px 8px;background:rgba(56,189,248,.12);border-radius:5px">⬆️ Repositor enviou o item — verifique na colmeia</div>`:``}
        ${(item.status==='falta'||item.status==='parcial')&&avisoStatus==='reposto'?`<div style="font-size:11px;font-weight:600;color:var(--green);margin-bottom:8px;padding:5px 8px;background:rgba(87,185,129,.12);border-radius:5px">Repositor confirmou reposição</div>`:``}
        ${(item.status==='falta'||item.status==='parcial')&&avisoStatus==='nao_encontrado'?`<div style="font-size:11px;font-weight:600;color:var(--indigo);margin-bottom:8px;padding:5px 8px;background:rgba(139,92,246,.12);border-radius:5px">Não localizado — aguardando supervisor liberar</div>`:``}
        ${item.hora_verificado?`<div style="font-size:10px;color:#94A3B8;margin-bottom:8px">Verificado às ${item.hora_verificado}</div>`:''}
        <!-- Campo parcial -->
        <div class="parcial-wrap" id="${prefix}-pw-${item.id}" style="margin-bottom:8px">
          <label style="font-size:11px;color:var(--amber);font-weight:700">Qtde encontrada (de ${item.quantidade||1}):</label>
          <div class="parcial-row">
            <input type="number" class="parcial-input" id="${prefix}-pi-${item.id}" min="0" max="${(item.quantidade||1)-1}" placeholder="0" inputmode="numeric"/>
            <button class="btn-parc-ok" onclick="${fnParcOk}(${item.id},${item.quantidade||1},'${prefix}')">OK</button>
          </div>
        </div>
        <!-- Botões EMBAIXO — layout horizontal de 3 -->
        ${!v?`<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:4px">
          <button onclick="${fnVerif}(${item.id},'encontrado','${prefix}')"
            style="padding:12px 0;border:1.5px solid rgba(87,185,129,.4);border-radius:8px;background:rgba(87,185,129,.12);color:var(--green);font-size:12px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;letter-spacing:.3px">
            COLETADO
          </button>
          <button onclick="${fnToggle}(${item.id},'${prefix}')"
            style="padding:12px 0;border:1.5px solid rgba(224,168,62,.4);border-radius:8px;background:rgba(224,168,62,.12);color:var(--amber);font-size:12px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;letter-spacing:.3px">
            PARCIAL
          </button>
          <button onclick="${fnVerif}(${item.id},'falta','${prefix}')"
            style="padding:12px 0;border:1.5px solid rgba(201,82,79,.4);border-radius:8px;background:rgba(201,82,79,.12);color:var(--red);font-size:12px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;letter-spacing:.3px">
            FALTA
          </button>
        </div>`:`<div style="font-size:11px;color:#94A3B8;text-align:center;padding:6px 0">Item verificado</div>`}
      </div>`;
    }




    // Layout desktop — redesenhado
    const avisoSt = item.aviso_status||'';
    const dCardBord = item.status==='encontrado'?'rgba(87,185,129,.4)':item.status==='falta'?'rgba(201,82,79,.4)':item.status==='parcial'?'rgba(224,168,62,.4)':'var(--border)';
    const dCardLeft = item.status==='encontrado'?'var(--green)':item.status==='falta'?'var(--red)':item.status==='parcial'?'var(--amber)':'var(--border)';
    const dCardBg = item.status==='encontrado'?'rgba(87,185,129,.08)':item.status==='falta'?'rgba(201,82,79,.08)':item.status==='parcial'?'rgba(224,168,62,.08)':'var(--surface)';
    return `<div id="${prefix}-ic-${item.id}" style="background:${dCardBg};border:1px solid ${dCardBord};border-left:3px solid ${dCardLeft};border-radius:9px;padding:12px 14px;margin-bottom:7px;display:flex;align-items:center;gap:14px">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
          <span style="font-family:'Space Mono',monospace;font-size:13px;font-weight:700;color:var(--text)">${item.codigo||'—'}</span>
          <span style="font-size:12px;font-weight:700;color:var(--text);background:var(--surface2);padding:2px 8px;border-radius:5px;border:1px solid var(--border)">${item.endereco||'—'}</span>
          <span style="font-family:'Space Mono',monospace;font-size:13px;font-weight:700;color:var(--text);background:var(--surface2);padding:2px 8px;border-radius:5px;border:1px solid var(--border)">×${item.quantidade||1}</span>
          ${item.hora_verificado?`<span style="font-size:10px;color:var(--text3)">${item.hora_verificado}</span>`:''}
        </div>
        <div style="font-size:12px;color:var(--text2);line-height:1.35">${item.descricao||'—'}</div>
        ${item.status==='falta'?`<div style="font-size:11px;color:var(--red);font-weight:600;margin-top:4px">Repositor notificado — aguardando reposição</div>`:''}
        ${item.status==='parcial'?`<div style="font-size:11px;color:var(--amber);font-weight:600;margin-top:4px">${item.obs||'Parcial'} — repositor notificado</div>`:''}
        ${(item.status==='falta'||item.status==='parcial')&&avisoSt==='reposto'?`<div style="font-size:11px;color:var(--green);font-weight:600;margin-top:4px">Repositor confirmou reposição</div>`:''}
        ${(item.status==='falta'||item.status==='parcial')&&avisoSt==='nao_encontrado'?`<div style="font-size:11px;color:#7c3aed;font-weight:600;margin-top:4px">Não localizado — aguardando supervisor liberar</div>`:''}
        <div class="parcial-wrap" id="${prefix}-pw-${item.id}" style="margin-top:8px">
          <label>Qtde encontrada (de ${item.quantidade||1}):</label>
          <div class="parcial-row">
            <input type="number" class="parcial-input" id="${prefix}-pi-${item.id}" min="0" max="${(item.quantidade||1)-1}" placeholder="0" inputmode="numeric"/>
            <button class="btn-parc-ok" onclick="${fnParcOk}(${item.id},${item.quantidade||1},'${prefix}')">OK</button>
          </div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0">
        <button style="width:80px;padding:8px 0;border:1px solid ${v?'var(--border)':'rgba(87,185,129,.4)'};border-radius:7px;background:${v?'var(--surface2)':'rgba(87,185,129,.12)'};color:${v?'var(--text3)':'var(--green)'};font-size:11px;font-weight:700;cursor:${v?'not-allowed':'pointer'};font-family:'DM Sans',sans-serif;letter-spacing:.5px" ${v?'disabled':''} onclick="${fnVerif}(${item.id},'encontrado','${prefix}')">COLETADO</button>
        <button style="width:80px;padding:8px 0;border:1px solid ${v?'var(--border)':'rgba(224,168,62,.4)'};border-radius:7px;background:${v?'var(--surface2)':'rgba(224,168,62,.12)'};color:${v?'var(--text3)':'var(--amber)'};font-size:11px;font-weight:700;cursor:${v?'not-allowed':'pointer'};font-family:'DM Sans',sans-serif;letter-spacing:.5px" ${v?'disabled':''} onclick="${fnToggle}(${item.id},'${prefix}')">PARCIAL</button>
        <button style="width:80px;padding:8px 0;border:1px solid ${v?'var(--border)':'rgba(201,82,79,.4)'};border-radius:7px;background:${v?'var(--surface2)':'rgba(201,82,79,.12)'};color:${v?'var(--text3)':'var(--red)'};font-size:11px;font-weight:700;cursor:${v?'not-allowed':'pointer'};font-family:'DM Sans',sans-serif;letter-spacing:.5px" ${v?'disabled':''} onclick="${fnVerif}(${item.id},'falta','${prefix}')">FALTA</button>
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
  if (qtdEnc >= qtdTotal)          { toast('Se encontrou tudo, confirme acima!','aviso'); return; }
  const qtdFalta = qtdTotal - qtdEnc;
  await verificarItem(id,'parcial',`Encontrou ${qtdEnc} de ${qtdTotal} — faltam ${qtdFalta}`,qtdFalta,prefix,renderPrefix);
}




async function verificarItem(itemId, status, obs='', qtdFalta=0, prefix, renderPrefix) {
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
    feedbackColetor(status==='falta' ? 'falta' : status==='parcial' ? 'parcial' : 'sucesso');
    if (status==='falta')     toast('Falta — repositor avisado!','aviso');
    if (status==='parcial')   toast('Parcial — repositor avisado!','aviso');
    renderChecklist(renderPrefix);
  } catch(e) { toast('Erro ao verificar item!','erro'); }
}




/* ══════════════════════════════════════════
   VINCULAR CAIXA — SEPARADOR
══════════════════════════════════════════ */
async function vincularCaixaCore(caixa, inputStatusId, isMobile) {
  if (!pedidoAtualId) { toast('Nenhum pedido ativo!','aviso'); return; }
  if (!caixa) { toast('Digite o número da caixa!','aviso'); return; }
  try {
    const res  = await fetch(`${API}/pedidos/${pedidoAtualId}/caixa`, {
      credentials:'include', method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ numero_caixa: caixa })
    });
    const data = await res.json();
    if (data.erro) {
      toast(data.erro, 'erro');
      // Garantir que checklist fique oculto e placeholder mostre erro
      caixaJaVinculada = false;
      const wrapId = isMobile ? 'm-cl-wrap' : 'cl-wrap';
      const phId   = isMobile ? 'm-cl-wrap-placeholder' : 'cl-wrap-placeholder';
      const wrap = document.getElementById(wrapId);
      const ph   = document.getElementById(phId);
      if (wrap) wrap.style.display = 'none';
      if (ph) {
        ph.style.display = 'block';
        ph.innerHTML = `<div style="background:var(--surface);border:1.5px solid rgba(201,82,79,.4);border-radius:10px;text-align:center;padding:28px 20px;">
          <div style="width:44px;height:44px;border-radius:50%;background:rgba(201,82,79,.15);border:1.5px solid rgba(201,82,79,.4);display:flex;align-items:center;justify-content:center;margin:0 auto 10px;display:none">
          <div style="font-size:13px;font-weight:700;color:var(--red);margin-bottom:4px;">Caixa indisponível</div>
          <div style="font-size:11px;color:var(--text3);">${data.erro}</div>
        </div>`;
      }
      const statusEl = document.getElementById(inputStatusId);
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.innerHTML = `<span style="color:#B91C1C;font-weight:700">${data.erro}</span>`;
      }
      return;
    }
    toast(`Caixa ${caixa} vinculada`, 'sucesso');
    const statusEl = document.getElementById(inputStatusId);
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.innerHTML = `<span style="color:var(--green);font-weight:600">Caixa <b>${caixa}</b> vinculada — Pedido #${pedidoAtualNum}</span>`;
    }
    caixaJaVinculada = true;
    mostrarCampoCaixa(true, true); // compacto verde após vincular
    ['m-cl-wrap-placeholder','cl-wrap-placeholder'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    if (isMobile) {
      const wrap = document.getElementById('m-cl-wrap');
      if (wrap) wrap.style.display = 'block';
      await carregarChecklistMobile();
    } else {
      const wrap = document.getElementById('cl-wrap');
      if (wrap) wrap.style.display = 'block';
      await carregarChecklist();
    }
  } catch(e) { toast('Erro ao vincular caixa!','erro'); }
}
function vincularCaixaDesktop() {
  const caixa = document.getElementById('cl-input-caixa')?.value?.trim();
  vincularCaixaCore(caixa, 'cl-caixa-status', false);
}
function vincularCaixaMobile() {
  const caixa = document.getElementById('m-input-caixa')?.value?.trim();
  vincularCaixaCore(caixa, 'm-caixa-status', true);
}




function escanearQrCaixa(isMobile) {
  escanearQr(
    isMobile ? 'm-input-caixa' : 'cl-input-caixa',
    isMobile ? vincularCaixaMobile : vincularCaixaDesktop
  );
}

// Mostra campo caixa quando pedido é carregado.
// jaVinculada=true: esconde o formulário e exibe só o status (caixa já foi vinculada).
function mostrarCampoCaixa(show, jaVinculada = false) {
  const d = document.getElementById('cl-caixa-wrap');
  const m = document.getElementById('m-caixa-wrap');
  if (d) d.style.display = show ? 'block' : 'none';
  if (m) m.style.display = show ? 'block' : 'none';

  if (show) {
    // Mobile: alterna entre estado "pendente" (vermelho) e "vinculada" (verde compacto)
    const mHeader = document.getElementById('m-caixa-header');
    const mForm   = document.getElementById('m-caixa-form');
    if (jaVinculada) {
      if (m) { m.style.background = 'rgba(87,185,129,.12)'; m.style.borderColor = 'rgba(87,185,129,.4)'; }
      if (mHeader) {
        mHeader.style.color = '#15803d';
        mHeader.innerHTML = '<span style="width:6px;height:6px;background:#16a34a;border-radius:50%;flex-shrink:0"></span> CAIXA VINCULADA';
        mHeader.style.marginBottom = '0';
      }
      if (mForm) mForm.style.display = 'none';
    } else {
      if (m) { m.style.background = '#FFF8F8'; m.style.borderColor = '#FECACA'; }
      if (mHeader) {
        mHeader.style.color = '#B91C1C';
        mHeader.innerHTML = '<span style="width:6px;height:6px;background:#DC2626;border-radius:50%;flex-shrink:0"></span> VINCULAR CAIXA — OBRIGATÓRIO ANTES DE INICIAR';
        mHeader.style.marginBottom = '8px';
      }
      if (mForm) mForm.style.display = '';
    }
  }
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
  const mostrarLogin = () => { const el = document.getElementById('tela-login'); if (el) el.style.display = 'flex'; };
  try {
    const res  = await fetch(`${API}/auth/me`, { credentials:'include' });
    if (!res.ok) { mostrarLogin(); return; }
    const data = await res.json();
    usuarioAtual      = data.usuario;
    separadorAtual    = data.separador;
    perfilSelecionado = data.usuario.perfil;
    ativarApp();
    iniciarHeartbeat();
  } catch(e) { console.warn(e); mostrarLogin(); }
})();

async function carregarMeusStats() {
  try {
    const res = await fetch(`${API}/stats/meus`, { credentials:'include' });
    if (!res.ok) return;
    const d = await res.json();
    const el = document.getElementById('m-meus-stats');
    if (!el) return;

    if (d.perfil === 'separador' && d.separacao) {
      el.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:12px 0">
          <div style="text-align:center;background:rgba(79,70,229,.12);border-radius:10px;padding:12px 8px">
            <div style="font-size:26px;font-weight:800;color:var(--accent)">${d.separacao.separados_hoje||0}</div>
            <div style="font-size:9px;color:var(--accent);text-transform:uppercase;letter-spacing:1px">Hoje</div>
          </div>
          <div style="text-align:center;background:rgba(87,185,129,.12);border-radius:10px;padding:12px 8px">
            <div style="font-size:26px;font-weight:800;color:var(--green)">${d.separacao.total_hoje||0}</div>
            <div style="font-size:9px;color:var(--green);text-transform:uppercase;letter-spacing:1px">Recebidos</div>
          </div>
          <div style="text-align:center;background:var(--surface2);border-radius:10px;padding:12px 8px">
            <div style="font-size:26px;font-weight:800;color:var(--text)">${d.separacao.separados_total||0}</div>
            <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Total</div>
          </div>
        </div>`;
    } else if (d.perfil === 'repositor' && d.reposicao) {
      el.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;padding:12px 0">
          <div style="text-align:center;background:rgba(87,185,129,.12);border-radius:10px;padding:10px 6px">
            <div style="font-size:22px;font-weight:800;color:var(--green)">${d.reposicao.resolvidos_hoje||0}</div>
            <div style="font-size:9px;color:var(--green);text-transform:uppercase;letter-spacing:.5px">Resolvidas</div>
          </div>
          <div style="text-align:center;background:rgba(201,82,79,.12);border-radius:10px;padding:10px 6px">
            <div style="font-size:22px;font-weight:800;color:var(--red)">${d.reposicao.nao_encontrados_hoje||0}</div>
            <div style="font-size:9px;color:var(--red);text-transform:uppercase;letter-spacing:.5px">Nao encon.</div>
          </div>
          <div style="text-align:center;background:rgba(224,168,62,.12);border-radius:10px;padding:10px 6px">
            <div style="font-size:22px;font-weight:800;color:var(--amber)">${d.reposicao.pendentes_hoje||0}</div>
            <div style="font-size:9px;color:var(--amber);text-transform:uppercase;letter-spacing:.5px">Pendentes</div>
          </div>
          <div style="text-align:center;background:var(--surface2);border-radius:10px;padding:10px 6px">
            <div style="font-size:22px;font-weight:800;color:var(--text)">${d.reposicao.avisos_hoje||0}</div>
            <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Total</div>
          </div>
        </div>`;
    } else if (d.perfil === 'checkout' && d.checkout) {
      el.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:12px 0">
          <div style="text-align:center;background:rgba(139,92,246,.12);border-radius:10px;padding:12px 8px">
            <div style="font-size:26px;font-weight:800;color:var(--indigo)">${d.checkout.expedidos_hoje||0}</div>
            <div style="font-size:9px;color:var(--indigo);text-transform:uppercase;letter-spacing:1px">Expedidas</div>
          </div>
          <div style="text-align:center;background:var(--surface2);border-radius:10px;padding:12px 8px">
            <div style="font-size:26px;font-weight:800;color:var(--text)">${d.checkout.total_hoje||0}</div>
            <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Recebidas</div>
          </div>
          <div style="text-align:center;background:rgba(224,168,62,.12);border-radius:10px;padding:12px 8px">
            <div style="font-size:26px;font-weight:800;color:var(--amber)">${d.checkout.pendentes||0}</div>
            <div style="font-size:9px;color:var(--amber);text-transform:uppercase;letter-spacing:1px">Pendentes</div>
          </div>
        </div>`;
    }
  } catch(e) { console.warn(e); }
}
