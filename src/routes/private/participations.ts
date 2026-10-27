//* Libraries imports
import { Elysia } from "elysia";
import { z } from "zod";

//* Schemas imports
import { listBidderParticipationsResponseSchema } from "../../schemas/list-bidder-participations";

//* Local imports
import { betterAuthMacro } from "../../lib/auth";

//* Services imports
import {
  listBidderParticipations,
  ListBidderParticipationsError,
  type ListBidderParticipationsErrorCode,
} from "../../services/lots/list-bidder-participations";

const listBidderParticipationsErrorSchema = z.object({
  code: z.literal("NOT_BIDDER"),
  message: z.string(),
});

const listBidderParticipationsErrorStatus = {
  NOT_BIDDER: 403,
} as const satisfies Record<ListBidderParticipationsErrorCode, 403>;

const participationRoutes = new Elysia({ prefix: "/participations" })
  .use(betterAuthMacro)
  .get(
    "/",
    async ({ user, status }) => {
      try {
        return await listBidderParticipations({
          userId: user.id,
          role: user.role,
        });
      } catch (error) {
        if (!(error instanceof ListBidderParticipationsError)) {
          throw error;
        }

        return status(listBidderParticipationsErrorStatus[error.code], {
          code: error.code,
          message: error.message,
        });
      }
    },
    {
      auth: true,
      response: {
        200: listBidderParticipationsResponseSchema,
        403: listBidderParticipationsErrorSchema,
      },
    },
  );

export { participationRoutes };
