const express = require('express');
const router = express.Router();
const { db, pool } = require('../lib/db');
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
  const { ini, fim, perfil: filtPerfil } = req.query;
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
    let sFilter = '';
    if (filtPerfil) { sParams.push(filtPerfil); sFilter = ` AND s.perfil=$${sParams.length}`; }

    const sessoes = await db.all(`
      SELECT s.usuario_id, s.usuario_nome, s.perfil,
        COALESCE(u.turno, MAX(s.turno), 'Manha') as turno,
        SUM(COALESCE(s.duracao_min, 0)) +
        SUM(CASE WHEN s.logout_em IS NULL AND s.data=$3
          THEN GREATEST(0, ROUND(EXTRACT(EPOCH FROM (NOW()-s.login_em))/60)::int)
          ELSE 0 END) as minutos_total,
        COUNT(*) as num_sessoes
      FROM sessoes_trabalho s
      LEFT JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.data >= $1 AND s.data <= $2 ${sFilter}
      GROUP BY s.usuario_id, s.usuario_nome, s.perfil, u.turno
      ORDER BY s.usuario_nome, s.perfil
    `, sParams);

    // Atividades do período
    const pedidos = await db.all(`
      SELECT u.id as uid, COALESCE(u.nome, sep.nome) as nome, COUNT(*) as total, SUM(p.itens) as itens
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
      SELECT operador_nome as nome, COUNT(*) as total
      FROM checkout
      WHERE status='concluido' AND data_checkout>=$1 AND data_checkout<=$2 AND operador_nome!=''
      GROUP BY operador_nome`, [dataIni, dataFim]);

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

    // Usuários legados (com atividades mas sem sessão no período)
    if (!filtPerfil) {
      const naSessao = new Set(resultado.map(r => `${r.usuario_nome}:${r.perfil}`));
      pedidos.forEach(p => {
        if (!naSessao.has(`${p.nome}:separador`)) {
          resultado.push({ usuario_nome: p.nome, perfil: 'separador', turno: null,
            horas: null, minutos: null, atividades: parseInt(p.total) || 0,
            detalhe: { itens: parseInt(p.itens) || 0, faltas: parseInt((faltIdx[p.nome]||{}).total) || 0 },
            meta_base: METAS.separador, meta_proporcional: null, pct_atingimento: null });
        }
      });
      checkouts.forEach(c => {
        if (!naSessao.has(`${c.nome}:checkout`)) {
          resultado.push({ usuario_nome: c.nome, perfil: 'checkout', turno: null,
            horas: null, minutos: null, atividades: parseInt(c.total) || 0, detalhe: {},
            meta_base: METAS.checkout, meta_proporcional: null, pct_atingimento: null });
        }
      });
      embalagens.forEach(e => {
        if (!naSessao.has(`${e.nome}:embalador`)) {
          resultado.push({ usuario_nome: e.nome, perfil: 'embalador', turno: null,
            horas: null, minutos: null, atividades: parseInt(e.total) || 0, detalhe: {},
            meta_base: METAS.embalador, meta_proporcional: null, pct_atingimento: null });
        }
      });
      reposicoes.forEach(r => {
        if (!naSessao.has(`${r.nome}:repositor`)) {
          resultado.push({ usuario_nome: r.nome, perfil: 'repositor', turno: null,
            horas: null, minutos: null, atividades: parseInt(r.total) || 0,
            detalhe: { repostos: parseInt(r.repostos) || 0, nao_encontrados: parseInt(r.nao_encontrados) || 0 },
            meta_base: METAS.repositor, meta_proporcional: null, pct_atingimento: null });
        }
      });
    }

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

module.exports = router;
