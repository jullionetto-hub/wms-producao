const express = require('express');
const router = express.Router();
const { db, pool } = require('../lib/db');
const { requerPerfil } = require('../lib/auth');

// Lista colmeias ativas com saldo calculado ao vivo: quantidade cadastrada
// menos o que já saiu em pedidos concluídos desse código desde que a
// colmeia foi criada. Calculado na consulta (não gravado numa coluna) pra
// nunca ficar desincronizado se um pedido for cancelado/editado depois.
router.get('/colmeias', requerPerfil('supervisor', 'gestor'), async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT c.*,
        COALESCE((
          SELECT SUM(i.quantidade - COALESCE(i.qtd_falta, 0))
          FROM itens_pedido i
          JOIN pedidos p ON p.id = i.pedido_id
          WHERE i.codigo = c.codigo
            AND i.status IN ('encontrado', 'parcial')
            AND p.status = 'concluido'
            AND p.concluido_em <> ''
            AND p.concluido_em::timestamp AT TIME ZONE 'America/Sao_Paulo' >= c.criado_em
        ), 0)::int AS consumido
      FROM colmeias c
      WHERE c.status = 'ativo'
      ORDER BY c.criado_em DESC
    `);
    res.json(rows.map(r => ({ ...r, saldo: r.quantidade_total - r.consumido })));
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.get('/colmeias/:id/historico', requerPerfil('supervisor', 'gestor'), async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT * FROM colmeias_abastecimentos WHERE colmeia_id=$1 ORDER BY criado_em DESC LIMIT 50`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.post('/colmeias', requerPerfil('supervisor', 'gestor'), async (req, res) => {
  const { codigo, descricao, endereco, quantidade, estoque_minimo } = req.body;
  const qtd = parseInt(quantidade);
  const minimo = parseInt(estoque_minimo) || 0;
  if (!codigo || !codigo.trim()) return res.status(400).json({ erro: 'Informe o código do produto' });
  if (!qtd || qtd <= 0) return res.status(400).json({ erro: 'Quantidade inválida' });
  if (minimo < 0) return res.status(400).json({ erro: 'Estoque mínimo inválido' });
  const criado_por = req.session?.usuario?.nome || '';
  try {
    const r = await pool.query(
      `INSERT INTO colmeias (codigo, descricao, endereco, quantidade_total, estoque_minimo, criado_por) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [codigo.trim().toUpperCase(), (descricao || '').trim(), (endereco || '').trim(), qtd, minimo, criado_por]
    );
    await pool.query(
      `INSERT INTO colmeias_abastecimentos (colmeia_id, quantidade, criado_por) VALUES ($1,$2,$3)`,
      [r.rows[0].id, qtd, criado_por]
    );
    res.json({ mensagem: 'Colmeia cadastrada!', id: r.rows[0].id });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.put('/colmeias/:id/abastecer', requerPerfil('supervisor', 'gestor'), async (req, res) => {
  const qtd = parseInt(req.body.quantidade);
  if (!qtd || qtd <= 0) return res.status(400).json({ erro: 'Quantidade inválida' });
  const criado_por = req.session?.usuario?.nome || '';
  try {
    const r = await pool.query(
      `UPDATE colmeias SET quantidade_total = quantidade_total + $1 WHERE id=$2 AND status='ativo' RETURNING id`,
      [qtd, req.params.id]
    );
    if (!r.rowCount) return res.status(404).json({ erro: 'Colmeia não encontrada' });
    await pool.query(
      `INSERT INTO colmeias_abastecimentos (colmeia_id, quantidade, criado_por) VALUES ($1,$2,$3)`,
      [req.params.id, qtd, criado_por]
    );
    res.json({ mensagem: 'Abastecimento registrado!' });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.put('/colmeias/:id/minimo', requerPerfil('supervisor', 'gestor'), async (req, res) => {
  const minimo = parseInt(req.body.estoque_minimo);
  if (isNaN(minimo) || minimo < 0) return res.status(400).json({ erro: 'Estoque mínimo inválido' });
  try {
    const r = await pool.query(
      `UPDATE colmeias SET estoque_minimo=$1 WHERE id=$2 AND status='ativo' RETURNING id`,
      [minimo, req.params.id]
    );
    if (!r.rowCount) return res.status(404).json({ erro: 'Colmeia não encontrada' });
    res.json({ mensagem: 'Estoque mínimo atualizado!' });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.put('/colmeias/:id/endereco', requerPerfil('supervisor', 'gestor'), async (req, res) => {
  const endereco = (req.body.endereco || '').trim();
  try {
    const r = await pool.query(
      `UPDATE colmeias SET endereco=$1 WHERE id=$2 AND status='ativo' RETURNING id`,
      [endereco, req.params.id]
    );
    if (!r.rowCount) return res.status(404).json({ erro: 'Colmeia não encontrada' });
    res.json({ mensagem: 'Endereço atualizado!' });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/colmeias/:id', requerPerfil('supervisor', 'gestor'), async (req, res) => {
  try {
    await pool.query(`UPDATE colmeias SET status='inativo' WHERE id=$1`, [req.params.id]);
    res.json({ mensagem: 'Colmeia removida!' });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
