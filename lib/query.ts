import type { Request, Response, NextFunction } from 'express';

/**
 * Parametros de URL repetidos (?dia=a&dia=b): o Express entrega uma LISTA em vez de texto.
 * Varias rotas leem req.query.x como texto (.split, .substring, parametro de SQL), entao a
 * lista derrubava a requisicao com erro 500. Esta regra vale para TODAS as rotas:
 * se o parametro vier repetido, usa o PRIMEIRO valor — o mesmo que parseInt(lista) ja
 * fazia. Parametro unico (o caso normal) nao muda.
 */
export function normalizarQuery(req: Request, _res: Response, next: NextFunction): void {
  const q = req.query as Record<string, unknown>;
  if (q && typeof q === 'object') {
    for (const k of Object.keys(q)) {
      const v = q[k];
      if (Array.isArray(v)) q[k] = v[0];
    }
  }
  next();
}
