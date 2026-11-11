import express from 'express';
const router = express.Router();
import { db } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';
import { sqlDiaOperacional } from '../../lib/helpers';
import { TURNO_DE_NOME, diaSep, diaCk, EMB_DATA_PED, diaAvTent, minDia } from './_comum';

const diaEmbPed = (a: any) => sqlDiaOperacional({ ts: `${EMB_DATA_PED(a)}||' '||${a}.embalado_em`, civil: EMB_DATA_PED(a), turno: TURNO_DE_NOME(`${a}.embalado_por`) });

// ── GET /performance/pedidos-detail ──────────────────────────────────────────
router.get('/performance/pedidos-detail', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  const { ini, fim, turno } = req.query as Record<string, string>;
  if (!ini || !fim) return res.status(400).json({ erro: 'Informe ini e fim.' });
  try {
    const turnoFiltro = turno
      ? ` AND REPLACE(COALESCE(u.turno, s.turno, 'Manha'), 'Ã£', 'a') = $3`
      : '';
    const params = turno ? [ini, fim, turno] : [ini, fim];

    const rows = await db.all(`
      SELECT
        ${diaSep('p')} AS data,
        p.numero_pedido,
        COALESCE(u.nome, s.nome)                                              AS colaborador,
        REPLACE(COALESCE(u.turno, s.turno, 'Manha'), 'Ã£', 'a')              AS turno,
        COALESCE(NULLIF(p.total_itens,0), p.itens, 0)::int                   AS total_itens,
        (SELECT COUNT(DISTINCT ip2.codigo)::int
           FROM itens_pedido ip2
           WHERE ip2.pedido_id = p.id
             AND ip2.codigo IS NOT NULL AND ip2.codigo != '')                 AS skus,
        CASE
          WHEN NULLIF(p.iniciado_em,'') IS NOT NULL
          THEN GREATEST(0, ROUND((
            EXTRACT(EPOCH FROM (
              COALESCE(
                NULLIF(p.skus_concluido_em,''),
                NULLIF(p.data_pedido||'T'||(
                  SELECT MAX(iv.hora_verificado) FROM itens_pedido iv
                  WHERE iv.pedido_id=p.id AND iv.hora_verificado!=''
                ), p.data_pedido||'T'),
                NULLIF(p.concluido_em,'')
              )::timestamp - p.iniciado_em::timestamp
            )) / 60.0
            - COALESCE(p.tempo_aguardando_min, 0)
          )::numeric, 1))
          ELSE NULL
        END                                                                   AS duracao_min,
        (SELECT COUNT(DISTINCT UPPER((regexp_match(split_part(ip3.endereco,'/',1),'^([A-Za-z]+)[0-9]'))[1]))::int
           FROM itens_pedido ip3
           WHERE ip3.pedido_id = p.id
             AND ip3.endereco IS NOT NULL AND ip3.endereco != ''
             AND (regexp_match(split_part(ip3.endereco,'/',1),'^([A-Za-z]+)[0-9]'))[1] IS NOT NULL
        )                                                                     AS ruas_percorridas,
        (SELECT STRING_AGG(rr, ',' ORDER BY rr)
           FROM (SELECT DISTINCT UPPER((regexp_match(split_part(ip3.endereco,'/',1),'^([A-Za-z]+)[0-9]'))[1]) AS rr
                 FROM itens_pedido ip3
                 WHERE ip3.pedido_id = p.id
                   AND ip3.endereco IS NOT NULL AND ip3.endereco != ''
                   AND (regexp_match(split_part(ip3.endereco,'/',1),'^([A-Za-z]+)[0-9]'))[1] IS NOT NULL
                ) _sub
        )                                                                     AS ruas_lista
      FROM pedidos p
      JOIN separadores s ON s.id = p.separador_id
      LEFT JOIN usuarios u ON u.id = s.usuario_id
      WHERE p.status = 'concluido'
        AND ${diaSep('p')} >= $1
        AND ${diaSep('p')} <= $2
        AND s.status = 'ativo' ${turnoFiltro}
      ORDER BY data, COALESCE(u.nome, s.nome), p.numero_pedido
    `, params);

    res.json(rows);
  } catch(e) {
    console.error('performance/pedidos-detail:', e.message);
    res.status(500).json({ erro: e.message });
  }
});

// â”€â”€ GET /performance/timing?ini=YYYY-MM-DD&fim=YYYY-MM-DD&turno= â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/performance/timing', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  const { ini, fim, turno } = req.query as Record<string, string>;
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
        ${diaSep('p')} AS data,
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
        AND ${diaSep('p')} >= $1
        AND ${diaSep('p')} <= $2
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
        ${diaAvTent}                    AS data,
        t.value->>'repositor'            AS colaborador,
        t.value->>'hora_inicio'          AS iniciado_em,
        t.value->>'hora_fim'             AS concluido_em,
        t.value->>'resultado'            AS resultado,
        CASE
          WHEN (t.value->>'hora_inicio') IS NOT NULL AND (t.value->>'hora_inicio') != ''
           AND (t.value->>'hora_fim')    IS NOT NULL AND (t.value->>'hora_fim')    != ''
          THEN GREATEST(0, ROUND(EXTRACT(EPOCH FROM (
            (ar.data_aviso || ' ' || (t.value->>'hora_fim'))::timestamp
            - (ar.data_aviso || ' ' || (t.value->>'hora_inicio'))::timestamp
          )) / 60.0, 1))::float
          ELSE NULL
        END AS duracao_min
      FROM avisos_repositor ar,
           jsonb_array_elements(COALESCE(ar.tentativas, '[]'::jsonb)) AS t(value)
      WHERE ${diaAvTent} >= $1
        AND ${diaAvTent} <= $2
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
        ${diaCk('c')}                                              AS data,
        c.hora_criacao                                               AS iniciado_em,
        c.hora_checkout                                              AS concluido_em,
        COALESCE(NULLIF(p.total_itens,0), p.itens, 0)               AS total_itens,
        (SELECT COUNT(DISTINCT ip.codigo) FROM itens_pedido ip
          WHERE ip.pedido_id=p.id AND ip.codigo IS NOT NULL AND ip.codigo != '')::int AS skus,
        COALESCE(
          (SELECT ROUND(SUM(cs.tempo_min)::numeric, 1)::float
           FROM checkout_sessoes cs
           WHERE cs.checkout_id = c.id AND cs.tempo_min > 0
             AND cs.data_sessao = c.data_checkout AND cs.operador_nome = c.operador_nome),
          CASE
            WHEN NULLIF(c.hora_criacao,'') IS NOT NULL AND NULLIF(c.hora_checkout,'') IS NOT NULL
            THEN ROUND(${minDia("EXTRACT(EPOCH FROM ((c.data_checkout || ' ' || c.hora_checkout)::timestamp - (c.data_checkout || ' ' || c.hora_criacao)::timestamp)) / 60.0")}, 1)::float
            ELSE NULL
          END
        ) AS duracao_min
      FROM checkout c
      LEFT JOIN pedidos p ON c.pedido_id = p.id
      WHERE c.status = 'concluido'
        AND NULLIF(c.hora_checkout,'') IS NOT NULL
        AND ${diaCk('c')} >= $1
        AND ${diaCk('c')} <= $2
      ORDER BY COALESCE(NULLIF(c.operador_nome,''), 'Operador'), c.data_checkout, c.hora_checkout
    `, [ini, fim]);

    // Embalagem â€” embalador a embalador
    const embalagem = await db.all(`
      SELECT
        p.numero_pedido,
        NULLIF(p.embalado_por,'')                          AS colaborador,
        ${diaEmbPed('p')}                                   AS data,
        p.embalagem_iniciado_em                             AS iniciado_em,
        p.embalado_em                                       AS concluido_em,
        COALESCE(NULLIF(p.total_itens,0), p.itens, 0)      AS total_itens,
        (SELECT COUNT(DISTINCT ip.codigo) FROM itens_pedido ip
          WHERE ip.pedido_id=p.id AND ip.codigo IS NOT NULL AND ip.codigo != '')::int AS skus,
        CASE
          WHEN NULLIF(p.embalagem_iniciado_em,'') IS NOT NULL AND NULLIF(p.embalado_em,'') IS NOT NULL
          THEN ROUND(${minDia("EXTRACT(EPOCH FROM ((COALESCE((SELECT eb.data_embalagem FROM embalagem eb WHERE eb.pedido_id = p.id ORDER BY eb.id DESC LIMIT 1), p.data_pedido) || ' ' || p.embalado_em)::timestamp - (COALESCE((SELECT eb.data_embalagem FROM embalagem eb WHERE eb.pedido_id = p.id ORDER BY eb.id DESC LIMIT 1), p.data_pedido) || ' ' || p.embalagem_iniciado_em)::timestamp)) / 60.0")}, 1)::float
          ELSE NULL
        END AS duracao_min
      FROM pedidos p
      WHERE p.status_embalagem = 'embalado'
        AND NULLIF(p.embalado_por,'') IS NOT NULL
        AND ${diaEmbPed('p')} >= $1
        AND ${diaEmbPed('p')} <= $2
      ORDER BY p.embalado_por, ${diaEmbPed('p')}, p.embalado_em
    `, [ini, fim]);

    res.json({ separacao, reposicao, checkout, embalagem });
  } catch(e) {
    console.error('performance/timing:', e.message);
    res.status(500).json({ erro: e.message });
  }
});

module.exports = router;
