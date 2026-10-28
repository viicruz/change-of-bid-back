//* Libraries imports
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";

//* Schemas imports
import { moneyValidationMessage } from "../../schemas/money";
import {
  MAX_MOVEMENT_PAGE,
  type WalletMovementRecord,
} from "../../schemas/wallet";

//* Local imports
import { app } from "../../app";
import { db } from "../../db/index";
import {
  bid,
  lot,
  lotParticipant,
  user,
  wallet,
  walletMovement,
} from "../../db/schema";

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

type RegisteredUser = {
  email: string;
  userId: string;
  token: string;
};

type WalletBody = {
  totalBalance?: string;
  committedBalance?: string;
  availableBalance?: string;
  code?: string;
  message?: string;
};

type MovementBody = {
  id?: string;
  type?: string;
  amount?: string;
  lotId?: string | null;
  bidId?: string | null;
  createdAt?: string;
};

type MovementListBody = {
  movements?: MovementBody[];
  page?: number;
  limit?: number;
  total?: number;
  code?: string;
  type?: string;
};

function request(
  path: string,
  headers?: RequestInit["headers"],
) {
  return new Request(`${baseUrl}${path}`, {
    method: "GET",
    headers,
  });
}

async function registerUser(
  role?: "BIDDER" | "AUCTIONEER",
): Promise<RegisteredUser> {
  const email = `wallet-${crypto.randomUUID()}@example.com`;
  const signUp = new Request(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: pageOrigin,
    },
    body: JSON.stringify({
      name: "Wallet Tester",
      email,
      password,
      ...(role === undefined ? {} : { role }),
    }),
  });
  const signUpResponse = await app.handle(signUp);
  const rawBody = await signUpResponse.text();

  if (!signUpResponse.ok) {
    throw new Error(
      `Sign-up failed with status ${signUpResponse.status}: ${rawBody}`,
    );
  }

  createdEmails.push(email);

  const body = JSON.parse(rawBody) as {
    user?: {
      id?: string;
    };
  };
  const userId = body.user?.id;
  const token = signUpResponse.headers.get("set-auth-token");

  if (!userId) {
    throw new Error("Sign-up did not return a user id");
  }

  if (!token) {
    throw new Error("Sign-up did not return a bearer token");
  }

  return {
    email,
    userId,
    token,
  };
}

async function registerAuctioneer() {
  return registerUser("AUCTIONEER");
}

async function setBalances(
  userId: string,
  totalBalance: string,
  committedBalance: string,
) {
  await db
    .update(wallet)
    .set({ totalBalance, committedBalance })
    .where(eq(wallet.userId, userId));
}

async function readWalletId(userId: string) {
  const rows = await db
    .select({ id: wallet.id })
    .from(wallet)
    .where(eq(wallet.userId, userId));
  const walletId = rows[0]?.id;

  if (!walletId) {
    throw new Error("Wallet was not found");
  }

  return walletId;
}

async function insertDeposit(values: {
  walletId: string;
  amount: string;
  createdAt: Date;
  id?: string;
}) {
  await db.insert(walletMovement).values({
    ...(values.id === undefined ? {} : { id: values.id }),
    walletId: values.walletId,
    type: "DEPOSIT",
    amount: values.amount,
    lotId: null,
    bidId: null,
    createdAt: values.createdAt,
  });
}

async function insertLotBid(userId: string) {
  const startsAt = new Date("2026-06-01T12:00:00.000Z");
  const endsAt = new Date("2026-06-02T12:00:00.000Z");
  const lotRows = await db
    .insert(lot)
    .values({
      auctioneerId: userId,
      title: "Wallet history lot",
      description: null,
      openingBid: "10.00",
      minIncrement: "1.00",
      startsAt,
      originalEndsAt: endsAt,
      endsAt,
    })
    .returning({ id: lot.id });
  const lotId = lotRows[0]?.id;

  if (!lotId) {
    throw new Error("Insert lot did not return a row");
  }

  const participantRows = await db
    .insert(lotParticipant)
    .values({
      lotId,
      userId,
      participantNo: 1,
    })
    .returning({ id: lotParticipant.id });
  const participantId = participantRows[0]?.id;

  if (!participantId) {
    throw new Error("Insert participant did not return a row");
  }

  const bidRows = await db
    .insert(bid)
    .values({
      lotId,
      participantId,
      bidderId: userId,
      sequence: 1,
      amount: "10.00",
      previousHash: "genesis",
      hash: "hash-1",
    })
    .returning({ id: bid.id });
  const bidId = bidRows[0]?.id;

  if (!bidId) {
    throw new Error("Insert bid did not return a row");
  }

  return { lotId, bidId };
}

async function insertMovement(values: {
  walletId: string;
  type: WalletMovementRecord["type"];
  amount: string;
  createdAt: Date;
  lotId: string | null;
  bidId: string | null;
}) {
  const rows = await db
    .insert(walletMovement)
    .values(values)
    .returning({ id: walletMovement.id });
  const id = rows[0]?.id;

  if (!id) {
    throw new Error("Insert wallet movement did not return a row");
  }

  return id;
}

function getWallet(token?: string) {
  return app.handle(
    request(
      "/private/wallet",
      token === undefined ? undefined : { authorization: `Bearer ${token}` },
    ),
  );
}

function getMovements(token: string | undefined, query = "") {
  return app.handle(
    request(
      `/private/wallet/movements${query}`,
      token === undefined ? undefined : { authorization: `Bearer ${token}` },
    ),
  );
}

function postDeposit(token: string | undefined, body: unknown) {
  return app.handle(
    new Request(`${baseUrl}/private/wallet/deposits`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
    }),
  );
}

async function readStoredWallet(userId: string) {
  const rows = await db
    .select({
      id: wallet.id,
      totalBalance: wallet.totalBalance,
      committedBalance: wallet.committedBalance,
    })
    .from(wallet)
    .where(eq(wallet.userId, userId));
  const stored = rows[0];

  if (!stored) {
    return null;
  }

  const movements = await db
    .select({
      type: walletMovement.type,
      amount: walletMovement.amount,
      lotId: walletMovement.lotId,
      bidId: walletMovement.bidId,
    })
    .from(walletMovement)
    .where(eq(walletMovement.walletId, stored.id));

  return {
    totalBalance: stored.totalBalance,
    committedBalance: stored.committedBalance,
    movements,
  };
}

async function deleteUserByEmail(email: string) {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email));
  const userId = rows[0]?.id;

  if (!userId) {
    return;
  }

  const wallets = await db
    .select({ id: wallet.id })
    .from(wallet)
    .where(eq(wallet.userId, userId));
  const walletIds = wallets.map((entry) => entry.id);

  if (walletIds.length > 0) {
    await db
      .delete(walletMovement)
      .where(inArray(walletMovement.walletId, walletIds));
  }

  const lots = await db
    .select({ id: lot.id })
    .from(lot)
    .where(eq(lot.auctioneerId, userId));
  const lotIds = lots.map((entry) => entry.id);

  if (lotIds.length > 0) {
    await db
      .update(lot)
      .set({ currentBidId: null, winnerId: null })
      .where(inArray(lot.id, lotIds));
    await db
      .delete(walletMovement)
      .where(inArray(walletMovement.lotId, lotIds));
    await db.delete(bid).where(inArray(bid.lotId, lotIds));
    await db
      .delete(lotParticipant)
      .where(inArray(lotParticipant.lotId, lotIds));
    await db.delete(lot).where(inArray(lot.id, lotIds));
  }

  if (walletIds.length > 0) {
    await db.delete(wallet).where(inArray(wallet.id, walletIds));
  }

  await db.delete(user).where(eq(user.id, userId));
}

afterAll(async () => {
  await db.$client.end();
});

describe("GET /private/wallet", () => {
  afterEach(async () => {
    const emails = createdEmails.splice(0, createdEmails.length);

    await Promise.all(emails.map((email) => deleteUserByEmail(email)));
  });

  describe("authentication", () => {
    it("rejects a request with no session", async () => {
      const response = await getWallet();

      expect(response.status).toBe(401);
    });

    it("rejects a malformed bearer token", async () => {
      const response = await getWallet("not-a-session");

      expect(response.status).toBe(401);
    });
  });

  describe("balances", () => {
    it("returns the bidder wallet with available balance equal to total minus committed", async () => {
      const account = await registerUser();

      await setBalances(account.userId, "10.10", "0.01");

      const response = await getWallet(account.token);
      const body = (await response.json()) as WalletBody;

      expect(response.status).toBe(200);
      expect(body).toEqual({
        totalBalance: "10.10",
        committedBalance: "0.01",
        availableBalance: "10.09",
      });
    });

    it("returns the auctioneer wallet", async () => {
      const account = await registerAuctioneer();

      await setBalances(account.userId, "25.00", "0.00");

      const response = await getWallet(account.token);
      const body = (await response.json()) as WalletBody;

      expect(response.status).toBe(200);
      expect(body).toEqual({
        totalBalance: "25.00",
        committedBalance: "0.00",
        availableBalance: "25.00",
      });
    });

    it("returns only the wallet of the authenticated user", async () => {
      const first = await registerUser();
      const second = await registerUser();

      await setBalances(first.userId, "10.00", "2.00");
      await setBalances(second.userId, "3.00", "1.00");

      const firstResponse = await getWallet(first.token);
      const secondResponse = await getWallet(second.token);
      const firstBody = (await firstResponse.json()) as WalletBody;
      const secondBody = (await secondResponse.json()) as WalletBody;

      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(200);
      expect(firstBody).toEqual({
        totalBalance: "10.00",
        committedBalance: "2.00",
        availableBalance: "8.00",
      });
      expect(secondBody).toEqual({
        totalBalance: "3.00",
        committedBalance: "1.00",
        availableBalance: "2.00",
      });
    });

    it("returns zero available balance when the committed balance equals the total", async () => {
      const account = await registerUser();

      await setBalances(account.userId, "8.00", "8.00");

      const response = await getWallet(account.token);
      const body = (await response.json()) as WalletBody;

      expect(response.status).toBe(200);
      expect(body).toEqual({
        totalBalance: "8.00",
        committedBalance: "8.00",
        availableBalance: "0.00",
      });
    });
  });

  describe("missing wallet", () => {
    it("returns not found when the wallet row is gone", async () => {
      const account = await registerUser();

      await db.delete(wallet).where(eq(wallet.userId, account.userId));

      const response = await getWallet(account.token);
      const body = (await response.json()) as WalletBody;

      expect(response.status).toBe(404);
      expect(body.code).toBe("WALLET_NOT_FOUND");
      expect(body.message).toBe("Wallet was not found.");
    });
  });
});

describe("GET /private/wallet/movements", () => {
  afterEach(async () => {
    const emails = createdEmails.splice(0, createdEmails.length);

    await Promise.all(emails.map((email) => deleteUserByEmail(email)));
  });

  describe("authentication", () => {
    it("rejects a request with no session", async () => {
      const response = await getMovements(undefined);

      expect(response.status).toBe(401);
    });

    it("rejects a malformed bearer token", async () => {
      const response = await getMovements("not-a-session");

      expect(response.status).toBe(401);
    });
  });

  describe("listing", () => {
    it("returns an empty page when the wallet has no movements", async () => {
      const account = await registerUser();
      const response = await getMovements(account.token);
      const body = (await response.json()) as MovementListBody;

      expect(response.status).toBe(200);
      expect(body).toEqual({
        movements: [],
        page: 1,
        limit: 20,
        total: 0,
      });
    });

    it("returns the newest movements first and keeps the next page disjoint", async () => {
      const account = await registerUser();
      const walletId = await readWalletId(account.userId);
      const oldest = new Date("2026-01-01T00:00:00.000Z");
      const middle = new Date("2026-01-02T00:00:00.000Z");
      const newest = new Date("2026-01-03T00:00:00.000Z");

      await insertDeposit({
        walletId,
        amount: "1.00",
        createdAt: oldest,
      });
      await insertDeposit({
        walletId,
        amount: "2.00",
        createdAt: middle,
      });
      await insertDeposit({
        walletId,
        amount: "3.50",
        createdAt: newest,
      });

      const firstResponse = await getMovements(account.token, "?page=1&limit=2");
      const secondResponse = await getMovements(
        account.token,
        "?page=2&limit=2",
      );
      const firstBody = (await firstResponse.json()) as MovementListBody;
      const secondBody = (await secondResponse.json()) as MovementListBody;
      const firstIds = firstBody.movements?.map((movement) => movement.id);
      const secondIds = secondBody.movements?.map((movement) => movement.id);

      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(200);
      expect(firstBody.page).toBe(1);
      expect(firstBody.limit).toBe(2);
      expect(firstBody.total).toBe(3);
      expect(firstBody.movements).toEqual([
        {
          id: firstIds?.[0],
          type: "DEPOSIT",
          amount: "3.50",
          lotId: null,
          bidId: null,
          createdAt: newest.toISOString(),
        },
        {
          id: firstIds?.[1],
          type: "DEPOSIT",
          amount: "2.00",
          lotId: null,
          bidId: null,
          createdAt: middle.toISOString(),
        },
      ]);
      expect(secondBody).toMatchObject({
        page: 2,
        limit: 2,
        total: 3,
      });
      expect(secondBody.movements).toEqual([
        {
          id: secondIds?.[0],
          type: "DEPOSIT",
          amount: "1.00",
          lotId: null,
          bidId: null,
          createdAt: oldest.toISOString(),
        },
      ]);
      expect(secondIds?.every((id) => !(firstIds ?? []).includes(id))).toBe(
        true,
      );
    });

    it("orders movements with the same timestamp by id descending", async () => {
      const account = await registerUser();
      const walletId = await readWalletId(account.userId);
      const createdAt = new Date("2026-02-01T12:00:00.000Z");
      const lowerId = "00000000-0000-4000-8000-000000000001";
      const higherId = "00000000-0000-4000-8000-000000000002";

      await insertDeposit({
        id: lowerId,
        walletId,
        amount: "1.00",
        createdAt,
      });
      await insertDeposit({
        id: higherId,
        walletId,
        amount: "4.00",
        createdAt,
      });

      const response = await getMovements(account.token, "?limit=2");
      const body = (await response.json()) as MovementListBody;

      expect(response.status).toBe(200);
      expect(body.movements?.map((movement) => movement.id)).toEqual([
        higherId,
        lowerId,
      ]);
    });

    it("hides movements that belong to another wallet", async () => {
      const owner = await registerUser();
      const other = await registerUser();
      const ownerWalletId = await readWalletId(owner.userId);

      await insertDeposit({
        walletId: ownerWalletId,
        amount: "8.00",
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
      });

      const response = await getMovements(other.token);
      const body = (await response.json()) as MovementListBody;

      expect(response.status).toBe(200);
      expect(body).toEqual({
        movements: [],
        page: 1,
        limit: 20,
        total: 0,
      });
    });

    it("returns an empty page past the last movement and keeps the total", async () => {
      const account = await registerUser();
      const walletId = await readWalletId(account.userId);

      await insertDeposit({
        walletId,
        amount: "4.00",
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
      });

      const response = await getMovements(account.token, "?page=2&limit=1");
      const body = (await response.json()) as MovementListBody;

      expect(response.status).toBe(200);
      expect(body).toEqual({
        movements: [],
        page: 2,
        limit: 1,
        total: 1,
      });
    });

    it("returns only the newest movement when the limit is 1", async () => {
      const account = await registerUser();
      const walletId = await readWalletId(account.userId);
      const older = new Date("2026-05-02T00:00:00.000Z");
      const newer = new Date("2026-05-03T00:00:00.000Z");

      await insertDeposit({
        walletId,
        amount: "1.00",
        createdAt: older,
      });
      await insertDeposit({
        walletId,
        amount: "2.00",
        createdAt: newer,
      });

      const response = await getMovements(account.token, "?limit=1");
      const body = (await response.json()) as MovementListBody;

      expect(response.status).toBe(200);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(1);
      expect(body.total).toBe(2);
      expect(body.movements).toEqual([
        {
          id: body.movements?.[0]?.id,
          type: "DEPOSIT",
          amount: "2.00",
          lotId: null,
          bidId: null,
          createdAt: newer.toISOString(),
        },
      ]);
    });

    it("accepts the maximum limit of 50", async () => {
      const account = await registerUser();
      const walletId = await readWalletId(account.userId);
      const createdAt = new Date("2026-05-04T00:00:00.000Z");

      await insertDeposit({
        walletId,
        amount: "7.00",
        createdAt,
      });

      const response = await getMovements(account.token, "?limit=50");
      const body = (await response.json()) as MovementListBody;

      expect(response.status).toBe(200);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(50);
      expect(body.total).toBe(1);
      expect(body.movements).toEqual([
        {
          id: body.movements?.[0]?.id,
          type: "DEPOSIT",
          amount: "7.00",
          lotId: null,
          bidId: null,
          createdAt: createdAt.toISOString(),
        },
      ]);
    });

    it("returns every movement type with its lot and bid links", async () => {
      const account = await registerUser();
      const walletId = await readWalletId(account.userId);
      const ledger = await insertLotBid(account.userId);
      const depositAt = new Date("2026-04-01T00:00:00.000Z");
      const holdAt = new Date("2026-04-02T00:00:00.000Z");
      const releaseAt = new Date("2026-04-03T00:00:00.000Z");
      const debitAt = new Date("2026-04-04T00:00:00.000Z");
      const creditAt = new Date("2026-04-05T00:00:00.000Z");
      const depositId = await insertMovement({
        walletId,
        type: "DEPOSIT",
        amount: "1.00",
        createdAt: depositAt,
        lotId: null,
        bidId: null,
      });
      const holdId = await insertMovement({
        walletId,
        type: "HOLD",
        amount: "2.00",
        createdAt: holdAt,
        lotId: ledger.lotId,
        bidId: ledger.bidId,
      });
      const releaseId = await insertMovement({
        walletId,
        type: "RELEASE",
        amount: "2.00",
        createdAt: releaseAt,
        lotId: ledger.lotId,
        bidId: ledger.bidId,
      });
      const debitId = await insertMovement({
        walletId,
        type: "SETTLEMENT_DEBIT",
        amount: "3.00",
        createdAt: debitAt,
        lotId: ledger.lotId,
        bidId: null,
      });
      const creditId = await insertMovement({
        walletId,
        type: "SETTLEMENT_CREDIT",
        amount: "3.00",
        createdAt: creditAt,
        lotId: ledger.lotId,
        bidId: null,
      });

      const response = await getMovements(account.token);
      const body = (await response.json()) as MovementListBody;

      expect(response.status).toBe(200);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);
      expect(body.total).toBe(5);
      expect(body.movements).toEqual([
        {
          id: creditId,
          type: "SETTLEMENT_CREDIT",
          amount: "3.00",
          lotId: ledger.lotId,
          bidId: null,
          createdAt: creditAt.toISOString(),
        },
        {
          id: debitId,
          type: "SETTLEMENT_DEBIT",
          amount: "3.00",
          lotId: ledger.lotId,
          bidId: null,
          createdAt: debitAt.toISOString(),
        },
        {
          id: releaseId,
          type: "RELEASE",
          amount: "2.00",
          lotId: ledger.lotId,
          bidId: ledger.bidId,
          createdAt: releaseAt.toISOString(),
        },
        {
          id: holdId,
          type: "HOLD",
          amount: "2.00",
          lotId: ledger.lotId,
          bidId: ledger.bidId,
          createdAt: holdAt.toISOString(),
        },
        {
          id: depositId,
          type: "DEPOSIT",
          amount: "1.00",
          lotId: null,
          bidId: null,
          createdAt: depositAt.toISOString(),
        },
      ]);
    });

    it("ignores a user id in the query and returns the authenticated wallet", async () => {
      const owner = await registerUser();
      const other = await registerUser();
      const ownerWalletId = await readWalletId(owner.userId);
      const otherWalletId = await readWalletId(other.userId);

      await insertDeposit({
        walletId: ownerWalletId,
        amount: "6.00",
        createdAt: new Date("2026-05-05T00:00:00.000Z"),
      });
      await insertDeposit({
        walletId: otherWalletId,
        amount: "9.00",
        createdAt: new Date("2026-05-06T00:00:00.000Z"),
      });

      const response = await getMovements(
        owner.token,
        `?userId=${other.userId}`,
      );
      const body = (await response.json()) as MovementListBody;

      expect(response.status).toBe(200);
      expect(body.total).toBe(1);
      expect(body.movements).toEqual([
        {
          id: body.movements?.[0]?.id,
          type: "DEPOSIT",
          amount: "6.00",
          lotId: null,
          bidId: null,
          createdAt: "2026-05-05T00:00:00.000Z",
        },
      ]);
    });
  });

  describe("query validation", () => {
    it("rejects a page below 1", async () => {
      const account = await registerUser();
      const response = await getMovements(account.token, "?page=0");
      const body = (await response.json()) as MovementListBody;

      expect(response.status).toBe(422);
      expect(body.type).toBe("validation");
    });

    it("rejects a limit above 50", async () => {
      const account = await registerUser();
      const response = await getMovements(account.token, "?limit=51");
      const body = (await response.json()) as MovementListBody;

      expect(response.status).toBe(422);
      expect(body.type).toBe("validation");
    });

    it("rejects a limit that is not an integer", async () => {
      const account = await registerUser();
      const response = await getMovements(account.token, "?limit=1.5");
      const body = (await response.json()) as MovementListBody;

      expect(response.status).toBe(422);
      expect(body.type).toBe("validation");
    });

    it("rejects a page that is not a number", async () => {
      const account = await registerUser();
      const response = await getMovements(account.token, "?page=abc");
      const body = (await response.json()) as MovementListBody;

      expect(response.status).toBe(422);
      expect(body.type).toBe("validation");
    });

    it("rejects a limit of zero", async () => {
      const account = await registerUser();
      const response = await getMovements(account.token, "?limit=0");
      const body = (await response.json()) as MovementListBody;

      expect(response.status).toBe(422);
      expect(body.type).toBe("validation");
    });

    it("rejects a page above the maximum", async () => {
      const account = await registerUser();
      const response = await getMovements(
        account.token,
        `?page=${MAX_MOVEMENT_PAGE + 1}`,
      );
      const body = (await response.json()) as MovementListBody;

      expect(response.status).toBe(422);
      expect(body.type).toBe("validation");
    });

    it("accepts the maximum page", async () => {
      const account = await registerUser();
      const response = await getMovements(
        account.token,
        `?page=${MAX_MOVEMENT_PAGE}`,
      );
      const body = (await response.json()) as MovementListBody;

      expect(response.status).toBe(200);
      expect(body).toEqual({
        movements: [],
        page: MAX_MOVEMENT_PAGE,
        limit: 20,
        total: 0,
      });
    });
  });

  describe("missing wallet", () => {
    it("returns not found when the wallet row is gone", async () => {
      const account = await registerUser();

      await db.delete(wallet).where(eq(wallet.userId, account.userId));

      const response = await getMovements(account.token);
      const body = (await response.json()) as MovementListBody;

      expect(response.status).toBe(404);
      expect(body.code).toBe("WALLET_NOT_FOUND");
    });
  });
});

describe("POST /private/wallet/deposits", () => {
  afterEach(async () => {
    const emails = createdEmails.splice(0, createdEmails.length);

    await Promise.all(emails.map((email) => deleteUserByEmail(email)));
  });

  describe("authentication", () => {
    it("rejects a request with no session", async () => {
      const response = await postDeposit(undefined, { amount: "1.00" });

      expect(response.status).toBe(401);
    });

    it("rejects a malformed bearer token", async () => {
      const response = await postDeposit("not-a-session", { amount: "1.00" });

      expect(response.status).toBe(401);
    });
  });

  describe("crediting the caller", () => {
    it("increases total and available by the deposit and keeps the committed balance", async () => {
      const account = await registerUser();

      await setBalances(account.userId, "10.00", "4.00");

      const response = await postDeposit(account.token, { amount: "2.5" });
      const body = (await response.json()) as WalletBody;
      const stored = await readStoredWallet(account.userId);

      expect(response.status).toBe(201);
      expect(body).toEqual({
        totalBalance: "12.50",
        committedBalance: "4.00",
        availableBalance: "8.50",
      });
      expect(stored?.movements).toEqual([
        {
          type: "DEPOSIT",
          amount: "2.50",
          lotId: null,
          bidId: null,
        },
      ]);
    });

    it("adds a second deposit on top of the first", async () => {
      const account = await registerUser();

      await setBalances(account.userId, "8.00", "3.00");

      const first = await postDeposit(account.token, { amount: "1.50" });
      const second = await postDeposit(account.token, { amount: "0.50" });
      const firstBody = (await first.json()) as WalletBody;
      const secondBody = (await second.json()) as WalletBody;
      const stored = await readStoredWallet(account.userId);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(firstBody).toEqual({
        totalBalance: "9.50",
        committedBalance: "3.00",
        availableBalance: "6.50",
      });
      expect(secondBody).toEqual({
        totalBalance: "10.00",
        committedBalance: "3.00",
        availableBalance: "7.00",
      });
      expect(stored?.movements).toHaveLength(2);
    });

    it("applies two concurrent deposits without losing either credit", async () => {
      const account = await registerUser();

      await setBalances(account.userId, "0.00", "0.00");

      const responses = await Promise.all([
        postDeposit(account.token, { amount: "10.00" }),
        postDeposit(account.token, { amount: "10.00" }),
      ]);
      const bodies = await Promise.all(
        responses.map(async (response) => (await response.json()) as WalletBody),
      );
      const stored = await readStoredWallet(account.userId);
      const totals = bodies.map((body) => body.totalBalance).sort();

      expect(responses.map((response) => response.status)).toEqual([201, 201]);
      expect(totals).toEqual(["10.00", "20.00"]);
      expect(stored).toMatchObject({
        totalBalance: "20.00",
        committedBalance: "0.00",
      });
      expect(stored?.movements).toEqual([
        {
          type: "DEPOSIT",
          amount: "10.00",
          lotId: null,
          bidId: null,
        },
        {
          type: "DEPOSIT",
          amount: "10.00",
          lotId: null,
          bidId: null,
        },
      ]);
    });

    it("credits the authenticated user when the body names another user", async () => {
      const caller = await registerUser();
      const other = await registerUser();

      await setBalances(caller.userId, "1.00", "0.00");
      await setBalances(other.userId, "5.00", "2.00");

      const response = await postDeposit(caller.token, {
        amount: "4.00",
        userId: other.userId,
      });
      const body = (await response.json()) as WalletBody;
      const callerWallet = await readStoredWallet(caller.userId);
      const otherWallet = await readStoredWallet(other.userId);

      expect(response.status).toBe(201);
      expect(body).toEqual({
        totalBalance: "5.00",
        committedBalance: "0.00",
        availableBalance: "5.00",
      });
      expect(callerWallet?.movements).toEqual([
        {
          type: "DEPOSIT",
          amount: "4.00",
          lotId: null,
          bidId: null,
        },
      ]);
      expect(otherWallet).toMatchObject({
        totalBalance: "5.00",
        committedBalance: "2.00",
        movements: [],
      });
    });

    it("credits one cent", async () => {
      const account = await registerUser();

      await setBalances(account.userId, "0.00", "0.00");

      const response = await postDeposit(account.token, { amount: "0.01" });
      const body = (await response.json()) as WalletBody;
      const stored = await readStoredWallet(account.userId);

      expect(response.status).toBe(201);
      expect(body).toEqual({
        totalBalance: "0.01",
        committedBalance: "0.00",
        availableBalance: "0.01",
      });
      expect(stored).toMatchObject({
        totalBalance: "0.01",
        committedBalance: "0.00",
      });
      expect(stored?.movements).toEqual([
        {
          type: "DEPOSIT",
          amount: "0.01",
          lotId: null,
          bidId: null,
        },
      ]);
    });

    it("increases total and available when the committed balance equals the total", async () => {
      const account = await registerUser();

      await setBalances(account.userId, "8.00", "8.00");

      const response = await postDeposit(account.token, { amount: "1.25" });
      const body = (await response.json()) as WalletBody;
      const stored = await readStoredWallet(account.userId);

      expect(response.status).toBe(201);
      expect(body).toEqual({
        totalBalance: "9.25",
        committedBalance: "8.00",
        availableBalance: "1.25",
      });
      expect(stored).toMatchObject({
        totalBalance: "9.25",
        committedBalance: "8.00",
      });
      expect(stored?.movements).toEqual([
        {
          type: "DEPOSIT",
          amount: "1.25",
          lotId: null,
          bidId: null,
        },
      ]);
    });

    it("trims surrounding spaces and stores two decimal places", async () => {
      const account = await registerUser();

      await setBalances(account.userId, "10.00", "4.00");

      const response = await postDeposit(account.token, { amount: " 2.5 " });
      const body = (await response.json()) as WalletBody;
      const stored = await readStoredWallet(account.userId);

      expect(response.status).toBe(201);
      expect(body).toEqual({
        totalBalance: "12.50",
        committedBalance: "4.00",
        availableBalance: "8.50",
      });
      expect(stored).toMatchObject({
        totalBalance: "12.50",
        committedBalance: "4.00",
      });
      expect(stored?.movements).toEqual([
        {
          type: "DEPOSIT",
          amount: "2.50",
          lotId: null,
          bidId: null,
        },
      ]);
    });

    it("credits the largest allowed deposit", async () => {
      const account = await registerUser();
      const maximum = "1000000.00";

      await setBalances(account.userId, "0.00", "0.00");

      const response = await postDeposit(account.token, { amount: maximum });
      const body = (await response.json()) as WalletBody;
      const stored = await readStoredWallet(account.userId);

      expect(response.status).toBe(201);
      expect(body).toEqual({
        totalBalance: maximum,
        committedBalance: "0.00",
        availableBalance: maximum,
      });
      expect(stored).toMatchObject({
        totalBalance: maximum,
        committedBalance: "0.00",
      });
      expect(stored?.movements).toEqual([
        {
          type: "DEPOSIT",
          amount: maximum,
          lotId: null,
          bidId: null,
        },
      ]);
    });
  });

  describe("authorization", () => {
    it("rejects an auctioneer without changing the wallet", async () => {
      const account = await registerAuctioneer();

      await setBalances(account.userId, "25.00", "0.00");

      const before = await readStoredWallet(account.userId);
      const response = await postDeposit(account.token, { amount: "10.00" });
      const body = (await response.json()) as WalletBody;
      const after = await readStoredWallet(account.userId);

      expect(response.status).toBe(403);
      expect(body.code).toBe("NOT_BIDDER");
      expect(body.message).toBe("Only a bidder can deposit into a wallet.");
      expect(after).toEqual(before);
    });

    it("rejects an auctioneer who claims the bidder role and another user", async () => {
      const auctioneer = await registerAuctioneer();
      const bidder = await registerUser();

      await setBalances(auctioneer.userId, "25.00", "0.00");
      await setBalances(bidder.userId, "5.00", "1.00");

      const auctioneerBefore = await readStoredWallet(auctioneer.userId);
      const bidderBefore = await readStoredWallet(bidder.userId);
      const response = await postDeposit(auctioneer.token, {
        amount: "10.00",
        role: "BIDDER",
        userId: bidder.userId,
      });
      const body = (await response.json()) as WalletBody;
      const auctioneerAfter = await readStoredWallet(auctioneer.userId);
      const bidderAfter = await readStoredWallet(bidder.userId);

      expect(response.status).toBe(403);
      expect(body.code).toBe("NOT_BIDDER");
      expect(body.message).toBe("Only a bidder can deposit into a wallet.");
      expect(auctioneerAfter).toEqual(auctioneerBefore);
      expect(bidderAfter).toEqual(bidderBefore);
    });
  });

  describe("missing wallet", () => {
    it("returns not found when the wallet row is gone", async () => {
      const account = await registerUser();

      await db.delete(wallet).where(eq(wallet.userId, account.userId));

      const response = await postDeposit(account.token, { amount: "1.00" });
      const body = (await response.json()) as WalletBody;
      const stored = await readStoredWallet(account.userId);

      expect(response.status).toBe(404);
      expect(body.code).toBe("WALLET_NOT_FOUND");
      expect(body.message).toBe("Wallet was not found.");
      expect(stored).toBeNull();
    });
  });

  describe("amount validation", () => {
    async function expectUnchangedBalance(body: unknown) {
      const account = await registerUser();

      await setBalances(account.userId, "12.00", "3.00");

      const before = await readStoredWallet(account.userId);
      const response = await postDeposit(account.token, body);
      const responseBody = (await response.json()) as WalletBody;
      const after = await readStoredWallet(account.userId);

      expect(response.status).toBe(422);
      expect(responseBody.code).toBe("INVALID_MONEY");
      expect(responseBody.message).toBe(moneyValidationMessage);
      expect(after).toEqual(before);
    }

    it("rejects zero", async () => {
      await expectUnchangedBalance({ amount: "0" });
    });

    it("rejects zero with decimals", async () => {
      await expectUnchangedBalance({ amount: "0.00" });
    });

    it("rejects a negative amount", async () => {
      await expectUnchangedBalance({ amount: "-1.00" });
    });

    it("rejects more than two decimal places", async () => {
      await expectUnchangedBalance({ amount: "1.234" });
    });

    it("rejects a non-numeric amount", async () => {
      await expectUnchangedBalance({ amount: "abc" });
    });

    it("rejects a numeric JSON amount", async () => {
      await expectUnchangedBalance({ amount: 10.5 });
    });

    it("rejects a body without an amount", async () => {
      await expectUnchangedBalance({});
    });

    it("rejects an empty amount", async () => {
      await expectUnchangedBalance({ amount: "" });
    });

    it("rejects a null amount", async () => {
      await expectUnchangedBalance({ amount: null });
    });

    it("rejects a leading zero", async () => {
      await expectUnchangedBalance({ amount: "01.50" });
    });

    it("rejects a leading plus sign", async () => {
      await expectUnchangedBalance({ amount: "+1.00" });
    });

    it("rejects a deposit above the business limit", async () => {
      await expectUnchangedBalance({ amount: "1000000.01" });
    });
  });

  describe("balance limit", () => {
    it("rejects a deposit that would overflow the balance limit", async () => {
      const account = await registerUser();

      await setBalances(account.userId, "9999999999999999.99", "0.00");

      const before = await readStoredWallet(account.userId);
      const response = await postDeposit(account.token, { amount: "0.01" });
      const body = (await response.json()) as WalletBody;
      const after = await readStoredWallet(account.userId);

      expect(response.status).toBe(422);
      expect(body.code).toBe("AMOUNT_OUT_OF_RANGE");
      expect(body.message).toBe(
        "The deposit exceeds the wallet balance limit.",
      );
      expect(after).toEqual(before);
    });
  });
});
