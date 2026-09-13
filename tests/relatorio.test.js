/**
 * WMS Miess — Testes de lib/relatorio.js
 * gerarRelatorio agrega pedidos/faltas/checkouts do dia e grava um resumo.
 * Roda com: npm test
 */

const mockDb = {
  run: jest.fn(),
  get: jest.fn(),
  all: jest.fn(),
};
const mockPool = {
  query: jest.fn().mockResolvedValue({ rows: [] }),
};
jest.mock('../lib/db', () => ({ db: mockDb, pool: mockPool }));
jest.mock('../lib/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));

const { gerarRelatorio } = require('../lib/relatorio');

beforeEach(() => {
  jest.clearAllMocks();
  mockPool.query.mockResolvedValue({ rows: [] });
});

describe('gerarRelatorio', () => {
  test('agrega contagens corretas de pedidos concluídos/pendentes e itens totais', async () => {
    mockDb.all
      .mockResolvedValueOnce([ // pedidos
        { sep_nome: 'Ana', status: 'concluido', itens: 5 },
        { sep_nome: 'Ana', status: 'pendente', itens: 3 },
        { sep_nome: 'Bruno', status: 'concluido', itens: 2 },
      ])
      .mockResolvedValueOnce([]) // faltas
      .mockResolvedValueOnce([]) // checkouts
      .mockResolvedValueOnce([{ nome: 'Ana' }, { nome: 'Bruno' }]); // seps ativos

    const rel = await gerarRelatorio('2026-09-13');

    expect(rel.total_pedidos).toBe(3);
    expect(rel.pedidos_concluidos).toBe(2);
    expect(rel.pedidos_pendentes).toBe(1);
    expect(rel.total_itens).toBe(10);
    expect(rel.separadores_ativos).toBe(2);
  });

  test('agrupa itens/concluídos/pendentes por separador em dados_json (porSep)', async () => {
    mockDb.all
      .mockResolvedValueOnce([
        { sep_nome: 'Ana', status: 'concluido', itens: 5 },
        { sep_nome: 'Ana', status: 'pendente', itens: 3 },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const rel = await gerarRelatorio('2026-09-13');
    const dados = JSON.parse(rel.dados_json);

    expect(dados.porSep.Ana).toEqual({ concluidos: 1, pendentes: 1, itens: 8 });
  });

  test('pedidos sem separador vinculado (sep_nome nulo) não entram em porSep', async () => {
    mockDb.all
      .mockResolvedValueOnce([{ sep_nome: null, status: 'pendente', itens: 1 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const rel = await gerarRelatorio('2026-09-13');
    const dados = JSON.parse(rel.dados_json);

    expect(Object.keys(dados.porSep)).toHaveLength(0);
    expect(rel.total_pedidos).toBe(1); // mas ainda conta no total geral
  });

  test('conta faltas abastecidas e não encontradas separadamente', async () => {
    mockDb.all
      .mockResolvedValueOnce([]) // pedidos
      .mockResolvedValueOnce([  // faltas
        { status: 'abastecido' },
        { status: 'abastecido' },
        { status: 'nao_encontrado' },
        { status: 'pendente' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const rel = await gerarRelatorio('2026-09-13');
    expect(rel.total_faltas).toBe(4);
    expect(rel.faltas_abastecidas).toBe(2);
    expect(rel.faltas_nao_encontradas).toBe(1);
  });

  test('conta só checkouts concluídos em total_checkouts', async () => {
    mockDb.all
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: 'concluido' }, { status: 'pendente' }, { status: 'concluido' }])
      .mockResolvedValueOnce([]);

    const rel = await gerarRelatorio('2026-09-13');
    expect(rel.total_checkouts).toBe(2);
  });

  test('grava o resumo no banco via pool.query (INSERT ... ON CONFLICT)', async () => {
    mockDb.all.mockResolvedValue([]);
    await gerarRelatorio('2026-09-13');

    expect(mockPool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = mockPool.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO relatorios_diarios/);
    expect(sql).toMatch(/ON CONFLICT/);
    expect(params[0]).toBe('2026-09-13');
  });

  test('erro no banco não propaga — retorna null (falha silenciosa registrada no logger)', async () => {
    mockDb.all.mockRejectedValueOnce(new Error('DB indisponível'));
    const rel = await gerarRelatorio('2026-09-13');
    expect(rel).toBeNull();
  });
});
