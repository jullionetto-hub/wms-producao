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
    socket.on('aviso:atualizado', () => {
      if (typeof carregarAvisos === 'function') carregarAvisos();
      if (typeof carregarAvisosMobile === 'function') carregarAvisosMobile();
      if (typeof carregarFilaMobile === 'function') carregarFilaMobile();
      if (typeof carregarAvisosSeparador === 'function') carregarAvisosSeparador();
      if (typeof atualizarBadgeLiberacao === 'function') atualizarBadgeLiberacao();
    });

    // Item marcado como não encontrado → atualiza liberação do supervisor em tempo real
    socket.on('liberacao:novo', () => {
      if (typeof carregarLiberacao === 'function') carregarLiberacao();
      if (typeof atualizarBadgeLiberacao === 'function') atualizarBadgeLiberacao();
    });

    // Pedido concluído → atualiza dashboard e fila
    socket.on('pedido:concluido', () => {
      if (typeof carregarFilaMobile === 'function') carregarFilaMobile();
      if (typeof carregarPedidos === 'function') carregarPedidos();
      if (typeof atualizarKPIs === 'function') atualizarKPIs();
    });
  }
})();
