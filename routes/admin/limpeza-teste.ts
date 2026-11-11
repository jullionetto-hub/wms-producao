import express from 'express';
const router = express.Router();
import { pool } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';
import { dataHoraLocal } from '../../lib/helpers';
import { registrarAuditoria } from '../../lib/auditoria';
import { requerPermissao } from '../../lib/permissoes';

/* ══════════════════════════════════════════════════════════════
   ZERAR DADOS DE TESTE
   Limpa todas as tabelas operacionais do dia informado (ou hoje).
   Requer perfil supervisor + confirmação via body { confirmar: true }.
══════════════════════════════════════════════════════════════ */
router.post('/admin/zerar-dados-teste', requerAuth, requerPerfil('supervisor'), requerPermissao('excluir'), async (req, res) => {
  const { confirmar, data } = req.body;
  if (!confirmar) return res.status(400).json({ erro: 'Envie { confirmar: true } para confirmar a operação.' });

  const { data: hoje } = dataHoraLocal();
  const dia = data || hoje;

  try {
    const resultados: Record<string, any> = {};

    // itens_pedido, avisos_repositor, checkout, checkout_itens_conferencia e embalagem
    // têm FK para pedidos.id — precisam ser apagados antes do pedido, senão o DELETE
    // de pedidos viola a constraint. checkout_itens_conferencia também referencia
    // itens_pedido.id e checkout.id, então sai primeiro de todos.
    const pedIds = (await pool.query('SELECT id FROM pedidos WHERE data_pedido = $1', [dia])).rows.map(r => r.id);
    if (pedIds.length) {
      await pool.query('DELETE FROM checkout_itens_conferencia WHERE pedido_id = ANY($1)', [pedIds]);
      await pool.query('DELETE FROM avisos_repositor WHERE pedido_id = ANY($1)', [pedIds]); // referencia itens_pedido.id tambem
      await pool.query('DELETE FROM itens_pedido WHERE pedido_id = ANY($1)', [pedIds]);
      await pool.query('DELETE FROM checkout WHERE pedido_id = ANY($1)', [pedIds]);
      await pool.query('DELETE FROM embalagem WHERE pedido_id = ANY($1)', [pedIds]);
    }

    // Pedidos do dia
    const rPed = await pool.query('DELETE FROM pedidos WHERE data_pedido = $1', [dia]);
    resultados.pedidos = rPed.rowCount;

    // Checkout do dia (inclui registros de pedidos de outras datas, checados hoje)
    const rCk = await pool.query('DELETE FROM checkout WHERE data_checkout = $1', [dia]);
    resultados.checkout = rCk.rowCount;

    // Embalagem do dia
    const rEmb = await pool.query('DELETE FROM embalagem WHERE data_embalagem = $1', [dia]);
    resultados.embalagem = rEmb.rowCount;

    // Avisos de reposição do dia
    const rRep = await pool.query('DELETE FROM avisos_repositor WHERE data_aviso = $1', [dia]);
    resultados.reposicao = rRep.rowCount;

    // Sessões de trabalho do dia
    const rSess = await pool.query('DELETE FROM sessoes_trabalho WHERE data = $1', [dia]);
    resultados.sessoes = rSess.rowCount;

    console.log(`[ZERAR-TESTE] ${req.session?.usuario?.nome} zerou dados de ${dia}:`, resultados);
    await registrarAuditoria(req, 'DADOS_TESTE_ZERADOS', 'sistema', null, {data: dia}, resultados);
    res.json({ mensagem: `Dados de ${dia} removidos com sucesso.`, removidos: resultados });
  } catch(e) {
    console.error('[ZERAR-TESTE]', e);
    res.status(500).json({ erro: e.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   LIMPAR PEDIDOS DE LOTE DE UM SEPARADOR
   Remove só os pedidos que vieram de "Formar Lotes" (lote_id preenchido)
   atribuídos aos separadores informados — pedidos individuais (sem lote_id)
   ficam intocados. Usado pra limpar lotes de teste que ficaram presos na
   fila de um separador. Requer perfil supervisor + confirmação explícita.
══════════════════════════════════════════════════════════════ */
router.post('/admin/limpar-lotes-separador', requerAuth, requerPerfil('supervisor'), requerPermissao('excluir'), async (req, res) => {
  const { nomes, confirmar } = req.body;
  if (!confirmar) return res.status(400).json({ erro: 'Envie { confirmar: true } para confirmar a operação.' });
  if (!nomes?.length) return res.status(400).json({ erro: 'Informe os nomes dos separadores.' });
  try {
    const seps = await pool.query('SELECT id, nome FROM separadores WHERE nome = ANY($1)', [nomes]);
    const sepIds = seps.rows.map(r => r.id);
    if (!sepIds.length) return res.json({ mensagem: 'Nenhum separador encontrado com esses nomes.', removidos: 0 });

    const peds = await pool.query('SELECT id, lote_id FROM pedidos WHERE separador_id = ANY($1) AND lote_id IS NOT NULL', [sepIds]);
    const pedIds = peds.rows.map(r => r.id);
    if (!pedIds.length) return res.json({ mensagem: 'Nenhum pedido de lote encontrado pra esses separadores.', removidos: 0, separadores: seps.rows.map(r => r.nome) });
    const loteIds = [...new Set(peds.rows.map(r => r.lote_id).filter(Boolean))];

    // Mesma ordem de exclusão de /admin/zerar-dados-teste (FKs pra pedidos.id).
    await pool.query('DELETE FROM checkout_itens_conferencia WHERE pedido_id = ANY($1)', [pedIds]);
    await pool.query('DELETE FROM avisos_repositor WHERE pedido_id = ANY($1)', [pedIds]);
    await pool.query('DELETE FROM itens_pedido WHERE pedido_id = ANY($1)', [pedIds]);
    await pool.query('DELETE FROM checkout WHERE pedido_id = ANY($1)', [pedIds]);
    await pool.query('DELETE FROM embalagem WHERE pedido_id = ANY($1)', [pedIds]);
    const rPed = await pool.query('DELETE FROM pedidos WHERE id = ANY($1)', [pedIds]);
    if (loteIds.length) await pool.query('DELETE FROM lotes_separacao WHERE id = ANY($1)', [loteIds]);

    console.log(`[LIMPAR-LOTES] ${req.session?.usuario?.nome} removeu ${rPed.rowCount} pedido(s) de lote de:`, seps.rows.map(r => r.nome));
    await registrarAuditoria(req, 'LOTES_SEPARADOR_LIMPOS', 'pedidos', null, {separadores: seps.rows.map(r => r.nome)}, {removidos: rPed.rowCount, lotes_removidos: loteIds.length});
    res.json({ mensagem: `${rPed.rowCount} pedido(s) de lote removido(s).`, removidos: rPed.rowCount, lotes_removidos: loteIds.length, separadores: seps.rows.map(r => r.nome) });
  } catch(e) {
    console.error('[LIMPAR-LOTES]', e);
    res.status(500).json({ erro: e.message });
  }
});

module.exports = router;
