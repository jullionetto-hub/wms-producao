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
router.use(require('./dash-logistica'));

module.exports = router;
