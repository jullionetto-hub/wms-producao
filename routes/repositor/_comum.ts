// Ajudantes compartilhados por mais de uma parte de routes/repositor/ (movidos sem alteracao; so ganharam "export").
import { db, pool } from '../../lib/db';
import type { Linha } from '../../types/db';

// Sequência de turnos para passagem de item entre turnos
export const SEQ_TURNO = ['Manha', 'Tarde', 'Noite'];
export function proximoTurno(turnoAtual: any) {
  const i = SEQ_TURNO.indexOf(turnoAtual);
  return i >= 0 && i < SEQ_TURNO.length - 1 ? SEQ_TURNO[i + 1] : null;
}
export function turnoAtualHora() {
  const h = new Date().getHours();
  return h >= 6 && h < 14 ? 'Manha' : h >= 14 && h < 22 ? 'Tarde' : 'Noite';
}

// Avisos nesses estados já chegaram (ou estão a caminho) — não seguram mais o pedido.
export const STATUS_AVISO_RESOLVIDO = ['reposto','buscado','separado','aguardando_abastecer','subiu','abastecido','encontrado'];

// Pedido concluído com falta fica no checkout como 'aguardando_item'. Quando o
// repositor repõe o último item, volta pra 'fila'; se ainda sobram itens, só
// atualiza a lista do que falta. Sem isso o pedido ficava preso em "Itens
// pendentes" mesmo com tudo abastecido.
export async function sincronizarCheckoutPendente(pedidoId: any, io: any) {
  if (!pedidoId) return;
  const ck = await db.get<Pick<Linha<'checkout'>, 'id' | 'numero_pedido'>>(`SELECT id, numero_pedido FROM checkout WHERE pedido_id=$1 AND status='aguardando_item' ORDER BY id DESC LIMIT 1`, [pedidoId]);
  if (!ck) return;
  const faltando = await db.all<Pick<Linha<'avisos_repositor'>, 'codigo' | 'descricao' | 'quantidade'>>(
    `SELECT codigo, descricao, quantidade FROM avisos_repositor WHERE pedido_id=$1 AND NOT (status = ANY($2::text[]))`,
    [pedidoId, STATUS_AVISO_RESOLVIDO]
  );
  if (!faltando.length) {
    await pool.query(`UPDATE checkout SET status='fila', itens_falta='[]'::jsonb WHERE id=$1`, [ck.id]);
  } else {
    const itens_falta = faltando.map(a => ({ codigo: a.codigo, descricao: a.descricao, quantidade: a.quantidade }));
    await pool.query(`UPDATE checkout SET itens_falta=$1 WHERE id=$2`, [JSON.stringify(itens_falta), ck.id]);
  }
  io?.emit('pedido:concluido', { pedido_id: pedidoId, numero_pedido: ck.numero_pedido });
}
