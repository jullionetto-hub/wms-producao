import express from 'express';
const router = express.Router();
import { db, pool } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';
import { validarId, normalizarTurno } from '../../lib/helpers';
import { registrarAuditoria } from '../../lib/auditoria';
import type { Linha } from '../../types/db';

// ── Checklist de validação (pesos somam 100) ──────────────────────────────────
const CHECKLIST_ITENS = [
  { id: 'sep_ok',     peso: 20, label: 'As informações da Separação estão corretas' },
  { id: 'emb_ok',     peso: 15, label: 'As informações da Embalagem estão corretas' },
  { id: 'ck_ok',      peso: 15, label: 'As informações do Checkout estão corretas' },
  { id: 'rep_ok',     peso: 15, label: 'As informações da Reposição estão corretas' },
  { id: 'caixas_ok',  peso: 20, label: 'Há caixas para abastecimento pelas ruas' },
  { id: 'estoque_ok', peso: 15, label: 'O estoque está organizado' },
];

// ── POST /diario/:id/enviar — Finaliza e envia para validação ─────────────────
// Tempo que o turno seguinte tem para validar o diário depois de enviado
const PRAZO_VALIDACAO_DIARIO_MIN = 60;

router.post('/diario/:id/enviar', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    const id = validarId(req.params.id);
    if (!id) return res.status(400).json({ erro: 'ID inválido' });
    const diario = await db.get<Linha<'diario_bordo'>>('SELECT * FROM diario_bordo WHERE id=$1', [id]);
    if (!diario) return res.status(404).json({ erro: 'Diário não encontrado' });
    if (diario.status === 'enviado' || diario.status === 'validado') {
      return res.status(400).json({ erro: 'Este diário já foi enviado ou validado' });
    }
    const agora = new Date();
    const prazo  = new Date(agora.getTime() + PRAZO_VALIDACAO_DIARIO_MIN * 60 * 1000);
    await pool.query(
      `UPDATE diario_bordo SET status='enviado', enviado_em=$1, prazo_validacao=$2 WHERE id=$3`,
      [agora, prazo, id]
    );
    // Cria/recria registro de validação pendente
    await pool.query(
      `INSERT INTO diario_validacoes (diario_id, prazo)
       VALUES ($1, $2)
       ON CONFLICT (diario_id) DO UPDATE SET status='pendente', prazo=$2, validado_em=NULL,
         validador='', pontuacao=NULL, itens='[]'::jsonb, obs_geral=''`,
      [id, prazo]
    );
    const io = req.app.get('io');
    if (io) io.emit('diario:pendente', {
      diario_id: id,
      data: diario.data,
      turno: diario.turno,
      supervisor: diario.supervisor,
      prazo: prazo.toISOString(),
    });
    await registrarAuditoria(req, 'DIARIO_ENVIADO', 'diario_bordo', id, null,
      { data: diario.data, turno: diario.turno });
    res.json({ mensagem: 'Diário enviado para validação!', prazo: prazo.toISOString() });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── GET /diario/validacao/pendente — Validações pendentes OU expiradas aguardando ──
// Retorna também expiradas para permitir validação retroativa
router.get('/diario/validacao/pendente', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    const agora = new Date();
    // Marca expiradas (só muda status, não impede validação retroativa)
    await pool.query(
      `UPDATE diario_validacoes SET status='expirado'
       WHERE status='pendente' AND prazo < $1`, [agora]
    );
    await pool.query(
      `UPDATE diario_bordo SET status='expirado'
       WHERE status='enviado' AND prazo_validacao < $1`, [agora]
    );
    // Turno do supervisor logado → determina qual turno anterior deve validar
    const supervisorAtual = req.session?.usuario?.nome || '';
    const turnoAtual = normalizarTurno(req.session?.usuario?.turno);
    // Manhã valida Noite, Tarde valida Manhã, Noite valida Tarde
    const PREV_TURNO: Record<string, string> = { Tarde: 'Manha', Noite: 'Tarde', Manha: 'Noite' };
    // Gestor acompanha qualquer turno; supervisor só valida o turno anterior ao seu
    const ehGestor = req.session?.usuario?.perfil === 'gestor';
    const turnoParaValidar = ehGestor ? null : (PREV_TURNO[turnoAtual] || null);

    // Busca pendente OU expirado — janela de 2 dias (cobre turno que cruza meia-noite)
    // Filtra pela data do diário (campo TEXT 'YYYY-MM-DD') — mais confiável que criado_em
    // Exclui: (1) diários criados pelo próprio supervisor, (2) turno errado
    const hoje = agora.toLocaleDateString('pt-BR', { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).split('/').reverse().join('-');
    const ontem = new Date(agora.getTime() - 48*60*60*1000).toLocaleDateString('pt-BR', { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).split('/').reverse().join('-');
    const params = [supervisorAtual, ontem];
    let extraFiltro = '';
    if (turnoParaValidar) {
      params.push(turnoParaValidar);
      extraFiltro = `AND d.turno = $${params.length}`;
    }
    const val = await db.get(`
      SELECT v.id AS validacao_id, v.prazo, v.status AS val_status,
             d.id AS diario_id, d.data, d.turno, d.supervisor, d.dados, d.observacoes
      FROM diario_validacoes v
      JOIN diario_bordo d ON d.id = v.diario_id
      WHERE v.status IN ('pendente','expirado')
        AND d.data >= $2
        AND d.supervisor != $1
        AND d.status != 'validado'
        ${extraFiltro}
      ORDER BY v.prazo ASC
      LIMIT 1
    `, params);
    if (!val) return res.json(null);
    if (typeof val.dados === 'string') val.dados = JSON.parse(val.dados || '{}');
    if (typeof val.observacoes === 'string') val.observacoes = JSON.parse(val.observacoes || '{}');
    const restante = Math.max(0, Math.floor((+new Date(val.prazo) - +agora) / 1000));
    const atrasada = val.val_status === 'expirado';
    res.json({ ...val, restante_segundos: restante, atrasada, checklist: CHECKLIST_ITENS });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── GET /diario/:id/validacao — Validação de um diário específico ─────────────
router.get('/diario/:id/validacao', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    const id = validarId(req.params.id);
    if (!id) return res.status(400).json({ erro: 'ID inválido' });
    const val = await db.get<Linha<'diario_validacoes'>>(
      `SELECT * FROM diario_validacoes WHERE diario_id=$1 ORDER BY id DESC LIMIT 1`, [id]
    );
    if (!val) return res.json(null);
    if (typeof val.itens === 'string') val.itens = JSON.parse(val.itens || '[]');
    res.json(val);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── POST /diario/validacao/:id/validar — Submete a validação ─────────────────
router.post('/diario/validacao/:id/validar', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  const client = await pool.connect();
  try {
    const id = validarId(req.params.id);
    if (!id) return res.status(400).json({ erro: 'ID inválido' });

    await client.query('BEGIN');

    // Usa FOR UPDATE para evitar race condition em duplo clique
    const { rows } = await client.query(
      'SELECT * FROM diario_validacoes WHERE id=$1 FOR UPDATE', [id]
    );
    const val = rows[0];
    if (!val) { await client.query('ROLLBACK'); return res.status(404).json({ erro: 'Validação não encontrada' }); }

    // Bloqueia apenas se já concluída
    if (val.status === 'validado') {
      await client.query('ROLLBACK');
      // Garante que diario_bordo também está correto (corrige inconsistência)
      await pool.query(`UPDATE diario_bordo SET status='validado' WHERE id=$1 AND status != 'validado'`, [val.diario_id]);
      return res.status(400).json({ erro: 'Este diário já foi validado', pontuacao: val.pontuacao });
    }

    const { itens, obs_geral } = req.body;
    let pontuacao = 100;
    if (Array.isArray(itens)) {
      for (const item of itens) {
        if (item.passou === false) {
          const def = CHECKLIST_ITENS.find(c => c.id === item.id);
          if (def) pontuacao -= def.peso;
        }
      }
    }
    pontuacao = Math.max(0, pontuacao);
    const agora    = new Date();
    const validador = req.session?.usuario?.nome || 'Supervisor';
    const turnoVal  = req.session?.usuario?.turno || '';

    await client.query(
      `UPDATE diario_validacoes
       SET status='validado', itens=$1, pontuacao=$2, obs_geral=$3,
           validador=$4, turno_validador=$5, validado_em=$6
       WHERE id=$7`,
      [JSON.stringify(itens||[]), pontuacao, obs_geral||'', validador, turnoVal, agora, id]
    );
    await client.query(`UPDATE diario_bordo SET status='validado' WHERE id=$1`, [val.diario_id]);

    await client.query('COMMIT');

    const io = req.app.get('io');
    if (io) io.emit('diario:validado', { diario_id: val.diario_id, pontuacao, validador });
    await registrarAuditoria(req, 'DIARIO_VALIDADO', 'diario_bordo', val.diario_id, null,
      { pontuacao, validador });
    res.json({ mensagem: 'Validação concluída!', pontuacao });
  } catch(e) {
    await client.query('ROLLBACK').catch(()=>{});
    res.status(500).json({ erro: e.message });
  } finally {
    client.release();
  }
});

module.exports = router;
