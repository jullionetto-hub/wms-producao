/* ══ Diário de Bordo — layout em abas ══════════════════════════════════════════════════════════════════
   Reorganiza a tela do Diário SEM mexer na regra de negócio: os blocos que já existem (recados, verificação pendente,
   resumo do turno anterior, setores, observações, botões e histórico) são MOVIDOS para 4 abas na ordem de trabalho do turno:
     1 Recados da gestão  ·  2 Verificar turno anterior  ·  3 Preencher meu turno  ·  Histórico
   Todos os ids e funções (salvarDiario, enviarDiario, abrirModalValidacao, ...) continuam os mesmos.
   Se a estrutura da página não for a esperada, nada é movido e fica o layout antigo.
   Extras: sinal "!" na aba de recados quando há recado novo; quadro da GESTÃO com quem preencheu e quem verificou
   cada diário do dia; "Tudo certo / Teve problema" por setor (só preenche o campo de observação que já existia). */
(function () {
  'use strict';

  const TXT_OK = 'Sem ocorrências.';
  const SETORES = [['sep', 'Separação'], ['ck', 'Checkout'], ['emb', 'Embalagem'], ['rep', 'Reposição']];
  const TURNOS = ['Manha', 'Tarde', 'Noite'];
  const ROTULO = { Manha: 'Manhã', Tarde: 'Tarde', Noite: 'Noite' };

  /* ───────── funções puras (testadas em tests/diario-abas.test.js) ───────── */
  const versaoRecado = r => String((r && (r.editado_em || r.criado_em)) || '');
  // recado "novo" = nunca visto, ou editado depois da última vez que foi visto
  function naoLidos(recados, vistos) { return (recados || []).filter(r => !vistos || vistos[r.id] !== versaoRecado(r)); }
  // null = sem resposta; 'ok' = "Sem ocorrências."; 'problema' = qualquer outro texto
  function estadoSetor(valor) { const v = String(valor == null ? '' : valor).trim(); return !v ? null : (v === TXT_OK ? 'ok' : 'problema'); }
  function resumoSetores(valores) {   // valores: { sep:'texto', ck:'', ... }
    const faltam = SETORES.filter(([k]) => estadoSetor(valores[k]) === null).map(([, nome]) => nome);
    return { respondidas: SETORES.length - faltam.length, total: SETORES.length, faltam };
  }
  function abaInicial(o) { return o.novos > 0 ? 'recados' : (o.pendente ? 'verificar' : 'preencher'); }
  function textoRecados(total, novos) { return novos > 0 ? novos + (novos > 1 ? ' novos' : ' novo') : (total ? 'tudo lido' : 'nenhum recado'); }
  const chaveTurno = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const rot = t => ROTULO[chaveTurno(t)] || t || '—';
  const esc = s => (typeof escHtml === 'function' ? escHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const quemValida = { Manha: 'Tarde', Tarde: 'Noite', Noite: 'Manha' };
  const dataHora = v => v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

  // Quadro da GESTÃO: uma coluna por turno, com quem preencheu, quem verificou e a situação
  function quadroGestaoHtml(lista, dataISO) {
    const doDia = (lista || []).filter(d => d && d.data === dataISO);
    const col = t => {
      const d = doDia.find(x => chaveTurno(x.turno) === t);
      const cab = `<div class="dg-q-t">${ROTULO[t]}</div>`;
      if (!d) return `<div class="dg-q-c dg-q-vazio">${cab}<div class="dg-q-s">sem diário</div><div class="dg-q-l">ninguém preencheu ainda</div></div>`;
      const st = d.status === 'validado' ? { c: 'vd', t: d.pontuacao != null ? `Validado ${d.pontuacao}/100` : 'Validado' }
        : d.status === 'enviado' ? { c: 'am', t: 'Enviado · aguardando verificação' }
        : d.status === 'expirado' ? { c: 'vm', t: 'Expirado' } : { c: 'cz', t: 'Rascunho' };
      let verificou;
      if (d.status === 'validado') verificou = `<b>${esc(d.validador || '—')}</b>${d.turno_validador ? ' (' + esc(rot(d.turno_validador)) + ')' : ''}${d.validado_em ? ' · ' + dataHora(d.validado_em) : ''}`;
      else if (d.status === 'enviado' || d.status === 'expirado') verificou = `<span class="dg-amb">ainda não verificado — aguarda o turno ${esc(rot(quemValida[chaveTurno(d.turno)]))}</span>`;
      else verificou = '<span class="dg-mudo">diário ainda não enviado</span>';
      const vistos = (d.vistos || []).filter(v => v && v.nome && v.nome !== d.supervisor);
      return `<div class="dg-q-c">${cab}<span class="dg-chip ${st.c}">${esc(st.t)}</span>
        <div class="dg-q-l"><span class="dg-mudo">${d.status === 'rascunho' ? 'Preenchendo' : 'Preencheu'}</span> <b>${esc(d.supervisor || '—')}</b></div>
        <div class="dg-q-l"><span class="dg-mudo">Verificou</span> ${verificou}</div>
        ${vistos.length ? `<div class="dg-q-l dg-mudo" title="${esc(vistos.map(v => v.nome).join(', '))}">visto por ${vistos.length} ${vistos.length > 1 ? 'pessoas' : 'pessoa'}</div>` : ''}</div>`;
    };
    return `<div class="dg-q-h"><b>Quem preencheu e quem verificou</b><span class="dg-mudo"> · ${typeof fmtData === 'function' ? fmtData(dataISO) : dataISO} · visível só para a gestão</span></div>
      <div class="dg-q-g">${TURNOS.map(col).join('')}</div>`;
  }

  const api = { TXT_OK, SETORES, naoLidos, estadoSetor, resumoSetores, abaInicial, textoRecados, quadroGestaoHtml, versaoRecado };
  if (typeof globalThis !== 'undefined') globalThis.DiarioAbas = api;
  if (typeof document === 'undefined' || !document.getElementById) return;   // fora do navegador (testes): só as funções puras

  /* ───────── a partir daqui: DOM ───────── */
  const $ = id => document.getElementById(id);
  const filhoDe = (pai, el) => { while (el && el.parentElement !== pai) el = el.parentElement; return el; };
  const ehGestor = () => typeof usuarioAtual !== 'undefined' && usuarioAtual && usuarioAtual.perfil === 'gestor';
  const turnoSel = () => ($('diario-turno') || {}).value || 'Noite';
  const dataSel = () => ($('diario-data') || {}).value || '';

  const CSS = `
  #pag-diario .dg-mudo{color:var(--text3)} #pag-diario .dg-amb{color:var(--amber)}
  .dg-ctx{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:6px 0 14px}
  .dg-ctx h2{font-size:20px;font-weight:800;margin:0} .dg-ctx h2 span{color:#a5b4fc}
  .dg-seg{display:inline-flex;background:var(--surface2);border:1px solid var(--border);border-radius:9px;padding:3px}
  .dg-seg button{background:none;border:0;padding:5px 14px;border-radius:6px;font-size:13px;font-weight:700;color:var(--text3);cursor:pointer}
  .dg-seg button.on{background:var(--accent);color:#fff}
  .dg-ctx .filter-grp{display:flex;align-items:center;gap:8px;margin:0} .dg-ctx .filter-lbl{display:none}
  .dg-ctx .filter-actions{margin-left:auto}
  #pag-diario .dg-ctx input[type=date]{max-width:160px}
  .dg-abas{display:flex;gap:6px;margin:6px 0 18px;border-bottom:1px solid var(--border);flex-wrap:wrap}
  .dg-aba{background:none;border:0;border-bottom:3px solid transparent;margin-bottom:-1px;padding:10px 16px 10px 12px;display:flex;align-items:center;gap:10px;color:var(--text3);font-weight:700;font-size:15px;text-align:left;cursor:pointer}
  .dg-aba:hover{color:var(--text)} .dg-aba.on{color:var(--text);border-bottom-color:var(--accent)}
  .dg-aba .dg-n{width:24px;height:24px;border-radius:50%;background:var(--surface);border:1px solid var(--border);display:grid;place-items:center;font-size:12px;font-weight:800;color:var(--text3);flex:none}
  .dg-aba.on .dg-n{background:var(--accent);border-color:var(--accent);color:#fff}
  .dg-aba small{display:block;font-size:11px;font-weight:600;color:var(--text3);margin-top:1px}
  .dg-aba small.am{color:var(--amber)} .dg-aba small.vd{color:var(--green)}
  .dg-alerta{width:22px;height:22px;border-radius:50%;background:var(--red);color:#fff;font-weight:800;font-size:13px;display:grid;place-items:center;animation:dgpulsa 1.8s infinite;flex:none}
  .dg-alerta[hidden]{display:none}
  @keyframes dgpulsa{0%{box-shadow:0 0 0 0 rgba(201,82,79,.6)}70%{box-shadow:0 0 0 8px rgba(201,82,79,0)}100%{box-shadow:0 0 0 0 rgba(201,82,79,0)}}
  .dg-tela{display:none} .dg-tela.on{display:block}
  .dg-intro{color:var(--text2);margin:0 0 14px;font-size:14px} .dg-intro b{color:var(--text)}
  .dg-vazio{background:var(--surface);border:1px dashed var(--border);border-radius:12px;padding:22px;text-align:center;color:var(--text3);margin-bottom:14px}
  .dg-vazio[hidden]{display:none}
  /* quadro da gestão */
  #dg-quadro{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:14px}
  .dg-q-h{margin-bottom:10px;font-size:13px}
  .dg-q-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}
  .dg-q-c{background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:11px 13px}
  .dg-q-c .dg-q-t{font-weight:800;margin-bottom:6px;font-size:14px}
  .dg-q-c .dg-q-l{font-size:12.5px;margin-top:5px;line-height:1.4} .dg-q-vazio{opacity:.75}
  .dg-q-s{font-weight:700;color:var(--text3);font-size:13px}
  .dg-chip{display:inline-flex;font-size:11px;font-weight:700;border-radius:999px;padding:2px 10px;border:1px solid transparent}
  .dg-chip.vd{color:var(--green);background:rgba(87,185,129,.1);border-color:rgba(87,185,129,.3)}
  .dg-chip.am{color:var(--amber);background:rgba(224,168,62,.1);border-color:rgba(224,168,62,.35)}
  .dg-chip.vm{color:#e8827f;background:rgba(201,82,79,.12);border-color:rgba(201,82,79,.35)}
  .dg-chip.cz{color:var(--text3);background:rgba(255,255,255,.04);border-color:var(--border)}
  /* preencher: compacto, sem donuts; "tudo certo / teve problema" */
  #pag-diario .diario-setor .db-ring-wrap{display:none}
  .dg-resp{display:flex;gap:8px;align-items:center;margin:2px 0 8px;flex-wrap:wrap}
  .dg-resp button{border:1.5px solid var(--border);background:transparent;border-radius:9px;padding:6px 12px;font-weight:700;font-size:12.5px;color:var(--text2);cursor:pointer}
  .dg-resp button.s.on{background:rgba(87,185,129,.15);border-color:var(--green);color:var(--green)}
  .dg-resp button.n.on{background:rgba(224,168,62,.15);border-color:var(--amber);color:var(--amber)}
  .dg-resp .dg-est{margin-left:auto;font-size:11px;font-weight:700}
  .diario-obs.dg-oculta textarea,.diario-obs.dg-oculta > div:first-child{display:none}   /* caixa de texto e o rótulo "Observações" (as fotos continuam) */
  #dg-barra{position:sticky;bottom:0;z-index:6;margin:14px -4px 0;padding:12px 4px;background:var(--bg);border-top:1px solid var(--border)}
  #dg-info{font-size:13px;color:var(--text2);margin-bottom:8px} #dg-info b{color:var(--text)} #dg-info .f{color:var(--amber)}
  #dg-barra .diario-acoes{margin-bottom:0 !important}
  /* histórico: sempre aberto, sem o cabeçalho de "clique para abrir" */
  #dg-t-historico .card-hd{display:none !important} #dg-t-historico #diario-hist-body{max-height:none !important;overflow:visible}
  #dg-t-historico #lista-diarios{max-height:none !important}
  #dg-t-verificar #diario-anterior-resumo{margin-top:6px}
  /* visual calmo: fonte do sistema, pesos leves, cor só onde há problema de verdade (vermelho) */
  #pag-diario{font-family:"Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif;font-weight:400;letter-spacing:0}
  #pag-diario *{font-family:inherit}
  #pag-diario h1,#pag-diario h2,#pag-diario h3,#pag-diario .pg-title{font-weight:600}
  #pag-diario b,#pag-diario strong{font-weight:600}
  .dg-ctx h2{font-weight:600} .dg-ctx h2 span{color:inherit;font-weight:600}
  .dg-seg button{font-weight:500} .dg-seg button.on{background:var(--surface);color:var(--text);box-shadow:inset 0 0 0 1px var(--border)}
  .dg-aba{font-weight:500;font-size:14px} .dg-aba.on{font-weight:600}
  .dg-aba.on{border-bottom-color:var(--text)}
  .dg-aba .dg-n{font-weight:500} .dg-aba.on .dg-n{background:var(--text);border-color:var(--text);color:var(--bg)}
  .dg-aba small{font-weight:400} .dg-aba small.am,.dg-aba small.vd{color:var(--text3)}
  .dg-alerta{font-weight:600}
  #pag-diario .dg-amb,#dg-info .f{color:var(--text2)}
  .dg-q-c .dg-q-t{font-weight:600} .dg-q-s{font-weight:500}
  .dg-chip{font-weight:500}
  .dg-chip.vd,.dg-chip.am,.dg-chip.cz{color:var(--text2);background:transparent;border-color:var(--border)}
  .dg-resp button{font-weight:500;border-width:1px}
  .dg-resp button.s.on,.dg-resp button.n.on{background:var(--surface2);border-color:var(--text2);color:var(--text)}
  .dg-resp .dg-est{font-weight:500;color:var(--text3) !important}
  #pag-diario .db-stat{border-left-color:var(--border) !important}
  #pag-diario .db-stat-n{color:var(--text) !important;font-weight:600}
  #pag-diario [style*="font-weight:800"],#pag-diario [style*="font-weight: 800"],#pag-diario [style*="font-weight:700"]{font-weight:600 !important}
  #diario-recados [style*="var(--amber)"]{color:var(--text2) !important}
  #diario-recados [style*="border-left"]{border-left-color:var(--border) !important}
  #pag-diario [style*="border-left:3px"],#pag-diario [style*="border-left: 3px"]{border-left-color:var(--border) !important}`;

  let abaAtual = 'preencher';
  let primeiraAbertura = false;
  let montado = false;

  // "vistos" dos recados: por usuário, neste aparelho (mesma ideia do recolher/mostrar que já existia)
  const memVistos = {};
  const chaveVistos = () => 'wms_dg_recados_vistos_' + ((typeof usuarioAtual !== 'undefined' && usuarioAtual && usuarioAtual.id) || 'x');
  function lerVistos() { try { return JSON.parse(localStorage.getItem(chaveVistos()) || '{}'); } catch (_) { return memVistos[chaveVistos()] || {}; } }
  function gravarVistos(v) { memVistos[chaveVistos()] = v; try { localStorage.setItem(chaveVistos(), JSON.stringify(v)); } catch (_) { /* sem localStorage: fica em memória */ } }
  const recadosAtuais = () => (typeof _recados !== 'undefined' && Array.isArray(_recados)) ? _recados : [];
  function marcarRecadosVistos() {
    const v = lerVistos(); recadosAtuais().forEach(r => { v[r.id] = versaoRecado(r); }); gravarVistos(v);
  }

  function montar() {
    if (montado) return true;
    const pag = $('pag-diario'); if (!pag || pag.dataset.dgMontado) return false;
    const rec = $('diario-recados'), val = $('diario-validacao-pendente'), ant = $('diario-anterior-resumo');
    const tit = pag.querySelector('.pg-title-wrap');
    const miolo = filhoDe(pag, $('diario-data'));
    if (!rec || !val || !ant || !tit || !miolo) return false;
    const filtros = filhoDe(miolo, $('diario-data')),
      grades = [...miolo.children].filter(c => c.matches('.diario-setor') || c.querySelector('.diario-setor')),   // os cartões dos setores podem estar em MAIS DE UM bloco
      probl = filhoDe(miolo, $('tbody-diario-prob')), obsGer = filhoDe(miolo, $('diario-obs-geral')),
      banner = $('diario-status-banner'), acoes = pag.querySelector('.diario-acoes'), hist = filhoDe(miolo, $('lista-diarios'));
    if (!grades.length || ![filtros, probl, obsGer, banner, acoes, hist].every(Boolean)) return false;   // estrutura inesperada: deixa como estava
    const idsAntes = [...pag.querySelectorAll('[id]')].map(e => e.id);   // para conferir, no fim, que nenhum elemento sumiu

    const st = document.createElement('style'); st.id = 'dg-css'; st.textContent = CSS; document.head.appendChild(st);
    const mk = (tag, id, cls, html) => { const e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

    // contexto: "Diário da Noite · 11/11/2026" + botões de turno (o <select> original segue existindo e é quem manda)
    const ctx = mk('div', 'dg-ctx', 'dg-ctx', '<h2 id="dg-titulo"></h2><div class="dg-seg" id="dg-seg">' + TURNOS.map(t => `<button type="button" data-t="${t}">${ROTULO[t]}</button>`).join('') + '</div>');
    // a data, o seletor de turno original (escondido, é quem manda) e o botão Atualizar passam para a mesma linha do título
    const selGrp = $('diario-turno').closest('.filter-grp'); if (selGrp) selGrp.style.display = 'none';   // trocado pelos botões de turno
    const dataGrp = $('diario-data').closest('.filter-grp'), actGrp = filtros.querySelector('.filter-actions');
    const btnAtu = actGrp && actGrp.querySelector('button'); if (btnAtu) btnAtu.textContent = 'Atualizar números';
    [dataGrp, actGrp, selGrp].forEach(e => e && ctx.append(e));
    ctx.querySelectorAll('#dg-seg button').forEach(b => b.onclick = () => { const s = $('diario-turno'); s.value = b.dataset.t; s.dispatchEvent(new Event('change')); });

    const quadro = mk('div', 'dg-quadro', null); quadro.style.display = 'none';
    const abas = mk('div', 'dg-abas', 'dg-abas',
      `<button type="button" class="dg-aba" data-aba="recados"><span class="dg-n">1</span><span>Recados da gestão<small id="dg-est-recados"></small></span><span class="dg-alerta" id="dg-sinal" hidden title="Há recado novo">!</span></button>
       <button type="button" class="dg-aba" data-aba="verificar"><span class="dg-n">2</span><span>Verificar turno anterior<small id="dg-est-verificar"></small></span></button>
       <button type="button" class="dg-aba" data-aba="preencher"><span class="dg-n">3</span><span>Preencher meu turno<small id="dg-est-preencher"></small></span></button>
       <button type="button" class="dg-aba" data-aba="historico"><span class="dg-n" style="font-size:11px">⟲</span><span>Histórico</span></button>`);
    abas.querySelectorAll('.dg-aba').forEach(b => b.onclick = () => irAba(b.dataset.aba));

    const tR = mk('section', 'dg-t-recados', 'dg-tela'), tV = mk('section', 'dg-t-verificar', 'dg-tela'),
      tP = mk('section', 'dg-t-preencher', 'dg-tela'), tH = mk('section', 'dg-t-historico', 'dg-tela');
    tR.append(mk('p', null, 'dg-intro', '<b>Avisos da gestão</b> que valem para o turno selecionado. Leia antes de começar.'), rec, mk('div', 'dg-vazio-rec', 'dg-vazio', 'Nenhum recado para este turno.'));
    tV.append(mk('p', null, 'dg-intro', '<b>Passo 1:</b> leia o que o turno anterior registrou (abaixo). <b>Passo 2:</b> abra o checklist e responda as perguntas.'),
      val, mk('div', 'dg-vazio-ver', 'dg-vazio', 'Nenhum diário aguardando a sua verificação ✓'), ant);
    const barra = mk('div', 'dg-barra', null); barra.append(mk('div', 'dg-info', null), acoes);
    tP.append(mk('p', null, 'dg-intro', 'Para cada setor, diga se <b>está tudo certo</b> ou se <b>teve problema</b>. Os números já vêm do sistema e você pode ajustar.'), ...grades, probl, obsGer, banner);
    tH.append(hist);
    // qualquer coisa que ainda estivesse no bloco antigo (além do cartão "Filtros", já esvaziado) vai junto: NADA é apagado
    [...miolo.children].filter(c => c !== filtros).forEach(c => tP.append(c));
    tP.append(barra);

    tit.after(quadro, ctx, abas, tR, tV, tP, tH);
    miolo.remove();   // agora só contém o cartão "Filtros" vazio
    const sumiram = idsAntes.filter(i => !document.getElementById(i));
    if (sumiram.length) console.warn('diario-abas: elementos que sumiram ao montar as abas:', sumiram);

    // "Tudo certo / Teve problema" em cada setor (só preenche/limpa o campo de observação que já existia)
    SETORES.forEach(([k]) => {
      const ta = $('diario-obs-' + k), obs = ta && ta.closest('.diario-obs'); if (!obs) return;
      const bloco = mk('div', null, 'dg-resp', `<button type="button" class="s" data-k="${k}" data-r="ok">✔ Tudo certo</button><button type="button" class="n" data-k="${k}" data-r="problema">⚠ Teve problema</button><span class="dg-est" id="dg-est-${k}"></span>`);
      obs.before(bloco);
      bloco.querySelector('.s').onclick = () => { ta.value = TXT_OK; ta.dispatchEvent(new Event('input', { bubbles: true })); atualizar(); };
      bloco.querySelector('.n').onclick = () => { if (estadoSetor(ta.value) === 'ok') { ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true })); } obs.dataset.problema = '1'; atualizar(); ta.focus(); };
    });

    // observa o que o código antigo atualiza (recados, validação pendente, lista) para manter os sinais em dia
    const obsv = new MutationObserver(() => atualizar());
    [rec, val, ant, banner, $('lista-diarios')].forEach(e => obsv.observe(e, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] }));
    let t = null; new MutationObserver(() => { clearTimeout(t); t = setTimeout(carregarQuadro, 400); }).observe($('lista-diarios'), { childList: true });

    pag.dataset.dgMontado = '1'; montado = true;
    irAba('preencher', true);
    return true;
  }

  function irAba(n, silencioso) {
    const saindoDeRecados = abaAtual === 'recados' && n !== 'recados' && !silencioso;
    abaAtual = n;
    document.querySelectorAll('#pag-diario .dg-aba').forEach(a => a.classList.toggle('on', a.dataset.aba === n));
    document.querySelectorAll('#pag-diario .dg-tela').forEach(t => t.classList.toggle('on', t.id === 'dg-t-' + n));
    if (saindoDeRecados) marcarRecadosVistos();   // o "!" fica enquanto você está na aba (para ver quais são novos) e some ao sair
    atualizar();
  }

  function atualizar() {
    if (!montado) return;
    // título e botões de turno
    const t = chaveTurno(turnoSel());
    const tit = $('dg-titulo'); if (tit) tit.innerHTML = `Diário da <span>${esc(ROTULO[t] || t)}</span> · ${typeof fmtData === 'function' ? fmtData(dataSel()) : dataSel()}`;
    document.querySelectorAll('#dg-seg button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    // 1 recados
    const rec = recadosAtuais(), novos = naoLidos(rec, lerVistos()).length;
    const er = $('dg-est-recados'); if (er) { er.textContent = textoRecados(rec.length, novos); er.className = novos ? 'am' : (rec.length ? 'vd' : ''); }
    const sn = $('dg-sinal'); if (sn) sn.hidden = !(novos > 0);
    const vr = $('dg-vazio-rec'), caixaR = $('diario-recados'); if (vr && caixaR) vr.hidden = rec.length > 0 && caixaR.style.display !== 'none';   // mensagem só quando não há recado para este turno
    // 2 verificar
    const val = $('diario-validacao-pendente'), pend = !!val && val.style.display !== 'none' && val.innerHTML.trim() !== '';
    const ev = $('dg-est-verificar');
    if (ev) { const cd = $('val-countdown'); ev.textContent = pend ? ('1 pendente' + (cd && cd.textContent ? ' · ' + (/^\d/.test(cd.textContent) ? 'faltam ' : '') + cd.textContent : '')) : 'nada pendente'; ev.className = pend ? 'am' : 'vd'; }
    const vv = $('dg-vazio-ver'); if (vv) vv.hidden = pend;
    // 3 preencher
    const valores = {}; SETORES.forEach(([k]) => { const ta = $('diario-obs-' + k); valores[k] = ta ? ta.value : ''; });
    const rs = resumoSetores(valores);
    SETORES.forEach(([k]) => {
      const ta = $('diario-obs-' + k), obs = ta && ta.closest('.diario-obs'), est = estadoSetor(valores[k]); if (!obs) return;
      const bloco = obs.previousElementSibling; if (!bloco || !bloco.classList.contains('dg-resp')) return;
      bloco.querySelector('.s').classList.toggle('on', est === 'ok'); bloco.querySelector('.n').classList.toggle('on', est === 'problema' || (est === null && obs.dataset.problema === '1'));
      const mostraCampo = est === 'problema' || (est === null && obs.dataset.problema === '1');
      obs.classList.toggle('dg-oculta', !mostraCampo);
      if (est !== null) delete obs.dataset.problema;
      const e = $('dg-est-' + k); if (e) { e.textContent = est === 'ok' ? '✓ respondido' : est === 'problema' ? '✓ com observação' : 'responder'; e.style.color = est ? 'var(--green)' : 'var(--amber)'; }
    });
    const info = $('dg-info'); if (info) info.innerHTML = rs.faltam.length ? `<b>${rs.respondidas} de ${rs.total}</b> setores respondidos · <span class="f">falta: ${rs.faltam.join(', ')}</span>` : `<b>${rs.total} de ${rs.total}</b> setores respondidos · pronto para enviar`;
    const ep = $('dg-est-preencher'); if (ep) { ep.textContent = rs.respondidas + ' de ' + rs.total + ' respondidos'; ep.className = rs.faltam.length ? '' : 'vd'; }
  }

  let quadroSeq = 0;
  async function carregarQuadro() {
    const q = $('dg-quadro'); if (!q) return;
    if (!ehGestor()) { q.style.display = 'none'; return; }
    const meu = ++quadroSeq;
    try {
      const r = await fetch((typeof API !== 'undefined' ? API : '') + '/diario', { credentials: 'include' });
      if (!r.ok) return;
      const lista = await r.json();
      if (meu !== quadroSeq) return;
      q.innerHTML = quadroGestaoHtml(lista, dataSel()); q.style.display = '';
    } catch (_) { /* sem rede: o quadro simplesmente não aparece */ }
  }

  function depoisDeCarregar() {
    if (!montar()) return;
    atualizar(); carregarQuadro();
    if (primeiraAbertura) {      // só na 1ª abertura da página: leva direto ao que precisa de atenção
      primeiraAbertura = false;
      const val = $('diario-validacao-pendente');
      irAba(abaInicial({ novos: naoLidos(recadosAtuais(), lerVistos()).length, pendente: !!val && val.style.display !== 'none' && val.innerHTML.trim() !== '' }), true);
    }
  }

  function instalar() {
    montar();
    const irParaOriginal = window.irPara;
    if (typeof irParaOriginal === 'function') window.irPara = function (pag) {
      if (pag === 'diario') primeiraAbertura = true;
      else if (abaAtual === 'recados' && montado) marcarRecadosVistos();   // saiu da página lendo os recados: contam como vistos
      return irParaOriginal.apply(this, arguments);
    };
    const iniciarOriginal = window.iniciarDiario;
    if (typeof iniciarOriginal === 'function') window.iniciarDiario = async function () {
      const r = await iniciarOriginal.apply(this, arguments);
      try { depoisDeCarregar(); } catch (e) { console.warn('diario-abas:', e); }
      return r;
    };
    setInterval(() => { const p = $('pag-diario'); if (montado && p && p.offsetParent !== null) atualizar(); }, 800);   // campos preenchidos por código não geram evento
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', instalar); else instalar();
})();
