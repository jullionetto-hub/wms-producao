const express = require('express');
const router = express.Router();
const { db, pool } = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');
const { dataHoraLocal } = require('../lib/helpers');
const { registrarAuditoria } = require('../lib/auditoria');
const { gerarRelatorio } = require('../lib/relatorio');

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
    res.json(await db.all('SELECT id,data,turno,supervisor,observacoes,criado_em FROM diario_bordo ORDER BY criado_em DESC LIMIT 30'));
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
    const existe = await db.get('SELECT id FROM diario_bordo WHERE data=$1 AND turno=$2', [data, turno]);
    if (existe) {
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

module.exports = router;
