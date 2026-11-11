'use strict';
import express from 'express';
const router  = express.Router();
import { requerAuth, requerPerfil } from '../lib/auth';
import { db, pool } from '../lib/db';

// Painel antigo de absenteísmo (proxy pro FastAPI externo em ABS_API_URL) foi
// removido — substituído pelo absenteísmo nativo (ver routes/absenteismo.js),
// que lê o espelho de ponto direto no banco do WMS sem depender de serviço
// externo. A Matriz de Responsabilidades também já roda nativamente (ver
// routes/matriz.js).

module.exports = router;
