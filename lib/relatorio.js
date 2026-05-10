const { pool, db } = require('./db');

async function gerarRelatorio(data) {
  try {
    const [pedidos, faltas, checkouts, seps] = await Promise.all([
      db.all(`SELECT p.*, s.nome as sep_nome FROM pedidos p LEFT JOIN separadores s ON p.separador_id=s.id WHERE p.data_pedido=$1`, [data]),
      db.all(`SELECT * FROM avisos_repositor WHERE data_aviso=$1`, [data]),
      db.all(`SELECT * FROM checkout WHERE data_checkout=$1`, [data]),
      db.all(`SELECT DISTINCT s.nome FROM separadores s INNER JOIN pedidos p ON p.separador_id=s.id WHERE p.data_pedido=$1`, [data]),
    ]);

    const porSep = {};
    pedidos.forEach(p => {
      if (!p.sep_nome) return;
      if (!porSep[p.sep_nome]) porSep[p.sep_nome] = { concluidos:0, pendentes:0, itens:0 };
      if (p.status==='concluido') porSep[p.sep_nome].concluidos++;
      else porSep[p.sep_nome].pendentes++;
      porSep[p.sep_nome].itens += p.itens||0;
    });

    const rel = {
      data,
      total_pedidos: pedidos.length,
      pedidos_concluidos: pedidos.filter(p=>p.status==='concluido').length,
      pedidos_pendentes: pedidos.filter(p=>p.status==='pendente').length,
      total_itens: pedidos.reduce((s,p)=>s+(p.itens||0),0),
      total_faltas: faltas.length,
      faltas_abastecidas: faltas.filter(f=>f.status==='abastecido').length,
      faltas_nao_encontradas: faltas.filter(f=>f.status==='nao_encontrado').length,
      total_checkouts: checkouts.filter(c=>c.status==='concluido').length,
      separadores_ativos: seps.length,
      dados_json: JSON.stringify({ porSep, faltas: faltas.slice(0,100), checkouts: checkouts.slice(0,50) }),
    };

    await pool.query(
      `INSERT INTO relatorios_diarios (data,total_pedidos,pedidos_concluidos,pedidos_pendentes,total_itens,total_faltas,faltas_abastecidas,faltas_nao_encontradas,total_checkouts,separadores_ativos,dados_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT(data) DO UPDATE SET
         total_pedidos=$2, pedidos_concluidos=$3, pedidos_pendentes=$4, total_itens=$5,
         total_faltas=$6, faltas_abastecidas=$7, faltas_nao_encontradas=$8,
         total_checkouts=$9, separadores_ativos=$10, dados_json=$11, gerado_em=NOW()`,
      [rel.data, rel.total_pedidos, rel.pedidos_concluidos, rel.pedidos_pendentes,
       rel.total_itens, rel.total_faltas, rel.faltas_abastecidas, rel.faltas_nao_encontradas,
       rel.total_checkouts, rel.separadores_ativos, rel.dados_json]
    );
    return rel;
  } catch(e) {
    require('./logger').error({ err: e }, 'erro ao gerar relatório');
    return null;
  }
}

module.exports = { gerarRelatorio };
