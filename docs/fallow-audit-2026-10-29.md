# Auditoria Fallow — 29/10/2026

Estado de fechamento revalidado sobre `bb14b1e` no
[C13](#execução-do-c13--29102026). O resultado e os inventários de abertura
abaixo descrevem a base original; as seções de execução registram a evolução
do lote. O [guia Fallow](fallow.md) contém a receita e a referência atuais.

## Resultado e escopo

Auditoria do projeto inteiro, com leitura dos achados e de seus consumidores, sem aplicar correções nem criar commits Git. Os commits abaixo são unidades propostas de trabalho. Base: `6053de7a9a3cc7c261006416aaed4e369fc7b439`; árvore limpa antes da auditoria. Data de referência: 29/10/2026, America/Sao_Paulo.

Ferramentas locais: Fallow **3.36.0**, companion type-aware **3.36.0** (disponível), TypeScript **5.9.3**, Vitest **5.0.5**. Configuração existente preservada; sem herança remota. Descobertos **65 entrypoints** na análise completa e **7** no modo produção.

| Categoria | Resultado | Interpretação após verificação |
| --- | --- | --- |
| Código morto, análise sintática completa | 0 | Nenhuma remoção indicada no universo completo. |
| Código morto, type-aware | 1 aviso | T01: provável falso positivo de tipo exportado na composição Elysia. |
| Código morto, produção | 8 erros do gate | P01–P08: arquivo/exports consumidos por testes excluídos desse modo; não são prova de código morto no projeto. |
| Saúde com cobertura antiga autodetectada | 3 erros do gate | H01, H02 e H03; H03 desaparece com medição atual. |
| Saúde com cobertura atual explícita | 2 erros do gate | H01/H02: CRAP **estimado** de helpers de testes; nenhuma função excede os limites ciclomático/cognitivo. |
| Saúde em produção com cobertura atual | 0 | Nenhum finding de complexidade/CRAP nesse recorte. |
| Caminhos estáticos de testes | 1 arquivo | G01: `src/index.ts` sem caminho vindo de testes; bootstrap já tem testes. |
| Ciclos de imports/reexports/pacotes | 0 | Analisados. |
| Fronteiras e políticas | Não medidos | Regras explicitamente `off`; ausência de zonas/rule packs. |
| Duplicação padrão (`mild`) | 0 grupos; 0% | 63 arquivos considerados por esse detector. |
| Duplicação ampliada (`semantic`) | 80 grupos, 43 famílias, 175 instâncias | 36/63 arquivos; 1.757/8.294 linhas (21,18%). São sinais estruturais, não 80 bugs ou funções equivalentes. |
| Segurança | 6 candidatos | S01 mitigado no fluxo atual; S02–S06 sem vulnerabilidade demonstrada nos consumidores atuais. |
| Feature flags e aposentadoria | 0 | Nenhuma flag reconhecida pelos padrões do detector. |
| Priorização de manutenção | 43 hotspots; 171 funções grandes | Inventários completos nos apêndices; sinais consultivos, separados dos erros do gate. |

A nota de saúde é **78,2 / B** no relatório ampliado: penalidades de hotspots **10**, tamanho de unidades **10** e acoplamento **1,8**. A média de manutenibilidade é **91,7**. A nota usa a duplicação padrão; não incorpora os 21,18% da rodada semântica. O universo de saúde contém **129 arquivos / 1.890 funções**, e o grafo possui **113 arquivos pontuados**. Os denominadores de cada detector não são intercambiáveis.

## Execuções, saídas e reprodução

Os relatórios desta execução estão em `/tmp/change-of-bid-fallow-2026-10-29/`; são evidências temporárias, não arquivos versionados. Este Markdown conserva o inventário e as decisões. Todos os comandos de análise usaram `--format json --quiet --explain`; stdout foi interpretado como JSON e stderr permaneceu separado.

| Relatório / comando após `node_modules/.bin/fallow` | `kind` | Saída |
| --- | --- | --- |
| sem subcomando (`combined.json`) | `combined` | 0; gate de saúde falhou com 3, mas `enforced: false`. |
| `dead-code --type-aware` | `dead-code` | 0; T01 é `warn`. |
| `dead-code --production` | `dead-code` | 1; 8 findings com severidade efetiva `error`. |
| `architecture` | `architecture` | 0. |
| `dupes` | `dupes` | 0. |
| `dupes --mode semantic` | `dupes` | 0; resultado consultivo, sem limiar novo. |
| `health --complexity --complexity-breakdown --hotspots --ownership --targets --coverage-gaps --file-scores --score` | `health` | 1; 3 findings, cobertura antiga autodetectada. |
| mesmo `health`, com `--coverage /tmp/change-of-bid-fallow-2026-10-29/coverage/coverage-final.json` | `health` | 1; 2 findings, cobertura atual explícita. |
| `health --production --complexity --coverage /tmp/change-of-bid-fallow-2026-10-29/coverage/coverage-final.json` | `health` | 0; 0 findings. |
| `security --surface` | `security` | 0; advisory, 6 candidatos. |
| `flags --retirement` | `feature-flags` | 0. |
| `list --entry-points` | sem envelope `kind` nessa saída | 0; 65 entradas. |
| `type-aware status` | `type-aware-status` | 0; companion disponível e compatível. |
| `dead-code --trace src/db/deck-fixtures.ts:deckFixtureSchema` | `dead-code` | 0; complementa a conferência dos consumidores por `rg`. |
| `guard docs/fallow-audit-2026-10-29.md` | `guard` | 0; sem regras de fronteiras configuradas. |

Códigos **0 e 1** representam análises concluídas; **1** significa gate reprovado por findings, não falha da ferramenta. As rodadas com mudança de modo emitiram aviso de invalidação/reconstrução de cache do grafo, sem erro de análise. Não foram executados autofix, mutation, watch, descoberta `similar-code`, monitoramento cloud nem scanner de CVEs. `dupes --mode semantic` é o detector estático de clones, independente de `similar-code`.

### Verificação com cobertura atual

A primeira rodada carregou automaticamente `coverage/coverage-final.json`, datado de **28/10/2026 22:10:43 -03:00**. O diagnóstico `coverage-auto-detected` explica por que o mesmo comando pode mudar com o arquivo encontrado no disco. O arquivo antigo não foi sobrescrito nesta auditoria.

Foi executada a suíte completa em **PostgreSQL 17 descartável**, criado por Docker, em porta local aleatória, com variáveis exclusivas de auditoria e dados em tmpfs. Migrações aplicadas por `npm run db:migrate`; container removido ao final. Nenhum `db:fresh` real foi executado. A reprodução atual usa a receita de [fallow.md](fallow.md#cobertura-real-em-banco-descartável), automatizada no C01:

```sh
npm run fallow:coverage
```

O script prepara e exporta o banco descartável, executa a suíte sem paralelismo
entre arquivos e passa a cobertura recém-gerada explicitamente às duas
análises de saúde. Preserva relatórios e códigos reais de saída, inclusive 1,
no diretório temporário exclusivo informado no terminal.

Resultados atuais:

- **44 arquivos / 597 testes aprovados**, saída 0.
- Statements **90,29%**, branches **84,93%**, funções **90,02%**, linhas **90,11%**.
- Fallow importou **70/70 arquivos** do mapa e associou **409/1.890 funções** de seu universo estático. Testes/helpers excluídos da instrumentação continuam podendo receber estimativas; `coverage_source_consistency: uniform` não transforma essas estimativas em cobertura medida.
- `npm run typecheck`: saída **0**.
- Rodada direcionada de bootstrap, seed activity, fresh, fixtures e imagens: **5 arquivos / 68 testes aprovados**, saída **0**.
- `sh docs/fallow/reproduce-t01.sh`: saída **0**, compilação sem emissão aprovada e aviso T01 reproduzido com tipo explicitamente exportado.

## Achados verificados por categoria

### H — CRAP e qualidade da medição

| ID | Local / função | Métricas | Evidência e decisão | Commit |
| --- | --- | --- | --- | --- |
| H01 | `src/services/lots/__tests__/create-lot/fixtures.ts:74`, callback `insertLot` | CC 11; cognitiva 10; CRAP 37,1; `estimated`; moderate/error | Dez defaults com `??` no mock de persistência. Helper já chamado pelas suítes de criação, fora da instrumentação por `src/**/__tests__/**`. O scanner não demonstrou branches sem teste; não criar testes de teste só para reduzir uma estimativa. Corrigir a interpretação/escopo da medição primeiro; simplificar o builder apenas se melhorar legibilidade. | C01; C03 opcional |
| H02 | `src/routes/private/place-bid.test.ts:96`, `insertLiveLot` | CC 10; cognitiva 6; CRAP 31,6; `estimated`; moderate/error | Defaults de agenda, status e timestamps numa fixture de integração. `*.test.ts` é excluído da instrumentação. Não confundir CRAP estimado com 0% medido. As alternativas ACTIVE/ENDED/CANCELED possuem uso nos testes do arquivo. | C01; C03 opcional |
| H03 | `src/db/seed-lot-activity.ts:223`, `settleEndedLots` | Rodada antiga: CC 7; cognitiva 8; CRAP 56; 0% Istanbul | `seed-lot-activity.test.ts` já verifica lista vazia, lotes encerrados, serviço padrão/injetado, quantidade divergente, resultado skipped, erros e logs com/sem vencedor. Com cobertura atual o finding desapareceu. **Sem correção pendente nessa função por este alerta.** | C01, somente reprodução |

Limiares efetivos: ciclomática **20**, cognitiva **15**, CRAP **30**, tamanho **60 linhas**. Nenhum finding atual excede os dois primeiros. A rodada de produção com cobertura atual passa. Não elevar limiares nem suprimir complexidade de forma global para esconder H01/H02.

### G — Caminho estático de teste

**G01 — `src/index.ts:7`.** O grafo não encontra teste que importe o entrypoint. O arquivo importa dotenv e executa `await startApplication()`. `src/bootstrap.test.ts` já verifica agendamento, ordem de startup, porta, escuta e falhas, portanto o gap não significa que o bootstrap inteiro esteja sem testes. O índice real ainda não é exercitado. Criar um smoke test que substitua `./bootstrap`, importe o índice e verifique uma única chamada aguardada, sem abrir servidor/conexão: **C02**. O percentual estático **98,4%** (60/61 arquivos runtime alcançados por testes) é alcance no grafo, não cobertura de linhas.

### T — Contrato de tipos

**T01 — `src/routes/private/index.ts:13`, `privateRoutes → CreatedLotItem`.** Finding `dc1:private-type-leak:88fd7810e39216f8`, severidade `warn`. O tipo é declarado com `export type` em `src/services/lots/create-lot.ts:61` e integra `CreatedLot.items`; a rota devolve esse contrato e é composta no barrel Elysia. O typecheck passa e a reprodução mínima existente também reproduz o alerta mantendo o export. **Provável falso positivo no contexto desta aplicação**, sem evidência que justifique mudar o contrato ou adicionar export redundante. Preservar a API, registrar versão e reexecutar ao atualizar Fallow/companion/Elysia: **C13**, documentação. Esta decisão não afirma que todos os consumidores externos possíveis foram analisados.

### P — Achados exclusivos do modo produção

O recorte exclui consumidores de testes. Todos os oito itens têm uso real no projeto; somente P01 pede uma mudança clara de localização. Retirar exports usados por testes quebraria a suíte.

| ID | Tipo / localização | Consumidor ou evidência | Decisão / commit |
| --- | --- | --- | --- |
| P01 | `unused-file`, `src/services/lots/public-lot-audit-fixtures.ts` | Importado por `show-public-lot-audit.test.ts` e `routes/public/lot-audit.test.ts`. O build inclui `src/**/*.ts` e exclui apenas `*.test.ts` e `src/test`. | Mover helper para `src/test` e atualizar imports; conferir include de cobertura. **C04**. Não apagar seu conteúdo. |
| P02 | `unused-export`, `src/db/deck-fixtures.ts:13`, `deckFixtureSchema` | Uso local no parse e import em `src/db/deck-fixtures.test.ts:8`. | Preservar export de teste; registrar escopo em **C01**. |
| P03 | `unused-export`, `src/db/seed-lot-plan.ts:10`, `seedMinIncrement` | Usado localmente no plano/cálculo e por `seed-lot-plan.test.ts:14`. | Preservar; **C01**. |
| P04 | `unused-export`, `src/schemas/wallet.ts:75`, `MAX_MOVEMENT_PAGE` | Limita o schema e é importado por `routes/private/wallet.test.ts:8`. | Preservar contrato do teste de limite; **C01**. |
| P05 | `unused-export`, `src/services/lots/settle-due-lots.ts:320`, `LotSettlementError` | Construído e inspecionado localmente; testes verificam sua classe e lotId. | Preservar classe/identidade; **C01**. |
| P06 | `unused-export`, `src/services/lots/show-public-lot.ts:139`, `runShowPublicLotRead` | Alias de `runLotRead`, importado por `show-public-lot.test.ts:8`, usado para validar o executor. | Preservar enquanto o teste precisar da seam; eventual remoção deve migrar primeiro o consumidor. **C01**. |
| P07 | `unused-export`, `src/services/yugioh-api/yugioh-api.ts:120`, `RequestRateGate` | Instanciado no módulo e por `yugioh-api.test.ts:88`. | Preservar seam do rate limit; **C01**. |
| P08 | `unused-type`, `src/schemas/wallet.ts:81`, `WalletMovementRecord` | Importado por `routes/private/wallet.test.ts:9`, tipa `WalletMovementRecord["type"]`. | Preservar; **C01**. |

### S — Segurança: candidato, fluxo e controles

Os seis candidatos são `tainted-sink`, severidade medium. O scanner declara **3.006 call sites não resolvidos**; as trilhas são de confiança `module-level`, não prova de fluxo contaminado até cada argumento. A superfície repete os mesmos seis sinks, não acrescenta seis achados. Os prompts automáticos dizem que não reconheceram controles; a inspeção do código e os testes abaixo mostram controles concretos.

| ID / finding_id | Sink | Verificação no código atual | Decisão |
| --- | --- | --- | --- |
| S01 / `af5cf3681086edcd` | `save-card-image.ts:12`, `fetch`, SSRF/CWE-918 | `saveUnregisteredCards` usa o downloader padrão através de `saveCardImage`, que valida HTTPS, origem exata `https://images.ygoprodeck.com` e ausência de credenciais antes do download. `fetch` rejeita redirects e tem timeout de 15s. Call sites de `downloadCardImage` conferidos; chamada direta adicional apenas no teste. | Mitigado no fluxo atual. O downloader isolado aceita string; rever se novos consumidores pularem a validação. |
| S02 / `b91b9bc6342dbd9c` | `deck-fixtures.ts:36`, `path.resolve`, traversal/CWE-22 | Resolve `dirname(fileURLToPath(import.meta.url))` com literal `fixtures`; sem segmento recebido por HTTP. | Sem vulnerabilidade demonstrada. Rever se a origem do diretório mudar. |
| S03 / `9341ad37a6437ce7` | `deck-fixtures.ts:50`, `path.join`, traversal/CWE-22 | Nome vem de `readdir(directory)`, filtrado por `.json`. O seed chama o loader sem caminho externo. | Sem traversal remoto demonstrado. Diretório/arquivos/symlinks controlados por outro processo estão fora dessa conclusão. |
| S04 / `b63bc8e9753f19ca` | `fresh.ts:53`, `DROP DATABASE`, SQL/CWE-89 | Nome vem de `DATABASE_URL`, passa por regex de identificador e bloqueio de bancos reservados, depois por `quoteIdentifier`. `fresh()` bloqueia NODE_ENV production antes do acesso. | Injeção não demonstrada; reset é a operação intencional. Preservar validação e escaping. |
| S05 / `d76e711325672b11` | `fresh.ts:54`, `CREATE DATABASE`, SQL/CWE-89 | Mesmo identificador validado/escapado de S04. | Mesma decisão; não interpolar identificadores arbitrários. |
| S06 / `0fdb8fd59b545a4a` | `fresh.ts:62`, `spawnSync`, comando/CWE-78 | Executável local resolvido por `path.resolve`, argumentos fixos `["migrate"]`, sem `shell: true`. | Injeção não demonstrada no fluxo atual. Rever se comando, argumentos ou uso de shell mudar. |

Revalidação executada em `save-card-image.test.ts`, `fresh.test.ts` e `deck-fixtures.test.ts`; testes de fresh usam mocks, sem reset real. Decisões preservadas em **C13**. Nenhuma supressão global/por arquivo é proposta para eliminar esses candidatos. Este levantamento não substitui análise de CVEs ou prova ausência de outras vulnerabilidades.

### A — Arquitetura e descoberta

**A01.** `.fallowrc.json` desativa `boundary-violation` e `policy-violation`; não há `boundaries` nem `rulePacks`. Zero nesses contadores significa **não medido**. Não inventar fronteiras para zerar um relatório. Se esse trabalho entrar no escopo, decidir as dependências permitidas entre runtime, schema/conexão, serviços, scripts e testes e só então ativar regras específicas, em um commit próprio. Nesta auditoria: registrar limitação em **C13**. Ciclos foram medidos e não foram encontrados.

**A02.** Hotspots usam janela de **6 meses**, mínimo de **3 commits** e relógio reproduzível do commit HEAD; clone não é raso. Os **43** hotspots têm bus factor **1**, mas identidades de autor com diferença de caixa podem representar a mesma pessoa. O sinal não comprova falta de revisão nem pede mudança artificial de código. Conferir CODEOWNERS/revisores quando houver equipe; priorizar superfícies financeiras e auth nas mudanças reais.

### D — Duplicação ampliada

Foram conferidas localizações, fragmentos e diferenças dos **80** grupos. Muitos trechos começam/terminam no meio de uma declaração e atravessam funções vizinhas. Há sobreposição; não somar suas linhas para prometer economia. Nenhuma proposta pressupõe equivalência comportamental apenas pela pontuação/tokenização.

- **Reuso pequeno e concreto:** D23 repete lookup de usuário por email nos seeds. Extrair somente a consulta, preservando as mensagens diferentes “User”/“Auctioneer”: **C05**. D20 se sobrepõe parcialmente, mas também contém consulta de carteira, que deve ficar separada.
- **DTOs de leitura com campos coincidentes:** D13/D17/D27/D53 têm subestruturas de item/lance candidatas a compartilhar tipos: **C06 opcional**. D48 contém campos privados/públicos diferentes; compartilhar no máximo o núcleo comprovadamente idêntico, preservando status e exposição de dados. Não unificar respostas completas.
- **SQL semelhante com semântica diferente:** consultas por walletId/userId, com/sem `FOR UPDATE`, joins em tabelas distintas, depósitos versus créditos de liquidação e updates ACTIVE→ENDED têm diferenças relevantes. Preservar essas operações. Exemplos D26/D37/D51/D52/D54/D57/D59/D63/D64/D65/D71.
- **Boilerplate intencional:** Drizzle, Zod, classes de erro, composição Elysia e parâmetros da API repetem formato com identificadores, literais e contratos distintos. Manter explícitos enquanto não houver um benefício próprio. D40 já delega a `insertWalletMovement`; não criar outra camada só para reduzir o detector.
- **Fixtures:** D70 é limpeza de tabelas diferentes em ordem dependente de FKs, não duas operações intercambiáveis. Tratar localização em **C04**, preservando a ordem.

O apêndice D registra os 80 fingerprints, todos os locais, decisão e commit associado. “Manter” é uma decisão de triagem, não uma supressão aplicada.

## Sequência de commits lógicos proposta

C01–C02 são os primeiros passos recomendados. C03–C06 são melhorias pequenas, independentes e sem alteração pretendida das regras de negócio. C07–C12 são **opcionais**: tamanho e churn não justificam refatoração automática. C13 registra as decisões retidas. Não há correção de vulnerabilidade confirmada nem remoção de dependência indicada.

| Ordem / mensagem sugerida | Escopo concreto | Achados | Dependência e aceite |
| --- | --- | --- | --- |
| **C01** `chore(fallow): tornar a medicao de cobertura reproduzivel` | Atualizar receita/scripts de análise para exigir relatório recém-gerado e caminho explícito; distinguir health produção do inventário completo de helpers. Documentar exports consumidos só por testes. | H01–H03, P02–P08, diagnóstico de cobertura antiga. | Primeiro. Repetir cobertura descartável; health produção sem findings, inventário completo conservando as estimativas identificadas. Não elevar limiares nem usar coverage antigo silenciosamente. |
| **C02** `test(bootstrap): exercitar o entrypoint sem iniciar recursos reais` | Adicionar `src/index.test.ts` com mock de bootstrap, import isolado e Promise controlada para conferir chamada e espera. | G01. | Independente de C03+. Nenhuma porta, cron ou conexão real; gap estático do índice deixa de existir. |
| **C03** `refactor(test): simplificar builders de lotes` | Se a leitura justificar, simplificar somente os defaults dos dois builders, preservando null/undefined, status e timestamps. | H01/H02. | Depois de C01; opcional. Suítes create-lot e rota place-bid iguais em comportamento; não criar testes de helpers apenas por CRAP estimado. |
| **C04** `refactor(test): mover fixtures de auditoria para src/test` | Mover `public-lot-audit-fixtures.ts`, atualizar os dois imports consumidores e conferir exclusões do build/cobertura. | P01, D70, L02. | Independente de C05. Typecheck/build e duas suítes consumidoras passam; helper fora do artefato de produção. A alteração muda o denominador de cobertura e deve ser registrada. |
| **C05** `refactor(seed): compartilhar busca de usuario por email` | Extrair lookup comum de seed-lots/seed-lot-activity em helper de seed; preservar mensagens, ausência de usuário e executor. | D23 e parte de D20. | Independente de C04. Testes de ambos os seeds passam; não generalizar consulta de carteira incluída em D20. |
| **C06** `refactor(lots): compartilhar tipos de itens e lances de leitura` | Extrair apenas subestruturas idênticas dos DTOs para módulo de leitura; manter nomes públicos por aliases quando necessário. | D13/D17/D27/D53; núcleo de D48. | Opcional. Typecheck e testes de schemas/leituras públicas/privadas passam; nenhuma exposição adicional de cardSnapshot, recebimentos ou dados do leiloeiro. |
| **C07** `refactor(seed): separar etapas de criacao e retiming dos lotes` | Dividir orquestração de seedLots/retimeBids/upsertSeedUser apenas em etapas com contrato próprio. | L03/L06/L08; hotspots dos seeds. | Opcional, após C05. Preservar uma transação de retiming, vetores HMAC, HOLD/RELEASE e idempotência. Não reabrir H03 como falta de testes. |
| **C08** `refactor(bids): separar etapas da transacao de lance` | Se necessário, extrair blocos coesos de placeBid e callback accepted sem alterar fronteira da transação. | L04/L09. | Opcional; alto cuidado. Testes de concorrência, locks, extensão, encadeamento e rollback passam. Não fundir queries de locks do inventário D. |
| **C09** `refactor(wallet): separar validacao e persistencia do deposito` | Dividir deposit por responsabilidade, mantendo autorização, valores monetários e atomicidade. | L05. | Opcional e independente de C08. Testes de depósito, carteira e integração financeira passam; locks/ordem preservados. |
| **C10** `refactor(live): separar ciclo de vida do stream publico` | Extrair lifecycle de publicLotLiveRoutes com dono claro da assinatura da sala e do close, inclusive durante o snapshot inicial. O transporte existente é WebSocket, sem timer ou listener de abort próprios. | L07. | Opcional. Testes de frames WebSocket, desconexão e encerramento passam; saída da sala preservada mesmo quando o close antecede o fim do snapshot. |
| **C11** `refactor(lots): separar consulta e montagem da listagem do leiloeiro` | Dividir listAuctioneerLots sem unificar filtros/DTOs de bidder e público. | L10 e hotspot de listagens. | Opcional. Paginação, ordenação, totais monetários e permissões preservados nas suítes de listagem. |
| **C12** `refactor(test): separar cenarios extensos por dominio` | Aplicar em commits separados por suíte: liquidação, lances, carteira, listagens. Usar o inventário L para escolher o primeiro arquivo. | 161 entradas de tamanho em testes/helpers. | Opcional, um arquivo/domínio por commit real. Contagem de testes e isolamento preservados; callbacks describe de centenas de linhas não são, sozinhos, funções de negócio complexas. |
| **C13** `docs(fallow): registrar decisoes e limites da auditoria` | Versionar esta triagem, atualizar referências históricas em docs/fallow.md e preservar reproduções/decisões T/S/A. Substituir a dependência histórica de fallow-audit-2026-10-28.md, ausente da árvore, pelo relatório de 29/10. | T01, S01–S06, A01/A02 e decisões de manter D/P. | Pode acompanhar o início/fim do lote; não implica suprimir os findings. Reexecutar análises após cada mudança relevante. |

Para cada commit que tocar código: `fallow guard <arquivos>` antes, testes da superfície afetada e `npm run typecheck`; `fallow architecture` e `fallow audit --base HEAD` na revisão do diff ainda não commitado. Usar sempre os flags JSON/explain acima. Para comparações entre commits, fixar a referência base real do lote. `audit --base HEAD` sozinho não audita o backlog inteiro. Reexecutar o detector específico para confirmar a redução prometida; os commits opcionais não têm meta artificial de zerar todos os sinais consultivos.

### Execução do C02 — 29/10/2026

Implementação preparada sobre `3bf9313f026cae917f6504560d324db1701059da`, sem criar commit Git. `src/index.test.ts` substitui `./bootstrap`, reinicia o cache de módulos e importa o índice real. Uma Promise controlada mantém o startup pendente: o teste verifica uma única chamada sem argumentos, que o import continua pendente e que só termina depois da resolução. Mocks de proteção falham se app, pool ou scheduler reais forem carregados; nenhum desses recursos é iniciado pelo smoke test. `src/index.ts` permanece inalterado.

Validação:

- `npm test -- src/index.test.ts src/bootstrap.test.ts`: **2 arquivos / 10 testes aprovados**, saída **0**.
- Remoção temporária do `await` em `src/index.ts`: o novo teste falhou na asserção de import pendente, saída **1**. Arquivo restaurado antes da suíte completa.
- `npm run typecheck`: saída **0**.
- `npm run fallow:coverage`: saída **0**, **45 arquivos / 598 testes aprovados** em PostgreSQL 17 descartável. Statements **90,35%**, branches **84,80%**, funções **90,02%**, linhas **90,17%**. Relatórios temporários em `/tmp/change-of-bid-fallow-coverage.9O8lxX/`.
- Inventário com essa cobertura atual: **61/61 arquivos runtime alcançados por testes**, **100%** de alcance estático, **0 arquivos / 0 exports sem caminho de teste**. G01 resolvido; esse percentual não representa cobertura de linhas.
- Saúde de produção: saída **0**, nenhum finding. Inventário completo: saída **1**, somente H01/H02 estimados, preservados conforme C01.
- `fallow architecture` e `fallow audit --base HEAD`, com `--format json --quiet --explain`: saída **0**, sem ciclos nem novos findings no diff.

### Execução do C03 — 29/10/2026

Implementação preparada sobre `0ac8a77`, sem criar commit Git. A mudança fica restrita aos defaults dos builders de testes:

- Em `src/services/lots/__tests__/create-lot/fixtures.ts`, os campos anuláveis recebem `null` por desestruturação quando estão ausentes/`undefined`; valores explícitos, inclusive `null`, string vazia e datas, são preservados. `extensionCount`, `status` e `bidCount` mantêm `??`, com os mesmos fallbacks anteriores. A lista de campos retornados, os IDs e os timestamps fixos não mudam.
- Em `src/routes/private/place-bid.test.ts`, `defaultLiveLotSchedule` concentra a agenda usada quando nenhum schedule é informado. O início continua um minuto no passado e o fim continua exatamente 24 horas depois desse início. Agendas explícitas mantêm as datas obrigatórias do contrato do helper; o default de status e os cálculos de `endedAt`/`canceledAt` permanecem iguais.

Nenhum cenário ou teste foi adicionado, removido ou alterado; não foram criados testes de helpers para reduzir CRAP estimado. Não houve alteração de código de produção, limiares, exclusões de cobertura ou supressões.

Validação:

- `fallow guard` nos dois arquivos, com `--format json --quiet --explain`: saída **0**, sem regras de fronteiras configuradas.
- `npm run typecheck`: saída **0**.
- `npm run fallow:coverage`: saída **0**, **45 arquivos / 598 testes aprovados**, incluindo create-lot e a rota place-bid, em PostgreSQL 17 descartável. Statements **90,35%**, branches **84,80%**, funções **90,02%**, linhas **90,17%**, iguais ao C02. Relatórios temporários em `/tmp/change-of-bid-fallow-coverage.vJhMw7/`.
- Saúde de produção e inventário completo com a cobertura recém-gerada: saída **0** em ambos, nenhum finding de saúde. H01/H02 deixam de ultrapassar o limiar estimado; isso não representa nova cobertura medida dos helpers, que continuam excluídos da instrumentação.
- O inventário consultivo de tamanho passa a incluir `createDependencies` com **62 linhas** devido aos defaults explícitos. Esse sinal não reprova o gate; não foi feita outra extração apenas para reduzir a contagem de linhas.
- `fallow architecture` e `fallow audit --base HEAD`, com `--format json --quiet --explain`: saída **0**, sem ciclos nem novos findings no diff.
- `git diff --check`: saída **0**.

### Execução do C04 — 29/10/2026

Implementação preparada sobre `6730c3f`, sem criar commit Git. A fixture foi
movida de `src/services/lots/public-lot-audit-fixtures.ts` para
`src/test/public-lot-audit-fixtures.ts`. Foram ajustados os quatro imports
internos e os imports dos dois consumidores: `show-public-lot-audit.test.ts`
e `routes/public/lot-audit.test.ts`. Comparação com o arquivo em HEAD confirmou
o restante do conteúdo idêntico, incluindo a ordem de limpeza exigida pelas FKs
(D70). Nenhum cenário foi adicionado ou removido.

As exclusões existentes em `tsconfig.build.json` (`src/test`) e
`vitest.config.ts` (`src/test/**`) já cobrem o novo caminho, sem mudança de
configuração. O helper está ausente tanto do programa TypeScript de build
(incluindo imports transitivos) quanto das fontes do sourcemap do bundle.

Validação:

- `fallow guard` nos caminhos envolvidos, com `--format json --quiet --explain`:
  saída **0**, sem regras de fronteiras configuradas.
- `npm run typecheck` e `npm run build`: saída **0** em ambos.
- `npm run fallow:coverage`: saída **0**, **45 arquivos / 598 testes aprovados**,
  incluindo as duas suítes consumidoras, em PostgreSQL 17 descartável.
  Relatórios temporários em `/tmp/change-of-bid-fallow-coverage.XO0nhZ/`.
- Saúde de produção e inventário completo com a cobertura recém-gerada:
  saída **0** em ambos, nenhum finding de saúde.
- `fallow dead-code --production`, com os mesmos flags JSON/explain:
  saída **1**, **7 achados** retidos P02–P08; **0 arquivos sem uso**. P01
  resolvido pela localização correta da fixture, sem apagar seus helpers.
- `fallow architecture` e `fallow audit --base HEAD`, com os mesmos flags:
  saída **0**, sem ciclos nem novos findings no diff.
- `git diff --check`: saída **0**.

Comparação de cobertura com a rodada C03 preservada em
`/tmp/change-of-bid-fallow-coverage.vJhMw7/`: **70 → 69 arquivos**
instrumentados. O único arquivo retirado é a fixture; nenhum arquivo foi
adicionado ao mapa. Os statements, branches e funções cobertos/não cobertos dos
demais arquivos permanecem iguais. A mudança dos percentuais abaixo decorre
da retirada do helper, sem perda de cobertura no código de produção:

| Métrica | C03 | C04 |
| --- | --- | --- |
| Statements | 1.545/1.710 (**90,35%**) | 1.485/1.648 (**90,10%**) |
| Branches | 636/750 (**84,80%**) | 624/736 (**84,78%**) |
| Funções | 370/411 (**90,02%**) | 358/399 (**89,72%**) |
| Linhas | 1.506/1.670 (**90,17%**) | 1.448/1.610 (**89,93%**) |

### Execução do C05 — 29/10/2026

Implementação preparada sobre `1fe6d9c`, sem criar commit Git. O novo helper
`src/db/seed-user-lookup.ts` concentra somente a consulta de usuário por email:
projeção de `id`, igualdade por email e `limit(1)`. Recebe o executor por
parâmetro; os dois seeds continuam passando o mesmo `db`, sem abrir transação
ou conexão adicional. Retorna a primeira linha ou `undefined`.

`findAuctioneerId` e `findUserId` preservam a validação de ausência e as
mensagens distintas `Auctioneer ${email} was not found` e
`User ${email} was not found`. As consultas de carteira, a ordem das etapas,
o retiming e as fronteiras de transação permanecem inalterados. Nenhuma
consulta de `seed-users.ts` foi migrada: seu executor transacional é próprio.

Os testes existentes foram preservados. Foram acrescentados três cenários
em `seed-lot-activity.test.ts`: ausência de cada um dos dois bidders e ausência
do leiloeiro na etapa de cancelamento, verificando a mensagem e a interrupção
antes das operações seguintes. O cenário de leiloeiro ausente em
`seed-lots.test.ts` continua passando com a mensagem `Auctioneer`.

Validação:

- `fallow guard` nos caminhos envolvidos, com `--format json --quiet --explain`:
  saída **0**, sem regras de fronteiras configuradas.
- Suítes `seed-lots.test.ts` e `seed-lot-activity.test.ts`: saída **0**,
  **2 arquivos / 43 testes aprovados**. `npm run typecheck`: saída **0**.
- `npm run fallow:coverage`: saída **0**, **45 arquivos / 601 testes aprovados**
  em PostgreSQL 17 descartável, incluindo a integração `seed-ledger.test.ts`
  com reconciliação financeira, cadeias de lances e idempotência.
  Relatórios temporários em `/tmp/change-of-bid-fallow-coverage.XEwNRU/`.
  Statements **90,16%**, branches **84,91%**, funções **89,75%**, linhas
  **90,00%**. O mapa contém **70 arquivos**, incluindo o novo helper.
- Saúde de produção e inventário completo com essa cobertura recém-gerada:
  saída **0** em ambos, nenhum finding de saúde.
- `fallow dupes --mode semantic`, com os flags JSON/explain: saída **0**.
  Os fingerprints originais de D23 (`dup:4a0b639e`) e D20 (`dup:0615a02e`)
  não aparecem mais; a consulta distinta de carteira permanece preservada.
  A rodada contém **78 grupos / 41 famílias / 170 instâncias** consultivos.
- `fallow architecture` e `fallow audit --base HEAD --coverage` com o caminho
  absoluto do relatório desta execução e os flags JSON/explain: saída **0**,
  sem ciclos nem findings no diff; veredito do audit **pass**.
- `git diff --check`: saída **0**.

### Execução do C06 — 29/10/2026

Implementação preparada sobre `0ff7535`, sem criar commit Git. O módulo
`src/services/lots/lot-read-types.ts` concentra somente três tipos:
`ListedLotItem`, `ShownLotItem` (o item de listagem acrescido de `cardSnapshot`)
e `ShownLotBid`. Não possui imports nem código de execução.

Os oito nomes de tipos de item/lance já exportados pelas três listagens e
pelas leituras de lote público, lote do leiloeiro e recibo continuam nos
mesmos módulos como aliases. O mapa interno de `loadListedLotItems` também
usa `ListedLotItem`, substituindo sua cópia local. Todos os imports do novo
módulo são `import type`.

Os DTOs completos permanecem separados, incluindo seus tipos de status,
`receivedAmount`, `totalReceived`, `viewerParticipantNo`, `participantNo`,
`won` e `shareToken`. As projeções SQL, a seleção explícita dos campos de
lances e o filtro de `card_images` não mudam. Nenhum teste ou schema foi
alterado, adicionado ou removido.

Validação:

- `fallow guard` nos caminhos envolvidos, com `--format json --quiet --explain`:
  saída **0**, sem regras de fronteiras configuradas.
- `npm run typecheck` e `npm run build`: saída **0** em ambos. O novo módulo
  de tipos não aparece nas fontes do sourcemap do bundle.
- Comparação temporária pela API do TypeScript antes/depois: os campos e
  tipos dos **16 contratos exportados** de itens, lances e respostas são
  idênticos; o JavaScript transpilado dos **7 arquivos alterados** também é
  idêntico, desconsiderando comentários.
- `npm run fallow:coverage`: saída **0**, **45 arquivos / 601 testes aprovados**
  em PostgreSQL 17 descartável, incluindo schemas, serviços e rotas de
  leituras públicas/privadas. Statements **90,16%**, branches **84,91%**,
  funções **89,75%**, linhas **90,00%**, iguais ao C05. Relatórios em
  `/tmp/change-of-bid-fallow-coverage.ouyrFY/`.
- O mapa de cobertura passa de **70 para 71 arquivos** somente pela entrada
  vazia do módulo de tipos: zero statements, branches ou funções. Comparação
  com o mapa do C05 confirmou contagens cobertas/não cobertas idênticas nos
  outros 70 arquivos, sem mudança dos denominadores dessas métricas.
- Saúde de produção e inventário completo com a cobertura recém-gerada:
  saída **0** em ambos, nenhum finding de saúde.
- `fallow dupes --mode semantic`, com os flags JSON/explain: saída **0**,
  **77 grupos / 40 famílias / 163 instâncias** consultivos. Os fingerprints
  originais de D13, D17, D27 e D53 não aparecem mais. D48 permanece no trecho
  dos DTOs completos; seus campos específicos foram mantidos explícitos,
  sem unificar respostas públicas e privadas para reduzir o detector.
- `fallow dead-code --type-aware`, com os mesmos flags: saída **0**, somente
  o aviso T01 já registrado; nenhum arquivo, export ou tipo sem uso.
- `fallow architecture` e `fallow audit --base HEAD --coverage` com o caminho
  absoluto desta cobertura e os flags JSON/explain: saída **0**, sem ciclos
  nem findings no diff; veredito do audit **pass**. Relatórios e comparações
  temporários em `/tmp/change-of-bid-c06-m4cQt5/`.
- `git diff --check`: saída **0**.

### Execução do C07 — 29/10/2026

Implementação preparada sobre `ff2f041`, após C05/C06, sem criar commit Git.
A refatoração fica nos três módulos de seeds, com helpers internos e sem
novos exports:

- `seed-lots.ts`: `findPendingSeedLots` seleciona decks e planos ainda não
  criados; `prepareSeedLot` valida o catálogo e monta os itens;
  `createSeedLot` persiste cada lote com seus itens na mesma transação.
  Todos os decks pendentes continuam sendo validados antes da primeira
  transação de lote. A ordem dos planos, itens, consultas e logs é preservada.
- `seed-lot-activity.ts`: `retimeBidMovements` atualiza o HOLD do lance e,
  quando existe lance anterior, seu RELEASE. Recebe o executor da transação
  de `retimeBids`; o recálculo HMAC, as atualizações de lances e movimentos
  e a gravação final de `headHash` continuam em uma única transação, na
  mesma ordem. O fluxo de settlement, incluindo `settleEndedLots` (H03),
  permanece inalterado.
- `seed-users.ts`: `upsertSeedIdentity` concentra a identidade do usuário;
  `upsertSeedCredential` concentra a conta credential e sua senha. A
  orquestração continua executando identidade, carteira e credencial na
  mesma transação, preservando IDs, saldos, contas OAuth e os retornos
  `created`/`updated`. Os imports de tipos não carregam o pool ao importar
  o módulo.

Nenhum teste foi adicionado, removido ou alterado. As suítes existentes
verificam os contratos extraídos, inclusive os vetores HMAC fixos,
HOLD/RELEASE, interrupção por erro, rollback e idempotência.

Validação:

- `fallow guard` nos caminhos envolvidos, com `--format json --quiet --explain`:
  saída **0**, sem regras de fronteiras configuradas.
- Suítes `seed-lots.test.ts`, `seed-lot-activity.test.ts` e
  `seed-users-import.test.ts`: saída **0**, **3 arquivos / 44 testes aprovados**.
- `npm run typecheck` e `npm run build`: saída **0** em ambos.
- `npm run fallow:coverage`: saída **0**, **45 arquivos / 601 testes aprovados**
  em PostgreSQL 17 descartável, incluindo `seed-users.test.ts` (rollback e
  preservação de saldos/identidades) e `seed-ledger.test.ts` (reconciliação
  financeira, cadeias de lances e segunda execução sem duplicações).
  Statements **90,21%**, branches **84,91%**, funções **89,90%**, linhas
  **90,05%**. Relatórios em `/tmp/change-of-bid-fallow-coverage.8ffIPA/`.
- Saúde de produção e inventário completo com essa cobertura: saída **0**
  em ambos, nenhum finding de saúde. Nenhuma função dos três módulos
  alterados excede o limiar consultivo de **60 linhas**; L03/L06/L08
  deixam de aparecer nesse inventário, sem alterar os limiares.
- `fallow dead-code --type-aware`, com os mesmos flags JSON/explain:
  saída **0**, somente o aviso T01 já registrado; nenhum arquivo, export
  ou tipo sem uso.
- `fallow architecture` e `fallow audit --base HEAD --coverage` com o caminho
  absoluto desta cobertura e os flags JSON/explain: saída **0**, sem ciclos
  nem findings no diff; veredito do audit **pass**. Relatórios temporários
  em `/tmp/change-of-bid-c07-{architecture,audit,type-aware}.json`.
- `git diff --check`: saída **0**.

### Execução do C08 — 29/10/2026

Implementação preparada sobre `047e5ba`, sem criar commit Git. A mudança fica
restrita a `src/services/lots/place-bid.ts`, com dois helpers internos e sem
alterar exports ou contratos públicos:

- `acceptLockedBid` concentra as etapas executadas dentro da transação:
  bloqueio e validação do lote, validação do líder e do mínimo, bloqueio das
  carteiras e conferência do saldo, registro do lance, transição das reservas
  e atualização do líder com a eventual extensão do prazo.
- `insertParticipantBid` registra ou recupera o participante, prepara o lance
  canônico, persiste o lance e verifica se o timestamp gravado corresponde ao
  instante usado no HMAC. Devolve o lance persistido e os dados canônicos
  necessários para atualizar o lote e montar a resposta.

`placeBid` mantém a autorização e a normalização do valor antes da transação
e publica o evento somente depois de sua conclusão. Todos os passos de banco
continuam recebendo o mesmo executor de uma única transação. A ordem das
operações permanece igual: lote primeiro, carteiras na ordem estável do
modelo, participante/lance, HOLD e aumento da reserva do novo líder,
RELEASE e redução da reserva anterior, atualização final do lote.
As consultas de locks, o cálculo HMAC, os valores monetários, a janela
inclusiva de extensão e os erros permanecem inalterados.

Nenhum teste foi adicionado, removido ou alterado. As suítes existentes
exercitam concorrência no mesmo lote, saldo compartilhado entre lotes,
disputa com cancelamento, extensão repetida, encadeamento HMAC e rollback
por divergência de timestamp ou falha na escrita final, sem publicação de
evento após rollback.

Validação:

- `fallow guard` no arquivo, com `--format json --quiet --explain`:
  saída **0**, sem regras de fronteiras configuradas.
- `npm run typecheck` e `npm run build`: saída **0** em ambos.
- `npm run fallow:coverage`: saída **0**, **45 arquivos / 601 testes aprovados**
  em PostgreSQL 17 descartável. Statements **90,23%**, branches **84,91%**,
  funções **89,95%**, linhas **90,07%**. Relatórios em
  `/tmp/change-of-bid-fallow-coverage.rzROET/`.
- Comparação com a cobertura do C07: os mesmos **71 arquivos** no mapa;
  contagens de statements, branches e funções cobertos/não cobertos iguais
  nos outros 70 arquivos. Em `place-bid.ts`, branches permanecem **55/65**;
  a extração acrescenta **3 statements cobertos** e **2 funções cobertas**,
  preservando **11 statements** e **10 branches** não cobertos. A variação
  dos percentuais decorre da refatoração, sem novos cenários de teste.
- Saúde de produção e inventário completo com essa cobertura: saída **0**
  em ambos, nenhum finding de saúde. Nenhuma função de `place-bid.ts`
  excede o limiar consultivo de **60 linhas**; L04/L09 deixam de aparecer
  nesse inventário, sem alterar limiares ou supressões.
- `fallow dead-code --type-aware`, com os mesmos flags JSON/explain:
  saída **0**, somente o aviso T01 já registrado; nenhum arquivo, export
  ou tipo sem uso.
- `fallow architecture` e `fallow audit --base HEAD --coverage` com o caminho
  absoluto desta cobertura e os flags JSON/explain: saída **0**, sem ciclos
  nem findings no diff; veredito do audit **pass**. Relatórios temporários
  em `/tmp/change-of-bid-c08-{guard,architecture,audit,type-aware}.json`.
- `git diff --check`: saída **0**.

### Execução do C09 — 29/10/2026

Implementação preparada sobre `e0ef1ce`, sem criar commit Git. A mudança fica
restrita a `src/services/wallet/deposit.ts`, com dois helpers internos e sem
alterar exports ou contratos públicos:

- `validateDepositInput` confere a autorização BIDDER antes de validar o
  tipo e normalizar o valor monetário. Retorna o valor canônico; as mesmas
  rejeições acontecem antes de abrir a transação.
- `persistDeposit` recebe o executor da transação e mantém a sequência:
  bloqueio da carteira por usuário, validação de existência, inserção do
  movimento DEPOSIT, aumento do saldo total e leitura dos saldos finais.
  Todas as operações continuam usando o mesmo executor, preservando a
  atomicidade do movimento e do crédito e o saldo comprometido.

`deposit` conserva a resolução das dependências antes da validação e aguarda
a transação dentro do `try`. Erros de domínio mantêm sua identidade; erros
PostgreSQL `22003`, inclusive encadeados por `cause`, continuam traduzidos
para `AMOUNT_OUT_OF_RANGE`. Os demais erros continuam sendo propagados.
Consultas, locks, limites monetários e formato da resposta permanecem iguais.

Nenhum teste foi adicionado, removido ou alterado. As suítes existentes
verificam autorização pela sessão, impedimento de crédito em outra carteira,
normalização, limites, carteira ausente, depósitos concorrentes sem perda
de crédito e rollback do movimento quando o saldo excede o limite do banco.
A integração dos seeds continua reconciliando saldos e movimentos e
verificando idempotência.

Validação:

- `fallow guard` no arquivo, com `--format json --quiet --explain`:
  saída **0**, sem regras de fronteiras configuradas.
- `npm run typecheck` e `npm run build`: saída **0** em ambos.
- `npm run fallow:coverage`: saída **0**, **45 arquivos / 601 testes aprovados**
  em PostgreSQL 17 descartável, incluindo carteira, depósitos e integração
  financeira. Statements **90,25%**, branches **84,91%**, funções **90,00%**,
  linhas **90,09%**. Relatórios em
  `/tmp/change-of-bid-fallow-coverage.WA19CF/`.
- Comparação com a cobertura do C08: os mesmos **71 arquivos** no mapa;
  contagens de statements, branches e funções cobertos/não cobertos iguais
  nos outros 70 arquivos. Em `deposit.ts`, branches permanecem **18/21**;
  a extração acrescenta **3 statements cobertos** e **2 funções cobertas**,
  preservando **4 statements** e **3 branches** não cobertos. A variação
  dos percentuais decorre da refatoração, sem novos cenários de teste.
- Saúde de produção e inventário completo com essa cobertura: saída **0**
  em ambos, nenhum finding de saúde. Nenhuma função de `deposit.ts`
  excede o limiar consultivo de **60 linhas**; L05 deixa de aparecer nesse
  inventário, sem alterar limiares ou supressões.
- `fallow dead-code --type-aware`, com os mesmos flags JSON/explain:
  saída **0**, somente o aviso T01 já registrado; nenhum arquivo, export
  ou tipo sem uso.
- `fallow architecture` e `fallow audit --base HEAD --coverage` com o caminho
  absoluto desta cobertura e os flags JSON/explain: saída **0**, sem ciclos
  nem findings no diff; veredito do audit **pass**. Relatórios temporários
  em `/tmp/change-of-bid-c09-{guard,architecture,audit,type-aware}.json`.
- `git diff --check`: saída **0**.

### Execução do C10 — 29/10/2026

Implementação preparada sobre `101d49e`, sem criar commit Git. A descrição
original de C10 citava SSE, timer e abort, mas o código já usa WebSocket
desde a base desta auditoria. O aceite foi corrigido para o transporte real:
não há timer nem listener de abort próprios nesse endpoint.

`src/routes/public/lot-live-lifecycle.ts` concentra a entrada e a saída da
sala em `PublicLotLiveLifecycle`. A instância usada pela rota passa a ser a
dona dos registros fracos de assinaturas e sockets fechados:

- `open` desativa mensagens do cliente no hook do adaptador, entra na sala
  e encaminha seus payloads sem transformação. Se o socket fechar enquanto
  o snapshot está pendente, executa a saída assim que a assinatura chegar,
  sem armazená-la como conexão ativa.
- `close` marca o socket como fechado, executa a saída registrada e remove
  seu registro. Chamadas repetidas não repetem a saída; fechar um cliente
  não remove os demais assinantes.
- Falhas na entrada/snapshot continuam fechando o socket com código **1011**
  e a mesma mensagem. O erro original é propagado mesmo quando a tentativa
  de fechar um socket já desconectado também falha.

`publicLotLiveRoutes` conserva o registro no app raiz, a validação de UUID,
origem e existência do lote e delega os hooks de abertura/fechamento.
O protocolo, os payloads públicos, a fila de publicação e a montagem do
snapshot no serviço permanecem inalterados. O lifecycle recebe a função de
entrada na sala por construtor; seu import do serviço é somente de tipo.

As suítes existentes foram preservadas. Sete testes novos controlam a Promise
de entrada para verificar a desconexão durante o snapshot, saída única,
isolamento entre clientes, encaminhamento de payloads, falhas de snapshot
e de fechamento e bloqueio das mensagens do cliente, incluindo `ping`.
Não abrem servidor, conexão de banco ou timer. A integração existente
continua exercitando frames reais, reconexão, cancelamento, liquidação,
isolamento entre salas e privacidade.

Validação:

- `fallow guard` nos quatro caminhos envolvidos, com
  `--format json --quiet --explain`: saída **0**, sem regras de fronteiras
  configuradas.
- Suíte `lot-live-lifecycle.test.ts`: saída **0**, **7 testes aprovados**.
- `npm run typecheck` e `npm run build`: saída **0** em ambos.
- `npm run fallow:coverage`: saída **0**, **46 arquivos / 608 testes aprovados**
  em PostgreSQL 17 descartável. Statements **90,69%**, branches **85,32%**,
  funções **90,07%**, linhas **90,54%**. Relatórios em
  `/tmp/change-of-bid-fallow-coverage.1Eouxp/`.
- Comparação com C09: **71 → 72 arquivos** no mapa, acrescentando somente
  `lot-live-lifecycle.ts`. As contagens de statements, branches e funções
  cobertos/não cobertos permanecem iguais nos outros 70 arquivos.
  O lifecycle tem **26/26 statements**, **6/6 branches** e **6/6 funções**
  cobertos. A rota conserva apenas a propagação de erro inesperado do
  `beforeHandle` sem cobertura; a melhora reflete os cenários novos do
  lifecycle extraído e a mudança na distribuição das funções.
- Saúde de produção e inventário completo com essa cobertura: saída **0**
  em ambos, nenhum finding de saúde. Nenhuma função de produção dos dois
  módulos excede o limiar consultivo de **60 linhas**; L07 deixa de aparecer
  nesse inventário, sem alterar limiares ou supressões. O `describe` da nova
  suíte aparece no inventário consultivo de tamanho de testes.
- `fallow dead-code --type-aware`, com os mesmos flags JSON/explain:
  saída **0**, somente o aviso T01 já registrado; nenhum arquivo, export
  ou tipo sem uso.
- `fallow architecture` e `fallow audit --base HEAD --coverage` com o caminho
  absoluto desta cobertura e os flags JSON/explain: saída **0**, sem ciclos
  nem findings no diff; veredito do audit **pass**. Relatórios temporários
  em `/tmp/change-of-bid-c10-{guard,architecture,audit,type-aware}.json`.
- `git diff --check`: saída **0**.

### Execução do C11 — 29/10/2026

Implementação preparada sobre `5854c06`, sem criar commit Git. A mudança fica
restrita a `src/services/lots/list-auctioneer-lots.ts`, com dois helpers
internos e sem alterar exports ou contratos públicos:

- `findAuctioneerLotRows` concentra a consulta: colunas comuns da listagem,
  subconsulta do crédito de liquidação recebido pelo leiloeiro, join com o
  lance atual, filtro pelo dono do lote, busca textual/status e ordenação
  compartilhada. Recebe o mesmo executor e o mesmo instante `now`.
- `toAuctioneerLot` monta o DTO de cada linha: status validado, `sold` pela
  existência de vencedor, `receivedAmount` formatado ou nulo e itens do lote.

`listAuctioneerLots` mantém a verificação do papel AUCTIONEER antes de
qualquer leitura, a ordem total recebido → linhas → itens e o formato da
resposta. Filtros, DTOs e consultas de bidder e da listagem pública não foram
unificados; SQL, ordenação, formatação monetária e erros permanecem iguais.

Nenhum teste foi adicionado, removido ou alterado. As suítes existentes
cobrem permissão, status efetivo, ordenação, busca textual, lotes cancelados,
valores recebidos por lote e total recebido.

Validação:

- `fallow guard` no arquivo, com `--format json --quiet --explain`:
  saída **0**, sem regras de fronteiras configuradas.
- `npm run typecheck` e `npm run build`: saída **0** em ambos.
- `npm run fallow:coverage`: saída **0**, **46 arquivos / 608 testes aprovados**
  em PostgreSQL 17 descartável. Statements **90,70%**, branches **85,32%**,
  funções **90,12%**, linhas **90,55%**. Relatórios em
  `/tmp/change-of-bid-fallow-coverage.KrO8HJ/`.
- Comparação com a cobertura do C10: os mesmos **72 arquivos** no mapa;
  contagens de statements, branches e funções cobertos/não cobertos iguais
  nos outros 71 arquivos. Em `list-auctioneer-lots.ts`, branches permanecem
  **8/11**; a extração acrescenta **2 statements cobertos** e **2 funções
  cobertas**, preservando **1 statement** e **3 branches** não cobertos.
  A variação dos percentuais decorre da refatoração, sem novos cenários.
- Saúde de produção e inventário completo com essa cobertura: saída **0**
  em ambos, nenhum finding de saúde. Nenhuma função de
  `list-auctioneer-lots.ts` excede o limiar consultivo de **60 linhas**;
  L10 deixa de aparecer nesse inventário, sem alterar limiares ou supressões.
- `fallow dead-code --type-aware`, com os mesmos flags JSON/explain:
  saída **0**, somente o aviso T01 já registrado; nenhum arquivo, export
  ou tipo sem uso.
- `fallow architecture` e `fallow audit --base HEAD --coverage` com o caminho
  absoluto desta cobertura e os flags JSON/explain: saída **0**, sem ciclos
  nem findings no diff; veredito do audit **pass**.
- `git diff --check`: saída **0**.

### Execução do C12 — 29/10/2026

Implementação preparada sobre `1d36732`, sem criar commit Git. Este primeiro
commit do C12 cobre somente a suíte de liquidação, escolhida pelo maior
callback do inventário (L011). Lances, carteira e listagens ficam para
commits próprios, conforme o escopo proposto.

`src/services/lots/settle-due-lots.test.ts` passa de **1.852 para 59 linhas**
e continua sendo a única entrada Vitest dessa suíte. Registra os mesmos
17 blocos na ordem original e mantém `afterEach(cleanup)` e o fechamento do
pool em `afterAll`. Os novos módulos em
`src/services/lots/__tests__/settle-due-lots/` separam:

- Fixtures, relógio fixo, operações auxiliares e limpeza; consultas de
  verificação ficam em `reads.ts`. As listas de IDs criados continuam únicas
  para toda a suíte, com a mesma ordem de limpeza das FKs.
- Liquidação e recibos, elegibilidade/agenda, saldos e reservas,
  concorrência com lances, concorrência com cancelamento, validação,
  rollback financeiro e publicação após commit.

Os helpers exclusivos da corrida de lance ficam no próprio módulo desse
cenário, fora do callback `describe`, sem estado mutável compartilhado novo.
Os testes continuam usando transações, locks e conexões reais; não foram
introduzidos mocks nem arquivos de teste executados em paralelo.

Nenhum teste foi adicionado ou removido. Comparação temporária pela AST e
pelos tokens TypeScript confirmou os 17 blocos na mesma ordem, os mesmos
23 helpers/constantes originais e os dois hooks. Na corrida de lance,
as declarações movidas para o escopo do módulo também são idênticas;
as asserções, tabelas parametrizadas e os corpos dos testes não mudam.
Código de produção, configuração, limiares e supressões permanecem iguais.

Validação:

- `fallow guard` nos 11 caminhos de código, com
  `--format json --quiet --explain`: saída **0**, sem regras de fronteiras
  configuradas.
- `npm run typecheck` e `npm run build`: saída **0** em ambos. Os novos
  módulos de teste não aparecem nas fontes do sourcemap do bundle.
- `npm run fallow:coverage`, antes e depois: saída **0**, **46 arquivos /
  608 testes aprovados** em cada execução, com PostgreSQL 17 descartável.
  Relatórios anteriores em `/tmp/change-of-bid-fallow-coverage.tcyanG/`;
  posteriores em `/tmp/change-of-bid-fallow-coverage.hkl9Am/`.
- Cobertura idêntica: statements **90,70%**, branches **85,32%**, funções
  **90,12%**, linhas **90,55%**. Os mesmos **72 arquivos** instrumentados,
  com cada statement, branch e função mantendo seu estado coberto/não
  coberto. Os novos módulos ficam na exclusão existente `__tests__`.
- Saúde de produção e inventário completo com a cobertura nova: saída **0**
  em ambos, nenhum finding de saúde. O callback de 1.535 linhas de L011
  deixa de existir. Cenários individuais extensos continuam no inventário
  consultivo; não foram fragmentadas asserções apenas para reduzir métricas.
- `fallow dead-code --type-aware`, com os mesmos flags JSON/explain:
  saída **0**, somente o aviso T01 já registrado; nenhum arquivo, export
  ou tipo sem uso.
- `fallow architecture` e `fallow audit --base HEAD --coverage` com o caminho
  absoluto da cobertura nova e os flags JSON/explain: saída **0**, sem
  ciclos nem findings no diff; veredito do audit **pass** nos 11 arquivos
  de código. Relatórios em `/tmp/change-of-bid-c12-{guard,architecture,audit,type-aware}.json`.
- `git diff --check`: saída **0**.

### Execução do C13 — 29/10/2026

Fechamento documental preparado sobre `bb14b1e`, sem criar commit Git.
`docs/fallow.md` passa a apontar para esta auditoria e para esta execução,
substituindo referências ambíguas aos commits de 28/10, cujo relatório não
existe na árvore. As contagens originais e os apêndices são mantidos como
histórico; o guia apresenta o estado revalidado após C01–C12. A reprodução
de cobertura acima passa a usar o script descartável já entregue no C01.

Decisões retidas:

- **T01:** mesmo aviso no projeto e na reprodução mínima, apesar do
  `export type` explícito. Mantida a classificação de provável falso positivo
  neste contrato Elysia. Preservados API, script de reprodução e gatilho de
  revisão ao atualizar Fallow/companion/Elysia.
- **S01–S06:** os mesmos seis IDs permanecem visíveis. Conferidos os
  consumidores atuais, a validação de origem antes do download, timeout e
  redirects, a origem local dos caminhos, a validação/escaping do nome do
  banco, o bloqueio de produção e o comando sem shell. S01 segue mitigado no
  fluxo atual; S02–S06 seguem sem vulnerabilidade demonstrada nesses fluxos.
  O downloader isolado continua exigindo que seus consumidores validem a URL.
- **A01/A02:** fronteiras e políticas continuam não medidas; ciclos foram
  medidos. Hotspots, tamanho e bus factor são sinais consultivos, com janela,
  relógio e limitações de identidade explicitados no guia. Não foram
  inventadas zonas nem assumida ausência de revisão por bus factor 1.
- **D/P:** mantidas operações SQL, schemas, erros e contratos distintos,
  conforme os apêndices e o guia. P01 está resolvido pela mudança de
  localização; P02–P08 têm consumidores de teste conferidos e são preservados.
  C12 cobriu apenas liquidação; a reorganização das demais suítes continua
  opcional e não condiciona este fechamento.

Nenhum código, dependência, configuração, limiar ou supressão foi alterado.
Ferramentas locais revalidadas: Fallow/companion **3.36.0**, TypeScript
**5.9.3**, Vitest/provider **5.0.5** e Elysia **1.4.30**.

Validação:

- `npm run typecheck`: saída **0**.
- `npm run fallow:coverage`: saída **0**, **46 arquivos / 608 testes
  aprovados**, em PostgreSQL 17 descartável, removido ao final. Statements
  **90,70%**, branches **85,32%**, funções **90,12%**, linhas **90,55%**;
  percentuais iguais aos registrados no C12. Relatórios em
  `/tmp/change-of-bid-fallow-coverage.2gHqy1/`.
- Saúde de produção e inventário completo com essa cobertura: saída **0**
  em ambos, nenhum finding de saúde. **72/72 arquivos** associados;
  **413/415 funções** no recorte de produção e **413/1.947** no inventário.
  Alcance estático **62/62 arquivos runtime**, sem arquivo/export sem caminho
  de teste. H01/H02 e G01 continuam resolvidos; H03 não reaparece.
- `fallow list --entry-points`: saída **0**, **78 entrypoints** completos.
- `fallow dead-code`: saída **0**, nenhum finding; `dead-code --type-aware`:
  saída **0**, somente T01. `sh docs/fallow/reproduce-t01.sh`: saída **0**,
  compilação sem emissão aprovada e o mesmo aviso T01 reproduzido.
- `fallow dead-code --production`: saída **1**, exatamente P02–P08,
  **0 arquivos sem uso**. Gate reprovado pelos sete exports/tipos usados
  pelos testes excluídos do recorte; não é falha da ferramenta.
- `fallow security --surface`: saída **0**, mesmos **6 candidatos**;
  **3.063 call sites não resolvidos**, com trilhas de confiança
  `module-level`. Essa limitação não é prova de fluxo contaminado nem uma
  análise de CVEs.
- `fallow dupes`: saída **0**, **0 grupos**. Modo semântico: saída **0**,
  **78 grupos / 42 famílias / 166 instâncias**, **36/66 arquivos** e
  **1.695/8.400 linhas (20,18%)**. O inventário consultivo atual não
  substitui os 80 grupos históricos nem autoriza consolidação automática.
- `fallow flags --retirement`: saída **0**, nenhuma flag reconhecida.
- `fallow guard` nos dois documentos e `fallow architecture`: saída **0**,
  sem ciclos nem regras de fronteiras configuradas. Todos os comandos Fallow
  acima usaram `--format json --quiet --explain`, com stderr separado.
  Relatórios em `/tmp/change-of-bid-c13-9setqyfa/`.
- `fallow audit --base HEAD --coverage` com o caminho absoluto da cobertura
  desta rodada e os mesmos flags JSON/explain: saída **0**, veredito **pass**
  nos dois documentos alterados, sem novos findings. O diff é documental;
  a saúde de todo o código foi conferida separadamente acima.
- Links e âncoras locais dos dois documentos conferidos, sem destinos
  ausentes; `git diff --check`: saída **0**.

## Apêndice D — Todos os grupos semânticos

As decisões resumidas usam estas categorias: **DECL** (declarações Drizzle distintas), **ERRO** (classes/códigos de erro distintos), **ROTA** (contratos/handlers distintos), **SCHEMA** (validação distinta), **SQL** (operações diferentes), **DTO** (avaliar somente campos idênticos), **SEED** (reuso localizado), **OUTRO** (forma semelhante, preservar). Os números D são estáveis apenas neste documento; o fingerprint identifica a rodada.

| ID / fingerprint | Locais (linhas inclusivas) | Decisão / commit |
| --- | --- | --- |
| D01 / `dup:71e99c88` | `src/db/schema.ts:392-430`<br>`src/db/schema.ts:472-511` | DECL: manter tabelas, FKs, checks e relações explícitos; C13. |
| D02 / `dup:3acb7b2c` | `src/services/lots/list-bidder-participations.ts:15-31`<br>`src/services/lots/show-public-lot-audit.ts:26-42`<br>`src/services/lots/show-public-lot.ts:18-33`<br>`src/services/lots/show-public-receipt.ts:13-29`<br>`src/services/wallet/get-wallet.ts:11-26` | ERRO: manter classes, códigos e identidade instanceof; C13. |
| D03 / `dup:ebc52930` | `src/services/lots/list-bidder-participations.ts:15-32`<br>`src/services/lots/show-public-lot-audit.ts:26-43`<br>`src/services/lots/show-public-lot.ts:18-34`<br>`src/services/lots/show-public-receipt.ts:13-30` | ERRO: manter classes, códigos e identidade instanceof; C13. |
| D04 / `dup:c842274d` | `src/services/lots/cancel-lot.ts:17-43`<br>`src/services/lots/show-auctioneer-lot.ts:19-45`<br>`src/services/wallet/deposit.ts:24-45` | ERRO: manter classes, códigos e identidade instanceof; C13. |
| D05 / `dup:4c12bccb` | `src/db/schema.ts:493-516`<br>`src/db/schema.ts:545-569` | DECL: manter tabelas, FKs, checks e relações explícitos; C13. |
| D06 / `dup:44c6566d` | `src/db/schema.ts:524-549`<br>`src/db/schema.ts:550-574` | DECL: manter tabelas, FKs, checks e relações explícitos; C13. |
| D07 / `dup:a4c8bbdf` | `src/db/schema.ts:219-232`<br>`src/db/schema.ts:245-262` | DECL: manter tabelas, FKs, checks e relações explícitos; C13. |
| D08 / `dup:1115a0b6` | `src/db/schema.ts:445-463`<br>`src/db/schema.ts:466-484` | DECL: manter tabelas, FKs, checks e relações explícitos; C13. |
| D09 / `dup:2cbe17cc` | `src/routes/private/lots.ts:167-191`<br>`src/routes/private/lots.ts:204-228` | ROTA: preservar serviços, autorização, status HTTP e schemas próprios; C13. |
| D10 / `dup:eb00ece7` | `src/db/schema.ts:440-458`<br>`src/db/schema.ts:524-542` | DECL: manter tabelas, FKs, checks e relações explícitos; C13. |
| D11 / `dup:ae293224` | `src/db/schema.ts:157-168`<br>`src/db/schema.ts:222-233`<br>`src/db/schema.ts:301-312` | DECL: manter tabelas, FKs, checks e relações explícitos; C13. |
| D12 / `dup:fc490795` | `src/db/schema.ts:451-468`<br>`src/db/schema.ts:545-562` | DECL: manter tabelas, FKs, checks e relações explícitos; C13. |
| D13 / `dup:2fe5febb` | `src/services/lots/show-public-lot.ts:18-43`<br>`src/services/lots/show-public-receipt.ts:13-40` | DTO: somente campos idênticos candidatos; C06 opcional; contratos completos distintos. |
| D14 / `dup:d340d018` | `src/db/schema.ts:85-95`<br>`src/db/schema.ts:106-115`<br>`src/db/schema.ts:137-147` | DECL: manter tabelas, FKs, checks e relações explícitos; C13. |
| D15 / `dup:90a4a819` | `src/services/lots/place-bid.ts:79-101`<br>`src/services/lots/settle-due-lots.ts:49-71` | OUTRO: dependências, transação, papéis ou serviços distintos; manter interfaces locais; C13. |
| D16 / `dup:dca46db6` | `src/routes/public/lots.ts:75-108`<br>`src/routes/public/receipts.ts:22-48` | ROTA: preservar serviços, autorização, status HTTP e schemas próprios; C13. |
| D17 / `dup:f0b5c29e` | `src/services/lots/list-auctioneer-lots.ts:37-63`<br>`src/services/lots/list-bidder-participations.ts:30-56` | DTO: somente campos idênticos candidatos; C06 opcional; contratos completos distintos. |
| D18 / `dup:7ccf47cf` | `src/db/schema.ts:249-264`<br>`src/db/schema.ts:273-288` | DECL: manter tabelas, FKs, checks e relações explícitos; C13. |
| D19 / `dup:92641baf` | `src/routes/public/lots.ts:63-82`<br>`src/routes/public/lots.ts:87-106`<br>`src/routes/public/receipts.ts:27-46` | ROTA: preservar serviços, autorização, status HTTP e schemas próprios; C13. |
| D20 / `dup:0615a02e` | `src/db/seed-lot-activity.ts:280-287`<br>`src/db/seed-lots.ts:136-143`<br>`src/models/wallet.ts:121-129` | SQL: parte seed sobrepõe D23 (C05); consulta de carteira distinta, manter. |
| D21 / `dup:cca793f1` | `src/db/schema.ts:271-285`<br>`src/db/schema.ts:299-311` | DECL: manter tabelas, FKs, checks e relações explícitos; C13. |
| D22 / `dup:25f9fef3` | `src/db/schema.ts:286-292`<br>`src/db/schema.ts:307-313`<br>`src/db/schema.ts:355-361` | DECL: manter tabelas, FKs, checks e relações explícitos; C13. |
| D23 / `dup:4a0b639e` | `src/db/seed-lot-activity.ts:278-290`<br>`src/db/seed-lots.ts:134-146` | SEED: extrair consulta comum, preservando mensagem User/Auctioneer; C05. |
| D24 / `dup:b8e3f416` | `src/db/schema.ts:83-95`<br>`src/db/schema.ts:104-115` | DECL: manter tabelas, FKs, checks e relações explícitos; C13. |
| D25 / `dup:bbab2291` | `src/services/yugioh-api/yugioh-api.ts:272-278`<br>`src/services/yugioh-api/yugioh-api.ts:284-291` | OUTRO: parâmetros de API diferentes; setParam já é compartilhado; manter; C13. |
| D26 / `dup:3731e93d` | `src/models/wallet.ts:116-125`<br>`src/models/wallet.ts:139-148`<br>`src/models/wallet.ts:226-235` | SQL: filtros, tabelas, locks, projeções ou transições distintos; manter; C13. |
| D27 / `dup:6c8a951d` | `src/services/lots/list-bidder-participations.ts:35-56`<br>`src/services/lots/list-public-lots.ts:22-43` | DTO: somente campos idênticos candidatos; C06 opcional; contratos completos distintos. |
| D28 / `dup:985ce607` | `src/db/schema.ts:512-547`<br>`src/db/schema.ts:554-572` | DECL: manter tabelas, FKs, checks e relações explícitos; C13. |
| D29 / `dup:0a10fc1e` | `src/services/lots/create-lot.ts:90-105`<br>`src/services/lots/list-auctioneer-lots.ts:73-88`<br>`src/services/lots/list-bidder-participations.ts:66-81` | OUTRO: dependências, transação, papéis ou serviços distintos; manter interfaces locais; C13. |
| D30 / `dup:0a8ef9ae` | `src/routes/private/lots.ts:122-133`<br>`src/routes/private/lots.ts:262-273`<br>`src/routes/private/wallet.ts:70-81` | ROTA: preservar serviços, autorização, status HTTP e schemas próprios; C13. |
| D31 / `dup:7111fbdc` | `src/schemas/cancel-lot.ts:15-25`<br>`src/schemas/place-bid.ts:25-35`<br>`src/schemas/wallet.ts:19-31` | SCHEMA: campos/literais distintos; preservar validação; C13. |
| D32 / `dup:a6d47e98` | `src/services/lots/cancel-lot.ts:59-80`<br>`src/services/wallet/deposit.ts:47-68` | OUTRO: dependências, transação, papéis ou serviços distintos; manter interfaces locais; C13. |
| D33 / `dup:2e238b09` | `src/services/lots/cancel-lot.ts:19-44`<br>`src/services/lots/show-auctioneer-lot.ts:20-46` | ERRO: manter classes, códigos e identidade instanceof; C13. |
| D34 / `dup:e04a541f` | `src/db/schema.ts:433-447`<br>`src/db/schema.ts:512-526` | DECL: manter tabelas, FKs, checks e relações explícitos; C13. |
| D35 / `dup:1f36f254` | `src/services/lots/place-bid.ts:45-68`<br>`src/services/lots/show-public-lot-audit.ts:26-50` | ERRO: manter classes, códigos e identidade instanceof; C13. |
| D36 / `dup:66b0ccb8` | `src/db/schema.ts:221-234`<br>`src/db/schema.ts:300-312` | DECL: manter tabelas, FKs, checks e relações explícitos; C13. |
| D37 / `dup:586ed265` | `src/models/wallet.ts:73-82`<br>`src/services/lots/lot-listing.ts:132-141` | SQL: filtros, tabelas, locks, projeções ou transições distintos; manter; C13. |
| D38 / `dup:91c6008a` | `src/db/seed-lots.ts:163-167`<br>`src/services/lots/create-lot.ts:145-149` | SQL: filtros, tabelas, locks, projeções ou transições distintos; manter; C13. |
| D39 / `dup:6fce1203` | `src/services/lots/list-auctioneer-lots.ts:69-89`<br>`src/services/lots/list-bidder-participations.ts:62-82` | OUTRO: dependências, transação, papéis ou serviços distintos; manter interfaces locais; C13. |
| D40 / `dup:da3317a3` | `src/models/wallet.ts:153-176`<br>`src/models/wallet.ts:267-287` | OUTRO: HOLD/RELEASE distintos; insertWalletMovement já compartilhado; manter; C13. |
| D41 / `dup:9a1e862c` | `src/db/schema.ts:118-130`<br>`src/db/schema.ts:339-353` | DECL: manter tabelas, FKs, checks e relações explícitos; C13. |
| D42 / `dup:f469d51e` | `src/db/schema.ts:284-292`<br>`src/db/schema.ts:353-361` | DECL: manter tabelas, FKs, checks e relações explícitos; C13. |
| D43 / `dup:fe6135f3` | `src/routes/private/lots.ts:182-205`<br>`src/routes/private/lots.ts:223-249` | ROTA: preservar serviços, autorização, status HTTP e schemas próprios; C13. |
| D44 / `dup:4a3c2eb1` | `src/services/lots/cancel-lot.ts:18-39`<br>`src/services/lots/place-bid.ts:42-63` | ERRO: manter classes, códigos e identidade instanceof; C13. |
| D45 / `dup:085951f7` | `src/routes/private/lots.ts:260-280`<br>`src/routes/private/wallet.ts:68-88` | ROTA: preservar serviços, autorização, status HTTP e schemas próprios; C13. |
| D46 / `dup:23cc3c51` | `src/services/lots/list-auctioneer-lots.ts:22-38`<br>`src/services/wallet/list-wallet-movements.ts:17-33` | ERRO: manter classes, códigos e identidade instanceof; C13. |
| D47 / `dup:5a4d0089` | `src/services/wallet/get-wallet.ts:25-41`<br>`src/services/wallet/list-wallet-movements.ts:32-51` | OUTRO: lookup comum, retorno e classe de erro próprios; manter até haver ganho concreto; C13. |
| D48 / `dup:a25e80e6` | `src/services/lots/show-auctioneer-lot.ts:62-78`<br>`src/services/lots/show-public-lot.ts:51-67` | DTO: somente campos idênticos candidatos; C06 opcional; contratos completos distintos. |
| D49 / `dup:e551700f` | `src/schemas/cancel-lot.ts:15-27`<br>`src/schemas/place-bid.ts:25-37` | SCHEMA: campos/literais distintos; preservar validação; C13. |
| D50 / `dup:ccd6c01d` | `src/services/lots/cancel-lot.ts:62-84`<br>`src/services/lots/place-bid.ts:100-120` | OUTRO: dependências, transação, papéis ou serviços distintos; manter interfaces locais; C13. |
| D51 / `dup:51af67d4` | `src/models/bid.ts:29-45`<br>`src/models/receipt.ts:8-24` | SQL: filtros, tabelas, locks, projeções ou transições distintos; manter; C13. |
| D52 / `dup:1e92d168` | `src/services/lots/lot-read.ts:98-107`<br>`src/services/lots/show-public-receipt.ts:83-92` | SQL: filtros, tabelas, locks, projeções ou transições distintos; manter; C13. |
| D53 / `dup:76140a94` | `src/services/lots/show-auctioneer-lot.ts:41-64`<br>`src/services/lots/show-public-lot.ts:28-51` | DTO: somente campos idênticos candidatos; C06 opcional; contratos completos distintos. |
| D54 / `dup:20c78cb2` | `src/db/seed-lot-activity.ts:295-298`<br>`src/services/lots/list-auctioneer-lots.ts:154-163` | SQL: filtros, tabelas, locks, projeções ou transições distintos; manter; C13. |
| D55 / `dup:0154715c` | `src/schemas/cancel-lot.ts:8-27`<br>`src/schemas/show-auctioneer-lot.ts:15-32` | SCHEMA: campos/literais distintos; preservar validação; C13. |
| D56 / `dup:3d5225ca` | `src/schemas/cancel-lot.ts:16-27`<br>`src/schemas/place-bid.ts:21-32` | SCHEMA: campos/literais distintos; preservar validação; C13. |
| D57 / `dup:16d433fb` | `src/db/seed-lot-activity.ts:295-298`<br>`src/services/lots/show-auctioneer-lot.ts:153-160` | SQL: filtros, tabelas, locks, projeções ou transições distintos; manter; C13. |
| D58 / `dup:28fc439b` | `src/schemas/cancel-lot.ts:10-20`<br>`src/schemas/wallet.ts:35-45` | SCHEMA: campos/literais distintos; preservar validação; C13. |
| D59 / `dup:fb489240` | `src/services/lots/lot-read.ts:65-73`<br>`src/services/lots/show-public-receipt.ts:86-94` | SQL: filtros, tabelas, locks, projeções ou transições distintos; manter; C13. |
| D60 / `dup:65752d48` | `src/schemas/ygo-pro-deck.ts:7-18`<br>`src/schemas/ygo-pro-deck.ts:22-33` | SCHEMA: campos/literais distintos; preservar validação; C13. |
| D61 / `dup:95d968f3` | `src/services/lots/cancel-lot.ts:58-73`<br>`src/services/lots/show-public-lot-audit.ts:64-79` | OUTRO: dependências, transação, papéis ou serviços distintos; manter interfaces locais; C13. |
| D62 / `dup:ee8d30e9` | `src/services/yugioh-api/yugioh-api.ts:260-265`<br>`src/services/yugioh-api/yugioh-api.ts:269-273` | OUTRO: parâmetros de API diferentes; setParam já é compartilhado; manter; C13. |
| D63 / `dup:bdfe9cd7` | `src/db/seed-lots.ts:150-159`<br>`src/services/lots/show-public-lot.ts:125-136` | SQL: filtros, tabelas, locks, projeções ou transições distintos; manter; C13. |
| D64 / `dup:080b170a` | `src/models/lot.ts:93-110`<br>`src/models/lot.ts:144-156` | SQL: filtros, tabelas, locks, projeções ou transições distintos; manter; C13. |
| D65 / `dup:0b1c96be` | `src/models/wallet.ts:139-148`<br>`src/models/wallet.ts:226-235` | SQL: filtros, tabelas, locks, projeções ou transições distintos; manter; C13. |
| D66 / `dup:a96a7f28` | `src/routes/private/lots.ts:230-256`<br>`src/routes/private/wallet.ts:75-98` | ROTA: preservar serviços, autorização, status HTTP e schemas próprios; C13. |
| D67 / `dup:e5f235df` | `src/db/schema.ts:194-208`<br>`src/db/schema.ts:318-329` | DECL: manter tabelas, FKs, checks e relações explícitos; C13. |
| D68 / `dup:0b44e54b` | `src/schemas/ygo-pro-deck.ts:61-66`<br>`src/schemas/ygo-pro-deck.ts:155-160` | SCHEMA: campos/literais distintos; preservar validação; C13. |
| D69 / `dup:7f280e43` | `src/db/schema.ts:426-437`<br>`src/db/schema.ts:512-523` | DECL: manter tabelas, FKs, checks e relações explícitos; C13. |
| D70 / `dup:9184cdd7` | `src/services/lots/public-lot-audit-fixtures.ts:156-165`<br>`src/services/lots/public-lot-audit-fixtures.ts:177-182` | OUTRO: cleanup de tabelas distintas; preservar ordem de FKs e mover fixture; C04. |
| D71 / `dup:f7f4adbe` | `src/models/wallet.ts:178-199`<br>`src/models/wallet.ts:276-297` | SQL: filtros, tabelas, locks, projeções ou transições distintos; manter; C13. |
| D72 / `dup:7715d8c0` | `src/schemas/show-lot-audit.ts:24-34`<br>`src/schemas/show-receipt.ts:21-31` | SCHEMA: campos/literais distintos; preservar validação; C13. |
| D73 / `dup:12b914a6` | `src/db/schema.ts:103-112`<br>`src/db/schema.ts:115-125` | DECL: manter tabelas, FKs, checks e relações explícitos; C13. |
| D74 / `dup:1d8f37a9` | `src/db/schema.ts:507-517`<br>`src/db/schema.ts:565-575` | DECL: manter tabelas, FKs, checks e relações explícitos; C13. |
| D75 / `dup:e447c94f` | `src/schemas/place-bid.ts:21-30`<br>`src/schemas/wallet.ts:31-40` | SCHEMA: campos/literais distintos; preservar validação; C13. |
| D76 / `dup:3e175d92` | `src/routes/private/lots.ts:151-168`<br>`src/routes/private/wallet.ts:73-90` | ROTA: preservar serviços, autorização, status HTTP e schemas próprios; C13. |
| D77 / `dup:c1b8b84c` | `src/schemas/place-bid.ts:31-42`<br>`src/schemas/wallet.ts:31-40` | SCHEMA: campos/literais distintos; preservar validação; C13. |
| D78 / `dup:f3e3c340` | `src/models/lot.ts:25-40`<br>`src/models/wallet.ts:125-140` | SQL: filtros, tabelas, locks, projeções ou transições distintos; manter; C13. |
| D79 / `dup:ad581236` | `src/schemas/show-lot-audit.ts:15-23`<br>`src/schemas/ygo-pro-deck.ts:18-26` | SCHEMA: campos/literais distintos; preservar validação; C13. |
| D80 / `dup:3d3a8670` | `src/services/lots/cancel-lot.ts:194-200`<br>`src/services/lots/create-lot.ts:241-247` | OUTRO: dependências, transação, papéis ou serviços distintos; manter interfaces locais; C13. |

## Apêndice L — Todas as unidades acima de 60 linhas

São **171 entradas**, das quais **161** estão em arquivos de teste ou `__tests__`. As **10** restantes incluem um helper de teste fora desses diretórios (L02), oito entradas de runtime/scripts e uma declaração de relações Drizzle (L01). Há funções aninhadas e callbacks describe sobrepostos: não somar linhas para estimar esforço. Os dez primeiros IDs abaixo representam as entradas fora de testes; L011 em diante conserva todas as demais.

| ID | Local / unidade | Linhas | Encaminhamento |
| --- | --- | --- | --- |
| L01 | `src/db/schema.ts:390` — `<arrow>` | 187 | Manter declaração Drizzle; C13. |
| L02 | `src/services/lots/public-lot-audit-fixtures.ts:36` — `createPublicLotAuditFixtures` | 164 | Mover helper de teste; C04. |
| L03 | `src/db/seed-lots.ts:36` — `seedLots` | 97 | C07 opcional. |
| L04 | `src/services/lots/place-bid.ts:104` — `placeBid` | 89 | C08 opcional. |
| L05 | `src/services/wallet/deposit.ts:54` — `deposit` | 70 | C09 opcional. |
| L06 | `src/db/seed-lot-activity.ts:136` — `retimeBids` | 69 | C07 opcional. |
| L07 | `src/routes/public/lot-live.ts:45` — `publicLotLiveRoutes` | 68 | C10 opcional. |
| L08 | `src/db/seed-users.ts:11` — `upsertSeedUser` | 65 | C07 opcional. |
| L09 | `src/services/lots/place-bid.ts:122` — `accepted` | 64 | C08 opcional; callback dentro de placeBid. |
| L10 | `src/services/lots/list-auctioneer-lots.ts:77` — `listAuctioneerLots` | 63 | C11 opcional. |
| L011 | `src/services/lots/settle-due-lots.test.ts:318` — `describe("settleDueLots")` | 1535 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L012 | `src/services/lots/place-bid.test.ts:304` — `describe("placeBid")` | 1157 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L013 | `src/services/lots/list-auctioneer-lots.test.ts:284` — `describe("listAuctioneerLots")` | 896 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L014 | `src/services/lots/list-bidder-participations.test.ts:295` — `describe("listBidderParticipations")` | 808 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L015 | `src/services/lots/show-auctioneer-lot.test.ts:311` — `describe("showAuctioneerLot")` | 803 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L016 | `src/services/lots/list-public-lots.test.ts:204` — `describe("listPublicLots")` | 787 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L017 | `src/services/lots/show-public-lot.test.ts:219` — `describe("showPublicLot")` | 628 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L018 | `src/routes/public/lot-live.test.ts:690` — `describe("public lot live room")` | 533 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L019 | `src/routes/private/wallet.test.ts:486` — `describe("GET /private/wallet/movements")` | 482 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L020 | `src/services/lots/show-public-lot-audit.test.ts:106` — `describe("showPublicLotAudit")` | 438 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L021 | `src/routes/private/wallet.test.ts:969` — `describe("POST /private/wallet/deposits")` | 410 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L022 | `src/routes/private/wallet.test.ts:507` — `describe("listing")` | 370 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L023 | `src/services/lots/settle-due-lots.test.ts:794` — `describe("when a bid races settlement")` | 332 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L024 | `src/services/lots/list-public-lots.test.ts:213` — `describe("effective status")` | 327 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L025 | `src/services/lots/list-public-lots.test.ts:585` — `describe("text search")` | 281 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L026 | `src/services/lots/list-auctioneer-lots.test.ts:904` — `describe("received amounts")` | 275 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L027 | `src/services/yugioh-api/save-unregistered-cards.test.ts:118` — `describe("saveUnregisteredCards")` | 265 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L028 | `src/routes/private/place-bid.test.ts:204` — `describe("POST /private/lots/:id/bids")` | 260 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L029 | `src/services/lots/list-auctioneer-lots.test.ts:311` — `describe("effective status")` | 254 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L030 | `src/app.auth.test.ts:164` — `describe("API authentication")` | 249 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L031 | `src/routes/private/wallet.test.ts:990` — `describe("crediting the caller")` | 242 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L032 | `src/services/yugioh-api/yugioh-api.test.ts:92` — `describe("YGOProDeckApiClient")` | 229 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L033 | `src/app.auth.test.ts:175` — `describe("GET /private/user")` | 228 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L034 | `src/services/lots/list-auctioneer-lots.test.ts:651` — `describe("text search")` | 213 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L035 | `src/services/lots/show-public-lot-audit.integrity.test.ts:89` — `describe("showPublicLotAudit chain integrity")` | 207 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L036 | `src/routes/public/lots.test.ts:478` — `describe("GET /public/lots/:id")` | 205 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L037 | `src/services/lots/list-bidder-participations.test.ts:722` — `describe("shareToken")` | 205 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L038 | `src/routes/private/lots.test.ts:200` — `describe("POST /private/lots")` | 195 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L039 | `src/services/lots/place-bid.test.ts:1205` — `describe("when two bids arrive at the same time")` | 195 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L040 | `src/services/lots/list-bidder-participations.test.ts:489` — `describe("won")` | 189 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L041 | `src/routes/private/lots.test.ts:524` — `describe("POST /private/lots/:id/cancel")` | 187 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L042 | `src/services/lots/list-bidder-participations.test.ts:304` — `describe("accepted bids")` | 184 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L043 | `src/routes/private/participations.test.ts:299` — `describe("GET /private/participations")` | 181 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L044 | `src/services/yugioh-api/yugioh-api.test.ts:93` — `describe("searchCards")` | 171 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L045 | `src/db/seed-lot-plan.test.ts:24` — `describe("planSeedLots")` | 167 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L046 | `src/routes/private/lots.test.ts:712` — `describe("GET /private/lots/:id")` | 164 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L047 | `src/routes/public/lot-live.test.ts:249` — `openLiveWire` | 164 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L048 | `src/routes/public/lot-audit.test.ts:73` — `describe("GET /public/lots/:id/audit")` | 162 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L049 | `src/services/lots/show-auctioneer-lot.test.ts:792` — `describe("when the lot has no settlement credit")` | 159 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L050 | `src/app.auth.test.ts:176` — `describe("requests without a valid session")` | 157 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L051 | `src/services/lots/list-bidder-participations.test.ts:928` — `describe("ordering")` | 154 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L052 | `src/db/seed-lots.test.ts:132` — `describe("seedLots orchestration")` | 153 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L053 | `src/services/lots/list-bidder-participations.test.ts:929` — `it("orders live, scheduled, ended, and cance...")` | 152 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L054 | `src/services/lots/place-bid.test.ts:374` — `describe("when the lot is outside the live window")` | 146 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L055 | `src/services/lots/show-auctioneer-lot.test.ts:494` — `describe("when the lot is live")` | 145 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L056 | `src/services/lots/show-public-receipt.test.ts:66` — `insertSettledReceipt` | 138 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L057 | `src/services/lots/list-auctioneer-lots.test.ts:427` — `it("lists live lots, then scheduled lots, th...")` | 137 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L058 | `src/services/lots/place-bid.test.ts:757` — `describe("when the lot already has a leader")` | 137 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L059 | `src/services/lots/place-bid.test.ts:622` — `describe("when an accepted bid lands in the final...")` | 134 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L060 | `src/bootstrap.test.ts:53` — `describe("application bootstrap")` | 133 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L061 | `src/db/seed-lots.test.ts:286` — `describe("seedLots catalog pagination")` | 131 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L062 | `src/routes/public/receipts.test.ts:235` — `describe("GET /public/receipts/:shareToken")` | 131 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L063 | `src/services/lots/settle-due-lots.test.ts:1587` — `describe("when a financial write fails")` | 129 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L064 | `src/routes/private/lots.test.ts:396` — `describe("GET /private/lots")` | 127 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L065 | `src/routes/public/receipts.test.ts:79` — `insertSettledReceipt` | 127 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L066 | `src/services/lots/settle-due-lots.test.ts:1462` — `describe("when the winner reserve cannot be settle...")` | 124 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L067 | `src/services/lots/list-public-lots.test.ts:867` — `describe("public fields")` | 123 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L068 | `src/services/lots/settle-due-lots.test.ts:1127` — `describe("when cancellation races settlement")` | 121 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L069 | `src/services/lots/show-public-receipt.test.ts:233` — `describe("showPublicReceipt")` | 115 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L070 | `src/routes/public/lot-live.test.ts:1063` — `describe("when the lot is settled")` | 113 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L071 | `src/routes/private/wallet.test.ts:373` — `describe("GET /private/wallet")` | 112 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L072 | `src/services/lots/list-bidder-participations.test.ts:776` — `it("returns a null share token for a live, l...")` | 112 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L073 | `src/db/seed-users.test.ts:68` — `describe("upsertSeedUser")` | 111 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L074 | `src/db/seed-ledger.test.ts:119` — `describe("seed financial ledger")` | 109 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L075 | `src/db/seed-lot-activity.test.ts:239` — `describe("seed activity bid retiming")` | 108 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L076 | `src/routes/public/lots.test.ts:369` — `describe("GET /public/lots")` | 108 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L077 | `src/services/lots/settle-due-lots.test.ts:327` — `describe("when the lot has a winning bid")` | 107 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L078 | `src/services/lots/show-public-lot.test.ts:228` — `describe("when the lot is scheduled")` | 105 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L079 | `src/schemas/list-lots.test.ts:11` — `describe("listPublicLotsResponseSchema")` | 104 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L080 | `src/schemas/show-auctioneer-lot.test.ts:7` — `describe("showAuctioneerLotResponseSchema")` | 104 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L081 | `src/schemas/show-lot.test.ts:7` — `describe("showPublicLotResponseSchema")` | 103 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L082 | `src/services/lots/show-public-lot.test.ts:229` — `it("returns the frozen card snapshot and an...")` | 103 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L083 | `src/schemas/show-auctioneer-lot.test.ts:8` — `it("drops personal and internal fields")` | 102 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L084 | `src/services/lots/list-public-lots.test.ts:374` — `it("lists live lots, then scheduled lots, th...")` | 102 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L085 | `src/schemas/show-lot.test.ts:8` — `it("drops personal and internal fields")` | 101 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L086 | `src/routes/private/wallet.test.ts:739` — `it("returns every movement type with its lot...")` | 100 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L087 | `src/services/lots/place-bid.test.ts:521` — `describe("when the lot is live and has no bids")` | 100 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L088 | `src/services/lots/show-auctioneer-lot.test.ts:372` — `describe("when the lot is scheduled")` | 96 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L089 | `src/services/lots/show-public-lot.test.ts:358` — `describe("when the lot is live")` | 96 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L090 | `src/services/lots/show-auctioneer-lot.test.ts:952` — `describe("when the lot is canceled after its end")` | 95 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L091 | `src/routes/public/receipts.test.ts:244` — `it("returns the receipt without a session")` | 94 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L092 | `src/services/lots/show-auctioneer-lot.test.ts:373` — `it("returns the frozen card snapshot and an...")` | 94 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L093 | `src/db/deck-fixtures.test.ts:15` — `describe("loadDeckFixtures")` | 93 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L094 | `src/services/lots/list-auctioneer-lots.test.ts:951` — `it("returns the settlement credit on the sol...")` | 93 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L095 | `src/routes/private/lots.test.ts:784` — `it("returns the auctioneer's lot without per...")` | 91 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L096 | `src/services/lots/place-bid.test.ts:1044` — `describe("when accepting the bid fails inside the...")` | 90 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L097 | `src/services/lots/place-bid.test.ts:1206` — `it("keeps a single valid bid order on the sa...")` | 90 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L098 | `src/db/seed-lot-activity.test.ts:136` — `describe("seed activity settlement")` | 89 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L099 | `src/services/lots/show-auctioneer-lot.test.ts:133` — `attachBids` | 89 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L100 | `src/services/lots/show-public-lot-audit.test.ts:295` — `describe("when an inserted bid hash was not produc...")` | 89 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L101 | `src/services/lots/list-public-lots.test.ts:868` — `it("returns the current bid and whether the...")` | 87 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L102 | `src/services/lots/place-bid.test.ts:926` — `describe("when the bidder leads another lot")` | 87 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L103 | `src/services/lots/show-public-lot-audit.test.ts:296` — `it("reports tampered")` | 87 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L104 | `src/routes/public/lots.test.ts:229` — `insertCanceledLot` | 86 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L105 | `src/services/lots/settle-due-lots.test.ts:1249` — `describe("when a later bid wins")` | 86 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L106 | `src/routes/public/lot-live.test.ts:724` — `describe("when a client connects")` | 85 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L107 | `src/routes/public/__tests__/lot-live-frames.test.ts:15` — `describe("live wire frame decoding")` | 84 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L108 | `src/services/lots/list-auctioneer-lots.test.ts:566` — `describe("canceled lots")` | 84 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L109 | `src/services/lots/settle-due-lots.test.ts:1128` — `it("keeps a single valid outcome and does no...")` | 84 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L110 | `src/services/lots/settle-due-lots.test.ts:1250` — `it("debits only the winner and records that...")` | 84 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L111 | `src/routes/private/lots.test.ts:439` — `it("returns the auctioneer's lot without per...")` | 83 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L112 | `src/routes/private/participations.test.ts:329` — `it("returns only the authenticated bidder's...")` | 83 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L113 | `src/routes/public/lots.test.ts:483` — `it("returns the lot without a session")` | 83 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L114 | `src/services/lots/list-auctioneer-lots.test.ts:1045` — `it("leaves an ended lot without a winner and...")` | 83 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L115 | `src/services/lots/settle-due-lots.test.ts:328` — `it("debits the winner, credits the auctionee...")` | 83 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L116 | `src/schemas/list-bidder-participations.test.ts:7` — `describe("listBidderParticipationsResponseSchema")` | 81 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L117 | `src/services/lots/settle-due-lots.test.ts:943` — `expectBidToWinRace` | 81 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L118 | `src/services/lots/settle-due-lots.test.ts:1772` — `describe("when winner validation fails")` | 80 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L119 | `src/services/lots/show-public-receipt.test.ts:242` — `describe("when the share token matches a receipt")` | 80 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L120 | `src/schemas/list-bidder-participations.test.ts:8` — `it("drops email, name, winnerId, and hash wh...")` | 79 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L121 | `src/routes/public/lot-live.test.ts:150` — `connectLive` | 78 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L122 | `src/routes/public/lot-live.test.ts:843` — `describe("when a bid is accepted")` | 78 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L123 | `src/services/lots/show-public-receipt.test.ts:243` — `it("returns the frozen card snapshot and omi...")` | 78 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L124 | `src/services/lots/settle-due-lots.test.ts:865` — `expectSettlementToWinRace` | 77 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L125 | `src/services/lots/settle-due-lots.test.ts:1637` — `<arrow>` | 77 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L126 | `src/services/lots/show-auctioneer-lot.test.ts:495` — `it("returns accepted bids in sequence order")` | 77 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L127 | `src/services/lots/show-public-lot.test.ts:681` — `describe("when a bid commits during the read")` | 77 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L128 | `src/services/lots/list-bidder-participations.test.ts:305` — `it("returns the lot after this bidder has an...")` | 76 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L129 | `src/routes/private/wallet.test.ts:394` — `describe("balances")` | 75 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L130 | `src/routes/private/wallet.test.ts:522` — `it("returns the newest movements first and k...")` | 75 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L131 | `src/routes/private/wallet.test.ts:878` — `describe("query validation")` | 75 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L132 | `src/services/lots/show-public-lot.test.ts:116` — `attachBids` | 75 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L133 | `src/services/lots/show-public-lot.test.ts:682` — `it("returns the current bid and the history...")` | 75 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L134 | `src/routes/public/lot-live.test.ts:988` — `describe("when the lot is canceled")` | 74 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L135 | `src/routes/public/lots.test.ts:374` — `it("returns a matching lot without a session")` | 74 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L136 | `src/schemas/list-lots.test.ts:116` — `describe("listAuctioneerLotsResponseSchema")` | 74 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L137 | `src/routes/private/place-bid.test.ts:283` — `it("returns the bid without the bidder email...")` | 73 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L138 | `src/schemas/list-lots.test.ts:117` — `it("drops personal and internal fields")` | 72 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L139 | `src/services/lots/list-bidder-participations.test.ts:86` — `insertLot` | 72 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L140 | `src/services/lots/settle-due-lots.test.ts:1463` — `it("does not debit a winner whose winning ho...")` | 72 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L141 | `src/db/fresh.test.ts:52` — `describe("db:fresh")` | 70 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L142 | `src/services/lots/list-public-lots.test.ts:745` — `it("treats like wildcards in the search as l...")` | 70 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L143 | `src/services/lots/show-auctioneer-lot.test.ts:721` — `describe("when the lot is settled")` | 70 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L144 | `src/lib/auth.wallet.test.ts:147` — `describe("sign-up")` | 69 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L145 | `src/services/lots/settle-due-lots.test.ts:606` — `describe("when the lot is still open")` | 69 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L146 | `src/services/lots/settle-due-lots.test.ts:676` — `describe("when the winner leads another lot")` | 68 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L147 | `src/services/lots/settle-due-lots.test.ts:1393` — `describe("when one due lot cannot settle")` | 68 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L148 | `src/services/lots/show-auctioneer-lot.test.ts:722` — `it("returns the winner participant number an...")` | 68 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L149 | `src/services/lots/show-public-lot.test.ts:359` — `it("returns the current bid and the leader p...")` | 68 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L150 | `src/routes/private/lots.test.ts:238` — `it("creates the lot and its items for an auc...")` | 67 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L151 | `src/services/lots/show-auctioneer-lot.test.ts:979` — `it("keeps the accepted history and reports n...")` | 67 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L152 | `src/services/yugioh-api/save-card-image.test.ts:44` — `describe("saveCardImage")` | 67 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L153 | `src/routes/private/participations.test.ts:228` — `cleanup` | 66 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L154 | `src/routes/private/participations.test.ts:413` — `it("omits email, name, and user id from the...")` | 66 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L155 | `src/schemas/list-lots.test.ts:12` — `it("drops personal and internal fields")` | 66 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L156 | `src/services/lots/settle-due-lots.test.ts:677` — `it("keeps the reserve of the other lot")` | 66 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L157 | `src/services/lots/settle-due-lots.test.ts:1394` — `it("keeps the settled sibling and leaves the...")` | 66 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L158 | `src/routes/private/wallet.test.ts:1293` — `describe("amount validation")` | 65 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L159 | `src/schemas/show-receipt.test.ts:29` — `describe("showPublicReceiptResponseSchema")` | 65 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L160 | `src/services/lots/list-bidder-participations.test.ts:159` — `insertAcceptedBid` | 65 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L161 | `src/services/lots/show-auctioneer-lot.test.ts:573` — `it("follows the latest bid when one particip...")` | 65 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L162 | `src/services/lots/show-auctioneer-lot.test.ts:1048` — `describe("when the credited amount has fewer than...")` | 65 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L163 | `src/routes/public/lot-audit.test.ts:82` — `describe("when the lot chain is intact")` | 63 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L164 | `src/routes/public/lot-live.test.ts:1064` — `it("tells the room the winner participant nu...")` | 63 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L165 | `src/schemas/show-lot-audit.test.ts:22` — `describe("showPublicLotAuditResponseSchema")` | 63 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L166 | `src/schemas/show-receipt.test.ts:30` — `it("drops winner id, winning bid id, share t...")` | 63 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L167 | `src/services/lots/settle-due-lots.test.ts:435` — `describe("when the lot has no bids")` | 63 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L168 | `src/services/yugioh-api/yugioh-api.test.ts:94` — `it("builds the query string from lists and n...")` | 63 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L169 | `src/services/lots/show-public-lot.test.ts:566` — `describe("when the lot is canceled")` | 62 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L170 | `src/routes/public/lot-audit.test.ts:83` — `it("returns only the public audit keys witho...")` | 61 | C12 opcional; avaliar cenário/describe antes de dividir. |
| L171 | `src/schemas/show-lot-audit.test.ts:23` — `it("drops personal data and hash material")` | 61 | C12 opcional; avaliar cenário/describe antes de dividir. |

## Apêndice O — Todos os hotspots

Pontuação de prioridade do Fallow, não percentual de defeito nem probabilidade. Fan-in/out e churn ajudam a ordenar revisão; não bastam para autorizar uma extração. Todos têm bus factor 1 no histórico observado. Entradas sem outro achado ficam em acompanhamento, sem commit de refatoração obrigatório.

| ID | Arquivo | Score | Commits na janela | Encaminhamento |
| --- | --- | --- | --- | --- |
| O01 | `src/schemas/money.ts` | 64.8 | 5 | Acompanhar em mudanças reais; C13 registra a triagem. |
| O02 | `src/lib/auth.ts` | 61.5 | 7 | Revisar auth/locks/atomicidade nas mudanças; sem extração só por score; C13. |
| O03 | `src/models/wallet.ts` | 47.6 | 7 | Revisar auth/locks/atomicidade nas mudanças; sem extração só por score; C13. |
| O04 | `src/services/yugioh-api/save-unregistered-cards.ts` | 42.8 | 3 | Acompanhar em mudanças reais; C13 registra a triagem. |
| O05 | `src/db/seed-lots.ts` | 41.1 | 4 | C05 localizado; C07 opcional. |
| O06 | `src/routes/private/lots.test.ts` | 40.7 | 6 | C12 opcional; manter testes significativos. |
| O07 | `src/services/lots/show-public-lot-audit.ts` | 38.3 | 4 | Acompanhar em mudanças reais; C13 registra a triagem. |
| O08 | `src/services/yugioh-api/save-card-image.ts` | 37.1 | 3 | S01 mitigado; manter controles; C13. |
| O09 | `src/routes/public/lot-live.test.ts` | 35.6 | 4 | C12 opcional; manter testes significativos. |
| O10 | `src/services/yugioh-api/yugioh-api.ts` | 34.7 | 3 | Acompanhar em mudanças reais; C13 registra a triagem. |
| O11 | `src/services/lots/effective-lot-status.ts` | 32.7 | 3 | Acompanhar em mudanças reais; C13 registra a triagem. |
| O12 | `src/models/lot.ts` | 32.6 | 4 | Revisar auth/locks/atomicidade nas mudanças; sem extração só por score; C13. |
| O13 | `src/app.auth.test.ts` | 32.3 | 4 | C12 opcional; manter testes significativos. |
| O14 | `src/db/seed-lot-activity.ts` | 30.8 | 3 | C05 localizado; C07 opcional. |
| O15 | `src/schemas/create-lot.ts` | 28.6 | 3 | Acompanhar em mudanças reais; C13 registra a triagem. |
| O16 | `src/routes/private/wallet.test.ts` | 27.2 | 4 | C12 opcional; manter testes significativos. |
| O17 | `src/models/lot-participant.ts` | 26.6 | 3 | Revisar auth/locks/atomicidade nas mudanças; sem extração só por score; C13. |
| O18 | `src/db/seed-lot-plan.ts` | 24.6 | 3 | Acompanhar em mudanças reais; C13 registra a triagem. |
| O19 | `src/services/lots/create-lot.ts` | 24.6 | 3 | Acompanhar em mudanças reais; C13 registra a triagem. |
| O20 | `src/db/seed.ts` | 24.5 | 6 | Acompanhar em mudanças reais; C13 registra a triagem. |
| O21 | `src/services/yugioh-api/yugioh-api.test.ts` | 24.4 | 3 | C12 opcional; manter testes significativos. |
| O22 | `src/routes/private/lots.ts` | 23.8 | 5 | Acompanhar em mudanças reais; C13 registra a triagem. |
| O23 | `src/services/lots/place-bid.ts` | 22.6 | 3 | C08 opcional; priorizar revisão financeira. |
| O24 | `src/services/lots/settle-due-lots.ts` | 22.6 | 3 | Revisar auth/locks/atomicidade nas mudanças; sem extração só por score; C13. |
| O25 | `src/services/lots/cancel-lot.ts` | 22.5 | 3 | Revisar auth/locks/atomicidade nas mudanças; sem extração só por score; C13. |
| O26 | `src/services/lots/list-public-lots.ts` | 21.8 | 4 | C06 opcional apenas em DTOs idênticos. |
| O27 | `src/services/lots/settle-due-lots.test.ts` | 20.6 | 3 | C12 opcional; manter testes significativos. |
| O28 | `src/app.ts` | 20.3 | 6 | Acompanhar em mudanças reais; C13 registra a triagem. |
| O29 | `src/routes/public/index.ts` | 19.0 | 4 | Acompanhar em mudanças reais; C13 registra a triagem. |
| O30 | `src/services/lots/place-bid.test.ts` | 18.5 | 3 | C12 opcional; manter testes significativos. |
| O31 | `src/routes/public/lot-audit.test.ts` | 18.5 | 3 | C12 opcional; manter testes significativos. |
| O32 | `src/services/lots/list-bidder-participations.ts` | 18.4 | 3 | C06 opcional apenas em DTOs idênticos. |
| O33 | `src/schemas/list-lots.ts` | 17.0 | 5 | Acompanhar em mudanças reais; C13 registra a triagem. |
| O34 | `src/services/lots/show-public-receipt.ts` | 16.4 | 3 | C06 opcional apenas em DTOs idênticos. |
| O35 | `src/services/yugioh-api/save-unregistered-cards.test.ts` | 16.4 | 3 | C12 opcional; manter testes significativos. |
| O36 | `src/services/lots/create-lot.test.ts` | 16.4 | 3 | C12 opcional; manter testes significativos. |
| O37 | `src/routes/public/lots.test.ts` | 16.3 | 3 | C12 opcional; manter testes significativos. |
| O38 | `src/db/schema.ts` | 16.2 | 4 | Manter relações explícitas; C13. |
| O39 | `src/services/lots/show-auctioneer-lot.ts` | 14.4 | 3 | C06 opcional apenas em DTOs idênticos. |
| O40 | `src/services/lots/list-bidder-participations.test.ts` | 12.3 | 3 | C12 opcional; manter testes significativos. |
| O41 | `src/routes/public/lots.ts` | 12.2 | 3 | Acompanhar em mudanças reais; C13 registra a triagem. |
| O42 | `src/schemas/list-lots.test.ts` | 6.1 | 3 | C12 opcional; manter testes significativos. |
| O43 | `src/schemas/ygo-pro-deck.ts` | 4.1 | 6 | Acompanhar em mudanças reais; C13 registra a triagem. |

## Critério de encerramento do levantamento

Todos os findings emitidos nas rodadas listadas receberam localização, evidência, decisão e encaminhamento: 2 findings atuais de saúde, 1 aviso type-aware, 8 achados exclusivos de produção, 6 candidatos de segurança, 1 gap estático, os 80 grupos semânticos e os inventários consultivos de tamanho/hotspots. H03 está registrado como efeito da cobertura antiga. A ausência de findings nas demais categorias se limita ao escopo/configuração descritos. Não foram aplicadas correções, supressões, mudanças de configuração ou commits nesta auditoria.

Opcional para acompanhar a execução futura do backlog: habilitar o histórico local Fallow Impact. A consulta `impact status --format json --quiet --explain` retornou `enabled: false` e `explicit_decision: false`; a oferta fica registrada aqui, sem ativação. Impact é separado de telemetria, que também não foi habilitada nesta auditoria.
