/* ══ Detecção de Anomalias — cálculo puro (sem banco) ══
   V11 da evolução do WMS: sinaliza separador com ritmo hoje muito abaixo da
   PRÓPRIA média histórica (não comparado com os colegas — cada um tem seu
   próprio ritmo normal). Ignora quem trabalhou pouco hoje (ruído
   estatístico) e quem não tem histórico suficiente pra comparar (não
   inventa um "normal" sem dado real).
══════════════════════════════════════════════════════════════════════ */

export const LIMIAR_RITMO = 0.6;   // ritmo hoje abaixo de 60% do histórico = anomalia
export const MIN_ITENS_HOJE = 20;  // abaixo disso, não há dado suficiente hoje pra julgar

export interface DadosRitmo {
  nome: string;
  itensHoje?: number | null;
  horasHoje?: number | null;
  itensHistorico?: number | null;
  horasHistorico?: number | null;
}

export function detectarAnomaliaRitmo({ nome, itensHoje, horasHoje, itensHistorico, horasHistorico }: DadosRitmo) {
  if (!itensHoje || itensHoje < MIN_ITENS_HOJE || !horasHoje || horasHoje <= 0) return null;
  if (!itensHistorico || !horasHistorico || horasHistorico <= 0) return null;

  const ritmoHoje = itensHoje / horasHoje;
  const ritmoHistorico = itensHistorico / horasHistorico;
  if (ritmoHistorico <= 0) return null;

  const razao = ritmoHoje / ritmoHistorico;
  if (razao >= LIMIAR_RITMO) return null;

  return {
    nome,
    ritmo_hoje: Math.round(ritmoHoje * 10) / 10,
    ritmo_historico: Math.round(ritmoHistorico * 10) / 10,
    pct_do_normal: Math.round(razao * 1000) / 10,
    itens_hoje: itensHoje,
  };
}

export function detectarAnomalias(lista?: DadosRitmo[] | null) {
  return (lista || [])
    .map((d) => detectarAnomaliaRitmo(d))
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
    .sort((a, b) => a.pct_do_normal - b.pct_do_normal);
}
