import express from 'express';
const router = express.Router();
import { db } from '../../lib/db';
import { requerAuth } from '../../lib/auth';
import { dataHoraLocal, formatarAguardandoDesde } from '../../lib/helpers';

router.get('/kpis', requerAuth, async (req,res) => {
  const { turnos, data_ini, data_fim } = req.query as Record<string, string>;
  const turnosArr = turnos ? turnos.split(',').filter(Boolean) : null;
  const hasTurno  = turnosArr && turnosArr.length > 0;

  const {data:hoje}=dataHoraLocal();
  const dIni = data_ini || hoje;
  const dFim = data_fim || hoje;
  const isFiltrado = (dIni !== hoje || dFim !== hoje || hasTurno);

  const cache = req.app.get('kpiCache');
  if (!isFiltrado && cache && cache.data && (Date.now() - cache.ts) < cache.ttl) {
    return res.json(cache.data);
  }
  try {
    // Turno filter: usa separadores.turno (turno de QUEM executou, não quando foi distribuído)
    // turno_distribuicao reflete o turno da distribuição do lote, não do separador — ignorado aqui
    const tSep = hasTurno
      ? ` AND REPLACE(COALESCE((SELECT s2.turno FROM separadores s2 WHERE s2.id=p.separador_id LIMIT 1),''),'ã','a')=ANY($T::text[])`
      : '';
    const tNome = (col: any) => hasTurno
      ? ` AND REPLACE(COALESCE((SELECT u2.turno FROM usuarios u2 WHERE u2.nome=${col} LIMIT 1),''),'ã','a')=ANY($T::text[])`
      : '';

    // Build params: $1=dIni, $2=dFim, $3=mes%, [$4=turnos se hasTurno]
    const p: any[] = [dIni, dFim, dIni.substring(0,7)+'%'];
    if (hasTurno) p.push(turnosArr);
    const T = hasTurno ? `$${p.length}` : null;

    const sepFilt = hasTurno ? tSep.replace('$T', T!) : '';
    const ckFilt  = hasTurno ? tNome('c.operador_nome').replace('$T', T!) : '';
    const embFilt = hasTurno ? tNome('e.embalado_por').replace('$T', T!) : '';
    const repFilt = hasTurno ? tNome('r.repositor_nome').replace('$T', T!) : '';

    const r = await db.get(`SELECT
      (SELECT COUNT(*) FROM pedidos p WHERE p.status='concluido'
        AND COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido)>=$1
        AND COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido)<=$2${sepFilt}) as concluidos_hoje,
      (SELECT COUNT(*) FROM pedidos p WHERE p.status='separando'${sepFilt}) as em_separacao,
      (SELECT COUNT(*) FROM pedidos WHERE status='pendente') as pendentes,
      (SELECT COUNT(*) FROM avisos_repositor WHERE status='pendente' AND data_aviso>=$1 AND data_aviso<=$2) as faltas_abertas,
      (SELECT COUNT(*) FROM checkout c WHERE c.status='pendente' AND c.data_checkout>=$1 AND c.data_checkout<=$2${ckFilt}) as checkout_pendente,
      (SELECT COUNT(*) FROM checkout c WHERE c.status='concluido' AND c.data_checkout>=$1 AND c.data_checkout<=$2${ckFilt}) as checkout_hoje,
      (SELECT COUNT(*) FROM pedidos WHERE status='concluido' AND data_pedido LIKE $3) as concluidos_mes,
      (SELECT COUNT(*) FROM pedidos p WHERE
        COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido)>=$1
        AND COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido)<=$2) as importados_hoje,
      (SELECT COUNT(DISTINCT separador_id) FROM pedidos WHERE status='separando') as seps_ativos,
      (SELECT COUNT(*) FROM avisos_repositor r WHERE r.status='nao_encontrado' AND r.data_aviso>=$1 AND r.data_aviso<=$2${repFilt}) as nao_encontrados_hoje,
      (SELECT COUNT(*) FROM avisos_repositor WHERE data_aviso>=$1 AND data_aviso<=$2) as total_faltas_hoje,
      (SELECT COUNT(*) FROM embalagem e WHERE e.data_embalagem>=$1 AND e.data_embalagem<=$2${embFilt}) as embalagem_hoje,
      (SELECT COUNT(*) FROM pedidos p WHERE p.status='concluido' AND p.status_embalagem IN ('pendente','embalando')${sepFilt}) as embalagem_pendente,
      (SELECT COUNT(*) FROM avisos_repositor r WHERE r.status IN ('reposto','abastecido','subiu') AND r.data_aviso>=$1 AND r.data_aviso<=$2${repFilt}) as reposicao_concluida,
      (SELECT COUNT(*) FROM avisos_repositor r WHERE r.status='pendente' AND r.data_aviso>=$1 AND r.data_aviso<=$2${repFilt}) as reposicao_pendente`,
      p);

    if (!isFiltrado) { cache.data = r; cache.ts = Date.now(); }
    res.json(r||{});
  } catch(e){res.status(500).json({erro:e.message});}
});

router.get('/produtividade', requerAuth, async (req,res) => {
  const {separador_id}=req.query as Record<string, string>;
  const {data:hoje}=dataHoraLocal(); const mes=hoje.substring(0,7);
  try {
    let sql=`SELECT s.id,s.nome,s.matricula,s.status,
      SUM(CASE WHEN p.data_pedido=$1 THEN 1 ELSE 0 END) as hoje,
      SUM(CASE WHEN p.data_pedido LIKE $2 THEN 1 ELSE 0 END) as mes,
      COUNT(p.id) as total_ano,
      COALESCE(SUM(p.pontuacao),0) as pontuacao_total
    FROM separadores s LEFT JOIN pedidos p ON p.separador_id=s.id AND p.status='concluido' WHERE 1=1`;
    const p=[hoje,mes+'%'];
    if (separador_id){p.push(separador_id);sql+=` AND s.id=$${p.length}`;}
    res.json(await db.all(sql+' GROUP BY s.id,s.nome,s.matricula,s.status ORDER BY s.nome',p));
  } catch(e){res.status(500).json({erro:e.message});}
});

router.get('/estatisticas/pedidos', requerAuth, async (req,res) => {
  const {data_ini,data_fim}=req.query as Record<string, string>;
  const {data:hoje}=dataHoraLocal(); const mes=hoje.substring(0,7); const ano=hoje.substring(0,4);
  try {
    const row=await db.get(`SELECT
      SUM(CASE WHEN data_pedido=$1 AND status='concluido' THEN 1 ELSE 0 END) as concluidos_hoje,
      SUM(CASE WHEN data_pedido=$2 THEN 1 ELSE 0 END) as total_hoje,
      SUM(CASE WHEN data_pedido LIKE $3 AND status='concluido' THEN 1 ELSE 0 END) as concluidos_mes,
      SUM(CASE WHEN data_pedido LIKE $4 THEN 1 ELSE 0 END) as total_mes,
      SUM(CASE WHEN data_pedido LIKE $5 AND status='concluido' THEN 1 ELSE 0 END) as concluidos_ano,
      SUM(CASE WHEN data_pedido LIKE $6 THEN 1 ELSE 0 END) as total_ano FROM pedidos`,
      [hoje,hoje,mes+'%',mes+'%',ano+'%',ano+'%']);
    if (data_ini&&data_fim) {
      const row2=await db.get(`SELECT COUNT(*) as total_periodo,SUM(CASE WHEN status='concluido' THEN 1 ELSE 0 END) as concluidos_periodo FROM pedidos WHERE data_pedido>=$1 AND data_pedido<=$2`,[data_ini,data_fim]);
      return res.json({...row,...row2});
    }
    res.json(row);
  } catch(e){res.status(500).json({erro:e.message});}
});

router.get('/estatisticas/repositor', requerAuth, async (req,res) => {
  const {repositor_nome, data_ini, data_fim}=req.query as Record<string, string>;
  const {data:hoje}=dataHoraLocal(); const mes=hoje.substring(0,7); const ano=hoje.substring(0,4);
  try {
    let sql=`SELECT
      SUM(CASE WHEN data_aviso=$1 AND status='reposto' THEN 1 ELSE 0 END) as repostos_hoje,
      SUM(CASE WHEN data_aviso=$2 THEN 1 ELSE 0 END) as avisos_hoje,
      SUM(CASE WHEN data_aviso LIKE $3 AND status='reposto' THEN 1 ELSE 0 END) as repostos_mes,
      SUM(CASE WHEN data_aviso LIKE $4 THEN 1 ELSE 0 END) as avisos_mes,
      SUM(CASE WHEN data_aviso LIKE $5 AND status='reposto' THEN 1 ELSE 0 END) as repostos_ano,
      SUM(CASE WHEN data_aviso LIKE $6 THEN 1 ELSE 0 END) as avisos_ano,
      SUM(CASE WHEN status='pendente' THEN 1 ELSE 0 END) as pendentes_total,
      SUM(CASE WHEN status='nao_encontrado' THEN 1 ELSE 0 END) as nao_encontrados,
      SUM(CASE WHEN status='protocolo' THEN 1 ELSE 0 END) as protocolos
    FROM avisos_repositor WHERE 1=1`;
    const p=[hoje,hoje,mes+'%',mes+'%',ano+'%',ano+'%'];
    if (repositor_nome){p.push(repositor_nome);sql+=` AND repositor_nome=$${p.length}`;}
    // A tela manda data_ini/data_fim mas antes nada aqui usava — pendentes_total,
    // nao_encontrados e protocolos saíam sempre como total histórico, ignorando
    // o período escolhido. Com filtro, essas 3 passam a contar só avisos abertos
    // (data_aviso) dentro do período, em vez de "desde sempre".
    if (data_ini) { p.push(data_ini); sql += ` AND data_aviso >= $${p.length}`; }
    if (data_fim) { p.push(data_fim); sql += ` AND data_aviso <= $${p.length}`; }
    const row=await db.get(sql,p);
    const prod=await db.all(`SELECT repositor_nome as nome,COUNT(*) as total,SUM(CASE WHEN status='reposto' THEN 1 ELSE 0 END) as repostos,SUM(CASE WHEN status='nao_encontrado' THEN 1 ELSE 0 END) as nao_encontrados,SUM(CASE WHEN data_aviso=$1 THEN 1 ELSE 0 END) as hoje FROM avisos_repositor WHERE repositor_nome!='' GROUP BY repositor_nome ORDER BY repostos DESC`,[hoje]);
    res.json({...row,produtividade:prod});
  } catch(e){res.status(500).json({erro:e.message});}
});

router.get('/estatisticas/checkout', requerAuth, async (req,res) => {
  const {data:hoje}=dataHoraLocal(); const mes=hoje.substring(0,7); const ano=hoje.substring(0,4);
  try {
    res.json(await db.get(`SELECT
      SUM(CASE WHEN data_checkout=$1 AND status='concluido' THEN 1 ELSE 0 END) as concluidos_hoje,
      SUM(CASE WHEN data_checkout=$2 THEN 1 ELSE 0 END) as total_hoje,
      SUM(CASE WHEN data_checkout LIKE $3 AND status='concluido' THEN 1 ELSE 0 END) as concluidos_mes,
      SUM(CASE WHEN data_checkout LIKE $4 THEN 1 ELSE 0 END) as total_mes,
      SUM(CASE WHEN data_checkout LIKE $5 AND status='concluido' THEN 1 ELSE 0 END) as concluidos_ano,
      SUM(CASE WHEN data_checkout LIKE $6 THEN 1 ELSE 0 END) as total_ano,
      SUM(CASE WHEN status='pendente' THEN 1 ELSE 0 END) as pendentes FROM checkout`,
      [hoje,hoje,mes+'%',mes+'%',ano+'%',ano+'%'])||{});
  } catch(e){res.status(500).json({erro:e.message});}
});

router.get('/timeline', requerAuth, async (req,res) => {
  const {data}=req.query as Record<string, string>; const {data:hoje}=dataHoraLocal();
  try {
    const rows=await db.all(`SELECT p.numero_pedido,p.cliente,p.transportadora,p.hora_pedido,p.status,p.itens,s.nome as separador_nome,p.data_pedido,p.aguardando_desde FROM pedidos p LEFT JOIN separadores s ON p.separador_id=s.id WHERE p.data_pedido=$1 ORDER BY p.hora_pedido ASC NULLS LAST`,[data||hoje]);
    res.json(rows.map(r=>({...r,aguardando_desde:formatarAguardandoDesde(r.aguardando_desde)})));
  } catch(e){res.status(500).json({erro:e.message});}
});

module.exports = router;
