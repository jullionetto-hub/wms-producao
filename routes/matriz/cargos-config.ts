import express from 'express';
const router = express.Router();
import { requerAuth } from '../../lib/auth';
import { db, pool } from '../../lib/db';
import type { Linha } from '../../types/db';
import { gLeitura, gGestor, wrap } from './_comum';

/* Cargos (descrição de cargo/job description) */
router.get('/matriz/cargos', requerAuth, gLeitura, wrap(async (req: any, res: any) => {
  res.json(await db.all<Pick<Linha<'mz_cargos'>, 'id' | 'cargo' | 'area' | 'gestor' | 'perfil' | 'graduacoes' | 'descricao' | 'funcoes' | 'formacao' | 'tecnicas' | 'comportamentais' | 'atitudes'>>('SELECT id,cargo,area,gestor,perfil,graduacoes,descricao,funcoes,formacao,tecnicas,comportamentais,atitudes FROM mz_cargos ORDER BY area, cargo'));
}));
router.post('/matriz/cargos', requerAuth, gGestor, wrap(async (req: any, res: any) => {
  const b = req.body;
  if (!b.cargo) return res.status(400).json({ erro: 'cargo obrigatório' });
  const r = await pool.query(
    `INSERT INTO mz_cargos (cargo,area,gestor,perfil,graduacoes,descricao,funcoes,formacao,tecnicas,comportamentais,atitudes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [b.cargo, b.area||'', b.gestor||'', b.perfil||'', JSON.stringify(b.graduacoes||[]), b.descricao||'',
     JSON.stringify(b.funcoes||[]), b.formacao||'', JSON.stringify(b.tecnicas||[]), JSON.stringify(b.comportamentais||[]), JSON.stringify(b.atitudes||[])]
  );
  res.status(201).json(r.rows[0]);
}));
router.patch('/matriz/cargos/:id', requerAuth, gGestor, wrap(async (req: any, res: any) => {
  const atual = await db.get<Linha<'mz_cargos'>>('SELECT * FROM mz_cargos WHERE id=$1', [req.params.id]);
  if (!atual) return res.status(404).json({ erro: 'Cargo não encontrado' });
  const b = req.body;
  const g = (v: any, atualV: any) => v !== undefined ? JSON.stringify(v) : JSON.stringify(atualV);
  const r = await pool.query(
    `UPDATE mz_cargos SET cargo=$1,area=$2,gestor=$3,perfil=$4,graduacoes=$5,descricao=$6,funcoes=$7,formacao=$8,tecnicas=$9,comportamentais=$10,atitudes=$11 WHERE id=$12 RETURNING *`,
    [b.cargo??atual.cargo, b.area??atual.area, b.gestor??atual.gestor, b.perfil??atual.perfil, g(b.graduacoes, atual.graduacoes),
     b.descricao??atual.descricao, g(b.funcoes, atual.funcoes), b.formacao??atual.formacao, g(b.tecnicas, atual.tecnicas),
     g(b.comportamentais, atual.comportamentais), g(b.atitudes, atual.atitudes), req.params.id]
  );
  res.json(r.rows[0]);
}));
router.delete('/matriz/cargos/:id', requerAuth, gGestor, wrap(async (req: any, res: any) => {
  await pool.query('DELETE FROM mz_cargos WHERE id=$1', [req.params.id]);
  res.status(204).end();
}));

/* Incentivo (pontuação por critério) */
async function _getIncentivo() {
  let cfg = await db.get('SELECT * FROM mz_incentivo_config LIMIT 1');
  if (!cfg) { const r = await pool.query('INSERT INTO mz_incentivo_config DEFAULT VALUES RETURNING *'); cfg = r.rows[0]; }
  return cfg;
}
router.get('/matriz/incentivo', requerAuth, gLeitura, wrap(async (req: any, res: any) => { res.json(await _getIncentivo()); }));
router.put('/matriz/incentivo', requerAuth, gGestor, wrap(async (req: any, res: any) => {
  const atual = await _getIncentivo();
  const campos = ['abs_green','abs_yellow','abs_red','perf_green','perf_yellow','perf_red','comp_green','comp_yellow','comp_red'];
  const merged: Record<string, any> = {}; campos.forEach(c => { merged[c] = req.body[c] !== undefined ? req.body[c] : atual[c]; });
  const r = await pool.query(
    `UPDATE mz_incentivo_config SET abs_green=$1,abs_yellow=$2,abs_red=$3,perf_green=$4,perf_yellow=$5,perf_red=$6,comp_green=$7,comp_yellow=$8,comp_red=$9 WHERE id=$10 RETURNING *`,
    [...campos.map(c => merged[c]), atual.id]
  );
  res.json(r.rows[0]);
}));

/* Carreira (trilha por área) */
async function _getCarreira() {
  let cfg = await db.get('SELECT * FROM mz_carreira_config LIMIT 1');
  if (!cfg) { const r = await pool.query(`INSERT INTO mz_carreira_config (ladder) VALUES ('{}') RETURNING *`); cfg = r.rows[0]; }
  return cfg;
}
router.get('/matriz/carreira', requerAuth, gLeitura, wrap(async (req: any, res: any) => { res.json(await _getCarreira()); }));
router.put('/matriz/carreira', requerAuth, gGestor, wrap(async (req: any, res: any) => {
  const atual = await _getCarreira();
  const r = await pool.query('UPDATE mz_carreira_config SET ladder=$1 WHERE id=$2 RETURNING *', [JSON.stringify(req.body.ladder||{}), atual.id]);
  res.json(r.rows[0]);
}));

module.exports = router;
