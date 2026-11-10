/**
 * Parametros de URL repetidos (?dia=a&dia=b): o Express entrega uma LISTA em vez de texto.
 * Varias rotas leem req.query.x como texto (.split, .substring, parametro de SQL), entao a
 * lista derrubava a requisicao com erro 500. Esta regra vale para TODAS as rotas:
 * se o parametro vier repetido, usa o PRIMEIRO valor — o mesmo que parseInt(lista) ja
 * fazia. Parametro unico (o caso normal) nao muda.
 */
function normalizarQuery(req, _res, next) {
  const q = req.query;
  if (q && typeof q === 'object') {
    for (const k of Object.keys(q)) {
      if (Array.isArray(q[k])) q[k] = q[k][0];
    }
  }
  next();
}

module.exports = { normalizarQuery };
