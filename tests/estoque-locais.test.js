/**
 * Indicadores da aba "Locais" do Estoque 3D (views/modelo-estoque.html):
 * onde cada produto está endereçado (colmeia / vertical / armazém) e como estão as posições.
 * As funções vivem dentro do HTML; aqui são extraídas e rodadas num vm com um mapa fake.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'views', 'modelo-estoque.html'), 'utf8');
const pega = (re) => { const m = html.match(re); if (!m) throw new Error('trecho não encontrado: ' + re); return m[0]; };

function criaCtx({ produtos, cestos, crateRecs }) {
  const ctx = { produtos, cestos, crateRecs };
  vm.createContext(ctx);
  vm.runInContext(pega(/const pd2 = [^\n]*\n/), ctx);
  vm.runInContext(pega(/function normLoc\(tok\)\{[\s\S]*?\n}\n/), ctx);
  vm.runInContext(pega(/const normCod = [^\n]*\n/), ctx);
  vm.runInContext(pega(/const RE_BRINDE = [^\n]*\n/), ctx);
  vm.runInContext(pega(/const codeKey = [^\n]*\n/), ctx);
  vm.runInContext(pega(/const ROT_END = [^\n]*\n/), ctx);
  ['classificarEnderecos', 'calcularIndicadoresLocais', 'rotuloGrupo']
    .forEach(n => vm.runInContext(pega(new RegExp(`function ${n}\\([\\s\\S]*?\\n}\\n`)), ctx));
  return ctx;
}
const prod = (cod, loc, desc = '', saldo = 5) => ({ cod, nome: 'Produto ' + cod, loc, desc, saldo });

describe('classificarEnderecos', () => {
  const { classificarEnderecos: cl } = criaCtx({ produtos: [], cestos: [], crateRecs: [] });
  const letras = (p) => Object.entries(cl(p)).filter(([, v]) => v).map(([k]) => k).sort().join('');

  test('colmeia, rua ZA e arara contam como colmeia', () => {
    expect(letras(prod('1', 'A012'))).toBe('C');
    expect(letras(prod('2', 'ZA 380'))).toBe('C');
    expect(letras(prod('3', '.Arara 5'))).toBe('C');
  });
  test('só vertical (incluindo prefixo antes de VERT)', () => {
    expect(letras(prod('4', 'VERT-A01-CX01'))).toBe('V');
    expect(letras(prod('5', 'YVERT-Y01-CX02 / VERT-C06-CX15'))).toBe('V');
  });
  test('colmeia + vertical e armazém pelo descritor', () => {
    expect(letras(prod('6', 'A002/A003/VERT-A01-CX01'))).toBe('CV');
    expect(letras(prod('7', '', 'CC028-'))).toBe('A');
    expect(letras(prod('8', 'B080', 'kk038'))).toBe('AC');
  });
  test('sem endereço: vazio, ponto ou descritor só com traço', () => {
    expect(letras(prod('9', ''))).toBe('');
    expect(letras(prod('10', ' . ', ' - '))).toBe('');
  });
  test('locais fora do mapa (saldão, outlet) viram "outros"', () => {
    expect(letras(prod('11', 'SALDAO-CX01'))).toBe('O');
    expect(letras(prod('12', 'OUTLET-CX3 / A010'))).toBe('CO');
  });
});

describe('calcularIndicadoresLocais', () => {
  const cesto = (addr, corr, prods = [], extra = {}) => ({ addr, corr, prods, ...extra });
  const cx = (addr, prods = []) => ({ addr, prods });

  const A = prod('A', 'A001'), B = prod('B', 'A001'), C = prod('C', 'A001'), D = prod('D', 'A001'), D2 = prod('D-BRINDESITE', 'A001'), E = prod('E', 'B001');
  const ctx = criaCtx({
    produtos: [A, B, C, D, D2, E, prod('V1', 'VERT-A01-CX01'), prod('V2', 'VERT-A01-CX01', 'CC001-'), prod('AR1', '', 'KK019-'), prod('AR2', '', 'AA177- AA198-'), prod('X', ''), prod('CV', 'A002/VERT-A01-CX02')],
    cestos: [
      cesto('A001', 'A', [A, B, C, D, D2]),    // 5 cadastros, 4 produtos (o -BRINDE soma no original)
      cesto('A002', 'A', [prod('CV', 'A002')]),
      cesto('A003', 'A'),                      // livre
      cesto('B001', 'B', [E]),
      cesto('B002', 'B'),                      // livre
      cesto('Z001', 'Z', [], { parede: true }) // parede não conta
    ],
    crateRecs: [cx('VERT-A01-CX01', [prod('V1', '')]), cx('VERT-A01-CX02'), cx('VERT-A01-CX03'), { addr: '' }],
  });
  const I = ctx.calcularIndicadoresLocais();

  test('colmeias livres (ignora parede) e por rua', () => {
    expect(I.colmeias).toBe(5);
    expect(I.colmeiasLivres.map(c => c.addr)).toEqual(['A003', 'B002']);
    expect(I.ruas).toEqual({ A: [3, 1], B: [2, 1] });
  });
  test('caixas VERT livres só entre as que têm endereço', () => {
    expect(I.caixas).toBe(3);
    expect(I.caixasLivres).toBe(2);
  });
  test('colmeias com mais de 3 produtos: -BRINDE conta junto do original', () => {
    expect(I.mais3).toHaveLength(1);
    expect(I.mais3[0].c.addr).toBe('A001');
    expect(I.mais3[0].n).toBe(4);
  });
  test('só vertical exclui quem também tem armazém; só armazém e sem endereço', () => {
    expect(I.soVertical.map(p => p.cod)).toEqual(['V1']);
    expect(I.soArmazem.map(p => p.cod)).toEqual(['AR1', 'AR2']);
    expect(I.semEndereco.map(p => p.cod)).toEqual(['X']);
  });
  test('os grupos somam o total de produtos', () => {
    const soma = Object.values(I.grupos).reduce((a, g) => a + g.length, 0);
    expect(soma).toBe(I.total);
    expect(I.grupos.CV.map(p => p.cod)).toEqual(['CV']);
  });
  test('rótulos dos grupos', () => {
    expect(ctx.rotuloGrupo('V')).toBe('Só vertical');
    expect(ctx.rotuloGrupo('A')).toBe('Só armazém');
    expect(ctx.rotuloGrupo('CV')).toBe('Colmeias + Vertical');
    expect(ctx.rotuloGrupo('-')).toBe('Sem endereço');
  });
});

describe('importação da planilha de saldo (HTML)', () => {
  test('lê Saldo, Disponível e Descritor simples e guarda 6 colunas', () => {
    expect(html).toMatch(/ach\(\/\^saldo\/, -1\)/);
    expect(html).toMatch(/ach\(\/descritor\|armazem\/, -1\)/);
    expect(html).toMatch(/\[cod, o\.nome, o\.locs\.join\(' \/ '\), o\.saldo, o\.disp, o\.desc\]/);
  });
  test('quando há WMS ao vivo o descritor do arquivo é mantido', () => {
    expect(html).toMatch(/r\[4\], l && l\[5\] \? l\[5\] : ''\]/);
  });
  test('planilha antiga de 3 colunas continua valendo (saldo nulo, não zero)', () => {
    expect(html).toMatch(/saldo:r\.length > 3 && r\[3\] != null \? Number\(r\[3\]\) : null/);
  });
});
