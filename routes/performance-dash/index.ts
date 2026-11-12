// routes/performance-dash/ — este arquivo so MONTA as partes, na MESMA ORDEM em que as rotas estavam no arquivo unico
// (a ordem importa no Express: ex. "/pedidos/vazios" antes de "/pedidos/:id").
import express from 'express';
const router = express.Router();

router.use(require('./separadores'));
router.use(require('./pedidos-timing'));
router.use(require('./metas'));
router.use(require('./ocorrencias'));
router.use(require('./pedido-detalhe'));
router.use(require('./eficiencia-rota'));

module.exports = router;
