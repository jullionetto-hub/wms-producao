import express from 'express';
const router = express.Router();
import { db } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';
import { diaSep, diaCk, diaAv, diaAvTent, minDia } from './_comum';

// â”€â”€ GET /performance/separadores?ini=YYYY-MM-DD&fim=YYYY-MM-DD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/performance/separadores', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  const { ini, fim, turno } = req.query as Record<string, string>;
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
            AND ${diaSep('p2')} >= $1
            AND ${diaSep('p2')} <= $2
        )                                                                     AS tempo_medio_min
      FROM separadores s
      LEFT JOIN usuarios u ON u.id = s.usuario_id
      JOIN pedidos p
        ON p.separador_id = s.id
       AND p.status       = 'concluido'
       AND ${diaSep('p')} >= $1
       AND ${diaSep('p')} <= $2
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
      WHERE ${diaAv('avisos_repositor', 'separador_nome')} >= $1
        AND ${diaAv('avisos_repositor', 'separador_nome')} <= $2
        AND separador_nome IS NOT NULL
        AND separador_nome != ''
      GROUP BY separador_nome
    `, [ini, fim]);
    const repoIdx = Object.fromEntries(repos.map(r => [r.nome, r.reposicoes]));

    // â”€â”€ Pedidos por dia (para grÃ¡fico de linha) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const porDia = await db.all(`
      SELECT
        ${diaSep('p')} AS data,
        COUNT(DISTINCT p.id)::int                   AS pedidos,
        COALESCE(SUM(p.itens), 0)::int              AS itens
      FROM pedidos p
      JOIN separadores s ON s.id = p.separador_id
      WHERE p.status       = 'concluido'
        AND ${diaSep('p')} >= $1
        AND ${diaSep('p')} <= $2
        AND s.status = 'ativo'
      GROUP BY ${diaSep('p')}
      ORDER BY data
    `, [ini, fim]);

    const resultado = colab.map(c => ({
      ...c,
      reposicoes:     repoIdx[c.nome] || 0,
      tempo_medio_min: c.tempo_medio_min ? parseFloat(c.tempo_medio_min) : null,
    }));

    const ruasRaw = await db.all(`
      SELECT rua, nome, SUM(itens)::int AS itens, COUNT(DISTINCT pedido_id)::int AS pedidos
      FROM (
        SELECT
          UPPER((regexp_match(split_part(ip.endereco,'/',1),'^([A-Za-z]+)[0-9]'))[1]) AS rua,
          COALESCE(u.nome, s.nome) AS nome,
          ip.quantidade AS itens,
          p.id AS pedido_id
        FROM pedidos p
        JOIN separadores s ON s.id = p.separador_id
        LEFT JOIN usuarios u ON u.id = s.usuario_id
        JOIN itens_pedido ip ON ip.pedido_id = p.id
        WHERE p.status = 'concluido'
          AND ip.endereco IS NOT NULL AND ip.endereco != ''
          AND ${diaSep('p')} >= $1
          AND ${diaSep('p')} <= $2
          AND s.status = 'ativo' ${turnoFiltro}
      ) sq
      WHERE rua IS NOT NULL
      GROUP BY rua, nome
      ORDER BY itens DESC
    `, params);

    const porColabDia = await db.all(`
      SELECT
        data, colaborador, turno,
        COUNT(DISTINCT pedido_id)::int                        AS pedidos,
        SUM(itens)::int                                       AS itens,
        COUNT(DISTINCT CASE WHEN codigo IS NOT NULL AND codigo!='' THEN codigo END)::int AS skus,
        COUNT(DISTINCT rua)::int                              AS ruas,
        ROUND(AVG(duracao_min)::numeric, 1)                  AS tempo_medio
      FROM (
        SELECT
          p.id                                                                          AS pedido_id,
          ${diaSep('p')} AS data,
          COALESCE(u.nome, s.nome)                                                     AS colaborador,
          REPLACE(COALESCE(u.turno, s.turno, 'Manha'), 'Ã£', 'a')                    AS turno,
          ip.quantidade                                                                AS itens,
          ip.codigo,
          CASE WHEN ip.endereco IS NOT NULL AND ip.endereco != ''
               THEN UPPER((regexp_match(split_part(ip.endereco,'/',1),'^([A-Za-z]+)[0-9]'))[1])
               ELSE NULL END                                                            AS rua,
          CASE WHEN NULLIF(p.iniciado_em,'') IS NOT NULL
               THEN GREATEST(0, EXTRACT(EPOCH FROM (
                 COALESCE(NULLIF(p.skus_concluido_em,''), NULLIF(p.concluido_em,''))::timestamp
                 - p.iniciado_em::timestamp
               )) / 60.0 - COALESCE(p.tempo_aguardando_min, 0))
               ELSE NULL END                                                           AS duracao_min
        FROM pedidos p
        JOIN separadores s ON s.id = p.separador_id
        LEFT JOIN usuarios u ON u.id = s.usuario_id
        JOIN itens_pedido ip ON ip.pedido_id = p.id
        WHERE p.status = 'concluido'
          AND ${diaSep('p')} >= $1
          AND ${diaSep('p')} <= $2
          AND s.status = 'ativo' ${turnoFiltro}
      ) sub
      GROUP BY data, colaborador, turno
      ORDER BY data, colaborador
    `, params);

    // ── Checkout — resumo do período (turno filtrado via o pedido, checkout não tem turno próprio) ──
    const checkoutRows = await db.all(`
      SELECT
        NULLIF(ck.operador_nome,'') AS nome,
        COUNT(*) FILTER (WHERE ck.status='concluido')::int AS concluidos,
        COUNT(*) FILTER (WHERE ck.status!='concluido')::int AS pendentes,
        COALESCE(SUM(COALESCE(NULLIF(p2.total_itens,0), p2.itens, 0)) FILTER (WHERE ck.status='concluido'), 0)::int AS itens,
        ROUND(AVG(CASE WHEN ck.status='concluido'
            AND NULLIF(ck.hora_criacao,'') IS NOT NULL AND NULLIF(ck.hora_checkout,'') IS NOT NULL
          THEN ${minDia("EXTRACT(EPOCH FROM ((ck.data_checkout||' '||ck.hora_checkout)::timestamp - (ck.data_checkout||' '||ck.hora_criacao)::timestamp)) / 60.0")} END)::numeric, 1) AS tempo_medio_min
      FROM checkout ck
      JOIN pedidos p2 ON p2.id = ck.pedido_id
      LEFT JOIN separadores s2 ON s2.id = p2.separador_id
      LEFT JOIN usuarios u2 ON u2.id = s2.usuario_id
      WHERE ${diaCk('ck')} >= $1 AND ${diaCk('ck')} <= $2 ${turno ? `AND REPLACE(COALESCE(u2.turno, s2.turno, 'Manha'), 'Ã£', 'a') = $3` : ''}
      GROUP BY NULLIF(ck.operador_nome,'')
    `, params);

    // ── Embalagem — resumo do período (timestamps ficam na própria tabela pedidos) ──
    const embalagemRows = await db.all(`
      SELECT
        NULLIF(p3.embalado_por,'') AS nome,
        COUNT(*) FILTER (WHERE p3.status_embalagem='embalado')::int AS concluidos,
        COUNT(*) FILTER (WHERE p3.status_embalagem!='embalado')::int AS pendentes,
        COALESCE(SUM(COALESCE(NULLIF(p3.total_itens,0), p3.itens, 0)) FILTER (WHERE p3.status_embalagem='embalado'), 0)::int AS itens,
        ROUND(AVG(CASE WHEN p3.status_embalagem='embalado'
            AND NULLIF(p3.embalagem_iniciado_em,'') IS NOT NULL AND NULLIF(p3.embalado_em,'') IS NOT NULL
          THEN ${minDia("EXTRACT(EPOCH FROM ((p3.data_pedido||' '||p3.embalado_em)::timestamp - (p3.data_pedido||' '||p3.embalagem_iniciado_em)::timestamp)) / 60.0")} END)::numeric, 1) AS tempo_medio_min
      FROM pedidos p3
      LEFT JOIN separadores s3 ON s3.id = p3.separador_id
      LEFT JOIN usuarios u3 ON u3.id = s3.usuario_id
      WHERE p3.status = 'concluido'
        AND ${diaSep('p3')} >= $1
        AND ${diaSep('p3')} <= $2
        ${turno ? `AND REPLACE(COALESCE(u3.turno, s3.turno, 'Manha'), 'Ã£', 'a') = $3` : ''}
      GROUP BY NULLIF(p3.embalado_por,'')
    `, params);

    // ── Reposição — por colaborador (repositor que resolveu cada tentativa) ──
    const reposicaoPorColabRows = await db.all(`
      SELECT
        t.value->>'repositor' AS nome,
        COUNT(*) FILTER (WHERE (t.value->>'resultado') IN ('encontrado','buscado','abastecido'))::int AS concluidos,
        COUNT(*) FILTER (WHERE (t.value->>'resultado') IN ('nao_encontrado','protocolo'))::int AS pendentes,
        ROUND(AVG(
          CASE WHEN (t.value->>'hora_inicio') IS NOT NULL AND (t.value->>'hora_inicio') != ''
           AND (t.value->>'hora_fim') IS NOT NULL AND (t.value->>'hora_fim') != ''
          THEN GREATEST(0, EXTRACT(EPOCH FROM (
            (ar.data_aviso || ' ' || (t.value->>'hora_fim'))::timestamp
            - (ar.data_aviso || ' ' || (t.value->>'hora_inicio'))::timestamp
          )) / 60.0) END
        )::numeric, 1) AS tempo_medio_min
      FROM avisos_repositor ar,
           jsonb_array_elements(COALESCE(ar.tentativas, '[]'::jsonb)) AS t(value)
      WHERE ${diaAvTent} >= $1 AND ${diaAvTent} <= $2
        AND (t.value->>'repositor') IS NOT NULL AND (t.value->>'repositor') != ''
      GROUP BY t.value->>'repositor'
    `, [ini, fim]);

    // ── Reposição — tempo médio de resolução (do avisos ao repositor resolver) ──
    const reposicaoTiming = await db.get(`
      SELECT
        ROUND(AVG(GREATEST(0, EXTRACT(EPOCH FROM (
          (ar.data_aviso || ' ' || (t.value->>'hora_fim'))::timestamp
          - (ar.data_aviso || ' ' || (t.value->>'hora_inicio'))::timestamp
        )) / 60.0))::numeric, 1) AS tempo_medio_min
      FROM avisos_repositor ar
      JOIN pedidos p4 ON p4.id = ar.pedido_id
      LEFT JOIN separadores s4 ON s4.id = p4.separador_id
      LEFT JOIN usuarios u4 ON u4.id = s4.usuario_id,
      jsonb_array_elements(COALESCE(ar.tentativas, '[]'::jsonb)) AS t(value)
      WHERE ${diaAvTent} >= $1 AND ${diaAvTent} <= $2
        AND (t.value->>'hora_inicio') IS NOT NULL AND (t.value->>'hora_inicio') != ''
        AND (t.value->>'hora_fim')    IS NOT NULL AND (t.value->>'hora_fim')    != ''
        ${turno ? `AND REPLACE(COALESCE(u4.turno, s4.turno, 'Manha'), 'Ã£', 'a') = $3` : ''}
    `, params);

    // ── Separação — total de SKUs distintos no período (evita somar duplicado por colaborador) ──
    const skusTotal = await db.get(`
      SELECT COUNT(DISTINCT ip.codigo) FILTER (WHERE ip.codigo IS NOT NULL AND ip.codigo != '')::int AS total_skus
      FROM pedidos p5
      JOIN separadores s5 ON s5.id = p5.separador_id
      LEFT JOIN usuarios u5 ON u5.id = s5.usuario_id
      JOIN itens_pedido ip ON ip.pedido_id = p5.id
      WHERE p5.status = 'concluido'
        AND ${diaSep('p5')} >= $1
        AND ${diaSep('p5')} <= $2
        AND s5.status = 'ativo'
        ${turno ? `AND REPLACE(COALESCE(u5.turno, s5.turno, 'Manha'), 'Ã£', 'a') = $3` : ''}
    `, params);

    const resumirSetor = (rows: any) => {
      const concluidos = rows.reduce((s: any,r: any) => s + (r.concluidos||0), 0);
      const pendentes  = rows.reduce((s: any,r: any) => s + (r.pendentes||0), 0);
      const itens      = rows.reduce((s: any,r: any) => s + (r.itens||0), 0);
      const comTempo   = rows.filter((r: any) => r.tempo_medio_min != null).map((r: any) => ({ ...r, tempo_medio_min: parseFloat(r.tempo_medio_min) }));
      const tempoMedio = comTempo.length ? Math.round(comTempo.reduce((s: any,r: any) => s+r.tempo_medio_min, 0) / comTempo.length * 10) / 10 : null;
      const maisRapido = comTempo.length ? comTempo.reduce((a: any,b: any) => a.tempo_medio_min < b.tempo_medio_min ? a : b) : null;
      const maisLento  = comTempo.length ? comTempo.reduce((a: any,b: any) => a.tempo_medio_min > b.tempo_medio_min ? a : b) : null;
      return {
        colaboradores: rows.length, concluidos, pendentes, itens, tempo_medio_min: tempoMedio,
        mais_rapido: maisRapido ? { nome: maisRapido.nome, tempo_medio_min: maisRapido.tempo_medio_min } : null,
        mais_lento:  maisLento  ? { nome: maisLento.nome,  tempo_medio_min: maisLento.tempo_medio_min }  : null,
      };
    };

    const mapColab = (rows: any) => rows
      .filter((r: any) => r.nome)
      .map((r: any) => ({
        nome: r.nome, concluidos: r.concluidos, pendentes: r.pendentes, itens: r.itens ?? null,
        tempo_medio_min: r.tempo_medio_min != null ? parseFloat(r.tempo_medio_min) : null,
      }))
      .sort((a: any,b: any) => b.concluidos - a.concluidos);

    res.json({
      colaboradores: resultado, por_dia: porDia, ruas: ruasRaw, por_colab_dia: porColabDia,
      total_skus: parseInt(skusTotal?.total_skus || 0),
      checkout:  resumirSetor(checkoutRows),
      embalagem: resumirSetor(embalagemRows),
      reposicao: { tempo_medio_min: reposicaoTiming?.tempo_medio_min != null ? parseFloat(reposicaoTiming.tempo_medio_min) : null },
      checkout_colaboradores:  mapColab(checkoutRows),
      embalagem_colaboradores: mapColab(embalagemRows),
      reposicao_colaboradores: mapColab(reposicaoPorColabRows),
    });
  } catch(e) {
    console.error('performance/separadores:', e.message);
    res.status(500).json({ erro: e.message });
  }
});

module.exports = router;
