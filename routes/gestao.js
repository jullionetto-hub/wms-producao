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
  const res = await fetch(`${ABS_URL}/login`, {
    method : 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body   : `username=${encodeURIComponent(ABS_EMAIL)}&password=${encodeURIComponent(ABS_PASS)}`,
  });
  if (!res.ok) throw new Error('Falha ao autenticar no sistema de absenteísmo');
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
  if (!res.ok) throw new Error(`Absenteísmo API: ${res.status}`);
  return res.json();
}

const requerGestor = requerPerfil('gestor', 'supervisor');

router.get('/gestao/absenteismo/team',    requerAuth, requerGestor, async (_req, res) => {
  try { res.json(await absProxy('/reports/team')); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

router.get('/gestao/absenteismo/ranking', requerAuth, requerGestor, async (_req, res) => {
  try { res.json(await absProxy('/reports/ranking?limit=50')); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

router.get('/gestao/absenteismo/setor',  requerAuth, requerGestor, async (_req, res) => {
  try { res.json(await absProxy('/reports/summary-by-sector')); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

router.get('/gestao/absenteismo/funcionario/:id', requerAuth, requerGestor, async (req, res) => {
  try { res.json(await absProxy(`/reports/employee/${req.params.id}`)); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

module.exports = router;
