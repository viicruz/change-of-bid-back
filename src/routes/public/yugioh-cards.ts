//* Libraries imports
import { Elysia } from "elysia";

//* Schemas imports
import { cardSearchQuerySchema } from "../../schemas/ygo-pro-deck";

//* Services imports
import { saveUnregisteredCards } from "../../services/yugioh-api/save-unregistered-cards";
import { YGOProDeckApiClient } from "../../services/yugioh-api/yugioh-api";

const yugiohCardsRoutes = new Elysia({ prefix: "/yugioh/cards" })
    .get(
        "/search",
        async (request) => {
            const yugiohApiClient = new YGOProDeckApiClient();
            const cards = await yugiohApiClient.searchCards(request.query);
            const imagePaths = await saveUnregisteredCards(cards.data);
            return {
                ...cards,
                data: cards.data.map((card) => ({
                    ...card,
                    imagePath: imagePaths.get(card.id) ?? null,
                })),
            };
        },
        {
            query: cardSearchQuerySchema,
        }
    )

export { yugiohCardsRoutes };