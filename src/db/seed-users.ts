//* Libraries imports
import { generateId } from "@better-auth/core/utils/id";
import { and, eq } from "drizzle-orm";

//* Local imports
import { account, user } from "./schema";

//* Models imports
import { createWallet } from "../models/wallet";

export async function upsertSeedUser(
  database: Pick<typeof import("./index").db, "transaction">,
  seedUser: Pick<typeof user.$inferSelect, "name" | "email" | "role">,
  passwordHash: string,
) {
  return database.transaction(async (tx) => {
    const [existingUser] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, seedUser.email))
      .limit(1);
    const userId = existingUser?.id ?? generateId();

    if (existingUser) {
      await tx
        .update(user)
        .set({
          name: seedUser.name,
          role: seedUser.role,
          emailVerified: true,
        })
        .where(eq(user.id, userId));
    } else {
      await tx.insert(user).values({
        id: userId,
        name: seedUser.name,
        email: seedUser.email,
        emailVerified: true,
        role: seedUser.role,
      });
    }

    await createWallet(tx, userId);

    const [credentialAccount] = await tx
      .select({ id: account.id })
      .from(account)
      .where(
        and(eq(account.userId, userId), eq(account.providerId, "credential")),
      )
      .limit(1);

    if (credentialAccount) {
      await tx
        .update(account)
        .set({
          password: passwordHash,
          accountId: userId,
        })
        .where(eq(account.id, credentialAccount.id));

      return "updated" as const;
    }

    await tx.insert(account).values({
      id: generateId(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
    });

    return existingUser ? ("updated" as const) : ("created" as const);
  });
}
