# Domínio

## Vocabulário

**Carta de catálogo** é o cache da YGOPRODeck na tabela `card`. **Lote** é a
oferta criada por um leiloeiro. Um lote tem um ou mais **itens**; cada item
congela nome, imagem e o JSON da carta no momento da criação. O lote não é o
id da carta.

**Lance inicial** é o mínimo do primeiro lance. **Incremento mínimo** é o quanto
um lance novo precisa superar o lance atual. **Líder** é o autor do maior lance
aceito enquanto o lote ainda não foi liquidado. **Vencedor** é o líder de um
lote encerrado com arremate.

**Saldo total** é o valor contabilizado na carteira. **Saldo comprometido** é a
soma das reservas dos lotes em que o licitante lidera. **Saldo disponível** é
`total − comprometido` e não é gravado.

**Comprovante** é o registro do arremate liquidado. **Auditoria** é a consulta
pública do histórico de lances aceitos e do resultado da verificação.

## Valores monetários

A moeda é BRL. A aplicação só aceita string decimal maior que zero, com no
máximo duas casas. `10`, `10.0` e `10.00` viram `10.00`. Zero, negativo, mais
de duas casas, zero à esquerda e valor acima do teto respondem `INVALID_MONEY`
e não gravam linha.

Cada valor gravado tem teto de `1000000.00`, inclusive. O mesmo número está em
`normalizeMoney` (`src/schemas/money.ts`) e nos `CHECK`s do banco:

| Valor | Coluna |
| --- | --- |
| Lance inicial | `lot.opening_bid` |
| Incremento mínimo | `lot.min_increment` |
| Lance aceito | `bid.amount` |
| Movimento de carteira | `wallet_movement.amount` |
| Comprovante | `receipt.final_amount` |

`1000000.00` entra. `1000000.01` não.

O saldo da carteira não usa esse teto. Vários depósitos, cada um até
`1000000.00`, podem somar mais. `total_balance` e `committed_balance` são
`numeric(18,2)`: o maior saldo gravável é `9999999999999999.99`. Um depósito
que estouraria essa coluna responde `AMOUNT_OUT_OF_RANGE` e deixa o saldo
como estava.

## Papéis

Há dois papéis, gravados em `user.role` e conferidos no servidor:


| Papel        | Pode                                                                                                      | Não pode                                   |
| ------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `BIDDER`     | Depositar, consultar a própria carteira, dar lances e ver as próprias participações.                      | Criar, listar como dono ou cancelar lotes. |
| `AUCTIONEER` | Criar e consultar os próprios lotes e cancelar os que ainda estão ativos. Recebe o crédito da liquidação. | Dar lances ou depositar.                   |


O cadastro aceita `role` igual a `BIDDER` ou `AUCTIONEER`. Sem o campo, o papel
é `BIDDER`. Depois da criação o papel não muda. Cada usuário, inclusive o
leiloeiro, ganha uma carteira no mesmo fluxo; se a carteira não for criada, o
usuário recém-gravado é removido.

Um leiloeiro só cancela e consulta detalhes dos lotes em que `auctioneer_id` é
o dele. Sem sessão, lance, depósito e gestão de lote respondem `401`.

## Estados do lote

O banco grava só o que é um evento:


| Gravado    | Significado                                                                            |
| ---------- | -------------------------------------------------------------------------------------- |
| `ACTIVE`   | Ainda não encerrado nem cancelado. Agendado ou ao vivo depende do relógio do servidor. |
| `ENDED`    | Encerrado. Com `winner_id` houve arremate; sem ele, terminou sem lances.               |
| `CANCELED` | Cancelado pelo dono. Terminal.                                                         |


A API calcula o estado efetivo:


| Efetivo     | Condição                                                                              |
| ----------- | ------------------------------------------------------------------------------------- |
| `CANCELED`  | `status = CANCELED`                                                                   |
| `ENDED`     | `status = ENDED`, ou `ACTIVE` com `now >= ends_at` (já venceu e aguarda a liquidação) |
| `SCHEDULED` | `ACTIVE` e `now < starts_at`                                                          |
| `LIVE`      | `ACTIVE` e `starts_at <= now < ends_at`                                               |


A vitrine pública omite cancelados. O detalhe público, a auditoria e o painel
do dono continuam enxergando o lote cancelado. Cancelado e encerrado não voltam
a aceitar lance e não reabrem sozinhos.

`ends_at` é o término vigente. `original_ends_at` é o término da criação e não
anda para trás: `ends_at >= original_ends_at`.

## Lances

Só entram lances aceitos. Recusa não grava linha em `bid`, não mexe em saldo e
não prorroga o lote.

A janela é a do estado `LIVE`. Antes do início a resposta é `LOT_NOT_STARTED`;
depois do término vigente, `LOT_ENDED`; em lote cancelado, `LOT_CANCELED`. O
relógio é o do servidor. Um cliente com contagem antiga não abre a janela.

O mínimo também é recalculado na aceitação:

- sem lance anterior, o valor é maior ou igual a `opening_bid`;
- com lance atual, o valor é maior ou igual a lance atual + `min_increment`;
- o líder atual recebe `ALREADY_LEADER` e não cobre o próprio lance.

Abaixo do mínimo a resposta é `BID_BELOW_MINIMUM`. Valor que não cabe no
disponível é `INSUFFICIENT_BALANCE`. Leiloeiro recebe `NOT_BIDDER`.

Um lance aceito, a reserva e a troca de liderança acontecem na mesma transação.
O lote é travado primeiro, o que serializa lance, cancelamento e liquidação
daquele lote. As carteiras envolvidas são travadas em ordem de id. O lance novo
compromete o valor integral na carteira do novo líder. A reserva daquele lote
no líder anterior é liberada na hora; reservas de outros lotes do mesmo
licitante permanecem. O histórico público só é publicado depois do commit.

Cada licitante ganha um `participant_no` estável naquele lote, no primeiro lance
aceito. O número distingue participantes sem repetir a mesma pessoa entre lotes.

### Prorrogação

Se o lance é aceito quando faltam no máximo dois minutos para `ends_at`
(`0 < restante <= 120s`), o término vigente avança dois minutos e
`extension_count` sobe um. Não há teto de prorrogações. Lance recusado não
altera o término.

## Carteira

```text
disponível = total − comprometido
```

Os dois saldos gravados não ficam negativos, e o comprometido não passa do
total. Um lance só é aceito se o valor inteiro couber no disponível naquele
momento. O mesmo disponível não financia duas reservas incompatíveis: as
carteiras são travadas dentro da transação do lance.


| Movimento           | Efeito                                                                         |
| ------------------- | ------------------------------------------------------------------------------ |
| `DEPOSIT`           | `total += amount`. Sem lote.                                                   |
| `HOLD`              | `committed += amount`. O licitante virou líder daquele lote.                   |
| `RELEASE`           | `committed -= amount`. Foi superado ou o lote foi cancelado. O total não muda. |
| `SETTLEMENT_DEBIT`  | `total -= amount` e `committed -= amount`. O vencedor paga a reserva.          |
| `SETTLEMENT_CREDIT` | `total += amount`. O leiloeiro recebe o lance vencedor. Não há comissão.       |


Depósito que não passa na regra de
[valores monetários](#valores-monetários) não altera saldo. Leiloeiro não
deposita. O extrato é append-only: cada mudança de saldo grava uma linha na
mesma transação.

## Liquidação

Um job roda na subida do processo e depois a cada 10 segundos. Ele busca lotes
`ACTIVE` com `ends_at <= now`. Não depende de alguém estar na sala.

Para cada lote, uma transação trava a linha e confere de novo. Se já não estiver
ativo e vencido, a transação não faz nada.

- Sem lances: `ENDED`, `ended_at` e `settled_at`. Sem movimento e sem comprovante.
- Com lances: o líder é o vencedor. Grava débito e crédito do valor do lance,
cria o comprovante e preenche `winner_id`, `ENDED`, `ended_at` e `settled_at`.
A reserva deixa de compor o comprometido.

Rodar o job de novo não gera segundo débito, crédito ou comprovante. Os índices
únicos de liquidação e o comprovante único por lote são a segunda trava. Lote
cancelado não é liquidado.

## Cancelamento

O dono cancela um lote `ACTIVE` cujo término ainda não passou, com ou sem
lances. Lote de outro leiloeiro responde `LOT_NOT_OWNED`. Lote já encerrado,
ou ainda `ACTIVE` com o término vigente no passado, responde
`LOT_NOT_CANCELABLE`. Repetir o cancelamento de um lote que já está
`CANCELED` devolve o mesmo estado, sem novo movimento.

Se houver líder, a transação grava um `RELEASE` da reserva daquele lote. O
total do líder permanece; o comprometido cai e o disponível sobe o mesmo valor.
Não há depósito extra: antes da liquidação o valor estava reservado, não
debitado.

O histórico de lances permanece, para participação e auditoria. O lote sai da
vitrine. Não há estorno de arremate já liquidado.

## Privacidade

Auditoria, comprovante, sala e listagens públicas identificam licitantes pelo
`participant_no` daquele lote. E-mail, nome, id de usuário e dados de sessão
não saem nessas respostas. O `winner_id` fica no banco para achar o arremate do
próprio licitante; o comprovante público mostra `winnerParticipantNo`.

O link do comprovante é um `share_token` aleatório de 32 bytes em base64url,
não derivado dos ids.

## Cartas

A busca de cartas consulta a YGOPRODeck. A busca de lotes olha só o título do
lote e o `card_name` congelado no item. Uma não substitui a outra, e a vitrine,
a sala, a carteira, a auditoria e o comprovante de um lote já publicado não
chamam o provedor.

O catálogo pode ser atualizado sem reescrever um lote publicado. A imagem
servida é a cópia local; o caminho fica no item. Detalhes em
[Imagens das cartas](card-images.md).

A consulta externa ainda não traduz falha, bloqueio ou ausência de resultados
em códigos estáveis. Uma resposta ruim do provedor sobe como erro técnico. Isso
não derruba os lotes já gravados, mas também não cumpre o critério de mensagem
compreensível da busca.

## O que esta página não declara concluído

- Tratamento estável de erro da YGOPRODeck na busca de cartas.
- Trigger que impeça `UPDATE` e `DELETE` em `bid`. A imutabilidade é convenção
da aplicação; a detecção de adulteração fica na auditoria.
- O Compose deste repositório sobe banco e back-end. O front-end não entra aqui.

