const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'matriz.js'), 'utf8');
const pega = nome => src.match(new RegExp(`function ${nome}\\b[\\s\\S]*?\\n}\\n`))[0];

const ctx = {};
vm.createContext(ctx);
['_mzPerformancePct', '_mzStatusPorFaixa', '_mzStatusAbsenteismo', '_mzParseAtrasos', '_mzFmtMin', '_mzFeedbackTexto']
  .forEach(n => vm.runInContext(pega(n), ctx));

const colab = { id: 7, nome: 'Fulana de Tal', cargo: 'Auxiliar de Logística', area: 'Embalagem', turno: 'Manha' };

describe('_mzFeedbackTexto', () => {
  test('caso do card: 91% da meta, sem atraso, 2 ausências justificadas', () => {
    const t = ctx._mzFeedbackTexto({
      mes: 'Setembro/2026', cargo_snapshot: 'Auxiliar de Logística', area_snapshot: 'Embalagem',
      meta: 2520, entregue: 2286, atrasos: 0, faltas_injustificadas: 0, ausencias_justificadas: 2,
      pontos_positivos: 'Demonstra preocupação e atenção.', pontos_construtivos: 'Manter o ritmo.',
      combinado_mes: 'Chegar no horário', autor_nome: 'Gestora',
    }, colab, []);
    expect(t).toContain('FEEDBACK MENSAL — Setembro/2026');
    expect(t).toContain('Colaborador: Fulana de Tal');
    expect(t).toContain('Auxiliar de Logística · Embalagem · Turno Manha');
    expect(t).toContain('Meta: 2520 · Entregue: 2286 · Atingido: 91% (Ótimo)');
    expect(t).toContain('Faltaram 234 para a meta');
    expect(t).toContain('Atrasos no mês: 0min');
    expect(t).toContain('Faltas injustificadas: 0');
    expect(t).toContain('Ausências justificadas: 2');
    expect(t).toContain('PONTOS POSITIVOS\nDemonstra preocupação e atenção.');
    expect(t).toContain('COMBINADO DESTE MÊS\nChegar no horário');
    expect(t).toContain('Feedback registrado por: Gestora');
  });

  test('lista cada dia de atraso com os minutos e o maior atraso', () => {
    const t = ctx._mzFeedbackTexto({
      mes: 'Outubro/2026', atrasos: 75, faltas_injustificadas: 0, ausencias_justificadas: 0,
      absenteismo_mes: 'Atrasos: 03/10: 15min, 10/10: 40min, 17/10: 20min',
    }, colab, []);
    expect(t).toContain('Atrasos no mês: 1h15 (75 min)');
    expect(t).toContain('Dias de atraso (3): 03/10 — 15min; 10/10 — 40min; 17/10 — 20min');
    expect(t).toContain('Maior atraso: 40min em 10/10');
    expect(t).toContain('Detalhes do absenteísmo:\nAtrasos: 03/10');
    expect(t).toContain('Avaliação do absenteísmo: Ruim');
  });

  test('inclui as ausências registradas só do mês do feedback', () => {
    const t = ctx._mzFeedbackTexto({ mes: 'Setembro/2026', atrasos: 0 }, colab, [
      { periodo_label: 'Setembro/2026', data: '12/09', dias: 1, motivo: 'Consulta médica' },
      { periodo_label: 'Agosto/2026', data: '02/08', dias: 2, motivo: 'Outro mês' },
    ]);
    expect(t).toContain('- 12/09 · 1 dia(s) · Consulta médica');
    expect(t).not.toContain('Outro mês');
  });

  test('meta atingida e seções vazias não aparecem', () => {
    const t = ctx._mzFeedbackTexto({ mes: 'Agosto/2026', meta: 100, entregue: 110, pontos_positivos: '  ', outros_pontos: '' }, colab, []);
    expect(t).toContain('Meta atingida');
    expect(t).not.toContain('PONTOS POSITIVOS');
    expect(t).not.toContain('OUTROS PONTOS');
    expect(t).not.toContain('ABSENTEÍSMO'); // sem dados de absenteísmo
  });

  test('colaborador desconhecido não quebra', () => {
    const t = ctx._mzFeedbackTexto({ mes: 'Agosto/2026' }, undefined, undefined);
    expect(t).toContain('Colaborador: —');
  });
});
