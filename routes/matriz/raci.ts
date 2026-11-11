import express from 'express';
const router = express.Router();
import { requerAuth } from '../../lib/auth';
import { db, pool } from '../../lib/db';
import type { Linha } from '../../types/db';
import { gLeitura, gGestor, wrap } from './_comum';

/* Matriz RACI (áreas → cargos → atividades → status) */
async function _carregarRaci() {
  const areas = await db.all<Pick<Linha<'mz_areas'>, 'id' | 'nome' | 'ordem'>>('SELECT id,nome,ordem FROM mz_areas ORDER BY ordem, nome');
  const roles = await db.all<Pick<Linha<'mz_roles'>, 'id' | 'area_id' | 'nome' | 'ordem'>>('SELECT id,area_id,nome,ordem FROM mz_roles ORDER BY ordem, nome');
  const atividades = await db.all<Pick<Linha<'mz_atividades'>, 'id' | 'area_id' | 'nome' | 'ordem' | 'categoria' | 'sugestao'>>('SELECT id,area_id,nome,ordem,categoria,sugestao FROM mz_atividades ORDER BY ordem, nome');
  const status = await db.all<Pick<Linha<'mz_status'>, 'atividade_id' | 'role_id' | 'status'>>('SELECT atividade_id,role_id,status FROM mz_status');
  return areas.map(area => ({
    ...area,
    roles: roles.filter(r => r.area_id === area.id).map(({area_id, ...r}) => r),
    atividades: atividades.filter(a => a.area_id === area.id).map(({area_id, ...a}) => ({
      ...a,
      status: status.filter(s => s.atividade_id === a.id).map(({atividade_id, ...s}) => s),
    })),
  }));
}

router.get('/matriz/raci', requerAuth, gLeitura, wrap(async (req: any, res: any) => {
  res.json(await _carregarRaci());
}));
router.post('/matriz/raci', requerAuth, gGestor, wrap(async (req: any, res: any) => {
  const { nome, ordem, roles } = req.body;
  if (!nome) return res.status(400).json({ erro: 'nome obrigatório' });
  const client = await pool.connect();
  let areaId;
  try {
    await client.query('BEGIN');
    const rArea = await client.query('INSERT INTO mz_areas (nome,ordem) VALUES ($1,$2) RETURNING id', [nome, ordem||0]);
    areaId = rArea.rows[0].id;
    let i = 0;
    for (const nomeRole of (roles||[])) { await client.query('INSERT INTO mz_roles (area_id,nome,ordem) VALUES ($1,$2,$3)', [areaId, nomeRole, i++]); }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  const [area] = (await _carregarRaci()).filter(a => a.id === areaId);
  res.status(201).json(area);
}));
router.post('/matriz/raci/areas/:areaId/roles', requerAuth, gGestor, wrap(async (req: any, res: any) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ erro: 'nome obrigatório' });
  const cnt = await db.get('SELECT COUNT(*)::int AS n FROM mz_roles WHERE area_id=$1', [req.params.areaId]);
  const r = await pool.query('INSERT INTO mz_roles (area_id,nome,ordem) VALUES ($1,$2,$3) RETURNING id,nome,ordem', [req.params.areaId, nome, cnt.n]);
  res.status(201).json(r.rows[0]);
}));
router.post('/matriz/raci/areas/:areaId/atividades', requerAuth, gGestor, wrap(async (req: any, res: any) => {
  const { nome, ordem, categoria, sugestao, status } = req.body;
  if (!nome) return res.status(400).json({ erro: 'nome obrigatório' });
  const client = await pool.connect();
  let atividade;
  try {
    await client.query('BEGIN');
    const rAt = await client.query(
      'INSERT INTO mz_atividades (area_id,nome,ordem,categoria,sugestao) VALUES ($1,$2,$3,$4,$5) RETURNING id,nome',
      [req.params.areaId, nome, ordem||0, categoria||null, sugestao||null]
    );
    atividade = rAt.rows[0];
    for (const s of (status||[])) { await client.query('INSERT INTO mz_status (atividade_id,role_id,status) VALUES ($1,$2,$3)', [atividade.id, s.role_id, s.status]); }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  res.status(201).json(atividade);
}));
router.patch('/matriz/raci/atividades/:id', requerAuth, gGestor, wrap(async (req: any, res: any) => {
  const atual = await db.get('SELECT * FROM mz_atividades WHERE id=$1', [req.params.id]);
  if (!atual) return res.status(404).json({ erro: 'Atividade não encontrada' });
  const campos = ['nome','ordem','categoria','sugestao'];
  const merged: Record<string, any> = {}; campos.forEach(c => { merged[c] = req.body[c] !== undefined ? req.body[c] : atual[c]; });
  await pool.query('UPDATE mz_atividades SET nome=$1,ordem=$2,categoria=$3,sugestao=$4 WHERE id=$5',
    [merged.nome, merged.ordem, merged.categoria, merged.sugestao, req.params.id]);
  res.json({ ok: true });
}));
router.delete('/matriz/raci/atividades/:id', requerAuth, gGestor, wrap(async (req: any, res: any) => {
  await pool.query('DELETE FROM mz_atividades WHERE id=$1', [req.params.id]);
  res.status(204).end();
}));
router.put('/matriz/raci/atividades/:id/status', requerAuth, gGestor, wrap(async (req: any, res: any) => {
  const { role_id, status } = req.body;
  if (!role_id || !status) return res.status(400).json({ erro: 'role_id e status obrigatórios' });
  await pool.query(
    `INSERT INTO mz_status (atividade_id,role_id,status) VALUES ($1,$2,$3)
     ON CONFLICT (atividade_id,role_id) DO UPDATE SET status=EXCLUDED.status`,
    [req.params.id, role_id, status]
  );
  res.json({ ok: true });
}));

module.exports = router;
