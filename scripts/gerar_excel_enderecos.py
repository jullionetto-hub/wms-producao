#!/usr/bin/env python3
"""Gera Excel de etiquetas de endereço 70 x 40mm (ZD220), 2 endereços lado a lado por etiqueta.
Uso: python3 scripts/gerar_excel_enderecos.py "A01-A20" saida.xlsx
Cada linha = 1 etiqueta (1 página de 70x40mm). Editável: basta trocar o texto das células."""
import re, sys
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, Border, Side
from openpyxl.worksheet.pagebreak import Break

def expandir(txt):
    out = []
    for t in re.split(r'[,;\n]+', txt):
        t = t.strip()
        if not t: continue
        m = re.match(r'^(.*?)(\d+)\s*-\s*\1?(\d+)$', t)
        if m and int(m[3]) >= int(m[2]) and int(m[3]) - int(m[2]) < 500:
            w = len(m[2])
            out += [m[1] + str(n).zfill(w) for n in range(int(m[2]), int(m[3]) + 1)]
        else:
            out.append(t)
    return out

ends = expandir(sys.argv[1]); saida = sys.argv[2]
pares = [ends[i:i + 2] for i in range(0, len(ends), 2)]

MM_PT = 72 / 25.4
wb = Workbook(); ws = wb.active; ws.title = 'Etiquetas'
# 35mm ≈ 132px; 17,4 caracteres deixa folga p/ as 2 colunas caberem em 70mm
ws.column_dimensions['A'].width = 17.4
ws.column_dimensions['B'].width = 17.4
fonte = Font(name='Arial', size=36, bold=True)
centro = Alignment(horizontal='center', vertical='center')
linha = Side(style='medium', color='000000')  # linha do meio: direita da col. A + esquerda da col. B
for i, par in enumerate(pares, start=1):
    ws.row_dimensions[i].height = 40 * MM_PT  # 40mm
    for j in range(2):  # sempre as 2 colunas, pra linha do meio aparecer em toda etiqueta
        e = par[j] if j < len(par) else None
        c = ws.cell(row=i, column=j + 1, value=e)
        c.font = fonte; c.alignment = centro
        c.border = Border(right=linha) if j == 0 else Border(left=linha)
    if i < len(pares): ws.row_breaks.append(Break(id=i))

ws.page_setup.paperWidth = '70mm'; ws.page_setup.paperHeight = '40mm'
ws.page_setup.orientation = 'portrait'
from openpyxl.worksheet.properties import PageSetupProperties
ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 0  # garante as 2 colunas na mesma página
ws.page_margins.left = ws.page_margins.right = ws.page_margins.top = ws.page_margins.bottom = 0
ws.page_margins.header = ws.page_margins.footer = 0
ws.print_options.horizontalCentered = True; ws.print_options.verticalCentered = True
ws.print_area = f'A1:B{len(pares)}'
wb.save(saida); print(f'{len(ends)} endereço(s) em {len(pares)} etiqueta(s) → {saida}')
