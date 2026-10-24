//* Libraries imports
import "dotenv/config";
import { cors } from "@elysiajs/cors";
import { node } from "@elysiajs/node";
import { Elysia } from "elysia";

//* Local imports
import { auth } from "./lib/auth.ts";

const pageOrigin = process.env.PAGE_ORIGIN;

if (!pageOrigin) {
  throw new Error("PAGE_ORIGIN is not set");
}

const betterAuth = new Elysia({ name: "better-auth" })
  .mount(auth.handler)
  .macro({
    auth: {
      async resolve({ status, request: { headers } }) {
        const session = await auth.api.getSession({
          headers,
        });

        if (!session) return status(401);

        return {
          user: session.user,
          session: session.session,
        };
      },
    },
  });

export const app = new Elysia({ adapter: node() })
  .use(
    cors({
      origin: pageOrigin,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  )
  .use(betterAuth)
  .get("/", () => "Hello Elysia")
  .get("/user", ({ user }) => user, {
    auth: true,
  });
