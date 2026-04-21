// Tabela de pontuação por segmento do estoque
const SEGMENTOS_ESTOQUE = [
  ['A',1,84,'Frente','Facil'],['B',1,168,'Frente','Facil'],['C',1,168,'Frente','Facil'],['D',1,168,'Frente','Facil'],['E',1,77,'Frente','Facil'],
  ['F',1,40,'Fundo','Dificil'],['G',41,96,'Fundo','Dificil'],['H',1,112,'Fundo','Dificil'],
  ['I',1,112,'Fundo','Dificil'],['I',113,203,'Frente','Dificil'],
  ['J',1,91,'Frente','Dificil'],['J',204,287,'Frente','Dificil'],['J',92,147,'Fundo','Dificil'],['J',148,203,'Fundo','Dificil'],
  ['K',1,84,'Frente','Dificil'],['K',197,287,'Frente','Dificil'],['K',85,140,'Fundo','Dificil'],['K',141,196,'Fundo','Dificil'],
  ['L',1,91,'Frente','Dificil'],['L',204,294,'Frente','Dificil'],['L',148,203,'Fundo','Dificil'],['L',92,147,'Fundo','Dificil'],
  ['M',1,91,'Frente','Medio'],['M',204,287,'Frente','Medio'],['M',92,147,'Fundo','Medio'],['M',148,203,'Fundo','Medio'],
  ['N',1,84,'Frente','Medio'],['N',197,287,'Frente','Medio'],['N',141,196,'Fundo','Medio'],['N',85,140,'Fundo','Medio'],
  ['O',1,91,'Frente','Medio'],['O',204,294,'Frente','Medio'],['O',92,147,'Fundo','Medio'],['O',148,203,'Fundo','Medio'],
  ['P',1,91,'Frente','Facil'],['P',204,287,'Frente','Facil'],['P',92,147,'Fundo','Facil'],['P',148,203,'Fundo','Facil'],
  ['Q',1,84,'Frente','Facil'],['Q',197,287,'Frente','Facil'],['Q',85,140,'Fundo','Facil'],['Q',141,196,'Fundo','Facil'],
  ['R',1,91,'Frente','Facil'],['R',204,294,'Frente','Facil'],['R',92,147,'Fundo','Facil'],['R',148,203,'Fundo','Facil'],
  ['S',1,91,'Frente','Facil'],['S',204,294,'Frente','Facil'],['S',92,147,'Fundo','Facil'],['S',148,203,'Fundo','Facil'],
  ['T',1,84,'Frente','Facil'],['T',197,287,'Frente','Facil'],['T',85,140,'Fundo','Facil'],['T',141,196,'Fundo','Facil'],
  ['U',1,91,'Frente','Facil'],['U',204,347,'Frente','Facil'],['U',92,147,'Fundo','Facil'],['U',148,203,'Fundo','Facil'],
  ['V',1,144,'Frente','Medio'],['V',257,360,'Frente','Medio'],['V',145,200,'Fundo','Medio'],['V',201,256,'Fundo','Medio'],
  ['W',1,104,'Frente','Medio'],['W',241,352,'Frente','Medio'],['W',105,160,'Fundo','Medio'],['W',161,240,'Fundo','Medio'],
  ['X',1,112,'Frente','Medio'],['X',233,352,'Frente','Medio'],['X',113,192,'Fundo','Medio'],['X',193,232,'Fundo','Medio'],
  ['Y',1,120,'Frente','Medio'],['Y',201,320,'Frente','Medio'],['Y',121,160,'Fundo','Medio'],['Y',161,200,'Fundo','Medio'],
  ['Z',1,120,'Frente','Medio'],['Z',121,160,'Fundo','Medio'],
];

const PESOS = {
  'Facil_Frente':1.0,'Facil_Fundo':1.3,
  'Medio_Frente':1.8,'Medio_Fundo':2.2,
  'Dificil_Frente':2.8,'Dificil_Fundo':3.5
};

function calcularPesoCorredor(endereco) {
  if (!endereco) return 1.0;
  const end = String(endereco).split(',')[0].trim().toUpperCase();
  if (end.startsWith('ZA') || end.includes('ARARA') || end.includes('VERT')) return 3.5;
  const m = end.match(/^([A-Z]+)(\d+)/);
  if (!m) return 1.0;
  const [, rua, ns] = m;
  const num = parseInt(ns);
  for (const [sR,de,ate,loc,niv] of SEGMENTOS_ESTOQUE) {
    if (sR === rua && de <= num && num <= ate) return PESOS[niv+'_'+loc] || 1.0;
  }
  for (const [sR,,,loc,niv] of SEGMENTOS_ESTOQUE) {
    if (sR === rua) return PESOS[(niv||'Facil')+'_'+(loc||'Frente')] || 1.0;
  }
  return 1.0;
}

function calcularPontuacaoPedido(itens) {
  if (!itens?.length) return 0;
  const soma = itens.reduce((s,i) => s + calcularPesoCorredor(i.endereco) * (parseInt(i.quantidade)||1), 0);
  const ruas = new Set(itens.map(i => String(i.endereco||'').split(',')[0].trim().replace(/\d+/g,'').trim())).size;
  return Math.round(soma + ruas * 2);
}

module.exports = { SEGMENTOS_ESTOQUE, calcularPesoCorredor, calcularPontuacaoPedido };
