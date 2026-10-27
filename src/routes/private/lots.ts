//* Libraries imports
import { Elysia } from "elysia";
import { z } from "zod";

//* Schemas imports
import { createLotBodySchema } from "../../schemas/create-lot";
import {
  listAuctioneerLotsQuerySchema,
  listAuctioneerLotsResponseSchema,
} from "../../schemas/list-lots";

//* Local imports
import { betterAuthMacro } from "../../lib/auth";

//* Services imports
import {
  createLot,
  CreateLotError,
  type CreateLotErrorCode,
} from "../../services/lots/create-lot";
import {
  listAuctioneerLots,
  ListAuctioneerLotsError,
  type ListAuctioneerLotsErrorCode,
} from "../../services/lots/list-auctioneer-lots";

const listAuctioneerLotsErrorSchema = z.object({
  code: z.literal("NOT_AUCTIONEER"),
  message: z.string(),
});

const listAuctioneerLotsErrorStatus = {
  NOT_AUCTIONEER: 403,
} as const satisfies Record<ListAuctioneerLotsErrorCode, 403>;

const createLotErrorStatus = {
  NOT_AUCTIONEER: 403,
  INVALID_SCHEDULE: 422,
  INVALID_MONEY: 422,
  UNKNOWN_CARDS: 422,
  CARD_WITHOUT_IMAGE: 422,
} as const satisfies Record<CreateLotErrorCode, 403 | 422>;

const lotRoutes = new Elysia({ prefix: "/lots" })
  .use(betterAuthMacro)
  .post(
    "/",
    async ({ body, user, status }) => {
      try {
        const lot = await createLot({
          auctioneerId: user.id,
          role: user.role,
          title: body.title,
          description: body.description,
          openingBid: body.openingBid,
          minIncrement: body.minIncrement,
          startsAt: new Date(body.startsAt),
          endsAt: new Date(body.endsAt),
          cardIds: body.cardIds,
        });

        return status(201, lot);
      } catch (error) {
        if (!(error instanceof CreateLotError)) {
          throw error;
        }

        return status(createLotErrorStatus[error.code], {
          code: error.code,
          message: error.message,
          ...(error.cardIds === undefined ? {} : { cardIds: error.cardIds }),
        });
      }
    },
    {
      auth: true,
      body: createLotBodySchema,
    },
  )
  .get(
    "/",
    async ({ query, user, status }) => {
      try {
        return await listAuctioneerLots({
          auctioneerId: user.id,
          role: user.role,
          ...query,
        });
      } catch (error) {
        if (!(error instanceof ListAuctioneerLotsError)) {
          throw error;
        }

        return status(listAuctioneerLotsErrorStatus[error.code], {
          code: error.code,
          message: error.message,
        });
      }
    },
    {
      auth: true,
      query: listAuctioneerLotsQuerySchema,
      response: {
        200: listAuctioneerLotsResponseSchema,
        403: listAuctioneerLotsErrorSchema,
      },
    },
  );

export { lotRoutes };
