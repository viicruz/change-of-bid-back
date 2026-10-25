//* Libraries imports
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";

//* Local imports
import { db } from "../db/index";
import * as schema from "../db/schema";

const pageOrigin = process.env.PAGE_ORIGIN;

if (!pageOrigin) {
  throw new Error("PAGE_ORIGIN is not set");
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: [pageOrigin],
  advanced: {
    database: {
      joins: true,
    },
  },
  plugins: [bearer()],
});
