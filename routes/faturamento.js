/* ══ Faturamento — routes/faturamento.js ══
   V10 da evolução do WMS: a tabela faturamento_pedidos já existia no schema
   (bloco "Dash Logística") mas nenhuma rota lia ou escrevia nela — não havia
   import de faturamento funcionando no sistema. Este arquivo cria o import
   (planilha processada no cliente, igual ao padrão já usado em
   entrada-manual.js e pedidos.js) e a leitura hora a hora usada pelo painel
   novo do Dashboard (routes/hora-a-hora.js).
══════════════════════════════════════════════════════════════════════ */
'use strict';
const express = require('express');
const router  = express.Router();
const { pool, db } = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');
const { registrarAuditoria } = require('../lib/auditoria');

// ── POST /faturamento/importar — registros já parseados no cliente ────────
router.post('/faturamento/importar', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  const { registros, nome_arquivo } = req.body || {};
  if (!Array.isArray(registros) || !registros.length)
    return res.status(400).json({ erro: 'Nenhum registro informado.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let inseridos = 0;
    let dataMin = null, dataMax = null;
    for (const r of registros) {
      const numeroPedido = String(r.numero_pedido || '').trim();
      const dataFat = String(r.data_fat || '').trim();
      if (!numeroPedido || !dataFat) continue;
      const faturado = parseFloat(r.faturado) || 0;
      const itens = parseInt(r.itens) || 0;
      const horaFat = String(r.hora_fat || '').trim();
      const usuario = String(r.usuario || '').trim();
      const nomeUsuario = String(r.nome_usuario || '').trim();
      const turno = String(r.turno || '?').trim() || '?';
      const statusPed = String(r.status_ped || '').trim();

      await client.query(
        `INSERT INTO faturamento_pedidos
           (numero_pedido, faturado, itens, data_fat, hora_fat, usuario, turno, nome_usuario, status_ped, importado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [numeroPedido, faturado, itens, dataFat, horaFat, usuario, turno, nomeUsuario, statusPed, req.session?.usuario?.nome || 'sistema']
      );
      inseridos++;
      if (!dataMin || dataFat < dataMin) dataMin = dataFat;
      if (!dataMax || dataFat > dataMax) dataMax = dataFat;
    }
    if (!inseridos) { await client.query('ROLLBACK'); return res.status(400).json({ erro: 'Nenhum registro válido (faltando número do pedido ou data).' }); }

    await client.query(
      `INSERT INTO fat_importacoes (nome_arquivo, ini, fim, total_registros, importado_por)
       VALUES ($1,$2,$3,$4,$5)`,
      [String(nome_arquivo || '').trim(), dataMin, dataMax, inseridos, req.session?.usuario?.nome || 'sistema']
    );
    await client.query('COMMIT');
    await registrarAuditoria(req, 'faturamento_importar', 'faturamento_pedidos', null, null, { inseridos, ini: dataMin, fim: dataMax });
    res.json({ mensagem: `${inseridos} registro(s) importado(s).`, inseridos, ini: dataMin, fim: dataMax });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ erro: e.message });
  } finally { client.release(); }
});

// ── GET /faturamento/importacoes — histórico de imports ───────────────────
router.get('/faturamento/importacoes', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT * FROM fat_importacoes ORDER BY importado_em DESC LIMIT 30`
    );
    res.json(rows || []);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
