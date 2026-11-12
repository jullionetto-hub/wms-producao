import express from 'express';
const router = express.Router();
import { db } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';
import { diaSep } from './_comum';
import { analisarPedido, mediana, PAUSA_SEG, LIMITE_RAJADA_SEG, MIN_ITENS_RAJADA, VELOCIDADE_M_S } from '../../lib/rota-eficiencia';

const MAX_DIAS = 31;
const FORA_DA_ROTA_PCT = 25;   // pedido "fora da rota" = a rota ideal evitaria mais de 25% da caminhada
const MIN_PASSOS = 3;          // com menos paradas distintas não há o que comparar

// ── GET /performance/eficiencia-rota?ini=YYYY-MM-DD&fim=YYYY-MM-DD[&turno=Manha|Tarde|Noite] ──────────────
// Por separador: quanto da caminhada real a rota ideal evitaria, pedidos fora da rota, marcações em rajada e o
// intervalo típico entre itens. Lista também os pedidos mais fora da rota (abrem o rastreio na tela).
router.get('/performance/eficiencia-rota', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  const { ini, fim, turno } = req.query as Record<string, string>;
  if (!ini || !fim || !/^\d{4}-\d{2}-\d{2}$/.test(ini) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) return res.status(400).json({ erro: 'Informe ini e fim (AAAA-MM-DD).' });
  const dias = (Date.parse(fim) - Date.parse(ini)) / 86400000 + 1;
  if (!(dias >= 1) || dias > MAX_DIAS) return res.status(400).json({ erro: `Escolha um período de até ${MAX_DIAS} dias.` });
  try {
    const params: string[] = [ini, fim];
    let filtroTurno = '';
    if (turno) { params.push(turno); filtroTurno = ` AND REPLACE(COALESCE(u.turno, s.turno, 'Manha'), 'ã', 'a') = $3`; }
    const linhas = await db.all<{ pedido_id: number; numero_pedido: string; nome: string; turno: string; endereco: string; hora_verificado: string }>(`
      SELECT p.id AS pedido_id, p.numero_pedido,
             COALESCE(u.nome, s.nome) AS nome,
             REPLACE(COALESCE(u.turno, s.turno, 'Manha'), 'ã', 'a') AS turno,
             i.endereco, i.hora_verificado
      FROM pedidos p
      JOIN separadores s ON s.id = p.separador_id
      LEFT JOIN usuarios u ON u.id = s.usuario_id
      JOIN itens_pedido i ON i.pedido_id = p.id AND COALESCE(i.hora_verificado,'') <> ''
      WHERE p.status = 'concluido' AND s.status = 'ativo'
        AND ${diaSep('p')} >= $1 AND ${diaSep('p')} <= $2 ${filtroTurno}
      ORDER BY p.id, i.hora_verificado
    `, params);

    const porPedido = new Map<number, { numero: string; nome: string; turno: string; itens: { endereco: string; hora_verificado: string }[] }>();
    for (const l of linhas) {
      let g = porPedido.get(l.pedido_id);
      if (!g) { g = { numero: l.numero_pedido, nome: l.nome, turno: l.turno, itens: [] }; porPedido.set(l.pedido_id, g); }
      g.itens.push({ endereco: l.endereco, hora_verificado: l.hora_verificado });
    }

    interface Acum { nome: string; turno: string; pedidos: number; analisados: number; somaReal: number; somaIdeal: number; foraRota: number; comRajada: number; itens: number; itensRajada: number; intervalos: number[] }
    const por = new Map<string, Acum>();
    const pedidosAnalisados: { numero: string; nome: string; turno: string; passos: number; evitavelPct: number; metrosEvitaveis: number; itens: number; itensEmRajada: number }[] = [];
    for (const g of porPedido.values()) {
      const r = analisarPedido(g.itens);
      const chave = g.nome + '|' + g.turno;
      let a = por.get(chave);
      if (!a) { a = { nome: g.nome, turno: g.turno, pedidos: 0, analisados: 0, somaReal: 0, somaIdeal: 0, foraRota: 0, comRajada: 0, itens: 0, itensRajada: 0, intervalos: [] }; por.set(chave, a); }
      a.pedidos++; a.itens += r.itensMarcados; a.itensRajada += r.itensEmRajada; if (r.temRajada) a.comRajada++;
      for (const s of r.intervalosSeg) if (s >= 0 && s <= PAUSA_SEG) a.intervalos.push(s);
      if (r.passos >= MIN_PASSOS) {
        a.analisados++; a.somaReal += r.distReal; a.somaIdeal += r.distIdeal; if (r.evitavelPct > FORA_DA_ROTA_PCT) a.foraRota++;
        pedidosAnalisados.push({ numero: g.numero, nome: g.nome, turno: g.turno, passos: r.passos, evitavelPct: r.evitavelPct, metrosEvitaveis: Math.round(r.distReal - r.distIdeal), itens: r.itensMarcados, itensEmRajada: r.itensEmRajada });
      }
    }
    const pct = (x: number, y: number) => y > 0 ? Math.round(x / y * 1000) / 10 : 0;
    const separadores = [...por.values()].map(a => {
      const med = mediana(a.intervalos);
      return {
        nome: a.nome, turno: a.turno, pedidos: a.pedidos, pedidos_analisados: a.analisados,
        caminhada_evitavel_pct: a.somaReal > 0 ? Math.round((1 - a.somaIdeal / a.somaReal) * 1000) / 10 : 0,
        metros_evitaveis_por_pedido: a.analisados > 0 ? Math.round((a.somaReal - a.somaIdeal) / a.analisados) : 0,
        metros_por_pedido: a.analisados > 0 ? Math.round(a.somaReal / a.analisados) : 0,
        pedidos_fora_rota: a.foraRota, pedidos_fora_rota_pct: pct(a.foraRota, a.analisados),
        pedidos_com_rajada: a.comRajada, pedidos_com_rajada_pct: pct(a.comRajada, a.pedidos),
        itens_em_rajada_pct: pct(a.itensRajada, a.itens),
        intervalo_mediano_seg: med == null ? null : Math.round(med),
      };
    }).sort((x, y) => y.caminhada_evitavel_pct - x.caminhada_evitavel_pct);
    const totalReal = [...por.values()].reduce((s, a) => s + a.somaReal, 0), totalIdeal = [...por.values()].reduce((s, a) => s + a.somaIdeal, 0);
    const todos = [...por.values()].reduce((s, a) => s + a.pedidos, 0), analisados = [...por.values()].reduce((s, a) => s + a.analisados, 0);
    const foraRota = [...por.values()].reduce((s, a) => s + a.foraRota, 0), comRajada = [...por.values()].reduce((s, a) => s + a.comRajada, 0);
    res.json({
      periodo: { ini, fim }, regras: { velocidade_m_s: VELOCIDADE_M_S, fora_da_rota_pct: FORA_DA_ROTA_PCT, rajada_seg: LIMITE_RAJADA_SEG, rajada_min_itens: MIN_ITENS_RAJADA, min_passos: MIN_PASSOS },
      totais: {
        pedidos: todos, pedidos_analisados: analisados,
        caminhada_evitavel_pct: totalReal > 0 ? Math.round((1 - totalIdeal / totalReal) * 1000) / 10 : 0,
        metros_evitaveis: Math.round(totalReal - totalIdeal), minutos_evitaveis: Math.round((totalReal - totalIdeal) / VELOCIDADE_M_S / 60),
        pedidos_fora_rota: foraRota, pedidos_com_rajada: comRajada,
      },
      separadores,
      piores: pedidosAnalisados.sort((x, y) => y.evitavelPct - x.evitavelPct || y.itensEmRajada - x.itensEmRajada).slice(0, 20),
    });
  } catch (e) { res.status(500).json({ erro: (e as Error).message }); }
});

module.exports = router;
