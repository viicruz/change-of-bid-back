# Categoria 5 — Criação e cancelamento de lotes

[Voltar ao índice da categoria 5](../../../FALLOW-QUALITY-ISSUES.md#5-funçõesunidades-muito-grandes)

Este lote contém **13 achados** de funções/unidades acima de 60 linhas de código, extraídos do relatório original de 2026-10-28 (`fallow` v3.36.0).

As referências, nomes e métricas abaixo foram preservados do relatório original; as linhas podem ter mudado após refatorações. Blocos `describe` e `it` aninhados podem aparecer como achados distintos no mesmo arquivo.

Marque os itens após corrigir e validar o respectivo achado. Os itens do mesmo arquivo ficam juntos para facilitar uma refatoração coerente.

## `src/services/lots/create-lot.ts`

- [x] `src/services/lots/create-lot.ts:88` — `createLot` (118 linhas)
- [x] `src/services/lots/create-lot.ts:110` — `<arrow>` (95 linhas)

## `src/services/lots/create-lot.test.ts`

- [x] `src/services/lots/create-lot.test.ts:122` — `describe("createLot")` (248 linhas)
- [x] `src/services/lots/create-lot.test.ts:123` — `describe("when the auctioneer and cards are valid")` (132 linhas)
- [x] `src/services/lots/create-lot.test.ts:256` — `describe("when the request is rejected")` (113 linhas)

## `src/services/lots/cancel-lot.ts`

- [x] `src/services/lots/cancel-lot.ts:61` — `cancelLot` (75 linhas)

## `src/services/lots/cancel-lot.test.ts`

- [x] `src/services/lots/cancel-lot.test.ts:385` — `describe("cancelLot")` (603 linhas)
- [x] `src/services/lots/cancel-lot.test.ts:598` — `describe("when the lot has ended")` (94 linhas)
- [x] `src/services/lots/cancel-lot.test.ts:905` — `describe("when cancellation races the ending of th...")` (82 linhas)
- [x] `src/services/lots/cancel-lot.test.ts:190` — `insertAcceptedBid` (80 linhas)
- [x] `src/services/lots/cancel-lot.test.ts:96` — `attachLeadingBid` (71 linhas)
- [x] `src/services/lots/cancel-lot.test.ts:803` — `describe("when a previous bidder was already outbi...")` (68 linhas)
- [x] `src/services/lots/cancel-lot.test.ts:804` — `it("releases only the current leader and lea...")` (66 linhas)

## Nota de resolução — 2026-10-28

Os 13 achados foram resolvidos por decomposição, sem alterar limites, exclusões, configuração ou supressões do Fallow. As referências acima foram mantidas para rastreabilidade.

### Produção

- `src/services/lots/create-lot.ts`: `createLot` mantém as validações iniciais e a transação; a busca e validação das cartas foi para `findLotCards`, a montagem das linhas para `buildItemRows` e a resposta para `toCreatedLot`. Mesma ordem de operações, erros e fronteira de transação.
- `src/services/lots/cancel-lot.ts`: `cancelLot` mantém a checagem de papel, a transação e a publicação; o corpo da transação foi para `cancelLockedLot`, e o lock com checagem de existência e dono para `lockOwnedLot`.
- A produção refatorada foi validada primeiro com os testes originais intactos (57 testes, incluindo `src/routes/private/lots.test.ts`).

### Testes

Os arquivos `create-lot.test.ts` e `cancel-lot.test.ts` continuam sendo os pontos de entrada, com os mesmos `describe` de topo e os mesmos hooks (`afterEach(cleanup)` e `afterAll(db.$client.end)` no `describe("cancelLot")`). Os grupos de cenários são registrados de forma síncrona, na ordem original, por módulos em `src/services/lots/__tests__/`:

- `create-lot/fixtures.ts`: fixtures e dependências mockadas, movidas sem alteração.
- `create-lot/valid-request-cases.ts` e `create-lot/rejected-request-cases.ts`: corpos dos testes copiados literalmente e agrupados em funções `register*Cases`.
- `cancel-lot/fixtures.ts` (`now`, `cancelFor`, `insertUser`, `insertLot`, `insertWallet`, `cleanup`) e `cancel-lot/bids.ts`: `attachLeadingBid` e `insertAcceptedBid` foram decompostos em `insertParticipant`, `insertBid`, `setLotHead` e `insertAcceptedBidMovements`, com os mesmos valores e a mesma ordem de escritas. `insertLotWithLeader` agrupa leiloeiro, lote e `attachLeadingBid`.
- `cancel-lot/reads.ts`: leituras originais, mais `readReleases`, `expectLeaderReserveKept` e `expectLeaderReserveReleased`. Esses helpers mantêm `toEqual` sobre a carteira (`100.00` e o valor reservado ou `0.00`) e sobre a lista completa de movimentos.
- `cancel-lot/cancelable-lot-cases.ts`, `rejection-cases.ts`, `ended-lot-cases.ts`, `multiple-bid-cases.ts` e `concurrency-cases.ts`: cenários com `Promise.all` e a ordem de chamada preservados; `endDueLot` foi movido sem alteração.

Todos os 31 casos mantêm o mesmo nome completo (`arquivo > describe > ... > it`) e a mesma ordem; não houve renomeação.

### Validação

| Verificação | Antes | Depois |
|---|---|---|
| `npx fallow --no-cache --format json` | 13 achados deste lote | 0 achados deste lote; nenhuma unidade nova acima de 60 linhas; 0 problemas de código não utilizado; 0 grupos de duplicação |
| `npx vitest run` nos 2 arquivos do lote | 31 passaram (13 + 18), 0 skips | 31 passaram, com os mesmos nomes e a mesma ordem |
| `npm test` | 33 arquivos, 425 testes passaram, 0 skips | 33 arquivos, 425 testes passaram; mesmo conjunto de pares (arquivo, nome completo) |
| `npm run typecheck` / `npm run build` | passaram | passaram |

- Mutações manuais (11, temporárias e revertidas) em `cancel-lot.ts` e `create-lot.ts`, rodadas contra a suíte original (cópia da referência) e contra a reorganizada: em todas, o conjunto de casos que falham é idêntico.
- `cancel-lot.test.ts` foi repetido 15 vezes e a suíte completa mais 2 vezes, sem falhas.

### Observações fora do escopo

- O achado de CRAP preexistente (categoria 6) do mock `insertLot`, antes em `src/services/lots/create-lot.test.ts:76`, mudou para `src/services/lots/__tests__/create-lot/fixtures.ts:74` junto com as fixtures. As métricas não mudaram (ciclomática 11, cognitiva 10, CRAP 37.1).
- Lacuna de teste preexistente: remover a condição `locked.status === "ENDED"` em `cancelLot` não derruba nenhum teste, porque todo lote `ENDED` dos testes também tem `endsAt` no passado. O contrato atual foi preservado; cobrir um lote `ENDED` com `endsAt` futuro fica como sugestão.

