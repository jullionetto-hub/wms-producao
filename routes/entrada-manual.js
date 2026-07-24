'use strict';
const express = require('express');
const router  = express.Router();
const { pool, db } = require('../lib/db');
const { requerAuth, requerPerfil } = require('../lib/auth');
const { dataHoraLocal } = require('../lib/helpers');

// Aceita qualquer endereço com letras, números, barra e hífen (ex: D106, ZA387, C099/VERT-C02-CX18)
const ADDR_REGEX = /^[A-Z0-9][A-Z0-9\/\-]{1,29}$/i;

function validarEndereco(end) {
  if (!end || !end.trim()) return { ok: false, tipo: 'vazio' };
  return ADDR_REGEX.test(end.trim().toUpperCase())
    ? { ok: true, tipo: 'valido' }
    : { ok: false, tipo: 'formato' };
}

// ── GET /entrada-manual/lotes ─────────────────────────────────────────────
router.get('/entrada-manual/lotes', requerAuth, async (req, res) => {
  const { ini, fim, status } = req.query;
  const { data: hoje } = dataHoraLocal();
  const dIni = ini || hoje;
  const dFim = fim || hoje;
  try {
    const params = [dIni, dFim];
    let extra = '';
    if (status) { params.push(status); extra = ` AND l.status=$${params.length}`; }

    const lotes = await db.all(`
      SELECT l.*,
        COUNT(i.id)::int                                               AS total_itens,
        COUNT(i.id) FILTER (WHERE i.status='abastecido')::int          AS itens_abastecidos,
        COUNT(i.id) FILTER (WHERE i.status='parcial')::int             AS itens_parciais,
        COUNT(i.id) FILTER (WHERE i.status='nao_encontrado')::int      AS itens_nao_encontrados,
        COUNT(i.id) FILTER (WHERE i.status='pendente')::int            AS itens_pendentes
      FROM entrada_manual_lotes l
      LEFT JOIN entrada_manual_itens i ON i.lote_id=l.id
      WHERE l.data_entrada>=$1 AND l.data_entrada<=$2${extra}
      GROUP BY l.id
      ORDER BY l.criado_em DESC
    `, params);
    res.json(lotes);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── POST /entrada-manual/lotes — Criar lote com itens ─────────────────────
router.post('/entrada-manual/lotes', requerAuth, async (req, res) => {
  const { nome, data_entrada, responsavel, itens } = req.body;
  if (!Array.isArray(itens) || !itens.length)
    return res.status(400).json({ erro: 'Informe ao menos um item.' });

  const { data: hoje } = dataHoraLocal();
  const criado_por = req.session?.usuario?.nome || '';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO entrada_manual_lotes (nome,data_entrada,criado_por,responsavel,total_itens,status)
       VALUES ($1,$2,$3,$4,$5,'aberto') RETURNING id`,
      [nome || `Entrada ${hoje}`, data_entrada || hoje, criado_por,
       responsavel || criado_por, itens.length]
    );
    const loteId = r.rows[0].id;

    for (const it of itens) {
      await client.query(
        `INSERT INTO entrada_manual_itens (lote_id,codigo,descricao,quantidade_esperada,endereco,status)
         VALUES ($1,$2,$3,$4,$5,'pendente')`,
        [loteId, String(it.codigo||'').trim().toUpperCase(),
         String(it.descricao||'').trim(),
         parseInt(it.quantidade)||1,
         String(it.endereco||'').trim().toUpperCase()]
      );
    }
    await client.query('COMMIT');
    res.json({ id: loteId, total: itens.length, mensagem: 'Lote criado!' });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(500).json({ erro: e.message });
  } finally { client.release(); }
});

// ── GET /entrada-manual/lotes/:id — Lote + todos os itens ─────────────────
router.get('/entrada-manual/lotes/:id', requerAuth, async (req, res) => {
  try {
    const lote = await db.get(`SELECT * FROM entrada_manual_lotes WHERE id=$1`, [req.params.id]);
    if (!lote) return res.status(404).json({ erro: 'Lote não encontrado.' });
    const itens = await db.all(
      `SELECT * FROM entrada_manual_itens WHERE lote_id=$1 ORDER BY id`,
      [req.params.id]
    );
    res.json({ ...lote, itens });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── PUT /entrada-manual/itens/:id — Salvar progresso de um item ───────────
router.put('/entrada-manual/itens/:id', requerAuth, async (req, res) => {
  const { quantidade_abastecida, endereco, obs } = req.body;
  const responsavel = req.session?.usuario?.nome || '';
  try {
    const item = await db.get(`SELECT * FROM entrada_manual_itens WHERE id=$1`, [req.params.id]);
    if (!item) return res.status(404).json({ erro: 'Item não encontrado.' });

    // Validação de endereço
    const endNorm = endereco !== undefined ? String(endereco).trim().toUpperCase() : item.endereco;
    const vEnd = validarEndereco(endNorm);
    if (endereco !== undefined && !vEnd.ok)
      return res.status(400).json({ erro: 'Endereço inválido. Use o formato U080 ou U087/VERT-U01-CX13.' });

    // Status automático por quantidade
    const qtd = quantidade_abastecida !== undefined ? parseInt(quantidade_abastecida) : item.quantidade_abastecida;
    let novoStatus;
    if (qtd === 0)                           novoStatus = 'nao_encontrado';
    else if (qtd >= item.quantidade_esperada) novoStatus = 'abastecido';
    else                                      novoStatus = 'parcial';

    await pool.query(
      `UPDATE entrada_manual_itens
       SET quantidade_abastecida=$1, endereco=$2, status=$3,
           obs=COALESCE($4,obs), responsavel=$5, confirmado_em=NOW()
       WHERE id=$6`,
      [qtd, endNorm, novoStatus, obs !== undefined ? obs : null,
       responsavel, req.params.id]
    );

    // Recalcula lote
    const resumo = await db.get(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status!='pendente')::int AS concluidos
      FROM entrada_manual_itens WHERE lote_id=$1`, [item.lote_id]);
    const loteStatus = resumo.total === resumo.concluidos ? 'concluido' : 'aberto';
    await pool.query(
      `UPDATE entrada_manual_lotes SET itens_concluidos=$1, status=$2 WHERE id=$3`,
      [resumo.concluidos, loteStatus, item.lote_id]
    );

    res.json({ mensagem: 'Salvo!', status: novoStatus, lote_status: loteStatus,
               itens_concluidos: resumo.concluidos, total_itens: resumo.total });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── PUT /entrada-manual/lotes/:id/itens-bulk — Salvar todos de uma vez ────
router.put('/entrada-manual/lotes/:id/itens-bulk', requerAuth, async (req, res) => {
  const { itens } = req.body;
  if (!Array.isArray(itens) || !itens.length)
    return res.status(400).json({ erro: 'Nenhum item informado.' });

  const responsavel = req.session?.usuario?.nome || '';
  const loteId = req.params.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of itens) {
      const { id, quantidade_abastecida, obs } = item;
      const qtd = parseInt(quantidade_abastecida) || 0;

      const row = await client.query(
        `SELECT quantidade_esperada FROM entrada_manual_itens WHERE id=$1 AND lote_id=$2`,
        [id, loteId]
      );
      if (!row.rows.length) continue;
      const esperada = row.rows[0].quantidade_esperada;

      let novoStatus;
      if (qtd === 0)            novoStatus = 'nao_encontrado';
      else if (qtd >= esperada) novoStatus = 'abastecido';
      else                      novoStatus = 'parcial';

      await client.query(
        `UPDATE entrada_manual_itens
         SET quantidade_abastecida=$1, status=$2,
             obs=COALESCE($3,obs), responsavel=$4, confirmado_em=clock_timestamp()
         WHERE id=$5 AND lote_id=$6`,
        [qtd, novoStatus, obs || null, responsavel, id, loteId]
      );
    }

    const resumo = await client.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status!='pendente')::int AS concluidos
      FROM entrada_manual_itens WHERE lote_id=$1`, [loteId]);

    const { total, concluidos } = resumo.rows[0];
    const loteStatus = total === concluidos ? 'concluido' : 'aberto';
    await client.query(
      `UPDATE entrada_manual_lotes SET itens_concluidos=$1, status=$2 WHERE id=$3`,
      [concluidos, loteStatus, loteId]
    );

    await client.query('COMMIT');
    res.json({ mensagem: `${itens.length} itens salvos!`, itens_concluidos: concluidos, total_itens: total, lote_status: loteStatus });
  } catch(e) {
    await client.query('ROLLBACK');
    res.status(500).json({ erro: e.message });
  } finally { client.release(); }
});

// ── DELETE /entrada-manual/lotes/:id — Excluir lote ──────────────────────
router.delete('/entrada-manual/lotes/:id', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    await pool.query(`DELETE FROM entrada_manual_lotes WHERE id=$1`, [req.params.id]);
    res.json({ mensagem: 'Lote excluído.' });
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── GET /entrada-manual/historico-endereco/:codigo ─────────────────────────
// Retorna o endereço mais usado para o código informado (para validação cruzada)
router.get('/entrada-manual/historico-endereco/:codigo', requerAuth, async (req, res) => {
  try {
    const row = await db.get(`
      SELECT endereco, COUNT(*)::int AS vezes,
             MAX(confirmado_em) AS ultimo_uso
      FROM entrada_manual_itens
      WHERE codigo=$1 AND status IN ('abastecido','parcial') AND endereco!=''
      GROUP BY endereco
      ORDER BY vezes DESC, ultimo_uso DESC
      LIMIT 1
    `, [req.params.codigo.toUpperCase()]);
    res.json(row || null);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ── POST /entrada-manual/validar-endereco ─────────────────────────────────
router.post('/entrada-manual/validar-endereco', requerAuth, async (req, res) => {
  const { codigo, endereco } = req.body;
  const endNorm = String(endereco || '').trim().toUpperCase();
  const vEnd = validarEndereco(endNorm);

  if (!vEnd.ok) return res.json({ valido: false, nivel: 'erro', mensagem: 'Formato inválido. Ex: U080 ou U087/VERT-U01-CX13' });

  // Checa histórico
  const hist = await db.get(`
    SELECT endereco, COUNT(*)::int AS vezes
    FROM entrada_manual_itens
    WHERE codigo=$1 AND status IN ('abastecido','parcial') AND endereco!=''
    GROUP BY endereco ORDER BY vezes DESC LIMIT 1
  `, [String(codigo||'').trim().toUpperCase()]).catch(() => null);

  if (hist && hist.endereco !== endNorm) {
    return res.json({ valido: true, nivel: 'aviso',
      mensagem: `Endereço diferente do histórico (usual: ${hist.endereco})`,
      historico: hist.endereco });
  }
  res.json({ valido: true, nivel: 'ok', mensagem: hist ? 'Endereço confirmado pelo histórico' : 'Formato válido' });
});

// ── GET /entrada-manual/exportar — Download CSV ───────────────────────────
router.get('/entrada-manual/exportar', requerAuth, async (req, res) => {
  const { ini, fim, lote_id } = req.query;
  const { data: hoje } = dataHoraLocal();
  try {
    const params = [];
    let where = '1=1';
    if (lote_id) { params.push(lote_id); where += ` AND i.lote_id=$${params.length}`; }
    else {
      params.push(ini || hoje); where += ` AND l.data_entrada>=$${params.length}`;
      params.push(fim || hoje); where += ` AND l.data_entrada<=$${params.length}`;
    }

    const rows = await db.all(`
      SELECT TO_CHAR(l.data_entrada, 'DD/MM/YYYY') AS data_fmt,
             l.criado_por,
             i.codigo, i.descricao, i.quantidade_esperada, i.quantidade_abastecida,
             i.endereco, i.status, i.responsavel, i.obs,
             TO_CHAR(i.confirmado_em AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI') AS confirmado_em
      FROM entrada_manual_itens i
      JOIN entrada_manual_lotes l ON l.id=i.lote_id
      WHERE ${where}
      ORDER BY l.data_entrada DESC, l.id, i.id
    `, params);

    const SEP = ';';
    const statusPT = { abastecido:'Abastecido', parcial:'Parcial', pendente:'Pendente', nao_encontrado:'Não encontrado' };
    const esc = v => { const s = String(v??''); return /[;\n"]/g.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
    const hdrs = ['Data','Responsável','Código','Descrição','Qtd Esperada','Qtd Abastecida','Endereço','Status','Confirmado Em','Obs'];
    const lines = [hdrs.join(SEP)];
    for (const r of rows) {
      lines.push([r.data_fmt, r.responsavel || r.criado_por, r.codigo, r.descricao,
        r.quantidade_esperada, r.quantidade_abastecida||0, r.endereco,
        statusPT[r.status]||r.status, r.confirmado_em||'', r.obs||''].map(esc).join(SEP));
    }
    const csv = '﻿' + lines.join('\r\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition',`attachment; filename="entrada-manual-${hoje}.csv"`);
    res.send(csv);
  } catch(e) { res.status(500).json({ erro: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// CATÁLOGO DE PRODUTOS (barras.xlsx)
// ════════════════════════════════════════════════════════════════════════════

// ── POST /entrada-manual/produtos/importar — Upsert em bulk ──────────────
router.post('/entrada-manual/produtos/importar', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  const { produtos } = req.body;
  if (!Array.isArray(produtos) || !produtos.length)
    return res.status(400).json({ erro: 'Nenhum produto informado.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let inseridos = 0, atualizados = 0;
    for (const p of produtos) {
      const codigo = String(p.codigo || '').trim().toUpperCase();
      if (!codigo) continue;
      const barras    = String(p.codigo_barras || '').trim();
      const nome      = String(p.nome || '').trim();
      const saldo     = parseFloat(p.saldo) || 0;
      const disponivel= parseFloat(p.disponivel) || 0;
      const loc       = String(p.localizacao || '').trim().toUpperCase();

      const existing = await client.query('SELECT id FROM produtos WHERE codigo=$1', [codigo]);
      if (existing.rows.length) {
        await client.query(
          `UPDATE produtos SET codigo_barras=$1,nome=$2,saldo=$3,disponivel=$4,localizacao=$5,atualizado_em=NOW() WHERE codigo=$6`,
          [barras, nome, saldo, disponivel, loc, codigo]
        );
        atualizados++;
      } else {
        await client.query(
          `INSERT INTO produtos (codigo,codigo_barras,nome,saldo,disponivel,localizacao) VALUES ($1,$2,$3,$4,$5,$6)`,
          [codigo, barras, nome, saldo, disponivel, loc]
        );
        inseridos++;
      }
    }
    await client.query('COMMIT');
    res.json({ mensagem: `${inseridos} inseridos, ${atualizados} atualizados.`, inseridos, atualizados });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ erro: e.message });
  } finally { client.release(); }
});

// ── GET /entrada-manual/produtos/buscar?q=X — Busca por código ou barras ─
router.get('/entrada-manual/produtos/buscar', requerAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    const rows = await db.all(
      `SELECT codigo, codigo_barras, nome, saldo, disponivel, localizacao
       FROM produtos
       WHERE codigo ILIKE $1 OR codigo_barras ILIKE $1
       ORDER BY codigo LIMIT 20`,
      [`%${q}%`]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ── GET /entrada-manual/produtos/total — Quantidade total no catálogo ────
router.get('/entrada-manual/produtos/total', requerAuth, async (req, res) => {
  try {
    const r = await db.get('SELECT COUNT(*)::int AS total FROM produtos');
    res.json(r);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// INVENTÁRIO FÍSICO
// ════════════════════════════════════════════════════════════════════════════

// ── GET /inventario/sessoes ───────────────────────────────────────────────
router.get('/inventario/sessoes', requerAuth, async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT * FROM inventario_sessoes ORDER BY criado_em DESC LIMIT 50`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ── POST /inventario/sessoes — Criar sessão (com itens opcionais) ─────────
router.post('/inventario/sessoes', requerAuth, async (req, res) => {
  const { nome, itens, carregarCatalogo } = req.body;
  const criado_por = req.session?.usuario?.nome || '';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let produtos = Array.isArray(itens) ? itens : [];
    if (carregarCatalogo) {
      const { rows } = await client.query(
        `SELECT codigo, nome, codigo_barras, localizacao, saldo AS saldo_sistema FROM produtos ORDER BY localizacao, codigo`
      );
      produtos = rows;
    }

    const r = await client.query(
      `INSERT INTO inventario_sessoes (nome, criado_por, total_itens)
       VALUES ($1, $2, $3) RETURNING id`,
      [nome || `Inventário ${new Date().toLocaleDateString('pt-BR')}`, criado_por, produtos.length]
    );
    const sessaoId = r.rows[0].id;

    if (produtos.length) {
      const codigos  = produtos.map(it => String(it.codigo || '').trim().toUpperCase());
      const nomes    = produtos.map(it => String(it.nome || '').trim());
      const barras   = produtos.map(it => String(it.codigo_barras || '').trim());
      const locs     = produtos.map(it => String(it.localizacao || '').trim().toUpperCase());
      const saldos   = produtos.map(it => parseFloat(it.saldo_sistema) || 0);
      const ids      = produtos.map(() => sessaoId);
      await client.query(
        `INSERT INTO inventario_itens (sessao_id,codigo,nome,codigo_barras,localizacao,saldo_sistema)
         SELECT unnest($1::int[]), unnest($2::text[]), unnest($3::text[]),
                unnest($4::text[]), unnest($5::text[]), unnest($6::numeric[])`,
        [ids, codigos, nomes, barras, locs, saldos]
      );
    }
    await client.query('COMMIT');
    res.json({ id: sessaoId, mensagem: 'Sessão criada!', total: produtos.length });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ erro: e.message });
  } finally { client.release(); }
});

// ── GET /inventario/sessoes/:id — Detalhes + itens ───────────────────────
router.get('/inventario/sessoes/:id', requerAuth, async (req, res) => {
  try {
    const sessao = await db.get(`SELECT * FROM inventario_sessoes WHERE id=$1`, [req.params.id]);
    if (!sessao) return res.status(404).json({ erro: 'Sessão não encontrada.' });
    const itens = await db.all(
      `SELECT * FROM inventario_itens WHERE sessao_id=$1 ORDER BY localizacao, codigo`,
      [req.params.id]
    );
    res.json({ ...sessao, itens });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ── PUT /inventario/itens/:id — Salvar contagem de um item ───────────────
router.put('/inventario/itens/:id', requerAuth, async (req, res) => {
  const { qtd_contada, obs } = req.body;
  const contado_por = req.session?.usuario?.nome || '';
  try {
    const item = await db.get(`SELECT * FROM inventario_itens WHERE id=$1`, [req.params.id]);
    if (!item) return res.status(404).json({ erro: 'Item não encontrado.' });

    const qtd  = parseFloat(qtd_contada);
    const status = isNaN(qtd) ? 'pendente'
                 : Math.abs(qtd - item.saldo_sistema) < 0.001 ? 'ok'
                 : 'divergente';

    await pool.query(
      `UPDATE inventario_itens
       SET qtd_contada=$1, status=$2, contado_por=$3, contado_em=NOW(), obs=COALESCE($4,obs)
       WHERE id=$5`,
      [isNaN(qtd) ? null : qtd, status, contado_por, obs ?? null, req.params.id]
    );

    // Recalcula contagem na sessão
    const res2 = await db.get(
      `SELECT COUNT(*) FILTER (WHERE status!='pendente')::int AS contados FROM inventario_itens WHERE sessao_id=$1`,
      [item.sessao_id]
    );
    await pool.query(
      `UPDATE inventario_sessoes SET contados=$1 WHERE id=$2`,
      [res2.contados, item.sessao_id]
    );

    res.json({ mensagem: 'Salvo!', status, contados: res2.contados });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ── PUT /inventario/sessoes/:id/concluir — Marcar sessão como concluída ──
router.put('/inventario/sessoes/:id/concluir', requerAuth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE inventario_sessoes SET status='concluido', concluido_em=NOW() WHERE id=$1`,
      [req.params.id]
    );
    res.json({ mensagem: 'Inventário concluído.' });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ── DELETE /inventario/sessoes/:id ───────────────────────────────────────
router.delete('/inventario/sessoes/:id', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  try {
    await pool.query(`DELETE FROM inventario_sessoes WHERE id=$1`, [req.params.id]);
    res.json({ mensagem: 'Sessão excluída.' });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ── GET /inventario/sessoes/:id/exportar — CSV das divergências ───────────
router.get('/inventario/sessoes/:id/exportar', requerAuth, async (req, res) => {
  try {
    const sessao = await db.get(`SELECT * FROM inventario_sessoes WHERE id=$1`, [req.params.id]);
    if (!sessao) return res.status(404).json({ erro: 'Sessão não encontrada.' });

    const itens = await db.all(
      `SELECT codigo, nome, localizacao, saldo_sistema, qtd_contada,
              (qtd_contada - saldo_sistema) AS diferenca, status, contado_por, obs,
              TO_CHAR(contado_em AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI') AS contado_em_fmt
       FROM inventario_itens WHERE sessao_id=$1 ORDER BY localizacao, codigo`,
      [req.params.id]
    );

    const SEP = ';';
    const esc = v => { const s = String(v ?? ''); return /[;\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const hdrs = ['Código', 'Nome', 'Localização', 'Saldo Sistema', 'Qtd Contada', 'Diferença', 'Status', 'Contado Por', 'Contado Em', 'Obs'];
    const statusPT = { ok: 'OK', divergente: 'Divergente', pendente: 'Pendente' };
    const lines = [hdrs.join(SEP)];
    for (const it of itens) {
      lines.push([it.codigo, it.nome, it.localizacao, it.saldo_sistema,
                  it.qtd_contada ?? '', it.diferenca ?? '',
                  statusPT[it.status] || it.status, it.contado_por,
                  it.contado_em_fmt || '', it.obs || ''].map(esc).join(SEP));
    }
    const csv = '﻿' + lines.join('\r\n');
    const slug = (sessao.nome || 'inventario').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.csv"`);
    res.send(csv);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
