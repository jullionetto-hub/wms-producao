import express from 'express';
const router = express.Router();
import { db, pool } from '../../lib/db';
import { requerAuth } from '../../lib/auth';
import { dataHoraLocal, validarId } from '../../lib/helpers';
import type { Linha } from '../../types/db';

/* ── Iniciar busca: cria uma nova tentativa e muda status para 'verificando' ── */
router.put('/repositor/avisos/:id/iniciar-busca', requerAuth, async (req, res) => {
  const id = validarId(req.params.id);
  if (!id) return res.status(400).json({erro:'ID invalido'});
  const { hora } = dataHoraLocal();
  const usuario  = req.session?.usuario?.nome || req.body?.repositor_nome || 'Sistema';

  // Determina turno pela hora atual em America/Sao_Paulo (não a hora local do processo —
  // o servidor no Railway não roda em horário de Brasília, ver dataHoraLocal()).
  const h = parseInt(hora.split(':')[0], 10);
  const turno = h >= 6 && h < 14 ? 'Manha' : h >= 14 && h < 22 ? 'Tarde' : 'Noite';

  // Toda a leitura+decisão+escrita das tentativas roda dentro de uma transação com a linha
  // travada (FOR UPDATE): sem isso, dois repositores tocando "iniciar busca" quase ao mesmo
  // tempo no mesmo aviso liam o mesmo array de tentativas e o segundo UPDATE apagava a
  // tentativa que o primeiro tinha acabado de registrar.
  const client = await pool.connect();
  let resposta = null;
  try {
    await client.query('BEGIN');
    const atualR = await client.query('SELECT * FROM avisos_repositor WHERE id=$1 FOR UPDATE', [id]);
    const atual = atualR.rows[0];
    if (!atual) { resposta = { status: 404, body: { erro: 'Aviso não encontrado' } }; }
    else {
      let tentativas = [];
      try { tentativas = Array.isArray(atual.tentativas) ? atual.tentativas : (atual.tentativas ? JSON.parse(atual.tentativas) : []); } catch{}

      // Se status já é 'verificando' (situacao desincronizada ou app reaberto),
      // apenas sincroniza situacao para restaurar os botões corretos no frontend
      if (atual.status === 'verificando') {
        await client.query(`UPDATE avisos_repositor SET situacao='verificando' WHERE id=$1`, [id]);
        resposta = { status: 200, body: { mensagem: 'Busca já em andamento!', tentativa: atual.total_tentativas || tentativas.length },
          emit: { evento: 'aviso:atualizado', payload: { id, status: 'verificando', numero_pedido: atual.numero_pedido } } };
      } else if (atual.status !== 'pendente') {
        resposta = { status: 409, body: { erro: `Item não pode iniciar busca (status atual: ${atual.status})` } };
      } else {
        // Bloqueia se já atingiu o máximo de 3 tentativas
        const MAX_TENTATIVAS = 3;
        if (tentativas.length >= MAX_TENTATIVAS) {
          const { hora: hProto } = dataHoraLocal();
          await client.query(
            `UPDATE avisos_repositor SET status='nao_encontrado', situacao='nao_encontrado', hora_protocolo=$1, turno_pendente='' WHERE id=$2`,
            [hProto, id]
          );
          resposta = { status: 409, body: { erro: 'Máximo de 3 tentativas atingido. Item enviado para Liberação.' },
            emit: [{ evento: 'liberacao:novo', payload: { id, numero_pedido: atual.numero_pedido } },
                   { evento: 'aviso:atualizado', payload: { id, status: 'nao_encontrado', numero_pedido: atual.numero_pedido } }] };
        } else {
          const novaNum = tentativas.length + 1;
          tentativas.push({ numero: novaNum, repositor: usuario, turno, hora_inicio: hora, hora_fim: null, resultado: null });

          let histAtual = [];
          try { histAtual = Array.isArray(atual.historico) ? atual.historico : (atual.historico ? JSON.parse(atual.historico) : []); } catch{}
          const histNovo = [...histAtual, { usuario, acao: 'verificando', hora }];

          await client.query(
            `UPDATE avisos_repositor
               SET status='verificando', situacao='verificando', hora_inicio_busca=$1,
                   tentativas=$2, total_tentativas=$3,
                   historico=$4, quem_pegou=$5, turno_pendente=''
             WHERE id=$6`,
            [hora, JSON.stringify(tentativas), novaNum, JSON.stringify(histNovo), usuario, id]
          );
          resposta = { status: 200, body: { mensagem: 'Busca iniciada!', tentativa: novaNum },
            emit: { evento: 'aviso:atualizado', payload: { id, status: 'verificando', numero_pedido: atual.numero_pedido } } };
        }
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    return res.status(500).json({erro: e.message});
  } finally {
    client.release();
  }

  const emits = Array.isArray(resposta.emit) ? resposta.emit : (resposta.emit ? [resposta.emit] : []);
  emits.forEach(({ evento, payload }) => req.app.get('io')?.emit(evento, payload));
  res.status(resposta.status).json(resposta.body);
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
  const {data_ini, data_fim} = req.query as Record<string, string>;
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
  const {codigo}=req.query as Record<string, string>;
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
    const rows = await db.all<Linha<'avisos_repositor'>>(
      `SELECT a.* FROM avisos_repositor a
       WHERE a.separador_id=$1 AND a.status IN ('subiu','abastecido','aguardando_abastecer')
         AND a.data_aviso=$2 AND (a.lido_separador IS NULL OR a.lido_separador = false)
       ORDER BY a.id DESC`,
      [req.params.separador_id, hoje]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({erro:e.message}); }
});

module.exports = router;
