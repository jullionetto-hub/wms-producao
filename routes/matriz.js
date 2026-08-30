'use strict';
const express = require('express');
const router  = express.Router();
const { requerAuth, requerPerfil } = require('../lib/auth');

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

module.exports = router;
