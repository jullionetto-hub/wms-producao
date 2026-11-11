import express from 'express';
const router = express.Router();
import { db, pool } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';
import { registrarAuditoria } from '../../lib/auditoria';
import type { Linha } from '../../types/db';

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

// Produção por hora, separada pelos 4 setores. Cada um usa sua própria coluna
// de conclusão: separação (pedidos.concluido_em), checkout (checkout.hora_checkout),
// embalagem (embalagem.embalado_em — a tabela já só tem linha quando embala) e
// reposição (avisos_repositor.hora_reposto, nos status finais de "resolvido").
// Reposição usa data_aviso como filtro de dia por não existir uma "data_reposto"
// própria na tabela — aproximação aceitável já que o fluxo normal resolve no
// mesmo turno/dia em que o item foi avisado.
router.get('/dashboard/por-hora', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const hoje = (await db.get(`SELECT TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') as d`)).d;
    const rows = await db.all(`
      WITH sep AS (
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
      ),
      ck AS (
        SELECT LPAD(SPLIT_PART(hora_checkout,':',1),2,'0') AS hora, COUNT(*) AS total
        FROM checkout
        WHERE data_checkout=$1 AND status='concluido'
          AND hora_checkout IS NOT NULL AND hora_checkout <> ''
        GROUP BY hora
      ),
      emb AS (
        SELECT LPAD(SPLIT_PART(embalado_em,':',1),2,'0') AS hora, COUNT(*) AS total
        FROM embalagem
        WHERE data_embalagem=$1 AND embalado_em IS NOT NULL AND embalado_em <> ''
        GROUP BY hora
      ),
      rep AS (
        SELECT LPAD(SPLIT_PART(hora_reposto,':',1),2,'0') AS hora, COUNT(*) AS total
        FROM avisos_repositor
        WHERE data_aviso=$1 AND status IN ('reposto','abastecido','encontrado')
          AND hora_reposto IS NOT NULL AND hora_reposto <> ''
        GROUP BY hora
      ),
      horas AS (
        SELECT hora FROM sep WHERE hora IS NOT NULL
        UNION SELECT hora FROM ck  WHERE hora IS NOT NULL
        UNION SELECT hora FROM emb WHERE hora IS NOT NULL
        UNION SELECT hora FROM rep WHERE hora IS NOT NULL
      )
      SELECT h.hora,
        COALESCE(sep.total,0) AS separacao,
        COALESCE(ck.total,0)  AS checkout,
        COALESCE(emb.total,0) AS embalagem,
        COALESCE(rep.total,0) AS reposicao
      FROM horas h
      LEFT JOIN sep ON sep.hora=h.hora
      LEFT JOIN ck  ON ck.hora=h.hora
      LEFT JOIN emb ON emb.hora=h.hora
      LEFT JOIN rep ON rep.hora=h.hora
      ORDER BY h.hora`, [hoje]);
    res.json(rows||[]);
  } catch(e) { res.status(500).json({erro: e.message}); }
});

// ── Configurações (metas e horas de turno) ─────────────────────────────────────
router.get('/configuracoes', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try { res.json(await db.all<Linha<'configuracoes'>>('SELECT * FROM configuracoes ORDER BY chave')); }
  catch(e) { res.status(500).json({ erro: e.message }); }
});

router.put('/configuracoes/:chave', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  const { valor } = req.body;
  if (valor === undefined) return res.status(400).json({ erro: 'Valor obrigatório' });
  try {
    const antes = await db.get<Pick<Linha<'configuracoes'>, 'valor'>>('SELECT valor FROM configuracoes WHERE chave=$1', [req.params.chave]);
    await pool.query(
      `INSERT INTO configuracoes (chave,valor) VALUES ($1,$2) ON CONFLICT (chave) DO UPDATE SET valor=$2`,
      [req.params.chave, String(valor)]
    );
    await registrarAuditoria(req, 'CONFIGURACAO_ALTERADA', 'configuracao', req.params.chave, antes, {valor:String(valor)});
    res.json({ mensagem: 'Salvo!' });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
