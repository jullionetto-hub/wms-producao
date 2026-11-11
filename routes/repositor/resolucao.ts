import express from 'express';
const router = express.Router();
import { db, pool } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';
import { dataHoraLocal, validarId } from '../../lib/helpers';
import type { Linha } from '../../types/db';
import { sincronizarCheckoutPendente } from './_comum';

async function atualizarAviso(req: any, res: any, status: any, extra={}) {
  const {hora} = dataHoraLocal();
  const {qtd_encontrada, repositor_nome} = req.body || {};
  try {
    const campos: Record<string, any> = { status, hora_reposto:hora, repositor_nome: repositor_nome||'', ...extra };
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

async function resolverAvisoEAcumularTempo(req: any, res: any, status: any, extra={}) {
  await atualizarAviso(req, res, status, extra);
  try {
    const av = await db.get<Pick<Linha<'avisos_repositor'>, 'pedido_id'>>('SELECT pedido_id FROM avisos_repositor WHERE id=$1',[req.params.id]);
    if (!av) return;
    await sincronizarCheckoutPendente(av.pedido_id, req.app.get('io')).catch(e => console.warn('sync checkout pendente:', e.message));
    const ped = await db.get<Pick<Linha<'pedidos'>, 'aguardando_repositor_desde' | 'tempo_aguardando_min' | 'status' | 'numero_pedido' | 'numero_caixa' | 'separador_id'>>(
      'SELECT aguardando_repositor_desde, tempo_aguardando_min, status, numero_pedido, numero_caixa, separador_id FROM pedidos WHERE id=$1',
      [av.pedido_id]
    );
    if (!ped || !ped.aguardando_repositor_desde) return;
    const ainda = await db.all<Pick<Linha<'avisos_repositor'>, 'id'>>("SELECT id FROM avisos_repositor WHERE pedido_id=$1 AND status='pendente'",[av.pedido_id]);
    if (ainda.length > 0) return;
    const inicio = new Date(ped.aguardando_repositor_desde);
    const agora  = new Date();
    const mins   = Math.round((+agora - +inicio) / 60000);
    const total  = (ped.tempo_aguardando_min || 0) + (mins > 0 ? mins : 0);
    await pool.query("UPDATE pedidos SET tempo_aguardando_min=$1, aguardando_repositor_desde='' WHERE id=$2",[total, av.pedido_id]);

    // Se o pedido ainda está em 'separando', o separador estava aguardando o repositor
    // para poder concluir. Conclui automaticamente — sem precisar que o separador
    // pressione "Concluir" de novo.
    if (ped.status === 'separando') {
      const { data, hora } = dataHoraLocal();
      await pool.query(
        `UPDATE pedidos SET status='concluido', concluido_em=$1,
           skus_concluido_em=COALESCE(NULLIF(skus_concluido_em,''),$1)
         WHERE id=$2`,
        [data + 'T' + hora, av.pedido_id]
      );
      const sep = ped.separador_id ? await db.get<Pick<Linha<'separadores'>, 'nome'>>('SELECT nome FROM separadores WHERE id=$1',[ped.separador_id]) : null;
      // Verifica se ainda há itens com falta definitiva (não encontrados pelo repositor)
      const comFalta = await db.all<Pick<Linha<'avisos_repositor'>, 'codigo' | 'descricao' | 'quantidade'>>(
        "SELECT codigo, descricao, quantidade FROM avisos_repositor WHERE pedido_id=$1 AND status='nao_encontrado'",
        [av.pedido_id]
      );
      if (comFalta.length > 0) {
        const itens_falta = comFalta.map(a => ({ codigo: a.codigo, descricao: a.descricao, quantidade: a.quantidade }));
        const ckUpd = await pool.query(
          `UPDATE checkout SET status='aguardando_item', itens_falta=$1, hora_criacao=$2, data_checkout=$3 WHERE pedido_id=$4 AND status != 'concluido'`,
          [JSON.stringify(itens_falta), hora, data, av.pedido_id]
        );
        if (!ckUpd.rowCount) {
          await pool.query(
            `INSERT INTO checkout (numero_caixa,pedido_id,numero_pedido,separador_nome,status,hora_criacao,data_checkout,itens_falta) VALUES ($1,$2,$3,$4,'aguardando_item',$5,$6,$7)`,
            [ped.numero_caixa||'', av.pedido_id, ped.numero_pedido||'', sep?.nome||'', hora, data, JSON.stringify(itens_falta)]
          );
        }
      } else {
        const ckUpd = await pool.query(
          `UPDATE checkout SET status='fila', hora_criacao=$1, data_checkout=$2 WHERE pedido_id=$3 AND status != 'concluido'`,
          [hora, data, av.pedido_id]
        );
        if (!ckUpd.rowCount) {
          await pool.query(
            `INSERT INTO checkout (numero_caixa,pedido_id,numero_pedido,separador_nome,status,hora_criacao,data_checkout) VALUES ($1,$2,$3,$4,'fila',$5,$6)`,
            [ped.numero_caixa||'', av.pedido_id, ped.numero_pedido||'', sep?.nome||'', hora, data]
          );
        }
      }
      req.app.get('io')?.emit('pedido:concluido', { pedido_id: av.pedido_id, numero_pedido: ped.numero_pedido, auto: true });
    }
  } catch(e) { console.warn(e); }
}

router.put('/repositor/avisos/:id/reposto',       requerAuth, (req,res) => resolverAvisoEAcumularTempo(req,res,'reposto'));
router.put('/repositor/avisos/:id/encontrado',    requerAuth, (req,res) => resolverAvisoEAcumularTempo(req,res,'reposto'));
router.put('/repositor/avisos/:id/subiu',         requerAuth, (req,res) => resolverAvisoEAcumularTempo(req,res,'subiu'));
router.put('/repositor/avisos/:id/abastecido',    requerAuth, (req,res) => resolverAvisoEAcumularTempo(req,res,'abastecido'));
router.put('/repositor/avisos/:id/nao_encontrado',requerAuth, (req,res) => resolverAvisoEAcumularTempo(req,res,'nao_encontrado'));
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
    const atual = await db.get<Pick<Linha<'avisos_repositor'>, 'status' | 'historico'>>('SELECT status, historico FROM avisos_repositor WHERE id=$1', [req.params.id]);
    if (!atual) return res.status(404).json({erro:'Aviso não encontrado'});
    // Evita atropelar um repositor que já pegou esse item pra fazer a busca
    // final — a tela de Liberação pode estar desatualizada numa aba antiga.
    if (atual.status !== 'nao_encontrado') {
      return res.status(409).json({erro:`Este item não está mais aguardando liberação (status atual: ${atual.status}). Atualize a tela.`});
    }
    let hist = [];
    try { hist = Array.isArray(atual?.historico) ? atual.historico : (atual?.historico ? JSON.parse(atual.historico) : []); } catch{}
    const histNovo = [...hist, { usuario: supervisorNome, acao: 'liberado_supervisor', decisao, hora }];
    const upd = await pool.query(
      `UPDATE avisos_repositor SET status=$1, situacao=$1, hora_reposto=$2, historico=$3, quem_guardou=$4 WHERE id=$5 AND status='nao_encontrado'`,
      [novoStatus, hora, JSON.stringify(histNovo), supervisorNome, req.params.id]
    );
    if (upd.rowCount === 0) {
      return res.status(409).json({erro:'Este item não está mais aguardando liberação — outra ação já mudou o status dele.'});
    }
    if (novoStatus === 'reposto') {
      const av = await db.get<Pick<Linha<'avisos_repositor'>, 'item_id'>>('SELECT item_id FROM avisos_repositor WHERE id=$1', [req.params.id]);
      if (av?.item_id) await pool.query(`UPDATE itens_pedido SET status='encontrado' WHERE id=$1`, [av.item_id]);
    }
    const atual2 = await db.get<Pick<Linha<'avisos_repositor'>, 'numero_pedido' | 'pedido_id'>>('SELECT numero_pedido, pedido_id FROM avisos_repositor WHERE id=$1', [req.params.id]);
    req.app.get('io')?.emit('aviso:atualizado', { id: req.params.id, status: novoStatus, numero_pedido: atual2?.numero_pedido });
    await sincronizarCheckoutPendente(atual2?.pedido_id, req.app.get('io')).catch(e => console.warn('sync checkout pendente:', e.message));
    res.json({mensagem: decisao === 'encontrado' ? 'Item liberado como Encontrado.' : 'Item liberado para Protocolo.'});
  } catch(e) { res.status(500).json({erro: e.message}); }
});

/* ── Busca final — um repositor (o "assistente") faz uma última conferência
   física no item antes de fechar a falta pra valer. Substitui a decisão às
   cegas que a Liberação pedia do supervisor: aqui tem busca de verdade, com
   Iniciar/Encontrei/Não encontrei, igual às 3 tentativas normais — só que
   fora do contador de tentativas (não usa o array `tentativas`), porque essa
   não é mais uma tentativa comum, é a confirmação final. */
router.put('/repositor/avisos/:id/busca-final/iniciar', requerAuth, async (req,res) => {
  const id = validarId(req.params.id);
  if (!id) return res.status(400).json({erro:'ID invalido'});
  const { hora } = dataHoraLocal();
  const usuario = req.session?.usuario?.nome || req.body?.repositor_nome || 'Sistema';
  try {
    const atual = await db.get<Pick<Linha<'avisos_repositor'>, 'status' | 'historico'>>('SELECT status, historico FROM avisos_repositor WHERE id=$1',[id]);
    if (!atual) return res.status(404).json({erro:'Aviso não encontrado'});
    if (atual.status !== 'nao_encontrado') return res.status(409).json({erro:`Item não está aguardando busca final (status atual: ${atual.status})`});
    let hist = [];
    try { hist = Array.isArray(atual.historico) ? atual.historico : (atual.historico ? JSON.parse(atual.historico) : []); } catch{}
    const histNovo = [...hist, { usuario, acao:'busca_final_iniciada', hora }];
    await pool.query(
      `UPDATE avisos_repositor SET status='busca_final', situacao='busca_final', hora_inicio_busca=$1, quem_pegou=$2, historico=$3 WHERE id=$4`,
      [hora, usuario, JSON.stringify(histNovo), id]
    );
    req.app.get('io')?.emit('aviso:atualizado', { id, status:'busca_final' });
    res.json({ mensagem:'Busca final iniciada!' });
  } catch(e){res.status(500).json({erro:e.message});}
});

router.put('/repositor/avisos/:id/busca-final/encontrado', requerAuth, async (req,res) => {
  const id = validarId(req.params.id);
  if (!id) return res.status(400).json({erro:'ID invalido'});
  const atual = await db.get<Pick<Linha<'avisos_repositor'>, 'status'>>('SELECT status FROM avisos_repositor WHERE id=$1',[id]);
  if (!atual) return res.status(404).json({erro:'Aviso não encontrado'});
  if (atual.status !== 'busca_final') return res.status(409).json({erro:`Item não está em busca final (status atual: ${atual.status})`});
  // 'abastecido' é o mesmo status terminal que o repositor normal usa quando
  // já entrega o item resolvido com a própria mão — o assistente encontrou e
  // resolveu ali, não precisa devolver pro separador buscar de novo.
  await resolverAvisoEAcumularTempo(req, res, 'abastecido');
  // resolverAvisoEAcumularTempo já respondeu a requisição e também sincroniza
  // o checkout em 'aguardando_item' (sincronizarCheckoutPendente).
});

router.put('/repositor/avisos/:id/busca-final/nao-encontrado', requerAuth, async (req,res) => {
  const id = validarId(req.params.id);
  if (!id) return res.status(400).json({erro:'ID invalido'});
  const { data, hora } = dataHoraLocal();
  const usuario = req.session?.usuario?.nome || req.body?.repositor_nome || 'Sistema';
  try {
    const atual = await db.get<Pick<Linha<'avisos_repositor'>, 'status' | 'historico'>>('SELECT status, historico FROM avisos_repositor WHERE id=$1',[id]);
    if (!atual) return res.status(404).json({erro:'Aviso não encontrado'});
    if (atual.status !== 'busca_final') return res.status(409).json({erro:`Item não está em busca final (status atual: ${atual.status})`});
    let hist = [];
    try { hist = Array.isArray(atual.historico) ? atual.historico : (atual.historico ? JSON.parse(atual.historico) : []); } catch{}
    const histNovo = [...hist, { usuario, acao:'protocolado_busca_final', hora }];
    // Vai direto pra 'protocolado' (sem passar por 'protocolo') — a busca final
    // já É a confirmação definitiva, não precisa de mais ninguém encerrando depois.
    // Não mexe em hora_protocolo (isso já foi gravado quando o item virou
    // 'nao_encontrado', na 3ª tentativa) — data/hora_fechamento é que marcam
    // o fechamento de verdade, pra não misturar os dois significados.
    const upd = await pool.query(
      `UPDATE avisos_repositor SET status='protocolado', situacao='protocolado', quem_guardou=$1,
              historico=$2, data_fechamento=$3, hora_fechamento=$4 WHERE id=$5 AND status='busca_final'`,
      [usuario, JSON.stringify(histNovo), data, hora, id]
    );
    if (upd.rowCount === 0) return res.status(409).json({erro:'Este item não está mais em busca final.'});
    req.app.get('io')?.emit('aviso:atualizado', { id, status:'protocolado' });
    res.json({ mensagem:'Falta confirmada — item encerrado em protocolo.' });
  } catch(e){res.status(500).json({erro:e.message});}
});

module.exports = router;
