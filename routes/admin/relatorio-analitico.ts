import express from 'express';
const router = express.Router();
import { db } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';
import { dataHoraLocal } from '../../lib/helpers';
import type { Linha } from '../../types/db';

/* ══════════════════════════════════════════════════════════════
   RELATÓRIO ANALÍTICO — DE/ATÉ + TURNO
══════════════════════════════════════════════════════════════ */
router.get('/relatorio/analitico', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  const { de, ate, turno } = req.query as Record<string, string>;
  const { data: hoje } = dataHoraLocal();
  const dataIni = de || hoje;
  const dataFim = ate || hoje;
  const turnoFiltro = turno || 'Todos';

  try {
    const params = [dataIni, dataFim];

    // ── Pedidos — busca TODOS no período (sem filtro de hora no SQL)
    // O turno do lote é determinado por (em ordem de prioridade):
    //   1. turno_distribuicao — gravado quando supervisor usa botão de turno na distribuição
    //   2. turno do separador (u.turno / sep.turno) — fallback para distribuições antigas
    const pedidos = await db.all(`
      SELECT p.id, p.status, p.itens, p.pontuacao, p.hora_pedido, p.data_pedido,
             p.iniciado_em, p.concluido_em, p.skus_concluido_em, p.aguardando_desde,
             p.transportadora, p.rua, p.status_embalagem,
             p.embalagem_iniciado_em, p.embalado_em, p.embalado_por, p.tem_prime,
             COALESCE(u.nome, sep.nome, '') as sep_nome,
             COALESCE(p.turno_distribuicao, u.turno, sep.turno, 'Manha') as sep_turno
      FROM pedidos p
      LEFT JOIN separadores sep ON p.separador_id = sep.id
      LEFT JOIN usuarios u ON sep.usuario_id = u.id
      WHERE COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) >= $1
        AND COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido) <= $2
      ORDER BY COALESCE(NULLIF(LEFT(p.iniciado_em,10),''), NULLIF(p.data_distribuicao,''), p.data_pedido), p.hora_pedido
    `, params);

    // Lote do turno = pedidos distribuídos para separadores DESSE turno
    // "Todos" → todos os distribuídos, qualquer turno
    const pedidosDistribuidos = pedidos.filter(p =>
      p.sep_nome && (turnoFiltro === 'Todos' || p.sep_turno === turnoFiltro)
    );

    // ── Checkout ─────────────────────────────────────────────────
    const checkouts = await db.all(`
      SELECT ck.status, ck.data_checkout, ck.hora_checkout, ck.hora_criacao,
             ck.operador_nome, ck.pedido_id, p.itens
      FROM checkout ck
      LEFT JOIN pedidos p ON ck.pedido_id = p.id
      WHERE ck.data_checkout >= $1 AND ck.data_checkout <= $2
    `, params);

    // ── Embalagem ─────────────────────────────────────────────────
    const embalagens = await db.all(`
      SELECT em.embalado_por, em.data_embalagem, em.embalagem_inicio, em.embalado_em, p.itens
      FROM embalagem em
      LEFT JOIN pedidos p ON em.pedido_id = p.id
      WHERE em.data_embalagem >= $1 AND em.data_embalagem <= $2
    `, params);

    // ── Reposição ─────────────────────────────────────────────────
    const reposicoes = await db.all<Pick<Linha<'avisos_repositor'>, 'status' | 'data_aviso' | 'repositor_nome' | 'separador_nome' | 'descricao' | 'hora_aviso' | 'hora_reposto'>>(`
      SELECT ar.status, ar.data_aviso, ar.repositor_nome, ar.separador_nome, ar.descricao,
             ar.hora_aviso, ar.hora_reposto
      FROM avisos_repositor ar
      WHERE ar.data_aviso >= $1 AND ar.data_aviso <= $2
    `, params);

    // ── Helpers ───────────────────────────────────────────────────
    const minutesBetween = (s: any, e: any) => {
      try { const m = (+new Date(e) - +new Date(s)) / 60000; return (m > 0 && m < 600) ? m : null; } catch { return null; }
    };
    const minutesTime = (s: any, e: any) => {
      try {
        let m = (+new Date(`2000-01-01T${e}`) - +new Date(`2000-01-01T${s}`)) / 60000;
        if (m < 0) m += 1440;
        return (m > 0 && m < 300) ? m : null;
      } catch { return null; }
    };
    const avgArr = (a: any) => a.length ? Math.round((a.reduce((s: any,v: any)=>s+v,0)/a.length)*10)/10 : null;

    // ── Separação — baseado no lote do turno ─────────────────────
    const sepConcluidos = pedidosDistribuidos.filter(p => p.status === 'concluido');
    // Usa skus_concluido_em (quando separador terminou de escanear) como fim real.
    // Para pedidos sem falta skus_concluido_em = concluido_em; para pedidos com falta
    // skus_concluido_em é anterior ao concluido_em (não inclui espera pelo repositor).
    const temposSep = sepConcluidos.map(p => minutesBetween(p.iniciado_em, p.skus_concluido_em || p.concluido_em)).filter(Boolean);

    // ── Complexidade — baseada no lote do turno ───────────────────
    const facil_set = new Set(['A','B','C','D','E','P','Q','R','S','T','U']);
    const medio_set = new Set(['M','N','O','V','W','X','Y','Z']);
    const complexidade: Record<string, any> = {
      facil:   { pedidos: 0, itens: 0 },
      medio:   { pedidos: 0, itens: 0 },
      dificil: { pedidos: 0, itens: 0 },
    };
    pedidosDistribuidos.forEach(p => {
      const letters = String(p.rua||'').toUpperCase().split('/')[0].replace(/[^A-Z]/g,'');
      let nivel;
      if (!letters) nivel = 'facil';
      else if (letters.startsWith('ZA') || letters.includes('ARARA') || letters.includes('VERT')) nivel = 'dificil';
      else if (!facil_set.has(letters[0]) && !medio_set.has(letters[0])) nivel = 'dificil';
      else if (medio_set.has(letters[0])) nivel = 'medio';
      else nivel = 'facil';
      complexidade[nivel].pedidos++;
      complexidade[nivel].itens += parseInt(p.itens) || 0;
    });

    // ── Checkout métricas ─────────────────────────────────────────
    const ckConcluidos  = checkouts.filter(c => c.status === 'concluido');
    const temposCk      = ckConcluidos.map(c => minutesTime(c.hora_criacao, c.hora_checkout)).filter(Boolean);

    // ── Embalagem métricas ────────────────────────────────────────
    const temposEmb = embalagens.map(e => minutesTime(e.embalagem_inicio, e.embalado_em)).filter(Boolean);

    // ── Colaboradores — separadores filtrados pelo turno ─────────
    const colabs: Record<string, any> = {};
    pedidosDistribuidos.forEach(p => {
      if (!p.sep_nome) return;
      const k = `${p.sep_nome}:separador`;
      if (!colabs[k]) colabs[k] = { nome:p.sep_nome, perfil:'separador', turno:p.sep_turno, pedidos:0, itens:0, pontuacao:0, tempos:[] };
      if (p.status === 'concluido') {
        colabs[k].pedidos++;
        colabs[k].itens   += parseInt(p.itens) || 0;
        colabs[k].pontuacao += parseFloat(p.pontuacao) || 0;
        const t = minutesBetween(p.iniciado_em, p.skus_concluido_em || p.concluido_em);
        if (t) colabs[k].tempos.push(t);
      }
    });
    embalagens.forEach(e => {
      if (!e.embalado_por) return;
      const k = `${e.embalado_por}:embalador`;
      if (!colabs[k]) colabs[k] = { nome:e.embalado_por, perfil:'embalador', turno:null, pedidos:0, itens:0, tempos:[] };
      colabs[k].pedidos++;
      colabs[k].itens += parseInt(e.itens) || 0;
      const t = minutesTime(e.embalagem_inicio, e.embalado_em);
      if (t) colabs[k].tempos.push(t);
    });
    ckConcluidos.forEach(ck => {
      if (!ck.operador_nome) return;
      const k = `${ck.operador_nome}:checkout`;
      if (!colabs[k]) colabs[k] = { nome:ck.operador_nome, perfil:'checkout', turno:null, pedidos:0, itens:0, tempos:[] };
      colabs[k].pedidos++;
      colabs[k].itens += parseInt(ck.itens) || 0;
      const t = minutesTime(ck.hora_criacao, ck.hora_checkout);
      if (t) colabs[k].tempos.push(t);
    });
    reposicoes.forEach(r => {
      if (!r.repositor_nome) return;
      const k = `${r.repositor_nome}:repositor`;
      if (!colabs[k]) colabs[k] = { nome:r.repositor_nome, perfil:'repositor', turno:null, total:0, repostos:0, nao_enc:0, tempos:[] };
      colabs[k].total++;
      if (['reposto','abastecido','subiu'].includes(r.status)) {
        colabs[k].repostos++;
        const t = minutesTime(r.hora_aviso, r.hora_reposto);
        if (t) colabs[k].tempos.push(t);
      }
      if (r.status === 'nao_encontrado') colabs[k].nao_enc++;
    });
    const colaboradores = Object.values(colabs).map(c => {
      const tempo_medio = avgArr(c.tempos);
      const { tempos, ...rest } = c;
      return { ...rest, tempo_medio, pontuacao: Math.round(rest.pontuacao||0) };
    }).sort((a,b) => a.nome.localeCompare(b.nome));

    // ── Ranking de turnos — usa sep_turno (turno do separador que trabalhou o pedido)
    const tMap: Record<string, any> = { Manha:{label:'Manhã',pedidos:0,itens:0,pontuacao:0,tempos:[]}, Tarde:{label:'Tarde',pedidos:0,itens:0,pontuacao:0,tempos:[]}, Noite:{label:'Noite',pedidos:0,itens:0,pontuacao:0,tempos:[]} };
    // Para o ranking usa TODOS os concluídos do dia (não só o turno filtrado)
    pedidos.filter(p => p.status === 'concluido' && p.sep_nome).forEach(p => {
      const t = p.sep_turno || 'Manha';
      if (!tMap[t]) return;
      tMap[t].pedidos++;
      tMap[t].itens     += parseInt(p.itens)||0;
      tMap[t].pontuacao += parseFloat(p.pontuacao)||0;
      const tm = minutesBetween(p.iniciado_em, p.skus_concluido_em || p.concluido_em);
      if (tm) tMap[t].tempos.push(tm);
    });
    const ranking_turnos = Object.values(tMap).map(t => ({
      turno: t.label, pedidos: t.pedidos, itens: t.itens, pontuacao: Math.round(t.pontuacao),
      media_tempo: avgArr(t.tempos),
    })).sort((a,b) => b.pedidos - a.pedidos);

    // ── Por hora ──────────────────────────────────────────────────
    const hMap: Record<string, any> = {};
    sepConcluidos.forEach(p => {
      if (!p.hora_pedido) return;
      const h = p.hora_pedido.substring(0,2);
      hMap[h] = (hMap[h]||0)+1;
    });
    const por_hora = Object.entries(hMap).sort().map(([h,t])=>({hora:h,total:t}));

    // ── Por transportadora ────────────────────────────────────────
    const trMap: Record<string, number> = {};
    sepConcluidos.forEach(p => {
      const t = String(p.transportadora||'Outros').trim()||'Outros';
      trMap[t] = (trMap[t]||0)+1;
    });
    const por_transportadora = Object.entries(trMap).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([t,n])=>({transportadora:t,total:n}));

    // ── Por dia (para ranges) ─────────────────────────────────────
    const dMap: Record<string, any> = {};
    sepConcluidos.forEach(p => { if (p.data_pedido) dMap[p.data_pedido]=(dMap[p.data_pedido]||0)+1; });
    const por_dia = Object.entries(dMap).sort().map(([d,t])=>({data:d,total:t}));

    // ── SLA (separação em até 6h após aguardando_desde) ──────────
    const SLA_H = 6;
    let slaDentro=0, slaFora=0;
    sepConcluidos.filter(p=>p.aguardando_desde&&p.concluido_em).forEach(p=>{
      try {
        const desde = p.aguardando_desde.includes('T')||p.aguardando_desde.includes(' ')
          ? new Date(p.aguardando_desde)
          : new Date(`${p.data_pedido}T${p.aguardando_desde}`);
        const horas = (+new Date(p.concluido_em)-+desde)/3600000;
        if (!isNaN(horas)) horas<=SLA_H ? slaDentro++ : slaFora++;
      } catch {}
    });

    // ── Por dia — total importado ─────────────────────────────────
    const por_dia_total: Record<string, any> = {};
    pedidos.forEach(p=>{ if(p.data_pedido) por_dia_total[p.data_pedido]=(por_dia_total[p.data_pedido]||0)+1; });

    res.json({
      periodo:{ de:dataIni, ate:dataFim },
      turno_filtro: turnoFiltro,
      separacao:{
        // Todos → total geral do dia; turno específico → só os desse turno
        total: turnoFiltro === 'Todos' ? pedidos.length : pedidosDistribuidos.length,
        total_geral: pedidos.length,         // sempre o grand total (para contexto)
        distribuidos: pedidosDistribuidos.length,
        concluidos: sepConcluidos.length,
        pendentes: pedidosDistribuidos.filter(p=>p.status==='pendente').length,
        separando: pedidosDistribuidos.filter(p=>p.status==='separando').length,
        total_itens: sepConcluidos.reduce((s,p)=>s+(parseInt(p.itens)||0),0),
        pontuacao_total: Math.round(sepConcluidos.reduce((s,p)=>s+(parseFloat(p.pontuacao)||0),0)),
        media_tempo_min: avgArr(temposSep),
      },
      checkout:{
        total: checkouts.length,
        concluidos: ckConcluidos.length,
        pendentes: checkouts.filter(c=>c.status!=='concluido').length,
        total_itens: ckConcluidos.reduce((s,c)=>s+(parseInt(c.itens)||0),0),
        media_tempo_min: avgArr(temposCk),
      },
      embalagem:{
        total_embalados: embalagens.length,
        pendentes: pedidosDistribuidos.filter(p=>p.status==='concluido'&&['pendente','embalando','nao_iniciado'].includes(p.status_embalagem||'nao_iniciado')).length,
        total_itens: embalagens.reduce((s,e)=>s+(parseInt(e.itens)||0),0),
        media_tempo_min: avgArr(temposEmb),
      },
      reposicao:{
        total: reposicoes.length,
        resolvidas: reposicoes.filter(r=>['reposto','abastecido','subiu'].includes(r.status)).length,
        pendentes: reposicoes.filter(r=>['pendente','aberto'].includes(r.status)).length,
        nao_encontrados: reposicoes.filter(r=>r.status==='nao_encontrado').length,
      },
      complexidade,
      colaboradores,
      ranking_turnos,
      por_hora,
      por_transportadora,
      por_dia,
      por_dia_total: Object.entries(por_dia_total).sort().map(([d,t])=>({data:d,total:t})),
      sla:{ meta_horas:SLA_H, dentro:slaDentro, fora:slaFora, pct: slaDentro+slaFora>0?Math.round((slaDentro/(slaDentro+slaFora))*100):null },
    });
  } catch(e) { res.status(500).json({erro:e.message}); }
});

module.exports = router;
