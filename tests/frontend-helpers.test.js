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
