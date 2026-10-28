# Escopo e reprodução das análises Fallow

Decisões do C03 da [auditoria de 28/10/2026](fallow-audit-2026-10-28.md).
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

`npm run test:coverage` produz `coverage/coverage-final.json` (Istanbul), LCOV e
resumo de texto pelo provider V8. Inclui todos os `src/**/*.ts`, inclusive os
arquivos de produção não executados; exclui testes, helpers `__tests__` e setup.
`coverage/` já é ignorado pelo Git. Não foram definidos limiares novos.

Para reproduzir a suíte completa, executar a partir da raiz, em um shell
separado, com Docker disponível:

```sh
set -eu
container=$(docker run --detach --rm \
  --publish 127.0.0.1::5432 \
  --env POSTGRES_USER=c03_test --env POSTGRES_PASSWORD=c03_test \
  --env POSTGRES_DB=change_of_bid_c03_test \
  --tmpfs /var/lib/postgresql/data postgres:17)
trap 'docker stop "$container" >/dev/null' EXIT
port=$(docker port "$container" 5432/tcp)
port=${port##*:}
export DATABASE_URL="postgresql://c03_test:c03_test@127.0.0.1:$port/change_of_bid_c03_test"
export BETTER_AUTH_SECRET=c03-test-auth-secret-with-at-least-32-characters
export BID_HASH_SECRET=c03-test-bid-hash-secret-at-least-32-characters
export BETTER_AUTH_URL=http://localhost:3000
export PAGE_ORIGIN=http://localhost:5173
attempt=0
until docker exec "$container" pg_isready -U c03_test -d change_of_bid_c03_test; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || exit 1
  sleep 1
done
npm run db:migrate
npm run test:coverage
node_modules/.bin/fallow health --complexity --file-scores --score \
  --coverage coverage/coverage-final.json --report-only \
  --format json --quiet --explain > coverage/fallow-health.json
```

Os valores acima são exclusivos do banco descartável. A URL exportada prevalece
sobre `.env`; não se usa `db:fresh` nem se acessa o PostgreSQL de desenvolvimento.
O shell remove a instância e os dados em memória ao sair.

Resultado medido em 28/10/2026: **36 arquivos, 468 testes aprovados**, linhas
**77,29%**, branches **72,55%**, funções **78,84%**, statements **77,18%**.
Fallow importou **68/68 arquivos** do mapa, associando **395/1.592 funções**
do seu universo estático. São denominadores diferentes: o Fallow também
conta callbacks de teste e helpers excluídos da instrumentação.

A saída informa `coverage_model: istanbul` e
`coverage_source_consistency: mixed`. Funções sem correspondência continuam
com estimativas; conferir `coverage_source` em cada finding. Por exemplo,
`settleLockedLot` executou 21 vezes e H03 deixou de aparecer como CRAP alto;
H01/H02 continuam excedendo complexidade. Os três scripts de seed não
executados têm CRAP medido de 72/56/42. C10–C12 continuam pertinentes.

O comando acima é consultivo (`--report-only`). Sem essa opção, a medição
terminou com código **1**, por **10 findings existentes**, incluindo estimativas
em testes/helpers. Não habilitar um gate de cobertura sobre esse conjunto
misto sem definir seu universo. Não foram elevados limiares nem alteradas
severidades de complexidade. `health.coverage` não foi fixado na configuração:
o relatório deve ser gerado para o código atual e fornecido explicitamente
com `--coverage`, evitando reutilização silenciosa de um arquivo antigo.

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
