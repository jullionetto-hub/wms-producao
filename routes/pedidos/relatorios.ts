import express from 'express';
const router = express.Router();
import { db } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';

// Alias retrocompatível — frontend antigo usava /importar
router.post('/importar', requerAuth, requerPerfil('supervisor'), (req,res) => {
  res.redirect(307, '/pedidos/importar');
});

/* ══════════════════════════════════════════
   RELATÓRIO: TEMPO REAL DE SEPARAÇÃO
   Desconsidera o tempo aguardando repositor.
══════════════════════════════════════════ */
router.get('/pedidos/relatorio/tempo-separacao', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {data_ini, data_fim, separador_id} = req.query as Record<string, string>;
  try {
    let w = `p.status='concluido' AND p.iniciado_em IS NOT NULL AND p.iniciado_em!=''`;
    const params = [];
    if (data_ini) { params.push(data_ini); w += ` AND p.data_pedido>=$${params.length}`; }
    if (data_fim)  { params.push(data_fim);  w += ` AND p.data_pedido<=$${params.length}`; }
    if (separador_id) { params.push(parseInt(separador_id)); w += ` AND s.usuario_id=$${params.length}`; }

    const rows = await db.all(`
      SELECT
        p.numero_pedido,
        COALESCE(u.nome, s.nome, '—') AS separador_nome,
        p.data_pedido,
        p.iniciado_em,
        p.skus_concluido_em,
        COALESCE(NULLIF(p.concluido_em,''),
          CASE WHEN ck.data_checkout IS NOT NULL AND ck.hora_criacao IS NOT NULL
               THEN ck.data_checkout||'T'||ck.hora_criacao ELSE NULL END
        ) AS concluido_em,
        p.itens AS total_itens,
        p.cliente,
        p.transportadora,
        -- Tempo real do separador: usa skus_concluido_em (quando terminou de escanear)
        -- Pedidos sem falta: skus_concluido_em = concluido_em (mesmo momento)
        -- Pedidos com falta: skus_concluido_em = momento que tentou concluir pela 1ª vez
        CASE WHEN NULLIF(p.iniciado_em,'') IS NOT NULL
                  AND NULLIF(COALESCE(NULLIF(p.skus_concluido_em,''), NULLIF(p.concluido_em,'')), '') IS NOT NULL
          THEN ROUND(EXTRACT(EPOCH FROM (
            COALESCE(NULLIF(p.skus_concluido_em,''), NULLIF(p.concluido_em,''))::timestamp
            - p.iniciado_em::timestamp
          ))/60.0, 1)
          ELSE NULL
        END AS tempo_real_min,
        -- Tempo total bruto (iniciado → concluido, inclui espera repositor)
        CASE WHEN NULLIF(p.iniciado_em,'') IS NOT NULL
                  AND COALESCE(NULLIF(p.concluido_em,''),
                        CASE WHEN ck.data_checkout IS NOT NULL AND ck.hora_criacao IS NOT NULL
                             THEN ck.data_checkout||'T'||ck.hora_criacao ELSE NULL END) IS NOT NULL
          THEN ROUND(EXTRACT(EPOCH FROM (
            COALESCE(NULLIF(p.concluido_em,''), ck.data_checkout||'T'||ck.hora_criacao)::timestamp
            - p.iniciado_em::timestamp
          ))/60.0, 1)
          ELSE NULL
        END AS tempo_total_min,
        -- Contagem de reposições e não encontrados
        (SELECT COUNT(*) FROM avisos_repositor a WHERE a.pedido_id=p.id) AS qtd_reposicoes,
        (SELECT COUNT(*) FROM avisos_repositor a WHERE a.pedido_id=p.id AND a.status='nao_encontrado') AS qtd_nao_encontrados,
        -- Itens ainda em falta (separador marcou falta mas repositor ainda nao resolveu)
        (SELECT COUNT(*)::int FROM itens_pedido ip WHERE ip.pedido_id=p.id AND ip.status IN ('falta','parcial')) AS itens_em_falta
      FROM pedidos p
      LEFT JOIN separadores s ON s.id=p.separador_id
      LEFT JOIN usuarios u ON u.id=s.usuario_id
      LEFT JOIN LATERAL (SELECT * FROM checkout WHERE pedido_id=p.id ORDER BY id DESC LIMIT 1) ck ON true
      WHERE ${w}
      ORDER BY p.data_pedido DESC, p.iniciado_em DESC
      LIMIT 1000
    `, params);

    // tempo_espera_min = tempo_total - tempo_real (quanto ficou esperando repositor)
    const result = rows.map(r => {
      const real  = r.tempo_real_min  !== null ? parseFloat(r.tempo_real_min)  : null;
      const total = r.tempo_total_min !== null ? parseFloat(r.tempo_total_min) : null;
      const espera = (total !== null && real !== null) ? Math.max(0, total - real) : 0;
      return { ...r, tempo_espera_min: Math.round(espera * 10) / 10 };
    });

    res.json(result);
  } catch(e) { res.status(500).json({erro: e.message}); }
});

module.exports = router;
