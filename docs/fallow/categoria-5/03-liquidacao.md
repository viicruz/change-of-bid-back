# Categoria 5 — Liquidação de lotes

[Voltar ao índice da categoria 5](../../../FALLOW-QUALITY-ISSUES.md#5-funçõesunidades-muito-grandes)

Este lote contém **18 achados** de funções/unidades acima de 60 linhas de código, extraídos do relatório original de 2026-10-28 (`fallow` v3.36.0).

As referências, nomes e métricas abaixo foram preservados do relatório original; as linhas podem ter mudado após refatorações. Blocos `describe` e `it` aninhados podem aparecer como achados distintos no mesmo arquivo.

Marque os itens após corrigir e validar o respectivo achado. Os itens do mesmo arquivo ficam juntos para facilitar uma refatoração coerente.

## `src/services/lots/settle-due-lots.ts`

- [ ] `src/services/lots/settle-due-lots.ts:103` — `settleLockedLot` (154 linhas)

## `src/services/lots/settle-due-lots.test.ts`

- [ ] `src/services/lots/settle-due-lots.test.ts:307` — `describe("settleDueLots")` (1060 linhas)
- [ ] `src/services/lots/settle-due-lots.test.ts:1242` — `describe("when the winner reserve cannot be settle...")` (124 linhas)
- [ ] `src/services/lots/settle-due-lots.test.ts:783` — `describe("when a bid races settlement")` (123 linhas)
- [ ] `src/services/lots/settle-due-lots.test.ts:907` — `describe("when cancellation races settlement")` (121 linhas)
- [ ] `src/services/lots/settle-due-lots.test.ts:316` — `describe("when the lot has a winning bid")` (107 linhas)
- [ ] `src/services/lots/settle-due-lots.test.ts:784` — `it("keeps a single valid outcome and accepts...")` (91 linhas)
- [ ] `src/services/lots/settle-due-lots.test.ts:1029` — `describe("when a later bid wins")` (86 linhas)
- [ ] `src/services/lots/settle-due-lots.test.ts:908` — `it("keeps a single valid outcome and does no...")` (84 linhas)
- [ ] `src/services/lots/settle-due-lots.test.ts:1030` — `it("debits only the winner and records that...")` (84 linhas)
- [ ] `src/services/lots/settle-due-lots.test.ts:317` — `it("debits the winner, credits the auctionee...")` (83 linhas)
- [ ] `src/services/lots/settle-due-lots.test.ts:1243` — `it("does not debit a winner whose winning ho...")` (72 linhas)
- [ ] `src/services/lots/settle-due-lots.test.ts:595` — `describe("when the lot is still open")` (69 linhas)
- [ ] `src/services/lots/settle-due-lots.test.ts:665` — `describe("when the winner leads another lot")` (68 linhas)
- [ ] `src/services/lots/settle-due-lots.test.ts:1173` — `describe("when one due lot cannot settle")` (68 linhas)
- [ ] `src/services/lots/settle-due-lots.test.ts:666` — `it("keeps the reserve of the other lot")` (66 linhas)
- [ ] `src/services/lots/settle-due-lots.test.ts:1174` — `it("keeps the settled sibling and leaves the...")` (66 linhas)
- [ ] `src/services/lots/settle-due-lots.test.ts:424` — `describe("when the lot has no bids")` (63 linhas)
