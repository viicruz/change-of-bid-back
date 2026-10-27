//* Libraries imports
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import { bearer, openAPI } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";

//* Local imports
import { db } from "../db/index";
import { env } from "../env";
import * as schema from "../db/schema";

//* Models imports
import { createWallet } from "../models/wallet";

async function removeUserCreatedWithoutWallet(userId: string) {
  try {
    await db.delete(schema.wallet).where(eq(schema.wallet.userId, userId));
    await db.delete(schema.user).where(eq(schema.user.id, userId));
  } catch {
    // Sign-up reports the wallet failure. Cleanup must not replace that error.
  }
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "BIDDER",
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          try {
            await createWallet(db, createdUser.id);
          } catch (error) {
            await removeUserCreatedWithoutWallet(createdUser.id);
            throw error;
          }
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: [env.PAGE_ORIGIN],
  advanced: {
    database: {
      joins: true,
    },
  },
  plugins: [bearer(), openAPI()],
});

let _schema: ReturnType<typeof auth.api.generateOpenAPISchema>
const getSchema = async () => (_schema ??= auth.api.generateOpenAPISchema())
export const OpenAPI = {
    getPaths: (prefix = '/api/auth') =>
        getSchema().then(({ paths }) => {
            const reference: typeof paths = Object.create(null)
            for (const path of Object.keys(paths)) {
                const key = prefix + path
                reference[key] = paths[path]
                for (const method of Object.keys(paths[path])) {
                    const operation = (reference[key] as any)[method]
                    operation.tags = ['Better Auth']
                }
            }
            return reference
        }) as Promise<any>,
    components: getSchema().then(({ components }) => components) as Promise<any>
} as const

export const betterAuthMacro = new Elysia({ name: "better-auth" })
  // .mount(auth.handler)
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