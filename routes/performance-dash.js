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
        p.data_pedido                              AS data,
        COUNT(DISTINCT p.id)::int                   AS pedidos,
        COALESCE(SUM(p.itens), 0)::int              AS itens
      FROM pedidos p
      JOIN separadores s ON s.id = p.separador_id
      WHERE p.status       = 'concluido'
        AND p.data_pedido >= $1
        AND p.data_pedido <= $2
        AND s.status = 'ativo'
      GROUP BY p.data_pedido
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

// ── GET /performance/timing?ini=YYYY-MM-DD&fim=YYYY-MM-DD&turno= ─────────
router.get('/performance/timing', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  const { ini, fim, turno } = req.query;
  if (!ini || !fim) return res.status(400).json({ erro: 'Informe ini e fim.' });

  try {
    const turnoFiltroSep = turno
      ? ` AND REPLACE(COALESCE(u.turno, s.turno, 'Manha'), 'ã', 'a') = $3`
      : '';
    const paramsSep = turno ? [ini, fim, turno] : [ini, fim];

    // Separação — pedido a pedido (skus_concluido_em exclui espera de reposição)
    const separacao = await db.all(`
      SELECT
        p.numero_pedido,
        COALESCE(u.nome, s.nome)                                         AS colaborador,
        REPLACE(COALESCE(u.turno, s.turno, 'Manha'), 'ã', 'a')          AS turno,
        p.data_pedido                                                     AS data,
        p.iniciado_em,
        COALESCE(NULLIF(p.skus_concluido_em,''), NULLIF(p.concluido_em,'')) AS concluido_em,
        CASE
          WHEN NULLIF(p.iniciado_em,'') IS NOT NULL
           AND NULLIF(COALESCE(NULLIF(p.skus_concluido_em,''), NULLIF(p.concluido_em,'')), '') IS NOT NULL
          THEN ROUND(EXTRACT(EPOCH FROM (
            COALESCE(NULLIF(p.skus_concluido_em,''), NULLIF(p.concluido_em,''))::timestamp
            - p.iniciado_em::timestamp
          )) / 60.0, 1)::float
          ELSE NULL
        END AS duracao_min
      FROM pedidos p
      JOIN separadores s ON s.id = p.separador_id
      LEFT JOIN usuarios u ON u.id = s.usuario_id
      WHERE p.status = 'concluido'
        AND p.data_pedido >= $1
        AND p.data_pedido <= $2
        AND s.status = 'ativo'
        ${turnoFiltroSep}
      ORDER BY COALESCE(u.nome, s.nome), p.iniciado_em
    `, paramsSep);

    // Reposição — tentativa a tentativa (unnest JSONB de tentativas)
    const reposicao = await db.all(`
      SELECT
        ar.numero_pedido,
        ar.codigo,
        ar.descricao,
        ar.data_aviso                    AS data,
        t.value->>'repositor'            AS colaborador,
        t.value->>'hora_inicio'          AS iniciado_em,
        t.value->>'hora_fim'             AS concluido_em,
        t.value->>'resultado'            AS resultado,
        CASE
          WHEN (t.value->>'hora_inicio') IS NOT NULL AND (t.value->>'hora_inicio') != ''
           AND (t.value->>'hora_fim')    IS NOT NULL AND (t.value->>'hora_fim')    != ''
          THEN ROUND(EXTRACT(EPOCH FROM (
            (ar.data_aviso || ' ' || (t.value->>'hora_fim'))::timestamp
            - (ar.data_aviso || ' ' || (t.value->>'hora_inicio'))::timestamp
          )) / 60.0, 1)::float
          ELSE NULL
        END AS duracao_min
      FROM avisos_repositor ar,
           jsonb_array_elements(COALESCE(ar.tentativas, '[]'::jsonb)) AS t(value)
      WHERE ar.data_aviso >= $1
        AND ar.data_aviso <= $2
        AND ar.tentativas IS NOT NULL
        AND ar.tentativas != '[]'::jsonb
        AND (t.value->>'hora_inicio') IS NOT NULL
        AND (t.value->>'hora_inicio') != ''
      ORDER BY t.value->>'repositor', ar.data_aviso, t.value->>'hora_inicio'
    `, [ini, fim]);

    // Checkout — operador a operador
    const checkout = await db.all(`
      SELECT
        c.numero_pedido,
        COALESCE(NULLIF(c.operador_nome,''), 'Operador') AS colaborador,
        c.data_checkout                                   AS data,
        c.hora_criacao                                    AS iniciado_em,
        c.hora_checkout                                   AS concluido_em,
        CASE
          WHEN NULLIF(c.hora_criacao,'') IS NOT NULL AND NULLIF(c.hora_checkout,'') IS NOT NULL
          THEN ROUND(EXTRACT(EPOCH FROM (
            (c.data_checkout || ' ' || c.hora_checkout)::timestamp
            - (c.data_checkout || ' ' || c.hora_criacao)::timestamp
          )) / 60.0, 1)::float
          ELSE NULL
        END AS duracao_min
      FROM checkout c
      WHERE c.status = 'concluido'
        AND NULLIF(c.hora_checkout,'') IS NOT NULL
        AND c.data_checkout >= $1
        AND c.data_checkout <= $2
      ORDER BY COALESCE(NULLIF(c.operador_nome,''), 'Operador'), c.data_checkout, c.hora_checkout
    `, [ini, fim]);

    // Embalagem — embalador a embalador
    const embalagem = await db.all(`
      SELECT
        p.numero_pedido,
        NULLIF(p.embalado_por,'')     AS colaborador,
        p.data_pedido                  AS data,
        p.embalagem_iniciado_em        AS iniciado_em,
        p.embalado_em                  AS concluido_em,
        CASE
          WHEN NULLIF(p.embalagem_iniciado_em,'') IS NOT NULL AND NULLIF(p.embalado_em,'') IS NOT NULL
          THEN ROUND(EXTRACT(EPOCH FROM (
            (p.data_pedido || ' ' || p.embalado_em)::timestamp
            - (p.data_pedido || ' ' || p.embalagem_iniciado_em)::timestamp
          )) / 60.0, 1)::float
          ELSE NULL
        END AS duracao_min
      FROM pedidos p
      WHERE p.status_embalagem = 'embalado'
        AND NULLIF(p.embalado_por,'') IS NOT NULL
        AND p.data_pedido >= $1
        AND p.data_pedido <= $2
      ORDER BY p.embalado_por, p.data_pedido, p.embalado_em
    `, [ini, fim]);

    res.json({ separacao, reposicao, checkout, embalagem });
  } catch(e) {
    console.error('performance/timing:', e.message);
    res.status(500).json({ erro: e.message });
  }
});

// ── GET /performance/range ────────────────────────────────────────────────
router.get('/performance/range', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    const row = await db.get(`
      SELECT
        MIN(data_pedido) AS ini,
        MAX(data_pedido) AS fim
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
