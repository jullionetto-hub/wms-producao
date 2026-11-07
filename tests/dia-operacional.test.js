/**
 * Dia operacional ("data do turno"): a Noite (22:00–06:48) atravessa a meia-noite e conta como o dia
 * em que o turno ENTROU. Cobre os helpers de lib/helpers.js e garante que o painel de Performance usa
 * a regra em todos os setores.
 */
const fs = require('fs');
const path = require('path');
const { diaOperacional, sqlDiaOperacional, VIRADA_NOITE_MIN } = require('../lib/helpers');

describe('diaOperacional (JS)', () => {
  test('a virada é 06:48', () => {
    expect(VIRADA_NOITE_MIN).toBe(6 * 60 + 48);
  });

  test('só pelo relógio: antes das 06:48 vale o dia anterior; de 06:48 em diante, o próprio dia', () => {
    expect(diaOperacional('2026-11-05', '00:00:00')).toBe('2026-11-04');
    expect(diaOperacional('2026-11-05', '03:30')).toBe('2026-11-04');
    expect(diaOperacional('2026-11-05', '06:47:59')).toBe('2026-11-04');
    expect(diaOperacional('2026-11-05', '06:48:00')).toBe('2026-11-05');
    expect(diaOperacional('2026-11-05', '13:00:00')).toBe('2026-11-05');
    expect(diaOperacional('2026-11-05', '22:00:00')).toBe('2026-11-05');
    expect(diaOperacional('2026-11-05', '23:59:59')).toBe('2026-11-05');
  });

  test('o caso do enunciado: o mesmo 05/11 tem a madrugada do turno de 04 e a entrada do turno de 05', () => {
    expect(diaOperacional('2026-11-04', '22:30:00')).toBe('2026-11-04'); // entrada do turno de 04
    expect(diaOperacional('2026-11-05', '00:30:00')).toBe('2026-11-04'); // continua o turno de 04
    expect(diaOperacional('2026-11-05', '22:30:00')).toBe('2026-11-05'); // turno de 05 já separando
  });

  test('vira mês e ano', () => {
    expect(diaOperacional('2026-11-01', '01:00:00')).toBe('2026-10-31');
    expect(diaOperacional('2027-01-01', '02:00:00')).toBe('2026-12-31');
  });

  test('quando o turno é conhecido: só a Noite recua; Manhã e Tarde usam a data do calendário', () => {
    expect(diaOperacional('2026-11-05', '06:20:00', 'Noite')).toBe('2026-11-04');
    expect(diaOperacional('2026-11-05', '06:20:00', 'Madrugada')).toBe('2026-11-04');
    expect(diaOperacional('2026-11-05', '06:20:00', 'Manha')).toBe('2026-11-05'); // Manhã entra às 06:00
    expect(diaOperacional('2026-11-05', '06:20:00', 'Manhã')).toBe('2026-11-05');
    expect(diaOperacional('2026-11-05', '01:00:00', 'Tarde')).toBe('2026-11-05');
  });

  test('entrada inválida devolve a data como veio', () => {
    expect(diaOperacional('2026-11-05', '')).toBe('2026-11-05');
    expect(diaOperacional('2026-11-05', 'abc')).toBe('2026-11-05');
    expect(diaOperacional('', '01:00')).toBe('');
  });
});

describe('sqlDiaOperacional', () => {
  const sql = sqlDiaOperacional({ ts: 'p.iniciado_em', civil: 'p.data_pedido', turno: 'p.turno' });

  test('recua 6h48 só para a Noite e cai na data civil quando o horário é inválido', () => {
    expect(sql).toContain("INTERVAL '6 hours 48 minutes'");
    expect(sql).toContain("~* '^(noite|madrugada)'");
    expect(sql).toMatch(/COALESCE\(CASE WHEN .* END, p\.data_pedido\)$/);
  });

  test('só valida o formato antes de converter para timestamp (linha malformada não derruba a consulta)', () => {
    expect(sql).toContain("~ '^\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}'");
  });

  test('sem turno informado decide só pelo relógio', () => {
    expect(sqlDiaOperacional({ ts: 'x', civil: 'y' })).toContain('WHEN TRUE THEN');
  });
});

describe('painel de Performance usa o dia operacional em todos os setores', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'performance-dash.js'), 'utf8');

  test('a data do calendário (LEFT(iniciado_em,10)) não é mais usada direto nas consultas', () => {
    const ocorrencias = src.match(/COALESCE\(NULLIF\(LEFT\(\w+\.iniciado_em,10\)/g) || [];
    expect(ocorrencias).toHaveLength(1); // só dentro do construtor diaSep (como "data civil" de reserva)
  });

  test('checkout, embalagem, reposição e sessões também passam pela regra', () => {
    ['diaSep(', 'diaCk(', 'diaEmb(', 'diaEmbPed(', 'diaAv(', 'diaAvTent', 'diaSessao'].forEach(n => expect(src).toContain(n));
    expect(src).not.toMatch(/WHERE data >= \$1\s+AND data <= \$2/); // sessões de trabalho
    expect(src).not.toMatch(/GROUP BY operador_nome, data_checkout/);
    expect(src).not.toMatch(/GROUP BY embalado_por, data_embalagem/);
    expect(src).not.toMatch(/GROUP BY repositor_nome, data_aviso/);
  });
});

describe('duração que cruza a meia-noite não pode ser negativa', () => {
  const dash = fs.readFileSync(path.join(__dirname, '..', 'routes', 'performance-dash.js'), 'utf8');
  const kpis = fs.readFileSync(path.join(__dirname, '..', 'routes', 'kpis.js'), 'utf8');

  test('minDia soma 1 dia (1440 min) quando a conta dá negativo', () => {
    const minDia = new Function(dash.match(/const minDia = [^\n]*\n/)[0] + '; return minDia;')();
    const sql = minDia('X');
    expect(sql).toBe('(CASE WHEN (X) < 0 THEN (X) + 1440 ELSE (X) END)::numeric');
  });

  test('checkout e embalagem do painel de Performance usam minDia (início 23:44 / fim 00:01 não vira -1424 min)', () => {
    expect((dash.match(/\$\{minDia\(/g) || []).length).toBeGreaterThanOrEqual(5);
    // nenhuma duração de checkout/embalagem calculada direto, sem o ajuste (tira o que já está dentro de minDia)
    const semAjuste = dash.replace(/\$\{minDia\("[^"]*"\)\}/g, '');
    expect(semAjuste).not.toMatch(/EXTRACT\(EPOCH FROM \(\s*\(?[^\n]*::timestamp\s*-\s*[^\n]*hora_criacao[^\n]*::timestamp\s*\)\)\s*\/\s*60\.0/);
    expect(semAjuste).not.toMatch(/EXTRACT\(EPOCH FROM \(\s*\(?[^\n]*::timestamp\s*-\s*[^\n]*embalagem_iniciado_em[^\n]*::timestamp\s*\)\)\s*\/\s*60\.0/);
  });

  test('KPIs de checkout somam 1 dia quando fim < início (antes virava 0 min)', () => {
    expect((kpis.match(/CASE WHEN EXTRACT\(EPOCH FROM \(\w+\.hora_checkout::time - \w+\.hora_criacao::time\)\) < 0/g) || []).length).toBe(2);
  });
});
