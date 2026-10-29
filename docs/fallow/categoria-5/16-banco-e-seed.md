# Categoria 5 — Banco de dados, fixtures e seed

[Voltar ao índice da categoria 5](../../../FALLOW-QUALITY-ISSUES.md#5-funçõesunidades-muito-grandes)

Este lote contém **6 achados** de funções/unidades acima de 60 linhas de código, extraídos do relatório original de 2026-10-28 (`fallow` v3.36.0).

As referências, nomes e métricas abaixo foram preservados do relatório original; as linhas podem ter mudado após refatorações. Blocos `describe` e `it` aninhados podem aparecer como achados distintos no mesmo arquivo.

Marque os itens após corrigir e validar o respectivo achado. Os itens do mesmo arquivo ficam juntos para facilitar uma refatoração coerente.

## `src/db/schema.ts`

- [ ] `src/db/schema.ts:367` — `<arrow>` (187 linhas)

## `src/db/seed.ts`

- [ ] `src/db/seed.ts:38` — `upsertSeedUser` (64 linhas)

## `src/db/seed-lots.ts`

- [ ] `src/db/seed-lots.ts:35` — `seedLots` (91 linhas)

## `src/db/seed-lot-activity.ts`

- [ ] `src/db/seed-lot-activity.ts:146` — `retimeBids` (69 linhas)

## `src/db/deck-fixtures.test.ts`

- [ ] `src/db/deck-fixtures.test.ts:15` — `describe("loadDeckFixtures")` (93 linhas)

## `src/db/seed-lot-plan.test.ts`

- [ ] `src/db/seed-lot-plan.test.ts:24` — `describe("planSeedLots")` (167 linhas)
