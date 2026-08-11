const express = require('express');
const router = express.Router();
const { db, pool } = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');
const { dataHoraLocal, formatarAguardandoDesde, validarId } = require('../lib/helpers');
const { calcularPesoCorredor, calcularPontuacaoPedido } = require('../lib/pontuacao');

router.get('/pedidos', requerAuth, async (req,res) => {
  const {separador_id,status,data,data_ini,data_fim,numero_pedido,page,pageSize}=req.query;
  try {
    // total_itens sobrescreve p.total_itens com o valor calculado da tabela itens_pedido
    // (fallback para pedidos antigos onde total_itens pode ser NULL ou 0)
    let q=`SELECT p.*, COALESCE(NULLIF(p.total_itens,0),(SELECT COALESCE(SUM(ip.quantidade),p.itens) FROM itens_pedido ip WHERE ip.pedido_id=p.id),p.itens) AS total_itens, s.nome as separador_nome,COALESCE(p.turno_distribuicao,s.turno,'Manha') as sep_turno FROM pedidos p LEFT JOIN separadores s ON p.separador_id=s.id WHERE 1=1`;
    const p=[];
    const add=(c,v)=>{p.push(v);q+=` AND ${c}$${p.length}`;};
    if (separador_id)  add('p.separador_id=',separador_id);
    if (status)        add('p.status=',status);
    if (data) { p.push(data); q+=` AND COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) = $${p.length}`; }
    // Data efetiva de trabalho: data_distribuicao (dia que o pedido foi atribuído ao separador)
    // tem prioridade sobre data_pedido (dia de importação), assim pedidos importados em dias
    // anteriores mas distribuídos hoje aparecem corretamente no dashboard de hoje.
    if (data_ini) { p.push(data_ini); q+=` AND COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) >= $${p.length}`; }
    if (data_fim)  { p.push(data_fim);  q+=` AND COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) <= $${p.length}`; }
    if (numero_pedido) add('p.numero_pedido=',numero_pedido);
    const order=` ORDER BY CASE WHEN p.aguardando_desde IS NOT NULL AND p.aguardando_desde!='' THEN p.aguardando_desde ELSE COALESCE(p.data_pedido,'')||' '||COALESCE(p.hora_pedido,'') END ASC`;
    if (page) {
      const size = Math.min(parseInt(pageSize)||50, 200);
      const pg   = Math.max(parseInt(page)||1, 1);
      const countRow = await db.get(`SELECT COUNT(*) as total FROM pedidos p LEFT JOIN separadores s ON p.separador_id=s.id WHERE 1=1${q.split('WHERE 1=1')[1].split('ORDER')[0]}`, p);
      const total = parseInt(countRow.total)||0;
      p.push(size); q+=order+` LIMIT $${p.length}`;
      p.push((pg-1)*size); q+=` OFFSET $${p.length}`;
      const rows=await db.all(q,p);
      return res.json({ total, pagina:pg, totalPaginas:Math.ceil(total/size), dados:rows.map(r=>({...r,aguardando_desde:formatarAguardandoDesde(r.aguardando_desde)})) });
    }
    q+=order;
    const rows=await db.all(q,p);

    // Backfill: preenche aguardando_repositor_desde para pedidos em separação
    // que têm avisos pendentes mas o campo estava vazio (dados anteriores ao fix).
    const semAguardando = rows.filter(r =>
      r.status === 'separando' &&
      !r.aguardando_repositor_desde &&
      !r.skus_concluido_em  // só se ainda não terminou de escanear
    );
    for (const ped of semAguardando) {
      const primeiroAviso = await db.get(
        `SELECT hora_aviso, data_aviso FROM avisos_repositor
         WHERE pedido_id=$1 AND status IN ('pendente','verificando')
         ORDER BY id ASC LIMIT 1`, [ped.id]
      );
      if (primeiroAviso?.hora_aviso && primeiroAviso?.data_aviso) {
        // Converte data_aviso (YYYY-MM-DD) + hora_aviso (HH:MM) para ISO
        const iso = `${primeiroAviso.data_aviso}T${primeiroAviso.hora_aviso}:00`;
        await pool.query(
          `UPDATE pedidos SET aguardando_repositor_desde=$1 WHERE id=$2`,
          [iso, ped.id]
        );
        ped.aguardando_repositor_desde = iso; // atualiza o objeto para o response
      }
    }

    res.json(rows.map(r=>({...r,aguardando_desde:formatarAguardandoDesde(r.aguardando_desde)})));
  } catch(e){res.status(500).json({erro:e.message});}
});

router.post('/pedidos', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {numero_pedido,separador_id,status,itens,rua,data_pedido,hora_pedido}=req.body;
  const {data:dl,hora:hl}=dataHoraLocal();
  try {
    const r=await pool.query(`INSERT INTO pedidos (numero_pedido,separador_id,status,itens,rua,data_pedido,hora_pedido) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [numero_pedido,separador_id||null,status||'pendente',itens||0,rua||'',data_pedido||dl,hora_pedido||hl]);
    res.json({id:r.rows[0].id,mensagem:'Pedido criado!'});
  } catch(e){
    if (e.code==='23505') return res.status(409).json({erro:'Pedido ja cadastrado!'});
    res.status(500).json({erro:e.message});
  }
});

router.get('/pedidos/bloqueados', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const rows = await db.all(`
      SELECT DISTINCT p.id, p.numero_pedido, p.status, p.separador_id,
        s.nome as separador_nome,
        COUNT(DISTINCT a.id) as total_bloqueios,
        STRING_AGG(DISTINCT a.codigo, ', ') as codigos_bloqueados
      FROM pedidos p
      JOIN avisos_repositor a ON a.pedido_id=p.id
      LEFT JOIN separadores s ON p.separador_id=s.id
      WHERE a.status = 'nao_encontrado'
        AND p.status IN ('separando','concluido')
        AND NOT EXISTS (
          SELECT 1 FROM avisos_repositor a2
          WHERE a2.pedido_id=p.id AND a2.status='pendente'
        )
      GROUP BY p.id, p.numero_pedido, p.status, p.separador_id, s.nome
      ORDER BY p.id DESC`
    );
    res.json(rows);
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.get('/pedidos/info/:numero_pedido', requerAuth, async (req,res) => {
  try {
    const row=await db.get('SELECT numero_pedido,cliente,transportadora,numero_caixa FROM pedidos WHERE numero_pedido=$1',[req.params.numero_pedido]);
    if (!row) return res.status(404).json({erro:'Pedido não encontrado'});
    res.json({cliente:row.cliente||'',transportadora:row.transportadora||'',numero_caixa:row.numero_caixa||''});
  } catch(e){res.status(500).json({erro:e.message});}
});

router.put('/pedidos/:id/caixa', requerAuth, async (req,res) => {
  const id = validarId(req.params.id);
  if (!id) return res.status(400).json({erro:'ID invalido'});
  const {numero_caixa}=req.body;
  if (!numero_caixa) return res.status(400).json({erro:'Numero da caixa nao informado!'});
  const caixa=String(numero_caixa).trim();
  try {
    // Caixa está ocupada se: existe outro pedido com ela E não foi cancelado E o checkout ainda não foi concluído
    const usadaPed = await db.get(
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
  const {numero_pedido,separador_id}=req.body;
  if (!numero_pedido) return res.status(400).json({erro:'Numero do pedido nao informado!'});
  try {
    const ped=await db.get('SELECT * FROM pedidos WHERE numero_pedido=$1',[numero_pedido]);
    if (!ped) return res.status(404).json({erro:'Pedido nao encontrado!'});
    if (ped.status==='concluido') return res.status(400).json({erro:'Pedido ja concluido!',status:'concluido'});
    if (separador_id && ped.separador_id && String(ped.separador_id)===String(separador_id)) {
      const bipDHL = dataHoraLocal();
      // Garante que status vira 'separando' e iniciado_em é preenchido
      await pool.query(
        `UPDATE pedidos SET status='separando', iniciado_em=COALESCE(NULLIF(iniciado_em,''),$1) WHERE id=$2`,
        [bipDHL.data+'T'+bipDHL.hora, ped.id]
      );
      return res.json({mensagem:'Pedido ja atribuido.',pedido_id:ped.id,status:'separando',ja_atribuido:true,caixa_vinculada:!!(ped.numero_caixa)});
    }
    if (separador_id && ped.separador_id && String(ped.separador_id)!==String(separador_id) && ped.status==='separando')
      return res.status(409).json({erro:'Pedido sendo separado por outro operador!'});
    const sepId=separador_id||ped.separador_id||null;
    const bipDHL=dataHoraLocal();
    await pool.query(`UPDATE pedidos SET separador_id=$1,status='separando',iniciado_em=COALESCE(NULLIF(iniciado_em,''),$3) WHERE id=$2`,[sepId,ped.id,bipDHL.data+'T'+bipDHL.hora]);
    res.json({mensagem:'Pedido atribuido!',pedido_id:ped.id,status:'separando',caixa_vinculada:!!(ped.numero_caixa)});
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
    const pedidos = await db.all(`SELECT id,numero_pedido,total_itens,itens,caixa_lote FROM pedidos WHERE id=ANY($1)`, [ids]);
    const caixaMap = {};
    ids.forEach((id,i) => { caixaMap[id] = i+1; });
    const itens = await db.all(
      `SELECT i.*,
        COALESCE((SELECT a.status FROM avisos_repositor a WHERE a.item_id=i.id ORDER BY a.id DESC LIMIT 1),'') AS aviso_status,
        COALESCE((SELECT a.qtd_encontrada FROM avisos_repositor a WHERE a.item_id=i.id ORDER BY a.id DESC LIMIT 1),0) AS aviso_qtd_encontrada,
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
      const caixa = caixas?.find(c => c.pedido_id === id)?.caixa_lote || null;
      await pool.query(
        `UPDATE pedidos SET status='separando', iniciado_em=COALESCE(NULLIF(iniciado_em,''),$1), caixa_lote=$2 WHERE id=$3`,
        [data+'T'+hora, caixa, id]
      );
    }
    res.json({ mensagem:'Lote iniciado!', iniciados: pedido_ids.length });
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.get('/pedidos/buscar-caixa-lote', requerAuth, async (req,res) => {
  const { numero } = req.query;
  if (!numero) return res.status(400).json({erro:'numero obrigatorio'});
  try {
    const ped = await db.get(
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
      const pend = await db.all(`SELECT id FROM itens_pedido WHERE pedido_id=$1 AND status='pendente'`,[id]);
      if (pend.length) { resultados.push({id, ok:false, erro:`${pend.length} item(s) pendente(s)`}); continue; }
      const avisos = await db.all(`SELECT id FROM avisos_repositor WHERE pedido_id=$1 AND status IN ('pendente','verificando')`,[id]);
      if (avisos.length) {
        await pool.query(`UPDATE pedidos SET skus_concluido_em=COALESCE(NULLIF(skus_concluido_em,''),$1) WHERE id=$2`,[data+'T'+hora,id]);
        resultados.push({id, ok:false, aguardando:true}); continue;
      }
      await pool.query(
        `UPDATE pedidos SET status='concluido', concluido_em=$1, skus_concluido_em=COALESCE(NULLIF(skus_concluido_em,''),$1) WHERE id=$2`,
        [data+'T'+hora, id]
      );
      const ped = await db.get('SELECT numero_pedido,numero_caixa,caixa_lote,separador_id FROM pedidos WHERE id=$1',[id]);
      const sep = ped?.separador_id ? await db.get('SELECT nome FROM separadores WHERE id=$1',[ped.separador_id]) : null;
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
        COALESCE((SELECT a.qtd_encontrada FROM avisos_repositor a WHERE a.item_id=i.id ORDER BY a.id DESC LIMIT 1), 0) AS aviso_qtd_encontrada
       FROM itens_pedido i WHERE i.pedido_id=$1 ORDER BY i.id`,
      [req.params.id]
    ));
  } catch(e){res.status(500).json({erro:e.message});}
});

router.put('/itens/:id/verificar', requerAuth, async (req,res) => {
  const {status,obs,qtd_falta,separador_id,separador_nome}=req.body;
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
      const pedidoInfo = await db.get(`SELECT transportadora FROM pedidos WHERE id=$1`,[item.pedido_id]);
      const formaEnvio = pedidoInfo?.transportadora || '';
      const ja=await db.get(`SELECT id FROM avisos_repositor WHERE item_id=$1 AND status='pendente'`,[item.id]);
      if (ja) { await pool.query(`UPDATE avisos_repositor SET quantidade=$1,obs=$2,hora_aviso=$3,forma_envio=$4 WHERE id=$5`,[qtdA,obsA,hora,formaEnvio,ja.id]); }
      else { await pool.query(`INSERT INTO avisos_repositor (item_id,pedido_id,numero_pedido,separador_id,separador_nome,codigo,descricao,endereco,quantidade,obs,status,hora_aviso,data_aviso,forma_envio) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pendente',$11,$12,$13)`,
        [item.id,item.pedido_id,item.numero_pedido,separador_id,separador_nome,item.codigo,item.descricao,item.endereco,qtdA,obsA,hora,data,formaEnvio]); }
      // Define o início da espera pelo repositor (para cálculo de tempo real de separação).
      // Só marca se ainda não tiver aguardando (não sobrescreve se já havia outro item em falta).
      const pedAtual = await db.get(`SELECT aguardando_repositor_desde FROM pedidos WHERE id=$1`,[item.pedido_id]);
      if (!pedAtual?.aguardando_repositor_desde) {
        const agoraISO = new Date().toISOString();
        await pool.query(`UPDATE pedidos SET aguardando_repositor_desde=$1 WHERE id=$2`,[agoraISO, item.pedido_id]);
      }
      req.app.get('io')?.emit('aviso:novo', { pedido_id: item.pedido_id, numero_pedido: item.numero_pedido, codigo: item.codigo });
      res.json({mensagem:'Repositor avisado!',aviso:true});
    } else { res.json({mensagem:'Item verificado!',aviso:false}); }
  } catch(e){res.status(500).json({erro:e.message});}
});

router.put('/pedidos/:id/concluir', requerAuth, async (req,res) => {
  try {
    // Se o repositor já resolveu os avisos e concluiu automaticamente, retorna sucesso
    const pedCheck = await db.get('SELECT status FROM pedidos WHERE id=$1', [req.params.id]);
    if (pedCheck?.status === 'concluido') return res.json({ mensagem: 'Pedido já concluído!' });
    const pend=await db.all(`SELECT id FROM itens_pedido WHERE pedido_id=$1 AND status='pendente'`,[req.params.id]);
    if (pend.length) return res.status(400).json({erro:`Ainda ha ${pend.length} item(s) nao verificado(s)!`});
    const {data,hora}=dataHoraLocal();
    // Bloqueia se houver avisos 'pendente' (repositor ainda não iniciou busca)
    // OU 'verificando' (repositor está ativamente buscando o item agora).
    // Sem esse bloqueio, o pedido some da fila do separador enquanto o repositor busca.
    const avisos=await db.all(
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
    const ped = await db.get('SELECT numero_pedido, numero_caixa, separador_id FROM pedidos WHERE id=$1',[req.params.id]);
    const sep = ped?.separador_id ? await db.get('SELECT nome FROM separadores WHERE id=$1',[ped.separador_id]) : null;
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
    const pend = await db.all(`SELECT id FROM itens_pedido WHERE pedido_id=$1 AND status='pendente'`, [req.params.id]);
    if (pend.length) return res.status(400).json({ erro: `Ainda há ${pend.length} item(s) não verificado(s)!` });

    const { data, hora } = dataHoraLocal();

    // Busca itens que estão aguardando repositor
    const avisos = await db.all(
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
    const ped = await db.get('SELECT numero_pedido, numero_caixa, separador_id FROM pedidos WHERE id=$1', [req.params.id]);
    const sep = ped?.separador_id ? await db.get('SELECT nome FROM separadores WHERE id=$1', [ped.separador_id]) : null;
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

router.put('/pedidos/:id/redefinir', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try { await pool.query(`UPDATE pedidos SET status='pendente',separador_id=NULL WHERE id=$1`,[req.params.id]); res.json({mensagem:'Redefinido!'}); }
  catch(e){res.status(500).json({erro:e.message});}
});

router.put('/pedidos/embalagem/reenviar', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const { numero_pedido } = req.body;
  if (!numero_pedido) return res.status(400).json({erro:'numero_pedido obrigatorio'});
  try {
    const ped = await db.get('SELECT * FROM pedidos WHERE numero_pedido=$1',[numero_pedido]);
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
    const ped = await db.get('SELECT numero_pedido, numero_caixa, separador_id FROM pedidos WHERE id=$1',[req.params.id]);
    const sep = ped?.separador_id ? await db.get('SELECT nome FROM separadores WHERE id=$1',[ped.separador_id]) : null;
    const ckExist = await db.get('SELECT id FROM checkout WHERE pedido_id=$1',[req.params.id]);
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

router.delete('/pedidos/:id', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const id = validarId(req.params.id);
  if (!id) return res.status(400).json({erro:'ID invalido'});
  try {
    await pool.query('DELETE FROM avisos_repositor WHERE pedido_id=$1',[id]);
    await pool.query('DELETE FROM checkout WHERE pedido_id=$1',[id]);
    await pool.query('DELETE FROM itens_pedido WHERE pedido_id=$1',[id]);
    await pool.query('DELETE FROM pedidos WHERE id=$1',[id]);
    res.json({mensagem:'Pedido excluido!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

router.delete('/pedidos', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {data}=req.query;
  if (!data) return res.status(400).json({erro:'Data nao informada!'});
  try {
    const peds=await db.all(`SELECT id FROM pedidos WHERE data_pedido=$1`,[data]);
    for (const p of peds) {
      await pool.query('DELETE FROM avisos_repositor WHERE pedido_id=$1',[p.id]);
      await pool.query('DELETE FROM checkout WHERE pedido_id=$1',[p.id]);
      await pool.query('DELETE FROM itens_pedido WHERE pedido_id=$1',[p.id]);
    }
    const r=await pool.query(`DELETE FROM pedidos WHERE data_pedido=$1`,[data]);
    res.json({mensagem:`${r.rowCount} pedidos excluidos!`});
  } catch(e){res.status(500).json({erro:e.message});}
});

router.post('/pedidos/importar', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const dados = req.body.pedidos || req.body.linhas || [];
  if (!dados?.length) return res.status(400).json({erro:'Nenhum pedido informado!'});
  const {data:hoje,hora}=dataHoraLocal();
  let importados=0,ignorados=0,erros=0;
  const numeros=[...new Set(dados.map(d=>String(d.numero_pedido)))];
  for (const numero of numeros) {
    const itens=dados.filter(d=>String(d.numero_pedido)===numero);
    // itensReais: exclui linhas placeholder (pedidos sem itens têm codigo vazio)
    const itensReais=itens.filter(i=>String(i.codigo||'').trim());
    try {
      const ruasU=new Set(itensReais.map(i=>String(i.endereco||'').split(',')[0].trim().replace(/\d+/g,'').trim())).size;
      const pts=Math.round(itensReais.reduce((s,i)=>s+calcularPesoCorredor(i.endereco)*(parseInt(i.quantidade)||1),0)+ruasU*2);
      // totalItens: quando importado via HTML MIESS (sem SKU), usa o hint de quantidade da planilha HTML
      const totalItens = itensReais.length > 0
        ? itensReais.reduce((s,i)=>s+(parseInt(i.quantidade)||1),0)
        : (parseInt(itens[0]?.total_itens_hint)||0);
      const itensCount = itensReais.length || totalItens;
      const cliente       = itens[0]?.cliente||'';
      const transportadora= itens[0]?.transportadora||'';
      const aguardando    = itens[0]?.aguardando_desde||'';
      const r=await pool.query(
        `INSERT INTO pedidos (numero_pedido,status,itens,total_itens,rua,cliente,transportadora,aguardando_desde,pontuacao,data_pedido,hora_pedido,tem_prime,status_embalagem)
         VALUES ($1,'pendente',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'nao_iniciado')
         ON CONFLICT(numero_pedido) DO UPDATE SET
           cliente=CASE WHEN pedidos.cliente='' OR pedidos.cliente IS NULL THEN EXCLUDED.cliente ELSE pedidos.cliente END,
           transportadora=CASE WHEN pedidos.transportadora='' OR pedidos.transportadora IS NULL THEN EXCLUDED.transportadora ELSE pedidos.transportadora END,
           aguardando_desde=CASE WHEN pedidos.aguardando_desde='' OR pedidos.aguardando_desde IS NULL THEN EXCLUDED.aguardando_desde ELSE pedidos.aguardando_desde END,
           data_pedido=EXCLUDED.data_pedido,
           hora_pedido=EXCLUDED.hora_pedido
         RETURNING id, (xmax = 0) AS inserido`,
        [numero,itensCount,totalItens,itens[0]?.endereco||'',cliente,transportadora,aguardando,pts,hoje,hora,itensReais.some(i=>String(i.codigo||'').toUpperCase()==='PRIME')]);
      if (!r.rows[0]){ignorados++;continue;}
      const pid=r.rows[0].id;
      const pedidoNovo=r.rows[0].inserido;
      // Evita duplicar itens_pedido quando o mesmo pedido é reimportado (ex.: pedido pendente
      // que aparece em exportações de dias diferentes) — só insere se ainda não tem itens.
      if (itensReais.length > 0) {
        const jaTemItens = await pool.query('SELECT 1 FROM itens_pedido WHERE pedido_id=$1 LIMIT 1',[pid]);
        if (!jaTemItens.rows.length) {
          const client=await pool.connect();
          try {
            await client.query('BEGIN');
            for (const it of itensReais) await client.query(`INSERT INTO itens_pedido (pedido_id,codigo,descricao,endereco,quantidade) VALUES ($1,$2,$3,$4,$5)`,[pid,String(it.codigo||'').trim(),String(it.descricao||'').trim(),String(it.endereco||'').trim(),parseInt(it.quantidade)||1]);
            await client.query('COMMIT');
          } catch(ei){
            await client.query('ROLLBACK');
            if (pedidoNovo) await pool.query('DELETE FROM pedidos WHERE id=$1',[pid]);
            erros++;continue;
          } finally{client.release();}
        }
      }
      importados++;
    } catch(err){erros++;}
  }
  res.json({mensagem:'Importacao concluida!',importados,ignorados,erros,total:numeros.length});
});

router.post('/pedidos/distribuicao', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {separadores,quantidade,apenas_sem_sep,respeitar_hora,apenas_prime,cenario,turno_filtro}=req.body;
  const modoDist = cenario || 'balanceado'; // 'balanceado' | 'por_itens' | 'complexidade'
  if (!separadores?.length) return res.status(400).json({erro:'Informe os separadores!'});
  try {
    let w="p.status='pendente'";
    if (apenas_sem_sep!==false) w+=' AND p.separador_id IS NULL';
    // Filtro Prime: isolação obrigatória — Prime nunca mistura com pedidos normais
    if (apenas_prime===true) {
      w+=' AND p.tem_prime=true';
    } else {
      w+=' AND (p.tem_prime=false OR p.tem_prime IS NULL)';
    }
    // Filtro de turno: quando pedidos já foram divididos por turno (via distribuicao-turnos),
    // distribui apenas os pedidos marcados para o turno selecionado no filtro do modal.
    // Normaliza variantes: botão passa 'Manha' mas DB pode ter 'Manhã' (com til, digitado pelo usuário).
    if (turno_filtro) {
      const _tf = String(turno_filtro);
      const variantes = [_tf];
      if (_tf === 'Manha') variantes.push('Manhã');
      if (_tf === 'Manhã') variantes.push('Manha');
      const placeholders = variantes.map(v => `'${v.replace(/'/g,"''")}'`).join(',');
      w += ` AND p.turno_distribuicao IN (${placeholders})`;
    }
    // Ordena pelo momento real do pedido (aguardando_desde) usando TO_TIMESTAMP para
    // garantir ordenação correta mesmo entre datas diferentes (formato DD/MM/YYYY HH:MM).
    // Fallback para data_pedido + hora_pedido quando aguardando_desde está vazio.
    const pedidos=await db.all(
      `SELECT p.* FROM pedidos p WHERE ${w}
       ORDER BY
         -- 1º critério: aguardando_desde no formato DD/MM/YYYY HH:MM
         CASE WHEN p.aguardando_desde ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}'
              THEN TO_TIMESTAMP(p.aguardando_desde, 'DD/MM/YYYY HH24:MI')
              ELSE NULL
         END ASC NULLS LAST,
         -- 2º critério: data_pedido (YYYY-MM-DD) + hora_pedido
         CASE WHEN p.data_pedido IS NOT NULL AND p.data_pedido != ''
              THEN (p.data_pedido||' '||COALESCE(p.hora_pedido,'00:00'))::TIMESTAMP
              ELSE NULL
         END ASC NULLS LAST,
         -- 3º critério: ID crescente (mais antigo primeiro)
         p.id ASC`
    );
    if (!pedidos.length) return res.json({plano:[],total_pedidos:0,total_distribuidos:0});
    for (const ped of pedidos) {
      const itens=await db.all('SELECT endereco,quantidade,codigo FROM itens_pedido WHERE pedido_id=$1',[ped.id]);
      const scoreBase = calcularPontuacaoPedido(itens);
      // Métricas extras para cenário 'complexidade'
      const ruasSet=new Set(), skusSet=new Set();
      for (const i of itens) {
        const e=String(i.endereco||'').split('/')[0].trim().toUpperCase();
        const m=e.match(/^([A-Z]+)/); if (m) ruasSet.add(m[1]);
        if (i.codigo) skusSet.add(i.codigo);
      }
      const bonusRuas = Math.max(0, ruasSet.size - 2) * 15;
      const bonusSkus = Math.max(0, skusSet.size - 1) * 3;
      ped._ruas = ruasSet.size;
      ped._skus = skusSet.size;
      ped._p = (modoDist === 'complexidade') ? (scoreBase + bonusRuas + bonusSkus) : scoreBase;
      await pool.query('UPDATE pedidos SET pontuacao=$1 WHERE id=$2',[scoreBase,ped.id]);
    }
    const lim=(quantidade>0)?quantidade:pedidos.length;
    const isDrive=p=>String(p.transportadora||'').toUpperCase().includes('DRIVE');
    // DRIVE THRU tem prioridade; os demais mantêm a ordem da query (aguardando_desde ASC = mais antigo primeiro)
    const drive=pedidos.filter(isDrive).slice(0,lim);
    const outros=pedidos.filter(p=>!isDrive(p)).slice(0,Math.max(0,lim-drive.length));
    // MANTÉM ordem cronológica: Drive primeiro, depois demais por data de chegada (Maio antes de Junho).
    // O balanceamento por pontuação ocorre na escolha do separador (filas.sort abaixo), não aqui.
    const ordenados = [...drive, ...outros];
    const sepMap={};
    for (const sid of separadores) {
      // Busca separadores.id vinculado ao usuario; guarda também o usuarios.id para fallback de nome
      const sepRow = await db.get('SELECT s.id,s.nome FROM separadores s WHERE s.usuario_id=$1 LIMIT 1',[sid]);
      const userRow = await db.get('SELECT id,nome,login,turno FROM usuarios WHERE id=$1',[sid]);
      sepMap[sid] = {
        sepDbId: sepRow?.id || null,          // separadores.id correto (null se não vinculado)
        nome: sepRow?.nome || userRow?.nome || `Sep ${sid}`,
        login: userRow?.login || null,
        turno: userRow?.turno || 'Manha',
        userRow,
      };
    }
    // Carrega carga atual de cada colaborador (pedidos já atribuídos ainda pendentes/em separação)
    // para que redistribuições no mesmo dia não ignorem o que já foi distribuído antes.
    const filas=[];
    for (const sid of separadores) {
      const dbId = sepMap[sid]?.sepDbId || null;
      let cargaAtual = { pontuacao: 0, itens: 0 };
      if (dbId) {
        const ja = await db.get(
          `SELECT COALESCE(SUM(COALESCE(p.pontuacao,0)),0) AS pts,
                  COALESCE(SUM(COALESCE(p.itens,0)),0) AS itens
           FROM pedidos p
           WHERE p.separador_id = $1
             AND p.status IN ('pendente','separando')`, [dbId]);
        if (ja) { cargaAtual.pontuacao = parseFloat(ja.pts)||0; cargaAtual.itens = parseInt(ja.itens)||0; }
      }
      filas.push({
        separador_id: sid,
        separador_nome: sepMap[sid]?.nome || `Sep ${sid}`,
        pedidos: [],
        pontuacao_total: cargaAtual.pontuacao,   // começa com o que já tem
        itens_total:     cargaAtual.itens,
        pontuacao_ja:    cargaAtual.pontuacao,    // guarda para mostrar no resultado
        itens_ja:        cargaAtual.itens,
        sep_db_id: dbId,
      });
    }
    // Pré-calcula os totais a distribuir para normalização estável
    const totalPtsLote  = ordenados.reduce((s,p)=>s+p._p,0) || 1;
    const totalItensLote= ordenados.reduce((s,p)=>s+(p.itens||0),0) || 1;
    const n = filas.length || 1;
    // Carga alvo por separador (carga já existente + lote atual dividido igualmente)
    const alvoPts  = (filas.reduce((s,f)=>s+f.pontuacao_ja,0) + totalPtsLote)  / n;
    const alvoItens= (filas.reduce((s,f)=>s+f.itens_ja,0)    + totalItensLote) / n;

    if (modoDist === 'por_itens') {
      // LPT por volume: quem tem menos itens recebe o próximo pedido
      for (const ped of ordenados) {
        filas.sort((a,b) => a.itens_total - b.itens_total);
        filas[0].pedidos.push(ped.numero_pedido);
        filas[0].pontuacao_total += ped._p;
        filas[0].itens_total += (ped.itens || 0);
      }
    } else {
      // 'balanceado' e 'complexidade': LPT com score normalizado (pontuação + itens)
      for (const ped of ordenados) {
        filas.sort((a,b) => {
          const sA = (a.pontuacao_total / alvoPts) + (a.itens_total / alvoItens);
          const sB = (b.pontuacao_total / alvoPts) + (b.itens_total / alvoItens);
          return sA - sB;
        });
        filas[0].pedidos.push(ped.numero_pedido);
        filas[0].pontuacao_total += ped._p;
        filas[0].itens_total += (ped.itens || 0);
      }
    }
    res.json({cenario:modoDist,plano:filas.map(f=>({separador_id:f.separador_id,sep_db_id:f.sep_db_id,separador_nome:f.separador_nome,pedidos:f.pedidos,pontuacao_total:Math.round(f.pontuacao_total),itens_total:f.itens_total,pontuacao_ja:Math.round(f.pontuacao_ja||0),itens_ja:f.itens_ja||0})),total_pedidos:pedidos.length,total_distribuidos:ordenados.length});
  } catch(err){res.status(500).json({erro:err.message});}
});

// Distribuição entre turnos: divide pedidos pendentes entre os 3 turnos de forma equilibrada,
// proporcional ao número de separadores de cada turno.
router.post('/pedidos/distribuicao-turnos', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {turnos, cenario, apenas_sem_sep, quantidade} = req.body;
  // turnos = [{nome:'Manhã', separadores:5}, {nome:'Tarde', separadores:4}, {nome:'Noite', separadores:3}]
  if (!turnos?.length || turnos.some(t => !(t.separadores > 0))) {
    return res.status(400).json({erro:'Informe os turnos com pelo menos 1 separador cada!'});
  }
  const modoDist = cenario || 'balanceado';
  try {
    let w = "p.status='pendente'";
    if (apenas_sem_sep !== false) w += ' AND p.separador_id IS NULL';
    w += ' AND (p.tem_prime=false OR p.tem_prime IS NULL)';
    const pedidos = await db.all(
      `SELECT p.* FROM pedidos p WHERE ${w}
       ORDER BY
         CASE WHEN p.aguardando_desde ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}'
              THEN TO_TIMESTAMP(p.aguardando_desde, 'DD/MM/YYYY HH24:MI')
              ELSE NULL END ASC NULLS LAST,
         CASE WHEN p.data_pedido IS NOT NULL AND p.data_pedido != ''
              THEN (p.data_pedido||' '||COALESCE(p.hora_pedido,'00:00'))::TIMESTAMP
              ELSE NULL END ASC NULLS LAST,
         p.id ASC`
    );
    if (!pedidos.length) return res.json({plano:[], total_pedidos:0, total_distribuidos:0});

    for (const ped of pedidos) {
      const itens = await db.all('SELECT endereco,quantidade,codigo FROM itens_pedido WHERE pedido_id=$1', [ped.id]);
      const scoreBase = calcularPontuacaoPedido(itens);
      const ruasSet = new Set(), skusSet = new Set();
      for (const i of itens) {
        const e = String(i.endereco||'').split('/')[0].trim().toUpperCase();
        const m = e.match(/^([A-Z]+)/); if (m) ruasSet.add(m[1]);
        if (i.codigo) skusSet.add(i.codigo);
      }
      const bonusRuas = Math.max(0, ruasSet.size - 2) * 15;
      const bonusSkus = Math.max(0, skusSet.size - 1) * 3;
      ped._ruas = ruasSet.size;
      ped._skus = skusSet.size;
      ped._p = (modoDist === 'complexidade') ? (scoreBase + bonusRuas + bonusSkus) : scoreBase;
    }

    const lim = (quantidade > 0) ? quantidade : pedidos.length;
    const isDrive = p => String(p.transportadora||'').toUpperCase().includes('DRIVE');
    const drive  = pedidos.filter(isDrive).slice(0, lim);
    const outros = pedidos.filter(p => !isDrive(p)).slice(0, Math.max(0, lim - drive.length));
    const ordenados = [...drive, ...outros];

    // LPT proporcional: balanceia (score / sep_count) entre turnos
    // Assim, turno com mais separadores recebe mais pedidos proporcionalmente.
    const buckets = turnos.map(t => ({
      nome: t.nome,
      separadores: t.separadores,
      pedidos: [],
      pontuacao_total: 0,
      itens_total: 0,
      ruas_total: 0,
      skus_total: 0,
    }));

    for (const ped of ordenados) {
      // Métrica de carga por separador em cada turno
      buckets.sort((a, b) => {
        const rA = a.pontuacao_total / a.separadores;
        const rB = b.pontuacao_total / b.separadores;
        if (modoDist === 'por_itens') return (a.itens_total / a.separadores) - (b.itens_total / b.separadores);
        return rA - rB;
      });
      buckets[0].pedidos.push(ped.numero_pedido);
      buckets[0].pontuacao_total += ped._p;
      buckets[0].itens_total += (ped.itens || 0);
      buckets[0].ruas_total += (ped._ruas || 0);
      buckets[0].skus_total += (ped._skus || 0);
    }

    const totalDist = buckets.reduce((s, b) => s + b.pedidos.length, 0);
    res.json({
      cenario: modoDist,
      plano: buckets.map(b => ({
        nome: b.nome,
        separadores: b.separadores,
        pedidos: b.pedidos,
        pedidos_count: b.pedidos.length,
        pontuacao_total: Math.round(b.pontuacao_total),
        itens_total: b.itens_total,
        ruas_media: b.pedidos.length ? Math.round((b.ruas_total / b.pedidos.length) * 10) / 10 : 0,
        skus_media: b.pedidos.length ? Math.round((b.skus_total / b.pedidos.length) * 10) / 10 : 0,
      })),
      total_pedidos: pedidos.length,
      total_distribuidos: totalDist,
    });
  } catch(err) { res.status(500).json({erro: err.message}); }
});

// Confirma a distribuição por turno: marca turno_distribuicao em cada pedido sem atribuir separador.
// Após isso, o supervisor usa a aba Automática filtrando por turno para distribuir dentro do turno.
router.post('/pedidos/distribuicao-turnos/confirmar', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {plano} = req.body; // plano = [{nome:'Manhã', pedidos:['123','456',...]}, ...]
  if (!plano?.length) return res.status(400).json({erro:'Plano não informado!'});
  const {data: dataDistrib} = dataHoraLocal();
  let marcados = 0;
  try {
    for (const turno of plano) {
      const turnoNome = turno.nome || '';
      for (const np of (turno.pedidos || [])) {
        const r = await pool.query(
          `UPDATE pedidos SET turno_distribuicao=$1, data_distribuicao=$2 WHERE numero_pedido=$3 AND status='pendente'`,
          [turnoNome, dataDistrib, String(np)]
        );
        if (r.rowCount > 0) marcados++;
      }
    }
    res.json({marcados, mensagem:`${marcados} pedido(s) marcados por turno.`});
  } catch(e) { res.status(500).json({erro: e.message}); }
});

router.post('/pedidos/distribuicao/confirmar', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {plano, turno_lote}=req.body;
  if (!plano?.length) return res.status(400).json({erro:'Plano não informado!'});
  // turno_lote = botão ativo na tela de distribuição ('Manha','Tarde','Noite') ou null/'' = Todos
  const turnoLote = turno_lote || null;
  let dist=0;
  try {
    for (const item of plano) {
      // 1. Busca separadores.id pelo usuario_id (caso mais comum)
      let dbId = null;
      const porUsuario = await db.get('SELECT id FROM separadores WHERE usuario_id=$1 LIMIT 1',[item.separador_id]);
      if (porUsuario) {
        dbId = porUsuario.id;
      } else {
        // 2. Tenta sep_db_id como separadores.id direto (separadores antigos sem usuario_id)
        if (item.sep_db_id) {
          const direto = await db.get('SELECT id FROM separadores WHERE id=$1 LIMIT 1',[item.sep_db_id]);
          if (direto) dbId = direto.id;
        }
        // 3. Colaborador não tem registro em separadores (checkout/embalagem/repositor):
        //    cria automaticamente para poder receber pedidos
        if (!dbId) {
          const user = await db.get('SELECT nome, login, turno FROM usuarios WHERE id=$1',[item.separador_id]);
          if (user) {
            // Tenta encontrar por nome OU matrícula antes de criar
            const porNome = await db.get(
              `SELECT id FROM separadores
               WHERE LOWER(TRIM(nome))=LOWER(TRIM($1))
                  OR LOWER(TRIM(matricula))=LOWER(TRIM($2))
               LIMIT 1`,
              [user.nome, user.login]
            );
            if (porNome) {
              dbId = porNome.id;
              // Vincula usuario_id ao registro encontrado
              pool.query('UPDATE separadores SET usuario_id=$1 WHERE id=$2 AND (usuario_id IS NULL OR usuario_id=0)',
                [item.separador_id, dbId]).catch(()=>{});
            } else {
              // Cria novo registro (INSERT simples, sem ON CONFLICT)
              try {
                const ins = await pool.query(
                  `INSERT INTO separadores (nome, matricula, usuario_id, status, turno)
                   VALUES ($1,$2,$3,'ativo',$4) RETURNING id`,
                  [user.nome, user.login, item.separador_id, user.turno||'Manha']
                );
                dbId = ins.rows[0]?.id;
              } catch(e) {
                // INSERT falhou (ex: constraint UNIQUE em matricula) — busca por usuario_id ou matricula
                const recheck =
                  await db.get('SELECT id FROM separadores WHERE usuario_id=$1 LIMIT 1',[item.separador_id]) ||
                  await db.get('SELECT id FROM separadores WHERE LOWER(TRIM(matricula))=LOWER(TRIM($1)) LIMIT 1',[user.login]);
                if (recheck) {
                  dbId = recheck.id;
                  pool.query('UPDATE separadores SET usuario_id=$1 WHERE id=$2 AND (usuario_id IS NULL OR usuario_id=0)',
                    [item.separador_id, recheck.id]).catch(()=>{});
                }
              }
            }
          }
        }
      }
      if (dbId) {
        for (const np of item.pedidos) {
          let r;
          const {data: dataDistrib} = dataHoraLocal();
          if (turnoLote) {
            r = await pool.query(
              `UPDATE pedidos SET separador_id=$1, turno_distribuicao=$2, data_distribuicao=$3 WHERE numero_pedido=$4 AND status='pendente'`,
              [dbId, turnoLote, dataDistrib, np]
            );
          } else {
            r = await pool.query(
              `UPDATE pedidos SET separador_id=$1, data_distribuicao=$2 WHERE numero_pedido=$3 AND status='pendente'`,
              [dbId, dataDistrib, np]
            );
          }
          if(r.rowCount>0) dist++;
        }
      }
    }
    res.json({mensagem:'Distribuição confirmada!',distribuidos:dist});
  } catch(err){res.status(500).json({erro:err.message});}
});

router.post('/pedidos/recalcular-pontuacao', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const peds=await db.all("SELECT id FROM pedidos WHERE pontuacao=0 OR pontuacao IS NULL");
    let at=0;
    for (const p of peds){const itens=await db.all('SELECT endereco,quantidade FROM itens_pedido WHERE pedido_id=$1',[p.id]);const pts=calcularPontuacaoPedido(itens);if(pts>0){await pool.query('UPDATE pedidos SET pontuacao=$1 WHERE id=$2',[pts,p.id]);at++;}}
    res.json({mensagem:`${at} pedidos recalculados`,atualizados:at});
  } catch(err){res.status(500).json({erro:err.message});}
});

// Alias retrocompatível — frontend antigo usava /importar
router.post('/importar', requerAuth, requerPerfil('supervisor'), (req,res) => {
  res.redirect(307, '/pedidos/importar');
});

/* ══════════════════════════════════════════
   RELATÓRIO: TEMPO REAL DE SEPARAÇÃO
   Desconsidera o tempo aguardando repositor.
══════════════════════════════════════════ */
router.get('/pedidos/relatorio/tempo-separacao', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {data_ini, data_fim, separador_id} = req.query;
  try {
    let w = `p.status='concluido' AND p.iniciado_em IS NOT NULL AND p.iniciado_em!=''`;
    const params = [];
    if (data_ini) { params.push(data_ini); w += ` AND p.data_pedido>=$${params.length}`; }
    if (data_fim)  { params.push(data_fim);  w += ` AND p.data_pedido<=$${params.length}`; }
    if (separador_id) { params.push(parseInt(separador_id)); w += ` AND s.usuario_id=$${params.length}`; }

    const rows = await db.all(`
      SELECT
        p.numero_pedido,
        COALESCE(u.nome, s.nome, '—') AS separador_nome,
        p.data_pedido,
        p.iniciado_em,
        p.skus_concluido_em,
        COALESCE(NULLIF(p.concluido_em,''),
          CASE WHEN ck.data_checkout IS NOT NULL AND ck.hora_criacao IS NOT NULL
               THEN ck.data_checkout||'T'||ck.hora_criacao ELSE NULL END
        ) AS concluido_em,
        p.itens AS total_itens,
        p.cliente,
        p.transportadora,
        -- Tempo real do separador: usa skus_concluido_em (quando terminou de escanear)
        -- Pedidos sem falta: skus_concluido_em = concluido_em (mesmo momento)
        -- Pedidos com falta: skus_concluido_em = momento que tentou concluir pela 1ª vez
        CASE WHEN NULLIF(p.iniciado_em,'') IS NOT NULL
                  AND NULLIF(COALESCE(NULLIF(p.skus_concluido_em,''), NULLIF(p.concluido_em,'')), '') IS NOT NULL
          THEN ROUND(EXTRACT(EPOCH FROM (
            COALESCE(NULLIF(p.skus_concluido_em,''), NULLIF(p.concluido_em,''))::timestamp
            - p.iniciado_em::timestamp
          ))/60.0, 1)
          ELSE NULL
        END AS tempo_real_min,
        -- Tempo total bruto (iniciado → concluido, inclui espera repositor)
        CASE WHEN NULLIF(p.iniciado_em,'') IS NOT NULL
                  AND COALESCE(NULLIF(p.concluido_em,''),
                        CASE WHEN ck.data_checkout IS NOT NULL AND ck.hora_criacao IS NOT NULL
                             THEN ck.data_checkout||'T'||ck.hora_criacao ELSE NULL END) IS NOT NULL
          THEN ROUND(EXTRACT(EPOCH FROM (
            COALESCE(NULLIF(p.concluido_em,''), ck.data_checkout||'T'||ck.hora_criacao)::timestamp
            - p.iniciado_em::timestamp
          ))/60.0, 1)
          ELSE NULL
        END AS tempo_total_min,
        -- Contagem de reposições e não encontrados
        (SELECT COUNT(*) FROM avisos_repositor a WHERE a.pedido_id=p.id) AS qtd_reposicoes,
        (SELECT COUNT(*) FROM avisos_repositor a WHERE a.pedido_id=p.id AND a.status='nao_encontrado') AS qtd_nao_encontrados,
        -- Itens ainda em falta (separador marcou falta mas repositor ainda nao resolveu)
        (SELECT COUNT(*)::int FROM itens_pedido ip WHERE ip.pedido_id=p.id AND ip.status IN ('falta','parcial')) AS itens_em_falta
      FROM pedidos p
      LEFT JOIN separadores s ON s.id=p.separador_id
      LEFT JOIN usuarios u ON u.id=s.usuario_id
      LEFT JOIN LATERAL (SELECT * FROM checkout WHERE pedido_id=p.id ORDER BY id DESC LIMIT 1) ck ON true
      WHERE ${w}
      ORDER BY p.data_pedido DESC, p.iniciado_em DESC
      LIMIT 1000
    `, params);

    // tempo_espera_min = tempo_total - tempo_real (quanto ficou esperando repositor)
    const result = rows.map(r => {
      const real  = r.tempo_real_min  !== null ? parseFloat(r.tempo_real_min)  : null;
      const total = r.tempo_total_min !== null ? parseFloat(r.tempo_total_min) : null;
      const espera = (total !== null && real !== null) ? Math.max(0, total - real) : 0;
      return { ...r, tempo_espera_min: Math.round(espera * 10) / 10 };
    });

    res.json(result);
  } catch(e) { res.status(500).json({erro: e.message}); }
});

module.exports = router;
