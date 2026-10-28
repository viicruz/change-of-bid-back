# Categoria 5 — Schemas de resposta

[Voltar ao índice da categoria 5](../../../FALLOW-QUALITY-ISSUES.md#5-funçõesunidades-muito-grandes)

Este lote contém **14 achados** de funções/unidades acima de 60 linhas de código, extraídos do relatório original de 2026-10-28 (`fallow` v3.36.0).

As referências, nomes e métricas abaixo foram preservados do relatório original; as linhas podem ter mudado após refatorações. Blocos `describe` e `it` aninhados podem aparecer como achados distintos no mesmo arquivo.

Marque os itens após corrigir e validar o respectivo achado. Os itens do mesmo arquivo ficam juntos para facilitar uma refatoração coerente.

## `src/schemas/list-lots.test.ts`

- [ ] `src/schemas/list-lots.test.ts:11` — `describe("listPublicLotsResponseSchema")` (104 linhas)
- [ ] `src/schemas/list-lots.test.ts:116` — `describe("listAuctioneerLotsResponseSchema")` (74 linhas)
- [ ] `src/schemas/list-lots.test.ts:117` — `it("drops personal and internal fields")` (72 linhas)
- [ ] `src/schemas/list-lots.test.ts:12` — `it("drops personal and internal fields")` (66 linhas)

## `src/schemas/list-bidder-participations.test.ts`

- [ ] `src/schemas/list-bidder-participations.test.ts:7` — `describe("listBidderParticipationsResponseSchema")` (81 linhas)
- [ ] `src/schemas/list-bidder-participations.test.ts:8` — `it("drops email, name, winnerId, and hash wh...")` (79 linhas)

## `src/schemas/show-auctioneer-lot.test.ts`

- [ ] `src/schemas/show-auctioneer-lot.test.ts:7` — `describe("showAuctioneerLotResponseSchema")` (104 linhas)
- [ ] `src/schemas/show-auctioneer-lot.test.ts:8` — `it("drops personal and internal fields")` (102 linhas)

## `src/schemas/show-lot.test.ts`

- [ ] `src/schemas/show-lot.test.ts:7` — `describe("showPublicLotResponseSchema")` (103 linhas)
- [ ] `src/schemas/show-lot.test.ts:8` — `it("drops personal and internal fields")` (101 linhas)

## `src/schemas/show-lot-audit.test.ts`

- [ ] `src/schemas/show-lot-audit.test.ts:22` — `describe("showPublicLotAuditResponseSchema")` (63 linhas)
- [ ] `src/schemas/show-lot-audit.test.ts:23` — `it("drops personal data and hash material")` (61 linhas)

## `src/schemas/show-receipt.test.ts`

- [ ] `src/schemas/show-receipt.test.ts:29` — `describe("showPublicReceiptResponseSchema")` (65 linhas)
- [ ] `src/schemas/show-receipt.test.ts:30` — `it("drops winner id, winning bid id, share t...")` (63 linhas)
