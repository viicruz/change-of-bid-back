# Categoria 5 — Detalhes públicos do lote

[Voltar ao índice da categoria 5](../../../FALLOW-QUALITY-ISSUES.md#5-funçõesunidades-muito-grandes)

Este lote contém **10 achados** de funções/unidades acima de 60 linhas de código, extraídos do relatório original de 2026-10-28 (`fallow` v3.36.0).

As referências, nomes e métricas abaixo foram preservados do relatório original; as linhas podem ter mudado após refatorações. Blocos `describe` e `it` aninhados podem aparecer como achados distintos no mesmo arquivo.

Marque os itens após corrigir e validar o respectivo achado. Os itens do mesmo arquivo ficam juntos para facilitar uma refatoração coerente.

## `src/services/lots/show-public-lot.ts`

- [ ] `src/services/lots/show-public-lot.ts:94` — `showPublicLot` (62 linhas)

## `src/services/lots/show-public-lot.test.ts`

- [ ] `src/services/lots/show-public-lot.test.ts:219` — `describe("showPublicLot")` (628 linhas)
- [ ] `src/services/lots/show-public-lot.test.ts:228` — `describe("when the lot is scheduled")` (105 linhas)
- [ ] `src/services/lots/show-public-lot.test.ts:229` — `it("returns the frozen card snapshot and an...")` (103 linhas)
- [ ] `src/services/lots/show-public-lot.test.ts:358` — `describe("when the lot is live")` (96 linhas)
- [ ] `src/services/lots/show-public-lot.test.ts:681` — `describe("when a bid commits during the read")` (77 linhas)
- [ ] `src/services/lots/show-public-lot.test.ts:116` — `attachBids` (75 linhas)
- [ ] `src/services/lots/show-public-lot.test.ts:682` — `it("returns the current bid and the history...")` (75 linhas)
- [ ] `src/services/lots/show-public-lot.test.ts:359` — `it("returns the current bid and the leader p...")` (68 linhas)
- [ ] `src/services/lots/show-public-lot.test.ts:566` — `describe("when the lot is canceled")` (62 linhas)
