# Validação de integridade dos lances por HMAC

Este projeto usa **HMAC-SHA256 encadeado** para verificar o conteúdo e a ordem dos lances aceitos. Cada lance autentica seus dados e o hash do lance anterior. O lote mantém a quantidade esperada de lances (`bid_count`) e o hash do último (`head_hash`), usados para conferir a completude do histórico.

A chave, `BID_HASH_SECRET`, fica no back-end, fora do banco. Isso dificulta que alguém com acesso somente ao banco fabrique conteúdo novo com um HMAC válido. A auditoria é pública, mas a verificação criptográfica é executada pelo servidor.

**Limite central:** a âncora também está no banco. Se um atacante puder alterar o histórico e a âncora juntos, poderá restaurar um prefixo válido sem conhecer a chave. Portanto, a implementação detecta os cenários descritos abaixo, mas não oferece prova independente de que o histórico nunca foi truncado ou restaurado.

## 1. Requisitos que orientam a solução

Os [Requisitos do projeto](https://app.notion.com/p/Requisitos-do-projeto-40433102e159806bb6fcdc2d3dffcd0e) definem o comportamento esperado. O [Banco de dados V2](https://app.notion.com/p/Banco-de-dados-V2-40433102e15980a69d9af2a3e7b19dba), na seção de integridade, escolhe explicitamente HMAC-SHA256 encadeado, gênese por lote, serialização canônica e âncora no lote.

| Requisito | Relação com o HMAC e a auditoria |
| --- | --- |
| RF-14 — Auditoria pública | Consulta sem login ao histórico completo e ao resultado da verificação, inclusive em lote cancelado. |
| RN-12 — Integridade do histórico | Verificar conteúdo, ordem e completude; exercitar alteração, remoção e inserção diretamente no banco. |
| RN-11 e RNF-03 — Privacidade e segurança | Usar identificadores por lote e manter a chave no servidor; omitir dados pessoais nas respostas públicas. |
| RNF-02 e RN-10 — Atomicidade e concorrência | Persistir lance, reserva e atualização da âncora em uma transação, com ordem consistente entre operações concorrentes. |
| RNF-04 — Dinheiro e tempo | Normalizar valores monetários e datas para que geração e verificação processem a mesma representação. |
| RNF-06 — Testes | Demonstrar os casos de integridade e a ausência de dados privados nas respostas. |

No [Tracking dos requisitos](https://app.notion.com/p/Tracking-dos-requisitos-40633102e159805aae31c14a4afd181b), RF-14, RN-11 e RN-12 estão marcados como feitos no back-end. O tracking do front-end registra RF-14 como feito e RN-12 como parcial porque a verificação ocorre no servidor. Isso confirma a divisão de responsabilidades, mas não amplia as garantias criptográficas do código. RNF-03, RNF-04 e RNF-06 possuem pendências mais amplas no tracking; este documento não declara esses requisitos integralmente concluídos.

## 2. O que é HMAC e o que significa validar

HMAC (*Hash-based Message Authentication Code*) combina uma chave secreta com uma função hash para produzir um código de autenticação. Quem verifica recalcula o código com a mesma chave e compara o resultado. Uma mudança nos dados autenticados invalida a comparação, salvo se também for produzido um código válido para os novos dados. A construção é descrita na [RFC 2104](https://www.rfc-editor.org/rfc/rfc2104.txt); a combinação com SHA-256 é abordada na [RFC 6234](https://www.rfc-editor.org/rfc/rfc6234.txt).

No projeto, os campos chamados `hash` e `previous_hash` armazenam códigos HMAC em hexadecimal. HMAC não criptografa o lance: valor, horário e número do participante continuam consultáveis. Também não constitui assinatura digital individual do licitante, pois a chave pertence ao servidor.

A validação de integridade é diferente da validação de negócio. Papel do usuário, saldo disponível, valor mínimo, impedimento do líder e janela temporal são conferidos antes da aceitação do lance em [place-bid.ts](../src/services/lots/place-bid.ts). O HMAC registra a integridade dos dados aceitos; ele não substitui essas regras nem a autenticação do usuário.

## 3. Como a cadeia é construída

### 3.1 Chave e implementação

[bid-hash.ts](../src/services/lots/bid-hash.ts) usa a implementação nativa do Node.js:

```ts
createHmac("sha256", secret).update(payload).digest("hex");
```

O resultado completo tem 256 bits, representados por 64 caracteres hexadecimais, sem truncamento. Não há biblioteca criptográfica adicional nem implementação manual da construção HMAC. Veja a [documentação de](https://nodejs.org/docs/latest-v22.x/api/crypto.html#cryptocreatehmacalgorithm-key-options) `crypto.createHmac` [no Node.js 22](https://nodejs.org/docs/latest-v22.x/api/crypto.html#cryptocreatehmacalgorithm-key-options).

### 3.2 Gênese por lote

Antes do primeiro lance, calcula-se:

```text
G = HMAC-SHA256(K, "genesis|" + lotId)
```

`K` é `BID_HASH_SECRET`. O primeiro lance usa `previous_hash = G`. A gênese é determinística para a mesma chave e o mesmo lote; não é uma constante compartilhada por todos os lotes.

### 3.3 Dados autenticados e serialização

Para cada lance, a mensagem segue exatamente esta ordem, com separador literal `|`:

```text
previousHash|lotId|sequence|participantNo|amount|createdAt
```

| Campo | Representação usada no HMAC |
| --- | --- |
| `previousHash` | Gênese no primeiro lance; HMAC do lance anterior nos seguintes. |
| `lotId` | Identificador do lote, vinculando a cadeia àquele leilão. |
| `sequence` | Inteiro convertido em string, iniciando em 1. |
| `participantNo` | Número do participante naquele lote, convertido em string. |
| `amount` | String decimal positiva com ponto e duas casas, como `10.50`. |
| `createdAt` | ISO 8601 em UTC com milissegundos, como `2026-10-26T15:00:00.000Z`. |

A mensagem é processada em UTF-8 pelos métodos usados. Esses campos têm formatos restritos que não incluem `|`; acrescentar texto livre exigiria rever a serialização para evitar ambiguidades.

[money.ts](../src/schemas/money.ts) normaliza, por exemplo, `10`, `10.0` e `10.00` para `10.00`. O valor deve ser maior que zero e não ultrapassar BRL 1.000.000,00. A auditoria repete essa normalização, portanto autentica a representação canônica do valor, não variações textuais equivalentes.

`canonicalBidTimestamp` usa `Date.toISOString()` e exige ano de quatro dígitos, UTC e três dígitos de milissegundos. Na aceitação, o instante é definido pela aplicação e enviado explicitamente ao banco; depois da inserção, o serviço confere se o instante persistido coincide com o autenticado. Uma divergência desfaz a transação.

### 3.4 Encadeamento e âncora

```text
G  = HMAC(K, "genesis|" + lotId)
H1 = HMAC(K, G  + "|" + lotId + "|1|1|10.00|2026-10-26T15:00:00.000Z")
H2 = HMAC(K, H1 + "|" + lotId + "|2|2|10.50|2026-10-26T15:01:00.000Z")

Lance 1: previous_hash = G,  hash = H1
Lance 2: previous_hash = H1, hash = H2
Lote:    bid_count = 2,     head_hash = H2
```

As expressões são ilustrativas: `G`, `H1` e `H2` representam os códigos calculados. No banco, são strings hexadecimais.

O encadeamento liga cada registro ao anterior. A âncora informa onde a cadeia deveria terminar: conferir apenas os links restantes não denunciaria a exclusão do último lance, pois nenhum sucessor o referencia.

## 4. Persistência de um lance aceito

O fluxo em [place-bid.ts](../src/services/lots/place-bid.ts) e [lot.ts](../src/models/lot.ts) é:

1. Validar papel e valor; abrir a transação e travar o lote com `SELECT ... FOR UPDATE`.
2. Conferir estado, horário, líder e valor mínimo. Havendo líder, verificar se seu lance corresponde a `bid_count` e `head_hash`.
3. Travar as carteiras em ordem estável e conferir o saldo disponível.
4. Obter ou criar o participante do lote, definir `sequence = bid_count + 1`, calcular o HMAC e inserir o lance com seu horário canônico.
5. Gravar a reserva do novo líder e a liberação da reserva anterior.
6. Atualizar `current_bid_id`, `bid_count`, `head_hash` e eventual prorrogação; concluir a transação.
7. Publicar a atualização da sala por WebSocket após o commit.

O lock serializa a construção da cadeia por lote. O índice único `(lot_id, sequence)` é uma proteção adicional contra posições duplicadas. Uma recusa não acrescenta registros à cadeia de lances aceitos.

A conferência da cabeça antes de um novo lance **não recalcula todo o histórico**. A verificação completa ocorre na consulta de auditoria.

## 5. Como a auditoria verifica o histórico

A rota pública é `GET /public/lots/:id/audit`, definida em [lots.ts](../src/routes/public/lots.ts). O serviço [show-public-lot-audit.ts](../src/services/lots/show-public-lot-audit.ts) lê âncora e lances em uma transação **somente leitura**, com isolamento **repeatable read**. Isso evita comparar uma âncora antiga com lances de uma atualização concorrente mais recente.

O serviço carrega os lances em ordem crescente de `sequence` e verifica:

1. Se a chave é utilizável: string com pelo menos 32 caracteres.
2. Se um histórico vazio corresponde a `bid_count = 0` e `head_hash = null`.
3. Se a quantidade carregada coincide com `bid_count` e a sequência é exatamente `1, 2, ..., N`.
4. Se o primeiro `previous_hash` coincide com a gênese do lote e cada link seguinte aponta para o hash anterior.
5. Se o HMAC recalculado de cada lance coincide com seu `hash`, usando valor e horário canônicos.
6. Se o hash do último lance coincide com `head_hash`.

Todos os lances são carregados e verificados; o custo da consulta cresce linearmente com o tamanho do histórico. Os lances permanecem na resposta mesmo quando há adulteração detectada.

### Resultados e tratamento de falhas

| Resultado | Significado no código atual |
| --- | --- |
| `INTACT` | Todas as verificações passaram, inclusive a condição de histórico vazio. Depende da confiança na chave, no servidor e na referência persistida. |
| `TAMPERED` | Houve inconsistência de conteúdo, ordem, links ou âncora. Exceções dentro de `verifyChain`, inclusive falha inesperada no cálculo do HMAC, também são convertidas para esse resultado. |
| `VERIFICATION_FAILED` | A chave recebida pelo serviço está ausente, não é string ou tem menos de 32 caracteres. Essa condição tem prioridade sobre a verificação dos registros. |

Uma chave diferente, mas com tamanho válido, normalmente produz `TAMPERED` em um histórico com lances: o código não distingue troca de chave de adulteração. Um lote inexistente retorna `404 LOT_NOT_FOUND`; um identificador inválido recebe a validação da rota.

Há duas particularidades relevantes: [env.ts](../src/env.ts) exige a chave válida já no carregamento da aplicação, portanto a ausência de configuração normalmente impede a inicialização; os testes exercitam `VERIFICATION_FAILED` por injeção de dependência. Além disso, erros de consulta ou de preparação da resposta fora de `verifyChain` podem falhar a requisição, em vez de gerar esse status. Falha operacional não deve ser interpretada pela interface como histórico íntegro.

### Privacidade e responsabilidade do cliente

A resposta contém `audit.lotId`, `audit.status` e uma lista de lances com `sequence`, `amount`, `createdAt` e `participantNo`. O participante recebe um número por lote; isso evita publicar um identificador global de usuário.

O endpoint de auditoria omite nome, e-mail, IDs internos de usuários, HMACs, âncora e chave. O navegador apresenta o resultado do servidor; não recebe a chave para recalcular HMACs. Portanto, “auditoria pública” significa acesso público à consulta e ao resultado, e não verificação criptográfica independente pelo visitante. HMAC também não oferece não repúdio: o próprio servidor consegue produzir os códigos.

## 6. Por que HMAC-SHA256 foi escolhido em relação às alternativas

A escolha registrada no Banco de dados V2 combina três necessidades: autenticar conteúdo com um segredo fora do banco, preservar a ordem dos lances e conferir o fim esperado do histórico. O HMAC resolve a autenticação; os links e a âncora completam a estrutura de verificação.

| Alternativa | Comparação com a escolha do projeto |
| --- | --- |
| SHA-256 simples, mesmo encadeado | Não exige segredo. Quem altera o banco pode recalcular códigos e âncora para conteúdo inventado. HMAC acrescenta a necessidade de conhecer a chave para autenticar novos dados. |
| HMAC independente por lance | Autentica cada registro, mas a ausência de links e de uma referência de completude permite remover registros válidos sem invalidar os demais. |
| HMAC-SHA512 ou HMAC com SHA-3 | São alternativas possíveis. Não resolvem, por si, o problema de uma âncora que pode ser restaurada. Não há requisito específico nem benchmark no material consultado que justifique substituir SHA-256. |
| Assinaturas digitais, como RSA ou Ed25519 | Permitem separar a chave privada de assinatura da chave pública de verificação. Seriam pertinentes para verificação por terceiros, mas exigiriam distribuir a chave pública e os dados assinados. Esse protocolo não existe na implementação atual. Assinaturas também precisam de referência de completude para detectar restauração de um prefixo válido. |
| bcrypt, scrypt ou Argon2 | Atendem à derivação de chaves e proteção de senhas, com custo deliberado de processamento. Esse custo não acrescenta a propriedade necessária de autenticar eficientemente cada lance nesta cadeia. |
| Criptografia dos dados | O histórico precisa continuar legível. Confidencialidade não substitui autenticação, ordem e completude; mesmo criptografia autenticada exigiria organizar essas duas últimas propriedades. |
| Árvore de Merkle ou blockchain | Uma árvore pode oferecer provas de inclusão; uma infraestrutura externa pode ancorar referências. Nenhuma delas, isoladamente e sob o mesmo controle do banco, prova que o estado apresentado é o mais recente. O projeto não exige essa infraestrutura. |

HMAC é uma construção documentada com análise criptográfica e uso de funções hash existentes ([RFC 2104](https://www.rfc-editor.org/rfc/rfc2104.txt)). SHA-256 produz os códigos de 256 bits usados aqui ([RFC 6234](https://www.rfc-editor.org/rfc/rfc6234.txt)), e a API nativa reduz o código criptográfico mantido pelo projeto. Esses fatores sustentam a escolha para a verificação centralizada atual. Não há medição que permita afirmar que seja a opção mais rápida entre todas as alternativas.

## 7. O que é detectado e quais são os limites

### Cenários detectados

| Intervenção | Motivo da detecção |
| --- | --- |
| Alterar valor, horário ou número público do participante | O conteúdo canônico já não corresponde ao HMAC gravado. |
| Remover um lance intermediário | A sequência, a contagem ou o link seguinte deixam de corresponder. |
| Remover o último lance preservando a âncora | A quantidade e o hash final divergem de `bid_count` e `head_hash`. |
| Inserir conteúdo novo com código calculado por outra chave | O HMAC recalculado pelo servidor diverge, mesmo com contagem e cabeça ajustadas. |
| Copiar uma cadeia para outro lote | O identificador do lote integra a gênese e cada mensagem autenticada. |
| Alterar apenas a âncora | Ela deixa de coincidir com os registros carregados. |

Cancelamento e encerramento preservam os lances anteriores nos fluxos de negócio. A auditoria não restringe a consulta a lotes ativos. Não há trigger de bloqueio de `UPDATE`/`DELETE` em `bid`; a aplicação evita essas alterações em seu fluxo normal, e a auditoria detecta as inconsistências descritas.

### Restauração de prefixo: limite da âncora interna

Considere uma cadeia válida com três lances e âncora `(3, H3)`. Um atacante com permissão suficiente no banco pode remover o terceiro lance e ajustar a âncora para `(2, H2)`. Os dois registros restantes mantêm seus HMACs originais; a sequência, os links e a nova âncora passam nas verificações. Nenhum HMAC novo precisa ser calculado. Remover todos os lances e definir `(0, null)` também satisfaz a condição de histórico vazio, se o atacante conseguir contornar ou ajustar as demais referências do banco.

Essa conclusão decorre das condições de `verifyChain` e foi confirmada em uma execução isolada do serviço, com leituras simuladas e sem alterar o banco: remover o último lance mantendo a âncora retornou `TAMPERED`; reapresentar o prefixo com a âncora ajustada retornou `INTACT`, assim como o histórico vazio com `(0, null)`. Não há teste específico desses ataques nas suítes consultadas. Constraints e referências de outras tabelas podem dificultar uma intervenção concreta, mas o verificador de HMAC não prova que esse prefixo é o histórico completo mais recente.

O Banco de dados V2 afirma que acesso somente ao banco seria detectado em todos os cenários, inclusive reconstrução da cadeia e âncora. **Essa afirmação precisa ser limitada:** HMAC impede autenticar conteúdo novo sem a chave, mas não impede reutilizar códigos antigos de um prefixo válido. A chave externa não torna `head_hash` e `bid_count` referências externas ou imutáveis. O status “Feito” de RN-12 no tracking não elimina essa lacuna em relação à exigência de referência protegida.

Para cobrir esse modelo de ameaça seria necessário preservar uma referência confiável fora do domínio que o atacante pode reescrever, por exemplo um registro externo protegido de `(lotId, bidCount, headHash)` e sua evolução. Isso é uma possibilidade de evolução, não uma funcionalidade existente. Assinar apenas a âncora e armazená-la no mesmo banco ainda permitiria reapresentar uma âncora antiga válida.

### Escopo dos dados protegidos

O HMAC autentica somente os seis campos da mensagem. Não cobre diretamente `bid.id`, `bidder_id`, `participant_id`, a relação privada entre participante e usuário, título e itens do lote, carteira, comprovante, estado ou datas de encerramento. Alterar a identidade privada mantendo o mesmo número público de participante, por exemplo, não é detectado por esse payload. Restrições e regras desses dados são mecanismos separados.

Se o banco **e** a chave forem comprometidos, o atacante poderá recalcular a cadeia inteira. Um servidor comprometido também poderá mentir sobre o resultado público. O esquema não fornece prova contra o próprio detentor da chave.

O seed de demonstração é uma exceção explícita à intenção de histórico imutável: [seed-lot-activity.ts](../src/db/seed-lot-activity.ts) ajusta horários dos lances e recalcula códigos e cabeça com a chave do servidor, em uma transação. Isso prepara dados de demonstração; não é um fluxo de edição de lances oferecido ao usuário.

## 8. Configuração e preservação da chave

[example.env](../example.env) documenta a geração de um segredo aleatório:

```sh
openssl rand -base64 32
```

O resultado deve ser configurado como `BID_HASH_SECRET` somente no ambiente do back-end. Use um segredo próprio para essa finalidade, separado de `BETTER_AUTH_SECRET`, e preserve-o entre reinícios e réplicas que compartilham o mesmo banco. A validação de 32 caracteres é uma exigência de comprimento; não comprova que uma senha escolhida manualmente tenha entropia suficiente.

A implementação passa a string diretamente para `createHmac`: não decodifica Base64. O comando acima gera uma representação textual de bytes aleatórios, e essa representação exata é usada como chave.

O código não armazena versão de chave nem mantém um conjunto de chaves históricas. Trocar `BID_HASH_SECRET` sem uma estratégia de migração faz os lances existentes falharem na verificação. A recuperação do banco deve preservar também, por meio seguro separado, a chave correspondente. A chave não deve entrar em respostas, logs públicos ou no repositório.

## 9. Evidências no código e execução dos testes

| Arquivo | Responsabilidade |
| --- | --- |
| [bid-hash.ts](../src/services/lots/bid-hash.ts) | Gênese, serialização, horário canônico e cálculo do HMAC. |
| [place-bid.ts](../src/services/lots/place-bid.ts) | Aceitação transacional, persistência do lance e atualização da cabeça. |
| [schema.ts](../src/db/schema.ts) | Campos de cadeia, âncora e unicidade da sequência por lote. |
| [lot-read.ts](../src/services/lots/lot-read.ts) | Leitura ordenada dos lances e do número público do participante. |
| [show-public-lot-audit.ts](../src/services/lots/show-public-lot-audit.ts) | Verificação completa e projeção da resposta pública. |
| [show-lot-audit.ts](../src/schemas/show-lot-audit.ts) | Contrato dos três resultados da auditoria. |

As suítes existentes cobrem a geração da cadeia, divergência entre horário autenticado e persistido, concorrência, adulteração direta no banco, remoção intermediária e final com âncora preservada, inserção com outra chave, lote cancelado, chave inutilizável e omissão de dados privados. Os testes de integridade com dependências simuladas também cobrem links, gênese, sequência e entradas inválidas. O seed possui vetores HMAC fixos calculados independentemente dos helpers de produção.

Com dependências instaladas, variáveis de [example.env](../example.env) configuradas e um PostgreSQL de testes/desenvolvimento com as migrações aplicadas, execute:

```sh
npm test -- src/services/lots/show-public-lot-audit.integrity.test.ts src/services/lots/show-public-lot-audit.test.ts src/routes/public/lot-audit.test.ts src/services/lots/place-bid.test.ts src/db/seed-lot-activity.test.ts
```

As suítes de integração criam dados e executam alterações e exclusões no banco configurado para demonstrar a detecção. Na conferência deste documento, o comando passou com **97 testes em 5 arquivos**. Isso verifica os cenários cobertos; não constitui evidência de proteção contra restauração de prefixo ou comprometimento do servidor.
