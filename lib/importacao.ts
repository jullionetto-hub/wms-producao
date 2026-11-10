/* ══ Importação de pedidos — detecção de pedido repetido (lógica pura, sem banco) ══
   O arquivo do MIESS traz TODOS os pedidos aguardando separação, então o mesmo pedido aparece em
   importações diferentes (ou o mesmo arquivo sobe duas vezes). Um pedido é REPETIDO quando o número já
   está no sistema e o arquivo não traz nada novo para ele: aí o import é bloqueado.
   Se o pedido existe mas está incompleto (sem cliente/transportadora válida/estado/aguardando ou sem itens)
   e o arquivo completa isso, ele NÃO é repetido: é "completa" e segue o fluxo de preencher os vazios
   (é assim que a reimportação corrige a transportadora que veio errada, por exemplo). */

// Uma linha (item) do arquivo importado. Os campos vêm do arquivo, por isso são todos opcionais.
export interface LinhaImportada {
  numero_pedido?: unknown;
  codigo?: unknown;
  quantidade?: unknown;
  cliente?: unknown;
  transportadora?: unknown;
  aguardando_desde?: unknown;
  estado?: unknown;
  [campo: string]: unknown;
}

export interface DadosPedido {
  itensReais: LinhaImportada[];
  cliente: string;
  transportadora: string;
  aguardando: string;
  estado: string;
}

// Pedido que já está no sistema (só os campos que importam pra comparar).
export interface PedidoExistente {
  cliente?: unknown;
  transportadora?: unknown;
  aguardando_desde?: unknown;
  estado?: unknown;
  itens?: LinhaImportada[];
}

export const TRANSP_INVALIDA = /^[\d.,\s]+$/;   // só números = coluna errada do arquivo ("Qtde. de produtos")
const norm = (v: unknown): string => String(v == null ? '' : v).trim();

// Os campos de um pedido, tirados das linhas (itens) dele no arquivo — mesma regra do POST /pedidos/importar
export function dadosDoPedido(itens?: LinhaImportada[] | null): DadosPedido {
  const lista = itens || [];
  const trans = norm(lista[0]?.transportadora);
  return {
    itensReais: lista.filter(i => norm(i.codigo)),   // linhas sem código são placeholder (pedido sem itens)
    cliente: norm(lista[0]?.cliente),
    transportadora: TRANSP_INVALIDA.test(trans) ? '' : trans,
    aguardando: norm(lista[0]?.aguardando_desde),
    estado: norm(lista[0]?.estado).toUpperCase().slice(0, 2),
  };
}

export const assinaturaItens = (itens?: LinhaImportada[] | null): string =>
  (itens || []).map(i => `${norm(i.codigo).toUpperCase()}|${parseInt(i.quantidade as string) || 1}`).sort().join(';');

// existente: null (não existe) ou { cliente, transportadora, aguardando_desde, estado, itens: [{ codigo, quantidade }] }
// → { acao: 'novo' | 'completa' | 'repetido', diferente?: boolean }
// diferente = repetido, mas com cliente/transportadora/itens diferentes do que está no sistema (o sistema não é alterado)
export function classificarPedidoImportado(
  novo: DadosPedido,
  existente: PedidoExistente | null | undefined,
): { acao: 'novo' | 'completa' | 'repetido'; diferente?: boolean } {
  if (!existente) return { acao: 'novo' };
  const completa = (atual: unknown, trazido: unknown, invalido?: (v: string) => boolean) =>
    !!norm(trazido) && (!norm(atual) || (invalido ? invalido(norm(atual)) : false));
  const preencheria = completa(existente.cliente, novo.cliente)
    || completa(existente.transportadora, novo.transportadora, v => TRANSP_INVALIDA.test(v))
    || completa(existente.aguardando_desde, novo.aguardando)
    || completa(existente.estado, novo.estado);
  const itensExistentes = existente.itens || [];
  const trazItens = novo.itensReais.length > 0 && itensExistentes.length === 0;
  if (preencheria || trazItens) return { acao: 'completa' };
  const difere = (a: unknown, b: unknown) => !!norm(a) && !!norm(b) && norm(a).toLowerCase() !== norm(b).toLowerCase();
  const diferente = difere(existente.cliente, novo.cliente)
    || difere(existente.transportadora, novo.transportadora)
    || (novo.itensReais.length > 0 && itensExistentes.length > 0 && assinaturaItens(novo.itensReais) !== assinaturaItens(itensExistentes));
  return { acao: 'repetido', diferente };
}

// Classifica todos os pedidos de um arquivo de uma vez. dados = linhas do arquivo; existentes = Map(numero → existente)
export function classificarImportacao(
  dados: LinhaImportada[] | null | undefined,
  existentes: Map<string, PedidoExistente>,
) {
  const porNumero = new Map<string, LinhaImportada[]>();
  (dados || []).forEach(d => { const n = norm(d.numero_pedido); if (!n) return; if (!porNumero.has(n)) porNumero.set(n, []); porNumero.get(n)!.push(d); });
  const r: { importar: string[]; novos: string[]; completam: string[]; repetidos: string[]; diferentes: string[] } =
    { importar: [], novos: [], completam: [], repetidos: [], diferentes: [] };
  for (const [numero, itens] of porNumero) {
    const c = classificarPedidoImportado(dadosDoPedido(itens), existentes.get(numero) || null);
    if (c.acao === 'repetido') { r.repetidos.push(numero); if (c.diferente) r.diferentes.push(numero); continue; }
    r.importar.push(numero);
    (c.acao === 'novo' ? r.novos : r.completam).push(numero);
  }
  return r;
}
