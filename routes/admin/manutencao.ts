import express from 'express';
const router = express.Router();
import { pool } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';
import { dataHoraLocal } from '../../lib/helpers';
import { registrarAuditoria } from '../../lib/auditoria';
import { requerPermissao } from '../../lib/permissoes';

router.post('/admin/zerar-sessoes', requerAuth, requerPerfil('supervisor'), requerPermissao('excluir'), async (req, res) => {
  const { data } = req.body;
  const { data: hoje } = dataHoraLocal();
  try {
    const r = await pool.query('DELETE FROM sessoes_trabalho WHERE data=$1', [data || hoje]);
    await registrarAuditoria(req, 'SESSOES_ZERADAS', 'sessoes_trabalho', null, {data: data || hoje}, {removidas: r.rowCount});
    res.json({ mensagem: `${r.rowCount} sessão(ões) removida(s).` });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/admin/zerar-dados', requerAuth, requerPerfil('supervisor'), requerPermissao('excluir'), async (req,res) => {
  const { confirmar } = req.body;
  if (confirmar !== 'ZERAR_TUDO_CONFIRMO') {
    return res.status(400).json({ erro: 'Confirmação inválida.' });
  }
  try {
    await pool.query('DELETE FROM avisos_repositor');
    await pool.query('DELETE FROM embalagem');
    await pool.query('DELETE FROM checkout');
    await pool.query('DELETE FROM itens_pedido');
    await pool.query('DELETE FROM pedidos');
    await pool.query('ALTER SEQUENCE pedidos_id_seq RESTART WITH 1').catch(()=>{});
    await pool.query('ALTER SEQUENCE itens_pedido_id_seq RESTART WITH 1').catch(()=>{});
    await pool.query('ALTER SEQUENCE avisos_repositor_id_seq RESTART WITH 1').catch(()=>{});
    await pool.query('ALTER SEQUENCE checkout_id_seq RESTART WITH 1').catch(()=>{});
    registrarAuditoria(req, 'zerar_dados', 'sistema', null, null, { acao: 'zerar_todos_pedidos' });
    res.json({ mensagem: 'Todos os pedidos, itens, avisos e checkouts foram apagados com sucesso.' });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/admin/sincronizar-forma-envio', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const result = await pool.query(`
      UPDATE avisos_repositor a
      SET forma_envio = p.transportadora
      FROM pedidos p
      WHERE a.pedido_id = p.id
        AND (a.forma_envio IS NULL OR a.forma_envio = '')
        AND p.transportadora IS NOT NULL
        AND p.transportadora != ''
      RETURNING a.id`);
    res.json({ atualizados: result.rows.length, mensagem: `${result.rows.length} avisos atualizados com a transportadora do pedido.` });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/admin/migration-tempo', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS iniciado_em TEXT DEFAULT ''");
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS concluido_em TEXT DEFAULT ''");
    res.json({mensagem:'Colunas criadas!'});
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.post('/admin/migration-tempo-justo', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS iniciado_em TEXT DEFAULT ''");
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS concluido_em TEXT DEFAULT ''");
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tempo_aguardando_min INTEGER DEFAULT 0");
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS aguardando_repositor_desde TEXT DEFAULT ''");
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS skus_concluido_em TEXT DEFAULT ''");
    res.json({mensagem:'Colunas criadas!'});
  } catch(e) { res.status(500).json({erro:e.message}); }
});

module.exports = router;
