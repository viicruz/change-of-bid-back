//* Libraries imports
import { generateId } from "@better-auth/core/utils/id";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, assert, beforeEach, describe, expect, it, vi } from "vitest";

//* Local imports
import { db } from "./index";
import { account, user, wallet } from "./schema";
import { upsertSeedUser } from "./seed-users";

vi.mock("@better-auth/core/utils/id", () => ({
  generateId: vi.fn(() => crypto.randomUUID()),
}));

const createdEmails: string[] = [];
const passwordHash = "already-hashed-seed-password";
let seedUser: Parameters<typeof upsertSeedUser>[1];

beforeEach(() => {
  vi.mocked(generateId).mockReset().mockImplementation(() => crypto.randomUUID());
  seedUser = {
    name: "Seed Bidder",
    email: `seed-user-${crypto.randomUUID()}@example.test`,
    role: "BIDDER",
  };
  createdEmails.push(seedUser.email);
});

afterEach(async () => {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(inArray(user.email, createdEmails));
  const ids = rows.map((row) => row.id);

  if (ids.length > 0) {
    await db.delete(wallet).where(inArray(wallet.userId, ids));
    await db.delete(account).where(inArray(account.userId, ids));
    await db.delete(user).where(inArray(user.id, ids));
  }
  createdEmails.length = 0;
});

afterAll(async () => {
  await db.$client.end();
});

async function readSeedUser() {
  const [storedUser] = await db.select().from(user).where(eq(user.email, seedUser.email));
  assert(storedUser, "Seed user was not found");
  const wallets = await db.select().from(wallet).where(eq(wallet.userId, storedUser.id));
  const credentials = await db.select().from(account).where(and(
    eq(account.userId, storedUser.id), eq(account.providerId, "credential"),
  ));
  expect(wallets).toHaveLength(1);
  expect(credentials).toHaveLength(1);
  return { storedUser, storedWallet: wallets[0], credential: credentials[0] };
}

async function insertExistingUser() {
  const id = crypto.randomUUID();
  await db.insert(user).values({
    ...seedUser, id, name: "Old Name", role: "AUCTIONEER", emailVerified: false,
  });
  return id;
}

describe("upsertSeedUser", () => {
  it.each(["BIDDER", "AUCTIONEER"] as const)("creates a %s with a wallet and linked credentials", async (role) => {
    seedUser.role = role;

    expect(await upsertSeedUser(db, seedUser, passwordHash)).toBe("created");

    const { storedUser, storedWallet, credential } = await readSeedUser();
    expect(storedUser).toMatchObject({ ...seedUser, emailVerified: true });
    expect(storedWallet).toMatchObject({
      userId: storedUser.id, totalBalance: "0.00", committedBalance: "0.00",
    });
    expect(credential).toMatchObject({
      accountId: storedUser.id, userId: storedUser.id, providerId: "credential", password: passwordHash,
    });
    expect(credential.id).not.toBe(storedUser.id);
  });

  it.each([
    { hasWallet: false, hasCredential: false },
    { hasWallet: false, hasCredential: true },
    { hasWallet: true, hasCredential: false },
    { hasWallet: true, hasCredential: true },
  ])("updates an existing user (wallet=$hasWallet, credential=$hasCredential)", async ({ hasWallet, hasCredential }) => {
    const id = await insertExistingUser();
    const walletId = crypto.randomUUID();
    const credentialId = crypto.randomUUID();
    if (hasWallet) {
      await db.insert(wallet).values({ id: walletId, userId: id, totalBalance: "4350.00", committedBalance: "125.00" });
    }
    if (hasCredential) {
      await db.insert(account).values({
        id: credentialId, userId: id, accountId: "old-account-id", providerId: "credential", password: "old-hash",
      });
    }
    const [oauth] = await db.insert(account).values({
      id: crypto.randomUUID(), userId: id, accountId: "external-id", providerId: "github", accessToken: "external-token",
    }).returning();

    expect(await upsertSeedUser(db, seedUser, passwordHash)).toBe("updated");

    const { storedUser, storedWallet, credential } = await readSeedUser();
    expect(storedUser).toMatchObject({ ...seedUser, id, emailVerified: true });
    expect(storedWallet).toMatchObject({
      userId: id,
      totalBalance: hasWallet ? "4350.00" : "0.00",
      committedBalance: hasWallet ? "125.00" : "0.00",
    });
    if (hasWallet) expect(storedWallet.id).toBe(walletId);
    expect(credential).toMatchObject({ accountId: id, userId: id, providerId: "credential", password: passwordHash });
    if (hasCredential) expect(credential.id).toBe(credentialId);
    expect(await db.select().from(account).where(eq(account.id, oauth.id))).toEqual([oauth]);
  });

  it("refreshes the password on a second run without duplicating identities or resetting balances", async () => {
    expect(await upsertSeedUser(db, seedUser, passwordHash)).toBe("created");
    const first = await readSeedUser();
    await db.update(wallet).set({ totalBalance: "900.00", committedBalance: "75.00" })
      .where(eq(wallet.id, first.storedWallet.id));

    expect(await upsertSeedUser(db, seedUser, "new-password-hash")).toBe("updated");

    const second = await readSeedUser();
    expect(second.storedUser.id).toBe(first.storedUser.id);
    expect(second.storedWallet).toMatchObject({
      id: first.storedWallet.id, userId: first.storedUser.id, totalBalance: "900.00", committedBalance: "75.00",
    });
    expect(second.credential).toMatchObject({
      id: first.credential.id, accountId: first.storedUser.id, userId: first.storedUser.id, password: "new-password-hash",
    });
    expect(generateId).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])("rolls back user and wallet writes when the credential insert fails (existing user=%s)", async (existing) => {
    const ownerEmail = `seed-owner-${crypto.randomUUID()}@example.test`;
    createdEmails.push(ownerEmail);
    const ownerId = crypto.randomUUID();
    const duplicateId = crypto.randomUUID();
    await db.insert(user).values({ id: ownerId, name: "Other user", email: ownerEmail });
    const [otherAccount] = await db.insert(account).values({
      id: duplicateId, userId: ownerId, accountId: ownerId, providerId: "credential", password: "other-password",
    }).returning();
    const id = existing ? await insertExistingUser() : crypto.randomUUID();
    const before = await db.select().from(user).where(eq(user.email, seedUser.email));
    if (!existing) vi.mocked(generateId).mockReturnValueOnce(id);
    vi.mocked(generateId).mockReturnValueOnce(duplicateId);

    await expect(upsertSeedUser(db, seedUser, passwordHash)).rejects.toMatchObject({ cause: { code: "23505" } });

    expect(await db.select().from(user).where(eq(user.email, seedUser.email))).toEqual(before);
    expect(await db.select().from(wallet).where(eq(wallet.userId, id))).toEqual([]);
    expect(await db.select().from(account).where(eq(account.userId, id))).toEqual([]);
    expect(await db.select().from(account).where(eq(account.id, duplicateId))).toEqual([otherAccount]);
  });

  it("rolls back credential updates and preserves an existing wallet when the transaction fails", async () => {
    await upsertSeedUser(db, seedUser, passwordHash);
    const before = await readSeedUser();
    const failure = new Error("Transaction failed after upsert");
    const failingDatabase: Parameters<typeof upsertSeedUser>[0] = {
      transaction: (work) => db.transaction(async (tx) => {
        await work(tx);
        throw failure;
      }),
    };

    await expect(upsertSeedUser(failingDatabase, { ...seedUser, name: "Changed Name", role: "AUCTIONEER" }, "changed-hash"))
      .rejects.toBe(failure);

    expect(await readSeedUser()).toEqual(before);
  });
});
