/* ══ Permissões Granulares — routes/permissoes.js ══
   V12 da evolução do WMS: tela de administração das revogações/concessões
   explícitas por usuário (ver lib/permissoes.js pra semântica completa).
   Só gestor administra — evita que um supervisor altere a permissão de
   outro supervisor por conta própria.
══════════════════════════════════════════════════════════════════════ */
'use strict';
const express = require('express');
const router  = express.Router();
const { db } = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');
const { validarId } = require('../lib/helpers');
const { registrarAuditoria } = require('../lib/auditoria');
const { ACOES } = require('../lib/permissoes');

// ── GET /permissoes/acoes — lista fixa das 7 ações granulares ─────────────
router.get('/permissoes/acoes', requerAuth, requerPerfil('gestor'), (req, res) => {
  res.json(ACOES);
});

// ── GET /permissoes/usuarios/:id — overrides atuais de um usuário ─────────
router.get('/permissoes/usuarios/:id', requerAuth, requerPerfil('gestor'), async (req, res) => {
  const id = validarId(req.params.id);
  if (!id) return res.status(400).json({ erro: 'id inválido' });
  try {
    const rows = await db.all(
      `SELECT acao, concedida, concedido_por, concedido_em FROM permissoes_usuario WHERE usuario_id=$1 ORDER BY acao`,
      [id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ── PUT /permissoes/usuarios/:id — concede ou revoga uma ação ─────────────
router.put('/permissoes/usuarios/:id', requerAuth, requerPerfil('gestor'), async (req, res) => {
  const id = validarId(req.params.id);
  if (!id) return res.status(400).json({ erro: 'id inválido' });
  const { acao, concedida } = req.body || {};
  if (!ACOES.includes(acao)) return res.status(400).json({ erro: `ação deve ser uma de: ${ACOES.join(', ')}` });
  if (typeof concedida !== 'boolean') return res.status(400).json({ erro: 'concedida deve ser true ou false' });
  try {
    await db.run(
      `INSERT INTO permissoes_usuario (usuario_id, acao, concedida, concedido_por)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (usuario_id, acao) DO UPDATE SET concedida=$3, concedido_por=$4, concedido_em=NOW()`,
      [id, acao, concedida, req.session?.usuario?.nome || 'sistema']
    );
    await registrarAuditoria(req, 'PERMISSAO_ALTERADA', 'usuario', id, null, { acao, concedida });
    res.json({ mensagem: 'Permissão atualizada.' });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ── DELETE /permissoes/usuarios/:id/:acao — volta ao padrão do perfil ─────
router.delete('/permissoes/usuarios/:id/:acao', requerAuth, requerPerfil('gestor'), async (req, res) => {
  const id = validarId(req.params.id);
  if (!id) return res.status(400).json({ erro: 'id inválido' });
  const { acao } = req.params;
  if (!ACOES.includes(acao)) return res.status(400).json({ erro: `ação deve ser uma de: ${ACOES.join(', ')}` });
  try {
    await db.run(`DELETE FROM permissoes_usuario WHERE usuario_id=$1 AND acao=$2`, [id, acao]);
    await registrarAuditoria(req, 'PERMISSAO_RESETADA', 'usuario', id, null, { acao });
    res.json({ mensagem: 'Permissão resetada pro padrão do perfil.' });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
