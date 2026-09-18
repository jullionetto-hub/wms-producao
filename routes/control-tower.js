/* ══ Control Tower — routes/control-tower.js ══
   V4 da evolução do WMS: pra cada etapa (Separação/Checkout/Embalagem/
   Reposição) calcula produção atual (itens/h, últimos 60 min), o ritmo
   necessário pra bater a meta do turno, o gap entre os dois, quanto volume
   ainda falta, e uma previsão de quando esse volume acaba no ritmo atual —
   tudo a partir de dados reais já existentes (pedidos.total_itens,
   configuracoes.meta_*, avisos_repositor.quantidade). Nenhum número aqui é
   inventado: onde falta um dado real (ex: meta em itens/turno não existe,
   só em pedidos/turno), o valor é DERIVADO de dois números reais (meta em
   pedidos × média real de itens/pedido hoje), nunca chutado.
══════════════════════════════════════════════════════════════════════ */
const express = require('express');
const router = express.Router();
const { db } = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');
const { dataHoraLocal, turnoAtualEHorarios } = require('../lib/helpers');
const { montarProcesso, calcularGargalo } = require('../lib/control-tower');

// Meta padrão (pedidos/turno) usada só se a linha não existir em `configuracoes`
// ainda — mesmo default do seed em src/database/migrate.js.
const META_PADRAO = { separacao: 75, checkout: 90, embalagem: 120, reposicao: 90 };

async function metasConfiguradas() {
  const rows = await db.all(
    `SELECT chave, valor FROM configuracoes WHERE chave IN ('meta_separacao','meta_checkout','meta_embalagem','meta_reposicao')`
  );
  const porChave = Object.fromEntries(rows.map(r => [r.chave, parseFloat(r.valor)]));
  return {
    separacao: porChave.meta_separacao || META_PADRAO.separacao,
    checkout: porChave.meta_checkout || META_PADRAO.checkout,
    embalagem: porChave.meta_embalagem || META_PADRAO.embalagem,
    reposicao: porChave.meta_reposicao || META_PADRAO.reposicao,
  };
}

// Produção da última hora + volume restante + itens médios/pedido hoje (pra
// converter a meta de pedidos/turno em itens/h) — uma consulta por etapa,
// todas cobrindo o mesmo "hoje" e "últimos 60 min" em horário de São Paulo.
async function metricasSeparacao(hoje) {
  const [producaoAtual, restante, mediaItens] = await Promise.all([
    db.get(`SELECT COALESCE(SUM(total_itens),0)::int AS itens FROM pedidos
      WHERE status='concluido' AND concluido_em <> ''
        AND concluido_em::timestamptz >= NOW() - INTERVAL '60 minutes'`),
    db.get(`SELECT COALESCE(SUM(total_itens),0)::int AS itens FROM pedidos
      WHERE status IN ('pendente','separando')`),
    db.get(`SELECT COALESCE(AVG(NULLIF(total_itens,0)),1)::float AS media FROM pedidos
      WHERE status='concluido' AND data_pedido=$1`, [hoje]),
  ]);
  return { producaoAtualH: producaoAtual.itens, volumeRestante: restante.itens, mediaItensPedido: mediaItens.media };
}

async function metricasCheckout(hoje) {
  const [producaoAtual, restante, mediaItens] = await Promise.all([
    db.get(`SELECT COALESCE(SUM(p.total_itens),0)::int AS itens
      FROM checkout c JOIN pedidos p ON p.id=c.pedido_id
      WHERE c.status='concluido' AND c.hora_checkout <> '' AND c.data_checkout=$1
        AND (c.data_checkout || 'T' || c.hora_checkout)::timestamp >= NOW() AT TIME ZONE 'America/Sao_Paulo' - INTERVAL '60 minutes'`, [hoje]),
    db.get(`SELECT COALESCE(SUM(p.total_itens),0)::int AS itens
      FROM checkout c JOIN pedidos p ON p.id=c.pedido_id
      WHERE c.status='pendente'`),
    db.get(`SELECT COALESCE(AVG(NULLIF(p.total_itens,0)),1)::float AS media
      FROM checkout c JOIN pedidos p ON p.id=c.pedido_id
      WHERE c.status='concluido' AND c.data_checkout=$1`, [hoje]),
  ]);
  return { producaoAtualH: producaoAtual.itens, volumeRestante: restante.itens, mediaItensPedido: mediaItens.media };
}

async function metricasEmbalagem(hoje) {
  const [producaoAtual, restante, mediaItens] = await Promise.all([
    db.get(`SELECT COALESCE(SUM(p.total_itens),0)::int AS itens
      FROM embalagem e LEFT JOIN pedidos p ON p.id=e.pedido_id
      WHERE e.embalado_em <> '' AND e.data_embalagem=$1
        AND (e.data_embalagem || 'T' || e.embalado_em)::timestamp >= NOW() AT TIME ZONE 'America/Sao_Paulo' - INTERVAL '60 minutes'`, [hoje]),
    db.get(`SELECT COALESCE(SUM(total_itens),0)::int AS itens FROM pedidos
      WHERE status='concluido' AND status_embalagem IN ('pendente','embalando')`),
    db.get(`SELECT COALESCE(AVG(NULLIF(p.total_itens,0)),1)::float AS media
      FROM embalagem e LEFT JOIN pedidos p ON p.id=e.pedido_id
      WHERE e.data_embalagem=$1`, [hoje]),
  ]);
  return { producaoAtualH: producaoAtual.itens, volumeRestante: restante.itens, mediaItensPedido: mediaItens.media };
}

// Reposição não tem "pedido"/"itens médios por pedido" — cada aviso já É um
// item (com sua própria quantidade), então a meta (pedidos/turno) é
// convertida 1 aviso ≈ 1 "pedido" pra manter a mesma fórmula de conversão.
async function metricasReposicao(hoje) {
  const [producaoAtual, restante] = await Promise.all([
    db.get(`SELECT COALESCE(SUM(quantidade),0)::int AS itens FROM avisos_repositor
      WHERE status IN ('reposto','abastecido','encontrado','subiu') AND hora_reposto <> '' AND data_aviso=$1
        AND (data_aviso || 'T' || hora_reposto)::timestamp >= NOW() AT TIME ZONE 'America/Sao_Paulo' - INTERVAL '60 minutes'`, [hoje]),
    db.get(`SELECT COALESCE(SUM(quantidade),0)::int AS itens FROM avisos_repositor WHERE status='pendente'`),
  ]);
  return { producaoAtualH: producaoAtual.itens, volumeRestante: restante.itens, mediaItensPedido: 1 };
}

router.get('/control-tower', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  try {
    const { data: hoje } = dataHoraLocal();
    const { turno, fim_hora, minutos_restantes } = turnoAtualEHorarios();
    const metas = await metasConfiguradas();
    // Horas do turno pra converter meta (pedidos/turno) em ritmo por hora —
    // usa configuracoes.horas_turno_* (é o propósito dela: escalar metas),
    // não o horário de relógio acima (esse é só pra "quanto tempo falta").
    const horasTurnoRow = await db.get(
      `SELECT valor FROM configuracoes WHERE chave=$1`,
      [`horas_turno_${turno === 'Manha' ? 'manha' : turno === 'Tarde' ? 'tarde' : 'noite'}`]
    );
    const horasTurno = parseFloat(horasTurnoRow?.valor) || (turno === 'Noite' ? 6 : 8);

    const [sep, ck, emb, rep] = await Promise.all([
      metricasSeparacao(hoje),
      metricasCheckout(hoje),
      metricasEmbalagem(hoje),
      metricasReposicao(hoje),
    ]);

    const processos = [
      montarProcesso('separacao', sep, metas.separacao, horasTurno, minutos_restantes),
      montarProcesso('checkout', ck, metas.checkout, horasTurno, minutos_restantes),
      montarProcesso('embalagem', emb, metas.embalagem, horasTurno, minutos_restantes),
      montarProcesso('reposicao', rep, metas.reposicao, horasTurno, minutos_restantes),
    ];

    res.json({
      turno_atual: turno,
      turno_fim: fim_hora,
      minutos_restantes_turno: minutos_restantes,
      processos,
      gargalo: calcularGargalo(processos),
    });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
// Exportadas pro Simulador de Capacidade (routes/simulador.js, V11) reaproveitar
// as mesmas consultas reais — nunca duplicar a métrica "produção atual" em
// mais um lugar (é exatamente o problema dos 3 modelos de geometria que o V2
// consolidou).
module.exports.metricasSeparacao = metricasSeparacao;
module.exports.metricasCheckout = metricasCheckout;
module.exports.metricasEmbalagem = metricasEmbalagem;
module.exports.metasConfiguradas = metasConfiguradas;
