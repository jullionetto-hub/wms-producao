/* ══ Prioridade de pedido — cálculo puro (sem banco) ══
   V5 da evolução do WMS: classifica um pedido em NORMAL/ATENÇÃO/CRÍTICO de
   forma explicável, a partir do único conceito de SLA que já existe no
   projeto (SLA_HORAS=6, mesmo limite usado em routes/admin.js pro relatório
   histórico e em public/js/dashboard.js pro painel de Alertas e Gargalos).
   Regra: % do SLA já decorrido — 100%+ = crítico (já estourou), 60%+ =
   atenção (perto de estourar), abaixo disso = normal. Sem esse percentual
   calculável, não teria como "explicar" a prioridade como pedido pelo
   usuário — por isso a fórmula é simples e auditável, não um score oculto.
══════════════════════════════════════════════════════════════════════ */

const SLA_HORAS = 6;
const LIMIAR_ATENCAO_PCT = 0.6; // 60% do SLA decorrido

function horasAguardando(aguardandoDesde, agora = new Date()) {
  if (!aguardandoDesde) return null;
  const m = String(aguardandoDesde).match(/^(\d{2})\/(\d{2})\/(\d{4})[ ,T]?(\d{2}):(\d{2})/);
  if (!m) return null;
  const desde = new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]).getTime();
  if (isNaN(desde)) return null;
  return (agora.getTime() - desde) / 3600000;
}

function calcularPrioridade(aguardandoDesde, agora = new Date()) {
  const horas = horasAguardando(aguardandoDesde, agora);
  if (horas == null) {
    return { nivel: 'normal', horas_aguardando: null, pct_sla: null, motivo: 'Sem horário de início registrado.' };
  }
  const pct = horas / SLA_HORAS;
  const horasFmt = horas.toFixed(1);
  let nivel, motivo;
  if (pct >= 1) {
    nivel = 'critico';
    motivo = `Já ultrapassou o SLA de ${SLA_HORAS}h — aguardando há ${horasFmt}h.`;
  } else if (pct >= LIMIAR_ATENCAO_PCT) {
    nivel = 'atencao';
    motivo = `Aguardando há ${horasFmt}h — ${Math.round(pct * 100)}% do SLA de ${SLA_HORAS}h.`;
  } else {
    nivel = 'normal';
    motivo = `Aguardando há ${horasFmt}h — dentro do prazo (SLA de ${SLA_HORAS}h).`;
  }
  return { nivel, horas_aguardando: Math.round(horas * 10) / 10, pct_sla: Math.round(pct * 100), motivo };
}

module.exports = { SLA_HORAS, LIMIAR_ATENCAO_PCT, horasAguardando, calcularPrioridade };
