# TypeScript — Etapa 5 (`strict` ligado)

**Situação:** o servidor inteiro compila com `"strict": true` (`tsconfig.build.json` e `tsconfig.json`), com **uma exceção deliberada**:
`"useUnknownInCatchVariables": false`.

## O que o `strict` passou a exigir
- `strictNullChecks`: valores que podem ser nulos/indefinidos (ex.: `rowCount` do banco, `req.session.usuario`) não podem ser usados
  sem tratamento ou sem uma afirmação explícita (`!`).
- `noImplicitAny` (etapa 4), `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, `alwaysStrict`.

## O que foi feito
- Só **25 pontos reais** precisaram de correção (os outros 228 do `strict` eram o padrão `catch (e)` + `e.message`, coberto pela exceção abaixo):
  - 11 usos de `!` onde o valor é garantido pelo contexto (ex.: `usuario!.id` em rota protegida por `requerAuth`;
    `media(fase.a)!` com a lista já verificada com 2+ itens; `rowCount!` do banco, que só é nulo em comandos sem contagem);
  - 1 lista que nasce vazia ganhou tipo (`[] as any[]`).
- O `!` e o `as` **não existem no JavaScript gerado** — são só instruções ao compilador.

## Prova de que nada mudou em execução
- O JavaScript gerado foi comparado com o da versão anterior: **54 de 54 arquivos idênticos byte a byte** (sem nenhuma normalização).
- Typecheck geral: 0 erros. Testes: 47 suítes / 1.191 testes.

## A exceção: `useUnknownInCatchVariables: false`
Com ela ligada, `catch (e) { ... e.message ... }` não compila (o tipo de `e` seria `unknown`). São **228 pontos** no código. Corrigi-los
exigiria mudar o código (ex.: `e instanceof Error ? e.message : String(e)`), o que **muda o comportamento** quando o erro não é um `Error`.
Fica como melhoria futura, a ser feita com cuidado e testes, não de forma mecânica.

## Cuidado com o `!`
O `!` diz ao compilador "confie em mim". Se um valor realmente for nulo, o programa falha em execução exatamente como já falhava antes.
Ele não protege — apenas registra a suposição. Os 11 usos estão listados no commit desta etapa.

## Próximos passos
1. Trocar `any` por tipos reais (hoje ~200 `any` explícitos), começando pelas linhas das tabelas do banco (pedidos, checkout, repositor).
2. (Opcional) Tratar os 228 `catch (e)` de forma segura e ligar `useUnknownInCatchVariables`.
