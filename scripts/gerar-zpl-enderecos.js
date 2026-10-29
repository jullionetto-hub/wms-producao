#!/usr/bin/env node
// Gera ZPL de etiquetas de endereço 70 x 40mm (Zebra ZD220, 203 dpi → 560 x 320 dots).
// Uso: node scripts/gerar-zpl-enderecos.js "A01-A10, B05" [saida.zpl]
'use strict';
const fs = require('fs');

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

function zpl(end) {
  const longo = end.length > 6;
  const h = longo ? 90 : 200; // altura da fonte em dots (203 dpi: 8 dots = 1mm)
  const y = longo ? 110 : 60;
  const lin = longo ? 2 : 1;
  return [
    '^XA', '^CI28', '^PW560', '^LL320', '^LH0,0', '^LS0',
    `^FO0,${y}^FB560,${lin},0,C,0^A0N,${h},${h}^FD${end.replace(/[\^~\\]/g, '')}^FS`,
    '^XZ',
  ].join('\n');
}

const [lista, saida] = process.argv.slice(2);
const ends = expandir(lista);
if (!ends.length) { console.error('Informe os endereços. Ex: "A01-A10, B05"'); process.exit(1); }
const conteudo = ends.map(zpl).join('\n') + '\n';
if (saida) { fs.writeFileSync(saida, conteudo); console.log(`${ends.length} etiqueta(s) → ${saida}`); }
else process.stdout.write(conteudo);
