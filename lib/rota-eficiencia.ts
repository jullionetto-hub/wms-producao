// Eficiência de rota da separação: compara o caminho REAL do separador (ordem em que marcou os itens)
// com a melhor ordem para as MESMAS paradas, e mede o ritmo entre marcações (rajadas = vários itens marcados
// em poucos segundos, sinal de que foram marcados sem passar pelo endereço).
//
// A distância vem da geometria do ESTOQUE 3D (views/modelo-estoque.html): planta do galpão em metros, grafo de
// caminhada pelas ruas do desenho e posição de cada endereço. Os dados foram extraídos da própria página para
// lib/estoque-geometria.json (rodar de novo a extração se o desenho do estoque mudar — ver docs/rota-eficiencia.md).
// A conta de distância entre dois endereços é a mesma do botão "Rota" do Estoque 3D (distPar).
import geo from './estoque-geometria.json';

export interface ItemRota { endereco?: string | null; hora_verificado?: string | null }
export interface ResultadoPedido {
  passos: number;            // endereços distintos consecutivos percorridos
  distReal: number;          // metros
  distIdeal: number;         // metros (melhor ordem encontrada para os mesmos endereços; nunca maior que a real)
  evitavelPct: number;       // % da caminhada real que a ordem ideal evitaria (0 = já ideal)
  itensMarcados: number;
  intervalosSeg: number[];   // segundos entre marcações consecutivas
  itensEmRajada: number;     // itens marcados ≤ LIMITE_RAJADA_SEG depois do anterior, em sequência de ≥ MIN_ITENS_RAJADA
  temRajada: boolean;
}

export const LIMITE_RAJADA_SEG = 5;
export const MIN_ITENS_RAJADA = 3;
export const PAUSA_SEG = 1800;          // intervalos acima disso são pausa (almoço etc.), não entram na mediana
export const VELOCIDADE_M_S = 1.1;      // mesma velocidade usada na rota do Estoque 3D

// ── geometria ────────────────────────────────────────────────────────────────
type Entrada = number[];   // [indiceParada, along, no1, d1, (no2, d2)]
const ENDERECOS = geo.enderecos as unknown as Record<string, Entrada>;
const DIST = geo.dist as number[][];

const pd = (s: string, n: number) => String(+s).padStart(n, '0');
// Mesmas regras de chaveEnd/normLoc do Estoque 3D. Usa só o endereço primário (antes de "," e de "/").
export function chaveEndereco(bruto?: string | null): string | null {
  if (!bruto) return null;
  const u = String(bruto).split(',')[0].split('/')[0].trim().toUpperCase(); let m: RegExpMatchArray | null;
  if ((m = u.match(/^(?:[A-Z])?VERT[-\s]?([A-Z])(\d{1,2})[-\s]?CX[-\s]?(\d{1,2})$/))) return `VERT-${m[1]}${pd(m[2], 2)}-CX${pd(m[3], 2)}`;
  if ((m = u.match(/^\.?ARARA\s*(\d{1,2})$/))) return `ARARA ${+m[1]}`;
  if ((m = u.match(/^ZA[\s-]?(\d{1,3})$/))) return `ZA${pd(m[1], 3)}`;
  if ((m = u.match(/^([A-Z])[\s-]?(\d{1,3})$/))) return `${m[1]}${pd(m[2], 3)}`;
  return null;
}

interface Parada { chave: string; e: Entrada }
function parada(endereco?: string | null): Parada | null {
  const k = chaveEndereco(endereco); if (!k) return null;
  const e = ENDERECOS[k]; return e ? { chave: k, e } : null;
}
function distancia(a: Parada, b: Parada): number {
  if (a.e[0] === b.e[0]) return Math.abs(a.e[1] - b.e[1]);   // mesma rua/lado: anda ao longo dela
  let m = Infinity;
  for (let i = 2; i + 1 < a.e.length; i += 2) for (let j = 2; j + 1 < b.e.length; j += 2) {
    const d = DIST[a.e[i]][b.e[j]]; if (d < 0) continue;
    const t = a.e[i + 1] + d + b.e[j + 1]; if (t < m) m = t;
  }
  return m === Infinity ? 999 : m;
}
const tamanho = (o: number[], D: number[][]) => { let s = 0; for (let i = 0; i + 1 < o.length; i++) s += D[o[i]][o[i + 1]]; return s; };

// Melhor ordem com o PRIMEIRO ponto fixo (onde o separador realmente começou) e o fim livre:
// parte da ordem real e do vizinho mais próximo, refina com 2-opt e realocação, e fica com a menor.
function melhorOrdem(D: number[][], real: number[]): number[] {
  const n = D.length;
  const nn = [0]; const usado = new Set([0]);
  while (nn.length < n) { let b = -1, bd = Infinity; for (let j = 1; j < n; j++) if (!usado.has(j) && D[nn[nn.length - 1]][j] < bd) { bd = D[nn[nn.length - 1]][j]; b = j; } nn.push(b); usado.add(b); }
  const refinar = (ini: number[]) => {
    let o = ini.slice(), mel = true;
    while (mel) {
      mel = false;
      for (let i = 1; i < n - 1 && !mel; i++) for (let k = i + 1; k < n && !mel; k++) {
        const nv = o.slice(0, i).concat(o.slice(i, k + 1).reverse(), o.slice(k + 1));
        if (tamanho(nv, D) + 1e-6 < tamanho(o, D)) { o = nv; mel = true; }
      }
      for (let i = 1; i < n && !mel; i++) for (let j = 1; j < n && !mel; j++) {
        if (i === j) continue; const x = o.slice(); const [e] = x.splice(i, 1); x.splice(j, 0, e);
        if (tamanho(x, D) + 1e-6 < tamanho(o, D)) { o = x; mel = true; }
      }
    }
    return o;
  };
  const a = refinar(nn), b = refinar(real);
  return tamanho(a, D) <= tamanho(b, D) ? a : b;
}

// "HH:MM:SS" (ou "HH:MM") → segundos do dia; null se não for hora válida
export function segundosDoDia(h?: string | null): number | null {
  const m = String(h || '').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/); if (!m) return null;
  return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0);
}

// Ordem real de marcação, já com a virada da meia-noite resolvida (turno da noite): se há marcações depois das 18h
// e antes das 6h no mesmo pedido, as da madrugada contam como "dia seguinte".
export function ordenarPorHora(itens: ItemRota[]): { item: ItemRota; t: number }[] {
  const com = itens.map(item => ({ item, t: segundosDoDia(item.hora_verificado) })).filter((x): x is { item: ItemRota; t: number } => x.t != null);
  const tarde = com.some(x => x.t >= 18 * 3600), madruga = com.some(x => x.t < 6 * 3600);
  if (tarde && madruga) com.forEach(x => { if (x.t < 6 * 3600) x.t += 86400; });
  return com.sort((a, b) => a.t - b.t);
}

export function analisarPedido(itens: ItemRota[]): ResultadoPedido {
  const ord = ordenarPorHora(itens);
  const intervalosSeg: number[] = []; for (let i = 1; i < ord.length; i++) intervalosSeg.push(ord[i].t - ord[i - 1].t);
  // rajadas: sequências de ≥ MIN_ITENS_RAJADA itens em que cada um foi marcado até LIMITE_RAJADA_SEG depois do anterior
  let itensEmRajada = 0, seq = 1;
  for (let i = 0; i < intervalosSeg.length; i++) {
    if (intervalosSeg[i] <= LIMITE_RAJADA_SEG) seq++; else { if (seq >= MIN_ITENS_RAJADA) itensEmRajada += seq; seq = 1; }
  }
  if (seq >= MIN_ITENS_RAJADA) itensEmRajada += seq;
  // caminho real: endereços consecutivos distintos (itens no mesmo endereço em sequência não são novo passo)
  const passos: Parada[] = [];
  for (const { item } of ord) { const p = parada(item.endereco); if (!p) continue; const u = passos[passos.length - 1]; if (u && u.chave === p.chave) continue; passos.push(p); }
  // pontos únicos (um endereço visitado de novo conta uma vez na ordem ideal); a ordem real usa os índices desses pontos
  const unicos: Parada[] = [], idx = new Map<string, number>();
  for (const p of passos) if (!idx.has(p.chave)) { idx.set(p.chave, unicos.length); unicos.push(p); }
  const D = unicos.map(a => unicos.map(b => a === b ? 0 : distancia(a, b)));
  const real = passos.map(p => idx.get(p.chave) as number);
  let distReal = 0; for (let i = 0; i + 1 < real.length; i++) distReal += D[real[i]][real[i + 1]];
  let distIdeal = distReal;
  if (unicos.length > 2) { const o = melhorOrdem(D, [real[0], ...Array.from(new Set(real)).filter(x => x !== real[0])]); distIdeal = Math.min(distReal, tamanho(o, D)); }
  const evitavelPct = distReal > 0 ? Math.round((1 - distIdeal / distReal) * 1000) / 10 : 0;
  return { passos: passos.length, distReal, distIdeal, evitavelPct, itensMarcados: ord.length, intervalosSeg, itensEmRajada, temRajada: itensEmRajada > 0 };
}

export function mediana(v: number[]): number | null {
  if (!v.length) return null; const s = v.slice().sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
