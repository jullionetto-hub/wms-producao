#!/usr/bin/env python3
"""Monta docs/manual-wms.html juntando os capítulos de docs/manual-partes/.
Uso: python3 docs/build-manual.py
"""
import re, pathlib, html

base = pathlib.Path(__file__).parent
partes = base / 'manual-partes'

H_SUP = '<h2 id="supervisao">3. Telas da Supervisão e Gestão</h2>\n'
H_OPE = '<h2 id="operacao">4. Operação — passo a passo por etapa</h2>\n'

ORDEM = [
    '00-visao-geral.html',
    '01-acesso.html',
    ('H', H_SUP),
    '08-dashboard-tower.html',
    '02-pedidos.html',
    '07-liberacao-protocolo.html',
    '09-performance.html',
    '10-relatorios-diario.html',
    '11-cadastros.html',
    ('H', H_OPE),
    '03-separacao.html',
    '04-reposicao.html',
    '12-entrada-colmeias.html',
    '05-checkout.html',
    '06-embalagem.html',
    '13-estatisticas.html',
    '14-pessoal.html',
    '99-apendice.html',
]

def ler(nome):
    t = (partes / nome).read_text(encoding='utf8')
    # os capítulos 3 e 4 trazem o próprio <h2>; o montador insere os cabeçalhos
    t = re.sub(r'^<h2 id="(supervisao|operacao)">.*?</h2>\s*', '', t, flags=re.M)
    return t

corpo = []
for item in ORDEM:
    corpo.append(item[1] if isinstance(item, tuple) else ler(item))
miolo = '\n'.join(corpo)

# ---- menu lateral gerado a partir de h2 e das telas (h3 dentro de section.tela)
nav = []
pos = 0
tokens = re.finditer(r'<h2 id="([^"]+)">(.*?)</h2>|<section class="tela" id="([^"]+)">\s*<h3>(.*?)</h3>', miolo, flags=re.S)
for m in tokens:
    if m.group(1):
        titulo = re.sub(r'<[^>]+>', '', m.group(2))
        nav.append(f'<div class="g">{html.escape(titulo)}</div>')
    else:
        titulo = re.sub(r'<span.*?</span>', '', m.group(4), flags=re.S)
        titulo = re.sub(r'<[^>]+>', '', titulo).strip()
        nav.append(f'<a href="#{m.group(3)}">{html.escape(titulo)}</a>')
nav_html = '\n'.join(nav)

CSS = """
:root{--bg:#0f1115;--s:#171a21;--s2:#1e222b;--b:#2b303b;--t:#eef0f4;--t2:#b6bcc8;--t3:#808795;--ac:#6366f1;--g:#22c55e;--a:#f59e0b;--r:#ef4444;--bl:#60a5fa;--info:#38bdf8}
@media(prefers-color-scheme:light){:root{--bg:#f6f7f9;--s:#fff;--s2:#f0f2f5;--b:#dcdfe6;--t:#1a1d24;--t2:#464c59;--t3:#7b8190}}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:16px}
body{margin:0;background:var(--bg);color:var(--t);font:16px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif}
.layout{display:grid;grid-template-columns:290px 1fr;min-height:100vh}
nav{position:sticky;top:0;height:100vh;overflow:auto;background:var(--s);border-right:1px solid var(--b);padding:20px 14px}
nav h1{font-size:15px;margin:0 0 4px}nav .sub{font-size:12px;color:var(--t3);margin-bottom:10px}
nav input{width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--b);background:var(--s2);color:var(--t);font-size:13px;margin-bottom:8px}
nav a{display:block;color:var(--t2);text-decoration:none;font-size:13.5px;padding:4px 8px;border-radius:6px}
nav a:hover{background:var(--s2);color:var(--t)}
nav .g{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--t3);margin:14px 8px 4px}
main{padding:32px 28px 80px;max-width:940px}
h2{font-size:26px;margin:56px 0 8px;padding-top:10px;border-top:1px solid var(--b)}
h2:first-child{border:0;margin-top:0}
h3{font-size:20px;margin:30px 0 8px}
h4{font-size:14px;margin:20px 0 6px;color:var(--t2);text-transform:uppercase;letter-spacing:.05em}
p,li{color:var(--t2)}li{margin:3px 0}
b,strong{color:var(--t)}
a{color:var(--bl)}
code,.k{background:var(--s2);border:1px solid var(--b);border-radius:5px;padding:1px 6px;font-size:.9em;color:var(--t)}
table{width:100%;border-collapse:collapse;margin:10px 0;font-size:14.5px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--b);vertical-align:top}
th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--t3)}
.tela{background:var(--s);border:1px solid var(--b);border-radius:12px;padding:6px 22px 20px;margin:22px 0}
.tela>h3:first-child{margin-top:16px;padding-bottom:8px;border-bottom:1px solid var(--b)}
.tag{display:inline-block;font-size:11.5px;font-weight:700;padding:2px 9px;border-radius:99px;margin:0 4px 0 0;border:1px solid var(--b);color:var(--t2);vertical-align:middle}
.tag.sup{color:var(--bl)}.tag.op{color:var(--g)}.tag.gp{color:var(--a)}
.note{border-left:3px solid var(--a);background:var(--s2);padding:10px 14px;border-radius:0 8px 8px 0;margin:14px 0;color:var(--t2)}
.note.ok{border-color:var(--g)}.note.info{border-color:var(--bl)}
.flow{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:14px 0}
.flow span{background:var(--s);border:1px solid var(--b);border-radius:8px;padding:6px 12px;font-size:14px;font-weight:600;color:var(--t)}
.flow i{color:var(--t3);font-style:normal}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px}
@media(max-width:820px){.layout{grid-template-columns:1fr}nav{position:static;height:auto;max-height:50vh;border-right:0;border-bottom:1px solid var(--b)}main{padding:20px 16px 60px}}
@media print{nav{display:none}.layout{display:block}body{background:#fff;color:#000;font-size:11.5px}.tela{break-inside:auto;border-color:#bbb}h2{break-before:page}h3{break-after:avoid}p,li,td{color:#222}b,strong,code,.k{color:#000}}
"""

JS = """
(function(){
  var inp=document.getElementById('busca');
  if(!inp) return;
  inp.addEventListener('input',function(){
    var q=inp.value.trim().toLowerCase();
    document.querySelectorAll('nav a').forEach(function(a){
      a.style.display = (!q || a.textContent.toLowerCase().indexOf(q)>=0) ? '' : 'none';
    });
  });
})();
"""

saida = f"""<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Manual do WMS Miess</title>
<style>{CSS}</style>
</head>
<body>
<div class="layout">
<nav>
  <h1>Manual do WMS Miess</h1>
  <div class="sub">Telas, funcionalidades e passo a passo</div>
  <input id="busca" type="search" placeholder="Buscar tela...">
{nav_html}
</nav>
<main>
{miolo}
</main>
</div>
<script>{JS}</script>
</body>
</html>
"""
(base / 'manual-wms.html').write_text(saida, encoding='utf8')
print('ok', len(saida)//1024, 'KB')
