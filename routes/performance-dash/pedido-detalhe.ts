import express from 'express';
const router = express.Router();
import { db } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';
import { calcularEtapasCheckout } from '../../lib/checkout-etapas';
import type { Linha } from '../../types/db';
import { minDia } from './_comum';

/* ── GET /performance/pedido/:numero — rastreia um pedido em todas as etapas ── */
router.get('/performance/pedido/:numero', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  const { numero } = req.params;
  try {
    const sep = await db.get(`
      SELECT
        p.numero_pedido,
        p.cliente,
        p.transportadora,
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
          THEN GREATEST(0, ROUND(EXTRACT(EPOCH FROM (
            (ar.data_aviso || ' ' || (t.value->>'hora_fim'))::timestamp
            - (ar.data_aviso || ' ' || (t.value->>'hora_inicio'))::timestamp
          )) / 60.0, 1))::float
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
        c.id AS checkout_id,
        c.numero_pedido,
        COALESCE(NULLIF(c.operador_nome,''), 'Operador') AS colaborador,
        c.data_checkout AS data,
        c.hora_criacao  AS iniciado_em,
        c.hora_checkout AS concluido_em,
        COALESCE(NULLIF(p.total_itens,0), p.itens, 0)   AS total_itens,
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
      WHERE c.numero_pedido = $1 AND c.status = 'concluido'
      ORDER BY c.id DESC LIMIT 1
    `, [numero]);

    const emb = await db.get(`
      SELECT
        p.numero_pedido,
        NULLIF(p.embalado_por,'') AS colaborador,
        COALESCE(
          (SELECT eb.data_embalagem FROM embalagem eb WHERE eb.pedido_id = p.id ORDER BY eb.id DESC LIMIT 1),
          p.data_pedido
        ) AS data,
        p.embalagem_iniciado_em    AS iniciado_em,
        p.embalado_em              AS concluido_em,
        COALESCE(NULLIF(p.total_itens,0), p.itens, 0) AS total_itens,
        (SELECT COUNT(DISTINCT ip.codigo) FROM itens_pedido ip
          WHERE ip.pedido_id=p.id AND ip.codigo IS NOT NULL AND ip.codigo != '')::int AS skus,
        CASE
          WHEN NULLIF(p.embalagem_iniciado_em,'') IS NOT NULL AND NULLIF(p.embalado_em,'') IS NOT NULL
          THEN ROUND(${minDia("EXTRACT(EPOCH FROM ((COALESCE((SELECT eb.data_embalagem FROM embalagem eb WHERE eb.pedido_id = p.id ORDER BY eb.id DESC LIMIT 1), p.data_pedido) || ' ' || p.embalado_em)::timestamp - (COALESCE((SELECT eb.data_embalagem FROM embalagem eb WHERE eb.pedido_id = p.id ORDER BY eb.id DESC LIMIT 1), p.data_pedido) || ' ' || p.embalagem_iniciado_em)::timestamp)) / 60.0")}, 1)::float
          ELSE NULL
        END AS duracao_min
      FROM pedidos p WHERE p.numero_pedido = $1
    `, [numero]);

    // hora_verificado ordena pela sequência real de conferência (usado pra
    // reconstruir o caminho do separador no mapa do estoque) — itens ainda
    // não conferidos (hora_verificado vazio) ficam por último, na ordem
    // original de cadastro.
    const itens = await db.all(`
      SELECT i.codigo, i.descricao, i.quantidade, i.endereco, i.hora_verificado
      FROM itens_pedido i
      JOIN pedidos p ON p.id = i.pedido_id
      WHERE p.numero_pedido = $1
      ORDER BY NULLIF(i.hora_verificado,'') ASC NULLS LAST, i.id ASC
    `, [numero]);

    const itensComProblema = await db.all(`
      SELECT cic.item_codigo AS codigo, cic.item_descricao AS descricao,
             cic.separador_nome, cic.operador_nome, cic.data, cic.hora
      FROM checkout_itens_conferencia cic
      JOIN pedidos p ON p.id = cic.pedido_id
      WHERE p.numero_pedido = $1
      ORDER BY cic.id ASC
    `, [numero]);

    // Avisos de reposição do pedido — inclusive os que ninguém atendeu (sem
    // tentativas, portanto invisíveis na lista de reposições acima).
    const avisosReposicao = await db.all(`
      SELECT ar.id, ar.codigo, ar.descricao, ar.status, ar.data_aviso, ar.hora_aviso,
             ar.hora_reposto, NULLIF(ar.repositor_nome,'') AS repositor, ar.separador_nome
      FROM avisos_repositor ar
      WHERE ar.numero_pedido = $1
      ORDER BY ar.id ASC
    `, [numero]);

    // Quebra do tempo do checkout em fila / espera do item / trabalho
    let checkoutEtapas = null;
    if (ck?.checkout_id) {
      const sessoes = await db.all<Pick<Linha<'checkout_sessoes'>, 'hora_inicio' | 'hora_fim' | 'acao' | 'tempo_min'>>(
        `SELECT hora_inicio, hora_fim, acao, tempo_min FROM checkout_sessoes WHERE checkout_id=$1 ORDER BY id ASC`,
        [ck.checkout_id]
      );
      checkoutEtapas = calcularEtapasCheckout({
        horaFila: sep.concluido_em,
        horaCriacao: ck.iniciado_em,
        horaCheckout: ck.concluido_em,
        sessoes: sessoes || [],
      });
    }

    res.json({ numero_pedido: numero, separacao: sep, reposicoes: reposicoes || [], avisos_reposicao: avisosReposicao || [], checkout: ck || null, checkout_etapas: checkoutEtapas, embalagem: emb || null, itens: itens || [], itens_com_problema: itensComProblema || [] });
  } catch(e) {
    console.error('performance/pedido:', e.message);
    res.status(500).json({ erro: e.message });
  }
});

module.exports = router;
