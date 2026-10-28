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
