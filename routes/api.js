
// ── Função de auditoria ───────────────────────────────────────────────────────
async function registrarAuditoria(req, acao, entidade='', entidadeId=null, dadosAntes=null, dadosDepois=null) {
  try {
    const u = req.session?.usuario;
    const {data, hora} = dataHoraLocal();
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    await pool.query(
      `INSERT INTO auditoria (usuario_id, usuario_login, usuario_nome, acao, entidade, entidade_id, dados_antes, dados_depois, ip, data, hora)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [u?.id||null, u?.login||'sistema', u?.nome||'sistema', acao, entidade, entidadeId,
       dadosAntes?JSON.stringify(dadosAntes):null,
       dadosDepois?JSON.stringify(dadosDepois):null,
       ip, data, hora]
    ).catch(()=>{}); // Nunca quebra a rota principal
  } catch(e) {}
}

const express = require('express');
const router = express.Router();
const { pool, db } = require('../lib/db');
const { requerAuth, requerPerfil, checkRateLimit } = require('../lib/auth');
const { dataHoraLocal, formatarAguardandoDesde } = require('../lib/helpers');
const { calcularPesoCorredor, calcularPontuacaoPedido } = require('../lib/pontuacao');
const crypto = require('crypto');
const { hashSenha, perfisPermitidos } = require('../lib/helpers');


// Validação de inputs
function sanitizeStr(val, maxLen = 255) {
  if (val === null || val === undefined) return '';
  return String(val).trim().slice(0, maxLen);
}

function validarId(id) {
  const n = parseInt(id);
  return !isNaN(n) && n > 0 ? n : null;
}


// ── AUTH ─────────────────────────────────────────────────────────────────────
router.post('/auth/login', async (req,res) => {
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
router.post('/auth/logout', (req,res) => {
  req.session.destroy(err => {
    res.clearCookie('wms.sid');
    res.json({ mensagem: 'Logout realizado!' });
  });
});
router.get('/auth/me',(req,res)=>{
  if (!req.session.usuario) return res.status(401).json({erro:'Nao autenticado'});
  res.json({usuario:req.session.usuario,separador:req.session.separador||null});
});

// ── USUÁRIOS ──────────────────────────────────────────────────────────────────
router.get('/usuarios', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    let sql='SELECT id,nome,login,perfil,subtipo_repositor,perfis_acesso,turno,status,data_cadastro FROM usuarios WHERE 1=1';
    const p=[];
    if (req.query.perfil){p.push(req.query.perfil);sql+=` AND perfil=$${p.length}`;}
    res.json(await db.all(sql+' ORDER BY nome',p));
  } catch(e){res.status(500).json({erro:e.message});}
});
router.post('/usuarios', requerAuth, requerPerfil('supervisor'), async (req,res) => {
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
router.put('/usuarios/:id', requerAuth, requerPerfil('supervisor'), async (req,res) => {
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

router.patch('/usuarios/:id/status', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const id = validarId(req.params.id);
  if (!id) return res.status(400).json({erro:'ID invalido'});
  const {status} = req.body;
  if (!['ativo','inativo'].includes(status)) return res.status(400).json({erro:'Status invalido'});
  try {
    await pool.query('UPDATE usuarios SET status=$1 WHERE id=$2', [status, id]);
    res.json({mensagem:'Status atualizado!'});
  } catch(err) {
    res.status(500).json({erro:err.message});
  }
});
router.delete('/usuarios/:id', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try { await pool.query('DELETE FROM usuarios WHERE id=$1',[req.params.id]); res.json({mensagem:'Excluido!'}); }
  catch(e){res.status(500).json({erro:e.message});}
});

// ── SEPARADORES ───────────────────────────────────────────────────────────────
router.get('/separadores', requerAuth, async (req,res) => {
  try { res.json(await db.all(`SELECT s.*,u.nome as usuario_nome FROM separadores s LEFT JOIN usuarios u ON s.usuario_id=u.id ORDER BY s.nome`)); }
  catch(e){res.status(500).json({erro:e.message});}
});
router.get('/separadores/:id', requerAuth, async (req,res) => {
  try { res.json(await db.get('SELECT * FROM separadores WHERE id=$1',[req.params.id])); }
  catch(e){res.status(500).json({erro:e.message});}
});
router.post('/separadores', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {nome,matricula,turno,usuario_id}=req.body;
  try {
    const r=await pool.query(`INSERT INTO separadores (nome,matricula,turno,usuario_id) VALUES ($1,$2,$3,$4) ON CONFLICT(matricula) DO NOTHING RETURNING id`,
      [nome,matricula,turno||'Manha',usuario_id||null]);
    if (!r.rows[0]) return res.status(409).json({erro:'Matricula ja cadastrada!'});
    res.json({id:r.rows[0].id,mensagem:'Separador cadastrado!'});
  } catch(e){res.status(500).json({erro:e.message});}
});
router.put('/separadores/:id', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {nome,matricula,turno,status,usuario_id}=req.body;
  try { await pool.query('UPDATE separadores SET nome=$1,matricula=$2,turno=$3,status=$4,usuario_id=$5 WHERE id=$6',[nome,matricula,turno,status,usuario_id||null,req.params.id]); res.json({mensagem:'Atualizado!'}); }
  catch(e){res.status(500).json({erro:e.message});}
});
router.delete('/separadores/:id', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try { await pool.query('DELETE FROM separadores WHERE id=$1',[req.params.id]); res.json({mensagem:'Excluido!'}); }
  catch(e){res.status(500).json({erro:e.message});}
});

// ── PEDIDOS ───────────────────────────────────────────────────────────────────
router.get('/pedidos', requerAuth, async (req,res) => {
  const {separador_id,status,data,data_ini,data_fim,numero_pedido}=req.query;
  try {
    let q=`SELECT p.*,s.nome as separador_nome,p.tem_prime FROM pedidos p LEFT JOIN separadores s ON p.separador_id=s.id WHERE 1=1`;
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

// Info do pedido
router.get('/pedidos/info/:numero_pedido', requerAuth, async (req,res) => {
  try {
    const row=await db.get('SELECT numero_pedido,cliente,transportadora,numero_caixa FROM pedidos WHERE numero_pedido=$1',[req.params.numero_pedido]);
    if (!row) return res.status(404).json({erro:'Pedido não encontrado'});
    res.json({cliente:row.cliente||'',transportadora:row.transportadora||'',numero_caixa:row.numero_caixa||''});
  } catch(e){res.status(500).json({erro:e.message});}
});

// Vincular caixa
router.put('/pedidos/:id/caixa', requerAuth, async (req,res) => {
  const {numero_caixa}=req.body;
  if (!numero_caixa) return res.status(400).json({erro:'Numero da caixa nao informado!'});
  const caixa=String(numero_caixa).trim();
  try {
    // Verifica se caixa ja esta em uso em outro pedido ativo (nao concluido)
    const usadaPed = await db.get(
      `SELECT numero_pedido FROM pedidos WHERE numero_caixa=$1 AND id<>$2 AND status NOT IN ('concluido','cancelado')`,
      [caixa, req.params.id]
    );
    if (usadaPed) return res.status(409).json({erro:`Caixa ${caixa} ja esta em uso no pedido ${usadaPed.numero_pedido}!`});

    // Verifica tambem na tabela checkout (pedido pendente de checkout)
    const usadaCk = await db.get(
      `SELECT c.numero_pedido FROM checkout c JOIN pedidos p ON c.pedido_id=p.id WHERE c.numero_caixa=$1 AND c.pedido_id<>$2 AND c.status='pendente'`,
      [caixa, req.params.id]
    );
    if (usadaCk) return res.status(409).json({erro:`Caixa ${caixa} ja esta aguardando checkout no pedido ${usadaCk.numero_pedido}!`});

    // Vincula caixa ao pedido
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
router.put('/pedidos/:id/liberar-caixa', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    await pool.query(`UPDATE pedidos SET numero_caixa='' WHERE id=$1`,[req.params.id]);
    await pool.query(`DELETE FROM checkout WHERE pedido_id=$1 AND status='pendente'`,[req.params.id]);
    res.json({mensagem:'Caixa liberada!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

// Bipar pedido
router.post('/pedidos/bipar', requerAuth, async (req,res) => {
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
    const bipDHL=dataHoraLocal(); await pool.query(`UPDATE pedidos SET separador_id=$1,status='separando',iniciado_em=COALESCE(NULLIF(iniciado_em,''),$3) WHERE id=$2`,[sepId,ped.id,bipDHL.data+'T'+bipDHL.hora]);
    res.json({mensagem:'Pedido atribuido!',pedido_id:ped.id,status:'separando',caixa_vinculada:!!(ped.numero_caixa)});
  } catch(e){res.status(500).json({erro:e.message});}
});

// Itens do pedido
router.get('/pedidos/:id/itens', requerAuth, async (req,res) => {
  try {
    res.json(await db.all(
      `SELECT i.*,COALESCE((SELECT a.status FROM avisos_repositor a WHERE a.item_id=i.id ORDER BY a.id DESC LIMIT 1),'') as aviso_status FROM itens_pedido i WHERE i.pedido_id=$1 ORDER BY i.id`,
      [req.params.id]
    ));
  } catch(e){res.status(500).json({erro:e.message});}
});

// Verificar item
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
      // Busca transportadora do pedido para preencher forma_envio automaticamente
      const pedidoInfo = await db.get(`SELECT transportadora FROM pedidos WHERE id=$1`,[item.pedido_id]);
      const formaEnvio = pedidoInfo?.transportadora || '';
      const ja=await db.get(`SELECT id FROM avisos_repositor WHERE item_id=$1 AND status='pendente'`,[item.id]);
      if (ja) { await pool.query(`UPDATE avisos_repositor SET quantidade=$1,obs=$2,hora_aviso=$3,forma_envio=$4 WHERE id=$5`,[qtdA,obsA,hora,formaEnvio,ja.id]); }
      else { await pool.query(`INSERT INTO avisos_repositor (item_id,pedido_id,numero_pedido,separador_id,separador_nome,codigo,descricao,endereco,quantidade,obs,status,hora_aviso,data_aviso,forma_envio) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pendente',$11,$12,$13)`,
        [item.id,item.pedido_id,item.numero_pedido,separador_id,separador_nome,item.codigo,item.descricao,item.endereco,qtdA,obsA,hora,data,formaEnvio]); }
      res.json({mensagem:'Repositor avisado!',aviso:true});
    } else { res.json({mensagem:'Item verificado!',aviso:false}); }
  } catch(e){res.status(500).json({erro:e.message});}
});

// Concluir pedido
router.put('/pedidos/:id/concluir', requerAuth, async (req,res) => {
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
router.put('/pedidos/:id/redefinir', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try { await pool.query(`UPDATE pedidos SET status='pendente',separador_id=NULL WHERE id=$1`,[req.params.id]); res.json({mensagem:'Redefinido!'}); }
  catch(e){res.status(500).json({erro:e.message});}
});
router.delete('/pedidos/:id', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    await pool.query('DELETE FROM avisos_repositor WHERE pedido_id=$1',[req.params.id]);
    await pool.query('DELETE FROM checkout WHERE pedido_id=$1',[req.params.id]);
    await pool.query('DELETE FROM itens_pedido WHERE pedido_id=$1',[req.params.id]);
    await pool.query('DELETE FROM pedidos WHERE id=$1',[req.params.id]);
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

// ── REPOSITOR ─────────────────────────────────────────────────────────────────
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
    if (status){params.push(status);sql+=` AND a.status=$${params.length}`;}
    if (data){params.push(data);sql+=` AND a.data_aviso=$${params.length}`;}
    if (data_ini){params.push(data_ini);sql+=` AND a.data_aviso>=$${params.length}`;}
    if (data_fim){params.push(data_fim);sql+=` AND a.data_aviso<=$${params.length}`;}
    if (codigo){params.push('%'+codigo+'%');sql+=` AND UPPER(a.codigo) LIKE UPPER($${params.length})`;}
    const rows = await db.all(sql+' ORDER BY prioridade ASC, a.id DESC', params);
    res.json(rows.map(r=>({...r, forma_envio: r.forma_envio_real||r.forma_envio||''})));
  } catch(e){res.status(500).json({erro:e.message});}
});
router.put('/repositor/avisos/:id', requerAuth, async (req,res) => {
  const {status,obs,qtd_encontrada,repositor_nome,quem_pegou,quem_guardou,forma_envio,situacao}=req.body;
  const {hora}=dataHoraLocal();
  try {
    // Migra colunas novas se não existirem
    await pool.query(`ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS quem_pegou TEXT DEFAULT ''`).catch(()=>{});
    await pool.query(`ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS quem_guardou TEXT DEFAULT ''`).catch(()=>{});
    await pool.query(`ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS forma_envio TEXT DEFAULT ''`).catch(()=>{});
    await pool.query(`ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS situacao TEXT DEFAULT ''`).catch(()=>{});
    const st = situacao || status || 'pendente';
    // Busca registro atual para não sobrescrever campos já preenchidos
    const atual = await db.get('SELECT * FROM avisos_repositor WHERE id=$1',[req.params.id]);
    const qPegou   = quem_pegou   || atual?.quem_pegou   || '';
    const qGuardou = quem_guardou || atual?.quem_guardou || '';
    const fEnvio   = forma_envio  || atual?.forma_envio  || '';
    const qtdEnc   = qtd_encontrada !== undefined ? qtd_encontrada : (atual?.qtd_encontrada || 0);
    const obsVal   = obs !== undefined ? obs : (atual?.obs || '');
    await pool.query(
      `UPDATE avisos_repositor SET status=$1,obs=$2,qtd_encontrada=$3,repositor_nome=$4,hora_reposto=$5,quem_pegou=$6,quem_guardou=$7,forma_envio=$8,situacao=$9 WHERE id=$10`,
      [st, obsVal, qtdEnc, repositor_nome||qPegou||'', hora, qPegou, qGuardou, fEnvio, st, req.params.id]
    );
    // Marca item como encontrado quando abastecido
    if (['abastecido','reposto','encontrado'].includes(st)) {
      const av = await db.get('SELECT item_id FROM avisos_repositor WHERE id=$1',[req.params.id]);
      if (av) await pool.query(`UPDATE itens_pedido SET status='encontrado' WHERE id=$1`,[av.item_id]);
    }
    res.json({mensagem:'Aviso atualizado!'});
  } catch(e){res.status(500).json({erro:e.message});}
});


// Entrada manual de reposição por código de pedido (produto de fornecedor)
router.post('/repositor/entrada-manual', requerAuth, requerPerfil('supervisor','repositor'), async (req,res) => {
  const {codigo, descricao, quantidade, obs, repositor_nome, situacao} = req.body;
  const {data, hora} = dataHoraLocal();
  try {
    await pool.query(`ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS entrada_manual BOOLEAN DEFAULT false`).catch(()=>{});
    const result = await pool.query(
      `INSERT INTO avisos_repositor (item_id, pedido_id, numero_pedido, separador_nome, codigo, descricao, quantidade, obs, status, situacao, hora_aviso, data_aviso, repositor_nome, quem_pegou, entrada_manual)
       VALUES (0, 0, 'ENTRADA-MANUAL', 'Entrada Manual', $1, $2, $3, $4, $5, $5, $6, $7, $8, $8, true) RETURNING id`,
      [codigo||'', descricao||'', quantidade||1, obs||'', situacao||'abastecido', hora, data, repositor_nome||'']
    );
    res.json({id: result.rows[0].id, mensagem: 'Entrada registrada!'});
  } catch(e) { res.status(500).json({erro: e.message}); }
});

// Ranking de produtos mais solicitados
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

// ── CHECKOUT ──────────────────────────────────────────────────────────────────
router.get('/checkout', requerAuth, async (req,res) => {
  const {status,numero_caixa}=req.query;
  try {
    let sql=`SELECT c.*,p.status as ped_status,p.itens as ped_itens,p.numero_caixa as ped_caixa,p.cliente,p.transportadora,p.separador_id,s.nome as separador_nome_join FROM checkout c LEFT JOIN pedidos p ON c.pedido_id=p.id LEFT JOIN separadores s ON p.separador_id=s.id WHERE 1=1`;
    const pr=[];
    if (status){pr.push(status);sql+=` AND c.status=$${pr.length}`;}
    if (numero_caixa){pr.push(numero_caixa);sql+=` AND c.numero_caixa=$${pr.length}`;}
    res.json(await db.all(sql+' ORDER BY c.id DESC',pr));
  } catch(e){res.status(500).json({erro:e.message});}
});
router.get('/checkout/buscar', requerAuth, async (req,res) => {
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
router.put('/checkout/:id/concluir', requerAuth, async (req,res) => {
  const {hora_checkout,data_checkout}=req.body;
  const {data,hora}=dataHoraLocal();
  try {
    await pool.query(`UPDATE checkout SET status='concluido',hora_checkout=$1,data_checkout=$2 WHERE id=$3`,[hora_checkout||hora,data_checkout||data,req.params.id]);
    res.json({mensagem:'Checkout concluido!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

// ── KPIs / ESTATÍSTICAS ───────────────────────────────────────────────────────
router.get('/kpis', requerAuth, async (req,res) => {
  // Cache de 60 segundos para reduzir queries
  const cache = req.app.get('kpiCache');
  if (cache && cache.data && (Date.now() - cache.ts) < cache.ttl) {
    return res.json(cache.data);
  }
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
router.get('/produtividade', requerAuth, async (req,res) => {
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
router.get('/estatisticas/pedidos', requerAuth, async (req,res) => {
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
router.get('/estatisticas/repositor', requerAuth, async (req,res) => {
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
router.get('/estatisticas/checkout', requerAuth, async (req,res) => {
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
router.get('/timeline', requerAuth, async (req,res) => {
  const {data}=req.query; const {data:hoje}=dataHoraLocal();
  try {
    const rows=await db.all(`SELECT p.numero_pedido,p.cliente,p.transportadora,p.hora_pedido,p.status,p.itens,s.nome as separador_nome,p.data_pedido,p.aguardando_desde FROM pedidos p LEFT JOIN separadores s ON p.separador_id=s.id WHERE p.data_pedido=$1 ORDER BY p.hora_pedido ASC NULLS LAST`,[data||hoje]);
    res.json(rows.map(r=>({...r,aguardando_desde:formatarAguardandoDesde(r.aguardando_desde)})));
  } catch(e){res.status(500).json({erro:e.message});}
});

// ── IMPORTAR / DISTRIBUIÇÃO ───────────────────────────────────────────────────
router.post('/pedidos/importar', requerAuth, requerPerfil('supervisor'), async (req,res) => {
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
      const r=await pool.query(`INSERT INTO pedidos (numero_pedido,status,itens,rua,cliente,transportadora,aguardando_desde,pontuacao,data_pedido,hora_pedido,tem_prime) VALUES ($1,'pendente',$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(numero_pedido) DO NOTHING RETURNING id`,
        [numero,itens.length,itens[0]?.endereco||'',itens[0]?.cliente||'',itens[0]?.transportadora||'',itens[0]?.aguardando_desde||'',pts,hoje,hora,itens.some(i=>String(i.codigo||'').toUpperCase()==='PRIME')]);
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
router.post('/pedidos/distribuicao', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {separadores,quantidade,apenas_sem_sep,respeitar_hora}=req.body;
  if (!separadores?.length) return res.status(400).json({erro:'Informe os separadores!'});
  try {
    let w="p.status='pendente'";
    if (apenas_sem_sep!==false) w+=' AND p.separador_id IS NULL';
    const pedidos=await db.all(`SELECT p.* FROM pedidos p WHERE ${w} ORDER BY p.hora_pedido ASC,p.id ASC`);
    if (!pedidos.length) return res.json({plano:[],total_pedidos:0});

    // Calcula pontuacao de cada pedido
    for (const ped of pedidos) {
      const itens=await db.all('SELECT endereco,quantidade FROM itens_pedido WHERE pedido_id=$1',[ped.id]);
      ped._p=ped.pontuacao>0?ped.pontuacao:calcularPontuacaoPedido(itens);
      if (!ped.pontuacao) await pool.query('UPDATE pedidos SET pontuacao=$1 WHERE id=$2',[ped._p,ped.id]);
    }

    const lim=(quantidade>0)?quantidade:pedidos.length;
    const isDrive=p=>String(p.transportadora||'').toUpperCase().includes('DRIVE');
    const drive=pedidos.filter(isDrive).slice(0,lim);
    let outros=pedidos.filter(p=>!isDrive(p)).slice(0,Math.max(0,lim-drive.length));

    // Respeita horario se necessario (mais antigo primeiro)
    if (respeitar_hora!==false) {
      const gMin=p=>{const s=String(p.aguardando_desde||p.hora_pedido||'');const m=s.match(/(\d{2}:\d{2})/);return m?m[1]:s;};
      outros.sort((a,b)=>gMin(a).localeCompare(gMin(b)));
    }

    // DRAFT PURO: ordena todos por pontuacao DESC
    // Isso garante que o draft sempre alterna entre pedidos pesados e leves
    // e resulta na distribuicao mais equilibrada possivel
    const ordenados = [...drive, ...outros].sort((a,b)=>b._p-a._p);

    // Monta mapa de separadores
    const sepMap={};
    for (const sid of separadores) {
      let row=await db.get('SELECT s.id,s.nome FROM separadores s WHERE s.usuario_id=$1 LIMIT 1',[sid]);
      if (!row) row=await db.get('SELECT id,nome FROM usuarios WHERE id=$1',[sid]);
      if (row) sepMap[sid]=row;
    }

    // Draft: sempre da o proximo pedido para quem tem MENOS pontuacao acumulada
    // Isso e matematicamente otimo para minimizar a diferenca entre separadores
    const filas=separadores.map(sid=>({
      separador_id:sid,
      separador_nome:sepMap[sid]?.nome||`Sep ${sid}`,
      pedidos:[],
      pontuacao_total:0,
      sep_db_id:sepMap[sid]?.id||null
    }));

    for (const ped of ordenados) {
      filas.sort((a,b)=>a.pontuacao_total-b.pontuacao_total);
      filas[0].pedidos.push(ped.numero_pedido);
      filas[0].pontuacao_total+=ped._p;
    }

    res.json({
      plano:filas.map(f=>({
        separador_id:f.separador_id,
        sep_db_id:f.sep_db_id,
        separador_nome:f.separador_nome,
        pedidos:f.pedidos,
        pontuacao_total:Math.round(f.pontuacao_total)
      })),
      total_pedidos:pedidos.length
    });
  } catch(err){res.status(500).json({erro:err.message});}
});
router.post('/pedidos/distribuicao/confirmar', requerAuth, requerPerfil('supervisor'), async (req,res) => {
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
router.post('/pedidos/recalcular-pontuacao', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const peds=await db.all("SELECT id FROM pedidos WHERE pontuacao=0 OR pontuacao IS NULL");
    let at=0;
    for (const p of peds){const itens=await db.all('SELECT endereco,quantidade FROM itens_pedido WHERE pedido_id=$1',[p.id]);const pts=calcularPontuacaoPedido(itens);if(pts>0){await pool.query('UPDATE pedidos SET pontuacao=$1 WHERE id=$2',[pts,p.id]);at++;}}
    res.json({mensagem:`${at} pedidos recalculados`,atualizados:at});
  } catch(err){res.status(500).json({erro:err.message});}
});

// ── ENDPOINTS EXTRAS ──────────────────────────────────────────────────────────

// Checkout confirmar (alias de concluir)
router.put('/checkout/:id/confirmar', requerAuth, async (req,res) => {
  const {hora_checkout,data_checkout}=req.body;
  const {data,hora}=dataHoraLocal();
  try {
    await pool.query(`UPDATE checkout SET status='concluido',hora_checkout=$1,data_checkout=$2 WHERE id=$3`,
      [hora_checkout||hora, data_checkout||data, req.params.id]);
    res.json({mensagem:'Checkout concluido!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

// Liberar caixa do checkout
router.put('/checkout/:id/liberar', requerAuth, requerPerfil('supervisor'), async (req,res) => {
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
router.get('/checkout/caixa/:numero', requerAuth, async (req,res) => {
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
router.put('/pedidos/:id/separador', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {separador_id}=req.body;
  try {
    await pool.query('UPDATE pedidos SET separador_id=$1 WHERE id=$2',[separador_id||null,req.params.id]);
    res.json({mensagem:'Separador atribuido!'});
  } catch(e){res.status(500).json({erro:e.message});}
});

// Buscar produto no repositor por código
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
       WHERE i.codigo ILIKE $1
       ORDER BY p.id DESC LIMIT 20`,
      [`%${codigo}%`]
    );
    res.json(rows);
  } catch(e){res.status(500).json({erro:e.message});}
});

// Pedidos bloqueados por nao_encontrado/protocolo
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
router.put('/pedidos/:id/desbloquear', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    await pool.query(`UPDATE pedidos SET status='concluido' WHERE id=$1`,[req.params.id]);
    res.json({mensagem:'Pedido desbloqueado!'});
  } catch(e) { res.status(500).json({erro:e.message}); }
});

// Duplicatas geral — mesmo código com aviso pendente em mais de 1 pedido
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

// Duplicatas do dia
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

// Avisos para separador específico
router.get('/repositor/avisos/separador/:separador_id', requerAuth, async (req,res) => {
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

// Ao resolver aviso, acumula tempo aguardado no pedido
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
  } catch(e) { console.error('Erro ao acumular tempo:', e.message); }
}

router.put('/repositor/avisos/:id/reposto',       requerAuth, (req,res) => resolverAvisoEAcumularTempo(req,res,'reposto'));
router.put('/repositor/avisos/:id/encontrado',    requerAuth, (req,res) => resolverAvisoEAcumularTempo(req,res,'reposto'));
router.put('/repositor/avisos/:id/subiu',         requerAuth, (req,res) => resolverAvisoEAcumularTempo(req,res,'subiu'));
router.put('/repositor/avisos/:id/abastecido',    requerAuth, (req,res) => resolverAvisoEAcumularTempo(req,res,'abastecido'));
router.put('/repositor/avisos/:id/nao_encontrado',requerAuth, (req,res) => atualizarAviso(req,res,'nao_encontrado'));
router.put('/repositor/avisos/:id/protocolo',     requerAuth, (req,res) => atualizarAviso(req,res,'protocolo'));

// Alias retrocompatível — frontend antigo usava /importar
router.post('/importar', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  req.url = '/pedidos/importar';
  res.redirect(307, '/pedidos/importar');
});


// ── ZERAR DADOS (apenas supervisor) ──────────────────────────────────────────
router.post('/admin/zerar-dados', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const { confirmar } = req.body;
  if (confirmar !== 'ZERAR_TUDO_CONFIRMO') {
    return res.status(400).json({ erro: 'Confirmação inválida.' });
  }
  try {
    await pool.query('DELETE FROM avisos_repositor');
    await pool.query('DELETE FROM checkout');
    await pool.query('DELETE FROM itens_pedido');
    await pool.query('DELETE FROM pedidos');
    await pool.query('ALTER SEQUENCE pedidos_id_seq RESTART WITH 1').catch(()=>{});
    await pool.query('ALTER SEQUENCE itens_pedido_id_seq RESTART WITH 1').catch(()=>{});
    await pool.query('ALTER SEQUENCE avisos_repositor_id_seq RESTART WITH 1').catch(()=>{});
    await pool.query('ALTER SEQUENCE checkout_id_seq RESTART WITH 1').catch(()=>{});
    registrarAuditoria(req, 'zerar_dados', 'sistema', null, null, { acao: 'zerar_todos_pedidos' });
    console.log(`[ADMIN] Dados zerados por ${req.session.usuario.login}`);
    res.json({ mensagem: 'Todos os pedidos, itens, avisos e checkouts foram apagados com sucesso.' });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});


// Sincroniza forma_envio dos avisos existentes com transportadora dos pedidos
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
      RETURNING a.id
    `);
    res.json({ atualizados: result.rows.length, mensagem: `${result.rows.length} avisos atualizados com a transportadora do pedido.` });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});


// ── AUDITORIA ─────────────────────────────────────────────────────────────────
router.get('/auditoria', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const { data_ini, data_fim, usuario, acao, limit=100 } = req.query;
  try {
    let sql = `SELECT * FROM auditoria WHERE 1=1`;
    const p = [];
    if (data_ini) { p.push(data_ini); sql += ` AND data>=$${p.length}`; }
    if (data_fim) { p.push(data_fim); sql += ` AND data<=$${p.length}`; }
    if (usuario)  { p.push('%'+usuario+'%'); sql += ` AND LOWER(usuario_login) LIKE LOWER($${p.length})`; }
    if (acao)     { p.push(acao); sql += ` AND acao=$${p.length}`; }
    p.push(parseInt(limit)||100);
    sql += ` ORDER BY id DESC LIMIT $${p.length}`;
    res.json(await db.all(sql, p));
  } catch(e) { res.status(500).json({erro:e.message}); }
});

// ── RELATÓRIO DIÁRIO ──────────────────────────────────────────────────────────
router.get('/relatorio/diario', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {data} = req.query;
  const {data:hoje} = dataHoraLocal();
  const d = data || hoje;
  try {
    // Busca relatório salvo ou gera on-demand
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

async function gerarRelatorio(data) {
  try {
    const [pedidos, faltas, checkouts, seps] = await Promise.all([
      db.all(`SELECT p.*, s.nome as sep_nome FROM pedidos p LEFT JOIN separadores s ON p.separador_id=s.id WHERE p.data_pedido=$1`, [data]),
      db.all(`SELECT * FROM avisos_repositor WHERE data_aviso=$1`, [data]),
      db.all(`SELECT * FROM checkout WHERE data_checkout=$1`, [data]),
      db.all(`SELECT DISTINCT s.nome FROM separadores s INNER JOIN pedidos p ON p.separador_id=s.id WHERE p.data_pedido=$1`, [data]),
    ]);

    // Estatísticas por separador
    const porSep = {};
    pedidos.forEach(p => {
      if (!p.sep_nome) return;
      if (!porSep[p.sep_nome]) porSep[p.sep_nome] = { concluidos:0, pendentes:0, itens:0 };
      if (p.status==='concluido') porSep[p.sep_nome].concluidos++;
      else porSep[p.sep_nome].pendentes++;
      porSep[p.sep_nome].itens += p.itens||0;
    });

    const rel = {
      data,
      total_pedidos: pedidos.length,
      pedidos_concluidos: pedidos.filter(p=>p.status==='concluido').length,
      pedidos_pendentes: pedidos.filter(p=>p.status==='pendente').length,
      total_itens: pedidos.reduce((s,p)=>s+(p.itens||0),0),
      total_faltas: faltas.length,
      faltas_abastecidas: faltas.filter(f=>f.status==='abastecido').length,
      faltas_nao_encontradas: faltas.filter(f=>f.status==='nao_encontrado').length,
      total_checkouts: checkouts.filter(c=>c.status==='concluido').length,
      separadores_ativos: seps.length,
      dados_json: JSON.stringify({ porSep, faltas: faltas.slice(0,100), checkouts: checkouts.slice(0,50) }),
    };

    // Salva ou atualiza
    await pool.query(
      `INSERT INTO relatorios_diarios (data,total_pedidos,pedidos_concluidos,pedidos_pendentes,total_itens,total_faltas,faltas_abastecidas,faltas_nao_encontradas,total_checkouts,separadores_ativos,dados_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT(data) DO UPDATE SET
         total_pedidos=$2, pedidos_concluidos=$3, pedidos_pendentes=$4, total_itens=$5,
         total_faltas=$6, faltas_abastecidas=$7, faltas_nao_encontradas=$8,
         total_checkouts=$9, separadores_ativos=$10, dados_json=$11, gerado_em=NOW()`,
      [rel.data, rel.total_pedidos, rel.pedidos_concluidos, rel.pedidos_pendentes,
       rel.total_itens, rel.total_faltas, rel.faltas_abastecidas, rel.faltas_nao_encontradas,
       rel.total_checkouts, rel.separadores_ativos, rel.dados_json]
    );
    return rel;
  } catch(e) { console.error('Erro ao gerar relatório:', e.message); return null; }
}


// Migration tempo separacao
router.post('/admin/migration-tempo', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS iniciado_em TEXT DEFAULT ''");
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS concluido_em TEXT DEFAULT ''");
    res.json({mensagem:'Colunas criadas!'});
  } catch(e) { res.status(500).json({erro:e.message}); }
});

// Migration tempo justo
router.post('/admin/migration-tempo-justo', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS iniciado_em TEXT DEFAULT ''");
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS concluido_em TEXT DEFAULT ''");
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tempo_aguardando_min INTEGER DEFAULT 0");
    await pool.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS aguardando_repositor_desde TEXT DEFAULT ''");
    res.json({mensagem:'Colunas criadas!'});
  } catch(e) { res.status(500).json({erro:e.message}); }
});
module.exports = router;
