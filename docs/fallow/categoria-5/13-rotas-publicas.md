# Categoria 5 — Rotas públicas de lotes, auditoria e recibos

[Voltar ao índice da categoria 5](../../../FALLOW-QUALITY-ISSUES.md#5-funçõesunidades-muito-grandes)

Este lote contém **11 achados** de funções/unidades acima de 60 linhas de código, extraídos do relatório original de 2026-10-28 (`fallow` v3.36.0).

As referências, nomes e métricas abaixo foram preservados do relatório original; as linhas podem ter mudado após refatorações. Blocos `describe` e `it` aninhados podem aparecer como achados distintos no mesmo arquivo.

Marque os itens após corrigir e validar o respectivo achado. Os itens do mesmo arquivo ficam juntos para facilitar uma refatoração coerente.

## `src/routes/public/lots.test.ts`

- [ ] `src/routes/public/lots.test.ts:478` — `describe("GET /public/lots/:id")` (205 linhas)
- [ ] `src/routes/public/lots.test.ts:369` — `describe("GET /public/lots")` (108 linhas)
- [ ] `src/routes/public/lots.test.ts:229` — `insertCanceledLot` (86 linhas)
- [ ] `src/routes/public/lots.test.ts:483` — `it("returns the lot without a session")` (83 linhas)
- [ ] `src/routes/public/lots.test.ts:374` — `it("returns a matching lot without a session")` (74 linhas)

## `src/routes/public/lot-audit.test.ts`

- [ ] `src/routes/public/lot-audit.test.ts:73` — `describe("GET /public/lots/:id/audit")` (154 linhas)
- [ ] `src/routes/public/lot-audit.test.ts:82` — `describe("when the lot chain is intact")` (63 linhas)
- [ ] `src/routes/public/lot-audit.test.ts:83` — `it("returns only the public audit keys witho...")` (61 linhas)

## `src/routes/public/receipts.test.ts`

- [ ] `src/routes/public/receipts.test.ts:235` — `describe("GET /public/receipts/:shareToken")` (131 linhas)
- [ ] `src/routes/public/receipts.test.ts:79` — `insertSettledReceipt` (127 linhas)
- [ ] `src/routes/public/receipts.test.ts:244` — `it("returns the receipt without a session")` (94 linhas)
