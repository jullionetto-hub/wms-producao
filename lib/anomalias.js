/* ══ Detecção de Anomalias — cálculo puro (sem banco) ══
   V11 da evolução do WMS: sinaliza separador com ritmo hoje muito abaixo da
   PRÓPRIA média histórica (não comparado com os colegas — cada um tem seu
   próprio ritmo normal). Ignora quem trabalhou pouco hoje (ruído
   estatístico) e quem não tem histórico suficiente pra comparar (não
   inventa um "normal" sem dado real).
══════════════════════════════════════════════════════════════════════ */

const LIMIAR_RITMO = 0.6;   // ritmo hoje abaixo de 60% do histórico = anomalia
const MIN_ITENS_HOJE = 20;  // abaixo disso, não há dado suficiente hoje pra julgar

function detectarAnomaliaRitmo({ nome, itensHoje, horasHoje, itensHistorico, horasHistorico }) {
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

function detectarAnomalias(lista) {
  return (lista || [])
    .map(detectarAnomaliaRitmo)
    .filter(Boolean)
    .sort((a, b) => a.pct_do_normal - b.pct_do_normal);
}

module.exports = { LIMIAR_RITMO, MIN_ITENS_HOJE, detectarAnomaliaRitmo, detectarAnomalias };
