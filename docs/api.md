# API

Comportamento das rotas. O formato exato dos corpos está no OpenAPI, em
`/openapi`. As regras estão em [Domínio](dominio.md).

Erros de negócio respondem JSON com `code` e `message`. Falha de carta na
criação também devolve `cardIds`. Corpo que não passa no schema da rota vira
erro de validação do framework, em geral `422`, sem esses códigos.

Valores monetários trafegam como string com duas casas, por exemplo `"10.50"`.
Datas trafegam em ISO 8601 UTC. O servidor é a referência de tempo:
`GET /public/lots/:id` e a sala devolvem `serverNow`.

Rotas em `/private` exigem sessão. O cliente manda o cookie
`better-auth.session_token` ou `Authorization: Bearer` com o valor de
`set-auth-token`. Sem sessão a resposta é `401`. A origem da requisição de
autenticação precisa ser `PAGE_ORIGIN`.

## Autenticação

`POST /api/auth/sign-up/email` e `POST /api/auth/sign-in/email` são do Better
Auth, montadas em `/api/auth`.

O cadastro recebe `name`, `email`, `password` e, se quiser, `role`. `role`
aceita `BIDDER` ou `AUCTIONEER`; omitido, grava `BIDDER`. A resposta de
cadastro e a de login trazem o usuário e a sessão. O mesmo token sai no corpo,
no header `set-auth-token` e no cookie. E-mail inexistente ou senha errada no
login responde `401` e não cria sessão.

`POST /api/auth/update-user` não altera `role`. A tentativa responde `400` e o
papel gravado permanece.

`GET /private/user` devolve o usuário da sessão, inclusive `role`.

O cadastro cria a carteira. Os dois papéis têm carteira, porque o leiloeiro
recebe crédito na liquidação.

## Busca de cartas

`GET /public/yugioh/cards/search` é pública e repassa os filtros da YGOPRODeck
(`name`, `fname`, `id`, tipo, raça, atributo, `atk`/`def`/`level` com
comparação, paginação e os demais parâmetros do provedor). Sem `num` e
`offset`, a busca pede 32 cartas a partir do offset 0. `name` e `id` não
combinam.

Antes de cada chamada, um limitador compartilhado segura o ritmo em no máximo
16 requisições por segundo. Cartas novas são gravadas em `card` e a imagem é
baixada. Carta já cadastrada não tem o metadata reescrito; a rota tenta
recuperar `imagePath` quando ele falta. A resposta mantém `data` e `meta` do
provedor e acrescenta `imagePath` em cada carta: caminho local ou `null`.

Use `imagePath` contra a origem do back-end. Os URLs em `card_images` são do
provedor. O contrato de preview está em [Imagens das cartas](card-images.md).

Falha, bloqueio ou “nenhuma carta” do provedor ainda não viram código estável.
O cliente não deve tratar isso como lista vazia.

## Lotes públicos

`GET /public/lots` não exige sessão. A lista inteira volta de uma vez.
`q` e `status` são opcionais e, juntos, os dois precisam bater.

`q` busca no título do lote e no `card_name` congelado no item, sem diferenciar
maiúsculas. Espaços nas pontas são ignorados. `%`, `_` e `\` são literais.
Não olha descrição nem o nome atual do catálogo. Vários itens do mesmo lote
não duplicam o lote.

`status` aceita `SCHEDULED`, `LIVE` ou `ENDED`. `ACTIVE` e `CANCELED` são
rejeitados na validação. Cancelados não entram, com ou sem filtro. Nada
encontrado é `200` com `lots: []`.

Ordem: ao vivo, do que termina antes para o que termina depois; depois
agendados, do que começa antes; depois encerrados, do fim mais recente para o
mais antigo.

Cada lote traz `sold: true` só quando já tem vencedor. Um `ENDED` pode ter
`currentBid` e `bidCount > 0` com `sold: false` enquanto a liquidação não
gravou o vencedor, ou quando terminou sem lances. Para o preço em destaque,
use `currentBid` quando não for `null`; senão, `openingBid`. A listagem manda
no máximo cinco itens e informa o restante em `totalItems`.

`GET /public/lots/:id` devolve o lote mesmo cancelado. Inclui `serverNow`,
itens com `cardSnapshot`, o histórico de lances aceitos
(`sequence`, `amount`, `createdAt`, `participantNo`), `leaderParticipantNo`,
`extensionCount`, `sold` e `winnerParticipantNo`. Lote inexistente é `404`
`LOT_NOT_FOUND`.

Se a requisição tiver sessão de alguém que já lanceou naquele lote,
`viewerParticipantNo` vem preenchido. Sem sessão, ou se o usuário nunca lanceou
ali, o campo é `null`. É esse número, comparado a `leaderParticipantNo` e
`winnerParticipantNo`, que diz se o visitante lidera ou venceu. A sala ao vivo
não calcula isso: ela publica o estado sem espectador.

`GET /public/lots/:id/audit` é pública, inclusive para lote cancelado. Devolve
`audit.status` em `INTACT`, `TAMPERED` ou `VERIFICATION_FAILED`, mais a
sequência de lances com valor, instante e `participantNo`. `VERIFICATION_FAILED`
não significa histórico íntegro. Lote inexistente é `404` `LOT_NOT_FOUND`.
O procedimento de verificação está em [Validação por HMAC](validacao-hmac.md).

## Sala ao vivo

`WS /public/lots/:id/live` fica na aplicação raiz, não sob o prefixo agrupado
das outras rotas públicas. A origem precisa ser ausente ou igual a
`PAGE_ORIGIN`; outra origem recebe `403` `ORIGIN_NOT_ALLOWED` antes do
upgrade. Lote inexistente recebe `404` `LOT_NOT_FOUND`.

Ao conectar, o cliente recebe um texto JSON com `serverNow` e `lot` no mesmo
formato do detalhe público, com datas já em string. Não há
`viewerParticipantNo`. Cada lance aceito, liquidação ou cancelamento republica
esse snapshot depois de persistir. Quem reconecta recebe o estado gravado, não
uma contagem local. Mensagens do cliente não alteram o lote.

## Comprovante

`GET /public/receipts/:shareToken` é público. O token tem 43 caracteres
base64url, sem padding. A resposta traz lote, título, descrição, fim,
`finalAmount`, `winnerParticipantNo` e os itens com snapshot. Não traz e-mail,
nome nem id do vencedor. Token desconhecido é `404` `RECEIPT_NOT_FOUND`. Lote
sem arremate não tem comprovante.

## Lotes do leiloeiro

Todas exigem sessão e papel `AUCTIONEER`. `BIDDER` recebe `403`
`NOT_AUCTIONEER`.

`POST /private/lots` cria o lote e responde `201`.

```json
{
  "title": "Blue-Eyes lot",
  "description": "optional",
  "openingBid": "10.00",
  "minIncrement": "0.50",
  "startsAt": "2026-10-26T18:00:00.000Z",
  "endsAt": "2026-10-26T21:00:00.000Z",
  "cardIds": [89631139]
}
```

`description` vazia, só com espaços, `null` ou ausente vira `null`. Dinheiro
vai como string maior que zero, no máximo duas casas, e a rota normaliza para
duas casas. As datas são ISO com offset. `cardIds` tem ao menos um inteiro
positivo.

O início precisa ser anterior ao fim, e o fim precisa estar no futuro. O
início pode já ter passado. Horário inválido é `422` `INVALID_SCHEDULE`. Id
ausente do catálogo é `422` `UNKNOWN_CARDS`. Carta sem imagem local é `422`
`CARD_WITHOUT_IMAGE`. Nos dois casos o corpo inclui `cardIds`. Nada disso grava
um lote pela metade.

O lote sai `ACTIVE`, com `originalEndsAt` igual a `endsAt`. Cada id vira um
item na ordem do array, `position` a partir de 1 e `quantity` 1. `imagePath`
na resposta é o caminho local, não a URL da YGOPRODeck.

`GET /private/lots` lista só os lotes do autenticado. Aceita `q` e `status`,
com a mesma busca textual da vitrine. Aqui `status` também aceita `CANCELED`.
A resposta inclui `totalReceived`, a soma dos `SETTLEMENT_CREDIT` da carteira
do leiloeiro, e em cada lote `receivedAmount` (o crédito daquele lote, ou
`null`) e `sold`. Reservas e lotes cancelados não entram no total. A ordem
segue a vitrine; cancelados ficam por último, do cancelamento mais recente
para o mais antigo.

`GET /private/lots/:id` é o detalhe do dono: o mesmo miolo do detalhe público,
mais `receivedAmount`, e sem `viewerParticipantNo`. Só o dono consulta. Lote
de outro leiloeiro é `403` `LOT_NOT_OWNED`. Id inexistente é `404`
`LOT_NOT_FOUND`.

`POST /private/lots/:id/cancel` segue as regras de cancelamento do domínio.
Sucesso, inclusive a repetição de um lote já cancelado, responde `200` com
`id`, `status: "CANCELED"` e `canceledAt`. Além de `NOT_AUCTIONEER`,
`LOT_NOT_OWNED` e `LOT_NOT_FOUND`, lote encerrado ou já vencido no relógio
responde `409` `LOT_NOT_CANCELABLE`.

## Lances

`POST /private/lots/:id/bids` exige `BIDDER`. O corpo é `{ "amount": "12.50" }`.
Sucesso responde `201` com id, sequência, valor, instante, `participantNo`,
`endsAt` vigente e `extensionCount`.

| Código | Status | Quando |
| --- | --- | --- |
| `NOT_BIDDER` | 403 | Papel diferente de `BIDDER`. |
| `LOT_NOT_FOUND` | 404 | Lote inexistente. |
| `INVALID_MONEY` | 422 | Valor ausente, zero, malformado ou acima do teto. |
| `BID_BELOW_MINIMUM` | 409 | Abaixo do lance inicial ou do lance atual mais o incremento. |
| `INSUFFICIENT_BALANCE` | 409 | O disponível não cobre o valor. |
| `ALREADY_LEADER` | 409 | O licitante já lidera o lote. |
| `LOT_NOT_STARTED` | 409 | Ainda agendado. |
| `LOT_ENDED` | 409 | Término vigente já passou, ou o lote já foi encerrado. |
| `LOT_CANCELED` | 409 | Lote cancelado. |

## Carteira

As três rotas usam a carteira do usuário da sessão. Carteira ausente é `404`
`WALLET_NOT_FOUND`.

`GET /private/wallet` devolve `totalBalance`, `committedBalance` e
`availableBalance`.

`POST /private/wallet/deposits` aceita `{ "amount": "100.00" }` e responde
`201` com os três saldos já atualizados. Só `BIDDER` deposita (`403`
`NOT_BIDDER`). Valor ausente, zero, malformado ou acima de `1000000.00` é
`422` `INVALID_MONEY`. Se a soma estourar `numeric(18,2)`, a resposta é `422`
`AMOUNT_OUT_OF_RANGE`. O comprometido não muda.

`GET /private/wallet/movements` pagina o extrato, do mais novo para o mais
antigo. `page` começa em 1 e vai até 1000; `limit` vai de 1 a 50 e o padrão é
20. Cada movimento traz `type`, `amount`, `lotId`, `bidId` e `createdAt`.
Depósito tem lote e lance nulos.

## Participações

`GET /private/participations` exige `BIDDER` (`403` `NOT_BIDDER`). Lista os
lotes em que o usuário tem ao menos um lance aceito, inclusive cancelados.
Cada item traz `participantNo`, `won` e `shareToken`. `won` é verdadeiro só
depois da liquidação com aquele usuário como vencedor, não durante a liderança.
`shareToken` só vem no arremate; nos demais é `null`. Cancelado continua na
lista e não vem como arremate.
