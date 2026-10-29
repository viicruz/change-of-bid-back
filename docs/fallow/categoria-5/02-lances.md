# Categoria 5 — Lances

[Voltar ao índice da categoria 5](../../../FALLOW-QUALITY-ISSUES.md#5-funçõesunidades-muito-grandes)

Este lote contém **10 achados** de funções/unidades acima de 60 linhas de código, extraídos do relatório original de 2026-10-28 (`fallow` v3.36.0).

As referências, nomes e métricas abaixo foram preservados do relatório original; as linhas podem ter mudado após refatorações. Blocos `describe` e `it` aninhados podem aparecer como achados distintos no mesmo arquivo.

Marque os itens após corrigir e validar o respectivo achado. Os itens do mesmo arquivo ficam juntos para facilitar uma refatoração coerente.

## `src/services/lots/place-bid.ts`

- [ ] `src/services/lots/place-bid.ts:96` — `placeBid` (205 linhas)
- [ ] `src/services/lots/place-bid.ts:114` — `accepted` (180 linhas)

## `src/services/lots/place-bid.test.ts`

- [ ] `src/services/lots/place-bid.test.ts:301` — `describe("placeBid")` (1066 linhas)
- [ ] `src/services/lots/place-bid.test.ts:1111` — `describe("when two bids arrive at the same time")` (195 linhas)
- [ ] `src/services/lots/place-bid.test.ts:371` — `describe("when the lot is outside the live window")` (146 linhas)
- [ ] `src/services/lots/place-bid.test.ts:754` — `describe("when the lot already has a leader")` (137 linhas)
- [ ] `src/services/lots/place-bid.test.ts:619` — `describe("when an accepted bid lands in the final...")` (134 linhas)
- [ ] `src/services/lots/place-bid.test.ts:518` — `describe("when the lot is live and has no bids")` (100 linhas)
- [ ] `src/services/lots/place-bid.test.ts:1112` — `it("keeps a single valid bid order on the sa...")` (90 linhas)
- [ ] `src/services/lots/place-bid.test.ts:923` — `describe("when the bidder leads another lot")` (87 linhas)
