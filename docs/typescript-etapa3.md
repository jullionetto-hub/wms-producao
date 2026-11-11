# TypeScript — Etapa 3 (index.ts e src/)

**Situação:** o ponto de entrada (`index.ts`) e toda a pasta `src/` (config, banco, agendador) agora são TypeScript.
Com isso **todo o servidor está em `.ts`** (index + src + lib + routes = 54 arquivos). O front-end (`public/js`) segue em JavaScript.

## Como funciona (igual às etapas anteriores)
- `npm run build` gera o `.js` ao lado de cada `.ts`, inclusive o `index.js` na raiz. Os `.js` gerados estão no `.gitignore`
  (`/index.js` está ancorado na raiz para não ignorar outros arquivos com esse nome).
- O servidor continua iniciando com `node index.js`.
- `npm run verificar-build` agora também carrega o `index.js` (em modo `test`: monta o app, mas **não** conecta no banco nem abre a porta).
- `index.ts` exporta o app com `export = app` (equivale ao antigo `module.exports = app`; os testes fazem `require('../index')`).
- `src/config/env`, `security`, `session`, `database/seed`, `migrate`, `schema` e `scheduler/relatorio` usam `export` nomeado.

## Como foi conferido
- Compilador: 0 erros. **Typecheck geral: 0 erros** (era 43 antes da Etapa 1; o último, do `helmet`, sumiu com os tipos oficiais).
- Testes: 47 suítes / 1.191 testes.
- Comparação direta antiga x nova (34 verificações, 0 diferenças): variáveis de ambiente em 7 cenários (inclusive produção sem
  `DATABASE_URL`/`SESSION_SECRET`), cabeçalhos de segurança e CORS em produção/teste/desenvolvimento, as 53 tabelas e 47 índices,
  os 212 comandos SQL da inicialização, os logs, o agendamento das 23h55 (America/Sao_Paulo) e as respostas do app.
- Diff contra a `main` revisado linha a linha.
- Build simulado numa cópia limpa do repositório.

## Próximos passos
1. Apertar a checagem (`noImplicitAny`) arquivo por arquivo, começando pelos mais críticos (pedidos, checkout, repositor).
2. Tipar as linhas do banco por tabela (hoje `db.get/all` devolvem `any`).
3. Avaliar o front-end (`public/js`) — só se fizer sentido; é código de navegador, com outro tipo de risco.
