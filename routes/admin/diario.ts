import express from 'express';
const router = express.Router();
import { db, pool } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';
import { dataHoraLocal, validarId, normalizarTurno } from '../../lib/helpers';
import type { Linha } from '../../types/db';

// Registra que o usuário logado viu este diário (uma linha por pessoa; atualiza a hora).
// Nunca derruba a resposta da tela por causa do registro.
async function registrarVisualizacaoDiario(req: any, diarioId: any) {
  const u = req.session?.usuario;
  if (!u || !diarioId) return;
  try {
    await pool.query(
      `INSERT INTO diario_visualizacoes (diario_id, usuario_id, usuario_nome, turno, visto_em)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (diario_id, usuario_id) DO UPDATE SET visto_em = NOW(), usuario_nome = EXCLUDED.usuario_nome, turno = EXCLUDED.turno`,
      [diarioId, u.id, u.nome || '', normalizarTurno(u.turno)]
    );
  } catch (e) { console.warn('visualizacao do diario:', e.message); }
}

router.get('/diario', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    res.json(await db.all(`
      SELECT d.id, d.data, d.turno, d.supervisor, d.leu_anterior, d.status, d.criado_em,
             v.pontuacao, v.validador, v.turno_validador, v.validado_em,
             (SELECT json_agg(json_build_object('nome', vz.usuario_nome, 'turno', vz.turno) ORDER BY vz.visto_em)
                FROM diario_visualizacoes vz WHERE vz.diario_id = d.id) AS vistos
      FROM diario_bordo d
      LEFT JOIN diario_validacoes v ON v.diario_id = d.id
      ORDER BY d.criado_em DESC LIMIT 30
    `));
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.get('/diario/anterior', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const { data, turno } = req.query as Record<string, string>;
    const turnos = ['Manha','Tarde','Noite'];
    const idxT = turnos.indexOf(turno);
    let dataAnterior = data;
    let turnoAnterior;
    let anterior;
    if (idxT === 0) {
      const dt = new Date(data + 'T12:00:00');
      dt.setDate(dt.getDate() - 1);
      dataAnterior = dt.toISOString().split('T')[0];
      turnoAnterior = 'Noite';
      // A Noite cruza a meia-noite e o supervisor fecha o diário já de manhã: ele
      // pode estar datado no dia em que o turno começou (ontem) ou no dia em que
      // foi preenchido (hoje, entre 00h e 12h). Hoje só vale se foi escrito pela
      // manhã — um diário da Noite criado à noite é o do turno seguinte, não o anterior.
      const candidatos = await db.all<Linha<'diario_bordo'>>(
        `SELECT * FROM diario_bordo WHERE turno=$1 AND data IN ($2,$3) ORDER BY criado_em DESC`,
        [turnoAnterior, dataAnterior, data]
      );
      const horaLocal = (c: any) => Number(new Date(c.criado_em).toLocaleString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }));
      anterior = candidatos.find(c => c.data !== data || horaLocal(c) < 12);
    } else {
      turnoAnterior = turnos[idxT - 1];
      anterior = await db.get('SELECT * FROM diario_bordo WHERE data=$1 AND turno=$2', [dataAnterior, turnoAnterior]);
    }
    if (!anterior) return res.json(null);
    await registrarVisualizacaoDiario(req, anterior.id);
    if (typeof anterior.dados === 'string') anterior.dados = JSON.parse(anterior.dados);
    if (typeof anterior.observacoes === 'string') {
      try { anterior.observacoes = JSON.parse(anterior.observacoes); } catch(e) { anterior.observacoes = {geral: anterior.observacoes}; }
    }
    res.json(anterior);
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.get('/diario/dados/turno', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const { data, turno } = req.query as Record<string, string>;
    const { dataHoraLocal: dhl } = require('../../lib/helpers');
    const dt = data || dhl().data;
    // O parâmetro turno chegava a ser recebido mas nunca era usado pra filtrar —
    // toda consulta trazia o dia inteiro, então qualquer turno selecionado mostrava
    // sempre os mesmos números do dia todo. sep_turno sem default 'Manha' — pedido
    // ainda não distribuído não deve contar em nenhum turno específico.
    const turnoFiltro = turno && turno !== 'Todos' ? turno : null;

    // Data efetiva de trabalho (mesmo critério de routes/pedidos.js e
    // routes/performance-dash.js): data_pedido é quando o pedido ENTROU no
    // sistema, não quando foi separado — usar só ela deixava o Diário de
    // Bordo zerado sempre que o pedido chegou num dia e foi trabalhado
    // (distribuído/iniciado) em outro. Além disso, iniciado_em só é gravado
    // UMA VEZ (não atualiza quando o separador retoma um pedido pausado/
    // antigo), então um pedido ainda ATIVO (pendente/separando) sempre conta
    // como relevante a HOJE, senão trabalho em andamento (retomando pedido
    // de dias atrás) sumia do Diário de hoje. Concluído usa concluido_em.
    const hoje = dhl().data;
    let pedidos = await db.all(`
      SELECT p.*, COALESCE(p.turno_distribuicao, s.turno) AS sep_turno
      FROM pedidos p LEFT JOIN separadores s ON p.separador_id = s.id
      WHERE (p.status='concluido' AND NULLIF(p.concluido_em,'') IS NOT NULL AND LEFT(p.concluido_em,10) = $1)
         OR (p.status != 'concluido' AND COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) = $1)
         OR (p.status != 'concluido' AND $2 = $1)
    `, [dt, hoje]);
    if (turnoFiltro) pedidos = pedidos.filter(p => p.sep_turno === turnoFiltro);
    const idsPedidosTurno = new Set(pedidos.map(p => p.id));

    const total = pedidos.length;
    const concluidos = pedidos.filter(p => p.status === 'concluido').length;
    const pendentes = pedidos.filter(p => p.status === 'pendente').length;
    const separando = pedidos.filter(p => p.status === 'separando').length;

    const faltasRaw = await db.all(`SELECT ar.*, p.numero_pedido, p.cliente FROM avisos_repositor ar LEFT JOIN pedidos p ON ar.pedido_id = p.id WHERE ar.data_aviso=$1 AND ar.status='nao_encontrado'`, [dt]);
    const faltas = turnoFiltro ? faltasRaw.filter(f => idsPedidosTurno.has(f.pedido_id)) : faltasRaw;

    const checkoutsRaw = await db.all<Linha<'checkout'>>('SELECT * FROM checkout WHERE data_checkout=$1', [dt]);
    const checkouts = turnoFiltro ? checkoutsRaw.filter(c => idsPedidosTurno.has(c.pedido_id)) : checkoutsRaw;
    const ckConcluidos = checkouts.filter(c => c.status === 'concluido').length;
    const ckPendentes = checkouts.filter(c => c.status !== 'concluido').length;

    const reposicoesRaw = await db.all<Linha<'avisos_repositor'>>('SELECT * FROM avisos_repositor WHERE data_aviso=$1', [dt]);
    const reposicoes = turnoFiltro ? reposicoesRaw.filter(r => idsPedidosTurno.has(r.pedido_id)) : reposicoesRaw;
    const repResolvidas = reposicoes.filter(r => ['reposto','abastecido','subiu'].includes(r.status)).length;
    const repPendentes = reposicoes.filter(r => r.status === 'pendente' || r.status === 'aberto').length;
    const repNaoEncontrados = reposicoes.filter(r => r.status === 'nao_encontrado').length;

    // Embalagem — reaproveita os pedidos já filtrados por turno acima, em vez de
    // uma nova query com filtro fixo só por data (que ignorava o turno).
    const embPedidos = pedidos.filter(p => p.status === 'concluido');
    const embEmbalados = embPedidos.filter(p => p.status_embalagem === 'embalado').length;
    const embPendentes = embPedidos.length - embEmbalados;

    res.json({
      data: dt, turno: turno || 'Todos',
      separacao: { total, concluidos, pendentes, separando },
      checkout: { concluidos: ckConcluidos, pendentes: ckPendentes, total: checkouts.length },
      reposicao: { resolvidas: repResolvidas, pendentes: repPendentes, nao_encontrados: repNaoEncontrados, total: reposicoes.length },
      embalagem: { total: embPedidos.length, embalados: embEmbalados, pendentes: embPendentes },
      problemas: faltas.map(f => ({ pedido: f.numero_pedido, cliente: f.cliente, item: f.descricao, codigo: f.codigo }))
    });
  } catch(e) { res.status(500).json({erro:e.message}); }
});

// Existe diário salvo pra essa data+turno? Usado no carregamento da tela pra
// decidir entre reabrir o que já foi salvo (respeitando edição manual) ou
// calcular um sugestão nova a partir dos números ao vivo — sem isso, toda
// vez que a tela abria ela recalculava e sobrescrevia silenciosamente
// qualquer valor preenchido manualmente antes de salvar.
router.get('/diario/existe', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const { data, turno } = req.query as Record<string, string>;
    if (!data || !turno) return res.json(null);
    const d = await db.get<Pick<Linha<'diario_bordo'>, 'id'>>('SELECT id FROM diario_bordo WHERE data=$1 AND turno=$2', [data, turno]);
    res.json(d ? { id: d.id } : null);
  } catch(e) { res.status(500).json({erro:e.message}); }
});

router.get('/diario/:id', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const d = await db.get<Linha<'diario_bordo'>>('SELECT * FROM diario_bordo WHERE id=$1', [req.params.id]);
    if (!d) return res.status(404).json({erro:'Nao encontrado'});
    await registrarVisualizacaoDiario(req, d.id);
    if (typeof d.dados === 'string') d.dados = JSON.parse(d.dados);
    res.json(d);
  } catch(e) { res.status(500).json({erro:e.message}); }
});

// Registro explícito de "visto" — usado quando o supervisor abre a janela de validação,
// que mostra os dados do diário sem passar por GET /diario/:id.
router.post('/diario/:id/visto', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const id = validarId(req.params.id);
  if (!id) return res.status(400).json({erro:'ID invalido'});
  await registrarVisualizacaoDiario(req, id);
  res.json({ ok: true });
});

// ── Fotos do diário de bordo (guardadas no banco; o navegador já reduz a imagem) ──
const FOTO_MAX_BYTES = 2 * 1024 * 1024;
const FOTO_MAX_POR_SECAO = 6;
const FOTO_TIPOS = ['image/jpeg', 'image/png', 'image/webp'];
// Foto do turno só mexe enquanto o diário é rascunho; foto da validação só enquanto aguarda validação.
const fotoEditavel = (origem: any, status: any) => origem === 'validacao' ? ['enviado', 'expirado'].includes(status) : status === 'rascunho';

router.get('/diario/:id/fotos', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    const id = validarId(req.params.id); if (!id) return res.status(400).json({ erro: 'ID inválido' });
    const fotos = await db.all<Pick<Linha<'diario_fotos'>, 'id' | 'origem' | 'secao' | 'autor'>>('SELECT id, origem, secao, autor FROM diario_fotos WHERE diario_id=$1 ORDER BY id', [id]);
    res.json(fotos);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/diario/:id/fotos', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    const id = validarId(req.params.id); if (!id) return res.status(400).json({ erro: 'ID inválido' });
    const { origem, secao, imagem } = req.body || {};
    if (!['diario', 'validacao'].includes(origem)) return res.status(400).json({ erro: 'Origem inválida' });
    if (!/^[a-z_]{2,20}$/.test(secao || '')) return res.status(400).json({ erro: 'Seção inválida' });
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(imagem || '');
    if (!m || !FOTO_TIPOS.includes(m[1])) return res.status(400).json({ erro: 'Envie uma imagem JPEG, PNG ou WebP' });
    const bytes = Buffer.from(m[2], 'base64');
    if (!bytes.length || bytes.length > FOTO_MAX_BYTES) return res.status(400).json({ erro: 'Imagem muito grande (máximo 2 MB)' });
    const d = await db.get<Pick<Linha<'diario_bordo'>, 'id' | 'status'>>('SELECT id, status FROM diario_bordo WHERE id=$1', [id]);
    if (!d) return res.status(404).json({ erro: 'Diário não encontrado' });
    if (!fotoEditavel(origem, d.status)) return res.status(403).json({ erro: 'Este diário não aceita mais fotos nesta etapa.' });
    const n = await db.get('SELECT COUNT(*)::int AS n FROM diario_fotos WHERE diario_id=$1 AND origem=$2 AND secao=$3', [id, origem, secao]);
    if (n.n >= FOTO_MAX_POR_SECAO) return res.status(400).json({ erro: `Máximo de ${FOTO_MAX_POR_SECAO} fotos por seção` });
    const autor = req.session?.usuario?.nome || '';
    const r = await pool.query('INSERT INTO diario_fotos (diario_id, origem, secao, mime, dados, autor) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [id, origem, secao, m[1], bytes, autor]);
    res.json({ id: r.rows[0].id, origem, secao, autor });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.get('/diario/foto/:fotoId', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    const id = validarId(req.params.fotoId); if (!id) return res.status(400).json({ erro: 'ID inválido' });
    const f = await db.get<Pick<Linha<'diario_fotos'>, 'mime' | 'dados'>>('SELECT mime, dados FROM diario_fotos WHERE id=$1', [id]);
    if (!f) return res.status(404).json({ erro: 'Foto não encontrada' });
    res.set({ 'Content-Type': f.mime, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
    res.send(f.dados);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/diario/foto/:fotoId', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    const id = validarId(req.params.fotoId); if (!id) return res.status(400).json({ erro: 'ID inválido' });
    const f = await db.get('SELECT f.id, f.origem, d.status FROM diario_fotos f JOIN diario_bordo d ON d.id=f.diario_id WHERE f.id=$1', [id]);
    if (!f) return res.status(404).json({ erro: 'Foto não encontrada' });
    if (!fotoEditavel(f.origem, f.status)) return res.status(403).json({ erro: 'Este diário não aceita mais alterações de fotos.' });
    await pool.query('DELETE FROM diario_fotos WHERE id=$1', [id]);
    res.json({ mensagem: 'Foto removida' });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

router.post('/diario', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  try {
    const {data, turno, dados, observacoes, leu_anterior} = req.body;
    if (!data || !turno) return res.status(400).json({erro:'Data e turno obrigatorios'});
    const supervisor = req.session?.usuario?.nome || 'Supervisor';
    const existe = await db.get<Pick<Linha<'diario_bordo'>, 'id' | 'supervisor' | 'status'>>('SELECT id, supervisor, status FROM diario_bordo WHERE data=$1 AND turno=$2', [data, turno]);
    if (existe) {
      // Qualquer supervisor/gestor pode editar o diário do turno, não só quem
      // criou — vários podem estar no mesmo turno ao mesmo tempo. Cada save
      // atualiza "supervisor" pra refletir quem editou por último; a única
      // trava que resta é depois de enviado/validado.
      // Bloqueia edição se já foi enviado/validado
      if (existe.status === 'enviado' || existe.status === 'validado') {
        return res.status(403).json({
          erro: `Este diário já foi ${existe.status === 'enviado' ? 'enviado para validação' : 'validado'} e não pode ser alterado.`
        });
      }
      await pool.query('UPDATE diario_bordo SET dados=$1,observacoes=$2,supervisor=$3,leu_anterior=$4 WHERE id=$5',
        [JSON.stringify(dados||{}), JSON.stringify(observacoes||{}), supervisor, leu_anterior||false, existe.id]);
      res.json({mensagem:'Diario atualizado!', id: existe.id});
    } else {
      const r = await pool.query('INSERT INTO diario_bordo (data,turno,supervisor,dados,observacoes,leu_anterior) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [data, turno, supervisor, JSON.stringify(dados||{}), JSON.stringify(observacoes||{}), leu_anterior||false]);
      res.json({mensagem:'Diario criado!', id: r.rows[0].id});
    }
  } catch(e) { res.status(500).json({erro:e.message}); }
});

module.exports = router;
