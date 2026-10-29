//* Libraries imports
import { Elysia } from "elysia";

//* Schemas imports
import { showPublicLotParamsSchema } from "../../schemas/show-lot";

//* Local imports
import { env } from "../../env";
import { PublicLotLiveLifecycle } from "./lot-live-lifecycle";

//* Services imports
import { joinPublicLotRoom } from "../../services/lots/public-lot-live";
import {
  showPublicLot,
  ShowPublicLotError,
} from "../../services/lots/show-public-lot";

const liveLifecycle = new PublicLotLiveLifecycle(joinPublicLotRoom);

function allowsLiveOrigin(origin: string | null) {
  return origin === null || origin === env.PAGE_ORIGIN;
}

// Registered on the root app. A child Elysia does not share the Node adapter
// that accepts the upgrade, so the route would never open.
export function publicLotLiveRoutes(app: Elysia) {
  return app.ws("/public/lots/:id/live", {
    params: showPublicLotParamsSchema,
    async beforeHandle({ params, request, status }) {
      const origin = request.headers.get("origin");

      if (!allowsLiveOrigin(origin)) {
        return status(403, {
          code: "ORIGIN_NOT_ALLOWED",
          message: "This origin cannot subscribe to the lot.",
        });
      }

      try {
        await showPublicLot(params.id, { viewerId: null });
      } catch (error) {
        if (!(error instanceof ShowPublicLotError)) {
          throw error;
        }

        return status(404, {
          code: error.code,
          message: error.message,
        });
      }
    },
    async open(ws) {
      return liveLifecycle.open(ws, ws.data.params.id);
    },
    close(ws) {
      liveLifecycle.close(ws);
    },
  });
}
