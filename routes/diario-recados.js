/* ══ Recado da gestão no Diário de Bordo — routes/diario-recados.js ══
   Uma informação (título, texto e fotos) que aparece no Diário de Bordo dos 3 turnos de uma vez, até a gestão
   encerrar. Os diários continuam sendo por data + turno; o recado é à parte.
   Ler: supervisor e gestor (quem usa o Diário). Criar/editar/encerrar/fotos: só gestor.
   Prefixo /diario-recados (não /diario/…): /diario/:id captura qualquer coisa depois de /diario/. */
'use strict';
const express = require('express');
const router  = express.Router();
const { db, pool } = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');
const { validarId } = require('../lib/helpers');
const { registrarAuditoria } = require('../lib/auditoria');

const FOTO_MAX_BYTES = 2 * 1024 * 1024;
const FOTO_MAX_POR_RECADO = 12;
const FOTO_TIPOS = ['image/jpeg', 'image/png', 'image/webp'];
const TITULO_MAX = 120, TEXTO_MAX = 4000;

const dadosRecado = body => {
  const titulo = String(body?.titulo ?? '').trim().slice(0, TITULO_MAX);
  const texto  = String(body?.texto ?? '').trim();
  return { titulo, texto };
};

// Recados ativos, mais novos primeiro, já com os ids das fotos
router.get('/diario-recados', requerAuth, requerPerfil('supervisor'), async (_req, res) => {
  try {
    const recados = await db.all(`SELECT id, titulo, texto, autor, criado_em, editado_em FROM diario_recados WHERE ativo=true ORDER BY criado_em DESC, id DESC`);
    if (recados.length) {
      const fotos = await db.all(`SELECT id, recado_id FROM diario_recado_fotos WHERE recado_id = ANY($1::int[]) ORDER BY id`, [recados.map(r => r.id)]);
      recados.forEach(r => { r.fotos = fotos.filter(f => f.recado_id === r.id).map(f => ({ id: f.id })); });
    }
    res.json(recados);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.post('/diario-recados', requerAuth, requerPerfil('gestor'), async (req, res) => {
  try {
    const { titulo, texto } = dadosRecado(req.body);
    if (!texto) return res.status(400).json({ erro: 'Escreva o texto do recado.' });
    if (texto.length > TEXTO_MAX) return res.status(400).json({ erro: `Texto muito longo (máximo ${TEXTO_MAX} caracteres).` });
    const autor = req.session?.usuario?.nome || '';
    const r = await pool.query('INSERT INTO diario_recados (titulo, texto, autor) VALUES ($1,$2,$3) RETURNING id', [titulo, texto, autor]);
    await registrarAuditoria(req, 'RECADO_DIARIO_CRIADO', 'diario_recado', r.rows[0].id, null, { titulo });
    res.status(201).json({ id: r.rows[0].id });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.put('/diario-recados/:id', requerAuth, requerPerfil('gestor'), async (req, res) => {
  try {
    const id = validarId(req.params.id); if (!id) return res.status(400).json({ erro: 'ID inválido' });
    const { titulo, texto } = dadosRecado(req.body);
    if (!texto) return res.status(400).json({ erro: 'Escreva o texto do recado.' });
    if (texto.length > TEXTO_MAX) return res.status(400).json({ erro: `Texto muito longo (máximo ${TEXTO_MAX} caracteres).` });
    const r = await pool.query('UPDATE diario_recados SET titulo=$1, texto=$2, editado_em=NOW() WHERE id=$3 AND ativo=true RETURNING id', [titulo, texto, id]);
    if (!r.rows[0]) return res.status(404).json({ erro: 'Recado não encontrado ou já encerrado.' });
    await registrarAuditoria(req, 'RECADO_DIARIO_EDITADO', 'diario_recado', id, null, { titulo });
    res.json({ mensagem: 'Recado atualizado!' });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// "Encerrar" tira o recado da tela dos turnos (não apaga: fica guardado como inativo)
router.delete('/diario-recados/:id', requerAuth, requerPerfil('gestor'), async (req, res) => {
  try {
    const id = validarId(req.params.id); if (!id) return res.status(400).json({ erro: 'ID inválido' });
    const r = await pool.query('UPDATE diario_recados SET ativo=false, encerrado_em=NOW() WHERE id=$1 AND ativo=true RETURNING id', [id]);
    if (!r.rows[0]) return res.status(404).json({ erro: 'Recado não encontrado ou já encerrado.' });
    await registrarAuditoria(req, 'RECADO_DIARIO_ENCERRADO', 'diario_recado', id, null, null);
    res.json({ mensagem: 'Recado encerrado.' });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.post('/diario-recados/:id/fotos', requerAuth, requerPerfil('gestor'), async (req, res) => {
  try {
    const id = validarId(req.params.id); if (!id) return res.status(400).json({ erro: 'ID inválido' });
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(req.body?.imagem || '');
    if (!m || !FOTO_TIPOS.includes(m[1])) return res.status(400).json({ erro: 'Envie uma imagem JPEG, PNG ou WebP' });
    const bytes = Buffer.from(m[2], 'base64');
    if (!bytes.length || bytes.length > FOTO_MAX_BYTES) return res.status(400).json({ erro: 'Imagem muito grande (máximo 2 MB)' });
    const rec = await db.get('SELECT id FROM diario_recados WHERE id=$1 AND ativo=true', [id]);
    if (!rec) return res.status(404).json({ erro: 'Recado não encontrado ou já encerrado.' });
    const n = await db.get('SELECT COUNT(*)::int AS n FROM diario_recado_fotos WHERE recado_id=$1', [id]);
    if (n.n >= FOTO_MAX_POR_RECADO) return res.status(400).json({ erro: `Máximo de ${FOTO_MAX_POR_RECADO} fotos por recado` });
    const autor = req.session?.usuario?.nome || '';
    const r = await pool.query('INSERT INTO diario_recado_fotos (recado_id, mime, dados, autor) VALUES ($1,$2,$3,$4) RETURNING id', [id, m[1], bytes, autor]);
    res.json({ id: r.rows[0].id });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.get('/diario-recados/foto/:fotoId', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    const id = validarId(req.params.fotoId); if (!id) return res.status(400).json({ erro: 'ID inválido' });
    const f = await db.get('SELECT mime, dados FROM diario_recado_fotos WHERE id=$1', [id]);
    if (!f) return res.status(404).json({ erro: 'Foto não encontrada' });
    res.set({ 'Content-Type': f.mime, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
    res.send(f.dados);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/diario-recados/foto/:fotoId', requerAuth, requerPerfil('gestor'), async (req, res) => {
  try {
    const id = validarId(req.params.fotoId); if (!id) return res.status(400).json({ erro: 'ID inválido' });
    const r = await pool.query('DELETE FROM diario_recado_fotos WHERE id=$1 RETURNING id', [id]);
    if (!r.rows[0]) return res.status(404).json({ erro: 'Foto não encontrada' });
    res.json({ mensagem: 'Foto removida' });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
