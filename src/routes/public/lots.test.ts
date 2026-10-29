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

const createdUserIds: string[] = [];
const createdCardIds: number[] = [];
const createdLotIds: string[] = [];

function requiredEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

const baseUrl = requiredEnv("BETTER_AUTH_URL", process.env.BETTER_AUTH_URL);
const pageOrigin = requiredEnv("PAGE_ORIGIN", process.env.PAGE_ORIGIN);
const password = "Correct-horse-battery-1";

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

async function registerBidder() {
  const email = `room-${crypto.randomUUID()}@example.com`;
  const name = "Room Bidder";
  const response = await app.handle(
    request(
      "/api/auth/sign-up/email",
      {
        "content-type": "application/json",
        origin: pageOrigin,
      },
      "POST",
      JSON.stringify({
        name,
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

  const body = JSON.parse(rawBody) as {
    user?: {
      id?: string;
    };
  };
  const userId = body.user?.id;
  const token = response.headers.get("set-auth-token");

  if (!userId || !token) {
    throw new Error("Sign-up did not return a session");
  }

  createdUserIds.push(userId);

  return {
    email,
    name,
    userId,
    token,
  };
}

async function insertUser(role: "AUCTIONEER" | "BIDDER" = "AUCTIONEER") {
  const id = crypto.randomUUID();

  await db.insert(user).values({
    id,
    name: "Listing Tester",
    email: `listing-${id}@example.com`,
    role,
  });
  createdUserIds.push(id);

  return id;
}

async function insertCard(name: string) {
  const id = 1_000_000_000 + Math.floor(Math.random() * 1_000_000_000);

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
  createdCardIds.push(id);

  return id;
}

async function insertScheduledLot(title: string, cardName: string) {
  const auctioneerId = await insertUser();
  const cardId = await insertCard(cardName);
  const startsAt = new Date(Date.now() + 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
  const rows = await db
    .insert(lot)
    .values({
      auctioneerId,
      title,
      description: null,
      openingBid: "10.00",
      minIncrement: "1.00",
      startsAt,
      originalEndsAt: endsAt,
      endsAt,
    })
    .returning({ id: lot.id });
  const row = rows[0];

  if (!row) {
    throw new Error("Insert lot did not return a row");
  }

  createdLotIds.push(row.id);

  await db.insert(lotItem).values({
    lotId: row.id,
    position: 1,
    cardId,
    quantity: 1,
    cardName,
    cardSnapshot: {
      id: cardId,
      name: cardName,
      card_images: [
        {
          image_url: "https://images.ygoprodeck.com/images/cards/1.jpg",
        },
      ],
    },
    imagePath: "https://images.example/scheduled.jpg",
  });

  return {
    id: row.id,
    cardId,
    startsAt,
    endsAt,
  };
}

async function insertLotWithBidder(bidderId: string) {
  const created = await insertScheduledLot("Watched room", "Watched Dragon");
  const participants = await db
    .insert(lotParticipant)
    .values({
      lotId: created.id,
      userId: bidderId,
      participantNo: 6,
    })
    .returning({ id: lotParticipant.id });
  const participant = participants[0];

  if (!participant) {
    throw new Error("Insert participant did not return a row");
  }

  const bids = await db
    .insert(bid)
    .values({
      lotId: created.id,
      participantId: participant.id,
      bidderId,
      sequence: 1,
      amount: "12.00",
      createdAt: new Date("2026-10-27T12:00:00.000Z"),
      previousHash: "genesis",
      hash: "hash-1",
    })
    .returning({ id: bid.id });
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
    .where(eq(lot.id, created.id));

  return {
    ...created,
    participantNo: 6,
  };
}

async function insertCanceledLot() {
  const auctioneerId = await insertUser();
  const bidderId = await insertUser("BIDDER");
  const cardId = await insertCard("Canceled Dragon");
  const startsAt = new Date(Date.now() - 60 * 60 * 1000);
  const endsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const bidCreatedAt = new Date("2026-10-27T12:00:00.000Z");
  const rows = await db
    .insert(lot)
    .values({
      auctioneerId,
      title: "Canceled room",
      description: null,
      openingBid: "10.00",
      minIncrement: "1.00",
      startsAt,
      originalEndsAt: endsAt,
      endsAt,
      status: "CANCELED",
      canceledAt: new Date(),
    })
    .returning({ id: lot.id });
  const row = rows[0];

  if (!row) {
    throw new Error("Insert lot did not return a row");
  }

  createdLotIds.push(row.id);

  await db.insert(lotItem).values({
    lotId: row.id,
    position: 1,
    cardId,
    quantity: 1,
    cardName: "Canceled Dragon",
    cardSnapshot: { id: cardId, name: "Canceled Dragon" },
    imagePath: "https://images.example/canceled.jpg",
  });

  const participants = await db
    .insert(lotParticipant)
    .values({
      lotId: row.id,
      userId: bidderId,
      participantNo: 3,
    })
    .returning({ id: lotParticipant.id });
  const participant = participants[0];

  if (!participant) {
    throw new Error("Insert participant did not return a row");
  }

  const bids = await db
    .insert(bid)
    .values({
      lotId: row.id,
      participantId: participant.id,
      bidderId,
      sequence: 1,
      amount: "15.00",
      createdAt: bidCreatedAt,
      previousHash: "genesis",
      hash: "hash-1",
    })
    .returning({ id: bid.id });
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
    .where(eq(lot.id, row.id));

  return {
    id: row.id,
    bidCreatedAt,
  };
}

async function cleanup() {
  const wallets =
    createdUserIds.length === 0
      ? []
      : await db
          .select({ id: wallet.id })
          .from(wallet)
          .where(inArray(wallet.userId, createdUserIds));
  const walletIds = wallets.map((entry) => entry.id);

  if (walletIds.length > 0) {
    await db
      .delete(walletMovement)
      .where(inArray(walletMovement.walletId, walletIds));
  }

  if (createdLotIds.length > 0) {
    await db
      .update(lot)
      .set({ currentBidId: null, winnerId: null })
      .where(inArray(lot.id, createdLotIds));
    await db
      .delete(walletMovement)
      .where(inArray(walletMovement.lotId, createdLotIds));
    await db.delete(bid).where(inArray(bid.lotId, createdLotIds));
    await db
      .delete(lotParticipant)
      .where(inArray(lotParticipant.lotId, createdLotIds));
    await db.delete(lotItem).where(inArray(lotItem.lotId, createdLotIds));
    await db.delete(lot).where(inArray(lot.id, createdLotIds));
  }

  if (walletIds.length > 0) {
    await db.delete(wallet).where(inArray(wallet.id, walletIds));
  }

  if (createdUserIds.length > 0) {
    await db.delete(user).where(inArray(user.id, createdUserIds));
  }

  if (createdCardIds.length > 0) {
    await db.delete(card).where(inArray(card.id, createdCardIds));
  }

  createdLotIds.length = 0;
  createdUserIds.length = 0;
  createdCardIds.length = 0;
}

afterAll(async () => {
  await db.$client.end();
});

describe("GET /public/lots", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("returns a matching lot without a session", async () => {
    const token = `listing-${crypto.randomUUID()}`;
    const created = await insertScheduledLot(token, "Scheduled Dragon");
    const response = await app.handle(
      request(
        `/public/lots?q=${encodeURIComponent(`  ${token}  `)}&status=SCHEDULED`,
      ),
    );
    const body = (await response.json()) as {
      lots?: Array<{
        id?: string;
        status?: string;
        startsAt?: string;
        endsAt?: string;
        sold?: boolean;
        currentBid?: string | null;
        items?: Array<{ cardName?: string; imagePath?: string }>;
      }>;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      lots: [
        expect.objectContaining({
          id: created.id,
          title: token,
          description: null,
          openingBid: "10.00",
          minIncrement: "1.00",
          startsAt: created.startsAt.toISOString(),
          endsAt: created.endsAt.toISOString(),
          status: "SCHEDULED",
          currentBid: null,
          bidCount: 0,
          sold: false,
          totalItems: 1,
          items: [
            expect.objectContaining({
              position: 1,
              cardId: created.cardId,
              quantity: 1,
              cardName: "Scheduled Dragon",
              imagePath: "https://images.example/scheduled.jpg",
            }),
          ],
        }),
      ],
    });

    const lot = body.lots?.[0];
    const item = lot?.items?.[0];

    expect(Object.keys(lot ?? {}).sort()).toEqual([
      "bidCount",
      "currentBid",
      "description",
      "endsAt",
      "id",
      "items",
      "minIncrement",
      "openingBid",
      "sold",
      "startsAt",
      "status",
      "title",
      "totalItems",
    ]);
    expect(Object.keys(item ?? {}).sort()).toEqual([
      "cardId",
      "cardName",
      "id",
      "imagePath",
      "position",
      "quantity",
    ]);
  });

  it("rejects an unknown status", async () => {
    const response = await app.handle(
      request("/public/lots?status=CANCELED"),
    );
    const body = (await response.json()) as { type?: string };

    expect(response.status).toBe(422);
    expect(body.type).toBe("validation");
  });

  it("rejects the stored active status", async () => {
    const response = await app.handle(request("/public/lots?status=ACTIVE"));
    const body = (await response.json()) as { type?: string };

    expect(response.status).toBe(422);
    expect(body.type).toBe("validation");
  });

  it("returns an empty list when nothing matches", async () => {
    const response = await app.handle(
      request(`/public/lots?q=${encodeURIComponent(crypto.randomUUID())}`),
    );
    const body = (await response.json()) as { lots?: unknown[] };

    expect(response.status).toBe(200);
    expect(body).toEqual({ lots: [] });
  });
});

describe("GET /public/lots/:id", () => {
  afterEach(async () => {
    await cleanup();
  });

  it("returns the lot without a session", async () => {
    const created = await insertScheduledLot("Room Dragon", "Scheduled Dragon");
    const response = await app.handle(request(`/public/lots/${created.id}`));
    const raw = await response.text();
    const body = JSON.parse(raw) as {
      serverNow?: string;
      viewerParticipantNo?: number | null;
      lot?: {
        items?: Array<Record<string, unknown>>;
        bids?: unknown[];
      };
    };
    const shown = body.lot;
    const item = shown?.items?.[0];

    expect(response.status).toBe(200);
    expect(body.viewerParticipantNo).toBeNull();
    expect(raw).not.toContain("images.ygoprodeck.com");
    expect(Object.keys(body).sort()).toEqual([
      "lot",
      "serverNow",
      "viewerParticipantNo",
    ]);
    expect(shown).toEqual(
      expect.objectContaining({
        id: created.id,
        title: "Room Dragon",
        description: null,
        openingBid: "10.00",
        minIncrement: "1.00",
        startsAt: created.startsAt.toISOString(),
        endsAt: created.endsAt.toISOString(),
        extensionCount: 0,
        status: "SCHEDULED",
        currentBid: null,
        leaderParticipantNo: null,
        bidCount: 0,
        sold: false,
        winnerParticipantNo: null,
        bids: [],
        items: [
          expect.objectContaining({
            position: 1,
            cardId: created.cardId,
            quantity: 1,
            cardName: "Scheduled Dragon",
            imagePath: "https://images.example/scheduled.jpg",
            cardSnapshot: { id: created.cardId, name: "Scheduled Dragon" },
          }),
        ],
      }),
    );
    expect(Object.keys(shown ?? {}).sort()).toEqual([
      "bidCount",
      "bids",
      "currentBid",
      "description",
      "endsAt",
      "extensionCount",
      "id",
      "items",
      "leaderParticipantNo",
      "minIncrement",
      "openingBid",
      "sold",
      "startsAt",
      "status",
      "title",
      "winnerParticipantNo",
    ]);
    expect(Object.keys(item ?? {}).sort()).toEqual([
      "cardId",
      "cardName",
      "cardSnapshot",
      "id",
      "imagePath",
      "position",
      "quantity",
    ]);
    expect(
      Math.abs(Date.parse(body.serverNow ?? "") - Date.now()),
    ).toBeLessThan(5_000);
  });

  it("returns a canceled lot and its accepted bids", async () => {
    const created = await insertCanceledLot();
    const response = await app.handle(request(`/public/lots/${created.id}`));
    const body = (await response.json()) as {
      viewerParticipantNo?: number | null;
      lot?: {
        status?: string;
        currentBid?: string | null;
        leaderParticipantNo?: number | null;
        sold?: boolean;
        bids?: Array<Record<string, unknown>>;
      };
    };
    const acceptedBid = body.lot?.bids?.[0];

    expect(response.status).toBe(200);
    expect(body.viewerParticipantNo).toBeNull();
    expect(body.lot).toEqual(
      expect.objectContaining({
        id: created.id,
        status: "CANCELED",
        currentBid: "15.00",
        leaderParticipantNo: 3,
        bidCount: 1,
        sold: false,
        winnerParticipantNo: null,
        bids: [
          {
            sequence: 1,
            amount: "15.00",
            createdAt: created.bidCreatedAt.toISOString(),
            participantNo: 3,
          },
        ],
      }),
    );
    expect(Object.keys(acceptedBid ?? {}).sort()).toEqual([
      "amount",
      "createdAt",
      "participantNo",
      "sequence",
    ]);
  });

  it("returns not found when the lot does not exist", async () => {
    const response = await app.handle(
      request(`/public/lots/${crypto.randomUUID()}`),
    );
    const body = (await response.json()) as { code?: string; message?: string };

    expect(response.status).toBe(404);
    expect(body).toEqual({
      code: "LOT_NOT_FOUND",
      message: "Lot was not found.",
    });
  });

  it("returns the bidder participant number for that session", async () => {
    const account = await registerBidder();
    const created = await insertLotWithBidder(account.userId);
    const response = await app.handle(
      request(`/public/lots/${created.id}`, {
        authorization: `Bearer ${account.token}`,
      }),
    );
    const raw = await response.text();
    const body = JSON.parse(raw) as {
      viewerParticipantNo?: number | null;
    };

    expect(response.status).toBe(200);
    expect(body.viewerParticipantNo).toBe(created.participantNo);
    expect(raw).not.toContain(account.email);
    expect(raw).not.toContain(account.name);
    expect(raw).not.toContain(account.userId);
  });

  it("returns a null viewer participant number when the session has not joined the lot", async () => {
    const account = await registerBidder();
    const created = await insertScheduledLot("Empty room", "Empty Dragon");
    const response = await app.handle(
      request(`/public/lots/${created.id}`, {
        authorization: `Bearer ${account.token}`,
      }),
    );
    const body = (await response.json()) as {
      viewerParticipantNo?: number | null;
    };

    expect(response.status).toBe(200);
    expect(body.viewerParticipantNo).toBeNull();
  });

  it("returns the lot when the bearer token is invalid", async () => {
    const created = await insertScheduledLot("Open room", "Open Dragon");
    const response = await app.handle(
      request(`/public/lots/${created.id}`, {
        authorization: "Bearer not-a-real-token",
      }),
    );
    const body = (await response.json()) as {
      viewerParticipantNo?: number | null;
    };

    expect(response.status).toBe(200);
    expect(body.viewerParticipantNo).toBeNull();
  });

  it("rejects an id that is not a uuid", async () => {
    const response = await app.handle(request("/public/lots/not-a-uuid"));
    const body = (await response.json()) as { type?: string };

    expect(response.status).toBe(422);
    expect(body.type).toBe("validation");
  });
});
