'use strict';
const express = require('express');
const router  = express.Router();
const { requerAuth, requerPerfil } = require('../lib/auth');
const { db, pool } = require('../lib/db');

// ── Matriz de Responsabilidades — proxy completo ────────────────────────────
// App FastAPI separado (repo próprio "matriz-responsabilidades"), com seu
// próprio banco e seu próprio sistema de papéis (gerente/coordenador/
// supervisor por turno). O WMS autentica como UMA conta de serviço fixa
// (MATRIZ_EMAIL/MATRIZ_PASSWORD, normalmente gerente — acesso total), então
// todo mundo que acessa essas rotas pelo WMS herda esse acesso total — por
// isso as rotas aqui são restritas a gestor/supervisor do WMS, e as ações
// "de referência" (grade RACI, cargos, incentivo, carreira) só a gestor.
const MATRIZ_URL  = (process.env.MATRIZ_URL || 'https://matriz-responsabilidades-production.up.railway.app').replace(/\/$/, '');
const MATRIZ_USER = process.env.MATRIZ_EMAIL    || '';
const MATRIZ_PASS = process.env.MATRIZ_PASSWORD || '';

let _token    = null;
let _tokenExp = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExp) return _token;
  if (!MATRIZ_USER || !MATRIZ_PASS) throw new Error('Credenciais da Matriz não configuradas (MATRIZ_EMAIL / MATRIZ_PASSWORD)');
  const body = new URLSearchParams();
  body.set('username', MATRIZ_USER);
  body.set('password', MATRIZ_PASS);
  const res = await fetch(`${MATRIZ_URL}/api/auth/login`, { method: 'POST', body });
  if (!res.ok) {
    let d = ''; try { d = (await res.json()).detail || ''; } catch {}
    throw new Error(`Auth Matriz ${res.status}: ${d}`);
  }
  const { access_token } = await res.json();
  _token    = access_token;
  _tokenExp = Date.now() + 50 * 60 * 1000;
  return _token;
}

async function mCall(method, path, body) {
  const token = await getToken();
  const opts = { method, headers: { Authorization: `Bearer ${token}` } };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${MATRIZ_URL}${path}`, opts);
  if (!res.ok) {
    let d = ''; try { d = (await res.json()).detail || ''; } catch {}
    const err = new Error(d || `Matriz ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

const gLeitura = requerPerfil('gestor', 'supervisor'); // leitura + edição
const gGestor  = requerPerfil('gestor');                // "referência": RACI, cargos, incentivo, carreira

/* ══════════════════════════════════════════════════════════════════════════
   ROTAS NATIVAS — leem/escrevem direto no banco do WMS (tabelas mz_*), sem
   depender mais do serviço externo. Dados já migrados e conferidos
   (ver /matriz/migrar/conferencia). O serviço externo só continua sendo
   usado pelas rotas de /matriz/migrar* abaixo, pra re-sincronizar se
   necessário — não é mais chamado no dia a dia.
══════════════════════════════════════════════════════════════════════════ */

const wrap = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (e) { res.status(500).json({ erro: e.message }); }
};

/* Colaboradores */
router.get('/matriz/colaboradores', requerAuth, gLeitura, wrap(async (req, res) => {
  res.json(await db.all('SELECT id,nome,cargo,tier,area,turno,ativo,vaga FROM mz_colaboradores ORDER BY nome'));
}));
router.post('/matriz/colaboradores', requerAuth, gLeitura, wrap(async (req, res) => {
  const { nome, cargo, tier, area, turno, ativo, vaga } = req.body;
  if (!nome) return res.status(400).json({ erro: 'nome obrigatório' });
  const r = await pool.query(
    `INSERT INTO mz_colaboradores (nome,cargo,tier,area,turno,ativo,vaga) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [nome, cargo||'', tier||'analista', area||'', turno||null, ativo!==false, !!vaga]
  );
  res.status(201).json(r.rows[0]);
}));
router.patch('/matriz/colaboradores/:id', requerAuth, gLeitura, wrap(async (req, res) => {
  const atual = await db.get('SELECT * FROM mz_colaboradores WHERE id=$1', [req.params.id]);
  if (!atual) return res.status(404).json({ erro: 'Colaborador não encontrado' });
  const campos = ['nome','cargo','tier','area','turno','ativo','vaga'];
  const merged = {}; campos.forEach(c => { merged[c] = req.body[c] !== undefined ? req.body[c] : atual[c]; });
  const r = await pool.query(
    `UPDATE mz_colaboradores SET nome=$1,cargo=$2,tier=$3,area=$4,turno=$5,ativo=$6,vaga=$7 WHERE id=$8 RETURNING *`,
    [merged.nome, merged.cargo, merged.tier, merged.area, merged.turno, merged.ativo, merged.vaga, req.params.id]
  );
  res.json(r.rows[0]);
}));
router.delete('/matriz/colaboradores/:id', requerAuth, gLeitura, wrap(async (req, res) => {
  await pool.query('DELETE FROM mz_colaboradores WHERE id=$1', [req.params.id]);
  res.status(204).end();
}));

/* Feedbacks */
router.get('/matriz/feedbacks', requerAuth, gLeitura, wrap(async (req, res) => {
  res.json(await db.all('SELECT *, criado_em AS created_at FROM mz_feedbacks ORDER BY criado_em DESC'));
}));
router.post('/matriz/feedbacks', requerAuth, gLeitura, wrap(async (req, res) => {
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
router.patch('/matriz/feedbacks/:id', requerAuth, gLeitura, wrap(async (req, res) => {
  const atual = await db.get('SELECT * FROM mz_feedbacks WHERE id=$1', [req.params.id]);
  if (!atual) return res.status(404).json({ erro: 'Feedback não encontrado' });
  const campos = ['mes','cargo_snapshot','area_snapshot','meta','entregue','pontos_positivos','pontos_construtivos',
    'absenteismo_mes','retorno_antecipado','atrasos','faltas_injustificadas','ausencias_justificadas',
    'recorrencia_ausencia','outros_pontos','saldo_banco_horas','combinado_mes'];
  const merged = {}; campos.forEach(c => { merged[c] = req.body[c] !== undefined ? req.body[c] : atual[c]; });
  const r = await pool.query(
    `UPDATE mz_feedbacks SET mes=$1,cargo_snapshot=$2,area_snapshot=$3,meta=$4,entregue=$5,pontos_positivos=$6,
       pontos_construtivos=$7,absenteismo_mes=$8,retorno_antecipado=$9,atrasos=$10,faltas_injustificadas=$11,
       ausencias_justificadas=$12,recorrencia_ausencia=$13,outros_pontos=$14,saldo_banco_horas=$15,combinado_mes=$16
     WHERE id=$17 RETURNING *, criado_em AS created_at`,
    [...campos.map(c => merged[c]), req.params.id]
  );
  res.json(r.rows[0]);
}));
router.delete('/matriz/feedbacks/:id', requerAuth, gLeitura, wrap(async (req, res) => {
  await pool.query('DELETE FROM mz_feedbacks WHERE id=$1', [req.params.id]);
  res.status(204).end();
}));

/* Classificações mensais (upsert único por colaborador+período) */
router.get('/matriz/classificacoes', requerAuth, gLeitura, wrap(async (req, res) => {
  res.json(await db.all('SELECT * FROM mz_classificacoes'));
}));
router.put('/matriz/classificacoes', requerAuth, gLeitura, wrap(async (req, res) => {
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
router.get('/matriz/ausencias', requerAuth, gLeitura, wrap(async (req, res) => {
  res.json(await db.all('SELECT id,colaborador_id,periodo_label,dias,data,motivo FROM mz_ausencias'));
}));
router.post('/matriz/ausencias', requerAuth, gLeitura, wrap(async (req, res) => {
  const b = req.body;
  if (!b.colaborador_id || !b.periodo_label) return res.status(400).json({ erro: 'colaborador_id e periodo_label obrigatórios' });
  const r = await pool.query(
    `INSERT INTO mz_ausencias (colaborador_id,periodo_label,dias,data,motivo) VALUES ($1,$2,$3,$4,$5) RETURNING id,colaborador_id,periodo_label,dias,data,motivo`,
    [b.colaborador_id, b.periodo_label, b.dias??1, b.data||'', b.motivo||'']
  );
  res.status(201).json(r.rows[0]);
}));
router.patch('/matriz/ausencias/:id', requerAuth, gLeitura, wrap(async (req, res) => {
  const atual = await db.get('SELECT * FROM mz_ausencias WHERE id=$1', [req.params.id]);
  if (!atual) return res.status(404).json({ erro: 'Registro não encontrado' });
  const campos = ['periodo_label','dias','data','motivo'];
  const merged = {}; campos.forEach(c => { merged[c] = req.body[c] !== undefined ? req.body[c] : atual[c]; });
  const r = await pool.query(
    `UPDATE mz_ausencias SET periodo_label=$1,dias=$2,data=$3,motivo=$4 WHERE id=$5 RETURNING id,colaborador_id,periodo_label,dias,data,motivo`,
    [merged.periodo_label, merged.dias, merged.data, merged.motivo, req.params.id]
  );
  res.json(r.rows[0]);
}));
router.delete('/matriz/ausencias/:id', requerAuth, gLeitura, wrap(async (req, res) => {
  await pool.query('DELETE FROM mz_ausencias WHERE id=$1', [req.params.id]);
  res.status(204).end();
}));

/* Banco de horas */
router.get('/matriz/banco-horas', requerAuth, gLeitura, wrap(async (req, res) => {
  res.json(await db.all('SELECT id,colaborador_id,saldo_atual,delta FROM mz_banco_horas'));
}));
router.put('/matriz/banco-horas', requerAuth, gLeitura, wrap(async (req, res) => {
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
router.get('/matriz/banco-horas/periodo', requerAuth, gLeitura, wrap(async (req, res) => {
  let p = await db.get('SELECT inicio_label,fim_label FROM mz_banco_horas_periodo LIMIT 1');
  if (!p) { await pool.query(`INSERT INTO mz_banco_horas_periodo (inicio_label,fim_label) VALUES ('','')`); p = { inicio_label:'', fim_label:'' }; }
  res.json(p);
}));
router.put('/matriz/banco-horas/periodo', requerAuth, gGestor, wrap(async (req, res) => {
  const { inicio_label, fim_label } = req.body;
  const existente = await db.get('SELECT id FROM mz_banco_horas_periodo LIMIT 1');
  if (existente) await pool.query('UPDATE mz_banco_horas_periodo SET inicio_label=$1, fim_label=$2 WHERE id=$3', [inicio_label||'', fim_label||'', existente.id]);
  else await pool.query('INSERT INTO mz_banco_horas_periodo (inicio_label,fim_label) VALUES ($1,$2)', [inicio_label||'', fim_label||'']);
  res.json({ inicio_label: inicio_label||'', fim_label: fim_label||'' });
}));

/* Férias */
router.get('/matriz/ferias', requerAuth, gLeitura, wrap(async (req, res) => {
  res.json(await db.all('SELECT id,colaborador_id,tipo,data_inicio,dias FROM mz_ferias'));
}));
router.put('/matriz/ferias', requerAuth, gLeitura, wrap(async (req, res) => {
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

/* Matriz RACI (áreas → cargos → atividades → status) */
async function _carregarRaci() {
  const areas = await db.all('SELECT id,nome,ordem FROM mz_areas ORDER BY ordem, nome');
  const roles = await db.all('SELECT id,area_id,nome,ordem FROM mz_roles ORDER BY ordem, nome');
  const atividades = await db.all('SELECT id,area_id,nome,ordem,categoria,sugestao FROM mz_atividades ORDER BY ordem, nome');
  const status = await db.all('SELECT atividade_id,role_id,status FROM mz_status');
  return areas.map(area => ({
    ...area,
    roles: roles.filter(r => r.area_id === area.id).map(({area_id, ...r}) => r),
    atividades: atividades.filter(a => a.area_id === area.id).map(({area_id, ...a}) => ({
      ...a,
      status: status.filter(s => s.atividade_id === a.id).map(({atividade_id, ...s}) => s),
    })),
  }));
}

router.get('/matriz/raci', requerAuth, gLeitura, wrap(async (req, res) => {
  res.json(await _carregarRaci());
}));
router.post('/matriz/raci', requerAuth, gGestor, wrap(async (req, res) => {
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
router.post('/matriz/raci/areas/:areaId/roles', requerAuth, gGestor, wrap(async (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ erro: 'nome obrigatório' });
  const cnt = await db.get('SELECT COUNT(*)::int AS n FROM mz_roles WHERE area_id=$1', [req.params.areaId]);
  const r = await pool.query('INSERT INTO mz_roles (area_id,nome,ordem) VALUES ($1,$2,$3) RETURNING id,nome,ordem', [req.params.areaId, nome, cnt.n]);
  res.status(201).json(r.rows[0]);
}));
router.post('/matriz/raci/areas/:areaId/atividades', requerAuth, gGestor, wrap(async (req, res) => {
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
router.patch('/matriz/raci/atividades/:id', requerAuth, gGestor, wrap(async (req, res) => {
  const atual = await db.get('SELECT * FROM mz_atividades WHERE id=$1', [req.params.id]);
  if (!atual) return res.status(404).json({ erro: 'Atividade não encontrada' });
  const campos = ['nome','ordem','categoria','sugestao'];
  const merged = {}; campos.forEach(c => { merged[c] = req.body[c] !== undefined ? req.body[c] : atual[c]; });
  await pool.query('UPDATE mz_atividades SET nome=$1,ordem=$2,categoria=$3,sugestao=$4 WHERE id=$5',
    [merged.nome, merged.ordem, merged.categoria, merged.sugestao, req.params.id]);
  res.json({ ok: true });
}));
router.delete('/matriz/raci/atividades/:id', requerAuth, gGestor, wrap(async (req, res) => {
  await pool.query('DELETE FROM mz_atividades WHERE id=$1', [req.params.id]);
  res.status(204).end();
}));
router.put('/matriz/raci/atividades/:id/status', requerAuth, gGestor, wrap(async (req, res) => {
  const { role_id, status } = req.body;
  if (!role_id || !status) return res.status(400).json({ erro: 'role_id e status obrigatórios' });
  await pool.query(
    `INSERT INTO mz_status (atividade_id,role_id,status) VALUES ($1,$2,$3)
     ON CONFLICT (atividade_id,role_id) DO UPDATE SET status=EXCLUDED.status`,
    [req.params.id, role_id, status]
  );
  res.json({ ok: true });
}));

/* Cargos (descrição de cargo/job description) */
router.get('/matriz/cargos', requerAuth, gLeitura, wrap(async (req, res) => {
  res.json(await db.all('SELECT id,cargo,area,gestor,perfil,graduacoes,descricao,funcoes,formacao,tecnicas,comportamentais,atitudes FROM mz_cargos ORDER BY area, cargo'));
}));
router.post('/matriz/cargos', requerAuth, gGestor, wrap(async (req, res) => {
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
router.patch('/matriz/cargos/:id', requerAuth, gGestor, wrap(async (req, res) => {
  const atual = await db.get('SELECT * FROM mz_cargos WHERE id=$1', [req.params.id]);
  if (!atual) return res.status(404).json({ erro: 'Cargo não encontrado' });
  const b = req.body;
  const g = (v, atualV) => v !== undefined ? JSON.stringify(v) : JSON.stringify(atualV);
  const r = await pool.query(
    `UPDATE mz_cargos SET cargo=$1,area=$2,gestor=$3,perfil=$4,graduacoes=$5,descricao=$6,funcoes=$7,formacao=$8,tecnicas=$9,comportamentais=$10,atitudes=$11 WHERE id=$12 RETURNING *`,
    [b.cargo??atual.cargo, b.area??atual.area, b.gestor??atual.gestor, b.perfil??atual.perfil, g(b.graduacoes, atual.graduacoes),
     b.descricao??atual.descricao, g(b.funcoes, atual.funcoes), b.formacao??atual.formacao, g(b.tecnicas, atual.tecnicas),
     g(b.comportamentais, atual.comportamentais), g(b.atitudes, atual.atitudes), req.params.id]
  );
  res.json(r.rows[0]);
}));
router.delete('/matriz/cargos/:id', requerAuth, gGestor, wrap(async (req, res) => {
  await pool.query('DELETE FROM mz_cargos WHERE id=$1', [req.params.id]);
  res.status(204).end();
}));

/* Incentivo (pontuação por critério) */
async function _getIncentivo() {
  let cfg = await db.get('SELECT * FROM mz_incentivo_config LIMIT 1');
  if (!cfg) { const r = await pool.query('INSERT INTO mz_incentivo_config DEFAULT VALUES RETURNING *'); cfg = r.rows[0]; }
  return cfg;
}
router.get('/matriz/incentivo', requerAuth, gLeitura, wrap(async (req, res) => { res.json(await _getIncentivo()); }));
router.put('/matriz/incentivo', requerAuth, gGestor, wrap(async (req, res) => {
  const atual = await _getIncentivo();
  const campos = ['abs_green','abs_yellow','abs_red','perf_green','perf_yellow','perf_red','comp_green','comp_yellow','comp_red'];
  const merged = {}; campos.forEach(c => { merged[c] = req.body[c] !== undefined ? req.body[c] : atual[c]; });
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
router.get('/matriz/carreira', requerAuth, gLeitura, wrap(async (req, res) => { res.json(await _getCarreira()); }));
router.put('/matriz/carreira', requerAuth, gGestor, wrap(async (req, res) => {
  const atual = await _getCarreira();
  const r = await pool.query('UPDATE mz_carreira_config SET ladder=$1 WHERE id=$2 RETURNING *', [JSON.stringify(req.body.ladder||{}), atual.id]);
  res.json(r.rows[0]);
}));

/* ══════════════════════════════════════════════════════════════════════════
   MIGRAÇÃO — copia tudo do serviço externo pro banco do próprio WMS.
   Idempotente: usa origem_id (ou a chave natural da tabela) com
   ON CONFLICT ... DO UPDATE, então rodar de novo só atualiza, nunca duplica.
   Não apaga nada do lado de origem — só lê de lá e grava aqui.
══════════════════════════════════════════════════════════════════════════ */

async function _migrarColaboradores(client) {
  const lista = await mCall('GET', '/api/colaboradores');
  const mapa = {};
  for (const c of lista) {
    const r = await client.query(
      `INSERT INTO mz_colaboradores (origem_id,nome,cargo,tier,area,turno,ativo,vaga)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (origem_id) DO UPDATE SET
         nome=EXCLUDED.nome, cargo=EXCLUDED.cargo, tier=EXCLUDED.tier, area=EXCLUDED.area,
         turno=EXCLUDED.turno, ativo=EXCLUDED.ativo, vaga=EXCLUDED.vaga
       RETURNING id`,
      [c.id, c.nome, c.cargo||'', c.tier||'analista', c.area||'', c.turno||null, c.ativo!==false, !!c.vaga]
    );
    mapa[c.id] = r.rows[0].id;
  }
  return { total: lista.length, mapa };
}

async function _migrarBancoHoras(client, colabMap) {
  const [lista, periodo] = await Promise.all([
    mCall('GET', '/api/banco-horas'),
    mCall('GET', '/api/banco-horas/periodo'),
  ]);
  let ok = 0, semColab = 0;
  for (const b of lista) {
    const novoColabId = colabMap[b.colaborador_id];
    if (!novoColabId) { semColab++; continue; }
    await client.query(
      `INSERT INTO mz_banco_horas (colaborador_id,saldo_atual,delta)
       VALUES ($1,$2,$3)
       ON CONFLICT (colaborador_id) DO UPDATE SET saldo_atual=EXCLUDED.saldo_atual, delta=EXCLUDED.delta`,
      [novoColabId, b.saldo_atual||0, b.delta||0]
    );
    ok++;
  }
  const existente = await client.query('SELECT id FROM mz_banco_horas_periodo LIMIT 1');
  if (existente.rows.length) {
    await client.query('UPDATE mz_banco_horas_periodo SET inicio_label=$1, fim_label=$2 WHERE id=$3',
      [periodo.inicio_label||'', periodo.fim_label||'', existente.rows[0].id]);
  } else {
    await client.query('INSERT INTO mz_banco_horas_periodo (inicio_label,fim_label) VALUES ($1,$2)',
      [periodo.inicio_label||'', periodo.fim_label||'']);
  }
  return { total: lista.length, migrados: ok, sem_colaborador: semColab };
}

async function _migrarFerias(client, colabMap) {
  const lista = await mCall('GET', '/api/ferias');
  let ok = 0, semColab = 0;
  for (const f of lista) {
    const novoColabId = colabMap[f.colaborador_id];
    if (!novoColabId) { semColab++; continue; }
    await client.query(
      `INSERT INTO mz_ferias (colaborador_id,tipo,data_inicio,dias)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (colaborador_id,tipo) DO UPDATE SET data_inicio=EXCLUDED.data_inicio, dias=EXCLUDED.dias`,
      [novoColabId, f.tipo, f.data_inicio||null, f.dias??null]
    );
    ok++;
  }
  return { total: lista.length, migrados: ok, sem_colaborador: semColab };
}

async function _migrarClassificacoes(client, colabMap) {
  const lista = await mCall('GET', '/api/classificacoes');
  let ok = 0, semColab = 0;
  for (const c of lista) {
    const novoColabId = colabMap[c.colaborador_id];
    if (!novoColabId) { semColab++; continue; }
    await client.query(
      `INSERT INTO mz_classificacoes (colaborador_id,periodo_label,absenteismo,performance,comportamento)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (colaborador_id,periodo_label) DO UPDATE SET
         absenteismo=EXCLUDED.absenteismo, performance=EXCLUDED.performance, comportamento=EXCLUDED.comportamento`,
      [novoColabId, c.periodo_label, c.absenteismo||null, c.performance||null, c.comportamento||null]
    );
    ok++;
  }
  return { total: lista.length, migrados: ok, sem_colaborador: semColab };
}

async function _migrarAusencias(client, colabMap) {
  const lista = await mCall('GET', '/api/ausencias');
  let ok = 0, semColab = 0;
  for (const a of lista) {
    const novoColabId = colabMap[a.colaborador_id];
    if (!novoColabId) { semColab++; continue; }
    await client.query(
      `INSERT INTO mz_ausencias (origem_id,colaborador_id,periodo_label,dias,data,motivo)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (origem_id) DO UPDATE SET
         periodo_label=EXCLUDED.periodo_label, dias=EXCLUDED.dias, data=EXCLUDED.data, motivo=EXCLUDED.motivo`,
      [a.id, novoColabId, a.periodo_label, a.dias??1, a.data||'', a.motivo||'']
    );
    ok++;
  }
  return { total: lista.length, migrados: ok, sem_colaborador: semColab };
}

async function _migrarFeedbacks(client, colabMap) {
  const [lista, usuarios] = await Promise.all([
    mCall('GET', '/api/feedbacks'),
    mCall('GET', '/api/usuarios').catch(() => []), // pode falhar se a conta de serviço não for gerente — não é crítico
  ]);
  const userMap = {};
  (usuarios||[]).forEach(u => { userMap[u.id] = u.nome || u.email; });
  let ok = 0, semColab = 0;
  for (const f of lista) {
    const novoColabId = colabMap[f.colaborador_id];
    if (!novoColabId) { semColab++; continue; }
    await client.query(
      `INSERT INTO mz_feedbacks
         (origem_id,colaborador_id,autor_nome,mes,cargo_snapshot,area_snapshot,meta,entregue,
          pontos_positivos,pontos_construtivos,absenteismo_mes,retorno_antecipado,atrasos,
          faltas_injustificadas,ausencias_justificadas,recorrencia_ausencia,outros_pontos,
          saldo_banco_horas,combinado_mes,criado_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT (origem_id) DO UPDATE SET
         mes=EXCLUDED.mes, cargo_snapshot=EXCLUDED.cargo_snapshot, area_snapshot=EXCLUDED.area_snapshot,
         meta=EXCLUDED.meta, entregue=EXCLUDED.entregue, pontos_positivos=EXCLUDED.pontos_positivos,
         pontos_construtivos=EXCLUDED.pontos_construtivos, absenteismo_mes=EXCLUDED.absenteismo_mes,
         retorno_antecipado=EXCLUDED.retorno_antecipado, atrasos=EXCLUDED.atrasos,
         faltas_injustificadas=EXCLUDED.faltas_injustificadas, ausencias_justificadas=EXCLUDED.ausencias_justificadas,
         recorrencia_ausencia=EXCLUDED.recorrencia_ausencia, outros_pontos=EXCLUDED.outros_pontos,
         saldo_banco_horas=EXCLUDED.saldo_banco_horas, combinado_mes=EXCLUDED.combinado_mes`,
      [f.id, novoColabId, userMap[f.autor_user_id]||'', f.mes||'', f.cargo_snapshot||'', f.area_snapshot||'',
       f.meta??null, f.entregue??null, f.pontos_positivos||'', f.pontos_construtivos||'', f.absenteismo_mes||'',
       f.retorno_antecipado||'', f.atrasos??null, f.faltas_injustificadas??null, f.ausencias_justificadas??null,
       f.recorrencia_ausencia||'', f.outros_pontos||'', f.saldo_banco_horas||'', f.combinado_mes||'', f.created_at||new Date()]
    );
    ok++;
  }
  return { total: lista.length, migrados: ok, sem_colaborador: semColab };
}

async function _migrarRaci(client) {
  const areas = await mCall('GET', '/api/matriz');
  let totalAreas = 0, totalRoles = 0, totalAtividades = 0, totalStatus = 0;
  for (const area of areas) {
    const rArea = await client.query(
      `INSERT INTO mz_areas (origem_id,nome,ordem) VALUES ($1,$2,$3)
       ON CONFLICT (origem_id) DO UPDATE SET nome=EXCLUDED.nome, ordem=EXCLUDED.ordem
       RETURNING id`,
      [area.id, area.nome, area.ordem||0]
    );
    const novaAreaId = rArea.rows[0].id;
    totalAreas++;

    const roleMap = {};
    for (const role of area.roles) {
      const rRole = await client.query(
        `INSERT INTO mz_roles (origem_id,area_id,nome,ordem) VALUES ($1,$2,$3,$4)
         ON CONFLICT (origem_id) DO UPDATE SET area_id=EXCLUDED.area_id, nome=EXCLUDED.nome, ordem=EXCLUDED.ordem
         RETURNING id`,
        [role.id, novaAreaId, role.nome, role.ordem||0]
      );
      roleMap[role.id] = rRole.rows[0].id;
      totalRoles++;
    }

    for (const at of area.atividades) {
      const rAt = await client.query(
        `INSERT INTO mz_atividades (origem_id,area_id,nome,ordem,categoria,sugestao) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (origem_id) DO UPDATE SET
           area_id=EXCLUDED.area_id, nome=EXCLUDED.nome, ordem=EXCLUDED.ordem,
           categoria=EXCLUDED.categoria, sugestao=EXCLUDED.sugestao
         RETURNING id`,
        [at.id, novaAreaId, at.nome, at.ordem||0, at.categoria||null, at.sugestao||null]
      );
      const novaAtividadeId = rAt.rows[0].id;
      totalAtividades++;

      for (const st of at.status) {
        const novoRoleId = roleMap[st.role_id];
        if (!novoRoleId) continue;
        await client.query(
          `INSERT INTO mz_status (atividade_id,role_id,status) VALUES ($1,$2,$3)
           ON CONFLICT (atividade_id,role_id) DO UPDATE SET status=EXCLUDED.status`,
          [novaAtividadeId, novoRoleId, st.status]
        );
        totalStatus++;
      }
    }
  }
  return { areas: totalAreas, roles: totalRoles, atividades: totalAtividades, status: totalStatus };
}

async function _migrarCargos(client) {
  const lista = await mCall('GET', '/api/cargos');
  for (const c of lista) {
    await client.query(
      `INSERT INTO mz_cargos (origem_id,cargo,area,gestor,perfil,graduacoes,descricao,funcoes,formacao,tecnicas,comportamentais,atitudes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (origem_id) DO UPDATE SET
         cargo=EXCLUDED.cargo, area=EXCLUDED.area, gestor=EXCLUDED.gestor, perfil=EXCLUDED.perfil,
         graduacoes=EXCLUDED.graduacoes, descricao=EXCLUDED.descricao, funcoes=EXCLUDED.funcoes,
         formacao=EXCLUDED.formacao, tecnicas=EXCLUDED.tecnicas, comportamentais=EXCLUDED.comportamentais,
         atitudes=EXCLUDED.atitudes`,
      [c.id, c.cargo, c.area||'', c.gestor||'', c.perfil||'', JSON.stringify(c.graduacoes||[]), c.descricao||'',
       JSON.stringify(c.funcoes||[]), c.formacao||'', JSON.stringify(c.tecnicas||[]),
       JSON.stringify(c.comportamentais||[]), JSON.stringify(c.atitudes||[])]
    );
  }
  return { total: lista.length };
}

async function _migrarIncentivo(client) {
  const cfg = await mCall('GET', '/api/incentivo');
  const existente = await client.query('SELECT id FROM mz_incentivo_config LIMIT 1');
  const campos = ['abs_green','abs_yellow','abs_red','perf_green','perf_yellow','perf_red','comp_green','comp_yellow','comp_red'];
  const vals = campos.map(c => cfg[c]);
  if (existente.rows.length) {
    await client.query(
      `UPDATE mz_incentivo_config SET abs_green=$1,abs_yellow=$2,abs_red=$3,perf_green=$4,perf_yellow=$5,perf_red=$6,comp_green=$7,comp_yellow=$8,comp_red=$9 WHERE id=$10`,
      [...vals, existente.rows[0].id]
    );
  } else {
    await client.query(
      `INSERT INTO mz_incentivo_config (abs_green,abs_yellow,abs_red,perf_green,perf_yellow,perf_red,comp_green,comp_yellow,comp_red) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      vals
    );
  }
  return { ok: true };
}

async function _migrarCarreira(client) {
  const cfg = await mCall('GET', '/api/carreira');
  const existente = await client.query('SELECT id FROM mz_carreira_config LIMIT 1');
  if (existente.rows.length) {
    await client.query('UPDATE mz_carreira_config SET ladder=$1 WHERE id=$2', [JSON.stringify(cfg.ladder||{}), existente.rows[0].id]);
  } else {
    await client.query('INSERT INTO mz_carreira_config (ladder) VALUES ($1)', [JSON.stringify(cfg.ladder||{})]);
  }
  return { ok: true };
}

router.post('/matriz/migrar', requerAuth, requerPerfil('gestor'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const colaboradores = await _migrarColaboradores(client);
    const [bancoHoras, ferias, classificacoes, ausencias, feedbacks, raci, cargos, incentivo, carreira] = await Promise.all([
      _migrarBancoHoras(client, colaboradores.mapa),
      _migrarFerias(client, colaboradores.mapa),
      _migrarClassificacoes(client, colaboradores.mapa),
      _migrarAusencias(client, colaboradores.mapa),
      _migrarFeedbacks(client, colaboradores.mapa),
      _migrarRaci(client),
      _migrarCargos(client),
      _migrarIncentivo(client),
      _migrarCarreira(client),
    ]);
    await client.query('COMMIT');
    res.json({
      mensagem: 'Migração concluída!',
      colaboradores: colaboradores.total, banco_horas: bancoHoras, ferias, classificacoes,
      ausencias, feedbacks, raci, cargos, incentivo, carreira,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ erro: e.message });
  } finally {
    client.release();
  }
});

// Confere contagens dos dois lados lado a lado, pra validar a migração sem
// precisar acessar os dois sistemas manualmente.
router.get('/matriz/migrar/conferencia', requerAuth, requerPerfil('gestor'), async (req, res) => {
  try {
    const [origColab, origFb, origClass, origAus, origBh, origFer, origRaci, origCargos] = await Promise.all([
      mCall('GET', '/api/colaboradores'),
      mCall('GET', '/api/feedbacks'),
      mCall('GET', '/api/classificacoes'),
      mCall('GET', '/api/ausencias'),
      mCall('GET', '/api/banco-horas'),
      mCall('GET', '/api/ferias'),
      mCall('GET', '/api/matriz'),
      mCall('GET', '/api/cargos'),
    ]);
    const origStatus = origRaci.reduce((s,a) => s + a.atividades.reduce((s2,at) => s2 + at.status.length, 0), 0);
    const origRoles = origRaci.reduce((s,a) => s + a.roles.length, 0);
    const origAtividades = origRaci.reduce((s,a) => s + a.atividades.length, 0);

    const contar = async sql => parseInt((await db.get(sql)).n);
    res.json({
      colaboradores:   { origem: origColab.length, wms: await contar('SELECT COUNT(*) n FROM mz_colaboradores') },
      feedbacks:       { origem: origFb.length,    wms: await contar('SELECT COUNT(*) n FROM mz_feedbacks') },
      classificacoes:  { origem: origClass.length, wms: await contar('SELECT COUNT(*) n FROM mz_classificacoes') },
      ausencias:       { origem: origAus.length,   wms: await contar('SELECT COUNT(*) n FROM mz_ausencias') },
      banco_horas:     { origem: origBh.length,    wms: await contar('SELECT COUNT(*) n FROM mz_banco_horas') },
      ferias:          { origem: origFer.length,   wms: await contar('SELECT COUNT(*) n FROM mz_ferias') },
      raci_areas:      { origem: origRaci.length,  wms: await contar('SELECT COUNT(*) n FROM mz_areas') },
      raci_roles:      { origem: origRoles,        wms: await contar('SELECT COUNT(*) n FROM mz_roles') },
      raci_atividades: { origem: origAtividades,   wms: await contar('SELECT COUNT(*) n FROM mz_atividades') },
      raci_status:     { origem: origStatus,       wms: await contar('SELECT COUNT(*) n FROM mz_status') },
      cargos:          { origem: origCargos.length,wms: await contar('SELECT COUNT(*) n FROM mz_cargos') },
    });
  } catch (e) { res.status(502).json({ erro: e.message }); }
});

module.exports = router;
