// Configuracao do jest SO para os testes de banco real (tests-db/). Use: npm run test:db
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests-db/**/*.test.js'],
  setupFiles: ['<rootDir>/tests-db/_trava.js'],
  testTimeout: 60000,
};
