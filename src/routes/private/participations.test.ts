//* Libraries imports
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";

//* Local imports
import { app } from "../../app";
import { db } from "../../db/index";
import {
  bid,
  card,
  lot,
  lotItem,
  lotParticipant,
  user,
  wallet,
  walletMovement,
} from "../../db/schema";

const password = "Correct-horse-battery-1";
const createdEmails: string[] = [];
const createdCardIds: number[] = [];

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
  name: string;
  userId: string;
  token: string;
};

function request(path: string, headers?: RequestInit["headers"]) {
  return new Request(`${baseUrl}${path}`, {
    method: "GET",
    headers,
  });
}

async function registerUser(
  role: "BIDDER" | "AUCTIONEER",
  name: string,
): Promise<RegisteredUser> {
  const email = `participation-${crypto.randomUUID()}@example.com`;
  const response = await app.handle(
    new Request(`${baseUrl}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: pageOrigin,
      },
      body: JSON.stringify({
        name,
        email,
        password,
        role,
      }),
    }),
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
    name,
    userId,
    token,
  };
}

function randomCardId() {
  return 1_000_000_000 + Math.floor(Math.random() * 1_000_000_000);
}

async function insertCatalogCard(name: string) {
  const id = randomCardId();

  createdCardIds.push(id);

  await db.insert(card).values({
    id,
    name,
    type: "Effect Monster",
    frameType: "effect",
    description: null,
    raw: { id, name },
    imagePath: `https://images.example/catalog-${id}.jpg`,
    fetchedAt: new Date(),
  });

  return id;
}

async function insertLot(
  auctioneerId: string,
  cardId: number,
  title: string,
) {
  const startsAt = new Date(Date.now() - 60 * 60 * 1000);
  const endsAt = new Date(Date.now() + 60 * 60 * 1000);
  const rows = await db
    .insert(lot)
    .values({
      auctioneerId,
      title,
      description: "Route lot",
      openingBid: "10.00",
      minIncrement: "1.00",
      startsAt,
      originalEndsAt: endsAt,
      endsAt,
      headHash: `secret-hash-${crypto.randomUUID()}`,
    })
    .returning({
      id: lot.id,
      startsAt: lot.startsAt,
      endsAt: lot.endsAt,
      headHash: lot.headHash,
    });
  const row = rows[0];

  if (!row) {
    throw new Error("Insert lot did not return a row");
  }

  await db.insert(lotItem).values({
    lotId: row.id,
    position: 1,
    cardId,
    quantity: 1,
    cardName: "Route Dragon",
    cardSnapshot: { id: cardId, name: "Route Dragon" },
    imagePath: "https://images.example/route.jpg",
  });

  return row;
}

async function insertAcceptedBid(values: {
  lotId: string;
  userId: string;
  participantNo: number;
  amount: string;
}) {
  const participants = await db
    .insert(lotParticipant)
    .values({
      lotId: values.lotId,
      userId: values.userId,
      participantNo: values.participantNo,
    })
    .returning({ id: lotParticipant.id });
  const participant = participants[0];

  if (!participant) {
    throw new Error("Insert participant did not return a row");
  }

  const bids = await db
    .insert(bid)
    .values({
      lotId: values.lotId,
      participantId: participant.id,
      bidderId: values.userId,
      sequence: 1,
      amount: values.amount,
      previousHash: "genesis",
      hash: `secret-bid-hash-${crypto.randomUUID()}`,
    })
    .returning({ id: bid.id, hash: bid.hash });
  const createdBid = bids[0];

  if (!createdBid) {
    throw new Error("Insert bid did not return a row");
  }

  await db
    .update(lot)
    .set({
      currentBidId: createdBid.id,
      bidCount: 1,
    })
    .where(eq(lot.id, values.lotId));

  return createdBid.hash;
}

function getParticipations(token: string | undefined) {
  return app.handle(
    request(
      "/private/participations",
      token === undefined ? undefined : { authorization: `Bearer ${token}` },
    ),
  );
}

async function cleanup(emails: string[], cardIds: number[]) {
  if (emails.length > 0) {
    const users = await db
      .select({ id: user.id })
      .from(user)
      .where(inArray(user.email, emails));
    const userIds = users.map((entry) => entry.id);

    if (userIds.length > 0) {
      const participantLots = await db
        .select({ id: lotParticipant.lotId })
        .from(lotParticipant)
        .where(inArray(lotParticipant.userId, userIds));
      const ownedLots = await db
        .select({ id: lot.id })
        .from(lot)
        .where(inArray(lot.auctioneerId, userIds));
      const wonLots = await db
        .select({ id: lot.id })
        .from(lot)
        .where(inArray(lot.winnerId, userIds));
      const lotIds = [
        ...new Set([
          ...participantLots.map((entry) => entry.id),
          ...ownedLots.map((entry) => entry.id),
          ...wonLots.map((entry) => entry.id),
        ]),
      ];

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
        await db.delete(lotItem).where(inArray(lotItem.lotId, lotIds));
        await db.delete(lot).where(inArray(lot.id, lotIds));
      }

      const wallets = await db
        .select({ id: wallet.id })
        .from(wallet)
        .where(inArray(wallet.userId, userIds));
      const walletIds = wallets.map((entry) => entry.id);

      if (walletIds.length > 0) {
        await db
          .delete(walletMovement)
          .where(inArray(walletMovement.walletId, walletIds));
        await db.delete(wallet).where(inArray(wallet.id, walletIds));
      }

      await db.delete(user).where(inArray(user.id, userIds));
    }
  }

  if (cardIds.length > 0) {
    await db.delete(card).where(inArray(card.id, cardIds));
  }
}

afterAll(async () => {
  await db.$client.end();
});

describe("GET /private/participations", () => {
  afterEach(async () => {
    const emails = createdEmails.splice(0, createdEmails.length);
    const cardIds = createdCardIds.splice(0, createdCardIds.length);

    await cleanup(emails, cardIds);
  });

  it("rejects a request with no session", async () => {
    const response = await getParticipations(undefined);

    expect(response.status).toBe(401);
  });

  it("rejects an auctioneer with NOT_BIDDER", async () => {
    const auctioneer = await registerUser(
      "AUCTIONEER",
      `Auctioneer ${crypto.randomUUID()}`,
    );
    const response = await getParticipations(auctioneer.token);
    const body = (await response.json()) as {
      code?: string;
      message?: string;
    };

    expect(response.status).toBe(403);
    expect(body.code).toBe("NOT_BIDDER");
    expect(body.message).toBe("Only a bidder can list their participations.");
  });

  it("returns only the authenticated bidder's lots", async () => {
    const auctioneer = await registerUser(
      "AUCTIONEER",
      `Auctioneer ${crypto.randomUUID()}`,
    );
    const bidder = await registerUser(
      "BIDDER",
      `Bidder ${crypto.randomUUID()}`,
    );
    const otherBidder = await registerUser(
      "BIDDER",
      `Other bidder ${crypto.randomUUID()}`,
    );
    const ownCardId = await insertCatalogCard("Own Dragon");
    const otherCardId = await insertCatalogCard("Other Dragon");
    const ownTitle = `Own lot ${crypto.randomUUID()}`;
    const ownLot = await insertLot(auctioneer.userId, ownCardId, ownTitle);
    const otherLot = await insertLot(
      auctioneer.userId,
      otherCardId,
      `Other lot ${crypto.randomUUID()}`,
    );

    await insertAcceptedBid({
      lotId: ownLot.id,
      userId: bidder.userId,
      participantNo: 2,
      amount: "12.50",
    });
    await insertAcceptedBid({
      lotId: otherLot.id,
      userId: otherBidder.userId,
      participantNo: 1,
      amount: "14.00",
    });

    const response = await getParticipations(bidder.token);
    const body = (await response.json()) as {
      lots?: Array<{
        id?: string;
        title?: string;
        description?: string | null;
        openingBid?: string;
        minIncrement?: string;
        startsAt?: string;
        endsAt?: string;
        status?: string;
        currentBid?: string | null;
        bidCount?: number;
        participantNo?: number;
        won?: boolean;
        items?: Array<{ cardName?: string; imagePath?: string }>;
      }>;
    };

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["lots"]);
    expect(body.lots).toEqual([
      expect.objectContaining({
        id: ownLot.id,
        title: ownTitle,
        description: "Route lot",
        openingBid: "10.00",
        minIncrement: "1.00",
        startsAt: ownLot.startsAt.toISOString(),
        endsAt: ownLot.endsAt.toISOString(),
        status: "LIVE",
        currentBid: "12.50",
        bidCount: 1,
        participantNo: 2,
        won: false,
        items: [
          expect.objectContaining({
            cardName: "Route Dragon",
            imagePath: "https://images.example/route.jpg",
          }),
        ],
      }),
    ]);
    expect(body.lots?.map((entry) => entry.id)).toEqual([ownLot.id]);
    expect(body.lots?.map((entry) => entry.id)).not.toContain(otherLot.id);
  });

  it("omits email, name, and user id from the JSON", async () => {
    const auctioneer = await registerUser(
      "AUCTIONEER",
      `Auctioneer ${crypto.randomUUID()}`,
    );
    const bidder = await registerUser(
      "BIDDER",
      `Bidder ${crypto.randomUUID()}`,
    );
    const cardId = await insertCatalogCard("Hidden Dragon");
    const created = await insertLot(
      auctioneer.userId,
      cardId,
      `Hidden lot ${crypto.randomUUID()}`,
    );
    const bidHash = await insertAcceptedBid({
      lotId: created.id,
      userId: bidder.userId,
      participantNo: 1,
      amount: "11.00",
    });
    const response = await getParticipations(bidder.token);
    const rawBody = await response.text();
    const body = JSON.parse(rawBody) as {
      lots?: Array<Record<string, unknown>>;
    };
    const listed = body.lots?.[0];
    const items = listed?.items as Array<Record<string, unknown>> | undefined;
    const item = items?.[0];

    expect(response.status).toBe(200);
    expect(created.headHash).toEqual(expect.any(String));
    expect(Object.keys(listed ?? {}).sort()).toEqual([
      "bidCount",
      "currentBid",
      "description",
      "endsAt",
      "id",
      "items",
      "minIncrement",
      "openingBid",
      "participantNo",
      "startsAt",
      "status",
      "title",
      "won",
    ]);
    expect(Object.keys(item ?? {}).sort()).toEqual([
      "cardId",
      "cardName",
      "id",
      "imagePath",
      "position",
      "quantity",
    ]);
    expect(rawBody).not.toContain(bidder.email);
    expect(rawBody).not.toContain(bidder.name);
    expect(rawBody).not.toContain(bidder.userId);
    expect(rawBody).not.toContain(auctioneer.email);
    expect(rawBody).not.toContain(auctioneer.name);
    expect(rawBody).not.toContain(auctioneer.userId);
    expect(rawBody).not.toContain(bidHash);
    expect(rawBody).not.toContain(created.headHash ?? "");
  });
});
