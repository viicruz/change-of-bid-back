# Categoria 5 — Serviços de auditoria e recibos

[Voltar ao índice da categoria 5](../../../FALLOW-QUALITY-ISSUES.md#5-funçõesunidades-muito-grandes)

Este lote contém **9 achados** de funções/unidades acima de 60 linhas de código, extraídos do relatório original de 2026-10-28 (`fallow` v3.36.0).

As referências, nomes e métricas abaixo foram preservados do relatório original; as linhas podem ter mudado após refatorações. Blocos `describe` e `it` aninhados podem aparecer como achados distintos no mesmo arquivo.

Marque os itens após corrigir e validar o respectivo achado. Os itens do mesmo arquivo ficam juntos para facilitar uma refatoração coerente.

## `src/services/lots/show-public-lot-audit.ts`

- [ ] `src/services/lots/show-public-lot-audit.ts:131` — `verifyChain` (81 linhas)

## `src/services/lots/show-public-lot-audit.test.ts`

- [ ] `src/services/lots/show-public-lot-audit.test.ts:106` — `describe("showPublicLotAudit")` (438 linhas)
- [ ] `src/services/lots/show-public-lot-audit.test.ts:295` — `describe("when an inserted bid hash was not produc...")` (89 linhas)
- [ ] `src/services/lots/show-public-lot-audit.test.ts:296` — `it("reports tampered")` (87 linhas)

## `src/services/lots/public-lot-audit-fixtures.ts`

- [ ] `src/services/lots/public-lot-audit-fixtures.ts:36` — `createPublicLotAuditFixtures` (164 linhas)

## `src/services/lots/show-public-receipt.test.ts`

- [ ] `src/services/lots/show-public-receipt.test.ts:66` — `insertSettledReceipt` (138 linhas)
- [ ] `src/services/lots/show-public-receipt.test.ts:233` — `describe("showPublicReceipt")` (115 linhas)
- [ ] `src/services/lots/show-public-receipt.test.ts:242` — `describe("when the share token matches a receipt")` (80 linhas)
- [ ] `src/services/lots/show-public-receipt.test.ts:243` — `it("returns the frozen card snapshot and omi...")` (78 linhas)
