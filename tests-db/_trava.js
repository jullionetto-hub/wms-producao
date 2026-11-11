/**
 * TRAVA DE SEGURANCA — roda antes de QUALQUER teste de banco real.
 * Estes testes criam tabelas, inserem e apagam dados. Eles SO podem rodar contra um Postgres LOCAL e descartavel
 * (o que scripts/test-db.js sobe). Se DATABASE_URL apontar para qualquer outro lugar (ex.: o banco do Railway),
 * tudo aborta antes de abrir uma conexao.
 */
const url = process.env.DATABASE_URL || '';
const local = /^postgres(ql)?:\/\/[^@/]*@(127\.0\.0\.1|localhost)(:\d+)?\//.test(url);
if (!local || process.env.TESTE_BANCO_REAL !== '1') {
  throw new Error(
    'TESTES DE BANCO REAL RECUSADOS: DATABASE_URL nao e um Postgres local de teste (ou TESTE_BANCO_REAL nao esta ativo). ' +
    'Rode com:  npm run test:db   (ele sobe um Postgres temporario em 127.0.0.1 e nunca usa o banco de producao).'
  );
}
