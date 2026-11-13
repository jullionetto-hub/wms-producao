/**
 * Diario de Bordo em abas (public/js/diario-abas.js): partes logicas.
 * O modulo so mexe no DOM no navegador; aqui carregamos so as funcoes puras (sem document).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'diario-abas.js'), 'utf8'), ctx);
const A = ctx.DiarioAbas;

describe('estado de cada setor ("Tudo certo" / "Teve problema")', () => {
  test('vazio = sem resposta; "Sem ocorrências." = ok; qualquer outro texto = problema', () => {
    expect(A.estadoSetor('')).toBeNull();
    expect(A.estadoSetor('   ')).toBeNull();
    expect(A.estadoSetor(null)).toBeNull();
    expect(A.estadoSetor(undefined)).toBeNull();
    expect(A.estadoSetor('Sem ocorrências.')).toBe('ok');
    expect(A.estadoSetor('  Sem ocorrências.  ')).toBe('ok');
    expect(A.estadoSetor('Faltou caixa M')).toBe('problema');
    expect(A.estadoSetor('Sem ocorrências. Mas faltou caixa')).toBe('problema');   // so o texto exato conta como "tudo certo"
  });
  test('resumo: quantos setores respondidos e quais faltam (ordem do diario)', () => {
    expect(A.resumoSetores({ sep: 'x', ck: 'Sem ocorrências.', emb: '', rep: '' })).toEqual({ respondidas: 2, total: 4, faltam: ['Embalagem', 'Reposição'] });
    expect(A.resumoSetores({ sep: 'a', ck: 'b', emb: 'c', rep: 'd' })).toEqual({ respondidas: 4, total: 4, faltam: [] });
    expect(A.resumoSetores({}).respondidas).toBe(0);
  });
  test('o texto de "tudo certo" e uma observacao comum (nenhum dado novo no sistema)', () => {
    expect(A.TXT_OK).toBe('Sem ocorrências.');
  });
});

describe('recados novos (o "!" da aba)', () => {
  const r1 = { id: 1, criado_em: '2026-11-11T05:24:00Z' };
  const r2 = { id: 2, criado_em: '2026-11-06T05:04:00Z', editado_em: '2026-11-07T10:00:00Z' };
  test('sem nada visto, todos sao novos', () => {
    expect(A.naoLidos([r1, r2], {}).map(r => r.id)).toEqual([1, 2]);
    expect(A.naoLidos([r1, r2], null).map(r => r.id)).toEqual([1, 2]);
  });
  test('o que ja foi visto some; recado EDITADO depois de visto volta a ser novo', () => {
    const vistos = { 1: A.versaoRecado(r1), 2: '2026-11-06T05:04:00Z' };           // r2 foi visto antes da edicao
    expect(A.naoLidos([r1, r2], vistos).map(r => r.id)).toEqual([2]);
    expect(A.naoLidos([r1, r2], { 1: A.versaoRecado(r1), 2: A.versaoRecado(r2) })).toEqual([]);
  });
  test('lista vazia / ausente', () => { expect(A.naoLidos([], {})).toEqual([]); expect(A.naoLidos(undefined, {})).toEqual([]); });
  test('texto da aba', () => {
    expect(A.textoRecados(2, 1)).toBe('1 novo');
    expect(A.textoRecados(3, 2)).toBe('2 novos');
    expect(A.textoRecados(2, 0)).toBe('tudo lido');
    expect(A.textoRecados(0, 0)).toBe('nenhum recado');
  });
});

describe('aba inicial: leva ao que precisa de atencao', () => {
  test('recado novo > verificacao pendente > preencher', () => {
    expect(A.abaInicial({ novos: 1, pendente: true })).toBe('recados');
    expect(A.abaInicial({ novos: 0, pendente: true })).toBe('verificar');
    expect(A.abaInicial({ novos: 0, pendente: false })).toBe('preencher');
  });
});

describe('quadro da gestao: quem preencheu e quem verificou', () => {
  const lista = [
    { id: 3, data: '2026-11-11', turno: 'Noite', supervisor: 'Leiza Benta Rodrigues', status: 'rascunho', vistos: [] },
    { id: 2, data: '2026-11-11', turno: 'Tarde', supervisor: 'Maike Borges dos Santos', status: 'enviado', vistos: [{ nome: 'Maike Borges dos Santos', turno: 'Tarde' }, { nome: 'Leiza Benta Rodrigues', turno: 'Noite' }] },
    { id: 1, data: '2026-11-11', turno: 'Manhã', supervisor: 'Luciene Tavares Miranda', status: 'validado', pontuacao: 85, validador: 'Maike Borges dos Santos', turno_validador: 'Tarde', validado_em: '2026-11-11T20:30:00Z', vistos: [] },
    { id: 9, data: '2026-11-10', turno: 'Noite', supervisor: 'Outro Dia', status: 'validado', pontuacao: 100, validador: 'X', turno_validador: 'Manha', vistos: [] },
  ];
  const html = A.quadroGestaoHtml(lista, '2026-11-11');

  test('mostra os 3 turnos do dia com os NOMES de quem preencheu', () => {
    ['Manhã', 'Tarde', 'Noite', 'Luciene Tavares Miranda', 'Maike Borges dos Santos', 'Leiza Benta Rodrigues'].forEach(t => expect(html).toContain(t));
  });
  test('diario validado: quem verificou, de qual turno, e a nota', () => {
    expect(html).toContain('Validado 85/100');
    expect(html).toMatch(/Verificou<\/span> <b>Maike Borges dos Santos<\/b> \(Tarde\)/);
  });
  test('diario enviado: ainda nao verificado e qual turno vai verificar; rascunho: "Preenchendo"', () => {
    expect(html).toContain('ainda não verificado — aguarda o turno Noite');       // Tarde e verificada pela Noite
    expect(html).toContain('Enviado · aguardando verificação');
    expect(html).toContain('Preenchendo</span> <b>Leiza Benta Rodrigues');
    expect(html).toContain('diário ainda não enviado');
  });
  test('quem so viu (nao e o autor) aparece com NOME e turno; o autor nao conta', () => {
    expect(html).toMatch(/Visto por<\/span> <b>Leiza Benta Rodrigues<\/b> <span class="dg-mudo">\(Noite\)/);
    expect(html).not.toContain('visto por 1 pessoa');
  });
  test('preencheu: nome de cada colaborador com os setores que ele salvou', () => {
    const h = A.quadroGestaoHtml([{ id: 5, data: '2026-11-11', turno: 'Noite', supervisor: 'Leiza', status: 'rascunho',
      autores: { separacao: { nome: 'Ana' }, embalagem: { nome: 'Ana' }, checkout: { nome: 'Bia' } }, vistos: [] }], '2026-11-11');
    expect(h).toContain('<b>Ana</b> <span class="dg-mudo">(Separação, Embalagem)</span>');
    expect(h).toContain('<b>Bia</b> <span class="dg-mudo">(Checkout)</span>');
  });
  test('nao mistura diarios de outro dia', () => {
    expect(html).not.toContain('Outro Dia');
  });
  test('turno sem diario no dia: "sem diário"', () => {
    const so = A.quadroGestaoHtml([lista[2]], '2026-11-11');
    expect((so.match(/sem diário/g) || []).length).toBe(2);
    expect(so).toContain('ninguém preencheu ainda');
    expect(A.quadroGestaoHtml([], '2026-11-11').match(/sem diário/g)).toHaveLength(3);
  });
  test('nomes com HTML sao escapados', () => {
    const h = A.quadroGestaoHtml([{ id: 1, data: '2026-11-11', turno: 'Noite', supervisor: '<img src=x onerror=alert(1)>', status: 'rascunho' }], '2026-11-11');
    expect(h).not.toContain('<img');
    expect(h).toContain('&lt;img');
  });
  test('diario expirado tem chip proprio', () => {
    const h = A.quadroGestaoHtml([{ id: 1, data: '2026-11-11', turno: 'Noite', supervisor: 'A', status: 'expirado' }], '2026-11-11');
    expect(h).toContain('Expirado');
  });
});

describe('integracao com a pagina', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const auth = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'auth.js'), 'utf8');
  test('o modulo e carregado DEPOIS do auth.js (precisa de irPara/iniciarDiario)', () => {
    const iAuth = html.indexOf('/js/auth.js'), iMod = html.indexOf('/js/diario-abas.js');
    expect(iAuth).toBeGreaterThan(-1);
    expect(iMod).toBeGreaterThan(iAuth);
  });
  test('os ids que o codigo antigo usa continuam na pagina (o modulo move os blocos, nao os apaga)', () => {
    ['diario-recados', 'diario-validacao-pendente', 'diario-anterior-resumo', 'diario-data', 'diario-turno', 'diario-obs-sep', 'diario-obs-ck',
      'diario-obs-emb', 'diario-obs-rep', 'diario-obs-geral', 'diario-status-banner', 'btn-enviar-diario', 'lista-diarios', 'tbody-diario-prob']
      .forEach(id => expect(html).toContain(`id="${id}"`));
    ['salvarDiario()', 'enviarDiario()'].forEach(f => expect(html).toContain(f));
    expect(auth).toContain('function abrirModalValidacao');
  });
});

describe('resumoSalvos: setores ja salvos por alguem', () => {
  test('nenhum salvo: faltam os 4', () => {
    expect(A.resumoSalvos({})).toEqual({ salvos: 0, total: 4, faltam: ['Separação', 'Checkout', 'Embalagem', 'Reposição'] });
  });
  test('conta so os setores com autor', () => {
    const r = A.resumoSalvos({ separacao: { nome: 'Ana' }, reposicao: { nome: 'Bia' }, geral: { nome: 'Cris' } });
    expect(r.salvos).toBe(2);
    expect(r.faltam).toEqual(['Checkout', 'Embalagem']);
  });
  test('todos salvos: nada falta', () => {
    const a = { separacao: { nome: 'A' }, checkout: { nome: 'B' }, embalagem: { nome: 'C' }, reposicao: { nome: 'D' } };
    expect(A.resumoSalvos(a).faltam).toEqual([]);
  });
});
