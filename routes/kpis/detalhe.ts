import express from 'express';
const router = express.Router();
import { db } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';
import { dataHoraLocal } from '../../lib/helpers';

/* ─── DETALHE POR PEDIDO (Performance) ─────────────────────────────── */
router.get('/stats/performance/detalhe', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  const { ini, fim, colaborador: filtColab, perfil: filtPerfil } = req.query as Record<string, string>;
  const { data: hoje } = dataHoraLocal();
  const dataIni = ini || hoje;
  const dataFim = fim || hoje;

  try {
    const resultado: Record<string, any> = {};

    /* ── Separadores: pedido a pedido ── */
    if (!filtPerfil || filtPerfil === 'separador') {
      let w = `p.status='concluido' AND p.data_pedido>=$1 AND p.data_pedido<=$2`;
      const params = [dataIni, dataFim];
      if (filtColab) { params.push(filtColab); w += ` AND COALESCE(u.nome, s.nome)=$${params.length}`; }

      const pedidos = await db.all(`
        SELECT
          COALESCE(u.nome, s.nome, '—') AS separador_nome,
          p.numero_pedido, p.data_pedido, p.iniciado_em,
          p.skus_concluido_em,
          COALESCE(
            NULLIF(p.concluido_em,''),
            CASE WHEN ck.data_checkout IS NOT NULL AND ck.hora_criacao IS NOT NULL
                 THEN ck.data_checkout||'T'||ck.hora_criacao ELSE NULL END
          ) AS concluido_em,
          p.itens AS qtd_produtos,
          (SELECT COALESCE(SUM(ip.quantidade), p.itens) FROM itens_pedido ip WHERE ip.pedido_id=p.id) AS total_itens,
          p.pontuacao,
          -- Tempo REAL do separador: usa skus_concluido_em (quando ele terminou de escanear).
          -- Para pedidos sem falta, skus_concluido_em = concluido_em (mesmo momento).
          -- Para pedidos com falta, skus_concluido_em = 1ª tentativa de concluir (antes de esperar repositor).
          CASE WHEN NULLIF(p.iniciado_em,'') IS NOT NULL
                    AND NULLIF(COALESCE(NULLIF(p.skus_concluido_em,''), NULLIF(p.concluido_em,'')), '') IS NOT NULL
            THEN ROUND(EXTRACT(EPOCH FROM (
              COALESCE(NULLIF(p.skus_concluido_em,''), NULLIF(p.concluido_em,''))::timestamp
              - p.iniciado_em::timestamp
            ))/60.0, 1)
            ELSE NULL
          END AS tempo_real_min,
          -- Tempo total bruto (inclui espera pelo repositor)
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
          (SELECT COUNT(*) FROM avisos_repositor a WHERE a.pedido_id=p.id) AS qtd_reposicoes,
          CASE WHEN ck.hora_criacao IS NOT NULL AND ck.hora_criacao!='' AND ck.hora_checkout IS NOT NULL AND ck.hora_checkout!=''
            THEN GREATEST(0, ROUND(CASE WHEN EXTRACT(EPOCH FROM (ck.hora_checkout::time - ck.hora_criacao::time)) < 0 THEN EXTRACT(EPOCH FROM (ck.hora_checkout::time - ck.hora_criacao::time))/60.0 + 1440 ELSE EXTRACT(EPOCH FROM (ck.hora_checkout::time - ck.hora_criacao::time))/60.0 END)::int)
            ELSE NULL END AS tempo_checkout_min,
          (SELECT em.embalado_em FROM embalagem em WHERE em.pedido_id=p.id ORDER BY em.id DESC LIMIT 1) AS emb_horario,
          (SELECT em.embalado_por FROM embalagem em WHERE em.pedido_id=p.id ORDER BY em.id DESC LIMIT 1) AS emb_operador
        FROM pedidos p
        LEFT JOIN separadores s ON s.id = p.separador_id
        LEFT JOIN usuarios u    ON u.id = s.usuario_id
        LEFT JOIN LATERAL (SELECT * FROM checkout WHERE pedido_id=p.id ORDER BY id DESC LIMIT 1) ck ON true
        WHERE ${w}
        ORDER BY COALESCE(u.nome, s.nome), p.data_pedido, NULLIF(p.iniciado_em,'')
        LIMIT 3000
      `, params);

      pedidos.forEach(p => {
        const key = p.separador_nome;
        if (!resultado[key]) resultado[key] = { nome: key, perfil: 'separador', pedidos: [] };
        const tempoReal  = p.tempo_real_min  !== null ? parseFloat(p.tempo_real_min)  : null;
        const tempoTotal = p.tempo_total_min !== null ? parseFloat(p.tempo_total_min) : null;
        const tempoEspera = (tempoTotal !== null && tempoReal !== null)
          ? Math.max(0, tempoTotal - tempoReal) : 0;
        resultado[key].pedidos.push({
          numero_pedido:    p.numero_pedido,
          data_pedido:      p.data_pedido,
          iniciado_em:      p.iniciado_em,
          concluido_em:     p.concluido_em,
          skus_concluido_em: p.skus_concluido_em,
          total_itens:      parseInt(p.total_itens) || 0,
          qtd_produtos:     parseInt(p.qtd_produtos) || 0,
          pontuacao:        parseInt(p.pontuacao) || 0,
          tempo_real_min:   tempoReal  !== null ? Math.round(tempoReal  * 10) / 10 : null,
          tempo_total_min:  tempoTotal !== null ? Math.round(tempoTotal * 10) / 10 : null,
          tempo_espera_min: Math.round(tempoEspera * 10) / 10,
          qtd_reposicoes:   parseInt(p.qtd_reposicoes) || 0,
        });
      });
    }

    /* ── Checkout: pedido a pedido ── */
    if (!filtPerfil || filtPerfil === 'checkout') {
      let w = `c.status='concluido' AND c.data_checkout>=$1 AND c.data_checkout<=$2`;
      const params = [dataIni, dataFim];
      if (filtColab) { params.push(filtColab); w += ` AND c.operador_nome=$${params.length}`; }

      const ckList = await db.all(`
        SELECT c.operador_nome, c.numero_pedido, c.data_checkout,
          c.hora_criacao, c.hora_checkout,
          NULLIF(p.concluido_em,'') AS sep_concluido_em,
          p.itens AS qtd_produtos,
          (SELECT COALESCE(SUM(ip.quantidade), p.itens) FROM itens_pedido ip WHERE ip.pedido_id=p.id) AS total_itens,
          CASE WHEN c.hora_criacao IS NOT NULL AND c.hora_criacao!=''
                    AND c.hora_checkout IS NOT NULL AND c.hora_checkout!=''
            THEN GREATEST(0,
              ROUND(CASE WHEN EXTRACT(EPOCH FROM (c.hora_checkout::time - c.hora_criacao::time)) < 0 THEN EXTRACT(EPOCH FROM (c.hora_checkout::time - c.hora_criacao::time))/60.0 + 1440 ELSE EXTRACT(EPOCH FROM (c.hora_checkout::time - c.hora_criacao::time))/60.0 END)::int
            )
            ELSE NULL END AS tempo_checkout_min
        FROM checkout c
        LEFT JOIN pedidos p ON c.pedido_id = p.id
        WHERE ${w} AND c.operador_nome IS NOT NULL AND c.operador_nome!=''
        ORDER BY c.operador_nome, c.data_checkout, c.hora_checkout
        LIMIT 3000
      `, params);

      ckList.forEach(c => {
        const key = `${c.operador_nome}:checkout`;
        if (!resultado[key]) resultado[key] = { nome: c.operador_nome, perfil: 'checkout', pedidos: [] };
        // Extrair hora da separação concluída (ex: "2026-05-26T07:29" → "07:29")
        const sepHora = c.sep_concluido_em
          ? (c.sep_concluido_em.includes('T') ? c.sep_concluido_em.split('T')[1].slice(0,5) : c.sep_concluido_em.slice(0,5))
          : null;
        resultado[key].pedidos.push({
          numero_pedido:      c.numero_pedido,
          data_pedido:        c.data_checkout,
          hora_fila:          sepHora,
          hora_abertura:      c.hora_criacao  ? c.hora_criacao.slice(0,5)  : null,
          hora_confirmacao:   c.hora_checkout ? c.hora_checkout.slice(0,5) : null,
          tempo_checkout_min: c.tempo_checkout_min !== null ? parseInt(c.tempo_checkout_min) : null,
          total_itens:        parseInt(c.total_itens) || 0,
          qtd_produtos:       parseInt(c.qtd_produtos) || 0,
        });
      });
    }

    /* ── Embalagem: pedido a pedido ── */
    if (!filtPerfil || filtPerfil === 'embalador') {
      const params = [dataIni, dataFim];
      let w = `e.data_embalagem>=$1 AND e.data_embalagem<=$2 AND e.embalado_por IS NOT NULL AND e.embalado_por!=''`;
      if (filtColab) { params.push(filtColab); w += ` AND e.embalado_por=$${params.length}`; }

      const embList = await db.all(`
        SELECT e.embalado_por, e.numero_pedido, e.data_embalagem, e.embalado_em,
               e.embalagem_inicio,
               e.cliente, e.transportadora,
               ck.hora_checkout AS ck_hora_checkout,
               p.itens AS qtd_produtos,
               (SELECT COALESCE(SUM(ip.quantidade), p.itens) FROM itens_pedido ip WHERE ip.pedido_id=p.id) AS total_itens,
               CASE WHEN e.embalagem_inicio IS NOT NULL AND e.embalagem_inicio!=''
                         AND e.embalado_em IS NOT NULL AND e.embalado_em!=''
                 THEN GREATEST(0,
                   ROUND(EXTRACT(EPOCH FROM (e.embalado_em::time - e.embalagem_inicio::time))/60.0)::int
                 )
                 ELSE NULL END AS tempo_embalagem_min
        FROM embalagem e
        LEFT JOIN pedidos p ON e.pedido_id = p.id
        LEFT JOIN checkout ck ON ck.pedido_id = e.pedido_id AND ck.status = 'concluido'
        WHERE ${w}
        ORDER BY e.embalado_por, e.data_embalagem, e.embalado_em
        LIMIT 3000`, params);

      embList.forEach(e => {
        const key = `${e.embalado_por}:embalador`;
        if (!resultado[key]) resultado[key] = { nome: e.embalado_por, perfil: 'embalador', pedidos: [] };
        resultado[key].pedidos.push({
          numero_pedido:       e.numero_pedido,
          data_pedido:         e.data_embalagem,
          hora_fila:           e.ck_hora_checkout  ? e.ck_hora_checkout.slice(0,5)  : null,
          embalagem_inicio:    e.embalagem_inicio  ? e.embalagem_inicio.slice(0,5)  : null,
          embalado_em:         e.embalado_em       ? e.embalado_em.slice(0,5)       : null,
          tempo_embalagem_min: e.tempo_embalagem_min !== null ? parseInt(e.tempo_embalagem_min) : null,
          cliente:             e.cliente || '—',
          transportadora:      e.transportadora || '—',
          total_itens:         parseInt(e.total_itens) || parseInt(e.qtd_produtos) || 0,
          qtd_produtos:        parseInt(e.qtd_produtos) || 0,
        });
      });
    }

    /* ── Reposição: por tentativa individual ── */
    if (!filtPerfil || filtPerfil === 'repositor') {
      const repParams = [dataIni, dataFim];
      const repW = `a.data_aviso>=$1 AND a.data_aviso<=$2
        AND (a.total_tentativas > 0 OR (a.repositor_nome IS NOT NULL AND a.repositor_nome!=''))`;

      const repList = await db.all(`
        SELECT a.numero_pedido, a.data_aviso, a.hora_aviso, a.hora_reposto,
               a.codigo, a.descricao, a.quantidade, a.status, a.situacao, a.obs,
               a.repositor_nome, a.tentativas, a.total_tentativas
        FROM avisos_repositor a
        WHERE ${repW}
        ORDER BY a.data_aviso, a.hora_aviso
        LIMIT 3000`, repParams);

      // Helper: calcula minutos entre dois HH:MM
      const diffMin = (ini: any, fim: any) => {
        if (!ini || !fim) return null;
        const [hi, mi] = ini.split(':').map(Number);
        const [hf, mf] = fim.split(':').map(Number);
        return Math.max(0, (hf * 60 + mf) - (hi * 60 + mi));
      };

      repList.forEach(a => {
        let tentativas = [];
        try { tentativas = Array.isArray(a.tentativas) ? a.tentativas : (a.tentativas ? JSON.parse(a.tentativas) : []); } catch{}

        if (tentativas.length > 0) {
          // Novo sistema — uma linha por tentativa, tempo individual de cada repositor
          tentativas.forEach((t: any) => {
            const rep = t.repositor;
            if (!rep) return;
            if (filtColab && rep !== filtColab) return;
            const key = `${rep}:repositor`;
            if (!resultado[key]) resultado[key] = { nome: rep, perfil: 'repositor', pedidos: [] };
            const tentLabel = ['','1ª','2ª','3ª'][t.numero] || `${t.numero}ª`;
            resultado[key].pedidos.push({
              numero_pedido:       a.numero_pedido,
              data_pedido:         a.data_aviso,
              hora_aviso:          a.hora_aviso,
              hora_inicio_busca:   t.hora_inicio || null,
              hora_fim_busca:      t.hora_fim    || null,
              numero_tentativa:    tentLabel,
              resultado_tentativa: t.resultado,   // 'encontrado' | 'nao_encontrado' | null
              codigo:              a.codigo,
              descricao:           a.descricao,
              quantidade:          a.quantidade,
              status:              a.situacao || a.status,
              obs:                 a.obs,
              tempo_resolucao_min: diffMin(t.hora_inicio, t.hora_fim),
            });
          });
        } else {
          // Legado (sem tentativas): mantém comportamento anterior
          const rep = a.repositor_nome;
          if (!rep) return;
          if (filtColab && rep !== filtColab) return;
          const key = `${rep}:repositor`;
          if (!resultado[key]) resultado[key] = { nome: rep, perfil: 'repositor', pedidos: [] };
          const stFinal = a.situacao || a.status;
          resultado[key].pedidos.push({
            numero_pedido:       a.numero_pedido,
            data_pedido:         a.data_aviso,
            hora_aviso:          a.hora_aviso,
            hora_inicio_busca:   a.hora_aviso   || null,
            hora_fim_busca:      a.hora_reposto || null,
            numero_tentativa:    '1ª',
            resultado_tentativa: ['nao_encontrado','protocolo','protocolado'].includes(stFinal) ? 'nao_encontrado' : 'encontrado',
            codigo:              a.codigo,
            descricao:           a.descricao,
            quantidade:          a.quantidade,
            status:              stFinal,
            obs:                 a.obs,
            tempo_resolucao_min: diffMin(a.hora_aviso, a.hora_reposto),
          });
        }
      });
    }

    res.json({ detalhe: Object.values(resultado) });
  } catch(e) {
    console.error('Erro detalhe performance:', e);
    res.status(500).json({ erro: e.message });
  }
});

module.exports = router;
