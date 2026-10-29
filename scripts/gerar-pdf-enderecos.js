#!/usr/bin/env node
// Gera PDF de etiquetas de endereço 70 x 40mm (1 etiqueta por página) pra imprimir na ZD220.
// Uso: node scripts/gerar-pdf-enderecos.js "A01-A10, B05" saida.pdf
'use strict';
const { chromium } = require('playwright');

function expandir(txt) {
  const out = [];
  String(txt || '').split(/[,;\n]+/).map(t => t.trim()).filter(Boolean).forEach(t => {
    const m = t.match(/^(.*?)(\d+)\s*-\s*\1?(\d+)$/);
    if (m && +m[3] >= +m[2] && (+m[3] - +m[2]) < 500) {
      const w = m[2].length;
      for (let n = +m[2]; n <= +m[3]; n++) out.push(m[1] + String(n).padStart(w, '0'));
    } else out.push(t);
  });
  return out;
}

(async () => {
  const [lista, saida] = process.argv.slice(2);
  const ends = expandir(lista);
  if (!ends.length || !saida) { console.error('Uso: node scripts/gerar-pdf-enderecos.js "A01-A10" saida.pdf'); process.exit(1); }
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const html = `<!doctype html><meta charset="utf-8"><style>
    @page { size: 70mm 40mm; margin: 0 }
    html,body { margin:0; padding:0 }
    .e { width:70mm; height:40mm; box-sizing:border-box; padding:2mm; display:flex; align-items:center; justify-content:center;
         page-break-after:always; break-after:page; overflow:hidden; font-family:Arial,Helvetica,sans-serif; font-weight:900; color:#000 }
    .e:last-child { page-break-after:auto; break-after:auto }
    .t { font-size:22mm; line-height:1; white-space:nowrap; text-align:center }
    .t.l { font-size:11mm; white-space:normal; word-break:break-word }
  </style>${ends.map(e => `<div class="e"><div class="t${e.length > 6 ? ' l' : ''}">${esc(e)}</div></div>`).join('')}`;
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent(html);
  await p.pdf({ path: saida, width: '70mm', height: '40mm', printBackground: true, preferCSSPageSize: true });
  await b.close();
  console.log(`${ends.length} etiqueta(s) → ${saida}`);
})();
