# Change of Bid - back-end

API de leilões de cartas Yu-Gi-Oh! feita com [Elysia](https://elysiajs.com/) sobre
**Node.js**, PostgreSQL, [Drizzle ORM](https://orm.drizzle.team/) e
[Better Auth](https://www.better-auth.com/).

## Pré-requisitos

- [Docker](https://docs.docker.com/get-docker/) com o plugin Docker Compose v2
(`docker compose version`).
- [Node.js](https://nodejs.org/) 22 ou superior e npm — necessários para popular o
banco com dados de demonstração (seed), rodar os testes e desenvolver com reload
automático.
- `openssl`, para gerar os segredos (ou qualquer outro gerador de strings aleatórias).



## Rodando localmente



### 1. Configure as variáveis de ambiente

Na raiz do repositório, copie o arquivo de exemplo:

```bash
cp example.env .env
```

Gere um valor para cada segredo e cole em `.env`:

```bash
openssl rand -base64 32
```


| Variável                                            | Para que serve                                                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Credenciais do PostgreSQL criado pelo Docker Compose.                                                |
| `POSTGRES_PORT`                                     | Porta do PostgreSQL no seu computador (padrão `5432`).                                               |
| `DATABASE_URL`                                      | Conexão usada pelos comandos `npm` rodando **no seu computador**. Deve bater com as variáveis acima. |
| `BETTER_AUTH_SECRET`                                | Segredo do Better Auth. **Obrigatório.**                                                             |
| `BETTER_AUTH_URL`                                   | URL pública do back-end (padrão `http://localhost:3001`).                                            |
| `PAGE_ORIGIN`                                       | Origem do front-end liberada no CORS e no login (padrão `http://localhost:3000`).                    |
| `BID_HASH_SECRET`                                   | Chave HMAC da cadeia de lances, com pelo menos 32 caracteres. **Obrigatório.**                       |
| `BACKEND_PORT`                                      | Opcional. Porta do back-end no seu computador quando roda pelo Docker Compose (padrão `3001`).       |


O Docker Compose lê esse mesmo `.env`. Dentro dos containers, a `DATABASE_URL` é
montada automaticamente apontando para o serviço `postgres`, então não é preciso
alterá-la.

### 2. Suba o projeto com Docker Compose

```bash
docker compose up -d --build
```

Esse comando:

1. sobe o PostgreSQL (`change-of-bid-postgres`) e espera ele ficar saudável;
2. roda as migrations uma vez no container `change-of-bid-migrate`, que encerra em
  seguida;
3. sobe o back-end (`change-of-bid-backend`) somente se as migrations terminarem com
  sucesso.

Confira se está tudo de pé:

```bash
docker compose ps -a
```

O `migrate` deve aparecer como `Exited (0)` e o `backend` como `Up`. A API fica em
[http://localhost:3001](http://localhost:3001) e a documentação OpenAPI em [http://localhost:3001/openapi](http://localhost:3001/openapi).

### 3. Popule o banco com dados de demonstração

Esse seed já roda no ambiente de produção. Lotes, lances, recibos e a validação
por HMAC já estão adicionados lá. Para repetir o mesmo conjunto localmente, o
comando acessa o PostgreSQL do Docker pela porta exposta (`DATABASE_URL` do
`.env`):

```bash
npm install
npm run db:seed
```

Ele cria as contas abaixo e adiciona lotes, lances, recibos e a cadeia HMAC dos
lances (`previousHash`, `hash` e `headHash`, com `BID_HASH_SECRET`). Todas as
contas usam a senha `123123123`:


| E-mail                             | Papel        | Senha       |
| ---------------------------------- | ------------ | ----------- |
| `bidder@bidder.bidder`             | `BIDDER`     | `123123123` |
| `bidder2@bidder.bidder`            | `BIDDER`     | `123123123` |
| `auctioneer@auctioneer.auctioneer` | `AUCTIONEER` | `123123123` |


As imagens das cartas são baixadas para `storage/card-images`. Essa pasta é montada
no container do back-end, então ele serve as mesmas imagens. Detalhes em
[Seed](docs/seed.md) e [Validação por HMAC](docs/validacao-hmac.md).

### Alternativa: back-end fora do Docker, com reload automático

Para desenvolver, suba só o banco pelo Docker e rode a API com `tsx watch`:

```bash
docker compose stop backend
docker compose up -d postgres
npm install
npm run db:migrate
npm run dev
```

O primeiro comando libera a porta `3001` caso o back-end do Docker esteja rodando.
A API sobe em [http://localhost:3001](http://localhost:3001), usando o mesmo banco e a mesma pasta de
imagens.

## Comandos úteis


| Comando                                 | O que faz                                                                                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker compose logs -f backend`        | Acompanha os logs da API.                                                                                                                                         |
| `docker compose up -d --build backend`  | Recompila a imagem e reinicia a API depois de alterar o código.                                                                                                   |
| `docker compose run --rm migrate`       | Aplica migrations novas sem reiniciar o resto.                                                                                                                    |
| `docker compose down`                   | Para e remove os containers. Os dados do banco são mantidos.                                                                                                      |
| `docker compose down -v`                | Para tudo e **apaga o banco** (volume `postgres_data`).                                                                                                           |
| `NODE_ENV=development npm run db:fresh` | Recria o banco da `DATABASE_URL` e aplica as migrations. Veja [Deploy](docs/deploy.md#resetting-a-development-database).                                          |
| `npm test`                              | Roda os testes. Eles usam o banco da `DATABASE_URL`; prefira um banco descartável, como descrito em [Fallow](docs/fallow.md#cobertura-real-em-banco-descartável). |
| `npm run typecheck`                     | Verifica os tipos com o TypeScript.                                                                                                                               |




## Problemas comuns

- **Porta em uso (**`5432` **ou** `3001`**).** Troque `POSTGRES_PORT` ou `BACKEND_PORT` no
`.env`. Ao mudar `POSTGRES_PORT`, ajuste também a porta da `DATABASE_URL`; ao
mudar `BACKEND_PORT`, ajuste `BETTER_AUTH_URL`.
- **O back-end reinicia sem parar com erro do Zod.** Falta `BETTER_AUTH_SECRET` ou
`PAGE_ORIGIN`, ou o `BID_HASH_SECRET` tem menos de 32 caracteres. Corrija o `.env`
e rode `docker compose up -d backend`.
- **Mudei** `POSTGRES_USER`**/**`POSTGRES_PASSWORD`**/**`POSTGRES_DB` **e nada aconteceu.** O
PostgreSQL só usa esses valores na primeira criação do volume. Rode
`docker compose down -v` (apaga os dados) e suba de novo.
- **Pouco espaço em disco.** O build deixa cache do Docker para trás; libere com
`docker builder prune`.



## Documentação

- [Domínio](docs/dominio.md) - papéis, estados do lote, saldo, limite monetário, lance, liquidação e cancelamento
- [Modelo de dados](docs/modelo-de-dados.md) - tabelas, invariantes e transações
- [API](docs/api.md) - comportamento das rotas; o formato dos corpos está em `/openapi`
- [Deploy e operações de banco](docs/deploy.md)
- [Seed](docs/seed.md)
- [Imagens das cartas](docs/card-images.md) - contrato de preview local, recuperação de imagens e backfill
- [Validação por HMAC](docs/validacao-hmac.md) - integridade dos lances
- [Fallow](docs/fallow.md) - escopo da análise e cobertura isolada

