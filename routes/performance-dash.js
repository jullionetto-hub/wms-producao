'use strict';
const express = require('express');
const router  = express.Router();
const { db } = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');

// ── GET /performance/separadores?ini=YYYY-MM-DD&fim=YYYY-MM-DD ───────────
router.get('/performance/separadores', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  const { ini, fim, turno } = req.query;
  if (!ini || !fim) return res.status(400).json({ erro: 'Informe ini e fim.' });

  try {
    // Filtro opcional de turno
    const turnoFiltro = turno
      ? ` AND REPLACE(COALESCE(u.turno, s.turno, 'Manha'), 'ã', 'a') = $3`
      : '';
    const params = turno ? [ini, fim, turno] : [ini, fim];

    // ── Agregação principal por colaborador ─────────────────────────────
    const colab = await db.all(`
      SELECT
        COALESCE(u.nome, s.nome)                                              AS nome,
        REPLACE(COALESCE(u.turno, s.turno, 'Manha'), 'ã', 'a')               AS turno,
        COUNT(DISTINCT p.id)::int                                             AS pedidos,
        COALESCE(SUM(ip.quantidade), 0)::int                                  AS itens,
        COUNT(DISTINCT CASE WHEN ip.codigo IS NOT NULL AND ip.codigo != ''
                            THEN ip.codigo END)::int                          AS skus,
        ROUND(AVG(
          CASE
            WHEN NULLIF(p.iniciado_em, '') IS NOT NULL
             AND NULLIF(COALESCE(NULLIF(p.skus_concluido_em,''), NULLIF(p.concluido_em,'')), '') IS NOT NULL
            THEN EXTRACT(EPOCH FROM (
              COALESCE(NULLIF(p.skus_concluido_em,''), NULLIF(p.concluido_em,''))::timestamp
              - p.iniciado_em::timestamp
            )) / 60.0
            ELSE NULL
          END
        )::numeric, 1)                                                        AS tempo_medio_min
      FROM separadores s
      LEFT JOIN usuarios u ON u.id = s.usuario_id
      JOIN pedidos p
        ON p.separador_id = s.id
       AND p.status       = 'concluido'
       AND p.data_pedido >= $1
       AND p.data_pedido <= $2
      LEFT JOIN itens_pedido ip ON ip.pedido_id = p.id
      WHERE s.status = 'ativo' ${turnoFiltro}
      GROUP BY COALESCE(u.nome, s.nome),
               REPLACE(COALESCE(u.turno, s.turno, 'Manha'), 'ã', 'a')
      ORDER BY pedidos DESC
    `, params);

    // ── Reposições por separador (gerou o aviso) ─────────────────────────
    const repos = await db.all(`
      SELECT separador_nome AS nome,
             COUNT(*)::int  AS reposicoes
      FROM avisos_repositor
      WHERE data_aviso >= $1
        AND data_aviso <= $2
        AND separador_nome IS NOT NULL
        AND separador_nome != ''
      GROUP BY separador_nome
    `, [ini, fim]);
    const repoIdx = Object.fromEntries(repos.map(r => [r.nome, r.reposicoes]));

    // ── Pedidos por dia (para gráfico de linha) ───────────────────────────
    const porDia = await db.all(`
      SELECT
        TO_CHAR(p.data_pedido::date, 'YYYY-MM-DD') AS data,
        COUNT(DISTINCT p.id)::int                   AS pedidos,
        COALESCE(SUM(p.itens), 0)::int              AS itens
      FROM pedidos p
      JOIN separadores s ON s.id = p.separador_id
      WHERE p.status       = 'concluido'
        AND p.data_pedido >= $1
        AND p.data_pedido <= $2
        AND s.status = 'ativo'
      GROUP BY TO_CHAR(p.data_pedido::date, 'YYYY-MM-DD')
      ORDER BY data
    `, [ini, fim]);

    const resultado = colab.map(c => ({
      ...c,
      reposicoes:     repoIdx[c.nome] || 0,
      tempo_medio_min: c.tempo_medio_min ? parseFloat(c.tempo_medio_min) : null,
    }));

    res.json({ colaboradores: resultado, por_dia: porDia });
  } catch(e) {
    console.error('performance/separadores:', e.message);
    res.status(500).json({ erro: e.message });
  }
});

// ── GET /performance/range ────────────────────────────────────────────────
router.get('/performance/range', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    const row = await db.get(`
      SELECT
        TO_CHAR(MIN(data_pedido::date), 'YYYY-MM-DD') AS ini,
        TO_CHAR(MAX(data_pedido::date), 'YYYY-MM-DD') AS fim
      FROM pedidos
      WHERE status = 'concluido'
        AND separador_id IS NOT NULL
        AND data_pedido IS NOT NULL
        AND data_pedido != ''
    `);
    res.json(row || { ini: null, fim: null });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
