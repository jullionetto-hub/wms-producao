/* ══════════════════════════════════════════════════════════════════
   PROTOCOLO — SUPERVISOR
   Tela de liberação de itens não encontrados pelo repositor.
   Alterações:
   - Dois botões: Liberar como Encontrado / Liberar como Não Encontrado
   - Botão com proteção contra clique múltiplo (disabled após 1 click)
   - Ao liberar, atualiza o aviso_status do item para que o separador
     desbloqueie o botão CONCLUIR
══════════════════════════════════════════════════════════════════ */

/**
 * Carrega a lista de itens aguardando liberação do supervisor
 * (status === 'nao_encontrado')
 */
async function carregarProtocoloSupervisor() {
  const el = document.getElementById('protocolo-lista');
  if (!el) return;
  el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text3)">⏳ Carregando...</div>`;
  try {
    const res = await fetch(`${API}/repositor/avisos?status=nao_encontrado`, { credentials:'include' });
    if (!res.ok) throw new Error();
    const avisos = await res.json();

    // Atualiza badge do menu lateral
    const badge = document.getElementById('protocolo-badge');
    if (badge) {
      badge.textContent = avisos.length;
      badge.style.display = avisos.length ? 'inline-flex' : 'none';
    }

    if (!avisos.length) {
      el.innerHTML = `<div style="text-align:center;padding:60px 20px">
        <div style="font-size:48px;margin-bottom:12px">✅</div>
        <div style="font-size:15px;color:var(--text3);font-weight:500">Nenhum item aguardando liberação</div>
      </div>`;
      return;
    }

    el.innerHTML = avisos.map(a => renderCardProtocolo(a)).join('');
  } catch(e) {
    el.innerHTML = `<div style="color:#ef4444;text-align:center;padding:24px">Erro ao carregar itens</div>`;
  }
}

/**
 * Renderiza um card de item aguardando liberação
 */
function renderCardProtocolo(a) {
  const nomeLogado = (usuarioAtual?.nome || '').replace(/'/g, "\\'");
  return `
    <div id="protocolo-card-${a.id}" style="background:var(--surface);border:1px solid #ddd6fe;border-left:4px solid #7c3aed;border-radius:12px;padding:16px;margin-bottom:12px">
      <!-- Cabeçalho -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
        <div style="flex:1;min-width:0">
          <div style="font-size:16px;font-weight:700;color:var(--text);font-family:'Space Mono',monospace;margin-bottom:2px">${a.codigo||'—'}</div>
          <div style="font-size:12px;color:var(--text2);line-height:1.4">${a.descricao||''}</div>
        </div>
        <span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;background:#f5f3ff;color:#7c3aed;border:1px solid #ddd6fe;flex-shrink:0;margin-left:10px">⛔ Protocolo</span>
      </div>
      <!-- Dados do pedido -->
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
        ${a.numero_pedido ? `<span style="background:var(--surface2);border-radius:8px;padding:3px 10px;font-size:11px;font-weight:600;color:var(--text2)">📋 Pedido #${a.numero_pedido}</span>` : ''}
        ${a.separador_nome ? `<span style="background:var(--surface2);border-radius:8px;padding:3px 10px;font-size:11px;color:var(--text2)">👤 ${a.separador_nome}</span>` : ''}
        ${a.quantidade ? `<span style="background:#fee2e2;border-radius:8px;padding:3px 10px;font-size:11px;font-weight:700;color:#dc2626">${a.quantidade} un</span>` : ''}
        ${a.endereco ? `<span style="background:var(--surface2);border-radius:8px;padding:3px 10px;font-size:10px;color:var(--text3)">📍 ${a.endereco}</span>` : ''}
      </div>
      <!-- Info repositor -->
      ${a.quem_pegou ? `<div style="font-size:11px;color:var(--text3);margin-bottom:10px">Registrado por: <strong style="color:var(--text2)">${a.quem_pegou}</strong>${a.hora_aviso ? ` às ${a.hora_aviso}` : ''}</div>` : ''}
      <!-- Dois botões de liberação -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <button
          id="protocolo-btn-enc-${a.id}"
          onclick="liberarProtocolo(${a.id},'encontrado','${nomeLogado}',this)"
          style="padding:12px 0;background:#f0fdf4;border:2px solid #16a34a;border-radius:10px;color:#15803d;font-weight:700;font-size:13px;cursor:pointer;transition:all .15s">
          ✅ Liberar como Encontrado
        </button>
        <button
          id="protocolo-btn-nenc-${a.id}"
          onclick="liberarProtocolo(${a.id},'nao_encontrado_confirmado','${nomeLogado}',this)"
          style="padding:12px 0;background:#fef2f2;border:2px solid #dc2626;border-radius:10px;color:#b91c1c;font-weight:700;font-size:13px;cursor:pointer;transition:all .15s">
          ❌ Liberar como Não Encontrado
        </button>
      </div>
    </div>`;
}

/**
 * Executa a liberação do item pelo supervisor
 * @param {number} id       - ID do aviso de repositor
 * @param {string} decisao  - 'encontrado' ou 'nao_encontrado_confirmado'
 * @param {string} supervisor - nome do supervisor logado
 * @param {HTMLElement} btn - botão clicado (para proteção contra duplo click)
 */
async function liberarProtocolo(id, decisao, supervisor, btn) {
  // ── Proteção contra clique múltiplo ──
  if (btn.disabled) return;
  btn.disabled = true;
  const txtOriginal = btn.textContent;
  btn.textContent = '⏳ Salvando...';

  // Desabilita também o outro botão do par
  const outroId = btn.id.includes('btn-enc-')
    ? `protocolo-btn-nenc-${id}`
    : `protocolo-btn-enc-${id}`;
  const outro = document.getElementById(outroId);
  if (outro) outro.disabled = true;

  try {
    // Status final do aviso:
    //   'encontrado_supervisor' → repositor achou mas não registrou, supervisor confirma
    //   'nao_encontrado'        → item confirmado como não encontrado, libera o concluir
    const novoStatus = decisao === 'encontrado'
      ? 'encontrado_supervisor'
      : 'nao_encontrado';

    const res = await fetch(`${API}/repositor/avisos/${id}`, {
      credentials: 'include',
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        situacao:    novoStatus,
        status:      novoStatus,
        quem_pegou:  supervisor,
        supervisor_liberou: true,
        supervisor_nome:    supervisor,
        decisao_supervisor: decisao
      })
    });

    if (res.ok) {
      toast(
        decisao === 'encontrado'
          ? '✅ Item liberado como Encontrado!'
          : '❌ Item liberado como Não Encontrado — separador desbloqueado!',
        'success'
      );
      // Remove o card da lista com animação suave
      const card = document.getElementById(`protocolo-card-${id}`);
      if (card) {
        card.style.transition = 'opacity .3s, transform .3s';
        card.style.opacity = '0';
        card.style.transform = 'translateX(20px)';
        setTimeout(() => { card.remove(); _atualizarContagemProtocolo(); }, 300);
      }
    } else {
      toast('Erro ao liberar item', 'danger');
      // Reabilita botões em caso de erro
      btn.disabled = false;
      btn.textContent = txtOriginal;
      if (outro) outro.disabled = false;
    }
  } catch(e) {
    toast('Sem conexão', 'danger');
    btn.disabled = false;
    btn.textContent = txtOriginal;
    if (outro) outro.disabled = false;
  }
}

/**
 * Atualiza a contagem no badge do menu e no título da seção
 */
function _atualizarContagemProtocolo() {
  const el = document.getElementById('protocolo-lista');
  if (!el) return;
  const cards = el.querySelectorAll('[id^="protocolo-card-"]');
  const n = cards.length;
  const badge = document.getElementById('protocolo-badge');
  if (badge) {
    badge.textContent = n;
    badge.style.display = n ? 'inline-flex' : 'none';
  }
  if (!n) {
    el.innerHTML = `<div style="text-align:center;padding:60px 20px">
      <div style="font-size:48px;margin-bottom:12px">✅</div>
      <div style="font-size:15px;color:var(--text3);font-weight:500">Nenhum item aguardando liberação</div>
    </div>`;
  }
}

// Auto-refresh a cada 30s quando a seção está visível
setInterval(() => {
  const secao = document.getElementById('sec-protocolo');
  if (secao && secao.style.display !== 'none' && secao.classList.contains('ativa')) {
    carregarProtocoloSupervisor();
  }
}, 30000);
