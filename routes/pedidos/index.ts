// routes/pedidos/ — este arquivo so MONTA as partes, na MESMA ORDEM em que as rotas estavam no arquivo unico
// (a ordem importa no Express: ex. "/pedidos/vazios" antes de "/pedidos/:id").
import express from 'express';
const router = express.Router();

router.use(require('./fila'));
router.use(require('./separacao'));
router.use(require('./limpeza'));
router.use(require('./importacao'));
router.use(require('./distribuicao'));
router.use(require('./lotes'));
router.use(require('./relatorios'));

module.exports = router;
