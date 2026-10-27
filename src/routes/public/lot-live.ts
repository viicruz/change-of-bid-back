//* Libraries imports
import { Elysia } from "elysia";

//* Schemas imports
import { showPublicLotParamsSchema } from "../../schemas/show-lot";

//* Local imports
import { env } from "../../env";

//* Services imports
import { joinPublicLotRoom } from "../../services/lots/public-lot-live";
import {
  showPublicLot,
  ShowPublicLotError,
} from "../../services/lots/show-public-lot";

const roomLeaves = new WeakMap<object, () => void>();
const closedSockets = new WeakSet<object>();

type LiveRoomPeer = {
  context?: {
    message?: (peer: unknown, body: string) => unknown;
  };
};

// @elysiajs/node treats any text frame whose body contains "ping" as a
// heartbeat and handles it before the route. Drop every client frame on the
// socket hook so the room stays one-way.
function ignoreClientFrames(peer: object) {
  const context = (peer as LiveRoomPeer).context;

  if (context === undefined) {
    throw new Error("Live room socket has no message hook");
  }

  context.message = () => undefined;
}

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
      const raw = ws.raw;

      ignoreClientFrames(raw);

      const lotId = ws.data.params.id;

      try {
        const leave = await joinPublicLotRoom(lotId, (payload) => {
          ws.send(payload);
        });

        if (closedSockets.has(raw)) {
          leave();
          return;
        }

        roomLeaves.set(raw, leave);
      } catch (error) {
        try {
          ws.close(1011, "The live lot snapshot failed");
        } catch {
          // The socket is already gone.
        }

        throw error;
      }
    },
    close(ws) {
      closedSockets.add(ws.raw);

      const leave = roomLeaves.get(ws.raw);

      if (leave === undefined) {
        return;
      }

      leave();
      roomLeaves.delete(ws.raw);
    },
  });
}
