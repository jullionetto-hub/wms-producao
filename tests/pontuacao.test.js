/**
 * WMS Miess — Testes de lib/pontuacao.js
 * Lógica pura de cálculo de dificuldade de corredor e pontuação de pedido.
 * Roda com: npm test
 */

const { calcularPesoCorredor, calcularPontuacaoPedido, SEGMENTOS_ESTOQUE } = require('../lib/pontuacao');

/* ════════════════════════════════════════════════════════════
   calcularPesoCorredor
════════════════════════════════════════════════════════════ */
describe('calcularPesoCorredor', () => {
  test('endereço vazio/nulo → peso neutro 1.0', () => {
    expect(calcularPesoCorredor(null)).toBe(1.0);
    expect(calcularPesoCorredor(undefined)).toBe(1.0);
    expect(calcularPesoCorredor('')).toBe(1.0);
  });

  test('rua fácil (A–E, P–U) usa peso Facil_Frente = 1.0', () => {
    expect(calcularPesoCorredor('A50')).toBe(1.0);
    expect(calcularPesoCorredor('P50')).toBe(1.0);
  });

  test('rua difícil no fundo (F–L) usa peso Dificil_Fundo = 3.5', () => {
    // F: 1–40 é Fundo/Dificil
    expect(calcularPesoCorredor('F20')).toBe(3.5);
  });

  test('rua média (M, N, O, V–Z) usa peso Medio_*', () => {
    // M: 1–91 é Frente/Medio
    expect(calcularPesoCorredor('M50')).toBe(1.8);
  });

  test('ZA sempre retorna peso máximo 3.5', () => {
    expect(calcularPesoCorredor('ZA12')).toBe(3.5);
    expect(calcularPesoCorredor('za12')).toBe(3.5); // case-insensitive
  });

  test('endereço contendo ARARA sempre retorna peso máximo 3.5', () => {
    expect(calcularPesoCorredor('ARARA-03')).toBe(3.5);
  });

  test('endereço contendo VERT (sem localização primária) retorna peso máximo 3.5', () => {
    expect(calcularPesoCorredor('VERT-N08-CX21')).toBe(3.5);
  });

  test('endereço composto "primário/VERT" usa o peso do endereço PRIMÁRIO, não o do VERT', () => {
    // Caso documentado no código-fonte: o separador vai ao endereço primário,
    // o VERT é só fallback na mesma passagem, não deslocamento extra.
    // N144 cai no intervalo 141–196 → Fundo/Medio = 2.2 (não 3.5 do VERT).
    expect(calcularPesoCorredor('N144/VERT-N08-CX21')).toBe(2.2);
  });

  test('outro endereço composto primário/VERT com rua fácil', () => {
    // P200 cai no intervalo 148–203 → Fundo/Facil = 1.3 (não 3.5 do VERT)
    expect(calcularPesoCorredor('P200/VERT-Q04-CX24')).toBe(1.3);
  });

  test('número fora de todos os intervalos cadastrados da rua cai no fallback da rua (primeiro segmento)', () => {
    // Rua "A" só tem o intervalo 1–84; um número bem acima disso não bate em
    // nenhum intervalo — cai no segundo loop (fallback pela rua).
    expect(calcularPesoCorredor('A9999')).toBe(1.0); // Facil_Frente, mesmo assim
  });

  test('rua não cadastrada retorna peso neutro 1.0', () => {
    expect(calcularPesoCorredor('AAAA1')).toBe(1.0);
  });

  test('endereço sem padrão letra+número retorna peso neutro 1.0', () => {
    expect(calcularPesoCorredor('123')).toBe(1.0);
    expect(calcularPesoCorredor('SEM-NUMERO')).toBe(1.0);
  });

  test('usa só a parte antes da vírgula quando o endereço tem complemento', () => {
    expect(calcularPesoCorredor('A50, prateleira 2')).toBe(calcularPesoCorredor('A50'));
  });

  test('é case-insensitive (minúsculas tratadas como maiúsculas)', () => {
    expect(calcularPesoCorredor('f20')).toBe(calcularPesoCorredor('F20'));
  });

  test('toda rua em SEGMENTOS_ESTOQUE resolve pra um peso > 0 (tabela consistente)', () => {
    for (const [rua, de] of SEGMENTOS_ESTOQUE) {
      expect(calcularPesoCorredor(`${rua}${de}`)).toBeGreaterThan(0);
    }
  });
});

/* ════════════════════════════════════════════════════════════
   calcularPontuacaoPedido
════════════════════════════════════════════════════════════ */
describe('calcularPontuacaoPedido', () => {
  test('lista vazia ou nula → pontuação 0', () => {
    expect(calcularPontuacaoPedido([])).toBe(0);
    expect(calcularPontuacaoPedido(null)).toBe(0);
    expect(calcularPontuacaoPedido(undefined)).toBe(0);
  });

  test('um item, endereço fácil → peso 1.0 × (quantidade + fator fixo de deslocamento)', () => {
    // A50 = Facil_Frente = 1.0; 1 item + 20 (fator fixo) = 21
    expect(calcularPontuacaoPedido([{ endereco: 'A50', quantidade: 1 }])).toBe(21);
  });

  test('quantidade maior aumenta a pontuação proporcionalmente ao peso', () => {
    // 5 itens no mesmo local fácil: 1.0 × (5 + 20) = 25
    expect(calcularPontuacaoPedido([{ endereco: 'A50', quantidade: 5 }])).toBe(25);
  });

  test('itens no mesmo endereço são agrupados numa única visita (não duplicam o fator fixo)', () => {
    const doisItensMesmoLocal = calcularPontuacaoPedido([
      { endereco: 'A50', quantidade: 2 },
      { endereco: 'A50', quantidade: 3 },
    ]);
    // Agrupado: 1 visita com qty=5 → 1.0 × (5 + 20) = 25, igual ao teste anterior
    expect(doisItensMesmoLocal).toBe(25);
  });

  test('itens em locais diferentes somam pontuações de visitas separadas', () => {
    // A50 (Facil_Frente=1.0): 1.0×(1+20)=21 · F20 (Dificil_Fundo=3.5): 3.5×(1+20)=73.5
    // Soma = 94.5 → Math.round arredonda pra 95 (uma única vez, no total)
    const score = calcularPontuacaoPedido([
      { endereco: 'A50', quantidade: 1 },
      { endereco: 'F20', quantidade: 1 },
    ]);
    expect(score).toBe(95);
  });

  test('quantidade ausente conta como 1', () => {
    expect(calcularPontuacaoPedido([{ endereco: 'A50' }])).toBe(21);
  });

  test('endereço ausente usa fallback "X" (sem dígito → peso neutro 1.0)', () => {
    expect(calcularPontuacaoPedido([{ quantidade: 1 }])).toBe(21);
  });

  test('pedido difícil (corredor pesado) pontua mais que um pedido fácil com os mesmos itens', () => {
    const facil    = calcularPontuacaoPedido([{ endereco: 'A50', quantidade: 4 }]);
    const dificil  = calcularPontuacaoPedido([{ endereco: 'F20', quantidade: 4 }]);
    expect(dificil).toBeGreaterThan(facil);
  });

  test('resultado final é sempre um inteiro (Math.round aplicado)', () => {
    const score = calcularPontuacaoPedido([{ endereco: 'M50', quantidade: 3 }]);
    expect(Number.isInteger(score)).toBe(true);
  });
});
