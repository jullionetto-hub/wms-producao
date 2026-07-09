'use strict';
const express = require('express');
const router  = express.Router();
const { db, pool } = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');
const { dataHoraLocal } = require('../lib/helpers');

// â”€â”€ GET /performance/separadores?ini=YYYY-MM-DD&fim=YYYY-MM-DD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/performance/separadores', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  const { ini, fim, turno } = req.query;
  if (!ini || !fim) return res.status(400).json({ erro: 'Informe ini e fim.' });

  try {
    // Filtro opcional de turno
    const turnoFiltro = turno
      ? ` AND REPLACE(COALESCE(u.turno, s.turno, 'Manha'), 'Ã£', 'a') = $3`
      : '';
    const params = turno ? [ini, fim, turno] : [ini, fim];

    // â”€â”€ AgregaÃ§Ã£o principal por colaborador â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const colab = await db.all(`
      SELECT
        COALESCE(u.nome, s.nome)                                              AS nome,
        REPLACE(COALESCE(u.turno, s.turno, 'Manha'), 'Ã£', 'a')               AS turno,
        COUNT(DISTINCT p.id)::int                                             AS pedidos,
        COALESCE(SUM(ip.quantidade), 0)::int                                  AS itens,
        COUNT(DISTINCT CASE WHEN ip.codigo IS NOT NULL AND ip.codigo != ''
                            THEN ip.codigo END)::int                          AS skus,
        (SELECT ROUND(AVG(
            CASE
              WHEN NULLIF(p2.iniciado_em,'') IS NOT NULL
               AND NULLIF(COALESCE(
                     NULLIF(p2.skus_concluido_em,''),
                     NULLIF((SELECT p2.data_pedido||'T'||MAX(iv.hora_verificado)
                             FROM itens_pedido iv WHERE iv.pedido_id=p2.id AND iv.hora_verificado!=''),
                            p2.data_pedido||'T'),
                     NULLIF(p2.concluido_em,'')
                   ), '') IS NOT NULL
              THEN GREATEST(0,
                EXTRACT(EPOCH FROM (
                  COALESCE(
                    NULLIF(p2.skus_concluido_em,''),
                    NULLIF((SELECT p2.data_pedido||'T'||MAX(iv.hora_verificado)
                            FROM itens_pedido iv WHERE iv.pedido_id=p2.id AND iv.hora_verificado!=''),
                           p2.data_pedido||'T'),
                    NULLIF(p2.concluido_em,'')
                  )::timestamp
                  - p2.iniciado_em::timestamp
                )) / 60.0
                - COALESCE(p2.tempo_aguardando_min, 0)
              )
              ELSE NULL
            END
          )::numeric, 1)
          FROM pedidos p2
          WHERE p2.separador_id = s.id
            AND p2.status       = 'concluido'
            AND COALESCE(NULLIF(LEFT(p2.iniciado_em,10),''), NULLIF(p2.data_distribuicao,''), p2.data_pedido) >= $1
            AND COALESCE(NULLIF(LEFT(p2.iniciado_em,10),''), NULLIF(p2.data_distribuicao,''), p2.data_pedido) <= $2
        )                                                                     AS tempo_medio_min
      FROM separadores s
      LEFT JOIN usuarios u ON u.id = s.usuario_id
      JOIN pedidos p
        ON p.separador_id = s.id
       AND p.status       = 'concluido'
       AND COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) >= $1
       AND COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) <= $2
      LEFT JOIN itens_pedido ip ON ip.pedido_id = p.id
      WHERE s.status = 'ativo' ${turnoFiltro}
      GROUP BY s.id,
               COALESCE(u.nome, s.nome),
               REPLACE(COALESCE(u.turno, s.turno, 'Manha'), 'Ã£', 'a')
      ORDER BY pedidos DESC
    `, params);

    // â”€â”€ ReposiÃ§Ãµes por separador (gerou o aviso) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Pedidos por dia (para grÃ¡fico de linha) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const porDia = await db.all(`
      SELECT
        COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) AS data,
        COUNT(DISTINCT p.id)::int                   AS pedidos,
        COALESCE(SUM(p.itens), 0)::int              AS itens
      FROM pedidos p
      JOIN separadores s ON s.id = p.separador_id
      WHERE p.status       = 'concluido'
        AND COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) >= $1
        AND COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) <= $2
        AND s.status = 'ativo'
      GROUP BY COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido)
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

// â”€â”€ GET /performance/timing?ini=YYYY-MM-DD&fim=YYYY-MM-DD&turno= â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/performance/timing', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  const { ini, fim, turno } = req.query;
  if (!ini || !fim) return res.status(400).json({ erro: 'Informe ini e fim.' });

  try {
    const turnoFiltroSep = turno
      ? ` AND REPLACE(COALESCE(u.turno, s.turno, 'Manha'), 'Ã£', 'a') = $3`
      : '';
    const paramsSep = turno ? [ini, fim, turno] : [ini, fim];

    // SeparaÃ§Ã£o â€” pedido a pedido (skus_concluido_em exclui espera de reposiÃ§Ã£o)
    const separacao = await db.all(`
      SELECT
        p.numero_pedido,
        COALESCE(u.nome, s.nome)                                         AS colaborador,
        REPLACE(COALESCE(u.turno, s.turno, 'Manha'), 'Ã£', 'a')          AS turno,
        COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) AS data,
        p.iniciado_em,
        COALESCE(
          NULLIF(p.skus_concluido_em,''),
          NULLIF((SELECT p.data_pedido||'T'||MAX(iv.hora_verificado)
                  FROM itens_pedido iv WHERE iv.pedido_id=p.id AND iv.hora_verificado!=''),
                 p.data_pedido||'T'),
          NULLIF(p.concluido_em,'')
        ) AS concluido_em,
        COALESCE(NULLIF(p.total_itens,0), p.itens, 0)                    AS total_itens,
        (SELECT COUNT(DISTINCT ip.codigo)
           FROM itens_pedido ip
           WHERE ip.pedido_id = p.id
             AND ip.codigo IS NOT NULL AND ip.codigo != '')::int          AS skus,
        CASE
          WHEN NULLIF(p.iniciado_em,'') IS NOT NULL
          THEN GREATEST(0, ROUND(
            EXTRACT(EPOCH FROM (
              COALESCE(
                NULLIF(p.skus_concluido_em,''),
                NULLIF((SELECT p.data_pedido||'T'||MAX(iv.hora_verificado)
                        FROM itens_pedido iv WHERE iv.pedido_id=p.id AND iv.hora_verificado!=''),
                       p.data_pedido||'T'),
                NULLIF(p.concluido_em,'')
              )::timestamp
              - p.iniciado_em::timestamp
            )) / 60.0
            - COALESCE(p.tempo_aguardando_min, 0)
          , 1))::float
          ELSE NULL
        END AS duracao_min
      FROM pedidos p
      JOIN separadores s ON s.id = p.separador_id
      LEFT JOIN usuarios u ON u.id = s.usuario_id
      WHERE p.status = 'concluido'
        AND COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) >= $1
        AND COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) <= $2
        AND s.status = 'ativo'
        ${turnoFiltroSep}
      ORDER BY COALESCE(u.nome, s.nome), p.iniciado_em
    `, paramsSep);

    // ReposiÃ§Ã£o â€” tentativa a tentativa (unnest JSONB de tentativas)
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

    // Checkout â€” operador a operador
    const checkout = await db.all(`
      SELECT
        c.numero_pedido,
        COALESCE(NULLIF(c.operador_nome,''), 'Operador')            AS colaborador,
        c.data_checkout                                              AS data,
        c.hora_criacao                                               AS iniciado_em,
        c.hora_checkout                                              AS concluido_em,
        COALESCE(NULLIF(p.total_itens,0), p.itens, 0)               AS total_itens,
        p.itens                                                      AS skus,
        CASE
          WHEN NULLIF(c.hora_criacao,'') IS NOT NULL AND NULLIF(c.hora_checkout,'') IS NOT NULL
          THEN ROUND(EXTRACT(EPOCH FROM (
            (c.data_checkout || ' ' || c.hora_checkout)::timestamp
            - (c.data_checkout || ' ' || c.hora_criacao)::timestamp
          )) / 60.0, 1)::float
          ELSE NULL
        END AS duracao_min
      FROM checkout c
      LEFT JOIN pedidos p ON c.pedido_id = p.id
      WHERE c.status = 'concluido'
        AND NULLIF(c.hora_checkout,'') IS NOT NULL
        AND c.data_checkout >= $1
        AND c.data_checkout <= $2
      ORDER BY COALESCE(NULLIF(c.operador_nome,''), 'Operador'), c.data_checkout, c.hora_checkout
    `, [ini, fim]);

    // Embalagem â€” embalador a embalador
    const embalagem = await db.all(`
      SELECT
        p.numero_pedido,
        NULLIF(p.embalado_por,'')                          AS colaborador,
        p.data_pedido                                       AS data,
        p.embalagem_iniciado_em                             AS iniciado_em,
        p.embalado_em                                       AS concluido_em,
        COALESCE(NULLIF(p.total_itens,0), p.itens, 0)      AS total_itens,
        p.itens                                             AS skus,
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

// â”€â”€ GET /performance/metas â€” Metas proporcionais por tempo logado â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/performance/metas', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  const { ini, fim } = req.query;
  if (!ini || !fim) return res.status(400).json({ erro: 'Informe ini e fim.' });

  try {
    const METAS     = { separador: 65, checkout: 90, embalador: 120, repositor: 90 };
    const TURNO_MIN = { Manha: 465, Tarde: 465, Noite: 453 };

    // Tempo logado por colaborador/perfil/data
    const sessoes = await db.all(`
      SELECT
        usuario_nome                                                AS nome,
        perfil,
        REPLACE(COALESCE(turno,'Manha'),'Ã£','a')                   AS turno,
        data,
        SUM(
          CASE
            WHEN logout_em IS NOT NULL THEN COALESCE(duracao_min, 0)
            ELSE LEAST(
              GREATEST(0,
                ROUND(EXTRACT(EPOCH FROM (
                  LEAST(COALESCE(ultimo_ping, login_em) + INTERVAL '10 minutes', NOW()) - login_em
                )) / 60)::int
              ),
              480  -- cap sessÃµes sem logout em 8h para evitar inflaÃ§Ã£o
            )
          END
        )::int                                                      AS minutos_logado
      FROM sessoes_trabalho
      WHERE data >= $1
        AND data <= $2
        AND perfil IN ('separador','checkout','embalador','repositor')
      GROUP BY usuario_nome, perfil, REPLACE(COALESCE(turno,'Manha'),'Ã£','a'), data
      ORDER BY data, usuario_nome
    `, [ini, fim]);

    const [sepRows, ckRows, embRows, repRows] = await Promise.all([
      db.all(`
        SELECT COALESCE(u.nome,s.nome) AS nome,
               COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) AS data,
               COUNT(*)::int AS realizado
        FROM pedidos p
        JOIN separadores s ON s.id=p.separador_id
        LEFT JOIN usuarios u ON u.id=s.usuario_id
        WHERE p.status='concluido'
          AND COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) >= $1
          AND COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) <= $2
        GROUP BY COALESCE(u.nome,s.nome),
                 COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido)
      `, [ini, fim]),
      db.all(`
        SELECT operador_nome AS nome, data_checkout AS data, COUNT(*)::int AS realizado
        FROM checkout
        WHERE status='concluido' AND data_checkout>=$1 AND data_checkout<=$2
          AND operador_nome != ''
        GROUP BY operador_nome, data_checkout
      `, [ini, fim]),
      db.all(`
        SELECT embalado_por AS nome, data_embalagem AS data, COUNT(*)::int AS realizado
        FROM embalagem
        WHERE data_embalagem>=$1 AND data_embalagem<=$2 AND embalado_por != ''
        GROUP BY embalado_por, data_embalagem
      `, [ini, fim]),
      db.all(`
        SELECT repositor_nome AS nome, data_aviso AS data, COUNT(*)::int AS realizado
        FROM avisos_repositor
        WHERE data_aviso>=$1 AND data_aviso<=$2
          AND repositor_nome != '' AND repositor_nome IS NOT NULL
          AND status NOT IN ('pendente','protocolo')
        GROUP BY repositor_nome, data_aviso
      `, [ini, fim]),
    ]);

    const realIdx = {};
    const addReal = (rows, perfil) => {
      for (const r of rows) {
        const k = `${r.nome}|${perfil}|${r.data}`;
        realIdx[k] = (realIdx[k] || 0) + r.realizado;
      }
    };
    addReal(sepRows,  'separador');
    addReal(ckRows,   'checkout');
    addReal(embRows,  'embalador');
    addReal(repRows,  'repositor');

    const resultado = sessoes.map(s => {
      const metaCheia = METAS[s.perfil]    || 0;
      const turnoMin  = TURNO_MIN[s.turno] || 465;
      const metaProp  = turnoMin > 0
        ? Math.round((s.minutos_logado / turnoMin) * metaCheia * 10) / 10
        : 0;
      const realizado = realIdx[`${s.nome}|${s.perfil}|${s.data}`] || 0;
      const pct       = metaProp > 0 ? Math.round((realizado / metaProp) * 100) : null;
      return { ...s, meta_cheia: metaCheia, meta_proporcional: metaProp, realizado, pct_atingido: pct };
    });

    res.json(resultado);
  } catch(e) {
    console.error('performance/metas:', e.message);
    res.status(500).json({ erro: e.message });
  }
});

// â”€â”€ GET /performance/range â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/performance/range', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
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

// â”€â”€ GET /performance/ocorrencias â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/performance/ocorrencias', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  const { ini, fim, colaborador, tipo } = req.query;
  try {
    const params = [];
    let w = 'WHERE 1=1';
    if (ini)        { params.push(ini);         w += ` AND o.data >= $${params.length}`; }
    if (fim)        { params.push(fim);         w += ` AND o.data <= $${params.length}`; }
    if (colaborador){ params.push(colaborador); w += ` AND o.colaborador_nome = $${params.length}`; }
    if (tipo)       { params.push(tipo);        w += ` AND o.tipo = $${params.length}`; }
    const rows = await db.all(
      `SELECT * FROM ocorrencias o ${w} ORDER BY o.data DESC, o.criado_em DESC`,
      params
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// â”€â”€ POST /performance/ocorrencias â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/performance/ocorrencias', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  const { colaborador_nome, tipo, gravidade, descricao, data, turno } = req.body;
  if (!colaborador_nome || !tipo || !descricao || !data) {
    return res.status(400).json({ erro: 'Preencha colaborador, tipo, data e descriÃ§Ã£o.' });
  }
  const supervisor_nome = req.session?.usuario?.nome || '';
  try {
    const r = await pool.query(
      `INSERT INTO ocorrencias (colaborador_nome, tipo, gravidade, descricao, data, turno, supervisor_nome)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [colaborador_nome, tipo, gravidade||'leve', descricao, data, turno||'', supervisor_nome]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// â”€â”€ DELETE /performance/ocorrencias/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.delete('/performance/ocorrencias/:id', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  try {
    await pool.query('DELETE FROM ocorrencias WHERE id=$1', [req.params.id]);
    res.json({ mensagem: 'OcorrÃªncia excluÃ­da!' });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

/* ── GET /performance/pedido/:numero — rastreia um pedido em todas as etapas ── */
router.get('/performance/pedido/:numero', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  const { numero } = req.params;
  try {
    const sep = await db.get(`
      SELECT
        p.numero_pedido,
        COALESCE(u.nome, s.nome) AS colaborador,
        COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), p.data_pedido) AS data,
        p.iniciado_em,
        COALESCE(NULLIF(p.skus_concluido_em,''), NULLIF(p.concluido_em,'')) AS concluido_em,
        COALESCE(NULLIF(p.total_itens,0), p.itens, 0) AS total_itens,
        (SELECT COUNT(DISTINCT ip.codigo) FROM itens_pedido ip
          WHERE ip.pedido_id=p.id AND ip.codigo IS NOT NULL AND ip.codigo != '')::int AS skus,
        p.status, p.status_embalagem,
        CASE
          WHEN NULLIF(p.iniciado_em,'') IS NOT NULL
            AND NULLIF(COALESCE(NULLIF(p.skus_concluido_em,''), NULLIF(p.concluido_em,'')),'') IS NOT NULL
          THEN GREATEST(0, ROUND(
            EXTRACT(EPOCH FROM (
              COALESCE(NULLIF(p.skus_concluido_em,''), NULLIF(p.concluido_em,''))::timestamp
              - p.iniciado_em::timestamp
            )) / 60.0 - COALESCE(p.tempo_aguardando_min, 0)
          , 1))::float
          ELSE NULL
        END AS duracao_min
      FROM pedidos p
      JOIN separadores s ON s.id = p.separador_id
      LEFT JOIN usuarios u ON u.id = s.usuario_id
      WHERE p.numero_pedido = $1
    `, [numero]);

    if (!sep) return res.status(404).json({ erro: `Pedido #${numero} não encontrado.` });

    const reposicoes = await db.all(`
      SELECT
        ar.codigo, ar.descricao, ar.data_aviso AS data,
        t.value->>'repositor'   AS colaborador,
        t.value->>'hora_inicio' AS iniciado_em,
        t.value->>'hora_fim'    AS concluido_em,
        t.value->>'resultado'   AS resultado,
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
      WHERE ar.numero_pedido = $1
        AND ar.tentativas IS NOT NULL AND ar.tentativas != '[]'::jsonb
      ORDER BY ar.data_aviso, t.value->>'hora_inicio'
    `, [numero]);

    const ck = await db.get(`
      SELECT
        c.numero_pedido,
        COALESCE(NULLIF(c.operador_nome,''), 'Operador') AS colaborador,
        c.data_checkout AS data,
        c.hora_criacao  AS iniciado_em,
        c.hora_checkout AS concluido_em,
        CASE
          WHEN NULLIF(c.hora_criacao,'') IS NOT NULL AND NULLIF(c.hora_checkout,'') IS NOT NULL
          THEN ROUND(EXTRACT(EPOCH FROM (
            (c.data_checkout || ' ' || c.hora_checkout)::timestamp
            - (c.data_checkout || ' ' || c.hora_criacao)::timestamp
          )) / 60.0, 1)::float
          ELSE NULL
        END AS duracao_min
      FROM checkout c
      WHERE c.numero_pedido = $1 AND c.status = 'concluido'
      ORDER BY c.id DESC LIMIT 1
    `, [numero]);

    const emb = await db.get(`
      SELECT
        p.numero_pedido,
        NULLIF(p.embalado_por,'') AS colaborador,
        p.data_pedido              AS data,
        p.embalagem_iniciado_em    AS iniciado_em,
        p.embalado_em              AS concluido_em,
        COALESCE(NULLIF(p.total_itens,0), p.itens, 0) AS total_itens,
        p.itens AS skus,
        CASE
          WHEN NULLIF(p.embalagem_iniciado_em,'') IS NOT NULL AND NULLIF(p.embalado_em,'') IS NOT NULL
          THEN ROUND(EXTRACT(EPOCH FROM (
            (p.data_pedido || ' ' || p.embalado_em)::timestamp
            - (p.data_pedido || ' ' || p.embalagem_iniciado_em)::timestamp
          )) / 60.0, 1)::float
          ELSE NULL
        END AS duracao_min
      FROM pedidos p WHERE p.numero_pedido = $1
    `, [numero]);

    res.json({ numero_pedido: numero, separacao: sep, reposicoes: reposicoes || [], checkout: ck || null, embalagem: emb || null });
  } catch(e) {
    console.error('performance/pedido:', e.message);
    res.status(500).json({ erro: e.message });
  }
});

module.exports = router;

