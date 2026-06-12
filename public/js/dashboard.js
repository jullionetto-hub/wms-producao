
// ── Gráficos Operacionais ─────────────────────────────────────────────────────
const _charts = {};

function _destroyChart(id) {
  if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
}

async function carregarGraficoPizzaStatus() {
  const kpi = await apiFetch('/kpis');
  const canvas = document.getElementById('grafico-pizza-status');
  if (!canvas || !kpi) return;
  _destroyChart('pizza-status');
  const pendentes  = parseInt(kpi.pendentes)    || 0;
  const separando  = parseInt(kpi.em_separacao) || 0;
  const concluidos = parseInt(kpi.concluidos_hoje) || 0;
  _charts['pizza-status'] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Pendentes', 'Separando', 'Concluídos'],
      datasets: [{ data: [pendentes, separando, concluidos],
        backgroundColor: ['#3B82F6','#F59E0B','#22C55E'],
        borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10 } } }
    }
  });
}

async function carregarGraficoPizzaReposicao() {
  const kpi = await apiFetch('/kpis');
  const canvas = document.getElementById('grafico-pizza-reposicao');
  if (!canvas || !kpi) return;
  _destroyChart('pizza-reposicao');
  const pendente   = parseInt(kpi.reposicao_pendente)  || 0;
  const concluida  = parseInt(kpi.reposicao_concluida) || 0;
  const naoEnc     = parseInt(kpi.nao_encontrados_hoje)|| 0;
  _charts['pizza-reposicao'] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Pendente', 'Concluída', 'Não encontrado'],
      datasets: [{ data: [pendente, concluida, naoEnc],
        backgroundColor: ['#F59E0B','#22C55E','#EF4444'],
        borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10 } } }
    }
  });
}

async function carregarGraficoBarrasHoras() {
  const rows = await apiFetch('/dashboard/por-hora');
  const canvas = document.getElementById('grafico-barras-horas');
  if (!canvas || !rows || !rows.length) return;
  _destroyChart('barras-horas');
  _charts['barras-horas'] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: rows.map(r => `${r.hora}h`),
      datasets: [{ label: 'Pedidos concluídos', data: rows.map(r => Number(r.total)),
        backgroundColor: '#3B82F6', borderRadius: 6, borderSkipped: false }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } } },
                x: { ticks: { font: { size: 11 } } } }
    }
  });
}

async function carregarGraficoFunil() {
  const kpi = await apiFetch('/kpis');
  const canvas = document.getElementById('grafico-funil');
  if (!canvas || !kpi) return;
  _destroyChart('funil');
  const labels = ['Importados', 'Separados', 'Embalados', 'Checkout'];
  const valores = [
    parseInt(kpi.importados_hoje)   || 0,
    parseInt(kpi.concluidos_hoje)   || 0,
    parseInt(kpi.embalagem_hoje)    || 0,
    parseInt(kpi.checkout_hoje)     || 0,
  ];
  _charts['funil'] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Pedidos', data: valores,
        backgroundColor: ['#6366F1','#22C55E','#F59E0B','#3B82F6'],
        borderRadius: 6, borderSkipped: false }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.raw} pedidos` } } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } } },
                x: { ticks: { font: { size: 12, weight: '600' } } } }
    }
  });
}

/* FILTRO DE TURNO — SEPARADORES ATIVOS */
async function filtrarSepsAtivos(turno) {
  // Atualiza visual dos botões
  const map = {todos:'', manha:'Manhã', tarde:'Tarde', noite:'Noite'};
  Object.entries(map).forEach(([key, val]) => {
    const btn = document.getElementById(`btn-turno-${key}`);
    if (!btn) return;
    const active = val === turno;
    btn.classList.toggle('ativo', active);
    btn.style.background = btn.style.color = btn.style.borderColor = '';
  });
  // Salva no estado global e recarrega
  if (typeof window !== 'undefined') window._turnoFiltro = turno;
  await carregarOperacao();
}

/* DASHBOARD */

/* MAPA DO ESTOQUE — DASHBOARD (redesign) */

function mudarDashTab(tab) {
  ['operacao','visao','mapa'].forEach(t => {
    const panel = document.getElementById(`dtab-${t}`);
    const btn   = document.getElementById(`dtab-btn-${t}`);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
    if (btn) {
      btn.style.color = t === tab ? 'var(--accent)' : 'var(--text3)';
      btn.style.borderBottomColor = t === tab ? 'var(--accent)' : 'transparent';
    }
  });
  if (tab === 'mapa') carregarMapaEstoque();
  if (tab === 'operacao') carregarOperacao();
}

async function carregarMapaEstoque() {
  const el = document.getElementById('mapa-estoque-svg');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:40px;font-size:13px">Carregando mapa...</div>';

  try {
    const hoje = hojeLocal();
    const res = await fetch(`${API}/pedidos?data=${hoje}`, { credentials:'include' });
    const pedidos = await res.json();

    // Popular select de pedidos
    const sel = document.getElementById('mapa-filtro-pedido');
    if (sel) {
      const oldVal = sel.value;
      sel.innerHTML = '<option value="">Todos os pedidos de hoje</option>';
      pedidos.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `#${p.numero_pedido} — ${p.cliente||'—'} (${p.total_itens||p.itens||0} itens)`;
        sel.appendChild(opt);
      });
      sel.value = oldVal;
    }
    const selPedidoId = sel?.value || '';

    // Conta itens por rua
    const contRua = {};
    let pedidoInfo = null;
    const pedsFiltrados = selPedidoId ? pedidos.filter(p => String(p.id) === selPedidoId) : pedidos;

    for (const ped of pedsFiltrados) {
      const rItens = await fetch(`${API}/pedidos/${ped.id}/itens`, { credentials:'include' });
      const itens = await rItens.json();
      itens.forEach(it => {
        const ends = String(it.endereco||'').split(',');
        ends.forEach(e => {
          const endClean = e.trim();
          if (!endClean || endClean.startsWith('VERT') || endClean.startsWith('AMZ')) return;
          const m = endClean.match(/^([A-Z]+)/);
          if (!m) return;
          const rua = m[1];
          const validRuas = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
          if (rua.length > 2) return;
          if (!contRua[rua]) contRua[rua] = { total:0, encontrado:0, falta:0, pendente:0 };
          contRua[rua].total += (it.quantidade||1);
          if (it.status === 'encontrado') contRua[rua].encontrado += (it.quantidade||1);
          else if (it.status === 'falta')  contRua[rua].falta     += (it.quantidade||1);
          else                             contRua[rua].pendente  += (it.quantidade||1);
        });
      });
      if (selPedidoId && ped) pedidoInfo = ped;
    }

    // Atualiza info
    const infoEl = document.getElementById('mapa-info-pedido');
    if (infoEl) {
      if (pedidoInfo) {
        infoEl.textContent = `Pedido #${pedidoInfo.numero_pedido} · ${pedidoInfo.cliente||'—'} · ${pedidoInfo.itens||0} itens`;
      } else {
        const totalRuas = Object.keys(contRua).length;
        infoEl.textContent = `${pedsFiltrados.length} pedido(s) · ${totalRuas} rua(s) ativas`;
      }
    }

    renderMapaEstoque(contRua, !!selPedidoId);
  } catch(e) {
    const el2 = document.getElementById('mapa-estoque-svg');
    if (el2) el2.innerHTML = '<div style="color:var(--red);text-align:center;padding:20px">Erro ao carregar</div>';
  }
}

function renderMapaEstoque(contRua, isPedidoUnico) {
  const el = document.getElementById('mapa-estoque-svg');
  if (!el) return;

  const DIFIC = {
    A:'facil',B:'facil',C:'facil',D:'facil',E:'facil',
    F:'dificil',G:'dificil',H:'dificil',I:'dificil',J:'dificil',K:'dificil',L:'dificil',
    M:'medio',N:'medio',O:'medio',
    P:'facil',Q:'facil',R:'facil',S:'facil',T:'facil',U:'facil',
    V:'medio',W:'medio',X:'medio',Y:'medio',Z:'medio',
    ZA:'especial',ARARA:'especial'
  };
  const CORES = {
    facil:   { bg:'#DCFCE7', bord:'#4ADE80', txt:'#166534', bord2:'#16A34A' },
    medio:   { bg:'#FEF9C3', bord:'#FACC15', txt:'#854D0E', bord2:'#CA8A04' },
    dificil: { bg:'#FEE2E2', bord:'#F87171', txt:'#991B1B', bord2:'#DC2626' },
    especial:{ bg:'#EDE9FE', bord:'#A78BFA', txt:'#5B21B6', bord2:'#7C3AED' },
  };

  function corPonto(total) {
    if (!total) return null;
    if (total >= 10) return '#DC2626';
    if (total >= 5)  return '#F59E0B';
    return '#2563EB';
  }

  const BW = 42, BH = 36, HGAP = 5, VGAP = 8;
  const FUNDO  = ['F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
  const FRENTE = ['E','D','C','B','A'];
  const qIdx   = FUNDO.indexOf('Q');

  const PAD_L  = 64;
  const PAD_T  = 56;
  const fundoY = PAD_T;
  const fundoX = i => PAD_L + i * (BW + HGAP);
  const qCX    = fundoX(qIdx) + BW / 2;
  const frenteX= qCX - BW / 2;
  const frenteStartY = fundoY + BH + 28;
  const svgW   = PAD_L + FUNDO.length * (BW + HGAP) + 20;
  const svgH   = frenteStartY + FRENTE.length * (BH + VGAP) + 54;

  let s = `<svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${svgW}px;font-family:'DM Sans',system-ui,sans-serif">`;

  // ── Faixa de fundo (corredor) ──
  s += `<rect x="${PAD_L-4}" y="${fundoY-4}" width="${FUNDO.length*(BW+HGAP)+2}" height="${BH+8}" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>`;

  // ── Faixa de frente (corredor vertical) ──
  s += `<rect x="${frenteX-4}" y="${frenteStartY-4}" width="${BW+8}" height="${FRENTE.length*(BH+VGAP)+4}" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"/>`;

  // ── Conector vertical entre fundo e frente ──
  s += `<line x1="${qCX}" y1="${fundoY+BH+4}" x2="${qCX}" y2="${frenteStartY-4}" stroke="#CBD5E1" stroke-width="2" stroke-dasharray="4,3"/>`;

  // ── Labels ──
  s += `<text x="${PAD_L-2}" y="${fundoY-10}" font-size="9" fill="#94A3B8" font-weight="700" letter-spacing="1.5">FUNDO</text>`;
  s += `<text x="${frenteX+BW+10}" y="${frenteStartY+BH/2+4}" font-size="9" fill="#94A3B8" font-weight="700" letter-spacing="1.5">FRENTE</text>`;

  // ── ZA (canto superior esquerdo) ──
  {
    const zC = CORES.especial;
    const zD = contRua['ZA']?.total || 0;
    s += `<rect x="4" y="8" width="${BW}" height="${BH}" rx="6" fill="${zC.bg}" stroke="${zC.bord2}" stroke-width="1.5"/>`;
    s += `<text x="${4+BW/2}" y="${8+BH/2+4}" text-anchor="middle" font-size="11" font-weight="700" fill="${zC.txt}">ZA</text>`;
    if (zD > 0) {
      const c = corPonto(zD), r = zD>=10?11:9;
      s += `<circle cx="${4+BW}" cy="8" r="${r}" fill="${c}" stroke="#fff" stroke-width="2"/>`;
      s += `<text x="${4+BW}" y="${8+4}" text-anchor="middle" font-size="8" fill="#fff" font-weight="700">${zD}</text>`;
    }
  }

  // ── ARARA (canto superior direito) ──
  {
    const aC = CORES.especial;
    const aD = contRua['ARARA']?.total || 0;
    const ax = svgW - BW - 8;
    s += `<rect x="${ax}" y="8" width="${BW}" height="${BH}" rx="6" fill="${aC.bg}" stroke="${aC.bord2}" stroke-width="1.5"/>`;
    s += `<text x="${ax+BW/2}" y="${8+BH/2+4}" text-anchor="middle" font-size="9" font-weight="700" fill="${aC.txt}">ARARA</text>`;
    if (aD > 0) {
      const c = corPonto(aD), r = aD>=10?11:9;
      s += `<circle cx="${ax+BW}" cy="8" r="${r}" fill="${c}" stroke="#fff" stroke-width="2"/>`;
      s += `<text x="${ax+BW}" y="${8+4}" text-anchor="middle" font-size="8" fill="#fff" font-weight="700">${aD}</text>`;
    }
  }

  // ── Ruas FUNDO ──
  FUNDO.forEach((rua, i) => {
    const x = fundoX(i), y = fundoY;
    const d = contRua[rua];
    const total = d?.total || 0;
    const cor = CORES[DIFIC[rua]||'facil'];
    const atv = total > 0;
    const strokeW = atv ? '2' : '1';
    const strokeC = atv ? cor.bord2 : cor.bord;

    s += `<rect x="${x}" y="${y}" width="${BW}" height="${BH}" rx="6" `
       + `fill="${cor.bg}" stroke="${strokeC}" stroke-width="${strokeW}" `
       + `opacity="${atv?'1':'0.35'}"><title>Rua ${rua}: ${total} itens</title></rect>`;
    s += `<text x="${x+BW/2}" y="${y+BH/2+4}" text-anchor="middle" `
       + `font-size="12" font-weight="700" fill="${cor.txt}" opacity="${atv?'1':'0.45'}">${rua}</text>`;

    if (total > 0) {
      const c = corPonto(total);
      const r = total >= 10 ? 12 : 10;
      // Ponto ACIMA do bloco, centralizado
      const cx = x + BW/2, cy = y - r - 4;
      s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}" stroke="#fff" stroke-width="2"/>`;
      s += `<text x="${cx}" y="${cy+4}" text-anchor="middle" `
         + `font-size="${total >= 100?7:total>=10?8:9}" fill="#fff" font-weight="700">${total}</text>`;

      if (isPedidoUnico && (d.encontrado||0) > 0) {
        const pct = Math.min(1, d.encontrado / total);
        s += `<rect x="${x+3}" y="${y+BH-5}" width="${BW-6}" height="3" rx="1.5" fill="#CBD5E1"/>`;
        s += `<rect x="${x+3}" y="${y+BH-5}" width="${Math.round((BW-6)*pct)}" height="3" rx="1.5" fill="#16A34A"/>`;
      }
    }
  });

  // ── Ruas FRENTE ──
  FRENTE.forEach((rua, i) => {
    const x = frenteX, y = frenteStartY + i * (BH + VGAP);
    const d = contRua[rua];
    const total = d?.total || 0;
    const cor = CORES[DIFIC[rua]||'facil'];
    const atv = total > 0;
    const strokeC = atv ? cor.bord2 : cor.bord;

    s += `<rect x="${x}" y="${y}" width="${BW}" height="${BH}" rx="6" `
       + `fill="${cor.bg}" stroke="${strokeC}" stroke-width="${atv?'2':'1'}" `
       + `opacity="${atv?'1':'0.35'}"><title>Rua ${rua}: ${total} itens</title></rect>`;
    s += `<text x="${x+BW/2}" y="${y+BH/2+4}" text-anchor="middle" `
       + `font-size="12" font-weight="700" fill="${cor.txt}" opacity="${atv?'1':'0.45'}">${rua}</text>`;

    if (total > 0) {
      const c = corPonto(total);
      const r = total >= 10 ? 12 : 10;
      // Ponto à DIREITA do bloco
      const cx = x + BW + r + 6, cy = y + BH/2;
      s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}" stroke="#fff" stroke-width="2"/>`;
      s += `<text x="${cx}" y="${cy+4}" text-anchor="middle" `
         + `font-size="${total >= 100?7:total>=10?8:9}" fill="#fff" font-weight="700">${total}</text>`;

      if (isPedidoUnico && (d.encontrado||0) > 0) {
        const pct = Math.min(1, d.encontrado / total);
        s += `<rect x="${x+3}" y="${y+BH-5}" width="${BW-6}" height="3" rx="1.5" fill="#CBD5E1"/>`;
        s += `<rect x="${x+3}" y="${y+BH-5}" width="${Math.round((BW-6)*pct)}" height="3" rx="1.5" fill="#16A34A"/>`;
      }
    }
  });

  // ── Seta + CHECKOUT ──
  const ckY = frenteStartY + FRENTE.length * (BH + VGAP) + 12;
  const ckW = 100, ckH = 28;
  const ckX = qCX - ckW/2;
  s += `<polygon points="${qCX-5},${ckY} ${qCX+5},${ckY} ${qCX},${ckY-9}" fill="#64748B"/>`;
  s += `<rect x="${ckX}" y="${ckY}" width="${ckW}" height="${ckH}" rx="6" fill="#1E3A5F"/>`;
  s += `<text x="${qCX}" y="${ckY+ckH/2+5}" text-anchor="middle" font-size="10" font-weight="700" fill="#fff" letter-spacing="0.5">CHECKOUT / ENTRADA</text>`;

  s += '</svg>';
  el.innerHTML = s;
}


async function carregarOperacao() {
  try {
    const hoje = hojeLocal();
    const dIni = document.getElementById('filtro-data-ini')?.value || hoje;
    const dFim = document.getElementById('filtro-data-fim')?.value || hoje;

    // Busca pedidos sempre pelo intervalo de datas selecionado.
    // Isso garante que o filtro DE/ATÉ sempre funcione — inclusive para "hoje",
    // evitando que pedidos pendentes de dias anteriores apareçam no dia atual.
    const res = await fetch(`${API}/pedidos?data_ini=${dIni}&data_fim=${dFim}`, { credentials:'include' });
    let pedidos = res.ok ? await res.json() : [];

    // Apenas pedidos DISTRIBUÍDOS (com separador atribuído).
    // Pedidos importados mas ainda não distribuídos (separador_id nulo) não entram no lote ativo.
    const distribuidos = pedidos.filter(p => p.separador_nome || p.separador_id);
    const total      = distribuidos.length;
    const concluidos = distribuidos.filter(p=>p.status==='concluido').length;
    const separando  = distribuidos.filter(p=>p.status==='separando').length;
    const pendentes  = distribuidos.filter(p=>p.status==='pendente').length;
    const pct        = total > 0 ? Math.round((concluidos/total)*100) : 0;

    // Atualiza pipeline cards com dados de separação
    _pedidosOperacao = pedidos;
    renderDashPipeline();

    // Previsão de conclusão
    const prevEl = document.getElementById('op-previsao');
    const prevTxt = document.getElementById('op-previsao-txt');
    if (concluidos > 0 && pendentes > 0) {
      // Calcula velocidade: pedidos/hora com base nos concluídos
      // Pega hora do primeiro e do ultimo concluído
      const conclPeds = distribuidos.filter(p=>p.status==='concluido' && p.hora_pedido);
      if (conclPeds.length >= 2) {
        const horas = conclPeds.map(p=>p.hora_pedido).sort();
        const [h1,m1] = horas[0].split(':').map(Number);
        const [h2,m2] = horas[horas.length-1].split(':').map(Number);
        const minDecorridos = (h2*60+m2) - (h1*60+m1);
        if (minDecorridos > 0) {
          const velPorMin = concluidos / minDecorridos;
          const minRestantes = Math.round(pendentes / velPorMin);
          const hRestantes = Math.floor(minRestantes / 60);
          const mRestantes = minRestantes % 60;
          const agora = new Date();
          agora.setMinutes(agora.getMinutes() + minRestantes);
          const hFim = agora.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'});
          prevTxt.textContent = `Velocidade atual: ${(velPorMin*60).toFixed(1)} pedidos/hora · Previsão de conclusão: ${hFim} (em ~${hRestantes}h ${mRestantes}min)`;
          prevEl.style.display = 'block';
        }
      }
    } else if (pct === 100) {
      prevTxt.textContent = 'Todos os pedidos do lote foram concluídos!';
      prevEl.style.display = 'block';
    } else {
      prevEl.style.display = 'none';
    }

    // Ranking por separador
    const porSep = {};
    pedidos.forEach(p => {
      if (!p.separador_nome) return;
      if (!porSep[p.separador_nome]) porSep[p.separador_nome] = { nome:p.separador_nome, concluidos:0, separando:0, pendentes:0, pontuacao:0 };
      if (p.status==='concluido')  { porSep[p.separador_nome].concluidos++; porSep[p.separador_nome].pontuacao += (p.pontuacao||0); }
      if (p.status==='separando')  porSep[p.separador_nome].separando++;
      if (p.status==='pendente')   porSep[p.separador_nome].pendentes++;
    });
    let seps = Object.values(porSep).sort((a,b)=>b.concluidos-a.concluidos);
    const turnoAtivo = window._turnoFiltro || '';
    if (turnoAtivo) {
      try {
        const resAllSeps = await fetch(`${API}/separadores`, { credentials:'include' });
        const allSeps = resAllSeps.ok ? await resAllSeps.json() : [];
        const nomesDoTurno = new Set(allSeps.filter(s=>s.turno===turnoAtivo).map(s=>s.nome));
        // Também inclui usuários com perfil checkout/repositor do turno
        const resUsers = await fetch(`${API}/usuarios`, { credentials:'include' });
        const allUsers = resUsers.ok ? await resUsers.json() : [];
        allUsers.filter(u=>u.turno===turnoAtivo).forEach(u=>nomesDoTurno.add(u.nome));
        seps = seps.filter(s => nomesDoTurno.has(s.nome));
      } catch(e) { console.warn(e); }
    }
    // Tempo real
    const trEl = document.getElementById('op-tempo-real');
    if (trEl) {
      if (!seps.length) {
        trEl.innerHTML = '<div style="color:var(--text3);text-align:center;padding:20px;font-size:13px">Nenhum separador ativo</div>';
      } else {
        trEl.innerHTML = seps.map(s => {
          const total_sep = s.concluidos + s.separando + s.pendentes;
          const pct_sep   = total_sep > 0 ? Math.round((s.concluidos/total_sep)*100) : 0;
          const statusColor = s.separando > 0 ? '#D97706' : s.concluidos > 0 ? '#15803D' : '#94A3B8';
          const statusTxt   = s.separando > 0 ? 'Separando' : s.concluidos > 0 ? 'Disponível' : 'Aguardando';
          return `<div style="padding:10px 4px;border-bottom:0.5px solid var(--border)">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <div style="display:flex;align-items:center;gap:8px">
                <div style="width:8px;height:8px;border-radius:50%;background:${statusColor};flex-shrink:0"></div>
                <span style="font-size:13px;font-weight:600;color:var(--text)">${s.nome}</span>
                <span style="font-size:10px;color:${statusColor};font-weight:600">${statusTxt}</span>
              </div>
              <span style="font-size:11px;color:var(--text3)">${pct_sep}%</span>
            </div>
            <div style="display:flex;gap:12px;font-size:11px;color:var(--text3);margin-bottom:5px">
              <span style="color:var(--green)">✓ ${s.concluidos} concluídos</span>
              ${s.separando>0?`<span style="color:var(--amber)">⟳ ${s.separando} em andamento</span>`:''}
              ${s.pendentes>0?`<span>⏳ ${s.pendentes} na fila</span>`:''}
            </div>
            <div style="height:5px;background:var(--surface2);border-radius:3px;overflow:hidden">
              <div style="height:100%;background:linear-gradient(90deg,#16A34A,#4ADE80);width:${pct_sep}%;border-radius:3px;transition:width .4s"></div>
            </div>
          </div>`;
        }).join('');
      }
    }
  } catch(e) { console.error(e); }
}

/* ── Zerar Dados de Teste ─────────────────────────────────────────────────── */
async function confirmarZerarDados() {
  const hoje = hojeLocal();
  const data = prompt(`Zerar TODOS os dados operacionais de qual data?\n(deixe em branco para hoje: ${hoje})`, hoje);
  if (data === null) return; // cancelou
  const dia = data.trim() || hoje;
  wmsConfirm({
    icone:      '⚠️',
    titulo:     `Zerar dados de ${dia}?`,
    sub:        'Serão apagados PERMANENTEMENTE: Pedidos, Checkout, Embalagem, Reposições e Sessões de trabalho desta data.',
    btnOk:      'Zerar dados',
    btnOkClass: 'btn-danger',
  }, async () => {

  try {
    const res = await fetch(`${API}/admin/zerar-dados-teste`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmar: true, data: dia }),
      credentials: 'include'
    });
    const d = await res.json();
    if (!res.ok) { alert('Erro: ' + (d.erro || 'falha')); return; }
    const r = d.removidos;
    alert(`✅ Dados de ${dia} removidos!\n\nPedidos: ${r.pedidos}\nCheckout: ${r.checkout}\nEmbalagem: ${r.embalagem}\nReposição: ${r.reposicao}\nSessões: ${r.sessoes}`);
    carregarDashboard();
  } catch(e) { toast('Erro de conexão: ' + e.message, 'erro'); }
  });
}

async function carregarDashboard() {
  await popularSelects();
  // KPIs e Operação em paralelo — garante que renderDashPipeline
  // receba os dois datasets antes do render final
  await Promise.all([carregarKPIs(), carregarOperacao()]);
  renderDashPipeline(); // render final com _kpiData + _pedidosOperacao completos
  await carregarProdutividade();
  await carregarTimeline();
  await atualizarBadgeRep();
  carregarRankingGeral();
  carregarGraficoPizzaStatus();
  carregarGraficoPizzaReposicao();
  carregarGraficoBarrasHoras();
  carregarGraficoFunil();
  atualizarBadgeLiberacao();
  iniciarAutoRefreshLiberacao();
  iniciarAutoRefreshOperacao();
  const el = document.getElementById('dash-ultima-atualizacao');
  if (el) el.textContent = '— atualizado ' + new Date().toLocaleTimeString('pt-BR', {timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'});
}

/* ─── RANKING GERAL ─────────────────────────────────────────────────── */
async function carregarRankingGeral() {
  const el = document.getElementById('op-ranking-geral');
  if (!el) return;
  try {
    const res = await fetch(`${API}/dashboard/ranking-geral`, { credentials:'include' });
    if (!res.ok) return;
    const data = await res.json();

    const areas = [
      { key:'separadores', icon:'📦', label:'Separação', cor:'var(--accent)',  metrica:'pedidos'    },
      { key:'checkout',    icon:'✅', label:'Checkout',  cor:'var(--green)',   metrica:'checkouts'  },
      { key:'embalagem',   icon:'📫', label:'Embalagem', cor:'var(--indigo)',  metrica:'embalagens' },
      { key:'repositores', icon:'🔧', label:'Reposição', cor:'var(--amber)',   metrica:'repostos'   },
    ];
    const medalhas = ['🥇','🥈','🥉'];

    el.innerHTML = areas.map(area => {
      const lista = (data[area.key] || []).map(r => ({ ...r, total: parseInt(r.total)||0 }));
      const max = Math.max(...lista.map(r => r.total), 1);
      const linhas = lista.length > 0
        ? lista.map((r,i) => `
            <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:0.5px solid var(--border)">
              <span style="font-size:15px;width:22px;text-align:center;flex-shrink:0">${medalhas[i]||''}</span>
              <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.nome}</div>
                <div style="height:4px;background:var(--surface2);border-radius:2px;margin-top:3px">
                  <div style="height:100%;background:${area.cor};width:${Math.round(r.total/max*100)}%;border-radius:2px"></div>
                </div>
              </div>
              <div style="text-align:right;flex-shrink:0">
                <div style="font-size:16px;font-weight:800;color:${area.cor}">${r.total}</div>
                ${area.key==='separadores'&&r.itens?`<div style="font-size:9px;color:var(--text3)">${r.itens} itens</div>`:''}
              </div>
            </div>`).join('')
        : `<div style="color:var(--text3);text-align:center;padding:16px 8px;font-size:12px">Sem dados hoje</div>`;

      return `<div style="padding:12px 14px;border-right:1px solid var(--border)">
        <div style="font-size:11px;font-weight:800;color:${area.cor};letter-spacing:.5px;margin-bottom:8px">${area.icon} ${area.label.toUpperCase()}</div>
        ${linhas}
      </div>`;
    }).join('');

  } catch(e) { console.error('carregarRankingGeral:', e); }
}

/* ─── AUTO-REFRESH OPERACIONAL ──────────────────────────────────────── */
let _opRefreshInterval = null;
function iniciarAutoRefreshOperacao() {
  if (_opRefreshInterval) clearInterval(_opRefreshInterval);
  _opRefreshInterval = setInterval(async () => {
    // Só atualiza se o dashboard estiver na página ativa
    const pagDash = document.getElementById('pag-dashboard');
    if (!pagDash?.classList.contains('ativa')) return;
    // Sempre atualiza KPIs (ficam no topo, visíveis em todas as abas)
    carregarKPIs();
    // Atualiza dados de operação (contadores separando/pendente/concluído)
    const tabOpPanel = document.getElementById('dtab-operacao');
    if (!tabOpPanel || tabOpPanel.style.display !== 'none') {
      carregarOperacao();
    }
  }, 30000); // a cada 30 segundos
}

/* ─── LIBERAÇÃO DE ITENS ────────────────────────────────────────────── */
let _liberacaoInterval = null;
function iniciarAutoRefreshLiberacao() {
  if (_liberacaoInterval) clearInterval(_liberacaoInterval);
  _liberacaoInterval = setInterval(() => {
    if (document.getElementById('pag-liberacao')?.classList.contains('ativa')) carregarLiberacao();
    atualizarBadgeLiberacao();
  }, 20000);
}

async function carregarLiberacao() {
  const tbody     = document.getElementById('tbody-liberacao');
  const tbodyLib  = document.getElementById('tbody-liberados');
  const badge     = document.getElementById('lib-total-badge');
  const histBadge = document.getElementById('lib-hist-badge');
  const menuBadge = document.getElementById('menu-badge-lib');
  if (!tbody) return;

  const ini = document.getElementById('lib-filtro-ini')?.value || '';
  const fim = document.getElementById('lib-filtro-fim')?.value || '';
  const p   = new URLSearchParams();
  if (ini) p.set('data_ini', ini);
  if (fim) p.set('data_fim', fim);
  const q = p.toString() ? '?'+p.toString() : '';

  const fmtD = d => { const m=String(d||'').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m?`${m[3]}/${m[2]}/${m[1]}`:d||''; };

  try {
    // ── Pendentes ─────────────────────────────────────────────────────
    const res  = await fetch(`${API}/liberacao/pendentes${q}`, { credentials:'include' });
    const rows = await res.json();
    const total = rows.length;
    if (badge)     badge.textContent = total;
    if (menuBadge) { menuBadge.textContent = total; menuBadge.style.display = total > 0 ? 'inline' : 'none'; }

    tbody.innerHTML = total ? rows.map(r => `
      <tr>
        <td style="font-weight:700">${r.numero_pedido||'—'}</td>
        <td>
          <div style="font-weight:700;color:var(--text)">${r.codigo||'—'}</div>
          <div style="font-size:11px;color:var(--text2)">${r.descricao||''}</div>
        </td>
        <td style="text-align:center;font-weight:700">${r.quantidade||'—'}</td>
        <td style="color:var(--text2)">${r.separador_nome||'—'}</td>
        <td style="color:var(--text2)">${r.repositor_nome||'—'}</td>
        <td style="color:var(--text3);font-size:12px">${fmtD(r.data_aviso)} ${r.hora_reposto||r.hora_aviso||''}</td>
        <td id="lib-btn-${r.id}" style="white-space:nowrap">
          <button class="btn btn-sm" style="background:#10b981;color:#fff;margin-right:4px;white-space:nowrap"
            onclick="liberarItem(${r.id},'encontrado',this)">✅ Encontrado</button>
          <button class="btn btn-sm" style="background:#ef4444;color:#fff;white-space:nowrap"
            onclick="liberarItem(${r.id},'nao_encontrado',this)">❌ Não Encontrado</button>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:32px;font-size:13px">✅ Nenhum item aguardando liberação</td></tr>';

    // ── Histórico de liberados ────────────────────────────────────────
    if (tbodyLib) {
      const resH  = await fetch(`${API}/liberacao/historico${q}`, { credentials:'include' });
      const rowsH = resH.ok ? await resH.json() : [];
      if (histBadge) histBadge.textContent = rowsH.length;
      tbodyLib.innerHTML = rowsH.length ? rowsH.map(r => {
        let hist = [];
        try { hist = Array.isArray(r.historico)?r.historico:(r.historico?JSON.parse(r.historico):[]); } catch{}
        const libEntry    = hist.find(h => h.acao === 'liberado_supervisor');
        const liberadoPor = r.liberado_por || libEntry?.usuario || '—';
        const horaLib     = libEntry?.hora || r.hora_reposto || '—';
        const decisao     = libEntry?.decisao || (r.status === 'protocolo' ? 'nao_encontrado' : 'encontrado');
        const decLabel    = decisao === 'encontrado'
          ? '<span style="color:#10b981;font-weight:700">✅ Encontrado</span>'
          : '<span style="color:#7c3aed;font-weight:700">📋 Não Encontrado</span>';
        return `<tr>
          <td style="font-weight:700">${r.numero_pedido||'—'}</td>
          <td>
            <div style="font-weight:700;color:var(--text)">${r.codigo||'—'}</div>
            <div style="font-size:11px;color:var(--text2)">${r.descricao||''}</div>
          </td>
          <td style="color:var(--text2)">${r.separador_nome||'—'}</td>
          <td style="color:var(--text2)">${r.repositor_nome||'—'}</td>
          <td>${decLabel}<div style="font-size:11px;color:var(--text3)">${liberadoPor}</div></td>
          <td style="color:var(--text3);font-size:12px">${fmtD(r.data_aviso)} ${horaLib}</td>
        </tr>`;
      }).join('')
      : '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:32px;font-size:13px">Nenhum item liberado no período</td></tr>';
    }
  } catch(e) { console.error('carregarLiberacao:', e); toast('Erro ao carregar liberações','erro'); }
}

// IDs de itens atualmente em processo de liberação — impede duplo clique e re-render
const _liberandoIds = new Set();
function _btnsLiberacao(id) {
  return `<button class="btn btn-sm" style="background:#10b981;color:#fff;margin-right:4px;white-space:nowrap" onclick="liberarItem(${id},'encontrado',this)">✅ Encontrado</button>`+
         `<button class="btn btn-sm" style="background:#ef4444;color:#fff;white-space:nowrap" onclick="liberarItem(${id},'nao_encontrado',this)">❌ Não Encontrado</button>`;
}

async function liberarItem(id, decisao, btn) {
  // Se já está em processamento (qualquer decisão), ignora — mesmo que a tabela tenha
  // sido re-renderizada pelo auto-refresh e os botões apareçam "novos"
  if (_liberandoIds.has(id)) return;
  _liberandoIds.add(id);

  // Desabilita ambos os botões imediatamente
  const cell = document.getElementById(`lib-btn-${id}`);
  if (cell) cell.querySelectorAll('button').forEach(b => b.disabled = true);

  const msg = decisao === 'encontrado'
    ? 'Liberar como ENCONTRADO? O separador será desbloqueado.'
    : 'Liberar como NÃO ENCONTRADO? O item ficará em Protocolo.';

  wmsConfirm(msg, async () => {
    // Mostra estado de processamento na célula
    const cellProc = document.getElementById(`lib-btn-${id}`);
    if (cellProc) cellProc.innerHTML = '<span style="color:var(--text3);font-size:12px">⏳ Processando...</span>';
    try {
      const res  = await fetch(`${API}/repositor/avisos/${id}/liberar`, {
        method:'PUT', credentials:'include',
        headers:{'Content-Type':'application/json'}, body:JSON.stringify({ decisao })
      });
      const data = await res.json();
      if (data.erro) {
        toast(data.erro,'erro');
        _liberandoIds.delete(id);
        const c = document.getElementById(`lib-btn-${id}`);
        if (c) c.innerHTML = _btnsLiberacao(id);
        return;
      }
      toast(data.mensagem || '✅ Item liberado!','sucesso');
      const badge = decisao === 'encontrado'
        ? '<span style="color:#10b981;font-weight:700;font-size:12px">✅ Liberado (Encontrado)</span>'
        : '<span style="color:#7c3aed;font-weight:700;font-size:12px">📋 Em Protocolo</span>';
      const cellFresh = document.getElementById(`lib-btn-${id}`);
      if (cellFresh) cellFresh.innerHTML = badge;
      _liberandoIds.delete(id);
      carregarLiberacao();
    } catch(e) {
      toast('Erro ao liberar!','erro');
      _liberandoIds.delete(id);
      const c = document.getElementById(`lib-btn-${id}`);
      if (c) c.innerHTML = _btnsLiberacao(id);
    }
  }, () => {
    // Cancelou — libera o lock e reabilita botões
    _liberandoIds.delete(id);
    const c = document.getElementById(`lib-btn-${id}`);
    if (c) c.querySelectorAll('button').forEach(b => b.disabled = false);
  });
}

async function atualizarBadgeLiberacao() {
  try {
    const res  = await fetch(`${API}/liberacao/pendentes`, { credentials:'include' });
    if (!res.ok) return;
    const rows = await res.json();
    const badge = document.getElementById('menu-badge-lib');
    if (badge) { badge.textContent = rows.length; badge.style.display = rows.length > 0 ? 'inline' : 'none'; }
  } catch(e) {}
}




// Turnos selecionados para filtro do dashboard (multi-select)
const _turnosDash = new Set();

function toggleTurnoDash(turno) {
  // 'Todos' ou clicar no turno ativo → limpa filtro
  if (turno === 'Todos' || _turnosDash.has(turno)) {
    _turnosDash.clear();
  } else {
    _turnosDash.clear();
    _turnosDash.add(turno);
  }
  // Atualiza visual dos botões (mesmo padrão do Relatório Analítico)
  document.querySelectorAll('#dash-turno-btns .rel-turno-btn').forEach(btn => {
    const t = btn.dataset.t;
    btn.classList.toggle('ativo', t === 'Todos' ? _turnosDash.size === 0 : _turnosDash.has(t));
  });
  // KPIs filtrados por turno + pipeline re-renderizado com pedidos filtrados
  carregarKPIs();
  renderDashPipeline();
}

// ── Globals para pipeline cards ──────────────────────────────────────────────
let _kpiData          = null;
let _pedidosOperacao  = null;

function renderDashPipeline() {
  const wrap = document.getElementById('dash-pipeline');
  if (!wrap) return;
  const kpi  = _kpiData || {};
  const fmtN = n => (n != null && !isNaN(n)) ? Number(n).toLocaleString('pt-BR') : '0';

  // ── Turno filter: filtra _pedidosOperacao pelo turno ativo ────────────────
  let pedidos = _pedidosOperacao || [];
  if (_turnosDash.size > 0) {
    const filtro = [..._turnosDash];
    pedidos = pedidos.filter(p => {
      // sep_turno é retornado pelo /pedidos endpoint (COALESCE turno_distribuicao, sep.turno)
      const t = p.sep_turno || p.turno_distribuicao || 'Manha';
      return filtro.includes(t);
    });
  }

  // ── SEPARAÇÃO ─────────────────────────────────────────────────────────────
  const distribuidos = pedidos.filter(p => p.separador_nome || p.separador_id);
  const sepTotal     = distribuidos.length;
  const sepSeparando = distribuidos.filter(p => p.status === 'separando').length;
  const sepPendente  = distribuidos.filter(p => p.status === 'pendente').length;
  const sepConcluido = distribuidos.filter(p => p.status === 'concluido').length;
  const sepItens     = distribuidos.reduce((s, p) => s + (parseInt(p.total_itens || p.itens) || 0), 0);

  // ── CHECKOUT (fluxo: sep concluído → Ck Pendente → Em Checkout → Ck Concluído) ──
  // "Ck. Pendente" = sep concluído mas status_embalagem ainda 'nao_iniciado' (não chegou ao checkout)
  // inclui os que estão "Em Checkout" agora, então subtraímos ckEmCk
  const ckNaoIniciado = distribuidos.filter(p =>
    p.status === 'concluido' && (!p.status_embalagem || p.status_embalagem === 'nao_iniciado')
  ).length;
  const ckEmCk = parseInt(kpi.checkout_pendente || 0); // no checkout desk agora
  const ckFila = Math.max(0, ckNaoIniciado - ckEmCk);  // aguardando (fila)
  // "Ck. Concluído" = passou pelo checkout (status_embalagem saiu de nao_iniciado)
  // Nota: o valor correto no banco é 'embalado' (não 'concluido')
  const ckConc  = distribuidos.filter(p =>
    p.status === 'concluido' && ['pendente','embalando','embalado'].includes(p.status_embalagem)
  ).length;
  // Total itens = todos os sep-concluídos (escopo completo do checkout)
  const ckItens = distribuidos
    .filter(p => p.status === 'concluido')
    .reduce((s, p) => s + (parseInt(p.total_itens || p.itens) || 0), 0);

  // ── EMBALAGEM (fluxo: ck concluído → Emb. Pendente → Embalando → Embalado) ──
  const embPend   = distribuidos.filter(p => p.status_embalagem === 'pendente').length;
  const embalando = distribuidos.filter(p => p.status_embalagem === 'embalando').length;
  // Nota: o valor correto no banco é 'embalado' (não 'concluido')
  const embConc   = distribuidos.filter(p => p.status_embalagem === 'embalado').length;
  // Total itens = todos que entraram na embalagem (pendente + embalando + embalado)
  const embItens = distribuidos
    .filter(p => ['pendente','embalando','embalado'].includes(p.status_embalagem))
    .reduce((s, p) => s + (parseInt(p.total_itens || p.itens) || 0), 0);

  // ── REPOSIÇÃO ─────────────────────────────────────────────────────────────
  const repConc   = parseInt(kpi.reposicao_concluida || 0);
  const repPend   = parseInt(kpi.faltas_abertas       || 0);
  const repNaoEnc = parseInt(kpi.nao_encontrados_hoje || 0);
  const repTotal  = parseInt(kpi.total_faltas_hoje    || 0);

  const cards = [
    { icon: '📦', label: 'SEPARAÇÃO', cor: '#4f46e5', grad: 'linear-gradient(135deg,#6366f1,#4338ca)',
      main: fmtN(sepConcluido), sub: 'pedidos concluídos',
      kpis: [
        { lbl: 'Total Pedidos',  val: fmtN(sepTotal) },
        { lbl: 'Em Separação',   val: fmtN(sepSeparando) },
        { lbl: 'Pendentes',      val: fmtN(sepPendente) },
        { lbl: 'Total Itens',    val: fmtN(sepItens) },
      ]},
    { icon: '🔖', label: 'CHECKOUT', cor: '#0891b2', grad: 'linear-gradient(135deg,#22d3ee,#0369a1)',
      main: fmtN(ckConc), sub: 'checkouts concluídos',
      kpis: [
        { lbl: 'Total Checkout', val: fmtN(ckFila + ckEmCk + ckConc) },
        { lbl: 'Em Checkout',    val: fmtN(ckEmCk) },
        { lbl: 'Pendentes',      val: fmtN(ckFila) },
        { lbl: 'Total Itens',    val: fmtN(ckItens) },
      ]},
    { icon: '📫', label: 'EMBALAGEM', cor: '#7c3aed', grad: 'linear-gradient(135deg,#a855f7,#6d28d9)',
      main: fmtN(embConc), sub: 'pedidos embalados',
      kpis: [
        { lbl: 'Emb. Pendente',  val: fmtN(embPend),  note: 'pós-checkout' },
        { lbl: 'Embalando',      val: fmtN(embalando) },
        { lbl: 'Embalados',      val: fmtN(embConc) },
        { lbl: 'Total Itens',    val: fmtN(embItens) },
      ]},
    { icon: '🔧', label: 'REPOSIÇÃO', cor: '#d97706', grad: 'linear-gradient(135deg,#f59e0b,#b45309)',
      main: fmtN(repConc), sub: 'reposições resolvidas',
      kpis: [
        { lbl: 'Total Reposição', val: fmtN(repTotal) },
        { lbl: 'Pendentes',       val: fmtN(repPend) },
        { lbl: 'Não Encontrados', val: fmtN(repNaoEnc) },
        { lbl: 'Encontrados',     val: fmtN(repConc) },
      ]},
  ];

  wrap.innerHTML = cards.map(c => `
    <div style="background:var(--surface);border-radius:18px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.10)">
      <div style="background:${c.grad};padding:20px 20px 18px;position:relative;overflow:hidden">
        <div style="position:absolute;right:-14px;top:-14px;width:90px;height:90px;border-radius:50%;background:rgba(255,255,255,.10);pointer-events:none"></div>
        <div style="position:absolute;right:-20px;bottom:-18px;width:70px;height:70px;border-radius:50%;background:rgba(255,255,255,.07);pointer-events:none"></div>
        <div style="position:relative">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,.2);font-size:22px;margin-bottom:10px">${c.icon}</div>
          <div style="font-size:10px;font-weight:800;color:rgba(255,255,255,.8);letter-spacing:1.2px;margin-bottom:4px">${c.label}</div>
          <div style="font-size:44px;font-weight:800;color:#fff;line-height:1;letter-spacing:-1px">${c.main}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.7);margin-top:6px">${c.sub}</div>
        </div>
      </div>
      <div style="padding:14px 16px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          ${c.kpis.map(k => `
            <div style="background:var(--surface2);border-radius:8px;padding:7px 10px">
              <div style="font-size:9px;color:var(--text3);font-weight:700;letter-spacing:.5px">${k.lbl.toUpperCase()}</div>
              <div style="font-size:15px;font-weight:800;color:var(--text);margin-top:2px">${k.val}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>`).join('');
}

async function carregarKPIs() {
  try {
    const params = new URLSearchParams();
    if (_turnosDash.size > 0) params.set('turnos', [..._turnosDash].join(','));
    const ini = document.getElementById('filtro-data-ini')?.value;
    const fim = document.getElementById('filtro-data-fim')?.value;
    if (ini) params.set('data_ini', ini);
    if (fim) params.set('data_fim', fim);
    const qs = params.toString();
    const url = `${API}/kpis${qs ? '?' + qs : ''}`;
    const res  = await fetch(url, { credentials:'include' });
    const data = await res.json();
    _kpiData = data;
    renderDashPipeline();
  } catch(e) { console.warn(e); }
}




async function carregarContadoresGerais() {
  await carregarKPIs();
}




async function carregarProdutividade() {
  try {
    const sepId = document.getElementById('filtro-sep-prod').value;
    const res   = await fetch(`${API}/produtividade${sepId?'?separador_id='+sepId:''}`, { credentials:'include' });
    const dados = await res.json();
    const tbody = document.getElementById('tbody-prod');
    if (!dados.length) { tbody.innerHTML = '<tr><td colspan="6" style="color:var(--text3);text-align:center;padding:20px">Nenhum usuário</td></tr>'; return; }
    const max = Math.max(...dados.map(d=>d.hoje||0), 1);
    tbody.innerHTML = dados.map(d=>`<tr>
      <td style="font-weight:600;color:var(--text)">${d.nome}</td>
      <td style="color:var(--green);font-weight:700">${d.hoje||0}</td>
      <td style="color:var(--amber)">${d.mes||0}</td>
      <td style="color:var(--accent)">${d.total_ano||0}</td>
      <td style="min-width:100px">
        <div style="font-size:10px;color:var(--text3)">${d.hoje||0} pedidos</div>
        <div class="prod-bar"><div class="prod-bar-fill" style="width:${Math.round(((d.hoje||0)/max)*100)}%"></div></div>
      </td>
      <td><span class="pill ${d.status}">${d.status}</span></td>
    </tr>`).join('');
  } catch(e) { console.warn(e); }
}




async function carregarTimeline() {
  try {
    const ini = document.getElementById('filtro-tl-ini')?.value || hoje;
    const fim = document.getElementById('filtro-tl-fim')?.value || hoje;
    let url = `${API}/pedidos`;
    if (ini && fim && ini !== fim) url += `?data_ini=${ini}&data_fim=${fim}`;
    else url += `?data=${ini}`;
    const res  = await fetch(url, { credentials:'include' });
    const ps   = await res.json();
    const el   = document.getElementById('tl-lista');
    if (!ps.length) { el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:24px;font-size:13px">Nenhum pedido nesta data</div>'; return; }
    const sorted = [...ps].sort((a,b) => (a.hora_pedido||'').localeCompare(b.hora_pedido||''));
    el.innerHTML = sorted.map(p => `
      <div class="tl-item">
        <div class="tl-hora">${p.hora_pedido||'--:--'}</div>
        <div class="tl-dot ${p.status}"></div>
        <div style="flex:1">
          <div class="tl-titulo">Pedido #${p.numero_pedido}</div>
          <div class="tl-sub">${p.separador_nome||'Sem usuário'} &nbsp;•&nbsp; <span class="pill ${p.status}" style="font-size:9px;padding:2px 7px">${p.status}</span> &nbsp;•&nbsp; ${p.total_itens||p.itens||0} itens &nbsp;•&nbsp; ${formatarData(p.data_pedido)}</div>
        </div>
      </div>`).join('');
  } catch(e) { console.warn(e); }
}




async function popularSelects() {
  try {
    const res   = await fetch(`${API}/usuarios`, { credentials:'include' });
    const users = await res.json();
    const seps  = users.filter(u => u.perfil === 'separador');
    todosSeparadores = seps;
    ['filtro-sep-prod','filtro-ped-sep'].forEach(id => {
      const sel = document.getElementById(id); if (!sel) return;
      const val = sel.value;
      // filtro-ped-sep usa nome para comparar com separador_nome nos pedidos
      if (id === 'filtro-ped-sep') {
        sel.innerHTML = '<option value="">Todos</option>' + seps.map(s=>`<option value="${s.nome}">${s.nome}</option>`).join('');
      } else {
        sel.innerHTML = '<option value="">Todos</option>' + seps.map(s=>`<option value="${s.id}">${s.nome}</option>`).join('');
      }
      sel.value = val;
    });
  } catch(e) { console.warn(e); }
}




/* ESTATÍSTICAS REPOSITOR (desktop) */
async function carregarStatsRepositor() {
  try {
    const ini = document.getElementById('srep-ini')?.value || '';
    const fim = document.getElementById('srep-fim')?.value || '';
    const res  = await fetch(`${API}/estatisticas/repositor`, { credentials:'include' });
    const data = await res.json();
    const set  = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val ?? 0; };
    set('srep-rep-hoje',  data.repostos_hoje);
    set('srep-rep-mes',   data.repostos_mes);
    set('srep-pendentes', data.pendentes_total);
    set('srep-nao-enc',   data.nao_encontrados);
    set('srep-proto',     data.protocolos);
    set('srep-ano',       data.avisos_ano);
    const tbody = document.getElementById('tbody-srep-prod');
    if (tbody) {
      const prod = data.produtividade || [];
      if (!prod.length) { tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text3);text-align:center;padding:20px">Nenhum repositor com atividade</td></tr>'; }
      else tbody.innerHTML = prod.map(d=>`<tr>
        <td style="font-weight:600;color:var(--text)">${d.nome||'—'}</td>
        <td style="color:var(--green);font-weight:700">${d.hoje||0}</td>
        <td style="color:var(--accent)">${d.repostos||0}</td>
        <td style="color:var(--red)">${d.nao_encontrados||0}</td>
        <td style="color:var(--text2)">${d.total||0}</td>
      </tr>`).join('');
    }
  } catch(e) { toast('Erro ao carregar estatísticas de reposição!','erro'); }
}




/* ESTATÍSTICAS CHECKOUT (desktop) */
async function carregarStatsCheckout() {
  try {
    const res  = await fetch(`${API}/estatisticas/checkout`, { credentials:'include' });
    const data = await res.json();
    const set  = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val ?? 0; };
    set('sck-hoje',       data.concluidos_hoje);
    set('sck-mes',        data.concluidos_mes);
    set('sck-ano',        data.concluidos_ano);
    set('sck-pend',       data.pendentes);
    set('sck-importados', data.total_hoje);
    // Carrega lista
    const status = document.getElementById('sck-filtro-status')?.value || '';
    const res2   = await fetch(`${API}/checkout${status?'?status='+status:''}`, { credentials:'include' });
    const rows   = await res2.json();
    const tbody  = document.getElementById('tbody-sck-lista');
    if (tbody) {
      if (!rows.length) { tbody.innerHTML = '<tr><td colspan="6" style="color:var(--text3);text-align:center;padding:18px">Nenhum checkout</td></tr>'; return; }
      tbody.innerHTML = rows.map(r=>`<tr>
        <td style="font-family:'Space Mono',monospace;font-weight:700;color:var(--amber)">${r.numero_caixa||'—'}</td>
        <td style="font-weight:700;color:var(--accent)">${r.numero_pedido}</td>
        <td>${r.separador_nome||'—'}</td>
        <td><span class="pill ${r.status}">${r.status==='concluido'?'Concluído':'Pendente'}</span></td>
        <td class="data-br">${formatarData(r.data_checkout)}</td>
        <td class="hora-br">${r.hora_checkout||r.hora_criacao||'—'}</td>
      </tr>`).join('');
    }
  } catch(e) { toast('Erro ao carregar estatísticas de checkout!','erro'); }
}




/* PERFORMANCE DOS COLABORADORES */
const AREA_INFO = {
  separador: { icon:'📦', label:'Separação',  cor:'var(--accent)', grad:'linear-gradient(135deg,#6366f1,#4338ca)' },
  checkout:  { icon:'✅', label:'Checkout',   cor:'var(--indigo)', grad:'linear-gradient(135deg,#22d3ee,#0369a1)' },
  embalador: { icon:'📫', label:'Embalagem',  cor:'#7C3AED',       grad:'linear-gradient(135deg,#a855f7,#6d28d9)' },
  repositor: { icon:'🔧', label:'Reposição',  cor:'#EA580C',       grad:'linear-gradient(135deg,#f59e0b,#b45309)' },
};

function _pctBar(pct, temSessao) {
  if (pct === null || pct === undefined) {
    const txt = temSessao ? 'sem dados' : 'sem sessão';
    return `<span style="color:var(--text3);font-size:11px">${txt}</span>`;
  }
  const p = Math.min(100, pct);
  const cor = pct >= 100 ? '#16a34a' : pct >= 70 ? '#2563EB' : pct >= 40 ? '#D97706' : '#DC2626';
  return `<div style="display:flex;align-items:center;gap:6px">
    <div style="flex:1;height:8px;background:#E2E8F0;border-radius:4px;overflow:hidden;min-width:60px">
      <div style="height:100%;width:${p}%;background:${cor};border-radius:4px;transition:width .3s"></div>
    </div>
    <span style="font-size:11px;font-weight:700;color:${cor};min-width:34px">${pct}%</span>
  </div>`;
}

function _horasStr(min) {
  if (min === null || min === undefined) return '—';
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2,'0')}min` : `${m}min`;
}

let _performanceDados = [];
let _performanceDetalheDados = [];

async function carregarPerformance() {
  const ini    = document.getElementById('perf-ini')?.value  || hojeLocal();
  const fim    = document.getElementById('perf-fim')?.value  || hojeLocal();
  const perfil = document.getElementById('perf-perfil')?.value || '';
  const colab  = document.getElementById('perf-colab')?.value  || '';

  let url = `${API}/stats/performance?ini=${ini}&fim=${fim}`;
  if (perfil) url += `&perfil=${perfil}`;
  if (colab)  url += `&colaborador=${encodeURIComponent(colab)}`;

  try {
    const res = await fetch(url, { credentials:'include' });
    if (!res.ok) { toast('Erro ao carregar performance','erro'); return; }
    const { resultado, resumo } = await res.json();

    _performanceDados = resultado;

    const el = id => document.getElementById(id);

    // Popula dropdown de colaboradores (sempre, sem filtro de nome ativo)
    const colabSel = el('perf-colab');
    if (colabSel && !colab) {
      const nomes = [...new Set(resultado.map(r => r.usuario_nome))].sort();
      colabSel.innerHTML = '<option value="">Todos</option>' +
        nomes.map(n => `<option value="${n}">${n}</option>`).join('');
    }

    // Agrega resultado por área
    const AREAS_ORDEM = ['separador','checkout','embalador','repositor'];
    const porArea = {};
    AREAS_ORDEM.forEach(p => { porArea[p] = { atividades: 0, minutos: 0, temSessao: false, colaboradores: 0 }; });
    resultado.forEach(r => {
      if (!porArea[r.perfil]) return;
      porArea[r.perfil].atividades   += r.atividades || 0;
      porArea[r.perfil].minutos      += r.minutos    || 0;
      porArea[r.perfil].temSessao    = porArea[r.perfil].temSessao || r.minutos !== null;
      porArea[r.perfil].colaboradores++;
    });

    // Define quais áreas mostrar (todas ou filtrada)
    const areasVisiveis = perfil ? [perfil] : AREAS_ORDEM;
    const cols = areasVisiveis.length;
    const LABELS = { separador:'pedidos', checkout:'checkouts', embalador:'embalagens', repositor:'reposições' };

    const cardsWrap = el('perf-cards-colab');
    if (!cardsWrap) return;
    cardsWrap.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    cardsWrap.innerHTML = areasVisiveis.map(p => {
      const area = AREA_INFO[p] || { icon:'👤', label: p, cor:'var(--text)' };
      const ag   = porArea[p];

      let tempoBody = '';
      if (colab) {
        const r = resultado.find(r => r.perfil === p);
        const min = r?.minutos || 0;
        tempoBody = `<div style="padding:12px 14px">
          <div style="background:var(--surface2);border-radius:8px;padding:7px 10px;display:flex;align-items:center;gap:10px">
            <span style="font-size:20px">⏱</span>
            <div>
              <div style="font-size:9px;color:var(--text3);font-weight:700;letter-spacing:.5px">TEMPO LOGADO</div>
              <div style="font-size:15px;font-weight:800;color:var(--text)">${min > 0 ? _horasStr(min) : '—'}</div>
            </div>
          </div>
        </div>`;
      }

      const grad = area.grad || 'linear-gradient(135deg,#64748b,#334155)';
      const colabInfo = !colab ? `<div style="font-size:11px;color:rgba(255,255,255,.65);margin-top:2px">${ag.colaboradores} colaborador${ag.colaboradores!==1?'es':''}</div>` : '';

      return `<div style="background:var(--surface);border-radius:18px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.10)">
        <div style="background:${grad};padding:18px 18px 16px;position:relative;overflow:hidden">
          <div style="position:absolute;right:-14px;top:-14px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.10);pointer-events:none"></div>
          <div style="position:absolute;right:-18px;bottom:-18px;width:65px;height:65px;border-radius:50%;background:rgba(255,255,255,.07);pointer-events:none"></div>
          <div style="position:relative">
            <div style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,.2);font-size:20px;margin-bottom:8px">${area.icon}</div>
            <div style="font-size:10px;font-weight:800;color:rgba(255,255,255,.8);letter-spacing:1.2px;margin-bottom:4px">${area.label.toUpperCase()}</div>
            <div style="font-size:44px;font-weight:800;color:#fff;line-height:1;letter-spacing:-1px">${ag.atividades}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.7);margin-top:4px">${LABELS[p]}</div>
            ${colabInfo}
          </div>
        </div>
        ${tempoBody}
      </div>`;
    }).join('');

    // Carrega detalhamento após os cards
    carregarPerformanceDetalhe(ini, fim, perfil, colab);

  } catch(e) { console.error('Erro performance:', e); toast('Erro ao carregar performance','erro'); }
}

/* ─── Detalhamento por pedido ─────────────────────────────────────── */
async function carregarPerformanceDetalhe(ini, fim, filtPerfil, filtColab) {
  const wrap    = document.getElementById('perf-detalhe-wrap');
  const content = document.getElementById('perf-detalhe-content');
  const badge   = document.getElementById('perf-det-badge');
  if (!wrap || !content) return;

  // Mostra para todos os perfis operacionais
  const perfilOk = !filtPerfil || ['separador','checkout','embalador','repositor'].includes(filtPerfil);
  if (!perfilOk) { wrap.style.display = 'none'; return; }

  try {
    let url = `${API}/stats/performance/detalhe?ini=${ini||hojeLocal()}&fim=${fim||hojeLocal()}`;
    if (filtPerfil) url += `&perfil=${filtPerfil}`;
    if (filtColab)  url += `&colaborador=${encodeURIComponent(filtColab)}`;

    const res = await fetch(url, { credentials:'include' });
    if (!res.ok) return;
    const { detalhe } = await res.json();

    _performanceDetalheDados = detalhe || [];

    if (!detalhe || !detalhe.length) { wrap.style.display = 'none'; return; }

    const totalRegistros = detalhe.reduce((s, d) => s + d.pedidos.length, 0);
    if (totalRegistros === 0) { wrap.style.display = 'none'; return; }

    wrap.style.display = 'block';
    if (badge) badge.textContent = `${totalRegistros} registros`;

    const ORDEM_PERFIS = ['separador','checkout','embalador','repositor'];
    detalhe.sort((a,b) => {
      const ia = ORDEM_PERFIS.indexOf(a.perfil); const ib = ORDEM_PERFIS.indexOf(b.perfil);
      if (ia !== ib) return ia - ib;
      return a.nome.localeCompare(b.nome);
    });

    content.innerHTML = detalhe.map(colab => {
      const isSep  = colab.perfil === 'separador';
      const isEmb  = colab.perfil === 'embalador';
      const isRep  = colab.perfil === 'repositor';
      const AREA_COR   = { separador:'var(--accent)', checkout:'var(--green)', embalador:'#8B5CF6', repositor:'#F97316' };
      const AREA_LABEL = { separador:'📦 Separação', checkout:'✅ Checkout', embalador:'📫 Embalagem', repositor:'🔧 Reposição' };
      const cor = AREA_COR[colab.perfil] || 'var(--text)';

      const nomeSafe = colab.nome.replace(/'/g, "\\'");
      const header = `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;background:var(--surface2);border-bottom:1px solid var(--border);flex-wrap:wrap">
          <span style="font-size:13px;font-weight:800;color:${cor}">${AREA_LABEL[colab.perfil]||colab.perfil}</span>
          <span style="font-size:14px;font-weight:700;color:var(--text)">${colab.nome}</span>
          <span style="font-size:11px;color:var(--text3);font-weight:600">${colab.pedidos.length} pedido${colab.pedidos.length!==1?'s':''}</span>
          <button class="btn btn-outline btn-sm" style="margin-left:auto" onclick="gerarRelatorioColaborador('${nomeSafe}')">📄 Relatório do Mês</button>
        </div>`;

      let tabela = '';
      if (isSep) {
        const linhas = colab.pedidos.map(p => {
          const ini = p.iniciado_em ? p.iniciado_em.split('T')[1]||p.iniciado_em.slice(-5) : '—';
          const fim = p.concluido_em ? p.concluido_em.split('T')[1]||p.concluido_em.slice(-5) : '—';
          const total = p.tempo_total_min !== null ? _horasStr(Math.round(p.tempo_total_min)) : '—';
          const espera = p.tempo_espera_min > 0 ? `<span style="color:var(--amber);font-weight:700">${_horasStr(Math.round(p.tempo_espera_min))}</span>` : '<span style="color:var(--text3)">—</span>';
          const real = p.tempo_real_min !== null
            ? `<span style="color:${p.tempo_real_min<=30?'var(--green)':p.tempo_real_min<=60?'var(--amber)':'var(--red)'};font-weight:700">${_horasStr(Math.round(p.tempo_real_min))}</span>`
            : '—';
          const reps = p.qtd_reposicoes > 0
            ? `<span style="color:var(--amber);font-weight:700">${p.qtd_reposicoes}</span>`
            : '<span style="color:var(--text3)">0</span>';
          return `<tr>
            <td style="font-weight:700">${p.numero_pedido||'—'}</td>
            <td style="color:var(--text2)">${fmtData(p.data_pedido)||'—'}</td>
            <td style="color:var(--text2)">${ini}</td>
            <td style="color:var(--text2)">${fim}</td>
            <td style="color:var(--text2)">${total}</td>
            <td>${espera}</td>
            <td>${real}</td>
            <td style="font-weight:700;color:var(--accent)">${p.total_itens||0}</td>
            <td style="font-weight:700;color:var(--text2)">${p.qtd_produtos||0}</td>
            <td>${reps}</td>
          </tr>`;
        }).join('');
        tabela = `
          <div class="tabela-wrap">
            <table>
              <thead><tr>
                <th>Nº PEDIDO</th><th>DATA</th><th>INÍCIO</th><th>CONCLUSÃO</th>
                <th>T. TOTAL</th><th>⏸ ESPERA</th><th>✅ T. REAL</th>
                <th>ITENS</th><th>PRODUTOS</th><th>REPOS.</th>
              </tr></thead>
              <tbody>${linhas}</tbody>
            </table>
          </div>`;
      } else if (colab.perfil === 'checkout') {
        const linhas = colab.pedidos.map(p => {
          const tempo = p.tempo_checkout_min !== null
            ? `<span style="color:${p.tempo_checkout_min<=5?'var(--green)':p.tempo_checkout_min<=15?'var(--amber)':'var(--red)'};font-weight:700">${_horasStr(p.tempo_checkout_min)}</span>`
            : '<span style="color:var(--text3)">—</span>';
          return `<tr>
            <td style="font-weight:700">${p.numero_pedido||'—'}</td>
            <td style="color:var(--text2)">${fmtData(p.data_pedido)||'—'}</td>
            <td style="color:var(--text3);font-size:12px">${p.hora_fila||'—'}</td>
            <td style="color:var(--text2)">${p.hora_abertura||'—'}</td>
            <td style="color:var(--text2)">${p.hora_confirmacao||'—'}</td>
            <td>${tempo}</td>
            <td style="font-weight:700;color:var(--accent)">${p.total_itens||0}</td>
            <td style="font-weight:700;color:var(--text2)">${p.qtd_produtos||0}</td>
          </tr>`;
        }).join('');
        tabela = `
          <div class="tabela-wrap">
            <table>
              <thead><tr>
                <th>Nº PEDIDO</th><th>DATA</th>
                <th title="Hora em que o pedido ficou disponível para checkout">📥 ENTRADA FILA</th>
                <th>🔓 ABERTURA</th><th>✅ CONFIRMAÇÃO</th>
                <th>⏱ T. REAL</th><th>ITENS</th><th>PRODUTOS</th>
              </tr></thead>
              <tbody>${linhas}</tbody>
            </table>
          </div>`;
      } else if (isEmb) {
        const linhas = colab.pedidos.map(p => {
          const tempo = p.tempo_embalagem_min !== null
            ? `<span style="color:${p.tempo_embalagem_min<=5?'var(--green)':p.tempo_embalagem_min<=15?'var(--amber)':'var(--red)'};font-weight:700">${_horasStr(p.tempo_embalagem_min)}</span>`
            : '<span style="color:var(--text3)">—</span>';
          return `<tr>
            <td style="font-weight:700">${p.numero_pedido||'—'}</td>
            <td style="color:var(--text2)">${fmtData(p.data_pedido)||'—'}</td>
            <td style="color:var(--text3);font-size:12px">${p.hora_fila||'—'}</td>
            <td style="color:var(--text2)">${p.embalagem_inicio||'—'}</td>
            <td style="color:var(--text2)">${p.embalado_em||'—'}</td>
            <td>${tempo}</td>
            <td style="color:var(--text2);font-size:12px;max-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.cliente||'—'}</td>
            <td style="color:var(--text2);font-size:12px">${p.transportadora||'—'}</td>
            <td style="font-weight:700;color:#8B5CF6">${p.total_itens||0}</td>
            <td style="font-weight:700;color:var(--text2)">${p.qtd_produtos||0}</td>
          </tr>`;
        }).join('');
        tabela = `
          <div class="tabela-wrap">
            <table>
              <thead><tr>
                <th>Nº PEDIDO</th><th>DATA</th>
                <th title="Hora em que o checkout foi concluído e o pedido entrou para embalagem">📥 ENTRADA FILA</th>
                <th>🔓 INÍCIO</th><th>✅ FIM</th>
                <th>⏱ T. REAL</th><th>CLIENTE</th><th>TRANSP.</th><th>ITENS</th><th>PRODUTOS</th>
              </tr></thead>
              <tbody>${linhas}</tbody>
            </table>
          </div>`;
      } else if (isRep) {
        const RESCor   = { encontrado:'var(--green)', nao_encontrado:'var(--red)' };
        const RESLabel = { encontrado:'✅ Encontrou', nao_encontrado:'❌ Não encontrou' };
        const TENTCor  = { '1ª':'var(--accent)', '2ª':'var(--amber)', '3ª':'var(--red)', 'ÚLTIMA tentativa':'var(--red)' };
        const linhas = colab.pedidos.map(p => {
          // ── tempo individual da busca ──
          const tempo = p.tempo_resolucao_min !== null
            ? `<span style="color:${p.tempo_resolucao_min<=5?'var(--green)':p.tempo_resolucao_min<=15?'var(--amber)':'var(--red)'};font-weight:700">${p.tempo_resolucao_min===0?'<1min':_horasStr(p.tempo_resolucao_min)}</span>`
            : '<span style="color:var(--text3)">—</span>';
          // ── badge de tentativa ──
          const tentCor = TENTCor[p.numero_tentativa] || 'var(--text3)';
          const tentBadge = p.numero_tentativa
            ? `<span style="background:${tentCor}22;color:${tentCor};border:1px solid ${tentCor}55;font-size:10px;font-weight:700;padding:1px 7px;border-radius:20px;white-space:nowrap">${p.numero_tentativa}</span>`
            : '—';
          // ── resultado ──
          const resCor   = RESCor[p.resultado_tentativa]   || 'var(--text3)';
          const resLabel = RESLabel[p.resultado_tentativa]  || (p.resultado_tentativa || '⏳ Em busca');
          return `<tr>
            <td style="font-weight:700">${p.numero_pedido||'—'}</td>
            <td style="color:var(--text2)">${fmtData(p.data_pedido)||'—'}</td>
            <td style="color:var(--text3);font-size:11px">${p.hora_aviso||'—'}</td>
            <td style="color:var(--text2)">${p.hora_inicio_busca||'—'}</td>
            <td style="color:var(--text2)">${p.hora_fim_busca||'—'}</td>
            <td>${tempo}</td>
            <td style="text-align:center">${tentBadge}</td>
            <td style="color:var(--text2);font-size:11px">${p.codigo||'—'}</td>
            <td style="color:var(--text2);font-size:11px;max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${p.descricao||''}">${p.descricao||'—'}</td>
            <td style="text-align:center">${p.quantidade||0}</td>
            <td><span style="color:${resCor};font-weight:700;font-size:11px">${resLabel}</span></td>
          </tr>`;
        }).join('');
        tabela = `
          <div class="tabela-wrap">
            <table>
              <thead><tr>
                <th>Nº PEDIDO</th><th>DATA</th><th>AVISO</th><th>INÍCIO BUSCA</th><th>FIM BUSCA</th>
                <th>⏱ T. BUSCA</th><th>TENTATIVA</th><th>CÓDIGO</th><th>DESCRIÇÃO</th><th>QTD</th><th>RESULTADO</th>
              </tr></thead>
              <tbody>${linhas}</tbody>
            </table>
          </div>`;
      }

      return `<div style="border-bottom:2px solid var(--border);margin-bottom:0">${header}${tabela}</div>`;
    }).join('');

  } catch(e) { console.error('carregarPerformanceDetalhe:', e); }
}

function exportarPerformanceExcel() {
  try {
    const temDados = (_performanceDados && _performanceDados.length) ||
                     (_performanceDetalheDados && _performanceDetalheDados.length);
    if (!temDados) { toast('Carregue os dados antes de exportar!', 'aviso'); return; }

    const wb = XLSX.utils.book_new();

    // Converte string YYYY-MM-DD em Date real para Excel reconhecer como data
    // (T12:00:00 evita problema de fuso horário UTC que adiantaria 1 dia)
    const mkDate = s => s && /^\d{4}-\d{2}-\d{2}/.test(s) ? new Date(s.slice(0,10) + 'T12:00:00') : (s || '—');

    const mkSheet = (rows) => {
      const ws = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
      // Calcula largura de coluna (Date = 10 chars)
      const cellW = v => v instanceof Date ? 10 : String(v||'').length;
      ws['!cols'] = rows[0].map((_,ci) => ({
        wch: Math.max(...rows.map(r => cellW(r[ci])), String(rows[0][ci]).length) + 2
      }));
      // Aplica formato DD/MM/YYYY em todas as células de data
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      for (let R = range.s.r + 1; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
          const cell = ws[XLSX.utils.encode_cell({r: R, c: C})];
          if (cell && cell.t === 'd') cell.z = 'DD/MM/YYYY';
        }
      }
      return ws;
    };

    /* ── Aba Separação ── */
    const sepRows = [['COLABORADOR','DATA','Nº PEDIDO','INÍCIO','CONCLUSÃO','T. TOTAL','ESPERA REP.','T. REAL','ITENS','PRODUTOS','REPOSIÇÕES']];
    (_performanceDetalheDados || []).filter(c => c.perfil === 'separador').forEach(c => {
      c.pedidos.forEach(p => {
        const ini  = p.iniciado_em  ? (p.iniciado_em.split('T')[1]  || p.iniciado_em.slice(-5))  : '—';
        const fim  = p.concluido_em ? (p.concluido_em.split('T')[1] || p.concluido_em.slice(-5)) : '—';
        const total  = p.tempo_total_min  !== null ? _horasStr(Math.round(p.tempo_total_min))  : '—';
        const espera = p.tempo_espera_min > 0      ? _horasStr(Math.round(p.tempo_espera_min)) : '—';
        const real   = p.tempo_real_min   !== null ? _horasStr(Math.round(p.tempo_real_min))   : '—';
        sepRows.push([c.nome, mkDate(p.data_pedido), p.numero_pedido||'—', ini, fim, total, espera, real,
          p.total_itens||0, p.qtd_produtos||0, p.qtd_reposicoes||0]);
      });
    });
    if (sepRows.length > 1) XLSX.utils.book_append_sheet(wb, mkSheet(sepRows), 'Separação');

    /* ── Aba Checkout ── */
    const ckRows = [['COLABORADOR','DATA','Nº PEDIDO','ENTRADA FILA','ABERTURA','CONFIRMAÇÃO','T. REAL','ITENS','PRODUTOS']];
    (_performanceDetalheDados || []).filter(c => c.perfil === 'checkout').forEach(c => {
      c.pedidos.forEach(p => {
        const tempo = p.tempo_checkout_min !== null ? _horasStr(p.tempo_checkout_min) : '—';
        ckRows.push([c.nome, mkDate(p.data_pedido), p.numero_pedido||'—',
          p.hora_fila||'—', p.hora_abertura||'—', p.hora_confirmacao||'—', tempo,
          p.total_itens||0, p.qtd_produtos||0]);
      });
    });
    if (ckRows.length > 1) XLSX.utils.book_append_sheet(wb, mkSheet(ckRows), 'Checkout');

    /* ── Aba Embalagem ── */
    const embRows = [['COLABORADOR','DATA','Nº PEDIDO','ENTRADA FILA','INÍCIO','FIM','T. REAL','ITENS','PRODUTOS','CLIENTE','TRANSPORTADORA']];
    (_performanceDetalheDados || []).filter(c => c.perfil === 'embalador').forEach(c => {
      c.pedidos.forEach(p => {
        const tempo = p.tempo_embalagem_min !== null ? _horasStr(p.tempo_embalagem_min) : '—';
        embRows.push([c.nome, mkDate(p.data_pedido), p.numero_pedido||'—',
          p.hora_fila||'—', p.embalagem_inicio||'—', p.embalado_em||'—', tempo,
          p.total_itens||0, p.qtd_produtos||0, p.cliente||'—', p.transportadora||'—']);
      });
    });
    if (embRows.length > 1) XLSX.utils.book_append_sheet(wb, mkSheet(embRows), 'Embalagem');

    /* ── Aba Reposição ── */
    const repRows = [['COLABORADOR','DATA','Nº PEDIDO','AVISO','INÍCIO BUSCA','FIM BUSCA','T. BUSCA (min)','TENTATIVA','CÓDIGO','DESCRIÇÃO','QTD','RESULTADO']];
    (_performanceDetalheDados || []).filter(c => c.perfil === 'repositor').forEach(c => {
      c.pedidos.forEach(p => {
        repRows.push([
          c.nome,
          mkDate(p.data_pedido),
          p.numero_pedido          || '—',
          p.hora_aviso             || '—',
          p.hora_inicio_busca      || '—',
          p.hora_fim_busca         || '—',
          p.tempo_resolucao_min !== null ? p.tempo_resolucao_min : '—',
          p.numero_tentativa       || '—',
          p.codigo                 || '—',
          p.descricao              || '—',
          p.quantidade             || 0,
          p.resultado_tentativa === 'encontrado'    ? 'Encontrou'      :
          p.resultado_tentativa === 'nao_encontrado'? 'Não encontrou'  : (p.resultado_tentativa || p.status || '—'),
        ]);
      });
    });
    if (repRows.length > 1) XLSX.utils.book_append_sheet(wb, mkSheet(repRows), 'Reposição');

    /* ── Aba Resumo (cards de performance) ── */
    if (_performanceDados && _performanceDados.length) {
      const AREA_LABEL = { separador:'Separação', checkout:'Checkout', embalador:'Embalagem', repositor:'Reposição' };
      const resRows = [['COLABORADOR','ÁREA','TURNO','TEMPO LOGADO','ATIVIDADES','META PROP.','% ATINGIMENTO','DETALHE']];
      _performanceDados.forEach(r => {
        const tempoStr = r.minutos > 0 ? _horasStr(r.minutos) : '—';
        const pctStr   = r.pct_atingimento !== null ? `${r.pct_atingimento}%` : '—';
        const metaStr  = r.meta_proporcional > 0 ? r.meta_proporcional : '—';
        let detalhe = '';
        if (r.perfil === 'separador' && r.detalhe) {
          const partes = [];
          if (r.detalhe.itens)  partes.push(`${r.detalhe.itens} itens`);
          if (r.detalhe.faltas) partes.push(`${r.detalhe.faltas} avisos rep.`);
          detalhe = partes.join(' | ');
        } else if (r.perfil === 'repositor' && r.detalhe) {
          const partes = [];
          if (r.detalhe.repostos)        partes.push(`${r.detalhe.repostos} resolvidos`);
          if (r.detalhe.nao_encontrados) partes.push(`${r.detalhe.nao_encontrados} não enc.`);
          detalhe = partes.join(' | ');
        }
        resRows.push([r.usuario_nome, AREA_LABEL[r.perfil]||r.perfil, r.turno||'—',
          tempoStr, r.atividades, metaStr, pctStr, detalhe]);
      });
      XLSX.utils.book_append_sheet(wb, mkSheet(resRows), 'Resumo');
    }

    if (wb.SheetNames.length === 0) { toast('Nenhum dado para exportar!', 'aviso'); return; }
    XLSX.writeFile(wb, `performance_${hojeLocal()}.xlsx`);
    toast('Excel exportado!', 'sucesso');
  } catch(e) { console.error('exportarPerformanceExcel:', e); toast('Erro ao exportar!', 'erro'); }
}

let _configMetasData = {};
async function abrirConfigMetas() {
  try {
    const res = await fetch(`${API}/configuracoes`, { credentials:'include' });
    if (!res.ok) return;
    const configs = await res.json();
    _configMetasData = Object.fromEntries(configs.map(c => [c.chave, c]));
    const LABELS = {
      meta_separacao: '📦 Meta Separação (pedidos/turno)',
      meta_checkout:  '✅ Meta Checkout (checkouts/turno)',
      meta_embalagem: '📫 Meta Embalagem (pedidos/turno)',
      meta_reposicao: '🔧 Meta Reposição (itens/turno)',
      horas_turno_manha: '☀️ Horas turno Manhã',
      horas_turno_tarde: '🌤️ Horas turno Tarde',
      horas_turno_noite: '🌙 Horas turno Noite',
    };
    const form = document.getElementById('config-metas-form');
    if (form) {
      form.innerHTML = Object.entries(LABELS).map(([k, label]) => `
        <div style="margin-bottom:10px">
          <label style="font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;display:block;margin-bottom:3px">${label}</label>
          <input type="number" id="cfg-${k}" value="${_configMetasData[k]?.valor || ''}" min="0" step="1"
            style="width:100%;padding:8px 10px;border:1px solid #E2E8F0;border-radius:7px;font-size:14px;font-weight:600;box-sizing:border-box">
        </div>`).join('');
    }
    const modal = document.getElementById('modal-config-metas');
    if (modal) modal.style.display = 'flex';
  } catch(e) { console.warn(e); }
}

function fecharConfigMetas() {
  const modal = document.getElementById('modal-config-metas');
  if (modal) modal.style.display = 'none';
}

async function salvarConfigMetas() {
  const CHAVES = ['meta_separacao','meta_checkout','meta_embalagem','meta_reposicao','horas_turno_manha','horas_turno_tarde','horas_turno_noite'];
  try {
    for (const k of CHAVES) {
      const v = document.getElementById(`cfg-${k}`)?.value;
      if (v !== undefined && v !== '') {
        await fetch(`${API}/configuracoes/${k}`, {
          method:'PUT', credentials:'include', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ valor: v })
        });
      }
    }
    toast('Configurações salvas!','info');
    fecharConfigMetas();
    carregarPerformance();
  } catch(e) { toast('Erro ao salvar','erro'); }
}

/* ─── RELATÓRIO MENSAL DO COLABORADOR ──────────────────────────────── */
async function gerarRelatorioColaborador(nomeColab) {
  const hoje = hojeLocal();
  const anoMes = hoje.substring(0, 7);
  const ini = anoMes + '-01';
  const fim = hoje;
  const [ano, mes] = anoMes.split('-');
  const nomesMes = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  try {
    let url = `${API}/stats/performance/detalhe?ini=${ini}&fim=${fim}&colaborador=${encodeURIComponent(nomeColab)}`;
    const res = await fetch(url, { credentials:'include' });
    if (!res.ok) { toast('Erro ao gerar relatório','erro'); return; }
    const { detalhe } = await res.json();

    const colabData = detalhe && detalhe.length ? detalhe[0] : null;
    const pedidos = colabData ? colabData.pedidos : [];
    const perfil = colabData?.perfil || 'separador';

    if (!pedidos.length) {
      toast('Sem dados no período para gerar relatório','aviso');
      return;
    }

    let html = '';

    // ── SEPARADOR ──
    if (perfil === 'separador') {
      const totalPedidos   = pedidos.length;
      const totalItens     = pedidos.reduce((s,p) => s + (p.total_itens||0), 0);
      const totalProdutos  = pedidos.reduce((s,p) => s + (p.qtd_produtos||0), 0);
      const totalPontuacao = pedidos.reduce((s,p) => s + (p.pontuacao||0), 0);
      const mediaPontuacao = totalPedidos ? Math.round(totalPontuacao / totalPedidos) : 0;
      const totalReps      = pedidos.reduce((s,p) => s + (p.qtd_reposicoes||0), 0);
      const pedidosComRep  = pedidos.filter(p => p.qtd_reposicoes > 0).length;
      const pctRep         = totalPedidos ? Math.round((pedidosComRep / totalPedidos) * 100) : 0;

      const temposReais = pedidos.filter(p => p.tempo_real_min !== null).map(p => parseFloat(p.tempo_real_min));
      const comTempo    = temposReais.length;
      const somaTempos  = temposReais.reduce((a,b) => a+b, 0);
      const mediaTempoReal = comTempo ? (somaTempos / comTempo) : null;
      const tempoMin    = comTempo ? Math.min(...temposReais) : null;
      const tempoMax    = comTempo ? Math.max(...temposReais) : null;
      const totalHorasTrabalhadas = somaTempos / 60;
      const itensHora   = totalHorasTrabalhadas > 0 ? Math.round(totalItens / totalHorasTrabalhadas) : null;

      // Distribuição de tempo
      const rapido = temposReais.filter(t => t < 15).length;
      const normal = temposReais.filter(t => t >= 15 && t <= 30).length;
      const lento  = temposReais.filter(t => t > 30).length;
      const pctR   = comTempo ? Math.round((rapido/comTempo)*100) : 0;
      const pctN   = comTempo ? Math.round((normal/comTempo)*100) : 0;
      const pctL   = comTempo ? Math.round((lento/comTempo)*100) : 0;

      // Dificuldade pela pontuação
      const diffLabel = mediaPontuacao < 30 ? 'Simples' : mediaPontuacao < 60 ? 'Moderado' : 'Complexo';
      const diffColor = mediaPontuacao < 30 ? '#22C55E' : mediaPontuacao < 60 ? '#F59E0B' : '#EF4444';
      const diffBar   = Math.min(100, Math.round((mediaPontuacao / 100) * 100));

      // Análise
      const pontosBons = [], melhorar = [];
      if (mediaTempoReal !== null) {
        if (mediaTempoReal <= 20) pontosBons.push(`Velocidade excelente: média de ${mediaTempoReal.toFixed(1)}min por pedido`);
        else if (mediaTempoReal <= 35) pontosBons.push(`Ritmo dentro do esperado: ${mediaTempoReal.toFixed(1)}min/pedido`);
        else melhorar.push(`Tempo médio elevado: ${mediaTempoReal.toFixed(1)}min/pedido (meta ≤ 35min)`);
      }
      if (pctRep <= 10) pontosBons.push(`Excelente qualidade de conferência: apenas ${pctRep}% dos pedidos geraram reposição`);
      else if (pctRep <= 20) pontosBons.push(`Incidência de reposição razoável: ${pctRep}% (${pedidosComRep} pedidos)`);
      else melhorar.push(`Alta incidência de reposição: ${pctRep}% dos pedidos (${totalReps} avisos) — verificar conferência de itens`);
      if (totalPedidos >= 25) pontosBons.push(`Volume expressivo no período: ${totalPedidos} pedidos / ${totalItens} itens`);
      else if (totalPedidos < 10) melhorar.push(`Volume baixo no período: ${totalPedidos} pedidos`);
      if (itensHora !== null && itensHora >= 30) pontosBons.push(`Alta produtividade: ${itensHora} itens separados por hora`);
      else if (itensHora !== null && itensHora < 15) melhorar.push(`Produtividade abaixo do esperado: ${itensHora} itens/hora`);

      // Tabela de pedidos
      const linhasPed = pedidos.map(p => {
        const ini2  = p.iniciado_em ? p.iniciado_em.replace(/.*T/,'').slice(0,5) : '—';
        const fim2  = p.concluido_em ? p.concluido_em.replace(/.*T/,'').slice(0,5) : '—';
        const tr    = p.tempo_real_min;
        const trStr = tr !== null ? `${Math.round(tr)}min` : '—';
        const trCor = tr === null ? '#94A3B8' : tr <= 15 ? '#22C55E' : tr <= 30 ? '#F59E0B' : '#EF4444';
        const pts   = p.pontuacao || 0;
        const ptsCor= pts < 30 ? '#22C55E' : pts < 60 ? '#F59E0B' : '#EF4444';
        return `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:5px 8px;font-family:monospace;font-size:11px;font-weight:700">${p.numero_pedido}</td>
          <td style="padding:5px 8px;font-size:11px;color:var(--text3)">${fmtData(p.data_pedido)}</td>
          <td style="padding:5px 8px;font-size:11px;text-align:center">${ini2}</td>
          <td style="padding:5px 8px;font-size:11px;text-align:center">${fim2}</td>
          <td style="padding:5px 8px;text-align:center;font-weight:700;color:${trCor}">${trStr}</td>
          <td style="padding:5px 8px;text-align:center;font-size:12px;color:var(--accent)">${p.total_itens||0}</td>
          <td style="padding:5px 8px;text-align:center;font-size:12px;color:var(--text2)">${p.qtd_produtos||0}</td>
          <td style="padding:5px 8px;text-align:center;font-weight:700;color:${ptsCor}">${pts}</td>
          <td style="padding:5px 8px;text-align:center;color:${p.qtd_reposicoes>0?'#F59E0B':'var(--text3)'}">${p.qtd_reposicoes||0}</td>
        </tr>`;
      }).join('');

      html = `<div style="font-family:'DM Sans',sans-serif;max-width:780px;margin:0 auto">

        <!-- HEADER -->
        <div style="background:linear-gradient(135deg,#2563EB,#1D4ED8);color:#fff;border-radius:12px 12px 0 0;padding:20px 24px">
          <div style="font-size:10px;font-weight:700;letter-spacing:2px;opacity:.75">RELATÓRIO DE DESEMPENHO · SEPARAÇÃO</div>
          <div style="font-size:22px;font-weight:900;margin-top:4px">${nomeColab}</div>
          <div style="display:flex;gap:16px;margin-top:6px;font-size:12px;opacity:.85">
            <span>📅 ${nomesMes[parseInt(mes)]} de ${ano}</span>
            <span>📊 ${totalPedidos} pedidos · ${totalItens} itens · ${totalProdutos} prod.</span>
            ${itensHora ? `<span>⚡ ${itensHora} itens/h</span>` : ''}
          </div>
        </div>

        <div style="background:var(--surface);border:1px solid var(--border);border-top:none;border-radius:0 0 12px 12px;padding:20px 24px">

          <!-- CARDS RESUMO -->
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:18px">
            ${[
              ['📦 PEDIDOS', totalPedidos, 'var(--accent)'],
              ['🔢 ITENS TOTAIS', totalItens, 'var(--accent)'],
              ['🏷️ PRODUTOS', totalProdutos, 'var(--text2)'],
              ['⭐ PONTUAÇÃO TOTAL', totalPontuacao, '#8B5CF6'],
              ['⏱ TEMPO MÉDIO', mediaTempoReal ? Math.round(mediaTempoReal)+'min' : '—', mediaTempoReal && mediaTempoReal<=30 ? '#22C55E' : '#F59E0B'],
              ['🔄 REPOSIÇÕES', `${totalReps} (${pctRep}%)`, pctRep<=15 ? '#22C55E' : pctRep<=30 ? '#F59E0B' : '#EF4444'],
            ].map(([l,v,c]) => `<div style="background:var(--surface2);border-radius:10px;padding:12px;text-align:center;border:1px solid var(--border)">
              <div style="font-size:20px;font-weight:900;color:${c}">${v}</div>
              <div style="font-size:9px;color:var(--text3);font-weight:700;letter-spacing:.5px;margin-top:2px">${l}</div>
            </div>`).join('')}
          </div>

          <!-- DIFICULDADE -->
          <div style="background:var(--surface2);border-radius:10px;padding:14px;margin-bottom:14px;border:1px solid var(--border)">
            <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:1px;margin-bottom:10px">📍 DIFICULDADE DOS PEDIDOS (PONTUAÇÃO POR CORREDOR)</div>
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
              <div style="flex:1">
                <div style="height:10px;background:var(--border);border-radius:5px;overflow:hidden">
                  <div style="height:100%;width:${diffBar}%;background:${diffColor};border-radius:5px;transition:.3s"></div>
                </div>
              </div>
              <div style="font-size:16px;font-weight:900;color:${diffColor};min-width:80px">${mediaPontuacao} pts</div>
              <div style="font-size:12px;font-weight:700;color:${diffColor};border:1.5px solid ${diffColor};border-radius:6px;padding:2px 8px">${diffLabel}</div>
            </div>
            <div style="display:flex;gap:16px;font-size:11px;color:var(--text3)">
              <span>Média por pedido: <b style="color:var(--text)">${mediaPontuacao} pts</b></span>
              <span>Total: <b style="color:var(--text)">${totalPontuacao} pts</b></span>
              ${tempoMin!==null?`<span>T.min: <b style="color:#22C55E">${Math.round(tempoMin)}min</b></span><span>T.max: <b style="color:#EF4444">${Math.round(tempoMax)}min</b></span>`:''}
            </div>
            <div style="font-size:10px;color:var(--text3);margin-top:6px">Pontuação considera peso dos corredores (longe do início = mais pontos) e volume de itens.</div>
          </div>

          <!-- DISTRIBUIÇÃO DE TEMPO -->
          ${comTempo > 0 ? `<div style="background:var(--surface2);border-radius:10px;padding:14px;margin-bottom:14px;border:1px solid var(--border)">
            <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:1px;margin-bottom:10px">⏱ DISTRIBUIÇÃO DE VELOCIDADE (${comTempo} pedidos com tempo calculado)</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
              ${[
                ['⚡ RÁPIDO','< 15min', rapido, pctR, '#22C55E'],
                ['✅ NORMAL','15–30min', normal, pctN, '#3B82F6'],
                ['🐢 LENTO','> 30min', lento, pctL, '#EF4444'],
              ].map(([l,r,n,pct,c]) => `<div style="text-align:center;background:var(--surface);border-radius:8px;padding:10px;border:1px solid var(--border)">
                <div style="font-size:18px;font-weight:900;color:${c}">${n}</div>
                <div style="font-size:9px;font-weight:700;color:${c}">${pct}%</div>
                <div style="font-size:10px;color:var(--text3);font-weight:600;margin-top:2px">${l}</div>
                <div style="font-size:9px;color:var(--text3)">${r}</div>
              </div>`).join('')}
            </div>
          </div>` : ''}

          <!-- TABELA DE PEDIDOS -->
          <div style="margin-bottom:14px">
            <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:1px;margin-bottom:8px">📋 DETALHAMENTO POR PEDIDO</div>
            <div style="overflow-x:auto;border-radius:8px;border:1px solid var(--border)">
              <table style="width:100%;border-collapse:collapse;font-size:12px">
                <thead><tr style="background:var(--surface2);font-size:10px;font-weight:700;color:var(--text3)">
                  <th style="padding:7px 8px;text-align:left">PEDIDO</th>
                  <th style="padding:7px 8px">DATA</th>
                  <th style="padding:7px 8px">INÍCIO</th>
                  <th style="padding:7px 8px">FIM</th>
                  <th style="padding:7px 8px">T.REAL</th>
                  <th style="padding:7px 8px">ITENS</th>
                  <th style="padding:7px 8px">PROD.</th>
                  <th style="padding:7px 8px">PONTS.</th>
                  <th style="padding:7px 8px">REPOS.</th>
                </tr></thead>
                <tbody>${linhasPed}</tbody>
              </table>
            </div>
          </div>

          <!-- ANÁLISE -->
          ${pontosBons.length ? `<div style="margin-bottom:10px">
            <div style="font-size:10px;font-weight:800;color:#15803D;letter-spacing:1px;margin-bottom:6px">✅ PONTOS POSITIVOS</div>
            ${pontosBons.map(p=>`<div style="font-size:12px;color:var(--text);padding:6px 10px;background:#F0FDF4;border-radius:6px;margin-bottom:4px;border-left:3px solid #22C55E">• ${p}</div>`).join('')}
          </div>` : ''}
          ${melhorar.length ? `<div>
            <div style="font-size:10px;font-weight:800;color:#B45309;letter-spacing:1px;margin-bottom:6px">⚠️ PONTOS A MELHORAR</div>
            ${melhorar.map(p=>`<div style="font-size:12px;color:var(--text);padding:6px 10px;background:#FFFBEB;border-radius:6px;margin-bottom:4px;border-left:3px solid #F59E0B">• ${p}</div>`).join('')}
          </div>` : ''}

        </div>
      </div>`;

    // ── CHECKOUT ──
    } else if (perfil === 'checkout') {
      const totalCk    = pedidos.length;
      const totalItens = pedidos.reduce((s,p) => s + (p.total_itens||0), 0);
      const tempos     = pedidos.map(p => p.tempo_checkout_min).filter(t => t !== null);
      const comTempo   = tempos.length;
      const mediaCk    = comTempo ? tempos.reduce((a,b)=>a+b,0)/comTempo : null;
      const tempoMin   = comTempo ? Math.min(...tempos) : null;
      const tempoMax   = comTempo ? Math.max(...tempos) : null;
      const somaT      = tempos.reduce((a,b)=>a+b,0);
      const ckHora     = somaT > 0 ? Math.round(totalCk / (somaT/60)) : null;

      const rapido = tempos.filter(t => t <= 3).length;
      const normal = tempos.filter(t => t > 3 && t <= 10).length;
      const lento  = tempos.filter(t => t > 10).length;
      const pctR   = comTempo ? Math.round((rapido/comTempo)*100) : 0;
      const pctN   = comTempo ? Math.round((normal/comTempo)*100) : 0;
      const pctL   = comTempo ? Math.round((lento/comTempo)*100) : 0;

      const pontosBons = [], melhorar = [];
      if (mediaCk !== null) {
        if (mediaCk <= 5) pontosBons.push(`Velocidade excelente: média de ${mediaCk.toFixed(1)}min por checkout`);
        else if (mediaCk <= 10) pontosBons.push(`Ritmo dentro do esperado: ${mediaCk.toFixed(1)}min/checkout`);
        else melhorar.push(`Tempo médio elevado: ${mediaCk.toFixed(1)}min/checkout (meta ≤ 10min)`);
      }
      if (ckHora !== null && ckHora >= 10) pontosBons.push(`Alta produtividade: ${ckHora} checkouts/hora`);
      if (totalCk >= 20) pontosBons.push(`Volume expressivo: ${totalCk} checkouts no período`);
      else if (totalCk < 5) melhorar.push(`Volume baixo no período: ${totalCk} checkouts`);
      if (pctL > 30) melhorar.push(`${pctL}% dos checkouts acima de 10min — revisar processo`);

      const fmtTck = t => t === null ? '—' : t === 0 ? '<1min' : t+'min';
      const linhasCk = pedidos.map(p => {
        const tCol = p.tempo_checkout_min;
        const tClr = tCol === null ? '#94A3B8' : tCol <= 3 ? '#22C55E' : tCol <= 10 ? '#F59E0B' : '#EF4444';
        return `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:5px 8px;font-family:monospace;font-size:11px;font-weight:700">${p.numero_pedido}</td>
          <td style="padding:5px 8px;font-size:11px;color:var(--text3)">${fmtData(p.data_pedido)}</td>
          <td style="padding:5px 8px;text-align:center;font-size:11px;color:var(--text3)">${p.hora_fila||'—'}</td>
          <td style="padding:5px 8px;text-align:center;font-size:11px">${p.hora_abertura||'—'}</td>
          <td style="padding:5px 8px;text-align:center;font-size:11px">${p.hora_confirmacao||'—'}</td>
          <td style="padding:5px 8px;text-align:center;font-weight:700;color:${tClr}">${fmtTck(tCol)}</td>
          <td style="padding:5px 8px;text-align:center;font-size:12px;color:var(--accent)">${p.total_itens||0}</td>
        </tr>`;
      }).join('');

      html = `<div style="font-family:'DM Sans',sans-serif;max-width:780px;margin:0 auto">
        <div style="background:linear-gradient(135deg,#0891b2,#0369a1);color:#fff;border-radius:12px 12px 0 0;padding:20px 24px">
          <div style="font-size:10px;font-weight:700;letter-spacing:2px;opacity:.75">RELATÓRIO DE DESEMPENHO · CHECKOUT</div>
          <div style="font-size:22px;font-weight:900;margin-top:4px">${nomeColab}</div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:6px;font-size:12px;opacity:.85">
            <span>📅 ${nomesMes[parseInt(mes)]} de ${ano}</span>
            <span>✅ ${totalCk} checkouts · ${totalItens} itens</span>
            ${ckHora ? `<span>⚡ ${ckHora} CK/h</span>` : ''}
          </div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-top:none;border-radius:0 0 12px 12px;padding:20px 24px">

          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:18px">
            ${[
              ['✅ CHECKOUTS', totalCk, '#0891b2'],
              ['🔢 ITENS PROCESSADOS', totalItens, 'var(--accent)'],
              ['⏱ TEMPO MÉDIO', mediaCk !== null ? mediaCk.toFixed(1)+'min' : '—', mediaCk !== null && mediaCk <= 10 ? '#22C55E' : '#F59E0B'],
              ['⚡ MAIS RÁPIDO', tempoMin !== null ? fmtTck(tempoMin) : '—', '#22C55E'],
              ['🐢 MAIS LENTO', tempoMax !== null ? fmtTck(tempoMax) : '—', tempoMax > 10 ? '#EF4444' : '#F59E0B'],
              ['🏃 RITMO', ckHora ? ckHora+' CK/h' : '—', '#8B5CF6'],
            ].map(([l,v,c])=>`<div style="background:var(--surface2);border-radius:10px;padding:12px;text-align:center;border:1px solid var(--border)"><div style="font-size:20px;font-weight:900;color:${c}">${v}</div><div style="font-size:9px;color:var(--text3);font-weight:700;letter-spacing:.5px;margin-top:2px">${l}</div></div>`).join('')}
          </div>

          ${comTempo > 0 ? `<div style="background:var(--surface2);border-radius:10px;padding:14px;margin-bottom:14px;border:1px solid var(--border)">
            <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:1px;margin-bottom:10px">⏱ DISTRIBUIÇÃO DE VELOCIDADE (${comTempo} checkouts com tempo)</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
              ${[['⚡ RÁPIDO','≤ 3min',rapido,pctR,'#22C55E'],['✅ NORMAL','3–10min',normal,pctN,'#3B82F6'],['🐢 LENTO','> 10min',lento,pctL,'#EF4444']].map(([l,r,n,p2,c])=>`<div style="text-align:center;background:var(--surface);border-radius:8px;padding:10px;border:1px solid var(--border)"><div style="font-size:18px;font-weight:900;color:${c}">${n}</div><div style="font-size:9px;font-weight:700;color:${c}">${p2}%</div><div style="font-size:10px;color:var(--text3);font-weight:600;margin-top:2px">${l}</div><div style="font-size:9px;color:var(--text3)">${r}</div></div>`).join('')}
            </div>
          </div>` : ''}

          <div style="margin-bottom:14px">
            <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:1px;margin-bottom:8px">📋 DETALHAMENTO POR PEDIDO</div>
            <div style="overflow-x:auto;border-radius:8px;border:1px solid var(--border)">
              <table style="width:100%;border-collapse:collapse;font-size:12px">
                <thead><tr style="background:var(--surface2);font-size:10px;font-weight:700;color:var(--text3)">
                  <th style="padding:7px 8px;text-align:left">PEDIDO</th><th style="padding:7px 8px">DATA</th>
                  <th style="padding:7px 8px">ENTRADA FILA</th><th style="padding:7px 8px">INÍCIO</th>
                  <th style="padding:7px 8px">FIM</th><th style="padding:7px 8px">T. REAL</th><th style="padding:7px 8px">ITENS</th>
                </tr></thead><tbody>${linhasCk}</tbody>
              </table>
            </div>
          </div>

          ${pontosBons.length?`<div style="margin-bottom:10px"><div style="font-size:10px;font-weight:800;color:#15803D;letter-spacing:1px;margin-bottom:6px">✅ PONTOS POSITIVOS</div>${pontosBons.map(p=>`<div style="font-size:12px;color:var(--text);padding:6px 10px;background:#F0FDF4;border-radius:6px;margin-bottom:4px;border-left:3px solid #22C55E">• ${p}</div>`).join('')}</div>`:''}
          ${melhorar.length?`<div><div style="font-size:10px;font-weight:800;color:#B45309;letter-spacing:1px;margin-bottom:6px">⚠️ PONTOS A MELHORAR</div>${melhorar.map(p=>`<div style="font-size:12px;color:var(--text);padding:6px 10px;background:#FFFBEB;border-radius:6px;margin-bottom:4px;border-left:3px solid #F59E0B">• ${p}</div>`).join('')}</div>`:''}
        </div>
      </div>`;

    // ── EMBALAGEM ──
    } else if (perfil === 'embalador') {
      const totalEmb   = pedidos.length;
      const totalItens = pedidos.reduce((s,p) => s + (p.total_itens||0), 0);
      const tempos     = pedidos.map(p => p.tempo_embalagem_min).filter(t => t !== null && t > 0);
      const comTempo   = tempos.length;
      const mediaEmb   = comTempo ? tempos.reduce((a,b)=>a+b,0)/comTempo : null;
      const tempoMin   = comTempo ? Math.min(...tempos) : null;
      const tempoMax   = comTempo ? Math.max(...tempos) : null;
      const somaTE     = tempos.reduce((a,b)=>a+b,0);
      const embHora    = somaTE > 0 ? Math.round(totalEmb / (somaTE/60)) : null;

      const trMap = {};
      pedidos.forEach(p => { const t = p.transportadora||'Outros'; trMap[t]=(trMap[t]||0)+1; });
      const topTransp = Object.entries(trMap).sort((a,b)=>b[1]-a[1]).slice(0,4);

      const rapido = tempos.filter(t => t <= 5).length;
      const normal = tempos.filter(t => t > 5 && t <= 15).length;
      const lento  = tempos.filter(t => t > 15).length;
      const pctR   = comTempo ? Math.round((rapido/comTempo)*100) : 0;
      const pctN   = comTempo ? Math.round((normal/comTempo)*100) : 0;
      const pctL   = comTempo ? Math.round((lento/comTempo)*100) : 0;

      const pontosBons = [], melhorar = [];
      if (mediaEmb !== null) {
        if (mediaEmb <= 8) pontosBons.push(`Velocidade excelente: média de ${mediaEmb.toFixed(1)}min por embalagem`);
        else if (mediaEmb <= 15) pontosBons.push(`Ritmo dentro do esperado: ${mediaEmb.toFixed(1)}min/embalagem`);
        else melhorar.push(`Tempo médio elevado: ${mediaEmb.toFixed(1)}min/embalagem (meta ≤ 15min)`);
      }
      if (embHora !== null && embHora >= 8) pontosBons.push(`Alta produtividade: ${embHora} embalagens/hora`);
      if (totalEmb >= 20) pontosBons.push(`Volume expressivo: ${totalEmb} embalagens no período`);
      else if (totalEmb < 5) melhorar.push(`Volume baixo no período: ${totalEmb} embalagens`);
      if (pctL > 30) melhorar.push(`${pctL}% das embalagens acima de 15min — revisar processo`);

      const fmtTe = t => t === null ? '—' : t === 0 ? '<1min' : t+'min';
      const linhasEmb = pedidos.map(p => {
        const tCol = p.tempo_embalagem_min;
        const tClr = tCol === null ? '#94A3B8' : tCol <= 5 ? '#22C55E' : tCol <= 15 ? '#F59E0B' : '#EF4444';
        return `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:5px 8px;font-family:monospace;font-size:11px;font-weight:700">${p.numero_pedido}</td>
          <td style="padding:5px 8px;font-size:11px;color:var(--text3)">${fmtData(p.data_pedido)}</td>
          <td style="padding:5px 8px;text-align:center;font-size:11px;color:var(--text3)">${p.hora_fila||'—'}</td>
          <td style="padding:5px 8px;text-align:center;font-size:11px">${p.embalagem_inicio||'—'}</td>
          <td style="padding:5px 8px;text-align:center;font-size:11px">${p.embalado_em||'—'}</td>
          <td style="padding:5px 8px;text-align:center;font-weight:700;color:${tClr}">${fmtTe(tCol)}</td>
          <td style="padding:5px 8px;text-align:center;font-size:12px;color:var(--accent)">${p.total_itens||0}</td>
          <td style="padding:5px 8px;font-size:10px;color:var(--text3);max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${p.transportadora||''}">${p.transportadora||'—'}</td>
        </tr>`;
      }).join('');

      html = `<div style="font-family:'DM Sans',sans-serif;max-width:780px;margin:0 auto">
        <div style="background:linear-gradient(135deg,#a855f7,#6d28d9);color:#fff;border-radius:12px 12px 0 0;padding:20px 24px">
          <div style="font-size:10px;font-weight:700;letter-spacing:2px;opacity:.75">RELATÓRIO DE DESEMPENHO · EMBALAGEM</div>
          <div style="font-size:22px;font-weight:900;margin-top:4px">${nomeColab}</div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:6px;font-size:12px;opacity:.85">
            <span>📅 ${nomesMes[parseInt(mes)]} de ${ano}</span>
            <span>📫 ${totalEmb} embalagens · ${totalItens} itens</span>
            ${embHora ? `<span>⚡ ${embHora} emb/h</span>` : ''}
          </div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-top:none;border-radius:0 0 12px 12px;padding:20px 24px">

          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:18px">
            ${[
              ['📫 EMBALADOS', totalEmb, '#7c3aed'],
              ['🔢 ITENS', totalItens, 'var(--accent)'],
              ['⏱ TEMPO MÉDIO', mediaEmb !== null ? mediaEmb.toFixed(1)+'min' : '—', mediaEmb !== null && mediaEmb <= 15 ? '#22C55E' : '#F59E0B'],
              ['⚡ MAIS RÁPIDO', tempoMin !== null ? fmtTe(tempoMin) : '—', '#22C55E'],
              ['🐢 MAIS LENTO', tempoMax !== null ? fmtTe(tempoMax) : '—', tempoMax > 15 ? '#EF4444' : '#F59E0B'],
              ['🏃 RITMO', embHora ? embHora+' emb/h' : '—', '#8B5CF6'],
            ].map(([l,v,c])=>`<div style="background:var(--surface2);border-radius:10px;padding:12px;text-align:center;border:1px solid var(--border)"><div style="font-size:20px;font-weight:900;color:${c}">${v}</div><div style="font-size:9px;color:var(--text3);font-weight:700;letter-spacing:.5px;margin-top:2px">${l}</div></div>`).join('')}
          </div>

          ${comTempo > 0 ? `<div style="background:var(--surface2);border-radius:10px;padding:14px;margin-bottom:14px;border:1px solid var(--border)">
            <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:1px;margin-bottom:10px">⏱ DISTRIBUIÇÃO DE VELOCIDADE (${comTempo} embalagens com tempo)</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
              ${[['⚡ RÁPIDO','≤ 5min',rapido,pctR,'#22C55E'],['✅ NORMAL','5–15min',normal,pctN,'#3B82F6'],['🐢 LENTO','> 15min',lento,pctL,'#EF4444']].map(([l,r,n,p2,c])=>`<div style="text-align:center;background:var(--surface);border-radius:8px;padding:10px;border:1px solid var(--border)"><div style="font-size:18px;font-weight:900;color:${c}">${n}</div><div style="font-size:9px;font-weight:700;color:${c}">${p2}%</div><div style="font-size:10px;color:var(--text3);font-weight:600;margin-top:2px">${l}</div><div style="font-size:9px;color:var(--text3)">${r}</div></div>`).join('')}
            </div>
          </div>` : ''}

          ${topTransp.length ? `<div style="background:var(--surface2);border-radius:10px;padding:14px;margin-bottom:14px;border:1px solid var(--border)">
            <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:1px;margin-bottom:8px">🚚 TOP TRANSPORTADORAS</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              ${topTransp.map(([t,n])=>`<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 14px;text-align:center"><div style="font-size:16px;font-weight:900;color:var(--accent)">${n}</div><div style="font-size:9px;color:var(--text3);font-weight:700;margin-top:1px">${t}</div></div>`).join('')}
            </div>
          </div>` : ''}

          <div style="margin-bottom:14px">
            <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:1px;margin-bottom:8px">📋 DETALHAMENTO POR PEDIDO</div>
            <div style="overflow-x:auto;border-radius:8px;border:1px solid var(--border)">
              <table style="width:100%;border-collapse:collapse;font-size:12px">
                <thead><tr style="background:var(--surface2);font-size:10px;font-weight:700;color:var(--text3)">
                  <th style="padding:7px 8px;text-align:left">PEDIDO</th><th style="padding:7px 8px">DATA</th>
                  <th style="padding:7px 8px">FILA (CK)</th><th style="padding:7px 8px">INÍCIO EMB.</th>
                  <th style="padding:7px 8px">FIM</th><th style="padding:7px 8px">TEMPO</th>
                  <th style="padding:7px 8px">ITENS</th><th style="padding:7px 8px">TRANSP.</th>
                </tr></thead><tbody>${linhasEmb}</tbody>
              </table>
            </div>
          </div>

          ${pontosBons.length?`<div style="margin-bottom:10px"><div style="font-size:10px;font-weight:800;color:#15803D;letter-spacing:1px;margin-bottom:6px">✅ PONTOS POSITIVOS</div>${pontosBons.map(p=>`<div style="font-size:12px;color:var(--text);padding:6px 10px;background:#F0FDF4;border-radius:6px;margin-bottom:4px;border-left:3px solid #22C55E">• ${p}</div>`).join('')}</div>`:''}
          ${melhorar.length?`<div><div style="font-size:10px;font-weight:800;color:#B45309;letter-spacing:1px;margin-bottom:6px">⚠️ PONTOS A MELHORAR</div>${melhorar.map(p=>`<div style="font-size:12px;color:var(--text);padding:6px 10px;background:#FFFBEB;border-radius:6px;margin-bottom:4px;border-left:3px solid #F59E0B">• ${p}</div>`).join('')}</div>`:''}
        </div>
      </div>`;

    // ── REPOSITOR ──
    } else if (perfil === 'repositor') {
      const totalAv  = pedidos.length;
      const repostos = pedidos.filter(p => p.resultado_tentativa === 'encontrado').length;
      const naoEnc   = pedidos.filter(p => p.resultado_tentativa === 'nao_encontrado').length;
      const tempos   = pedidos.map(p => p.tempo_resolucao_min).filter(t => t !== null && t > 0);
      const comTempo = tempos.length;
      const mediaRep = comTempo ? tempos.reduce((a,b)=>a+b,0)/comTempo : null;
      const taxa     = totalAv > 0 ? Math.round((repostos/totalAv)*100) : null;
      const taxaClr  = taxa === null ? '#94A3B8' : taxa >= 80 ? '#22C55E' : taxa >= 60 ? '#F59E0B' : '#EF4444';
      const diasMap  = {};
      pedidos.forEach(p => { diasMap[p.data_pedido]=(diasMap[p.data_pedido]||0)+1; });

      const pontosBons = [], melhorar = [];
      if (taxa !== null) {
        if (taxa >= 85) pontosBons.push(`Excelente taxa de resolução: ${taxa}% dos avisos resolvidos`);
        else if (taxa >= 70) pontosBons.push(`Boa taxa de resolução: ${taxa}%`);
        else melhorar.push(`Taxa de resolução baixa: ${taxa}% (meta ≥ 85%) — ${naoEnc} não encontrados`);
      }
      if (mediaRep !== null && mediaRep <= 15) pontosBons.push(`Bom tempo de resposta: média de ${mediaRep.toFixed(1)}min por aviso`);
      else if (mediaRep !== null && mediaRep > 25) melhorar.push(`Tempo médio alto: ${mediaRep.toFixed(1)}min (meta ≤ 20min)`);
      if (totalAv >= 30) pontosBons.push(`Alto volume de avisos atendidos: ${totalAv} no período`);

      const linhasRep = pedidos.map(p => {
        const tCol = p.tempo_resolucao_min;
        const tClr = tCol === null ? '#94A3B8' : tCol <= 10 ? '#22C55E' : tCol <= 25 ? '#F59E0B' : '#EF4444';
        const resClr = p.resultado_tentativa === 'encontrado' ? '#22C55E' : '#EF4444';
        const resLbl = p.resultado_tentativa === 'encontrado' ? '✅' : '❌';
        return `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:5px 8px;font-family:monospace;font-size:11px;font-weight:700">${p.numero_pedido}</td>
          <td style="padding:5px 8px;font-size:11px;color:var(--text3)">${fmtData(p.data_pedido)}</td>
          <td style="padding:5px 8px;text-align:center;font-size:11px;color:var(--text3)">${p.hora_aviso||'—'}</td>
          <td style="padding:5px 8px;text-align:center;font-size:10px">${p.numero_tentativa||'—'}</td>
          <td style="padding:5px 8px;text-align:center;font-size:12px;font-weight:700;color:${resClr}">${resLbl}</td>
          <td style="padding:5px 8px;font-family:monospace;font-size:10px;color:#EF4444">${p.codigo||'—'}</td>
          <td style="padding:5px 8px;font-size:10px;color:var(--text);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${p.descricao||''}">${p.descricao||'—'}</td>
          <td style="padding:5px 8px;text-align:center">${p.quantidade||0}</td>
          <td style="padding:5px 8px;text-align:center;font-weight:700;color:${tClr}">${tCol !== null ? tCol+'min' : '—'}</td>
        </tr>`;
      }).join('');

      html = `<div style="font-family:'DM Sans',sans-serif;max-width:820px;margin:0 auto">
        <div style="background:linear-gradient(135deg,#f59e0b,#b45309);color:#fff;border-radius:12px 12px 0 0;padding:20px 24px">
          <div style="font-size:10px;font-weight:700;letter-spacing:2px;opacity:.75">RELATÓRIO DE DESEMPENHO · REPOSIÇÃO</div>
          <div style="font-size:22px;font-weight:900;margin-top:4px">${nomeColab}</div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:6px;font-size:12px;opacity:.85">
            <span>📅 ${nomesMes[parseInt(mes)]} de ${ano}</span>
            <span>🔧 ${totalAv} avisos · ${repostos} repostos · ${naoEnc} não enc.</span>
            ${taxa !== null ? `<span>✅ ${taxa}% resolvidos</span>` : ''}
          </div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-top:none;border-radius:0 0 12px 12px;padding:20px 24px">

          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:18px">
            ${[
              ['🔔 TOTAL AVISOS', totalAv, '#d97706'],
              ['✅ REPOSTOS', repostos, '#22C55E'],
              ['❌ NÃO ENCONTR.', naoEnc, '#EF4444'],
              ['📊 TAXA RESOLUÇÃO', taxa !== null ? taxa+'%' : '—', taxaClr],
              ['⏱ TEMPO MÉDIO', mediaRep !== null ? mediaRep.toFixed(1)+'min' : '—', mediaRep !== null && mediaRep <= 20 ? '#22C55E' : '#F59E0B'],
              ['📅 DIAS ATIVOS', Object.keys(diasMap).length, 'var(--accent)'],
            ].map(([l,v,c])=>`<div style="background:var(--surface2);border-radius:10px;padding:12px;text-align:center;border:1px solid var(--border)"><div style="font-size:20px;font-weight:900;color:${c}">${v}</div><div style="font-size:9px;color:var(--text3);font-weight:700;letter-spacing:.5px;margin-top:2px">${l}</div></div>`).join('')}
          </div>

          ${taxa !== null ? `<div style="background:var(--surface2);border-radius:10px;padding:14px;margin-bottom:14px;border:1px solid var(--border)">
            <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:1px;margin-bottom:8px">📊 TAXA DE RESOLUÇÃO</div>
            <div style="display:flex;align-items:center;gap:12px">
              <div style="flex:1;height:12px;background:var(--border);border-radius:6px;overflow:hidden">
                <div style="height:100%;width:${taxa}%;background:${taxaClr};border-radius:6px"></div>
              </div>
              <div style="font-size:18px;font-weight:900;color:${taxaClr};min-width:50px">${taxa}%</div>
            </div>
            <div style="display:flex;gap:16px;font-size:11px;color:var(--text3);margin-top:8px">
              <span>Repostos: <b style="color:#22C55E">${repostos}</b></span>
              <span>Não encontrados: <b style="color:#EF4444">${naoEnc}</b></span>
              <span>Total: <b>${totalAv}</b></span>
            </div>
          </div>` : ''}

          <div style="margin-bottom:14px">
            <div style="font-size:10px;font-weight:800;color:var(--text3);letter-spacing:1px;margin-bottom:8px">📋 DETALHAMENTO POR AVISO</div>
            <div style="overflow-x:auto;border-radius:8px;border:1px solid var(--border)">
              <table style="width:100%;border-collapse:collapse;font-size:12px">
                <thead><tr style="background:var(--surface2);font-size:10px;font-weight:700;color:var(--text3)">
                  <th style="padding:7px 8px;text-align:left">PEDIDO</th><th style="padding:7px 8px">DATA</th>
                  <th style="padding:7px 8px">AVISO</th><th style="padding:7px 8px">TENT.</th><th style="padding:7px 8px">RESULT.</th>
                  <th style="padding:7px 8px;text-align:left">CÓDIGO</th><th style="padding:7px 8px;text-align:left">DESCRIÇÃO</th>
                  <th style="padding:7px 8px">QTD</th><th style="padding:7px 8px">TEMPO</th>
                </tr></thead><tbody>${linhasRep}</tbody>
              </table>
            </div>
          </div>

          ${pontosBons.length?`<div style="margin-bottom:10px"><div style="font-size:10px;font-weight:800;color:#15803D;letter-spacing:1px;margin-bottom:6px">✅ PONTOS POSITIVOS</div>${pontosBons.map(p=>`<div style="font-size:12px;color:var(--text);padding:6px 10px;background:#F0FDF4;border-radius:6px;margin-bottom:4px;border-left:3px solid #22C55E">• ${p}</div>`).join('')}</div>`:''}
          ${melhorar.length?`<div><div style="font-size:10px;font-weight:800;color:#B45309;letter-spacing:1px;margin-bottom:6px">⚠️ PONTOS A MELHORAR</div>${melhorar.map(p=>`<div style="font-size:12px;color:var(--text);padding:6px 10px;background:#FFFBEB;border-radius:6px;margin-bottom:4px;border-left:3px solid #F59E0B">• ${p}</div>`).join('')}</div>`:''}
        </div>
      </div>`;

    // ── FALLBACK ──
    } else {
      const total = pedidos.length;
      html = `<div style="text-align:center;padding:32px;color:var(--text3);font-size:13px">${total} registro(s) no período.</div>`;
    }

    // Exibe em modal
    let modal = document.getElementById('modal-relatorio-colab');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-relatorio-colab';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
      modal.innerHTML = `
        <div style="background:var(--bg);border-radius:14px;width:100%;max-width:820px;max-height:92vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg);z-index:1">
            <span style="font-size:13px;font-weight:700;color:var(--text)">📄 Relatório do Mês — ${nomeColab}</span>
            <button onclick="document.getElementById('modal-relatorio-colab').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text3)">✕</button>
          </div>
          <div id="relatorio-colab-body" style="padding:16px"></div>
        </div>`;
      document.body.appendChild(modal);
    }
    document.getElementById('relatorio-colab-body').innerHTML = html;
    modal.style.display = 'flex';

  } catch(e) { console.error(e); toast('Erro ao gerar relatório','erro'); }
}

async function carregarAvisos() {
  try {
    // Carrega duplicatas do dia
    const resDup = await fetch(`${API}/repositor/duplicatas-dia`, { credentials:'include' });
    const dups   = resDup.ok ? await resDup.json() : [];
    const dupMap = {};
    dups.forEach(d => { dupMap[d.codigo] = d; });




    const filtroEl = document.getElementById('filtro-rep-status');
    const status   = filtroEl ? filtroEl.value : '';
    let url = `${API}/repositor/avisos`;
    const params = [];
    if (status) params.push(`status=${status}`);
    // Repositor vê apenas seus próprios avisos no desktop
    if (usuarioAtual?.perfil === 'repositor') params.push(`repositor_nome=${encodeURIComponent(usuarioAtual.nome)}`);
    if (params.length) url += '?' + params.join('&');
    const r      = await fetch(url, { credentials:'include' });
    if (!r.ok) return;
    const avisos = await r.json();
    const pend   = avisos.filter(a=>a.status==='pendente').length;
    const enc    = avisos.filter(a=>['encontrado','reposto','subiu','abastecido'].includes(a.status)).length;
    const elPend = document.getElementById('rep-pend');
    const elRep  = document.getElementById('rep-rep');
    if (elPend) elPend.textContent = pend;
    if (elRep)  elRep.textContent  = enc;
    const badge = document.getElementById('menu-badge-rep');
    if (badge) { badge.textContent=pend; badge.style.display=pend>0?'inline':'none'; }
    const lista = document.getElementById('lista-avisos');
    if (!lista) return;




    let html = '';
    // Banner de duplicatas do dia
    if (dups.length > 0) {
      html += `<div style="margin-bottom:12px">${dups.map(d=>`
        <div class="aviso-duplicata">
          <span style="font-size:20px">⚠️</span>
          <div>
            <div style="font-size:13px;font-weight:800">ATENÇÃO — Item duplicado hoje: <b>${d.codigo}</b> — ${d.descricao||''}</div>
            <div style="font-size:12px;font-weight:400;margin-top:2px">Já solicitado hoje para os pedidos: <b>${d.pedidos}</b></div>
          </div>
        </div>`).join('')}</div>`;
    }




    if (!avisos.length) {
      html += '<div style="color:var(--text3);text-align:center;padding:36px;font-size:14px">✅ Nenhum item encontrado</div>';
      lista.innerHTML = html;
      return;
    }




    html += avisos.map(a => {
      const isPend  = a.status==='pendente';
      const isEnc   = a.status==='encontrado'||a.status==='reposto';
      const isSubiu = a.status==='subiu';
      const isAbast = a.status==='abastecido';
      const isNE    = a.status==='nao_encontrado';
      const isProto = a.status==='protocolo';
      const icon    = isEnc?'✅':isSubiu?'⬆️':isAbast?'📦':isNE?'🚫':isProto?'📋':'🔴';
      const dupAlerta = dupMap[a.codigo] && isPend
        ? `<div style="font-size:11px;color:#92400E;font-weight:700;background:#FEF3C7;border:1px solid #F59E0B;border-radius:6px;padding:5px 8px;margin-top:5px">⚠️ Já solicitado hoje para: <b>${dupMap[a.codigo].pedidos}</b></div>` : '';
      return `
      <div class="aviso-card ${a.status}">
        <div style="font-size:26px;flex-shrink:0">${icon}</div>
        <div class="aviso-info">
          <div class="aviso-cod">${a.codigo||'—'} <span style="font-size:11px;font-weight:500;color:var(--text3);margin-left:6px">Pedido #${a.numero_pedido}</span></div>
          <div class="aviso-desc">${a.descricao||'—'}</div>
          <div class="aviso-det">📍 ${a.endereco||'—'} &nbsp;•&nbsp; Qtde: <b>${a.quantidade||'—'}</b></div>
          ${dupAlerta}
          ${isEnc   ? `<div style="font-size:12px;color:var(--green);margin-top:4px;font-weight:700">✅ Encontrado às ${a.hora_reposto||'—'}${a.qtd_encontrada>0?' — '+a.qtd_encontrada+' un.':''}</div>` : ''}
          ${isSubiu ? `<div style="font-size:12px;color:#0D9488;margin-top:4px;font-weight:700">⬆️ Subiu às ${a.hora_reposto||'—'}${a.qtd_encontrada>0?' — '+a.qtd_encontrada+' un.':''}</div>` : ''}
          ${isAbast ? `<div style="font-size:12px;color:var(--accent);margin-top:4px;font-weight:700">📦 Abastecido às ${a.hora_reposto||'—'}${a.qtd_encontrada>0?' — '+a.qtd_encontrada+' un.':''}</div>` : ''}
          ${isNE    ? `<div style="font-size:12px;color:var(--indigo);margin-top:4px;font-weight:700">🚫 Não encontrado às ${a.hora_reposto||'—'}</div>` : ''}
          ${isProto ? `<div style="font-size:12px;color:var(--amber);margin-top:4px;font-weight:700">📋 Protocolo às ${a.hora_reposto||'—'}</div>` : ''}
          ${isPend  ? `<div style="font-size:12px;color:var(--red);margin-top:4px;font-weight:700">⏱ Aviso às ${a.hora_aviso||'—'} &nbsp;•&nbsp; Sep: ${a.separador_nome||'—'}</div>` : ''}
          ${a.obs   ? `<div style="font-size:11px;color:var(--text2);margin-top:3px">📝 ${a.obs}</div>` : ''}
          ${isPend  ? `
            <div class="qtd-enc-wrap">
              <label>Qtde encontrada:</label>
              <input type="number" class="qtd-enc-input" id="qtd-enc-${a.id}" min="0" max="${a.quantidade||99}" placeholder="0" inputmode="numeric"/>
              <span style="font-size:11px;color:var(--text3)">de ${a.quantidade||'?'}</span>
            </div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:7px;align-items:flex-end;flex-shrink:0">
          ${isPend ? `
            <button class="btn btn-success btn-sm" style="min-width:110px" onclick="marcarAviso(${a.id},${a.quantidade||0},'encontrado')">✅ Encontrado</button>
            <button class="btn btn-sm" style="background:#0D9488;color:#fff;min-width:110px" onclick="marcarAviso(${a.id},${a.quantidade||0},'subiu')">⬆️ Subiu</button>
            <button class="btn btn-sm" style="background:var(--accent);color:#fff;min-width:110px" onclick="marcarAviso(${a.id},${a.quantidade||0},'abastecido')">📦 Abastecido</button>
            <button class="btn btn-sm" style="background:var(--indigo);color:#fff;min-width:110px" onclick="marcarAviso(${a.id},0,'nao_encontrado')">🚫 Não encontrei</button>
            <button class="btn btn-sm" style="background:var(--amber);color:#fff;min-width:110px" onclick="marcarAviso(${a.id},0,'protocolo')">📋 Protocolo</button>
          ` : `<span class="pill ${isEnc?'reposto':isSubiu?'ciano':isAbast?'separador':isProto?'protocolo':isNE?'inativo':'pendente'}">${isEnc?'Encontrado':isSubiu?'Subiu':isAbast?'Abastecido':isProto?'Protocolo':'Não encontrado'}</span>`}
        </div>
      </div>`;
    }).join('');
    lista.innerHTML = html;
  } catch(e) {
    const lista = document.getElementById('lista-avisos');
    if (lista) lista.innerHTML = '<div style="color:var(--red);text-align:center;padding:20px">Erro ao carregar</div>';
  }
}




async function marcarAviso(id, qtdTotal, acao) {
  const doAcao = async () => {
    const input  = document.getElementById(`qtd-enc-${id}`);
    const qtdEnc = (acao==='nao_encontrado'||acao==='protocolo') ? 0 : (parseInt(input?.value) || qtdTotal || 0);
    const nome   = usuarioAtual?.nome || '';
    try {
      const res = await fetch(`${API}/repositor/avisos/${id}/${acao}`, {
        credentials:'include', method:'PUT',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ qtd_encontrada: qtdEnc, repositor_nome: nome })
      });
      const data = await res.json();
      if (data.erro) { toast(data.erro,'erro'); return; }
      const msgs = { encontrado:'✅ Encontrado!', subiu:'⬆️ Subiu!', abastecido:'📦 Abastecido!', nao_encontrado:'🚫 Não encontrado!', protocolo:'📋 Protocolo!' };
      const tipos = { encontrado:'sucesso', subiu:'sucesso', abastecido:'sucesso', nao_encontrado:'aviso', protocolo:'aviso' };
      toast(msgs[acao]||'OK', tipos[acao]||'info');
      carregarAvisos();
    } catch(e) { toast('Erro!','erro'); }
  };
  if (acao==='nao_encontrado'||acao==='protocolo') {
    wmsConfirm(`Confirmar: ${acao==='nao_encontrado'?'Não encontrado':'Protocolo'}? O supervisor será notificado.`, doAcao);
  } else {
    await doAcao();
  }
}
// Compatibilidade
async function marcarReposto(id,q){ await marcarAviso(id,q,'encontrado'); }
async function marcarNaoEncontrado(id){ await marcarAviso(id,0,'nao_encontrado'); }
async function marcarProtocolo(id){ await marcarAviso(id,0,'protocolo'); }




/* ESTATÍSTICAS */
async function carregarEstatisticas() {
  try {
    const ini = document.getElementById('est-ini')?.value || '';
    const fim = document.getElementById('est-fim')?.value || '';
    let url = `${API}/estatisticas/pedidos`;
    if (ini && fim) url += `?data_ini=${ini}&data_fim=${fim}`;
    const res  = await fetch(url, { credentials:'include' });
    const data = await res.json();




    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? 0; };
    set('est-hoje-c', data.concluidos_hoje);
    set('est-hoje-t', data.total_hoje);
    set('est-mes-c',  data.concluidos_mes);
    set('est-mes-t',  data.total_mes);
    set('est-ano-c',  data.concluidos_ano);
    set('est-ano-t',  data.total_ano);




    const periodoWrap = document.getElementById('est-periodo-wrap');
    if (ini && fim && periodoWrap) {
      periodoWrap.style.display = 'block';
      set('est-per-c', data.concluidos_periodo);
      set('est-per-t', data.total_periodo);
    } else if (periodoWrap) {
      periodoWrap.style.display = 'none';
    }




    // Produtividade por separador
    const res2   = await fetch(`${API}/produtividade`, { credentials:'include' });
    const prods  = await res2.json();
    const tbody  = document.getElementById('tbody-est-sep');
    if (tbody) {
      if (!prods.length) { tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text3);text-align:center;padding:20px">Nenhum separador</td></tr>'; }
      else tbody.innerHTML = prods.map(d => `<tr>
        <td style="font-weight:600;color:var(--text)">${d.nome}</td>
        <td style="color:var(--green);font-weight:700">${d.hoje||0}</td>
        <td style="color:var(--amber)">${d.mes||0}</td>
        <td style="color:var(--accent)">${d.total_ano||0}</td>
        <td><span class="pill ${d.status}">${d.status}</span></td>
      </tr>`).join('');
    }
  } catch(e) { toast('Erro ao carregar estatísticas!','erro'); }
}

async function exportarDashboardExcel() {
  try {
    const ini = document.getElementById('filtro-data-ini')?.value || hoje;
    const fim = document.getElementById('filtro-data-fim')?.value || hoje;
    const res = await fetch(`${API}/pedidos?data_ini=${ini}&data_fim=${fim}`, { credentials:'include' });
    const pedidos = await res.json();
    const wb = XLSX.utils.book_new();
    const rows = [['Nr Pedido','Cliente','Transportadora','Separador','Status','Itens','Data']];
    pedidos.forEach(p => rows.push([p.numero_pedido,p.cliente||'',p.transportadora||'',p.separador_nome||'',p.status,p.itens||0,fmtData(p.data_pedido)||'']));
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{wch:12},{wch:25},{wch:15},{wch:25},{wch:12},{wch:8},{wch:12}];
    XLSX.utils.book_append_sheet(wb, ws, 'Pedidos');
    XLSX.writeFile(wb, `dashboard_${ini}_${fim}.xlsx`);
    toast('Excel exportado!','sucesso');
  } catch(e) { toast('Erro ao exportar!','erro'); }
}

async function carregarColaboradores() {
  try {
    const res = await fetch(`${API}/stats/colaboradores`, { credentials:'include' });
    if (!res.ok) return;
    const d = await res.json();

    // Separadores
    const tbSep = document.getElementById('tbody-colab-sep');
    if (tbSep) {
      tbSep.innerHTML = d.separadores.length ? d.separadores.map(s =>
        `<tr>
          <td style="padding:10px 12px;font-weight:600">${s.nome}</td>
          <td style="padding:10px 12px;color:var(--text2);font-size:12px">${s.turno||'—'}</td>
          <td style="padding:10px 12px;text-align:center;font-size:18px;font-weight:700;color:var(--accent)">${s.sep_hoje}</td>
          <td style="padding:10px 12px;text-align:center;font-size:13px;color:var(--text3)">${s.sep_total}</td>
        </tr>`
      ).join('') : '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text3)">Nenhum separador ativo</td></tr>';
    }

    // Repositores
    const tbRep = document.getElementById('tbody-colab-rep');
    if (tbRep) {
      tbRep.innerHTML = d.repositores.length ? d.repositores.map(r =>
        `<tr>
          <td style="padding:10px 12px;font-weight:600">${r.nome}</td>
          <td style="padding:10px 12px;color:var(--text2);font-size:12px">${r.turno||'—'}</td>
          <td style="padding:10px 12px;text-align:center;font-size:18px;font-weight:700;color:#10b981">${r.rep_resolvidas_hoje}</td>
          <td style="padding:10px 12px;text-align:center;font-size:18px;font-weight:700;color:#ef4444">${r.rep_nao_encontrados_hoje}</td>
          <td style="padding:10px 12px;text-align:center;font-size:13px;color:var(--text3)">${r.rep_hoje}</td>
        </tr>`
      ).join('') : '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text3)">Nenhum repositor ativo</td></tr>';
    }

    // Checkout
    const tbCk = document.getElementById('tbody-colab-ck');
    if (tbCk) {
      tbCk.innerHTML = d.checkouts.length ? d.checkouts.map(c =>
        `<tr>
          <td style="padding:10px 12px;font-weight:600">${c.nome}</td>
          <td style="padding:10px 12px;color:var(--text2);font-size:12px">${c.turno||'—'}</td>
          <td style="padding:10px 12px;text-align:center;font-size:18px;font-weight:700;color:#8b5cf6">${c.ck_hoje}</td>
          <td style="padding:10px 12px;text-align:center;font-size:13px;color:var(--text3)">${c.ck_total_hoje}</td>
          <td style="padding:10px 12px;text-align:center;font-size:13px;color:var(--text3)">—</td>
        </tr>`
      ).join('') : '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text3)">Nenhum operador de checkout</td></tr>';
    }

    // Atualiza timestamp
    const ts = document.getElementById('colab-atualizado');
    if (ts) ts.textContent = 'Atualizado ' + new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});

  } catch(e) { console.error('carregarColaboradores:', e); }
}

function limparFiltroColaborador() {
  // Mantido para compatibilidade — não usado no novo layout
}

/* ══════════════════════════════════════════
   ZERAR SESSÕES DE TESTE
══════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════
   RELATÓRIO ANALÍTICO — novo módulo completo
══════════════════════════════════════════════════════════════════ */
let _relAnaliticoDados = null;

function setTurnoRel(t) {
  document.querySelectorAll('.rel-turno-btn').forEach(b => b.classList.toggle('ativo', b.dataset.t === t));
}

function getTurnoRel() {
  return document.querySelector('.rel-turno-btn.ativo')?.dataset.t || 'Todos';
}

async function carregarRelatorioAnalitico() {
  const wrap = document.getElementById('rel-analitico-wrap');
  if (!wrap) return;
  const de  = document.getElementById('rel-de')?.value  || hojeLocal();
  const ate = document.getElementById('rel-ate')?.value || hojeLocal();
  const turno = getTurnoRel();
  wrap.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text3)"><div style="font-size:40px;margin-bottom:12px">⏳</div><div style="font-weight:600">Gerando relatório...</div></div>`;
  try {
    const r = await fetch(`${API}/relatorio/analitico?de=${de}&ate=${ate}&turno=${turno}`, { credentials:'include' });
    if (!r.ok) throw new Error((await r.json()).erro || 'Erro');
    _relAnaliticoDados = await r.json();
    renderRelAnalitico(_relAnaliticoDados);
    ['btn-rel-excel','btn-rel-pdf'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display=''; });
  } catch(e) {
    wrap.innerHTML = `<div style="text-align:center;padding:40px;color:#ef4444"><b>Erro:</b> ${e.message}</div>`;
  }
}

function renderRelAnalitico(d) {
  const wrap = document.getElementById('rel-analitico-wrap');
  if (!wrap) return;
  const fmtD = s => s ? s.split('-').reverse().join('/') : '—';
  const fmtN = n => n != null ? Number(n).toLocaleString('pt-BR') : '—';
  const fmtT = m => m != null ? (m >= 60 ? `${Math.floor(m/60)}h ${Math.round(m%60)}min` : `${Math.round(m)}min`) : '—';
  const pct  = (n,d) => d > 0 ? Math.round((n/d)*100) : 0;

  const periodo = d.periodo.de === d.periodo.ate
    ? fmtD(d.periodo.de)
    : `${fmtD(d.periodo.de)} → ${fmtD(d.periodo.ate)}`;

  // ── 1. Cards de resumo operacional ──────────────────────────
  const cards = [
    { icon:'📦', label:'SEPARAÇÃO', cor:'#4f46e5', grad:'linear-gradient(135deg,#6366f1,#4338ca)',
      main: `${fmtN(d.separacao.concluidos)} / ${fmtN(d.separacao.distribuidos)}`, sub:'concluídos do lote distribuído',
      kpis:[
        { lbl:'Importados',      val: fmtN(d.separacao.total) },
        { lbl:'Distribuídos',    val: fmtN(d.separacao.distribuidos||0) },
        { lbl:'Pendentes',       val: fmtN(d.separacao.pendentes) },
        { lbl:'Separando',       val: fmtN(d.separacao.separando) },
        { lbl:'Total itens',     val: fmtN(d.separacao.total_itens) },
        { lbl:'Pontuação total', val: fmtN(d.separacao.pontuacao_total) },
        { lbl:'Tempo médio',     val: fmtT(d.separacao.media_tempo_min) },
      ]},
    { icon:'🔖', label:'CHECKOUT', cor:'#0891b2', grad:'linear-gradient(135deg,#22d3ee,#0369a1)',
      main: fmtN(d.checkout.concluidos), sub:'checkouts realizados',
      kpis:[
        { lbl:'Total criados',   val: fmtN(d.checkout.total) },
        { lbl:'Pendentes',       val: fmtN(d.checkout.pendentes) },
        { lbl:'Total itens',     val: fmtN(d.checkout.total_itens) },
        { lbl:'Tempo médio',     val: fmtT(d.checkout.media_tempo_min) },
      ]},
    { icon:'📫', label:'EMBALAGEM', cor:'#7c3aed', grad:'linear-gradient(135deg,#a855f7,#6d28d9)',
      main: fmtN(d.embalagem.total_embalados), sub:'pedidos embalados',
      kpis:[
        { lbl:'Pendentes emb.',  val: fmtN(d.embalagem.pendentes) },
        { lbl:'Total itens',     val: fmtN(d.embalagem.total_itens) },
        { lbl:'Tempo médio',     val: fmtT(d.embalagem.media_tempo_min) },
      ]},
    { icon:'🔧', label:'REPOSIÇÃO', cor:'#d97706', grad:'linear-gradient(135deg,#f59e0b,#b45309)',
      main: fmtN(d.reposicao.resolvidas), sub:'reposições resolvidas',
      kpis:[
        { lbl:'Total abertos',    val: fmtN(d.reposicao.total) },
        { lbl:'Pendentes',        val: fmtN(d.reposicao.pendentes) },
        { lbl:'Não encontrados',  val: fmtN(d.reposicao.nao_encontrados) },
        { lbl:'Taxa resolução',   val: d.reposicao.total>0 ? `${pct(d.reposicao.resolvidas,d.reposicao.total)}%` : '—' },
      ]},
  ];

  const cardsHTML = cards.map(c => `
    <div style="background:var(--surface);border-radius:18px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.10)">
      <div style="background:${c.grad};padding:20px 20px 18px;position:relative;overflow:hidden">
        <div style="position:absolute;right:-14px;top:-14px;width:90px;height:90px;border-radius:50%;background:rgba(255,255,255,.10);pointer-events:none"></div>
        <div style="position:absolute;right:-20px;bottom:-18px;width:70px;height:70px;border-radius:50%;background:rgba(255,255,255,.07);pointer-events:none"></div>
        <div style="position:relative">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,.2);font-size:22px;margin-bottom:10px">${c.icon}</div>
          <div style="font-size:10px;font-weight:800;color:rgba(255,255,255,.8);letter-spacing:1.2px;margin-bottom:4px">${c.label}</div>
          <div style="font-size:38px;font-weight:800;color:#fff;line-height:1;letter-spacing:-1px">${c.main}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.7);margin-top:6px">${c.sub}</div>
        </div>
      </div>
      <div style="padding:14px 16px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          ${c.kpis.map(k=>`
            <div style="background:var(--surface2);border-radius:8px;padding:7px 10px">
              <div style="font-size:9px;color:var(--text3);font-weight:700;letter-spacing:.5px">${k.lbl.toUpperCase()}</div>
              <div style="font-size:14px;font-weight:800;color:var(--text);margin-top:2px">${k.val}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>`).join('');

  // ── 2. Complexidade ──────────────────────────────────────────
  const cx = d.complexidade;
  const cxTotalPed = (cx.facil?.pedidos||0) + (cx.medio?.pedidos||0) + (cx.dificil?.pedidos||0) || 1;
  const cxBars = [
    { lbl:'Fácil',   cor:'#16a34a', bg:'#dcfce7', ped: cx.facil?.pedidos||0,   itens: cx.facil?.itens||0 },
    { lbl:'Médio',   cor:'#d97706', bg:'#fef3c7', ped: cx.medio?.pedidos||0,   itens: cx.medio?.itens||0 },
    { lbl:'Difícil', cor:'#dc2626', bg:'#fee2e2', ped: cx.dificil?.pedidos||0, itens: cx.dificil?.itens||0 },
  ].map(b => `
    <div style="flex:1;background:${b.bg};border-radius:12px;padding:14px 12px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:${b.cor};line-height:1">${pct(b.ped,cxTotalPed)}%</div>
      <div style="font-size:12px;font-weight:800;color:${b.cor};margin:4px 0">${b.lbl}</div>
      <div style="margin:8px 0;height:5px;background:rgba(0,0,0,.1);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${pct(b.ped,cxTotalPed)}%;background:${b.cor};border-radius:3px"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:8px">
        <div style="background:rgba(255,255,255,.6);border-radius:8px;padding:5px 6px">
          <div style="font-size:9px;color:${b.cor};font-weight:700;letter-spacing:.3px">PEDIDOS</div>
          <div style="font-size:15px;font-weight:800;color:${b.cor}">${fmtN(b.ped)}</div>
        </div>
        <div style="background:rgba(255,255,255,.6);border-radius:8px;padding:5px 6px">
          <div style="font-size:9px;color:${b.cor};font-weight:700;letter-spacing:.3px">ITENS</div>
          <div style="font-size:15px;font-weight:800;color:${b.cor}">${fmtN(b.itens)}</div>
        </div>
      </div>
    </div>`).join('');

  // ── 3. Ranking de turnos ─────────────────────────────────────
  const rankColors = ['#f59e0b','#94a3b8','#cd7c37'];
  const rankHTML = d.ranking_turnos.map((t,i) => `
    <div style="display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid var(--border);${i===0?'':''}">
      <div style="width:28px;height:28px;border-radius:50%;background:${rankColors[i]||'#94a3b8'};color:${i===0?'#1e293b':'#fff'};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex-shrink:0">${i+1}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:14px;color:var(--text)">${t.turno}</div>
        <div style="font-size:12px;color:var(--text3)">${fmtN(t.itens)} itens · Tempo médio: ${fmtT(t.media_tempo)}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:20px;font-weight:800;color:${rankColors[i]||'#94a3b8'}">${fmtN(t.pedidos)}</div>
        <div style="font-size:10px;color:var(--text3)">pedidos</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:14px;font-weight:700;color:var(--text2)">${fmtN(t.pontuacao)}</div>
        <div style="font-size:10px;color:var(--text3)">pontos</div>
      </div>
    </div>`).join('');

  // ── 4. SLA ────────────────────────────────────────────────────
  const slaColor = d.sla.pct == null ? '#94a3b8' : d.sla.pct >= 85 ? '#16a34a' : d.sla.pct >= 70 ? '#d97706' : '#dc2626';
  const slaHTML = `
    <div style="text-align:center;padding:12px 0">
      <div style="font-size:40px;font-weight:800;color:${slaColor}">${d.sla.pct != null ? d.sla.pct+'%' : '—'}</div>
      <div style="font-size:12px;color:var(--text2);margin:4px 0">pedidos separados em até ${d.sla.meta_horas}h</div>
      <div style="display:flex;gap:12px;justify-content:center;margin-top:10px">
        <div style="background:#dcfce7;border-radius:8px;padding:6px 14px;text-align:center">
          <div style="font-size:16px;font-weight:700;color:#16a34a">${fmtN(d.sla.dentro)}</div>
          <div style="font-size:10px;color:#16a34a">Dentro do SLA</div>
        </div>
        <div style="background:#fee2e2;border-radius:8px;padding:6px 14px;text-align:center">
          <div style="font-size:16px;font-weight:700;color:#dc2626">${fmtN(d.sla.fora)}</div>
          <div style="font-size:10px;color:#dc2626">Fora do SLA</div>
        </div>
      </div>
    </div>`;

  // ── 5. Por hora (mini gráfico de barras) ─────────────────────
  const maxH = Math.max(...d.por_hora.map(h=>h.total), 1);
  const porHoraHTML = d.por_hora.length
    ? `<div style="display:flex;align-items:flex-end;gap:3px;height:60px;padding-bottom:4px">
        ${d.por_hora.map(h=>`
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
            <div style="width:100%;background:#4f46e5;border-radius:3px 3px 0 0;height:${Math.round((h.total/maxH)*50)+4}px;min-height:4px" title="${h.hora}h: ${h.total}"></div>
            <div style="font-size:8px;color:var(--text3)">${h.hora}</div>
          </div>`).join('')}
       </div>`
    : '<div style="color:var(--text3);font-size:13px;text-align:center;padding:20px">Sem dados</div>';

  // ── 6. Por transportadora ─────────────────────────────────────
  const trTotal = d.por_transportadora.reduce((s,t)=>s+t.total,0)||1;
  const trHTML = d.por_transportadora.slice(0,7).map(t=>`
    <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1;font-size:13px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.transportadora}</div>
      <div style="width:80px;height:6px;background:var(--surface2);border-radius:3px;overflow:hidden;flex-shrink:0">
        <div style="height:100%;width:${pct(t.total,trTotal)}%;background:#4f46e5;border-radius:3px"></div>
      </div>
      <div style="font-size:13px;font-weight:700;color:var(--text);min-width:30px;text-align:right;flex-shrink:0">${fmtN(t.total)}</div>
    </div>`).join('');

  // ── 7. Seções de colaboradores por área ──────────────────────
  const turno_icn = { Manha:'🌅', Tarde:'☀️', Noite:'🌙' };
  const mkCell = (content, extraStyle='') => `<td style="padding:8px 12px${extraStyle?';'+extraStyle:''}">${content}</td>`;
  const mkRow  = cells => `<tr style="border-bottom:1px solid var(--border)">${cells.join('')}</tr>`;
  const mkArea = (icon, label, grad, headers, rows) => `
    <div class="card" style="margin-bottom:18px;overflow:hidden">
      <div style="background:${grad};padding:14px 16px;display:flex;align-items:center;gap:10px">
        <span style="font-size:20px">${icon}</span>
        <span style="font-size:13px;font-weight:800;color:#fff;letter-spacing:.8px">${label}</span>
        <span style="margin-left:auto;font-size:11px;font-weight:600;color:rgba(255,255,255,.8)">${rows.length} colaborador${rows.length!==1?'es':''}</span>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:var(--surface2)">${headers.map(h=>`<th style="padding:9px 12px;text-align:left;font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.5px;white-space:nowrap">${h}</th>`).join('')}</tr></thead>
          <tbody>${rows.length?rows.join(''):`<tr><td colspan="${headers.length}" style="text-align:center;padding:24px;color:var(--text3);font-size:13px">Sem colaboradores neste período</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;

  // ─ Separação ─
  const sepColabs = d.colaboradores.filter(c=>c.perfil==='separador').sort((a,b)=>(b.pedidos||0)-(a.pedidos||0));
  const sepAreaRows = sepColabs.map(c => {
    const ritmo = c.tempo_medio>0 ? `~${Math.round(60/c.tempo_medio)}/h` : '—';
    return mkRow([
      mkCell(`<div style="font-weight:700;font-size:13px;color:var(--text)">${c.nome}</div>${c.turno?`<div style="font-size:10px;color:var(--text3)">${turno_icn[c.turno]||''} ${c.turno}</div>`:''}`),
      mkCell(`<span style="font-size:15px;font-weight:800;color:#4f46e5">${fmtN(c.pedidos)}</span>`),
      mkCell(`<span style="font-size:13px;color:var(--text2)">${fmtN(c.itens)}</span>`),
      mkCell(`<span style="font-size:13px;color:var(--text2)">${fmtN(c.pontuacao)}</span>`),
      mkCell(`<span style="font-size:13px;color:var(--text2)">${fmtT(c.tempo_medio)}</span>`),
      mkCell(`<span style="font-size:12px;font-weight:700;color:#16a34a">${ritmo}</span>`),
    ]);
  });

  // ─ Checkout ─
  const ckColabs = d.colaboradores.filter(c=>c.perfil==='checkout').sort((a,b)=>(b.pedidos||0)-(a.pedidos||0));
  const ckAreaRows = ckColabs.map(c => {
    const ritmo = c.tempo_medio>0 ? `~${Math.round(60/c.tempo_medio)}/h` : '—';
    return mkRow([
      mkCell(`<span style="font-weight:700;font-size:13px;color:var(--text)">${c.nome}</span>`),
      mkCell(`<span style="font-size:15px;font-weight:800;color:#0891b2">${fmtN(c.pedidos)}</span>`),
      mkCell(`<span style="font-size:13px;color:var(--text2)">${fmtN(c.itens)}</span>`),
      mkCell(`<span style="font-size:13px;color:var(--text2)">${fmtT(c.tempo_medio)}</span>`),
      mkCell(`<span style="font-size:12px;font-weight:700;color:#16a34a">${ritmo}</span>`),
    ]);
  });

  // ─ Embalagem ─
  const embColabs = d.colaboradores.filter(c=>c.perfil==='embalador').sort((a,b)=>(b.pedidos||0)-(a.pedidos||0));
  const embAreaRows = embColabs.map(c => {
    const ritmo = c.tempo_medio>0 ? `~${Math.round(60/c.tempo_medio)}/h` : '—';
    return mkRow([
      mkCell(`<span style="font-weight:700;font-size:13px;color:var(--text)">${c.nome}</span>`),
      mkCell(`<span style="font-size:15px;font-weight:800;color:#7c3aed">${fmtN(c.pedidos)}</span>`),
      mkCell(`<span style="font-size:13px;color:var(--text2)">${fmtN(c.itens)}</span>`),
      mkCell(`<span style="font-size:13px;color:var(--text2)">${fmtT(c.tempo_medio)}</span>`),
      mkCell(`<span style="font-size:12px;font-weight:700;color:#16a34a">${ritmo}</span>`),
    ]);
  });

  // ─ Reposição ─
  const repColabs = d.colaboradores.filter(c=>c.perfil==='repositor').sort((a,b)=>(b.total||0)-(a.total||0));
  const repAreaRows = repColabs.map(c => {
    const taxa = (c.total||0)>0 ? Math.round(((c.repostos||0)/(c.total||0))*100) : null;
    const taxaClr = taxa==null?'var(--text3)':taxa>=80?'#16a34a':taxa>=60?'#d97706':'#dc2626';
    return mkRow([
      mkCell(`<span style="font-weight:700;font-size:13px;color:var(--text)">${c.nome}</span>`),
      mkCell(`<span style="font-size:15px;font-weight:800;color:#d97706">${fmtN(c.total)}</span>`),
      mkCell(`<span style="font-size:13px;font-weight:600;color:#16a34a">${fmtN(c.repostos)}</span>`),
      mkCell(`<span style="font-size:13px;font-weight:600;color:#dc2626">${fmtN(c.nao_enc)}</span>`),
      mkCell(`<span style="font-size:13px;font-weight:700;color:${taxaClr}">${taxa!=null?taxa+'%':'—'}</span>`),
      mkCell(`<span style="font-size:13px;color:var(--text2)">${fmtT(c.tempo_medio)}</span>`),
    ]);
  });

  // ── 8. Por dia (se range > 1 dia) ────────────────────────────
  let porDiaHTML = '';
  if (d.por_dia.length > 1) {
    const maxD = Math.max(...d.por_dia.map(x=>x.total),1);
    porDiaHTML = `
      <div class="card" style="margin-bottom:18px">
        <div class="card-hd">📅 PEDIDOS POR DIA</div>
        <div style="display:flex;align-items:flex-end;gap:4px;height:80px;padding:8px 0 4px">
          ${d.por_dia.map(x=>`
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
              <div style="font-size:9px;font-weight:700;color:var(--text2)">${x.total}</div>
              <div style="width:100%;background:#4f46e5;border-radius:3px 3px 0 0;height:${Math.round((x.total/maxD)*55)+4}px;min-height:4px"></div>
              <div style="font-size:8px;color:var(--text3)">${x.data.slice(8)+'/'+(x.data.slice(5,7))}</div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  // ── Sugestões ─────────────────────────────────────────────────
  const sugestoes = [];
  if (d.sla.pct != null && d.sla.pct < 85) sugestoes.push(`⚠️ SLA de separação em ${d.sla.pct}% — meta: 85%. Considere redistribuir pedidos entre turnos.`);
  if (d.reposicao.nao_encontrados > 0) sugestoes.push(`🔍 ${fmtN(d.reposicao.nao_encontrados)} itens não encontrados na reposição — revisar localização no estoque.`);
  const melhorTurno = d.ranking_turnos[0];
  if (melhorTurno && melhorTurno.pedidos > 0) sugestoes.push(`🏆 Melhor turno: ${melhorTurno.turno} com ${fmtN(melhorTurno.pedidos)} pedidos concluídos.`);
  if (d.separacao.pendentes > 20) sugestoes.push(`🚨 ${fmtN(d.separacao.pendentes)} pedidos ainda pendentes — verificar distribuição.`);
  if (d.complexidade.dificil > d.complexidade.facil) sugestoes.push(`📍 Mais pedidos difíceis (${fmtN(d.complexidade.dificil)}) do que fáceis (${fmtN(d.complexidade.facil)}) — considere priorizar corredores F-L.`);
  if (d.embalagem.pendentes > 50) sugestoes.push(`📫 ${fmtN(d.embalagem.pendentes)} pedidos separados aguardando embalagem.`);
  const topTransp = d.por_transportadora[0];
  if (topTransp) sugestoes.push(`🚚 Transportadora mais comum: ${topTransp.transportadora} (${fmtN(topTransp.total)} pedidos).`);
  sugestoes.push(`📊 Índice de produtividade: ${fmtN(d.separacao.pontuacao_total)} pontos totais distribuídos entre ${d.colaboradores.filter(c=>c.perfil==='separador').length} separadores.`);

  // ── Montar HTML ───────────────────────────────────────────────
  wrap.innerHTML = `
    <!-- Título do período -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:16px;font-weight:800;color:var(--text)">📋 ${periodo}</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px">Turno: <b>${d.turno_filtro === 'Todos' ? 'Todos os turnos' : d.turno_filtro}</b></div>
      </div>
    </div>

    <!-- 4 Cards operacionais -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-bottom:18px">
      ${cardsHTML}
    </div>

    <!-- Complexidade + SLA -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px">
      <div class="card">
        <div class="card-hd">📍 COMPLEXIDADE DOS PEDIDOS</div>
        <div style="display:flex;gap:10px">${cxBars}</div>
      </div>
      <div class="card">
        <div class="card-hd">⏱ SLA DE SEPARAÇÃO</div>
        ${slaHTML}
      </div>
    </div>

    <!-- Ranking de turnos + Por hora -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px">
      <div class="card">
        <div class="card-hd">🏆 RANKING POR TURNO</div>
        ${rankHTML || '<div style="color:var(--text3);font-size:13px;padding:12px">Sem dados</div>'}
      </div>
      <div class="card">
        <div class="card-hd">📈 PEDIDOS POR HORA DO DIA</div>
        ${porHoraHTML}
      </div>
    </div>

    ${porDiaHTML}

    <!-- Seções de colaboradores por área -->
    ${mkArea('📦','SEPARAÇÃO — DESEMPENHO INDIVIDUAL','linear-gradient(135deg,#6366f1,#4338ca)',
      ['COLABORADOR / TURNO','PEDIDOS','ITENS','PONTUAÇÃO','TEMPO MÉD.','RITMO'],
      sepAreaRows)}
    ${mkArea('🔖','CHECKOUT — DESEMPENHO INDIVIDUAL','linear-gradient(135deg,#22d3ee,#0369a1)',
      ['OPERADOR','EXPEDIÇÕES','ITENS','TEMPO MÉD.','RITMO'],
      ckAreaRows)}
    ${mkArea('📫','EMBALAGEM — DESEMPENHO INDIVIDUAL','linear-gradient(135deg,#a855f7,#6d28d9)',
      ['EMBALADOR','EMBALADOS','ITENS','TEMPO MÉD.','RITMO'],
      embAreaRows)}
    ${mkArea('🔧','REPOSIÇÃO — DESEMPENHO INDIVIDUAL','linear-gradient(135deg,#f59e0b,#b45309)',
      ['REPOSITOR','TOTAL AVISOS','REPOSTOS','NÃO ENCONTR.','TAXA RESOLUÇÃO','T. MÉDIO'],
      repAreaRows)}

    <!-- Transportadoras -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px">
      <div class="card">
        <div class="card-hd">🚚 TOP TRANSPORTADORAS</div>
        ${trHTML || '<div style="color:var(--text3);font-size:13px;padding:12px">Sem dados</div>'}
      </div>
      <div class="card">
        <div class="card-hd">💡 ANÁLISE AUTOMÁTICA</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${sugestoes.map(s=>`<div style="font-size:12px;color:var(--text2);padding:8px 10px;background:var(--surface2);border-radius:8px;line-height:1.4">${s}</div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

/* ── Excel export ──────────────────────────────────────────────── */
function exportarRelAnaliticoExcel() {
  const d = _relAnaliticoDados;
  if (!d) { toast('Gere o relatório primeiro!','aviso'); return; }
  try {
    const wb = XLSX.utils.book_new();
    const fmtD = s => s ? s.split('-').reverse().join('/') : '';
    const fmtT = m => m != null ? (m>=60?`${Math.floor(m/60)}h ${Math.round(m%60)}min`:`${Math.round(m)}min`) : '';

    // Aba Resumo
    const resumoRows = [
      ['RELATÓRIO ANALÍTICO WMS MIESS'],
      [`Período: ${fmtD(d.periodo.de)} → ${fmtD(d.periodo.ate)}   |   Turno: ${d.turno_filtro}`],
      [],
      ['ÁREA','MÉTRICA','VALOR'],
      ['Separação','Total importado', d.separacao.total],
      ['Separação','Concluídos', d.separacao.concluidos],
      ['Separação','Pendentes', d.separacao.pendentes],
      ['Separação','Total itens', d.separacao.total_itens],
      ['Separação','Pontuação total', d.separacao.pontuacao_total],
      ['Separação','Tempo médio', fmtT(d.separacao.media_tempo_min)],
      ['Checkout','Concluídos', d.checkout.concluidos],
      ['Checkout','Pendentes', d.checkout.pendentes],
      ['Checkout','Tempo médio', fmtT(d.checkout.media_tempo_min)],
      ['Embalagem','Embalados', d.embalagem.total_embalados],
      ['Embalagem','Pendentes', d.embalagem.pendentes],
      ['Embalagem','Tempo médio', fmtT(d.embalagem.media_tempo_min)],
      ['Reposição','Total', d.reposicao.total],
      ['Reposição','Resolvidas', d.reposicao.resolvidas],
      ['Reposição','Não encontrados', d.reposicao.nao_encontrados],
      [],
      ['COMPLEXIDADE','PEDIDOS','%'],
      ['Fácil', d.complexidade.facil, d.complexidade.facil+d.complexidade.medio+d.complexidade.dificil>0?Math.round(d.complexidade.facil/(d.complexidade.facil+d.complexidade.medio+d.complexidade.dificil)*100)+'%':''],
      ['Médio', d.complexidade.medio, d.complexidade.facil+d.complexidade.medio+d.complexidade.dificil>0?Math.round(d.complexidade.medio/(d.complexidade.facil+d.complexidade.medio+d.complexidade.dificil)*100)+'%':''],
      ['Difícil', d.complexidade.dificil, d.complexidade.facil+d.complexidade.medio+d.complexidade.dificil>0?Math.round(d.complexidade.dificil/(d.complexidade.facil+d.complexidade.medio+d.complexidade.dificil)*100)+'%':''],
      [],
      ['SLA','Meta (horas)', d.sla.meta_horas],
      ['SLA','Dentro do SLA', d.sla.dentro],
      ['SLA','Fora do SLA', d.sla.fora],
      ['SLA','% Atingimento', d.sla.pct != null ? d.sla.pct+'%' : ''],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumoRows), 'Resumo');

    // Aba Colaboradores
    const colabRows = [['COLABORADOR','PERFIL','TURNO','PEDIDOS','ITENS','PONTUAÇÃO','REPOSTOS','NÃO ENCONTRADOS','TEMPO MÉDIO']];
    d.colaboradores.forEach(c => colabRows.push([
      c.nome, c.perfil, c.turno||'',
      c.perfil==='repositor' ? c.total||0 : c.pedidos||0,
      c.itens||'', c.pontuacao||'',
      c.repostos||'', c.nao_enc||'',
      fmtT(c.tempo_medio),
    ]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(colabRows), 'Colaboradores');

    // Aba Ranking Turnos
    const rankRows = [['TURNO','PEDIDOS','ITENS','PONTUAÇÃO','TEMPO MÉDIO']];
    d.ranking_turnos.forEach(t => rankRows.push([t.turno, t.pedidos, t.itens, t.pontuacao, fmtT(t.media_tempo)]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rankRows), 'Ranking Turnos');

    // Aba Transportadoras
    const trRows = [['TRANSPORTADORA','TOTAL']];
    d.por_transportadora.forEach(t => trRows.push([t.transportadora, t.total]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(trRows), 'Transportadoras');

    // Aba Por Hora
    const hRows = [['HORA','PEDIDOS CONCLUÍDOS']];
    d.por_hora.forEach(h => hRows.push([h.hora+'h', h.total]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hRows), 'Por Hora');

    const de = d.periodo.de.replace(/-/g,''), ate = d.periodo.ate.replace(/-/g,'');
    XLSX.writeFile(wb, `relatorio_analitico_${de}_${ate}.xlsx`);
  } catch(e) { toast('Erro ao exportar Excel!','erro'); console.error(e); }
}

/* ── PDF export via impressão ──────────────────────────────────── */
function exportarRelAnaliticoPDF() {
  if (!_relAnaliticoDados) { toast('Gere o relatório primeiro!','aviso'); return; }
  document.body.classList.add('print-relatorio');
  window.print();
  setTimeout(() => document.body.classList.remove('print-relatorio'), 1000);
}

async function zerarSessoesHoje() {
  const ini = document.getElementById('perf-ini')?.value || hojeLocal();
  wmsConfirm(`Zerar todas as sessões de ${fmtData(ini)}? Os tempos nos cards voltarão a zero.`, async () => {
    try {
      const res = await fetch(`${API}/admin/zerar-sessoes`, {
        method: 'POST', credentials: 'include',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ data: ini })
      });
      const data = await res.json();
      if (data.erro) { toast(data.erro, 'erro'); return; }
      toast(`✅ ${data.mensagem}`, 'sucesso');
      carregarPerformance();
    } catch(e) { toast('Erro ao zerar sessões!', 'erro'); }
  });
}

