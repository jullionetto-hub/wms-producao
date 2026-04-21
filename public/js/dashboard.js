﻿/* ══════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════ */

/* ══════════════════════════════════════════
   MAPA DO ESTOQUE — DASHBOARD (redesign)
══════════════════════════════════════════ */

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
    // Busca todos os pedidos de hoje
    const res = await fetch(`${API}/pedidos?data=${hoje}`, { credentials:'include' });
    const pedidos = await res.json();

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
    const seps = Object.values(porSep).sort((a,b)=>b.concluidos-a.concluidos);
    const maxConc = Math.max(...seps.map(s=>s.concluidos), 1);
    const medalhas = ['🥇','🥈','🥉'];

    // Ranking
    const rankEl = document.getElementById('op-ranking');
    if (rankEl) {
      if (!seps.length) {
        rankEl.innerHTML = '<div style="color:var(--text3);text-align:center;padding:20px;font-size:13px">Nenhum pedido concluído ainda</div>';
      } else {
        rankEl.innerHTML = seps.map((s,i) => `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:0.5px solid var(--border)">
            <div style="font-size:20px;width:28px;text-align:center">${medalhas[i]||'#'+(i+1)}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;color:var(--text)">${s.nome}</div>
              <div style="height:6px;background:var(--surface2);border-radius:3px;margin-top:4px;overflow:hidden">
                <div style="height:100%;background:${i===0?'linear-gradient(90deg,#F59E0B,#FCD34D)':i===1?'linear-gradient(90deg,#94A3B8,#CBD5E1)':i===2?'linear-gradient(90deg,#C2410C,#FB923C)':'linear-gradient(90deg,#2563EB,#60A5FA)'};width:${Math.round((s.concluidos/maxConc)*100)}%;border-radius:3px"></div>
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-size:18px;font-weight:700;color:var(--green)">${s.concluidos}</div>
              <div style="font-size:10px;color:var(--text3)">pedidos</div>
            </div>
          </div>`).join('');
      }
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
  const el = document.getElementById('dash-ultima-atualizacao');
  if (el) el.textContent = '— atualizado ' + new Date().toLocaleTimeString('pt-BR', {timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'});
}




async function carregarKPIs() {
  try {
    const res  = await fetch(`${API}/kpis`, { credentials:'include' });
    const data = await res.json();
    const set  = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val ?? 0; };
    set('dash-hoje',       data.concluidos_hoje);
    set('dash-separando',  data.em_separacao);
    set('dash-repositor',  data.faltas_abertas);
    set('dash-pendentes',  data.pendentes);
    set('kpi-ck-hoje',     data.checkout_hoje);
    set('kpi-ck-pend',     data.checkout_pendente);
    set('kpi-seps-ativos', data.seps_ativos);
    set('kpi-nao-enc',     data.nao_encontrados_hoje);
  } catch(e) {}
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
  } catch(e) {}
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
  } catch(e) {}
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
  } catch(e) {}
}




/* ══════════════════════════════════════════
   ESTATÍSTICAS REPOSITOR (desktop)
══════════════════════════════════════════ */
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




/* ══════════════════════════════════════════
   ESTATÍSTICAS CHECKOUT (desktop)
══════════════════════════════════════════ */
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




/* ══════════════════════════════════════════
   PERFORMANCE DOS COLABORADORES
══════════════════════════════════════════ */
async function carregarPerformance() {
  const ini    = document.getElementById('perf-ini')?.value || '';
  const fim    = document.getElementById('perf-fim')?.value || '';
  const perfil = document.getElementById('perf-perfil')?.value || '';
  const hoje   = hojeLocal();
  const mes    = hoje.substring(0,7);
  const ano    = hoje.substring(0,4);

  try {
    // ── Separadores ──────────────────────────────────────────
    const resSep = await fetch(`${API}/produtividade`, { credentials:'include' });
    const seps   = resSep.ok ? await resSep.json() : [];

    // Pedidos do período para calcular itens e faltas
    let urlPed = `${API}/pedidos?status=concluido`;
    if (ini && fim) urlPed += `&data_ini=${ini}&data_fim=${fim}`;
    const resPed = await fetch(urlPed, { credentials:'include' });
    const pedidos = resPed.ok ? await resPed.json() : [];

    // Faltas por separador
    const resAv = await fetch(`${API}/repositor/avisos`, { credentials:'include' });
    const avisos = resAv.ok ? await resAv.json() : [];

    // Agrupa pedidos por separador
    const pedPorSep = {};
    pedidos.forEach(p => {
      const nome = p.separador_nome || '';
      if (!pedPorSep[nome]) pedPorSep[nome] = { pedidos:0, itens:0, pontuacao:0 };
      pedPorSep[nome].pedidos++;
      pedPorSep[nome].itens += (p.itens || 0);
      pedPorSep[nome].pontuacao += (p.pontuacao || 0);
    });

    // Faltas por separador
    const faltasPorSep = {};
    let filtroAv = avisos;
    if (ini && fim) filtroAv = avisos.filter(a => a.data_aviso >= ini && a.data_aviso <= fim);
    filtroAv.forEach(a => {
      const nome = a.separador_nome || '';
      if (!faltasPorSep[nome]) faltasPorSep[nome] = 0;
      faltasPorSep[nome]++;
    });

    const tbSep = document.getElementById('perf-tbody-sep');
    if (tbSep) {
      if (!seps.length) {
        tbSep.innerHTML = '<tr><td colspan="9" style="color:var(--text3);text-align:center;padding:16px">Nenhum separador cadastrado</td></tr>';
      } else {
        tbSep.innerHTML = seps.map(s => {
          const sp = pedPorSep[s.nome] || { pedidos:0, itens:0, pontuacao:0 };
          const faltas = faltasPorSep[s.nome] || 0;
          return `<tr>
            <td style="font-weight:700">${s.nome}</td>
            <td style="color:var(--green);font-weight:700">${s.hoje||0}</td>
            <td style="color:var(--amber)">${s.mes||0}</td>
            <td style="color:var(--accent)">${s.total_ano||0}</td>
            <td style="color:var(--indigo);font-weight:600">${sp.pedidos}</td>
            <td>${sp.itens}</td>
            <td style="color:${faltas>0?'var(--red)':'var(--green)'}">${faltas}</td>
            <td style="color:var(--text3)">${s.pontuacao_total||0}</td>
            <td><span class="pill ${s.status}">${s.status}</span></td>
          </tr>`;
        }).join('');
      }
    }

    // Totais resumo
    const totPed  = seps.reduce((s,r)=>s+(r.total_ano||0),0);
    const totItens = Object.values(pedPorSep).reduce((s,r)=>s+r.itens,0);
    const totFalt = Object.values(faltasPorSep).reduce((s,r)=>s+r,0);
    const el = id => document.getElementById(id);
    if(el('perf-total-pedidos')) el('perf-total-pedidos').textContent = totPed;
    if(el('perf-total-itens'))   el('perf-total-itens').textContent   = totItens;
    if(el('perf-total-faltas'))  el('perf-total-faltas').textContent  = totFalt;

    // ── Repositores ──────────────────────────────────────────
    const resRepEst = await fetch(`${API}/estatisticas/repositor`, { credentials:'include' });
    const repEst = resRepEst.ok ? await resRepEst.json() : {};
    const prod   = repEst.produtividade || [];

    // Repositores do período
    const repPeriodo = {};
    if (ini && fim) {
      avisos.filter(a=>a.repositor_nome && a.data_aviso>=ini && a.data_aviso<=fim).forEach(a=>{
        if(!repPeriodo[a.repositor_nome]) repPeriodo[a.repositor_nome]={total:0,repostos:0,nao:0};
        repPeriodo[a.repositor_nome].total++;
        if(a.status==='reposto') repPeriodo[a.repositor_nome].repostos++;
        if(a.status==='nao_encontrado') repPeriodo[a.repositor_nome].nao++;
      });
    }

    const tbRep = document.getElementById('perf-tbody-rep');
    if (tbRep) {
      if (!prod.length) {
        tbRep.innerHTML = '<tr><td colspan="8" style="color:var(--text3);text-align:center;padding:16px">Nenhuma atividade de reposição</td></tr>';
      } else {
        tbRep.innerHTML = prod.map(r => {
          const per = repPeriodo[r.nome] || {total:0,repostos:0,nao:0};
          return `<tr>
            <td style="font-weight:700">${r.nome}</td>
            <td style="color:var(--green);font-weight:700">${r.hoje||0}</td>
            <td style="color:var(--amber)">${repEst.repostos_mes||0}</td>
            <td style="color:var(--accent)">${r.total||0}</td>
            <td style="color:var(--indigo)">${per.total}</td>
            <td style="color:var(--green)">${r.repostos||0}</td>
            <td style="color:var(--red)">${r.nao_encontrados||0}</td>
            <td><span class="pill ativo">ativo</span></td>
          </tr>`;
        }).join('');
      }
    }

    // ── Checkout ──────────────────────────────────────────────
    const resCkEst = await fetch(`${API}/estatisticas/checkout`, { credentials:'include' });
    const ckEst = resCkEst.ok ? await resCkEst.json() : {};
    if(el('perf-total-ck')) el('perf-total-ck').textContent = ckEst.concluidos_hoje||0;

    const resCkLst = await fetch(`${API}/checkout?status=concluido`, { credentials:'include' });
    const ckLst = resCkLst.ok ? await resCkLst.json() : [];

    // Agrupa checkout por operador (separador_nome que fez o checkout)
    const ckPorOp = {};
    ckLst.forEach(ck => {
      const nome = ck.separador_nome_join || ck.separador_nome || 'Desconhecido';
      if(!ckPorOp[nome]) ckPorOp[nome]={hoje:0,mes:0,ano:0,periodo:0};
      if(ck.data_checkout===hoje) ckPorOp[nome].hoje++;
      if(ck.data_checkout?.startsWith(mes)) ckPorOp[nome].mes++;
      if(ck.data_checkout?.startsWith(ano)) ckPorOp[nome].ano++;
      if(ini&&fim&&ck.data_checkout>=ini&&ck.data_checkout<=fim) ckPorOp[nome].periodo++;
    });

    const tbCk = document.getElementById('perf-tbody-ck');
    if (tbCk) {
      const ops = Object.entries(ckPorOp).sort((a,b)=>b[1].ano-a[1].ano);
      if (!ops.length) {
        tbCk.innerHTML = '<tr><td colspan="5" style="color:var(--text3);text-align:center;padding:16px">Nenhum checkout registrado</td></tr>';
      } else {
        tbCk.innerHTML = ops.map(([nome,d]) => `<tr>
          <td style="font-weight:700">${nome}</td>
          <td style="color:var(--green);font-weight:700">${d.hoje}</td>
          <td style="color:var(--amber)">${d.mes}</td>
          <td style="color:var(--accent)">${d.ano}</td>
          <td style="color:var(--indigo)">${d.periodo}</td>
        </tr>`).join('');
      }
    }

  } catch(e) { console.error('Erro performance:', e); }
}

function exportarPerformanceExcel() {
  try {
    const rows = [['COLABORADOR','HOJE','MÊS','ANO','PERÍODO','ITENS','FALTAS','PONTUAÇÃO','STATUS']];
    document.querySelectorAll('#perf-tbody-sep tr').forEach(tr => {
      const tds = tr.querySelectorAll('td');
      if(tds.length>1) rows.push(Array.from(tds).map(td=>td.textContent.trim()));
    });
    if(rows.length<=1){toast('Nenhum dado!','aviso');return;}
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = rows[0].map((_,ci)=>({wch:Math.max(...rows.map(r=>String(r[ci]||'').length))+2}));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'Separadores');
    XLSX.writeFile(wb, `performance_${hojeLocal()}.xlsx`);
    toast('Excel exportado!','sucesso');
  } catch(e){toast('Erro ao exportar!','erro');}
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
  if ((acao==='nao_encontrado'||acao==='protocolo') && !confirm(`Confirmar: ${acao==='nao_encontrado'?'Não encontrado':'Protocolo'}? O supervisor será notificado.`)) return;
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
}
// Compatibilidade
async function marcarReposto(id,q){ await marcarAviso(id,q,'encontrado'); }
async function marcarNaoEncontrado(id){ await marcarAviso(id,0,'nao_encontrado'); }
async function marcarProtocolo(id){ await marcarAviso(id,0,'protocolo'); }




/* ══════════════════════════════════════════
   ESTATÍSTICAS
══════════════════════════════════════════ */
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