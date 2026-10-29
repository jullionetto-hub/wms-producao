#!/usr/bin/env node
// Gera PDF de etiquetas de endereço 70 x 40mm pra imprimir na ZD220 — 2 endereços por etiqueta
// (lado a lado: B167|B168, texto grande). Endereços consecutivos são agrupados de 2 em 2.
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
  const pares = [];
  for (let i = 0; i < ends.length; i += 2) pares.push(ends.slice(i, i + 2));
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const html = `<!doctype html><meta charset="utf-8"><style>
    @page { size: 70mm 40mm; margin: 0 }
    html,body { margin:0; padding:0 }
    .e { width:70mm; height:40mm; box-sizing:border-box; padding:0; display:flex; flex-direction:row;
         page-break-after:always; break-after:page; overflow:hidden; font-family:Arial,Helvetica,sans-serif; font-weight:900; color:#000 }
    .e:last-child { page-break-after:auto; break-after:auto }
    .l { flex:1 1 0; display:flex; align-items:center; justify-content:center; min-width:0; overflow:hidden }
    .l + .l { border-left:.4mm solid #000 }
    .t { font-size:38mm; line-height:1; white-space:nowrap; text-align:center; display:inline-block; transform-origin:center center }
    .t.g { font-size:9mm; white-space:normal; word-break:break-word; line-height:1.05 }
  </style>${pares.map(par => `<div class="e">${par.map(e => `<div class="l"><div class="t${e.length > 6 ? ' g' : ''}">${esc(e)}</div></div>`).join('')}</div>`).join('')}`;
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent(html);
  await p.evaluate(() => {
    document.querySelectorAll('.t').forEach(t => {
      if (t.classList.contains('g')) return;
      // Preenche a célula inteira: escala X e Y independentes sobre a tinta real das letras
      // (não sobre a caixa do texto, que tem folgas) e centraliza nos dois eixos.
      const cs = getComputedStyle(t);
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = ctx.measureText(t.textContent);
      const fs = parseFloat(cs.fontSize);
      const inkW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
      const inkH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
      const cel = t.parentElement;
      const sx = cel.clientWidth * 0.74 / inkW;
      const sy = cel.clientHeight * 0.8 / inkH;
      const base = (fs - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
      const offX = (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2 - t.offsetWidth / 2;
      const offY = base + (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2 - fs / 2;
      t.style.transform = `translate(${-sx * offX}px, ${-sy * offY}px) scale(${sx}, ${sy})`;
    });
  });
  await p.pdf({ path: saida, width: '70mm', height: '40mm', printBackground: true, preferCSSPageSize: true });
  await b.close();
  console.log(`${ends.length} endereço(s) em ${pares.length} etiqueta(s) → ${saida}`);
})();
