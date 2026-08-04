'use strict';
const express = require('express');
const router  = express.Router();
const { requerAuth, requerPerfil } = require('../lib/auth');

const ABS_URL   = (process.env.ABS_API_URL   || 'https://backend-production-e7bdc.up.railway.app').replace(/\/$/, '');
const ABS_EMAIL = process.env.ABS_EMAIL    || 'jotaceene1987@gmail.com';
const ABS_PASS  = process.env.ABS_PASSWORD || 'Admin@2024!Secure';

let _absToken    = null;
let _absTokenExp = 0;

async function getAbsToken() {
  if (_absToken && Date.now() < _absTokenExp) return _absToken;
  const res = await fetch(`${ABS_URL}/api/auth/login`, {
    method : 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body   : `username=${encodeURIComponent(ABS_EMAIL)}&password=${encodeURIComponent(ABS_PASS)}`,
  });
  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = j.detail || JSON.stringify(j); } catch {}
    throw new Error(`Auth absenteísmo ${res.status}: ${detail}`);
  }
  const { access_token } = await res.json();
  _absToken    = access_token;
  _absTokenExp = Date.now() + 50 * 60 * 1000;
  return _absToken;
}

async function absProxy(path, query = {}) {
  const token = await getAbsToken();
  const clean = Object.fromEntries(Object.entries(query).filter(([, v]) => v != null && v !== ''));
  const qs    = new URLSearchParams(clean).toString();
  const url   = `${ABS_URL}${path}${qs ? '?' + qs : ''}`;
  const res   = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = j.detail || JSON.stringify(j); } catch {}
    throw new Error(`API absenteísmo ${res.status}: ${detail}`);
  }
  return res.json();
}

/* ─── Matriz de Responsabilidades — proxy ─── */
const MATRIZ_URL  = (process.env.MATRIZ_URL || 'https://matriz-responsabilidades-production.up.railway.app').replace(/\/$/, '');
const MATRIZ_USER = process.env.MATRIZ_EMAIL    || '';
const MATRIZ_PASS = process.env.MATRIZ_PASSWORD || '';

let _matrizToken    = null;
let _matrizTokenExp = 0;

async function getMatrizToken() {
  if (_matrizToken && Date.now() < _matrizTokenExp) return _matrizToken;
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
  _matrizToken    = access_token;
  _matrizTokenExp = Date.now() + 50 * 60 * 1000;
  return _matrizToken;
}

async function matrizGet(path) {
  const token = await getMatrizToken();
  const res = await fetch(`${MATRIZ_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { let d=''; try{d=(await res.json()).detail||'';}catch{} throw new Error(`Matriz ${res.status}: ${d}`); }
  return res.json();
}

async function matrizSend(method, path, body) {
  const token = await getMatrizToken();
  const res = await fetch(`${MATRIZ_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) { let d=''; try{d=(await res.json()).detail||'';}catch{} throw new Error(`Matriz ${res.status}: ${d}`); }
  return res.status === 204 ? null : res.json();
}

const requerGestor = requerPerfil('gestor', 'supervisor');

router.get('/gestao/absenteismo/team', requerAuth, requerGestor, async (req, res) => {
  const { start_date, end_date, upload_id, include_records } = req.query;
  try { res.json(await absProxy('/api/reports/team', { start_date, end_date, upload_id, include_records })); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

router.get('/gestao/absenteismo/ranking', requerAuth, requerGestor, async (_req, res) => {
  try { res.json(await absProxy('/api/reports/ranking?limit=50')); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

router.get('/gestao/absenteismo/setor',  requerAuth, requerGestor, async (_req, res) => {
  try { res.json(await absProxy('/api/reports/summary-by-sector')); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

router.get('/gestao/absenteismo/funcionario/:id', requerAuth, requerGestor, async (req, res) => {
  const { start_date, end_date, matricula } = req.query;
  try { res.json(await absProxy(`/api/reports/employee/${req.params.id}`, { start_date, end_date, matricula })); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

// Proxy de upload — repassa o multipart raw para o FastAPI
router.post('/gestao/absenteismo/upload',
  requerAuth, requerGestor,
  express.raw({ type: '*/*', limit: '30mb' }),
  async (req, res) => {
    try {
      const token = await getAbsToken();
      const r = await fetch(`${ABS_URL}/api/upload`, {
        method : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': req.headers['content-type'] },
        body   : req.body,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(r.status).json({ erro: data.detail || 'Erro no upload' });
      res.json(data);
    } catch (e) { res.status(502).json({ erro: e.message }); }
  }
);

router.get('/gestao/absenteismo/relatorio', requerAuth, requerGestor, async (req, res) => {
  const { start_date, end_date } = req.query;
  try { res.json(await absProxy('/api/reports/delays-report', { start_date, end_date })); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

router.get('/gestao/absenteismo/historico', requerAuth, requerGestor, async (_req, res) => {
  try { res.json(await absProxy('/api/reports/history')); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

router.get('/gestao/absenteismo/uploads', requerAuth, requerGestor, async (_req, res) => {
  try { res.json(await absProxy('/api/uploads')); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

router.delete('/gestao/absenteismo/uploads/all', requerAuth, requerGestor, async (_req, res) => {
  try {
    const token = await getAbsToken();
    const r = await fetch(`${ABS_URL}/api/uploads/all`, {
      method : 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    res.status(r.status).json(await r.json().catch(() => ({})));
  } catch (e) { res.status(502).json({ erro: e.message }); }
});

router.delete('/gestao/absenteismo/uploads/:id', requerAuth, requerGestor, async (req, res) => {
  try {
    const token = await getAbsToken();
    const r = await fetch(`${ABS_URL}/api/uploads/${req.params.id}`, {
      method : 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    res.status(r.status).json(await r.json().catch(() => ({})));
  } catch (e) { res.status(502).json({ erro: e.message }); }
});

router.delete('/gestao/absenteismo/funcionarios/batch', requerAuth, requerGestor,
  express.json(),
  async (req, res) => {
    try {
      const token = await getAbsToken();
      const r = await fetch(`${ABS_URL}/api/employees/batch`, {
        method : 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body   : JSON.stringify(req.body),
      });
      res.status(r.status).json(await r.json().catch(() => ({})));
    } catch (e) { res.status(502).json({ erro: e.message }); }
  }
);

/* ─── Rotas Matriz ─── */
router.get('/gestao/absenteismo/matriz/colaboradores', requerAuth, requerGestor, async (_req, res) => {
  try { res.json(await matrizGet('/api/colaboradores')); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

router.get('/gestao/absenteismo/matriz/feedbacks', requerAuth, requerGestor, async (_req, res) => {
  try { res.json(await matrizGet('/api/feedbacks')); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

router.post('/gestao/absenteismo/exportar-matriz', requerAuth, requerGestor,
  express.json(),
  async (req, res) => {
    try {
      const { colaborador_id, mes, atrasos, faltas_injustificadas, ausencias_justificadas, absenteismo_mes, feedback_id } = req.body;
      if (!colaborador_id) return res.status(400).json({ erro: 'colaborador_id obrigatório' });
      const payload = { colaborador_id, mes, atrasos, faltas_injustificadas, ausencias_justificadas, absenteismo_mes };
      const result  = feedback_id
        ? await matrizSend('PATCH', `/api/feedbacks/${feedback_id}`, payload)
        : await matrizSend('POST',  '/api/feedbacks', payload);
      res.json(result || { ok: true });
    } catch (e) { res.status(502).json({ erro: e.message }); }
  }
);

module.exports = router;
