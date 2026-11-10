/**
 * Quebra o tempo de um checkout concluído em três partes:
 *   - fila:         da entrada na fila (fim da separação) até alguém pegar o pedido
 *   - espera_item:  pedido parado esperando item faltante (pendência → retomada/conclusão)
 *   - trabalho:     tempo efetivamente trabalhado (soma das sessões com tempo registrado)
 *
 * Só temos horários (HH:MM:SS) sem data, então tudo é medido como deslocamento
 * a partir da âncora, sempre "para frente" (módulo 24h) — assim a virada da
 * meia-noite não gera tempo negativo. Pedidos com mais de ~20h de checkout
 * são tratados como dado inconsistente e usam o início do checkout como âncora.
 *
 * Limitação conhecida: quando o operador nunca "abriu" o pedido pelo caixa, a
 * sessão é criada retroativamente na conclusão, com tempo_min calculado só
 * por hora (0 se virou o dia). Nesse caso o trabalho é marcado como "não
 * registrado" em vez de inventar um número.
 */

const DIA = 86400;

export function segundos(h: unknown): number | null {
  if (h == null) return null;
  const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(h));
  if (!m) return null;
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+(m[3] || 0));
}

const aMin = (s: number) => Math.round(s / 60 * 10) / 10;

/** Uma sessão de trabalho do checkout (tabela checkout_sessoes). */
export interface SessaoCheckout {
  hora_inicio?: unknown;
  hora_fim?: unknown;
  acao?: string | null;
  tempo_min?: unknown;
}

export interface EntradaEtapas {
  /** fim da separação (HH:MM[:SS] ou timestamp) = entrada na fila do checkout */
  horaFila?: unknown;
  /** checkout.hora_criacao */
  horaCriacao?: unknown;
  /** checkout.hora_checkout (conclusão) */
  horaCheckout?: unknown;
  /** checkout_sessoes [{hora_inicio, hora_fim, acao, tempo_min}] */
  sessoes?: SessaoCheckout[] | null;
}

export function calcularEtapasCheckout({ horaFila, horaCriacao, horaCheckout, sessoes }: EntradaEtapas) {
  const fim = segundos(horaCheckout);
  if (fim == null) return null;

  let base = segundos(horaFila);
  let ancora = 'separacao';
  if (base == null || (fim - base + DIA) % DIA >= 20 * 3600) {
    base = segundos(horaCriacao);
    ancora = 'checkout';
  }
  if (base == null) return null;

  const baseFixa: number = base;
  const off = (h: unknown): number | null => { const s = segundos(h); return s == null ? null : (s - baseFixa + DIA) % DIA; };
  const total = (fim - base + DIA) % DIA;

  const ss = (sessoes || []).map(s => ({
    ini: off(s.hora_inicio),
    fim: off(s.hora_fim),
    acao: s.acao,
    tempo: Number(s.tempo_min) || 0,
  }));
  if (!ss.length) return { ancora, total_min: aMin(total), sem_detalhe: true as const };

  // Esperas: cada pendência/pausa vale até a próxima sessão que começa depois
  // dela (retomada) ou, se ninguém retomou, até a conclusão.
  const pendencias = ss
    .filter(s => (s.acao === 'aguardando_item' || s.acao === 'pausado') && s.fim != null && s.fim <= total)
    .map(s => s.fim as number)
    .sort((a, b) => a - b);
  const esperas: Array<{ inicio: number; fim: number }> = [];
  let livreAte = -1;
  for (const p of pendencias) {
    if (p < livreAte) continue; // pausa dentro de uma espera que já está contada
    const retomadas = ss.filter(s => s.ini != null && s.ini > p && s.ini <= total).map(s => s.ini as number);
    const fimEspera = retomadas.length ? Math.min(...retomadas) : total;
    esperas.push({ inicio: p, fim: fimEspera });
    livreAte = fimEspera;
  }
  const esperaSeg = esperas.reduce((a, e) => a + (e.fim - e.inicio), 0);

  // Trabalho: soma do tempo registrado, sem contar duas vezes sessões que
  // começam no mesmo instante (sessões retroativas duplicadas).
  const porInicio = new Map<number, number>();
  ss.forEach(s => {
    if (s.tempo > 0 && s.ini != null) porInicio.set(s.ini, Math.max(porInicio.get(s.ini) || 0, s.tempo));
  });
  let trabalhoSeg = [...porInicio.values()].reduce((a, m) => a + m * 60, 0);
  // Sessão longa com tempo_min 0 = tempo perdido (virou o dia ou foi criada retroativamente)
  const tempoPerdido = trabalhoSeg === 0 && ss.some(s =>
    s.ini != null && s.fim != null && s.tempo === 0 && ((s.fim - s.ini + DIA) % DIA) >= 120);
  trabalhoSeg = Math.min(trabalhoSeg, Math.max(0, total - esperaSeg));

  const filaSeg = Math.max(0, total - esperaSeg - trabalhoSeg);

  return {
    ancora,
    total_min: aMin(total),
    fila_min: aMin(filaSeg),
    espera_item_min: aMin(esperaSeg),
    trabalho_min: tempoPerdido ? null : aMin(trabalhoSeg),
    trabalho_registrado: !tempoPerdido,
    esperas: esperas.map(e => ({ min: aMin(e.fim - e.inicio) })),
  };
}
