import express from 'express';
const router = express.Router();
import { db, pool } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';

// â”€â”€ GET /performance/ocorrencias â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/performance/ocorrencias', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  const { ini, fim, colaborador, tipo } = req.query as Record<string, string>;
  try {
    const params = [];
    let w = 'WHERE 1=1';
    if (ini)        { params.push(ini);         w += ` AND o.data >= $${params.length}`; }
    if (fim)        { params.push(fim);         w += ` AND o.data <= $${params.length}`; }
    if (colaborador){ params.push(colaborador); w += ` AND o.colaborador_nome = $${params.length}`; }
    if (tipo)       { params.push(tipo);        w += ` AND o.tipo = $${params.length}`; }
    const rows = await db.all(
      `SELECT * FROM ocorrencias o ${w} ORDER BY o.data DESC, o.criado_em DESC`,
      params
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// â”€â”€ POST /performance/ocorrencias â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/performance/ocorrencias', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  const { colaborador_nome, tipo, gravidade, descricao, data, turno } = req.body;
  if (!colaborador_nome || !tipo || !descricao || !data) {
    return res.status(400).json({ erro: 'Preencha colaborador, tipo, data e descriÃ§Ã£o.' });
  }
  const supervisor_nome = req.session?.usuario?.nome || '';
  try {
    const r = await pool.query(
      `INSERT INTO ocorrencias (colaborador_nome, tipo, gravidade, descricao, data, turno, supervisor_nome)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [colaborador_nome, tipo, gravidade||'leve', descricao, data, turno||'', supervisor_nome]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// â”€â”€ DELETE /performance/ocorrencias/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.delete('/performance/ocorrencias/:id', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  try {
    await pool.query('DELETE FROM ocorrencias WHERE id=$1', [req.params.id]);
    res.json({ mensagem: 'OcorrÃªncia excluÃ­da!' });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
