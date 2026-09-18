/* ══ Mapa Vivo do Estoque — routes/mapa-estoque.js ══
   V8 da evolução do WMS. Granularidade por RUA (corredor inteiro), não por
   prateleira individual — decisão explícita do usuário. Estado de cada rua
   vem de 4 sinais reais, já existentes no sistema:
     - ruptura        → catálogo de produtos (produtos.saldo <= 0)
     - estoque_baixo  → colmeias com saldo <= estoque mínimo cadastrado
     - separacao      → pedidos com status='separando' AGORA, cujos itens
                         tocam a rua (não é "hoje", é neste exato momento)
     - reposicao      → avisos_repositor pendentes AGORA na rua
   Cálculo puro (prioridade entre estados) fica em lib/mapa-estoque.js.
   NÃO inclui giro, curva ABCDE, estoque de segurança nem ponto de pedido —
   nenhum desses dados existe no sistema hoje (pedido explícito do usuário
   pra não inventar).
══════════════════════════════════════════════════════════════════════ */
const express = require('express');
const router = express.Router();
const { db } = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');
const { montarEstadoRua } = require('../lib/mapa-estoque');

// Extrai a rua (letras antes do primeiro número) de uma coluna TEXT — mesmo
// padrão já usado em routes/entrada-manual.js (GET /produtos/ruas), só
// parametrizado pra reutilizar com qualquer coluna de endereço.
function ruaSql(coluna) {
  return `regexp_replace(split_part(${coluna},'/',1), '[0-9].*$', '')`;
}

async function contagemPorRua(sql, params = []) {
  const rows = await db.all(sql, params);
  const porRua = {};
  rows.forEach(r => { porRua[r.rua] = parseInt(r.total) || 0; });
  return porRua;
}

router.get('/mapa-estoque', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  try {
    const ruaProdutos = ruaSql('localizacao');
    const ruaColmeias = ruaSql('c.endereco');
    const ruaItens = ruaSql('i.endereco');
    const ruaAvisos = ruaSql('endereco');

    const [ruptura, estoqueBaixo, separacao, reposicao] = await Promise.all([
      contagemPorRua(`
        SELECT ${ruaProdutos} AS rua, COUNT(*)::int AS total
        FROM produtos
        WHERE localizacao IS NOT NULL AND localizacao <> '' AND COALESCE(saldo,0) <= 0
        GROUP BY rua HAVING ${ruaProdutos} <> ''`),
      contagemPorRua(`
        SELECT ${ruaColmeias} AS rua, COUNT(*)::int AS total
        FROM colmeias c
        WHERE c.status='ativo' AND c.estoque_minimo > 0 AND c.endereco IS NOT NULL AND c.endereco <> ''
          AND (c.quantidade_total - COALESCE((
            SELECT SUM(i.quantidade - COALESCE(i.qtd_falta,0))
            FROM itens_pedido i JOIN pedidos p ON p.id=i.pedido_id
            WHERE i.codigo=c.codigo AND i.status IN ('encontrado','parcial') AND p.status='concluido'
              AND p.concluido_em <> '' AND p.concluido_em::timestamptz >= c.criado_em
          ),0)) <= c.estoque_minimo
        GROUP BY rua HAVING ${ruaColmeias} <> ''`),
      contagemPorRua(`
        SELECT ${ruaItens} AS rua, COUNT(DISTINCT p.id)::int AS total
        FROM itens_pedido i JOIN pedidos p ON p.id=i.pedido_id
        WHERE p.status='separando' AND i.endereco IS NOT NULL AND i.endereco <> ''
        GROUP BY rua HAVING ${ruaItens} <> ''`),
      contagemPorRua(`
        SELECT ${ruaAvisos} AS rua, COUNT(*)::int AS total
        FROM avisos_repositor
        WHERE status='pendente' AND endereco IS NOT NULL AND endereco <> ''
        GROUP BY rua HAVING ${ruaAvisos} <> ''`),
    ]);

    const todasRuas = new Set([
      ...Object.keys(ruptura), ...Object.keys(estoqueBaixo),
      ...Object.keys(separacao), ...Object.keys(reposicao),
    ]);

    const mapa = {};
    todasRuas.forEach(rua => {
      mapa[rua] = montarEstadoRua({
        ruptura: ruptura[rua] || 0,
        estoqueBaixo: estoqueBaixo[rua] || 0,
        separando: separacao[rua] || 0,
        reposicaoPendente: reposicao[rua] || 0,
      });
    });

    res.json({ ruas: mapa, atualizado_em: new Date().toISOString() });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.get('/mapa-estoque/:rua', requerAuth, requerPerfil('supervisor', 'gestor'), async (req, res) => {
  const rua = String(req.params.rua || '').toUpperCase();
  if (!rua) return res.status(400).json({ erro: 'Informe a rua' });
  try {
    const ruaProdutos = ruaSql('localizacao');
    const ruaColmeias = ruaSql('c.endereco');
    const ruaItens = ruaSql('i.endereco');
    const ruaAvisos = ruaSql('endereco');

    const [skusRuptura, colmeiasBaixas, pedidosSeparando, avisosPendentes] = await Promise.all([
      db.all(`SELECT codigo, nome, saldo, localizacao FROM produtos
        WHERE ${ruaProdutos}=$1 AND COALESCE(saldo,0) <= 0 ORDER BY codigo LIMIT 30`, [rua]),
      db.all(`SELECT c.codigo, c.descricao, c.endereco, c.estoque_minimo,
          (c.quantidade_total - COALESCE((
            SELECT SUM(i.quantidade - COALESCE(i.qtd_falta,0))
            FROM itens_pedido i JOIN pedidos p ON p.id=i.pedido_id
            WHERE i.codigo=c.codigo AND i.status IN ('encontrado','parcial') AND p.status='concluido'
              AND p.concluido_em <> '' AND p.concluido_em::timestamptz >= c.criado_em
          ),0))::int AS saldo
        FROM colmeias c
        WHERE c.status='ativo' AND ${ruaColmeias}=$1 ORDER BY c.codigo LIMIT 30`, [rua]),
      db.all(`SELECT DISTINCT p.numero_pedido, p.separador_id, s.nome AS separador_nome
        FROM itens_pedido i JOIN pedidos p ON p.id=i.pedido_id LEFT JOIN separadores s ON s.id=p.separador_id
        WHERE p.status='separando' AND ${ruaItens}=$1 ORDER BY p.numero_pedido LIMIT 30`, [rua]),
      db.all(`SELECT codigo, descricao, quantidade, numero_pedido, data_aviso, hora_aviso
        FROM avisos_repositor WHERE status='pendente' AND ${ruaAvisos}=$1
        ORDER BY data_aviso, hora_aviso LIMIT 30`, [rua]),
    ]);

    res.json({
      rua,
      estado: montarEstadoRua({
        ruptura: skusRuptura.length,
        estoqueBaixo: colmeiasBaixas.filter(c => c.saldo <= c.estoque_minimo).length,
        separando: pedidosSeparando.length,
        reposicaoPendente: avisosPendentes.length,
      }),
      skus_ruptura: skusRuptura,
      colmeias_estoque_baixo: colmeiasBaixas,
      pedidos_separando: pedidosSeparando,
      avisos_pendentes: avisosPendentes,
    });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
