/**
 * Item 1 (segurança):
 *  - a migração de hashes legados (SHA-256) não pode gravar NENHUMA senha no log (logs do Railway são visíveis a quem tem acesso);
 *  - o admin padrão ('admin' / '123456') só é criado quando NÃO existe nenhum usuário (antes voltava a cada reinício se o login sumisse).
 */
const mockPool = { query: jest.fn() };
const mockLog = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn(), debug: jest.fn() };
jest.mock('../lib/db', () => ({ pool: mockPool, db: {} }));
jest.mock('../lib/logger', () => mockLog);

const { runSchema } = require('../src/database/migrate');
const { criarUsuarioPadrao } = require('../src/database/seed');

beforeEach(() => { jest.clearAllMocks(); });

describe('migração de hashes legados: senha nunca vai para o log', () => {
  test('invalida o hash antigo com uma senha aleatória descartada e loga só login/nome', async () => {
    const updates = [];
    mockPool.query.mockImplementation(async (sql, params) => {
      const s = String(sql).replace(/\s+/g, ' ').trim();
      if (/^SELECT id, login, nome FROM usuarios/.test(s)) return { rows: [{ id: 7, login: 'maria', nome: 'Maria Silva' }] };
      if (/^UPDATE usuarios SET senha_hash/.test(s)) updates.push(params);
      return { rows: [] };
    });

    await runSchema();

    // o hash foi trocado por um bcrypt novo, marcado como temporário
    expect(updates).toHaveLength(1);
    expect(updates[0][0]).toMatch(/^\$2[aby]\$/);
    expect(updates[0][2]).toBe(7);

    // NADA que lembre uma senha nos logs
    const tudo = JSON.stringify([mockLog.info, mockLog.warn, mockLog.error, mockLog.fatal, mockLog.debug].map((f) => f.mock.calls));
    expect(tudo).not.toMatch(/senha_temporaria/);            // nenhuma chave com a senha
    expect(tudo).not.toMatch(/[0-9a-fA-F]{8,}/);             // nenhum trecho hexadecimal (a senha antiga tinha 8 hex; a nova, 32)
    // mas o supervisor fica sabendo QUEM precisa de nova senha
    expect(tudo).toContain('maria');
    expect(tudo).toContain('Maria Silva');
    expect(tudo).toMatch(/tela Usu/);
  });

  test('sem usuários legados: não atualiza nem loga nada sobre senha', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });
    await runSchema();
    expect(mockPool.query.mock.calls.some(([sql]) => /UPDATE usuarios SET senha_hash/.test(String(sql)))).toBe(false);
  });
});

describe('admin padrão só na primeira execução', () => {
  test('já existe usuário: não cria nada (nem "ressuscita" um admin apagado)', async () => {
    mockPool.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    await criarUsuarioPadrao();
    expect(mockPool.query).toHaveBeenCalledTimes(1);
    expect(String(mockPool.query.mock.calls[0][0])).toMatch(/SELECT 1 FROM usuarios LIMIT 1/);
  });

  test('tabela vazia: cria o admin padrão com senha temporária', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await criarUsuarioPadrao();
    expect(mockPool.query).toHaveBeenCalledTimes(2);
    const [sql, params] = mockPool.query.mock.calls[1];
    expect(String(sql)).toMatch(/INSERT INTO usuarios/);
    expect(params[1]).toBe('admin');
    expect(params[2]).toMatch(/^\$2[aby]\$/);   // senha guardada com bcrypt, nunca em texto
    expect(params[6]).toBe(true);               // senha_temporaria = true (obriga a trocar no 1º login)
  });
});
