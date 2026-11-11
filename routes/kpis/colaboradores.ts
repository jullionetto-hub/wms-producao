import express from 'express';
const router = express.Router();
import { db } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';
import { dataHoraLocal } from '../../lib/helpers';
import type { Linha } from '../../types/db';

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
      LEFT JOIN checkout ck ON ck.operador_nome = u.nome
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
    const result: Record<string, any> = { perfil: usuario.perfil, nome: usuario.nome, hoje };
    if (usuario.perfil === 'separador') {
      const sep = await db.get<Pick<Linha<'separadores'>, 'id'>>('SELECT id FROM separadores WHERE usuario_id=$1', [usuario.id]);
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
    const {data, separador_id} = req.query as Record<string, string>;
    const hoje = data || (await db.get(`SELECT TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') as d`)).d;
    const perfil = req.session.usuario?.perfil;
    const podeVerOutro = perfil === 'supervisor' || perfil === 'gestor';
    let sid = (podeVerOutro && separador_id) ? separador_id : null;
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

module.exports = router;
