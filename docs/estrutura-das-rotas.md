# Estrutura das rotas (item 4: arquivos gigantes divididos)

Seis arquivos de rota tinham de 700 a 1.775 linhas e viraram **pastas com partes por assunto**. O maior arquivo de rota agora tem 569 linhas
(antes: 1.774). `routes/api.ts` não mudou: `require('./pedidos')` continua funcionando (resolve para `routes/pedidos/index.ts`).

| Antes | Agora (`routes/<nome>/`) |
|---|---|
| `pedidos.ts` (1.775) | `fila`, `separacao`, `limpeza`, `importacao`, `distribuicao`, `lotes`, `relatorios` + `_comum` |
| `kpis.ts` (926) | `geral`, `colaboradores`, `dashboard`, `performance`, `liberacao`, `detalhe` |
| `admin.ts` (921) | `manutencao`, `auditoria-relatorios`, `diario`, `diario-validacao`, `relatorio-analitico`, `limpeza-teste` |
| `performance-dash.ts` (871) | `separadores`, `pedidos-timing`, `metas`, `ocorrencias`, `pedido-detalhe` + `_comum` |
| `repositor.ts` (732) | `avisos`, `busca`, `resolucao`, `protocolo` + `_comum` |
| `matriz.ts` (704) | `pessoas`, `raci`, `cargos-config`, `migracao` + `_comum` |

## Como cada pasta funciona
- `index.ts` só **monta** as partes com `router.use(require('./parte'))`, **na mesma ordem** em que as rotas estavam no arquivo único.
  A ordem importa no Express (ex.: `/pedidos/vazios` precisa vir antes de `/pedidos/:id`). **Ao acrescentar uma rota, respeite a ordem.**
- Cada parte tem o próprio `router` e importa só o que usa.
- `_comum.ts` guarda as funções/constantes usadas por mais de uma parte (só ganharam `export`). Se uma função auxiliar é usada por
  uma parte só, ela mora nessa parte.
- Dentro de `matriz/_comum.ts`, `_token` (o login em cache na Matriz) e `getToken` ficam juntos: quem reatribui a variável tem que estar no mesmo arquivo.

## Como foi feito e provado (nenhuma linha de lógica foi reescrita)
- A divisão foi **mecânica**, feita por um script que usa o compilador para descobrir quais auxiliares cada parte usa; nada foi recortado à mão.
- Foi tirada uma "foto" do sistema compilado **antes**. Depois da divisão, as rotas foram achatadas e comparadas: **272 rotas, mesma ordem,
  mesmo caminho e o MESMO CÓDIGO COMPILADO em cada função de rota** (só ignora onde mora uma função auxiliar e a profundidade de um `require`
  relativo, que o script corrigiu para a pasta nova). Controle negativo: alterar 1 letra de propósito é detectado.
- O código que roda **ao carregar** (ex.: os 9 `ALTER TABLE avisos_repositor` do repositor) ficou na primeira parte, na mesma ordem.
- Testes: 50 suítes / 1.242 testes + 136 contra Postgres real; typecheck 0 erros.
- Dois testes antigos liam o *texto* de `kpis.js`/`performance-dash.js`; agora leem todas as partes da pasta (e o fonte `.ts` quando
  procuram texto, porque o compilador reescreve chamadas entre arquivos como `(0, _comum_1.f)(x)`).

## O que NÃO foi dividido
`entrada-manual` (569 linhas), `absenteismo` (487), `checkout` (480): abaixo de 600 linhas, com poucos assuntos. Dá para dividir com o mesmo método se crescerem.
