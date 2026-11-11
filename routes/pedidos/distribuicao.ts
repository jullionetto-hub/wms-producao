import express from 'express';
const router = express.Router();
import { db, pool } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';
import { dataHoraLocal } from '../../lib/helpers';
import { calcularPontuacaoPedido } from '../../lib/pontuacao';
import type { Linha } from '../../types/db';

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
      const itens=await db.all<Pick<Linha<'itens_pedido'>, 'endereco' | 'quantidade' | 'codigo'>>('SELECT endereco,quantidade,codigo FROM itens_pedido WHERE pedido_id=$1',[ped.id]);
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
    const isDrive=(p: any)=>String(p.transportadora||'').toUpperCase().includes('DRIVE');
    // DRIVE THRU tem prioridade; os demais mantêm a ordem da query (aguardando_desde ASC = mais antigo primeiro)
    const drive=pedidos.filter(isDrive).slice(0,lim);
    const outros=pedidos.filter(p=>!isDrive(p)).slice(0,Math.max(0,lim-drive.length));
    // MANTÉM ordem cronológica: Drive primeiro, depois demais por data de chegada (Maio antes de Junho).
    // O balanceamento por pontuação ocorre na escolha do separador (filas.sort abaixo), não aqui.
    const ordenados = [...drive, ...outros];
    const sepMap: Record<string, any>={};
    for (const sid of separadores) {
      // Busca separadores.id vinculado ao usuario; guarda também o usuarios.id para fallback de nome
      const sepRow = await db.get<Pick<Linha<'separadores'>, 'id' | 'nome'>>('SELECT s.id,s.nome FROM separadores s WHERE s.usuario_id=$1 LIMIT 1',[sid]);
      const userRow = await db.get<Pick<Linha<'usuarios'>, 'id' | 'nome' | 'login' | 'turno'>>('SELECT id,nome,login,turno FROM usuarios WHERE id=$1',[sid]);
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
      let cargaAtual = { pontuacao: 0, itens: 0, pedidos: 0 };
      if (dbId) {
        const ja = await db.get(
          `SELECT COALESCE(SUM(COALESCE(p.pontuacao,0)),0) AS pts,
                  COALESCE(SUM(COALESCE(p.itens,0)),0) AS itens,
                  COUNT(*) AS qtd
           FROM pedidos p
           WHERE p.separador_id = $1
             AND p.status IN ('pendente','separando')`, [dbId]);
        if (ja) { cargaAtual.pontuacao = parseFloat(ja.pts)||0; cargaAtual.itens = parseInt(ja.itens)||0; cargaAtual.pedidos = parseInt(ja.qtd)||0; }
      }
      filas.push({
        separador_id: sid,
        separador_nome: sepMap[sid]?.nome || `Sep ${sid}`,
        pedidos: [] as any[],
        pontuacao_total: cargaAtual.pontuacao,   // começa com o que já tem
        itens_total:     cargaAtual.itens,
        pedidos_total:   cargaAtual.pedidos,     // quantidade de pedidos (independente de pontuação/itens)
        pontuacao_ja:    cargaAtual.pontuacao,    // guarda para mostrar no resultado
        itens_ja:        cargaAtual.itens,
        pedidos_ja:      cargaAtual.pedidos,
        sep_db_id: dbId,
      });
    }
    // Pré-calcula os totais a distribuir para normalização estável
    const totalPtsLote  = ordenados.reduce((s,p)=>s+p._p,0) || 1;
    const totalItensLote= ordenados.reduce((s,p)=>s+(p.itens||0),0) || 1;
    const n = filas.length || 1;
    // Carga alvo por separador (carga já existente + lote atual dividido igualmente)
    const alvoPts    = (filas.reduce((s,f)=>s+f.pontuacao_ja,0) + totalPtsLote)   / n;
    const alvoItens  = (filas.reduce((s,f)=>s+f.itens_ja,0)     + totalItensLote) / n;
    // Meta de QUANTIDADE de pedidos por separador (ex: mínimo de 65/dia) — pesa
    // junto com pontuação/itens pra ninguém ficar "na frente" só por ter pego
    // pedido fácil: só conta como adiantado quem tá na frente nos três eixos.
    const alvoPedidos = (filas.reduce((s,f)=>s+f.pedidos_ja,0) + ordenados.length) / n;

    if (modoDist === 'por_itens') {
      // LPT por volume: quem tem menos itens recebe o próximo pedido
      for (const ped of ordenados) {
        filas.sort((a,b) => a.itens_total - b.itens_total);
        filas[0].pedidos.push(ped.numero_pedido);
        filas[0].pontuacao_total += ped._p;
        filas[0].itens_total += (ped.itens || 0);
        filas[0].pedidos_total += 1;
      }
    } else {
      // 'balanceado' e 'complexidade': LPT com score normalizado (pontuação + itens + qtd. de pedidos)
      for (const ped of ordenados) {
        filas.sort((a,b) => {
          const sA = (a.pontuacao_total / alvoPts) + (a.itens_total / alvoItens) + (a.pedidos_total / alvoPedidos);
          const sB = (b.pontuacao_total / alvoPts) + (b.itens_total / alvoItens) + (b.pedidos_total / alvoPedidos);
          return sA - sB;
        });
        filas[0].pedidos.push(ped.numero_pedido);
        filas[0].pontuacao_total += ped._p;
        filas[0].itens_total += (ped.itens || 0);
        filas[0].pedidos_total += 1;
      }
    }
    res.json({cenario:modoDist,plano:filas.map(f=>({separador_id:f.separador_id,sep_db_id:f.sep_db_id,separador_nome:f.separador_nome,pedidos:f.pedidos,pontuacao_total:Math.round(f.pontuacao_total),itens_total:f.itens_total,pedidos_total:f.pedidos_total,pontuacao_ja:Math.round(f.pontuacao_ja||0),itens_ja:f.itens_ja||0,pedidos_ja:f.pedidos_ja||0})),total_pedidos:pedidos.length,total_distribuidos:ordenados.length});
  } catch(err){res.status(500).json({erro:err.message});}
});

// Distribuição entre turnos: divide pedidos pendentes entre os 3 turnos de forma equilibrada,
// proporcional ao número de separadores de cada turno.
router.post('/pedidos/distribuicao-turnos', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const {turnos, cenario, apenas_sem_sep, quantidade} = req.body;
  // turnos = [{nome:'Manhã', separadores:5}, {nome:'Tarde', separadores:4}, {nome:'Noite', separadores:3}]
  if (!turnos?.length || turnos.some((t: any) => !(t.separadores > 0))) {
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
      const itens = await db.all<Pick<Linha<'itens_pedido'>, 'endereco' | 'quantidade' | 'codigo'>>('SELECT endereco,quantidade,codigo FROM itens_pedido WHERE pedido_id=$1', [ped.id]);
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
    const isDrive = (p: any) => String(p.transportadora||'').toUpperCase().includes('DRIVE');
    const drive  = pedidos.filter(isDrive).slice(0, lim);
    const outros = pedidos.filter(p => !isDrive(p)).slice(0, Math.max(0, lim - drive.length));
    const ordenados = [...drive, ...outros];

    // LPT proporcional: balanceia (score / sep_count) entre turnos
    // Assim, turno com mais separadores recebe mais pedidos proporcionalmente.
    const buckets = turnos.map((t: any) => ({
      nome: t.nome,
      separadores: t.separadores,
      pedidos: [] as any[],
      pontuacao_total: 0,
      itens_total: 0,
      ruas_total: 0,
      skus_total: 0,
    }));

    for (const ped of ordenados) {
      // Métrica de carga por separador em cada turno
      buckets.sort((a: any, b: any) => {
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

    const totalDist = buckets.reduce((s: any, b: any) => s + b.pedidos.length, 0);
    res.json({
      cenario: modoDist,
      plano: buckets.map((b: any) => ({
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
        if (r.rowCount! > 0) marcados++;
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
      const porUsuario = await db.get<Pick<Linha<'separadores'>, 'id'>>('SELECT id FROM separadores WHERE usuario_id=$1 LIMIT 1',[item.separador_id]);
      if (porUsuario) {
        dbId = porUsuario.id;
      } else {
        // 2. Tenta sep_db_id como separadores.id direto (separadores antigos sem usuario_id)
        if (item.sep_db_id) {
          const direto = await db.get<Pick<Linha<'separadores'>, 'id'>>('SELECT id FROM separadores WHERE id=$1 LIMIT 1',[item.sep_db_id]);
          if (direto) dbId = direto.id;
        }
        // 3. Colaborador não tem registro em separadores (checkout/embalagem/repositor):
        //    cria automaticamente para poder receber pedidos
        if (!dbId) {
          const user = await db.get<Pick<Linha<'usuarios'>, 'nome' | 'login' | 'turno'>>('SELECT nome, login, turno FROM usuarios WHERE id=$1',[item.separador_id]);
          if (user) {
            // Tenta encontrar por nome OU matrícula antes de criar
            const porNome = await db.get<Pick<Linha<'separadores'>, 'id'>>(
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
                  await db.get<Pick<Linha<'separadores'>, 'id'>>('SELECT id FROM separadores WHERE usuario_id=$1 LIMIT 1',[item.separador_id]) ||
                  await db.get<Pick<Linha<'separadores'>, 'id'>>('SELECT id FROM separadores WHERE LOWER(TRIM(matricula))=LOWER(TRIM($1)) LIMIT 1',[user.login]);
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
          if(r.rowCount!>0) dist++;
        }
      }
    }
    res.json({mensagem:'Distribuição confirmada!',distribuidos:dist});
  } catch(err){res.status(500).json({erro:err.message});}
});

module.exports = router;
