/**
 * WMS Miess — Testes de lib/permissoes.js
 * Middleware de permissões granulares (V12) — camada aditiva sobre requerPerfil.
 * Roda com: npm test
 */

const mockDb = { get: jest.fn() };
jest.mock('../lib/db', () => ({ db: mockDb }));

const { requerPermissao, ACOES } = require('../lib/permissoes');

function mockReqRes(usuarioId = 1) {
  const req = { session: { usuario: { id: usuarioId, login: 'jsilva' } } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  return { req, res, next };
}

describe('requerPermissao', () => {
  beforeEach(() => jest.resetAllMocks());

  test('sem sessão de usuário → deixa passar (requerAuth já roda antes na cadeia)', async () => {
    const { res, next } = mockReqRes();
    const req = {};
    await requerPermissao('excluir')(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(mockDb.get).not.toHaveBeenCalled();
  });

  test('sem nenhuma linha em permissoes_usuario → padrão é permitir (next chamado)', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const { req, res, next } = mockReqRes();
    await requerPermissao('excluir')(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('linha com concedida=true → permite explicitamente', async () => {
    mockDb.get.mockResolvedValueOnce({ concedida: true });
    const { req, res, next } = mockReqRes();
    await requerPermissao('excluir')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('linha com concedida=false → nega com 403, nunca chama next', async () => {
    mockDb.get.mockResolvedValueOnce({ concedida: false });
    const { req, res, next } = mockReqRes();
    await requerPermissao('excluir')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('erro ao consultar o banco → falha aberta (next chamado, nunca trava uma operação já autorizada pelo perfil)', async () => {
    mockDb.get.mockRejectedValueOnce(new Error('conexão perdida'));
    const { req, res, next } = mockReqRes();
    await requerPermissao('excluir')(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('ACOES exporta as 7 ações esperadas', () => {
    expect(ACOES).toEqual(['ver', 'criar', 'editar', 'excluir', 'executar', 'aprovar', 'administrar']);
  });
});
