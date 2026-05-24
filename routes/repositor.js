const express = require('express');
const router = express.Router();
const { db, pool } = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');
const { dataHoraLocal, validarId } = require('../lib/helpers');

// Garante coluna historico (roda uma vez na inicialização)
pool.query(`ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS historico JSONB DEFAULT '[]'::jsonb`).catch(()=>{});

router.get('/repositor/avisos', requerAuth, async (req,res) => {
  if (!req.session?.usuario) return res.json([]);
  const {status, data, data_ini, data_fim, codigo} = req.query;
  try {
    let sql=`SELECT a.*,
             COALESCE(a.forma_envio, p.transportadora, '') as forma_envio_real,
             CASE WHEN UPPER(COALESCE(a.forma_envio, p.transportadora,'')) LIKE '%DRIVE%'
                    OR UPPER(COALESCE(a.forma_envio, p.transportadora,'')) LIKE '%RETIRADA%'
                  THEN 0 ELSE 1 END as prioridade
             FROM avisos_repositor a
             LEFT JOIN pedidos p ON a.pedido_id = p.id
             WHERE 1=1`;
    const params=[];
    if (status) {
      const list = status.split(',').map(s=>s.trim()).filter(Boolean);
      if (list.length === 1) { params.push(list[0]); sql+=` AND a.status=$${params.length}`; }
      else if (list.length > 1) { const ph=list.map((_,i)=>`$${params.length+i+1}`).join(','); params.push(...list); sql+=` AND a.status IN (${ph})`; }
    }
    if (data){params.push(data);sql+=` AND a.data_aviso=$${params.length}`;}
    if (data_ini){params.push(data_ini);sql+=` AND a.data_aviso>=$${params.length}`;}
    if (data_fim){params.push(data_fim);sql+=` AND a.data_aviso<=$${params.length}`;}
    if (codigo){params.push('%'+codigo+'%');sql+=` AND UPPER(a.codigo) LIKE UPPER($${params.length})`;}
    const rows = await db.all(sql+' ORDER BY prioridade ASC, a.id DESC', params);
    res.json(rows.map(r=>({...r, forma_envio: r.forma_envio_real||r.forma_envio||''})));
  } catch(e){res.status(500).json({erro:e.message});}
});

router.put('/repositor/avisos/:id', requerAuth, async (req,res) => {
  const id = validarId(req.params.id);
  if (!id) return res.status(400).json({erro:'ID invalido'});
  const {status,obs,qtd_encontrada,repositor_nome,quem_pegou,quem_guardou,forma_envio,situacao}=req.body;
  const {hora}=dataHoraLocal();
  const usuario = req.session?.usuario?.nome || repositor_nome || 'Sistema';
  try {
    const st = situacao || status || 'pendente';
    const atual = await db.get('SELECT * FROM avisos_repositor WHERE id=$1',[id]);
    // Impede reverter um item já finalizado (protocolo/abastecido) para etapa anterior
    const estadosFinais = ['abastecido','protocolo','devolucao'];
    const estadosNaoFinal = ['pendente','verificando','buscado','separado','aguardando_abastecer','subiu'];
    if (estadosFinais.includes(atual?.status) && estadosNaoFinal.includes(st)) {
      return res.status(409).json({erro:`Item já está em estado final: ${atual.status}. Não pode ser revertido.`});
    }
    const qPegou   = quem_pegou   || atual?.quem_pegou   || '';
    const qGuardou = quem_guardou || atual?.quem_guardou || '';
    const fEnvio   = forma_envio  || atual?.forma_envio  || '';
    const qtdEnc   = qtd_encontrada !== undefined ? qtd_encontrada : (atual?.qtd_encontrada || 0);
    const obsVal   = obs !== undefined ? obs : (atual?.obs || '');

    // Registra histórico por etapa (só loga se o status mudou)
    let histAtual = [];
    try { histAtual = Array.isArray(atual?.historico) ? atual.historico : (atual?.historico ? JSON.parse(atual.historico) : []); } catch{}
    const histNovo = (st !== (atual?.status||'pendente'))
      ? [...histAtual, { usuario, acao: st, hora }]
      : histAtual;

    const upd = await pool.query(
      `UPDATE avisos_repositor SET status=$1,obs=$2,qtd_encontrada=$3,repositor_nome=$4,hora_reposto=$5,quem_pegou=$6,quem_guardou=$7,forma_envio=$8,situacao=$9,historico=$10 WHERE id=$11`,
      [st, obsVal, qtdEnc, repositor_nome||qPegou||'', hora, qPegou, qGuardou, fEnvio, st, JSON.stringify(histNovo), id]
    );
    if (upd.rowCount === 0) return res.status(404).json({erro:'Aviso não encontrado'});
    if (['abastecido','reposto','encontrado'].includes(st)) {
      const av = await db.get('SELECT item_id FROM avisos_repositor WHERE id=$1',[id]);
      if (av) await pool.query(`UPDATE itens_pedido SET status='encontrado' WHERE id=$1`,[av.item_id]);
    }
    const io = req.app.get('io');
    io?.emit('aviso:atualizado', { id, status: st, numero_pedido: atual?.numero_pedido });
    if (st === 'nao_encontrado') io?.emit('liberacao:novo', { id });
    res.json({mensagem:'Aviso atualizado!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

router.post('/repositor/entrada-manual', requerAuth, requerPerfil('supervisor','repositor'), async (req,res) => {
  const {codigo, descricao, quantidade, obs, repositor_nome, situacao} = req.body;
  const {data, hora} = dataHoraLocal();
  try {
    const result = await pool.query(
      `INSERT INTO avisos_repositor (item_id, pedido_id, numero_pedido, separador_nome, codigo, descricao, quantidade, obs, status, situacao, hora_aviso, data_aviso, repositor_nome, quem_pegou, entrada_manual)
       VALUES (0, 0, 'ENTRADA-MANUAL', 'Entrada Manual', $1, $2, $3, $4, $5, $5, $6, $7, $8, $8, true) RETURNING id`,
      [codigo||'', descricao||'', quantidade||1, obs||'', situacao||'abastecido', hora, data, repositor_nome||'']
    );
    res.json({id: result.rows[0].id, mensagem: 'Entrada registrada!'});
  } catch(e) { res.status(500).json({erro: e.message}); }
});

router.put('/repositor/avisos/:id/lido-separador', requerAuth, async (req,res) => {
  const id = validarId(req.params.id);
  if (!id) return res.status(400).json({erro:'ID invalido'});
  try {
    await pool.query('UPDATE avisos_repositor SET lido_separador=true WHERE id=$1', [id]);
    res.json({mensagem:'Aviso confirmado!'});
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.get('/repositor/ranking-produtos', requerAuth, async (req,res) => {
  const {data_ini, data_fim} = req.query;
  try {
    let sql = `SELECT codigo, descricao, COUNT(*) as total,
               SUM(CASE WHEN status='abastecido' THEN 1 ELSE 0 END) as abastecidos,
               SUM(CASE WHEN status='nao_encontrado' THEN 1 ELSE 0 END) as nao_encontrados,
               MAX(data_aviso) as ultima_vez
               FROM avisos_repositor WHERE codigo != '' AND codigo IS NOT NULL`;
    const params = [];
    if (data_ini){params.push(data_ini);sql+=` AND data_aviso>=$${params.length}`;}
    if (data_fim){params.push(data_fim);sql+=` AND data_aviso<=$${params.length}`;}
    sql += ` GROUP BY codigo, descricao ORDER BY total DESC LIMIT 50`;
    res.json(await db.all(sql, params));
  } catch(e){res.status(500).json({erro:e.message});}
});

router.get('/repositor/buscar-produto', requerAuth, async (req,res) => {
  const {codigo}=req.query;
  if (!codigo) return res.status(400).json({erro:'Código não informado'});
  try {
    const rows = await db.all(
      `SELECT i.codigo, i.descricao, i.endereco, i.quantidade,
              p.numero_pedido, a.status as aviso_status
       FROM itens_pedido i
       JOIN pedidos p ON i.pedido_id=p.id
       LEFT JOIN avisos_repositor a ON a.item_id=i.id AND a.status='pendente'
       WHERE UPPER(i.codigo) LIKE UPPER($1) AND p.status IN ('separando','pendente')
       ORDER BY p.id DESC LIMIT 20`,
      ['%'+codigo+'%']
    );
    res.json(rows);
  } catch(e){res.status(500).json({erro:e.message});}
});

router.get('/repositor/duplicatas', requerAuth, async (req,res) => {
  try {
    const rows = await db.all(`
      SELECT i.codigo, i.descricao,
        COUNT(DISTINCT i.pedido_id) as total_pedidos,
        STRING_AGG(DISTINCT p.numero_pedido::text, ', ') as pedidos
      FROM itens_pedido i
      JOIN pedidos p ON i.pedido_id=p.id
      JOIN avisos_repositor a ON a.item_id=i.id
      WHERE a.status='pendente'
      GROUP BY i.codigo, i.descricao
      HAVING COUNT(DISTINCT i.pedido_id) > 1`
    );
    res.json(rows);
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.get('/repositor/duplicatas-dia', requerAuth, async (req,res) => {
  const {data:hoje} = dataHoraLocal();
  try {
    const rows = await db.all(`
      SELECT a.codigo, a.descricao,
        COUNT(DISTINCT a.pedido_id) as total_pedidos,
        STRING_AGG(DISTINCT a.numero_pedido, ', ') as pedidos,
        MIN(a.hora_aviso) as primeira_hora
      FROM avisos_repositor a
      WHERE a.data_aviso=$1
        AND a.status IN ('pendente','encontrado','subiu','abastecido')
      GROUP BY a.codigo, a.descricao
      HAVING COUNT(DISTINCT a.pedido_id) > 1
      ORDER BY total_pedidos DESC`,
      [hoje]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.get('/repositor/avisos/separador/:separador_id', requerAuth, async (req,res) => {
  const {data:hoje} = dataHoraLocal();
  try {
    const rows = await db.all(
      `SELECT a.* FROM avisos_repositor a
       WHERE a.separador_id=$1 AND a.status IN ('subiu','abastecido','aguardando_abastecer')
         AND a.data_aviso=$2 AND (a.lido_separador IS NULL OR a.lido_separador = false)
       ORDER BY a.id DESC`,
      [req.params.separador_id, hoje]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({erro:e.message}); }
});

async function atualizarAviso(req, res, status, extra={}) {
  const {hora} = dataHoraLocal();
  const {qtd_encontrada, repositor_nome} = req.body || {};
  try {
    const campos = { status, hora_reposto:hora, repositor_nome: repositor_nome||'', ...extra };
    if (qtd_encontrada !== undefined) campos.qtd_encontrada = parseInt(qtd_encontrada)||0;
    const sets = Object.keys(campos).map((k,i) => `${k}=$${i+1}`).join(',');
    await pool.query(
      `UPDATE avisos_repositor SET ${sets} WHERE id=$${Object.keys(campos).length+1}`,
      [...Object.values(campos), req.params.id]
    );
    req.app.get('io')?.emit('aviso:atualizado', { id: req.params.id, status });
    res.json({mensagem:'Aviso atualizado!'});
  } catch(e) { res.status(500).json({erro:e.message}); }
}

async function resolverAvisoEAcumularTempo(req, res, status, extra={}) {
  await atualizarAviso(req, res, status, extra);
  try {
    const av = await db.get('SELECT pedido_id FROM avisos_repositor WHERE id=$1',[req.params.id]);
    if (!av) return;
    const ped = await db.get('SELECT aguardando_repositor_desde, tempo_aguardando_min FROM pedidos WHERE id=$1',[av.pedido_id]);
    if (!ped || !ped.aguardando_repositor_desde) return;
    const ainda = await db.all("SELECT id FROM avisos_repositor WHERE pedido_id=$1 AND status='pendente'",[av.pedido_id]);
    if (ainda.length > 0) return;
    const inicio = new Date(ped.aguardando_repositor_desde);
    const agora  = new Date();
    const mins   = Math.round((agora - inicio) / 60000);
    const total  = (ped.tempo_aguardando_min || 0) + (mins > 0 ? mins : 0);
    await pool.query("UPDATE pedidos SET tempo_aguardando_min=$1, aguardando_repositor_desde='' WHERE id=$2",[total, av.pedido_id]);
  } catch(e) { console.warn(e); }
}

router.put('/repositor/avisos/:id/reposto',       requerAuth, (req,res) => resolverAvisoEAcumularTempo(req,res,'reposto'));
router.put('/repositor/avisos/:id/encontrado',    requerAuth, (req,res) => resolverAvisoEAcumularTempo(req,res,'reposto'));
router.put('/repositor/avisos/:id/subiu',         requerAuth, (req,res) => resolverAvisoEAcumularTempo(req,res,'subiu'));
router.put('/repositor/avisos/:id/abastecido',    requerAuth, (req,res) => resolverAvisoEAcumularTempo(req,res,'abastecido'));
router.put('/repositor/avisos/:id/nao_encontrado',requerAuth, (req,res) => atualizarAviso(req,res,'nao_encontrado'));
router.put('/repositor/avisos/:id/protocolo',     requerAuth, (req,res) => atualizarAviso(req,res,'protocolo'));
router.put('/repositor/avisos/:id/devolucao',     requerAuth, (req,res) => atualizarAviso(req,res,'devolucao'));
router.put('/repositor/avisos/:id/liberar', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const { hora } = dataHoraLocal();
    const supervisorNome = req.session?.usuario?.nome || 'Supervisor';
    // decisao: 'encontrado' → reposto (item foi localizado)
    //          'nao_encontrado' ou padrão → protocolo (registra falta)
    const decisao = req.body?.decisao || 'nao_encontrado';
    const novoStatus = decisao === 'encontrado' ? 'reposto' : 'protocolo';
    const atual = await db.get('SELECT historico FROM avisos_repositor WHERE id=$1', [req.params.id]);
    let hist = [];
    try { hist = Array.isArray(atual?.historico) ? atual.historico : (atual?.historico ? JSON.parse(atual.historico) : []); } catch{}
    const histNovo = [...hist, { usuario: supervisorNome, acao: 'liberado_supervisor', decisao, hora }];
    await pool.query(
      `UPDATE avisos_repositor SET status=$1, situacao=$1, hora_reposto=$2, historico=$3, quem_guardou=$4 WHERE id=$5`,
      [novoStatus, hora, JSON.stringify(histNovo), supervisorNome, req.params.id]
    );
    const atual2 = await db.get('SELECT numero_pedido FROM avisos_repositor WHERE id=$1', [req.params.id]);
    req.app.get('io')?.emit('aviso:atualizado', { id: req.params.id, status: novoStatus, numero_pedido: atual2?.numero_pedido });
    res.json({mensagem: decisao === 'encontrado' ? 'Item liberado como Encontrado.' : 'Item liberado para Protocolo.'});
  } catch(e) { res.status(500).json({erro: e.message}); }
});

router.get('/protocolo', requerAuth, async (req,res) => {
  try {
    const { data, data_ini, data_fim } = req.query;
    let sql = `SELECT a.*, p.numero_pedido, p.cliente FROM avisos_repositor a LEFT JOIN pedidos p ON a.pedido_id=p.id WHERE a.status='protocolo'`;
    const params = [];
    // suporta filtro legado (data única) e novo (data_ini/data_fim)
    if (data)     { params.push(data);     sql += ` AND a.data_aviso=$${params.length}`; }
    if (data_ini) { params.push(data_ini); sql += ` AND a.data_aviso>=$${params.length}`; }
    if (data_fim) { params.push(data_fim); sql += ` AND a.data_aviso<=$${params.length}`; }
    sql += ` ORDER BY a.id DESC`;
    res.json(await db.all(sql, params)||[]);
  } catch(e) { res.status(500).json({erro: e.message}); }
});

module.exports = router;
