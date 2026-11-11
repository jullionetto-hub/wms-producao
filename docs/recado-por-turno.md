# Recado da gestão por turno

A gestão escolhe **quais turnos veem** cada recado do Diário de Bordo: todos, ou só alguns (Manhã, Tarde, Noite).

## Como usar (gestor)
Ao criar/editar um recado aparece **"Quem vê"** com 3 caixinhas, todas marcadas por padrão (= todos os turnos).
Desmarque para limitar. Não dá para salvar sem nenhum turno marcado. O cartão mostra para quem vale:
"vale para todos os turnos" ou "somente Noite" / "somente Manhã e Noite".

## Quem vê o quê
- **Gestor:** vê TODOS os recados (precisa poder editar/encerrar mesmo os de outro turno), cada um com seu rótulo.
- **Supervisor:** vê os que valem para o turno que está olhando no seletor do Diário (e os "para todos").
  Sem escolher turno, vale o turno do próprio usuário.
- Recados antigos (criados antes disto) continuam valendo para todos os turnos.
- É um filtro de **exibição**: não é uma barreira de segurança (as fotos continuam acessíveis a quem tem o link e perfil de supervisor).

## Técnico
- Coluna `diario_recados.turnos TEXT NOT NULL DEFAULT ''` — `''` = todos; senão `"Manha,Noite"` (ordem do dia).
- `POST/PUT /diario-recados` aceitam `turnos` (lista ou texto separado por vírgula; "Manhã"/"Madrugada" são normalizados).
  Os 3 turnos ou lista vazia = todos; turno inválido = 400. **PUT sem o campo não altera os turnos salvos**
  (compatível com uma tela antiga ainda em cache).
- `GET /diario-recados?turno=Manha|Tarde|Noite` devolve `turnos: []` (todos) ou a lista de cada recado.
- Tela: `public/js/auth.js` (`_recadoTurnosTexto`, `_recadoTurnosCampoHtml`); `auth.js?v=68`.
- Testes: `tests/diario-recados-routes.test.js`, `tests/frontend-helpers.test.js`, `tests-db/recado-turnos.test.js` (Postgres real).
