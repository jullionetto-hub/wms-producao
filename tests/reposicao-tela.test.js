/**
 * Tela de Reposição — "piscando", itens sumindo/voltando e item resolvido que não sai.
 * Causa: cada evento disparava várias buscas da mesma lista ao mesmo tempo e a resposta
 * que chegava por último ganhava (mesmo velha); além disso a tela era redesenhada a
 * cada busca, mesmo sem mudança. Aqui exercitamos o caminho único de atualização.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'repositor.js'), 'utf8');
const esperar = ms => new Promise(r => setTimeout(r, ms));

function montar({ mobile = true, abaAtiva = null } = {}) {
  const els = {};
  const novoEl = () => {
    const el = { _html: '', sets: 0, style: {}, textContent: '' };
    Object.defineProperty(el, 'innerHTML', { get() { return el._html; }, set(v) { el._html = v; el.sets++; } });
    return el;
  };
  ['rep-lista-x', 'd-rep-lista-x'].forEach(id => { els[id] = novoEl(); });
  const ctx = {
    API: '', console, setTimeout, clearTimeout, Date, Promise, Number, Map, WeakMap, Object, Math, JSON,
    _todosUsuarios: [1],
    chamadas: { separar: 0, badges: 0, emAndamento: 0, maxSimultaneas: 0 },
    document: {
      hidden: false,
      body: { classList: { contains: c => (c === 'rep-mobile' ? mobile : false) } },
      getElementById: id => els[id] || null,
      querySelector: sel => {
        if (!abaAtiva) return null;
        if (sel === '.rep-tab.ativo') return { id: 'rtab-' + abaAtiva };
        return null;
      },
    },
  };
  vm.createContext(ctx);
  // Estado + helpers da atualização (do primeiro `let` até o fim de _repAtualizarUmaVez)
  vm.runInContext(src.match(/let _repRefreshTimer[\s\S]*?async function _repAtualizarUmaVez[\s\S]*?\n}\n/)[0], ctx);
  vm.runInContext(src.match(/function _repFiltroData[\s\S]*?\n}\n/)[0], ctx);
  vm.runInContext(src.match(/async function _repCarregar[\s\S]*?\n}\n/)[0], ctx);
  // Dependências que o teste controla
  vm.runInContext(`
    async function carregarRepSeparar() {
      chamadas.separar++; chamadas.emAndamento++;
      chamadas.maxSimultaneas = Math.max(chamadas.maxSimultaneas, chamadas.emAndamento);
      await new Promise(r => setTimeout(r, 40));
      chamadas.emAndamento--;
    }
    function carregarRepSeparado() {} function carregarRepSubiu() {} function carregarRepProtocolo() {}
    async function _atualizarBadgesRep() { chamadas.badges++; }
    function hojeLocal() { return '2026-11-07'; }
    async function carregarUsuariosParaRep() {}
  `, ctx);
  return { ctx, els };
}

describe('Reposição — atualização da tela', () => {
  test('resposta velha que chega depois da nova é descartada (item resolvido não volta)', async () => {
    const { ctx, els } = montar();
    let n = 0;
    ctx.fetch = () => {
      const minha = ++n;
      if (minha === 1) return esperar(60).then(() => ({ ok: true, json: async () => [{ id: 7, status: 'verificando' }] })); // velha e lenta
      return Promise.resolve({ ok: true, json: async () => [] });                                                    // nova: item já saiu
    };
    const montarHtml = av => av.map(a => `<i>${a.id}</i>`).join('') || 'vazio';
    ctx.montarHtml = montarHtml;
    const p1 = vm.runInContext(`_repCarregar('x','pendente','rep-lista-x','d-rep-lista-x',true,montarHtml)`, ctx);
    const p2 = vm.runInContext(`_repCarregar('x','pendente','rep-lista-x','d-rep-lista-x',true,montarHtml)`, ctx);
    await Promise.all([p1, p2]);
    expect(els['rep-lista-x'].innerHTML).toBe('vazio');
    expect(els['rep-lista-x'].innerHTML).not.toContain('<i>7</i>');
  });

  test('não redesenha quando nada mudou (evita piscar)', async () => {
    const { ctx, els } = montar();
    ctx.fetch = () => Promise.resolve({ ok: true, json: async () => [{ id: 1, status: 'pendente' }] });
    ctx.montarHtml = av => av.map(a => `<i>${a.id}</i>`).join('');
    for (let i = 0; i < 5; i++) await vm.runInContext(`_repCarregar('x','pendente','rep-lista-x','d-rep-lista-x',true,montarHtml)`, ctx);
    expect(els['rep-lista-x'].sets).toBe(1);
    expect(els['d-rep-lista-x'].sets).toBe(1);
  });

  test('item que acabei de gravar não ressuscita com status antigo; com o status novo aparece normal', async () => {
    const { ctx, els } = montar();
    ctx.montarHtml = av => av.map(a => `<i>${a.id}:${a.status}</i>`).join('') || 'vazio';
    vm.runInContext(`_repGravou(5, 'buscado')`, ctx);
    ctx.fetch = () => Promise.resolve({ ok: true, json: async () => [{ id: 5, status: 'verificando' }, { id: 6, status: 'pendente' }] });
    await vm.runInContext(`_repCarregar('x','pendente','rep-lista-x','d-rep-lista-x',true,montarHtml)`, ctx);
    expect(els['rep-lista-x'].innerHTML).toBe('<i>6:pendente</i>');
    ctx.fetch = () => Promise.resolve({ ok: true, json: async () => [{ id: 5, status: 'buscado' }] });
    await vm.runInContext(`_repCarregar('x','buscado','rep-lista-x','d-rep-lista-x',true,montarHtml)`, ctx);
    expect(els['rep-lista-x'].innerHTML).toBe('<i>5:buscado</i>');
  });

  test('durante o arraste a lista não é redesenhada', async () => {
    const { ctx, els } = montar();
    ctx.montarHtml = av => av.map(a => `<i>${a.id}</i>`).join('') || 'vazio';
    ctx.fetch = () => Promise.resolve({ ok: true, json: async () => [{ id: 1, status: 'pendente' }] });
    await vm.runInContext(`_repCarregar('x','pendente','rep-lista-x','d-rep-lista-x',true,montarHtml)`, ctx);
    vm.runInContext('_repArrastando = true', ctx);
    ctx.fetch = () => Promise.resolve({ ok: true, json: async () => [{ id: 1, status: 'pendente' }, { id: 2, status: 'pendente' }] });
    await vm.runInContext(`_repCarregar('x','pendente','rep-lista-x','d-rep-lista-x',true,montarHtml)`, ctx);
    expect(els['rep-lista-x'].innerHTML).toBe('<i>1</i>');
    vm.runInContext('_repArrastando = false', ctx);
    await vm.runInContext(`_repCarregar('x','pendente','rep-lista-x','d-rep-lista-x',true,montarHtml)`, ctx);
    expect(els['rep-lista-x'].innerHTML).toBe('<i>1</i><i>2</i>');
  });

  test('erro de rede silencioso mantém o que já estava na tela; sem silêncio mostra o erro', async () => {
    const { ctx, els } = montar();
    ctx.montarHtml = av => av.map(a => `<i>${a.id}</i>`).join('');
    ctx.fetch = () => Promise.resolve({ ok: true, json: async () => [{ id: 1, status: 'pendente' }] });
    await vm.runInContext(`_repCarregar('x','pendente','rep-lista-x','d-rep-lista-x',true,montarHtml)`, ctx);
    ctx.fetch = () => Promise.reject(new Error('rede'));
    await vm.runInContext(`_repCarregar('x','pendente','rep-lista-x','d-rep-lista-x',true,montarHtml)`, ctx);
    expect(els['rep-lista-x'].innerHTML).toBe('<i>1</i>');
    await vm.runInContext(`_repCarregar('x','pendente','rep-lista-x','d-rep-lista-x',false,montarHtml)`, ctx);
    expect(els['rep-lista-x'].innerHTML).toContain('Erro ao carregar');
  });

  test('vários eventos seguidos (socket) viram UMA atualização', async () => {
    const { ctx } = montar({ abaAtiva: 'separar' });
    for (let i = 0; i < 6; i++) vm.runInContext('agendarAtualizacaoRep()', ctx);
    await esperar(500);
    expect(ctx.chamadas.separar).toBe(1);
    expect(ctx.chamadas.badges).toBe(1);
  });

  test('atualizações nunca rodam em paralelo; um pedido que chega no meio roda logo depois', async () => {
    const { ctx } = montar({ abaAtiva: 'separar' });
    const p1 = vm.runInContext('_repAtualizarTudo()', ctx);
    await esperar(10);
    vm.runInContext('_repAtualizarTudo()', ctx);   // chega com a primeira ainda rodando
    await p1;
    await esperar(120);
    expect(ctx.chamadas.separar).toBe(2);
    expect(ctx.chamadas.maxSimultaneas).toBe(1);
  });

  test('na mesa, com a tela de Reposição fechada, não busca nada', async () => {
    const { ctx } = montar({ mobile: false });
    ctx.document.getElementById = () => null; // pag-reposicao inexistente/inativa
    await vm.runInContext('_repAtualizarTudo()', ctx);
    expect(ctx.chamadas.separar).toBe(0);
    expect(ctx.chamadas.badges).toBe(0);
  });
});

describe('Reposição — pontos de entrada usam o caminho único', () => {
  test('socket e timers chamam agendarAtualizacaoRep, não várias buscas soltas', () => {
    const socket = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'socket-client.js'), 'utf8');
    expect(socket).toContain('agendarAtualizacaoRep');
    expect(socket).not.toMatch(/socket\.on\('aviso:atualizado'[\s\S]{0,200}carregarAvisosMobile\(\)/);
    expect(src).toMatch(/_repMobileTimer = setInterval\(\(\) => \{ if \(!document\.hidden\) agendarAtualizacaoRep\(\)/);
  });

  test('os contadores usam a rota leve /contagem (e não a tabela inteira)', () => {
    const m = src.match(/async function _atualizarBadgesRep[\s\S]*?\n}\n/)[0];
    expect(m).toContain('/repositor/avisos/contagem');
    expect(m).not.toMatch(/\/repositor\/avisos`|\/repositor\/avisos\?/);
  });
});
