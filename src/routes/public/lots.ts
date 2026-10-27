//* Libraries imports
import { Elysia } from "elysia";

//* Schemas imports
import {
  listPublicLotsQuerySchema,
  listPublicLotsResponseSchema,
} from "../../schemas/list-lots";
import {
  showPublicLotNotFoundSchema,
  showPublicLotParamsSchema,
  showPublicLotResponseSchema,
} from "../../schemas/show-lot";
import {
  showPublicLotAuditNotFoundSchema,
  showPublicLotAuditParamsSchema,
  showPublicLotAuditResponseSchema,
} from "../../schemas/show-lot-audit";

//* Local imports
import { findOptionalUserId } from "../../lib/auth";

//* Services imports
import { listPublicLots } from "../../services/lots/list-public-lots";
import {
  showPublicLot,
  ShowPublicLotError,
  type ShowPublicLotErrorCode,
} from "../../services/lots/show-public-lot";
import {
  showPublicLotAudit,
  ShowPublicLotAuditError,
  type ShowPublicLotAuditErrorCode,
} from "../../services/lots/show-public-lot-audit";

const showPublicLotErrorStatus = {
  LOT_NOT_FOUND: 404,
} as const satisfies Record<ShowPublicLotErrorCode, 404>;

const showPublicLotAuditErrorStatus = {
  LOT_NOT_FOUND: 404,
} as const satisfies Record<ShowPublicLotAuditErrorCode, 404>;

const publicLotRoutes = new Elysia({ prefix: "/lots" })
  .get(
    "/",
    async ({ query }) => {
      const lots = await listPublicLots(query);

      return { lots };
    },
    {
      query: listPublicLotsQuerySchema,
      response: listPublicLotsResponseSchema,
    },
  )
  .get(
    "/:id",
    async ({ params, request, status }) => {
      const viewerId = await findOptionalUserId(request.headers);

      try {
        return await showPublicLot(params.id, { viewerId });
      } catch (error) {
        if (!(error instanceof ShowPublicLotError)) {
          throw error;
        }

        return status(showPublicLotErrorStatus[error.code], {
          code: error.code,
          message: error.message,
        });
      }
    },
    {
      params: showPublicLotParamsSchema,
      response: {
        200: showPublicLotResponseSchema,
        404: showPublicLotNotFoundSchema,
      },
    },
  )
  .get(
    "/:id/audit",
    async ({ params, status }) => {
      try {
        return await showPublicLotAudit(params.id);
      } catch (error) {
        if (!(error instanceof ShowPublicLotAuditError)) {
          throw error;
        }

        return status(showPublicLotAuditErrorStatus[error.code], {
          code: error.code,
          message: error.message,
        });
      }
    },
    {
      params: showPublicLotAuditParamsSchema,
      response: {
        200: showPublicLotAuditResponseSchema,
        404: showPublicLotAuditNotFoundSchema,
      },
    },
  );

export { publicLotRoutes };
