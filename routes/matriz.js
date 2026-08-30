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

function proxy(method, wmsPath, matrizPathFn, gate) {
  router[method](wmsPath, requerAuth, gate, async (req, res) => {
    try {
      const path = matrizPathFn(req);
      const body = ['post', 'put', 'patch'].includes(method) ? req.body : undefined;
      const data = await mCall(method.toUpperCase(), path, body);
      res.status(method === 'post' ? 201 : 200).json(data ?? { ok: true });
    } catch (e) { res.status(e.status || 502).json({ erro: e.message }); }
  });
}

const gLeitura = requerPerfil('gestor', 'supervisor'); // leitura + edição de escopo (turno)
const gGestor  = requerPerfil('gestor');                // "referência": RACI, cargos, incentivo, carreira

/* Colaboradores */
proxy('get',    '/matriz/colaboradores',           () => '/api/colaboradores', gLeitura);
proxy('post',   '/matriz/colaboradores',           () => '/api/colaboradores', gLeitura);
proxy('patch',  '/matriz/colaboradores/:id',       r  => `/api/colaboradores/${r.params.id}`, gLeitura);
proxy('delete', '/matriz/colaboradores/:id',       r  => `/api/colaboradores/${r.params.id}`, gLeitura);

/* Feedbacks */
proxy('get',    '/matriz/feedbacks',               () => '/api/feedbacks', gLeitura);
proxy('post',   '/matriz/feedbacks',               () => '/api/feedbacks', gLeitura);
proxy('patch',  '/matriz/feedbacks/:id',           r  => `/api/feedbacks/${r.params.id}`, gLeitura);
proxy('delete', '/matriz/feedbacks/:id',           r  => `/api/feedbacks/${r.params.id}`, gLeitura);

/* Classificações mensais (upsert único) */
proxy('get',    '/matriz/classificacoes',          () => '/api/classificacoes', gLeitura);
proxy('put',    '/matriz/classificacoes',          () => '/api/classificacoes', gLeitura);

/* Ausências */
proxy('get',    '/matriz/ausencias',               () => '/api/ausencias', gLeitura);
proxy('post',   '/matriz/ausencias',                () => '/api/ausencias', gLeitura);
proxy('patch',  '/matriz/ausencias/:id',            r  => `/api/ausencias/${r.params.id}`, gLeitura);
proxy('delete', '/matriz/ausencias/:id',            r  => `/api/ausencias/${r.params.id}`, gLeitura);

/* Banco de horas */
proxy('get',    '/matriz/banco-horas',              () => '/api/banco-horas', gLeitura);
proxy('put',    '/matriz/banco-horas',              () => '/api/banco-horas', gLeitura);
proxy('get',    '/matriz/banco-horas/periodo',      () => '/api/banco-horas/periodo', gLeitura);
proxy('put',    '/matriz/banco-horas/periodo',      () => '/api/banco-horas/periodo', gGestor);

/* Férias */
proxy('get',    '/matriz/ferias',                   () => '/api/ferias', gLeitura);
proxy('put',    '/matriz/ferias',                   () => '/api/ferias', gLeitura);

/* Matriz RACI (áreas → cargos → atividades → status) */
proxy('get',    '/matriz/raci',                     () => '/api/matriz', gLeitura);
proxy('post',   '/matriz/raci',                     () => '/api/matriz', gGestor);
proxy('post',   '/matriz/raci/areas/:areaId/roles',        r => `/api/matriz/${r.params.areaId}/roles?nome=${encodeURIComponent(r.body?.nome||'')}`, gGestor);
proxy('post',   '/matriz/raci/areas/:areaId/atividades',   r => `/api/matriz/${r.params.areaId}/atividades`, gGestor);
proxy('patch',  '/matriz/raci/atividades/:id',              r => `/api/matriz/atividades/${r.params.id}`, gGestor);
proxy('delete', '/matriz/raci/atividades/:id',              r => `/api/matriz/atividades/${r.params.id}`, gGestor);
proxy('put',    '/matriz/raci/atividades/:id/status',       r => `/api/matriz/atividades/${r.params.id}/status?role_id=${r.body?.role_id}&status=${encodeURIComponent(r.body?.status||'')}`, gGestor);

/* Cargos (descrição de cargo/job description) */
proxy('get',    '/matriz/cargos',                   () => '/api/cargos', gLeitura);
proxy('post',   '/matriz/cargos',                   () => '/api/cargos', gGestor);
proxy('patch',  '/matriz/cargos/:id',               r  => `/api/cargos/${r.params.id}`, gGestor);
proxy('delete', '/matriz/cargos/:id',               r  => `/api/cargos/${r.params.id}`, gGestor);

/* Incentivo (pontuação por critério) */
proxy('get',    '/matriz/incentivo',                () => '/api/incentivo', gLeitura);
proxy('put',    '/matriz/incentivo',                () => '/api/incentivo', gGestor);

/* Carreira (trilha por área) */
proxy('get',    '/matriz/carreira',                 () => '/api/carreira', gLeitura);
proxy('put',    '/matriz/carreira',                 () => '/api/carreira', gGestor);

/* Usuários da Matriz (gerente/coordenador/supervisor de lá — cadastro à parte) */
proxy('get',    '/matriz/usuarios',                 () => '/api/usuarios', gGestor);
proxy('post',   '/matriz/usuarios',                 () => '/api/usuarios', gGestor);
proxy('patch',  '/matriz/usuarios/:id',             r  => `/api/usuarios/${r.params.id}`, gGestor);
proxy('delete', '/matriz/usuarios/:id',             r  => `/api/usuarios/${r.params.id}`, gGestor);

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
