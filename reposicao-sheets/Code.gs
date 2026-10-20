/**
 * Relatorio de Solicitacao de Reposicao 2026
 * Script vinculado a propria planilha (Extensoes > Apps Script).
 * Os dados nunca saem da conta Google: a pagina e servida pelo proprio Apps Script.
 */
var ANO = 2026;
// Se o projeto NAO foi criado por Extensoes > Apps Script dentro da planilha,
// cole aqui o ID da planilha (trecho da URL entre /d/ e /edit). Senao deixe vazio.
var ID_PLANILHA = '';
// true = ignora abas com data depois de hoje (modelos/copias adiantadas nao entram no relatorio)
var IGNORAR_FUTURO = true;
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

function planilha_() {
  var ss = ID_PLANILHA ? SpreadsheetApp.openById(ID_PLANILHA) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Planilha nao encontrada: preencha ID_PLANILHA no topo do Codigo.gs');
  return ss;
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Reposicao ' + ANO)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function norm_(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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
  var hoje = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  planilha_().getSheets().forEach(function (sh) {
    var m = /^\s*(\d{1,2})\s*[\/\-.*_]\s*(\d{1,2})\s*$/.exec(sh.getName());
    if (!m) return; // ignora abas que nao sao dia
    var dia = +m[1], mes = +m[2];
    var data = ANO + '-' + ('0' + mes).slice(-2) + '-' + ('0' + dia).slice(-2);
    if (IGNORAR_FUTURO && data > hoje) return;
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
      if (k && col[k] === undefined) col[k] = c; // so a 1a ocorrencia (ignora tabelas laterais)
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

/** Teste: rode esta funcao no editor e veja o Registro de execucao. */
function testar() {
  var d = getDados();
  Logger.log('Linhas lidas: ' + d.length);
  Logger.log(JSON.stringify(d.slice(0, 3)));
}

/**
 * Diagnostico: conta, aba por aba, quantas celulas contem o NOME.
 * Rode e veja o Registro de execucao. Troque NOME se quiser outro.
 */
function diagnostico() {
  var NOME = 'ronivaldo';
  var total = 0;
  planilha_().getSheets().forEach(function (sh) {
    var v = sh.getDataRange().getDisplayValues(), n = 0, primeira = '';
    for (var r = 0; r < v.length; r++) {
      for (var c = 0; c < v[r].length; c++) {
        if (String(v[r][c]).toLowerCase().indexOf(NOME) >= 0) {
          n++;
          if (!primeira) primeira = sh.getRange(r + 1, c + 1).getA1Notation();
        }
      }
    }
    if (n) { Logger.log('Aba "' + sh.getName() + '": ' + n + ' celulas (primeira em ' + primeira + ')'); total += n; }
  });
  Logger.log('Total de celulas com "' + NOME + '": ' + total);
}
