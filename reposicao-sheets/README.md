# Reposição 2026 – relatório mensal (Google Apps Script)

Código para colar no Apps Script da própria planilha. Os dados ficam só no Google Sheets;
a página é servida pelo Apps Script e só abre para a sua conta.

1. Abra a planilha > **Extensões > Apps Script**.
2. Cole `Code.gs` no arquivo de código e crie um arquivo HTML chamado `Index` com o conteúdo de `Index.html`.
3. **Implantar > Nova implantação > App da Web**:
   - Executar como: **Eu**
   - Quem tem acesso: **Somente eu**
4. Abra a URL gerada (salve nos favoritos). Use **Imprimir / PDF** para o relatório da gerente.

Abas lidas: nome no formato `01/10` (dia/mês). Outras abas são ignoradas.
Cabeçalhos esperados: Horário, Código, Formas de envio, Separador, Quem pegou, Quem guardou, Situação, OBS.
