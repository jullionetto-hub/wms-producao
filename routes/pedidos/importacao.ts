import express from 'express';
const router = express.Router();
import { db, pool } from '../../lib/db';
import { requerAuth, requerPerfil } from '../../lib/auth';
import { dataHoraLocal } from '../../lib/helpers';
import { registrarAuditoria } from '../../lib/auditoria';
import { calcularPesoCorredor } from '../../lib/pontuacao';
import { classificarImportacao } from '../../lib/importacao';
import type { Linha } from '../../types/db';

// Pedidos que já estão no sistema (com os itens), por número — base da detecção de pedido repetido
async function _pedidosExistentes(numeros: any) {
  const mapa = new Map();
  if (!numeros.length) return mapa;
  const peds = await db.all<Pick<Linha<'pedidos'>, 'id' | 'numero_pedido' | 'cliente' | 'transportadora' | 'aguardando_desde' | 'estado'>>('SELECT id, numero_pedido, cliente, transportadora, aguardando_desde, estado FROM pedidos WHERE numero_pedido = ANY($1::text[])', [numeros]);
  if (!peds.length) return mapa;
  const itens = await db.all<Pick<Linha<'itens_pedido'>, 'pedido_id' | 'codigo' | 'quantidade'>>('SELECT pedido_id, codigo, quantidade FROM itens_pedido WHERE pedido_id = ANY($1::int[])', [peds.map(p => p.id)]);
  peds.forEach(p => mapa.set(String(p.numero_pedido), { ...p, itens: itens.filter(i => i.pedido_id === p.id) }));
  return mapa;
}

// Antes de importar: diz quais pedidos do arquivo são novos, quais completam um pedido incompleto e quais são
// repetidos (já estão no sistema e o arquivo não traz nada novo) — esses últimos são bloqueados. Não grava nada.
router.post('/pedidos/importar/verificar', requerAuth, requerPerfil('supervisor'), async (req, res) => {
  const dados = req.body.pedidos || req.body.linhas || [];
  if (!Array.isArray(dados) || !dados.length) return res.status(400).json({ erro: 'Nenhum pedido informado!' });
  try {
    const numeros = [...new Set(dados.map(d => String(d.numero_pedido ?? '').trim()).filter(Boolean))];
    const r = classificarImportacao(dados, await _pedidosExistentes(numeros));
    res.json({ total: numeros.length, importar: r.importar, novos: r.novos.length, completam: r.completam.length, repetidos: r.repetidos, diferentes: r.diferentes });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.post('/pedidos/importar', requerAuth, requerPerfil('supervisor'), async (req,res) => {
  const dados = req.body.pedidos || req.body.linhas || [];
  if (!dados?.length) return res.status(400).json({erro:'Nenhum pedido informado!'});
  const {data:hoje,hora}=dataHoraLocal();
  let importados=0,ignorados=0,erros=0;
  const repetidos: any[]=[], diferentes=[];
  const numeros=[...new Set<string>(dados.map((d: any)=>String(d.numero_pedido)))];
  // Pedido repetido (mesmo número, nada novo no arquivo) é bloqueado — não importa de novo nem mexe no que já existe
  let classif; try { classif = classificarImportacao(dados, await _pedidosExistentes(numeros.map(n=>n.trim()).filter(Boolean))); } catch(e) { classif = null; }
  if (classif) { classif.repetidos.forEach(n=>repetidos.push(n)); classif.diferentes.forEach(n=>diferentes.push(n)); }
  const bloqueados = new Set(repetidos);
  for (const numero of numeros) {
    if (bloqueados.has(numero.trim())) continue;
    const itens=dados.filter((d: any)=>String(d.numero_pedido)===numero);
    // itensReais: exclui linhas placeholder (pedidos sem itens têm codigo vazio)
    const itensReais=itens.filter((i: any)=>String(i.codigo||'').trim());
    try {
      const ruasU=new Set(itensReais.map((i: any)=>String(i.endereco||'').split(',')[0].trim().replace(/\d+/g,'').trim())).size;
      const pts=Math.round(itensReais.reduce((s: any,i: any)=>s+calcularPesoCorredor(i.endereco)*(parseInt(i.quantidade)||1),0)+ruasU*2);
      // totalItens: quando importado via HTML MIESS (sem SKU), usa o hint de quantidade da planilha HTML
      const totalItens = itensReais.length > 0
        ? itensReais.reduce((s: any,i: any)=>s+(parseInt(i.quantidade)||1),0)
        : (parseInt(itens[0]?.total_itens_hint)||0);
      const itensCount = itensReais.length || totalItens;
      const cliente       = itens[0]?.cliente||'';
      // Transportadora é um nome (SEDEX, PAC, Drive Thru…). Valor só de números é a coluna errada do
      // arquivo (ex.: "Qtde. de produtos") — grava vazio pra não poluir e deixar o reimport preencher.
      const transportadoraBruta = String(itens[0]?.transportadora||'').trim();
      const transportadora= /^[\d.,\s]+$/.test(transportadoraBruta) ? '' : transportadoraBruta;
      const aguardando    = itens[0]?.aguardando_desde||'';
      const estado        = String(itens[0]?.estado||'').trim().toUpperCase().slice(0,2);
      const r=await pool.query(
        `INSERT INTO pedidos (numero_pedido,status,itens,total_itens,rua,cliente,transportadora,aguardando_desde,pontuacao,data_pedido,hora_pedido,tem_prime,status_embalagem,estado)
         VALUES ($1,'pendente',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'nao_iniciado',$12)
         ON CONFLICT(numero_pedido) DO UPDATE SET
           cliente=CASE WHEN pedidos.cliente='' OR pedidos.cliente IS NULL THEN EXCLUDED.cliente ELSE pedidos.cliente END,
           transportadora=CASE WHEN pedidos.transportadora='' OR pedidos.transportadora IS NULL OR pedidos.transportadora ~ '^[0-9.,[:space:]]+$' THEN EXCLUDED.transportadora ELSE pedidos.transportadora END,
           aguardando_desde=CASE WHEN pedidos.aguardando_desde='' OR pedidos.aguardando_desde IS NULL THEN EXCLUDED.aguardando_desde ELSE pedidos.aguardando_desde END,
           estado=CASE WHEN pedidos.estado='' OR pedidos.estado IS NULL THEN EXCLUDED.estado ELSE pedidos.estado END,
           data_pedido=EXCLUDED.data_pedido,
           hora_pedido=EXCLUDED.hora_pedido
         RETURNING id, (xmax = 0) AS inserido`,
        [numero,itensCount,totalItens,itens[0]?.endereco||'',cliente,transportadora,aguardando,pts,hoje,hora,itensReais.some((i: any)=>String(i.codigo||'').toUpperCase()==='PRIME'),estado]);
      if (!r.rows[0]){ignorados++;continue;}
      const pid=r.rows[0].id;
      const pedidoNovo=r.rows[0].inserido;
      // Evita duplicar itens_pedido quando o mesmo pedido é reimportado (ex.: pedido pendente
      // que aparece em exportações de dias diferentes) — só insere se ainda não tem itens.
      if (itensReais.length > 0) {
        const jaTemItens = await pool.query('SELECT 1 FROM itens_pedido WHERE pedido_id=$1 LIMIT 1',[pid]);
        if (!jaTemItens.rows.length) {
          const client=await pool.connect();
          try {
            await client.query('BEGIN');
            for (const it of itensReais) await client.query(`INSERT INTO itens_pedido (pedido_id,codigo,descricao,endereco,quantidade) VALUES ($1,$2,$3,$4,$5)`,[pid,String(it.codigo||'').trim(),String(it.descricao||'').trim(),String(it.endereco||'').trim(),parseInt(it.quantidade)||1]);
            await client.query('COMMIT');
          } catch(ei){
            await client.query('ROLLBACK');
            if (pedidoNovo) await pool.query('DELETE FROM pedidos WHERE id=$1',[pid]);
            erros++;continue;
          } finally{client.release();}
        }
      }
      importados++;
    } catch(err){erros++;}
  }
  if (repetidos.length) await registrarAuditoria(req, 'IMPORTACAO_REPETIDOS_BLOQUEADOS', 'pedidos', null, null, { bloqueados: repetidos.length, amostra: repetidos.slice(0, 20) }).catch(() => {});
  res.json({mensagem:'Importacao concluida!',importados,ignorados,erros,total:numeros.length,repetidos:repetidos.length,repetidos_diferentes:diferentes.length,repetidos_numeros:repetidos.slice(0,100)});
});

module.exports = router;
