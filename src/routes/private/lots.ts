//* Libraries imports
import { Elysia } from "elysia";
import { z } from "zod";

//* Schemas imports
import {
  cancelLotConflictSchema,
  cancelLotForbiddenSchema,
  cancelLotNotFoundSchema,
  cancelLotParamsSchema,
  cancelLotResponseSchema,
} from "../../schemas/cancel-lot";
import {
  placeBidBodySchema,
  placeBidConflictSchema,
  placeBidForbiddenSchema,
  placeBidNotFoundSchema,
  placeBidParamsSchema,
  placeBidResponseSchema,
  placeBidUnprocessableSchema,
} from "../../schemas/place-bid";
import { createLotBodySchema } from "../../schemas/create-lot";
import {
  listAuctioneerLotsQuerySchema,
  listAuctioneerLotsResponseSchema,
} from "../../schemas/list-lots";

//* Local imports
import { betterAuthMacro } from "../../lib/auth";

//* Services imports
import {
  cancelLot,
  CancelLotError,
  type CancelLotErrorCode,
} from "../../services/lots/cancel-lot";
import {
  placeBid,
  PlaceBidError,
  type PlaceBidErrorCode,
} from "../../services/lots/place-bid";
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

const cancelLotErrorStatus = {
  NOT_AUCTIONEER: 403,
  LOT_NOT_OWNED: 403,
  LOT_NOT_FOUND: 404,
  LOT_NOT_CANCELABLE: 409,
} as const satisfies Record<CancelLotErrorCode, 403 | 404 | 409>;

const placeBidErrorStatus = {
  NOT_BIDDER: 403,
  LOT_NOT_FOUND: 404,
  INVALID_MONEY: 422,
  BID_BELOW_MINIMUM: 409,
  INSUFFICIENT_BALANCE: 409,
  ALREADY_LEADER: 409,
  LOT_NOT_STARTED: 409,
  LOT_ENDED: 409,
  LOT_CANCELED: 409,
} as const satisfies Record<PlaceBidErrorCode, 403 | 404 | 409 | 422>;


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
  )
  .post(
    "/:id/cancel",
    async ({ params, user, status }) => {
      try {
        return await cancelLot({
          lotId: params.id,
          auctioneerId: user.id,
          role: user.role,
        });
      } catch (error) {
        if (!(error instanceof CancelLotError)) {
          throw error;
        }

        if (error.code === "LOT_NOT_FOUND") {
          return status(cancelLotErrorStatus.LOT_NOT_FOUND, {
            code: error.code,
            message: error.message,
          });
        }

        if (error.code === "LOT_NOT_CANCELABLE") {
          return status(cancelLotErrorStatus.LOT_NOT_CANCELABLE, {
            code: error.code,
            message: error.message,
          });
        }

        return status(cancelLotErrorStatus[error.code], {
          code: error.code,
          message: error.message,
        });
      }
    },
    {
      auth: true,
      params: cancelLotParamsSchema,
      response: {
        200: cancelLotResponseSchema,
        403: cancelLotForbiddenSchema,
        404: cancelLotNotFoundSchema,
        409: cancelLotConflictSchema,
      },
    },
  )
  .post(
    "/:id/bids",
    async ({ params, body, user, status }) => {
      try {
        const accepted = await placeBid({
          lotId: params.id,
          userId: user.id,
          role: user.role,
          amount: body.amount,
        });

        return status(201, accepted);
      } catch (error) {
        if (!(error instanceof PlaceBidError)) {
          throw error;
        }

        return status(placeBidErrorStatus[error.code], {
          code: error.code,
          message: error.message,
        });
      }
    },
    {
      auth: true,
      params: placeBidParamsSchema,
      body: placeBidBodySchema,
      response: {
        201: placeBidResponseSchema,
        403: placeBidForbiddenSchema,
        404: placeBidNotFoundSchema,
        409: placeBidConflictSchema,
        422: placeBidUnprocessableSchema,
      },
    },
  );

export { lotRoutes };
