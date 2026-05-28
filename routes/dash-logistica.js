'use strict';
const express = require('express');
const router  = express.Router();
const { pool, db } = require('../lib/db');
const { requerAuth } = require('../lib/auth');

// ── POST /dash-logistica/importar ─────────────────────────────────────────
router.post('/dash-logistica/importar', requerAuth, async (req, res) => {
  const { pedidos, ini, fim, nome_arquivo } = req.body;
  if (!Array.isArray(pedidos) || !pedidos.length)
    return res.status(400).json({ erro: 'Nenhum dado enviado.' });
  if (!ini || !fim)
    return res.status(400).json({ erro: 'Informe ini e fim.' });

  const importado_por = req.session?.usuario?.nome || '';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Remove registros do mesmo período para evitar duplicatas
    await client.query(
      `DELETE FROM faturamento_pedidos WHERE data_fat >= $1 AND data_fat <= $2`,
      [ini, fim]
    );

    // Remove log anterior do mesmo período
    await client.query(
      `DELETE FROM fat_importacoes WHERE ini = $1 AND fim = $2`,
      [ini, fim]
    );

    // Insere pedidos em lotes de 500
    const LOTE = 500;
    for (let i = 0; i < pedidos.length; i += LOTE) {
      const lote = pedidos.slice(i, i + LOTE);
      const vals = [], params = [];
      let p = 1;
      for (const r of lote) {
        vals.push(`($${p},$${p+1},$${p+2},$${p+3},$${p+4},$${p+5},$${p+6},$${p+7},$${p+8},$${p+9})`);
        params.push(
          r.numero_pedido || '', parseFloat(r.faturado)||0, parseInt(r.itens)||0,
          r.data_fat, r.hora_fat||'', r.usuario||'', r.turno||'?',
          r.nome_usuario||'', r.status_ped||'', importado_por
        );
        p += 10;
      }
      await client.query(
        `INSERT INTO faturamento_pedidos
           (numero_pedido,faturado,itens,data_fat,hora_fat,usuario,turno,nome_usuario,status_ped,importado_por)
         VALUES ${vals.join(',')}`,
        params
      );
    }

    // Registra no log de importações
    await client.query(
      `INSERT INTO fat_importacoes (nome_arquivo,ini,fim,total_registros,importado_por)
       VALUES ($1,$2,$3,$4,$5)`,
      [nome_arquivo || 'arquivo.xlsx', ini, fim, pedidos.length, importado_por]
    );

    await client.query('COMMIT');
    res.json({ total: pedidos.length, ini, fim, mensagem: 'Importado com sucesso!' });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(500).json({ erro: e.message });
  } finally { client.release(); }
});

// ── GET /dash-logistica/dados ─────────────────────────────────────────────
router.get('/dash-logistica/dados', requerAuth, async (req, res) => {
  const { ini, fim, turno } = req.query;
  try {
    const params = [];
    let where = '1=1';
    if (ini)   { params.push(ini);   where += ` AND data_fat >= $${params.length}`; }
    if (fim)   { params.push(fim);   where += ` AND data_fat <= $${params.length}`; }
    if (turno) { params.push(turno); where += ` AND turno = $${params.length}`; }

    const rows = await db.all(`
      SELECT numero_pedido, faturado, itens,
             TO_CHAR(data_fat,'YYYY-MM-DD') AS data_fat,
             hora_fat, usuario, turno, nome_usuario, status_ped
      FROM faturamento_pedidos
      WHERE ${where}
      ORDER BY data_fat, hora_fat
    `, params);

    res.json(rows);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── GET /dash-logistica/range ─────────────────────────────────────────────
router.get('/dash-logistica/range', requerAuth, async (req, res) => {
  try {
    const row = await db.get(`
      SELECT TO_CHAR(MIN(data_fat),'YYYY-MM-DD') AS ini,
             TO_CHAR(MAX(data_fat),'YYYY-MM-DD') AS fim,
             COUNT(*)::int AS total
      FROM faturamento_pedidos
    `);
    res.json(row || { ini: null, fim: null, total: 0 });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── GET /dash-logistica/importacoes ──────────────────────────────────────
router.get('/dash-logistica/importacoes', requerAuth, async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT id,
             nome_arquivo,
             TO_CHAR(ini,'DD/MM/YYYY') AS ini_fmt,
             TO_CHAR(fim,'DD/MM/YYYY') AS fim_fmt,
             TO_CHAR(ini,'YYYY-MM-DD') AS ini,
             TO_CHAR(fim,'YYYY-MM-DD') AS fim,
             total_registros,
             importado_por,
             TO_CHAR(importado_em AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI') AS importado_em_fmt
      FROM fat_importacoes
      ORDER BY importado_em DESC
      LIMIT 50
    `);
    res.json(rows);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── DELETE /dash-logistica/importacoes/:id ────────────────────────────────
router.delete('/dash-logistica/importacoes/:id', requerAuth, async (req, res) => {
  try {
    const imp = await db.get(`SELECT * FROM fat_importacoes WHERE id=$1`, [req.params.id]);
    if (!imp) return res.status(404).json({ erro: 'Importação não encontrada.' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `DELETE FROM faturamento_pedidos WHERE data_fat >= $1 AND data_fat <= $2`,
        [imp.ini, imp.fim]
      );
      await client.query(`DELETE FROM fat_importacoes WHERE id=$1`, [req.params.id]);
      await client.query('COMMIT');
      res.json({ mensagem: 'Removido com sucesso.' });
    } catch(e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
