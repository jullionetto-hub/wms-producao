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

async function absProxy(path) {
  const token = await getAbsToken();
  const res = await fetch(`${ABS_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = j.detail || JSON.stringify(j); } catch {}
    throw new Error(`API absenteísmo ${res.status}: ${detail}`);
  }
  return res.json();
}

const requerGestor = requerPerfil('gestor', 'supervisor');

router.get('/gestao/absenteismo/team',    requerAuth, requerGestor, async (_req, res) => {
  try { res.json(await absProxy('/api/reports/team')); }
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
  try { res.json(await absProxy(`/api/reports/employee/${req.params.id}`)); }
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

router.get('/gestao/absenteismo/uploads', requerAuth, requerGestor, async (_req, res) => {
  try { res.json(await absProxy('/api/uploads')); }
  catch (e) { res.status(502).json({ erro: e.message }); }
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

module.exports = router;
