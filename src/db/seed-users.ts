//* Libraries imports
import { generateId } from "@better-auth/core/utils/id";
import { and, eq } from "drizzle-orm";

//* Local imports
import { account, user } from "./schema";

//* Models imports
import { createWallet } from "../models/wallet";
import type { DatabaseExecutor } from "../models/executor";

type SeedUser = Pick<typeof user.$inferSelect, "name" | "email" | "role">;

export async function upsertSeedUser(
  database: Pick<typeof import("./index").db, "transaction">,
  seedUser: SeedUser,
  passwordHash: string,
) {
  return database.transaction(async (tx) => {
    const identity = await upsertSeedIdentity(tx, seedUser);

    await createWallet(tx, identity.id);

    const credentialOutcome = await upsertSeedCredential(tx, identity.id, passwordHash);

    return identity.existed ? ("updated" as const) : credentialOutcome;
  });
}

async function upsertSeedIdentity(
  tx: Pick<DatabaseExecutor, "select" | "update" | "insert">,
  seedUser: SeedUser,
) {
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

  return { id: userId, existed: existingUser !== undefined };
}

async function upsertSeedCredential(
  tx: Pick<DatabaseExecutor, "select" | "update" | "insert">,
  userId: string,
  passwordHash: string,
) {
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

  return "created" as const;
}
