/* ══ Treinamento — Diário de Bordo ═══════════════════════════════════════════════════════════════════════════
   Simulador para treinar o time SEM tocar em dado real: números fictícios, nada é enviado ao servidor.
   O progresso fica só no navegador de quem está treinando (localStorage) e some com "Reiniciar treino".
   Fluxo igual ao do Diário real:  1 Preencher meu turno (observações por setor, salvar, enviar)
                                   2 Verificar o turno anterior (Tudo certo / Teve problema; problema pede descrição e desconta 25)
   No fim mostra o gabarito: o que o treinando acertou, o que passou batido e dicas de preenchimento. */
(function (raiz) {
  'use strict';

  const SETORES = [['separacao', 'Separação'], ['checkout', 'Checkout'], ['embalagem', 'Embalagem'], ['reposicao', 'Reposição']];
  const PESO_PROBLEMA = 25;   // igual ao Diário real: 4 setores = 100 pontos
  const CHAVE_LS = 'treino-diario-v1';

  // [campo, rótulo] mostrados em cada setor
  const CAMPOS = {
    separacao: [['total', 'Total'], ['concluidos', 'Concluídos'], ['pendentes', 'Pendentes'], ['separando', 'Separando']],
    checkout:  [['total', 'Total'], ['concluidos', 'Concluídos'], ['pendentes', 'Pendentes']],
    embalagem: [['total', 'Total'], ['embalados', 'Embalados'], ['pendentes', 'Pendentes']],
    reposicao: [['total', 'Total'], ['resolvidas', 'Resolvidas'], ['pendentes', 'Pendentes'], ['nao_encontrados', 'Não encontrados']],
  };

  // `meu` = números do turno que o treinando preenche; `anterior` = diário pronto do turno anterior para ele verificar.
  // `anterior.obs` é o que o turno anterior escreveu (de propósito, alguns textos escondem o problema que os números mostram).
  const CENARIOS = [
    {
      id: 'tranquilo', nome: 'Turno tranquilo', descricao: 'Poucas pendências. Treina o preenchimento simples e o "Tudo certo".',
      meu: { turno: 'Tarde', separacao: { total: 120, concluidos: 118, pendentes: 2, separando: 0 }, checkout: { total: 118, concluidos: 118, pendentes: 0 }, embalagem: { total: 118, embalados: 116, pendentes: 2 }, reposicao: { total: 6, resolvidas: 6, pendentes: 0, nao_encontrados: 0 } },
      anterior: { turno: 'Manha', autor: 'Carlos (exemplo)',
        separacao: { total: 100, concluidos: 100, pendentes: 0, separando: 0 }, checkout: { total: 100, concluidos: 100, pendentes: 0 }, embalagem: { total: 100, embalados: 100, pendentes: 0 }, reposicao: { total: 4, resolvidas: 4, pendentes: 0, nao_encontrados: 0 },
        obs: { separacao: 'Tudo separado dentro do horário.', checkout: 'Sem ocorrências.', embalagem: 'Sem ocorrências.', reposicao: 'Quatro reposições resolvidas na rua B.' } },
    },
    {
      id: 'falta', nome: 'Falta de estoque', descricao: 'Itens não encontrados e pedidos parados. Treina descrever o problema e achar o que passou batido.',
      meu: { turno: 'Tarde', separacao: { total: 150, concluidos: 130, pendentes: 20, separando: 0 }, checkout: { total: 130, concluidos: 125, pendentes: 5 }, embalagem: { total: 125, embalados: 110, pendentes: 15 }, reposicao: { total: 14, resolvidas: 8, pendentes: 2, nao_encontrados: 4 } },
      anterior: { turno: 'Manha', autor: 'Marina (exemplo)',
        separacao: { total: 140, concluidos: 118, pendentes: 22, separando: 0 }, checkout: { total: 118, concluidos: 118, pendentes: 0 }, embalagem: { total: 118, embalados: 118, pendentes: 0 }, reposicao: { total: 12, resolvidas: 7, pendentes: 1, nao_encontrados: 4 },
        obs: { separacao: 'Sem ocorrências.', checkout: 'Sem ocorrências.', embalagem: 'Tudo embalado.', reposicao: 'Quatro itens não encontrados no endereço, aguardando conferência.' } },
    },
    {
      id: 'pico', nome: 'Pico de pedidos', descricao: 'Volume alto e várias pendências em sequência. Treina priorizar e verificar com atenção.',
      meu: { turno: 'Tarde', separacao: { total: 300, concluidos: 240, pendentes: 50, separando: 10 }, checkout: { total: 240, concluidos: 200, pendentes: 40 }, embalagem: { total: 200, embalados: 150, pendentes: 50 }, reposicao: { total: 10, resolvidas: 9, pendentes: 1, nao_encontrados: 0 } },
      anterior: { turno: 'Manha', autor: 'Rafael (exemplo)',
        separacao: { total: 280, concluidos: 230, pendentes: 40, separando: 10 }, checkout: { total: 230, concluidos: 190, pendentes: 40 }, embalagem: { total: 190, embalados: 190, pendentes: 0 }, reposicao: { total: 8, resolvidas: 8, pendentes: 0, nao_encontrados: 0 },
        obs: { separacao: '40 pedidos ainda pendentes, equipe reduzida no horário de almoço.', checkout: 'Sem ocorrências.', embalagem: 'Sem ocorrências.', reposicao: 'Sem ocorrências.' } },
    },
  ];

  /* ───────── regras puras (testadas em tests/treino-diario.test.js) ───────── */
  const TXT_OK = 'Sem ocorrências.';
  // O setor "tem problema de verdade" quando os números mostram pendência alta ou item não encontrado.
  function setorTemProblema(setor, n) {
    const x = n || {};
    if ((x.nao_encontrados || 0) > 0) return true;
    return (x.total || 0) > 0 && (x.pendentes || 0) / x.total >= 0.1;
  }
  const nota = verif => Math.max(0, 100 - PESO_PROBLEMA * SETORES.filter(([k]) => verif && verif[k] && verif[k].estado === 'problema').length);
  // "Problema" sem descrição não vale — igual ao Diário real.
  const verificacaoCompleta = verif => SETORES.every(([k]) => verif && verif[k] && (verif[k].estado === 'ok' || (verif[k].estado === 'problema' && String(verif[k].nota || '').trim())));
  function gabarito(cenario, verif) {
    return SETORES.map(([k, nome]) => {
      const real = setorTemProblema(k, cenario.anterior[k]);
      const marcou = verif && verif[k] ? verif[k].estado : null;
      const certo = (real && marcou === 'problema') || (!real && marcou === 'ok');
      return { chave: k, nome, real, marcou, certo };
    });
  }
  // Dicas de preenchimento do turno do treinando.
  function dicas(cenario, obs) {
    const out = [];
    SETORES.forEach(([k, nome]) => {
      const t = String((obs && obs[k]) || '').trim();
      if (setorTemProblema(k, cenario.meu[k]) && (t.length < 15 || t === TXT_OK)) out.push(`${nome}: os números mostram pendência, mas a observação não explica. Cite o que ficou pendente, quantos e o motivo.`);
      if (!setorTemProblema(k, cenario.meu[k]) && !t) out.push(`${nome}: sem pendência, mas faltou registrar. Escreva "${TXT_OK}" ou o que aconteceu.`);
    });
    return out;
  }
  const puro = { SETORES, CENARIOS, setorTemProblema, nota, verificacaoCompleta, gabarito, dicas, PESO_PROBLEMA };
  if (typeof module !== 'undefined' && module.exports) { module.exports = puro; return; }
  if (typeof document === 'undefined') return;

  /* ───────── tela ───────── */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let estado = null;
  const vazio = () => ({ cenario: null, aba: 'preencher', obs: {}, salvos: {}, enviado: false, verif: {}, concluido: false });
  function carregar() { try { estado = JSON.parse(localStorage.getItem(CHAVE_LS) || 'null') || vazio(); } catch (e) { estado = vazio(); } }
  function gravar() { try { localStorage.setItem(CHAVE_LS, JSON.stringify(estado)); } catch (e) { /* treino segue na memória */ } }
  const cenarioAtual = () => CENARIOS.find(c => c.id === estado.cenario);
  const raizEl = () => document.getElementById('treino-diario-raiz');

  const BOX = 'border:1px solid var(--border);border-radius:8px;background:var(--surface2);padding:12px 14px;margin-bottom:10px';
  const BTN = 'padding:8px 14px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);cursor:pointer;font-size:13px;color:var(--text)';
  const BTN_P = 'padding:8px 14px;border-radius:8px;border:0;background:var(--indigo);color:#fff;cursor:pointer;font-size:13px;font-weight:600';
  const numeros = (setor, n) => `<div style="display:flex;gap:18px;flex-wrap:wrap;font-size:12px;color:var(--text3);margin:6px 0">${CAMPOS[setor].map(([c, r]) => `<span>${r}: <b style="color:var(--text)">${(n && n[c]) || 0}</b></span>`).join('')}</div>`;

  function telaEscolha() {
    return `<p style="font-size:13px;color:var(--text2);margin:0 0 12px">Escolha um cenário para treinar. Os números são fictícios e nada do que você fizer aqui é salvo no sistema.</p>
      ${CENARIOS.map(c => `<div style="${BOX};display:flex;align-items:center;gap:12px">
        <div style="flex:1"><div style="font-weight:600">${esc(c.nome)}</div><div style="font-size:12px;color:var(--text3)">${esc(c.descricao)}</div></div>
        <button style="${BTN_P}" onclick="TreinoDiario.iniciar('${c.id}')">Começar</button></div>`).join('')}`;
  }

  function abas() {
    const mk = (id, txt) => `<button onclick="TreinoDiario.aba('${id}')" style="${BTN};${estado.aba === id ? 'border-color:var(--indigo);color:var(--indigo);font-weight:600' : ''}">${txt}</button>`;
    return `<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">${mk('preencher', '1 · Preencher meu turno')}${mk('verificar', '2 · Verificar turno anterior')}${mk('resultado', '3 · Resultado')}</div>`;
  }

  function telaPreencher(c) {
    const salvos = SETORES.filter(([k]) => estado.salvos[k]).length;
    const setores = SETORES.map(([k, nome]) => `<div style="${BOX}">
        <div style="display:flex;align-items:center;justify-content:space-between"><b>${nome}</b>${estado.salvos[k] ? '<span style="font-size:11px;color:var(--green)">salvo por você (treino)</span>' : ''}</div>
        ${numeros(k, c.meu[k])}
        <textarea id="treino-obs-${k}" rows="2" ${estado.enviado ? 'disabled' : ''} placeholder="Observações do setor (escreva ${esc(TXT_OK)} se não houve nada)" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font:inherit;font-size:13px;box-sizing:border-box">${esc(estado.obs[k] || '')}</textarea>
        ${estado.enviado ? '' : `<div style="margin-top:6px"><button style="${BTN}" onclick="TreinoDiario.salvar('${k}')">Salvar ${nome}</button></div>`}</div>`).join('');
    return `<div style="font-size:12px;color:var(--text3);margin-bottom:8px">Você está no turno <b>${esc(c.meu.turno === 'Manha' ? 'Manhã' : c.meu.turno)}</b> · setores salvos: <b>${salvos}/4</b></div>${setores}
      ${estado.enviado ? '<div style="color:var(--green);font-size:13px">Diário enviado (treino). Agora verifique o turno anterior.</div>'
        : `<button style="${BTN_P};${salvos < 4 ? 'opacity:.5;cursor:not-allowed' : ''}" ${salvos < 4 ? 'disabled' : ''} onclick="TreinoDiario.enviar()">Enviar diário</button>
           ${salvos < 4 ? '<span style="font-size:12px;color:var(--text3);margin-left:8px">salve os 4 setores para enviar</span>' : ''}`}`;
  }

  function telaVerificar(c) {
    const a = c.anterior;
    const setores = SETORES.map(([k, nome]) => {
      const v = estado.verif[k] || {};
      const btn = (est, txt, cor) => `<button onclick="TreinoDiario.marcar('${k}','${est}')" ${estado.concluido ? 'disabled' : ''} style="${BTN};${v.estado === est ? `border-color:${cor};color:${cor};font-weight:700` : ''}">${txt}</button>`;
      return `<div style="${BOX}"><b>${nome}</b>${numeros(k, a[k])}
        <div style="font-size:13px;margin-bottom:8px"><span style="color:var(--text3)">${esc(a.autor)} escreveu:</span> ${esc(a.obs[k])}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${btn('ok', 'Tudo certo', 'var(--green)')}${btn('problema', 'Teve problema', 'var(--red)')}</div>
        ${v.estado === 'problema' ? `<textarea id="treino-nota-${k}" rows="2" ${estado.concluido ? 'disabled' : ''} placeholder="Descreva o problema (obrigatório)" onchange="TreinoDiario.nota('${k}',this.value)" style="width:100%;margin-top:8px;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font:inherit;font-size:13px;box-sizing:border-box">${esc(v.nota || '')}</textarea>` : ''}</div>`;
    }).join('');
    const pronto = verificacaoCompleta(estado.verif);
    return `<div style="font-size:12px;color:var(--text3);margin-bottom:8px">Diário do turno <b>${a.turno === 'Manha' ? 'Manhã' : a.turno}</b>, de ${esc(a.autor)}. Olhe os números, não só o texto.</div>${setores}
      ${estado.concluido ? '' : `<button style="${BTN_P};${pronto ? '' : 'opacity:.5;cursor:not-allowed'}" ${pronto ? '' : 'disabled'} onclick="TreinoDiario.concluir()">Concluir verificação</button>
        ${pronto ? '' : '<span style="font-size:12px;color:var(--text3);margin-left:8px">marque os 4 setores (problema precisa de descrição)</span>'}`}`;
  }

  function telaResultado(c) {
    if (!estado.concluido) return `<div style="${BOX}">Conclua a verificação para ver o resultado e o gabarito.</div>`;
    const g = gabarito(c, estado.verif), acertos = g.filter(x => x.certo).length, d = dicas(c, estado.obs);
    const rot = e => e === 'ok' ? 'Tudo certo' : e === 'problema' ? 'Teve problema' : '—';
    return `<div style="${BOX}"><div style="font-size:12px;color:var(--text3)">Nota do turno verificado (como seria no sistema)</div><div style="font-size:28px;font-weight:700">${nota(estado.verif)}/100</div>
        <div style="font-size:13px">Você acertou <b>${acertos} de 4</b> setores.</div></div>
      ${g.map(x => `<div style="${BOX}"><b>${x.nome}</b> — você marcou: ${rot(x.marcou)} · <span style="color:${x.certo ? 'var(--green)' : 'var(--red)'};font-weight:600">${x.certo ? 'Correto' : 'Errado'}</span>
        <div style="font-size:12px;color:var(--text3);margin-top:4px">${x.real ? 'Havia problema: os números mostram pendência alta (10% ou mais do total) ou item não encontrado.' : 'Sem problema: pendências baixas e nenhum item não encontrado.'}</div></div>`).join('')}
      <div style="${BOX}"><b>Dicas para o seu preenchimento</b>${d.length ? `<ul style="margin:6px 0 0 18px;padding:0;font-size:13px">${d.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '<div style="font-size:13px;color:var(--green);margin-top:4px">Seu preenchimento está bom.</div>'}</div>`;
  }

  function desenhar() {
    const el = raizEl(); if (!el) return;
    const c = estado.cenario ? cenarioAtual() : null;
    if (!c) { el.innerHTML = telaEscolha(); return; }
    el.innerHTML = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><b>Cenário: ${esc(c.nome)}</b>
        <button style="${BTN}" onclick="TreinoDiario.reiniciar()">Reiniciar treino</button></div>${abas()}
      ${estado.aba === 'preencher' ? telaPreencher(c) : estado.aba === 'verificar' ? telaVerificar(c) : telaResultado(c)}`;
  }

  function lerObs(k) { const t = document.getElementById('treino-obs-' + k); if (t) estado.obs[k] = t.value; }
  raiz.TreinoDiario = {
    iniciar(id) { estado = vazio(); estado.cenario = id; gravar(); desenhar(); },
    reiniciar() { if (!confirm('Apagar o treino atual e escolher outro cenário?')) return; estado = vazio(); gravar(); desenhar(); },
    aba(id) { SETORES.forEach(([k]) => lerObs(k)); estado.aba = id; gravar(); desenhar(); },
    salvar(k) { lerObs(k); estado.salvos[k] = true; gravar(); desenhar(); },
    enviar() { SETORES.forEach(([k]) => lerObs(k)); estado.enviado = true; estado.aba = 'verificar'; gravar(); desenhar(); },
    marcar(k, est) { SETORES.forEach(([s]) => { const t = document.getElementById('treino-nota-' + s); if (t && estado.verif[s]) estado.verif[s].nota = t.value; }); estado.verif[k] = Object.assign({}, estado.verif[k], { estado: est }); gravar(); desenhar(); },
    nota(k, v) { estado.verif[k] = Object.assign({}, estado.verif[k], { nota: v }); gravar(); desenhar(); },
    concluir() { estado.concluido = true; estado.aba = 'resultado'; gravar(); desenhar(); },
    abrir() { carregar(); montar(); desenhar(); },
  };

  // Monta a página (uma vez) ao lado das outras páginas do app.
  function montar() {
    if (document.getElementById('pag-treino-diario')) return;
    const ref = document.getElementById('pag-diario');
    if (!ref || !ref.parentNode) return;
    const pg = document.createElement('div');
    pg.className = 'pagina'; pg.id = 'pag-treino-diario';
    pg.innerHTML = `<div class="pg-title-wrap"><div class="pg-title">Treinamento — Diário de Bordo</div>
        <p class="pg-subtitle">Ambiente de treino: dados fictícios, nada é salvo no sistema</p></div>
      <div style="padding:8px 12px;border:1px dashed var(--amber);border-radius:8px;color:var(--amber);font-size:12px;margin-bottom:14px">MODO TREINO — o que você faz aqui não aparece no Diário real, nas notas nem no Excel.</div>
      <div id="treino-diario-raiz"></div>`;
    ref.parentNode.appendChild(pg);
  }
})(typeof window !== 'undefined' ? window : globalThis);
