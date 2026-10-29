//* Libraries imports
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";

//* Local imports
import { app } from "../../app";
import { db } from "../../db/index";
import { bid, lot, lotParticipant, user, wallet, walletMovement } from "../../db/schema";
import { env } from "../../env";

const password = "Correct-horse-battery-1";
const bidderName = "Hidden Bidder Name";
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

function request(
  path: string,
  headers?: RequestInit["headers"],
  method = "GET",
  body?: string,
) {
  return new Request(`${baseUrl}${path}`, {
    method,
    headers,
    body,
  });
}

async function registerUser(role?: string): Promise<RegisteredUser> {
  const email = `bid-${crypto.randomUUID()}@example.com`;
  const response = await app.handle(
    request(
      "/api/auth/sign-up/email",
      {
        "content-type": "application/json",
        origin: pageOrigin,
      },
      "POST",
      JSON.stringify({
        name: bidderName,
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

  return {
    email,
    userId,
    token,
  };
}

function defaultLiveLotSchedule() {
  const startsAt = new Date(Date.now() - 60_000);

  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + 24 * 60 * 60 * 1000),
  };
}

async function insertLiveLot(
  auctioneerId: string,
  schedule?: {
    startsAt: Date;
    endsAt: Date;
    status?: "ACTIVE" | "ENDED" | "CANCELED";
  },
) {
  const { startsAt, endsAt } = schedule ?? defaultLiveLotSchedule();
  const status = schedule?.status ?? "ACTIVE";
  const rows = await db
    .insert(lot)
    .values({
      auctioneerId,
      title: "Bid route lot",
      openingBid: "10.00",
      minIncrement: "1.00",
      startsAt,
      originalEndsAt: endsAt,
      endsAt,
      status,
      endedAt: status === "ENDED" ? endsAt : null,
      canceledAt: status === "CANCELED" ? new Date() : null,
    })
    .returning({ id: lot.id, endsAt: lot.endsAt, extensionCount: lot.extensionCount });
  const row = rows[0];

  if (!row) {
    throw new Error("Insert lot did not return a row");
  }

  return row;
}

async function fundWallet(userId: string, totalBalance: string) {
  await db
    .update(wallet)
    .set({ totalBalance })
    .where(eq(wallet.userId, userId));
}

function postBid(token: string | undefined, lotId: string, amount: unknown) {
  return app.handle(
    request(
      `/private/lots/${lotId}/bids`,
      {
        "content-type": "application/json",
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
      "POST",
      JSON.stringify({ amount }),
    ),
  );
}

async function cleanup(emails: string[]) {
  if (emails.length === 0) {
    return;
  }

  const users = await db
    .select({ id: user.id })
    .from(user)
    .where(inArray(user.email, emails));
  const userIds = users.map((entry) => entry.id);

  if (userIds.length === 0) {
    return;
  }

  const wallets = await db
    .select({ id: wallet.id })
    .from(wallet)
    .where(inArray(wallet.userId, userIds));
  const walletIds = wallets.map((entry) => entry.id);
  const lots = await db
    .select({ id: lot.id })
    .from(lot)
    .where(inArray(lot.auctioneerId, userIds));
  const lotIds = lots.map((entry) => entry.id);

  if (walletIds.length > 0) {
    await db
      .delete(walletMovement)
      .where(inArray(walletMovement.walletId, walletIds));
  }

  if (lotIds.length > 0) {
    await db
      .update(lot)
      .set({ currentBidId: null, winnerId: null })
      .where(inArray(lot.id, lotIds));
    await db.delete(walletMovement).where(inArray(walletMovement.lotId, lotIds));
    await db.delete(bid).where(inArray(bid.lotId, lotIds));
    await db
      .delete(lotParticipant)
      .where(inArray(lotParticipant.lotId, lotIds));
    await db.delete(lot).where(inArray(lot.id, lotIds));
  }

  if (walletIds.length > 0) {
    await db.delete(wallet).where(inArray(wallet.id, walletIds));
  }

  await db.delete(user).where(inArray(user.id, userIds));
}

describe("POST /private/lots/:id/bids", () => {
  afterEach(async () => {
    const emails = createdEmails.splice(0, createdEmails.length);

    await cleanup(emails);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("rejects a request with no session and does not create a bid", async () => {
    const auctioneer = await registerUser("AUCTIONEER");
    const storedLot = await insertLiveLot(auctioneer.userId);
    const response = await postBid(undefined, storedLot.id, "10.00");
    const bids = await db
      .select({ id: bid.id })
      .from(bid)
      .where(eq(bid.lotId, storedLot.id));

    expect(response.status).toBe(401);
    expect(bids).toEqual([]);
  });

  it("rejects an authenticated auctioneer and does not create a bid", async () => {
    const auctioneer = await registerUser("AUCTIONEER");
    const storedLot = await insertLiveLot(auctioneer.userId);
    const response = await postBid(auctioneer.token, storedLot.id, "10.00");
    const body = (await response.json()) as { code?: string; message?: string };
    const bids = await db
      .select({ id: bid.id })
      .from(bid)
      .where(eq(bid.lotId, storedLot.id));

    expect(response.status).toBe(403);
    expect(body.code).toBe("NOT_BIDDER");
    expect(body.message).toEqual(expect.any(String));
    expect(bids).toEqual([]);
  });

  it("rejects an unknown lot", async () => {
    const bidder = await registerUser();
    const response = await postBid(bidder.token, crypto.randomUUID(), "10.00");
    const body = (await response.json()) as { code?: string };

    expect(response.status).toBe(404);
    expect(body.code).toBe("LOT_NOT_FOUND");
  });

  it("rejects an amount that is not valid money", async () => {
    const auctioneer = await registerUser("AUCTIONEER");
    const bidder = await registerUser();
    const storedLot = await insertLiveLot(auctioneer.userId);
    await fundWallet(bidder.userId, "100.00");
    const response = await postBid(bidder.token, storedLot.id, "10.001");
    const body = (await response.json()) as { code?: string };
    const bids = await db
      .select({ id: bid.id })
      .from(bid)
      .where(eq(bid.lotId, storedLot.id));

    expect(response.status).toBe(422);
    expect(body.code).toBe("INVALID_MONEY");
    expect(bids).toEqual([]);
  });

  it("rejects a bid below the opening amount", async () => {
    const auctioneer = await registerUser("AUCTIONEER");
    const bidder = await registerUser();
    const storedLot = await insertLiveLot(auctioneer.userId);
    await fundWallet(bidder.userId, "100.00");
    const response = await postBid(bidder.token, storedLot.id, "9.99");
    const body = (await response.json()) as { code?: string; message?: string };

    expect(response.status).toBe(409);
    expect(body.code).toBe("BID_BELOW_MINIMUM");
    expect(body.message).toEqual(expect.any(String));
  });

  it("returns the bid without the bidder email, name, or user id", async () => {
    const auctioneer = await registerUser("AUCTIONEER");
    const bidder = await registerUser();
    const storedLot = await insertLiveLot(auctioneer.userId);
    await fundWallet(bidder.userId, "100.00");
    const response = await postBid(bidder.token, storedLot.id, "10");
    const raw = await response.text();
    const body = JSON.parse(raw) as {
      id?: string;
      sequence?: number;
      amount?: string;
      createdAt?: string;
      participantNo?: number;
    };
    const [storedBid] = await db
      .select({
        id: bid.id,
        amount: bid.amount,
        sequence: bid.sequence,
        createdAt: bid.createdAt,
        participantNo: lotParticipant.participantNo,
        bidderId: bid.bidderId,
      })
      .from(bid)
      .innerJoin(lotParticipant, eq(bid.participantId, lotParticipant.id))
      .where(eq(bid.lotId, storedLot.id));
    const [storedLotRow] = await db
      .select({
        endsAt: lot.endsAt,
        extensionCount: lot.extensionCount,
        bidCount: lot.bidCount,
        headHash: lot.headHash,
      })
      .from(lot)
      .where(eq(lot.id, storedLot.id));

    expect(response.status).toBe(201);
    expect(raw).not.toContain(bidder.email);
    expect(raw).not.toContain(bidderName);
    expect(raw).not.toContain(bidder.userId);
    expect(raw).not.toContain(password);
    expect(raw).not.toContain(env.BID_HASH_SECRET);
    expect(Object.keys(body).sort()).toEqual([
      "amount",
      "createdAt",
      "endsAt",
      "extensionCount",
      "id",
      "participantNo",
      "sequence",
    ]);
    expect(body).toEqual({
      id: storedBid?.id,
      sequence: 1,
      amount: "10.00",
      createdAt: storedBid?.createdAt.toISOString(),
      participantNo: 1,
      endsAt: storedLot.endsAt.toISOString(),
      extensionCount: storedLot.extensionCount,
    });
    expect(storedBid).toMatchObject({
      bidderId: bidder.userId,
      amount: "10.00",
      sequence: 1,
      participantNo: 1,
    });
    expect(storedLotRow).toMatchObject({
      endsAt: storedLot.endsAt,
      extensionCount: storedLot.extensionCount,
      bidCount: 1,
    });
    expect(storedLotRow?.headHash).toEqual(expect.any(String));
  });

  it("rejects a bidder who cannot cover the opening amount", async () => {
    const auctioneer = await registerUser("AUCTIONEER");
    const bidder = await registerUser();
    const storedLot = await insertLiveLot(auctioneer.userId);
    await fundWallet(bidder.userId, "9.99");
    const response = await postBid(bidder.token, storedLot.id, "10.00");
    const body = (await response.json()) as { code?: string };

    expect(response.status).toBe(409);
    expect(body.code).toBe("INSUFFICIENT_BALANCE");
  });

  it("rejects the current leader", async () => {
    const auctioneer = await registerUser("AUCTIONEER");
    const bidder = await registerUser();
    const storedLot = await insertLiveLot(auctioneer.userId);
    await fundWallet(bidder.userId, "100.00");
    const first = await postBid(bidder.token, storedLot.id, "10.00");
    const response = await postBid(bidder.token, storedLot.id, "11.00");
    const body = (await response.json()) as { code?: string };

    expect(first.status).toBe(201);
    expect(response.status).toBe(409);
    expect(body.code).toBe("ALREADY_LEADER");
  });

  it("rejects a bid before the lot starts", async () => {
    const auctioneer = await registerUser("AUCTIONEER");
    const bidder = await registerUser();
    const startsAt = new Date(Date.now() + 60 * 60 * 1000);
    const storedLot = await insertLiveLot(auctioneer.userId, {
      startsAt,
      endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000),
    });
    await fundWallet(bidder.userId, "100.00");
    const response = await postBid(bidder.token, storedLot.id, "10.00");
    const body = (await response.json()) as { code?: string };

    expect(response.status).toBe(409);
    expect(body.code).toBe("LOT_NOT_STARTED");
  });

  it("rejects a bid after the lot ends", async () => {
    const auctioneer = await registerUser("AUCTIONEER");
    const bidder = await registerUser();
    const endsAt = new Date(Date.now() - 60_000);
    const storedLot = await insertLiveLot(auctioneer.userId, {
      startsAt: new Date(endsAt.getTime() - 2 * 60 * 60 * 1000),
      endsAt,
    });
    await fundWallet(bidder.userId, "100.00");
    const response = await postBid(bidder.token, storedLot.id, "10.00");
    const body = (await response.json()) as { code?: string };

    expect(response.status).toBe(409);
    expect(body.code).toBe("LOT_ENDED");
  });

  it("rejects a bid on a canceled lot", async () => {
    const auctioneer = await registerUser("AUCTIONEER");
    const bidder = await registerUser();
    const startsAt = new Date(Date.now() - 60_000);
    const storedLot = await insertLiveLot(auctioneer.userId, {
      startsAt,
      endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000),
      status: "CANCELED",
    });
    await fundWallet(bidder.userId, "100.00");
    const response = await postBid(bidder.token, storedLot.id, "10.00");
    const body = (await response.json()) as { code?: string };

    expect(response.status).toBe(409);
    expect(body.code).toBe("LOT_CANCELED");
  });

  it("extends the end by two minutes when the bid lands in the final window", async () => {
    const auctioneer = await registerUser("AUCTIONEER");
    const bidder = await registerUser();
    const startsAt = new Date(Date.now() - 60_000);
    const endsAt = new Date(Date.now() + 30_000);
    const storedLot = await insertLiveLot(auctioneer.userId, {
      startsAt,
      endsAt,
    });
    await fundWallet(bidder.userId, "100.00");
    const response = await postBid(bidder.token, storedLot.id, "10.00");
    const body = (await response.json()) as {
      endsAt?: string;
      extensionCount?: number;
    };
    const [stored] = await db
      .select({
        endsAt: lot.endsAt,
        extensionCount: lot.extensionCount,
        originalEndsAt: lot.originalEndsAt,
      })
      .from(lot)
      .where(eq(lot.id, storedLot.id));

    expect(response.status).toBe(201);
    expect(stored?.originalEndsAt).toEqual(endsAt);
    expect(stored?.extensionCount).toBe(1);
    expect(stored?.endsAt.getTime()).toBe(endsAt.getTime() + 2 * 60 * 1000);
    expect(body.extensionCount).toBe(1);
    expect(body.endsAt).toBe(stored?.endsAt.toISOString());
  });
});
