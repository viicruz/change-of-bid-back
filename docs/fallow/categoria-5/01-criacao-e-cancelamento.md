# Categoria 5 — Criação e cancelamento de lotes

[Voltar ao índice da categoria 5](../../../FALLOW-QUALITY-ISSUES.md#5-funçõesunidades-muito-grandes)

Este lote contém **13 achados** de funções/unidades acima de 60 linhas de código, extraídos do relatório original de 2026-10-28 (`fallow` v3.36.0).

As referências, nomes e métricas abaixo foram preservados do relatório original; as linhas podem ter mudado após refatorações. Blocos `describe` e `it` aninhados podem aparecer como achados distintos no mesmo arquivo.

Marque os itens após corrigir e validar o respectivo achado. Os itens do mesmo arquivo ficam juntos para facilitar uma refatoração coerente.

## `src/services/lots/create-lot.ts`

- [ ] `src/services/lots/create-lot.ts:88` — `createLot` (118 linhas)
- [ ] `src/services/lots/create-lot.ts:110` — `<arrow>` (95 linhas)

## `src/services/lots/create-lot.test.ts`

- [ ] `src/services/lots/create-lot.test.ts:122` — `describe("createLot")` (248 linhas)
- [ ] `src/services/lots/create-lot.test.ts:123` — `describe("when the auctioneer and cards are valid")` (132 linhas)
- [ ] `src/services/lots/create-lot.test.ts:256` — `describe("when the request is rejected")` (113 linhas)

## `src/services/lots/cancel-lot.ts`

- [ ] `src/services/lots/cancel-lot.ts:61` — `cancelLot` (75 linhas)

## `src/services/lots/cancel-lot.test.ts`

- [ ] `src/services/lots/cancel-lot.test.ts:385` — `describe("cancelLot")` (603 linhas)
- [ ] `src/services/lots/cancel-lot.test.ts:598` — `describe("when the lot has ended")` (94 linhas)
- [ ] `src/services/lots/cancel-lot.test.ts:905` — `describe("when cancellation races the ending of th...")` (82 linhas)
- [ ] `src/services/lots/cancel-lot.test.ts:190` — `insertAcceptedBid` (80 linhas)
- [ ] `src/services/lots/cancel-lot.test.ts:96` — `attachLeadingBid` (71 linhas)
- [ ] `src/services/lots/cancel-lot.test.ts:803` — `describe("when a previous bidder was already outbi...")` (68 linhas)
- [ ] `src/services/lots/cancel-lot.test.ts:804` — `it("releases only the current leader and lea...")` (66 linhas)
