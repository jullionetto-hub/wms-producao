/**
 * WMS Miess — Testes de lib/absenteismo.js
 * Lógica pura de parsing do espelho de ponto (PDF InPonto) e classificação
 * de atraso/absenteísmo. Roda com: npm test
 */

const {
  parseEspelhoPonto, inferirHorariosEsperados, classificarDia, classificarAbsenteismoMes,
  paraMinutos, paraHHMM, extrairEmpresaDoArquivo, mesReferencia, ehDiaUtilEsperado,
} = require('../lib/absenteismo');

/* ════════════════════════════════════════════════════════════
   paraMinutos / paraHHMM
════════════════════════════════════════════════════════════ */
describe('paraMinutos', () => {
  test('converte HH:MM em minutos desde meia-noite', () => {
    expect(paraMinutos('10:30')).toBe(630);
    expect(paraMinutos('00:00')).toBe(0);
    expect(paraMinutos('23:59')).toBe(1439);
  });
});

describe('paraHHMM', () => {
  test('converte minutos de volta em HH:MM', () => {
    expect(paraHHMM(630)).toBe('10:30');
    expect(paraHHMM(0)).toBe('00:00');
    expect(paraHHMM(1439)).toBe('23:59');
  });

  test('minutos >= 1440 dão a volta no dia (módulo 24h)', () => {
    expect(paraHHMM(1440)).toBe('00:00');
    expect(paraHHMM(1450)).toBe('00:10');
  });

  test('minutos negativos também dão a volta corretamente (ex: intervalo cruzando meia-noite)', () => {
    expect(paraHHMM(-10)).toBe('23:50');
    expect(paraHHMM(-1440)).toBe('00:00');
  });
});

/* ════════════════════════════════════════════════════════════
   extrairEmpresaDoArquivo
════════════════════════════════════════════════════════════ */
describe('extrairEmpresaDoArquivo', () => {
  test('extrai o nome da empresa do padrão de nome de arquivo do InPonto', () => {
    expect(extrairEmpresaDoArquivo('espelho_ponto_USEECOM30082026_082632.pdf')).toBe('USEECOM');
  });

  test('troca separadores (_/-) por espaço quando o nome da empresa tem mais de uma palavra', () => {
    expect(extrairEmpresaDoArquivo('espelho-ponto-MIESS_LOG-30082026-082632.pdf')).toBe('MIESS LOG');
  });

  test('nome de arquivo fora do padrão retorna string vazia', () => {
    expect(extrairEmpresaDoArquivo('documento_qualquer.pdf')).toBe('');
  });

  test('nome de arquivo ausente retorna string vazia', () => {
    expect(extrairEmpresaDoArquivo(null)).toBe('');
    expect(extrairEmpresaDoArquivo(undefined)).toBe('');
    expect(extrairEmpresaDoArquivo('')).toBe('');
  });
});

/* ════════════════════════════════════════════════════════════
   mesReferencia
════════════════════════════════════════════════════════════ */
describe('mesReferencia', () => {
  test('mapeia data ISO pro mês/ano em português (mês em que o período FECHA)', () => {
    expect(mesReferencia('2026-08-26')).toBe('Agosto/2026');
    expect(mesReferencia('2026-01-15')).toBe('Janeiro/2026');
    expect(mesReferencia('2026-12-31')).toBe('Dezembro/2026');
  });

  test('data ausente ou vazia retorna string vazia', () => {
    expect(mesReferencia('')).toBe('');
    expect(mesReferencia(null)).toBe('');
    expect(mesReferencia(undefined)).toBe('');
  });

  test('mês inválido (fora de 1–12) retorna string vazia', () => {
    expect(mesReferencia('2026-13-01')).toBe('');
    expect(mesReferencia('2026-00-01')).toBe('');
  });
});

/* ════════════════════════════════════════════════════════════
   classificarAbsenteismoMes
════════════════════════════════════════════════════════════ */
describe('classificarAbsenteismoMes', () => {
  test('qualquer falta injustificada → Ruim, independente do resto', () => {
    expect(classificarAbsenteismoMes({ atrasoMin: 0, faltasInjustificadas: 1, ausenciasJustificadas: 0 })).toBe('Ruim');
  });

  test('atraso acima de 30min → Ruim', () => {
    expect(classificarAbsenteismoMes({ atrasoMin: 31, faltasInjustificadas: 0, ausenciasJustificadas: 0 })).toBe('Ruim');
  });

  test('atraso de exatamente 30min NÃO é Ruim por esse critério (limite é > 30)', () => {
    expect(classificarAbsenteismoMes({ atrasoMin: 30, faltasInjustificadas: 0, ausenciasJustificadas: 0 })).not.toBe('Ruim');
  });

  test('2 ou mais ausências justificadas → Ruim', () => {
    expect(classificarAbsenteismoMes({ atrasoMin: 0, faltasInjustificadas: 0, ausenciasJustificadas: 2 })).toBe('Ruim');
  });

  test('sem atraso relevante e sem ausência → Ótimo', () => {
    expect(classificarAbsenteismoMes({ atrasoMin: 0, faltasInjustificadas: 0, ausenciasJustificadas: 0 })).toBe('Ótimo');
    expect(classificarAbsenteismoMes({ atrasoMin: 10, faltasInjustificadas: 0, ausenciasJustificadas: 0 })).toBe('Ótimo');
  });

  test('1 ausência justificada, mesmo com pouco atraso, não é Ótimo (cai pra Mediano)', () => {
    expect(classificarAbsenteismoMes({ atrasoMin: 5, faltasInjustificadas: 0, ausenciasJustificadas: 1 })).toBe('Mediano');
  });

  test('atraso moderado (entre 11 e 30min), sem falta/ausência → Mediano', () => {
    expect(classificarAbsenteismoMes({ atrasoMin: 20, faltasInjustificadas: 0, ausenciasJustificadas: 0 })).toBe('Mediano');
    expect(classificarAbsenteismoMes({ atrasoMin: 30, faltasInjustificadas: 0, ausenciasJustificadas: 0 })).toBe('Mediano');
  });
});

/* ════════════════════════════════════════════════════════════
   classificarDia
════════════════════════════════════════════════════════════ */
describe('classificarDia', () => {
  test('menos de 2 registros no dia → não dá pra classificar nada', () => {
    expect(classificarDia(['06:00'], 'Manhã', {}, 'Seg')).toEqual({});
    expect(classificarDia([], 'Manhã', {}, 'Seg')).toEqual({});
  });

  test('turno oficial reconhecido (Manhã) com 4 marcações — entrada e almoço', () => {
    // Manhã oficial: entrada 06:00, almoço+pausa permitidos = 75min
    const out = classificarDia(['06:10', '10:00', '11:00', '15:00'], 'Logistica - Manhã 06h', {}, 'Seg');
    expect(out.entrada_hora).toBe('06:10');
    expect(out.entrada_atraso_min).toBe(10); // 06:10 - 06:00
    expect(out.almoco_retorno_hora).toBe('11:00');
    expect(out.almoco_atraso_min).toBe(-15); // duração 60min, permitido 75min → 15min de sobra
  });

  test('sábado usa a entrada reduzida do turno (entradaSabado), não a entrada normal', () => {
    // Tarde: entrada normal 13:00, entrada sábado 10:00
    const semSabado = classificarDia(['13:05', '17:00'], 'Tarde', {}, 'Sex');
    expect(semSabado.entrada_atraso_min).toBe(5); // 13:05 - 13:00

    const comSabado = classificarDia(['10:05', '14:00'], 'Tarde', {}, 'Sábado');
    expect(comSabado.entrada_atraso_min).toBe(5); // 10:05 - 10:00 (entrada de sábado), não contra 13:00
  });

  test('turno oficial com 6 marcações identifica o intervalo mais longo como almoço', () => {
    // Madrugada oficial: entrada 22:00, almoço permitido 60min, pausa permitida 15min
    const out = classificarDia(
      ['22:00', '02:00', '03:05', '05:00', '05:20', '06:00'],
      'Logistica - Madrugada 22h', {}, 'Qua'
    );
    expect(out.entrada_atraso_min).toBe(0);
    // 02:00→03:05 = 65min (o mais longo) = almoço; 05:00→05:20 = 20min = pausa
    expect(out.almoco_retorno_hora).toBe('03:05');
    expect(out.almoco_atraso_min).toBe(5);  // 65 - 60 permitido
    expect(out.pausa_retorno_hora).toBe('05:20');
    expect(out.pausa_atraso_min).toBe(5);   // 20 - 15 permitido
  });

  test('turno não reconhecido e sem mediana disponível → não classifica nada', () => {
    expect(classificarDia(['08:00', '17:00'], 'Turno Especial XYZ', {}, 'Seg')).toEqual({});
  });

  test('turno não reconhecido mas com mediana disponível → usa o desvio da mediana', () => {
    const esperado = { 'Turno Especial|4': [480, 720, 780, 1020] }; // 08:00, 12:00, 13:00, 17:00
    const out = classificarDia(['08:05', '12:00', '13:00', '17:00'], 'Turno Especial', esperado, 'Seg');
    expect(out.entrada_atraso_min).toBe(5);   // 485 - 480
    expect(out.almoco_atraso_min).toBe(0);    // registros[2]=13:00=780, mediana[2]=780
  });
});

/* ════════════════════════════════════════════════════════════
   inferirHorariosEsperados
════════════════════════════════════════════════════════════ */
describe('inferirHorariosEsperados', () => {
  test('calcula a mediana por posição, agrupando por horário + quantidade de marcações', () => {
    const dias = [
      { horario: 'Manhã Livre', registros: ['06:00', '15:00'] },
      { horario: 'Manhã Livre', registros: ['06:10', '15:05'] },
      { horario: 'Manhã Livre', registros: ['05:55', '14:58'] },
    ];
    const esperado = inferirHorariosEsperados(dias);
    expect(esperado['Manhã Livre|2']).toEqual([paraMinutos('06:00'), paraMinutos('15:00')]);
  });

  test('dias com menos de 2 registros são ignorados (não formam grupo)', () => {
    const dias = [
      { horario: 'X', registros: ['06:00'] },
      { horario: 'X', registros: [] },
    ];
    expect(inferirHorariosEsperados(dias)).toEqual({});
  });

  test('horários ou quantidades diferentes formam grupos separados', () => {
    const dias = [
      { horario: 'Manhã', registros: ['06:00', '15:00'] },
      { horario: 'Tarde', registros: ['13:00', '22:00'] },
      { horario: 'Manhã', registros: ['06:00', '15:00', '16:00', '17:00'] }, // outra contagem, outro grupo
    ];
    const esperado = inferirHorariosEsperados(dias);
    expect(Object.keys(esperado).sort()).toEqual(['Manhã|2', 'Manhã|4', 'Tarde|2'].sort());
  });
});

/* ════════════════════════════════════════════════════════════
   parseEspelhoPonto (integração — separa blocos, extrai cabeçalho e dias)
════════════════════════════════════════════════════════════ */
describe('parseEspelhoPonto', () => {
  test('texto vazio ou sem "Colaborador:" retorna lista vazia', () => {
    expect(parseEspelhoPonto('', 'arquivo.pdf')).toEqual([]);
    expect(parseEspelhoPonto('texto qualquer sem marcador', 'arquivo.pdf')).toEqual([]);
  });

  test('extrai nome, setor e empresa de um bloco de colaborador bem formado', () => {
    const texto = 'Colaborador: João da Silva Setor: Logística Espelho de Ponto ' +
      'Matrícula: 123 Horário: Manhã Período: 01/08/2026 a 31/08/2026 ' +
      'CNPJ: 12.345.678/0001-99 Admissão: 01/01/2020 Data de Emissão: 31/08/2026 ' +
      'Pis: 12345678901 Id Usuário: 1 CPF: 98765432100 Data D H Registros TOTAL';
    const resultado = parseEspelhoPonto(texto, 'espelho_ponto_MIESS30082026_082632.pdf');
    expect(resultado).toHaveLength(1);
    expect(resultado[0].nome).toBe('João da Silva');
    expect(resultado[0].setor).toBe('Logística');
    expect(resultado[0].empresa).toBe('MIESS');
    expect(resultado[0].admissao).toBe('2020-01-01');
  });

  test('separa corretamente múltiplos colaboradores no mesmo texto', () => {
    const bloco = (nome) => `Colaborador: ${nome} Setor: Log Espelho de Ponto ` +
      'Matrícula: 1 Horário: Manhã Período: a CNPJ: 1 Admissão: 01/01/2020 Data de Emissão: ' +
      '31/08/2026 Pis: 1 Id Usuário: 1 CPF: 1 Data D H Registros TOTAL ';
    const texto = bloco('Ana Souza') + bloco('Bruno Lima');
    const resultado = parseEspelhoPonto(texto, 'espelho_ponto_MIESS30082026_082632.pdf');
    expect(resultado.map(c => c.nome)).toEqual(['Ana Souza', 'Bruno Lima']);
  });

  test('linha de dia com registros batidos e status são extraídos (extrairDias, via parseEspelhoPonto)', () => {
    const texto = 'Colaborador: Carlos Reis Setor: Log Espelho de Ponto ' +
      'Matrícula: 1 Horário: Manhã Período: a CNPJ: 1 Admissão: 01/01/2020 Data de Emissão: 31/08/2026 ' +
      'Pis: 1 Id Usuário: 1 CPF: 1 Data D H Registros ' +
      '27/07/2026Seg1006:05o12:00i13:05o17:00i ' +
      '28/07/2026TerFérias ' +
      'TOTAL';
    const resultado = parseEspelhoPonto(texto, 'x.pdf');
    expect(resultado).toHaveLength(1);
    const dias = resultado[0].dias;
    expect(dias).toHaveLength(2);
    expect(dias[0].data).toBe('2026-07-27');
    expect(dias[0].dia_semana).toBe('Seg');
    expect(dias[0].registros).toEqual(['06:05', '12:00', '13:05', '17:00']);
    expect(dias[1].data).toBe('2026-07-28');
    expect(dias[1].status).toBe('Férias');
    expect(dias[1].registros).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════
   ehDiaUtilEsperado
════════════════════════════════════════════════════════════ */
describe('ehDiaUtilEsperado', () => {
  test('domingo nunca é dia útil, seja qual for o turno', () => {
    expect(ehDiaUtilEsperado('Logistica - Manhã 06h - 15h20', 'Dom')).toBe(false);
    expect(ehDiaUtilEsperado('Logistica - Tarde 13h - 22h', 'Dom')).toBe(false);
    expect(ehDiaUtilEsperado('Logistica - Madrugada 22h - 06h48', 'Dom')).toBe(false);
  });

  test('sábado é dia útil pra Manhã/Tarde, mas não pra Madrugada', () => {
    expect(ehDiaUtilEsperado('Logistica - Manhã 06h - 15h20', 'Sáb')).toBe(true);
    expect(ehDiaUtilEsperado('Logistica - Tarde 13h - 22h', 'Sáb')).toBe(true);
    expect(ehDiaUtilEsperado('Logistica - Madrugada 22h - 06h48', 'Sáb')).toBe(false);
    expect(ehDiaUtilEsperado('Logistica - Madrugada 22h - 06h48', 'Sab')).toBe(false); // sem acento
  });

  test('segunda a sexta é dia útil pra qualquer turno, inclusive turno não reconhecido', () => {
    ['Seg','Ter','Qua','Qui','Sex'].forEach(d => {
      expect(ehDiaUtilEsperado('Logistica - Manhã 06h - 15h20', d)).toBe(true);
      expect(ehDiaUtilEsperado('Logistica - Madrugada 22h - 06h48', d)).toBe(true);
      expect(ehDiaUtilEsperado('Turno desconhecido', d)).toBe(true);
    });
  });
});
