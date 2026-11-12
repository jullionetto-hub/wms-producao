/**
 * Gera lib/estoque-geometria.json a partir da página do Estoque 3D (views/modelo-estoque.html).
 * Roda a página no Edge sem tela, expõe as funções de distância dela e grava, para cada endereço, a posição
 * (rua/lado, distância ao longo dela e ligações ao grafo de caminhada) mais a matriz de distâncias do grafo, em metros.
 * Rodar de novo SEMPRE que o desenho do estoque (ruas, racks, posições) mudar:
 *   node scripts/extrair-geometria-estoque.js
 * Precisa do Microsoft Edge instalado (caminho abaixo) e de internet (a página carrega o three.js de um CDN).
 */
const { spawn } = require('child_process');
const path = require('path'), os = require('os'), fs = require('fs');
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const RAIZ = path.join(__dirname, '..');
const esp = (ms) => new Promise((r) => setTimeout(r, ms));
const MARCA = '/* — desenho da rota (3D e 2D) — */';

const EXTRAIR = `(() => { const S = window.__geo; const ids = S.IDS; const ni = {}; ids.forEach((id, i) => { ni[id] = i; });
  const dist = ids.map((_, i) => ids.map((_, j) => { const v = S.DIST[i][j]; return v === Infinity ? -1 : Math.round(v * 100) / 100; }));
  const paradas = []; const pidx = {}; const end = {};
  Object.keys(S.byAddr).forEach(k => { const p = S.infoParada(S.byAddr[k]); if (pidx[p.key] == null) { pidx[p.key] = paradas.length; paradas.push(p.key); }
    const v = [pidx[p.key], Math.round(p.a * 100) / 100]; p.links.slice(0, 2).forEach(x => { v.push(ni[x.id], Math.round(x.d * 100) / 100); }); end[k] = v; });
  return JSON.stringify({ versao: 1, unidade: 'm', nos: ids, dist, paradas, enderecos: end }); })()`;

(async () => {
  const html = fs.readFileSync(path.join(RAIZ, 'views', 'modelo-estoque.html'), 'utf8');
  const i = html.indexOf(MARCA); if (i < 0) throw new Error('Marcador não encontrado em modelo-estoque.html — a página mudou; ajuste MARCA.');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wms-geo-'));
  const arq = path.join(tmp, 'geo.html');
  fs.writeFileSync(arq, html.slice(0, i) + 'window.__geo = { byAddr, infoParada, DIST, IDS };\n' + html.slice(i));
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9339', `--user-data-dir=${path.join(tmp, 'perfil')}`, '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  try {
    let alvo; for (let k = 0; k < 40 && !alvo; k++) { await esp(500); try { alvo = (await (await fetch('http://127.0.0.1:9339/json/list')).json()).find((t) => t.type === 'page'); } catch (_) { /* aguardando o Edge */ } }
    const ws = new WebSocket(alvo.webSocketDebuggerUrl); await new Promise((ok) => (ws.onopen = ok));
    let id = 0; const pend = new Map();
    ws.onmessage = (m) => { const j = JSON.parse(m.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } };
    const send = (method, params = {}) => new Promise((ok) => { const n = ++id; pend.set(n, ok); ws.send(JSON.stringify({ id: n, method, params })); });
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.navigate', { url: 'file:///' + arq.replace(/\\/g, '/') });
    for (let k = 0; k < 90; k++) { await esp(1000); const r = await send('Runtime.evaluate', { expression: 'typeof window.__geo', returnByValue: true }); if (r.result.result.value === 'object') break; }
    const r = await send('Runtime.evaluate', { expression: EXTRAIR, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
    const json = JSON.parse(r.result.result.value);
    fs.writeFileSync(path.join(RAIZ, 'lib', 'estoque-geometria.json'), JSON.stringify(json));
    console.log(`lib/estoque-geometria.json gerado: ${Object.keys(json.enderecos).length} endereços, ${json.nos.length} nós do grafo.`);
  } finally { edge.kill(); await esp(1500); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* o Edge ainda segura a pasta temporária; o sistema limpa depois */ } }
  process.exit(0);
})().catch((e) => { console.error('FALHA', e.message); process.exit(1); });
