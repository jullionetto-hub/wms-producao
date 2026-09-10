'use strict';
const express = require('express');
const router  = express.Router();
const { requerAuth, requerPerfil } = require('../lib/auth');
const { db, pool } = require('../lib/db');

// Painel antigo de absenteísmo (proxy pro FastAPI externo em ABS_API_URL) foi
// removido — substituído pelo absenteísmo nativo (ver routes/absenteismo.js),
// que lê o espelho de ponto direto no banco do WMS sem depender de serviço
// externo. A Matriz de Responsabilidades também já roda nativamente (ver
// routes/matriz.js).

module.exports = router;
