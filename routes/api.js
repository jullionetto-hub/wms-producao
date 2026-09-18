const express = require('express');
const router = express.Router();

router.use(require('./auth'));
router.use(require('./usuarios'));
router.use(require('./pedidos'));
router.use(require('./repositor'));
router.use(require('./checkout'));
router.use(require('./kpis'));
router.use(require('./admin'));
router.use(require('./embalagem'));
router.use(require('./passagem'));
router.use(require('./entrada-manual'));
router.use(require('./performance-dash'));
router.use(require('./gestao'));
router.use(require('./caixas'));
router.use(require('./colmeias'));
router.use(require('./control-tower'));
router.use(require('./mapa-estoque'));
router.use(require('./faturamento'));
router.use(require('./hora-a-hora'));
router.use(require('./simulador'));
router.use(require('./anomalias'));
router.use(require('./permissoes'));
router.use(require('./matriz'));
router.use(require('./absenteismo'));

module.exports = router;
