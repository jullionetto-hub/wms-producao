# TypeScript — Etapa 6 (tipos das tabelas do banco)

**Situação:** as linhas devolvidas pelo banco deixaram de ser `any` onde a consulta é inequívoca.
**172 de 352 consultas** `db.get` / `db.all` agora têm o tipo real da tabela; o compilador passa a recusar, por exemplo,
`pedido.numero_pedidoo` (nome de coluna errado) ou tratar um campo que pode ser nulo como se nunca fosse.

## Como funciona
- `types/db.d.ts` é **gerado** por `scripts/gerar-tipos-db.js` a partir do próprio SQL do projeto (`CREATE TABLE` e
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, em `src/`, `routes/` e `lib/`): 53 tabelas, 516 colunas. **Não edite à mão.**
- Mudou o banco? Rode `npm run gerar-tipos-db`. O teste `tests/tipos-db.test.js` **falha** se esquecerem.
- Uso: `db.get<Linha<'pedidos'>>('SELECT * FROM pedidos WHERE id=$1', [id])`. Sem o tipo, continua `any` (como sempre foi).
- `db.get<T>` devolve `T | null`: o compilador exige tratar o caso "não achou".

## Regras de conversão (conforme o que o driver `pg` entrega ao Node)
| SQL | TypeScript |
|---|---|
| SERIAL / INTEGER / REAL | `number` |
| BIGINT / NUMERIC | `string` (o driver devolve texto para não perder precisão) |
| TEXT / VARCHAR | `string` |
| BOOLEAN | `boolean` |
| TIMESTAMP / TIMESTAMPTZ / DATE | `Date` |
| JSON / JSONB | `any` |

Coluna **pode ser nula** quando: tem `DEFAULT NULL` explícito, ou não tem `NOT NULL`, `DEFAULT` nem `PRIMARY KEY`.
Coluna com outro `DEFAULT` conta como **não nula** (na prática o banco sempre a preenche) — é uma simplificação consciente.

## O que ficou de fora (de propósito)
- Consultas com `JOIN`, colunas calculadas (`COUNT`, `AS`...) ou SQL montado com `${...}`: o formato não é o de uma tabela.
- 11 consultas onde o código **muda o formato** da linha depois de lida (acrescenta campos, transforma texto em objeto,
  lê coluna por nome dinâmico, como as rotas de edição da Matriz): o tipo da tabela não descreve o que o código faz. Voltaram a `any`.

## O que a tipagem mostrou (vale olhar um dia)
- `entrada-manual`: `saldo_sistema` é `NUMERIC` (chega como **texto**) e o código faz conta com ele — funciona por coerção do JavaScript.
- `auth`: `senha_temporaria === 't'` compara um boolean com texto; o ramo `'t'` nunca acontece (é defesa antiga, sem efeito).
- `pedidos`: `parseInt(i.quantidade)` aplica `parseInt` a um número (`quantidade` é INTEGER). Inofensivo.

## Prova de que nada mudou em execução
JavaScript gerado comparado com o da versão anterior: **53 de 54 arquivos idênticos byte a byte**. O único diferente é `lib/db.js`,
e só por um comentário novo e um parêntese redundante. Typecheck 0 erros; 48 suítes / 1.194 testes.
