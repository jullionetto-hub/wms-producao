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
    // 1. Tenta pelo numero_caixa no checkout
    let row=await db.get(`SELECT c.*,p.numero_caixa FROM checkout c JOIN pedidos p ON c.pedido_id=p.id WHERE c.numero_caixa=$1 ORDER BY c.id DESC LIMIT 1`,[numero]);
    // 2. Tenta pelo numero_pedido no checkout (pedidos sem caixa vinculada)
    if (!row) {
      row=await db.get(`SELECT c.*,p.numero_caixa FROM checkout c JOIN pedidos p ON c.pedido_id=p.id WHERE c.numero_pedido=$1 ORDER BY c.id DESC LIMIT 1`,[numero]);
    }
    // 3. Fallback: busca diretamente na tabela pedidos
    if (!row) {
      const ped=await db.get('SELECT id,numero_pedido,numero_caixa,status FROM pedidos WHERE numero_pedido=$1',[numero]);
      if (ped) row={numero_pedido:ped.numero_pedido,numero_caixa:ped.numero_caixa||'',status:'pendente',pedido_status:ped.status};
    }
    if (!row) return res.status(404).json({erro:'Não encontrado'});
    res.json(row);
  } catch(e){res.status(500).json({erro:e.message});}
});

router.get('/checkout/caixa/:numero', requerAuth, async (req,res) => {
  const numero = String(req.params.numero).trim();
  const { hora, data } = dataHoraLocal();
  try {
    // Tenta primeiro pelo numero_caixa; se não achar, tenta pelo numero_pedido
    // (pedidos separados sem caixa vinculada têm numero_caixa vazio no checkout)
    let rows = await db.all(
      `SELECT c.*, p.status as ped_status, p.itens as ped_itens,
              p.numero_caixa, p.cliente, p.transportadora, s.nome as separador_nome
       FROM checkout c
       JOIN pedidos p ON c.pedido_id=p.id
       LEFT JOIN separadores s ON p.separador_id=s.id
       WHERE c.numero_caixa=$1 ORDER BY c.id DESC`,
      [numero]
    );
    if (!rows.length) {
      rows = await db.all(
        `SELECT c.*, p.status as ped_status, p.itens as ped_itens,
                p.numero_caixa, p.cliente, p.transportadora, s.nome as separador_nome
         FROM checkout c
         JOIN pedidos p ON c.pedido_id=p.id
         LEFT JOIN separadores s ON p.separador_id=s.id
         WHERE c.numero_pedido=$1 ORDER BY c.id DESC`,
        [numero]
      );
    }
    // Fallback: nenhum registro de checkout encontrado — cria automaticamente se existir pedido concluído
    if (!rows.length) {
      const ped = await db.get(
        `SELECT p.id, p.numero_pedido, p.numero_caixa, p.cliente, p.transportadora, p.itens,
                s.nome as separador_nome, p.separador_id
         FROM pedidos p
         LEFT JOIN separadores s ON s.id = p.separador_id
         WHERE (p.numero_caixa=$1 OR p.numero_pedido=$1)
           AND p.status='concluido'
         ORDER BY p.id DESC LIMIT 1`,
        [numero]
      );
      if (ped) {
        await pool.query(
          `INSERT INTO checkout (numero_caixa,pedido_id,numero_pedido,separador_nome,status,hora_criacao,data_checkout)
           VALUES ($1,$2,$3,$4,'pendente',$5,$6)`,
          [ped.numero_caixa||numero, ped.id, ped.numero_pedido, ped.separador_nome||'', hora, data]
        );
        rows = await db.all(
          `SELECT c.*, p.status as ped_status, p.itens as ped_itens,
                  p.numero_caixa, p.cliente, p.transportadora, s.nome as separador_nome
           FROM checkout c
           JOIN pedidos p ON c.pedido_id=p.id
           LEFT JOIN separadores s ON p.separador_id=s.id
           WHERE c.numero_pedido=$1 ORDER BY c.id DESC`,
          [ped.numero_pedido]
        );
      }
    }
    for (const row of rows) {
      // Marca o momento em que o operador de checkout abre o pedido (primeira vez)
      if (row.status === 'pendente' && !row.operador_nome) {
        await pool.query(
          `UPDATE checkout SET hora_criacao=$1, data_checkout=$2 WHERE id=$3`,
          [hora, data, row.id]
        );
        row.hora_criacao = hora;
        row.data_checkout = data;
      }
      row.itens_lista = await db.all(
        `SELECT codigo, descricao, endereco, quantidade, status, obs FROM itens_pedido WHERE pedido_id=$1 ORDER BY id`,
        [row.pedido_id]
      );
    }
    res.json(rows);
  } catch(e){res.status(500).json({erro:e.message});}
});

router.put('/checkout/:id/concluir', requerAuth, async (req,res) => {
  const {hora_checkout,data_checkout}=req.body||{};
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
    const cache = req.app.get('kpiCache'); if (cache) cache.ts = 0;
    res.json({mensagem:'Checkout concluido!', numero_pedido: ck?.numero_pedido});
  } catch(e){res.status(500).json({erro:e.message});}
});

router.put('/checkout/:id/confirmar', requerAuth, async (req,res) => {
  const {hora_checkout,data_checkout}=req.body||{};
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
    const cache = req.app.get('kpiCache'); if (cache) cache.ts = 0;
    res.json({mensagem:'Checkout concluido!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

router.put('/checkout/:id/liberar', requerAuth, async (req,res) => {
  try {
    const ck = await db.get('SELECT pedido_id, status FROM checkout WHERE id=$1',[req.params.id]);
    if (ck) {
      // Libera o número da caixa do pedido para reutilização
      await pool.query(`UPDATE pedidos SET numero_caixa='' WHERE id=$1`,[ck.pedido_id]);
      if (ck.status !== 'concluido') {
        // Só exclui se nunca foi confirmado (liberar sem fazer checkout)
        await pool.query(`DELETE FROM checkout WHERE id=$1`,[req.params.id]);
      }
      // Se já estava concluído, mantém o registro para os KPIs
    }
    const cache = req.app.get('kpiCache'); if (cache) cache.ts = 0;
    res.json({mensagem:'Caixa liberada!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

module.exports = router;
