import express from 'express';
const router = express.Router();
import { db, pool } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';
import { dataHoraLocal, formatarAguardandoDesde } from '../../lib/helpers';
import { calcularPrioridade } from '../../lib/prioridade';
import type { Linha } from '../../types/db';

// Prioridade só faz sentido pra pedido ainda não concluído (aguardando
// alguma etapa) — pedido concluído não carrega selo de prioridade.
function _comPrioridade(r: any) {
  const aguardando_desde = formatarAguardandoDesde(r.aguardando_desde);
  const prioridade = (r.status === 'pendente' || r.status === 'separando')
    ? calcularPrioridade(aguardando_desde)
    : null;
  return { ...r, aguardando_desde, prioridade };
}

router.get('/pedidos', requerAuth, async (req,res) => {
  const {separador_id,status,data,data_ini,data_fim,aguardando_ini,aguardando_fim,numero_pedido,page,pageSize}=req.query as Record<string, string>;
  try {
    // total_itens sobrescreve p.total_itens com o valor calculado da tabela itens_pedido
    // (fallback para pedidos antigos onde total_itens pode ser NULL ou 0)
    // sep_turno: turno_distribuicao (definido ao distribuir) tem prioridade; se o pedido já
    // tem separador mas não passou por distribuição com turno, cai no turno do separador.
    // SEM default pra 'Manha' — pedido ainda não distribuído (sem separador) fica com
    // sep_turno NULL, pra não ser contado como se já tivesse ido pro turno da manhã.
    let q=`SELECT p.*, COALESCE(NULLIF(p.total_itens,0),(SELECT COALESCE(SUM(ip.quantidade),p.itens) FROM itens_pedido ip WHERE ip.pedido_id=p.id),p.itens) AS total_itens, s.nome as separador_nome,COALESCE(p.turno_distribuicao,s.turno) as sep_turno, EXISTS(SELECT 1 FROM checkout c WHERE c.pedido_id=p.id AND c.status='concluido') AS checkout_concluido FROM pedidos p LEFT JOIN separadores s ON p.separador_id=s.id WHERE 1=1`;
    const p=[];
    const add=(c: any,v: any)=>{p.push(v);q+=` AND ${c}$${p.length}`;};
    if (separador_id)  add('p.separador_id=',separador_id);
    if (status)        add('p.status=',status);
    // Data efetiva de trabalho (usada pelo Dashboard e afins, não pelo filtro De/Até de
    // Pedidos — ver aguardando_ini/fim abaixo). iniciado_em só é gravado UMA VEZ (não
    // atualiza quando um separador retoma um pedido pausado/antigo — ver /pedidos/bipar),
    // então um pedido ainda ATIVO (pendente/separando) sempre conta como relevante a HOJE,
    // independente de quando começou — senão trabalho em andamento (ex.: retomando pedido
    // de dias atrás) sumia do Dashboard/Diário de Bordo de hoje. Pra datas passadas, o
    // pedido ativo continua contando na data em que começou (histórico preservado). Pedido
    // CONCLUÍDO sempre usa a data real de conclusão (concluido_em, sempre atualizado).
    if (data || data_ini || data_fim) {
      const dIni = data_ini || data || null;
      const dFim = data_fim || data || null;
      const hoje = dataHoraLocal().data;
      const WORK_DATE = `COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido)`;
      p.push(hoje); const hoje$ = p.length;
      let iniConc='', fimConc='', iniWork='', fimWork='', iniHoje='', fimHoje='';
      if (dIni) { p.push(dIni); const i=p.length; iniConc=` AND LEFT(p.concluido_em,10) >= $${i}`; iniWork=` AND ${WORK_DATE} >= $${i}`; iniHoje=` AND $${hoje$} >= $${i}`; }
      if (dFim) { p.push(dFim); const f=p.length; fimConc=` AND LEFT(p.concluido_em,10) <= $${f}`; fimWork=` AND ${WORK_DATE} <= $${f}`; fimHoje=` AND $${hoje$} <= $${f}`; }
      q += ` AND (
        (p.status='concluido' AND NULLIF(p.concluido_em,'') IS NOT NULL${iniConc}${fimConc})
        OR (p.status != 'concluido'${iniWork}${fimWork})
        OR (p.status != 'concluido'${iniHoje}${fimHoje})
      )`;
    }
    // Filtro De/Até da tela de Pedidos: usa a DATA de aguardando_desde (quando o pedido
    // passou a esperar separação), não a data de trabalho — o supervisor quer selecionar
    // "12/08" e ver os pedidos que estão aguardando desde aquele dia, mesmo que só estejam
    // sendo trabalhados hoje. aguardando_desde é texto 'DD/MM/YYYY HH:MM'; pedidos sem esse
    // campo preenchido corretamente ficam de fora do filtro por data (correto, já que não
    // têm "aguardando desde" pra comparar). Parâmetro separado de data_ini/data_fim porque
    // outras telas (Dashboard etc.) usam esses dois pra data de trabalho.
    if (aguardando_ini || aguardando_fim) {
      const AGUARDANDO_DATA = `(CASE WHEN p.aguardando_desde ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}' THEN TO_TIMESTAMP(p.aguardando_desde,'DD/MM/YYYY HH24:MI')::DATE END)`;
      if (aguardando_ini) { p.push(aguardando_ini); q+=` AND ${AGUARDANDO_DATA} >= $${p.length}::DATE`; }
      if (aguardando_fim) { p.push(aguardando_fim); q+=` AND ${AGUARDANDO_DATA} <= $${p.length}::DATE`; }
    }
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
      return res.json({ total, pagina:pg, totalPaginas:Math.ceil(total/size), dados:rows.map(_comPrioridade) });
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
      const primeiroAviso = await db.get<Pick<Linha<'avisos_repositor'>, 'hora_aviso' | 'data_aviso'>>(
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

    res.json(rows.map(_comPrioridade));
  } catch(e){res.status(500).json({erro:e.message});}
});

/* ── Ritmo real de separação (pontos/min) por faixa de dificuldade × concentração
   Alimenta a estimativa de tempo (⏱) com dados reais em vez de números
   fixos "no chute". Usa PONTUAÇÃO como driver (não itens crus) porque ela já
   pondera rua/dificuldade + custo fixo de deslocamento por endereço único
   (lib/pontuacao.js). Além disso, segmenta também por CONCENTRAÇÃO (itens
   totais ÷ nº de SKUs do pedido): um pedido com muitos itens em poucos SKUs
   (ex.: 200 itens em só 2 SKUs) é pego muito mais rápido por item do que um
   pedido com a mesma dificuldade mas itens espalhados em muitos SKUs — a
   pontuação sozinha não capturava esse efeito porque o custo fixo de
   deslocamento (+20/endereço) fica diluído quando a quantidade por SKU é
   grande. Calcula a partir dos pedidos já concluídos, descontando tempo de
   espera de repositor. Cacheado em memória — a query varre todo o histórico
   de pedidos concluídos, não vale recalcular a cada requisição. */
let _ritmoCache: { data: any; calculadoEm: number } = { data: null, calculadoEm: 0 };
const RITMO_CACHE_MS      = 30 * 60 * 1000; // 30 min
const RITMO_MIN_AMOSTRAS  = 20; // abaixo disso, o front usa o fallback fixo
const RITMO_CONC_LIMIAR   = 8;  // itens/SKU a partir daqui = concentração "alta"

async function _computarRitmo() {
  const rows = await db.all(`
    SELECT
      (CASE
        WHEN total_itens <= 0 THEN 'facil'
        WHEN pontuacao / total_itens <= 1.2 THEN 'facil'
        WHEN pontuacao / total_itens <= 1.7 THEN 'medio'
        ELSE 'dificil'
      END) || '_' || (
        CASE WHEN total_itens / GREATEST(1, itens_skus) >= ${RITMO_CONC_LIMIAR} THEN 'alta' ELSE 'baixa' END
      ) AS bucket,
      COUNT(*) AS amostras,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pontuacao / duracao_min) AS ritmo
    FROM (
      SELECT
        COALESCE(NULLIF(p.total_itens,0), p.itens, 0)::float AS total_itens,
        COALESCE(p.pontuacao,0)::float AS pontuacao,
        COALESCE(NULLIF(p.itens,0), 1)::float AS itens_skus,
        GREATEST(0.5, EXTRACT(EPOCH FROM (
          COALESCE(NULLIF(p.skus_concluido_em,''), NULLIF(p.concluido_em,''))::timestamp
          - p.iniciado_em::timestamp
        )) / 60.0 - COALESCE(p.tempo_aguardando_min,0)) AS duracao_min
      FROM pedidos p
      WHERE p.status = 'concluido'
        AND NULLIF(p.iniciado_em,'') IS NOT NULL
        AND NULLIF(COALESCE(NULLIF(p.skus_concluido_em,''), NULLIF(p.concluido_em,'')),'') IS NOT NULL
    ) sub
    WHERE total_itens > 0 AND pontuacao > 0 AND duracao_min BETWEEN 0.5 AND 180
    GROUP BY 1
  `);
  const buckets: Record<string, any> = {};
  for (const r of rows) {
    const amostras = parseInt(r.amostras) || 0;
    buckets[r.bucket] = {
      ritmo: amostras >= RITMO_MIN_AMOSTRAS ? Math.round(parseFloat(r.ritmo) * 100) / 100 : null,
      amostras,
    };
  }
  return { buckets, min_amostras: RITMO_MIN_AMOSTRAS, calculado_em: new Date().toISOString() };
}

router.get('/pedidos/ritmo-estimativa', requerAuth, async (req, res) => {
  try {
    const agora = Date.now();
    if (_ritmoCache.data && (agora - _ritmoCache.calculadoEm) < RITMO_CACHE_MS) {
      return res.json(_ritmoCache.data);
    }
    const resultado = await _computarRitmo();
    _ritmoCache = { data: resultado, calculadoEm: agora };
    res.json(resultado);
  } catch(e) { res.status(500).json({erro:e.message}); }
});

// Força recálculo imediato, ignorando o cache de 30min — usado pelo botão
// "Recalcular tempo estimado" na tela de Pedidos, pra refletir na hora os
// pedidos concluídos mais recentes em vez de esperar o cache expirar.
router.post('/pedidos/ritmo-estimativa/recalcular', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    const resultado = await _computarRitmo();
    _ritmoCache = { data: resultado, calculadoEm: Date.now() };
    res.json(resultado);
  } catch(e) { res.status(500).json({erro:e.message}); }
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
    const row=await db.get<Pick<Linha<'pedidos'>, 'numero_pedido' | 'cliente' | 'transportadora' | 'numero_caixa'>>('SELECT numero_pedido,cliente,transportadora,numero_caixa FROM pedidos WHERE numero_pedido=$1',[req.params.numero_pedido]);
    if (!row) return res.status(404).json({erro:'Pedido não encontrado'});
    res.json({cliente:row.cliente||'',transportadora:row.transportadora||'',numero_caixa:row.numero_caixa||''});
  } catch(e){res.status(500).json({erro:e.message});}
});

module.exports = router;
