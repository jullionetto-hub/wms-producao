// Backfill único: fecha checkouts travados (status != 'concluido') com
// data_checkout anterior a uma data de corte, marcando-os como concluídos e
// o pedido correspondente como embalado — para casos em que o pedido já foi
// de fato conferido/embalado fora do sistema e só falta sincronizar aqui.
//
// Por padrão roda em modo DRY-RUN (só mostra o que seria alterado, não
// grava nada). Para aplicar de verdade: node scripts/backfill-checkout-embalagem-antigos.js --apply
//
// Diferente do endpoint normal de confirmar checkout (que sempre grava a
// data de HOJE), aqui mantemos a data_checkout ORIGINAL — o evento já
// aconteceu no passado, carimbar "hoje" distorceria relatórios por data.
//
// Uso:
//   DATA_CORTE=2026-10-01 node scripts/backfill-checkout-embalagem-antigos.js            // dry-run
//   DATA_CORTE=2026-10-01 node scripts/backfill-checkout-embalagem-antigos.js --apply     // aplica de verdade

const { pool } = require('../lib/db');

const DATA_CORTE = process.env.DATA_CORTE || '2026-10-01';
const APLICAR = process.argv.includes('--apply');
const RESPONSAVEL = 'Sistema (backfill)';

async function main() {
  console.log(`Buscando checkouts com data_checkout < ${DATA_CORTE} e status != 'concluido'...`);

  const { rows } = await pool.query(
    `SELECT c.id AS checkout_id, c.numero_pedido, c.pedido_id, c.status, c.data_checkout, c.hora_criacao,
            p.status_embalagem, p.cliente, p.transportadora, p.tem_prime
       FROM checkout c
       JOIN pedidos p ON p.id = c.pedido_id
      WHERE c.data_checkout < $1
        AND c.status != 'concluido'
      ORDER BY c.data_checkout, c.id`,
    [DATA_CORTE]
  );

  if (!rows.length) {
    console.log('Nenhum checkout pendente encontrado antes dessa data. Nada a fazer.');
    await pool.end();
    return;
  }

  console.log(`\n${rows.length} pedido(s) seriam marcados como checkout concluído + embalado:\n`);
  console.table(rows.map(r => ({
    pedido: r.numero_pedido,
    data_checkout: r.data_checkout,
    status_checkout_atual: r.status,
    status_embalagem_atual: r.status_embalagem,
  })));

  if (!APLICAR) {
    console.log('\nModo DRY-RUN — nada foi alterado. Rode de novo com --apply pra gravar de verdade.');
    await pool.end();
    return;
  }

  console.log('\nAplicando alterações...');
  let ok = 0, falhas = 0;
  for (const r of rows) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Mesmo efeito do PUT /checkout/:id/confirmar, mas preservando a
      // data_checkout original em vez de carimbar hoje.
      const horaFechamento = '23:59:59';
      await client.query(
        `UPDATE checkout SET status='concluido', hora_checkout=COALESCE(NULLIF(hora_checkout,''), $1),
                operador_nome=$2
          WHERE id=$3`,
        [horaFechamento, RESPONSAVEL, r.checkout_id]
      );
      await client.query(
        `INSERT INTO checkout_sessoes (checkout_id, operador_nome, hora_inicio, hora_fim, data_sessao, tempo_min, acao)
         VALUES ($1,$2,$3,$4,$5,0,'concluido')`,
        [r.checkout_id, RESPONSAVEL, r.hora_criacao || horaFechamento, horaFechamento, r.data_checkout]
      );

      // Mesmo efeito do PUT /embalagem/:id/confirmar, também preservando a
      // data original (data_checkout) como data de embalagem.
      await client.query(
        `UPDATE pedidos SET status_embalagem='embalado', embalado_por=$1, embalado_em=$2, numero_caixa=''
          WHERE id=$3`,
        [RESPONSAVEL, horaFechamento, r.pedido_id]
      );
      await client.query(
        `INSERT INTO embalagem (pedido_id, numero_pedido, embalado_por, embalado_em, data_embalagem, cliente, transportadora, is_drive, is_prime)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [r.pedido_id, r.numero_pedido, RESPONSAVEL, horaFechamento, r.data_checkout, r.cliente || '',
         r.transportadora || '', String(r.transportadora||'').toUpperCase().includes('DRIVE'), r.tem_prime === true]
      );

      await client.query('COMMIT');
      ok++;
    } catch (e) {
      await client.query('ROLLBACK');
      falhas++;
      console.error(`Falhou pedido #${r.numero_pedido}:`, e.message);
    } finally {
      client.release();
    }
  }

  console.log(`\nConcluído: ${ok} pedido(s) atualizados, ${falhas} falha(s).`);
  await pool.end();
}

main().catch(e => { console.error('Erro fatal:', e); process.exit(1); });
