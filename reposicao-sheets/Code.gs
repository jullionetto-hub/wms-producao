/**
 * Relatorio de Solicitacao de Reposicao 2026
 * Script vinculado a propria planilha (Extensoes > Apps Script).
 * Os dados nunca saem da conta Google: a pagina e servida pelo proprio Apps Script.
 */
var ANO = 2026;
// Cabecalhos esperados (sem acento, minusculo) -> campo
var CAMPOS = {
  'horario': 'horario',
  'codigo': 'codigo',
  'formas de envio': 'envio',
  'separador': 'separador',
  'quem pegou': 'pegou',
  'quem guardou': 'guardou',
  'situacao': 'situacao',
  'obs': 'obs'
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Reposicao ' + ANO)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function norm_(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[:\s]+$/, '').trim();
}

function horario_(txt) {
  var m = /(\d{1,2})\s*[hH:]\s*(\d{2})/.exec(txt);
  if (!m) return '';
  return ('0' + m[1]).slice(-2) + ':' + m[2];
}

/** Le todas as abas com nome de dia (01/10, 1-10, 01.10) e devolve as linhas. */
function getDados() {
  var out = [];
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(function (sh) {
    var m = /^\s*(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*$/.exec(sh.getName());
    if (!m) return; // ignora abas que nao sao dia
    var dia = +m[1], mes = +m[2];
    var data = ANO + '-' + ('0' + mes).slice(-2) + '-' + ('0' + dia).slice(-2);
    var v = sh.getDataRange().getDisplayValues();

    // acha a linha de cabecalho (primeira com "codigo") e mapeia as colunas
    var h = -1, col = {};
    for (var r = 0; r < Math.min(v.length, 10) && h < 0; r++) {
      for (var c = 0; c < v[r].length; c++) {
        if (norm_(v[r][c]) === 'codigo') h = r;
      }
    }
    if (h < 0) return;
    v[h].forEach(function (t, c) {
      var k = CAMPOS[norm_(t)];
      if (k) col[k] = c;
    });
    if (col.codigo === undefined) return;

    for (var i = h + 1; i < v.length; i++) {
      var cod = String(v[i][col.codigo]).trim();
      if (!cod) continue;
      var g = function (k) { return col[k] === undefined ? '' : String(v[i][col[k]]).trim(); };
      out.push({
        data: data,
        horario: horario_(g('horario')),
        codigo: cod,
        envio: g('envio'),
        separador: g('separador').toUpperCase(),
        pegou: g('pegou').toUpperCase(),
        guardou: g('guardou').toUpperCase(),
        situacao: g('situacao').toUpperCase(),
        obs: g('obs')
      });
    }
  });
  return out;
}
