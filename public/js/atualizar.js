/* Aviso de "nova versão do sistema": descobre sozinho quando o servidor foi atualizado e mostra o botão Atualizar.
   - o servidor responde em /versao com um identificador (muda a cada deploy);
   - guardamos o da hora em que a página abriu e comparamos a cada 60 s e quando a aba volta ao foco;
   - se mudou: aparece o botão na tela de entrada e uma faixa fixa no topo do sistema. Nada recarrega sozinho
     (assim ninguém perde o que está digitando); quem clica recarrega com a versão nova. */
(function () {
  'use strict';
  let inicial = null, avisado = false;

  async function lerVersao() {
    try {
      const r = await fetch('/versao', { cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.versao ? String(j.versao) : null;
    } catch (_) { return null; }   // sem rede: não avisa nada
  }

  async function atualizarAgora() {
    try { if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } } catch (_) { /* segue */ }
    try { if (navigator.serviceWorker) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.update().catch(() => {}))); } } catch (_) { /* segue */ }
    location.reload();
  }
  window.atualizarSistema = atualizarAgora;

  function mostrar() {
    if (avisado) return; avisado = true;
    const css = document.createElement('style');
    css.textContent = `
      .atz-login{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:12px;padding:10px 14px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--text);font:500 13px 'DM Sans',sans-serif;cursor:pointer}
      .atz-login:hover{background:var(--surface2)}
      .atz-login i{width:8px;height:8px;border-radius:50%;background:var(--accent);flex:none}
      #atz-faixa{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9999;display:flex;align-items:center;gap:12px;padding:10px 12px 10px 16px;border-radius:12px;background:var(--surface);border:1px solid var(--border);box-shadow:var(--sh-lg);font:500 13px 'DM Sans',sans-serif;color:var(--text)}
      #atz-faixa button{border:0;border-radius:8px;padding:7px 14px;background:var(--accent);color:#fff;font:600 13px 'DM Sans',sans-serif;cursor:pointer}`;
    document.head.appendChild(css);
    const caixa = document.getElementById('login-box');
    const loginVisivel = caixa && caixa.offsetParent !== null;
    if (loginVisivel) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'atz-login'; b.id = 'atz-login';
      b.innerHTML = '<i></i> Nova versão disponível — Atualizar'; b.onclick = atualizarAgora;
      caixa.appendChild(b);
    }
    const f = document.createElement('div'); f.id = 'atz-faixa';
    f.innerHTML = '<span>Há uma nova versão do sistema.</span><button type="button">Atualizar</button>';
    f.querySelector('button').onclick = atualizarAgora;
    if (!loginVisivel) document.body.appendChild(f);
  }

  async function checar() {
    const v = await lerVersao(); if (!v) return;
    if (inicial === null) { inicial = v; return; }
    if (v !== inicial) mostrar();
  }

  checar();
  setInterval(checar, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checar(); });
})();
