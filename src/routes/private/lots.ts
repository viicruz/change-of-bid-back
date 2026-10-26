//* Libraries imports
import { Elysia } from "elysia";

//* Schemas imports
import { createLotBodySchema } from "../../schemas/create-lot";

//* Local imports
import { betterAuthMacro } from "../../lib/auth";

//* Services imports
import {
  createLot,
  CreateLotError,
  type CreateLotErrorCode,
} from "../../services/lots/create-lot";

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
  );

export { lotRoutes };
