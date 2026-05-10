const express = require('express');
const router = express.Router();
const { db, pool } = require('../lib/db');
const { requerAuth } = require('../lib/auth');
const { dataHoraLocal, validarId } = require('../lib/helpers');
const { registrarAuditoria } = require('../lib/auditoria');

router.get('/embalagem', requerAuth, async (req,res) => {
  try {
    const {data:hoje} = dataHoraLocal();
    const {data, status} = req.query;
    const dt = data || hoje;
    let sql = `SELECT p.*, ck.hora_checkout, ck.operador_nome
      FROM pedidos p
      INNER JOIN checkout ck ON ck.pedido_id = p.id AND ck.status = 'concluido'
      WHERE p.status = 'concluido' AND p.data_pedido = $1`;
    const params = [dt];
    if (status === 'pendente') {
      sql += ` AND (p.status_embalagem IS NULL OR p.status_embalagem = 'pendente')`;
    } else if (status === 'embalado') {
      sql += ` AND p.status_embalagem = 'embalado'`;
    } else {
      sql += ` AND p.status_embalagem != 'nao_iniciado'`;
    }
    sql += ` ORDER BY ck.hora_checkout ASC NULLS LAST`;
    res.json(await db.all(sql, params));
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.put('/embalagem/:id/confirmar', requerAuth, async (req,res) => {
  const id = validarId(req.params.id);
  if (!id) return res.status(400).json({erro:'ID invalido'});
  try {
    const {data:hoje, hora} = dataHoraLocal();
    const embalado_por = req.session?.usuario?.nome || 'Embalador';
    const ped = await db.get('SELECT * FROM pedidos WHERE id=$1', [id]);
    if (!ped) return res.status(404).json({erro:'Pedido nao encontrado'});
    if (ped.status_embalagem === 'embalado') return res.status(400).json({erro:'Pedido ja embalado!'});
    await pool.query(
      `UPDATE pedidos SET status_embalagem='embalado', embalado_por=$1, embalado_em=$2 WHERE id=$3`,
      [embalado_por, hora, id]
    );
    await pool.query(
      `INSERT INTO embalagem (pedido_id,numero_pedido,embalado_por,embalado_em,data_embalagem,cliente,transportadora,is_drive,is_prime)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [ped.id, ped.numero_pedido, embalado_por, hora, hoje,
       ped.cliente||'', ped.transportadora||'',
       String(ped.transportadora||'').toUpperCase().includes('DRIVE'),
       ped.tem_prime||false]
    );
    await registrarAuditoria(req, 'EMBALAR', 'pedido', id, null, {embalado_por});
    res.json({mensagem:'Embalagem confirmada!', numero_pedido: ped.numero_pedido});
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.get('/embalagem/stats', requerAuth, async (req,res) => {
  try {
    const {data:hoje} = dataHoraLocal();
    const dt = req.query.data || hoje;
    const stats = await db.all(`
      SELECT embalado_por,
        COUNT(*) as total,
        SUM(CASE WHEN is_drive THEN 1 ELSE 0 END) as drive,
        SUM(CASE WHEN is_prime THEN 1 ELSE 0 END) as prime
      FROM embalagem WHERE data_embalagem=$1
      GROUP BY embalado_por ORDER BY total DESC`, [dt]);
    const totais = await db.get(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN status_embalagem='embalado' THEN 1 ELSE 0 END) as embalados,
        SUM(CASE WHEN status_embalagem='pendente' OR status_embalagem IS NULL THEN 1 ELSE 0 END) as pendentes
      FROM pedidos WHERE status='concluido' AND data_pedido=$1`, [dt]);
    res.json({ data: dt, stats, totais });
  } catch(e) { res.status(500).json({erro:e.message}); }
});

module.exports = router;
