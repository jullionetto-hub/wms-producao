/**
 * Garante que helpers globais usados em vários arquivos do front-end continuam
 * definidos em algum lugar. Quando uma tela é removida, funções compartilhadas
 * que moravam no arquivo dela deixam chamadas órfãs (ReferenceError só em produção).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = path.join(__dirname, '..', 'public', 'js');
const arquivos = fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'sw.js');
const codigo = Object.fromEntries(arquivos.map(f => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));

const HELPERS = ['escHtml', 'fmtData', 'apiFetch', 'hojeLocal', 'toast'];

describe('helpers globais do front-end', () => {
  test.each(HELPERS)('%s está definido quando é chamado', (nome) => {
    const chamado = arquivos.some(f => new RegExp(`(^|[^.\\w$])${nome}\\s*\\(`).test(codigo[f]));
    const definido = arquivos.some(f => new RegExp(`function\\s+${nome}\\s*\\(|(const|let|var)\\s+${nome}\\s*=`).test(codigo[f]));
    if (chamado) expect(definido).toBe(true);
  });
});

describe('_diarioObsHtml (observações do diário para o turno seguinte)', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(codigo['config.js'].match(/function escHtml[\s\S]*?\n}\n/)[0], ctx);
  vm.runInContext(codigo['auth.js'].match(/function _diarioObsHtml[\s\S]*?\n}\n/)[0], ctx);

  test('mostra todas as seções preenchidas, não só a geral', () => {
    const html = ctx._diarioObsHtml({
      separacao: '11 pedidos com divergência', checkout: '5 checkoutado', reposicao: 'Corredores sem caixas',
      embalagem: '', geral: 'Prime sem integração',
    }, 'Observações do turno');
    expect(html).toContain('Observações do turno');
    expect(html).toContain('11 pedidos com divergência');
    expect(html).toContain('5 checkoutado');
    expect(html).toContain('Corredores sem caixas');
    expect(html).toContain('Prime sem integração');
    expect(html).not.toContain('>Embalagem<'); // seção vazia não aparece
  });

  test('sem nenhuma observação não renderiza nada', () => {
    expect(ctx._diarioObsHtml({ separacao: '', geral: '  ' }, 'x')).toBe('');
    expect(ctx._diarioObsHtml(null, 'x')).toBe('');
  });

  test('escapa HTML digitado pelo supervisor', () => {
    expect(ctx._diarioObsHtml({ geral: '<script>alert(1)</script>' }, 't')).not.toContain('<script>');
  });
});

describe('_diarioMetaHtml (Adicionado por / Verificado por / Visto por)', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(codigo['config.js'].match(/function escHtml[\s\S]*?\n}\n/)[0], ctx);
  vm.runInContext(codigo['auth.js'].match(/const _DIARIO_TURNO_ROTULO[\s\S]*?function _diarioMetaHtml[\s\S]*?\n}\n/)[0], ctx);
  const texto = html => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  test('diário validado: turno e nome de quem criou, de quem verificou e de quem viu', () => {
    const t = texto(ctx._diarioMetaHtml({
      turno: 'Tarde', supervisor: 'Maike Borges', status: 'validado',
      validador: 'Ana Noite', turno_validador: 'Noite', validado_em: '2026-10-29T22:10:00Z',
      vistos: [{ nome: 'Maike Borges', turno: 'Tarde' }, { nome: 'Luciene Tavares', turno: 'Manha' }, { nome: 'Ana Noite', turno: 'Noite' }],
    }));
    expect(t).toContain('Adicionado por: Tarde · Maike Borges');
    expect(t).toContain('Verificado por: Noite · Ana Noite');
    expect(t).toContain('Visto por: Luciene Tavares (Manhã), Ana Noite (Noite)');
    expect(t).not.toContain('Visto por: Maike'); // quem criou não entra em "visto por"
  });

  test('enviado e ainda sem verificação: diz qual turno deve verificar', () => {
    expect(texto(ctx._diarioMetaHtml({ turno: 'Noite', supervisor: 'Leiza', status: 'enviado', vistos: null })))
      .toContain('Verificado por: ainda não verificado — aguardando o turno Manhã');
    expect(texto(ctx._diarioMetaHtml({ turno: 'Manha', supervisor: 'X', status: 'expirado' })))
      .toContain('aguardando o turno Tarde');
  });

  test('rascunho e ninguém viu ainda', () => {
    const t = texto(ctx._diarioMetaHtml({ turno: 'Manha', supervisor: 'Fulano', status: 'rascunho' }));
    expect(t).toContain('Adicionado por: Manhã · Fulano');
    expect(t).toContain('Verificado por: diário ainda não enviado');
    expect(t).toContain('Visto por: ninguém ainda');
  });

  test('escapa HTML nos nomes', () => {
    expect(ctx._diarioMetaHtml({ turno: 'Tarde', supervisor: '<b>x</b>', status: 'rascunho', vistos: [{ nome: '<i>y</i>', turno: 'Noite' }] }))
      .not.toMatch(/<b>x<\/b>|<i>y<\/i>/);
  });
});

describe('_resumoQuantidade (quantos entram e quantos ficam pendentes)', () => {
  const ctx = {};
  vm.createContext(ctx);
  ['_resumoQuantidade', '_chipResumo', '_htmlResumoGlobalDist', '_htmlResumoContagem']
    .forEach(n => vm.runInContext(codigo['pedidos.js'].match(new RegExp(`function ${n}[\\s\\S]*?\\n}\\n`))[0], ctx));

  test('sem quantidade (vazio ou 0): todos entram e nada fica pendente', () => {
    expect(ctx._resumoQuantidade(120, '')).toEqual({ total: 120, entram: 120, pendentes: 0, excedeu: false });
    expect(ctx._resumoQuantidade(120, 0)).toEqual({ total: 120, entram: 120, pendentes: 0, excedeu: false });
  });

  test('quantidade menor que o total: o resto fica pendente', () => {
    expect(ctx._resumoQuantidade(120, '50')).toEqual({ total: 120, entram: 50, pendentes: 70, excedeu: false });
  });

  test('quantidade maior que o total: entram todos e avisa que excedeu', () => {
    expect(ctx._resumoQuantidade(30, 80)).toEqual({ total: 30, entram: 30, pendentes: 0, excedeu: true });
  });

  test('valores inválidos não quebram', () => {
    expect(ctx._resumoQuantidade(undefined, 'abc')).toEqual({ total: 0, entram: 0, pendentes: 0, excedeu: false });
    expect(ctx._resumoQuantidade(10, -5).pendentes).toBe(0);
  });

  test('o resumo mostra Disponíveis, a formar e Ficarão pendentes', () => {
    const html = ctx._htmlResumoContagem(ctx._resumoQuantidade(120, 50), 'A formar agora', '3 Drive Thru fora');
    expect(html).toContain('Disponíveis');
    expect(html).toContain('A formar agora');
    expect(html).toContain('Ficarão pendentes');
    expect(html).toContain('>120<');
    expect(html).toContain('>50<');
    expect(html).toContain('>70<');
    expect(html).toContain('3 Drive Thru fora');
  });
});

describe('_htmlPendentesDist (texto corrido da aba Automática)', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(codigo['pedidos.js'].match(/function _resumoQuantidade[\s\S]*?\n}\n/)[0], ctx);
  vm.runInContext(codigo['pedidos.js'].match(/function _htmlPendentesDist[\s\S]*?\n}\n/)[0], ctx);
  const texto = h => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  test('sem limite: todos entram, nada espera, e explica onde estão os Prime', () => {
    const t = texto(ctx._htmlPendentesDist(ctx._resumoQuantidade(251, ''), false, 64));
    expect(t).toContain('251 pedidos vão ser distribuídos agora');
    expect(t).toContain('nenhum fica esperando');
    expect(t).toContain('Os 64 pedidos Prime não entram aqui');
  });

  test('com limite: diz quantos esperam', () => {
    const t = texto(ctx._htmlPendentesDist(ctx._resumoQuantidade(251, 50), false, 0));
    expect(t).toContain('50 pedidos vão ser distribuídos agora');
    expect(t).toContain('201 pedidos ficam esperando');
  });

  test('modo Prime explica que os normais ficam de fora', () => {
    expect(texto(ctx._htmlPendentesDist(ctx._resumoQuantidade(64, ''), true, 0))).toContain('Os pedidos normais não entram aqui');
  });

  test('singular e fila vazia', () => {
    expect(texto(ctx._htmlPendentesDist(ctx._resumoQuantidade(1, ''), false, 0))).toContain('1 pedido vai ser distribuído agora');
    expect(texto(ctx._htmlPendentesDist(ctx._resumoQuantidade(0, ''), false, 0))).toContain('Não há pedidos na fila');
  });
});

describe('_htmlResumoGlobalDist (já distribuídos / faltam — vale pra todas as abas)', () => {
  const ctx = {};
  vm.createContext(ctx);
  ['_chipResumo', '_htmlResumoGlobalDist']
    .forEach(n => vm.runInContext(codigo['pedidos.js'].match(new RegExp(`function ${n}[\\s\\S]*?\\n}\\n`))[0], ctx));

  test('mostra já distribuídos, faltam e o detalhe do que falta', () => {
    const html = ctx._htmlResumoGlobalDist({ distribuidos: 85, faltam: 35, faltam_normais: 20, faltam_prime: 12, faltam_drive: 3, marcados_turno: 0 }, 0);
    expect(html).toContain('Já distribuídos');
    expect(html).toContain('Faltam distribuir');
    expect(html).toContain('>85<');
    expect(html).toContain('>35<');
    expect(html).toContain('Faltam: 20 normais · 12 Prime · 3 Drive Thru');
    expect(html).not.toContain('Distribuídos agora'); // nada distribuído nesta abertura
  });

  test('depois de distribuir nesta abertura aparece o contador "Distribuídos agora"', () => {
    const html = ctx._htmlResumoGlobalDist({ distribuidos: 110, faltam: 10, faltam_normais: 10, faltam_prime: 0, faltam_drive: 0 }, 25);
    expect(html).toContain('Distribuídos agora');
    expect(html).toContain('>+25<');
  });

  test('avisa quando há pedidos marcados só por turno (sem colaborador)', () => {
    const html = ctx._htmlResumoGlobalDist({ distribuidos: 0, faltam: 40, faltam_normais: 40, faltam_prime: 0, faltam_drive: 0, marcados_turno: 18 }, 0);
    expect(html).toContain('18 deles já marcados por turno, ainda sem colaborador');
  });

  test('tudo distribuído: faltam zero e sem detalhe', () => {
    const html = ctx._htmlResumoGlobalDist({ distribuidos: 120, faltam: 0, faltam_normais: 0, faltam_prime: 0, faltam_drive: 0 }, 0);
    expect(html).toContain('>0<');
    expect(html).not.toContain('Faltam:');
  });

  test('sem dados não renderiza nada', () => {
    expect(ctx._htmlResumoGlobalDist(null, 0)).toBe('');
  });
});

describe('_renderListaColabs (colaboradores em lista na distribuição)', () => {
  const ctx = { document: { querySelectorAll: () => [] } };
  vm.createContext(ctx);
  vm.runInContext(codigo['config.js'].match(/function escHtml[\s\S]*?\n}\n/)[0], ctx);
  ['_renderListaColabs', '_atualizarContagemColabs']
    .forEach(n => vm.runInContext(codigo['pedidos.js'].match(new RegExp(`function ${n}[\\s\\S]*?\\n}\\n`))[0], ctx));

  test('uma linha por colaborador, marcados, com a classe que o cálculo lê', () => {
    const el = { innerHTML: '' };
    ctx._renderListaColabs(el, [{ id: 1, nome: 'Ana', turno: 'Manha' }, { id: 2, nome: 'Bia', turno: 'Tarde' }], 'dist-sep-check');
    expect(el.innerHTML.match(/class="dist-sep-check"/g)).toHaveLength(2);
    expect(el.innerHTML).toContain('value="1" data-nome="Ana" checked');
    expect(el.innerHTML).toContain('colabs-contagem');
    expect(el.innerHTML).toContain('max-height:180px;overflow-y:auto');
  });

  test('escapa o nome e avisa quando o turno está vazio', () => {
    const el = { innerHTML: '' };
    ctx._renderListaColabs(el, [{ id: 3, nome: '<img src=x>', turno: '' }], 'lote-sep-check');
    expect(el.innerHTML).not.toContain('<img');
    ctx._renderListaColabs(el, [], 'lote-sep-check');
    expect(el.innerHTML).toContain('Nenhum colaborador neste turno');
  });
});

describe('lista de usuários agrupada por turno', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(codigo['config.js'].match(/function escHtml[\s\S]*?\n}\n/)[0], ctx);
  vm.runInContext(codigo['pedidos.js'].match(/const _PERFIL_NOME[^\n]*\n/)[0], ctx);
  ['_agruparUsuariosPorTurno', '_htmlLinhaUsuario']
    .forEach(n => vm.runInContext(codigo['pedidos.js'].match(new RegExp(`function ${n}[\\s\\S]*?\\n}\\n`))[0], ctx));

  test('separa em Manhã/Tarde/Noite, em ordem alfabética, e põe quem não tem turno no fim', () => {
    const g = ctx._agruparUsuariosPorTurno([
      { nome: 'Zeca', turno: 'Manha' }, { nome: 'Ana', turno: 'Manhã' }, { nome: 'Bia', turno: 'noite' },
      { nome: 'Caio', turno: null }, { nome: 'Davi', turno: 'Tarde' },
    ]);
    expect(g.map(x => x.rotulo)).toEqual(['Manhã', 'Tarde', 'Noite', 'Sem turno']);
    expect(g[0].itens.map(u => u.nome)).toEqual(['Ana', 'Zeca']);
  });

  test('grupos vazios não aparecem', () => {
    expect(ctx._agruparUsuariosPorTurno([{ nome: 'A', turno: 'Tarde' }]).map(x => x.turno)).toEqual(['Tarde']);
    expect(ctx._agruparUsuariosPorTurno([])).toEqual([]);
  });

  test('linha mostra login e acessos por extenso, e marca inativo', () => {
    const h = ctx._htmlLinhaUsuario({ id: 7, nome: 'Ana', login: 'ana.s', perfil: 'separador', perfis_acesso: 'separador,checkout', status: 'inativo', turno: 'Manha' }, false);
    expect(h).toContain('@ana.s · Separação · Checkout');
    expect(h).toContain('inativo');
    expect(h).not.toContain('shield-lock');
  });

  test('escapa o nome (aspas e HTML) e só mostra permissões ao gestor', () => {
    const u = { id: 1, nome: 'D\'Ávila <b>', login: 'x', perfil: 'gestor', status: 'ativo' };
    const h = ctx._htmlLinhaUsuario(u, true);
    expect(h).not.toContain('<b>');
    expect(h).toContain('shield-lock');
  });
});

describe('importação: bloqueio de pedidos repetidos', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(codigo['pedidos.js'].match(/function _msgImportacao[\s\S]*?\n}\n/)[0], ctx);

  test('mensagem diz quantos foram importados e quantos repetidos foram bloqueados', () => {
    expect(ctx._msgImportacao(10, 0, 0)).toBe('10 pedido(s) importado(s)!');
    expect(ctx._msgImportacao(4, 6, 0)).toBe('4 pedido(s) importado(s)! 6 repetido(s) bloqueado(s) — já estavam no sistema.');
    expect(ctx._msgImportacao(0, 3, 2)).toContain('2 deles com dados diferentes do arquivo (o sistema não foi alterado).');
  });

  test('as duas telas de importação (página e modal) verificam antes e só enviam o que não é repetido', () => {
    const corpo = nome => codigo['pedidos.js'].match(new RegExp(`async function ${nome}\\([\\s\\S]*?\\n}\\n`))[0];
    ['confirmarImportacao', 'confirmarImportacaoModal'].forEach(n => {
      const c = corpo(n);
      expect(c).toContain('_verificarRepetidosImportacao(');
      expect(c).toContain('numeros.filter(n => liberados.has(n))');
      expect(c).toContain('Nada a importar');                     // arquivo todo repetido: nem chama o servidor
      expect(c).toContain('data.repetidos');                      // soma também o que o servidor bloqueou
    });
  });
});

describe('importação: coluna da transportadora (nunca um número)', () => {
  const ctx = {};
  vm.createContext(ctx);
  ['_RE_SERVICO', '_ehNumerico', '_normServico'].forEach(n => vm.runInContext(codigo['pedidos.js'].match(new RegExp(`const ${n} = [^\\n]*\\n`))[0], ctx));
  vm.runInContext(codigo['pedidos.js'].match(/function _colunaServico[\s\S]*?\n}\n/)[0], ctx);
  vm.runInContext('this._normServico = _normServico', ctx);   // const de topo no vm não vira propriedade do contexto

  test('número puro não é transportadora; SEDEX/PAC são normalizados', () => {
    expect(ctx._normServico('60')).toBe('');
    expect(ctx._normServico('1.234,5')).toBe('');
    expect(ctx._normServico('SEDEX II')).toBe('SEDEX');
    expect(ctx._normServico('PAC II')).toBe('PAC');
    expect(ctx._normServico('Drive Thru')).toBe('Drive Thru');
    expect(ctx._normServico('')).toBe('');
  });

  test('cabeçalho acertou a coluna: mantém', () => {
    const linhas = [['5705521', 'x', 'Ana', 'SEDEX II', '60'], ['5705522', 'x', 'Bia', 'PAC II', '9']];
    expect(ctx._colunaServico(linhas, 3)).toBe(3);
  });

  test('cabeçalho apontou a quantidade (o bug): acha a coluna do serviço pelo conteúdo', () => {
    // pedido | aguardando | razão | Qtde. de produtos | serviço
    const linhas = [['5705521', '05/11', 'Idelania', '59', 'SEDEX II'], ['5705497', '05/11', 'Tatiane', '31', 'PAC II'], ['5705439', '05/11', 'Oscar', '49', 'SEDEX II']];
    expect(ctx._colunaServico(linhas, 3)).toBe(4);
    expect(ctx._colunaServico(linhas, -1)).toBe(4);
  });

  test('sem nenhuma coluna que pareça serviço: -1 (fica vazio, não vira número)', () => {
    expect(ctx._colunaServico([['5705521', '59'], ['5705522', '31']], 1)).toBe(-1);
  });
});

describe('Diário de Bordo: recado da gestão (uma informação para os 3 turnos)', () => {
  const monta = perfil => {
    const guardado = {};
    const ctx = { API: '', usuarioAtual: { perfil }, _recadoEditando: null, _recadoFotoRota: 'diario-recados/foto', _recados: [], renderizacoes: 0,
      localStorage: { getItem: k => guardado[k] ?? null, setItem: (k, v) => { guardado[k] = String(v); }, removeItem: k => { delete guardado[k]; } }, guardado };
    vm.createContext(ctx);
    vm.runInContext(codigo['config.js'].match(/function escHtml[\s\S]*?\n}\n/)[0], ctx);
    ['_recadosRecolhidos', '_recadoChave', '_recadoVersao', '_TURNO_ROTULO'].forEach(n => vm.runInContext(codigo['auth.js'].match(new RegExp(`const ${n} = [^\\n]*\\n`))[0], ctx));
    ['_recadoFotosHtml', '_recadoCardHtml', '_recadoRecolhido', 'alternarRecado', '_recadoTurnosTexto', '_recadoTurnosCampoHtml', 'alternarCorpoEdicaoRecado'].forEach(n => vm.runInContext(codigo['auth.js'].match(new RegExp(`function ${n}\\([\\s\\S]*?\\n}\\n`))[0], ctx));
    vm.runInContext('function renderRecadosDiario() { renderizacoes++; }', ctx);
    return ctx;
  };
  const rec = { id: 4, titulo: 'Organização', texto: 'Caixas nas ruas\n<script>x</script>', autor: 'Júlio', criado_em: '2026-11-06T08:00:00Z', fotos: [{ id: 31 }, { id: 32 }] };

  test('todo supervisor vê título, texto (escapado) e fotos; sem botões de gestão', () => {
    const h = monta('supervisor')._recadoCardHtml(rec);
    expect(h).toContain('Recado da gestão · vale para todos os turnos');
    expect(h).toContain('Organização');
    expect(h).toContain('Caixas nas ruas');
    expect(h).not.toContain('<script>');
    expect(h.match(/<img /g)).toHaveLength(2);
    expect(h).toContain("abrirFoto(31,'diario-recados/foto')");
    ['Editar', 'Encerrar recado', 'capture=', 'removerFotoRecado'].forEach(t => expect(h).not.toContain(t));
  });

  test('recado por turno: o cartão diz para quem vale (todos, 1 turno, 2 turnos)', () => {
    const c = monta('supervisor');
    expect(c._recadoCardHtml({ ...rec, turnos: [] })).toContain('Recado da gestão · vale para todos os turnos');
    expect(c._recadoCardHtml({ ...rec, turnos: ['Manha', 'Tarde', 'Noite'] })).toContain('vale para todos os turnos');
    expect(c._recadoCardHtml({ ...rec, turnos: ['Noite'] })).toContain('Recado da gestão · somente Noite');
    expect(c._recadoCardHtml({ ...rec, turnos: ['Manha', 'Noite'] })).toContain('Recado da gestão · somente Manhã e Noite');
    expect(c._recadoCardHtml({ ...rec, turnos: ['Manha', 'Noite'] })).not.toContain('todos os turnos');
  });

  test('recado por turno: o formulário tem as 3 caixinhas (novo = as 3 marcadas; editar = só as do recado)', () => {
    const novo = monta('gestor'); novo._recadoEditando = 'novo';
    const h1 = novo._recadoCardHtml({ id: 0, titulo: '', texto: '', fotos: [] });
    expect(h1.match(/class="rec-turno"/g)).toHaveLength(3);
    expect(h1.match(/ checked>/g)).toHaveLength(3);
    ['Manhã', 'Tarde', 'Noite', 'Quem vê'].forEach(t => expect(h1).toContain(t));

    const ed = monta('gestor'); ed._recadoEditando = 4;
    const h2 = ed._recadoCardHtml({ ...rec, turnos: ['Noite'] });
    expect(h2.match(/class="rec-turno" value="Noite" checked>/g)).toHaveLength(1);
    expect(h2).not.toMatch(/value="Manha" checked>/);
    expect(h2).not.toMatch(/value="Tarde" checked>/);
  });

  test('o gestor vê editar/encerrar, remover foto e os botões Foto (câmera) e Galeria', () => {
    const h = monta('gestor')._recadoCardHtml(rec);
    expect(h).toContain('editarRecado(4)');
    expect(h).toContain('encerrarRecado(4)');
    expect(h).toContain('removerFotoRecado(31)');
    expect(h).toContain('capture="environment"');
    expect(h).toContain('adicionarFotosRecado(4,this)');
  });

  test('em edição mostra os campos; recado novo avisa que a foto vem depois de salvar', () => {
    const c = monta('gestor'); c._recadoEditando = 4;
    const h = c._recadoCardHtml(rec);
    expect(h).toContain('id="rec-titulo"'); expect(h).toContain('id="rec-texto"'); expect(h).toContain('salvarRecado()');
    c._recadoEditando = 'novo';
    const n = c._recadoCardHtml({ id: 0, titulo: '', texto: '', fotos: [] });
    expect(n).toContain('id="rec-texto"'); expect(n).toContain('Salve o recado para poder anexar fotos');
  });

  test('setinha: recolhe (só cabeçalho e título), mostra de novo, e lembra a escolha', () => {
    const c = monta('supervisor'); c._recados = [rec];
    const aberto = c._recadoCardHtml(rec);
    expect(aberto).toContain('alternarRecado(4)');
    expect(aberto).toContain('chevron-up'); expect(aberto).toContain('aria-expanded="true"');
    expect(aberto).toContain('Caixas nas ruas');

    c.alternarRecado(4);                                   // recolher
    const fechado = c._recadoCardHtml(rec);
    expect(fechado).toContain('chevron-down'); expect(fechado).toContain('aria-expanded="false"');
    expect(fechado).toContain('Organização');              // título continua visível
    expect(fechado).toContain('toque para mostrar');
    expect(fechado).not.toContain('Caixas nas ruas');      // texto escondido
    expect(fechado).not.toContain('<img');                 // fotos escondidas
    expect(c.renderizacoes).toBe(1);
    expect(c.guardado['wms_recado_recolhido_4']).toBe('2026-11-06T08:00:00Z');   // lembra no aparelho

    c.alternarRecado(4);                                   // mostrar
    expect(c._recadoCardHtml(rec)).toContain('Caixas nas ruas');
    expect(c.guardado['wms_recado_recolhido_4']).toBeUndefined();
  });

  test('recado editado pela gestão volta aberto mesmo que tenha sido recolhido antes', () => {
    const c = monta('supervisor'); c._recados = [rec]; c.alternarRecado(4);
    expect(c._recadoCardHtml(rec)).not.toContain('Caixas nas ruas');
    const editado = { ...rec, editado_em: '2026-11-06T09:00:00Z' };
    c._recados = [editado];
    c.guardado['wms_recado_recolhido_4'] = '2026-11-06T08:00:00Z';   // outro aparelho com a marca da versão velha
    const outro = monta('supervisor'); outro.guardado['wms_recado_recolhido_4'] = '2026-11-06T08:00:00Z';
    expect(outro._recadoCardHtml(editado)).toContain('Caixas nas ruas');
  });

  test('sem localStorage (bloqueado) a setinha ainda funciona na sessão', () => {
    const c = monta('supervisor'); c._recados = [rec];
    c.localStorage = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); }, removeItem() { throw new Error('bloqueado'); } };
    c.alternarRecado(4);
    expect(c._recadoCardHtml(rec)).not.toContain('Caixas nas ruas');
    c.alternarRecado(4);
    expect(c._recadoCardHtml(rec)).toContain('Caixas nas ruas');
  });

  test('botão Ocultar/Mostrar COM TEXTO em todo cartão (supervisor e gestor)', () => {
    for (const perfil of ['supervisor', 'gestor']) {
      const c = monta(perfil); c._recados = [rec];
      const aberto = c._recadoCardHtml(rec);
      expect(aberto).toContain('</i> Ocultar</button>');          // texto visível, não só a setinha
      expect(aberto).toContain('title="Ocultar recado"');
      c.alternarRecado(4);
      const fechado = c._recadoCardHtml(rec);
      expect(fechado).toContain('</i> Mostrar</button>');
      expect(fechado).toContain('title="Mostrar recado"');
    }
  });

  test('em edição também tem o botão, mas ele só esconde os campos (não recria a tela, senão perderia o texto digitado)', () => {
    const c = monta('gestor'); c._recadoEditando = 4;
    const h = c._recadoCardHtml({ ...rec, turnos: [] });
    expect(h).toContain('alternarCorpoEdicaoRecado(this)');
    expect(h).not.toContain('alternarRecado(');                       // a outra função recria o cartão
    expect(h).toContain('</i> Ocultar</button>');
    // os campos estão dentro do corpo que será escondido; o cabeçalho (com o botão) fica de fora
    const corpo = h.slice(h.indexOf('id="rec-corpo"'));
    ['rec-titulo', 'rec-texto', 'class="rec-turno"', 'salvarRecado()', 'cancelarRecado()'].forEach(t => expect(corpo).toContain(t));
    expect(h.slice(0, h.indexOf('id="rec-corpo"'))).toContain('alternarCorpoEdicaoRecado(this)');
  });

  test('alternarCorpoEdicaoRecado esconde e mostra os campos e troca o texto do botão', () => {
    const c = monta('gestor');
    const corpo = { style: { display: '' } };
    c.document = { getElementById: id => (id === 'rec-corpo' ? corpo : null) };
    const btn = { atributos: {}, title: '', innerHTML: '', setAttribute(k, v) { this.atributos[k] = v; } };
    vm.runInContext('0', c);
    c.alternarCorpoEdicaoRecado(btn);                                  // 1º clique: oculta
    expect(corpo.style.display).toBe('none');
    expect(btn.innerHTML).toContain('Mostrar'); expect(btn.innerHTML).toContain('chevron-down');
    expect(btn.atributos['aria-expanded']).toBe('false'); expect(btn.title).toBe('Mostrar recado');
    c.alternarCorpoEdicaoRecado(btn);                                  // 2º clique: mostra de novo
    expect(corpo.style.display).toBe('');
    expect(btn.innerHTML).toContain('Ocultar'); expect(btn.innerHTML).toContain('chevron-up');
    expect(btn.atributos['aria-expanded']).toBe('true');
  });

  test('texto quebra de linha dentro da caixa e as quebras digitadas são mantidas', () => {
    const c = monta('gestor');
    const ver = c._recadoCardHtml({ ...rec, texto: 'linha 1\nlinha 2' });
    expect(ver).toMatch(/white-space:pre-line;overflow-wrap:anywhere/);
    c._recadoEditando = 4;
    const ed = c._recadoCardHtml(rec);
    expect(ed).toContain('box-sizing:border-box');
    expect(ed).toMatch(/<textarea[^>]*wrap="soft"[^>]*overflow-wrap:anywhere/);
  });

  test('o Diário carrega o recado junto com o resto, no topo da página', () => {
    expect(codigo['auth.js']).toMatch(/Promise\.all\(\[[^\]]*carregarRecadosDiario\(\)\]\)/);
    const idx = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    expect(idx.indexOf('id="diario-recados"')).toBeGreaterThan(-1);
    expect(idx.indexOf('id="diario-recados"')).toBeLessThan(idx.indexOf('id="diario-anterior-resumo"'));
  });
});

describe('Diário de Bordo: botão de foto abre a câmera', () => {
  const ctx = { API: '' };
  vm.createContext(ctx);
  vm.runInContext(codigo['config.js'].match(/function escHtml[\s\S]*?\n}\n/)[0], ctx);
  vm.runInContext(codigo['auth.js'].match(/function _fotoMiniaturas[\s\S]*?\n}\n/)[0], ctx);

  test('"Foto" usa capture (câmera direto) e "Galeria" aceita várias imagens', () => {
    const html = ctx._fotoMiniaturas([], { editavel: true, origem: 'diario', secao: 'reposicao', ctx: 'diario' });
    const inputs = html.match(/<input[^>]*>/g);
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toContain('capture="environment"');
    expect(inputs[0]).not.toContain('multiple');
    expect(inputs[1]).toContain('multiple');
    expect(inputs[1]).not.toContain('capture');
    inputs.forEach(i => expect(i).toContain("adicionarFotos('diario','reposicao',this,'diario')"));
  });

  test('sem edição (diário enviado) não mostra botões; com 6 fotos também não', () => {
    expect(ctx._fotoMiniaturas([{ id: 1 }], { editavel: false })).not.toContain('<input');
    const seis = Array.from({ length: 6 }, (_, i) => ({ id: i + 1 }));
    expect(ctx._fotoMiniaturas(seis, { editavel: true })).not.toContain('<input');
  });
});

describe('Diário de Bordo: carga atrasada não sobrescreve a tela (fotos sumiam)', () => {
  const corpo = nome => codigo['auth.js'].match(new RegExp(`async function ${nome}\\([\\s\\S]*?\\n}\\n`))[0];

  test('as três cargas descartam resposta de quem já trocou de data/turno', () => {
    ['carregarOuCalcularDiario', 'carregarDadosDiario', 'verDiario'].forEach(n => expect(corpo(n)).toContain('seq !== _diarioSeq'));
    expect(codigo['auth.js']).toMatch(/let _diarioSeq = 0;/);
  });

  test('carregarOuCalcularDiario repassa o seq para quem carrega', () => {
    const c = corpo('carregarOuCalcularDiario');
    expect(c).toContain('verDiario(existente.id, seq)');
    expect(c).toContain('carregarDadosDiario(false, seq)');
  });

  test('"Atualizar" não solta o diário salvo (id e fotos) e recusa diário já enviado', () => {
    const c = corpo('carregarDadosDiario');
    expect(c).toContain('manterSalvo');
    expect(c).toMatch(/if \(!salvo\) \{[\s\S]*_diarioAtualId = null;[\s\S]*carregarFotosDiario\(null\)/);
    expect(c).toContain('já foi enviado');
    expect(fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8')).toContain('onclick="carregarDadosDiario(true)"');
  });
});

describe('absenteísmo → Matriz: cache da Matriz', () => {
  test('depois de enviar, marca os feedbacks da Matriz como velhos (senão o que foi enviado não aparece)', () => {
    const ctx = { _mzCarregado: { feedbacks: true, colaboradores: true } };
    vm.createContext(ctx);
    vm.runInContext(codigo['gestao.js'].match(/function _absnInvalidarCacheMatriz[\s\S]*?\n}\n/)[0], ctx);
    ctx._absnInvalidarCacheMatriz();
    expect(ctx._mzCarregado.feedbacks).toBe(false);
    expect(ctx._mzCarregado.colaboradores).toBe(true);   // o resto continua em cache
  });

  test('sem a Matriz carregada não quebra', () => {
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(codigo['gestao.js'].match(/function _absnInvalidarCacheMatriz[\s\S]*?\n}\n/)[0], ctx);
    expect(() => ctx._absnInvalidarCacheMatriz()).not.toThrow();
  });
});

describe('embalagem: início, fim e tempo', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(codigo['auth.js'].match(/function _minutosEmb[\s\S]*?\n}\n/)[0], ctx);
  vm.runInContext(codigo['auth.js'].match(/const _fmtTempoEmb = [^\n]*\n/)[0], ctx);
  vm.runInContext('this._fmtTempoEmb = _fmtTempoEmb', ctx);

  test('minutos entre início e fim', () => {
    expect(ctx._minutosEmb('10:00:00', '10:03:30')).toBe(3.5);
    expect(ctx._minutosEmb('10:00', '11:15')).toBe(75);
  });
  test('vira a meia-noite', () => {
    expect(ctx._minutosEmb('23:58:00', '00:04:00')).toBe(6);
  });
  test('sem início/fim ou diferença absurda (>10h) → null', () => {
    expect(ctx._minutosEmb('', '10:00')).toBeNull();
    expect(ctx._minutosEmb('08:00', '')).toBeNull();
    expect(ctx._minutosEmb('08:00', '22:00')).toBeNull();
  });
  test('formatação', () => {
    expect(ctx._fmtTempoEmb(3.5)).toBe('3.5 min');
    expect(ctx._fmtTempoEmb(75)).toBe('1h15');
    expect(ctx._fmtTempoEmb(null)).toBe('—');
  });
});

describe('escHtml', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(codigo['config.js'].match(/function escHtml[\s\S]*?\n}\n/)[0], ctx);

  test('escapa HTML', () => {
    expect(ctx.escHtml('<b>"oi" & \'tchau\'</b>')).toBe('&lt;b&gt;&quot;oi&quot; &amp; &#39;tchau&#39;&lt;/b&gt;');
  });

  test('nulo e indefinido viram texto vazio', () => {
    expect(ctx.escHtml(null)).toBe('');
    expect(ctx.escHtml(undefined)).toBe('');
  });
});
