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
    if (data)          add('p.data_pedido=',data);
    if (data_ini)      add('p.data_pedido>=',data_ini);
    if (data_fim)      add('p.data_pedido<=',data_fim);
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
    const usadaPed = await db.get(
      `SELECT numero_pedido FROM pedidos WHERE numero_caixa=$1 AND id<>$2 AND status NOT IN ('concluido','cancelado')`,
      [caixa, req.params.id]
    );
    if (usadaPed) return res.status(409).json({erro:`Caixa ${caixa} ja esta em uso no pedido ${usadaPed.numero_pedido}!`});
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

router.get('/pedidos/:id/itens', requerAuth, async (req,res) => {
  try {
    res.json(await db.all(
      `SELECT i.*,COALESCE((SELECT a.status FROM avisos_repositor a WHERE a.item_id=i.id ORDER BY a.id DESC LIMIT 1),'') as aviso_status FROM itens_pedido i WHERE i.pedido_id=$1 ORDER BY i.id`,
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
    if (status==='falta'||status==='parcial') {
      const qtdA=status==='falta'?item.quantidade:(qtd_falta||0);
      const obsA=status==='parcial'?(obs||''):`Falta total - ${item.quantidade} unidade(s)`;
      const pedidoInfo = await db.get(`SELECT transportadora FROM pedidos WHERE id=$1`,[item.pedido_id]);
      const formaEnvio = pedidoInfo?.transportadora || '';
      const ja=await db.get(`SELECT id FROM avisos_repositor WHERE item_id=$1 AND status='pendente'`,[item.id]);
      if (ja) { await pool.query(`UPDATE avisos_repositor SET quantidade=$1,obs=$2,hora_aviso=$3,forma_envio=$4 WHERE id=$5`,[qtdA,obsA,hora,formaEnvio,ja.id]); }
      else { await pool.query(`INSERT INTO avisos_repositor (item_id,pedido_id,numero_pedido,separador_id,separador_nome,codigo,descricao,endereco,quantidade,obs,status,hora_aviso,data_aviso,forma_envio) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pendente',$11,$12,$13)`,
        [item.id,item.pedido_id,item.numero_pedido,separador_id,separador_nome,item.codigo,item.descricao,item.endereco,qtdA,obsA,hora,data,formaEnvio]); }
      req.app.get('io')?.emit('aviso:novo', { pedido_id: item.pedido_id, numero_pedido: item.numero_pedido, codigo: item.codigo });
      res.json({mensagem:'Repositor avisado!',aviso:true});
    } else { res.json({mensagem:'Item verificado!',aviso:false}); }
  } catch(e){res.status(500).json({erro:e.message});}
});

router.put('/pedidos/:id/concluir', requerAuth, async (req,res) => {
  try {
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
    const ckExist = await db.get('SELECT id, status FROM checkout WHERE pedido_id=$1',[req.params.id]);
    if (ckExist) {
      // Só rebobina para 'fila' se ainda não foi processado pelo operador
      if (ckExist.status !== 'concluido') {
        await pool.query(`UPDATE checkout SET status='fila',hora_criacao=$1,data_checkout=$2 WHERE pedido_id=$3`,[hora,data,req.params.id]);
      }
    } else {
      await pool.query(
        `INSERT INTO checkout (numero_caixa,pedido_id,numero_pedido,separador_nome,status,hora_criacao,data_checkout) VALUES ($1,$2,$3,$4,'fila',$5,$6)`,
        [ped?.numero_caixa||'',req.params.id,ped?.numero_pedido||'',sep?.nome||'',hora,data]
      );
    }
    req.app.get('io')?.emit('pedido:concluido', { pedido_id: req.params.id });
    res.json({mensagem:'Pedido concluido!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

router.put('/pedidos/:id/redefinir', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try { await pool.query(`UPDATE pedidos SET status='pendente',separador_id=NULL WHERE id=$1`,[req.params.id]); res.json({mensagem:'Redefinido!'}); }
  catch(e){res.status(500).json({erro:e.message});}
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
      const totalItens=itensReais.reduce((s,i)=>s+(parseInt(i.quantidade)||1),0);
      const r=await pool.query(`INSERT INTO pedidos (numero_pedido,status,itens,total_itens,rua,cliente,transportadora,aguardando_desde,pontuacao,data_pedido,hora_pedido,tem_prime,status_embalagem) VALUES ($1,'pendente',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'nao_iniciado') ON CONFLICT(numero_pedido) DO NOTHING RETURNING id`,
        [numero,itensReais.length,totalItens,itens[0]?.endereco||'',itens[0]?.cliente||'',itens[0]?.transportadora||'',itens[0]?.aguardando_desde||'',pts,hoje,hora,itensReais.some(i=>String(i.codigo||'').toUpperCase()==='PRIME')]);
      if (!r.rows[0]){ignorados++;continue;}
      const pid=r.rows[0].id;
      if (itensReais.length > 0) {
        const client=await pool.connect();
        try {
          await client.query('BEGIN');
          for (const it of itensReais) await client.query(`INSERT INTO itens_pedido (pedido_id,codigo,descricao,endereco,quantidade) VALUES ($1,$2,$3,$4,$5)`,[pid,String(it.codigo||'').trim(),String(it.descricao||'').trim(),String(it.endereco||'').trim(),parseInt(it.quantidade)||1]);
          await client.query('COMMIT');
        } catch(ei){await client.query('ROLLBACK');await pool.query('DELETE FROM pedidos WHERE id=$1',[pid]);erros++;continue;}
        finally{client.release();}
      }
      importados++;
    } catch(err){erros++;}
  }
  res.json({mensagem:'Importacao concluida!',importados,ignorados,erros,total:numeros.length});
});

router.post('/pedidos/distribuicao', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {separadores,quantidade,apenas_sem_sep,respeitar_hora,apenas_prime}=req.body;
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
    // Ordena pelo momento real do pedido (aguardando_desde) usando TO_TIMESTAMP para
    // garantir ordenação correta mesmo entre datas diferentes (formato DD/MM/YYYY HH:MM).
    // Fallback para data_pedido + hora_pedido quando aguardando_desde está vazio.
    const pedidos=await db.all(
      `SELECT p.* FROM pedidos p WHERE ${w}
       ORDER BY CASE
         WHEN p.aguardando_desde IS NOT NULL AND p.aguardando_desde!=''
           THEN TO_TIMESTAMP(p.aguardando_desde, 'DD/MM/YYYY HH24:MI')
         ELSE (COALESCE(p.data_pedido,'1970-01-01')||' '||COALESCE(p.hora_pedido,'00:00'))::TIMESTAMP
       END ASC, p.id ASC`
    );
    if (!pedidos.length) return res.json({plano:[],total_pedidos:0,total_distribuidos:0});
    for (const ped of pedidos) {
      const itens=await db.all('SELECT endereco,quantidade FROM itens_pedido WHERE pedido_id=$1',[ped.id]);
      // Sempre recalcula com a fórmula atual (ignora valor em cache para garantir consistência)
      ped._p = calcularPontuacaoPedido(itens);
      await pool.query('UPDATE pedidos SET pontuacao=$1 WHERE id=$2',[ped._p,ped.id]);
    }
    const lim=(quantidade>0)?quantidade:pedidos.length;
    const isDrive=p=>String(p.transportadora||'').toUpperCase().includes('DRIVE');
    // DRIVE THRU tem prioridade; os demais mantêm a ordem da query (aguardando_desde ASC)
    const drive=pedidos.filter(isDrive).slice(0,lim);
    const outros=pedidos.filter(p=>!isDrive(p)).slice(0,Math.max(0,lim-drive.length));
    // Distribui começando pelos pedidos de maior pontuação para equilibrar as filas
    const ordenados = [...drive, ...outros].sort((a,b)=>b._p-a._p);
    const sepMap={};
    for (const sid of separadores) {
      let row=await db.get('SELECT s.id,s.nome FROM separadores s WHERE s.usuario_id=$1 LIMIT 1',[sid]);
      if (!row) row=await db.get('SELECT id,nome FROM usuarios WHERE id=$1',[sid]);
      if (row) sepMap[sid]=row;
    }
    // Carrega carga atual de cada colaborador (pedidos já atribuídos ainda pendentes/em separação)
    // para que redistribuições no mesmo dia não ignorem o que já foi distribuído antes.
    const filas=[];
    for (const sid of separadores) {
      const dbId = sepMap[sid]?.id || null;
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
    for (const ped of ordenados) {
      // Balanceia pela carga total real (já atribuído + sendo distribuído agora).
      // Assim redistribuições no mesmo dia nivelam a carga corretamente.
      filas.sort((a,b) => a.pontuacao_total - b.pontuacao_total);
      filas[0].pedidos.push(ped.numero_pedido);
      filas[0].pontuacao_total += ped._p;
      filas[0].itens_total += (ped.itens || 0);
    }
    res.json({plano:filas.map(f=>({separador_id:f.separador_id,sep_db_id:f.sep_db_id,separador_nome:f.separador_nome,pedidos:f.pedidos,pontuacao_total:Math.round(f.pontuacao_total),itens_total:f.itens_total,pontuacao_ja:Math.round(f.pontuacao_ja||0),itens_ja:f.itens_ja||0})),total_pedidos:pedidos.length,total_distribuidos:ordenados.length});
  } catch(err){res.status(500).json({erro:err.message});}
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
          const user = await db.get('SELECT nome, turno FROM usuarios WHERE id=$1',[item.separador_id]);
          if (user) {
            try {
              const ins = await pool.query(
                `INSERT INTO separadores (nome, usuario_id, status, turno)
                 VALUES ($1,$2,'ativo',$3)
                 ON CONFLICT (usuario_id) DO UPDATE SET nome=EXCLUDED.nome
                 RETURNING id`,
                [user.nome, item.separador_id, user.turno||'Manha']
              );
              dbId = ins.rows[0]?.id;
            } catch(e) {
              // Se não tiver unique em usuario_id, só busca pelo nome
              const found = await db.get('SELECT id FROM separadores WHERE nome=$1 LIMIT 1',[user.nome]);
              dbId = found?.id;
            }
          }
        }
      }
      if (dbId) {
        for (const np of item.pedidos) {
          let r;
          if (turnoLote) {
            // Grava o turno do lote junto com o separador
            r = await pool.query(
              `UPDATE pedidos SET separador_id=$1, turno_distribuicao=$2 WHERE numero_pedido=$3 AND status='pendente'`,
              [dbId, turnoLote, np]
            );
          } else {
            r = await pool.query(
              `UPDATE pedidos SET separador_id=$1 WHERE numero_pedido=$2 AND status='pendente'`,
              [dbId, np]
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
        (SELECT COUNT(*) FROM avisos_repositor a WHERE a.pedido_id=p.id AND a.status='nao_encontrado') AS qtd_nao_encontrados
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
