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
          if (typeof toast === 'function') toast(`📦 Repositor subiu item ao estoque${ped}!`, 'info');
        } else if (data?.status === 'abastecido') {
          const ped = data?.numero_pedido ? ` — Pedido #${data.numero_pedido}` : '';
          if (typeof toast === 'function') toast(`✅ Item abastecido pelo repositor${ped}!`, 'sucesso');
        }
      }
    });

    // Item marcado como não encontrado → atualiza liberação do supervisor em tempo real
    socket.on('liberacao:novo', () => {
      if (typeof carregarLiberacao === 'function') carregarLiberacao();
      if (typeof atualizarBadgeLiberacao === 'function') atualizarBadgeLiberacao();
      // Notificação sonora/visual somente para supervisores logados no desktop
      if (typeof usuarioAtual !== 'undefined' && usuarioAtual?.perfil === 'supervisor') {
        if (typeof toast === 'function') toast('⚠️ Repositor marcou item como NÃO ENCONTRADO — aguardando liberação!', 'aviso');
        // Pulsa o badge do menu Liberação por 3 segundos
        const badge = document.getElementById('menu-badge-lib');
        if (badge) {
          badge.style.animation = 'pulse 0.6s ease infinite';
          setTimeout(() => { if (badge) badge.style.animation = ''; }, 3000);
        }
      }
    });

    // Pedido concluído → atualiza dashboard e fila
    socket.on('pedido:concluido', () => {
      if (typeof carregarFilaMobile === 'function') carregarFilaMobile();
      if (typeof carregarPedidos === 'function') carregarPedidos();
      if (typeof atualizarKPIs === 'function') atualizarKPIs();
    });

    // Diário enviado → notifica supervisores do próximo turno
    socket.on('diario:pendente', (data) => {
      if (typeof usuarioAtual === 'undefined' || usuarioAtual?.perfil !== 'supervisor') return;
      const turnoIcon = data.turno==='Manha'?'☀️':data.turno==='Tarde'?'🌅':'🌙';
      if (typeof toast === 'function') {
        toast(`📋 Diário do turno ${turnoIcon} ${data.turno} (${data.supervisor}) aguarda validação! Você tem 10 minutos.`, 'aviso');
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
        toast(`✅ Diário validado! Pontuação: ${data.pontuacao}/100`, cor);
      }
      // Atualiza o banner de status se for o autor do diário
      if (typeof atualizarStatusBanner === 'function') {
        atualizarStatusBanner('validado', data.pontuacao);
      }
      if (typeof carregarListaDiarios === 'function') carregarListaDiarios();
    });
  }
})();
