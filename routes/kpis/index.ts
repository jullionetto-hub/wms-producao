// routes/kpis/ — este arquivo so MONTA as partes, na MESMA ORDEM em que as rotas estavam no arquivo unico
// (a ordem importa no Express: ex. "/pedidos/vazios" antes de "/pedidos/:id").
import express from 'express';
const router = express.Router();

router.use(require('./geral'));
router.use(require('./colaboradores'));
router.use(require('./dashboard'));
router.use(require('./performance'));
router.use(require('./liberacao'));
router.use(require('./detalhe'));

module.exports = router;
