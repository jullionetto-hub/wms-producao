/**
 * Garante que helpers globais usados em vários arquivos do front-end continuam
 * definidos em algum lugar. Quando uma tela é removida, funções compartilhadas
 * que moravam no arquivo dela deixam chamadas órfãs (ReferenceError só em produção).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = path.join(__dirname, '..', 'public', 'js');
const arquivos = fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'sw.js');
const codigo = Object.fromEntries(arquivos.map(f => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));

const HELPERS = ['escHtml', 'fmtData', 'apiFetch', 'hojeLocal', 'toast'];

describe('helpers globais do front-end', () => {
  test.each(HELPERS)('%s está definido quando é chamado', (nome) => {
    const chamado = arquivos.some(f => new RegExp(`(^|[^.\\w$])${nome}\\s*\\(`).test(codigo[f]));
    const definido = arquivos.some(f => new RegExp(`function\\s+${nome}\\s*\\(|(const|let|var)\\s+${nome}\\s*=`).test(codigo[f]));
    if (chamado) expect(definido).toBe(true);
  });
});

describe('_diarioObsHtml (observações do diário para o turno seguinte)', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(codigo['config.js'].match(/function escHtml[\s\S]*?\n}\n/)[0], ctx);
  vm.runInContext(codigo['auth.js'].match(/function _diarioObsHtml[\s\S]*?\n}\n/)[0], ctx);

  test('mostra todas as seções preenchidas, não só a geral', () => {
    const html = ctx._diarioObsHtml({
      separacao: '11 pedidos com divergência', checkout: '5 checkoutado', reposicao: 'Corredores sem caixas',
      embalagem: '', geral: 'Prime sem integração',
    }, 'Observações do turno');
    expect(html).toContain('Observações do turno');
    expect(html).toContain('11 pedidos com divergência');
    expect(html).toContain('5 checkoutado');
    expect(html).toContain('Corredores sem caixas');
    expect(html).toContain('Prime sem integração');
    expect(html).not.toContain('>Embalagem<'); // seção vazia não aparece
  });

  test('sem nenhuma observação não renderiza nada', () => {
    expect(ctx._diarioObsHtml({ separacao: '', geral: '  ' }, 'x')).toBe('');
    expect(ctx._diarioObsHtml(null, 'x')).toBe('');
  });

  test('escapa HTML digitado pelo supervisor', () => {
    expect(ctx._diarioObsHtml({ geral: '<script>alert(1)</script>' }, 't')).not.toContain('<script>');
  });
});

describe('escHtml', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(codigo['config.js'].match(/function escHtml[\s\S]*?\n}\n/)[0], ctx);

  test('escapa HTML', () => {
    expect(ctx.escHtml('<b>"oi" & \'tchau\'</b>')).toBe('&lt;b&gt;&quot;oi&quot; &amp; &#39;tchau&#39;&lt;/b&gt;');
  });

  test('nulo e indefinido viram texto vazio', () => {
    expect(ctx.escHtml(null)).toBe('');
    expect(ctx.escHtml(undefined)).toBe('');
  });
});
