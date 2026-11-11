import express from 'express';
const router = express.Router();
import { requerAuth } from '../../lib/auth';
import { db, pool } from '../../lib/db';
import type { Linha } from '../../types/db';
import { gLeitura, gGestor, wrap } from './_comum';

/* Colaboradores */
router.get('/matriz/colaboradores', requerAuth, gLeitura, wrap(async (req: any, res: any) => {
  res.json(await db.all<Pick<Linha<'mz_colaboradores'>, 'id' | 'nome' | 'cargo' | 'tier' | 'area' | 'turno' | 'ativo' | 'vaga'>>('SELECT id,nome,cargo,tier,area,turno,ativo,vaga FROM mz_colaboradores ORDER BY nome'));
}));
router.post('/matriz/colaboradores', requerAuth, gLeitura, wrap(async (req: any, res: any) => {
  const { nome, cargo, tier, area, turno, ativo, vaga } = req.body;
  if (!nome) return res.status(400).json({ erro: 'nome obrigatório' });
  const r = await pool.query(
    `INSERT INTO mz_colaboradores (nome,cargo,tier,area,turno,ativo,vaga) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [nome, cargo||'', tier||'analista', area||'', turno||null, ativo!==false, !!vaga]
  );
  res.status(201).json(r.rows[0]);
}));
router.patch('/matriz/colaboradores/:id', requerAuth, gLeitura, wrap(async (req: any, res: any) => {
  const atual = await db.get('SELECT * FROM mz_colaboradores WHERE id=$1', [req.params.id]);
  if (!atual) return res.status(404).json({ erro: 'Colaborador não encontrado' });
  const campos = ['nome','cargo','tier','area','turno','ativo','vaga'];
  const merged: Record<string, any> = {}; campos.forEach(c => { merged[c] = req.body[c] !== undefined ? req.body[c] : atual[c]; });
  const r = await pool.query(
    `UPDATE mz_colaboradores SET nome=$1,cargo=$2,tier=$3,area=$4,turno=$5,ativo=$6,vaga=$7 WHERE id=$8 RETURNING *`,
    [merged.nome, merged.cargo, merged.tier, merged.area, merged.turno, merged.ativo, merged.vaga, req.params.id]
  );
  res.json(r.rows[0]);
}));
router.delete('/matriz/colaboradores/:id', requerAuth, gLeitura, wrap(async (req: any, res: any) => {
  await pool.query('DELETE FROM mz_colaboradores WHERE id=$1', [req.params.id]);
  res.status(204).end();
}));

/* Feedbacks */
router.get('/matriz/feedbacks', requerAuth, gLeitura, wrap(async (req: any, res: any) => {
  res.json(await db.all('SELECT *, criado_em AS created_at FROM mz_feedbacks ORDER BY criado_em DESC'));
}));
router.post('/matriz/feedbacks', requerAuth, gLeitura, wrap(async (req: any, res: any) => {
  const b = req.body;
  if (!b.colaborador_id) return res.status(400).json({ erro: 'colaborador_id obrigatório' });
  const autor_nome = req.session?.usuario?.nome || '';
  const r = await pool.query(
    `INSERT INTO mz_feedbacks
       (colaborador_id,autor_nome,mes,cargo_snapshot,area_snapshot,meta,entregue,pontos_positivos,
        pontos_construtivos,absenteismo_mes,retorno_antecipado,atrasos,faltas_injustificadas,
        ausencias_justificadas,recorrencia_ausencia,outros_pontos,saldo_banco_horas,combinado_mes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     RETURNING *, criado_em AS created_at`,
    [b.colaborador_id, autor_nome, b.mes||'', b.cargo_snapshot||'', b.area_snapshot||'', b.meta??null, b.entregue??null,
     b.pontos_positivos||'', b.pontos_construtivos||'', b.absenteismo_mes||'', b.retorno_antecipado||'', b.atrasos??null,
     b.faltas_injustificadas??null, b.ausencias_justificadas??null, b.recorrencia_ausencia||'', b.outros_pontos||'',
     b.saldo_banco_horas||'', b.combinado_mes||'']
  );
  res.status(201).json(r.rows[0]);
}));
router.patch('/matriz/feedbacks/:id', requerAuth, gLeitura, wrap(async (req: any, res: any) => {
  const atual = await db.get('SELECT * FROM mz_feedbacks WHERE id=$1', [req.params.id]);
  if (!atual) return res.status(404).json({ erro: 'Feedback não encontrado' });
  const campos = ['mes','cargo_snapshot','area_snapshot','meta','entregue','pontos_positivos','pontos_construtivos',
    'absenteismo_mes','retorno_antecipado','atrasos','faltas_injustificadas','ausencias_justificadas',
    'recorrencia_ausencia','outros_pontos','saldo_banco_horas','combinado_mes'];
  const merged: Record<string, any> = {}; campos.forEach(c => { merged[c] = req.body[c] !== undefined ? req.body[c] : atual[c]; });
  const r = await pool.query(
    `UPDATE mz_feedbacks SET mes=$1,cargo_snapshot=$2,area_snapshot=$3,meta=$4,entregue=$5,pontos_positivos=$6,
       pontos_construtivos=$7,absenteismo_mes=$8,retorno_antecipado=$9,atrasos=$10,faltas_injustificadas=$11,
       ausencias_justificadas=$12,recorrencia_ausencia=$13,outros_pontos=$14,saldo_banco_horas=$15,combinado_mes=$16
     WHERE id=$17 RETURNING *, criado_em AS created_at`,
    [...campos.map(c => merged[c]), req.params.id]
  );
  res.json(r.rows[0]);
}));
router.delete('/matriz/feedbacks/:id', requerAuth, gLeitura, wrap(async (req: any, res: any) => {
  await pool.query('DELETE FROM mz_feedbacks WHERE id=$1', [req.params.id]);
  res.status(204).end();
}));

/* Classificações mensais (upsert único por colaborador+período) */
router.get('/matriz/classificacoes', requerAuth, gLeitura, wrap(async (req: any, res: any) => {
  res.json(await db.all<Linha<'mz_classificacoes'>>('SELECT * FROM mz_classificacoes'));
}));
router.put('/matriz/classificacoes', requerAuth, gLeitura, wrap(async (req: any, res: any) => {
  const { colaborador_id, periodo_label, absenteismo, performance, comportamento } = req.body;
  if (!colaborador_id || !periodo_label) return res.status(400).json({ erro: 'colaborador_id e periodo_label obrigatórios' });
  const r = await pool.query(
    `INSERT INTO mz_classificacoes (colaborador_id,periodo_label,absenteismo,performance,comportamento)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (colaborador_id,periodo_label) DO UPDATE SET
       absenteismo=EXCLUDED.absenteismo, performance=EXCLUDED.performance, comportamento=EXCLUDED.comportamento
     RETURNING *`,
    [colaborador_id, periodo_label, absenteismo??null, performance??null, comportamento??null]
  );
  res.json(r.rows[0]);
}));

/* Ausências */
router.get('/matriz/ausencias', requerAuth, gLeitura, wrap(async (req: any, res: any) => {
  res.json(await db.all<Pick<Linha<'mz_ausencias'>, 'id' | 'colaborador_id' | 'periodo_label' | 'dias' | 'data' | 'motivo'>>('SELECT id,colaborador_id,periodo_label,dias,data,motivo FROM mz_ausencias'));
}));
router.post('/matriz/ausencias', requerAuth, gLeitura, wrap(async (req: any, res: any) => {
  const b = req.body;
  if (!b.colaborador_id || !b.periodo_label) return res.status(400).json({ erro: 'colaborador_id e periodo_label obrigatórios' });
  const r = await pool.query(
    `INSERT INTO mz_ausencias (colaborador_id,periodo_label,dias,data,motivo) VALUES ($1,$2,$3,$4,$5) RETURNING id,colaborador_id,periodo_label,dias,data,motivo`,
    [b.colaborador_id, b.periodo_label, b.dias??1, b.data||'', b.motivo||'']
  );
  res.status(201).json(r.rows[0]);
}));
router.patch('/matriz/ausencias/:id', requerAuth, gLeitura, wrap(async (req: any, res: any) => {
  const atual = await db.get('SELECT * FROM mz_ausencias WHERE id=$1', [req.params.id]);
  if (!atual) return res.status(404).json({ erro: 'Registro não encontrado' });
  const campos = ['periodo_label','dias','data','motivo'];
  const merged: Record<string, any> = {}; campos.forEach(c => { merged[c] = req.body[c] !== undefined ? req.body[c] : atual[c]; });
  const r = await pool.query(
    `UPDATE mz_ausencias SET periodo_label=$1,dias=$2,data=$3,motivo=$4 WHERE id=$5 RETURNING id,colaborador_id,periodo_label,dias,data,motivo`,
    [merged.periodo_label, merged.dias, merged.data, merged.motivo, req.params.id]
  );
  res.json(r.rows[0]);
}));
router.delete('/matriz/ausencias/:id', requerAuth, gLeitura, wrap(async (req: any, res: any) => {
  await pool.query('DELETE FROM mz_ausencias WHERE id=$1', [req.params.id]);
  res.status(204).end();
}));

/* Banco de horas */
router.get('/matriz/banco-horas', requerAuth, gLeitura, wrap(async (req: any, res: any) => {
  res.json(await db.all<Pick<Linha<'mz_banco_horas'>, 'id' | 'colaborador_id' | 'saldo_atual' | 'delta'>>('SELECT id,colaborador_id,saldo_atual,delta FROM mz_banco_horas'));
}));
router.put('/matriz/banco-horas', requerAuth, gLeitura, wrap(async (req: any, res: any) => {
  const { colaborador_id, saldo_atual, delta } = req.body;
  if (!colaborador_id) return res.status(400).json({ erro: 'colaborador_id obrigatório' });
  const r = await pool.query(
    `INSERT INTO mz_banco_horas (colaborador_id,saldo_atual,delta) VALUES ($1,$2,$3)
     ON CONFLICT (colaborador_id) DO UPDATE SET saldo_atual=EXCLUDED.saldo_atual, delta=EXCLUDED.delta
     RETURNING id,colaborador_id,saldo_atual,delta`,
    [colaborador_id, saldo_atual||0, delta||0]
  );
  res.json(r.rows[0]);
}));
router.get('/matriz/banco-horas/periodo', requerAuth, gLeitura, wrap(async (req: any, res: any) => {
  let p = await db.get<Pick<Linha<'mz_banco_horas_periodo'>, 'inicio_label' | 'fim_label'>>('SELECT inicio_label,fim_label FROM mz_banco_horas_periodo LIMIT 1');
  if (!p) { await pool.query(`INSERT INTO mz_banco_horas_periodo (inicio_label,fim_label) VALUES ('','')`); p = { inicio_label:'', fim_label:'' }; }
  res.json(p);
}));
router.put('/matriz/banco-horas/periodo', requerAuth, gGestor, wrap(async (req: any, res: any) => {
  const { inicio_label, fim_label } = req.body;
  const existente = await db.get<Pick<Linha<'mz_banco_horas_periodo'>, 'id'>>('SELECT id FROM mz_banco_horas_periodo LIMIT 1');
  if (existente) await pool.query('UPDATE mz_banco_horas_periodo SET inicio_label=$1, fim_label=$2 WHERE id=$3', [inicio_label||'', fim_label||'', existente.id]);
  else await pool.query('INSERT INTO mz_banco_horas_periodo (inicio_label,fim_label) VALUES ($1,$2)', [inicio_label||'', fim_label||'']);
  res.json({ inicio_label: inicio_label||'', fim_label: fim_label||'' });
}));

/* Férias */
router.get('/matriz/ferias', requerAuth, gLeitura, wrap(async (req: any, res: any) => {
  res.json(await db.all<Pick<Linha<'mz_ferias'>, 'id' | 'colaborador_id' | 'tipo' | 'data_inicio' | 'dias'>>('SELECT id,colaborador_id,tipo,data_inicio,dias FROM mz_ferias'));
}));
router.put('/matriz/ferias', requerAuth, gLeitura, wrap(async (req: any, res: any) => {
  const { colaborador_id, tipo, data_inicio, dias } = req.body;
  if (!colaborador_id || !['limite','p1','p2'].includes(tipo)) return res.status(400).json({ erro: 'colaborador_id e tipo (limite|p1|p2) obrigatórios' });
  const r = await pool.query(
    `INSERT INTO mz_ferias (colaborador_id,tipo,data_inicio,dias) VALUES ($1,$2,$3,$4)
     ON CONFLICT (colaborador_id,tipo) DO UPDATE SET data_inicio=EXCLUDED.data_inicio, dias=EXCLUDED.dias
     RETURNING id,colaborador_id,tipo,data_inicio,dias`,
    [colaborador_id, tipo, data_inicio||null, dias??null]
  );
  res.json(r.rows[0]);
}));

module.exports = router;
