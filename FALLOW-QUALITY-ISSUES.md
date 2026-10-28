# Problemas de qualidade apontados pelo Fallow

Relatório gerado em 2026-10-28 com `fallow` v3.36.0 (configuração `.fallowrc.json`). Execução completa do comando padrão: análise de código não utilizado, duplicação e saúde/complexidade.

## Validação das correções das categorias 3 e 4 — 2026-10-28

- Categoria 3 resolvida: `@better-auth/core` declarada nas dependências de produção.
- Categoria 4 resolvida: extraídas consultas, projeções e schemas compartilhados de lotes, além das operações comuns de carteira, participantes e depósitos do seed.
- `npx fallow --no-cache --format json`: **0 dependências não declaradas e 0 grupos de duplicação** (antes: 1 e 24, respectivamente).
- `npx fallow dupes --no-cache --fail-on-issues`: passou, sem duplicações e sem alterar a configuração ou suprimir achados.
- `npm test`: **33 arquivos e 425 testes passaram** antes e depois da refatoração.
- `npm run typecheck` e `npm run build`: passaram.

As seções abaixo preservam o relatório original para referência; as categorias 3 e 4 não representam mais pendências. Os achados de tamanho, complexidade e hotspots continuam fora do escopo desta correção.

## Resumo

| Tipo | Quantidade |
|---|---:|
| Exports não utilizados | 22 |
| Tipos exportados não utilizados | 16 |
| Dependências importadas sem declaração no `package.json` | 1 |
| Grupos de código duplicado | 24 |
| Funções/unidades acima de 60 linhas | 173 |
| Funções com complexidade acima dos limites | 11 |
| Arquivos hotspot | 23 |
| Alvos de refatoração recomendados | 1 |

## 1. Exports não utilizados

O Fallow não encontrou consumidores conhecidos para estes exports. Local indicado como `arquivo:linha`.

- `src/db/seed-lot-plan.ts:23` — `seedLotStatuses`
- `src/schemas/list-bidder-participations.ts:7` — `bidderParticipationStatusSchema`
- `src/schemas/list-lots.ts:4` — `publicLotStatusSchema`
- `src/schemas/list-lots.ts:8` — `auctioneerLotStatusSchema`
- `src/schemas/show-auctioneer-lot.ts:4` — `showAuctioneerLotStatusSchema`
- `src/schemas/show-lot-audit.ts:8` — `showPublicLotAuditStatusSchema`
- `src/schemas/show-lot.ts:4` — `showPublicLotStatusSchema`
- `src/schemas/wallet.ts:9` — `walletMovementTypeSchema`
- `src/schemas/wallet.ts:59` — `walletMovementSchema`
- `src/schemas/ygo-pro-deck.ts:9` — `cardSetSchema`
- `src/schemas/ygo-pro-deck.ts:17` — `cardImageSchema`
- `src/schemas/ygo-pro-deck.ts:24` — `cardPriceSchema`
- `src/schemas/ygo-pro-deck.ts:32` — `banlistInfoSchema`
- `src/schemas/ygo-pro-deck.ts:38` — `miscInfoSchema`
- `src/schemas/ygo-pro-deck.ts:59` — `cardSchema`
- `src/schemas/ygo-pro-deck.ts:86` — `cardInfoMetaSchema`
- `src/schemas/ygo-pro-deck.ts:97` — `cardInfoSuccessSchema`
- `src/schemas/ygo-pro-deck.ts:102` — `cardInfoPageSchema`
- `src/schemas/ygo-pro-deck.ts:106` — `cardInfoErrorSchema`
- `src/schemas/ygo-pro-deck.ts:122` — `comparisonOperatorSchema`
- `src/schemas/ygo-pro-deck.ts:124` — `numericFilterSchema`
- `src/services/lots/show-auctioneer-lot.ts:97` — `runShowAuctioneerLotRead`

## 2. Tipos exportados não utilizados

Tipos sem consumidores conhecidos. Local indicado como `arquivo:linha`.

- `src/db/deck-fixtures.ts:21` — `DeckFixture`
- `src/schemas/create-lot.ts:29` — `CreateLotBody`
- `src/schemas/wallet.ts:78` — `DepositBody`
- `src/schemas/ygo-pro-deck.ts:174` — `CardSet`
- `src/schemas/ygo-pro-deck.ts:175` — `CardImage`
- `src/schemas/ygo-pro-deck.ts:176` — `CardPrice`
- `src/schemas/ygo-pro-deck.ts:177` — `BanlistInfo`
- `src/schemas/ygo-pro-deck.ts:178` — `MiscInfo`
- `src/schemas/ygo-pro-deck.ts:180` — `CardInfoMeta`
- `src/schemas/ygo-pro-deck.ts:182` — `CardInfoPage`
- `src/schemas/ygo-pro-deck.ts:183` — `CardInfoError`
- `src/schemas/ygo-pro-deck.ts:184` — `CardInfoResponse`
- `src/schemas/ygo-pro-deck.ts:185` — `ComparisonOperator`
- `src/services/yugioh-api/yugioh-api.ts:12` — `CardSearchQuery`
- `src/services/yugioh-api/yugioh-api.ts:14` — `ComparisonOperator`
- `src/services/yugioh-api/yugioh-api.ts:15` — `NumericFilter`

## 3. Dependência não declarada

- `@better-auth/core` é importada em `src/db/seed.ts:2`, mas não está declarada no `package.json`.

## 4. Código duplicado

Foram encontrados 24 grupos de clones. O resumo do Fallow estima 1075 linhas duplicadas; o relatório textual indicou 1.075 linhas (12,6%) em 15 arquivos.

### Grupo 1 (64 linhas/tokens conforme métrica do Fallow)
- `src/services/lots/list-auctioneer-lots.ts:203-263`
- `src/services/lots/list-public-lots.ts:119-182`
### Grupo 2 (67 linhas/tokens conforme métrica do Fallow)
- `src/services/lots/show-auctioneer-lot.ts:210-276`
- `src/services/lots/show-public-lot.ts:179-237`
### Grupo 3 (39 linhas/tokens conforme métrica do Fallow)
- `src/services/lots/list-auctioneer-lots.ts:244-282`
- `src/services/lots/list-bidder-participations.ts:162-200`
### Grupo 4 (19 linhas/tokens conforme métrica do Fallow)
- `src/services/lots/show-auctioneer-lot.ts:230-248`
- `src/services/lots/show-public-lot.ts:199-217`
- `src/services/lots/show-public-receipt.ts:97-115`
### Grupo 5 (20 linhas/tokens conforme métrica do Fallow)
- `src/services/lots/list-auctioneer-lots.ts:263-282`
- `src/services/lots/list-bidder-participations.ts:181-200`
- `src/services/lots/list-public-lots.ts:196-215`
### Grupo 6 (19 linhas/tokens conforme métrica do Fallow)
- `src/schemas/show-auctioneer-lot.ts:15-30`
- `src/schemas/show-lot.ts:15-30`
- `src/schemas/show-receipt.ts:13-31`
### Grupo 7 (20 linhas/tokens conforme métrica do Fallow)
- `src/services/lots/show-auctioneer-lot.ts:278-297`
- `src/services/lots/show-public-lot.ts:239-258`
### Grupo 8 (43 linhas/tokens conforme métrica do Fallow)
- `src/services/lots/list-auctioneer-lots.ts:126-168`
- `src/services/lots/list-bidder-participations.ts:110-152`
### Grupo 9 (9 linhas/tokens conforme métrica do Fallow)
- `src/schemas/list-bidder-participations.ts:23-31`
- `src/schemas/list-lots.ts:46-54`
- `src/schemas/list-lots.ts:61-69`
### Grupo 10 (12 linhas/tokens conforme métrica do Fallow)
- `src/services/lots/show-auctioneer-lot.ts:283-294`
- `src/services/lots/show-public-lot-audit.ts:242-253`
- `src/services/lots/show-public-lot.ts:244-255`
### Grupo 11 (18 linhas/tokens conforme métrica do Fallow)
- `src/services/lots/list-auctioneer-lots.ts:91-108`
- `src/services/lots/list-bidder-participations.ts:84-101`
### Grupo 12 (21 linhas/tokens conforme métrica do Fallow)
- `src/services/lots/show-auctioneer-lot.ts:189-208`
- `src/services/lots/show-public-lot.ts:158-178`
### Grupo 13 (67 linhas/tokens conforme métrica do Fallow)
- `src/models/wallet.ts:231-297`
- `src/models/wallet.ts:354-459`
### Grupo 14 (16 linhas/tokens conforme métrica do Fallow)
- `src/services/lots/show-auctioneer-lot.ts:173-188`
- `src/services/lots/show-public-lot.ts:142-157`
### Grupo 15 (15 linhas/tokens conforme métrica do Fallow)
- `src/services/lots/show-auctioneer-lot.ts:157-171`
- `src/services/lots/show-public-lot.ts:127-141`
### Grupo 16 (10 linhas/tokens conforme métrica do Fallow)
- `src/schemas/show-auctioneer-lot.ts:32-41`
- `src/schemas/show-lot.ts:32-41`
### Grupo 17 (10 linhas/tokens conforme métrica do Fallow)
- `src/services/lots/show-auctioneer-lot.ts:147-156`
- `src/services/lots/show-public-lot.ts:116-125`
### Grupo 18 (10 linhas/tokens conforme métrica do Fallow)
- `src/models/lot-participant.ts:13-22`
- `src/models/lot-participant.ts:33-42`
### Grupo 19 (12 linhas/tokens conforme métrica do Fallow)
- `src/services/lots/list-auctioneer-lots.ts:150-161`
- `src/services/lots/list-public-lots.ts:95-106`
### Grupo 20 (25 linhas/tokens conforme métrica do Fallow)
- `src/schemas/list-bidder-participations.ts:14-38`
- `src/schemas/list-lots.ts:37-59`
### Grupo 21 (7 linhas/tokens conforme métrica do Fallow)
- `src/db/seed-lot-activity.ts:57-60`
- `src/db/seed-lot-activity.ts:82-88`
### Grupo 22 (39 linhas/tokens conforme métrica do Fallow)
- `src/models/wallet.ts:183-221`
- `src/models/wallet.ts:332-369`
### Grupo 23 (5 linhas/tokens conforme métrica do Fallow)
- `src/schemas/show-auctioneer-lot.ts:42-46`
- `src/schemas/show-lot.ts:42-46`
### Grupo 24 (16 linhas/tokens conforme métrica do Fallow)
- `src/services/lots/list-bidder-participations.ts:84-99`
- `src/services/lots/list-public-lots.ts:50-64`

## 5. Funções/unidades muito grandes

Unidades acima do limite de 60 linhas de código (inclui blocos `describe` de testes que o Fallow reporta como unidades).

Os **173 achados** do relatório original foram divididos em **17 lotes menores**, agrupados por área e arquivo, com 4 a 18 itens por lote. Cada documento contém uma checklist com as referências, nomes e métricas originais.

Escolha um lote por vez e acompanhe sua conclusão no documento correspondente. As linhas são referências da execução de 2026-10-28 e podem ter mudado após refatorações. Blocos aninhados podem gerar mais de um achado no mesmo arquivo.

Use o [modelo de prompt para resolver um lote](docs/fallow/PROMPT-RESOLVER-CATEGORIA-5.md), que define as verificações para preservar o comportamento e a força dos testes durante a refatoração.

| Lote | Escopo | Achados |
|---|---|---:|
| 01 | [Criação e cancelamento de lotes](docs/fallow/categoria-5/01-criacao-e-cancelamento.md) | 13 |
| 02 | [Lances](docs/fallow/categoria-5/02-lances.md) | 10 |
| 03 | [Liquidação de lotes](docs/fallow/categoria-5/03-liquidacao.md) | 18 |
| 04 | [Listagem de lotes do leiloeiro](docs/fallow/categoria-5/04-listagem-leiloeiro.md) | 9 |
| 05 | [Listagem de participações](docs/fallow/categoria-5/05-participacoes.md) | 11 |
| 06 | [Listagem pública de lotes](docs/fallow/categoria-5/06-listagem-publica.md) | 8 |
| 07 | [Detalhes do lote para o leiloeiro](docs/fallow/categoria-5/07-detalhes-leiloeiro.md) | 14 |
| 08 | [Detalhes públicos do lote](docs/fallow/categoria-5/08-detalhes-publicos.md) | 10 |
| 09 | [Serviços de auditoria e recibos](docs/fallow/categoria-5/09-auditoria-e-recibos.md) | 9 |
| 10 | [Rotas privadas de lotes, lances e participações](docs/fallow/categoria-5/10-rotas-privadas.md) | 13 |
| 11 | [Carteira e depósitos](docs/fallow/categoria-5/11-carteira.md) | 11 |
| 12 | [Sala pública ao vivo](docs/fallow/categoria-5/12-sala-ao-vivo.md) | 8 |
| 13 | [Rotas públicas de lotes, auditoria e recibos](docs/fallow/categoria-5/13-rotas-publicas.md) | 11 |
| 14 | [Schemas de resposta](docs/fallow/categoria-5/14-schemas.md) | 14 |
| 15 | [Autenticação](docs/fallow/categoria-5/15-autenticacao.md) | 4 |
| 16 | [Banco de dados, fixtures e seed](docs/fallow/categoria-5/16-banco-e-seed.md) | 6 |
| 17 | [Integração com a API de Yu-Gi-Oh!](docs/fallow/categoria-5/17-api-yugioh.md) | 4 |
| | **Total** | **173** |

## 6. Complexidade alta

Funções que excedem um ou mais limites de complexidade ciclomática, cognitiva, CRAP ou tamanho. `CRAP` é estimado por referências de export; o Fallow recomenda cobertura real para valor exato.

- `src/services/lots/place-bid.ts:114` — `accepted` (**critical**): ciclomática 23, cognitiva 26, 180 linhas, CRAP 137.3 (dimensões excedidas: `all`).
- `src/services/lots/show-public-lot-audit.ts:131` — `verifyChain` (**critical**): ciclomática 21, cognitiva 24, 81 linhas, CRAP 116.3 (dimensões excedidas: `all`).
- `src/services/lots/settle-due-lots.ts:103` — `settleLockedLot` (**high**): ciclomática 16, cognitiva 15, 154 linhas, CRAP 71.3 (dimensões excedidas: `crap`).
- `src/services/lots/settle-due-lots.test.ts:784` — `it("keeps a single valid outcome and accepts...")` (**moderate**): ciclomática 13, cognitiva 8, 91 linhas, CRAP 49.5 (dimensões excedidas: `crap`).
- `src/routes/public/lot-live.test.ts:253` — `readLiveFrames` (**moderate**): ciclomática 11, cognitiva 21, 57 linhas, CRAP 37.1 (dimensões excedidas: `cognitive_crap`).
- `src/routes/public/lot-live.test.ts:1126` — `it("tells the room the winner participant nu...")` (**moderate**): ciclomática 11, cognitiva 4, 58 linhas, CRAP 37.1 (dimensões excedidas: `crap`).
- `src/services/lots/create-lot.test.ts:76` — `insertLot` (**moderate**): ciclomática 11, cognitiva 10, 24 linhas, CRAP 37.1 (dimensões excedidas: `crap`).
- `src/routes/private/place-bid.test.ts:96` — `insertLiveLot` (**moderate**): ciclomática 10, cognitiva 6, 34 linhas, CRAP 31.6 (dimensões excedidas: `crap`).
- `src/db/seed-lots.ts:191` — `fetchPasscodeChunk` (**high**): ciclomática 8, cognitiva 11, 41 linhas, CRAP 72.0 (dimensões excedidas: `crap`).
- `src/db/seed-lot-activity.ts:233` — `settleEndedLots` (**high**): ciclomática 7, cognitiva 8, 31 linhas, CRAP 56.0 (dimensões excedidas: `crap`).
- `src/db/seed.ts:42` — `<arrow>` (**moderate**): ciclomática 6, cognitiva 5, 59 linhas, CRAP 42.0 (dimensões excedidas: `crap`).

## 7. Hotspots de manutenção

Arquivos com combinação de complexidade e churn nos últimos seis meses; a tendência e as métricas abaixo são as reportadas pelo Fallow.

- `src/index.ts` — score 71.4; 8 commits ponderados (7.8); 94 linhas adicionadas / 55 removidas; densidade 0.15; tendência `cooling`.
- `src/lib/auth.ts` — score 54.8; 7 commits ponderados (6.91); 140 linhas adicionadas / 13 removidas; densidade 0.13; tendência `accelerating`.
- `src/services/yugioh-api/save-unregistered-cards.ts` — score 38.2; 3 commits ponderados (2.98); 127 linhas adicionadas / 6 removidas; densidade 0.21; tendência `cooling`.
- `src/routes/private/lots.test.ts` — score 36.4; 6 commits ponderados (5.96); 890 linhas adicionadas / 15 removidas; densidade 0.1; tendência `cooling`.
- `src/models/wallet.ts` — score 36.4; 6 commits ponderados (5.96); 491 linhas adicionadas / 2 removidas; densidade 0.1; tendência `cooling`.
- `src/schemas/money.ts` — score 31.0; 3 commits ponderados (2.99); 105 linhas adicionadas / 0 removidas; densidade 0.17; tendência `cooling`.
- `src/models/lot.ts` — score 29.1; 4 commits ponderados (3.97); 178 linhas adicionadas / 1 removidas; densidade 0.12; tendência `stable`.
- `src/app.auth.test.ts` — score 28.9; 4 commits ponderados (3.94); 440 linhas adicionadas / 28 removidas; densidade 0.12; tendência `stable`.
- `src/routes/public/lot-live.test.ts` — score 25.6; 3 commits ponderados (2.99); 1319 linhas adicionadas / 40 removidas; densidade 0.14; tendência `cooling`.
- `src/db/seed.ts` — score 24.2; 5 commits ponderados (4.96); 138 linhas adicionadas / 5 removidas; densidade 0.08; tendência `accelerating`.
- `src/services/yugioh-api/yugioh-api.test.ts` — score 21.8; 3 commits ponderados (2.97); 320 linhas adicionadas / 0 removidas; densidade 0.12; tendência `accelerating`.
- `src/routes/private/lots.ts` — score 21.2; 5 commits ponderados (4.96); 291 linhas adicionadas / 0 removidas; densidade 0.07; tendência `cooling`.
- `src/routes/private/wallet.test.ts` — score 18.2; 3 commits ponderados (2.98); 1387 linhas adicionadas / 9 removidas; densidade 0.1; tendência `cooling`.
- `src/services/lots/list-public-lots.ts` — score 18.2; 3 commits ponderados (2.98); 239 linhas adicionadas / 18 removidas; densidade 0.1; tendência `cooling`.
- `src/app.ts` — score 18.1; 6 commits ponderados (5.93); 115 linhas adicionadas / 57 removidas; densidade 0.05; tendência `stable`.
- `src/routes/public/index.ts` — score 16.9; 4 commits ponderados (3.96); 18 linhas adicionadas / 3 removidas; densidade 0.07; tendência `cooling`.
- `src/routes/public/lots.test.ts` — score 14.6; 3 commits ponderados (2.98); 694 linhas adicionadas / 12 removidas; densidade 0.08; tendência `accelerating`.
- `src/services/lots/list-bidder-participations.test.ts` — score 11.0; 3 commits ponderados (2.99); 1110 linhas adicionadas / 8 removidas; densidade 0.06; tendência `cooling`.
- `src/routes/public/lots.ts` — score 10.9; 3 commits ponderados (2.98); 120 linhas adicionadas / 12 removidas; densidade 0.06; tendência `cooling`.
- `src/db/schema.ts` — score 10.8; 3 commits ponderados (2.95); 581 linhas adicionadas / 27 removidas; densidade 0.06; tendência `accelerating`.
- `src/schemas/list-lots.ts` — score 5.5; 3 commits ponderados (2.98); 105 linhas adicionadas / 14 removidas; densidade 0.03; tendência `cooling`.
- `src/schemas/list-lots.test.ts` — score 5.5; 3 commits ponderados (2.98); 190 linhas adicionadas / 1 removidas; densidade 0.03; tendência `cooling`.
- `src/schemas/ygo-pro-deck.ts` — score 3.0; 5 commits ponderados (4.95); 242 linhas adicionadas / 54 removidas; densidade 0.01; tendência `accelerating`.

## 8. Recomendações de refatoração

- `src/schemas/ygo-pro-deck.ts` — Remove 12 unused exports to reduce surface area (86% dead) (esforço: medium; confiança: high; prioridade: 28.3).

## Métricas gerais reportadas

- Arquivos analisados: 101; funções analisadas: 1525.
- Manutenibilidade média: 91.7.
- Duplicação: 1075 linhas estimadas.
- Diagnósticos adicionais do workspace: 3 (por exemplo, avisos de configuração/descoberta; não são achados de qualidade por arquivo).

## Critério e limites

Este documento registra achados e recomendações emitidos na execução acima. Exports/tipos “não utilizados” significam sem consumidores conhecidos pela análise configurada, e CRAP/cobertura estão estimados sem um arquivo de cobertura. Os hotspots e scores são sinais de priorização, não defeitos funcionais comprovados.
