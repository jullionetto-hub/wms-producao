# Passo a passo — Repositor: subir o Excel na Entrada Manual

Guia para o **repositor** entrar no WMS e importar a planilha de entrada de estoque.

## 1. Antes de começar

- Tenha em mãos o **usuário** e a **senha** que a supervisão cadastrou para você.
- Tenha o arquivo no celular ou no computador, em **.xlsx, .xls ou .csv**.
- Use um aparelho com **internet**: ao entrar, o sistema baixa a biblioteca que lê o Excel. Sem internet a importação não funciona.

## 2. Preparar a planilha

Só a **primeira aba** do arquivo é lida. A primeira linha deve ser o cabeçalho, com estas colunas (a ordem não importa):

| Coluna | Obrigatória? | Nomes aceitos no cabeçalho |
|---|---|---|
| **Código** | **Sim** | Código, Codigo, Cod, SKU, Ref |
| **Quantidade** | Não (se faltar, vale 1) | Quantidade, Quant., Qtd, Qty |
| **Descrição** | Não | Descrição, Descricao, Produto, Nome |
| **Endereço** | Não (pode preencher depois) | Endereço, Endereco, End, Local |

Regras do endereço: só letras, números, `/` e `-`, de 2 a 30 caracteres (ex.: `D106`, `ZA387`, `C099/VERT-C02-CX18`). Linhas sem código são ignoradas.

## 3. Entrar no sistema

1. Abra o endereço do WMS no navegador.
2. Em **PERFIL DE ACESSO**, clique na caixa e escolha **Reposição**.
3. Digite seu **USUÁRIO** (ex.: `joao.silva`).
4. Digite sua **SENHA** (o ícone de olho mostra ou esconde a senha).
5. Clique em **▶ ENTRAR** (ou aperte Enter).
6. Se aparecer **"Troca de Senha Obrigatória"**, a supervisão redefiniu sua senha: crie uma nova (mínimo 6 caracteres), confirme e clique em **Salvar nova senha**.

Se der erro de login, confira se o perfil escolhido é **Reposição** e peça à supervisão para conferir seu cadastro.

## 4. Abrir a Entrada Manual

**No computador:** no menu à esquerda, em **REPOSIÇÃO**, clique em **Entrada Manual**.

**No celular:** na barra de abas de baixo, toque em **ENTRADA** (é a última aba).

## 5. Importar o arquivo

1. Confirme que está na aba **Entrada de Estoque** (a primeira das três abas).
2. No quadro **Importar novo arquivo**, escreva o **Nome do lote** (ex.: `3R Import 28/05`). Se deixar em branco, o sistema usa "Entrada" + a data de hoje.
3. Clique na área tracejada (no celular, toque nela) e escolha o arquivo. No computador também dá para arrastar.
4. Aparece uma **pré-visualização** com a quantidade de itens detectados. Confira:
   - Aviso **amarelo**: itens sem endereço (podem ser preenchidos depois).
   - Aviso **vermelho**: endereços com formato inválido (são importados mesmo assim, mas confira).
   - Se aparecer *"Coluna Código não encontrada"*, corrija o cabeçalho da planilha e tente de novo.
5. Está certo? Clique em **Importar N itens**. Para desistir, clique em **Cancelar**.
6. O sistema cria o lote e **abre a lista de itens** automaticamente.

## 6. Depois de importar

Na lista do lote, para cada item informe a **quantidade abastecida** (botões − e +, ou digite), escreva uma **observação** se precisar e clique em **Salvar**. Para salvar vários de uma vez, use **Salvar Tudo**. O status do item muda para Abastecido, Parcial ou Não encontrado, e a barra de **Progresso** mostra quanto falta. Se a quantidade informada for diferente da esperada, o sistema pede uma confirmação: confira o número e responda.

O botão **← Voltar** volta para a lista de lotes; **Excel** baixa o lote em planilha.

## 7. Problemas comuns

| O que aparece | O que fazer |
|---|---|
| "Erro ao ler arquivo" ou "XLSX is not defined" | Sem internet ou biblioteca não carregou: atualize a página (Ctrl+F5) e entre de novo. |
| "Arquivo vazio" | A primeira aba está vazia: coloque os dados na primeira aba. |
| "Nenhum item válido encontrado" | Nenhuma linha tem código: confira a coluna Código. |
| Não vejo Entrada Manual no menu | Você entrou com outro perfil: saia e escolha **Reposição**. |
