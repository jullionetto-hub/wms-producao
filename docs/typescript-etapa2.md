# TypeScript — Etapa 2 (lib/ e routes/ em TypeScript)

**Situação:** a pasta `lib/` (18 arquivos) e a pasta `routes/` (28 arquivos) agora são `.ts`.
`index.js` e `src/` continuam em JavaScript (próximas etapas).

## Como funciona
- O código-fonte é o `.ts`. `npm run build` (`tsc -p tsconfig.build.json`) gera o `.js` **ao lado** de cada `.ts`.
  Os `.js` gerados estão no `.gitignore` (não são versionados) — **nunca edite o `.js`, edite o `.ts`**.
- O servidor continua iniciando com `node index.js`; caminhos e `require` não mudaram.
- Railway: `buildCommand = npm install --include=dev && npm run build && npm run verificar-build`.
  `verificar-build` carrega cada módulo compilado; se algo falhar, o build falha e o Railway mantém a versão anterior no ar.
- Local: `npm run dev` já compila antes de iniciar o nodemon. `npm test` compila antes (`pretest`).
- Se aparecer "Cannot find module './lib/...'" ao rodar localmente, falta rodar `npm run build`.

## O que mudou nos arquivos de rotas (por script, depois revisado linha a linha)
- `const express = require('express')` e `require('../lib/...')` viraram `import`. O resto das rotas **não foi reescrito**.
- `module.exports = router;` ficou igual (inclusive os `module.exports.metricas...` do `performance-dash`).
- Parâmetros de URL: `req.query` é tratado como texto (`Record<string, string>`). Isso é verdade em execução
  por causa de `lib/query.ts` (`normalizarQuery`), que reduz parâmetro repetido ao primeiro valor.
- Contas com datas ganharam `+` (`+new Date(a) - +new Date(b)`), que dá o mesmo número que a subtração original.
- Objetos que ganham campos depois de criados ganharam tipo `Record<string, any>`.

## Como foi conferido
- Compilador: 0 erros nos `.ts` (as 43 reclamações do Etapa 1 nesses arquivos foram resolvidas).
- Testes: 47 suítes / 1.183 testes.
- Rotas registradas, antes (main) x depois: 28 arquivos, 299 rotas (método + caminho + nº de funções encadeadas +
  exportações) — 0 diferenças.
- Diff contra a `main`: só linhas de import, anotações de tipo, `as string` e o `+` das datas.
- Build simulado numa cópia limpa do repositório (instalar → compilar → verificar → carregar o `index.js`).

## Próximos passos
1. Apertar a checagem (`noImplicitAny`) arquivo por arquivo, começando pelos mais críticos.
2. Converter `index.js` e `src/` (config, banco, scheduler).
3. Tipar as linhas do banco por tabela (hoje `db.get/all` devolvem `any`).
