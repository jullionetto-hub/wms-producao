const express = require('express');
const router = express.Router();
const { db, pool } = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');
const { dataHoraLocal, formatarAguardandoDesde } = require('../lib/helpers');

router.get('/kpis', requerAuth, async (req,res) => {
  const { turnos, data_ini, data_fim } = req.query;
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
    // Turno filter: usa separadores.turno (mesma fonte que sep_turno no pipeline)
    // Normaliza 'Manhã'→'Manha' para compatibilidade com registros antigos
    const tSep = hasTurno
      ? ` AND REPLACE(COALESCE(p.turno_distribuicao,(SELECT s2.turno FROM separadores s2 WHERE s2.id=p.separador_id LIMIT 1),''),'ã','a')=ANY($T::text[])`
      : '';
    const tNome = (col) => hasTurno
      ? ` AND REPLACE(COALESCE((SELECT u2.turno FROM usuarios u2 WHERE u2.nome=${col} LIMIT 1),''),'ã','a')=ANY($T::text[])`
      : '';

    // Build params: $1=dIni, $2=dFim, $3=mes%, [$4=turnos se hasTurno]
    const p = [dIni, dFim, dIni.substring(0,7)+'%'];
    if (hasTurno) p.push(turnosArr);
    const T = hasTurno ? `$${p.length}` : null;

    const sepFilt = hasTurno ? tSep.replace('$T', T) : '';
    const ckFilt  = hasTurno ? tNome('c.operador_nome').replace('$T', T) : '';
    const embFilt = hasTurno ? tNome('e.embalado_por').replace('$T', T) : '';
    const repFilt = hasTurno ? tNome('r.repositor_nome').replace('$T', T) : '';

    const r = await db.get(`SELECT
      (SELECT COUNT(*) FROM pedidos p WHERE p.status='concluido' AND p.data_pedido>=$1 AND p.data_pedido<=$2${sepFilt}) as concluidos_hoje,
      (SELECT COUNT(*) FROM pedidos p WHERE p.status='separando'${sepFilt}) as em_separacao,
      (SELECT COUNT(*) FROM pedidos WHERE status='pendente') as pendentes,
      (SELECT COUNT(*) FROM avisos_repositor WHERE status='pendente' AND data_aviso>=$1 AND data_aviso<=$2) as faltas_abertas,
      (SELECT COUNT(*) FROM checkout c WHERE c.status='pendente' AND c.data_checkout>=$1 AND c.data_checkout<=$2${ckFilt}) as checkout_pendente,
      (SELECT COUNT(*) FROM checkout c WHERE c.status='concluido' AND c.data_checkout>=$1 AND c.data_checkout<=$2${ckFilt}) as checkout_hoje,
      (SELECT COUNT(*) FROM pedidos WHERE status='concluido' AND data_pedido LIKE $3) as concluidos_mes,
      (SELECT COUNT(*) FROM pedidos WHERE data_pedido>=$1 AND data_pedido<=$2) as importados_hoje,
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
        COALESCE(SUM(COALESCE(NULLIF(p.total_itens,0),p.itens)) FILTER (WHERE p.data_pedido=$1),0) as hoje_itens
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
      SELECT
        CASE
          WHEN concluido_em LIKE '%T%' THEN LPAD(SPLIT_PART(SPLIT_PART(concluido_em,'T',2),':',1),2,'0')
          WHEN concluido_em LIKE '% %' THEN LPAD(SPLIT_PART(SPLIT_PART(concluido_em,' ',2),':',1),2,'0')
          ELSE NULL
        END AS hora,
        COUNT(*) AS total
      FROM pedidos
      WHERE data_pedido=$1 AND status='concluido'
        AND concluido_em IS NOT NULL AND concluido_em <> ''
      GROUP BY hora
      HAVING (
        CASE
          WHEN concluido_em LIKE '%T%' THEN LPAD(SPLIT_PART(SPLIT_PART(concluido_em,'T',2),':',1),2,'0')
          WHEN concluido_em LIKE '% %' THEN LPAD(SPLIT_PART(SPLIT_PART(concluido_em,' ',2),':',1),2,'0')
          ELSE NULL
        END
      ) IS NOT NULL
      ORDER BY hora`, [hoje]);
    res.json(rows||[]);
  } catch(e) { res.status(500).json({erro: e.message}); }
});

// ── Configurações (metas e horas de turno) ─────────────────────────────────────
router.get('/configuracoes', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try { res.json(await db.all('SELECT * FROM configuracoes ORDER BY chave')); }
  catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/configuracoes/:chave', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  const { valor } = req.body;
  if (valor === undefined) return res.status(400).json({ erro: 'Valor obrigatório' });
  try {
    await pool.query(
      `INSERT INTO configuracoes (chave,valor) VALUES ($1,$2) ON CONFLICT (chave) DO UPDATE SET valor=$2`,
      [req.params.chave, String(valor)]
    );
    res.json({ mensagem: 'Salvo!' });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── Performance com sessões de trabalho ────────────────────────────────────────
router.get('/stats/performance', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  const { ini, fim, perfil: filtPerfil, colaborador: filtColab } = req.query;
  const { data: hoje } = dataHoraLocal();
  const dataIni = ini || hoje;
  const dataFim = fim || hoje;

  try {
    // Configurações de metas e carga horária
    const configs = await db.all('SELECT chave, valor FROM configuracoes');
    const cfg = Object.fromEntries(configs.map(c => [c.chave, parseFloat(c.valor) || 0]));
    const METAS = {
      separador: cfg.meta_separacao || 75,
      embalador: cfg.meta_embalagem || 120,
      checkout:  cfg.meta_checkout  || 90,
      repositor: cfg.meta_reposicao || 90,
    };
    const HORAS = { Manha: cfg.horas_turno_manha || 8, Tarde: cfg.horas_turno_tarde || 8, Noite: cfg.horas_turno_noite || 6 };

    // Sessões agrupadas por (usuario, perfil)
    let sParams = [dataIni, dataFim, hoje];
    let sFilter = " AND s.perfil NOT IN ('supervisor','admin')";
    if (filtPerfil) { sParams.push(filtPerfil); sFilter = ` AND s.perfil=$${sParams.length}`; }
    if (filtColab)  { sParams.push(filtColab);  sFilter += ` AND s.usuario_nome=$${sParams.length}`; }

    const sessoes = await db.all(`
      SELECT s.usuario_id, s.usuario_nome, s.perfil,
        COALESCE(u.turno, MAX(s.turno), 'Manha') as turno,
        SUM(
          CASE
            WHEN s.duracao_min IS NOT NULL THEN s.duracao_min
            WHEN s.logout_em IS NOT NULL
              THEN GREATEST(0, ROUND(EXTRACT(EPOCH FROM (s.logout_em - s.login_em))/60)::int)
            WHEN s.logout_em IS NULL AND s.data=$3
              THEN GREATEST(0, LEAST(960, ROUND(EXTRACT(EPOCH FROM (NOW() - s.login_em))/60)::int))
            ELSE 0
          END
        ) as minutos_total,
        COUNT(*) as num_sessoes
      FROM sessoes_trabalho s
      LEFT JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.data >= $1 AND s.data <= $2 ${sFilter}
      GROUP BY s.usuario_id, s.usuario_nome, s.perfil, u.turno
      ORDER BY s.usuario_nome, s.perfil
    `, sParams);

    // Atividades do período
    const pedidos = await db.all(`
      SELECT u.id as uid, COALESCE(u.nome, sep.nome) as nome, COUNT(*) as total,
        SUM(COALESCE(NULLIF(p.total_itens,0),p.itens)) as itens
      FROM pedidos p
      JOIN separadores sep ON p.separador_id = sep.id
      LEFT JOIN usuarios u ON sep.usuario_id = u.id
      WHERE p.status='concluido' AND p.data_pedido>=$1 AND p.data_pedido<=$2
      GROUP BY u.id, COALESCE(u.nome, sep.nome)`, [dataIni, dataFim]);

    const faltas = await db.all(`
      SELECT separador_nome as nome, COUNT(*) as total
      FROM avisos_repositor WHERE data_aviso>=$1 AND data_aviso<=$2
      GROUP BY separador_nome`, [dataIni, dataFim]);

    const checkouts = await db.all(`
      SELECT COALESCE(NULLIF(operador_nome,''), 'Não identificado') as nome, COUNT(*) as total
      FROM checkout
      WHERE status='concluido' AND data_checkout>=$1 AND data_checkout<=$2
      GROUP BY COALESCE(NULLIF(operador_nome,''), 'Não identificado')`, [dataIni, dataFim]);

    const embalagens = await db.all(`
      SELECT embalado_por as nome, COUNT(*) as total
      FROM embalagem WHERE data_embalagem>=$1 AND data_embalagem<=$2
      GROUP BY embalado_por`, [dataIni, dataFim]);

    const reposicoes = await db.all(`
      SELECT repositor_nome as nome, COUNT(*) as total,
        SUM(CASE WHEN status IN ('reposto','abastecido','subiu') THEN 1 ELSE 0 END) as repostos,
        SUM(CASE WHEN status='nao_encontrado' THEN 1 ELSE 0 END) as nao_encontrados
      FROM avisos_repositor
      WHERE data_aviso>=$1 AND data_aviso<=$2 AND repositor_nome!=''
      GROUP BY repositor_nome`, [dataIni, dataFim]);

    // Índices por nome
    const pedIdx  = Object.fromEntries(pedidos.map(p => [p.uid, p]));
    const pedNome = Object.fromEntries(pedidos.map(p => [p.nome, p]));
    const faltIdx = Object.fromEntries(faltas.map(f => [f.nome, f]));
    const ckIdx   = Object.fromEntries(checkouts.map(c => [c.nome, c]));
    const embIdx  = Object.fromEntries(embalagens.map(e => [e.nome, e]));
    const repIdx  = Object.fromEntries(reposicoes.map(r => [r.nome, r]));

    // Monta resultado por sessão
    const resultado = sessoes.map(s => {
      const min   = parseInt(s.minutos_total) || 0;
      const horas = Math.round(min / 6) / 10;
      const horasTurno = HORAS[s.turno] || 8;
      const metaBase   = METAS[s.perfil] || 0;
      const metaProp   = horasTurno > 0 ? Math.round((horas / horasTurno) * metaBase) : 0;

      let atividades = 0, detalhe = {};
      if (s.perfil === 'separador') {
        const ped = pedIdx[s.usuario_id] || pedNome[s.usuario_nome] || {};
        atividades = parseInt(ped.total) || 0;
        detalhe = { itens: parseInt(ped.itens) || 0, faltas: parseInt((faltIdx[s.usuario_nome] || {}).total) || 0 };
      } else if (s.perfil === 'checkout') {
        atividades = parseInt((ckIdx[s.usuario_nome] || {}).total) || 0;
      } else if (s.perfil === 'embalador') {
        atividades = parseInt((embIdx[s.usuario_nome] || {}).total) || 0;
      } else if (s.perfil === 'repositor') {
        const rep = repIdx[s.usuario_nome] || {};
        atividades = parseInt(rep.total) || 0;
        detalhe = { repostos: parseInt(rep.repostos) || 0, nao_encontrados: parseInt(rep.nao_encontrados) || 0 };
      }

      const pct = metaProp > 0 ? Math.min(999, Math.round((atividades / metaProp) * 100)) : null;

      return {
        usuario_id: s.usuario_id, usuario_nome: s.usuario_nome,
        perfil: s.perfil, turno: s.turno,
        horas, minutos: min, atividades, detalhe,
        meta_base: metaBase, meta_proporcional: metaProp, pct_atingimento: pct,
      };
    });

    // Todos os colaboradores ativos — garante que apareçam mesmo sem atividade/sessão
    const perfisOp = ['separador','checkout','embalador','repositor'];
    let uParams = [];
    let uFilter = `perfil = ANY($1)`;
    uParams.push(perfisOp);
    if (filtPerfil) { uParams = [filtPerfil]; uFilter = `perfil=$1`; }
    if (filtColab)  { uParams.push(filtColab); uFilter += ` AND nome=$${uParams.length}`; }

    const todosAtivos = await db.all(
      `SELECT id, nome, perfil, turno FROM usuarios WHERE status='ativo' AND ${uFilter} ORDER BY nome`,
      uParams
    );

    // Separadores sem usuario_id (cadastros antigos sem login)
    const sepSemUsuario = await db.all(
      `SELECT sep.nome, sep.turno FROM separadores sep
       WHERE sep.status='ativo' AND sep.usuario_id IS NULL ORDER BY sep.nome`
    );

    // Monta set de quem já está no resultado (por nome+perfil)
    const jaNoResultado = () => new Set(resultado.map(r => `${r.usuario_nome}:${r.perfil}`));

    // Adiciona usuários ativos que não estão no resultado
    const presente1 = jaNoResultado();
    todosAtivos.forEach(u => {
      if (presente1.has(`${u.nome}:${u.perfil}`)) return;
      const atividades = u.perfil === 'separador' ? parseInt((pedNome[u.nome]||{}).total)||0
        : u.perfil === 'checkout'  ? parseInt((ckIdx[u.nome]||{}).total)||0
        : u.perfil === 'embalador' ? parseInt((embIdx[u.nome]||{}).total)||0
        : u.perfil === 'repositor' ? parseInt((repIdx[u.nome]||{}).total)||0 : 0;
      const detalhe = u.perfil === 'separador'
        ? { itens: parseInt((pedNome[u.nome]||{}).itens)||0, faltas: parseInt((faltIdx[u.nome]||{}).total)||0 }
        : u.perfil === 'repositor'
        ? { repostos: parseInt((repIdx[u.nome]||{}).repostos)||0, nao_encontrados: parseInt((repIdx[u.nome]||{}).nao_encontrados)||0 }
        : {};
      resultado.push({
        usuario_id: u.id, usuario_nome: u.nome, perfil: u.perfil, turno: u.turno || 'Manha',
        horas: null, minutos: null, atividades, detalhe,
        meta_base: METAS[u.perfil] || 0, meta_proporcional: null, pct_atingimento: null,
      });
    });

    // Adiciona separadores antigos (sem login) que não estão no resultado
    const presente2 = jaNoResultado();
    sepSemUsuario.forEach(sep => {
      if (filtColab && sep.nome !== filtColab) return;
      if (presente2.has(`${sep.nome}:separador`)) return;
      const ped = pedNome[sep.nome] || {};
      resultado.push({
        usuario_id: null, usuario_nome: sep.nome, perfil: 'separador', turno: sep.turno || 'Manha',
        horas: null, minutos: null,
        atividades: parseInt(ped.total)||0,
        detalhe: { itens: parseInt(ped.itens)||0, faltas: parseInt((faltIdx[sep.nome]||{}).total)||0 },
        meta_base: METAS.separador, meta_proporcional: null, pct_atingimento: null,
      });
    });

    // Colaboradores com atividade no período mas não cadastrados (legado por nome)
    const presente3 = jaNoResultado();
    checkouts.forEach(c => {
      if (filtColab && c.nome !== filtColab) return;
      if (!presente3.has(`${c.nome}:checkout`))
        resultado.push({ usuario_nome: c.nome, perfil: 'checkout', turno: null,
          horas: null, minutos: null, atividades: parseInt(c.total)||0, detalhe: {},
          meta_base: METAS.checkout, meta_proporcional: null, pct_atingimento: null });
    });
    const presente4 = jaNoResultado();
    reposicoes.forEach(r => {
      if (filtColab && r.nome !== filtColab) return;
      if (!presente4.has(`${r.nome}:repositor`))
        resultado.push({ usuario_nome: r.nome, perfil: 'repositor', turno: null,
          horas: null, minutos: null, atividades: parseInt(r.total)||0,
          detalhe: { repostos: parseInt(r.repostos)||0, nao_encontrados: parseInt(r.nao_encontrados)||0 },
          meta_base: METAS.repositor, meta_proporcional: null, pct_atingimento: null });
    });

    resultado.sort((a,b) => a.usuario_nome.localeCompare(b.usuario_nome) || a.perfil.localeCompare(b.perfil));

    const resumo = {
      total_pedidos:    pedidos.reduce((s,p) => s + (parseInt(p.total)||0), 0),
      total_itens:      pedidos.reduce((s,p) => s + (parseInt(p.itens)||0), 0),
      total_faltas:     faltas.reduce((s,f) => s + (parseInt(f.total)||0), 0),
      total_checkouts:  checkouts.reduce((s,c) => s + (parseInt(c.total)||0), 0),
      total_embalagens: embalagens.reduce((s,e) => s + (parseInt(e.total)||0), 0),
    };

    res.json({ resultado, resumo, metas: METAS, horas_turno: HORAS });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

/* ─── RANKING GERAL — TODAS AS ÁREAS ──────────────────────────────── */
router.get('/dashboard/ranking-geral', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    const { d: hoje } = await db.get(`SELECT TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') as d`);

    const separadores = await db.all(`
      SELECT COALESCE(u.nome, s.nome) as nome,
        COUNT(*) FILTER (WHERE p.status='concluido') as total,
        COALESCE(SUM(COALESCE(NULLIF(p.total_itens,0),p.itens)) FILTER (WHERE p.status='concluido'), 0) as itens
      FROM separadores s
      LEFT JOIN usuarios u ON u.id = s.usuario_id
      LEFT JOIN pedidos p ON p.separador_id = s.id AND p.data_pedido = $1
      WHERE s.status = 'ativo'
      GROUP BY COALESCE(u.nome, s.nome)
      HAVING COUNT(*) FILTER (WHERE p.status='concluido') > 0
      ORDER BY total DESC LIMIT 10
    `, [hoje]);

    const checkout = await db.all(`
      SELECT COALESCE(NULLIF(operador_nome,''), 'Não identificado') as nome, COUNT(*) as total
      FROM checkout
      WHERE status='concluido' AND data_checkout=$1
      GROUP BY COALESCE(NULLIF(operador_nome,''), 'Não identificado') ORDER BY total DESC LIMIT 10
    `, [hoje]);

    const embalagem = await db.all(`
      SELECT embalado_por as nome, COUNT(*) as total
      FROM embalagem
      WHERE data_embalagem=$1 AND embalado_por IS NOT NULL AND embalado_por!=''
      GROUP BY embalado_por ORDER BY total DESC LIMIT 10
    `, [hoje]);

    const repositores = await db.all(`
      SELECT repositor_nome as nome,
        COUNT(*) FILTER (WHERE status IN ('reposto','abastecido','subiu','encontrado')) as total
      FROM avisos_repositor
      WHERE data_aviso=$1 AND repositor_nome IS NOT NULL AND repositor_nome!=''
        AND status IN ('reposto','abastecido','subiu','encontrado')
      GROUP BY repositor_nome
      HAVING COUNT(*) FILTER (WHERE status IN ('reposto','abastecido','subiu','encontrado')) > 0
      ORDER BY total DESC LIMIT 10
    `, [hoje]);

    res.json({ separadores, checkout, embalagem, repositores });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

/* ─── LIBERAÇÃO DE ITENS (nao_encontrado → aguardando supervisor) ─── */
router.get('/liberacao/pendentes', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  const { data_ini, data_fim } = req.query;
  try {
    let sql = `
      SELECT a.id, a.numero_pedido, a.codigo, a.descricao, a.quantidade,
        a.separador_nome, a.repositor_nome, a.hora_aviso, a.hora_reposto, a.data_aviso, a.obs,
        p.cliente
      FROM avisos_repositor a
      LEFT JOIN pedidos p ON a.pedido_id = p.id
      WHERE (a.status = 'nao_encontrado' OR a.situacao = 'nao_encontrado')
        AND COALESCE(a.status,'') NOT IN ('protocolo','abastecido','reposto','encontrado','subiu')
    `;
    const params = [];
    if (data_ini) { params.push(data_ini); sql += ` AND a.data_aviso >= $${params.length}`; }
    if (data_fim) { params.push(data_fim); sql += ` AND a.data_aviso <= $${params.length}`; }
    sql += ` ORDER BY a.data_aviso DESC, a.id DESC`;
    res.json(await db.all(sql, params) || []);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.get('/liberacao/historico', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  const { data_ini, data_fim } = req.query;
  try {
    let sql = `
      SELECT a.id, a.numero_pedido, a.codigo, a.descricao, a.quantidade, a.status,
        a.separador_nome, a.repositor_nome, a.hora_aviso, a.hora_reposto, a.data_aviso,
        a.quem_guardou as liberado_por, a.historico, p.cliente
      FROM avisos_repositor a
      LEFT JOIN pedidos p ON a.pedido_id = p.id
      WHERE a.status IN ('protocolo', 'reposto')
        AND COALESCE(a.quem_guardou, '') != ''
    `;
    const params = [];
    if (data_ini) { params.push(data_ini); sql += ` AND a.data_aviso >= $${params.length}`; }
    if (data_fim) { params.push(data_fim); sql += ` AND a.data_aviso <= $${params.length}`; }
    sql += ` ORDER BY a.id DESC LIMIT 200`;
    res.json(await db.all(sql, params) || []);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

/* ─── DETALHE POR PEDIDO (Performance) ─────────────────────────────── */
router.get('/stats/performance/detalhe', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  const { ini, fim, colaborador: filtColab, perfil: filtPerfil } = req.query;
  const { data: hoje } = dataHoraLocal();
  const dataIni = ini || hoje;
  const dataFim = fim || hoje;

  try {
    const resultado = {};

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
            THEN GREATEST(0, ROUND(EXTRACT(EPOCH FROM (ck.hora_checkout::time - ck.hora_criacao::time))/60.0)::int)
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
              ROUND(EXTRACT(EPOCH FROM (c.hora_checkout::time - c.hora_criacao::time))/60.0)::int
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
      const diffMin = (ini, fim) => {
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
          tentativas.forEach(t => {
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
