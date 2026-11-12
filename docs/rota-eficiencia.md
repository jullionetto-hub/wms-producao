# Eficiência de rota (aba em Performance Logística)

Mostra, por separador e por pedido, quanto da caminhada real a melhor ordem evitaria e quantas marcações foram feitas em rajada.

## De onde vem cada número
- **Caminho real**: itens do pedido na ordem de `itens_pedido.hora_verificado` (hora com segundos, gravada a cada Coletado/Parcial/Falta). A virada da meia-noite (turno da noite) é tratada em `ordenarPorHora`.
- **Distâncias**: geometria do **Estoque 3D** (`views/modelo-estoque.html`) em **metros**, guardada em `lib/estoque-geometria.json` (posição de cada endereço + grafo de caminhada). A conta entre dois endereços é a mesma do botão "Rota" do Estoque 3D.
- **Rota ideal**: mesmos endereços, primeiro ponto fixo (onde o separador começou), fim livre; vizinho mais próximo + 2-opt + realocação, partindo também da ordem real. Nunca é maior que a real.
- **Caminhada evitável** = `1 − ideal / real`. **Rajada** = 3+ itens seguidos com até 5 s entre si. **Fora da rota** = evitável acima de 25%.
- O percentual do mapa do rastreio do pedido (`public/js/performance-dash.js`, mapa esquemático) pode diferir: ele não usa metros.

## Quando atualizar a geometria
Se mudar o desenho do estoque (ruas, racks, posições), rode de novo:

```bash
node scripts/extrair-geometria-estoque.js
```

Precisa do Microsoft Edge e de internet (a página carrega o three.js de um CDN). Depois `npm run build && npm test` e publique o `lib/estoque-geometria.json` novo.

## Limites
- Endereço que não existe no modelo 3D é ignorado (não entra na rota).
- É indicador para investigar, não prova de atalho: lote, item bloqueado ou corredor ocupado também mudam a ordem.
- Período de até 31 dias por consulta; pedidos com menos de 3 paradas distintas não entram na caminhada evitável.
