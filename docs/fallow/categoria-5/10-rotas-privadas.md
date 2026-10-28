# Categoria 5 — Rotas privadas de lotes, lances e participações

[Voltar ao índice da categoria 5](../../../FALLOW-QUALITY-ISSUES.md#5-funçõesunidades-muito-grandes)

Este lote contém **13 achados** de funções/unidades acima de 60 linhas de código, extraídos do relatório original de 2026-10-28 (`fallow` v3.36.0).

As referências, nomes e métricas abaixo foram preservados do relatório original; as linhas podem ter mudado após refatorações. Blocos `describe` e `it` aninhados podem aparecer como achados distintos no mesmo arquivo.

Marque os itens após corrigir e validar o respectivo achado. Os itens do mesmo arquivo ficam juntos para facilitar uma refatoração coerente.

## `src/routes/private/lots.test.ts`

- [ ] `src/routes/private/lots.test.ts:200` — `describe("POST /private/lots")` (195 linhas)
- [ ] `src/routes/private/lots.test.ts:524` — `describe("POST /private/lots/:id/cancel")` (187 linhas)
- [ ] `src/routes/private/lots.test.ts:712` — `describe("GET /private/lots/:id")` (164 linhas)
- [ ] `src/routes/private/lots.test.ts:396` — `describe("GET /private/lots")` (127 linhas)
- [ ] `src/routes/private/lots.test.ts:784` — `it("returns the auctioneer's lot without per...")` (91 linhas)
- [ ] `src/routes/private/lots.test.ts:439` — `it("returns the auctioneer's lot without per...")` (83 linhas)
- [ ] `src/routes/private/lots.test.ts:238` — `it("creates the lot and its items for an auc...")` (67 linhas)

## `src/routes/private/place-bid.test.ts`

- [ ] `src/routes/private/place-bid.test.ts:204` — `describe("POST /private/lots/:id/bids")` (260 linhas)
- [ ] `src/routes/private/place-bid.test.ts:283` — `it("returns the bid without the bidder email...")` (73 linhas)

## `src/routes/private/participations.test.ts`

- [ ] `src/routes/private/participations.test.ts:299` — `describe("GET /private/participations")` (181 linhas)
- [ ] `src/routes/private/participations.test.ts:329` — `it("returns only the authenticated bidder's...")` (83 linhas)
- [ ] `src/routes/private/participations.test.ts:228` — `cleanup` (66 linhas)
- [ ] `src/routes/private/participations.test.ts:413` — `it("omits email, name, and user id from the...")` (66 linhas)
