# Escopo e reprodução das análises Fallow

Referência de execução: [auditoria de 29/10/2026](fallow-audit-2026-10-29.md),
com o estado após C01–C12 revalidado no
[C13](fallow-audit-2026-10-29.md#execução-do-c13--29102026), sobre `bb14b1e`.
A auditoria conserva o inventário original, as decisões por achado e as
evidências de cada etapa. As referências antigas a C01/C02/C03 de 28/10/2026
não designam os commits lógicos da auditoria atual; o relatório daquela data
não existe nesta árvore. As decisões retidas estão documentadas aqui e na
auditoria de 29/10, sem depender desse arquivo ausente.

Ferramentas validadas: Fallow e companion type-aware **3.36.0**, TypeScript
**5.9.3**, Vitest e provider `@vitest/coverage-v8` **5.0.5**, Elysia **1.4.30**.
Fallow, Vitest e seu provider estão fixados no `package.json` para estabilizar
esta medição. Os exemplos usam os executáveis locais instalados por `npm install`.

## Descoberta, fronteiras e políticas

O Fallow descobre o bootstrap pelos scripts `dev`/`build` do `package.json`;
Drizzle, TypeScript e Vitest acrescentam suas próprias raízes. A revalidação
do C13 com `fallow list --entry-points --format json --quiet --explain`
encontra **78 entrypoints** no modo completo. A configuração atual não define
`entry` manual. Os **65** da abertura da auditoria de 29/10 e as contagens
anteriores de **53/56** pertencem a outras bases; não são metas nem perdas de
cobertura. Novos arquivos de testes/helpers também alteram a descoberta.

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

Hotspots e ownership também são sinais consultivos: a janela atual é de
**6 meses**, com mínimo de **3 commits**, usando o relógio do HEAD. Bus factor
**1** não demonstra ausência de revisão; autores com diferença de caixa no
nome podem ser a mesma pessoa. Ao existir uma equipe, conferir revisores e
CODEOWNERS. Nas mudanças reais, priorizar autorização e operações financeiras;
não refatorar código apenas para reduzir churn, tamanho ou score (A02).

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
  `dc1:private-type-leak:88fd7810e39216f8`, com severidade `warn`.

A reprodução mantém o tipo exportado e reproduz o comportamento da versão,
também revalidado no C13 no projeto completo e na reprodução mínima.
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
| S01 / `af5cf3681086edcd` | `saveUnregisteredCards` passa por `saveCardImage`, que exige HTTPS, origem exata `https://images.ygoprodeck.com` e ausência de credenciais. O downloader usa timeout de 15s e rejeita redirects. | Mitigado no fluxo atual, ainda reportado pelo scanner. O downloader isolado aceita string; rever se novos consumidores pularem a validação ou se mudar o fornecedor/origem. |
| S02 / `b91b9bc6342dbd9c` | `path.resolve` usa a localização do módulo e o literal `fixtures`. | Descartado no fluxo atual; rever se o caminho passar a receber entrada externa. |
| S03 / `9341ad37a6437ce7` | O nome vem de `readdir(directory)`, filtrado por `.json`; o seed chama `loadDeckFixtures()` sem argumentos. | Descartado no fluxo atual; rever se diretório/arquivos/symlinks puderem ser controlados por outra origem. A classificação não cobre adulteração local por outro processo. |
| S04 / `b63bc8e9753f19ca` | Nome extraído de `DATABASE_URL`, validado por regex, bloqueio de bancos reservados e `quoteIdentifier` antes de `DROP DATABASE`. `fresh()` rejeita `NODE_ENV=production` antes do acesso ao banco. | Injeção não demonstrada no fluxo atual; reset é a operação intencional. Rever se mudar a origem/validação do identificador. |
| S05 / `d76e711325672b11` | `CREATE DATABASE` usa o mesmo identificador validado e escapado. | Descartado como injeção; preservar os mesmos controles de S04. |
| S06 / `0fdb8fd59b545a4a` | `spawnSync` usa executável local, argumento fixo `migrate` e shell desabilitado. | Descartado no fluxo atual; rever se comando/argumentos receberem entrada externa ou se um shell for habilitado. |

No C13 permanecem os mesmos seis IDs, com **3.063 call sites não resolvidos**
(**3.006** na abertura da auditoria). As trilhas têm confiança `module-level`;
não provam propagação de entrada contaminada até cada argumento. A superfície
repete os candidatos, sem acrescentar outros seis achados. O resultado não
substitui análise de CVEs nem demonstra ausência de outros riscos.

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

Referência medida no **C13, em 29/10/2026**, sobre `bb14b1e`: **46 arquivos /
608 testes aprovados**; statements **90,70%**, branches **85,32%**, funções
**90,12%**, linhas **90,55%**. Fallow associou **72/72 arquivos** e
**413/1.947 funções** no inventário completo; no recorte de produção,
**413/415 funções**. Relatórios desta rodada:
`/tmp/change-of-bid-fallow-coverage.2gHqy1/` (temporários).

- Produção: saída **0**, nenhum finding de saúde.
- Inventário: saída **0**, nenhum finding de saúde. H01/H02 deixaram de
  ultrapassar o limiar estimado após a simplificação dos builders no C03;
  isso não representa cobertura medida nova dos helpers excluídos.
- Alcance estático: **62/62 arquivos runtime**, nenhum arquivo/export sem
  caminho de teste. G01 foi resolvido no C02. Esse alcance não representa
  cobertura de linhas.
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
| `LotSettlementError`, `src/services/lots/settle-due-lots.ts` | `src/services/lots/__tests__/settle-due-lots/fixtures.ts`, registrado pela suíte `settle-due-lots.test.ts`: identidade da classe e `lotId`. |
| `runShowPublicLotRead`, `src/services/lots/show-public-lot.ts` | `src/services/lots/show-public-lot.test.ts`: executor de leitura. |
| `RequestRateGate`, `src/services/yugioh-api/yugioh-api.ts` | `src/services/yugioh-api/yugioh-api.test.ts`: controle do rate limit. |
| `WalletMovementRecord`, `src/schemas/wallet.ts` | `src/routes/private/wallet.test.ts`: tipo de movimento. |

P01 foi resolvido no C04: `public-lot-audit-fixtures.ts` fica em `src/test`,
com os dois consumidores de testes preservados. As exclusões existentes em
`tsconfig.build.json` e `vitest.config.ts` retiram o helper do build e da
instrumentação de cobertura. O gate de **saúde** de produção
não substitui a análise completa de código morto, typecheck ou revisão dos
consumidores antes de excluir um símbolo.

No C13, `dead-code --production` continua com saída **1** e exatamente esses
**7 achados** P02–P08, sem arquivo sem uso. A análise completa sintática tem
saída **0**, sem findings; a type-aware tem saída **0**, somente T01. A saída
1 do recorte de produção é um gate reprovado por esses consumidores excluídos,
não uma falha da ferramenta nem autorização para apagar os exports.

## Duplicação e manutenção retidas

O [apêndice D da auditoria](fallow-audit-2026-10-29.md#apêndice-d--todos-os-grupos-semânticos)
conserva os **80 grupos originais**, com fingerprints, locais e decisões.
São um inventário histórico, não a contagem atual. No C13, `dupes` padrão
continua sem grupos; `dupes --mode semantic` aponta **78 grupos / 42 famílias /
166 instâncias**, **1.695/8.400 linhas (20,18%)**, em **36/66 arquivos**.
São sinais estruturais consultivos, com trechos sobrepostos; não demonstram
equivalência de comportamento nem economia de linhas por soma dos grupos.

D23 e parte de D20 foram tratados pelo lookup de usuário no C05; os núcleos
de DTOs escolhidos foram tratados no C06. Permanecem explícitos os schemas
Drizzle/Zod, classes e códigos de erro, rotas com contratos distintos e SQL
com filtros, locks, tabelas ou transições diferentes. Campos públicos e
privados não devem ser fundidos para reduzir duplicação. D70 corresponde a
limpezas com ordem de FKs própria; sua localização foi tratada no C04.

C12 cobriu somente a suíte de liquidação. Separar outras suítes de lances,
carteira e listagens continua opcional, em commits próprios e com contagem e
isolamento preservados; não é pendência obrigatória para o C13.

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
