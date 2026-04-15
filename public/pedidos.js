/* ══ PEDIDOS.JS ══ WMS Miess ══ */

async function popularSelects() {
  try {
    const res   = await fetch(`${API}/usuarios`, { credentials:'include' });
    const users = await res.json();
    const seps  = users.filter(u => u.perfil === 'separador');
    todosSeparadores = seps;
    ['filtro-sep-prod','filtro-ped-sep'].forEach(id => {
      const sel = document.getElementById(id); if (!sel) return;
      const val = sel.value;
      sel.innerHTML = '<option value="">Todos</option>' + seps.map(s=>`<option value="${s.id}">${s.nome}</option>`).join('');
      sel.value = val;
    });
  } catch(e) {}
}

async function carregarPedidos() {
  try {
    const ini    = document.getElementById('filtro-ped-ini').value;
    const fim    = document.getElementById('filtro-ped-fim').value;
    const sepId  = document.getElementById('filtro-ped-sep').value;
    const status = document.getElementById('filtro-ped-status').value;
    const numPed = document.getElementById('filtro-ped-num').value.trim();
    let url = `${API}/pedidos?`;
    if (sepId)  url += `separador_id=${sepId}&`;
    if (status) url += `status=${encodeURIComponent(status)}&`;
    if (numPed) url += `numero_pedido=${encodeURIComponent(numPed)}&`;
    const res = await fetch(url);
    let ps    = await res.json();
    if (ini) ps = ps.filter(p => p.data_pedido >= ini);
    if (fim) ps = ps.filter(p => p.data_pedido <= fim);
    const tbody = document.getElementById('tbody-ped');
    if (!ps.length) { tbody.innerHTML = '<tr><td colspan="7" style="color:var(--text3);text-align:center;padding:28px">Nenhum pedido</td></tr>'; return; }
    tbody.innerHTML = ps.map(p=>`<tr>
      <td style="font-weight:600;color:var(--text)">${p.numero_pedido}</td>
      <td>${p.separador_nome||'—'}</td>
      <td><span class="pill ${(p.status||'').replace(' ','-')}">${p.status}</span></td>
      <td>${p.itens||'—'}</td>
      <td class="data-br">${formatarData(p.data_pedido)}</td>
      <td class="hora-br">${p.hora_pedido||'—'}</td>
      <td>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${(p.peso||0)>0?`<span style="font-size:10px;font-weight:700;color:${(p.peso||0)>=30?'var(--red)':(p.peso||0)>=15?'var(--amber)':'var(--green)'}">⚡ ${p.peso||0} pts &nbsp;•&nbsp; 🛣️ ${p.corredores_count||0} ruas &nbsp;•&nbsp; 📦 ${p.unidades_total||0} un.</span>`:''}
          <select class="sel-sm" onchange="atribuirSeparador(${p.id},this.value)" id="sel-sep-${p.id}">
            <option value="">— atribuir —</option>
            ${todosSeparadores.map(s=>`<option value="${s.id}"${p.separador_id==s.id?' selected':''}>${s.nome}</option>`).join('')}
          </select>
        </div>
      </td>
    </tr>`).join('');
  } catch(e) {}
}

async function atribuirSeparador(pid, sid) {
  if (!sid) return;
  try {
    await fetch(`${API}/pedidos/${pid}/separador`, { credentials:'include', method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({separador_id:sid}) });
    toast('Usuário atribuído!', 'sucesso');
  } catch(e) { toast('Erro ao atribuir!', 'erro'); }
}

async function distribuirPedidos() {
  const pendentes = document.querySelectorAll('#tbody-pedidos tr').length;
  if (!confirm('Distribuir todos os pedidos pendentes automaticamente entre os separadores ativos?')) return;
  try {
    const res  = await fetch(`${API}/distribuir-pedidos`, {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'}
    });
    const data = await res.json();
    if (data.erro) { toast(data.erro,'erro'); return; }

    // Mostra resumo da distribuição
    let resumoHtml = Object.entries(data.resumo||{})
      .map(([sep,qtd]) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
        <span style="font-weight:600">👤 ${sep}</span>
        <span style="color:var(--accent);font-weight:700">${qtd} pedido${qtd>1?'s':''}</span>
      </div>`).join('');

    const msg = document.createElement('div');
    msg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--surface);border-radius:16px;padding:24px;max-width:400px;width:90%;z-index:9999;box-shadow:0 20px 60px rgba(0,0,0,.3)';
    msg.innerHTML = `
      <div style="font-family:'Space Mono',monospace;font-size:16px;color:var(--text);margin-bottom:16px">✅ Distribuição Concluída!</div>
      <div style="font-size:13px;color:var(--text3);margin-bottom:12px">${data.distribuidos} pedidos distribuídos</div>
      <div style="background:var(--surface2);border-radius:10px;padding:10px 14px;margin-bottom:16px">${resumoHtml}</div>
      <button class="btn btn-primary" style="width:100%" onclick="this.parentNode.remove();carregarPedidos()">OK</button>`;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998';
    overlay.onclick = () => { overlay.remove(); msg.remove(); carregarPedidos(); };
    document.body.appendChild(overlay);
    document.body.appendChild(msg);
  } catch(e) { toast('Erro ao distribuir!','erro'); }
}

function trocarPedidosTab(tab) {
  ['lista','importar','metas'].forEach(t => {
    const el  = document.getElementById(`ped-tab-${t}`);
    const btn = document.getElementById(`btn-ped-tab-${t}`);
    if (el)  el.style.display  = t === tab ? 'block' : 'none';
    if (btn) btn.className = t === tab ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm';
  });
  if (tab === 'importar') renderHistorico();
  if (tab === 'metas')    { carregarMetas(); carregarPlacarHoje(); }
}

async function carregarPedidosBloqueados() {
  try {
    const res  = await fetch(`${API}/pedidos/bloqueados`, { credentials:'include' });
    const rows = await res.json();
    const wrap = document.getElementById('dash-bloqueados-wrap');
    const lista= document.getElementById('lista-bloqueados');
    // Atualiza badge no menu Pedidos
    const badge = document.getElementById('menu-badge-bloq');
    if (badge) { badge.textContent = rows.length; badge.style.display = rows.length > 0 ? 'inline' : 'none'; }
    if (!wrap || !lista) return;
    if (!rows.length) { wrap.style.display='none'; return; }
    wrap.style.display = 'block';
    lista.innerHTML = rows.map(r => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-bottom:1px solid #FECACA;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-weight:700;color:var(--red);font-size:14px">⛔ Pedido #${r.numero_pedido}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">
            👤 ${r.separador_nome||'—'} &nbsp;•&nbsp; 
            Itens bloqueados: <b style="color:var(--text)">${r.codigos_bloqueados||'—'}</b>
          </div>
        </div>
        <button class="btn btn-success btn-sm" onclick="desbloquearPedido(${r.id},'${r.numero_pedido}')">✅ Liberar Pedido</button>
      </div>`).join('');
  } catch(e) {}
}

async function desbloquearPedido(id, num) {
  if (!confirm(`Liberar pedido #${num}? Ele será marcado como concluído.`)) return;
  try {
    await fetch(`${API}/pedidos/${id}/desbloquear`, { credentials:'include', method:'PUT' });
    toast(`✅ Pedido #${num} liberado!`,'sucesso');
    carregarPedidosBloqueados();
    carregarKPIs();
  } catch(e) { toast('Erro!','erro'); }
}

function exportarExcel(tipo) {
  let rows = [];
  let nomeArq = 'exportacao';
  try {
    if (tipo === 'pedidos') {
      rows = [['Nº Pedido','Usuário','Status','Itens','Data','Hora']];
      document.querySelectorAll('#tbody-ped tr').forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length > 1) rows.push([tds[0].textContent.trim(), tds[1].textContent.trim(), tds[2].textContent.trim(), tds[3].textContent.trim(), tds[4].textContent.trim(), tds[5].textContent.trim()]);
      });
      nomeArq = `pedidos_${hoje}`;
    } else if (tipo === 'estatisticas') {
      rows = [['Separador','Hoje','Mês','Ano','Status']];
      document.querySelectorAll('#tbody-est-sep tr').forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length > 1) rows.push([tds[0].textContent.trim(), tds[1].textContent.trim(), tds[2].textContent.trim(), tds[3].textContent.trim(), tds[4].textContent.trim()]);
      });
      nomeArq = `estatisticas_separadores_${hoje}`;
    } else if (tipo === 'stats-repositor') {
      rows = [['Repositor','Hoje','Repostos','Não Encontrados','Total']];
      document.querySelectorAll('#tbody-srep-prod tr').forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length > 1) rows.push([tds[0].textContent.trim(), tds[1].textContent.trim(), tds[2].textContent.trim(), tds[3].textContent.trim(), tds[4].textContent.trim()]);
      });
      nomeArq = `estatisticas_repositor_${hoje}`;
    } else if (tipo === 'checkout-lista') {
      rows = [['Caixa','Nº Pedido','Separador','Status','Hora']];
      document.querySelectorAll('#tbody-checkout tr').forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length > 1) rows.push([tds[0].textContent.trim(), tds[1].textContent.trim(), tds[2].textContent.trim(), tds[3].textContent.trim(), tds[4].textContent.trim()]);
      });
      nomeArq = `checkouts_${hoje}`;
    } else if (tipo === 'stats-checkout') {
      rows = [['Caixa','Nº Pedido','Separador','Status','Data','Hora']];
      document.querySelectorAll('#tbody-sck-lista tr').forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length > 1) rows.push([tds[0].textContent.trim(), tds[1].textContent.trim(), tds[2].textContent.trim(), tds[3].textContent.trim(), tds[4].textContent.trim(), tds[5].textContent.trim()]);
      });
      nomeArq = `stats_checkout_${hoje}`;
    }
    if (rows.length <= 1) { toast('Nenhum dado para exportar!','aviso'); return; }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dados');
    XLSX.writeFile(wb, `${nomeArq}.xlsx`);
    toast('✅ Excel exportado!','sucesso');
  } catch(e) { toast('Erro ao exportar!','erro'); }
}

async function carregarPlacarHoje() {
  const lista = document.getElementById('placar-hoje-lista');
  if (!lista) return;
  try {
    const res  = await fetch(`${API}/produtividade`, { credentials:'include' });
    const data = await res.json();
    const seps = data.dados || data || [];
    // Load metas
    const cfgRes = await fetch(`${API}/configuracoes`, { credentials:'include' });
    const cfg = await cfgRes.json();
    const metaPts = parseInt(cfg.meta_pontos_dia)||300;
    const metaPed = parseInt(cfg.meta_pedidos_dia)||25;

    if (!seps.length) { lista.innerHTML='<div style="color:var(--text3);text-align:center;padding:20px">Nenhum separador</div>'; return; }

    lista.innerHTML = seps.filter(s=>s.status==='ativo').map(s => {
      const pctPed = Math.min(Math.round(((s.hoje||0)/metaPed)*100),100);
      const pctPts = Math.min(Math.round(((s.pontos_hoje||0)/metaPts)*100),100);
      const corPed = pctPed>=100?'var(--green)':pctPed>=70?'var(--amber)':'var(--accent)';
      const corPts = pctPts>=100?'var(--green)':pctPts>=70?'var(--amber)':'var(--accent)';
      return `<div style="padding:12px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-weight:700;color:var(--text)">${s.nome}</span>
          <div style="display:flex;gap:8px">
            <span style="font-size:12px;font-weight:700;color:${corPed}">📦 ${s.hoje||0}/${metaPed}</span>
            <span style="font-size:12px;font-weight:700;color:${corPts}">⚡ ${s.pontos_hoje||0}/${metaPts}</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:11px;color:var(--text3);width:60px">Pedidos</span>
            <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
              <div style="width:${pctPed}%;height:100%;background:${corPed};border-radius:3px;transition:width .5s"></div>
            </div>
            <span style="font-size:11px;font-weight:700;color:${corPed};width:30px;text-align:right">${pctPed}%</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:11px;color:var(--text3);width:60px">Pontos</span>
            <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
              <div style="width:${pctPts}%;height:100%;background:${corPts};border-radius:3px;transition:width .5s"></div>
            </div>
            <span style="font-size:11px;font-weight:700;color:${corPts};width:30px;text-align:right">${pctPts}%</span>
          </div>
        </div>
      </div>`;
    }).join('');
  } catch(e) {}
}

async function carregarFila() {
  try {
    const res   = await fetch(`${API}/pedidos`, { credentials:'include' });
    const todos = await res.json();
    const ativos = todos.filter(p=>p.status!=='concluido');
    const meus   = separadorAtual ? ativos.filter(p=>p.separador_id===separadorAtual.id) : [];
    const bdFila = document.getElementById('badge-fila-d');
    const bdMeus = document.getElementById('badge-meus-d');
    if (bdFila) bdFila.textContent = `${ativos.length} total`;
    if (bdMeus) bdMeus.textContent = meus.length > 0 ? `${meus.length} meus` : '';
    const html = !ativos.length
      ? '<tr><td colspan="5" style="color:var(--text3);text-align:center;padding:18px">Nenhum pedido na fila</td></tr>'
      : ativos.map(p => {
          const eMeu = separadorAtual && p.separador_id===separadorAtual.id;
          const ocup = separadorAtual && p.separador_id && p.separador_id!==separadorAtual.id;
          const sit  = eMeu?`<span class="pill separando">Meu</span>`:ocup?`<span class="pill falta">Ocupado</span>`:`<span class="pill pendente">Livre</span>`;
          const clk  = !ocup ? `onclick="selecionarPedidoFila('${p.numero_pedido}')" style="cursor:pointer"` : '';
          // Peso visual
          const peso = p.peso || 0;
          // Thresholds ajustados para pontuação com dificuldade de corredor
          const pesoCor = peso>=50?'var(--red)':peso>=20?'var(--amber)':'var(--green)';
          const pesoLabel = peso>=50?'🔴 Pesado':peso>=20?'🟡 Médio':'🟢 Leve';
          return `<tr class="${eMeu?'meu':''}" ${clk}>
            <td style="font-weight:${eMeu?700:400};color:${eMeu?'var(--accent)':'var(--text)'}">${p.numero_pedido}</td>
            <td>${p.itens||'—'}</td>
            <td style="font-size:11px">
              <span style="color:${pesoCor};font-weight:700">${pesoLabel}</span>
              <span style="color:var(--text3);margin-left:4px">${peso}pts</span>
            </td>
            <td><span class="pill ${(p.status||'').replace(' ','-')}">${p.status}</span></td>
            <td>${sit}</td>
          </tr>`;
        }).join('');
    const el = document.getElementById('tbody-fila-d');
    if (el) el.innerHTML = html;
  } catch(e) {}
}

function selecionarPedidoFila(num) {
  document.getElementById('input-pedido').value = num;
  confirmarPedido();
}

function selecionarPedidoFilaMobile(num) {
  mudarTabSep('separar');
  document.getElementById('m-input-pedido').value = num;
  confirmarPedidoMobile();
}