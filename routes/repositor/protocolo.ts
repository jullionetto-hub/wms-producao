import express from 'express';
const router = express.Router();
import { db, pool } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';
import { dataHoraLocal, validarId } from '../../lib/helpers';
import type { Linha } from '../../types/db';

router.get('/protocolo/historico', requerAuth, async (req,res) => {
  try {
    const { data_ini, data_fim } = req.query as Record<string, string>;
    // Filtra pela data em que o item FECHOU (data_fechamento), não pela data em
    // que o aviso foi aberto — senão um item aberto há dias e fechado hoje não
    // aparecia no filtro "hoje". Itens antigos sem data_fechamento (fechados
    // antes dessa coluna existir) caem de volta pra data_aviso como aproximação.
    let sql = `SELECT a.*, COALESCE(p.numero_pedido, a.numero_pedido) as numero_pedido, COALESCE(p.cliente,'') as cliente, COALESCE(p.transportadora,'') as transportadora
               FROM avisos_repositor a
               LEFT JOIN pedidos p ON a.pedido_id = p.id
               WHERE a.status = 'protocolado'`;
    const params = [];
    const dataRef = `COALESCE(NULLIF(a.data_fechamento,''), a.data_aviso)`;
    if (data_ini) { params.push(data_ini); sql += ` AND ${dataRef} >= $${params.length}`; }
    if (data_fim) { params.push(data_fim); sql += ` AND ${dataRef} <= $${params.length}`; }
    sql += ` ORDER BY a.id DESC LIMIT 200`;
    res.json(await db.all(sql, params) || []);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.get('/protocolo', requerAuth, async (req,res) => {
  try {
    const { data, data_ini, data_fim } = req.query as Record<string, string>;
    let sql = `SELECT a.*, COALESCE(p.numero_pedido, a.numero_pedido) as numero_pedido, COALESCE(p.cliente,'') as cliente, COALESCE(p.transportadora,'') as transportadora FROM avisos_repositor a LEFT JOIN pedidos p ON a.pedido_id=p.id WHERE a.status='protocolo'`;
    const params = [];
    // suporta filtro legado (data única) e novo (data_ini/data_fim)
    if (data)     { params.push(data);     sql += ` AND a.data_aviso=$${params.length}`; }
    if (data_ini) { params.push(data_ini); sql += ` AND a.data_aviso>=$${params.length}`; }
    if (data_fim) { params.push(data_fim); sql += ` AND a.data_aviso<=$${params.length}`; }
    sql += ` ORDER BY a.id DESC`;
    res.json(await db.all(sql, params)||[]);
  } catch(e) { res.status(500).json({erro: e.message}); }
});

// Encerra UM item em protocolo — equivalente de item único do endpoint em lote
// abaixo. Supervisor-only: fechar um protocolo (confirmar baixa definitiva de
// estoque) é decisão de supervisão, não de qualquer perfil autenticado.
router.put('/protocolo/:id/encerrar', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const id = validarId(req.params.id);
  if (!id) return res.status(400).json({erro:'ID invalido'});
  const supervisorNome = req.session?.usuario?.nome || 'Supervisor';
  const { data, hora } = dataHoraLocal();
  try {
    const atual = await db.get<Pick<Linha<'avisos_repositor'>, 'status' | 'historico' | 'numero_pedido'>>('SELECT status, historico, numero_pedido FROM avisos_repositor WHERE id=$1',[id]);
    if (!atual) return res.status(404).json({erro:'Aviso não encontrado'});
    if (atual.status !== 'protocolo') return res.status(409).json({erro:`Item não está em protocolo (status atual: ${atual.status})`});
    let hist = [];
    try { hist = Array.isArray(atual.historico) ? atual.historico : (atual.historico ? JSON.parse(atual.historico) : []); } catch{}
    const histNovo = [...hist, { usuario: supervisorNome, acao:'protocolado', hora }];
    // WHERE status='protocolo' de novo na hora de gravar: se alguém já fechou
    // esse mesmo item nos milissegundos entre o SELECT e aqui (ex.: clique duplo
    // ou corrida com "Encerrar Pedido"), rowCount vem 0 em vez de sobrescrever.
    const upd = await pool.query(
      `UPDATE avisos_repositor SET status='protocolado', situacao='protocolado', quem_guardou=$1,
              historico=$2, data_fechamento=$3, hora_fechamento=$4 WHERE id=$5 AND status='protocolo'`,
      [supervisorNome, JSON.stringify(histNovo), data, hora, id]
    );
    if (upd.rowCount === 0) return res.status(409).json({erro:'Este item já foi encerrado por outra ação.'});
    req.app.get('io')?.emit('protocolo:encerrado', { id, numero_pedido: atual.numero_pedido });
    res.json({ mensagem:'Item encerrado em protocolo!' });
  } catch(e){res.status(500).json({erro:e.message});}
});

// Encerra o protocolo de todos os itens de um pedido de uma vez — transacional:
// se qualquer item falhar no meio, desfaz tudo em vez de deixar o pedido
// parcialmente fechado sem explicação.
router.post('/protocolo/pedido/:pedido_id/encerrar', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  const { pedido_id } = req.params;
  const supervisorNome = req.session?.usuario?.nome || 'Supervisor';
  const { data, hora } = dataHoraLocal();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const itens = await client.query(
      `SELECT id, historico FROM avisos_repositor WHERE pedido_id=$1 AND status='protocolo' FOR UPDATE`,
      [pedido_id]
    );
    if (!itens.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ erro: 'Nenhum item em protocolo para este pedido.' });
    }

    let fechados = 0;
    for (const item of itens.rows) {
      let hist = [];
      try { hist = Array.isArray(item.historico) ? item.historico : (item.historico ? JSON.parse(item.historico) : []); } catch{}
      const histNovo = [...hist, { usuario: supervisorNome, acao: 'protocolado', hora }];
      const upd = await client.query(
        `UPDATE avisos_repositor SET status='protocolado', situacao='protocolado', quem_guardou=$1,
                historico=$2, data_fechamento=$3, hora_fechamento=$4 WHERE id=$5 AND status='protocolo'`,
        [supervisorNome, JSON.stringify(histNovo), data, hora, item.id]
      );
      fechados += upd.rowCount!;
    }
    await client.query('COMMIT');

    const ped = await db.get<Pick<Linha<'pedidos'>, 'numero_pedido'>>('SELECT numero_pedido FROM pedidos WHERE id=$1', [pedido_id]);
    req.app.get('io')?.emit('protocolo:encerrado', { pedido_id, numero_pedido: ped?.numero_pedido });

    res.json({
      mensagem: `✅ Protocolo do pedido #${ped?.numero_pedido || pedido_id} encerrado! ${fechados} item(ns) protocolado(s).`,
      itens_encerrados: fechados
    });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(500).json({ erro: e.message });
  } finally { client.release(); }
});

module.exports = router;
