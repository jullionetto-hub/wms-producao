'use strict';
const express = require('express');
const router  = express.Router();
const { pool, db } = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');
const { dataHoraLocal } = require('../lib/helpers');

// Formatos válidos de endereço:
//   D106                      → rua + número (A-Z, ZA, etc.)
//   U080                      → prateleira U
//   C099/VERT-C82-CX18        → rua + caixa vertical
//   U087/VERT-U01-CX13        → prateleira + caixa vertical
//   VERT-U09-CX11             → apenas caixa vertical
const ADDR_REGEX = /^([A-Z]{1,3}\d{1,4}(\/VERT-[A-Z]{1,3}\d{2}-CX\d{2,3})?|VERT-[A-Z]{1,3}\d{2}-CX\d{2,3})$/i;

function validarEndereco(end) {
  if (!end || !end.trim()) return { ok: false, tipo: 'vazio' };
  return ADDR_REGEX.test(end.trim().toUpperCase())
    ? { ok: true, tipo: 'valido' }
    : { ok: false, tipo: 'formato' };
}

// ── GET /entrada-manual/lotes ─────────────────────────────────────────────
router.get('/entrada-manual/lotes', requerAuth, async (req, res) => {
  const { ini, fim, status } = req.query;
  const { data: hoje } = dataHoraLocal();
  const dIni = ini || hoje;
  const dFim = fim || hoje;
  try {
    const params = [dIni, dFim];
    let extra = '';
    if (status) { params.push(status); extra = ` AND l.status=$${params.length}`; }

    const lotes = await db.all(`
      SELECT l.*,
        COUNT(i.id)::int                                               AS total_itens,
        COUNT(i.id) FILTER (WHERE i.status='abastecido')::int          AS itens_abastecidos,
        COUNT(i.id) FILTER (WHERE i.status='parcial')::int             AS itens_parciais,
        COUNT(i.id) FILTER (WHERE i.status='nao_encontrado')::int      AS itens_nao_encontrados,
        COUNT(i.id) FILTER (WHERE i.status='pendente')::int            AS itens_pendentes
      FROM entrada_manual_lotes l
      LEFT JOIN entrada_manual_itens i ON i.lote_id=l.id
      WHERE l.data_entrada>=$1 AND l.data_entrada<=$2${extra}
      GROUP BY l.id
      ORDER BY l.criado_em DESC
    `, params);
    res.json(lotes);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── POST /entrada-manual/lotes — Criar lote com itens ─────────────────────
router.post('/entrada-manual/lotes', requerAuth, async (req, res) => {
  const { nome, data_entrada, responsavel, itens } = req.body;
  if (!Array.isArray(itens) || !itens.length)
    return res.status(400).json({ erro: 'Informe ao menos um item.' });

  const { data: hoje } = dataHoraLocal();
  const criado_por = req.session?.usuario?.nome || '';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO entrada_manual_lotes (nome,data_entrada,criado_por,responsavel,total_itens,status)
       VALUES ($1,$2,$3,$4,$5,'aberto') RETURNING id`,
      [nome || `Entrada ${hoje}`, data_entrada || hoje, criado_por,
       responsavel || criado_por, itens.length]
    );
    const loteId = r.rows[0].id;

    for (const it of itens) {
      await client.query(
        `INSERT INTO entrada_manual_itens (lote_id,codigo,descricao,quantidade_esperada,endereco,status)
         VALUES ($1,$2,$3,$4,$5,'pendente')`,
        [loteId, String(it.codigo||'').trim().toUpperCase(),
         String(it.descricao||'').trim(),
         parseInt(it.quantidade)||1,
         String(it.endereco||'').trim().toUpperCase()]
      );
    }
    await client.query('COMMIT');
    res.json({ id: loteId, total: itens.length, mensagem: 'Lote criado!' });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(500).json({ erro: e.message });
  } finally { client.release(); }
});

// ── GET /entrada-manual/lotes/:id — Lote + todos os itens ─────────────────
router.get('/entrada-manual/lotes/:id', requerAuth, async (req, res) => {
  try {
    const lote = await db.get(`SELECT * FROM entrada_manual_lotes WHERE id=$1`, [req.params.id]);
    if (!lote) return res.status(404).json({ erro: 'Lote não encontrado.' });
    const itens = await db.all(
      `SELECT * FROM entrada_manual_itens WHERE lote_id=$1 ORDER BY id`,
      [req.params.id]
    );
    res.json({ ...lote, itens });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── PUT /entrada-manual/itens/:id — Salvar progresso de um item ───────────
router.put('/entrada-manual/itens/:id', requerAuth, async (req, res) => {
  const { quantidade_abastecida, endereco, obs } = req.body;
  const responsavel = req.session?.usuario?.nome || '';
  try {
    const item = await db.get(`SELECT * FROM entrada_manual_itens WHERE id=$1`, [req.params.id]);
    if (!item) return res.status(404).json({ erro: 'Item não encontrado.' });

    // Validação de endereço
    const endNorm = endereco !== undefined ? String(endereco).trim().toUpperCase() : item.endereco;
    const vEnd = validarEndereco(endNorm);
    if (endereco !== undefined && !vEnd.ok)
      return res.status(400).json({ erro: 'Endereço inválido. Use o formato U080 ou U087/VERT-U01-CX13.' });

    // Status automático por quantidade
    const qtd = quantidade_abastecida !== undefined ? parseInt(quantidade_abastecida) : item.quantidade_abastecida;
    let novoStatus;
    if (qtd === 0)                           novoStatus = 'nao_encontrado';
    else if (qtd >= item.quantidade_esperada) novoStatus = 'abastecido';
    else                                      novoStatus = 'parcial';

    await pool.query(
      `UPDATE entrada_manual_itens
       SET quantidade_abastecida=$1, endereco=$2, status=$3,
           obs=COALESCE($4,obs), responsavel=$5, confirmado_em=NOW()
       WHERE id=$6`,
      [qtd, endNorm, novoStatus, obs !== undefined ? obs : null,
       responsavel, req.params.id]
    );

    // Recalcula lote
    const resumo = await db.get(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status!='pendente')::int AS concluidos
      FROM entrada_manual_itens WHERE lote_id=$1`, [item.lote_id]);
    const loteStatus = resumo.total === resumo.concluidos ? 'concluido' : 'aberto';
    await pool.query(
      `UPDATE entrada_manual_lotes SET itens_concluidos=$1, status=$2 WHERE id=$3`,
      [resumo.concluidos, loteStatus, item.lote_id]
    );

    res.json({ mensagem: 'Salvo!', status: novoStatus, lote_status: loteStatus,
               itens_concluidos: resumo.concluidos, total_itens: resumo.total });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── DELETE /entrada-manual/lotes/:id — Excluir lote ──────────────────────
router.delete('/entrada-manual/lotes/:id', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    await pool.query(`DELETE FROM entrada_manual_lotes WHERE id=$1`, [req.params.id]);
    res.json({ mensagem: 'Lote excluído.' });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── GET /entrada-manual/historico-endereco/:codigo ─────────────────────────
// Retorna o endereço mais usado para o código informado (para validação cruzada)
router.get('/entrada-manual/historico-endereco/:codigo', requerAuth, async (req, res) => {
  try {
    const row = await db.get(`
      SELECT endereco, COUNT(*)::int AS vezes,
             MAX(confirmado_em) AS ultimo_uso
      FROM entrada_manual_itens
      WHERE codigo=$1 AND status IN ('abastecido','parcial') AND endereco!=''
      GROUP BY endereco
      ORDER BY vezes DESC, ultimo_uso DESC
      LIMIT 1
    `, [req.params.codigo.toUpperCase()]);
    res.json(row || null);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── POST /entrada-manual/validar-endereco ─────────────────────────────────
router.post('/entrada-manual/validar-endereco', requerAuth, async (req, res) => {
  const { codigo, endereco } = req.body;
  const endNorm = String(endereco || '').trim().toUpperCase();
  const vEnd = validarEndereco(endNorm);

  if (!vEnd.ok) return res.json({ valido: false, nivel: 'erro', mensagem: 'Formato inválido. Ex: U080 ou U087/VERT-U01-CX13' });

  // Checa histórico
  const hist = await db.get(`
    SELECT endereco, COUNT(*)::int AS vezes
    FROM entrada_manual_itens
    WHERE codigo=$1 AND status IN ('abastecido','parcial') AND endereco!=''
    GROUP BY endereco ORDER BY vezes DESC LIMIT 1
  `, [String(codigo||'').trim().toUpperCase()]).catch(() => null);

  if (hist && hist.endereco !== endNorm) {
    return res.json({ valido: true, nivel: 'aviso',
      mensagem: `Endereço diferente do histórico (usual: ${hist.endereco})`,
      historico: hist.endereco });
  }
  res.json({ valido: true, nivel: 'ok', mensagem: hist ? 'Endereço confirmado pelo histórico' : 'Formato válido' });
});

// ── GET /entrada-manual/exportar — Download CSV ───────────────────────────
router.get('/entrada-manual/exportar', requerAuth, async (req, res) => {
  const { ini, fim, lote_id } = req.query;
  const { data: hoje } = dataHoraLocal();
  try {
    const params = [];
    let where = '1=1';
    if (lote_id) { params.push(lote_id); where += ` AND i.lote_id=$${params.length}`; }
    else {
      params.push(ini || hoje); where += ` AND l.data_entrada>=$${params.length}`;
      params.push(fim || hoje); where += ` AND l.data_entrada<=$${params.length}`;
    }

    const rows = await db.all(`
      SELECT TO_CHAR(l.data_entrada, 'DD/MM/YYYY') AS data_fmt,
             l.criado_por,
             i.codigo, i.descricao, i.quantidade_esperada, i.quantidade_abastecida,
             i.endereco, i.status, i.responsavel, i.obs,
             TO_CHAR(i.confirmado_em AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI') AS confirmado_em
      FROM entrada_manual_itens i
      JOIN entrada_manual_lotes l ON l.id=i.lote_id
      WHERE ${where}
      ORDER BY l.data_entrada DESC, l.id, i.id
    `, params);

    const SEP = ';';
    const statusPT = { abastecido:'Abastecido', parcial:'Parcial', pendente:'Pendente', nao_encontrado:'Não encontrado' };
    const esc = v => { const s = String(v??''); return /[;\n"]/g.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
    const hdrs = ['Data','Responsável','Código','Descrição','Qtd Esperada','Qtd Abastecida','Endereço','Status','Confirmado Em','Obs'];
    const lines = [hdrs.join(SEP)];
    for (const r of rows) {
      lines.push([r.data_fmt, r.criado_por, r.codigo, r.descricao,
        r.quantidade_esperada, r.quantidade_abastecida||0, r.endereco,
        statusPT[r.status]||r.status, r.confirmado_em||'', r.obs||''].map(esc).join(SEP));
    }
    const csv = '﻿' + lines.join('\r\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition',`attachment; filename="entrada-manual-${hoje}.csv"`);
    res.send(csv);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
