/* ══ WMS Miess — Socket.io client ══
   Conecta ao servidor e propaga eventos para as funções de refresh
   existentes, eliminando polling desnecessário.
*/
(function () {
  const script = document.createElement('script');
  script.src = '/socket.io/socket.io.js';
  script.onload = iniciarSocket;
  document.head.appendChild(script);

  function iniciarSocket() {
    const socket = window._wmsSocket = io({ transports: ['websocket', 'polling'], reconnectionDelay: 2000 });

    socket.on('connect', () => console.info('[WMS] Socket conectado:', socket.id));
    socket.on('disconnect', () => console.warn('[WMS] Socket desconectado'));

    // Novo aviso de repositor → atualiza tela de repositor e fila do separador
    socket.on('aviso:novo', () => {
      if (typeof carregarAvisos === 'function') carregarAvisos();
      if (typeof carregarFilaMobile === 'function') carregarFilaMobile();
    });

    // Aviso atualizado (abastecido, reposto, etc.) → mesmas telas
    socket.on('aviso:atualizado', (data) => {
      if (typeof carregarAvisos === 'function') carregarAvisos();
      if (typeof carregarAvisosMobile === 'function') carregarAvisosMobile();
      if (typeof carregarFilaMobile === 'function') carregarFilaMobile();
      if (typeof carregarAvisosSeparador === 'function') carregarAvisosSeparador();
      if (typeof atualizarBadgeLiberacao === 'function') atualizarBadgeLiberacao();
      // Atualiza aba Aguardando quando item vai para protocolo
      if (typeof carregarAguardandoMobile === 'function' &&
          (data?.status === 'nao_encontrado' || data?.status === 'protocolo')) {
        carregarAguardandoMobile();
      }
      // Notifica separador no mobile quando repositor marca Subiu ou Abastecido
      if (typeof usuarioAtual !== 'undefined' && usuarioAtual?.perfil === 'separador') {
        if (data?.status === 'subiu') {
          const ped = data?.numero_pedido ? ` — Pedido #${data.numero_pedido}` : '';
          if (typeof toast === 'function') toast(`Repositor subiu item ao estoque${ped}!`, 'info');
        } else if (data?.status === 'abastecido') {
          const ped = data?.numero_pedido ? ` — Pedido #${data.numero_pedido}` : '';
          if (typeof toast === 'function') toast(`Item abastecido pelo repositor${ped}!`, 'sucesso');
        }
      }
    });

    // Item marcado como não encontrado → atualiza liberação do supervisor em tempo real
    socket.on('liberacao:novo', () => {
      if (typeof carregarLiberacao === 'function') carregarLiberacao();
      if (typeof atualizarBadgeLiberacao === 'function') atualizarBadgeLiberacao();
      // Notificação sonora/visual somente para supervisores logados no desktop
      if (typeof usuarioAtual !== 'undefined' && usuarioAtual?.perfil === 'supervisor') {
        if (typeof toast === 'function') toast('Repositor marcou item como NÃO ENCONTRADO — aguardando liberação!', 'aviso');
        // Pulsa o badge do menu Liberação por 3 segundos
        const badge = document.getElementById('menu-badge-lib');
        if (badge) {
          badge.style.animation = 'pulse 0.6s ease infinite';
          setTimeout(() => { if (badge) badge.style.animation = ''; }, 3000);
        }
      }
    });

    // Pedido concluído → atualiza dashboard e fila
    socket.on('pedido:concluido', (data) => {
      if (typeof carregarFilaMobile === 'function') carregarFilaMobile();
      if (typeof carregarPedidos === 'function') carregarPedidos();
      if (typeof atualizarKPIs === 'function') atualizarKPIs();
      if (typeof carregarFilaCkDesk === 'function') carregarFilaCkDesk();
      // Auto-conclusão pelo repositor: avisa o separador que tinha este pedido aberto
      if (data?.auto && data?.pedido_id &&
          typeof pedidoAtualId !== 'undefined' && pedidoAtualId == data.pedido_id) {
        const num = data.numero_pedido ? ` #${data.numero_pedido}` : '';
        if (typeof toast === 'function') toast(`Pedido${num} concluído pelo repositor!`, 'sucesso');
        pedidoAtualId = null;
        if (typeof pedidoAtualNum !== 'undefined') pedidoAtualNum = null;
        if (typeof itensAtuais !== 'undefined') itensAtuais = [];
        ['cl-wrap','m-cl-wrap'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
        ['cl-status-atual','m-status-atual'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
        if (typeof carregarContadoresSep === 'function') carregarContadoresSep();
        if (typeof carregarStatsMobile === 'function') carregarStatsMobile();
      }
    });

    // Diário enviado → notifica APENAS o supervisor do próximo turno
    socket.on('diario:pendente', (data) => {
      if (typeof usuarioAtual === 'undefined' || usuarioAtual?.perfil !== 'supervisor') return;
      // Exclui o próprio criador do diário
      if (usuarioAtual?.nome === data.supervisor) return;
      // Determina qual turno deve validar (próximo ao turno que criou)
      const NEXT_TURNO = { Manha: 'Tarde', Tarde: 'Noite', Noite: 'Manha' };
      const meuTurno = (usuarioAtual?.turno || '').replace('ã','a').replace('Manh','Manha');
      const turnoQueValida = NEXT_TURNO[data.turno];
      if (turnoQueValida && meuTurno && meuTurno !== turnoQueValida) return;
      const turnoIcon = data.turno==='Manha'?'M':data.turno==='Tarde'?'T':'N';
      if (typeof toast === 'function') {
        toast(`Diário do turno ${data.turno} (${data.supervisor}) aguarda validação! Você tem 30 minutos.`, 'aviso');
      }
      // Atualiza o banner de validação pendente se estiver na tela de diário
      if (typeof verificarValidacaoPendente === 'function') {
        setTimeout(verificarValidacaoPendente, 800);
      }
      // Badge no menu
      const badge = document.getElementById('menu-badge-diario');
      if (badge) { badge.style.display=''; badge.textContent='!'; }
    });

    // Diário validado
    socket.on('diario:validado', (data) => {
      if (typeof usuarioAtual === 'undefined' || usuarioAtual?.perfil !== 'supervisor') return;
      if (typeof toast === 'function') {
        const cor = data.pontuacao>=80?'sucesso':data.pontuacao>=60?'aviso':'erro';
        toast(`Diário validado! Pontuação: ${data.pontuacao}/100`, cor);
      }
      // Atualiza o banner de status se for o autor do diário
      if (typeof atualizarStatusBanner === 'function') {
        atualizarStatusBanner('validado', data.pontuacao);
      }
      if (typeof carregarListaDiarios === 'function') carregarListaDiarios();
    });
  }
})();
