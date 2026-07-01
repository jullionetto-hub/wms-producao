const express = require('express');
const router = express.Router();
const { db, pool } = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');
const { dataHoraLocal } = require('../lib/helpers');

/* ── Auto-migração ──────────────────────────────────────────────── */
(async () => {
  try {
    await pool.query(`ALTER TABLE checkout ADD COLUMN IF NOT EXISTS itens_falta JSONB DEFAULT '[]'::jsonb`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS checkout_sessoes (
        id           SERIAL PRIMARY KEY,
        checkout_id  INTEGER NOT NULL,
        operador_nome TEXT NOT NULL DEFAULT '',
        hora_inicio  TEXT NOT NULL DEFAULT '',
        hora_fim     TEXT NOT NULL DEFAULT '',
        data_sessao  TEXT NOT NULL DEFAULT '',
        tempo_min    INTEGER NOT NULL DEFAULT 0,
        acao         TEXT NOT NULL DEFAULT ''
      )
    `);
  } catch(e) { console.warn('checkout migration:', e.message); }
})();


router.get('/checkout', requerAuth, async (req,res) => {
  const {status, numero_caixa, data, data_ini, data_fim, operador_nome} = req.query;
  try {
    let sql = `SELECT c.*, p.status as ped_status, p.itens as ped_itens, p.total_itens as ped_total_itens, p.numero_caixa as ped_caixa, p.cliente, p.transportadora, p.forma_envio, p.separador_id, s.nome as separador_nome_join FROM checkout c LEFT JOIN pedidos p ON c.pedido_id=p.id LEFT JOIN separadores s ON p.separador_id=s.id WHERE 1=1`;
    const pr = [];
    if (status)        { pr.push(status);        sql += ` AND c.status=$${pr.length}`; }
    if (numero_caixa)  { pr.push(numero_caixa);  sql += ` AND c.numero_caixa=$${pr.length}`; }
    if (data)          { pr.push(data);           sql += ` AND c.data_checkout=$${pr.length}`; }
    if (data_ini)      { pr.push(data_ini);       sql += ` AND c.data_checkout>=$${pr.length}`; }
    if (data_fim)      { pr.push(data_fim);       sql += ` AND c.data_checkout<=$${pr.length}`; }
    if (operador_nome) { pr.push(operador_nome);  sql += ` AND c.operador_nome=$${pr.length}`; }
    res.json(await db.all(sql + ' ORDER BY c.id DESC LIMIT 500', pr));
  } catch(e) { res.status(500).json({erro: e.message}); }
});

/* ── Fila aguardando item ───────────────────────────────────────── */
router.get('/checkout/aguardando', requerAuth, async (req,res) => {
  try {
    const rows = await db.all(`
      SELECT c.*, p.cliente, p.transportadora, p.itens as ped_itens,
             p.total_itens as ped_total_itens, p.numero_caixa as ped_caixa,
             s.nome as separador_nome
      FROM checkout c
      JOIN pedidos p ON c.pedido_id = p.id
      LEFT JOIN separadores s ON p.separador_id = s.id
      WHERE c.status = 'aguardando_item'
      ORDER BY c.id DESC
    `);
    res.json(rows);
  } catch(e) { res.status(500).json({erro: e.message}); }
});

/* ── Sessões de um checkout ─────────────────────────────────────── */
router.get('/checkout/:id/sessoes', requerAuth, async (req,res) => {
  try {
    const rows = await db.all(
      `SELECT * FROM checkout_sessoes WHERE checkout_id=$1 ORDER BY id ASC`,
      [parseInt(req.params.id)]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({erro: e.message}); }
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
    // Busca apenas registros ATIVOS (não concluídos).
    // Concluídos ficam no histórico (aba FEITOS) — não devem aparecer na busca por caixa.
    let rows = await db.all(
      `SELECT c.*, p.status as ped_status, p.itens as ped_itens,
              p.numero_caixa, p.cliente, p.transportadora, s.nome as separador_nome
       FROM checkout c
       JOIN pedidos p ON c.pedido_id=p.id
       LEFT JOIN separadores s ON p.separador_id=s.id
       WHERE c.numero_caixa=$1 AND c.status != 'concluido' ORDER BY c.id DESC`,
      [numero]
    );
    if (!rows.length) {
      rows = await db.all(
        `SELECT c.*, p.status as ped_status, p.itens as ped_itens,
                p.numero_caixa, p.cliente, p.transportadora, s.nome as separador_nome
         FROM checkout c
         JOIN pedidos p ON c.pedido_id=p.id
         LEFT JOIN separadores s ON p.separador_id=s.id
         WHERE c.numero_pedido=$1 AND c.status != 'concluido' ORDER BY c.id DESC`,
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
    const operador_nome = req.session?.usuario?.nome || '';
    for (const row of rows) {
      // 'fila' = criado pelo separador ao concluir (ainda não aberto pelo operador)
      // 'pendente' sem operador_nome = aberto mas não confirmado ainda
      if (row.status === 'fila' || (row.status === 'pendente' && !row.operador_nome)) {
        await pool.query(
          `UPDATE checkout SET status='pendente', hora_criacao=$1, data_checkout=$2 WHERE id=$3`,
          [hora, data, row.id]
        );
        // Abre sessão para este operador
        await pool.query(
          `INSERT INTO checkout_sessoes (checkout_id, operador_nome, hora_inicio, hora_fim, data_sessao, tempo_min, acao)
           VALUES ($1,$2,$3,'', $4, 0, 'aberto')`,
          [row.id, operador_nome, hora, data]
        );
        row.status = 'pendente';
        row.hora_criacao = hora;
        row.data_checkout = data;
      }
      row.itens_lista = await db.all(
        `SELECT codigo, descricao, endereco, quantidade, status, obs FROM itens_pedido WHERE pedido_id=$1 ORDER BY id`,
        [row.pedido_id]
      );
      row.sessoes = await db.all(
        `SELECT * FROM checkout_sessoes WHERE checkout_id=$1 ORDER BY id ASC`,
        [row.id]
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
  const id = parseInt(req.params.id);
  try {
    const ck = await db.get('SELECT * FROM checkout WHERE id=$1',[id]);
    if (!ck) return res.status(404).json({erro:'Checkout nao encontrado'});
    const horaFim = hora_checkout||hora;
    // Fecha sessão aberta deste operador
    const sessaoAberta = await db.get(
      `SELECT * FROM checkout_sessoes WHERE checkout_id=$1 AND hora_fim='' ORDER BY id DESC LIMIT 1`, [id]
    );
    if (sessaoAberta) {
      const [hI,mI] = (sessaoAberta.hora_inicio||horaFim).split(':').map(Number);
      const [hF,mF] = horaFim.split(':').map(Number);
      const tempoMin = Math.max(0,(hF*60+mF)-(hI*60+mI));
      await pool.query(
        `UPDATE checkout_sessoes SET hora_fim=$1,tempo_min=$2,acao='concluido' WHERE id=$3`,
        [horaFim, tempoMin, sessaoAberta.id]
      );
    } else {
      // Cria sessão retroativamente
      const [hI,mI] = (ck.hora_criacao||horaFim).split(':').map(Number);
      const [hF,mF] = horaFim.split(':').map(Number);
      const tempoMin = Math.max(0,(hF*60+mF)-(hI*60+mI));
      await pool.query(
        `INSERT INTO checkout_sessoes (checkout_id,operador_nome,hora_inicio,hora_fim,data_sessao,tempo_min,acao)
         VALUES ($1,$2,$3,$4,$5,$6,'concluido')`,
        [id, operador_nome, ck.hora_criacao||horaFim, horaFim, data, tempoMin]
      );
    }
    await pool.query(
      `UPDATE checkout SET status='concluido',hora_checkout=$1,data_checkout=$2,operador_nome=$3 WHERE id=$4`,
      [horaFim, data_checkout||data, operador_nome, id]
    );
    await pool.query(`UPDATE pedidos SET status_embalagem='pendente', numero_caixa='' WHERE id=$1`,[ck.pedido_id]);
    const cache = req.app.get('kpiCache'); if (cache) cache.ts = 0;
    res.json({mensagem:'Checkout concluido!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

/* ── Registrar pendência (itens faltando) ───────────────────────── */
router.put('/checkout/:id/pendencia', requerAuth, async (req,res) => {
  const { itens_falta } = req.body || {};
  const { data, hora } = dataHoraLocal();
  const operador_nome = req.session?.usuario?.nome || '';
  const id = parseInt(req.params.id);
  try {
    const ck = await db.get('SELECT * FROM checkout WHERE id=$1',[id]);
    if (!ck) return res.status(404).json({erro:'Checkout não encontrado'});
    // Fecha sessão aberta
    const sessaoAberta = await db.get(
      `SELECT * FROM checkout_sessoes WHERE checkout_id=$1 AND hora_fim='' ORDER BY id DESC LIMIT 1`, [id]
    );
    if (sessaoAberta) {
      const [hI,mI] = (sessaoAberta.hora_inicio||hora).split(':').map(Number);
      const [hF,mF] = hora.split(':').map(Number);
      const tempoMin = Math.max(0,(hF*60+mF)-(hI*60+mI));
      await pool.query(
        `UPDATE checkout_sessoes SET hora_fim=$1,tempo_min=$2,acao='aguardando_item' WHERE id=$3`,
        [hora, tempoMin, sessaoAberta.id]
      );
    } else {
      const [hI,mI] = (ck.hora_criacao||hora).split(':').map(Number);
      const [hF,mF] = hora.split(':').map(Number);
      const tempoMin = Math.max(0,(hF*60+mF)-(hI*60+mI));
      await pool.query(
        `INSERT INTO checkout_sessoes (checkout_id,operador_nome,hora_inicio,hora_fim,data_sessao,tempo_min,acao)
         VALUES ($1,$2,$3,$4,$5,$6,'aguardando_item')`,
        [id, operador_nome, ck.hora_criacao||hora, hora, data, tempoMin]
      );
    }
    await pool.query(
      `UPDATE checkout SET status='aguardando_item', itens_falta=$1 WHERE id=$2`,
      [JSON.stringify(itens_falta||[]), id]
    );
    res.json({mensagem:'Pendência registrada!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

/* ── Retomar checkout da fila de espera ─────────────────────────── */
router.put('/checkout/:id/retomar', requerAuth, async (req,res) => {
  const { hora, data } = dataHoraLocal();
  const operador_nome = req.session?.usuario?.nome || '';
  const id = parseInt(req.params.id);
  try {
    const ck = await db.get('SELECT * FROM checkout WHERE id=$1',[id]);
    if (!ck) return res.status(404).json({erro:'Checkout não encontrado'});
    if (ck.status !== 'aguardando_item') return res.status(400).json({erro:'Checkout não está em espera'});
    // Abre nova sessão para quem retomou
    await pool.query(
      `INSERT INTO checkout_sessoes (checkout_id,operador_nome,hora_inicio,hora_fim,data_sessao,tempo_min,acao)
       VALUES ($1,$2,$3,'', $4, 0, 'retomado')`,
      [id, operador_nome, hora, data]
    );
    await pool.query(
      `UPDATE checkout SET status='pendente', operador_nome=$1 WHERE id=$2`,
      [operador_nome, id]
    );
    const itens = await db.all(
      `SELECT codigo,descricao,endereco,quantidade,status,obs FROM itens_pedido WHERE pedido_id=$1 ORDER BY id`,
      [ck.pedido_id]
    );
    res.json({
      mensagem: 'Checkout retomado!',
      checkout_id: id,
      numero_caixa: ck.numero_caixa || '',
      numero_pedido: ck.numero_pedido || '',
      itens_falta: ck.itens_falta,
      itens_lista: itens,
    });
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
