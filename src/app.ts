//* Libraries imports
import "dotenv/config";
import { cors } from "@elysiajs/cors";
import { node } from "@elysiajs/node";
import { Elysia } from "elysia";
import { openapi } from '@elysia/openapi'

//* Local imports
import { auth, OpenAPI } from "./lib/auth";
import { env } from "./env";

//* Routes imports
import { privateRoutes } from "./routes/private";
import { publicLotLiveRoutes } from "./routes/public/lot-live";
import { publicRoutes } from "./routes/public";

export const app = new Elysia({ adapter: node() })
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
  .mount(auth.handler)
  .use(publicRoutes)
  .use(publicLotLiveRoutes)
  .use(privateRoutes);
