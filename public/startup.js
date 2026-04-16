/* STARTUP.JS - WMS Miess */

var hoje = hojeLocal();

var elCaixa = document.getElementById('cl-input-caixa');
if (elCaixa) elCaixa.addEventListener('keypress', function(e){ if(e.key==='Enter') vincularCaixaDesktop(); });

var elMCaixa = document.getElementById('m-input-caixa');
if (elMCaixa) elMCaixa.addEventListener('keypress', function(e){ if(e.key==='Enter') vincularCaixaMobile(); });

var elCk = document.getElementById('ck-input-caixa');
if (elCk) elCk.addEventListener('keypress', function(e){ if(e.key==='Enter') buscarCaixa(); });

(function() {
  var ini = document.getElementById('est-ini');
  var fim = document.getElementById('est-fim');
  if (ini) ini.value = hoje;
  if (fim) fim.value = hoje;
})();

(async function verificarSessao() {
  try {
    var res = await fetch(API + '/auth/me', { credentials:'include' });
    if (!res.ok) return;
    var data = await res.json();
    usuarioAtual      = data.usuario;
    separadorAtual    = data.separador;
    perfilSelecionado = data.usuario.perfil;
    ativarApp();
  } catch(e) {}
})();
