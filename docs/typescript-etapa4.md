# TypeScript — Etapa 4 (`noImplicitAny` ligado)

**Situação:** o compilador agora **recusa** parâmetros, variáveis e dicionários sem tipo no servidor inteiro
(`tsconfig.build.json` e `tsconfig.json`: `"noImplicitAny": true`). Código novo sem tipo derruba o build.

## O que foi feito
- 470 pontos corrigidos **só com anotações de tipo** (nenhuma linha de lógica mudou):
  - parâmetros sem tipo → `(x: any)`;
  - dicionários/tabelas usados com chave de texto → `Record<string, number | string | any>`;
  - listas e variáveis que começam vazias → `any[]` / `any`;
  - `.catch(() => null)` → `.catch((): any => null)`.
- Ferramenta usada: um corretor que usa a API do próprio compilador para achar a posição exata de cada ponto.

## Prova de que nada mudou em execução
- O JavaScript gerado foi comparado com o da versão que estava em produção: dos 54 arquivos, 37 saíram **idênticos byte a byte**
  e 17 diferem **apenas** em formatação (fim de linha e parênteses de uma seta com um parâmetro: `x =>` vs `(x) =>`).
  Diferença real: **0**.
- Typecheck geral: 0 erros. Testes: 47 suítes / 1.191 testes.

## Importante: o que isto NÃO é
Os `any` acrescentados dizem "tipo não informado de propósito". Satisfazem a regra, mas **não** dão a proteção de um tipo real.
O ganho desta etapa é impedir que código novo entre sem tipo; a proteção de verdade vem de trocar `any` por tipos específicos
aos poucos (principalmente as linhas do banco, que hoje voltam como `any`).

## Próximos passos
1. `strict` completo (hoje ~476 pontos; 228 são o padrão `catch (e)` + `e.message`, mecânico).
2. Trocar `any` por tipos reais, começando pelos arquivos mais críticos e pelas linhas das tabelas (pedidos, checkout, repositor).
