//* Libraries imports
import { generateId } from "@better-auth/core/utils/id";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";

//* Local imports
import { db } from "./index";
import { account, user } from "./schema";

const testPassword = "123123123";

const seedUsers = [
  {
    name: "Bidder",
    email: "bidder@bidder.bidder",
    role: "BIDDER",
  },
  {
    name: "Bidder 2",
    email: "bidder2@bidder.bidder",
    role: "BIDDER",
  },
  {
    name: "Auctioneer",
    email: "auctioneer@auctioneer.auctioneer",
    role: "AUCTIONEER",
  },
] as const;

async function upsertSeedUser(
  seedUser: (typeof seedUsers)[number],
  passwordHash: string,
) {
  return db.transaction(async (tx) => {
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

async function seed() {
  const passwordHash = await hashPassword(testPassword);

  for (const seedUser of seedUsers) {
    const action = await upsertSeedUser(seedUser, passwordHash);

    console.log(`${action} ${seedUser.email} (${seedUser.role})`);
  }
}

seed()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$client.end();
  });
