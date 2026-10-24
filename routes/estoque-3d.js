/* ══ Modelo 3D do Estoque — routes/estoque-3d.js ══
   Dados reais (somente leitura) para views/modelo-estoque.html:
     - produtos          → catálogo (código, nome, localização, saldo, disponível)
     - separando         → itens de pedidos com status='separando' AGORA (endereço)
     - reposicao         → avisos_repositor pendentes AGORA (endereço)
     - giro              → linhas de itens separados nos últimos N dias, por endereço
   O saldo do catálogo é do PRODUTO (total), não da posição — o WMS não guarda
   saldo por posição, então o modelo mostra o saldo do produto que está ali.
   A página só é servida a supervisor/gestor (ver index.js) e estas rotas
   exigem o mesmo perfil.
══════════════════════════════════════════════════════════════════════ */
const express = require('express');
const router = express.Router();
const { db } = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');

const PERFIS = ['supervisor', 'gestor'];

router.get('/estoque-3d/dados', requerAuth, requerPerfil(...PERFIS), async (req, res) => {
  const dias = Math.min(90, Math.max(1, parseInt(req.query.dias) || 30));
  try {
    const [produtos, separando, reposicao, giro] = await Promise.all([
      db.all(`SELECT codigo, nome, localizacao, saldo, disponivel FROM produtos ORDER BY codigo`),
      db.all(`SELECT i.endereco, i.codigo, i.quantidade, i.status AS status_item, p.numero_pedido
        FROM itens_pedido i JOIN pedidos p ON p.id=i.pedido_id
        WHERE p.status='separando' AND i.endereco IS NOT NULL AND i.endereco <> ''`),
      db.all(`SELECT endereco, codigo, quantidade, numero_pedido FROM avisos_repositor
        WHERE status='pendente' AND endereco IS NOT NULL AND endereco <> ''`),
      db.all(`SELECT i.endereco, COUNT(*)::int AS linhas, COALESCE(SUM(i.quantidade - COALESCE(i.qtd_falta,0)),0)::int AS qtd
        FROM itens_pedido i JOIN pedidos p ON p.id=i.pedido_id
        WHERE p.status='concluido' AND i.status IN ('encontrado','parcial') AND i.endereco IS NOT NULL AND i.endereco <> ''
          AND p.concluido_em <> '' AND p.concluido_em::timestamp AT TIME ZONE 'America/Sao_Paulo' >= NOW() - ($1 || ' days')::interval
        GROUP BY i.endereco`, [String(dias)]),
    ]);
    res.json({
      atualizado_em: new Date().toISOString(),
      dias,
      // formato compacto: [codigo, nome, localizacao, saldo, disponivel]
      produtos: produtos.map(p => [p.codigo, p.nome || '', p.localizacao || '', Number(p.saldo) || 0, Number(p.disponivel) || 0]),
      separando,
      reposicao,
      giro,
    });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// pedidos que ainda têm separação a fazer — alimenta o seletor da rota
router.get('/estoque-3d/pedidos', requerAuth, requerPerfil(...PERFIS), async (_req, res) => {
  try {
    // ruas = ruas distintas dos endereços dos itens, para o operador ver por onde o pedido passa sem abrir um a um
    const rows = await db.all(`SELECT p.numero_pedido, p.status, p.itens, p.rua, s.nome AS separador, ru.ruas
      FROM pedidos p LEFT JOIN separadores s ON s.id=p.separador_id
      LEFT JOIN LATERAL (
        SELECT array_agg(r) AS ruas FROM (
          SELECT DISTINCT regexp_replace(trim(split_part(split_part(i.endereco,'/',1),',',1)), '[0-9].*$', '') AS r
          FROM itens_pedido i WHERE i.pedido_id=p.id AND i.endereco IS NOT NULL AND i.endereco <> ''
        ) x WHERE r <> ''
      ) ru ON true
      WHERE p.status IN ('pendente','separando') ORDER BY p.status DESC, p.ordem_fila, p.numero_pedido LIMIT 300`);
    res.json({ pedidos: rows });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.get('/estoque-3d/pedido/:numero', requerAuth, requerPerfil(...PERFIS), async (req, res) => {
  const numero = String(req.params.numero || '').trim();
  if (!numero) return res.status(400).json({ erro: 'Informe o número do pedido' });
  try {
    const p = await db.get(`SELECT id, numero_pedido, status FROM pedidos WHERE numero_pedido=$1`, [numero]);
    if (!p) return res.status(404).json({ erro: 'Pedido não encontrado' });
    const itens = await db.all(`SELECT codigo, descricao, endereco, quantidade, status, qtd_falta
      FROM itens_pedido WHERE pedido_id=$1 ORDER BY id`, [p.id]);
    res.json({ pedido: p, itens });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
