const express = require('express');
const router = express.Router();
const { db, pool } = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');
const { dataHoraLocal } = require('../lib/helpers');

router.get('/checkout', requerAuth, async (req,res) => {
  const {status,numero_caixa}=req.query;
  try {
    let sql=`SELECT c.*,p.status as ped_status,p.itens as ped_itens,p.numero_caixa as ped_caixa,p.cliente,p.transportadora,p.separador_id,s.nome as separador_nome_join FROM checkout c LEFT JOIN pedidos p ON c.pedido_id=p.id LEFT JOIN separadores s ON p.separador_id=s.id WHERE 1=1`;
    const pr=[];
    if (status){pr.push(status);sql+=` AND c.status=$${pr.length}`;}
    if (numero_caixa){pr.push(numero_caixa);sql+=` AND c.numero_caixa=$${pr.length}`;}
    res.json(await db.all(sql+' ORDER BY c.id DESC',pr));
  } catch(e){res.status(500).json({erro:e.message});}
});

router.get('/checkout/buscar', requerAuth, async (req,res) => {
  const {numero}=req.query;
  if (!numero) return res.status(400).json({erro:'Número não informado'});
  try {
    let row=await db.get(`SELECT c.*,p.numero_caixa FROM checkout c JOIN pedidos p ON c.pedido_id=p.id WHERE c.numero_caixa=$1 ORDER BY c.id DESC LIMIT 1`,[numero]);
    if (!row) {
      const ped=await db.get('SELECT id,numero_pedido,numero_caixa,status FROM pedidos WHERE numero_pedido=$1',[numero]);
      if (ped&&ped.numero_caixa) row={numero_pedido:ped.numero_pedido,numero_caixa:ped.numero_caixa,status:'pendente',pedido_status:ped.status};
    }
    if (!row) return res.status(404).json({erro:'Não encontrado'});
    res.json(row);
  } catch(e){res.status(500).json({erro:e.message});}
});

router.get('/checkout/caixa/:numero', requerAuth, async (req,res) => {
  const numero = String(req.params.numero).trim();
  try {
    const rows = await db.all(
      `SELECT c.*, p.status as ped_status, p.itens as ped_itens,
              p.numero_caixa, p.cliente, p.transportadora, s.nome as separador_nome
       FROM checkout c
       JOIN pedidos p ON c.pedido_id=p.id
       LEFT JOIN separadores s ON p.separador_id=s.id
       WHERE c.numero_caixa=$1 ORDER BY c.id DESC`,
      [numero]
    );
    for (const row of rows) {
      row.itens_lista = await db.all(
        `SELECT codigo, descricao, endereco, quantidade, status, obs FROM itens_pedido WHERE pedido_id=$1 ORDER BY id`,
        [row.pedido_id]
      );
    }
    res.json(rows);
  } catch(e){res.status(500).json({erro:e.message});}
});

router.put('/checkout/:id/concluir', requerAuth, async (req,res) => {
  const {hora_checkout,data_checkout}=req.body;
  const {data,hora}=dataHoraLocal();
  try {
    await pool.query(`UPDATE checkout SET status='concluido',hora_checkout=$1,data_checkout=$2 WHERE id=$3`,[hora_checkout||hora,data_checkout||data,req.params.id]);
    const ck = await db.get('SELECT numero_pedido,pedido_id FROM checkout WHERE id=$1',[req.params.id]);
    if (ck?.numero_pedido) {
      await pool.query(`UPDATE pedidos SET status_embalagem='pendente' WHERE numero_pedido=$1`,[ck.numero_pedido]);
    }
    if (ck?.pedido_id) {
      await pool.query(`UPDATE pedidos SET numero_caixa='' WHERE id=$1`,[ck.pedido_id]);
    }
    res.json({mensagem:'Checkout concluido!', numero_pedido: ck?.numero_pedido});
  } catch(e){res.status(500).json({erro:e.message});}
});

router.put('/checkout/:id/confirmar', requerAuth, async (req,res) => {
  const {hora_checkout,data_checkout}=req.body;
  const {data,hora}=dataHoraLocal();
  const operador_nome = req.session?.usuario?.nome || '';
  try {
    const ck = await db.get('SELECT pedido_id FROM checkout WHERE id=$1',[req.params.id]);
    if (!ck) return res.status(404).json({erro:'Checkout nao encontrado'});
    await pool.query(
      `UPDATE checkout SET status='concluido',hora_checkout=$1,data_checkout=$2,operador_nome=$3 WHERE id=$4`,
      [hora_checkout||hora, data_checkout||data, operador_nome, req.params.id]
    );
    await pool.query(`UPDATE pedidos SET status_embalagem='pendente', numero_caixa='' WHERE id=$1`,[ck.pedido_id]);
    res.json({mensagem:'Checkout concluido!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

router.put('/checkout/:id/liberar', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const ck = await db.get('SELECT pedido_id FROM checkout WHERE id=$1',[req.params.id]);
    if (ck) {
      await pool.query(`UPDATE pedidos SET numero_caixa='' WHERE id=$1`,[ck.pedido_id]);
      await pool.query(`DELETE FROM checkout WHERE id=$1`,[req.params.id]);
    }
    res.json({mensagem:'Caixa liberada!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

module.exports = router;
