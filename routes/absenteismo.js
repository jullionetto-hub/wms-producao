'use strict';
const express = require('express');
const router  = express.Router();
const { requerAuth, requerPerfil } = require('../lib/auth');
const { db, pool } = require('../lib/db');
const pdfParse = require('pdf-parse');
const { parseEspelhoPonto, inferirHorariosEsperados, classificarDia, classificarAbsenteismoMes, mesReferencia } = require('../lib/absenteismo');

// ── Absenteísmo nativo — lê o espelho de ponto (PDF do InPonto) direto no WMS.
// Substitui o antigo proxy pro serviço FastAPI separado (desativado). Guarda
// identidade do colaborador, os horários batidos por dia e o Saldo Final do
// banco de horas (lido pronto do resumo do PDF) — as demais colunas
// calculadas do PDF (H.Pos, H.Neg diário, Atraso etc.) não são usadas.
const gLeitura = requerPerfil('gestor', 'supervisor');
const gGestor  = requerPerfil('gestor'); // ações destrutivas (apagar tudo) só pra gestor
// Banco de horas é o "Saldo Final" oficial lido do resumo do PDF
// (abs_colaboradores.saldo_final_min) — não é calculado por conta própria,
// porque esse número já soma o acumulado de períodos anteriores, que não
// temos como reconstruir só com os dias importados.

// Formata minutos (podem ser negativos) como "+1:30" / "-0:45" — usado pro
// saldo de banco de horas mandado pra Matriz de Responsabilidades.
function fmtSaldoHoras(min) {
  if (min == null) return '';
  const sinal = min > 0 ? '+' : (min < 0 ? '-' : '');
  const abs = Math.abs(min);
  return `${sinal}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
}

// Resumo de um colaborador a partir dos dias dele já salvos. total_atraso_min
// é a soma bruta de entrada+almoço+pausa atrasados (sem tolerância — é o
// número absoluto usado nos critérios da Matriz). banco_horas_min vem do
// Saldo Final salvo no cadastro do colaborador (saldoFinalMin), não é
// somado dia a dia. faltas_injustificadas/ausencias_justificadas contam pelo
// texto de Status batido no PDF ("Falta" / "Atestado Médico").
function resumoColaborador(diasDele, tolerancia, saldoFinalMin) {
  const passaTolerancia = min => min != null && min > tolerancia;
  const semTolerancia   = min => min != null && min > 0;
  const positivo = min => (min != null && min > 0) ? min : 0;
  return {
    total_dias: diasDele.length,
    entradas_atrasadas: diasDele.filter(d => passaTolerancia(d.entrada_atraso_min)).length,
    almocos_atrasados:  diasDele.filter(d => semTolerancia(d.almoco_atraso_min)).length,
    pausas_atrasadas:   diasDele.filter(d => semTolerancia(d.pausa_atraso_min)).length,
    total_atraso_min: diasDele.reduce((s, d) =>
      s + positivo(d.entrada_atraso_min) + positivo(d.almoco_atraso_min) + positivo(d.pausa_atraso_min), 0),
    banco_horas_min: saldoFinalMin ?? null,
    faltas_injustificadas: diasDele.filter(d => d.status === 'Falta').length,
    ausencias_justificadas: diasDele.filter(d => d.status === 'Atestado Médico').length,
    declaracoes_horas: diasDele.filter(d => d.status === 'Declaração de Horas').length,
  };
}

// Rota temporária de diagnóstico — não grava nada, só mostra o que o pdf-parse
// extraiu de verdade e como o parser interpretou, pra depurar sem precisar
// rodar Node local (não tem npm/node nesta máquina de desenvolvimento).
router.post('/absenteismo/debug', requerAuth, gLeitura,
  express.raw({ type: 'application/pdf', limit: '25mb' }),
  async (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body) || !req.body.length) {
        return res.status(400).json({ erro: 'Nenhum arquivo PDF enviado.' });
      }
      const nomeArquivo = req.query.nome || 'espelho_ponto.pdf';
      const { text } = await pdfParse(req.body);
      const colaboradores = parseEspelhoPonto(text, nomeArquivo);
      res.json({
        nomeArquivo,
        tamanho_texto: text.length,
        texto_bruto_inicio: text.slice(0, 4000),
        colaboradores_encontrados: colaboradores.length,
        resumo: colaboradores.map(c => ({
          nome: c.nome, empresa: c.empresa, horario: c.horario, cpf: c.cpf,
          saldo_final_min: c.saldo_final_min,
          total_dias: c.dias.length,
          dias_com_data: c.dias.filter(d => d.data).length,
          primeiro_dia: c.dias[0] || null,
          segundo_dia: c.dias[1] || null,
        })),
      });
    } catch (e) { res.status(500).json({ erro: e.message, stack: e.stack }); }
  }
);

router.post('/absenteismo/upload', requerAuth, gLeitura,
  express.raw({ type: 'application/pdf', limit: '25mb' }),
  async (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body) || !req.body.length) {
        return res.status(400).json({ erro: 'Nenhum arquivo PDF enviado.' });
      }
      const nomeArquivo = req.query.nome || req.headers['x-nome-arquivo'] || 'espelho_ponto.pdf';
      const { text } = await pdfParse(req.body);
      const colaboradores = parseEspelhoPonto(text, nomeArquivo);
      if (!colaboradores.length) {
        return res.status(422).json({ erro: 'Não consegui reconhecer nenhum colaborador nesse PDF. Confere se é um espelho de ponto do InPonto.' });
      }

      // Junta todos os dias de todos os colaboradores pra inferir o horário esperado
      // de cada turno (mediana dos horários batidos, por padrão de nº de marcações).
      const todosOsDias = [];
      colaboradores.forEach(c => c.dias.forEach(d => todosOsDias.push({ ...d, horario: c.horario })));
      const esperado = inferirHorariosEsperados(todosOsDias);

      let periodoInicio = null, periodoFim = null;
      colaboradores.forEach(c => c.dias.forEach(d => {
        if (!d.data) return;
        if (!periodoInicio || d.data < periodoInicio) periodoInicio = d.data;
        if (!periodoFim || d.data > periodoFim) periodoFim = d.data;
      }));

      const client = await pool.connect();
      let uploadId;
      try {
        await client.query('BEGIN');
        const rUpload = await client.query(
          `INSERT INTO abs_uploads (arquivo_nome, enviado_por, periodo_inicio, periodo_fim, total_colaboradores)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [nomeArquivo, req.session?.usuario?.nome || '', periodoInicio, periodoFim, colaboradores.length]
        );
        uploadId = rUpload.rows[0].id;

        for (const c of colaboradores) {
          let colaboradorId;
          if (c.cpf) {
            const rColab = await client.query(
              `INSERT INTO abs_colaboradores (nome,empresa,cnpj,setor,horario,matricula,pis,cpf,admissao,saldo_final_min)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
               ON CONFLICT (cpf) DO UPDATE SET
                 nome=EXCLUDED.nome, empresa=EXCLUDED.empresa, cnpj=EXCLUDED.cnpj, setor=EXCLUDED.setor,
                 horario=EXCLUDED.horario, matricula=EXCLUDED.matricula, pis=EXCLUDED.pis, ativo=true,
                 saldo_final_min=EXCLUDED.saldo_final_min
               RETURNING id`,
              [c.nome, c.empresa, c.cnpj, c.setor, c.horario, c.matricula, c.pis, c.cpf, c.admissao, c.saldo_final_min]
            );
            colaboradorId = rColab.rows[0].id;
          } else {
            // sem CPF legível no PDF — casa por nome+empresa pra não duplicar
            const existente = await client.query(
              'SELECT id FROM abs_colaboradores WHERE nome=$1 AND empresa=$2 LIMIT 1', [c.nome, c.empresa]
            );
            if (existente.rows.length) {
              colaboradorId = existente.rows[0].id;
              await client.query(
                'UPDATE abs_colaboradores SET setor=$1, horario=$2, matricula=$3, ativo=true, saldo_final_min=$4 WHERE id=$5',
                [c.setor, c.horario, c.matricula, c.saldo_final_min, colaboradorId]
              );
            } else {
              const rColab = await client.query(
                `INSERT INTO abs_colaboradores (nome,empresa,cnpj,setor,horario,matricula,pis,admissao,saldo_final_min)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
                [c.nome, c.empresa, c.cnpj, c.setor, c.horario, c.matricula, c.pis, c.admissao, c.saldo_final_min]
              );
              colaboradorId = rColab.rows[0].id;
            }
          }

          for (const d of c.dias) {
            if (!d.data) continue;
            const classe = classificarDia(d.registros, c.horario, esperado, d.dia_semana);
            await client.query(
              `INSERT INTO abs_registros_diarios
                 (upload_id,colaborador_id,data,dia_semana,status,registros,
                  entrada_hora,entrada_atraso_min,almoco_retorno_hora,almoco_atraso_min,pausa_retorno_hora,pausa_atraso_min)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
               ON CONFLICT (colaborador_id,data) DO UPDATE SET
                 upload_id=EXCLUDED.upload_id, dia_semana=EXCLUDED.dia_semana, status=EXCLUDED.status,
                 registros=EXCLUDED.registros, entrada_hora=EXCLUDED.entrada_hora, entrada_atraso_min=EXCLUDED.entrada_atraso_min,
                 almoco_retorno_hora=EXCLUDED.almoco_retorno_hora, almoco_atraso_min=EXCLUDED.almoco_atraso_min,
                 pausa_retorno_hora=EXCLUDED.pausa_retorno_hora, pausa_atraso_min=EXCLUDED.pausa_atraso_min`,
              [uploadId, colaboradorId, d.data, d.dia_semana, d.status, JSON.stringify(d.registros),
               classe.entrada_hora||null, classe.entrada_atraso_min ?? null,
               classe.almoco_retorno_hora||null, classe.almoco_atraso_min ?? null,
               classe.pausa_retorno_hora||null, classe.pausa_atraso_min ?? null]
            );
          }
        }

        // Salva/atualiza o horário esperado inferido (auditável, pode virar edição manual depois)
        for (const [chave, medianas] of Object.entries(esperado)) {
          const [horario, padraoStr] = chave.split('|');
          const padrao = parseInt(padraoStr, 10);
          for (let i = 0; i < medianas.length; i++) {
            const hh = String(Math.floor(medianas[i] / 60) % 24).padStart(2, '0');
            const mm = String(medianas[i] % 60).padStart(2, '0');
            await client.query(
              `INSERT INTO abs_horarios_esperados (horario,padrao,indice,hora_esperada)
               VALUES ($1,$2,$3,$4)
               ON CONFLICT (horario,padrao,indice) DO UPDATE SET
                 hora_esperada=EXCLUDED.hora_esperada, atualizado_em=NOW()
               WHERE abs_horarios_esperados.origem='inferido'`,
              [horario, padrao, i, `${hh}:${mm}`]
            );
          }
        }

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      res.status(201).json({
        upload_id: uploadId,
        arquivo_nome: nomeArquivo,
        periodo_inicio: periodoInicio,
        periodo_fim: periodoFim,
        mes_referencia: mesReferencia(periodoFim),
        total_colaboradores: colaboradores.length,
      });
    } catch (e) { res.status(500).json({ erro: e.message }); }
  }
);

router.get('/absenteismo/uploads', requerAuth, gLeitura, wrap(async (req, res) => {
  const uploads = await db.all('SELECT * FROM abs_uploads ORDER BY enviado_em DESC LIMIT 50');
  res.json(uploads.map(u => ({ ...u, mes_referencia: mesReferencia(u.periodo_fim) })));
}));

// Resultado geral: todos os colaboradores ativos com dado importado, sem
// depender de um upload_id específico — é o que fica salvo entre sessões
// (a UI carrega isso ao abrir a tela, não só logo depois de um upload).
router.get('/absenteismo/resultado', requerAuth, gLeitura, wrap(async (req, res) => {
  const tolerancia = parseInt(req.query.tolerancia) || 0;
  const colaboradores = await db.all(`SELECT * FROM abs_colaboradores WHERE ativo=true ORDER BY nome`);
  const dias = await db.all(`SELECT * FROM abs_registros_diarios ORDER BY data`);
  const porColaborador = {};
  dias.forEach(d => { (porColaborador[d.colaborador_id] = porColaborador[d.colaborador_id] || []).push(d); });

  const resultado = colaboradores.map(c => {
    const diasDele = porColaborador[c.id] || [];
    return { colaborador: c, ...resumoColaborador(diasDele, tolerancia, c.saldo_final_min), dias: diasDele };
  }).filter(r => r.total_dias > 0);

  res.json({ resultado });
}));

// Resultado de um upload específico: todos os colaboradores dele com os dias
// classificados (entrada/almoço/pausa atrasados), já filtrando pela tolerância.
router.get('/absenteismo/uploads/:id/resultado', requerAuth, gLeitura, wrap(async (req, res) => {
  const tolerancia = parseInt(req.query.tolerancia) || 0;
  const upload = await db.get('SELECT * FROM abs_uploads WHERE id=$1', [req.params.id]);
  if (!upload) return res.status(404).json({ erro: 'Upload não encontrado' });

  const colaboradores = await db.all(
    `SELECT DISTINCT c.* FROM abs_colaboradores c
     JOIN abs_registros_diarios r ON r.colaborador_id=c.id
     WHERE r.upload_id=$1 ORDER BY c.nome`, [req.params.id]
  );
  const dias = await db.all(
    `SELECT * FROM abs_registros_diarios WHERE upload_id=$1 ORDER BY data`, [req.params.id]
  );
  const porColaborador = {};
  dias.forEach(d => { (porColaborador[d.colaborador_id] = porColaborador[d.colaborador_id] || []).push(d); });

  const resultado = colaboradores.map(c => {
    const diasDele = porColaborador[c.id] || [];
    return { colaborador: c, ...resumoColaborador(diasDele, tolerancia, c.saldo_final_min), dias: diasDele };
  });

  res.json({ upload, resultado });
}));

// Apaga TODOS os dados do absenteísmo nativo (colaboradores, dias importados,
// uploads e horários esperados) — pra recomeçar do zero. Irreversível, por
// isso só gestor pode chamar (a UI ainda pede confirmação dupla antes).
router.delete('/absenteismo/dados', requerAuth, gGestor, wrap(async (req, res) => {
  await pool.query('DELETE FROM abs_registros_diarios');
  await pool.query('DELETE FROM abs_colaboradores');
  await pool.query('DELETE FROM abs_uploads');
  await pool.query('DELETE FROM abs_horarios_esperados');
  res.json({ mensagem: 'Todos os dados do absenteísmo foram apagados.' });
}));

router.get('/absenteismo/colaboradores', requerAuth, gLeitura, wrap(async (req, res) => {
  res.json(await db.all('SELECT * FROM abs_colaboradores WHERE ativo=true ORDER BY nome'));
}));

router.get('/absenteismo/colaboradores/:id/dias', requerAuth, gLeitura, wrap(async (req, res) => {
  const { data_ini, data_fim } = req.query;
  const params = [req.params.id];
  let sql = 'SELECT * FROM abs_registros_diarios WHERE colaborador_id=$1';
  if (data_ini) { params.push(data_ini); sql += ` AND data >= $${params.length}`; }
  if (data_fim) { params.push(data_fim); sql += ` AND data <= $${params.length}`; }
  sql += ' ORDER BY data';
  res.json(await db.all(sql, params));
}));

// Envia o resumo de absenteísmo do colaborador (todos os dias já salvos, sem
// recorte de período — mesmo critério do resultado geral) como um feedback
// mensal na Matriz de Responsabilidades (Painel do Colaborador). O
// casamento entre abs_colaboradores e mz_colaboradores é só por nome
// (tabelas separadas, sem FK entre elas) — se não achar, retorna erro
// pedindo pra conferir o cadastro em vez de criar um colaborador novo.
router.post('/absenteismo/colaboradores/:id/enviar-matriz', requerAuth, gLeitura, wrap(async (req, res) => {
  const { mes } = req.body || {};
  if (!mes) return res.status(400).json({ erro: 'Informe o mês (ex: Agosto/2026)' });

  const colaborador = await db.get('SELECT * FROM abs_colaboradores WHERE id=$1', [req.params.id]);
  if (!colaborador) return res.status(404).json({ erro: 'Colaborador não encontrado' });

  const mzColab = await db.get(
    `SELECT * FROM mz_colaboradores WHERE LOWER(TRIM(nome))=LOWER(TRIM($1)) LIMIT 1`,
    [colaborador.nome]
  );
  if (!mzColab) {
    return res.status(404).json({
      erro: `Não achei "${colaborador.nome}" cadastrado na Matriz de Responsabilidades (nome tem que bater exatamente). Cadastre lá primeiro ou confira o nome.`,
    });
  }

  const dias = await db.all('SELECT * FROM abs_registros_diarios WHERE colaborador_id=$1', [req.params.id]);
  const resumo = resumoColaborador(dias, 0, colaborador.saldo_final_min);
  const status = classificarAbsenteismoMes({
    atrasoMin: resumo.total_atraso_min,
    faltasInjustificadas: resumo.faltas_injustificadas,
    ausenciasJustificadas: resumo.ausencias_justificadas,
  });

  const autor_nome = req.session?.usuario?.nome || '';
  const r = await pool.query(
    `INSERT INTO mz_feedbacks
       (colaborador_id,autor_nome,mes,cargo_snapshot,area_snapshot,absenteismo_mes,
        atrasos,faltas_injustificadas,ausencias_justificadas,saldo_banco_horas)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *, criado_em AS created_at`,
    [mzColab.id, autor_nome, mes, mzColab.cargo||'', mzColab.area||'', status,
     resumo.total_atraso_min, resumo.faltas_injustificadas, resumo.ausencias_justificadas,
     fmtSaldoHoras(resumo.banco_horas_min)]
  );
  res.status(201).json({ feedback: r.rows[0], resumo, status, mz_colaborador: mzColab });
}));

function wrap(fn) { return (req, res, next) => fn(req, res).catch(next); }

module.exports = router;
