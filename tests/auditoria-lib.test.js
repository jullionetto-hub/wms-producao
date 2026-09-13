/**
 * WMS Miess — Testes de lib/auditoria.js (registrarAuditoria)
 * Wrapper de log de auditoria — nunca deve propagar erro pro chamador.
 * Roda com: npm test
 */

const mockPool = { query: jest.fn().mockResolvedValue({ rows: [] }) };
jest.mock('../lib/db', () => ({ pool: mockPool }));
jest.mock('../lib/helpers', () => {
  const real = jest.requireActual('../lib/helpers');
  return { ...real, dataHoraLocal: () => ({ data: '2026-09-13', hora: '10:00:00' }) };
});

const { registrarAuditoria } = require('../lib/auditoria');

beforeEach(() => {
  jest.clearAllMocks();
  mockPool.query.mockResolvedValue({ rows: [] });
});

describe('registrarAuditoria', () => {
  test('grava usuário, ação e ip a partir da sessão da requisição', async () => {
    const req = { session: { usuario: { id: 1, login: 'admin', nome: 'Admin' } }, ip: '1.2.3.4' };
    await registrarAuditoria(req, 'LOGIN');

    expect(mockPool.query).toHaveBeenCalledTimes(1);
    const [, params] = mockPool.query.mock.calls[0];
    expect(params).toEqual([1, 'admin', 'Admin', 'LOGIN', '', null, null, null, '1.2.3.4', '2026-09-13', '10:00:00']);
  });

  test('requisição sem sessão usa "sistema" como usuário e null como id', async () => {
    const req = { ip: '9.9.9.9' };
    await registrarAuditoria(req, 'JOB_AUTOMATICO');

    const [, params] = mockPool.query.mock.calls[0];
    expect(params[0]).toBeNull();       // usuario_id
    expect(params[1]).toBe('sistema');  // usuario_login
    expect(params[2]).toBe('sistema');  // usuario_nome
  });

  test('serializa dados_antes e dados_depois em JSON quando informados', async () => {
    const req = { session: { usuario: { id: 1, login: 'admin', nome: 'Admin' } } };
    await registrarAuditoria(req, 'EDITAR', 'usuarios', 5, { nome: 'Antigo' }, { nome: 'Novo' });

    const [, params] = mockPool.query.mock.calls[0];
    expect(params[5]).toBe(5); // entidade_id
    expect(JSON.parse(params[6])).toEqual({ nome: 'Antigo' });
    expect(JSON.parse(params[7])).toEqual({ nome: 'Novo' });
  });

  test('sem ip explícito nem connection.remoteAddress, usa "unknown"', async () => {
    const req = { session: { usuario: { id: 1, login: 'a', nome: 'A' } } };
    await registrarAuditoria(req, 'ACAO');
    const [, params] = mockPool.query.mock.calls[0];
    expect(params[8]).toBe('unknown');
  });

  test('erro no banco não propaga pro chamador (falha silenciosa)', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('DB fora do ar'));
    const req = { session: { usuario: { id: 1, login: 'a', nome: 'A' } } };
    await expect(registrarAuditoria(req, 'ACAO')).resolves.toBeUndefined();
  });
});
