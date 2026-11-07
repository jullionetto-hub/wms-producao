/**
 * Detalhe do pedido (Performance): checkout quebrado em fila / espera do item /
 * trabalho, e aviso de reposição pendente visível no card de Reposição.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { calcularEtapasCheckout } = require('../lib/checkout-etapas');

describe('calcularEtapasCheckout', () => {
  test('caso real #5707115: fila ~3h, espera do item ~1h44, trabalho sem registro (virou o dia)', () => {
    const r = calcularEtapasCheckout({
      horaFila: '2026-11-06 22:16:36',
      horaCriacao: '22:17:35',
      horaCheckout: '03:02:25',
      sessoes: [
        { hora_inicio: '22:17:35', hora_fim: '01:18:05', acao: 'aguardando_item', tempo_min: 0 },
        { hora_inicio: '22:17:35', hora_fim: '03:02:25', acao: 'concluido', tempo_min: 0 },
      ],
    });
    expect(r.ancora).toBe('separacao');
    expect(r.total_min).toBeCloseTo(285.8, 0);       // 4h45
    expect(r.espera_item_min).toBeCloseTo(104.3, 0); // 1h44
    expect(r.fila_min).toBeCloseTo(181.5, 0);        // ~3h01
    expect(r.trabalho_registrado).toBe(false);
    expect(r.trabalho_min).toBeNull();
  });

  test('fluxo normal sem pendência: fila + trabalho = total', () => {
    const r = calcularEtapasCheckout({
      horaFila: '10:00:00', horaCriacao: '10:04:00', horaCheckout: '10:09:00',
      sessoes: [{ hora_inicio: '10:04:00', hora_fim: '10:09:00', acao: 'concluido', tempo_min: 5 }],
    });
    expect(r.total_min).toBe(9);
    expect(r.fila_min).toBe(4);
    expect(r.espera_item_min).toBe(0);
    expect(r.trabalho_min).toBe(5);
    expect(r.trabalho_registrado).toBe(true);
  });

  test('pendência retomada: espera vai da pendência até a retomada, e o trabalho soma as duas sessões', () => {
    const r = calcularEtapasCheckout({
      horaFila: '09:00:00', horaCriacao: '09:10:00', horaCheckout: '11:00:00',
      sessoes: [
        { hora_inicio: '09:10:00', hora_fim: '09:20:00', acao: 'aguardando_item', tempo_min: 10 },
        { hora_inicio: '10:30:00', hora_fim: '11:00:00', acao: 'concluido', tempo_min: 30 },
      ],
    });
    expect(r.total_min).toBe(120);
    expect(r.espera_item_min).toBe(70);  // 09:20 → 10:30
    expect(r.trabalho_min).toBe(40);
    expect(r.fila_min).toBe(10);
    expect(r.fila_min + r.espera_item_min + r.trabalho_min).toBe(r.total_min);
  });

  test('pausa dentro de uma espera já contada não duplica o tempo', () => {
    const r = calcularEtapasCheckout({
      horaFila: '09:00:00', horaCriacao: '09:00:00', horaCheckout: '10:00:00',
      sessoes: [
        { hora_inicio: '09:00:00', hora_fim: '09:10:00', acao: 'aguardando_item', tempo_min: 10 },
        { hora_inicio: '09:00:00', hora_fim: '09:10:05', acao: 'pausado', tempo_min: 10 },
      ],
    });
    expect(r.espera_item_min).toBe(50);
    expect(r.trabalho_min).toBe(10); // sessões idênticas não somam duas vezes
  });

  test('nunca devolve tempo negativo e as partes não passam do total', () => {
    const r = calcularEtapasCheckout({
      horaFila: '23:50:00', horaCriacao: '23:55:00', horaCheckout: '00:10:00',
      sessoes: [{ hora_inicio: '23:55:00', hora_fim: '00:10:00', acao: 'concluido', tempo_min: 999 }],
    });
    [r.total_min, r.fila_min, r.espera_item_min, r.trabalho_min].forEach(v => expect(v).toBeGreaterThanOrEqual(0));
    expect(r.fila_min + r.espera_item_min + r.trabalho_min).toBeLessThanOrEqual(r.total_min + 0.11);
  });

  test('fim da separação inconsistente (mais de 20h antes) usa o início do checkout como âncora', () => {
    const r = calcularEtapasCheckout({
      horaFila: '12:00:00', horaCriacao: '08:00:00', horaCheckout: '08:30:00',
      sessoes: [{ hora_inicio: '08:00:00', hora_fim: '08:30:00', acao: 'concluido', tempo_min: 30 }],
    });
    expect(r.ancora).toBe('checkout');
    expect(r.total_min).toBe(30);
  });

  test('sem sessões não dá pra separar; sem conclusão devolve null', () => {
    expect(calcularEtapasCheckout({ horaFila: '10:00', horaCriacao: '10:00', horaCheckout: '10:20', sessoes: [] }))
      .toEqual({ ancora: 'separacao', total_min: 20, sem_detalhe: true });
    expect(calcularEtapasCheckout({ horaFila: '10:00', horaCriacao: '10:00', horaCheckout: '', sessoes: [] })).toBeNull();
  });
});

describe('cards do pedido (front-end)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'performance-dash.js'), 'utf8');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src.match(/function pfFmtTempo[\s\S]*?\n}\n/)[0], ctx);
  vm.runInContext(src.match(/function pfEsc[\s\S]*?\n}\n/)[0], ctx);
  ['pfRenderEtapasCheckout', 'pfRenderAvisosReposicao']
    .forEach(n => vm.runInContext(src.match(new RegExp(`function ${n}\\([\\s\\S]*?\\n}\\n`))[0], ctx));

  test('mostra os três tempos separados', () => {
    const html = ctx.pfRenderEtapasCheckout({ total_min: 285.8, fila_min: 181.5, espera_item_min: 104.3, trabalho_min: null, trabalho_registrado: false });
    expect(html).toContain('Tempo de fila');
    expect(html).toContain('Espera do item');
    expect(html).toContain('Tempo de trabalho');
    expect(html).toContain('3h 02min');
    expect(html).toContain('1h 44min');
    expect(html).toContain('sem registro');
  });

  test('sem detalhe das sessões não desenha nada', () => {
    expect(ctx.pfRenderEtapasCheckout(null)).toBe('');
    expect(ctx.pfRenderEtapasCheckout({ total_min: 20, sem_detalhe: true })).toBe('');
  });

  test('aviso pendente aparece em destaque com o item e quem avisou', () => {
    const html = ctx.pfRenderAvisosReposicao([{
      id: 231, codigo: 'HZ448', descricao: 'Item <b>X</b>', status: 'pendente',
      data_aviso: '2026-11-06', hora_aviso: '22:16:36', separador_nome: 'Ana', repositor: null, hora_reposto: null,
    }]);
    expect(html).toContain('⚠ Aviso Pendente');
    expect(html).toContain('HZ448');
    expect(html).toContain('22:16 06/11');
    expect(html).toContain('por Ana');
    expect(html).toContain('há ');
    expect(html).not.toContain('<b>X</b>'); // escapado
  });

  test('aviso resolvido não é alarmante e mostra quando foi resolvido', () => {
    const html = ctx.pfRenderAvisosReposicao([{
      codigo: 'A1', descricao: 'Item', status: 'abastecido', data_aviso: '2026-11-06', hora_aviso: '10:00:00',
      repositor: 'Gustavo', hora_reposto: '10:12:00',
    }]);
    expect(html).toContain('Aviso Abastecido');
    expect(html).not.toContain('⚠');
    expect(html).toContain('resolvido 10:12');
    expect(html).toContain('repositor Gustavo');
    expect(ctx.pfRenderAvisosReposicao([])).toBe('');
  });
});
