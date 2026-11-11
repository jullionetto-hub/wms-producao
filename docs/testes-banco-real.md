# Testes contra um Postgres de verdade (item 3)

Os testes em `tests/` simulam o banco: não enxergam SQL com erro de sintaxe, coluna inexistente ou tabela faltando.
Os de `tests-db/` rodam o sistema inteiro contra um **PostgreSQL 17 real, local e descartável**.

## Como rodar
```
npm run test:db                 # todos
npm run test:db -- schema       # só os que casam com "schema"
```
- Sobe um Postgres temporário em `127.0.0.1:54329` (UTF8, como o do Railway), roda os testes e **apaga tudo** no fim.
- **Na primeira vez** baixa o pacote `embedded-postgres` (~100 MB, PostgreSQL 17, licença MIT) para `%TEMP%/wms-pg-test`.
  Fica **fora do projeto**: não entra no `package.json` e não afeta o build do Railway.
- **Trava de segurança** (`tests-db/_trava.js`): se `DATABASE_URL` não for um Postgres local, tudo aborta antes de abrir conexão.
  Estes testes nunca podem tocar o banco de produção.
- `npm test` (rotina normal e Railway) **não** roda estes testes.

## O que cobrem (136 testes)
- `schema.test.js`: o schema inteiro (54 tabelas, 47 índices, 57 alterações) se aplica num banco vazio **sem nenhuma instrução
  falhando escondida** (o `runSchema()` engole erros de propósito; aqui cada instrução é executada); roda de novo sem problema;
  e `types/db.d.ts` bate com as colunas **reais** (nomes, tipos, nulidade).
- `rotas-get.test.js`: as 120 rotas GET do sistema, logado com todos os perfis; nenhuma pode responder 500
  (501 = recurso não configurado, como a chave da IA, é deliberado). Rotas do serviço externo da Matriz ficam fora.
- `fluxo-pedidos.test.js`: importar → reimportar (bloqueado) → separar sem falta (gera checkout) → separar com falta (avisa o repositor
  e não conclui) → painel de checkout.
- `regressoes.test.js`: os defeitos abaixo (provado: sem a correção, os testes falham).

## Defeitos que a primeira execução encontrou (e foram corrigidos)
1. **`GET /mapa-estoque` respondia 500 sempre.** `GROUP BY rua` era ambíguo: a tabela `pedidos` tem uma *coluna* chamada `rua`, que o
   Postgres prefere ao apelido do `SELECT`. Corrigido com `GROUP BY 1`.
2. **`GET /stats/colaboradores` respondia 500 sempre**, e o painel "Colaboradores" ficava **vazio sem avisar** (o front descarta
   resposta não-ok). Ligava o checkout por `ck.usuario_id`, coluna que não existe; agora liga por `operador_nome`, como o resto do código.
3. **`checkout_sessoes` não era criada num banco novo**: a "auto-migração" de `routes/checkout.ts` roda ao carregar o arquivo,
   antes da tabela `checkout` existir, e a primeira instrução falha. Agora a tabela e a coluna `itens_falta` estão no schema central.
   (Em produção, que já tem as tabelas, isso nunca aparecia.)
