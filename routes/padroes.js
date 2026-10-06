'use strict';
const express = require('express');
const router  = express.Router();
const { db }  = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');

// ── Detecção de padrões por colaborador (Fase 1 — estatística, sem ML) ──────
// Cruza dados que o sistema já coleta (tempo de separação, avisos de falta,
// marcações desfeitas, ocorrências formais) e aponta ao supervisor onde vale
// investigar. Os sinais são indícios, não veredito — o sistema não distingue
// erro humano de produto fora de lugar, por exemplo.

function media(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function mediana(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const meio = Math.floor(s.length / 2);
  return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2;
}
function desvioPadrao(arr, m) {
  if (arr.length < 2) return 0;
  const variancia = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variancia);
}

const NIVEL_PESO = { critico: 3, atencao: 2, melhoria: 1, ok: 0 };

async function calcularPadroes({ ini, fim, turno }) {
  if (!ini || !fim) throw Object.assign(new Error('Informe ini e fim.'), { status: 400 });

  const turnoFiltroSep = turno ? ` AND REPLACE(COALESCE(u.turno, s.turno, 'Manha'), 'Ã£', 'a') = $3` : '';
  const params = turno ? [ini, fim, turno] : [ini, fim];

  const [tempoColab, porColabDia, desfeitos, itensVerificados, avisosRows, ocorrencias] = await Promise.all([
    // Tempo médio por pedido e turno de cada colaborador no período (separação)
    db.all(`
      SELECT COALESCE(u.nome, s.nome) AS nome,
             REPLACE(COALESCE(u.turno, s.turno, 'Manha'), 'Ã£', 'a') AS turno,
             COUNT(DISTINCT p.id)::int AS pedidos,
             ROUND(AVG(CASE WHEN NULLIF(p.iniciado_em,'') IS NOT NULL
               AND NULLIF(COALESCE(NULLIF(p.skus_concluido_em,''), NULLIF(p.concluido_em,'')), '') IS NOT NULL
               THEN GREATEST(0, EXTRACT(EPOCH FROM (
                 COALESCE(NULLIF(p.skus_concluido_em,''), NULLIF(p.concluido_em,''))::timestamp
                 - p.iniciado_em::timestamp
               )) / 60.0 - COALESCE(p.tempo_aguardando_min,0)) END)::numeric, 1) AS tempo_medio_min
      FROM pedidos p
      JOIN separadores s ON s.id = p.separador_id
      LEFT JOIN usuarios u ON u.id = s.usuario_id
      WHERE p.status = 'concluido'
        AND COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) >= $1
        AND COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) <= $2
        AND s.status = 'ativo' ${turnoFiltroSep}
      GROUP BY COALESCE(u.nome, s.nome), REPLACE(COALESCE(u.turno, s.turno, 'Manha'), 'Ã£', 'a')
    `, params),

    // Tempo médio por colaborador e por dia (usado para medir tendência no período)
    db.all(`
      SELECT data, colaborador, ROUND(AVG(duracao_min)::numeric, 1) AS tempo_medio
      FROM (
        SELECT
          COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) AS data,
          COALESCE(u.nome, s.nome) AS colaborador,
          CASE WHEN NULLIF(p.iniciado_em,'') IS NOT NULL
             AND NULLIF(COALESCE(NULLIF(p.skus_concluido_em,''), NULLIF(p.concluido_em,'')), '') IS NOT NULL
             THEN GREATEST(0, EXTRACT(EPOCH FROM (
               COALESCE(NULLIF(p.skus_concluido_em,''), NULLIF(p.concluido_em,''))::timestamp
               - p.iniciado_em::timestamp
             )) / 60.0 - COALESCE(p.tempo_aguardando_min,0)) END AS duracao_min
        FROM pedidos p
        JOIN separadores s ON s.id = p.separador_id
        LEFT JOIN usuarios u ON u.id = s.usuario_id
        WHERE p.status = 'concluido'
          AND COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) >= $1
          AND COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) <= $2
          AND s.status = 'ativo' ${turnoFiltroSep}
      ) sub
      WHERE duracao_min IS NOT NULL
      GROUP BY data, colaborador
      ORDER BY data
    `, params),

    // Marcações desfeitas (Falta/Parcial corrigido) no pedido de cada colaborador
    db.all(`
      SELECT COALESCE(u.nome, s.nome) AS nome, COUNT(*)::int AS desfeitos
      FROM auditoria a
      JOIN itens_pedido ip ON ip.id = a.entidade_id
      JOIN pedidos p ON p.id = ip.pedido_id
      JOIN separadores s ON s.id = p.separador_id
      LEFT JOIN usuarios u ON u.id = s.usuario_id
      WHERE a.acao = 'ITEM_DESFEITO' AND a.entidade = 'item'
        AND a.data >= $1 AND a.data <= $2
      GROUP BY COALESCE(u.nome, s.nome)
    `, [ini, fim]),

    // Total de itens verificados por colaborador — denominador das taxas abaixo
    db.all(`
      SELECT COALESCE(u.nome, s.nome) AS nome, COUNT(ip.id)::int AS itens_verificados
      FROM pedidos p
      JOIN separadores s ON s.id = p.separador_id
      LEFT JOIN usuarios u ON u.id = s.usuario_id
      JOIN itens_pedido ip ON ip.pedido_id = p.id
      WHERE p.status = 'concluido'
        AND COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) >= $1
        AND COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) <= $2
        AND s.status = 'ativo' ${turnoFiltroSep}
      GROUP BY COALESCE(u.nome, s.nome)
    `, params),

    // Avisos de falta gerados por colaborador, com histórico (p/ detectar Busca Final)
    db.all(`
      SELECT separador_nome AS nome, status, historico
      FROM avisos_repositor
      WHERE data_aviso >= $1 AND data_aviso <= $2
        AND separador_nome IS NOT NULL AND separador_nome != ''
    `, [ini, fim]),

    // Ocorrências formais registradas pelo supervisor
    db.all(`
      SELECT colaborador_nome AS nome, tipo, gravidade
      FROM ocorrencias
      WHERE data >= $1 AND data <= $2
    `, [ini, fim]),
  ]);

  const nomes = new Set([
    ...tempoColab.map(r => r.nome),
    ...desfeitos.map(r => r.nome),
    ...itensVerificados.map(r => r.nome),
    ...avisosRows.map(r => r.nome),
    ...ocorrencias.map(r => r.nome),
  ].filter(Boolean));

  const idxTempo        = Object.fromEntries(tempoColab.filter(r => r.nome).map(r => [r.nome, r]));
  const idxItensVerif   = Object.fromEntries(itensVerificados.filter(r => r.nome).map(r => [r.nome, r.itens_verificados]));
  const idxDesfeitos    = Object.fromEntries(desfeitos.filter(r => r.nome).map(r => [r.nome, r.desfeitos]));

  // ── Outlier de tempo — z-score dentro do mesmo turno ──
  const temposPorTurno = {};
  tempoColab.forEach(r => {
    if (r.tempo_medio_min == null) return;
    (temposPorTurno[r.turno] ||= []).push(parseFloat(r.tempo_medio_min));
  });
  const statsTurno = {};
  Object.entries(temposPorTurno).forEach(([t, arr]) => {
    const m = media(arr);
    statsTurno[t] = { media: m, desvio: desvioPadrao(arr, m) };
  });

  // ── Tendência — 1ª metade x 2ª metade dos dias do período ──
  const diasUnicos = [...new Set(porColabDia.map(r => r.data))].sort();
  const meio = diasUnicos[Math.floor(diasUnicos.length / 2)];
  const porColabFase = {};
  porColabDia.forEach(r => {
    if (r.tempo_medio == null || !r.colaborador) return;
    const fase = r.data < meio ? 'a' : 'b';
    (porColabFase[r.colaborador] ||= { a: [], b: [] })[fase].push(parseFloat(r.tempo_medio));
  });

  // ── Busca Final / falta por colaborador ──
  const buscaFinalPorColab = {};
  avisosRows.forEach(r => {
    if (!r.nome) return;
    const bf = (buscaFinalPorColab[r.nome] ||= { avisos: 0, buscaFinal: 0, encontrado: 0 });
    bf.avisos++;
    let hist = [];
    try { hist = Array.isArray(r.historico) ? r.historico : (r.historico ? JSON.parse(r.historico) : []); } catch {}
    const foiBuscaFinal = hist.some(h => h && h.acao === 'busca_final_iniciada');
    if (foiBuscaFinal) {
      bf.buscaFinal++;
      if (r.status === 'abastecido') bf.encontrado++;
    }
  });

  // ── Ocorrências por colaborador ──
  const ocorrPorColab = {};
  ocorrencias.forEach(o => {
    if (!o.nome) return;
    (ocorrPorColab[o.nome] ||= []).push(o);
  });

  // Taxas de referência da equipe (sinais 3 e 4) — usa mediana, não média: com
  // poucos colaboradores no período, o próprio outlier infla a média e
  // mascara o desvio dele em relação ao resto da equipe.
  const listaNomes = [...nomes];
  const taxaCorrecaoTime = mediana(listaNomes.map(n => {
    const d = idxDesfeitos[n] || 0, iv = idxItensVerif[n] || 0;
    return iv >= 20 ? (d / iv) * 100 : null;
  }).filter(v => v != null)) || 0;
  const taxaFaltaTime = mediana(listaNomes.map(n => {
    const b = buscaFinalPorColab[n], iv = idxItensVerif[n] || 0;
    return (b && iv >= 20) ? (b.avisos / iv) * 100 : null;
  }).filter(v => v != null)) || 0;

  const colaboradores = listaNomes.sort().map(nome => {
    const sinais = [];
    const t = idxTempo[nome];

    // 1) Outlier de tempo
    if (t && t.tempo_medio_min != null) {
      const st = statsTurno[t.turno];
      const valor = parseFloat(t.tempo_medio_min);
      if (st && st.desvio > 0.5) {
        const z = (valor - st.media) / st.desvio;
        if (z >= 2.5) {
          sinais.push({ tipo: 'tempo_outlier', nivel: 'critico',
            texto: `Tempo médio de ${valor} min/pedido — bem acima da equipe do turno (média ${st.media.toFixed(1)} min).`,
            valor: { tempo_medio_min: valor, media_turno: Math.round(st.media * 10) / 10, z: Math.round(z * 10) / 10 } });
        } else if (z >= 1.5) {
          sinais.push({ tipo: 'tempo_outlier', nivel: 'atencao',
            texto: `Tempo médio de ${valor} min/pedido, acima da média do turno (${st.media.toFixed(1)} min).`,
            valor: { tempo_medio_min: valor, media_turno: Math.round(st.media * 10) / 10, z: Math.round(z * 10) / 10 } });
        } else if (z <= -2) {
          sinais.push({ tipo: 'tempo_outlier', nivel: 'atencao',
            texto: `Tempo médio bem abaixo da equipe (${valor} min x ${st.media.toFixed(1)} min) — vale confirmar se a conferência está sendo feita com atenção.`,
            valor: { tempo_medio_min: valor, media_turno: Math.round(st.media * 10) / 10, z: Math.round(z * 10) / 10 } });
        }
      }
    }

    // 2) Tendência
    const fase = porColabFase[nome];
    if (fase && fase.a.length >= 2 && fase.b.length >= 2) {
      const ma = media(fase.a), mb = media(fase.b);
      if (ma > 0) {
        const variacao = ((mb - ma) / ma) * 100;
        if (variacao >= 40) {
          sinais.push({ tipo: 'tendencia', nivel: 'critico',
            texto: `Tempo médio subiu ${variacao.toFixed(0)}% entre a 1ª e a 2ª metade do período (${ma.toFixed(1)} → ${mb.toFixed(1)} min).`,
            valor: { variacao_pct: Math.round(variacao) } });
        } else if (variacao >= 20) {
          sinais.push({ tipo: 'tendencia', nivel: 'atencao',
            texto: `Tempo médio subiu ${variacao.toFixed(0)}% no período (${ma.toFixed(1)} → ${mb.toFixed(1)} min).`,
            valor: { variacao_pct: Math.round(variacao) } });
        } else if (variacao <= -20) {
          sinais.push({ tipo: 'tendencia', nivel: 'melhoria',
            texto: `Tempo médio melhorou ${Math.abs(variacao).toFixed(0)}% no período (${ma.toFixed(1)} → ${mb.toFixed(1)} min).`,
            valor: { variacao_pct: Math.round(variacao) } });
        }
      }
    }

    // 3) Taxa de correção (itens desfeitos)
    const desf = idxDesfeitos[nome] || 0;
    const itensVerif = idxItensVerif[nome] || 0;
    if (itensVerif >= 20 && taxaCorrecaoTime > 0) {
      const taxa = (desf / itensVerif) * 100;
      if (desf >= 3 && taxa >= taxaCorrecaoTime * 3) {
        sinais.push({ tipo: 'correcao', nivel: 'critico',
          texto: `${desf} marcação(ões) corrigida(s) (desfeita(s)) em ${itensVerif} itens — bem acima da média da equipe (${taxaCorrecaoTime.toFixed(1)}%).`,
          valor: { desfeitos: desf, itens_verificados: itensVerif, taxa_pct: Math.round(taxa * 10) / 10 } });
      } else if (desf >= 2 && taxa >= taxaCorrecaoTime * 2) {
        sinais.push({ tipo: 'correcao', nivel: 'atencao',
          texto: `${desf} marcação(ões) corrigida(s) (desfeita(s)) em ${itensVerif} itens — acima da média da equipe.`,
          valor: { desfeitos: desf, itens_verificados: itensVerif, taxa_pct: Math.round(taxa * 10) / 10 } });
      }
    }

    // 4) Taxa de falta + achado rápido na Busca Final
    const bf = buscaFinalPorColab[nome];
    if (bf && itensVerif >= 20 && taxaFaltaTime > 0) {
      const taxaFalta = (bf.avisos / itensVerif) * 100;
      if (bf.avisos >= 3 && taxaFalta >= taxaFaltaTime * 2) {
        sinais.push({ tipo: 'falta_alta', nivel: taxaFalta >= taxaFaltaTime * 3 ? 'critico' : 'atencao',
          texto: `Gerou ${bf.avisos} aviso(s) de falta no período — taxa acima da média da equipe (${taxaFaltaTime.toFixed(1)}%).`,
          valor: { avisos: bf.avisos, taxa_pct: Math.round(taxaFalta * 10) / 10 } });
      }
    }
    if (bf && bf.buscaFinal >= 3 && (bf.encontrado / bf.buscaFinal) >= 0.5) {
      sinais.push({ tipo: 'busca_final_achou', nivel: 'atencao',
        texto: `Em ${bf.buscaFinal} item(ns) enviado(s) à Busca Final, o repositor encontrou ${bf.encontrado} — pode ser erro de leitura de endereço/localização na separação, não falta real de estoque.`,
        valor: { busca_final: bf.buscaFinal, encontrado: bf.encontrado } });
    }

    // 5) Reincidência em ocorrências formais
    const ocs = ocorrPorColab[nome];
    if (ocs && ocs.length >= 2) {
      const graves = ocs.filter(o => o.gravidade === 'grave').length;
      const nivel = ocs.length >= 4 || graves >= 2 ? 'critico' : 'atencao';
      sinais.push({ tipo: 'reincidencia', nivel,
        texto: `${ocs.length} ocorrência(s) registrada(s) no período${graves ? ` (${graves} grave(s))` : ''}.`,
        valor: { total: ocs.length, graves } });
    }

    const nivel_geral = sinais.reduce((max, s) => (NIVEL_PESO[s.nivel] || 0) > (NIVEL_PESO[max] || 0) ? s.nivel : max, 'ok');
    return { nome, turno: t?.turno || null, sinais, nivel_geral };
  }).filter(c => c.sinais.length > 0);

  colaboradores.sort((a, b) => (NIVEL_PESO[b.nivel_geral] || 0) - (NIVEL_PESO[a.nivel_geral] || 0));

  return {
    periodo: { ini, fim, turno: turno || null },
    colaboradores,
    resumo: {
      total_avaliado: nomes.size,
      criticos: colaboradores.filter(c => c.nivel_geral === 'critico').length,
      atencao: colaboradores.filter(c => c.nivel_geral === 'atencao').length,
    },
  };
}

router.get('/performance/padroes', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  try {
    const dados = await calcularPadroes(req.query);
    res.json(dados);
  } catch (e) {
    res.status(e.status || 500).json({ erro: e.message });
  }
});

// ── Fase 2 (opcional) — resumo em linguagem natural via API da Claude ──────
// Nunca manda dado bruto/PII pro modelo: só os sinais já calculados acima.
let _anthropicClient;
function getAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_anthropicClient) {
    const Anthropic = require('@anthropic-ai/sdk');
    _anthropicClient = new Anthropic();
  }
  return _anthropicClient;
}

router.get('/performance/padroes/resumo-ia', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  const client = getAnthropicClient();
  if (!client) {
    return res.status(501).json({ erro: 'Resumo por IA não configurado — defina ANTHROPIC_API_KEY no ambiente do servidor para habilitar.' });
  }
  try {
    const dados = await calcularPadroes(req.query);
    if (!dados.colaboradores.length) {
      return res.json({ resumo: 'Nenhum padrão relevante identificado automaticamente no período — operação dentro do esperado.' });
    }
    const sinaisResumidos = dados.colaboradores.map(c => ({
      nome: c.nome,
      nivel: c.nivel_geral,
      sinais: c.sinais.map(s => ({ tipo: s.tipo, nivel: s.nivel, texto: s.texto })),
    }));

    const msg = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 1024,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: 'Você é um analista de operações de um armazém (WMS). Você recebe uma lista de sinais estatísticos já calculados sobre colaboradores (tempos de separação, marcações corrigidas, faltas geradas, ocorrências formais) e escreve um resumo curto em português para o supervisor do turno agir. Trate os sinais como pontos a investigar, nunca como veredito de culpa — o sistema não distingue erro humano de produto fora de lugar. Não invente números que não estejam nos dados fornecidos.',
      messages: [{
        role: 'user',
        content: `Período: ${dados.periodo.ini} a ${dados.periodo.fim}${dados.periodo.turno ? ` (turno ${dados.periodo.turno})` : ''}.\n\nSinais calculados:\n${JSON.stringify(sinaisResumidos, null, 2)}\n\nEscreva um resumo de até 150 palavras, em português, destacando os pontos mais importantes para o supervisor agir hoje.`,
      }],
    });

    if (msg.stop_reason === 'refusal') {
      return res.status(502).json({ erro: 'O modelo recusou gerar o resumo para este período.' });
    }
    const texto = msg.content.find(b => b.type === 'text')?.text || '';
    res.json({ resumo: texto });
  } catch (e) {
    console.error('performance/padroes/resumo-ia:', e.message);
    res.status(e.status || 500).json({ erro: 'Falha ao gerar resumo por IA: ' + e.message });
  }
});

module.exports = router;
