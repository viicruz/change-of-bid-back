# Problemas de qualidade apontados pelo Fallow

Relatório gerado em 2026-10-28 com `fallow` v3.36.0 (configuração `.fallowrc.json`). Execução completa do comando padrão: análise de código não utilizado, duplicação e saúde/complexidade.

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

Unidades acima do limite de 60 linhas de código (inclui blocos `describe` de testes que o Fallow reporta como unidades). Lista completa:

- `src/services/lots/place-bid.test.ts:301` — `describe("placeBid")` (1066 linhas)
- `src/services/lots/settle-due-lots.test.ts:307` — `describe("settleDueLots")` (1060 linhas)
- `src/services/lots/list-auctioneer-lots.test.ts:284` — `describe("listAuctioneerLots")` (896 linhas)
- `src/services/lots/list-bidder-participations.test.ts:295` — `describe("listBidderParticipations")` (808 linhas)
- `src/services/lots/show-auctioneer-lot.test.ts:311` — `describe("showAuctioneerLot")` (803 linhas)
- `src/services/lots/list-public-lots.test.ts:204` — `describe("listPublicLots")` (787 linhas)
- `src/services/lots/show-public-lot.test.ts:219` — `describe("showPublicLot")` (628 linhas)
- `src/services/lots/cancel-lot.test.ts:385` — `describe("cancelLot")` (603 linhas)
- `src/routes/public/lot-live.test.ts:752` — `describe("public lot live room")` (528 linhas)
- `src/routes/private/wallet.test.ts:486` — `describe("GET /private/wallet/movements")` (482 linhas)
- `src/services/lots/show-public-lot-audit.test.ts:106` — `describe("showPublicLotAudit")` (438 linhas)
- `src/routes/private/wallet.test.ts:969` — `describe("POST /private/wallet/deposits")` (410 linhas)
- `src/routes/private/wallet.test.ts:507` — `describe("listing")` (370 linhas)
- `src/services/lots/list-public-lots.test.ts:213` — `describe("effective status")` (327 linhas)
- `src/services/lots/list-public-lots.test.ts:585` — `describe("text search")` (281 linhas)
- `src/services/lots/list-auctioneer-lots.test.ts:904` — `describe("received amounts")` (275 linhas)
- `src/routes/private/place-bid.test.ts:204` — `describe("POST /private/lots/:id/bids")` (260 linhas)
- `src/services/lots/list-auctioneer-lots.test.ts:311` — `describe("effective status")` (254 linhas)
- `src/app.auth.test.ts:164` — `describe("API authentication")` (249 linhas)
- `src/services/lots/create-lot.test.ts:122` — `describe("createLot")` (248 linhas)
- `src/services/yugioh-api/save-unregistered-cards.test.ts:118` — `describe("saveUnregisteredCards")` (247 linhas)
- `src/routes/private/wallet.test.ts:990` — `describe("crediting the caller")` (242 linhas)
- `src/services/yugioh-api/yugioh-api.test.ts:92` — `describe("YGOProDeckApiClient")` (229 linhas)
- `src/app.auth.test.ts:175` — `describe("GET /private/user")` (228 linhas)
- `src/services/lots/list-auctioneer-lots.test.ts:651` — `describe("text search")` (213 linhas)
- `src/routes/public/lots.test.ts:478` — `describe("GET /public/lots/:id")` (205 linhas)
- `src/services/lots/list-bidder-participations.test.ts:722` — `describe("shareToken")` (205 linhas)
- `src/services/lots/place-bid.ts:96` — `placeBid` (205 linhas)
- `src/routes/private/lots.test.ts:200` — `describe("POST /private/lots")` (195 linhas)
- `src/services/lots/place-bid.test.ts:1111` — `describe("when two bids arrive at the same time")` (195 linhas)
- `src/services/lots/list-bidder-participations.test.ts:489` — `describe("won")` (189 linhas)
- `src/db/schema.ts:367` — `<arrow>` (187 linhas)
- `src/routes/private/lots.test.ts:524` — `describe("POST /private/lots/:id/cancel")` (187 linhas)
- `src/services/lots/list-bidder-participations.test.ts:304` — `describe("accepted bids")` (184 linhas)
- `src/routes/private/participations.test.ts:299` — `describe("GET /private/participations")` (181 linhas)
- `src/services/lots/place-bid.ts:114` — `accepted` (180 linhas)
- `src/services/yugioh-api/yugioh-api.test.ts:93` — `describe("searchCards")` (171 linhas)
- `src/db/seed-lot-plan.test.ts:24` — `describe("planSeedLots")` (167 linhas)
- `src/routes/private/lots.test.ts:712` — `describe("GET /private/lots/:id")` (164 linhas)
- `src/routes/public/lot-live.test.ts:311` — `openLiveWire` (164 linhas)
- `src/services/lots/public-lot-audit-fixtures.ts:36` — `createPublicLotAuditFixtures` (164 linhas)
- `src/services/lots/show-auctioneer-lot.test.ts:792` — `describe("when the lot has no settlement credit")` (159 linhas)
- `src/app.auth.test.ts:176` — `describe("requests without a valid session")` (157 linhas)
- `src/routes/public/lot-audit.test.ts:73` — `describe("GET /public/lots/:id/audit")` (154 linhas)
- `src/services/lots/list-bidder-participations.test.ts:928` — `describe("ordering")` (154 linhas)
- `src/services/lots/settle-due-lots.ts:103` — `settleLockedLot` (154 linhas)
- `src/services/lots/list-bidder-participations.test.ts:929` — `it("orders live, scheduled, ended, and cance...")` (152 linhas)
- `src/services/lots/place-bid.test.ts:371` — `describe("when the lot is outside the live window")` (146 linhas)
- `src/services/lots/show-auctioneer-lot.test.ts:494` — `describe("when the lot is live")` (145 linhas)
- `src/services/lots/show-public-receipt.test.ts:66` — `insertSettledReceipt` (138 linhas)
- `src/services/lots/list-auctioneer-lots.test.ts:427` — `it("lists live lots, then scheduled lots, th...")` (137 linhas)
- `src/services/lots/place-bid.test.ts:754` — `describe("when the lot already has a leader")` (137 linhas)
- `src/services/lots/place-bid.test.ts:619` — `describe("when an accepted bid lands in the final...")` (134 linhas)
- `src/services/lots/create-lot.test.ts:123` — `describe("when the auctioneer and cards are valid")` (132 linhas)
- `src/routes/public/receipts.test.ts:235` — `describe("GET /public/receipts/:shareToken")` (131 linhas)
- `src/routes/private/lots.test.ts:396` — `describe("GET /private/lots")` (127 linhas)
- `src/routes/public/receipts.test.ts:79` — `insertSettledReceipt` (127 linhas)
- `src/services/lots/settle-due-lots.test.ts:1242` — `describe("when the winner reserve cannot be settle...")` (124 linhas)
- `src/services/lots/list-public-lots.test.ts:867` — `describe("public fields")` (123 linhas)
- `src/services/lots/settle-due-lots.test.ts:783` — `describe("when a bid races settlement")` (123 linhas)
- `src/services/lots/settle-due-lots.test.ts:907` — `describe("when cancellation races settlement")` (121 linhas)
- `src/services/lots/create-lot.ts:88` — `createLot` (118 linhas)
- `src/services/lots/show-public-receipt.test.ts:233` — `describe("showPublicReceipt")` (115 linhas)
- `src/services/lots/create-lot.test.ts:256` — `describe("when the request is rejected")` (113 linhas)
- `src/routes/private/wallet.test.ts:373` — `describe("GET /private/wallet")` (112 linhas)
- `src/services/lots/list-bidder-participations.test.ts:776` — `it("returns a null share token for a live, l...")` (112 linhas)
- `src/routes/public/lot-live.test.ts:1125` — `describe("when the lot is settled")` (108 linhas)
- `src/routes/public/lots.test.ts:369` — `describe("GET /public/lots")` (108 linhas)
- `src/services/lots/settle-due-lots.test.ts:316` — `describe("when the lot has a winning bid")` (107 linhas)
- `src/services/lots/show-public-lot.test.ts:228` — `describe("when the lot is scheduled")` (105 linhas)
- `src/schemas/list-lots.test.ts:11` — `describe("listPublicLotsResponseSchema")` (104 linhas)
- `src/schemas/show-auctioneer-lot.test.ts:7` — `describe("showAuctioneerLotResponseSchema")` (104 linhas)
- `src/schemas/show-lot.test.ts:7` — `describe("showPublicLotResponseSchema")` (103 linhas)
- `src/services/lots/show-public-lot.test.ts:229` — `it("returns the frozen card snapshot and an...")` (103 linhas)
- `src/schemas/show-auctioneer-lot.test.ts:8` — `it("drops personal and internal fields")` (102 linhas)
- `src/services/lots/list-public-lots.test.ts:374` — `it("lists live lots, then scheduled lots, th...")` (102 linhas)
- `src/schemas/show-lot.test.ts:8` — `it("drops personal and internal fields")` (101 linhas)
- `src/routes/private/wallet.test.ts:739` — `it("returns every movement type with its lot...")` (100 linhas)
- `src/services/lots/place-bid.test.ts:518` — `describe("when the lot is live and has no bids")` (100 linhas)
- `src/services/lots/show-auctioneer-lot.test.ts:372` — `describe("when the lot is scheduled")` (96 linhas)
- `src/services/lots/show-public-lot.test.ts:358` — `describe("when the lot is live")` (96 linhas)
- `src/services/lots/create-lot.ts:110` — `<arrow>` (95 linhas)
- `src/services/lots/show-auctioneer-lot.test.ts:952` — `describe("when the lot is canceled after its end")` (95 linhas)
- `src/routes/public/receipts.test.ts:244` — `it("returns the receipt without a session")` (94 linhas)
- `src/services/lots/cancel-lot.test.ts:598` — `describe("when the lot has ended")` (94 linhas)
- `src/services/lots/list-auctioneer-lots.ts:76` — `listAuctioneerLots` (94 linhas)
- `src/services/lots/show-auctioneer-lot.test.ts:373` — `it("returns the frozen card snapshot and an...")` (94 linhas)
- `src/db/deck-fixtures.test.ts:15` — `describe("loadDeckFixtures")` (93 linhas)
- `src/services/lots/list-auctioneer-lots.test.ts:951` — `it("returns the settlement credit on the sol...")` (93 linhas)
- `src/db/seed-lots.ts:35` — `seedLots` (91 linhas)
- `src/routes/private/lots.test.ts:784` — `it("returns the auctioneer's lot without per...")` (91 linhas)
- `src/services/lots/settle-due-lots.test.ts:784` — `it("keeps a single valid outcome and accepts...")` (91 linhas)
- `src/services/lots/place-bid.test.ts:1112` — `it("keeps a single valid bid order on the sa...")` (90 linhas)
- `src/services/lots/show-auctioneer-lot.test.ts:133` — `attachBids` (89 linhas)
- `src/services/lots/show-public-lot-audit.test.ts:295` — `describe("when an inserted bid hash was not produc...")` (89 linhas)
- `src/services/lots/list-public-lots.test.ts:868` — `it("returns the current bid and whether the...")` (87 linhas)
- `src/services/lots/place-bid.test.ts:923` — `describe("when the bidder leads another lot")` (87 linhas)
- `src/services/lots/show-public-lot-audit.test.ts:296` — `it("reports tampered")` (87 linhas)
- `src/routes/public/lots.test.ts:229` — `insertCanceledLot` (86 linhas)
- `src/services/lots/settle-due-lots.test.ts:1029` — `describe("when a later bid wins")` (86 linhas)
- `src/routes/public/lot-live.test.ts:786` — `describe("when a client connects")` (85 linhas)
- `src/services/lots/list-auctioneer-lots.test.ts:566` — `describe("canceled lots")` (84 linhas)
- `src/services/lots/settle-due-lots.test.ts:908` — `it("keeps a single valid outcome and does no...")` (84 linhas)
- `src/services/lots/settle-due-lots.test.ts:1030` — `it("debits only the winner and records that...")` (84 linhas)
- `src/routes/private/lots.test.ts:439` — `it("returns the auctioneer's lot without per...")` (83 linhas)
- `src/routes/private/participations.test.ts:329` — `it("returns only the authenticated bidder's...")` (83 linhas)
- `src/routes/public/lots.test.ts:483` — `it("returns the lot without a session")` (83 linhas)
- `src/services/lots/list-auctioneer-lots.test.ts:1045` — `it("leaves an ended lot without a winner and...")` (83 linhas)
- `src/services/lots/settle-due-lots.test.ts:317` — `it("debits the winner, credits the auctionee...")` (83 linhas)
- `src/services/lots/cancel-lot.test.ts:905` — `describe("when cancellation races the ending of th...")` (82 linhas)
- `src/schemas/list-bidder-participations.test.ts:7` — `describe("listBidderParticipationsResponseSchema")` (81 linhas)
- `src/services/lots/list-bidder-participations.ts:73` — `listBidderParticipations` (81 linhas)
- `src/services/lots/show-public-lot-audit.ts:131` — `verifyChain` (81 linhas)
- `src/services/lots/cancel-lot.test.ts:190` — `insertAcceptedBid` (80 linhas)
- `src/services/lots/show-public-receipt.test.ts:242` — `describe("when the share token matches a receipt")` (80 linhas)
- `src/schemas/list-bidder-participations.test.ts:8` — `it("drops email, name, winnerId, and hash wh...")` (79 linhas)
- `src/routes/public/lot-live.test.ts:154` — `connectLive` (78 linhas)
- `src/routes/public/lot-live.test.ts:905` — `describe("when a bid is accepted")` (78 linhas)
- `src/services/lots/show-public-receipt.test.ts:243` — `it("returns the frozen card snapshot and omi...")` (78 linhas)
- `src/services/lots/show-auctioneer-lot.test.ts:495` — `it("returns accepted bids in sequence order")` (77 linhas)
- `src/services/lots/show-public-lot.test.ts:681` — `describe("when a bid commits during the read")` (77 linhas)
- `src/services/lots/list-bidder-participations.test.ts:305` — `it("returns the lot after this bidder has an...")` (76 linhas)
- `src/services/lots/show-auctioneer-lot.ts:111` — `showAuctioneerLot` (76 linhas)
- `src/routes/private/wallet.test.ts:394` — `describe("balances")` (75 linhas)
- `src/routes/private/wallet.test.ts:522` — `it("returns the newest movements first and k...")` (75 linhas)
- `src/routes/private/wallet.test.ts:878` — `describe("query validation")` (75 linhas)
- `src/services/lots/cancel-lot.ts:61` — `cancelLot` (75 linhas)
- `src/services/lots/show-public-lot.test.ts:116` — `attachBids` (75 linhas)
- `src/services/lots/show-public-lot.test.ts:682` — `it("returns the current bid and the history...")` (75 linhas)
- `src/routes/public/lot-live.test.ts:1050` — `describe("when the lot is canceled")` (74 linhas)
- `src/routes/public/lots.test.ts:374` — `it("returns a matching lot without a session")` (74 linhas)
- `src/schemas/list-lots.test.ts:116` — `describe("listAuctioneerLotsResponseSchema")` (74 linhas)
- `src/routes/private/place-bid.test.ts:283` — `it("returns the bid without the bidder email...")` (73 linhas)
- `src/schemas/list-lots.test.ts:117` — `it("drops personal and internal fields")` (72 linhas)
- `src/services/lots/list-bidder-participations.test.ts:86` — `insertLot` (72 linhas)
- `src/services/lots/settle-due-lots.test.ts:1243` — `it("does not debit a winner whose winning ho...")` (72 linhas)
- `src/services/lots/cancel-lot.test.ts:96` — `attachLeadingBid` (71 linhas)
- `src/services/lots/list-public-lots.test.ts:745` — `it("treats like wildcards in the search as l...")` (70 linhas)
- `src/services/lots/show-auctioneer-lot.test.ts:721` — `describe("when the lot is settled")` (70 linhas)
- `src/services/wallet/deposit.ts:54` — `deposit` (70 linhas)
- `src/db/seed-lot-activity.ts:146` — `retimeBids` (69 linhas)
- `src/lib/auth.wallet.test.ts:147` — `describe("sign-up")` (69 linhas)
- `src/services/lots/settle-due-lots.test.ts:595` — `describe("when the lot is still open")` (69 linhas)
- `src/routes/public/lot-live.ts:45` — `publicLotLiveRoutes` (68 linhas)
- `src/services/lots/cancel-lot.test.ts:803` — `describe("when a previous bidder was already outbi...")` (68 linhas)
- `src/services/lots/settle-due-lots.test.ts:665` — `describe("when the winner leads another lot")` (68 linhas)
- `src/services/lots/settle-due-lots.test.ts:1173` — `describe("when one due lot cannot settle")` (68 linhas)
- `src/services/lots/show-auctioneer-lot.test.ts:722` — `it("returns the winner participant number an...")` (68 linhas)
- `src/services/lots/show-public-lot.test.ts:359` — `it("returns the current bid and the leader p...")` (68 linhas)
- `src/routes/private/lots.test.ts:238` — `it("creates the lot and its items for an auc...")` (67 linhas)
- `src/services/lots/show-auctioneer-lot.test.ts:979` — `it("keeps the accepted history and reports n...")` (67 linhas)
- `src/routes/private/participations.test.ts:228` — `cleanup` (66 linhas)
- `src/routes/private/participations.test.ts:413` — `it("omits email, name, and user id from the...")` (66 linhas)
- `src/schemas/list-lots.test.ts:12` — `it("drops personal and internal fields")` (66 linhas)
- `src/services/lots/cancel-lot.test.ts:804` — `it("releases only the current leader and lea...")` (66 linhas)
- `src/services/lots/settle-due-lots.test.ts:666` — `it("keeps the reserve of the other lot")` (66 linhas)
- `src/services/lots/settle-due-lots.test.ts:1174` — `it("keeps the settled sibling and leaves the...")` (66 linhas)
- `src/routes/private/wallet.test.ts:1293` — `describe("amount validation")` (65 linhas)
- `src/schemas/show-receipt.test.ts:29` — `describe("showPublicReceiptResponseSchema")` (65 linhas)
- `src/services/lots/list-bidder-participations.test.ts:159` — `insertAcceptedBid` (65 linhas)
- `src/services/lots/show-auctioneer-lot.test.ts:573` — `it("follows the latest bid when one particip...")` (65 linhas)
- `src/services/lots/show-auctioneer-lot.test.ts:1048` — `describe("when the credited amount has fewer than...")` (65 linhas)
- `src/db/seed.ts:38` — `upsertSeedUser` (64 linhas)
- `src/services/lots/list-public-lots.ts:46` — `listPublicLots` (64 linhas)
- `src/routes/public/lot-audit.test.ts:82` — `describe("when the lot chain is intact")` (63 linhas)
- `src/schemas/show-lot-audit.test.ts:22` — `describe("showPublicLotAuditResponseSchema")` (63 linhas)
- `src/schemas/show-receipt.test.ts:30` — `it("drops winner id, winning bid id, share t...")` (63 linhas)
- `src/services/lots/settle-due-lots.test.ts:424` — `describe("when the lot has no bids")` (63 linhas)
- `src/services/yugioh-api/yugioh-api.test.ts:94` — `it("builds the query string from lists and n...")` (63 linhas)
- `src/services/lots/show-public-lot.test.ts:566` — `describe("when the lot is canceled")` (62 linhas)
- `src/services/lots/show-public-lot.ts:94` — `showPublicLot` (62 linhas)
- `src/routes/public/lot-audit.test.ts:83` — `it("returns only the public audit keys witho...")` (61 linhas)
- `src/schemas/show-lot-audit.test.ts:23` — `it("drops personal data and hash material")` (61 linhas)

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
