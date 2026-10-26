//* Lirbaries imports
import { Elysia } from "elysia";
import z from "zod";

//* Local imports
import { YGOProDeckApiClient } from "../../services/yugioh-api/yugioh-api";
import { cardSearchQuerySchema } from "../../schemas/ygo-pro-deck";

const yugiohCardsRoutes = new Elysia({ prefix: "/yugioh/cards" })
    .get(
        "/search",
        async (request) => {
            const yugiohApiClient = new YGOProDeckApiClient();
            const cards = await yugiohApiClient.searchCards(request.query);
            return cards;
        },
        {
            query: cardSearchQuerySchema,
        }
    )

export { yugiohCardsRoutes };