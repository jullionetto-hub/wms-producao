# src/ — Módulos internos do servidor

Esta pasta contém o código interno da aplicação, separado por responsabilidade.

```
src/
├── config/
│   ├── env.js        ← Todas as variáveis de ambiente (process.env)
│   ├── security.js   ← Helmet, CORS, headers, redirect HTTPS
│   └── session.js    ← Configuração da sessão Express
├── database/
│   ├── schema.js     ← DDL completo: todas as tabelas e índices
│   ├── migrate.js    ← Aplica schema + migrations incrementais
│   └── seed.js       ← Cria o usuário admin padrão (se não existir)
└── scheduler/
    └── relatorio.js  ← Cron de geração do relatório diário
```

## Regras

- **Nenhum outro arquivo** deve ler `process.env` diretamente — use `src/config/env.js`.
- **Todo DDL** (CREATE TABLE, ALTER TABLE, CREATE INDEX) fica em `src/database/schema.js`.
- O `index.js` raiz só deve importar estes módulos e montar o servidor Express.

## Como usar no index.js

```js
const env                = require('./src/config/env');
const { applySecurity }  = require('./src/config/security');
const { sessionMiddleware } = require('./src/config/session');
const { runMigrations }  = require('./src/database/migrate');
const { seedAdmin }      = require('./src/database/seed');
const { agendarRelatorio } = require('./src/scheduler/relatorio');
```
