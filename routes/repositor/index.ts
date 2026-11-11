// routes/repositor/ — este arquivo so MONTA as partes, na MESMA ORDEM em que as rotas estavam no arquivo unico
// (a ordem importa no Express: ex. "/pedidos/vazios" antes de "/pedidos/:id").
import express from 'express';
const router = express.Router();

router.use(require('./avisos'));
router.use(require('./busca'));
router.use(require('./resolucao'));
router.use(require('./protocolo'));

module.exports = router;
