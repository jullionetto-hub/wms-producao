import express from 'express';
const router = express.Router();
import { db } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';
import { sqlDiaOperacional } from '../../lib/helpers';
import { TURNO_DE_NOME, diaSep, diaCk, diaAv } from './_comum';

const diaEmb = (a: any) => sqlDiaOperacional({ ts: `${a}.data_embalagem||' '||${a}.embalado_em`, civil: `${a}.data_embalagem`, turno: TURNO_DE_NOME(`${a}.embalado_por`) });
const diaSessao = sqlDiaOperacional({ ts: "to_char(login_em AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD HH24:MI:SS')", civil: 'data', turno: 'turno' });

// â”€â”€ GET /performance/metas â€” Metas proporcionais por tempo logado â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/performance/metas', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  const { ini, fim } = req.query as Record<string, string>;
  if (!ini || !fim) return res.status(400).json({ erro: 'Informe ini e fim.' });

  try {
    const METAS: Record<string, number>     = { separador: 65, checkout: 90, embalador: 120, repositor: 90 };
    const TURNO_MIN: Record<string, number> = { Manha: 465, Tarde: 465, Noite: 453 };

    // Tempo logado por colaborador/perfil/data
    const sessoes = await db.all(`
      SELECT
        usuario_nome                                                AS nome,
        perfil,
        REPLACE(COALESCE(turno,'Manha'),'Ã£','a')                   AS turno,
        ${diaSessao}                                               AS data,
        SUM(
          CASE
            WHEN logout_em IS NOT NULL THEN COALESCE(duracao_min, 0)
            ELSE LEAST(
              GREATEST(0,
                ROUND(EXTRACT(EPOCH FROM (
                  LEAST(COALESCE(ultimo_ping, login_em) + INTERVAL '10 minutes', NOW()) - login_em
                )) / 60)::int
              ),
              480  -- cap sessÃµes sem logout em 8h para evitar inflaÃ§Ã£o
            )
          END
        )::int                                                      AS minutos_logado
      FROM sessoes_trabalho
      WHERE ${diaSessao} >= $1
        AND ${diaSessao} <= $2
        AND perfil IN ('separador','checkout','embalador','repositor')
      GROUP BY usuario_nome, perfil, REPLACE(COALESCE(turno,'Manha'),'Ã£','a'), ${diaSessao}
      ORDER BY data, usuario_nome
    `, [ini, fim]);

    const [sepRows, ckRows, embRows, repRows] = await Promise.all([
      db.all(`
        SELECT COALESCE(u.nome,s.nome) AS nome,
               ${diaSep('p')} AS data,
               COUNT(*)::int AS realizado
        FROM pedidos p
        JOIN separadores s ON s.id=p.separador_id
        LEFT JOIN usuarios u ON u.id=s.usuario_id
        WHERE p.status='concluido'
          AND ${diaSep('p')} >= $1
          AND ${diaSep('p')} <= $2
        GROUP BY COALESCE(u.nome,s.nome),
                 ${diaSep('p')}
      `, [ini, fim]),
      db.all(`
        SELECT operador_nome AS nome, ${diaCk('c')} AS data, COUNT(*)::int AS realizado
        FROM checkout c
        WHERE status='concluido' AND ${diaCk('c')}>=$1 AND ${diaCk('c')}<=$2
          AND operador_nome != ''
        GROUP BY operador_nome, ${diaCk('c')}
      `, [ini, fim]),
      db.all(`
        SELECT embalado_por AS nome, ${diaEmb('e')} AS data, COUNT(*)::int AS realizado
        FROM embalagem e
        WHERE ${diaEmb('e')}>=$1 AND ${diaEmb('e')}<=$2 AND embalado_por != ''
        GROUP BY embalado_por, ${diaEmb('e')}
      `, [ini, fim]),
      db.all(`
        SELECT repositor_nome AS nome, ${diaAv('a', 'a.repositor_nome')} AS data, COUNT(*)::int AS realizado
        FROM avisos_repositor a
        WHERE ${diaAv('a', 'a.repositor_nome')}>=$1 AND ${diaAv('a', 'a.repositor_nome')}<=$2
          AND repositor_nome != '' AND repositor_nome IS NOT NULL
          AND status NOT IN ('pendente','protocolo')
        GROUP BY repositor_nome, ${diaAv('a', 'a.repositor_nome')}
      `, [ini, fim]),
    ]);

    const realIdx: Record<string, any> = {};
    const addReal = (rows: any, perfil: any) => {
      for (const r of rows) {
        const k = `${r.nome}|${perfil}|${r.data}`;
        realIdx[k] = (realIdx[k] || 0) + r.realizado;
      }
    };
    addReal(sepRows,  'separador');
    addReal(ckRows,   'checkout');
    addReal(embRows,  'embalador');
    addReal(repRows,  'repositor');

    const resultado = sessoes.map(s => {
      const metaCheia = METAS[s.perfil]    || 0;
      const turnoMin  = TURNO_MIN[s.turno] || 465;
      const metaProp  = turnoMin > 0
        ? Math.round((s.minutos_logado / turnoMin) * metaCheia * 10) / 10
        : 0;
      const realizado = realIdx[`${s.nome}|${s.perfil}|${s.data}`] || 0;
      const pct       = metaProp > 0 ? Math.round((realizado / metaProp) * 100) : null;
      return { ...s, meta_cheia: metaCheia, meta_proporcional: metaProp, realizado, pct_atingido: pct };
    });

    res.json(resultado);
  } catch(e) {
    console.error('performance/metas:', e.message);
    res.status(500).json({ erro: e.message });
  }
});

// â”€â”€ GET /performance/range â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/performance/range', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  try {
    const row = await db.get(`
      SELECT
        MIN(${diaSep('pedidos')}) AS ini,
        MAX(${diaSep('pedidos')}) AS fim
      FROM pedidos
      WHERE status = 'concluido'
        AND separador_id IS NOT NULL
        AND data_pedido IS NOT NULL
        AND data_pedido != ''
    `);
    res.json(row || { ini: null, fim: null });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
