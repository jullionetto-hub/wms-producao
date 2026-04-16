/* ══ STARTUP.JS ══ WMS Miess — Inicialização ══ */
/* Carregado por último, após todos os módulos */

// Variáveis globais restantes
const hoje = hojeLocal();

/* Eventos de teclado para inputs de caixa */
document.getElementById('cl-input-caixa')?.addEventListener('keypress', e => { if(e.key==='Enter') vincularCaixaDesktop(); });
document.getElementById('m-input-caixa')?.addEventListener('keypress', e => { if(e.key==='Enter') vincularCaixaMobile(); });
document.getElementById('ck-input-caixa')?.addEventListener('keypress', e => { if(e.key==='Enter') buscarCaixa(); });

/* Datas padrão nas estatísticas */
(function() {
  const ini = document.getElementById('est-ini');
  const fim = document.getElementById('est-fim');
  if (ini) ini.value = hoje;
  if (fim) fim.value = hoje;
})();

/* Inicialização — verifica sessão existente */
(async function verificarSessao() {
  try {
    const res  = await fetch(`${API}/auth/me`, { credentials:'include' });
    if (!res.ok) return;
    const data = await res.json();
    usuarioAtual      = data.usuario;
    separadorAtual    = data.separador;
    perfilSelecionado = data.usuario.perfil;
    ativarApp();
  } catch(e) {}
})();