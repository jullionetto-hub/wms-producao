/* ══ Recado da gestão no Diário de Bordo — routes/diario-recados.js ══
   Uma informação (título, texto e fotos) que aparece no Diário de Bordo dos 3 turnos de uma vez, até a gestão
   encerrar. Os diários continuam sendo por data + turno; o recado é à parte.
   Ler: supervisor e gestor (quem usa o Diário). Criar/editar/encerrar/fotos: só gestor.
   Prefixo /diario-recados (não /diario/…): /diario/:id captura qualquer coisa depois de /diario/. */
'use strict';
import express from 'express';
const router  = express.Router();
import { db, pool } from '../lib/db';
import { requerAuth, requerPerfil } from '../lib/auth';
import { validarId, normalizarTurno, perfisPermitidos } from '../lib/helpers';
import { registrarAuditoria } from '../lib/auditoria';
import type { Linha } from '../types/db';

const FOTO_MAX_BYTES = 2 * 1024 * 1024;
const FOTO_MAX_POR_RECADO = 12;
const FOTO_TIPOS = ['image/jpeg', 'image/png', 'image/webp'];
const TITULO_MAX = 120, TEXTO_MAX = 4000;

const dadosRecado = (body: any) => {
  const titulo = String(body?.titulo ?? '').trim().slice(0, TITULO_MAX);
  const texto  = String(body?.texto ?? '').trim();
  return { titulo, texto };
};

// ── Turnos que veem o recado ─────────────────────────────────────────────────────────────────────────────
// Coluna diario_recados.turnos: '' = todos os turnos; senão, os turnos separados por vírgula ("Manha,Noite").
// É um filtro de EXIBIÇÃO no Diário de Bordo (não uma barreira de segurança).
const TURNOS = ['Manha', 'Tarde', 'Noite'];
const turnoCanonico = (t: unknown): string | null => {
  const n = normalizarTurno(t).toLowerCase();
  if (n.startsWith('manh')) return 'Manha';
  if (n.startsWith('tard')) return 'Tarde';
  if (n.startsWith('noit') || n.startsWith('madrug')) return 'Noite';
  return null;
};
// body.turnos ausente => undefined (não mexe no que já está salvo); vazio ou os 3 turnos => '' (todos); turno inválido => null (erro)
const turnosDoCorpo = (body: any): string | null | undefined => {
  if (body?.turnos === undefined) return undefined;
  const bruto: unknown[] = Array.isArray(body.turnos) ? body.turnos : String(body.turnos ?? '').split(',');
  const itens = bruto.map(t => String(t).trim()).filter(Boolean);
  if (!itens.length) return '';
  const validos = [...new Set(itens.map(turnoCanonico))];
  if (validos.includes(null)) return null;
  const ordenados = TURNOS.filter(t => validos.includes(t));
  return ordenados.length === TURNOS.length ? '' : ordenados.join(',');
};

// Recados ativos, mais novos primeiro, já com os ids das fotos
// turnos: [] = todos. O gestor vê TODOS (precisa poder editar/encerrar mesmo os de outro turno); os demais, só os do turno
// que estão olhando (?turno=Manha|Tarde|Noite = o seletor do Diário; sem ele, o turno do próprio usuário).
router.get('/diario-recados', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    const todos = await db.all(`SELECT id, titulo, texto, autor, turnos, criado_em, editado_em FROM diario_recados WHERE ativo=true ORDER BY criado_em DESC, id DESC`);
    todos.forEach(r => { r.turnos = r.turnos ? String(r.turnos).split(',') : []; });
    const usuario = req.session!.usuario!;
    const turnoVisao = turnoCanonico(req.query.turno) || turnoCanonico(usuario.turno);
    const ehGestor = perfisPermitidos(usuario).includes('gestor');
    const recados = ehGestor || !turnoVisao ? todos : todos.filter(r => !r.turnos.length || r.turnos.includes(turnoVisao));
    if (recados.length) {
      const fotos = await db.all<Pick<Linha<'diario_recado_fotos'>, 'id' | 'recado_id'>>(`SELECT id, recado_id FROM diario_recado_fotos WHERE recado_id = ANY($1::int[]) ORDER BY id`, [recados.map(r => r.id)]);
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
    const turnos = turnosDoCorpo(req.body);
    if (turnos === null) return res.status(400).json({ erro: 'Turno inválido (use Manhã, Tarde ou Noite).' });
    const autor = req.session?.usuario?.nome || '';
    const r = await pool.query('INSERT INTO diario_recados (titulo, texto, autor, turnos) VALUES ($1,$2,$3,$4) RETURNING id', [titulo, texto, autor, turnos ?? '']);
    await registrarAuditoria(req, 'RECADO_DIARIO_CRIADO', 'diario_recado', r.rows[0].id, null, { titulo, turnos: turnos || 'todos' });
    res.status(201).json({ id: r.rows[0].id });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.put('/diario-recados/:id', requerAuth, requerPerfil('gestor'), async (req, res) => {
  try {
    const id = validarId(req.params.id); if (!id) return res.status(400).json({ erro: 'ID inválido' });
    const { titulo, texto } = dadosRecado(req.body);
    if (!texto) return res.status(400).json({ erro: 'Escreva o texto do recado.' });
    if (texto.length > TEXTO_MAX) return res.status(400).json({ erro: `Texto muito longo (máximo ${TEXTO_MAX} caracteres).` });
    const turnos = turnosDoCorpo(req.body);
    if (turnos === null) return res.status(400).json({ erro: 'Turno inválido (use Manhã, Tarde ou Noite).' });
    // turnos ausente (tela antiga) => COALESCE mantém o que já estava salvo
    const r = await pool.query('UPDATE diario_recados SET titulo=$1, texto=$2, turnos=COALESCE($4, turnos), editado_em=NOW() WHERE id=$3 AND ativo=true RETURNING id', [titulo, texto, id, turnos === undefined ? null : turnos]);
    if (!r.rows[0]) return res.status(404).json({ erro: 'Recado não encontrado ou já encerrado.' });
    await registrarAuditoria(req, 'RECADO_DIARIO_EDITADO', 'diario_recado', id, null, { titulo, turnos: turnos === undefined ? '(inalterado)' : (turnos || 'todos') });
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
    const rec = await db.get<Pick<Linha<'diario_recados'>, 'id'>>('SELECT id FROM diario_recados WHERE id=$1 AND ativo=true', [id]);
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
    const f = await db.get<Pick<Linha<'diario_recado_fotos'>, 'mime' | 'dados'>>('SELECT mime, dados FROM diario_recado_fotos WHERE id=$1', [id]);
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
