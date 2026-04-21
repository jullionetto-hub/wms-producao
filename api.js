const express = require('express');
const router = express.Router();
const { pool, db } = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');
const { dataHoraLocal, formatarAguardandoDesde } = require('../lib/helpers');
const { calcularPesoCorredor, calcularPontuacaoPedido } = require('../lib/pontuacao');
const crypto = require('crypto');
const { hashSenha, perfisPermitidos } = require('../lib/helpers');

// ── AUTH ─────────────────────────────────────────────────────────────────────
───────────────────────────────────────────────────────────────────
app.post('/auth/login', async (req,res) => {
  // Rate limiting por IP
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ erro: 'Muitas tentativas. Aguarde 15 minutos.' });
  }

  const login  = sanitizeStr(req.body.login, 100);
  const senha  = sanitizeStr(req.body.senha, 200);
  const perfil = sanitizeStr(req.body.perfil, 50);

  if (!login || !senha || !perfil) return res.status(400).json({erro:'Dados incompletos!'});
  if (!['supervisor','separador','repositor','checkout'].includes(perfil))
    return res.status(400).json({erro:'Perfil inválido!'});

  try {
    // Seleciona apenas campos necessários — nunca retorna senha_hash ao frontend
    const user = await db.get(
      `SELECT id,nome,login,perfil,subtipo_repositor,perfis_acesso,turno,senha_hash
       FROM usuarios WHERE login=$1 AND status='ativo'`,
      [login]
    );

    // Compara hash de forma segura (tempo constante para evitar timing attacks)
    const hashFornecido = hashSenha(senha);
    const hashCorreto   = user?.senha_hash || '0'.repeat(64);
    // Compara em tempo constante para evitar timing attacks
    let senhaCorreta = false;
    try {
      const a = Buffer.from(hashFornecido.padEnd(64,'0').slice(0,64));
      const b = Buffer.from(hashCorreto.padEnd(64,'0').slice(0,64));
      senhaCorreta = a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch(e) { senhaCorreta = false; }

    if (!user || !senhaCorreta) return res.status(401).json({erro:'Login ou senha incorretos!'});
    if (!perfisPermitidos(user).includes(perfil))
      return res.status(403).json({erro:'Este colaborador não pode acessar este perfil!'});

    // Salva na sessão SEM senha_hash
    req.session.usuario = {
      id: user.id, nome: user.nome, login: user.login, perfil,
      subtipo_repositor: user.subtipo_repositor || 'geral',
      turno: user.turno,
      perfis_acesso: user.perfis_acesso || ''
    };

    if (perfil === 'separador') {
      req.session.separador = await db.get(
        `SELECT id,nome,matricula,turno,status FROM separadores WHERE usuario_id=$1 AND status='ativo'`,
        [user.id]
      );
    } else {
      req.session.separador = null;
    }

    res.json({ usuario: req.session.usuario, separador: req.session.separador });
  } catch(e) { res.status(500).json({erro:'Erro interno ao autenticar.'}); }
});
app.post('/auth/logout', (req,res) => {
  req.session.destroy(err => {
    res.clearCookie('wms.sid');
    res.json({ mensagem: 'Logout realizado!' });
  });
});
app.get('/auth/me',(req,res)=>{
  if (!req.session.usuario) return res.status(401).json({erro:'Nao autenticado'});
  res.json({usuario:req.session.usuario,separador:req.session.separador||null});
});

// ── USUÁRIOS ──────────────────────────────────────────────────────────────────
───────────────────────────────────────────────────────────────
app.get('/usuarios', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    let sql='SELECT id,nome,login,perfil,subtipo_repositor,perfis_acesso,turno,status,data_cadastro FROM usuarios WHERE 1=1';
    const p=[];
    if (req.query.perfil){p.push(req.query.perfil);sql+=` AND perfil=$${p.length}`;}
    res.json(await db.all(sql+' ORDER BY nome',p));
  } catch(e){res.status(500).json({erro:e.message});}
});
app.post('/usuarios', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {nome,login,senha,perfil,subtipo_repositor,turno,perfis_acesso}=req.body;
  if (!nome||!login||!senha||!perfil) return res.status(400).json({erro:'Preencha todos os campos!'});
  const extras=Array.isArray(perfis_acesso)?perfis_acesso.filter(Boolean).filter(p=>p!==perfil).join(','):String(perfis_acesso||'');
  const subtipo=perfil==='repositor'?(subtipo_repositor||'geral'):'geral';
  try {
    const r=await pool.query(`INSERT INTO usuarios (nome,login,senha_hash,perfil,subtipo_repositor,perfis_acesso,turno) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [nome,login,hashSenha(senha),perfil,subtipo,extras,turno||'Manha']);
    const novoId=r.rows[0].id;
    if (perfil==='separador') await pool.query(`INSERT INTO separadores (nome,matricula,turno,usuario_id) VALUES ($1,$2,$3,$4) ON CONFLICT(matricula) DO NOTHING`,[nome,login,turno||'Manha',novoId]);
    res.json({id:novoId,mensagem:'Usuario cadastrado!'});
  } catch(e){
    if (e.code==='23505') return res.status(409).json({erro:'Login ja cadastrado!'});
    res.status(500).json({erro:e.message});
  }
});
app.put('/usuarios/:id', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {nome,login,senha,perfil,subtipo_repositor,turno,status,perfis_acesso}=req.body;
  const subtipo=perfil==='repositor'?(subtipo_repositor||'geral'):'geral';
  const extras=Array.isArray(perfis_acesso)?perfis_acesso.filter(Boolean).filter(p=>p!==perfil).join(','):String(perfis_acesso||'');
  try {
    if (senha) {
      await pool.query(`UPDATE usuarios SET nome=$1,login=$2,senha_hash=$3,perfil=$4,subtipo_repositor=$5,turno=$6,status=$7,perfis_acesso=$8 WHERE id=$9`,
        [nome,login,hashSenha(senha),perfil,subtipo,turno||'Manha',status,extras,req.params.id]);
    } else {
      await pool.query(`UPDATE usuarios SET nome=$1,login=$2,perfil=$3,subtipo_repositor=$4,turno=$5,status=$6,perfis_acesso=$7 WHERE id=$8`,
        [nome,login,perfil,subtipo,turno||'Manha',status,extras,req.params.id]);
    }
    res.json({mensagem:'Atualizado!'});
  } catch(e){res.status(500).json({erro:e.message});}
});
app.delete('/usuarios/:id', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try { await pool.query('DELETE FROM usuarios WHERE id=$1',[req.params.id]); res.json({mensagem:'Excluido!'}); }
  catch(e){res.status(500).json({erro:e.message});}
});

// ── SEPARADORES ───────────────────────────────────────────────────────────────
────────────────────────────────────────────────────────────
app.get('/separadores', requerAuth, async (req,res) => {
  try { res.json(await db.all(`SELECT s.*,u.nome as usuario_nome FROM separadores s LEFT JOIN usuarios u ON s.usuario_id=u.id ORDER BY s.nome`)); }
  catch(e){res.status(500).json({erro:e.message});}
});
app.get('/separadores/:id', requerAuth, async (req,res) => {
  try { res.json(await db.get('SELECT * FROM separadores WHERE id=$1',[req.params.id])); }
  catch(e){res.status(500).json({erro:e.message});}
});
app.post('/separadores', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {nome,matricula,turno,usuario_id}=req.body;
  try {
    const r=await pool.query(`INSERT INTO separadores (nome,matricula,turno,usuario_id) VALUES ($1,$2,$3,$4) ON CONFLICT(matricula) DO NOTHING RETURNING id`,
      [nome,matricula,turno||'Manha',usuario_id||null]);
    if (!r.rows[0]) return res.status(409).json({erro:'Matricula ja cadastrada!'});
    res.json({id:r.rows[0].id,mensagem:'Separador cadastrado!'});
  } catch(e){res.status(500).json({erro:e.message});}
});
app.put('/separadores/:id', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {nome,matricula,turno,status,usuario_id}=req.body;
  try { await pool.query('UPDATE separadores SET nome=$1,matricula=$2,turno=$3,status=$4,usuario_id=$5 WHERE id=$6',[nome,matricula,turno,status,usuario_id||null,req.params.id]); res.json({mensagem:'Atualizado!'}); }
  catch(e){res.status(500).json({erro:e.message});}
});
app.delete('/separadores/:id', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try { await pool.query('DELETE FROM separadores WHERE id=$1',[req.params.id]); res.json({mensagem:'Excluido!'}); }
  catch(e){res.status(500).json({erro:e.message});}
});

// ── PEDIDOS ───────────────────────────────────────────────────────────────────
────────────────────────────────────────────────────────────────
app.get('/pedidos', requerAuth, async (req,res) => {
  const {separador_id,status,data,data_ini,data_fim,numero_pedido}=req.query;
  try {
    let q=`SELECT p.*,s.nome as separador_nome FROM pedidos p LEFT JOIN separadores s ON p.separador_id=s.id WHERE 1=1`;
    const p=[];
    const add=(c,v)=>{p.push(v);q+=` AND ${c}$${p.length}`;};
    if (separador_id)  add('p.separador_id=',separador_id);
    if (status)        add('p.status=',status);
    if (data)          add('p.data_pedido=',data);
    if (data_ini)      add('p.data_pedido>=',data_ini);
    if (data_fim)      add('p.data_pedido<=',data_fim);
    if (numero_pedido) add('p.numero_pedido=',numero_pedido);
    q+=` ORDER BY CASE WHEN p.aguardando_desde IS NOT NULL AND p.aguardando_desde!='' THEN p.aguardando_desde ELSE COALESCE(p.data_pedido,'')||' '||COALESCE(p.hora_pedido,'') END ASC`;
    const rows=await db.all(q,p);
    res.json(rows.map(r=>({...r,aguardando_desde:formatarAguardandoDesde(r.aguardando_desde)})));
  } catch(e){res.status(500).json({erro:e.message});}
});

app.post('/pedidos', requerAuth, requerPerfil('supervisor'), async (req,res) => {
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

// Info do pedido
app.get('/pedidos/info/:numero_pedido', requerAuth, async (req,res) => {
  try {
    const row=await db.get('SELECT numero_pedido,cliente,transportadora,numero_caixa FROM pedidos WHERE numero_pedido=$1',[req.params.numero_pedido]);
    if (!row) return res.status(404).json({erro:'Pedido não encontrado'});
    res.json({cliente:row.cliente||'',transportadora:row.transportadora||'',numero_caixa:row.numero_caixa||''});
  } catch(e){res.status(500).json({erro:e.message});}
});

// Vincular caixa
app.put('/pedidos/:id/caixa', requerAuth, async (req,res) => {
  const {numero_caixa}=req.body;
  if (!numero_caixa) return res.status(400).json({erro:'Numero da caixa nao informado!'});
  const caixa=String(numero_caixa).trim();
  try {
    const usada=await db.get(`SELECT numero_pedido FROM pedidos WHERE numero_caixa=$1 AND id<>$2 AND status<>'concluido'`,[caixa,req.params.id]);
    if (usada) return res.status(409).json({erro:`Caixa ${caixa} em uso no pedido ${usada.numero_pedido}!`});
    await pool.query('UPDATE pedidos SET numero_caixa=$1 WHERE id=$2',[caixa,req.params.id]);
    const ped=await db.get('SELECT numero_pedido FROM pedidos WHERE id=$1',[req.params.id]);
    const {hora}=dataHoraLocal();
    const ck=await db.get('SELECT id FROM checkout WHERE pedido_id=$1',[req.params.id]);
    if (ck) { await pool.query(`UPDATE checkout SET numero_caixa=$1 WHERE pedido_id=$2`,[caixa,req.params.id]); }
    else { await pool.query(`INSERT INTO checkout (numero_caixa,pedido_id,numero_pedido,status,hora_criacao) VALUES ($1,$2,$3,'pendente',$4)`,[caixa,req.params.id,ped?.numero_pedido||'',hora]); }
    res.json({mensagem:`Caixa ${caixa} vinculada!`});
  } catch(e){res.status(500).json({erro:e.message});}
});

// Liberar caixa
app.put('/pedidos/:id/liberar-caixa', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    await pool.query(`UPDATE pedidos SET numero_caixa='' WHERE id=$1`,[req.params.id]);
    await pool.query(`DELETE FROM checkout WHERE pedido_id=$1 AND status='pendente'`,[req.params.id]);
    res.json({mensagem:'Caixa liberada!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

// Bipar pedido
app.post('/pedidos/bipar', requerAuth, async (req,res) => {
  const {numero_pedido,separador_id}=req.body;
  if (!numero_pedido) return res.status(400).json({erro:'Numero do pedido nao informado!'});
  try {
    const ped=await db.get('SELECT * FROM pedidos WHERE numero_pedido=$1',[numero_pedido]);
    if (!ped) return res.status(404).json({erro:'Pedido nao encontrado!'});
    if (ped.status==='concluido') return res.status(400).json({erro:'Pedido ja concluido!',status:'concluido'});
    if (separador_id && ped.separador_id && String(ped.separador_id)===String(separador_id))
      return res.json({mensagem:'Pedido ja atribuido.',pedido_id:ped.id,status:ped.status,ja_atribuido:true,caixa_vinculada:!!(ped.numero_caixa)});
    if (separador_id && ped.separador_id && String(ped.separador_id)!==String(separador_id) && ped.status==='separando')
      return res.status(409).json({erro:'Pedido sendo separado por outro operador!'});
    const sepId=separador_id||ped.separador_id||null;
    await pool.query(`UPDATE pedidos SET separador_id=$1,status='separando' WHERE id=$2`,[sepId,ped.id]);
    res.json({mensagem:'Pedido atribuido!',pedido_id:ped.id,status:'separando',caixa_vinculada:!!(ped.numero_caixa)});
  } catch(e){res.status(500).json({erro:e.message});}
});

// Itens do pedido
app.get('/pedidos/:id/itens', requerAuth, async (req,res) => {
  try {
    res.json(await db.all(
      `SELECT i.*,COALESCE((SELECT a.status FROM avisos_repositor a WHERE a.item_id=i.id ORDER BY a.id DESC LIMIT 1),'') as aviso_status FROM itens_pedido i WHERE i.pedido_id=$1 ORDER BY i.id`,
      [req.params.id]
    ));
  } catch(e){res.status(500).json({erro:e.message});}
});

// Verificar item
app.put('/itens/:id/verificar', requerAuth, async (req,res) => {
  const {status,obs,qtd_falta,separador_id,separador_nome}=req.body;
  const {hora,data}=dataHoraLocal();
  try {
    const item=await db.get(`SELECT i.*,p.numero_pedido FROM itens_pedido i JOIN pedidos p ON i.pedido_id=p.id WHERE i.id=$1`,[req.params.id]);
    if (!item) return res.status(404).json({erro:'Item nao encontrado'});
    await pool.query('UPDATE itens_pedido SET status=$1,obs=$2,qtd_falta=$3,hora_verificado=$4 WHERE id=$5',[status,obs||'',qtd_falta||0,hora,req.params.id]);
    if (status==='falta'||status==='parcial') {
      const qtdA=status==='falta'?item.quantidade:(qtd_falta||0);
      const obsA=status==='parcial'?(obs||''):`Falta total - ${item.quantidade} unidade(s)`;
      const ja=await db.get(`SELECT id FROM avisos_repositor WHERE item_id=$1 AND status='pendente'`,[item.id]);
      if (ja) { await pool.query(`UPDATE avisos_repositor SET quantidade=$1,obs=$2,hora_aviso=$3 WHERE id=$4`,[qtdA,obsA,hora,ja.id]); }
      else { await pool.query(`INSERT INTO avisos_repositor (item_id,pedido_id,numero_pedido,separador_id,separador_nome,codigo,descricao,endereco,quantidade,obs,status,hora_aviso,data_aviso) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pendente',$11,$12)`,
        [item.id,item.pedido_id,item.numero_pedido,separador_id,separador_nome,item.codigo,item.descricao,item.endereco,qtdA,obsA,hora,data]); }
      res.json({mensagem:'Repositor avisado!',aviso:true});
    } else { res.json({mensagem:'Item verificado!',aviso:false}); }
  } catch(e){res.status(500).json({erro:e.message});}
});

// Concluir pedido
app.put('/pedidos/:id/concluir', requerAuth, async (req,res) => {
  try {
    const pend=await db.all(`SELECT id FROM itens_pedido WHERE pedido_id=$1 AND status='pendente'`,[req.params.id]);
    if (pend.length) return res.status(400).json({erro:`Ainda ha ${pend.length} item(s) nao verificado(s)!`});
    const avisos=await db.all(`SELECT id FROM avisos_repositor WHERE pedido_id=$1 AND status='pendente'`,[req.params.id]);
    if (avisos.length) return res.json({aguardando:true,mensagem:`Aguardando repositor (${avisos.length})`});
    const {data,hora}=dataHoraLocal();
    await pool.query(`UPDATE pedidos SET status='concluido' WHERE id=$1`,[req.params.id]);
    await pool.query(`UPDATE checkout SET status='pendente',hora_criacao=$1,data_checkout=$2 WHERE pedido_id=$3`,[hora,data,req.params.id]);
    res.json({mensagem:'Pedido concluido!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

// Redefinir / Excluir pedido
app.put('/pedidos/:id/redefinir', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try { await pool.query(`UPDATE pedidos SET status='pendente',separador_id=NULL WHERE id=$1`,[req.params.id]); res.json({mensagem:'Redefinido!'}); }
  catch(e){res.status(500).json({erro:e.message});}
});
app.delete('/pedidos/:id', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    await pool.query('DELETE FROM avisos_repositor WHERE pedido_id=$1',[req.params.id]);
    await pool.query('DELETE FROM checkout WHERE pedido_id=$1',[req.params.id]);
    await pool.query('DELETE FROM itens_pedido WHERE pedido_id=$1',[req.params.id]);
    await pool.query('DELETE FROM pedidos WHERE id=$1',[req.params.id]);
    res.json({mensagem:'Pedido excluido!'});
  } catch(e){res.status(500).json({erro:e.message});}
});
app.delete('/pedidos', requerAuth, requerPerfil('supervisor'), async (req,res) => {
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

// ── REPOSITOR ─────────────────────────────────────────────────────────────────
──────────────────────────────────────────────────────────────
app.get('/repositor/avisos', async (req,res) => {
  // Se não autenticado, retorna lista vazia (não quebra a UI)
  if (!req.session?.usuario) return res.json([]);
  const {status,data}=req.query;
  try {
    let sql='SELECT * FROM avisos_repositor WHERE 1=1'; const p=[];
    if (status){p.push(status);sql+=` AND status=$${p.length}`;}
    if (data){p.push(data);sql+=` AND data_aviso=$${p.length}`;}
    res.json(await db.all(sql+' ORDER BY id DESC',p));
  } catch(e){res.status(500).json({erro:e.message});}
});
app.put('/repositor/avisos/:id', requerAuth, async (req,res) => {
  const {status,obs,qtd_encontrada,repositor_nome}=req.body;
  const {hora}=dataHoraLocal();
  try {
    await pool.query(`UPDATE avisos_repositor SET status=$1,obs=$2,qtd_encontrada=$3,repositor_nome=$4,hora_reposto=$5 WHERE id=$6`,
      [status,obs||'',qtd_encontrada||0,repositor_nome||'',hora,req.params.id]);
    if (status==='reposto') {
      const av=await db.get('SELECT item_id FROM avisos_repositor WHERE id=$1',[req.params.id]);
      if (av) await pool.query(`UPDATE itens_pedido SET status='encontrado' WHERE id=$1`,[av.item_id]);
    }
    res.json({mensagem:'Aviso atualizado!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

// ── CHECKOUT ──────────────────────────────────────────────────────────────────
───────────────────────────────────────────────────────────────
app.get('/checkout', requerAuth, async (req,res) => {
  const {status,numero_caixa}=req.query;
  try {
    let sql=`SELECT c.*,p.status as ped_status,p.itens as ped_itens,p.numero_caixa as ped_caixa,p.cliente,p.transportadora,p.separador_id,s.nome as separador_nome_join FROM checkout c LEFT JOIN pedidos p ON c.pedido_id=p.id LEFT JOIN separadores s ON p.separador_id=s.id WHERE 1=1`;
    const pr=[];
    if (status){pr.push(status);sql+=` AND c.status=$${pr.length}`;}
    if (numero_caixa){pr.push(numero_caixa);sql+=` AND c.numero_caixa=$${pr.length}`;}
    res.json(await db.all(sql+' ORDER BY c.id DESC',pr));
  } catch(e){res.status(500).json({erro:e.message});}
});
app.get('/checkout/buscar', requerAuth, async (req,res) => {
  const {numero}=req.query;
  if (!numero) return res.status(400).json({erro:'Número não informado'});
  try {
    let row=await db.get(`SELECT c.*,p.numero_caixa FROM checkout c JOIN pedidos p ON c.pedido_id=p.id WHERE c.numero_caixa=$1 ORDER BY c.id DESC LIMIT 1`,[numero]);
    if (!row) {
      const ped=await db.get('SELECT id,numero_pedido,numero_caixa,status FROM pedidos WHERE numero_pedido=$1',[numero]);
      if (ped&&ped.numero_caixa) row={numero_pedido:ped.numero_pedido,numero_caixa:ped.numero_caixa,status:'pendente',pedido_status:ped.status};
    }
    if (!row) return res.status(404).json({erro:'Não encontrado'});
    res.json(row);
  } catch(e){res.status(500).json({erro:e.message});}
});
app.put('/checkout/:id/concluir', requerAuth, async (req,res) => {
  const {hora_checkout,data_checkout}=req.body;
  const {data,hora}=dataHoraLocal();
  try {
    await pool.query(`UPDATE checkout SET status='concluido',hora_checkout=$1,data_checkout=$2 WHERE id=$3`,[hora_checkout||hora,data_checkout||data,req.params.id]);
    res.json({mensagem:'Checkout concluido!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

// ── KPIs / ESTATÍSTICAS ───────────────────────────────────────────────────────
───────────────────────────────────────────────────────────────────
app.get('/kpis', requerAuth, async (req,res) => {
  const {data:hoje}=dataHoraLocal(); const mes=hoje.substring(0,7);
  try {
    const r=await db.get(`SELECT
      (SELECT COUNT(*) FROM pedidos WHERE status='concluido' AND data_pedido=$1) as concluidos_hoje,
      (SELECT COUNT(*) FROM pedidos WHERE status='separando') as em_separacao,
      (SELECT COUNT(*) FROM pedidos WHERE status='pendente') as pendentes,
      (SELECT COUNT(*) FROM avisos_repositor WHERE status='pendente') as faltas_abertas,
      (SELECT COUNT(*) FROM checkout WHERE status='pendente') as checkout_pendente,
      (SELECT COUNT(*) FROM checkout WHERE status='concluido' AND data_checkout=$2) as checkout_hoje,
      (SELECT COUNT(*) FROM pedidos WHERE status='concluido' AND data_pedido LIKE $3) as concluidos_mes,
      (SELECT COUNT(*) FROM pedidos WHERE data_pedido=$4) as importados_hoje,
      (SELECT COUNT(DISTINCT separador_id) FROM pedidos WHERE status='separando') as seps_ativos,
      (SELECT COUNT(*) FROM avisos_repositor WHERE status='nao_encontrado' AND data_aviso=$5) as nao_encontrados_hoje,
      (SELECT COUNT(*) FROM avisos_repositor WHERE data_aviso=$6) as total_faltas_hoje`,
      [hoje,hoje,mes+'%',hoje,hoje,hoje]);
    res.json(r||{});
  } catch(e){res.status(500).json({erro:e.message});}
});

// ─── PRODUTIVIDADE ────────────────────────────────────────────────────────────
app.get('/produtividade', requerAuth, async (req,res) => {
  const {separador_id}=req.query;
  const {data:hoje}=dataHoraLocal(); const mes=hoje.substring(0,7);
  try {
    let sql=`SELECT s.id,s.nome,s.matricula,s.status,
      SUM(CASE WHEN p.data_pedido=$1 THEN 1 ELSE 0 END) as hoje,
      SUM(CASE WHEN p.data_pedido LIKE $2 THEN 1 ELSE 0 END) as mes,
      COUNT(p.id) as total_ano,
      COALESCE(SUM(p.pontuacao),0) as pontuacao_total
    FROM separadores s LEFT JOIN pedidos p ON p.separador_id=s.id AND p.status='concluido' WHERE 1=1`;
    const p=[hoje,mes+'%'];
    if (separador_id){p.push(separador_id);sql+=` AND s.id=$${p.length}`;}
    res.json(await db.all(sql+' GROUP BY s.id,s.nome,s.matricula,s.status ORDER BY s.nome',p));
  } catch(e){res.status(500).json({erro:e.message});}
});

// ─── ESTATÍSTICAS ─────────────────────────────────────────────────────────────
app.get('/estatisticas/pedidos', requerAuth, async (req,res) => {
  const {data_ini,data_fim}=req.query;
  const {data:hoje}=dataHoraLocal(); const mes=hoje.substring(0,7); const ano=hoje.substring(0,4);
  try {
    const row=await db.get(`SELECT
      SUM(CASE WHEN data_pedido=$1 AND status='concluido' THEN 1 ELSE 0 END) as concluidos_hoje,
      SUM(CASE WHEN data_pedido=$2 THEN 1 ELSE 0 END) as total_hoje,
      SUM(CASE WHEN data_pedido LIKE $3 AND status='concluido' THEN 1 ELSE 0 END) as concluidos_mes,
      SUM(CASE WHEN data_pedido LIKE $4 THEN 1 ELSE 0 END) as total_mes,
      SUM(CASE WHEN data_pedido LIKE $5 AND status='concluido' THEN 1 ELSE 0 END) as concluidos_ano,
      SUM(CASE WHEN data_pedido LIKE $6 THEN 1 ELSE 0 END) as total_ano FROM pedidos`,
      [hoje,hoje,mes+'%',mes+'%',ano+'%',ano+'%']);
    if (data_ini&&data_fim) {
      const row2=await db.get(`SELECT COUNT(*) as total_periodo,SUM(CASE WHEN status='concluido' THEN 1 ELSE 0 END) as concluidos_periodo FROM pedidos WHERE data_pedido>=$1 AND data_pedido<=$2`,[data_ini,data_fim]);
      return res.json({...row,...row2});
    }
    res.json(row);
  } catch(e){res.status(500).json({erro:e.message});}
});
app.get('/estatisticas/repositor', requerAuth, async (req,res) => {
  const {repositor_nome}=req.query;
  const {data:hoje}=dataHoraLocal(); const mes=hoje.substring(0,7); const ano=hoje.substring(0,4);
  try {
    let sql=`SELECT
      SUM(CASE WHEN data_aviso=$1 AND status='reposto' THEN 1 ELSE 0 END) as repostos_hoje,
      SUM(CASE WHEN data_aviso=$2 THEN 1 ELSE 0 END) as avisos_hoje,
      SUM(CASE WHEN data_aviso LIKE $3 AND status='reposto' THEN 1 ELSE 0 END) as repostos_mes,
      SUM(CASE WHEN data_aviso LIKE $4 THEN 1 ELSE 0 END) as avisos_mes,
      SUM(CASE WHEN data_aviso LIKE $5 AND status='reposto' THEN 1 ELSE 0 END) as repostos_ano,
      SUM(CASE WHEN data_aviso LIKE $6 THEN 1 ELSE 0 END) as avisos_ano,
      SUM(CASE WHEN status='pendente' THEN 1 ELSE 0 END) as pendentes_total,
      SUM(CASE WHEN status='nao_encontrado' THEN 1 ELSE 0 END) as nao_encontrados,
      SUM(CASE WHEN status='protocolo' THEN 1 ELSE 0 END) as protocolos
    FROM avisos_repositor WHERE 1=1`;
    const p=[hoje,hoje,mes+'%',mes+'%',ano+'%',ano+'%'];
    if (repositor_nome){p.push(repositor_nome);sql+=` AND repositor_nome=$${p.length}`;}
    const row=await db.get(sql,p);
    const prod=await db.all(`SELECT repositor_nome as nome,COUNT(*) as total,SUM(CASE WHEN status='reposto' THEN 1 ELSE 0 END) as repostos,SUM(CASE WHEN status='nao_encontrado' THEN 1 ELSE 0 END) as nao_encontrados,SUM(CASE WHEN data_aviso=$1 THEN 1 ELSE 0 END) as hoje FROM avisos_repositor WHERE repositor_nome!='' GROUP BY repositor_nome ORDER BY repostos DESC`,[hoje]);
    res.json({...row,produtividade:prod});
  } catch(e){res.status(500).json({erro:e.message});}
});
app.get('/estatisticas/checkout', requerAuth, async (req,res) => {
  const {data:hoje}=dataHoraLocal(); const mes=hoje.substring(0,7); const ano=hoje.substring(0,4);
  try {
    res.json(await db.get(`SELECT
      SUM(CASE WHEN data_checkout=$1 AND status='concluido' THEN 1 ELSE 0 END) as concluidos_hoje,
      SUM(CASE WHEN data_checkout=$2 THEN 1 ELSE 0 END) as total_hoje,
      SUM(CASE WHEN data_checkout LIKE $3 AND status='concluido' THEN 1 ELSE 0 END) as concluidos_mes,
      SUM(CASE WHEN data_checkout LIKE $4 THEN 1 ELSE 0 END) as total_mes,
      SUM(CASE WHEN data_checkout LIKE $5 AND status='concluido' THEN 1 ELSE 0 END) as concluidos_ano,
      SUM(CASE WHEN data_checkout LIKE $6 THEN 1 ELSE 0 END) as total_ano,
      SUM(CASE WHEN status='pendente' THEN 1 ELSE 0 END) as pendentes FROM checkout`,
      [hoje,hoje,mes+'%',mes+'%',ano+'%',ano+'%'])||{});
  } catch(e){res.status(500).json({erro:e.message});}
});

// ─── TIMELINE ─────────────────────────────────────────────────────────────────
app.get('/timeline', requerAuth, async (req,res) => {
  const {data}=req.query; const {data:hoje}=dataHoraLocal();
  try {
    const rows=await db.all(`SELECT p.numero_pedido,p.cliente,p.transportadora,p.hora_pedido,p.status,p.itens,s.nome as separador_nome,p.data_pedido,p.aguardando_desde FROM pedidos p LEFT JOIN separadores s ON p.separador_id=s.id WHERE p.data_pedido=$1 ORDER BY p.hora_pedido ASC NULLS LAST`,[data||hoje]);
    res.json(rows.map(r=>({...r,aguardando_desde:formatarAguardandoDesde(r.aguardando_desde)})));
  } catch(e){res.status(500).json({erro:e.message});}
});

// ── IMPORTAR / DISTRIBUIÇÃO ───────────────────────────────────────────────────
───────────────────────────────────────────────────────────────
const SEGMENTOS_ESTOQUE=[
  ['A',1,84,'Frente','Facil'],['B',1,168,'Frente','Facil'],['C',1,168,'Frente','Facil'],['D',1,168,'Frente','Facil'],['E',1,77,'Frente','Facil'],
  ['F',1,40,'Fundo','Dificil'],['G',41,96,'Fundo','Dificil'],['H',1,112,'Fundo','Dificil'],
  ['I',1,112,'Fundo','Dificil'],['I',113,203,'Frente','Dificil'],
  ['J',1,91,'Frente','Dificil'],['J',204,287,'Frente','Dificil'],['J',92,147,'Fundo','Dificil'],['J',148,203,'Fundo','Dificil'],
  ['K',1,84,'Frente','Dificil'],['K',197,287,'Frente','Dificil'],['K',85,140,'Fundo','Dificil'],['K',141,196,'Fundo','Dificil'],
  ['L',1,91,'Frente','Dificil'],['L',204,294,'Frente','Dificil'],['L',148,203,'Fundo','Dificil'],['L',92,147,'Fundo','Dificil'],
  ['M',1,91,'Frente','Medio'],['M',204,287,'Frente','Medio'],['M',92,147,'Fundo','Medio'],['M',148,203,'Fundo','Medio'],
  ['N',1,84,'Frente','Medio'],['N',197,287,'Frente','Medio'],['N',141,196,'Fundo','Medio'],['N',85,140,'Fundo','Medio'],
  ['O',1,91,'Frente','Medio'],['O',204,294,'Frente','Medio'],['O',92,147,'Fundo','Medio'],['O',148,203,'Fundo','Medio'],
  ['P',1,91,'Frente','Facil'],['P',204,287,'Frente','Facil'],['P',92,147,'Fundo','Facil'],['P',148,203,'Fundo','Facil'],
  ['Q',1,84,'Frente','Facil'],['Q',197,287,'Frente','Facil'],['Q',85,140,'Fundo','Facil'],['Q',141,196,'Fundo','Facil'],
  ['R',1,91,'Frente','Facil'],['R',204,294,'Frente','Facil'],['R',92,147,'Fundo','Facil'],['R',148,203,'Fundo','Facil'],
  ['S',1,91,'Frente','Facil'],['S',204,294,'Frente','Facil'],['S',92,147,'Fundo','Facil'],['S',148,203,'Fundo','Facil'],
  ['T',1,84,'Frente','Facil'],['T',197,287,'Frente','Facil'],['T',85,140,'Fundo','Facil'],['T',141,196,'Fundo','Facil'],
  ['U',1,91,'Frente','Facil'],['U',204,347,'Frente','Facil'],['U',92,147,'Fundo','Facil'],['U',148,203,'Fundo','Facil'],
  ['V',1,144,'Frente','Medio'],['V',257,360,'Frente','Medio'],['V',145,200,'Fundo','Medio'],['V',201,256,'Fundo','Medio'],
  ['W',1,104,'Frente','Medio'],['W',241,352,'Frente','Medio'],['W',105,160,'Fundo','Medio'],['W',161,240,'Fundo','Medio'],
  ['X',1,112,'Frente','Medio'],['X',233,352,'Frente','Medio'],['X',113,192,'Fundo','Medio'],['X',193,232,'Fundo','Medio'],
  ['Y',1,120,'Frente','Medio'],['Y',201,320,'Frente','Medio'],['Y',121,160,'Fundo','Medio'],['Y',161,200,'Fundo','Medio'],
  ['Z',1,120,'Frente','Medio'],['Z',121,160,'Fundo','Medio'],
];
const PESOS_NIVEL_LOCAL={'Facil_Frente':1.0,'Facil_Fundo':1.3,'Medio_Frente':1.8,'Medio_Fundo':2.2,'Dificil_Frente':2.8,'Dificil_Fundo':3.5};
function calcularPesoCorredor(e) {
  if (!e) return 1.0;
  const end=String(e).split(',')[0].trim().toUpperCase();
  if (end.startsWith('ZA')||end.includes('ARARA')||end.includes('VERT')) return 3.5;
  const m=end.match(/^([A-Z]+)(\d+)/);
  if (!m) return 1.0;
  const [,rua,ns]=m; const num=parseInt(ns);
  for (const [sR,de,ate,loc,niv] of SEGMENTOS_ESTOQUE) { if (sR===rua&&de<=num&&num<=ate) return PESOS_NIVEL_LOCAL[niv+'_'+loc]||1.0; }
  for (const [sR,,,loc,niv] of SEGMENTOS_ESTOQUE) { if (sR===rua) return PESOS_NIVEL_LOCAL[(niv||'Facil')+'_'+(loc||'Frente')]||1.0; }
  return 1.0;
}
function calcularPontuacaoPedido(itens) {
  if (!itens?.length) return 0;
  const soma=itens.reduce((s,i)=>s+calcularPesoCorredor(i.endereco)*(parseInt(i.quantidade)||1),0);
  const ruas=new Set(itens.map(i=>String(i.endereco||'').split(',')[0].trim().replace(/\d+/g,'').trim())).size;
  return Math.round(soma+ruas*2);
}
app.post('/pedidos/importar', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  // Aceita {pedidos:[...]} ou {linhas:[...]} (compatibilidade com versões anteriores)
  const dados = req.body.pedidos || req.body.linhas || [];
  if (!dados?.length) return res.status(400).json({erro:'Nenhum pedido informado!'});
  const {data:hoje,hora}=dataHoraLocal();
  let importados=0,ignorados=0,erros=0;
  const numeros=[...new Set(dados.map(d=>String(d.numero_pedido)))];
  for (const numero of numeros) {
    const itens=dados.filter(d=>String(d.numero_pedido)===numero);
    try {
      const ruasU=new Set(itens.map(i=>String(i.endereco||'').split(',')[0].trim().replace(/\d+/g,'').trim())).size;
      const pts=Math.round(itens.reduce((s,i)=>s+calcularPesoCorredor(i.endereco)*(parseInt(i.quantidade)||1),0)+ruasU*2);
      const r=await pool.query(`INSERT INTO pedidos (numero_pedido,status,itens,rua,cliente,transportadora,aguardando_desde,pontuacao,data_pedido,hora_pedido) VALUES ($1,'pendente',$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(numero_pedido) DO NOTHING RETURNING id`,
        [numero,itens.length,itens[0]?.endereco||'',itens[0]?.cliente||'',itens[0]?.transportadora||'',itens[0]?.aguardando_desde||'',pts,hoje,hora]);
      if (!r.rows[0]){ignorados++;continue;}
      const pid=r.rows[0].id;
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        for (const it of itens) await client.query(`INSERT INTO itens_pedido (pedido_id,codigo,descricao,endereco,quantidade) VALUES ($1,$2,$3,$4,$5)`,[pid,String(it.codigo||'').trim(),String(it.descricao||'').trim(),String(it.endereco||'').trim(),parseInt(it.quantidade)||1]);
        await client.query('COMMIT'); importados++;
      } catch(ei){await client.query('ROLLBACK');await pool.query('DELETE FROM pedidos WHERE id=$1',[pid]);erros++;}
      finally{client.release();}
    } catch(err){console.error(`Erro ${numero}:`,err.message);erros++;}
  }
  res.json({mensagem:'Importacao concluida!',importados,ignorados,erros,total:numeros.length});
});
───────────────────────────────────────────────────────────
app.post('/pedidos/distribuicao', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {separadores,quantidade,apenas_sem_sep,respeitar_hora}=req.body;
  if (!separadores?.length) return res.status(400).json({erro:'Informe os separadores!'});
  try {
    let w="p.status='pendente'";
    if (apenas_sem_sep!==false) w+=' AND p.separador_id IS NULL';
    const pedidos=await db.all(`SELECT p.* FROM pedidos p WHERE ${w} ORDER BY p.hora_pedido ASC,p.id ASC`);
    if (!pedidos.length) return res.json({plano:[],total_pedidos:0});
    for (const ped of pedidos) {
      const itens=await db.all('SELECT endereco,quantidade FROM itens_pedido WHERE pedido_id=$1',[ped.id]);
      ped._p=ped.pontuacao>0?ped.pontuacao:calcularPontuacaoPedido(itens);
      if (!ped.pontuacao) await pool.query('UPDATE pedidos SET pontuacao=$1 WHERE id=$2',[ped._p,ped.id]);
    }
    const lim=(quantidade>0)?quantidade:pedidos.length;
    const isDrive=p=>String(p.transportadora||'').toUpperCase().includes('DRIVE');
    const drive=pedidos.filter(isDrive).slice(0,lim);
    let outros=pedidos.filter(p=>!isDrive(p));
    const rest=Math.max(0,lim-drive.length);
    if (respeitar_hora!==false) {
      const gMin=p=>{const s=String(p.aguardando_desde||p.hora_pedido||'');const m=s.match(/(\d{2}:\d{2})/);return m?m[1]:s;};
      outros.sort((a,b)=>gMin(a).localeCompare(gMin(b)));
      const grp={};
      for (const p of outros){const k=gMin(p);if(!grp[k])grp[k]=[];grp[k].push(p);}
      outros=Object.keys(grp).sort().flatMap(k=>grp[k].sort((a,b)=>b._p-a._p)).slice(0,rest);
    } else { outros=outros.sort((a,b)=>b._p-a._p).slice(0,rest); }
    const ord=[...drive,...outros];
    const sepMap={};
    for (const sid of separadores) {
      let row=await db.get('SELECT s.id,s.nome FROM separadores s WHERE s.usuario_id=$1 LIMIT 1',[sid]);
      if (!row) row=await db.get('SELECT id,nome FROM usuarios WHERE id=$1',[sid]);
      if (row) sepMap[sid]=row;
    }
    const filas=separadores.map(sid=>({separador_id:sid,separador_nome:sepMap[sid]?.nome||`Sep ${sid}`,pedidos:[],pontuacao_total:0,sep_db_id:sepMap[sid]?.id||null}));
    for (const ped of ord){filas.sort((a,b)=>a.pontuacao_total-b.pontuacao_total);filas[0].pedidos.push(ped.numero_pedido);filas[0].pontuacao_total+=ped._p;}
    res.json({plano:filas.map(f=>({separador_id:f.separador_id,sep_db_id:f.sep_db_id,separador_nome:f.separador_nome,pedidos:f.pedidos,pontuacao_total:f.pontuacao_total})),total_pedidos:pedidos.length});
  } catch(err){res.status(500).json({erro:err.message});}
});
app.post('/pedidos/distribuicao/confirmar', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {plano}=req.body;
  if (!plano?.length) return res.status(400).json({erro:'Plano não informado!'});
  let dist=0;
  try {
    for (const item of plano) for (const np of item.pedidos) {
      let sep=await db.get('SELECT id FROM separadores WHERE usuario_id=$1 OR id=$2 LIMIT 1',[item.separador_id,item.separador_id]);
      const dbId=item.sep_db_id||sep?.id;
      if (dbId){const r=await pool.query(`UPDATE pedidos SET separador_id=$1 WHERE numero_pedido=$2 AND status='pendente'`,[dbId,np]);if(r.rowCount>0)dist++;}
    }
    res.json({mensagem:'Distribuição confirmada!',distribuidos:dist});
  } catch(err){res.status(500).json({erro:err.message});}
});
app.post('/pedidos/recalcular-pontuacao', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const peds=await db.all("SELECT id FROM pedidos WHERE pontuacao=0 OR pontuacao IS NULL");
    let at=0;
    for (const p of peds){const itens=await db.all('SELECT endereco,quantidade FROM itens_pedido WHERE pedido_id=$1',[p.id]);const pts=calcularPontuacaoPedido(itens);if(pts>0){await pool.query('UPDATE pedidos SET pontuacao=$1 WHERE id=$2',[pts,p.id]);at++;}}
    res.json({mensagem:`${at} pedidos recalculados`,atualizados:at});
  } catch(err){res.status(500).json({erro:err.message});}
});

// ── ENDPOINTS EXTRAS ──────────────────────────────────────────────────────────
────────────────────────────────

// Checkout confirmar (alias de concluir)
app.put('/checkout/:id/confirmar', requerAuth, async (req,res) => {
  const {hora_checkout,data_checkout}=req.body;
  const {data,hora}=dataHoraLocal();
  try {
    await pool.query(`UPDATE checkout SET status='concluido',hora_checkout=$1,data_checkout=$2 WHERE id=$3`,
      [hora_checkout||hora, data_checkout||data, req.params.id]);
    res.json({mensagem:'Checkout concluido!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

// Liberar caixa do checkout
app.put('/checkout/:id/liberar', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const ck = await db.get('SELECT pedido_id FROM checkout WHERE id=$1',[req.params.id]);
    if (ck) {
      await pool.query(`UPDATE pedidos SET numero_caixa='' WHERE id=$1`,[ck.pedido_id]);
      await pool.query(`DELETE FROM checkout WHERE id=$1`,[req.params.id]);
    }
    res.json({mensagem:'Caixa liberada!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

// Buscar checkout por número de caixa — inclui itens do pedido
app.get('/checkout/caixa/:numero', requerAuth, async (req,res) => {
  const numero = String(req.params.numero).trim();
  try {
    const rows = await db.all(
      `SELECT c.*, p.status as ped_status, p.itens as ped_itens,
              p.numero_caixa, p.cliente, p.transportadora, s.nome as separador_nome
       FROM checkout c
       JOIN pedidos p ON c.pedido_id=p.id
       LEFT JOIN separadores s ON p.separador_id=s.id
       WHERE c.numero_caixa=$1 ORDER BY c.id DESC`,
      [numero]
    );
    // Para cada checkout, busca os itens do pedido
    for (const row of rows) {
      const itens = await db.all(
        `SELECT codigo, descricao, endereco, quantidade, status, obs
         FROM itens_pedido WHERE pedido_id=$1 ORDER BY id`,
        [row.pedido_id]
      );
      row.itens_lista = itens;
    }
    res.json(rows);
  } catch(e){res.status(500).json({erro:e.message});}
});

// Atribuir separador a pedido
app.put('/pedidos/:id/separador', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {separador_id}=req.body;
  try {
    await pool.query('UPDATE pedidos SET separador_id=$1 WHERE id=$2',[separador_id||null,req.params.id]);
    res.json({mensagem:'Separador atribuido!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

// Buscar produto no repositor por código
app.get('/repositor/buscar-produto', requerAuth, async (req,res) => {
  const {codigo}=req.query;
  if (!codigo) return res.status(400).json({erro:'Código não informado'});
  try {
    const rows = await db.all(
      `SELECT i.codigo, i.descricao, i.endereco, i.quantidade,
              p.numero_pedido, a.status as aviso_status
       FROM itens_pedido i
       JOIN pedidos p ON i.pedido_id=p.id
       LEFT JOIN avisos_repositor a ON a.item_id=i.id AND a.status='pendente'
       WHERE i.codigo ILIKE $1
       ORDER BY p.id DESC LIMIT 20`,
      [`%${codigo}%`]
    );
    res.json(rows);
  } catch(e){res.status(500).json({erro:e.message});}
});
──────────────────────────

// Pedidos bloqueados por nao_encontrado/protocolo
app.get('/pedidos/bloqueados', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const rows = await db.all(`
      SELECT DISTINCT p.id, p.numero_pedido, p.status, p.separador_id,
        s.nome as separador_nome,
        COUNT(DISTINCT a.id) as total_bloqueios,
        STRING_AGG(DISTINCT a.codigo, ', ') as codigos_bloqueados
      FROM pedidos p
      JOIN avisos_repositor a ON a.pedido_id=p.id
      LEFT JOIN separadores s ON p.separador_id=s.id
      WHERE a.status IN ('nao_encontrado','protocolo')
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

// Desbloquear pedido
app.put('/pedidos/:id/desbloquear', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    await pool.query(`UPDATE pedidos SET status='concluido' WHERE id=$1`,[req.params.id]);
    res.json({mensagem:'Pedido desbloqueado!'});
  } catch(e) { res.status(500).json({erro:e.message}); }
});

// Duplicatas geral — mesmo código com aviso pendente em mais de 1 pedido
app.get('/repositor/duplicatas', requerAuth, async (req,res) => {
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

// Duplicatas do dia
app.get('/repositor/duplicatas-dia', requerAuth, async (req,res) => {
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

// Avisos para separador específico
app.get('/repositor/avisos/separador/:separador_id', requerAuth, async (req,res) => {
  const {data:hoje} = dataHoraLocal();
  try {
    const rows = await db.all(
      `SELECT a.* FROM avisos_repositor a
       WHERE a.separador_id=$1 AND a.status IN ('subiu','abastecido') AND a.data_aviso=$2
       ORDER BY a.id DESC`,
      [req.params.separador_id, hoje]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({erro:e.message}); }
});

// Ações específicas do repositor
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
    res.json({mensagem:'Aviso atualizado!'});
  } catch(e) { res.status(500).json({erro:e.message}); }
}

app.put('/repositor/avisos/:id/reposto',       requerAuth, (req,res) => atualizarAviso(req,res,'reposto'));
app.put('/repositor/avisos/:id/encontrado',    requerAuth, (req,res) => atualizarAviso(req,res,'reposto'));
app.put('/repositor/avisos/:id/subiu',         requerAuth, (req,res) => atualizarAviso(req,res,'subiu'));
app.put('/repositor/avisos/:id/abastecido',    requerAuth, (req,res) => atualizarAviso(req,res,'abastecido'));
app.put('/repositor/avisos/:id/nao_encontrado',requerAuth, (req,res) => atualizarAviso(req,res,'nao_encontrado'));
app.put('/repositor/avisos/:id/protocolo',     requerAuth, (req,res) => atualizarAviso(req,res,'protocolo'));

// Alias retrocompatível — frontend antigo usava /importar
app.post('/importar', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  req.url = '/pedidos/importar';
  res.redirect(307, '/pedidos/importar');
});

module.exports = router;
