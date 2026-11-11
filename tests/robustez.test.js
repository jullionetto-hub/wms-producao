/**
 * Robustez e segurança (itens 1 e 2):
 *  - erro em rota async NAO derruba o servidor (vira resposta 500);
 *  - promessa rejeitada sem dono nao derruba; exceção nao capturada encerra com código 1 (Railway reinicia);
 *  - a migração de hashes legados NUNCA grava a senha no log;
 *  - o admin padrão so é criado na primeira execução.
 * Os testes de "o processo cai / sobrevive" rodam em processo filho (um crash real derrubaria o jest).
 */
const path = require('path');
const { spawnSync } = require('child_process');
const express = require('express');
const request = require('supertest');

const RAIZ = path.join(__dirname, '..');
const filho = (codigo) => spawnSync(process.execPath, ['-e', codigo], {
  cwd: RAIZ, encoding: 'utf8', timeout: 30000,
  env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_ENV: 'test', DATABASE_URL: 'postgres://x', SESSION_SECRET: 'x' },
});

// app de teste: rota async que lança, rota que responde e DEPOIS falha, e uma rota normal
const APP = (ativar) => `
const express=require('express');const request=require('supertest');
const rb=require('./lib/robustez');
${ativar ? 'rb.ativarCapturaDeErrosAsync();' : ''}
const app=express();
app.get('/falha',async(req,res)=>{ throw new Error('boom'); });
app.get('/ok',(req,res)=>res.json({ok:1}));
app.use(rb.tratadorDeErros);
(async()=>{
  const r=await request(app).get('/falha');
  console.log('STATUS_FALHA='+r.status+' CORPO='+JSON.stringify(r.body));
  await new Promise(ok=>setTimeout(ok,200));            // deixa a rejeicao (se houver) estourar
  const r2=await request(app).get('/ok');
  console.log('STATUS_OK='+r2.status);
  process.exit(0);
})().catch(e=>{console.log('ERRO_TESTE '+e.message);process.exit(0)});`;

describe('erro em rota async (Express 4 não captura sozinho)', () => {
  test('SEM a captura: o processo inteiro cai (o problema original)', () => {
    const r = filho(APP(false));
    expect(r.status).not.toBe(0);                       // o processo morreu
    expect(r.stdout).not.toContain('STATUS_OK=200');    // e nao serviu mais nada
  });

  test('COM a captura: responde 500 só naquela requisição e o servidor segue servindo', () => {
    const r = filho(APP(true));
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('STATUS_FALHA=500 CORPO={"erro":"boom"}');
    expect(r.stdout).toContain('STATUS_OK=200');
  });

  test('rota que já respondeu e falha depois não derruba nem tenta responder de novo', async () => {
    const rb = require('../lib/robustez');
    rb.ativarCapturaDeErrosAsync();
    const app = express();
    app.get('/tarde', async (req, res) => { res.json({ ok: 1 }); throw new Error('depois da resposta'); });
    app.get('/ok', (req, res) => res.json({ ok: 2 }));
    app.use(rb.tratadorDeErros);
    const a = await request(app).get('/tarde');
    expect(a.status).toBe(200);
    expect((await request(app).get('/ok')).body).toEqual({ ok: 2 });
  });

  test('ativarCapturaDeErrosAsync pode ser chamada mais de uma vez', () => {
    const rb = require('../lib/robustez');
    expect(() => { rb.ativarCapturaDeErrosAsync(); rb.ativarCapturaDeErrosAsync(); }).not.toThrow();
  });
});

describe('tratadores do processo', () => {
  test('promessa rejeitada sem dono: registra e o servidor continua no ar', () => {
    const r = filho(`
      const rb=require('./lib/robustez'); rb.registrarTratadoresDeProcesso();
      Promise.reject(new Error('esquecido'));
      setTimeout(()=>{console.log('VIVO');process.exit(0)},300);`);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('VIVO');
  });

  test('exceção não capturada: encerra com código 1 (o Railway reinicia sozinho)', () => {
    const r = filho(`
      const rb=require('./lib/robustez'); rb.registrarTratadoresDeProcesso();
      setTimeout(()=>{ throw new Error('grave'); },50);
      setTimeout(()=>{console.log('NAO_DEVIA_CHEGAR');process.exit(0)},3000);`);
    expect(r.status).toBe(1);
    expect(r.stdout).not.toContain('NAO_DEVIA_CHEGAR');
  });
});

describe('o index registra as proteções', () => {
  const fs = require('fs');
  const src = fs.readFileSync(path.join(RAIZ, 'index.ts'), 'utf8');
  test('ativa a captura async, usa o tratador final e registra os tratadores do processo fora do modo test', () => {
    expect(src).toContain('ativarCapturaDeErrosAsync();');
    expect(src).toContain('app.use(tratadorDeErros);');
    expect(src.indexOf('registrarTratadoresDeProcesso();')).toBeGreaterThan(src.indexOf("process.env.NODE_ENV !== 'test'"));
  });
});
