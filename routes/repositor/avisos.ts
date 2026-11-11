import express from 'express';
const router = express.Router();
import { db, pool } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';
import { dataHoraLocal, validarId, normalizarTurno } from '../../lib/helpers';
import type { Linha } from '../../types/db';
import { sincronizarCheckoutPendente } from './_comum';

// Garante colunas novas (roda uma vez na inicialização)
pool.query(`ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS historico        JSONB   DEFAULT '[]'::jsonb`).catch(()=>{});
pool.query(`ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS tentativas       JSONB   DEFAULT '[]'::jsonb`).catch(()=>{});
pool.query(`ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS total_tentativas INTEGER DEFAULT 0`).catch(()=>{});
pool.query(`ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS hora_inicio_busca TEXT  DEFAULT ''`).catch(()=>{});
pool.query(`ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS hora_protocolo    TEXT  DEFAULT ''`).catch(()=>{});
pool.query(`ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS data_fechamento   TEXT  DEFAULT ''`).catch(()=>{});
pool.query(`ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS hora_fechamento   TEXT  DEFAULT ''`).catch(()=>{});
pool.query(`ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS turno_pendente    TEXT  DEFAULT ''`).catch(()=>{});
pool.query(`ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS ordem_manual      INTEGER DEFAULT 0`).catch(()=>{});

router.get('/repositor/avisos', requerAuth, async (req,res) => {
  if (!req.session?.usuario) return res.json([]);
  const {status, data, data_ini, data_fim, codigo} = req.query as Record<string, string>;
  const usuario = req.session.usuario;
  const perfil  = usuario.perfil || '';
  const meuTurno = normalizarTurno(usuario.turno);

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
      // Para repositores (não supervisores) filtrando itens pendentes/verificando:
      // só mostra itens cujo turno_pendente bate com o turno do repositor,
      // OU itens sem turno_pendente (0 tentativas = qualquer turno),
      // OU itens que este próprio repositor está verificando agora
      const temPendente = list.includes('pendente') || list.includes('verificando');
      if (temPendente && perfil === 'repositor' && meuTurno) {
        if (list.length === 1) { params.push(list[0]); sql+=` AND a.status=$${params.length}`; }
        else { const ph=list.map((_,i)=>`$${params.length+i+1}`).join(','); params.push(...list); sql+=` AND a.status IN (${ph})`; }
        // Filtro de turno: mostra se sem turno_pendente (1ª tentativa) OU turno_pendente = meu turno
        // OU estou verificando este item agora (quem_pegou = eu)
        params.push(meuTurno);
        params.push(usuario.nome || '');
        sql += ` AND (
          COALESCE(a.turno_pendente,'') = ''
          OR a.turno_pendente = $${params.length-1}
          OR (a.status = 'verificando' AND a.quem_pegou = $${params.length})
        )`;
      } else {
        if (list.length === 1) { params.push(list[0]); sql+=` AND a.status=$${params.length}`; }
        else if (list.length > 1) { const ph=list.map((_,i)=>`$${params.length+i+1}`).join(','); params.push(...list); sql+=` AND a.status IN (${ph})`; }
      }
    } else if (status) {
      const list = status.split(',').map(s=>s.trim()).filter(Boolean);
      if (list.length === 1) { params.push(list[0]); sql+=` AND a.status=$${params.length}`; }
      else if (list.length > 1) { const ph=list.map((_,i)=>`$${params.length+i+1}`).join(','); params.push(...list); sql+=` AND a.status IN (${ph})`; }
    }
    if (data){params.push(data);sql+=` AND a.data_aviso=$${params.length}`;}
    if (data_ini){params.push(data_ini);sql+=` AND a.data_aviso>=$${params.length}`;}
    if (data_fim){params.push(data_fim);sql+=` AND a.data_aviso<=$${params.length}`;}
    if (codigo){params.push('%'+codigo+'%');sql+=` AND UPPER(a.codigo) LIKE UPPER($${params.length})`;}
    // Itens já reordenados manualmente (ordem_manual>0) vêm primeiro, na ordem definida
    // pelo repositor; os demais mantêm o critério padrão (drive-thru primeiro, mais novo primeiro).
    const rows = await db.all(sql+` ORDER BY
      CASE WHEN a.ordem_manual > 0 THEN 0 ELSE 1 END ASC,
      a.ordem_manual ASC,
      prioridade ASC,
      a.id DESC`, params);
    res.json(rows.map(r=>({...r, forma_envio: r.forma_envio_real||r.forma_envio||''})));
  } catch(e){res.status(500).json({erro:e.message});}
});

// Contadores das abas (badges e cartões do topo): contagem por status, sem trazer
// a tabela inteira. Aplica o mesmo filtro de turno da lista pro repositor, pra o
// número bater com o que ele vê.
router.get('/repositor/avisos/contagem', requerAuth, async (req,res) => {
  if (!req.session?.usuario) return res.json({ por_status: {} });
  const { data_ini, data_fim } = req.query as Record<string, string>;
  const usuario = req.session.usuario;
  const meuTurno = normalizarTurno(usuario.turno);
  try {
    const params = [];
    let sql = `SELECT a.status, COUNT(*)::int AS n FROM avisos_repositor a WHERE 1=1`;
    if (data_ini) { params.push(data_ini); sql += ` AND a.data_aviso>=$${params.length}`; }
    if (data_fim) { params.push(data_fim); sql += ` AND a.data_aviso<=$${params.length}`; }
    if (usuario.perfil === 'repositor' && meuTurno) {
      params.push(meuTurno); params.push(usuario.nome || '');
      sql += ` AND (a.status NOT IN ('pendente','verificando')
                 OR COALESCE(a.turno_pendente,'') = ''
                 OR a.turno_pendente = $${params.length-1}
                 OR (a.status = 'verificando' AND a.quem_pegou = $${params.length}))`;
    }
    sql += ` GROUP BY a.status`;
    const rows = await db.all(sql, params);
    const por_status: Record<string, any> = {};
    rows.forEach(r => { por_status[r.status || ''] = Number(r.n) || 0; });
    res.json({ por_status });
  } catch(e){res.status(500).json({erro:e.message});}
});

// Salva a ordem manual (drag-and-drop) definida pelo repositor na aba Separar —
// compartilhada: todo repositor que olhar a fila vê a mesma sequência.
router.put('/repositor/avisos/reordenar', requerAuth, async (req,res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({erro:'Informe a lista de ids na nova ordem!'});
  try {
    for (let i = 0; i < ids.length; i++) {
      const id = validarId(ids[i]);
      if (!id) continue;
      await pool.query('UPDATE avisos_repositor SET ordem_manual=$1 WHERE id=$2', [i + 1, id]);
    }
    res.json({ mensagem: 'Ordem atualizada!', atualizados: ids.length });
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.put('/repositor/avisos/:id', requerAuth, async (req,res) => {
  const id = validarId(req.params.id);
  if (!id) return res.status(400).json({erro:'ID invalido'});
  const {status,obs,qtd_encontrada,repositor_nome,quem_pegou,quem_guardou,forma_envio,situacao}=req.body;
  const {hora}=dataHoraLocal();
  const usuario = req.session?.usuario?.nome || repositor_nome || 'Sistema';
  try {
    const st = situacao || status || 'pendente';
    const atual = await db.get<Linha<'avisos_repositor'>>('SELECT * FROM avisos_repositor WHERE id=$1',[id]);
    // Impede reverter um item já finalizado (protocolo/abastecido) para etapa anterior
    const estadosFinais = ['abastecido','protocolo','protocolado','devolucao'];
    const estadosNaoFinal = ['pendente','verificando','buscado','separado','aguardando_abastecer','subiu'];
    if (estadosFinais.includes(atual?.status as string) && estadosNaoFinal.includes(st)) {
      return res.status(409).json({erro:`Item já está em estado final: ${atual!.status}. Não pode ser revertido.`});
    }
    const qPegou   = quem_pegou   || atual?.quem_pegou   || '';
    const qGuardou = quem_guardou || atual?.quem_guardou || '';
    const fEnvio   = forma_envio  || atual?.forma_envio  || '';
    const qtdEnc   = qtd_encontrada !== undefined ? qtd_encontrada : (atual?.qtd_encontrada || 0);
    const obsVal   = obs !== undefined ? obs : (atual?.obs || '');

    // ── Lógica de tentativas ────────────────────────────────────────────
    let tentativas = [];
    try { tentativas = Array.isArray(atual?.tentativas) ? atual.tentativas : (atual?.tentativas ? JSON.parse(atual.tentativas) : []); } catch{}
    const totalTent    = atual?.total_tentativas || 0;
    let hora_protocolo = atual?.hora_protocolo   || '';

    // Se estamos saindo de 'verificando' → fecha a tentativa aberta
    if (atual?.status === 'verificando' && tentativas.length > 0) {
      const ultima = tentativas[tentativas.length - 1];
      if (!ultima.hora_fim) {
        ultima.hora_fim  = hora;
        // encontrado se o status destino é qualquer estado de "achou"
        ultima.resultado = ['buscado','separado','abastecido','reposto','encontrado'].includes(st)
          ? 'encontrado' : 'nao_encontrado';
      }
    }

    // Para nao_encontrado vindo de verificando: máximo 3 tentativas totais
    const MAX_TENTATIVAS = 3;
    let stFinal = st;
    let turno_pendente = '';
    if (st === 'nao_encontrado' && atual?.status === 'verificando') {
      const falhas = tentativas.filter((t: any) => t.resultado === 'nao_encontrado').length;
      if (falhas >= MAX_TENTATIVAS) {
        // 3 falhas → Liberação
        stFinal = 'nao_encontrado';
        hora_protocolo = hora;
      } else {
        // Ainda tem tentativas — volta para a fila (qualquer turno)
        stFinal = 'pendente';
      }
    }

    // Registra histórico por etapa (só loga se o status mudou)
    let histAtual = [];
    try { histAtual = Array.isArray(atual?.historico) ? atual.historico : (atual?.historico ? JSON.parse(atual.historico) : []); } catch{}
    const histNovo = (stFinal !== (atual?.status||'pendente'))
      ? [...histAtual, { usuario, acao: stFinal, hora }]
      : histAtual;

    const upd = await pool.query(
      `UPDATE avisos_repositor
         SET status=$1, obs=$2, qtd_encontrada=$3, repositor_nome=$4, hora_reposto=$5,
             quem_pegou=$6, quem_guardou=$7, forma_envio=$8, situacao=$9,
             historico=$10, tentativas=$11, hora_protocolo=$12, turno_pendente=$13
       WHERE id=$14`,
      [stFinal, obsVal, qtdEnc, repositor_nome||qPegou||'', hora,
       qPegou, qGuardou, fEnvio, stFinal,
       JSON.stringify(histNovo), JSON.stringify(tentativas), hora_protocolo, turno_pendente, id]
    );
    if (upd.rowCount === 0) return res.status(404).json({erro:'Aviso não encontrado'});
    if (['abastecido','reposto','encontrado'].includes(stFinal)) {
      const av = await db.get<Pick<Linha<'avisos_repositor'>, 'item_id'>>('SELECT item_id FROM avisos_repositor WHERE id=$1',[id]);
      if (av) await pool.query(`UPDATE itens_pedido SET status='encontrado' WHERE id=$1`,[av.item_id]);
    }
    const io = req.app.get('io');
    io?.emit('aviso:atualizado', { id, status: stFinal, numero_pedido: atual?.numero_pedido });
    if (stFinal === 'nao_encontrado') io?.emit('liberacao:novo', { id });
    await sincronizarCheckoutPendente(atual?.pedido_id, io).catch(e => console.warn('sync checkout pendente:', e.message));
    res.json({ mensagem: 'Aviso atualizado!', stFinal });
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

module.exports = router;
