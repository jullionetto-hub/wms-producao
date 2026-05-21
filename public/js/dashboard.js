
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
        opt.textContent = `#${p.numero_pedido} — ${p.cliente||'—'} (${p.itens||0} itens)`;
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
    // Busca TODOS os pedidos ativos (pendente + separando + concluido de hoje)
    // independente da data do arquivo importado
    const [resPend, resSep, resConc] = await Promise.all([
      fetch(`${API}/pedidos?status=pendente`, { credentials:'include' }),
      fetch(`${API}/pedidos?status=separando`, { credentials:'include' }),
      fetch(`${API}/pedidos?status=concluido&data=${hoje}`, { credentials:'include' })
    ]);
    const pPend = resPend.ok ? await resPend.json() : [];
    const pSep  = resSep.ok  ? await resSep.json()  : [];
    const pConc = resConc.ok ? await resConc.json() : [];
    // Merge sem duplicatas
    const allIds = new Set();
    const pedidos = [...pPend, ...pSep, ...pConc].filter(p => {
      if (allIds.has(p.id)) return false;
      allIds.add(p.id); return true;
    });

    const total      = pedidos.length;
    const concluidos = pedidos.filter(p=>p.status==='concluido').length;
    const separando  = pedidos.filter(p=>p.status==='separando').length;
    const pendentes  = pedidos.filter(p=>p.status==='pendente').length;
    const pct        = total > 0 ? Math.round((concluidos/total)*100) : 0;

    // Busca faltas abertas
    const resF = await fetch(`${API}/repositor/avisos?status=pendente`, { credentials:'include' });
    const faltas = resF.ok ? await resF.json() : [];

    // Atualiza barra de progresso
    document.getElementById('op-concluidos').textContent = concluidos;
    document.getElementById('op-total').textContent = total;
    document.getElementById('op-pct').textContent = pct + '%';
    document.getElementById('op-barra').style.width = pct + '%';
    document.getElementById('op-n-concluidos').textContent = concluidos;
    document.getElementById('op-n-separando').textContent = separando;
    document.getElementById('op-n-pendentes').textContent = pendentes;
    document.getElementById('op-n-faltas').textContent = faltas.length;
    // Mantém KPIs do topo sincronizados com os dados de operação
    const _dh = document.getElementById('dash-hoje');
    const _ds = document.getElementById('dash-separando');
    if (_dh) _dh.textContent = concluidos;
    if (_ds) _ds.textContent = separando;

    // Previsão de conclusão
    const prevEl = document.getElementById('op-previsao');
    const prevTxt = document.getElementById('op-previsao-txt');
    if (concluidos > 0 && pendentes > 0) {
      // Calcula velocidade: pedidos/hora com base nos concluídos
      // Pega hora do primeiro e do ultimo concluído
      const conclPeds = pedidos.filter(p=>p.status==='concluido' && p.hora_pedido);
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
      document.getElementById('op-barra').style.background = 'linear-gradient(90deg,#16A34A,#4ADE80)';
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

async function carregarDashboard() {
  await popularSelects();
  await carregarKPIs();
  await carregarProdutividade();
  await carregarTimeline();
  await atualizarBadgeRep();
  await carregarOperacao();
  carregarRankingGeral();
  carregarGraficoPizzaStatus();
  carregarGraficoPizzaReposicao();
  carregarGraficoBarrasHoras();
  carregarGraficoFunil();
  atualizarBadgeLiberacao();
  iniciarAutoRefreshLiberacao();
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
  const tbody    = document.getElementById('tbody-liberacao');
  const badge    = document.getElementById('lib-total-badge');
  const menuBadge = document.getElementById('menu-badge-lib');
  if (!tbody) return;

  try {
    const res  = await fetch(`${API}/liberacao/pendentes`, { credentials:'include' });
    const rows = await res.json();

    const total = rows.length;
    if (badge)     badge.textContent = total;
    if (menuBadge) { menuBadge.textContent = total; menuBadge.style.display = total > 0 ? 'inline' : 'none'; }

    if (!total) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:32px;font-size:13px">✅ Nenhum item aguardando liberação</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(r => `
      <tr>
        <td style="font-weight:700">${r.numero_pedido||'—'}</td>
        <td>
          <div style="font-weight:700;color:var(--text)">${r.codigo||'—'}</div>
          <div style="font-size:11px;color:var(--text2)">${r.descricao||''}</div>
        </td>
        <td style="text-align:center;font-weight:700">${r.quantidade||'—'}</td>
        <td style="color:var(--text2)">${r.separador_nome||'—'}</td>
        <td style="color:var(--text2)">${r.repositor_nome||'—'}</td>
        <td style="color:var(--text3);font-size:12px">${r.data_aviso||''} ${r.hora_reposto||r.hora_aviso||''}</td>
        <td>
          <button class="btn btn-sm" style="background:var(--accent);color:#fff;white-space:nowrap"
            onclick="liberarItem(${r.id}, this)">🔓 Liberar para Protocolo</button>
        </td>
      </tr>`).join('');
  } catch(e) { console.error('carregarLiberacao:', e); toast('Erro ao carregar liberações','erro'); }
}

async function liberarItem(id, btn) {
  wmsConfirm('Liberar este item para Protocolo? O separador será notificado.', async () => {
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Liberando...'; }
    try {
      const res  = await fetch(`${API}/repositor/avisos/${id}/liberar`, {
        method:'PUT', credentials:'include',
        headers:{'Content-Type':'application/json'}, body:JSON.stringify({})
      });
      const data = await res.json();
      if (data.erro) { toast(data.erro,'erro'); if (btn) { btn.disabled = false; btn.textContent = '🔓 Liberar para Protocolo'; } return; }
      toast('✅ Item liberado para Protocolo!','sucesso');
      carregarLiberacao();
    } catch(e) { toast('Erro ao liberar!','erro'); if (btn) { btn.disabled = false; btn.textContent = '🔓 Liberar para Protocolo'; } }
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
  if (_turnosDash.has(turno)) _turnosDash.delete(turno);
  else _turnosDash.add(turno);
  const map = { Manha:'manha', Tarde:'tarde', Noite:'madrugada' };
  Object.entries(map).forEach(([t, id]) => {
    const btn = document.getElementById(`dash-turno-${id}`);
    if (btn) btn.classList.toggle('ativo', _turnosDash.has(t));
  });
  carregarKPIs();
}

async function carregarKPIs() {
  try {
    let url = `${API}/kpis`;
    if (_turnosDash.size > 0) url += `?turnos=${[..._turnosDash].join(',')}`;
    const res  = await fetch(url, { credentials:'include' });
    const data = await res.json();
    const set  = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val ?? 0; };
    set('dash-hoje',       data.concluidos_hoje);
    set('dash-separando',  data.em_separacao);
    set('kpi-ck-hoje',     data.checkout_hoje);
    set('kpi-ck-pend',     data.checkout_pendente);
    set('kpi-emb-hoje',    data.embalagem_hoje);
    set('kpi-emb-pend',    data.embalagem_pendente);
    set('kpi-rep-conc',    data.reposicao_concluida);
    set('kpi-rep-pend',    data.reposicao_pendente);
    set('kpi-nao-enc',     data.nao_encontrados_hoje);
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
          <div class="tl-sub">${p.separador_nome||'Sem usuário'} &nbsp;•&nbsp; <span class="pill ${p.status}" style="font-size:9px;padding:2px 7px">${p.status}</span> &nbsp;•&nbsp; ${p.itens||0} itens &nbsp;•&nbsp; ${formatarData(p.data_pedido)}</div>
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
  separador: { icon:'📦', label:'Separação',  cor:'var(--accent)' },
  checkout:  { icon:'✅', label:'Checkout',   cor:'var(--indigo)' },
  embalador: { icon:'📫', label:'Embalagem',  cor:'#7C3AED'       },
  repositor: { icon:'🔧', label:'Reposição',  cor:'#EA580C'       },
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

      let tempoHtml = '';
      if (colab) {
        const r = resultado.find(r => r.perfil === p);
        const min = r?.minutos || 0;
        tempoHtml = min > 0
          ? `<div style="border-left:1px solid var(--border);padding-left:10px;text-align:right">
               <div style="font-size:13px;color:var(--accent);font-weight:700">⏱ ${_horasStr(min)}</div>
               <div style="font-size:9px;color:var(--text3)">logado</div>
             </div>`
          : `<div style="border-left:1px solid var(--border);padding-left:10px"><div style="font-size:11px;color:var(--text3)">—</div></div>`;
      }

      return `<div class="card" style="padding:10px 14px;display:flex;align-items:center;gap:12px">
        <div style="font-size:22px;line-height:1">${area.icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:10px;font-weight:700;color:${area.cor};letter-spacing:.5px">${area.label.toUpperCase()}</div>
          <div style="font-size:26px;font-weight:900;color:var(--text);line-height:1.1">${ag.atividades}</div>
          <div style="font-size:10px;color:var(--text3)">${LABELS[p]}${!colab ? ` · ${ag.colaboradores} colaborador${ag.colaboradores!==1?'es':''}` : ''}</div>
        </div>
        ${tempoHtml}
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
          const ck = p.tempo_checkout_min !== null
            ? `<span style="color:${p.tempo_checkout_min<=5?'var(--green)':p.tempo_checkout_min<=15?'var(--amber)':'var(--red)'};font-weight:700">${_horasStr(p.tempo_checkout_min)}</span>`
            : '<span style="color:var(--text3)">—</span>';
          const emb = p.emb_horario
            ? `<span style="color:var(--green);font-weight:700">${p.emb_horario.slice(0,5)}</span>`
            : '<span style="color:var(--text3)">—</span>';
          return `<tr>
            <td style="font-weight:700">${p.numero_pedido||'—'}</td>
            <td style="color:var(--text2)">${fmtData(p.data_pedido)||'—'}</td>
            <td style="color:var(--text2)">${ini}</td>
            <td style="color:var(--text2)">${fim}</td>
            <td style="color:var(--text2)">${total}</td>
            <td>${espera}</td>
            <td>${real}</td>
            <td>${ck}</td>
            <td>${emb}</td>
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
                <th>⏱ CHECKOUT</th><th>📦 EMBALAGEM</th>
                <th>ITENS</th><th>PRODUTOS</th><th>REPOS.</th>
              </tr></thead>
              <tbody>${linhas}</tbody>
            </table>
          </div>`;
      } else if (colab.perfil === 'checkout') {
        const linhas = colab.pedidos.map(p => {
          const tempo = p.tempo_checkout_min !== null
            ? `<span style="color:${p.tempo_checkout_min<=5?'var(--green)':p.tempo_checkout_min<=15?'var(--amber)':'var(--red)'};font-weight:700">${_horasStr(p.tempo_checkout_min)}</span>`
            : '—';
          return `<tr>
            <td style="font-weight:700">${p.numero_pedido||'—'}</td>
            <td style="color:var(--text2)">${fmtData(p.data_pedido)||'—'}</td>
            <td style="color:var(--text2)">${p.hora_abertura||'—'}</td>
            <td style="color:var(--text2)">${p.hora_confirmacao||'—'}</td>
            <td>${tempo}</td>
          </tr>`;
        }).join('');
        tabela = `
          <div class="tabela-wrap">
            <table>
              <thead><tr>
                <th>Nº PEDIDO</th><th>DATA</th><th>ABERTURA</th><th>CONFIRMAÇÃO</th><th>⏱ TEMPO CHECKOUT</th>
              </tr></thead>
              <tbody>${linhas}</tbody>
            </table>
          </div>`;
      } else if (isEmb) {
        const linhas = colab.pedidos.map(p => {
          const horario = p.embalado_em ? p.embalado_em.slice(0,5) : '—';
          return `<tr>
            <td style="font-weight:700">${p.numero_pedido||'—'}</td>
            <td style="color:var(--text2)">${fmtData(p.data_pedido)||'—'}</td>
            <td style="color:var(--text2)">${horario}</td>
            <td style="color:var(--text2)">${p.cliente||'—'}</td>
            <td style="color:var(--text2)">${p.transportadora||'—'}</td>
            <td style="font-weight:700;color:#8B5CF6">${p.total_itens||0}</td>
          </tr>`;
        }).join('');
        tabela = `
          <div class="tabela-wrap">
            <table>
              <thead><tr>
                <th>Nº PEDIDO</th><th>DATA</th><th>HORÁRIO</th><th>CLIENTE</th><th>TRANSP.</th><th>ITENS</th>
              </tr></thead>
              <tbody>${linhas}</tbody>
            </table>
          </div>`;
      } else if (isRep) {
        const STcor = { abastecido:'var(--green)', reposto:'var(--green)', encontrado:'var(--green)', subiu:'var(--green)',
                        nao_encontrado:'var(--red)', protocolo:'var(--text3)', pendente:'var(--amber)' };
        const STlabel = { abastecido:'✅ Abastecido', reposto:'✅ Reposto', encontrado:'✅ Encontrado', subiu:'✅ Subiu',
                          nao_encontrado:'❌ Não encontrado', protocolo:'📋 Protocolo', pendente:'⏳ Pendente' };
        const linhas = colab.pedidos.map(p => {
          const cor = STcor[p.status] || 'var(--text3)';
          const label = STlabel[p.status] || p.status;
          const tempo = p.tempo_resolucao_min !== null
            ? `<span style="color:${p.tempo_resolucao_min<=10?'var(--green)':p.tempo_resolucao_min<=30?'var(--amber)':'var(--red)'};font-weight:700">${_horasStr(p.tempo_resolucao_min)}</span>`
            : '—';
          return `<tr>
            <td style="font-weight:700">${p.numero_pedido||'—'}</td>
            <td style="color:var(--text2)">${fmtData(p.data_pedido)||'—'}</td>
            <td style="color:var(--text2)">${p.hora_aviso||'—'}</td>
            <td style="color:var(--text2)">${p.hora_reposto||'—'}</td>
            <td>${tempo}</td>
            <td style="color:var(--text2);font-size:11px">${p.codigo||'—'}</td>
            <td style="color:var(--text2);font-size:11px;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.descricao||'—'}</td>
            <td style="text-align:center">${p.quantidade||0}</td>
            <td><span style="color:${cor};font-weight:700;font-size:11px">${label}</span></td>
          </tr>`;
        }).join('');
        tabela = `
          <div class="tabela-wrap">
            <table>
              <thead><tr>
                <th>Nº PEDIDO</th><th>DATA</th><th>AVISO</th><th>REPOSTO</th><th>⏱ TEMPO</th>
                <th>CÓDIGO</th><th>DESCRIÇÃO</th><th>QTD</th><th>STATUS</th>
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
    if (!_performanceDados || !_performanceDados.length) {
      toast('Carregue os dados antes de exportar!', 'aviso');
      return;
    }
    const AREA_LABEL = { separador:'Separação', checkout:'Checkout', embalador:'Embalagem', repositor:'Reposição' };
    const rows = [['COLABORADOR','ÁREA','TURNO','TEMPO LOGADO','ATIVIDADES','META PROP.','% ATINGIMENTO','DETALHE']];
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
        if (r.detalhe.repostos)         partes.push(`${r.detalhe.repostos} resolvidos`);
        if (r.detalhe.nao_encontrados)  partes.push(`${r.detalhe.nao_encontrados} não enc.`);
        detalhe = partes.join(' | ');
      }
      rows.push([
        r.usuario_nome,
        AREA_LABEL[r.perfil] || r.perfil,
        r.turno || '—',
        tempoStr,
        r.atividades,
        metaStr,
        pctStr,
        detalhe,
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = rows[0].map((_,ci) => ({ wch: Math.max(...rows.map(r => String(r[ci]||'').length))+2 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Performance');
    XLSX.writeFile(wb, `performance_${hojeLocal()}.xlsx`);
    toast('Excel exportado!','sucesso');
  } catch(e) { console.error('exportarPerformanceExcel:', e); toast('Erro ao exportar!','erro'); }
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

  try {
    let url = `${API}/stats/performance/detalhe?ini=${ini}&fim=${fim}&colaborador=${encodeURIComponent(nomeColab)}`;
    const res = await fetch(url, { credentials:'include' });
    if (!res.ok) { toast('Erro ao gerar relatório','erro'); return; }
    const { detalhe } = await res.json();

    const colabData = detalhe && detalhe.length ? detalhe[0] : null;
    const pedidos = colabData ? colabData.pedidos : [];

    const totalPedidos = pedidos.length;
    const totalItens   = pedidos.reduce((s,p) => s + (parseInt(p.total_itens)||0), 0);
    const temposReais  = pedidos.filter(p => p.tempo_real_min !== null).map(p => p.tempo_real_min);
    const mediaTempoReal = temposReais.length ? (temposReais.reduce((a,b)=>a+b,0)/temposReais.length).toFixed(1) : null;
    const tempoMin = temposReais.length ? Math.min(...temposReais).toFixed(1) : null;
    const tempoMax = temposReais.length ? Math.max(...temposReais).toFixed(1) : null;
    const totalReps = pedidos.reduce((s,p) => s + (parseInt(p.qtd_reposicoes)||0), 0);
    const pedidosComRep = pedidos.filter(p => p.qtd_reposicoes > 0).length;
    const ckTempos = pedidos.filter(p => p.tempo_checkout_min !== null).map(p => p.tempo_checkout_min);
    const mediaCk = ckTempos.length ? (ckTempos.reduce((a,b)=>a+b,0)/ckTempos.length).toFixed(1) : null;

    // Análise de desempenho
    const pontosBons = [];
    const melhorar   = [];

    if (mediaTempoReal !== null) {
      if (parseFloat(mediaTempoReal) <= 25) pontosBons.push(`Tempo médio de separação excelente: ${mediaTempoReal} min/pedido`);
      else if (parseFloat(mediaTempoReal) <= 40) pontosBons.push(`Tempo médio de separação dentro do esperado: ${mediaTempoReal} min/pedido`);
      else melhorar.push(`Tempo médio de separação acima do ideal: ${mediaTempoReal} min/pedido (meta: até 40 min)`);
    }
    if (totalReps > 0) {
      const pctRep = ((pedidosComRep / totalPedidos) * 100).toFixed(0);
      if (parseInt(pctRep) <= 15) pontosBons.push(`Baixa incidência de reposição: ${pctRep}% dos pedidos (${totalReps} avisos)`);
      else melhorar.push(`Alta incidência de reposição: ${pctRep}% dos pedidos geraram avisos (${totalReps} no total)`);
    } else {
      pontosBons.push('Nenhum aviso de reposição no período — excelente!');
    }
    if (totalPedidos >= 20) pontosBons.push(`Volume expressivo de pedidos no mês: ${totalPedidos} pedidos / ${totalItens} itens`);
    else if (totalPedidos > 0) melhorar.push(`Volume abaixo do esperado para o período: ${totalPedidos} pedidos`);
    if (mediaCk !== null && parseFloat(mediaCk) <= 5) pontosBons.push(`Checkout ágil: média de ${mediaCk} min por pedido`);
    else if (mediaCk !== null && parseFloat(mediaCk) > 10) melhorar.push(`Tempo de checkout elevado: média de ${mediaCk} min por pedido`);

    const [ano, mes] = anoMes.split('-');
    const nomesMes = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

    const html = `
      <div style="font-family:'DM Sans',sans-serif;max-width:680px;margin:0 auto;padding:0 4px">
        <div style="background:var(--accent);color:#fff;border-radius:12px 12px 0 0;padding:18px 20px">
          <div style="font-size:11px;font-weight:700;letter-spacing:1px;opacity:.8">RELATÓRIO DE DESEMPENHO</div>
          <div style="font-size:20px;font-weight:900;margin-top:2px">${nomeColab}</div>
          <div style="font-size:12px;opacity:.8;margin-top:2px">${nomesMes[parseInt(mes)]} de ${ano}</div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-top:none;border-radius:0 0 12px 12px;padding:18px 20px">
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px">
            ${[
              ['Pedidos', totalPedidos],
              ['Itens', totalItens],
              ['Tempo Médio', mediaTempoReal !== null ? mediaTempoReal+'min' : '—'],
              ['Reposições', totalReps],
            ].map(([l,v]) => `
              <div style="background:var(--surface2);border-radius:8px;padding:10px;text-align:center">
                <div style="font-size:18px;font-weight:900;color:var(--text)">${v}</div>
                <div style="font-size:10px;color:var(--text3);font-weight:600">${l}</div>
              </div>`).join('')}
          </div>
          ${tempoMin!==null?`<div style="font-size:12px;color:var(--text2);margin-bottom:14px">Tempo de separação: mínimo <b>${tempoMin}min</b> · máximo <b>${tempoMax}min</b>${mediaCk?` · checkout médio <b>${mediaCk}min</b>`:''}</div>`:''}
          ${pontosBons.length ? `
            <div style="margin-bottom:12px">
              <div style="font-size:11px;font-weight:800;color:#15803D;letter-spacing:.5px;margin-bottom:6px">✅ PONTOS POSITIVOS</div>
              ${pontosBons.map(p=>`<div style="font-size:13px;color:var(--text);padding:5px 10px;background:#F0FDF4;border-radius:6px;margin-bottom:4px;border-left:3px solid #22C55E">• ${p}</div>`).join('')}
            </div>` : ''}
          ${melhorar.length ? `
            <div>
              <div style="font-size:11px;font-weight:800;color:#B45309;letter-spacing:.5px;margin-bottom:6px">⚠️ PONTOS A MELHORAR</div>
              ${melhorar.map(p=>`<div style="font-size:13px;color:var(--text);padding:5px 10px;background:#FFFBEB;border-radius:6px;margin-bottom:4px;border-left:3px solid #F59E0B">• ${p}</div>`).join('')}
            </div>` : ''}
          ${!pontosBons.length && !melhorar.length ? `<div style="color:var(--text3);font-size:13px;text-align:center;padding:20px">Dados insuficientes para análise. Filtre um período com mais atividade.</div>` : ''}
        </div>
      </div>`;

    // Exibe em modal
    let modal = document.getElementById('modal-relatorio-colab');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-relatorio-colab';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
      modal.innerHTML = `
        <div style="background:var(--bg);border-radius:14px;width:100%;max-width:700px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border)">
            <span style="font-size:13px;font-weight:700;color:var(--text)">Relatório Mensal</span>
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
    pedidos.forEach(p => rows.push([p.numero_pedido,p.cliente||'',p.transportadora||'',p.separador_nome||'',p.status,p.itens||0,p.data_pedido||'']));
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
   TEMPO REAL DE SEPARAÇÃO
══════════════════════════════════════════ */
let _tempoSepDados = [];

async function iniciarTempoSep() {
  // Preenche o select de separadores
  try {
    const users = await apiFetch('/usuarios');
    const ativos = (users || []).filter(u => u.status === 'ativo');
    const sel = document.getElementById('tsep-sep');
    if (sel) {
      sel.innerHTML = '<option value="">Todos</option>' +
        ativos.map(u => `<option value="${u.id}">${u.nome}</option>`).join('');
    }
  } catch(e) { console.warn(e); }
  // Filtro padrão: último 7 dias
  const ini = document.getElementById('tsep-ini');
  const fim = document.getElementById('tsep-fim');
  if (ini && !ini.value) {
    const d = new Date(); d.setDate(d.getDate() - 6);
    ini.value = d.toISOString().slice(0,10);
  }
  if (fim && !fim.value) fim.value = hojeLocal();
  carregarTempoSeparacao();
}

function fmtMin(min) {
  if (min === null || min === undefined) return '—';
  const m = Math.round(min);
  if (m < 60) return `${m}min`;
  return `${Math.floor(m/60)}h${String(m%60).padStart(2,'0')}`;
}

async function carregarTempoSeparacao() {
  const ini = document.getElementById('tsep-ini')?.value || '';
  const fim = document.getElementById('tsep-fim')?.value || '';
  const sep = document.getElementById('tsep-sep')?.value || '';
  const tbody = document.getElementById('tbody-tempo-sep');
  if (tbody) tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--text3)">Carregando...</td></tr>';
  try {
    let url = `${API}/pedidos/relatorio/tempo-separacao?`;
    if (ini) url += `data_ini=${ini}&`;
    if (fim) url += `data_fim=${fim}&`;
    if (sep) url += `separador_id=${sep}&`;
    const res = await fetch(url, { credentials:'include' });
    const data = await res.json();
    if (data.erro) { if(tbody) tbody.innerHTML=`<tr><td colspan="10" style="text-align:center;color:var(--red);padding:24px">${data.erro}</td></tr>`; return; }
    _tempoSepDados = data;

    // KPIs
    const kpiEl = document.getElementById('tsep-kpis');
    if (kpiEl && data.length) {
      const comTempo = data.filter(r => r.tempo_real_min !== null);
      const avgReal = comTempo.length ? comTempo.reduce((s,r)=>s+r.tempo_real_min,0)/comTempo.length : 0;
      const avgEspera = comTempo.length ? comTempo.reduce((s,r)=>s+(r.tempo_espera_min||0),0)/comTempo.length : 0;
      const avgItens = data.length ? data.reduce((s,r)=>s+(r.total_itens||0),0)/data.length : 0;
      const comRep = data.filter(r => r.qtd_reposicoes > 0).length;
      kpiEl.innerHTML = `
        <div class="cnt-card verde"><div class="cnt-lbl">PEDIDOS ANALISADOS</div><div class="cnt-val" style="font-size:28px">${data.length}</div><div class="cnt-sub">${comTempo.length} com tempo calculado</div></div>
        <div class="cnt-card azul"><div class="cnt-lbl">TEMPO REAL MÉDIO</div><div class="cnt-val" style="font-size:28px">${fmtMin(avgReal)}</div><div class="cnt-sub">por pedido</div></div>
        <div class="cnt-card amarelo"><div class="cnt-lbl">ESPERA MÉDIA REP.</div><div class="cnt-val" style="font-size:28px">${fmtMin(avgEspera)}</div><div class="cnt-sub">por pedido</div></div>
        <div class="cnt-card roxo"><div class="cnt-lbl">MÉDIA DE ITENS</div><div class="cnt-val" style="font-size:28px">${Math.round(avgItens)}</div><div class="cnt-sub">${comRep} pedidos com reposição</div></div>`;
    } else if (kpiEl) { kpiEl.innerHTML = ''; }

    // Total label
    const tot = document.getElementById('tsep-total');
    if (tot) tot.textContent = `${data.length} pedido(s)`;

    // Tabela
    if (!tbody) return;
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text3)">Nenhum pedido encontrado no período</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(r => {
      const horaIni = (r.iniciado_em||'').replace(/.*T/,'');
      const horaFim = (r.concluido_em||'').replace(/.*T/,'');
      const temRep = r.qtd_reposicoes > 0;
      const realClass = r.tempo_real_min !== null && r.tempo_real_min < 10 ? 'color:var(--green);font-weight:700' :
                        r.tempo_real_min !== null && r.tempo_real_min > 45 ? 'color:var(--red);font-weight:700' : 'font-weight:600';
      return `<tr>
        <td style="font-family:'Space Mono',monospace;font-size:11px;font-weight:700">${r.numero_pedido}</td>
        <td style="font-size:12px">${r.separador_nome}</td>
        <td style="font-size:11px;color:var(--text3)">${r.data_pedido||'—'}</td>
        <td style="font-size:11px;font-family:'Space Mono',monospace">${horaIni||'—'}</td>
        <td style="font-size:11px;font-family:'Space Mono',monospace">${horaFim||'—'}</td>
        <td style="font-size:12px;color:var(--text2)">${fmtMin(r.tempo_total_min)}</td>
        <td style="font-size:12px;color:${temRep?'var(--amber)':'var(--text3)'}">${temRep?fmtMin(r.tempo_espera_min):'—'}</td>
        <td style="${realClass}">${fmtMin(r.tempo_real_min)}</td>
        <td style="text-align:center;font-weight:600">${r.total_itens||0}</td>
        <td style="text-align:center">${r.qtd_reposicoes>0?`<span style="color:var(--amber);font-weight:700">${r.qtd_reposicoes}</span>`:'<span style="color:var(--text3)">—</span>'}</td>
      </tr>`;
    }).join('');
  } catch(e) {
    console.error('carregarTempoSeparacao:', e);
    if(tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--red);padding:24px">Erro ao carregar dados</td></tr>`;
  }
}

function exportarTempoSepExcel() {
  if (!_tempoSepDados.length) { toast('Nenhum dado para exportar!','aviso'); return; }
  try {
    const rows = [['Nº Pedido','Separador','Data','Hora Início','Hora Conclusão','Tempo Total (min)','Aguardou Repositor (min)','Tempo Real Sep. (min)','Total Itens','Reposições','Não Encontrados','Cliente','Transportadora']];
    _tempoSepDados.forEach(r => rows.push([
      r.numero_pedido,
      r.separador_nome,
      r.data_pedido||'',
      (r.iniciado_em||'').replace(/.*T/,''),
      (r.concluido_em||'').replace(/.*T/,''),
      r.tempo_total_min !== null ? parseFloat(r.tempo_total_min) : '',
      parseFloat(r.tempo_espera_min||0),
      r.tempo_real_min !== null ? r.tempo_real_min : '',
      r.total_itens||0,
      r.qtd_reposicoes||0,
      r.qtd_nao_encontrados||0,
      r.cliente||'',
      r.transportadora||''
    ]));
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = rows[0].map((_,ci) => ({ wch: Math.max(...rows.map(r => String(r[ci]||'').length))+2 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tempo Separação');
    XLSX.writeFile(wb, `tempo_separacao_${hojeLocal()}.xlsx`);
    toast('Excel exportado!','sucesso');
  } catch(e) { toast('Erro ao exportar!','erro'); }
}
