//* Libraries imports
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";

//* Local imports
import { app } from "../app";
import { db } from "../db/index";
import { user, wallet, walletMovement } from "../db/schema";

const password = "Correct-horse-battery-1";
const createdEmails: string[] = [];

function requiredEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

const baseUrl = requiredEnv("BETTER_AUTH_URL", process.env.BETTER_AUTH_URL);
const pageOrigin = requiredEnv("PAGE_ORIGIN", process.env.PAGE_ORIGIN);

function request(path: string, body: string) {
  return new Request(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: pageOrigin,
    },
    body,
  });
}

async function signUp() {
  const email = `wallet-${crypto.randomUUID()}@example.com`;
  const response = await app.handle(
    request(
      "/api/auth/sign-up/email",
      JSON.stringify({
        name: "Wallet Tester",
        email,
        password,
      }),
    ),
  );
  const rawBody = await response.text();

  if (!response.ok) {
    throw new Error(
      `Sign-up failed with status ${response.status}: ${rawBody}`,
    );
  }

  createdEmails.push(email);

  const body = JSON.parse(rawBody) as {
    user?: {
      id?: string;
    };
  };
  const userId = body.user?.id;

  if (!userId) {
    throw new Error("Sign-up did not return a user id");
  }

  return { email, userId };
}

async function readWallets(userId: string) {
  return db
    .select({
      id: wallet.id,
      userId: wallet.userId,
      totalBalance: wallet.totalBalance,
      committedBalance: wallet.committedBalance,
    })
    .from(wallet)
    .where(eq(wallet.userId, userId));
}

async function deleteUserByEmail(email: string) {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email));
  const userId = rows[0]?.id;

  if (userId) {
    await db.delete(wallet).where(eq(wallet.userId, userId));
  }

  await db.delete(user).where(eq(user.email, email));
}

describe("sign-up", () => {
  afterEach(async () => {
    const emails = createdEmails.splice(0, createdEmails.length);

    await Promise.all(emails.map((email) => deleteUserByEmail(email)));
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe("wallet", () => {
    it("creates a wallet linked to the new user", async () => {
      const account = await signUp();
      const wallets = await readWallets(account.userId);

      expect(wallets).toHaveLength(1);
      expect(wallets[0]?.userId).toBe(account.userId);
    });

    it("starts the wallet with zero total and committed balances", async () => {
      const account = await signUp();
      const wallets = await readWallets(account.userId);

      expect(wallets[0]?.totalBalance).toBe("0.00");
      expect(wallets[0]?.committedBalance).toBe("0.00");
    });

    it("does not record a wallet movement", async () => {
      const account = await signUp();
      const wallets = await readWallets(account.userId);
      const walletId = wallets[0]?.id;

      if (!walletId) {
        throw new Error("Sign-up did not create a wallet");
      }

      const movements = await db
        .select({ id: walletMovement.id })
        .from(walletMovement)
        .where(eq(walletMovement.walletId, walletId));

      expect(movements).toHaveLength(0);
    });

    it("creates only one wallet for the account", async () => {
      const account = await signUp();
      const wallets = await readWallets(account.userId);

      expect(wallets).toHaveLength(1);
    });
  });
});
