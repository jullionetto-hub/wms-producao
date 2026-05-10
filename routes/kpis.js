const express = require('express');
const router = express.Router();
const { db } = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');
const { dataHoraLocal, formatarAguardandoDesde } = require('../lib/helpers');

router.get('/kpis', requerAuth, async (req,res) => {
  const cache = req.app.get('kpiCache');
  if (cache && cache.data && (Date.now() - cache.ts) < cache.ttl) {
    return res.json(cache.data);
  }
  const {data:hoje}=dataHoraLocal(); const mes=hoje.substring(0,7);
  try {
    const r=await db.get(`SELECT
      (SELECT COUNT(*) FROM pedidos WHERE status='concluido' AND data_pedido=$1) as concluidos_hoje,
      (SELECT COUNT(*) FROM pedidos WHERE status='separando') as em_separacao,
      (SELECT COUNT(*) FROM pedidos WHERE status='pendente') as pendentes,
      (SELECT COUNT(*) FROM avisos_repositor WHERE status='pendente') as faltas_abertas,
      (SELECT COUNT(*) FROM checkout WHERE status='pendente') as checkout_pendente,
      (SELECT COUNT(*) FROM checkout WHERE status='concluido' AND data_checkout=$2) as checkout_hoje,
      (SELECT COUNT(*) FROM pedidos WHERE status='concluido' AND data_pedido LIKE $3) as concluidos_mes,
      (SELECT COUNT(*) FROM pedidos WHERE data_pedido=$4) as importados_hoje,
      (SELECT COUNT(DISTINCT separador_id) FROM pedidos WHERE status='separando') as seps_ativos,
      (SELECT COUNT(*) FROM avisos_repositor WHERE status='nao_encontrado' AND data_aviso=$5) as nao_encontrados_hoje,
      (SELECT COUNT(*) FROM avisos_repositor WHERE data_aviso=$6) as total_faltas_hoje`,
      [hoje,hoje,mes+'%',hoje,hoje,hoje]);
    res.json(r||{});
  } catch(e){res.status(500).json({erro:e.message});}
});

router.get('/produtividade', requerAuth, async (req,res) => {
  const {separador_id}=req.query;
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
  const {data_ini,data_fim}=req.query;
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
  const {repositor_nome}=req.query;
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
  const {data}=req.query; const {data:hoje}=dataHoraLocal();
  try {
    const rows=await db.all(`SELECT p.numero_pedido,p.cliente,p.transportadora,p.hora_pedido,p.status,p.itens,s.nome as separador_nome,p.data_pedido,p.aguardando_desde FROM pedidos p LEFT JOIN separadores s ON p.separador_id=s.id WHERE p.data_pedido=$1 ORDER BY p.hora_pedido ASC NULLS LAST`,[data||hoje]);
    res.json(rows.map(r=>({...r,aguardando_desde:formatarAguardandoDesde(r.aguardando_desde)})));
  } catch(e){res.status(500).json({erro:e.message});}
});

router.get('/stats/colaboradores', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {data:hoje} = dataHoraLocal();
  try {
    const seps = await db.all(`
      SELECT u.nome, u.login, u.turno,
        COALESCE(SUM(CASE WHEN p.data_pedido=$1 AND p.status='concluido' THEN 1 ELSE 0 END),0) as sep_hoje,
        COALESCE(SUM(CASE WHEN p.status='concluido' THEN 1 ELSE 0 END),0) as sep_total
      FROM usuarios u
      LEFT JOIN separadores s ON s.usuario_id = u.id
      LEFT JOIN pedidos p ON p.separador_id = s.id
      WHERE u.perfil='separador'
      GROUP BY u.id, u.nome, u.login, u.turno ORDER BY u.nome`, [hoje]);
    const reps = await db.all(`
      SELECT u.nome, u.login, u.turno,
        COALESCE(SUM(CASE WHEN ar.data_aviso=$1 THEN 1 ELSE 0 END),0) as rep_hoje,
        COALESCE(SUM(CASE WHEN ar.data_aviso=$1 AND ar.status IN ('reposto','abastecido','subiu') THEN 1 ELSE 0 END),0) as rep_resolvidas_hoje,
        COALESCE(SUM(CASE WHEN ar.data_aviso=$1 AND ar.status='nao_encontrado' THEN 1 ELSE 0 END),0) as rep_nao_encontrados_hoje
      FROM usuarios u
      LEFT JOIN avisos_repositor ar ON ar.repositor_nome = u.nome
      WHERE u.perfil='repositor'
      GROUP BY u.id, u.nome, u.login, u.turno ORDER BY u.nome`, [hoje]);
    const cks = await db.all(`
      SELECT u.nome, u.login, u.turno,
        COALESCE(SUM(CASE WHEN ck.data_checkout=$1 AND ck.status='concluido' THEN 1 ELSE 0 END),0) as ck_hoje,
        COALESCE(SUM(CASE WHEN ck.data_checkout=$1 THEN 1 ELSE 0 END),0) as ck_total_hoje
      FROM usuarios u
      LEFT JOIN checkout ck ON ck.usuario_id = (SELECT id FROM separadores WHERE usuario_id=u.id LIMIT 1)
      WHERE u.perfil='checkout'
      GROUP BY u.id, u.nome, u.login, u.turno ORDER BY u.nome`, [hoje]);
    res.json({ data: hoje, separadores: seps, repositores: reps, checkouts: cks });
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.get('/stats/meus', requerAuth, async (req,res) => {
  const {data:hoje} = dataHoraLocal();
  const usuario = req.session?.usuario;
  if (!usuario) return res.status(401).json({erro:'Nao autenticado'});
  try {
    const result = { perfil: usuario.perfil, nome: usuario.nome, hoje };
    if (usuario.perfil === 'separador') {
      const sep = await db.get('SELECT id FROM separadores WHERE usuario_id=$1', [usuario.id]);
      if (sep) {
        result.separacao = await db.get(`SELECT
          SUM(CASE WHEN data_pedido=$1 AND status='concluido' THEN 1 ELSE 0 END) as separados_hoje,
          SUM(CASE WHEN data_pedido=$1 THEN 1 ELSE 0 END) as total_hoje,
          SUM(CASE WHEN status='concluido' THEN 1 ELSE 0 END) as separados_total
          FROM pedidos WHERE separador_id=$2`, [hoje, sep.id]);
      }
    }
    if (usuario.perfil === 'repositor') {
      result.reposicao = await db.get(`SELECT
        SUM(CASE WHEN data_aviso=$1 THEN 1 ELSE 0 END) as avisos_hoje,
        SUM(CASE WHEN data_aviso=$1 AND status IN ('reposto','abastecido','subiu') THEN 1 ELSE 0 END) as resolvidos_hoje,
        SUM(CASE WHEN data_aviso=$1 AND status='nao_encontrado' THEN 1 ELSE 0 END) as nao_encontrados_hoje,
        SUM(CASE WHEN data_aviso=$1 AND status='pendente' THEN 1 ELSE 0 END) as pendentes_hoje
        FROM avisos_repositor WHERE repositor_nome=$2`, [hoje, usuario.nome]);
    }
    if (usuario.perfil === 'checkout') {
      result.checkout = await db.get(`SELECT
        SUM(CASE WHEN data_checkout=$1 AND status='concluido' AND operador_nome=$2 THEN 1 ELSE 0 END) as expedidos_hoje,
        SUM(CASE WHEN data_checkout=$1 AND operador_nome=$2 THEN 1 ELSE 0 END) as total_hoje,
        SUM(CASE WHEN status='pendente' THEN 1 ELSE 0 END) as pendentes
        FROM checkout`, [hoje, usuario.nome]);
    }
    res.json(result);
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.get('/estatisticas/separador', requerAuth, async (req,res) => {
  try {
    const {data, separador_id} = req.query;
    const hoje = data || (await db.get(`SELECT TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') as d`)).d;
    let sid = separador_id || null;
    if (!sid) {
      const usr = await db.get(`SELECT s.id FROM separadores s JOIN usuarios u ON s.usuario_id=u.id WHERE u.id=$1`, [req.session.usuario?.id]);
      sid = usr?.id;
    }
    const [totais, pedidosHoje] = await Promise.all([
      db.get(`SELECT
        COUNT(*) FILTER (WHERE data_pedido=$1) as hoje,
        COUNT(*) FILTER (WHERE data_pedido=$1 AND status='concluido') as concluidos_hoje,
        COUNT(*) FILTER (WHERE data_pedido=$1 AND status='separando') as separando_hoje,
        COUNT(*) FILTER (WHERE status='concluido') as total_concluidos,
        COUNT(*) as total_pedidos
        FROM pedidos WHERE separador_id=$2`, [hoje, sid]),
      db.all(`SELECT id, numero_pedido, status, itens, cliente, hora_pedido, numero_caixa
              FROM pedidos WHERE data_pedido=$1 AND separador_id=$2 ORDER BY id DESC`, [hoje, sid])
    ]);
    res.json({ hoje, totais: totais||{}, pedidos: pedidosHoje||[] });
  } catch(e) { res.status(500).json({erro: e.message}); }
});

router.get('/dashboard/ranking', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const hoje = (await db.get(`SELECT TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') as d`)).d;
    const mes = hoje.substring(0,7);
    const rows = await db.all(`
      SELECT s.nome,
        COUNT(*) FILTER (WHERE p.data_pedido=$1 AND p.status='concluido') as hoje_concluidos,
        COUNT(*) FILTER (WHERE p.data_pedido=$1) as hoje_total,
        COUNT(*) FILTER (WHERE p.data_pedido LIKE $2 AND p.status='concluido') as mes_concluidos,
        COUNT(*) FILTER (WHERE p.status='concluido') as total_concluidos,
        COALESCE(SUM(p.itens) FILTER (WHERE p.data_pedido=$1),0) as hoje_itens
      FROM separadores s
      LEFT JOIN pedidos p ON p.separador_id=s.id
      WHERE s.status='ativo'
      GROUP BY s.nome
      ORDER BY hoje_concluidos DESC, mes_concluidos DESC`, [hoje, mes+'%']);
    res.json(rows||[]);
  } catch(e) { res.status(500).json({erro: e.message}); }
});

router.get('/dashboard/por-hora', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const hoje = (await db.get(`SELECT TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') as d`)).d;
    const rows = await db.all(`
      SELECT SUBSTRING(hora_pedido,1,2) as hora, COUNT(*) as total
      FROM pedidos
      WHERE data_pedido=$1 AND hora_pedido IS NOT NULL AND hora_pedido <> ''
      GROUP BY SUBSTRING(hora_pedido,1,2) ORDER BY hora`, [hoje]);
    res.json(rows||[]);
  } catch(e) { res.status(500).json({erro: e.message}); }
});

module.exports = router;
