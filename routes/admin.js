const express = require('express');
const router = express.Router();
const { db, pool } = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');
const { dataHoraLocal, validarId } = require('../lib/helpers');
const { registrarAuditoria } = require('../lib/auditoria');
const { gerarRelatorio } = require('../lib/relatorio');

router.post('/admin/zerar-sessoes', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  const { data } = req.body;
  const { data: hoje } = dataHoraLocal();
  try {
    const r = await pool.query('DELETE FROM sessoes_trabalho WHERE data=$1', [data || hoje]);
    res.json({ mensagem: `${r.rowCount} sessão(ões) removida(s).` });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/admin/zerar-dados', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const { confirmar } = req.body;
  if (confirmar !== 'ZERAR_TUDO_CONFIRMO') {
    return res.status(400).json({ erro: 'Confirmação inválida.' });
  }
  try {
    await pool.query('DELETE FROM avisos_repositor');
    await pool.query('DELETE FROM embalagem');
    await pool.query('DELETE FROM checkout');
    await pool.query('DELETE FROM itens_pedido');
    await pool.query('DELETE FROM pedidos');
    await pool.query('ALTER SEQUENCE pedidos_id_seq RESTART WITH 1').catch(()=>{});
    await pool.query('ALTER SEQUENCE itens_pedido_id_seq RESTART WITH 1').catch(()=>{});
    await pool.query('ALTER SEQUENCE avisos_repositor_id_seq RESTART WITH 1').catch(()=>{});
    await pool.query('ALTER SEQUENCE checkout_id_seq RESTART WITH 1').catch(()=>{});
    registrarAuditoria(req, 'zerar_dados', 'sistema', null, null, { acao: 'zerar_todos_pedidos' });
    res.json({ mensagem: 'Todos os pedidos, itens, avisos e checkouts foram apagados com sucesso.' });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/admin/sincronizar-forma-envio', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const result = await pool.query(`
      UPDATE avisos_repositor a
      SET forma_envio = p.transportadora
      FROM pedidos p
      WHERE a.pedido_id = p.id
        AND (a.forma_envio IS NULL OR a.forma_envio = '')
        AND p.transportadora IS NOT NULL
        AND p.transportadora != ''
      RETURNING a.id`);
    res.json({ atualizados: result.rows.length, mensagem: `${result.rows.length} avisos atualizados com a transportadora do pedido.` });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/admin/migration-tempo', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS iniciado_em TEXT DEFAULT ''");
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS concluido_em TEXT DEFAULT ''");
    res.json({mensagem:'Colunas criadas!'});
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.post('/admin/migration-tempo-justo', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS iniciado_em TEXT DEFAULT ''");
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS concluido_em TEXT DEFAULT ''");
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tempo_aguardando_min INTEGER DEFAULT 0");
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS aguardando_repositor_desde TEXT DEFAULT ''");
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS skus_concluido_em TEXT DEFAULT ''");
    res.json({mensagem:'Colunas criadas!'});
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.get('/auditoria', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const { data_ini, data_fim, usuario, acao, limit=100, page, pageSize } = req.query;
  try {
    let sql = `SELECT * FROM auditoria WHERE 1=1`;
    const p = [];
    if (data_ini) { p.push(data_ini); sql += ` AND data>=$${p.length}`; }
    if (data_fim) { p.push(data_fim); sql += ` AND data<=$${p.length}`; }
    if (usuario)  { p.push('%'+usuario+'%'); sql += ` AND LOWER(usuario_login) LIKE LOWER($${p.length})`; }
    if (acao)     { p.push(acao); sql += ` AND acao=$${p.length}`; }
    if (page) {
      const size = Math.min(parseInt(pageSize)||50, 500);
      const pg   = Math.max(parseInt(page)||1, 1);
      const countRow = await db.get(`SELECT COUNT(*) as total FROM auditoria WHERE 1=1${sql.split('WHERE 1=1')[1]}`, p);
      const total = parseInt(countRow.total)||0;
      p.push(size); sql += ` ORDER BY id DESC LIMIT $${p.length}`;
      p.push((pg-1)*size); sql += ` OFFSET $${p.length}`;
      return res.json({ total, pagina:pg, totalPaginas:Math.ceil(total/size), dados: await db.all(sql, p) });
    }
    p.push(parseInt(limit)||100);
    sql += ` ORDER BY id DESC LIMIT $${p.length}`;
    res.json(await db.all(sql, p));
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.get('/relatorio/diario', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {data} = req.query;
  const {data:hoje} = dataHoraLocal();
  const d = data || hoje;
  try {
    let rel = await db.get(`SELECT * FROM relatorios_diarios WHERE data=$1`, [d]);
    if (!rel) rel = await gerarRelatorio(d);
    res.json(rel);
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.get('/relatorio/lista', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    res.json(await db.all(`SELECT id, data, total_pedidos, pedidos_concluidos, total_faltas, gerado_em FROM relatorios_diarios ORDER BY data DESC LIMIT 30`));
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.post('/relatorio/gerar', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {data} = req.body;
  const {data:hoje} = dataHoraLocal();
  try {
    const rel = await gerarRelatorio(data||hoje);
    registrarAuditoria(req, 'relatorio_gerado', 'relatorio', null, null, { data: data||hoje });
    res.json(rel);
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.get('/diario', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    res.json(await db.all(`
      SELECT d.id, d.data, d.turno, d.supervisor, d.leu_anterior, d.status, d.criado_em,
             v.pontuacao
      FROM diario_bordo d
      LEFT JOIN diario_validacoes v ON v.diario_id = d.id
      ORDER BY d.criado_em DESC LIMIT 30
    `));
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.get('/diario/anterior', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const { data, turno } = req.query;
    const turnos = ['Manha','Tarde','Noite'];
    const idxT = turnos.indexOf(turno);
    let dataAnterior = data;
    let turnoAnterior;
    if (idxT === 0) {
      const dt = new Date(data + 'T12:00:00');
      dt.setDate(dt.getDate() - 1);
      dataAnterior = dt.toISOString().split('T')[0];
      turnoAnterior = 'Noite';
    } else {
      turnoAnterior = turnos[idxT - 1];
    }
    const anterior = await db.get('SELECT * FROM diario_bordo WHERE data=$1 AND turno=$2', [dataAnterior, turnoAnterior]);
    if (!anterior) return res.json(null);
    if (typeof anterior.dados === 'string') anterior.dados = JSON.parse(anterior.dados);
    if (typeof anterior.observacoes === 'string') {
      try { anterior.observacoes = JSON.parse(anterior.observacoes); } catch(e) { anterior.observacoes = {geral: anterior.observacoes}; }
    }
    res.json(anterior);
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.get('/diario/dados/turno', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const { data, turno } = req.query;
    const { dataHoraLocal: dhl } = require('../lib/helpers');
    const dt = data || dhl().data;
    const pedidos = await db.all('SELECT * FROM pedidos WHERE data_pedido=$1', [dt]);
    const total = pedidos.length;
    const concluidos = pedidos.filter(p => p.status === 'concluido').length;
    const pendentes = pedidos.filter(p => p.status === 'pendente').length;
    const separando = pedidos.filter(p => p.status === 'separando').length;
    const faltas = await db.all(`SELECT ar.*, p.numero_pedido, p.cliente FROM avisos_repositor ar LEFT JOIN pedidos p ON ar.pedido_id = p.id WHERE ar.data_aviso=$1 AND ar.status='nao_encontrado'`, [dt]);
    const checkouts = await db.all('SELECT * FROM checkout WHERE data_checkout=$1', [dt]);
    const ckConcluidos = checkouts.filter(c => c.status === 'concluido').length;
    const ckPendentes = checkouts.filter(c => c.status !== 'concluido').length;
    const reposicoes = await db.all('SELECT * FROM avisos_repositor WHERE data_aviso=$1', [dt]);
    const repResolvidas = reposicoes.filter(r => ['reposto','abastecido','subiu'].includes(r.status)).length;
    const repPendentes = reposicoes.filter(r => r.status === 'pendente' || r.status === 'aberto').length;
    const repNaoEncontrados = reposicoes.filter(r => r.status === 'nao_encontrado').length;
    const embTotal = await db.get('SELECT COUNT(*) as total, SUM(CASE WHEN status_embalagem=$2 THEN 1 ELSE 0 END) as embalados FROM pedidos WHERE data_pedido=$1 AND status=$3', [dt, 'embalado', 'concluido']);
    const embEmbalados = parseInt(embTotal?.embalados || 0);
    const embPendentes = parseInt(embTotal?.total || 0) - embEmbalados;
    res.json({
      data: dt, turno: turno || 'Todos',
      separacao: { total, concluidos, pendentes, separando },
      checkout: { concluidos: ckConcluidos, pendentes: ckPendentes, total: checkouts.length },
      reposicao: { resolvidas: repResolvidas, pendentes: repPendentes, nao_encontrados: repNaoEncontrados, total: reposicoes.length },
      embalagem: { total: parseInt(embTotal?.total || 0), embalados: embEmbalados, pendentes: embPendentes },
      problemas: faltas.map(f => ({ pedido: f.numero_pedido, cliente: f.cliente, item: f.descricao, codigo: f.codigo }))
    });
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.get('/diario/:id', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const d = await db.get('SELECT * FROM diario_bordo WHERE id=$1', [req.params.id]);
    if (!d) return res.status(404).json({erro:'Nao encontrado'});
    if (typeof d.dados === 'string') d.dados = JSON.parse(d.dados);
    res.json(d);
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.post('/diario', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const {data, turno, dados, observacoes, leu_anterior} = req.body;
    if (!data || !turno) return res.status(400).json({erro:'Data e turno obrigatorios'});
    const supervisor = req.session?.usuario?.nome || 'Supervisor';
    const existe = await db.get('SELECT id, supervisor, status FROM diario_bordo WHERE data=$1 AND turno=$2', [data, turno]);
    if (existe) {
      // Bloqueia edição se o diário foi criado por outro supervisor (não o atual)
      if (existe.supervisor && existe.supervisor !== supervisor) {
        return res.status(403).json({
          erro: `Este diário já foi criado pelo supervisor "${existe.supervisor}". Você não pode alterá-lo.`
        });
      }
      // Bloqueia edição se já foi enviado/validado
      if (existe.status === 'enviado' || existe.status === 'validado') {
        return res.status(403).json({
          erro: `Este diário já foi ${existe.status === 'enviado' ? 'enviado para validação' : 'validado'} e não pode ser alterado.`
        });
      }
      await pool.query('UPDATE diario_bordo SET dados=$1,observacoes=$2,supervisor=$3,leu_anterior=$4 WHERE id=$5',
        [JSON.stringify(dados||{}), JSON.stringify(observacoes||{}), supervisor, leu_anterior||false, existe.id]);
      res.json({mensagem:'Diario atualizado!', id: existe.id});
    } else {
      const r = await pool.query('INSERT INTO diario_bordo (data,turno,supervisor,dados,observacoes,leu_anterior) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [data, turno, supervisor, JSON.stringify(dados||{}), JSON.stringify(observacoes||{}), leu_anterior||false]);
      res.json({mensagem:'Diario criado!', id: r.rows[0].id});
    }
  } catch(e) { res.status(500).json({erro:e.message}); }
});

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
router.post('/diario/:id/enviar', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    const id = validarId(req.params.id);
    if (!id) return res.status(400).json({ erro: 'ID inválido' });
    const diario = await db.get('SELECT * FROM diario_bordo WHERE id=$1', [id]);
    if (!diario) return res.status(404).json({ erro: 'Diário não encontrado' });
    if (diario.status === 'enviado' || diario.status === 'validado') {
      return res.status(400).json({ erro: 'Este diário já foi enviado ou validado' });
    }
    const agora = new Date();
    const prazo  = new Date(agora.getTime() + 2 * 60 * 60 * 1000); // +2 horas
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
    // Busca pendente OU expirado não validado (até 24h para retroativa)
    const val = await db.get(`
      SELECT v.id AS validacao_id, v.prazo, v.status AS val_status,
             d.id AS diario_id, d.data, d.turno, d.supervisor, d.dados, d.observacoes
      FROM diario_validacoes v
      JOIN diario_bordo d ON d.id = v.diario_id
      WHERE v.status IN ('pendente','expirado')
        AND d.criado_em > NOW() - INTERVAL '24 hours'
      ORDER BY v.prazo ASC
      LIMIT 1
    `);
    if (!val) return res.json(null);
    if (typeof val.dados === 'string') val.dados = JSON.parse(val.dados || '{}');
    if (typeof val.observacoes === 'string') val.observacoes = JSON.parse(val.observacoes || '{}');
    const restante = Math.max(0, Math.floor((new Date(val.prazo) - agora) / 1000));
    const atrasada = val.val_status === 'expirado';
    res.json({ ...val, restante_segundos: restante, atrasada, checklist: CHECKLIST_ITENS });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── GET /diario/:id/validacao — Validação de um diário específico ─────────────
router.get('/diario/:id/validacao', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    const id = validarId(req.params.id);
    if (!id) return res.status(400).json({ erro: 'ID inválido' });
    const val = await db.get(
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

/* ══════════════════════════════════════════════════════════════
   RELATÓRIO ANALÍTICO — DE/ATÉ + TURNO
══════════════════════════════════════════════════════════════ */
router.get('/relatorio/analitico', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  const { de, ate, turno } = req.query;
  const { data: hoje } = dataHoraLocal();
  const dataIni = de || hoje;
  const dataFim = ate || hoje;
  const turnoFiltro = turno || 'Todos';

  try {
    const params = [dataIni, dataFim];

    // ── Pedidos — busca TODOS no período (sem filtro de hora no SQL)
    // O turno do lote é determinado por (em ordem de prioridade):
    //   1. turno_distribuicao — gravado quando supervisor usa botão de turno na distribuição
    //   2. turno do separador (u.turno / sep.turno) — fallback para distribuições antigas
    const pedidos = await db.all(`
      SELECT p.id, p.status, p.itens, p.pontuacao, p.hora_pedido, p.data_pedido,
             p.iniciado_em, p.concluido_em, p.skus_concluido_em, p.aguardando_desde,
             p.transportadora, p.rua, p.status_embalagem,
             p.embalagem_iniciado_em, p.embalado_em, p.embalado_por, p.tem_prime,
             COALESCE(u.nome, sep.nome, '') as sep_nome,
             COALESCE(p.turno_distribuicao, u.turno, sep.turno, 'Manha') as sep_turno
      FROM pedidos p
      LEFT JOIN separadores sep ON p.separador_id = sep.id
      LEFT JOIN usuarios u ON sep.usuario_id = u.id
      WHERE p.data_pedido >= $1 AND p.data_pedido <= $2
      ORDER BY p.data_pedido, p.hora_pedido
    `, params);

    // Lote do turno = pedidos distribuídos para separadores DESSE turno
    // "Todos" → todos os distribuídos, qualquer turno
    const pedidosDistribuidos = pedidos.filter(p =>
      p.sep_nome && (turnoFiltro === 'Todos' || p.sep_turno === turnoFiltro)
    );

    // ── Checkout ─────────────────────────────────────────────────
    const checkouts = await db.all(`
      SELECT ck.status, ck.data_checkout, ck.hora_checkout, ck.hora_criacao,
             ck.operador_nome, ck.pedido_id, p.itens
      FROM checkout ck
      LEFT JOIN pedidos p ON ck.pedido_id = p.id
      WHERE ck.data_checkout >= $1 AND ck.data_checkout <= $2
    `, params);

    // ── Embalagem ─────────────────────────────────────────────────
    const embalagens = await db.all(`
      SELECT em.embalado_por, em.data_embalagem, em.embalagem_inicio, em.embalado_em, p.itens
      FROM embalagem em
      LEFT JOIN pedidos p ON em.pedido_id = p.id
      WHERE em.data_embalagem >= $1 AND em.data_embalagem <= $2
    `, params);

    // ── Reposição ─────────────────────────────────────────────────
    const reposicoes = await db.all(`
      SELECT ar.status, ar.data_aviso, ar.repositor_nome, ar.separador_nome, ar.descricao,
             ar.hora_aviso, ar.hora_reposto
      FROM avisos_repositor ar
      WHERE ar.data_aviso >= $1 AND ar.data_aviso <= $2
    `, params);

    // ── Helpers ───────────────────────────────────────────────────
    const minutesBetween = (s, e) => {
      try { const m = (new Date(e) - new Date(s)) / 60000; return (m > 0 && m < 600) ? m : null; } catch { return null; }
    };
    const minutesTime = (s, e) => {
      try {
        let m = (new Date(`2000-01-01T${e}`) - new Date(`2000-01-01T${s}`)) / 60000;
        if (m < 0) m += 1440;
        return (m > 0 && m < 300) ? m : null;
      } catch { return null; }
    };
    const avgArr = a => a.length ? Math.round((a.reduce((s,v)=>s+v,0)/a.length)*10)/10 : null;

    // ── Separação — baseado no lote do turno ─────────────────────
    const sepConcluidos = pedidosDistribuidos.filter(p => p.status === 'concluido');
    // Usa skus_concluido_em (quando separador terminou de escanear) como fim real.
    // Para pedidos sem falta skus_concluido_em = concluido_em; para pedidos com falta
    // skus_concluido_em é anterior ao concluido_em (não inclui espera pelo repositor).
    const temposSep = sepConcluidos.map(p => minutesBetween(p.iniciado_em, p.skus_concluido_em || p.concluido_em)).filter(Boolean);

    // ── Complexidade — baseada no lote do turno ───────────────────
    const facil_set = new Set(['A','B','C','D','E','P','Q','R','S','T','U']);
    const medio_set = new Set(['M','N','O','V','W','X','Y','Z']);
    const complexidade = {
      facil:   { pedidos: 0, itens: 0 },
      medio:   { pedidos: 0, itens: 0 },
      dificil: { pedidos: 0, itens: 0 },
    };
    pedidosDistribuidos.forEach(p => {
      const letters = String(p.rua||'').toUpperCase().split('/')[0].replace(/[^A-Z]/g,'');
      let nivel;
      if (!letters) nivel = 'facil';
      else if (letters.startsWith('ZA') || letters.includes('ARARA') || letters.includes('VERT')) nivel = 'dificil';
      else if (!facil_set.has(letters[0]) && !medio_set.has(letters[0])) nivel = 'dificil';
      else if (medio_set.has(letters[0])) nivel = 'medio';
      else nivel = 'facil';
      complexidade[nivel].pedidos++;
      complexidade[nivel].itens += parseInt(p.itens) || 0;
    });

    // ── Checkout métricas ─────────────────────────────────────────
    const ckConcluidos  = checkouts.filter(c => c.status === 'concluido');
    const temposCk      = ckConcluidos.map(c => minutesTime(c.hora_criacao, c.hora_checkout)).filter(Boolean);

    // ── Embalagem métricas ────────────────────────────────────────
    const temposEmb = embalagens.map(e => minutesTime(e.embalagem_inicio, e.embalado_em)).filter(Boolean);

    // ── Colaboradores — separadores filtrados pelo turno ─────────
    const colabs = {};
    pedidosDistribuidos.forEach(p => {
      if (!p.sep_nome) return;
      const k = `${p.sep_nome}:separador`;
      if (!colabs[k]) colabs[k] = { nome:p.sep_nome, perfil:'separador', turno:p.sep_turno, pedidos:0, itens:0, pontuacao:0, tempos:[] };
      if (p.status === 'concluido') {
        colabs[k].pedidos++;
        colabs[k].itens   += parseInt(p.itens) || 0;
        colabs[k].pontuacao += parseFloat(p.pontuacao) || 0;
        const t = minutesBetween(p.iniciado_em, p.skus_concluido_em || p.concluido_em);
        if (t) colabs[k].tempos.push(t);
      }
    });
    embalagens.forEach(e => {
      if (!e.embalado_por) return;
      const k = `${e.embalado_por}:embalador`;
      if (!colabs[k]) colabs[k] = { nome:e.embalado_por, perfil:'embalador', turno:null, pedidos:0, itens:0, tempos:[] };
      colabs[k].pedidos++;
      colabs[k].itens += parseInt(e.itens) || 0;
      const t = minutesTime(e.embalagem_inicio, e.embalado_em);
      if (t) colabs[k].tempos.push(t);
    });
    ckConcluidos.forEach(ck => {
      if (!ck.operador_nome) return;
      const k = `${ck.operador_nome}:checkout`;
      if (!colabs[k]) colabs[k] = { nome:ck.operador_nome, perfil:'checkout', turno:null, pedidos:0, itens:0, tempos:[] };
      colabs[k].pedidos++;
      colabs[k].itens += parseInt(ck.itens) || 0;
      const t = minutesTime(ck.hora_criacao, ck.hora_checkout);
      if (t) colabs[k].tempos.push(t);
    });
    reposicoes.forEach(r => {
      if (!r.repositor_nome) return;
      const k = `${r.repositor_nome}:repositor`;
      if (!colabs[k]) colabs[k] = { nome:r.repositor_nome, perfil:'repositor', turno:null, total:0, repostos:0, nao_enc:0, tempos:[] };
      colabs[k].total++;
      if (['reposto','abastecido','subiu'].includes(r.status)) {
        colabs[k].repostos++;
        const t = minutesTime(r.hora_aviso, r.hora_reposto);
        if (t) colabs[k].tempos.push(t);
      }
      if (r.status === 'nao_encontrado') colabs[k].nao_enc++;
    });
    const colaboradores = Object.values(colabs).map(c => {
      const tempo_medio = avgArr(c.tempos);
      const { tempos, ...rest } = c;
      return { ...rest, tempo_medio, pontuacao: Math.round(rest.pontuacao||0) };
    }).sort((a,b) => a.nome.localeCompare(b.nome));

    // ── Ranking de turnos — usa sep_turno (turno do separador que trabalhou o pedido)
    const tMap = { Manha:{label:'Manhã',pedidos:0,itens:0,pontuacao:0,tempos:[]}, Tarde:{label:'Tarde',pedidos:0,itens:0,pontuacao:0,tempos:[]}, Noite:{label:'Noite',pedidos:0,itens:0,pontuacao:0,tempos:[]} };
    // Para o ranking usa TODOS os concluídos do dia (não só o turno filtrado)
    pedidos.filter(p => p.status === 'concluido' && p.sep_nome).forEach(p => {
      const t = p.sep_turno || 'Manha';
      if (!tMap[t]) return;
      tMap[t].pedidos++;
      tMap[t].itens     += parseInt(p.itens)||0;
      tMap[t].pontuacao += parseFloat(p.pontuacao)||0;
      const tm = minutesBetween(p.iniciado_em, p.skus_concluido_em || p.concluido_em);
      if (tm) tMap[t].tempos.push(tm);
    });
    const ranking_turnos = Object.values(tMap).map(t => ({
      turno: t.label, pedidos: t.pedidos, itens: t.itens, pontuacao: Math.round(t.pontuacao),
      media_tempo: avgArr(t.tempos),
    })).sort((a,b) => b.pedidos - a.pedidos);

    // ── Por hora ──────────────────────────────────────────────────
    const hMap = {};
    sepConcluidos.forEach(p => {
      if (!p.hora_pedido) return;
      const h = p.hora_pedido.substring(0,2);
      hMap[h] = (hMap[h]||0)+1;
    });
    const por_hora = Object.entries(hMap).sort().map(([h,t])=>({hora:h,total:t}));

    // ── Por transportadora ────────────────────────────────────────
    const trMap = {};
    sepConcluidos.forEach(p => {
      const t = String(p.transportadora||'Outros').trim()||'Outros';
      trMap[t] = (trMap[t]||0)+1;
    });
    const por_transportadora = Object.entries(trMap).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([t,n])=>({transportadora:t,total:n}));

    // ── Por dia (para ranges) ─────────────────────────────────────
    const dMap = {};
    sepConcluidos.forEach(p => { if (p.data_pedido) dMap[p.data_pedido]=(dMap[p.data_pedido]||0)+1; });
    const por_dia = Object.entries(dMap).sort().map(([d,t])=>({data:d,total:t}));

    // ── SLA (separação em até 6h após aguardando_desde) ──────────
    const SLA_H = 6;
    let slaDentro=0, slaFora=0;
    sepConcluidos.filter(p=>p.aguardando_desde&&p.concluido_em).forEach(p=>{
      try {
        const desde = p.aguardando_desde.includes('T')||p.aguardando_desde.includes(' ')
          ? new Date(p.aguardando_desde)
          : new Date(`${p.data_pedido}T${p.aguardando_desde}`);
        const horas = (new Date(p.concluido_em)-desde)/3600000;
        if (!isNaN(horas)) horas<=SLA_H ? slaDentro++ : slaFora++;
      } catch {}
    });

    // ── Por dia — total importado ─────────────────────────────────
    const por_dia_total = {};
    pedidos.forEach(p=>{ if(p.data_pedido) por_dia_total[p.data_pedido]=(por_dia_total[p.data_pedido]||0)+1; });

    res.json({
      periodo:{ de:dataIni, ate:dataFim },
      turno_filtro: turnoFiltro,
      separacao:{
        // Todos → total geral do dia; turno específico → só os desse turno
        total: turnoFiltro === 'Todos' ? pedidos.length : pedidosDistribuidos.length,
        total_geral: pedidos.length,         // sempre o grand total (para contexto)
        distribuidos: pedidosDistribuidos.length,
        concluidos: sepConcluidos.length,
        pendentes: pedidosDistribuidos.filter(p=>p.status==='pendente').length,
        separando: pedidosDistribuidos.filter(p=>p.status==='separando').length,
        total_itens: sepConcluidos.reduce((s,p)=>s+(parseInt(p.itens)||0),0),
        pontuacao_total: Math.round(sepConcluidos.reduce((s,p)=>s+(parseFloat(p.pontuacao)||0),0)),
        media_tempo_min: avgArr(temposSep),
      },
      checkout:{
        total: checkouts.length,
        concluidos: ckConcluidos.length,
        pendentes: checkouts.filter(c=>c.status!=='concluido').length,
        total_itens: ckConcluidos.reduce((s,c)=>s+(parseInt(c.itens)||0),0),
        media_tempo_min: avgArr(temposCk),
      },
      embalagem:{
        total_embalados: embalagens.length,
        pendentes: pedidosDistribuidos.filter(p=>p.status==='concluido'&&['pendente','embalando','nao_iniciado'].includes(p.status_embalagem||'nao_iniciado')).length,
        total_itens: embalagens.reduce((s,e)=>s+(parseInt(e.itens)||0),0),
        media_tempo_min: avgArr(temposEmb),
      },
      reposicao:{
        total: reposicoes.length,
        resolvidas: reposicoes.filter(r=>['reposto','abastecido','subiu'].includes(r.status)).length,
        pendentes: reposicoes.filter(r=>['pendente','aberto'].includes(r.status)).length,
        nao_encontrados: reposicoes.filter(r=>r.status==='nao_encontrado').length,
      },
      complexidade,
      colaboradores,
      ranking_turnos,
      por_hora,
      por_transportadora,
      por_dia,
      por_dia_total: Object.entries(por_dia_total).sort().map(([d,t])=>({data:d,total:t})),
      sla:{ meta_horas:SLA_H, dentro:slaDentro, fora:slaFora, pct: slaDentro+slaFora>0?Math.round((slaDentro/(slaDentro+slaFora))*100):null },
    });
  } catch(e) { res.status(500).json({erro:e.message}); }
});

/* ══════════════════════════════════════════════════════════════
   ZERAR DADOS DE TESTE
   Limpa todas as tabelas operacionais do dia informado (ou hoje).
   Requer perfil supervisor + confirmação via body { confirmar: true }.
══════════════════════════════════════════════════════════════ */
router.post('/admin/zerar-dados-teste', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  const { confirmar, data } = req.body;
  if (!confirmar) return res.status(400).json({ erro: 'Envie { confirmar: true } para confirmar a operação.' });

  const { data: hoje } = dataHoraLocal();
  const dia = data || hoje;

  try {
    const resultados = {};

    // Pedidos do dia
    const rPed = await pool.query('DELETE FROM pedidos WHERE data_pedido = $1', [dia]);
    resultados.pedidos = rPed.rowCount;

    // Checkout do dia
    const rCk = await pool.query('DELETE FROM checkout WHERE data_checkout = $1', [dia]);
    resultados.checkout = rCk.rowCount;

    // Embalagem do dia
    const rEmb = await pool.query('DELETE FROM embalagem WHERE data_embalagem = $1', [dia]);
    resultados.embalagem = rEmb.rowCount;

    // Avisos de reposição do dia
    const rRep = await pool.query('DELETE FROM avisos_repositor WHERE data_aviso = $1', [dia]);
    resultados.reposicao = rRep.rowCount;

    // Sessões de trabalho do dia
    const rSess = await pool.query('DELETE FROM sessoes_trabalho WHERE data = $1', [dia]);
    resultados.sessoes = rSess.rowCount;

    console.log(`[ZERAR-TESTE] ${req.session?.usuario?.nome} zerou dados de ${dia}:`, resultados);
    res.json({ mensagem: `Dados de ${dia} removidos com sucesso.`, removidos: resultados });
  } catch(e) {
    console.error('[ZERAR-TESTE]', e);
    res.status(500).json({ erro: e.message });
  }
});

module.exports = router;
