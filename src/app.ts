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
import { publicRoutes } from "./routes/public";

// const betterAuth = new Elysia({ name: "better-auth" })
//   .mount(auth.handler)
//   .macro({
//     auth: {
//       async resolve({ status, request: { headers } }) {
//         const session = await auth.api.getSession({
//           headers,
//         });

//         if (!session) return status(401);

//         return {
//           user: session.user,
//           session: session.session,
//         };
//       },
//     },
//   });

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
  // .use(betterAuth)
  .mount(auth.handler)
  .use(publicRoutes)
  .use(privateRoutes);
// .get("/user", ({ user }) => user, {
//   auth: true,
// });
