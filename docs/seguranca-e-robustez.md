# Segurança e robustez (itens 1 e 2 do plano de melhoria)

## 1) Senhas
- **A migração de hashes legados (SHA-256) nunca mais grava senha no log.** Antes, `migrarHashesLegados` gerava uma senha
  temporária e a escrevia nos logs do Railway ("informe ao usuário"). Quem tem acesso ao projeto no Railway via essas senhas.
  Agora a senha aleatória é descartada e o log traz só **quem** foi afetado; o supervisor define uma nova senha temporária na
  tela **Usuários** (`PUT /usuarios/:id`). Na prática a migração só age em usuários que nunca entraram desde a adoção do bcrypt.
- **O admin padrão (`admin` / `123456`) só é criado quando não existe nenhum usuário.** Antes, o `INSERT ... ON CONFLICT (login)
  DO NOTHING` rodava a cada reinício: se o login `admin` fosse apagado ou renomeado, um supervisor com senha `123456` voltava.
- **Ação sua:** confira se o usuário `admin` (se existir) já trocou a senha padrão. O código não consegue saber isso.

## 2) Erro esquecido não derruba mais o servidor (`lib/robustez.ts`)
- Express 4 não captura erro de rota `async`: virava `unhandledRejection` e, no Node >= 15, **o processo inteiro caía**.
  Agora o erro vira `next(err)` → resposta **500 só daquela requisição** (o que o Express 5 faz nativamente).
- Rota que já respondeu e falha depois: registra no log e não tenta responder de novo.
- `unhandledRejection`: registra e **segue no ar**. `uncaughtException`: registra e encerra com código 1 (estado incerto);
  o Railway reinicia sozinho (`restartPolicyType = ON_FAILURE`).
- Testes: `tests/robustez.test.js` roda em processo filho a prova de **antes** (processo cai) e **depois** (processo segue).
