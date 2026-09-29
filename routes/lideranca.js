'use strict';
const express = require('express');
const router  = express.Router();
const { db }  = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');

const TURNOS = ['Manha', 'Tarde', 'Noite'];
const ISO    = /^\d{4}-\d{2}-\d{2}$/;

function normTurno(t) {
  const s = String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return s.startsWith('tar') ? 'Tarde' : s.startsWith('noi') ? 'Noite' : 'Manha';
}

// ── GET /lideranca/turnos?ini=YYYY-MM-DD&fim=YYYY-MM-DD[&turno=Manha] ────────
// Um registro por (data, turno) juntando passagem de turno, diário de bordo e
// as validações de ambos. A nota é calculada no front (metas/pesos configuráveis).
router.get('/lideranca/turnos', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  const { ini, fim } = req.query;
  if (!ISO.test(ini || '') || !ISO.test(fim || '')) return res.status(400).json({ erro: 'Informe ini e fim (YYYY-MM-DD).' });
  const turno = req.query.turno ? normTurno(req.query.turno) : null;

  try {
    const diarios = await db.all(`
      SELECT d.id, d.data, d.turno, d.supervisor, d.status, d.leu_anterior, d.enviado_em,
             v.status AS val_status, v.pontuacao, v.validador, v.validado_em, v.prazo, v.itens
      FROM diario_bordo d
      LEFT JOIN diario_validacoes v ON v.diario_id = d.id
      WHERE d.data >= $1 AND d.data <= $2
    `, [ini, fim]);

    const passagens = await db.all(`
      SELECT p.id, p.data, p.turno, p.supervisor, p.status, p.sep_separados, p.ck_feitos, p.emb_embalados,
             p.separadores_presentes, p.ocorrencias,
             v.pontos_perdidos, v.supervisor_entrando, v.validado_em
      FROM passagem_turno p
      LEFT JOIN validacao_passagem v ON v.passagem_id = p.id
      WHERE p.data >= $1 AND p.data <= $2
    `, [ini, fim]);

    const mapa = new Map();
    const chave = (data, t) => `${data}|${normTurno(t)}`;
    const base  = (data, t) => {
      const k = chave(data, t);
      if (!mapa.has(k)) mapa.set(k, { data, turno: normTurno(t), supervisor: '' });
      return mapa.get(k);
    };

    for (const p of passagens) {
      const r = base(p.data, p.turno);
      r.supervisor = p.supervisor || r.supervisor;
      Object.assign(r, {
        pedidos: p.sep_separados || 0,
        checkouts: p.ck_feitos || 0,
        embalados: p.emb_embalados || 0,
        presentes: String(p.separadores_presentes || '').split(',').map(s => s.trim()).filter(Boolean).length,
        ocorrencias: p.ocorrencias || '',
        passagemStatus: p.status,
        pontosPerdidos: p.pontos_perdidos == null ? null : Number(p.pontos_perdidos),
        passagemValidador: p.supervisor_entrando || '',
      });
    }
    for (const d of diarios) {
      const r = base(d.data, d.turno);
      r.supervisor = r.supervisor || d.supervisor;
      let itens = d.itens;
      if (typeof itens === 'string') { try { itens = JSON.parse(itens); } catch { itens = []; } }
      Object.assign(r, {
        diarioStatus: d.status,
        diarioLeuAnterior: !!d.leu_anterior,
        diarioEnviadoEm: d.enviado_em,
        diarioNota: d.pontuacao == null ? null : Number(d.pontuacao),
        diarioValidador: d.validador || '',
        diarioFalhas: Array.isArray(itens) ? itens.filter(i => i && i.passou === false).map(i => i.id) : [],
      });
    }

    const lista = [...mapa.values()]
      .filter(r => r.supervisor && (!turno || r.turno === turno) && TURNOS.includes(r.turno))
      .map(r => ({
        pedidos: 0, checkouts: 0, embalados: 0, presentes: 0, ocorrencias: '',
        passagemStatus: 'ausente', pontosPerdidos: null, passagemValidador: '',
        diarioStatus: 'ausente', diarioLeuAnterior: false, diarioEnviadoEm: null, diarioNota: null, diarioValidador: '', diarioFalhas: [],
        ...r,
      }))
      .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : TURNOS.indexOf(a.turno) - TURNOS.indexOf(b.turno)));

    res.json(lista);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
