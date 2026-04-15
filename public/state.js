/* ══ STATE.JS ══ WMS Miess — Estado Global Compartilhado ══ */

const API = window.location.origin;
let usuarioAtual       = null;
let separadorAtual     = null;
let pedidoAtualId      = null;
let pedidoAtualNum     = null;
let itensAtuais        = [];
let todosSeparadores   = [];
let pedidosImportar    = [];
let transportadorasImportar = [];
let historicoImportacoes = JSON.parse(localStorage.getItem('historico_importacoes') || '[]');
let pedidoCaixaVinculada = false;
let alertaInterval     = null;
let perfilSelecionado  = '';
let repFiltroAtivo     = '';