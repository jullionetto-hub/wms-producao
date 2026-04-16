/* ══ STARTUP.JS ══ WMS Miess — Inicialização ══ */

const hoje = hojeLocal();

document.getElementById('cl-input-caixa')?.addEventListener('keypress', e => { if(e.key==='Enter') vincularCaixaDesktop(); });
document.getElementById('m-input-caixa')?.addEventListener('keypress', e => { if(e.key==='Enter') vincularCaixaMobile(); });
document.getElementById('ck-input-caixa')?.addEventListener('keypress', e => { if(e.key==='Enter') buscarCaixa(); });

(function() {
  const ini = document.getElementById('est-ini');
  const fim = document.getElementById('est-fim');
  if (ini) ini.value = hoje;
  if (fim) fim.value = hoje;
})();

(async function verificarSessao() {
  try {
    const res  = await fetch(API + '/auth/me', { credentials:'include' });
    if (!res.ok) return;
    const data = await res.json();
    usuarioAtual      = data.usuario;
    separadorAtual    = data.separador;
    perfilSelecionado = data.usuario.perfil;
    ativarApp();
  } catch(e) {}
})();
