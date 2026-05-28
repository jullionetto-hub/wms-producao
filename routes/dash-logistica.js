'use strict';
const express = require('express');
const router  = express.Router();
const { pool, db } = require('../lib/db');
const { requerAuth } = require('../lib/auth');

// ── POST /dash-logistica/importar ─────────────────────────────────────────
// Recebe array de pedidos processados do frontend e salva no banco.
// Apaga os registros do mesmo período antes de reinserir (evita duplicatas).
router.post('/dash-logistica/importar', requerAuth, async (req, res) => {
  const { pedidos, ini, fim } = req.body;
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

    // Insere em lotes de 500
    const LOTE = 500;
    for (let i = 0; i < pedidos.length; i += LOTE) {
      const lote = pedidos.slice(i, i + LOTE);
      const vals = [];
      const params = [];
      let p = 1;
      for (const r of lote) {
        vals.push(`($${p},$${p+1},$${p+2},$${p+3},$${p+4},$${p+5},$${p+6},$${p+7},$${p+8},$${p+9})`);
        params.push(
          r.numero_pedido || '',
          parseFloat(r.faturado)  || 0,
          parseInt(r.itens)       || 0,
          r.data_fat,               // 'YYYY-MM-DD'
          r.hora_fat || '',
          r.usuario  || '',
          r.turno    || '?',
          r.nome_usuario || '',
          r.status_ped   || '',
          importado_por
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

    await client.query('COMMIT');
    res.json({ total: pedidos.length, ini, fim, mensagem: 'Importado com sucesso!' });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(500).json({ erro: e.message });
  } finally { client.release(); }
});

// ── GET /dash-logistica/dados ─────────────────────────────────────────────
// Retorna todos os registros do período para o frontend agregar.
router.get('/dash-logistica/dados', requerAuth, async (req, res) => {
  const { ini, fim, turno } = req.query;
  try {
    const params = [];
    let where = '1=1';
    if (ini) { params.push(ini); where += ` AND data_fat >= $${params.length}`; }
    if (fim) { params.push(fim); where += ` AND data_fat <= $${params.length}`; }
    if (turno) { params.push(turno); where += ` AND turno = $${params.length}`; }

    const rows = await db.all(`
      SELECT numero_pedido, faturado, itens,
             TO_CHAR(data_fat, 'YYYY-MM-DD') AS data_fat,
             hora_fat, usuario, turno, nome_usuario, status_ped
      FROM faturamento_pedidos
      WHERE ${where}
      ORDER BY data_fat, hora_fat
    `, params);

    res.json(rows);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── GET /dash-logistica/range ─────────────────────────────────────────────
// Retorna o range de datas disponíveis no banco.
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

// ── DELETE /dash-logistica/periodo ────────────────────────────────────────
// Permite apagar um período específico.
router.delete('/dash-logistica/periodo', requerAuth, async (req, res) => {
  const { ini, fim } = req.body;
  if (!ini || !fim) return res.status(400).json({ erro: 'Informe ini e fim.' });
  try {
    const r = await pool.query(
      `DELETE FROM faturamento_pedidos WHERE data_fat >= $1 AND data_fat <= $2`,
      [ini, fim]
    );
    res.json({ removidos: r.rowCount });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
