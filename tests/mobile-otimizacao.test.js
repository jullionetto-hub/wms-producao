/**
 * Garante as otimizações para o celular de separação (Galaxy A07) continuam no lugar:
 * compressão no servidor, scripts de CDN sem travar a 1ª tela e o bloco de CSS mobile.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const compression = require('compression');

const raiz = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), 'utf8');

describe('compressão HTTP', () => {
  test('index.js ativa compression() antes de servir os arquivos estáticos', () => {
    const src = ler('index.js');
    const iComp = src.indexOf('app.use(compression())');
    const iStatic = src.indexOf('express.static');
    expect(iComp).toBeGreaterThan(-1);
    expect(iComp).toBeLessThan(iStatic);
  });

  test('o middleware devolve gzip para JS grande', async () => {
    const app = express();
    app.use(compression());
    app.get('/x.js', (_q, r) => r.type('js').send('function f(){return 1}\n'.repeat(5000)));
    const srv = app.listen(0);
    try {
      const enc = await new Promise((ok, err) => {
        http.get({ port: srv.address().port, path: '/x.js', headers: { 'Accept-Encoding': 'gzip' } },
          res => { res.resume(); ok(res.headers['content-encoding']); }).on('error', err);
      });
      expect(enc).toBe('gzip');
    } finally { srv.close(); }
  });
});

describe('index.html e CSS para celular', () => {
  const html = ler('public', 'index.html');
  const css = ler('public', 'css', 'app.css');

  test('JsBarcode (CDN) não bloqueia a primeira pintura', () => {
    expect(html).toMatch(/<script src="[^"]*JsBarcode[^"]*" defer>/);
  });

  test('fontes e ícones em CDN carregam sem travar, com fallback noscript', () => {
    expect(html).toMatch(/tabler-icons\.min\.css" media="print" onload="this\.media='all'"/);
    expect(html).toMatch(/<noscript>[\s\S]*tabler-icons[\s\S]*<\/noscript>/);
  });

  test('bloco de otimização mobile existe e mantém as classes originais', () => {
    expect(css).toContain('OTIMIZAÇÃO CELULAR DE SEPARAÇÃO');
    expect(css).toMatch(/overscroll-behavior-y:none/);
    expect(css).toMatch(/\.btn-item\{width:44px;height:44px\}/);
    // "contain" em lista aninhada que não rola sozinha prende o gesto de rolagem (tela só rolava pela barra)
    const regra = css.split('\n').find(l => l.includes('overscroll-behavior:contain'));
    expect(regra).toBeDefined();
    expect(regra).not.toContain('.cl-lista');
    // classes que o separador usa continuam definidas
    ['.sep-tabbar', '.item-card', '.btn-item', '.bip-input', '.fila-card'].forEach(c => expect(css).toContain(c));
  });
});
