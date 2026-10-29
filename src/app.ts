//* Libraries imports
import "dotenv/config";
import { cors } from "@elysiajs/cors";
import { node } from "@elysiajs/node";
import { Elysia } from "elysia";
import { openapi } from '@elysia/openapi'
import { staticPlugin } from "@elysia/static";

//* Local imports
import { auth, OpenAPI } from "./lib/auth";
import { env } from "./env";
import { cardImageStorage } from "./lib/card-image-storage";
import { restoreMissingCardImage } from "./services/yugioh-api/restore-card-image";

//* Routes imports
import { privateRoutes } from "./routes/private";
import { publicLotLiveRoutes } from "./routes/public/lot-live";
import { publicRoutes } from "./routes/public";

const nodeAdapter = node();

export const app = new Elysia({ adapter: nodeAdapter })
  .use(openapi({
    documentation: {
      components: await OpenAPI.components,
      paths: await OpenAPI.getPaths()
    }
  }))
  .use(
    cors({
      origin: env.PAGE_ORIGIN,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  )
  .onRequest(async ({ request }) => {
    if (request.method !== "GET" && request.method !== "HEAD") return;
    const { pathname } = new URL(request.url);
    try {
      await restoreMissingCardImage(pathname);
    } catch (error) {
      // The static plugin still answers 404 when the image cannot be restored.
      console.warn(`Could not restore ${pathname}:`, error instanceof Error ? error.message : error);
    }
  })
  .mapResponse(async ({ path, response, set, request }) => {
    if (
      path !== cardImageStorage.prefix &&
      !path.startsWith(`${cardImageStorage.prefix}/`)
    ) {
      return;
    }

    // The Node adapter sets chunked encoding, but its HTTP transport adds a file length.
    // Let the transport choose framing instead of sending both headers.
    const mapped = await nodeAdapter.handler.mapResponse(response, set, request);
    mapped.headers.delete("transfer-encoding");
    return mapped;
  })
  .use(await staticPlugin({
    ...cardImageStorage,
    alwaysStatic: false,
    indexHTML: false,
  }))
  .mount(auth.handler)
  .use(publicRoutes)
  .use(publicLotLiveRoutes)
  .use(privateRoutes);
