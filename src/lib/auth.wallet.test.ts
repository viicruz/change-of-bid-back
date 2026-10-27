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

function request(
  path: string,
  body: string,
  headers?: Record<string, string>,
) {
  return new Request(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: pageOrigin,
      ...headers,
    },
    body,
  });
}

async function signUp(role?: "BIDDER" | "AUCTIONEER") {
  const email = `wallet-${crypto.randomUUID()}@example.com`;
  const response = await app.handle(
    request(
      "/api/auth/sign-up/email",
      JSON.stringify({
        name: "Wallet Tester",
        email,
        password,
        ...(role === undefined ? {} : { role }),
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
  const token = response.headers.get("set-auth-token");

  if (!userId) {
    throw new Error("Sign-up did not return a user id");
  }

  if (!token) {
    throw new Error("Sign-up did not return a bearer token");
  }

  return { email, userId, token };
}

async function submitSignUp(role: unknown) {
  const email = `wallet-${crypto.randomUUID()}@example.com`;

  createdEmails.push(email);

  const response = await app.handle(
    request(
      "/api/auth/sign-up/email",
      JSON.stringify({
        name: "Wallet Tester",
        email,
        password,
        role,
      }),
    ),
  );

  return { email, response };
}

async function readRole(userId: string) {
  const [stored] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, userId));

  return stored?.role;
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

afterEach(async () => {
  const emails = createdEmails.splice(0, createdEmails.length);

  await Promise.all(emails.map((email) => deleteUserByEmail(email)));
});

afterAll(async () => {
  await db.$client.end();
});

describe("sign-up", () => {
  describe("role", () => {
    it("stores the bidder role when sign-up omits it", async () => {
      const account = await signUp();

      expect(await readRole(account.userId)).toBe("BIDDER");
    });

    it("stores the bidder role when sign-up sends it", async () => {
      const account = await signUp("BIDDER");

      expect(await readRole(account.userId)).toBe("BIDDER");
    });

    it("rejects an invalid role and does not create the user", async () => {
      const submitted = await submitSignUp("ADMIN");
      const rows = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, submitted.email));

      expect(submitted.response.ok).toBe(false);
      expect(submitted.response.status).toBe(400);
      expect(rows).toHaveLength(0);
    });
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

describe("update-user", () => {
  describe("role", () => {
    it("keeps the stored role when an authenticated update sends a new role", async () => {
      const account = await signUp("BIDDER");
      const response = await app.handle(
        request(
          "/api/auth/update-user",
          JSON.stringify({ role: "AUCTIONEER" }),
          { authorization: `Bearer ${account.token}` },
        ),
      );

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      expect(await readRole(account.userId)).toBe("BIDDER");
    });
  });
});
