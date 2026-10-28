# Categoria 5 — Autenticação

[Voltar ao índice da categoria 5](../../../FALLOW-QUALITY-ISSUES.md#5-funçõesunidades-muito-grandes)

Este lote contém **4 achados** de funções/unidades acima de 60 linhas de código, extraídos do relatório original de 2026-10-28 (`fallow` v3.36.0).

As referências, nomes e métricas abaixo foram preservados do relatório original; as linhas podem ter mudado após refatorações. Blocos `describe` e `it` aninhados podem aparecer como achados distintos no mesmo arquivo.

Marque os itens após corrigir e validar o respectivo achado. Os itens do mesmo arquivo ficam juntos para facilitar uma refatoração coerente.

## `src/app.auth.test.ts`

- [ ] `src/app.auth.test.ts:164` — `describe("API authentication")` (249 linhas)
- [ ] `src/app.auth.test.ts:175` — `describe("GET /private/user")` (228 linhas)
- [ ] `src/app.auth.test.ts:176` — `describe("requests without a valid session")` (157 linhas)

## `src/lib/auth.wallet.test.ts`

- [ ] `src/lib/auth.wallet.test.ts:147` — `describe("sign-up")` (69 linhas)
