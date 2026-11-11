// routes/admin/ — este arquivo so MONTA as partes, na MESMA ORDEM em que as rotas estavam no arquivo unico
// (a ordem importa no Express: ex. "/pedidos/vazios" antes de "/pedidos/:id").
import express from 'express';
const router = express.Router();

router.use(require('./manutencao'));
router.use(require('./auditoria-relatorios'));
router.use(require('./diario'));
router.use(require('./diario-validacao'));
router.use(require('./relatorio-analitico'));
router.use(require('./limpeza-teste'));

module.exports = router;
