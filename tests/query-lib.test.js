/**
 * Parametros de URL repetidos (?x=a&x=b). O Express entrega lista, e rotas que fazem
 * req.query.x.split(',') / .substring(...) quebravam com erro 500. normalizarQuery
 * (lib/query.js) faz valer o primeiro valor, para todas as rotas.
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { normalizarQuery } = require('../lib/query');

function montar(comRegra) {
  const app = express();
  if (comRegra) app.use(normalizarQuery);
  // mesmo uso que routes/kpis.js e routes/repositor.js fazem do parametro
  app.get('/t', (req, res) => {
    const { turnos, status } = req.query;
    res.json({
      turnos: turnos ? turnos.split(',').filter(Boolean) : null,
      status: status ? status.substring(0, 7) : null,
    });
  });
  app.use((err, _req, res, _next) => res.status(500).json({ erro: err.message }));
  return app;
}

describe('normalizarQuery — parametro repetido na URL', () => {
  test('SEM a regra, parametro repetido derruba a rota (erro 500) — o problema original', async () => {
    const r = await request(montar(false)).get('/t?turnos=Manha&turnos=Noite');
    expect(r.status).toBe(500);
  });

  test('COM a regra, parametro repetido vale o primeiro e a rota responde', async () => {
    const r = await request(montar(true)).get('/t?turnos=Manha,Tarde&turnos=Noite&status=pendente&status=buscado');
    expect(r.status).toBe(200);
    expect(r.body.turnos).toEqual(['Manha', 'Tarde']);
    expect(r.body.status).toBe('pendent');
  });

  test('parametro unico (caso normal) nao muda', async () => {
    const r = await request(montar(true)).get('/t?turnos=Manha,Noite&status=pendente');
    expect(r.status).toBe(200);
    expect(r.body.turnos).toEqual(['Manha', 'Noite']);
    expect(r.body.status).toBe('pendent');
  });

  test('sem parametro continua sem parametro', async () => {
    const r = await request(montar(true)).get('/t');
    expect(r.body).toEqual({ turnos: null, status: null });
  });

  test('forma ?x[]=1&x[]=2 tambem vira o primeiro', async () => {
    const app = express();
    app.use(normalizarQuery);
    app.get('/t', (req, res) => res.json({ x: req.query.x }));
    const r = await request(app).get('/t?x[]=1&x[]=2');
    expect(r.body.x).toBe('1');
  });

  test('nao falha sem req.query', () => {
    const next = jest.fn();
    normalizarQuery({}, {}, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('index.ts registra a regra antes das rotas', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');
  test('usa normalizarQuery depois da sessao e antes do apiRouter', () => {
    const iSessao = src.indexOf('app.use(sessionMiddleware)');
    const iRegra = src.indexOf('app.use(normalizarQuery)');
    const iRotas = src.indexOf("app.use('/', apiRouter)");
    expect(iSessao).toBeGreaterThan(-1);
    expect(iRegra).toBeGreaterThan(iSessao);
    expect(iRotas).toBeGreaterThan(iRegra);
  });
});
