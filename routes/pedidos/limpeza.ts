import express from 'express';
const router = express.Router();
import { db, pool } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';
import { validarId } from '../../lib/helpers';
import { registrarAuditoria } from '../../lib/auditoria';
import { requerPermissao } from '../../lib/permissoes';
import type { Linha } from '../../types/db';

// Pedidos "vazios": sem nenhum item, sem cliente/transportadora/rua preenchidos,
// nunca distribuídos e ainda pendentes — sobras de importação (placeholder sem
// itensReais, ver /pedidos/importar) que não têm nenhuma informação aproveitável.
// Precisa vir ANTES de DELETE /pedidos/:id — como "vazios" não é numérico, se
// essa rota ficasse depois, /pedidos/:id casaria primeiro (id="vazios") e
// devolveria 400 "ID invalido", nunca chegando no handler de verdade abaixo.
const WHERE_PEDIDOS_VAZIOS = `
  NOT EXISTS (SELECT 1 FROM itens_pedido i WHERE i.pedido_id = p.id)
  AND COALESCE(p.itens,0) = 0
  AND COALESCE(NULLIF(TRIM(p.cliente),''),'') = ''
  AND COALESCE(NULLIF(TRIM(p.transportadora),''),'') = ''
  AND COALESCE(NULLIF(TRIM(p.rua),''),'') = ''
  AND p.status = 'pendente'
  AND p.separador_id IS NULL
`;

router.get('/pedidos/vazios', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const rows = await db.all(
      `SELECT p.id, p.numero_pedido, p.data_pedido, p.hora_pedido
       FROM pedidos p WHERE ${WHERE_PEDIDOS_VAZIOS}
       ORDER BY p.id`
    );
    res.json({ total: rows.length, pedidos: rows });
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.delete('/pedidos/vazios', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const idsSub = `SELECT p.id FROM pedidos p WHERE ${WHERE_PEDIDOS_VAZIOS}`;
    // checkout_itens_conferencia referencia pedidos.id/checkout.id/itens_pedido.id —
    // precisa sair antes de checkout (senão viola a FK quando houver conferência).
    await pool.query(`DELETE FROM checkout_itens_conferencia WHERE pedido_id IN (${idsSub})`);
    await pool.query(`DELETE FROM avisos_repositor WHERE pedido_id IN (${idsSub})`);
    await pool.query(`DELETE FROM checkout WHERE pedido_id IN (${idsSub})`);
    const r = await pool.query(
      `DELETE FROM pedidos p WHERE ${WHERE_PEDIDOS_VAZIOS}`
    );
    await registrarAuditoria(req, 'PEDIDOS_VAZIOS_EXCLUIDOS', 'pedidos', null, null, {excluidos:r.rowCount});
    res.json({ mensagem:`${r.rowCount} pedido(s) vazio(s) excluído(s)!`, excluidos: r.rowCount });
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.delete('/pedidos/:id', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const id = validarId(req.params.id);
  if (!id) return res.status(400).json({erro:'ID invalido'});
  try {
    const antes = await db.get<Pick<Linha<'pedidos'>, 'numero_pedido' | 'status' | 'cliente'>>('SELECT numero_pedido,status,cliente FROM pedidos WHERE id=$1', [id]);
    await pool.query('DELETE FROM checkout_itens_conferencia WHERE pedido_id=$1',[id]);
    await pool.query('DELETE FROM avisos_repositor WHERE pedido_id=$1',[id]);
    await pool.query('DELETE FROM checkout WHERE pedido_id=$1',[id]);
    await pool.query('DELETE FROM itens_pedido WHERE pedido_id=$1',[id]);
    await pool.query('DELETE FROM pedidos WHERE id=$1',[id]);
    await registrarAuditoria(req, 'PEDIDO_EXCLUIDO', 'pedido', id, antes, null);
    res.json({mensagem:'Pedido excluido!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

router.delete('/pedidos', requerAuth, requerPerfil('supervisor'), requerPermissao('excluir'), async (req,res) => {
  const {data,status}=req.query as Record<string, string>;
  if (!data && !status) return res.status(400).json({erro:'Informe data ou status!'});
  try {
    // Exclusão em lote (subquery), não em loop — um pedido por vez faz milhares de
    // idas ao banco em listas grandes e estoura o timeout da requisição.
    const cond = data ? 'data_pedido=$1' : 'status=$1';
    const val  = data || status;
    await pool.query(`DELETE FROM checkout_itens_conferencia WHERE pedido_id IN (SELECT id FROM pedidos WHERE ${cond})`,[val]);
    await pool.query(`DELETE FROM avisos_repositor WHERE pedido_id IN (SELECT id FROM pedidos WHERE ${cond})`,[val]);
    await pool.query(`DELETE FROM checkout WHERE pedido_id IN (SELECT id FROM pedidos WHERE ${cond})`,[val]);
    await pool.query(`DELETE FROM itens_pedido WHERE pedido_id IN (SELECT id FROM pedidos WHERE ${cond})`,[val]);
    const r=await pool.query(`DELETE FROM pedidos WHERE ${cond}`,[val]);
    await registrarAuditoria(req, 'PEDIDOS_EM_MASSA_EXCLUIDOS', 'pedidos', null, {data,status}, {excluidos:r.rowCount});
    res.json({mensagem:`${r.rowCount} pedidos excluidos!`});
  } catch(e){res.status(500).json({erro:e.message});}
});

module.exports = router;
