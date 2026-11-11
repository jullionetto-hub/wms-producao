// routes/matriz/ — este arquivo so MONTA as partes, na MESMA ORDEM em que as rotas estavam no arquivo unico
// (a ordem importa no Express: ex. "/pedidos/vazios" antes de "/pedidos/:id").
import express from 'express';
const router = express.Router();

router.use(require('./pessoas'));
router.use(require('./raci'));
router.use(require('./cargos-config'));
router.use(require('./migracao'));

module.exports = router;
