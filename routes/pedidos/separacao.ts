import express from 'express';
const router = express.Router();
import { db, pool } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';
import { dataHoraLocal, validarId } from '../../lib/helpers';
import { registrarAuditoria } from '../../lib/auditoria';
import type { Linha } from '../../types/db';
import { _filaPorItem } from './_comum';

function serializarPorItem(itemId: any, fn: any) {
  const anterior = _filaPorItem.get(itemId) || Promise.resolve();
  const atual = anterior.catch(() => {}).then(fn);
  _filaPorItem.set(itemId, atual);
  const limpar = () => { if (_filaPorItem.get(itemId) === atual) _filaPorItem.delete(itemId); };
  atual.then(limpar, limpar);
  return atual;
}

// Colmeias são bins físicos extras (formato livre, ex: "Bancada 3 / Colmeia B12")
// onde um mesmo código de produto pode ter várias localizações registradas, além
// do endereço principal (corredor) já gravado em itens_pedido.endereco. Durante
// a separação, mostra todas pra não o separador correr todas as ruas achando só
// um endereço desatualizado. Subquery reaproveitada nos dois pontos que montam
// a lista de itens pro separador (pedido individual e lote).
const SUBQ_COLMEIA_ENDERECOS = `(SELECT STRING_AGG(DISTINCT c.endereco, ' · ' ORDER BY c.endereco)
   FROM colmeias c WHERE c.codigo=i.codigo AND c.status='ativo' AND c.endereco<>'')`;

router.put('/pedidos/:id/caixa', requerAuth, async (req,res) => {
  const id = validarId(req.params.id);
  if (!id) return res.status(400).json({erro:'ID invalido'});
  const {numero_caixa}=req.body;
  if (!numero_caixa) return res.status(400).json({erro:'Numero da caixa nao informado!'});
  const caixa=String(numero_caixa).trim();
  try {
    // Caixa está ocupada se: existe outro pedido com ela E não foi cancelado E o checkout ainda não foi concluído
    const usadaPed = await db.get<Pick<Linha<'pedidos'>, 'numero_pedido'>>(
      `SELECT numero_pedido FROM pedidos
       WHERE numero_caixa=$1 AND id<>$2 AND status != 'cancelado'
         AND NOT EXISTS (
           SELECT 1 FROM checkout c WHERE c.pedido_id=pedidos.id AND c.status='concluido'
         )`,
      [caixa, req.params.id]
    );
    if (usadaPed) return res.status(409).json({erro:`Caixa ${caixa} ja esta em uso no pedido #${usadaPed.numero_pedido}!`});
    const usadaCk = await db.get(
      `SELECT c.numero_pedido FROM checkout c JOIN pedidos p ON c.pedido_id=p.id WHERE c.numero_caixa=$1 AND c.pedido_id<>$2 AND c.status='pendente'`,
      [caixa, req.params.id]
    );
    if (usadaCk) return res.status(409).json({erro:`Caixa ${caixa} ja esta aguardando checkout no pedido ${usadaCk.numero_pedido}!`});
    await pool.query('UPDATE pedidos SET numero_caixa=$1 WHERE id=$2',[caixa,req.params.id]);
    res.json({mensagem:'Caixa vinculada!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

router.put('/pedidos/:id/liberar-caixa', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    await pool.query("UPDATE pedidos SET numero_caixa='' WHERE id=$1",[req.params.id]);
    res.json({mensagem:'Caixa liberada!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

router.post('/pedidos/bipar', requerAuth, async (req,res) => {
  const {numero_pedido}=req.body;
  // Identidade de quem bipou vem da sessão, não do corpo da requisição — mesma
  // regra já aplicada em /pedidos/reordenar-fila e /itens/:id/verificar: confiar
  // no valor enviado deixaria qualquer chamada atribuir o pedido a outro separador.
  const separador_id = req.session?.separador?.id || null;
  if (!numero_pedido) return res.status(400).json({erro:'Numero do pedido nao informado!'});
  try {
    const ped=await db.get<Linha<'pedidos'>>('SELECT * FROM pedidos WHERE numero_pedido=$1',[numero_pedido]);
    if (!ped) return res.status(404).json({erro:'Pedido nao encontrado!'});
    if (ped.status==='concluido') return res.status(400).json({erro:'Pedido ja concluido!',status:'concluido'});
    const bipDHL = dataHoraLocal();
    const iniciadoEm = bipDHL.data+'T'+bipDHL.hora;
    // Claim atômico numa única query: evita que duas bipagens quase simultâneas do
    // mesmo pedido leiam o mesmo "sem dono" e a segunda sobrescreva silenciosamente
    // a primeira. Só atribui/reafirma se ninguém MAIS já estiver com ele em separando.
    const r = await pool.query(
      `UPDATE pedidos SET
         separador_id = COALESCE($1, separador_id),
         status = 'separando',
         iniciado_em = COALESCE(NULLIF(iniciado_em,''), $2)
       WHERE id = $3
         AND (separador_id IS NULL OR separador_id = $1 OR status <> 'separando')
       RETURNING *`,
      [separador_id||null, iniciadoEm, ped.id]
    );
    if (!r.rows.length) return res.status(409).json({erro:'Pedido sendo separado por outro operador!'});
    const pedAtual = r.rows[0];
    const jaAtribuido = !!(separador_id && ped.separador_id && String(ped.separador_id)===String(separador_id));
    res.json({
      mensagem: jaAtribuido ? 'Pedido ja atribuido.' : 'Pedido atribuido!',
      pedido_id: pedAtual.id, status:'separando',
      ja_atribuido: jaAtribuido,
      caixa_vinculada: !!(pedAtual.numero_caixa),
    });
  } catch(e){res.status(500).json({erro:e.message});}
});

// Salva a ordem manual (drag-and-drop) que o separador definiu na própria fila —
// só pode reordenar pedidos já atribuídos a ele mesmo.
router.put('/pedidos/reordenar-fila', requerAuth, async (req,res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({erro:'Informe a lista de ids na nova ordem!'});
  const sepId = req.session?.separador?.id;
  if (!sepId) return res.status(403).json({erro:'Usuário não vinculado a um separador.'});
  try {
    for (let i = 0; i < ids.length; i++) {
      const id = validarId(ids[i]);
      if (!id) continue;
      await pool.query('UPDATE pedidos SET ordem_fila=$1 WHERE id=$2 AND separador_id=$3', [i + 1, id, sepId]);
    }
    res.json({ mensagem: 'Ordem da fila atualizada!', atualizados: ids.length });
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.get('/pedidos/lote-itens', requerAuth, async (req,res) => {
  const ids = String(req.query.pedido_ids||'').split(',').map(s=>parseInt(s.trim())).filter(Boolean);
  if (!ids.length) return res.status(400).json({erro:'pedido_ids obrigatorio'});
  try {
    const pedidos = await db.all<Pick<Linha<'pedidos'>, 'id' | 'numero_pedido' | 'total_itens' | 'itens' | 'caixa_lote'>>(`SELECT id,numero_pedido,total_itens,itens,caixa_lote FROM pedidos WHERE id=ANY($1)`, [ids]);
    const caixaMap: Record<string, any> = {};
    ids.forEach((id,i) => { caixaMap[id] = i+1; });
    const itens = await db.all(
      `SELECT i.*,
        COALESCE((SELECT a.status FROM avisos_repositor a WHERE a.item_id=i.id ORDER BY a.id DESC LIMIT 1),'') AS aviso_status,
        COALESCE((SELECT a.qtd_encontrada FROM avisos_repositor a WHERE a.item_id=i.id ORDER BY a.id DESC LIMIT 1),0) AS aviso_qtd_encontrada,
        ${SUBQ_COLMEIA_ENDERECOS} AS colmeia_enderecos,
        p.numero_pedido
       FROM itens_pedido i JOIN pedidos p ON p.id=i.pedido_id
       WHERE i.pedido_id=ANY($1)
       ORDER BY SPLIT_PART(SPLIT_PART(i.endereco,',',1),' ',1), i.pedido_id, i.id`,
      [ids]
    );
    const result = itens.map(i => ({ ...i, caixa_num: caixaMap[i.pedido_id] || 1 }));
    const pedidosOrdenados = ids.map(id => pedidos.find(p => p.id === id)).filter(Boolean);
    res.json({ itens: result, pedidos: pedidosOrdenados });
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.post('/pedidos/lote/iniciar', requerAuth, async (req,res) => {
  const { pedido_ids, caixas } = req.body;
  // caixas = [{pedido_id, caixa_lote}] — atribuição livre de número de caixa física
  if (!pedido_ids?.length) return res.status(400).json({erro:'pedido_ids obrigatorio'});
  const { data, hora } = dataHoraLocal();
  try {
    for (const id of pedido_ids) {
      const caixa = caixas?.find((c: any) => c.pedido_id === id)?.caixa_lote || null;
      await pool.query(
        `UPDATE pedidos SET status='separando', iniciado_em=COALESCE(NULLIF(iniciado_em,''),$1), caixa_lote=$2 WHERE id=$3`,
        [data+'T'+hora, caixa, id]
      );
    }
    res.json({ mensagem:'Lote iniciado!', iniciados: pedido_ids.length });
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.get('/pedidos/buscar-caixa-lote', requerAuth, async (req,res) => {
  const { numero } = req.query as Record<string, string>;
  if (!numero) return res.status(400).json({erro:'numero obrigatorio'});
  try {
    const ped = await db.get<Pick<Linha<'pedidos'>, 'id' | 'numero_pedido' | 'cliente' | 'transportadora' | 'status' | 'caixa_lote' | 'total_itens' | 'itens' | 'status_embalagem'>>(
      `SELECT p.id, p.numero_pedido, p.cliente, p.transportadora, p.status, p.caixa_lote,
              p.total_itens, p.itens, p.status_embalagem
       FROM pedidos p
       WHERE p.caixa_lote=$1
         AND p.status IN ('separando','concluido')
       ORDER BY p.id DESC LIMIT 1`,
      [String(numero).trim()]
    );
    if (!ped) return res.status(404).json({erro:`Nenhum pedido encontrado na caixa ${numero}`});
    res.json(ped);
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.post('/pedidos/lote/concluir', requerAuth, async (req,res) => {
  const { pedido_ids } = req.body;
  if (!pedido_ids?.length) return res.status(400).json({erro:'pedido_ids obrigatorio'});
  const { data, hora } = dataHoraLocal();
  const resultados = [];
  try {
    for (const id of pedido_ids) {
      const pend = await db.all<Pick<Linha<'itens_pedido'>, 'id'>>(`SELECT id FROM itens_pedido WHERE pedido_id=$1 AND status='pendente'`,[id]);
      if (pend.length) { resultados.push({id, ok:false, erro:`${pend.length} item(s) pendente(s)`}); continue; }
      const avisos = await db.all<Pick<Linha<'avisos_repositor'>, 'id'>>(`SELECT id FROM avisos_repositor WHERE pedido_id=$1 AND status IN ('pendente','verificando')`,[id]);
      if (avisos.length) {
        await pool.query(`UPDATE pedidos SET skus_concluido_em=COALESCE(NULLIF(skus_concluido_em,''),$1) WHERE id=$2`,[data+'T'+hora,id]);
        resultados.push({id, ok:false, aguardando:true}); continue;
      }
      await pool.query(
        `UPDATE pedidos SET status='concluido', concluido_em=$1, skus_concluido_em=COALESCE(NULLIF(skus_concluido_em,''),$1) WHERE id=$2`,
        [data+'T'+hora, id]
      );
      const ped = await db.get<Pick<Linha<'pedidos'>, 'numero_pedido' | 'numero_caixa' | 'caixa_lote' | 'separador_id'>>('SELECT numero_pedido,numero_caixa,caixa_lote,separador_id FROM pedidos WHERE id=$1',[id]);
      const sep = ped?.separador_id ? await db.get<Pick<Linha<'separadores'>, 'nome'>>('SELECT nome FROM separadores WHERE id=$1',[ped.separador_id]) : null;
      // Para pedidos de lote usa caixa_lote como número da caixa no checkout
      const ckNumCaixa = ped?.numero_caixa || ped?.caixa_lote || '';
      const ckUpd = await pool.query(
        `UPDATE checkout SET status='fila',hora_criacao=$1,data_checkout=$2 WHERE pedido_id=$3 AND status != 'concluido'`,
        [hora, data, id]
      );
      if (!ckUpd.rowCount) {
        await pool.query(
          `INSERT INTO checkout (numero_caixa,pedido_id,numero_pedido,separador_nome,status,hora_criacao,data_checkout) VALUES ($1,$2,$3,$4,'fila',$5,$6)`,
          [ckNumCaixa,id,ped?.numero_pedido||'',sep?.nome||'',hora,data]
        );
      }
      req.app.get('io')?.emit('pedido:concluido',{pedido_id:id});
      resultados.push({id, ok:true});
    }
    const aguardando = resultados.some(r => r.aguardando);
    res.json({ mensagem: aguardando ? 'Lote aguardando repositor' : 'Lote concluido!', resultados, aguardando });
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.get('/pedidos/:id/itens', requerAuth, async (req,res) => {
  try {
    res.json(await db.all(
      `SELECT i.*,
        COALESCE((SELECT a.status        FROM avisos_repositor a WHERE a.item_id=i.id ORDER BY a.id DESC LIMIT 1),'') AS aviso_status,
        COALESCE((SELECT a.qtd_encontrada FROM avisos_repositor a WHERE a.item_id=i.id ORDER BY a.id DESC LIMIT 1), 0) AS aviso_qtd_encontrada,
        ${SUBQ_COLMEIA_ENDERECOS} AS colmeia_enderecos
       FROM itens_pedido i WHERE i.pedido_id=$1 ORDER BY i.id`,
      [req.params.id]
    ));
  } catch(e){res.status(500).json({erro:e.message});}
});

router.put('/itens/:id/verificar', requerAuth, async (req,res) => {
  const {status,obs,qtd_falta}=req.body;
  // Identidade de quem verificou vem da sessão, não do corpo da requisição — o cliente sempre
  // manda a própria identidade mesmo, mas confiar no valor enviado deixaria qualquer chamada
  // forjar o nome/id de outro separador nos avisos de repositor gerados abaixo.
  const separador_id = req.session?.separador?.id || null;
  const separador_nome = req.session?.separador?.nome || req.session?.usuario?.nome || '';
  const {hora,data}=dataHoraLocal();
  try {
    const item=await db.get(`SELECT i.*,p.numero_pedido FROM itens_pedido i JOIN pedidos p ON i.pedido_id=p.id WHERE i.id=$1`,[req.params.id]);
    if (!item) return res.status(404).json({erro:'Item nao encontrado'});
    await pool.query('UPDATE itens_pedido SET status=$1,obs=$2,qtd_falta=$3,hora_verificado=$4 WHERE id=$5',[status,obs||'',qtd_falta||0,hora,req.params.id]);

    // Quando todos os itens estão verificados (nenhum 'pendente'), o separador terminou
    // o trabalho físico. Grava skus_concluido_em agora para não penalizar espera de repositor.
    const pendR = await db.get(`SELECT COUNT(*)::int AS cnt FROM itens_pedido WHERE pedido_id=$1 AND status='pendente'`,[item.pedido_id]);
    if (!pendR || parseInt(pendR.cnt) === 0) {
      await pool.query(`UPDATE pedidos SET skus_concluido_em=COALESCE(NULLIF(skus_concluido_em,''),$1) WHERE id=$2`,[data+'T'+hora, item.pedido_id]);
    }

    if (status==='falta'||status==='parcial') {
      const qtdA=status==='falta'?item.quantidade:(qtd_falta||0);
      const obsA=status==='parcial'?(obs||''):`Falta total - ${item.quantidade} unidade(s)`;
      const pedidoInfo = await db.get<Pick<Linha<'pedidos'>, 'transportadora'>>(`SELECT transportadora FROM pedidos WHERE id=$1`,[item.pedido_id]);
      const formaEnvio = pedidoInfo?.transportadora || '';
      // Checar "já existe aviso em aberto?" e inserir precisa ser atômico por item: dois toques
      // quase simultâneos em "Falta" passavam os dois pela checagem e criavam DOIS avisos
      // (ex.: ids 248/249, com 1s de diferença) — o repositor resolvia um e o outro ficava
      // na tela. Também considera em aberto o que já está sendo buscado (verificando) ou
      // aguardando busca final, em vez de só 'pendente'.
      await serializarPorItem(item.id, async () => {
        const ja=await db.get<Pick<Linha<'avisos_repositor'>, 'id' | 'status'>>(`SELECT id,status FROM avisos_repositor WHERE item_id=$1 AND status IN ('pendente','verificando','nao_encontrado','busca_final') ORDER BY id DESC LIMIT 1`,[item.id]);
        if (ja) {
          if ((ja.status || 'pendente') === 'pendente') {
            await pool.query(`UPDATE avisos_repositor SET quantidade=$1,obs=$2,hora_aviso=$3,forma_envio=$4 WHERE id=$5`,[qtdA,obsA,hora,formaEnvio,ja.id]);
          }
        } else { await pool.query(`INSERT INTO avisos_repositor (item_id,pedido_id,numero_pedido,separador_id,separador_nome,codigo,descricao,endereco,quantidade,obs,status,hora_aviso,data_aviso,forma_envio) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pendente',$11,$12,$13)`,
          [item.id,item.pedido_id,item.numero_pedido,separador_id,separador_nome,item.codigo,item.descricao,item.endereco,qtdA,obsA,hora,data,formaEnvio]); }
      });
      // Define o início da espera pelo repositor (para cálculo de tempo real de separação).
      // Só marca se ainda não tiver aguardando (não sobrescreve se já havia outro item em falta).
      const pedAtual = await db.get<Pick<Linha<'pedidos'>, 'aguardando_repositor_desde'>>(`SELECT aguardando_repositor_desde FROM pedidos WHERE id=$1`,[item.pedido_id]);
      if (!pedAtual?.aguardando_repositor_desde) {
        const agoraISO = new Date().toISOString();
        await pool.query(`UPDATE pedidos SET aguardando_repositor_desde=$1 WHERE id=$2`,[agoraISO, item.pedido_id]);
      }
      req.app.get('io')?.emit('aviso:novo', { pedido_id: item.pedido_id, numero_pedido: item.numero_pedido, codigo: item.codigo });
      res.json({mensagem:'Repositor avisado!',aviso:true});
    } else { res.json({mensagem:'Item verificado!',aviso:false}); }
  } catch(e){res.status(500).json({erro:e.message});}
});

// Desfaz uma marcação acidental (encontrado/falta/parcial) — volta o item pra
// 'pendente' e cancela o aviso ao repositor, se um foi gerado. Bloqueia se o
// repositor já começou a cuidar do aviso (status diferente de 'pendente'),
// pra não sumir um aviso que já está sendo resolvido sem o separador saber.
router.put('/itens/:id/desfazer', requerAuth, async (req,res) => {
  try {
    const item = await db.get(`SELECT i.*,p.numero_pedido FROM itens_pedido i JOIN pedidos p ON i.pedido_id=p.id WHERE i.id=$1`,[req.params.id]);
    if (!item) return res.status(404).json({erro:'Item nao encontrado'});
    if (item.status === 'pendente') return res.status(400).json({erro:'Item já está pendente.'});

    const aviso = await db.get<Pick<Linha<'avisos_repositor'>, 'id' | 'status'>>(`SELECT id,status FROM avisos_repositor WHERE item_id=$1 ORDER BY id DESC LIMIT 1`,[item.id]);
    if (aviso && aviso.status !== 'pendente') {
      return res.status(409).json({erro:'O repositor já está cuidando deste item — fale com ele antes de desfazer.'});
    }

    await pool.query(`UPDATE itens_pedido SET status='pendente', obs='', qtd_falta=0, hora_verificado='' WHERE id=$1`,[item.id]);
    if (aviso) await pool.query(`DELETE FROM avisos_repositor WHERE id=$1`,[aviso.id]);

    // Se não sobrou nenhum outro item deste pedido aguardando repositor, limpa o marcador de espera.
    const outros = await db.get(`SELECT COUNT(*)::int AS cnt FROM avisos_repositor WHERE pedido_id=$1 AND status IN ('pendente','verificando')`,[item.pedido_id]);
    if (!outros || parseInt(outros.cnt) === 0) {
      await pool.query(`UPDATE pedidos SET aguardando_repositor_desde='' WHERE id=$1`,[item.pedido_id]);
    }

    await registrarAuditoria(req, 'ITEM_DESFEITO', 'item', item.id, {status: item.status}, {status: 'pendente'});
    res.json({mensagem:'Marcação desfeita!', numero_pedido: item.numero_pedido});
  } catch(e){res.status(500).json({erro:e.message});}
});

router.put('/pedidos/:id/concluir', requerAuth, async (req,res) => {
  try {
    // Se o repositor já resolveu os avisos e concluiu automaticamente, retorna sucesso
    const pedCheck = await db.get<Pick<Linha<'pedidos'>, 'status'>>('SELECT status FROM pedidos WHERE id=$1', [req.params.id]);
    if (pedCheck?.status === 'concluido') return res.json({ mensagem: 'Pedido já concluído!' });
    const pend=await db.all<Pick<Linha<'itens_pedido'>, 'id'>>(`SELECT id FROM itens_pedido WHERE pedido_id=$1 AND status='pendente'`,[req.params.id]);
    if (pend.length) return res.status(400).json({erro:`Ainda ha ${pend.length} item(s) nao verificado(s)!`});
    const {data,hora}=dataHoraLocal();
    // Bloqueia se houver avisos 'pendente' (repositor ainda não iniciou busca)
    // OU 'verificando' (repositor está ativamente buscando o item agora).
    // Sem esse bloqueio, o pedido some da fila do separador enquanto o repositor busca.
    const avisos=await db.all<Pick<Linha<'avisos_repositor'>, 'id'>>(
      `SELECT id FROM avisos_repositor WHERE pedido_id=$1 AND status IN ('pendente','verificando')`,
      [req.params.id]
    );
    if (avisos.length) {
      // Separador terminou de escanear todos os SKUs mas está aguardando repositor.
      // Grava skus_concluido_em APENAS se ainda não foi gravado (1ª tentativa de concluir).
      // Esse campo representa o FIM REAL do trabalho do separador.
      await pool.query(
        `UPDATE pedidos SET skus_concluido_em=COALESCE(NULLIF(skus_concluido_em,''),$1) WHERE id=$2`,
        [data+'T'+hora, req.params.id]
      );
      return res.json({aguardando:true,mensagem:`Aguardando repositor (${avisos.length})`});
    }
    // Nenhum aviso pendente — conclui normalmente.
    // Se skus_concluido_em ainda não foi gravado (pedido sem faltas), usa este momento.
    await pool.query(
      `UPDATE pedidos SET status='concluido', concluido_em=$1,
         skus_concluido_em=COALESCE(NULLIF(skus_concluido_em,''),$1)
       WHERE id=$2`,
      [data+'T'+hora, req.params.id]
    );
    // Garante registro de checkout com status 'fila' (aguardando operador escanear)
    // Só muda para 'pendente' quando o operador de checkout abre o pedido (GET /checkout/caixa/:numero)
    const ped = await db.get<Pick<Linha<'pedidos'>, 'numero_pedido' | 'numero_caixa' | 'separador_id'>>('SELECT numero_pedido, numero_caixa, separador_id FROM pedidos WHERE id=$1',[req.params.id]);
    const sep = ped?.separador_id ? await db.get<Pick<Linha<'separadores'>, 'nome'>>('SELECT nome FROM separadores WHERE id=$1',[ped.separador_id]) : null;
    const ckUpd = await pool.query(
      `UPDATE checkout SET status='fila',hora_criacao=$1,data_checkout=$2 WHERE pedido_id=$3 AND status != 'concluido'`,
      [hora, data, req.params.id]
    );
    if (!ckUpd.rowCount) {
      await pool.query(
        `INSERT INTO checkout (numero_caixa,pedido_id,numero_pedido,separador_nome,status,hora_criacao,data_checkout) VALUES ($1,$2,$3,$4,'fila',$5,$6)`,
        [ped?.numero_caixa||'',req.params.id,ped?.numero_pedido||'',sep?.nome||'',hora,data]
      );
    }
    req.app.get('io')?.emit('pedido:concluido', { pedido_id: req.params.id });
    res.json({mensagem:'Pedido concluido!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

router.put('/pedidos/:id/concluir-com-falta', requerAuth, async (req, res) => {
  try {
    const pend = await db.all<Pick<Linha<'itens_pedido'>, 'id'>>(`SELECT id FROM itens_pedido WHERE pedido_id=$1 AND status='pendente'`, [req.params.id]);
    if (pend.length) return res.status(400).json({ erro: `Ainda há ${pend.length} item(s) não verificado(s)!` });

    const { data, hora } = dataHoraLocal();

    // Busca itens que estão aguardando repositor
    const avisos = await db.all<Pick<Linha<'avisos_repositor'>, 'codigo' | 'descricao' | 'quantidade'>>(
      `SELECT codigo, descricao, quantidade FROM avisos_repositor
       WHERE pedido_id=$1 AND status IN ('pendente','verificando','nao_encontrado')`,
      [req.params.id]
    );
    if (!avisos.length) return res.status(400).json({ erro: 'Nenhum item com falta registrado. Use Concluir normalmente.' });

    const itens_falta = avisos.map(a => ({ codigo: a.codigo, descricao: a.descricao, quantidade: a.quantidade }));

    // Conclui o pedido
    await pool.query(
      `UPDATE pedidos SET status='concluido', concluido_em=$1,
         skus_concluido_em=COALESCE(NULLIF(skus_concluido_em,''),$1) WHERE id=$2`,
      [data + 'T' + hora, req.params.id]
    );

    // Cria ou atualiza registro de checkout como aguardando_item
    const ped = await db.get<Pick<Linha<'pedidos'>, 'numero_pedido' | 'numero_caixa' | 'separador_id'>>('SELECT numero_pedido, numero_caixa, separador_id FROM pedidos WHERE id=$1', [req.params.id]);
    const sep = ped?.separador_id ? await db.get<Pick<Linha<'separadores'>, 'nome'>>('SELECT nome FROM separadores WHERE id=$1', [ped.separador_id]) : null;
    const ckUpd = await pool.query(
      `UPDATE checkout SET status='aguardando_item', itens_falta=$1, hora_criacao=$2, data_checkout=$3 WHERE pedido_id=$4 AND status != 'concluido'`,
      [JSON.stringify(itens_falta), hora, data, req.params.id]
    );
    if (!ckUpd.rowCount) {
      await pool.query(
        `INSERT INTO checkout (numero_caixa,pedido_id,numero_pedido,separador_nome,status,hora_criacao,data_checkout,itens_falta)
         VALUES ($1,$2,$3,$4,'aguardando_item',$5,$6,$7)`,
        [ped?.numero_caixa || '', req.params.id, ped?.numero_pedido || '', sep?.nome || '', hora, data, JSON.stringify(itens_falta)]
      );
    }

    req.app.get('io')?.emit('pedido:concluido', { pedido_id: req.params.id });
    res.json({ mensagem: 'Pedido concluído com falta!', itens_falta: itens_falta.length });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Separador escolhe separar UM pedido de um lote ainda não iniciado, pedido a pedido:
// o pedido sai do lote (lote_id=NULL) e segue o fluxo normal de pedido individual.
// Só o dono do lote e só enquanto 'pendente' — depois de iniciado o lote não se divide.
router.put('/pedidos/:id/tirar-do-lote', requerAuth, async (req,res) => {
  const id = validarId(req.params.id);
  if (!id) return res.status(400).json({erro:'Id inválido!'});
  const sepId = req.session?.separador?.id;
  if (!sepId) return res.status(403).json({erro:'Usuário não vinculado a um separador.'});
  try {
    const ped = await db.get<Pick<Linha<'pedidos'>, 'id' | 'numero_pedido' | 'status' | 'lote_id' | 'separador_id'>>('SELECT id,numero_pedido,status,lote_id,separador_id FROM pedidos WHERE id=$1',[id]);
    if (!ped) return res.status(404).json({erro:'Pedido não encontrado!'});
    if (String(ped.separador_id) !== String(sepId)) return res.status(403).json({erro:'Este pedido não é seu.'});
    if (!ped.lote_id) return res.json({mensagem:'Pedido já está fora de lote.', numero_pedido:ped.numero_pedido});
    if (ped.status !== 'pendente') return res.status(409).json({erro:'O lote já foi iniciado — não é possível separar este pedido à parte.'});
    const r = await pool.query(
      `UPDATE pedidos SET lote_id=NULL WHERE id=$1 AND status='pendente' AND lote_id IS NOT NULL RETURNING id`,[id]);
    if (!r.rows.length) return res.status(409).json({erro:'O lote já foi iniciado — não é possível separar este pedido à parte.'});
    await registrarAuditoria(req, 'PEDIDO_TIRADO_DO_LOTE', 'pedido', id, {lote_id:ped.lote_id}, {lote_id:null});
    res.json({mensagem:'Pedido separado do lote.', numero_pedido:ped.numero_pedido});
  } catch(e){res.status(500).json({erro:e.message});}
});

router.put('/pedidos/:id/redefinir', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try { await pool.query(`UPDATE pedidos SET status='pendente',separador_id=NULL WHERE id=$1`,[req.params.id]); res.json({mensagem:'Redefinido!'}); }
  catch(e){res.status(500).json({erro:e.message});}
});

router.put('/pedidos/embalagem/reenviar', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const { numero_pedido } = req.body;
  if (!numero_pedido) return res.status(400).json({erro:'numero_pedido obrigatorio'});
  try {
    const ped = await db.get<Linha<'pedidos'>>('SELECT * FROM pedidos WHERE numero_pedido=$1',[numero_pedido]);
    if (!ped) return res.status(404).json({erro:'Pedido não encontrado'});
    if (ped.status_embalagem === 'embalado') return res.status(400).json({erro:'Pedido já embalado!'});
    await pool.query(`UPDATE pedidos SET status='concluido', status_embalagem='pendente' WHERE numero_pedido=$1`,[numero_pedido]);
    const cache = req.app.get('kpiCache'); if (cache) cache.ts = 0;
    res.json({mensagem:`Pedido #${numero_pedido} reenviado para embalagem!`});
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.put('/pedidos/:id/desbloquear', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const {data, hora} = dataHoraLocal();
    await pool.query(`UPDATE pedidos SET status='concluido', status_embalagem='pendente' WHERE id=$1`,[req.params.id]);
    const ped = await db.get<Pick<Linha<'pedidos'>, 'numero_pedido' | 'numero_caixa' | 'separador_id'>>('SELECT numero_pedido, numero_caixa, separador_id FROM pedidos WHERE id=$1',[req.params.id]);
    const sep = ped?.separador_id ? await db.get<Pick<Linha<'separadores'>, 'nome'>>('SELECT nome FROM separadores WHERE id=$1',[ped.separador_id]) : null;
    const ckExist = await db.get<Pick<Linha<'checkout'>, 'id'>>('SELECT id FROM checkout WHERE pedido_id=$1',[req.params.id]);
    if (ckExist) {
      await pool.query(`UPDATE checkout SET status='concluido',hora_checkout=$1,data_checkout=$2 WHERE pedido_id=$3`,[hora,data,req.params.id]);
    } else {
      await pool.query(
        `INSERT INTO checkout (numero_caixa,pedido_id,numero_pedido,separador_nome,status,hora_criacao,hora_checkout,data_checkout) VALUES ($1,$2,$3,$4,'concluido',$5,$5,$6)`,
        [ped?.numero_caixa||'',req.params.id,ped?.numero_pedido||'',sep?.nome||'',hora,data]
      );
    }
    const cache = req.app.get('kpiCache'); if (cache) cache.ts = 0;
    res.json({mensagem:'Pedido desbloqueado!'});
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.put('/pedidos/:id/separador', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {separador_id}=req.body;
  try {
    await pool.query('UPDATE pedidos SET separador_id=$1 WHERE id=$2',[separador_id||null,req.params.id]);
    res.json({mensagem:'Separador atribuido!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

module.exports = router;
