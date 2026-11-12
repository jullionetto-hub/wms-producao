import express from 'express';
const router = express.Router();
import { db, pool } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';
import { calcularPontuacaoPedido } from '../../lib/pontuacao';
import type { Linha } from '../../types/db';

const GeometriaEstoque = require('../../public/js/geometria-estoque.js');

/* ══════════════════════════════════════════
   SEPARAÇÃO POR LOTE — formação automática
   Agrupa pedidos pendentes por proximidade de rua (mesma ROTA_FISICA usada no
   celular do separador, em public/js/separador.js), sempre até 4 por lote —
   sem limite de tempo de espera (a fila de trabalho normalmente é de dias
   atrás, não do turno atual, então um corte por minutos de espera não faz
   sentido aqui). Cada lote inteiro é atribuído ao separador mais atrasado na
   mesma fórmula de 3 eixos (pontuação+itens+qtd. de pedidos) usada em
   /pedidos/distribuicao. Drive Thru fica sempre de fora (distribuído
   individual); Prime também fica de fora, a menos que apenas_prime=true seja
   passado (mesmo alterna-entre-só-Prime-ou-só-normal do /pedidos/distribuicao).
══════════════════════════════════════════ */
// Máximo de pedidos por lote (formação automática E lote manual) — lote de 8
// ficou difícil de separar no celular. Validado também em /lote/formar/confirmar.
const TAMANHO_LOTE = 4;
const ROTA_FISICA_LOTE = ['A','B','C','D','E','Q','P','O','N','M','L','K','J','I','H','ARARA','G','F','ZA','R','S','T','U','V','W','X','Y','Z'];
function _ruaPrincipalLote(endereco: any) {
  const end = String(endereco||'').split(',')[0].trim().toUpperCase();
  const semVert = end.includes('/') ? end.split('/')[0].trim() : end;
  if (semVert.startsWith('ZA')) return 'ZA';
  if (semVert.includes('ARARA')) return 'ARARA';
  const m = semVert.match(/^([A-Z]+)/);
  return m ? m[1] : '';
}
function _rotaIdxLote(rua: any) {
  const i = ROTA_FISICA_LOTE.indexOf(rua);
  return i === -1 ? 999 : i;
}
// Distância física real (não a posição na rota de caminhada) — usada só pra decidir
// QUAIS pedidos cabem no mesmo lote. Modelo (corredor "fundo" reto + ramal "frente"
// perpendicular na altura de Q) e peso de dificuldade por rua agora vêm de
// public/js/geometria-estoque.js — fonte única compartilhada com o Mapa do Estoque
// (public/js/dashboard.js), consolidada na V2 da evolução do WMS (antes cada um
// mantinha sua própria cópia manual dos mesmos valores).
function _distanciaRuas(a: any, b: any) { return GeometriaEstoque.distanciaRuas(a, b); }
function _pesoRua(rua: any) { return GeometriaEstoque.pesoDificuldadeRua(rua); }
// Maior distância PONDERADA entre qualquer par de ruas de uma lista — o
// "diâmetro" da área que o separador precisa cobrir, pesado pela dificuldade
// média das duas pontas (uma rua difícil conta mais que a mesma distância
// entre ruas fáceis).
function _diametroRuas(ruas: any) {
  let max = 0;
  for (let i = 0; i < ruas.length; i++) {
    for (let j = i+1; j < ruas.length; j++) {
      const d = _distanciaRuas(ruas[i], ruas[j]);
      // 999 é a sentinela de "rua fora do mapa" (endereço especial não catalogado,
      // ex. SALDAO) — já é maior que qualquer distância real ponderada (máx.
      // ~27*3.5≈95), então não multiplica pelo peso de novo, senão vira um número
      // artificialmente enorme (~3500) sem significado real.
      const custo = d >= 999 ? d : d * ((_pesoRua(ruas[i]) + _pesoRua(ruas[j])) / 2);
      if (custo > max) max = custo;
    }
  }
  return max;
}

// Pré-computa rua/SKU/pontuação de cada pedido elegível e os agrupa em lotes de
// até TAMANHO_LOTE, minimizando diâmetro de ruas com desconto por SKU em comum.
// Extraído de /pedidos/lote/formar pra ser reaproveitado por /pedidos/lote/formar-manual
// (mesmo algoritmo, só que restrito a um pool de pedidos já escolhido/bipado pelo
// supervisor, em vez da fila inteira elegível).
async function _prepararEAgruparPedidos(elegiveis: any, modoLote: any) {
  for (const p of elegiveis) {
    const itens = await db.all<Pick<Linha<'itens_pedido'>, 'endereco' | 'quantidade' | 'codigo'>>('SELECT endereco,quantidade,codigo FROM itens_pedido WHERE pedido_id=$1', [p.id]);
    const ruas = itens.map(i => _ruaPrincipalLote(i.endereco)).filter(Boolean);
    p._ruaPrincipal = [...ruas].sort((a,b) => _rotaIdxLote(a) - _rotaIdxLote(b))[0] || '';
    p._ruasSet = [...new Set(ruas)];
    p._itensQtd = itens.reduce((s,i) => s + (parseInt(i.quantidade as any)||1), 0);
    p._skusSet = [...new Set(itens.map(i => i.codigo).filter(Boolean))];
    p._skusQtd = p._skusSet.length;
    const scoreBase = calcularPontuacaoPedido(itens);
    if (modoLote === 'complexidade') {
      // Mesmo bônus do cenário "Complexidade Total" em /pedidos/distribuicao:
      // ruas extras (>2) e SKUs distintos extras (>1) pesam mais na pontuação.
      const ruasUnicas = new Set(ruas).size;
      const skusUnicos = new Set(itens.map(i => i.codigo).filter(Boolean)).size;
      const bonusRuas = Math.max(0, ruasUnicas - 2) * 15;
      const bonusSkus = Math.max(0, skusUnicos - 1) * 3;
      p._pontuacao = scoreBase + bonusRuas + bonusSkus;
    } else {
      p._pontuacao = scoreBase;
    }
    await pool.query('UPDATE pedidos SET pontuacao=$1 WHERE id=$2', [scoreBase, p.id]);
  }

  // Monta os lotes "esculpindo" o conjunto elegível (já ordenado por aguardando_desde
  // ASC): cada lote começa pelo pedido mais antigo ainda disponível (preserva a
  // prioridade de quem espera mais) e cresce pegando, a cada passo, o candidato que
  // resulta no menor diâmetro ponderado por dificuldade — com desconto por SKU em
  // comum — até completar TAMANHO_LOTE.
  const PESO_SKU_COMUM = 3;
  // Cada lote só busca candidato dentre os próximos JANELA_BUSCA pedidos mais antigos
  // ainda disponíveis (não a fila elegível inteira) — evita custo O(N²) com filas
  // grandes sem "quantidade" definida.
  const JANELA_BUSCA = 40;
  const restantesGlobais = [...elegiveis];
  /** @type {Array<{ pedidos: any[], [campo: string]: any }>} */
  const lotesPreview: Array<{ pedidos: any[]; [campo: string]: any }> = [];
  while (restantesGlobais.length) {
    const seed = restantesGlobais.shift();
    const grupo = [seed];
    let ruasGrupo = [...seed._ruasSet];
    let skusGrupo = new Set(seed._skusSet);
    while (grupo.length < TAMANHO_LOTE && restantesGlobais.length) {
      const janela = restantesGlobais.slice(0, JANELA_BUSCA);
      let melhorIdx = 0, melhorCusto = Infinity;
      janela.forEach((cand, idx) => {
        const ruasTeste = [...new Set([...ruasGrupo, ...cand._ruasSet])];
        const diametro = _diametroRuas(ruasTeste);
        const skusComuns = cand._skusSet.filter((sku: any) => skusGrupo.has(sku)).length;
        const custo = diametro - skusComuns * PESO_SKU_COMUM;
        if (custo < melhorCusto) { melhorCusto = custo; melhorIdx = idx; }
      });
      const escolhido = restantesGlobais.splice(melhorIdx,1)[0];
      grupo.push(escolhido);
      ruasGrupo = [...new Set([...ruasGrupo, ...escolhido._ruasSet])];
      escolhido._skusSet.forEach((sku: any) => skusGrupo.add(sku));
    }
    lotesPreview.push({ pedidos: grupo });
  }
  return lotesPreview;
}

// Filtro dos pedidos elegíveis a lote — compartilhado pelo preview de lotes e pela
// contagem que a tela mostra antes de calcular (mesma regra, um lugar só).
// apenas_prime alterna entre só Prime ou só normal, nunca mistura os dois (mesmo
// comportamento de /pedidos/distribuicao). Filtro por data de "aguardando desde":
// pedido pendente/não atribuído nunca tem turno_distribuicao preenchido (só é
// gravado na distribuição), então a data é o filtro que faz sentido aqui.
const AGUARDANDO_DATA_SQL = `(CASE WHEN p.aguardando_desde ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}' THEN TO_TIMESTAMP(p.aguardando_desde,'DD/MM/YYYY HH24:MI')::DATE END)`;
// Trecho " AND ..." do filtro por data de "aguardando desde"; empilha os valores em wParams.
function _clausulaDatas(data_de: any, data_ate: any, wParams: any) {
  let s = '';
  if (data_de)  { wParams.push(data_de);  s += ` AND ${AGUARDANDO_DATA_SQL} >= $${wParams.length}::DATE`; }
  if (data_ate) { wParams.push(data_ate); s += ` AND ${AGUARDANDO_DATA_SQL} <= $${wParams.length}::DATE`; }
  return s;
}

function _filtroElegiveisLote({ data_de, data_ate, apenas_prime }: any) {
  let w = apenas_prime === true || apenas_prime === 'true'
    ? "p.status='pendente' AND p.separador_id IS NULL AND p.tem_prime=true"
    : "p.status='pendente' AND p.separador_id IS NULL AND (p.tem_prime=false OR p.tem_prime IS NULL)";
  const wParams: any[] = [];
  w += _clausulaDatas(data_de, data_ate, wParams);
  return { w, wParams };
}
const _ehDriveThru = (p: any) => String(p.transportadora || '').toUpperCase().includes('DRIVE');

// Resumo único da distribuição, valendo pra TODOS os modos (Automática, Por Turno,
// Manual, Lotes): do que entrou no período, quanto já tem colaborador e quanto falta.
// "Falta" = pendente sem colaborador (inclui o marcado só por turno, que ainda não
// tem quem separe — contado à parte em marcados_turno).
router.get('/pedidos/distribuicao/resumo', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const { data_de, data_ate } = req.query as Record<string, string>;
    const params: any[] = [];
    const w = `p.status IN ('pendente','separando','concluido')${_clausulaDatas(data_de, data_ate, params)}`;
    const SEM_COLAB = "p.status='pendente' AND p.separador_id IS NULL";
    const DRIVE = "UPPER(COALESCE(p.transportadora,'')) LIKE '%DRIVE%'";
    const r = await db.get(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE p.separador_id IS NOT NULL) AS distribuidos,
              COUNT(*) FILTER (WHERE ${SEM_COLAB}) AS faltam,
              COUNT(*) FILTER (WHERE ${SEM_COLAB} AND p.tem_prime=true) AS faltam_prime,
              COUNT(*) FILTER (WHERE ${SEM_COLAB} AND ${DRIVE}) AS faltam_drive,
              COUNT(*) FILTER (WHERE ${SEM_COLAB} AND COALESCE(p.tem_prime,false)=false AND NOT ${DRIVE}) AS faltam_normais,
              COUNT(*) FILTER (WHERE ${SEM_COLAB} AND COALESCE(p.turno_distribuicao,'')<>'') AS marcados_turno
       FROM pedidos p WHERE ${w}`, params);
    const n = (k: any) => parseInt(r?.[k]) || 0;
    res.json({
      total: n('total'), distribuidos: n('distribuidos'), faltam: n('faltam'),
      faltam_normais: n('faltam_normais'), faltam_prime: n('faltam_prime'),
      faltam_drive: n('faltam_drive'), marcados_turno: n('marcados_turno'),
    });
  } catch(err) { res.status(500).json({erro:err.message}); }
});

// Quantos pedidos entram na formação de lotes (sem Drive Thru, que vai individual).
// Só conta — não monta lote nem grava nada.
router.get('/pedidos/lote/elegiveis', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const { w, wParams } = _filtroElegiveisLote(req.query as any);
    const pedidos = await db.all(`SELECT p.transportadora FROM pedidos p WHERE ${w}`, wParams);
    const drive = pedidos.filter(_ehDriveThru).length;
    res.json({ total_disponivel: pedidos.length - drive, drive_thru_excluidos: drive });
  } catch(err) { res.status(500).json({erro:err.message}); }
});

// Preview — não grava nada, só calcula os lotes e devolve pra conferência.
router.post('/pedidos/lote/formar', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const { separadores, quantidade, cenario, data_de, data_ate, apenas_prime } = req.body;
  const modoLote = cenario || 'balanceado'; // 'balanceado' | 'por_itens' | 'complexidade'
  if (!separadores?.length) return res.status(400).json({erro:'Informe os separadores!'});
  try {
    const { w, wParams } = _filtroElegiveisLote({ data_de, data_ate, apenas_prime });
    const pedidos = await db.all(
      `SELECT p.*,
         EXTRACT(EPOCH FROM (
           (NOW() AT TIME ZONE 'America/Sao_Paulo') -
           CASE WHEN p.aguardando_desde ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}'
                THEN TO_TIMESTAMP(p.aguardando_desde, 'DD/MM/YYYY HH24:MI')
                ELSE (NOW() AT TIME ZONE 'America/Sao_Paulo')
           END
         ))/60 AS espera_min
       FROM pedidos p WHERE ${w}
       ORDER BY
         CASE WHEN p.aguardando_desde ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}'
              THEN TO_TIMESTAMP(p.aguardando_desde, 'DD/MM/YYYY HH24:MI')
              ELSE NULL END ASC NULLS LAST,
         p.id ASC`,
      wParams
    );
    let elegiveis = pedidos.filter(p => !_ehDriveThru(p));
    const totalElegiveis = elegiveis.length;
    // Quantidade opcional: pega só os N mais antigos (já vêm ordenados por
    // aguardando_desde), igual ao campo "Quantidade" do Distribuir.
    if (quantidade > 0) elegiveis = elegiveis.slice(0, quantidade);

    // 1-2. Prepara (rua/SKU/pontuação) e agrupa em lotes — ver _prepararEAgruparPedidos.
    const lotesPreview = await _prepararEAgruparPedidos(elegiveis, modoLote);

    // 3. Atribui cada lote ao separador mais atrasado na fórmula de 3 eixos
    //    (mesma lógica de /pedidos/distribuicao, aplicada ao lote inteiro).
    const sepMap: Record<string, any> = {};
    for (const sid of separadores) {
      const sepRow = await db.get<Pick<Linha<'separadores'>, 'id' | 'nome'>>('SELECT s.id,s.nome FROM separadores s WHERE s.usuario_id=$1 LIMIT 1', [sid]);
      const userRow = await db.get<Pick<Linha<'usuarios'>, 'id' | 'nome'>>('SELECT id,nome FROM usuarios WHERE id=$1', [sid]);
      sepMap[sid] = { sepDbId: sepRow?.id || null, nome: sepRow?.nome || userRow?.nome || `Sep ${sid}` };
    }
    const filas = separadores.map((sid: any) => ({
      separador_id: sid, separador_nome: sepMap[sid].nome, sep_db_id: sepMap[sid].sepDbId,
      pontuacao_total: 0, itens_total: 0, pedidos_total: 0,
    }));
    for (const f of filas) {
      if (!f.sep_db_id) continue;
      const ja = await db.get(
        `SELECT COALESCE(SUM(COALESCE(p.pontuacao,0)),0) AS pts, COALESCE(SUM(COALESCE(p.itens,0)),0) AS itens, COUNT(*) AS qtd
         FROM pedidos p WHERE p.separador_id=$1 AND p.status IN ('pendente','separando')`, [f.sep_db_id]);
      if (ja) { f.pontuacao_total = parseFloat(ja.pts)||0; f.itens_total = parseInt(ja.itens)||0; f.pedidos_total = parseInt(ja.qtd)||0; }
    }
    const totalPtsLotes    = lotesPreview.reduce((s,l) => s + l.pedidos.reduce((s2,p) => s2+p._pontuacao, 0), 0) || 1;
    const totalItensLotes  = lotesPreview.reduce((s,l) => s + l.pedidos.reduce((s2,p) => s2+p._itensQtd, 0), 0) || 1;
    const totalPedidosLotes= lotesPreview.reduce((s,l) => s + l.pedidos.length, 0) || 1;
    const n = filas.length || 1;
    const alvoPts     = (filas.reduce((s: any,f: any)=>s+f.pontuacao_total,0) + totalPtsLotes)     / n;
    const alvoItens   = (filas.reduce((s: any,f: any)=>s+f.itens_total,0)     + totalItensLotes)   / n;
    const alvoPedidos = (filas.reduce((s: any,f: any)=>s+f.pedidos_total,0)   + totalPedidosLotes) / n;

    for (const lote of lotesPreview) {
      const lotePts   = lote.pedidos.reduce((s,p) => s+p._pontuacao, 0);
      const loteItens = lote.pedidos.reduce((s,p) => s+p._itensQtd, 0);
      filas.sort((a: any,b: any) => modoLote === 'por_itens'
        ? a.itens_total - b.itens_total
        : ((a.pontuacao_total/alvoPts) + (a.itens_total/alvoItens) + (a.pedidos_total/alvoPedidos))
          - ((b.pontuacao_total/alvoPts) + (b.itens_total/alvoItens) + (b.pedidos_total/alvoPedidos)));
      const alvoFila = filas[0];
      alvoFila.pontuacao_total += lotePts;
      alvoFila.itens_total     += loteItens;
      alvoFila.pedidos_total   += lote.pedidos.length;
      lote.separador_id   = alvoFila.separador_id;
      lote.separador_nome = alvoFila.separador_nome;
      lote.pontuacao_total = Math.round(lotePts);
      lote.itens_total     = loteItens;
      lote.pedidos_hoje_total = alvoFila.pedidos_total;
      // Ordem alfabética simples (A,B,C,...) — essa coluna é só informativa, pra o
      // supervisor ver rápido quais zonas o lote toca; a ordem de caminhada real
      // (ROTA_FISICA) continua sendo usada na tela de separação do celular.
      lote.ruas = [...new Set<string>(lote.pedidos.flatMap(p => p._ruasSet))].sort((a,b) => a.localeCompare(b, 'pt-BR'));
      // V6 — mostra ao supervisor a MESMA lógica que o algoritmo já usa pra montar
      // o lote (ROTA_FISICA_LOTE + _diametroRuas), em vez de só o resultado final:
      // rota = ordem real de caminhada (não alfabética); distancia_ponderada = a
      // métrica de distância×dificuldade que o algoritmo usou pra decidir o
      // agrupamento (não é metros reais — não existe calibração física no
      // projeto pra converter em unidade física; é a mesma unidade abstrata já
      // usada internamente, recalculada uma vez pro conjunto final de ruas).
      lote.rota = [...lote.ruas].sort((a,b) => _rotaIdxLote(a) - _rotaIdxLote(b));
      lote.distancia_ponderada = Math.round(_diametroRuas(lote.ruas) * 10) / 10;
    }

    res.json({
      lotes: lotesPreview.map(l => ({
        pedidos: l.pedidos.map(p => ({
          id:p.id, numero_pedido:p.numero_pedido, itens:p._itensQtd, espera_min: Math.round(p.espera_min||0),
          // Campos extras só pra imprimir etiqueta do lote (mesmo formato de imprimirEtiquetas
          // em pedidos.js) sem depender da lista filtrada da tela de Pedidos, que pode estar
          // com outro filtro ativo e não conter todos os pedidos deste lote.
          cliente: p.cliente||'', transportadora: p.transportadora||'', estado: p.estado||'',
          skus: p._skusQtd, total_itens: p._itensQtd, aguardando_desde: p.aguardando_desde||'',
        })),
        ruas: l.ruas,
        rota: l.rota,
        distancia_ponderada: l.distancia_ponderada,
        separador_id: l.separador_id,
        separador_nome: l.separador_nome,
        pontuacao_total: l.pontuacao_total,
        itens_total: l.itens_total,
        pedidos_hoje_total: l.pedidos_hoje_total,
      })),
      cenario: modoLote,
      total_pedidos: elegiveis.length,
      total_disponivel: totalElegiveis,
      drive_thru_excluidos: pedidos.length - totalElegiveis,
    });
  } catch(err) { res.status(500).json({erro:err.message}); }
});

// Preview do LOTE MANUAL: o supervisor já bipou/digitou um pool de pedidos (sem
// decidir o agrupamento) — aqui o sistema roda o MESMO algoritmo de proximidade
// de ruas/SKU em comum de /pedidos/lote/formar, só que restrito a esse pool
// (não a fila elegível inteira), dividindo em quantos lotes de até TAMANHO_LOTE
// forem necessários. Confirma pelo MESMO endpoint /pedidos/lote/formar/confirmar
// — o preview já devolve no formato que esse endpoint espera.
router.post('/pedidos/lote/formar-manual', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const { pedido_ids, separador_id } = req.body;
  if (!pedido_ids?.length) return res.status(400).json({erro:'Informe os pedidos bipados!'});
  if (!separador_id) return res.status(400).json({erro:'Selecione o colaborador!'});
  try {
    const ids = [...new Set(pedido_ids.map(Number).filter(Boolean))];
    const pedidos = await db.all(
      `SELECT p.*,
         EXTRACT(EPOCH FROM (
           (NOW() AT TIME ZONE 'America/Sao_Paulo') -
           CASE WHEN p.aguardando_desde ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}'
                THEN TO_TIMESTAMP(p.aguardando_desde, 'DD/MM/YYYY HH24:MI')
                ELSE (NOW() AT TIME ZONE 'America/Sao_Paulo')
           END
         ))/60 AS espera_min
       FROM pedidos p WHERE p.id = ANY($1)
       ORDER BY
         CASE WHEN p.aguardando_desde ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}'
              THEN TO_TIMESTAMP(p.aguardando_desde, 'DD/MM/YYYY HH24:MI')
              ELSE NULL END ASC NULLS LAST,
         p.id ASC`,
      [ids]
    );
    const isDrive = (p: any) => String(p.transportadora||'').toUpperCase().includes('DRIVE');
    const encontradosIds = new Set(pedidos.map(p => p.id));
    const naoEncontrados = ids.filter(id => !encontradosIds.has(id));
    const naoElegiveis = pedidos.filter(p => p.status !== 'pendente' || p.separador_id || isDrive(p));
    const elegiveis    = pedidos.filter(p => p.status === 'pendente' && !p.separador_id && !isDrive(p));

    if (!elegiveis.length) {
      return res.status(400).json({erro:'Nenhum pedido elegível entre os bipados (precisa estar pendente, sem separador e não ser Drive Thru).'});
    }

    const lotesPreview = await _prepararEAgruparPedidos(elegiveis, 'balanceado');

    const sepRow  = await db.get<Pick<Linha<'separadores'>, 'id' | 'nome'>>('SELECT s.id,s.nome FROM separadores s WHERE s.usuario_id=$1 LIMIT 1', [separador_id]);
    const userRow = await db.get<Pick<Linha<'usuarios'>, 'id' | 'nome'>>('SELECT id,nome FROM usuarios WHERE id=$1', [separador_id]);
    const sepNome = sepRow?.nome || userRow?.nome || `Sep ${separador_id}`;

    for (const lote of lotesPreview) {
      lote.separador_id   = separador_id;
      lote.separador_nome = sepNome;
      lote.pontuacao_total = Math.round(lote.pedidos.reduce((s,p) => s+p._pontuacao, 0));
      lote.itens_total     = lote.pedidos.reduce((s,p) => s+p._itensQtd, 0);
      lote.ruas = [...new Set<string>(lote.pedidos.flatMap(p => p._ruasSet))].sort((a,b) => a.localeCompare(b, 'pt-BR'));
      lote.rota = [...lote.ruas].sort((a,b) => _rotaIdxLote(a) - _rotaIdxLote(b));
      lote.distancia_ponderada = Math.round(_diametroRuas(lote.ruas) * 10) / 10;
    }

    res.json({
      lotes: lotesPreview.map(l => ({
        pedidos: l.pedidos.map(p => ({
          id:p.id, numero_pedido:p.numero_pedido, itens:p._itensQtd, espera_min: Math.round(p.espera_min||0),
          cliente: p.cliente||'', transportadora: p.transportadora||'', estado: p.estado||'',
          skus: p._skusQtd, total_itens: p._itensQtd, aguardando_desde: p.aguardando_desde||'',
        })),
        ruas: l.ruas,
        rota: l.rota,
        distancia_ponderada: l.distancia_ponderada,
        separador_id: l.separador_id,
        separador_nome: l.separador_nome,
        pontuacao_total: l.pontuacao_total,
        itens_total: l.itens_total,
      })),
      total_bipados: ids.length,
      total_elegiveis: elegiveis.length,
      ignorados: naoEncontrados.length + naoElegiveis.length,
      // numero_pedido de quem foi excluído do agrupamento (já não pendente, já tem
      // separador, ou é Drive Thru) — ids que nem existiam não têm numero pra mostrar.
      ignorados_numeros: naoElegiveis.map(p => p.numero_pedido),
    });
  } catch(err) { res.status(500).json({erro:err.message}); }
});

// Confirma — grava lotes_separacao + separador_id/lote_id nos pedidos.
router.post('/pedidos/lote/formar/confirmar', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const { lotes } = req.body;
  if (!lotes?.length) return res.status(400).json({erro:'Nenhum lote informado!'});
  const grande = lotes.find((l: any) => (l.pedidos||[]).length > TAMANHO_LOTE);
  if (grande) return res.status(400).json({erro:`Lote com ${(grande.pedidos||[]).length} pedidos — o máximo é ${TAMANHO_LOTE} por lote.`});
  const client = await pool.connect();
  let lotesGravados = 0, pedidosGravados = 0;
  try {
    await client.query('BEGIN');
    for (const lote of lotes) {
      const ids = (lote.pedidos||[]).map((p: any) => p.id).filter(Boolean);
      if (!ids.length) continue;
      const porUsuario = await client.query('SELECT id FROM separadores WHERE usuario_id=$1 LIMIT 1', [lote.separador_id]);
      const dbId = porUsuario.rows[0]?.id || null;
      if (!dbId) continue;
      const rLote = await client.query(`INSERT INTO lotes_separacao (separador_id, status) VALUES ($1,'aguardando') RETURNING id`, [dbId]);
      const loteId = rLote.rows[0].id;
      const r = await client.query(
        `UPDATE pedidos SET separador_id=$1, lote_id=$2 WHERE id=ANY($3) AND status='pendente'`,
        [dbId, loteId, ids]
      );
      // Se nenhum pedido do lote ainda estava 'pendente' (mudou de status entre
      // o preview e a confirmação — outra ação pegou primeiro), o lote acabou de
      // ser criado vazio. Desfaz o INSERT em vez de deixar um lote fantasma sem
      // pedido nenhum (apareceria pro separador como "tem lote esperando", com 0
      // itens) e sem contar como gravado na resposta.
      if (r.rowCount === 0) {
        await client.query('DELETE FROM lotes_separacao WHERE id=$1', [loteId]);
        continue;
      }
      lotesGravados++;
      pedidosGravados += r.rowCount!;
    }
    await client.query('COMMIT');
    res.json({ mensagem:'Lotes formados!', lotes: lotesGravados, pedidos: pedidosGravados });
  } catch(err) {
    await client.query('ROLLBACK');
    res.status(500).json({erro:err.message});
  } finally { client.release(); }
});

// Histórico de lotes já concluídos (todos os pedidos do lote com status='concluido')
// de um separador — usado pelo menu "Lotes concluídos" no celular. lotes_separacao.status
// nunca é atualizado após criado, então "concluído" é derivado direto dos pedidos.
router.get('/pedidos/lote/historico', requerAuth, async (req,res) => {
  const sepId = parseInt(req.query.separador_id as string) || 0;
  if (!sepId) return res.json({ lotes: [] });
  try {
    const grupos = await db.all(
      `SELECT p.lote_id, COUNT(*)::int AS total, MAX(p.concluido_em) AS concluido_em
       FROM pedidos p
       WHERE p.lote_id IS NOT NULL AND p.separador_id=$1
       GROUP BY p.lote_id
       HAVING COUNT(*) = COUNT(*) FILTER (WHERE p.status='concluido')
       ORDER BY MAX(p.concluido_em) DESC NULLS LAST
       LIMIT 20`,
      [sepId]
    );
    const lotes = [];
    for (const g of grupos) {
      const pedidos = await db.all<Pick<Linha<'pedidos'>, 'id' | 'numero_pedido' | 'cliente' | 'total_itens' | 'itens' | 'concluido_em'>>(
        `SELECT id, numero_pedido, cliente, total_itens, itens, concluido_em FROM pedidos WHERE lote_id=$1 ORDER BY id`,
        [g.lote_id]
      );
      lotes.push({ lote_id: g.lote_id, total: g.total, concluido_em: g.concluido_em, pedidos });
    }
    res.json({ lotes });
  } catch(err) { res.status(500).json({erro:err.message}); }
});

/* ══════════════════════════════════════════
   LOTES FORMADOS PELO PRÓPRIO CELULAR DO SEPARADOR
   Depois da distribuição (pedidos já com separador_id, ainda 'pendente' e sem lote),
   o celular pede uma SUGESTÃO de lotes só com os pedidos do separador logado
   (mesmo algoritmo de proximidade de ruas do supervisor, até TAMANHO_LOTE por lote)
   e, se o separador quiser "por lote", confirma o lote. Quem prefere pedido a pedido
   simplesmente não confirma nada — nada é gravado até o toque. Drive Thru nunca entra;
   Prime e não-Prime não se misturam (mesma regra da formação do supervisor).
══════════════════════════════════════════ */
function _sepIdSessao(req: any) { return req.session?.separador?.id || null; }

router.get('/pedidos/meus-lotes/sugestao', requerAuth, async (req,res) => {
  const sepId = _sepIdSessao(req);
  if (!sepId) return res.status(403).json({erro:'Usuário não vinculado a um separador.'});
  try {
    const pedidos = await db.all(
      `SELECT p.* FROM pedidos p
       WHERE p.separador_id=$1 AND p.status='pendente' AND p.lote_id IS NULL
       ORDER BY
         CASE WHEN p.aguardando_desde ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}'
              THEN TO_TIMESTAMP(p.aguardando_desde, 'DD/MM/YYYY HH24:MI')
              ELSE NULL END ASC NULLS LAST,
         p.id ASC`, [sepId]);
    const lotes: any[] = [];
    for (const prime of [false, true]) {
      const grupo = pedidos.filter(p => !_ehDriveThru(p) && (p.tem_prime === true) === prime);
      if (grupo.length < 2) continue;
      const prev = await _prepararEAgruparPedidos(grupo, 'balanceado');
      for (const l of prev) {
        if (l.pedidos.length < 2) continue; // lote de 1 pedido não faz sentido: segue como pedido solto
        const ruas = [...new Set<string>(l.pedidos.flatMap((p: any) => p._ruasSet))];
        const rota = ruas.sort((a,b) => _rotaIdxLote(a) - _rotaIdxLote(b));
        lotes.push({
          prime,
          pedidos: l.pedidos.map((p: any) => ({ id:p.id, numero_pedido:p.numero_pedido, itens:p._itensQtd, skus:p._skusQtd })),
          rota,
          itens_total: l.pedidos.reduce((s: number, p: any) => s + p._itensQtd, 0),
        });
      }
    }
    res.json({ lotes, tamanho_maximo: TAMANHO_LOTE });
  } catch(err) { res.status(500).json({erro:err.message}); }
});

// Confirma UM lote sugerido: só pedidos do próprio separador, ainda pendentes e sem lote.
router.post('/pedidos/meus-lotes/confirmar', requerAuth, async (req,res) => {
  const sepId = _sepIdSessao(req);
  if (!sepId) return res.status(403).json({erro:'Usuário não vinculado a um separador.'});
  const ids = [...new Set(((req.body?.pedido_ids || []) as any[]).map(Number).filter(Boolean))];
  if (ids.length < 2) return res.status(400).json({erro:'Um lote precisa de pelo menos 2 pedidos.'});
  if (ids.length > TAMANHO_LOTE) return res.status(400).json({erro:`O máximo é ${TAMANHO_LOTE} pedidos por lote.`});
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Trava as linhas pra duas confirmações simultâneas não pegarem o mesmo pedido.
    const ok = await client.query(
      `SELECT id, transportadora, tem_prime FROM pedidos
       WHERE id=ANY($1) AND separador_id=$2 AND status='pendente' AND lote_id IS NULL FOR UPDATE`, [ids, sepId]);
    const validos = ok.rows.filter(p => !_ehDriveThru(p));
    if (validos.length !== ids.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({erro:'A fila mudou — algum pedido já foi iniciado, é Drive Thru ou não é seu. Atualize a fila.'});
    }
    const primes = new Set(validos.map(p => p.tem_prime === true));
    if (primes.size > 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({erro:'Não misture pedidos Prime e normais no mesmo lote.'});
    }
    const rLote = await client.query(`INSERT INTO lotes_separacao (separador_id, status) VALUES ($1,'aguardando') RETURNING id`, [sepId]);
    const loteId = rLote.rows[0].id;
    await client.query(`UPDATE pedidos SET lote_id=$1 WHERE id=ANY($2)`, [loteId, ids]);
    await client.query('COMMIT');
    res.json({ mensagem:'Lote formado!', lote_id: loteId, pedidos: ids.length });
  } catch(err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({erro:err.message});
  } finally { client.release(); }
});

router.post('/pedidos/recalcular-pontuacao', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const peds=await db.all<Pick<Linha<'pedidos'>, 'id'>>("SELECT id FROM pedidos WHERE pontuacao=0 OR pontuacao IS NULL");
    let at=0;
    for (const p of peds){const itens=await db.all<Pick<Linha<'itens_pedido'>, 'endereco' | 'quantidade'>>('SELECT endereco,quantidade FROM itens_pedido WHERE pedido_id=$1',[p.id]);const pts=calcularPontuacaoPedido(itens);if(pts>0){await pool.query('UPDATE pedidos SET pontuacao=$1 WHERE id=$2',[pts,p.id]);at++;}}
    res.json({mensagem:`${at} pedidos recalculados`,atualizados:at});
  } catch(err){res.status(500).json({erro:err.message});}
});

module.exports = router;
