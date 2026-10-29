# Imagens locais das cartas

A busca `GET /public/yugioh/cards/search` continua consultando a YGOPRODeck em cada
requisição. Não há cache nem fallback da consulta. Antes de responder, o back-end
registra cartas novas e tenta recuperar imagens de cartas já cadastradas. Os
metadados existentes do catálogo não são atualizados pela recuperação.

## Contrato da busca e uso no front

O envelope `data`/`meta` e os campos das cartas, inclusive `card_images`, são
preservados. Cada entrada de `data` ganha `imagePath: string | null`, com a mesma
convenção de `imagePath` dos itens de lotes:

```json
{
  "data": [{
    "id": 6983839,
    "name": "Tornado Dragon",
    "imagePath": "/card-images/6983839.jpg",
    "card_images": [{
      "id": 6983839,
      "image_url": "https://images.ygoprodeck.com/images/cards/6983839.jpg",
      "image_url_small": "https://images.ygoprodeck.com/images/cards_small/6983839.jpg"
    }]
  }]
}
```

Exemplo abreviado: os demais campos da carta continuam presentes. `imagePath` é
`null` quando não foi possível confirmar/gravar uma imagem local. Uma carta nova
sem imagem baixada não é registrada; uma carta existente permanece no catálogo e
pode ser recuperada em uma nova busca. Os URLs em `card_images` são referências
do provedor mantidas por compatibilidade, não o contrato de preview local.

O front deve resolver `imagePath` contra a **origem do back-end**, nunca contra a
origem da página ou o prefixo `/public`:

```ts
const previewUrl = card.imagePath
  ? new URL(card.imagePath, backendOrigin).href
  : null;
```

Quando for `null`, mostre um placeholder/indisponibilidade, sem fazer hotlink para
`card_images`. A rota `/card-images/...` é pública e usa o CORS da aplicação.
Nenhuma alteração no front está incluída nesta entrega.

## Armazenamento e publicação

Os arquivos ficam em `storage/card-images`, relativo ao diretório de trabalho do
processo. O download mantém a restrição à origem HTTPS
`https://images.ygoprodeck.com`, rejeita redirecionamentos e credenciais no URL,
usa timeout de 15 segundos e aceita JPEG, PNG e WebP. São conferidos o tipo HTTP,
a assinatura e os marcadores finais/tamanho do arquivo; isso não substitui uma
decodificação completa da imagem.

Arquivos válidos são reutilizados. Arquivos ausentes, vazios ou com marcadores
inválidos são recuperados. Downloads simultâneos do mesmo destino compartilham
uma promessa no processo. A gravação usa um temporário exclusivo no mesmo
diretório e `rename` atômico, mantendo arquivos finais completos mesmo quando
processos diferentes gravam simultaneamente. Processos distintos podem fazer um
download redundante. Variantes de URL recebem uma chave própria; referências a
artes alternativas usam seu próprio ID de imagem, sem sobrescrever a arte padrão.

A criação de lotes exige uma imagem local válida para cada carta e tenta
recuperá-la a partir de sua referência preservada. Em caso de falha, retorna
`CARD_WITHOUT_IMAGE` e não publica o lote. O item guarda seu caminho local e o
snapshot original. As leituras de lotes não consultam a YGOPRODeck: após a
preparação, a imagem continua acessível mesmo com o provedor indisponível.

## Backfill explícito

A partir da raiz do repositório, com dependências instaladas e `DATABASE_URL`
apontando para o banco desejado, execute **somente quando solicitado**:

```sh
npm run images:backfill
```

O comando usa `tsx` das dependências de desenvolvimento. Como alternativa, após
`npm run build`, o bundle pode ser executado com as dependências de produção:

```sh
node dist/backfill-card-images.js
```

O comando percorre `card` e `lot_item` em páginas de 100 registros por chave,
processando um download de cada vez. Não consulta a API de cartas. Para itens,
usa a primeira referência de imagem de `card_snapshot`, quando disponível; se
não existir, reutiliza o caminho local válido ou tenta o URL remoto do próprio
item. Nunca consulta o catálogo para substituir a arte de um snapshot. Sem
referência recuperável e sem arquivo válido, informa uma falha e segue adiante.

Somente `card.image_path` e `lot_item.image_path` são atualizados, após a gravação
bem-sucedida. Nomes, preços, descrições, datas, estado do lote, `raw` e
`card_snapshot` permanecem intactos, inclusive em lotes publicados. Registros com
o mesmo caminho que tiveram o arquivo recuperado entram em `unchanged`: esse
contador significa que a coluna não precisou ser alterada.

Ao terminar, imprime por tabela `scanned`, `updated`, `unchanged` e `failed`;
falhas individuais são identificadas por tabela/ID no stderr. O código de saída
é 1 se houver falhas (inclusive erro geral de leitura), e 0 se tudo terminar sem
falhas. Reexecutar reutiliza os arquivos válidos e tenta novamente os casos
pendentes. Não há transação global, rollback dos sucessos ou execução no boot.
Este trabalho não executou o comando sobre os dados existentes.

## Persistência e limites operacionais

É necessário persistir **todo o diretório `storage/card-images`**. Na imagem
Docker atual, o destino absoluto é **`/app/storage/card-images`**. Réplicas que
atendem os mesmos lotes precisam enxergar os mesmos arquivos. Faça backup dos
arquivos junto com o banco; restaurar apenas PostgreSQL deixa caminhos sem
conteúdo. No Docker Compose local, o serviço `backend` monta a pasta
`./storage/card-images` do repositório nesse destino, compartilhando os arquivos
com `npm run dev` e `npm run db:seed`.

Lotes legados precisam do backfill para remover seus caminhos remotos. Sem a
referência preservada nem cópia local válida, não é possível recuperar sua arte
com segurança automaticamente. Não há varredura automática de integridade ou
reparo nas leituras públicas. O seed de demonstração também verifica as imagens
locais antes de inserir seus novos lotes, sem executar o backfill de itens antigos.
