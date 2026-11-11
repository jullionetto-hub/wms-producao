import express from 'express';
const router = express.Router();
import { db } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';
import { dataHoraLocal } from '../../lib/helpers';
import { registrarAuditoria } from '../../lib/auditoria';
import { gerarRelatorio } from '../../lib/relatorio';
import type { Linha } from '../../types/db';

router.get('/auditoria', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const { data_ini, data_fim, usuario, acao, limit=100, page, pageSize } = req.query as Record<string, string>;
  try {
    let sql = `SELECT * FROM auditoria WHERE 1=1`;
    const p = [];
    if (data_ini) { p.push(data_ini); sql += ` AND data>=$${p.length}`; }
    if (data_fim) { p.push(data_fim); sql += ` AND data<=$${p.length}`; }
    if (usuario)  { p.push('%'+usuario+'%'); sql += ` AND LOWER(usuario_login) LIKE LOWER($${p.length})`; }
    if (acao)     { p.push(acao); sql += ` AND acao=$${p.length}`; }
    if (page) {
      const size = Math.min(parseInt(pageSize)||50, 500);
      const pg   = Math.max(parseInt(page)||1, 1);
      const countRow = await db.get(`SELECT COUNT(*) as total FROM auditoria WHERE 1=1${sql.split('WHERE 1=1')[1]}`, p);
      const total = parseInt(countRow.total)||0;
      p.push(size); sql += ` ORDER BY id DESC LIMIT $${p.length}`;
      p.push((pg-1)*size); sql += ` OFFSET $${p.length}`;
      return res.json({ total, pagina:pg, totalPaginas:Math.ceil(total/size), dados: await db.all(sql, p) });
    }
    p.push(parseInt(limit as string)||100);
    sql += ` ORDER BY id DESC LIMIT $${p.length}`;
    res.json(await db.all(sql, p));
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.get('/relatorio/diario', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {data} = req.query as Record<string, string>;
  const {data:hoje} = dataHoraLocal();
  const d = data || hoje;
  try {
    let rel = await db.get(`SELECT * FROM relatorios_diarios WHERE data=$1`, [d]);
    if (!rel) rel = await gerarRelatorio(d);
    res.json(rel);
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.get('/relatorio/lista', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    res.json(await db.all<Pick<Linha<'relatorios_diarios'>, 'id' | 'data' | 'total_pedidos' | 'pedidos_concluidos' | 'total_faltas' | 'gerado_em'>>(`SELECT id, data, total_pedidos, pedidos_concluidos, total_faltas, gerado_em FROM relatorios_diarios ORDER BY data DESC LIMIT 30`));
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.post('/relatorio/gerar', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {data} = req.body;
  const {data:hoje} = dataHoraLocal();
  try {
    const rel = await gerarRelatorio(data||hoje);
    registrarAuditoria(req, 'relatorio_gerado', 'relatorio', null, null, { data: data||hoje });
    res.json(rel);
  } catch(e) { res.status(500).json({erro:e.message}); }
});

module.exports = router;
