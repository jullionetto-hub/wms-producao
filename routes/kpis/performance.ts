import express from 'express';
const router = express.Router();
import { db } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';
import { dataHoraLocal } from '../../lib/helpers';
import type { Linha } from '../../types/db';

// ── Performance com sessões de trabalho ────────────────────────────────────────
router.get('/stats/performance', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  const { ini, fim, perfil: filtPerfil, colaborador: filtColab } = req.query as Record<string, string>;
  const { data: hoje } = dataHoraLocal();
  const dataIni = ini || hoje;
  const dataFim = fim || hoje;

  try {
    // Configurações de metas e carga horária
    const configs = await db.all<Pick<Linha<'configuracoes'>, 'chave' | 'valor'>>('SELECT chave, valor FROM configuracoes');
    const cfg = Object.fromEntries(configs.map(c => [c.chave, parseFloat(c.valor) || 0]));
    const METAS: Record<string, any> = {
      separador: cfg.meta_separacao || 75,
      embalador: cfg.meta_embalagem || 120,
      checkout:  cfg.meta_checkout  || 90,
      repositor: cfg.meta_reposicao || 90,
    };
    const HORAS: Record<string, any> = { Manha: cfg.horas_turno_manha || 8, Tarde: cfg.horas_turno_tarde || 8, Noite: cfg.horas_turno_noite || 6 };

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
    const resultado: any[] = sessoes.map(s => {
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
    let uParams: any[] = [];
    let uFilter = `perfil = ANY($1)`;
    uParams.push(perfisOp);
    if (filtPerfil) { uParams = [filtPerfil]; uFilter = `perfil=$1`; }
    if (filtColab)  { uParams.push(filtColab); uFilter += ` AND nome=$${uParams.length}`; }

    const todosAtivos = await db.all(
      `SELECT id, nome, perfil, turno FROM usuarios WHERE status='ativo' AND ${uFilter} ORDER BY nome`,
      uParams
    );

    // Separadores sem usuario_id (cadastros antigos sem login)
    const sepSemUsuario = await db.all<Pick<Linha<'separadores'>, 'nome' | 'turno'>>(
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
    const dIni = req.query.de  || hoje;
    const dFim = req.query.ate || hoje;

    const separadores = await db.all(`
      SELECT COALESCE(u.nome, s.nome) as nome,
        COUNT(*) FILTER (WHERE p.status='concluido') as total,
        COALESCE(SUM(COALESCE(NULLIF(p.total_itens,0),p.itens)) FILTER (WHERE p.status='concluido'), 0) as itens
      FROM separadores s
      LEFT JOIN usuarios u ON u.id = s.usuario_id
      LEFT JOIN pedidos p ON p.separador_id = s.id
        AND COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) >= $1
        AND COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) <= $2
      WHERE s.status = 'ativo'
      GROUP BY COALESCE(u.nome, s.nome)
      HAVING COUNT(*) FILTER (WHERE p.status='concluido') > 0
      ORDER BY total DESC LIMIT 10
    `, [dIni, dFim]);

    const checkout = await db.all(`
      SELECT COALESCE(NULLIF(operador_nome,''), 'Não identificado') as nome, COUNT(*) as total
      FROM checkout
      WHERE status='concluido' AND data_checkout>=$1 AND data_checkout<=$2
      GROUP BY COALESCE(NULLIF(operador_nome,''), 'Não identificado') ORDER BY total DESC LIMIT 10
    `, [dIni, dFim]);

    const embalagem = await db.all(`
      SELECT embalado_por as nome, COUNT(*) as total
      FROM embalagem
      WHERE data_embalagem>=$1 AND data_embalagem<=$2 AND embalado_por IS NOT NULL AND embalado_por!=''
      GROUP BY embalado_por ORDER BY total DESC LIMIT 10
    `, [dIni, dFim]);

    const repositores = await db.all(`
      SELECT repositor_nome as nome,
        COUNT(*) FILTER (WHERE status IN ('reposto','abastecido','subiu','encontrado')) as total
      FROM avisos_repositor
      WHERE data_aviso>=$1 AND data_aviso<=$2 AND repositor_nome IS NOT NULL AND repositor_nome!=''
        AND status IN ('reposto','abastecido','subiu','encontrado')
      GROUP BY repositor_nome
      HAVING COUNT(*) FILTER (WHERE status IN ('reposto','abastecido','subiu','encontrado')) > 0
      ORDER BY total DESC LIMIT 10
    `, [dIni, dFim]);

    res.json({ separadores, checkout, embalagem, repositores });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
