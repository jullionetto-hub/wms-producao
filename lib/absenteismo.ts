// Só extrai o que a feature de atraso precisa: identidade do colaborador e a
// lista de horários batidos por dia (coluna "Registros" do espelho de ponto
// InPonto). As colunas já calculadas do PDF (H.Pos, H.Neg, Atraso etc.) não
// são usadas — na prática "Atraso" vem quase sempre em branco no relatório
// real, então o atraso por entrada/almoço/pausa é calculado aqui a partir dos
// horários batidos, comparados contra um horário esperado inferido.

const DIAS = 'Seg|Ter|Qua|Qui|Sex|S[aá]b|Dom';
const STATUS_PALAVRAS = ['Férias', 'DSR', 'Atestado Médico', 'Folga BH', 'Banco de Horas', 'Declaração de Horas', 'Falta'];

/** Uma linha diária do espelho de ponto. */
export interface DiaPonto {
  data: string | null;
  dia_semana: string;
  status: string;
  registros: string[];
}

/** Colaborador lido de uma página do espelho de ponto. */
export interface ColaboradorPonto {
  empresa: string;
  nome: string;
  setor: string;
  matricula: string;
  horario: string;
  cnpj: string;
  admissao: string | null;
  pis: string;
  cpf: string;
  saldo_final_min: number | null;
  dias: DiaPonto[];
}

function campo(texto: string, rotulo: string, ateRotulo: string): string {
  const re = new RegExp(`${rotulo}\\s*:?\\s*([\\s\\S]*?)\\s*(?=${ateRotulo})`, 'i');
  const m = texto.match(re);
  return m ? m[1].trim().replace(/\s+/g, ' ') : '';
}

function soDigitos(s?: string | null): string { return (s || '').replace(/\D/g, ''); }

function paraData(ddmmaaaa?: string | null): string | null {
  const m = (ddmmaaaa || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Extrai os blocos de cada colaborador (uma "página" do espelho de ponto) do texto bruto do PDF.
 *  Cada bloco começa exatamente em "Colaborador:" — a posição do nome da empresa antes disso
 *  varia demais entre PDFs pra confiar em quebra de linha, então a empresa vem do nome do
 *  arquivo (ver parseEspelhoPonto), não do corpo do texto. */
function separarBlocos(textoCompleto: string): string[] {
  const marcadores: number[] = [];
  const reColab = /Colaborador\s*:/g;
  let m;
  while ((m = reColab.exec(textoCompleto))) marcadores.push(m.index);
  if (!marcadores.length) return [];

  const blocos: string[] = [];
  for (let i = 0; i < marcadores.length; i++) {
    const fimBloco = i + 1 < marcadores.length ? marcadores[i + 1] : textoCompleto.length;
    blocos.push(textoCompleto.slice(marcadores[i], fimBloco));
  }
  return blocos;
}

/** Nome da empresa a partir do nome do arquivo (ex: "espelho_ponto_USEECOM30082026_082632.pdf" → "USEECOM"). */
export function extrairEmpresaDoArquivo(nomeArquivo?: string | null): string {
  const m = (nomeArquivo || '').match(/espelho[_-]ponto[_-](.+?)\d{6,}[_-]\d{4,}/i);
  if (!m) return '';
  return m[1].replace(/[_-]+/g, ' ').trim();
}

function extrairCabecalho(bloco: string) {
  return {
    nome:      campo(bloco, 'Colaborador', 'Setor'),
    setor:     campo(bloco, 'Setor', 'Espelho de Ponto'),
    matricula: campo(bloco, 'Matr[ií]cula', 'Hor[aá]rio'),
    horario:   campo(bloco, 'Hor[aá]rio', 'Per[ií]odo'),
    cnpj:      campo(bloco, 'CNPJ', 'Admiss[aã]o'),
    admissao:  paraData(campo(bloco, 'Admiss[aã]o', 'Data de Emiss[aã]o')),
    pis:       soDigitos(campo(bloco, 'Pis', 'Id Usu[aá]rio')),
    cpf:       soDigitos(campo(bloco, 'CPF', 'Data\\s*D\\s*H\\s*Registros')),
    saldo_final_min: extrairSaldoFinal(bloco),
  };
}

/**
 * Banco de horas = "Saldo Final" do resumo do período, lido direto do PDF
 * (linha "Anterior(=) Acerto BH(-) Saldo(=) H.Neg Per.(-) Saldo(=) H.Pos.(+)
 * Saldo Final(=)" seguida da linha com os 7 valores correspondentes). Esse
 * número já é oficial e já soma o saldo acumulado de períodos anteriores —
 * não dá pra recalcular por conta própria só com os dias de um período (foi
 * tentado e deu errado, ver histórico). Pega o ÚLTIMO valor HH:MM (pode ser
 * negativo) na janela entre "Anterior" e pouco depois de "Saldo Final",
 * já que essa é sempre a última das 7 colunas daquela linha — robusto a
 * pdf-parse colar os tokens sem espaço, já que cada valor "HH:MM" continua
 * delimitado por caracteres não-numéricos ao redor.
 */
function extrairSaldoFinal(bloco: string): number | null {
  const m = bloco.match(/Anterior[\s\S]{0,500}?Saldo Final[\s\S]{0,150}/i);
  if (!m) return null;
  const valores = m[0].match(/-?\d{1,3}:\d{2}/g);
  if (!valores || !valores.length) return null;
  const ultimo = valores[valores.length - 1].match(/(-?)(\d{1,3}):(\d{2})/)!;
  const sinal = ultimo[1] === '-' ? -1 : 1;
  return sinal * (parseInt(ultimo[2], 10) * 60 + parseInt(ultimo[3], 10));
}

/** Extrai as linhas diárias (data, dia da semana, status, horários batidos) de um bloco de colaborador.
 *  O pdf-parse real não deixa espaço nenhum entre colunas coladas (ex: "27/07/2026Seg10Férias"),
 *  então os separadores aqui são opcionais (\s*, não \s+) e o código H (nº de dia útil) nem é
 *  capturado à parte — capturar ele à parte é ambíguo quando gruda no primeiro horário batido
 *  (ex: "1021:57o" pode ser H=10+21:57 ou H=1+021:57), e ele não é usado em lugar nenhum mesmo. */
function extrairDias(bloco: string): DiaPonto[] {
  const dias: DiaPonto[] = [];
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
export function parseEspelhoPonto(textoCompleto: string, nomeArquivo?: string | null): ColaboradorPonto[] {
  const empresa = extrairEmpresaDoArquivo(nomeArquivo);
  const blocos = separarBlocos(textoCompleto);
  return blocos.map(bloco => ({
    empresa,
    ...extrairCabecalho(bloco),
    dias: extrairDias(bloco),
  })).filter(c => c.nome);
}

const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

/**
 * Mês de referência do período do espelho de ponto. O InPonto fecha o
 * período no meio do mês civil (ex: 27/07 a 26/08) — por convenção, o mês
 * de referência é o mês em que o período FECHA (26/08 → Agosto/2026), não o
 * mês em que começa.
 */
export function mesReferencia(dataFimISO?: string | null): string {
  if (!dataFimISO) return '';
  const [ano, mes] = dataFimISO.split('-').map(Number);
  if (!ano || !mes || mes < 1 || mes > 12) return '';
  return `${MESES_PT[mes - 1]}/${ano}`;
}

export function paraMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
export function paraHHMM(minutos: number): string {
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
export function inferirHorariosEsperados(registrosPorDia: Array<{ horario?: string; registros?: string[] | null }>): Record<string, number[]> {
  const grupos: Record<string, string[][]> = {};
  for (const r of registrosPorDia) {
    if (!r.registros || r.registros.length < 2) continue;
    const chave = `${r.horario}|${r.registros.length}`;
    (grupos[chave] = grupos[chave] || []).push(r.registros);
  }
  const esperado: Record<string, number[]> = {};
  for (const [chave, listas] of Object.entries(grupos)) {
    const n = listas[0].length;
    const medianas: number[] = [];
    for (let i = 0; i < n; i++) {
      const minutos = listas.map(l => paraMinutos(l[i])).sort((a, b) => a - b);
      medianas.push(minutos[Math.floor(minutos.length / 2)]);
    }
    esperado[chave] = medianas;
  }
  return esperado;
}

/**
 * Horário oficial de cada turno (definido pelo usuário, não inferido). O campo
 * "horario" do PDF é texto livre (ex: "Logistica - Madrugada 22h - 06:48h ( c/
 * pausa )"), então o casamento é por substring, sem acento, no texto inteiro.
 * almoco_min/pausa_min são o tempo PERMITIDO em cada intervalo (não um horário
 * fixo de saída pra pausa — isso é livre dentro do turno), somando 1h15 total.
 * Sábado é expediente reduzido pra Manhã/Tarde (06h-10h / 10h-14h, sem pausa
 * cabível em turno de 4h) — entradaSabado sobrescreve a entrada só nesse dia.
 */
interface TurnoOficial {
  chave: string;
  entrada: string;
  almoco_min: number;
  pausa_min: number;
  entradaSabado?: string;
}
const TURNOS_OFICIAIS: TurnoOficial[] = [
  { chave: 'madrugada', entrada: '22:00', almoco_min: 60, pausa_min: 15 },
  { chave: 'tarde',     entrada: '13:00', almoco_min: 60, pausa_min: 15, entradaSabado: '10:00' },
  { chave: 'manh',      entrada: '06:00', almoco_min: 60, pausa_min: 15, entradaSabado: '06:00' }, // "manh" casa Manhã/Manha
];

function ehSabado(diaSemana?: string | null): boolean {
  return /^s[aá]b/i.test(diaSemana || '');
}

/**
 * Esse dia é dia útil ESPERADO pro turno do colaborador? Domingo nunca é
 * (ninguém do time trabalha) — Sábado é dia útil só pra Manhã/Tarde
 * (expediente reduzido, ver TURNOS_OFICIAIS.entradaSabado), Madrugada só
 * trabalha de segunda a sexta. Usado pra não contar folga semanal como "dia
 * trabalhado" nos resumos (routes/absenteismo.js) — sem isso, "total_dias"
 * contava toda linha do espelho de ponto, incluindo os dias de folga.
 */
export function ehDiaUtilEsperado(horarioTexto?: string | null, diaSemana?: string | null): boolean {
  if (/^dom/i.test(diaSemana || '')) return false;
  if (ehSabado(diaSemana)) return !(horarioTexto || '').toLowerCase().includes('madrugada');
  return true;
}

function turnoOficial(horarioTexto?: string | null, diaSemana?: string | null): TurnoOficial | null {
  const t = (horarioTexto || '').toLowerCase();
  const base = TURNOS_OFICIAIS.find(o => t.includes(o.chave)) || null;
  if (!base) return null;
  if (ehSabado(diaSemana) && base.entradaSabado) return { ...base, entrada: base.entradaSabado };
  return base;
}

/** Resultado de classificarDia: só traz os campos que o dia permite avaliar. */
export interface ClassificacaoDia {
  entrada_hora?: string;
  entrada_atraso_min?: number | null;
  almoco_retorno_hora?: string;
  almoco_atraso_min?: number | null;
  pausa_retorno_hora?: string;
  pausa_atraso_min?: number | null;
}

/**
 * Classifica o atraso de um dia (entrada / volta do almoço / volta da pausa).
 * Entrada é sempre comparada contra o horário oficial de início do turno,
 * quando reconhecido; almoço/pausa comparam a DURAÇÃO real do intervalo
 * batido contra o tempo permitido (1h/15min), já que o horário de saída pra
 * pausa é livre dentro do turno — só a duração importa. Turno não reconhecido
 * (fora dos 3 oficiais) cai pro esperado inferido por mediana, como antes.
 * Só classifica almoço/pausa em dias de 4 ou 6 marcações (1 ou 2 pausas); em
 * outros padrões (ex: sábado com 2 marcações) só dá pra avaliar a entrada.
 * diaSemana é usado só pra aplicar a entrada reduzida de sábado (ver
 * TURNOS_OFICIAIS.entradaSabado) — Manhã/Tarde têm expediente diferente aos
 * sábados.
 */
export function classificarDia(
  registros: string[],
  horario: string | undefined,
  esperadoPorGrupo: Record<string, number[]>,
  diaSemana?: string | null,
): ClassificacaoDia {
  const n = registros.length;
  if (n < 2) return {};
  const oficial = turnoOficial(horario, diaSemana);
  const chave = `${horario}|${n}`;
  const medianas = esperadoPorGrupo[chave];
  if (!oficial && !medianas) return {};

  const out: ClassificacaoDia = { entrada_hora: registros[0] };
  out.entrada_atraso_min = oficial
    ? paraMinutos(registros[0]) - paraMinutos(oficial.entrada)
    : (medianas ? paraMinutos(registros[0]) - medianas[0] : null);

  // +1440 se o intervalo atravessa meia-noite (comum no turno Madrugada,
  // ex: saiu 23:50, voltou 00:10 — sem isso a duração daria negativa)
  const duracao = (saida: string, volta: string) => {
    let d = paraMinutos(volta) - paraMinutos(saida);
    if (d < 0) d += 1440;
    return d;
  };
  const devMediana = (i: number) => (medianas ? paraMinutos(registros[i]) - medianas[i] : null);

  if (n === 4) {
    out.almoco_retorno_hora = registros[2];
    out.almoco_atraso_min = oficial
      ? duracao(registros[1], registros[2]) - (oficial.almoco_min + oficial.pausa_min)
      : devMediana(2);
  } else if (n === 6) {
    const dur1 = duracao(registros[1], registros[2]);
    const dur2 = duracao(registros[3], registros[4]);
    // a mais longa é o almoço — padrão observado no espelho de ponto real
    const almocoEh1 = oficial ? dur1 >= dur2 : (medianas ? (medianas[2] - medianas[1]) >= (medianas[4] - medianas[3]) : dur1 >= dur2);
    if (almocoEh1) {
      out.almoco_retorno_hora = registros[2];
      out.almoco_atraso_min = oficial ? dur1 - oficial.almoco_min : devMediana(2);
      out.pausa_retorno_hora = registros[4];
      out.pausa_atraso_min = oficial ? dur2 - oficial.pausa_min : devMediana(4);
    } else {
      out.pausa_retorno_hora = registros[2];
      out.pausa_atraso_min = oficial ? dur1 - oficial.pausa_min : devMediana(2);
      out.almoco_retorno_hora = registros[4];
      out.almoco_atraso_min = oficial ? dur2 - oficial.almoco_min : devMediana(4);
    }
  }

  return out;
}

/**
 * Classificação Ótimo/Mediano/Ruim do absenteísmo do mês, pros critérios de
 * pontuação da Matriz de Responsabilidades (30/15/0 pontos). atrasoMin é a
 * soma de entrada+almoço+pausa atrasados; faltasInjustificadas e
 * ausenciasJustificadas são contagem de dias (status "Falta" e "Atestado
 * Médico" respectivamente).
 */
export function classificarAbsenteismoMes(
  { atrasoMin, faltasInjustificadas, ausenciasJustificadas }:
  { atrasoMin: number; faltasInjustificadas: number; ausenciasJustificadas: number },
): 'Ruim' | 'Ótimo' | 'Mediano' {
  if (faltasInjustificadas > 0 || atrasoMin > 30 || ausenciasJustificadas >= 2) return 'Ruim';
  if (atrasoMin <= 10 && ausenciasJustificadas === 0) return 'Ótimo';
  return 'Mediano';
}

/**
 * Período (ini/fim, 'YYYY-MM-DD') de um mês de referência, a partir dos uploads salvos
 * (cada um com periodo_inicio/periodo_fim). O período do InPonto fecha no meio do mês civil, então
 * "Outubro/2026" = 27/09 a 26/10. Aceita o mês digitado sem se preocupar com caixa/espaços.
 * Retorna null se nenhum upload tem esse mês de referência.
 * (O intervalo ̀-ͯ são os acentos combinantes que o NFD separa das letras.)
 */
export function periodoDoMes(
  uploads: Array<{ periodo_inicio?: string | null; periodo_fim?: string | null }> | null | undefined,
  mes: unknown,
): { ini: string; fim: string } | null {
  const alvo = String(mes || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  if (!alvo) return null;
  const doMes = (uploads || []).filter(u => u.periodo_inicio && u.periodo_fim &&
    mesReferencia(u.periodo_fim).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() === alvo) as Array<{ periodo_inicio: string; periodo_fim: string }>;
  if (!doMes.length) return null;
  return {
    ini: doMes.reduce((m, u) => (u.periodo_inicio < m ? u.periodo_inicio : m), doMes[0].periodo_inicio),
    fim: doMes.reduce((m, u) => (u.periodo_fim > m ? u.periodo_fim : m), doMes[0].periodo_fim),
  };
}

// Só os dias dentro do período (datas 'YYYY-MM-DD', extremos incluídos). Sem período = todos.
export function diasNoPeriodo<T extends { data: string | null }>(dias: T[], periodo?: { ini: string; fim: string } | null): T[] {
  if (!periodo) return dias;
  return dias.filter(d => d.data! >= periodo.ini && d.data! <= periodo.fim);
}
