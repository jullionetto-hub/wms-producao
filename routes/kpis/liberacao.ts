import express from 'express';
const router = express.Router();
import { db } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';

/* ─── LIBERAÇÃO DE ITENS (nao_encontrado → aguardando supervisor) ─── */
router.get('/liberacao/pendentes', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  const { data_ini, data_fim } = req.query as Record<string, string>;
  try {
    let sql = `
      SELECT a.id, a.numero_pedido, a.codigo, a.descricao, a.quantidade,
        a.separador_nome, a.repositor_nome, a.hora_aviso, a.hora_reposto, a.data_aviso, a.obs,
        p.cliente
      FROM avisos_repositor a
      LEFT JOIN pedidos p ON a.pedido_id = p.id
      WHERE (a.status = 'nao_encontrado' OR a.situacao = 'nao_encontrado')
        AND COALESCE(a.status,'') NOT IN ('protocolo','abastecido','reposto','encontrado','subiu')
    `;
    const params = [];
    if (data_ini) { params.push(data_ini); sql += ` AND a.data_aviso >= $${params.length}`; }
    if (data_fim) { params.push(data_fim); sql += ` AND a.data_aviso <= $${params.length}`; }
    sql += ` ORDER BY a.data_aviso DESC, a.id DESC`;
    res.json(await db.all(sql, params) || []);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.get('/liberacao/historico', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  const { data_ini, data_fim } = req.query as Record<string, string>;
  try {
    let sql = `
      SELECT a.id, a.numero_pedido, a.codigo, a.descricao, a.quantidade, a.status,
        a.separador_nome, a.repositor_nome, a.hora_aviso, a.hora_reposto, a.data_aviso,
        a.quem_guardou as liberado_por, a.historico, p.cliente
      FROM avisos_repositor a
      LEFT JOIN pedidos p ON a.pedido_id = p.id
      WHERE a.status IN ('protocolo', 'reposto')
        AND COALESCE(a.quem_guardou, '') != ''
    `;
    const params = [];
    if (data_ini) { params.push(data_ini); sql += ` AND a.data_aviso >= $${params.length}`; }
    if (data_fim) { params.push(data_fim); sql += ` AND a.data_aviso <= $${params.length}`; }
    sql += ` ORDER BY a.id DESC LIMIT 200`;
    res.json(await db.all(sql, params) || []);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
