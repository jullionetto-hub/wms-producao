// Todo JS do front precisa ao menos compilar: um erro de sintaxe no meio de auth.js derruba as funções que vêm depois
// (um "$1" esquecido numa edição deixou o Diário sem várias funções e nenhum outro teste percebeu).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dir = path.join(__dirname, '..', 'public', 'js');
describe('public/js compila', () => {
  test.each(fs.readdirSync(dir).filter(f => f.endsWith('.js')))('%s', (arq) => {
    expect(() => new vm.Script(fs.readFileSync(path.join(dir, arq), 'utf8'), { filename: arq })).not.toThrow();
  });
});
