# Escopo e reprodução das análises Fallow

Medição atualizada no C01 da auditoria de 29/10/2026. As decisões de
arquitetura, tipos e segurança abaixo foram registradas no C03 da auditoria
de 28/10/2026.
Ferramentas validadas: Fallow e companion type-aware **3.36.0**, TypeScript
**5.9.3**, Vitest e provider `@vitest/coverage-v8` **5.0.5**, Elysia **1.4.30**.
Fallow, Vitest e seu provider estão fixados no `package.json` para estabilizar
esta medição. Os exemplos usam os executáveis locais instalados por `npm install`.

## Descoberta, fronteiras e políticas

O Fallow descobre o bootstrap pelos scripts `dev`/`build` do `package.json`;
Drizzle, TypeScript e Vitest acrescentam suas próprias raízes. Foram comparados
os relatórios de `fallow list --entry-points --format json --quiet --explain`
antes e depois de retirar os dois padrões `entry`: **os mesmos 56 caminhos**.
`src/index.ts` passou de `manual entry` a `package.json script`.
`src/main.{ts,tsx,js,jsx}` não correspondia a arquivo algum. Os 53 entrypoints
da auditoria original pertencem à base anterior a C01/C02.

**Fronteiras e políticas estão explicitamente fora de escopo nesta etapa**:
`.fallowrc.json` declara `boundary-violation: off` e `policy-violation: off`.
Não há `boundaries` nem `rulePacks`. Seus contadores zero significam **não
medido**. Ciclos de imports, reexports e pacotes continuam sendo analisados.

A árvore atual mistura scripts de seed em `src/db` que chamam serviços,
serviços que usam `db/index` e modelos que usam `db/schema`. Testes também
importam essas camadas diretamente. Um preset por diretório imporia regras
sem uma decisão arquitetural prévia. Para passar a medir, definir zonas que
separem runtime, schema/conexão, scripts e testes, aprovar suas dependências
e reativar as respectivas regras. Não interpretar os opt-outs como dispensa
permanente de revisão de arquitetura.

## T01: tipo exportado apontado como privado

```sh
sh docs/fallow/reproduce-t01.sh > /tmp/fallow-t01.json
```

O script gera quatro arquivos TypeScript em diretório temporário, reutiliza
as dependências locais, executa `tsc` sem emissão e roda o Fallow. Não executa
os arquivos da reprodução. O diretório é removido ao terminar.

`CreatedLotItem` tem `export type` em `services/create-lot.ts`, integra
`CreatedLot.items` e aparece na resposta de uma rota Elysia composta no barrel
`routes/private/index.ts`. Com as versões acima:

- `tsc` termina com código **0**;
- Fallow termina com código **0**, com um aviso `private-type-leak`;
- o aviso identifica `privateRoutes` → `CreatedLotItem`, ID
  `dc1:private-type-leak:88fd7810e39216f8`, `leak-confirmed` e completude `complete`.

A reprodução mantém o tipo exportado e reproduz o comportamento da versão.
A classificação continua sendo **provável falso positivo**, sem concluir que
um tipo exportado por módulo deva necessariamente ser API de um pacote.
A aplicação não publica esse barrel como biblioteca. Não há erro do TypeScript
nem motivo demonstrado para alterar o contrato Elysia. O aviso permanece
visível: não foi adicionada supressão nem aberto issue externo. Reexecutar a
reprodução ao atualizar Fallow/companion/Elysia antes de rever esta decisão.

## Segurança: decisões por candidato

`fallow security --surface --format json --quiet --explain` continua mostrando
os seis candidatos originais. Não foram adicionadas supressões por arquivo
nem desligada a detecção de sinks. As linhas podem mudar; os IDs abaixo
identificam os achados da auditoria.

| ID / finding_id | Evidência conferida | Decisão e gatilho de revisão |
| --- | --- | --- |
| S01 / `af5cf3681086edcd` | O downloader recebe URL externa. C02 passou a exigir a origem `https://images.ygoprodeck.com`, HTTPS, sem credenciais/porta inesperada; timeout e bloqueio de redirect continuam. | Mitigado por C02, ainda reportado pelo scanner. Manter os testes de bloqueio e rever ao mudar o fornecedor/origem. |
| S02 / `b91b9bc6342dbd9c` | `path.resolve` usa a localização do módulo e o literal `fixtures`. | Descartado no fluxo atual; rever se o caminho passar a receber entrada externa. |
| S03 / `9341ad37a6437ce7` | O nome vem de `readdir(directory)`, filtrado por `.json`; o seed chama `loadDeckFixtures()` sem argumentos. | Descartado no fluxo atual; rever se diretório/arquivos/symlinks puderem ser controlados por outra origem. A classificação não cobre adulteração local por outro processo. |
| S04 / `b63bc8e9753f19ca` | Nome extraído de `DATABASE_URL`, validado por regex, bloqueio de bancos reservados e `quoteIdentifier` antes de `DROP DATABASE`. | Descartado como injeção; operação destrutiva intencional, com bloqueio de produção desde C01. Rever se mudar a origem/validação do identificador. |
| S05 / `d76e711325672b11` | `CREATE DATABASE` usa o mesmo identificador validado e escapado. | Descartado como injeção; preservar os mesmos controles de S04. |
| S06 / `0fdb8fd59b545a4a` | `spawnSync` usa executável local, argumento fixo `migrate` e shell desabilitado. | Descartado no fluxo atual; rever se comando/argumentos receberem entrada externa ou se um shell for habilitado. |

O resultado não substitui análise de CVEs nem demonstra ausência de outros
riscos. Os call sites não resolvidos continuam sendo uma limitação do scanner.

## Cobertura real em banco descartável

A partir da raiz, depois de `npm install`, com Docker disponível:

```sh
npm run fallow:coverage
```

O comando executa `docs/fallow/measure-coverage.sh`: cria um PostgreSQL 17
novo, com porta local aleatória e dados em tmpfs, aplica as migrações e roda a
suíte completa com cobertura V8. Usa `--no-file-parallelism`: os arquivos
compartilham o banco e a liquidação busca lotes globalmente, podendo encontrar
fixtures ainda incompletas de outra suíte quando há execução paralela. Testes
de concorrência dentro de cada arquivo continuam executando seus cenários.
As variáveis exportadas no processo do script apontam para esse banco e
prevalecem sobre `.env`; não se usa `db:fresh`.
O container e seus dados são removidos ao terminar, inclusive em caso de falha.

Cada execução cria um diretório exclusivo em `${TMPDIR:-/tmp}`, informa seu
caminho e preserva os relatórios para inspeção:

| Arquivo relativo ao diretório informado | Conteúdo |
| --- | --- |
| `coverage/coverage-final.json` | Cobertura Istanbul recém-gerada; também há LCOV e resumo de texto no terminal. |
| `health-production.json` | `health --production --complexity`, gate do código de produção. |
| `health-inventory.json` | `health --complexity --complexity-breakdown --hotspots --ownership --targets --coverage-gaps --file-scores --score`, inventário completo, incluindo testes/helpers. |
| `status.txt` | Códigos reais de saída de cada análise de saúde. Só é gerado depois das duas análises. |

Ambas as análises usam `--coverage` com o caminho absoluto do arquivo gerado
**na mesma execução**, além de `--format json --quiet --explain`. Os erros e
avisos continuam em stderr, separados do JSON. Migração ou suíte reprovada
interrompe o script antes de analisar cobertura; não há fallback para o arquivo
antigo em `coverage/`. `health.coverage` continua sem caminho fixo na configuração.

O script retorna falha se o gate de produção falhar ou se qualquer análise
tiver erro de ferramenta/configuração. No inventário completo, **0** e **1**
são análises concluídas: **1** indica findings e fica registrado em `status.txt`,
sem reprovar o comando composto. Por isso, saída 0 de `fallow:coverage` significa
que a suíte e o gate de produção passaram; é preciso ler o inventário para
avaliar testes/helpers. Não se usa `--report-only`, não se elevam limiares e
não se suprimem findings.

### Escopo e interpretação

A instrumentação inclui `src/**/*.ts`, inclusive arquivos de produção não
executados, e exclui `src/**/*.test.ts`, `src/**/__tests__/**` e `src/test/**`.
O Fallow completo também conta callbacks de testes e helpers excluídos dessa
instrumentação: conferir `coverage_source` por finding. `estimated` não é
cobertura medida de 0%; `coverage_source_consistency: uniform` não transforma
estimativas em medições. Os denominadores dos dois universos são diferentes.

Referência medida em **29/10/2026**, após C01: **44 arquivos / 597 testes
aprovados**; statements **90,29%**, branches **84,80%**, funções **90,02%**,
linhas **90,11%**. Fallow associou **70/70 arquivos** e **409/1.890 funções**
no inventário completo; no recorte de produção, **409/411 funções**.

- Produção: saída **0**, nenhum finding de saúde.
- Inventário: saída **1**, somente H01/H02, CRAP estimado de **37,1** e **31,6**
  nos helpers `insertLot` (`src/services/lots/__tests__/create-lot/fixtures.ts`)
  e `insertLiveLot` (`src/routes/private/place-bid.test.ts`). Nenhuma função
  excede os limites ciclomático **20** ou cognitivo **15**.
- H03 (`settleEndedLots`, `src/db/seed-lot-activity.ts`) não reaparece com
  cobertura atual. O alerta anterior vinha do relatório antigo; não há
  correção pendente nessa função por esse alerta.

Os números são uma referência datada, não um limiar novo. Para comparar uma
mudança, executar novamente o comando e usar os relatórios da nova rodada.

### Exports usados pelos testes

`dead-code --production` exclui consumidores de testes e, portanto, não pode
ser usado isoladamente para autorizar remoções. Os achados P02–P08 da auditoria
de 29/10/2026 têm os consumidores abaixo e devem ser preservados:

| Export / módulo | Consumidor de teste e motivo |
| --- | --- |
| `deckFixtureSchema`, `src/db/deck-fixtures.ts` | `src/db/deck-fixtures.test.ts`: validação das fixtures. |
| `seedMinIncrement`, `src/db/seed-lot-plan.ts` | `src/db/seed-lot-plan.test.ts`: plano e cálculo do seed. |
| `MAX_MOVEMENT_PAGE`, `src/schemas/wallet.ts` | `src/routes/private/wallet.test.ts`: contrato do limite de paginação. |
| `LotSettlementError`, `src/services/lots/settle-due-lots.ts` | `src/services/lots/settle-due-lots.test.ts`: identidade da classe e `lotId`. |
| `runShowPublicLotRead`, `src/services/lots/show-public-lot.ts` | `src/services/lots/show-public-lot.test.ts`: executor de leitura. |
| `RequestRateGate`, `src/services/yugioh-api/yugioh-api.ts` | `src/services/yugioh-api/yugioh-api.test.ts`: controle do rate limit. |
| `WalletMovementRecord`, `src/schemas/wallet.ts` | `src/routes/private/wallet.test.ts`: tipo de movimento. |

P01 (`public-lot-audit-fixtures.ts`) também tem consumidores em testes;
sua mudança de localização pertence ao C04. O gate de **saúde** de produção
não substitui a análise completa de código morto, typecheck ou revisão dos
consumidores antes de excluir um símbolo.

## Verificações de rotina

```sh
node_modules/.bin/fallow list --entry-points --format json --quiet --explain
node_modules/.bin/fallow dead-code --type-aware --format json --quiet --explain
node_modules/.bin/fallow architecture --format json --quiet --explain
node_modules/.bin/fallow security --surface --format json --quiet --explain
node_modules/.bin/fallow audit --base HEAD --format json --quiet --explain
```

Usar `npm run typecheck` para correção de tipos. A análise type-aware do Fallow
não substitui essa verificação. Códigos de saída e `gate_outcomes` devem ser
lidos junto com o relatório; um gate com findings não é falha da ferramenta.
