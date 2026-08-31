'use strict';

// Só extrai o que a feature de atraso precisa: identidade do colaborador e a
// lista de horários batidos por dia (coluna "Registros" do espelho de ponto
// InPonto). As colunas já calculadas do PDF (H.Pos, H.Neg, Atraso etc.) não
// são usadas — na prática "Atraso" vem quase sempre em branco no relatório
// real, então o atraso por entrada/almoço/pausa é calculado aqui a partir dos
// horários batidos, comparados contra um horário esperado inferido.

const DIAS = 'Seg|Ter|Qua|Qui|Sex|S[aá]b|Dom';
const STATUS_PALAVRAS = ['Férias', 'DSR', 'Atestado Médico', 'Folga BH', 'Banco de Horas', 'Declaração de Horas', 'Falta'];

function campo(texto, rotulo, ateRotulo) {
  const re = new RegExp(`${rotulo}\\s*:?\\s*([\\s\\S]*?)\\s*(?=${ateRotulo})`, 'i');
  const m = texto.match(re);
  return m ? m[1].trim().replace(/\s+/g, ' ') : '';
}

function soDigitos(s) { return (s || '').replace(/\D/g, ''); }

function paraData(ddmmaaaa) {
  const m = (ddmmaaaa || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Extrai os blocos de cada colaborador (uma "página" do espelho de ponto) do texto bruto do PDF.
 *  Cada bloco começa exatamente em "Colaborador:" — a posição do nome da empresa antes disso
 *  varia demais entre PDFs pra confiar em quebra de linha, então a empresa vem do nome do
 *  arquivo (ver parseEspelhoPonto), não do corpo do texto. */
function separarBlocos(textoCompleto) {
  const marcadores = [];
  const reColab = /Colaborador\s*:/g;
  let m;
  while ((m = reColab.exec(textoCompleto))) marcadores.push(m.index);
  if (!marcadores.length) return [];

  const blocos = [];
  for (let i = 0; i < marcadores.length; i++) {
    const fimBloco = i + 1 < marcadores.length ? marcadores[i + 1] : textoCompleto.length;
    blocos.push(textoCompleto.slice(marcadores[i], fimBloco));
  }
  return blocos;
}

/** Nome da empresa a partir do nome do arquivo (ex: "espelho_ponto_USEECOM30082026_082632.pdf" → "USEECOM"). */
function extrairEmpresaDoArquivo(nomeArquivo) {
  const m = (nomeArquivo || '').match(/espelho[_-]ponto[_-](.+?)\d{6,}[_-]\d{4,}/i);
  if (!m) return '';
  return m[1].replace(/[_-]+/g, ' ').trim();
}

function extrairCabecalho(bloco) {
  return {
    nome:      campo(bloco, 'Colaborador', 'Setor'),
    setor:     campo(bloco, 'Setor', 'Espelho de Ponto'),
    matricula: campo(bloco, 'Matr[ií]cula', 'Hor[aá]rio'),
    horario:   campo(bloco, 'Hor[aá]rio', 'Per[ií]odo'),
    cnpj:      campo(bloco, 'CNPJ', 'Admiss[aã]o'),
    admissao:  paraData(campo(bloco, 'Admiss[aã]o', 'Data de Emiss[aã]o')),
    pis:       soDigitos(campo(bloco, 'Pis', 'Id Usu[aá]rio')),
    cpf:       soDigitos(campo(bloco, 'CPF', 'Data\\s*D\\s*H\\s*Registros')),
  };
}

/** Extrai as linhas diárias (data, dia da semana, status, horários batidos) de um bloco de colaborador.
 *  O pdf-parse real não deixa espaço nenhum entre colunas coladas (ex: "27/07/2026Seg10Férias"),
 *  então os separadores aqui são opcionais (\s*, não \s+) e o código H (nº de dia útil) nem é
 *  capturado à parte — capturar ele à parte é ambíguo quando gruda no primeiro horário batido
 *  (ex: "1021:57o" pode ser H=10+21:57 ou H=1+021:57), e ele não é usado em lugar nenhum mesmo. */
function extrairDias(bloco) {
  const dias = [];
  const reLinha = new RegExp(
    `(\\d{2}\\/\\d{2}\\/\\d{4})\\s*(${DIAS})([\\s\\S]*?)(?=\\d{2}\\/\\d{2}\\/\\d{4}\\s*(?:${DIAS})|TOTAL)`,
    'g'
  );
  let m;
  while ((m = reLinha.exec(bloco))) {
    const [, dataStr, diaSemana, resto] = m;
    const registros = [...resto.matchAll(/(\d{2}:\d{2})[oi]/g)].map(x => x[1]);
    const statusMatch = resto.match(new RegExp(`(${STATUS_PALAVRAS.join('|')})`));
    dias.push({
      data: paraData(dataStr),
      dia_semana: diaSemana,
      status: statusMatch ? statusMatch[1] : '',
      registros,
    });
  }
  return dias;
}

/** Parseia o texto extraído do PDF inteiro (várias páginas/colaboradores). */
function parseEspelhoPonto(textoCompleto, nomeArquivo) {
  const empresa = extrairEmpresaDoArquivo(nomeArquivo);
  const blocos = separarBlocos(textoCompleto);
  return blocos.map(bloco => ({
    empresa,
    ...extrairCabecalho(bloco),
    dias: extrairDias(bloco),
  })).filter(c => c.nome);
}

function paraMinutos(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function paraHHMM(minutos) {
  minutos = ((minutos % 1440) + 1440) % 1440;
  const h = String(Math.floor(minutos / 60)).padStart(2, '0');
  const m = String(minutos % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Infere o horário esperado de cada marcação (entrada, volta de pausa...) por
 * turno, usando a mediana dos horários batidos por todo mundo daquele turno
 * com o mesmo padrão de quantidade de marcações no dia (4 = uma pausa, 6 =
 * duas pausas). Mediana é mais resistente a um dia fora da curva do que média.
 */
function inferirHorariosEsperados(registrosPorDia) {
  const grupos = {};
  for (const r of registrosPorDia) {
    if (!r.registros || r.registros.length < 2) continue;
    const chave = `${r.horario}|${r.registros.length}`;
    (grupos[chave] = grupos[chave] || []).push(r.registros);
  }
  const esperado = {};
  for (const [chave, listas] of Object.entries(grupos)) {
    const n = listas[0].length;
    const medianas = [];
    for (let i = 0; i < n; i++) {
      const minutos = listas.map(l => paraMinutos(l[i])).sort((a, b) => a - b);
      medianas.push(minutos[Math.floor(minutos.length / 2)]);
    }
    esperado[chave] = medianas;
  }
  return esperado;
}

/**
 * Classifica o atraso de um dia (entrada / volta do almoço / volta da pausa)
 * comparando os horários batidos contra o esperado inferido pra aquele turno.
 * Só classifica almoço/pausa em dias de 4 ou 6 marcações (1 ou 2 pausas); em
 * outros padrões (ex: sábado com 2 marcações) só dá pra avaliar a entrada.
 */
function classificarDia(registros, horario, esperadoPorGrupo) {
  const n = registros.length;
  if (n < 2) return {};
  const chave = `${horario}|${n}`;
  const medianas = esperadoPorGrupo[chave];
  if (!medianas) return {};
  const dev = i => paraMinutos(registros[i]) - medianas[i];

  const out = { entrada_hora: registros[0], entrada_atraso_min: dev(0) };
  if (n === 4) {
    out.almoco_retorno_hora = registros[2];
    out.almoco_atraso_min = dev(2);
  } else if (n === 6) {
    const durP1 = medianas[2] - medianas[1];
    const durP2 = medianas[4] - medianas[3];
    if (durP1 >= durP2) {
      out.almoco_retorno_hora = registros[2]; out.almoco_atraso_min = dev(2);
      out.pausa_retorno_hora  = registros[4]; out.pausa_atraso_min  = dev(4);
    } else {
      out.pausa_retorno_hora  = registros[2]; out.pausa_atraso_min  = dev(2);
      out.almoco_retorno_hora = registros[4]; out.almoco_atraso_min = dev(4);
    }
  }
  return out;
}

module.exports = { parseEspelhoPonto, inferirHorariosEsperados, classificarDia, paraMinutos, paraHHMM, extrairEmpresaDoArquivo };
