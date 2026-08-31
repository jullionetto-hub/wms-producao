'use strict';
const express = require('express');
const router  = express.Router();
const { requerAuth, requerPerfil } = require('../lib/auth');
const { db, pool } = require('../lib/db');

const ABS_URL   = (process.env.ABS_API_URL   || 'https://backend-production-e7bdc.up.railway.app').replace(/\/$/, '');
const ABS_EMAIL = process.env.ABS_EMAIL    || '';
const ABS_PASS  = process.env.ABS_PASSWORD || '';

let _absToken    = null;
let _absTokenExp = 0;

async function getAbsToken() {
  if (_absToken && Date.now() < _absTokenExp) return _absToken;
  if (!ABS_EMAIL || !ABS_PASS) throw new Error('Credenciais do absenteísmo não configuradas (ABS_EMAIL / ABS_PASSWORD)');
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

/* ─── Rotas Matriz ─── lê/grava direto no banco do WMS (mz_colaboradores/mz_feedbacks),
   não fazem mais proxy pro serviço externo — a Matriz de Responsabilidades já roda
   nativamente dentro do WMS (ver routes/matriz.js). */
router.get('/gestao/absenteismo/matriz/colaboradores', requerAuth, requerGestor, async (_req, res) => {
  try { res.json(await db.all('SELECT id,nome,cargo,tier,area,turno,ativo,vaga FROM mz_colaboradores ORDER BY nome')); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

router.get('/gestao/absenteismo/matriz/feedbacks', requerAuth, requerGestor, async (_req, res) => {
  try { res.json(await db.all('SELECT *, criado_em AS created_at FROM mz_feedbacks ORDER BY criado_em DESC')); }
  catch (e) { res.status(502).json({ erro: e.message }); }
});

router.post('/gestao/absenteismo/exportar-matriz', requerAuth, requerGestor,
  express.json(),
  async (req, res) => {
    try {
      const { colaborador_id, mes, atrasos, faltas_injustificadas, ausencias_justificadas, absenteismo_mes, feedback_id } = req.body;
      if (!colaborador_id) return res.status(400).json({ erro: 'colaborador_id obrigatório' });
      let result;
      if (feedback_id) {
        // Atualiza só os campos de absenteísmo — preserva o resto do feedback (pontos positivos, combinado etc).
        // Exige colaborador_id igual ao do feedback: se o usuário trocou a seleção no dropdown antes de
        // confirmar, feedback_id (fixado ao abrir o modal) não pertence mais à pessoa escolhida — nesse
        // caso cai no INSERT abaixo em vez de gravar por cima do registro de outra pessoa.
        const r = await pool.query(
          `UPDATE mz_feedbacks SET mes=$1, atrasos=$2, faltas_injustificadas=$3, ausencias_justificadas=$4, absenteismo_mes=$5
           WHERE id=$6 AND colaborador_id=$7 RETURNING *`,
          [mes||'', atrasos??null, faltas_injustificadas??null, ausencias_justificadas??null, absenteismo_mes||'', feedback_id, colaborador_id]
        );
        result = r.rows[0];
      }
      if (!result) {
        const r = await pool.query(
          `INSERT INTO mz_feedbacks (colaborador_id, mes, atrasos, faltas_injustificadas, ausencias_justificadas, absenteismo_mes)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [colaborador_id, mes||'', atrasos??null, faltas_injustificadas??null, ausencias_justificadas??null, absenteismo_mes||'']
        );
        result = r.rows[0];
      }
      res.json(result);
    } catch (e) { res.status(502).json({ erro: e.message }); }
  }
);

module.exports = router;
