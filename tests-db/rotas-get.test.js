/**
 * Banco REAL: varre TODAS as rotas GET do sistema, logado com todos os perfis, e exige que nenhuma responda 500.
 * Um SQL com erro de sintaxe, coluna inexistente ou tabela faltando vira 500 — coisa que os testes com banco
 * simulado (tests/) nunca enxergam. Rotas "dependem de servico externo" ficam numa lista explicita (ver EXTERNAS).
 */
const request = require('supertest');
const { pool } = require('../lib/db');
const { runSchema } = require('../src/database/migrate');
const { criarUsuarioPadrao } = require('../src/database/seed');
const { hashSenha } = require('../lib/helpers');
const app = require('../index');

// Rotas que, por desenho, chamam OUTRO servico (Matriz de Responsabilidades) — sem rede nem credenciais aqui,
// respondem erro de proposito. Nao e defeito de SQL.
const EXTERNAS = [/^\/matriz\/(?!raci|incentivo|carreira)/];

function coletarGets(router, prefixo = '', out = new Set()) {
  for (const l of router.stack) {
    if (l.route) {
      if (l.route.methods.get) out.add(prefixo + l.route.path);
    } else if (l.handle && l.handle.stack) {
      const m = l.regexp && !l.regexp.fast_slash ? /^\^\\\/(.+?)\\\/\?\(\?=\\\/\|\$\)/.exec(l.regexp.source) : null;
      coletarGets(l.handle, prefixo + (m ? '/' + m[1].replace(/\\\//g, '/') : ''), out);
    }
  }
  return out;
}
const rotas = [...coletarGets(app._router)]
  .filter((p) => typeof p === 'string')
  .map((p) => p.replace(/\/:[A-Za-z_]+\??/g, '/1'))
  .filter((p) => !EXTERNAS.some((re) => re.test(p)))
  .sort();

let agent;
beforeAll(async () => {
  await runSchema();
  await criarUsuarioPadrao();
  // um usuario com TODOS os perfis (gestor herda supervisor; os demais vem de perfis_acesso)
  await pool.query(
    `INSERT INTO usuarios (nome, login, senha_hash, perfil, perfis_acesso, status, senha_temporaria, turno)
     VALUES ('Teste Todos', 'todos', $1, 'gestor', 'supervisor,separador,repositor,checkout,embalador', 'ativo', false, 'Manha')
     ON CONFLICT (login) DO NOTHING`, [hashSenha('teste123')]);
  agent = request.agent(app);
  const r = await agent.post('/auth/login').send({ login: 'todos', senha: 'teste123', perfil: 'gestor' });
  if (r.status !== 200) throw new Error('login de teste falhou: ' + r.status + ' ' + JSON.stringify(r.body));
});
afterAll(async () => { await pool.end(); });

describe('rotas GET contra o Postgres real', () => {
  test('a varredura encontrou rotas (sanidade)', () => { expect(rotas.length).toBeGreaterThan(80); });

  test.each(rotas)('GET %s nao responde 500', async (rota) => {
    const r = await agent.get(rota);
    if (r.status >= 500 && r.status !== 501) throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
    expect(r.status === 501 || r.status < 500).toBe(true);   // 501 = recurso nao configurado (ex.: chave da IA), resposta deliberada
  });
});
