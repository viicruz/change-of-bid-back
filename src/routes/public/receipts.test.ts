//* Libraries imports
import { randomBytes } from "node:crypto";
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
  receipt,
  user,
} from "../../db/schema";

const lotStartsAt = new Date("2026-10-26T12:00:00.000Z");
const lotEndsAt = new Date("2026-10-26T14:00:00.000Z");
const receiptEndedAt = new Date("2026-10-26T14:45:00.000Z");
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

function createShareToken() {
  return randomBytes(32).toString("base64url");
}

function request(path: string) {
  return new Request(`${baseUrl}${path}`, {
    method: "GET",
  });
}

async function insertUser(role: "AUCTIONEER" | "BIDDER", name: string) {
  const id = crypto.randomUUID();
  const email = `hidden-${role.toLowerCase()}-${id}@example.com`;

  await db.insert(user).values({
    id,
    name,
    email,
    role,
  });
  createdUserIds.push(id);

  return { id, email, name };
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
    fetchedAt: lotStartsAt,
  });
  createdCardIds.push(id);

  return id;
}

async function insertSettledReceipt() {
  const auctioneer = await insertUser("AUCTIONEER", "Hidden Auctioneer");
  const winner = await insertUser("BIDDER", "Hidden Winner");
  const firstCardId = await insertCard("Catalog Dragon");
  const secondCardId = await insertCard("Catalog Magician");
  const headHash = `secret-head-hash-${crypto.randomUUID()}`;
  const shareToken = createShareToken();
  const lots = await db
    .insert(lot)
    .values({
      auctioneerId: auctioneer.id,
      title: "Frozen lot",
      description: "Sealed duel",
      openingBid: "10.00",
      minIncrement: "1.00",
      startsAt: lotStartsAt,
      originalEndsAt: lotEndsAt,
      endsAt: lotEndsAt,
      status: "ENDED",
      endedAt: lotEndsAt,
      settledAt: receiptEndedAt,
      winnerId: winner.id,
      bidCount: 1,
      headHash,
    })
    .returning({ id: lot.id });
  const createdLot = lots[0];

  if (!createdLot) {
    throw new Error("Insert lot did not return a row");
  }

  createdLotIds.push(createdLot.id);

  await db.insert(lotItem).values([
    {
      lotId: createdLot.id,
      position: 2,
      cardId: secondCardId,
      quantity: 1,
      cardName: "Second Card",
      cardSnapshot: { id: secondCardId, name: "Second Card" },
      imagePath: "https://images.example/second.jpg",
    },
    {
      lotId: createdLot.id,
      position: 1,
      cardId: firstCardId,
      quantity: 2,
      cardName: "Frozen Dragon",
      cardSnapshot: {
        id: firstCardId,
        name: "Frozen Dragon",
        atk: 2500,
        card_images: [
          {
            image_url: "https://images.ygoprodeck.com/images/cards/1.jpg",
          },
        ],
      },
      imagePath: "https://images.example/frozen.jpg",
    },
  ]);

  const participants = await db
    .insert(lotParticipant)
    .values({
      lotId: createdLot.id,
      userId: winner.id,
      participantNo: 7,
    })
    .returning({ id: lotParticipant.id });
  const participant = participants[0];

  if (!participant) {
    throw new Error("Insert participant did not return a row");
  }

  const bidHash = `secret-bid-hash-${crypto.randomUUID()}`;
  const bids = await db
    .insert(bid)
    .values({
      lotId: createdLot.id,
      participantId: participant.id,
      bidderId: winner.id,
      sequence: 1,
      amount: "12.50",
      previousHash: "genesis",
      hash: bidHash,
    })
    .returning({ id: bid.id });
  const winningBid = bids[0];

  if (!winningBid) {
    throw new Error("Insert bid did not return a row");
  }

  await db
    .update(lot)
    .set({ currentBidId: winningBid.id })
    .where(eq(lot.id, createdLot.id));
  await db.insert(receipt).values({
    lotId: createdLot.id,
    winningBidId: winningBid.id,
    winnerId: winner.id,
    winnerParticipantNo: 7,
    finalAmount: "12.50",
    endedAt: receiptEndedAt,
    shareToken,
  });
  await db
    .update(card)
    .set({ name: "Renamed Catalog Dragon" })
    .where(eq(card.id, firstCardId));

  return {
    shareToken,
    lotId: createdLot.id,
    winner,
    auctioneer,
    winningBidId: winningBid.id,
    bidHash,
    headHash,
    firstCardId,
    secondCardId,
  };
}

async function cleanup() {
  if (createdLotIds.length > 0) {
    await db
      .update(lot)
      .set({ currentBidId: null, winnerId: null })
      .where(inArray(lot.id, createdLotIds));
    await db.delete(receipt).where(inArray(receipt.lotId, createdLotIds));
    await db.delete(bid).where(inArray(bid.lotId, createdLotIds));
    await db
      .delete(lotParticipant)
      .where(inArray(lotParticipant.lotId, createdLotIds));
    await db.delete(lotItem).where(inArray(lotItem.lotId, createdLotIds));
    await db.delete(lot).where(inArray(lot.id, createdLotIds));
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

describe("GET /public/receipts/:shareToken", () => {
  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("returns the receipt without a session", async () => {
    const created = await insertSettledReceipt();
    const response = await app.handle(
      request(`/public/receipts/${created.shareToken}`),
    );
    const raw = await response.text();
    const body = JSON.parse(raw) as {
      receipt?: {
        lotId?: string;
        title?: string;
        description?: string | null;
        endedAt?: string;
        finalAmount?: string;
        winnerParticipantNo?: number;
        items?: Array<Record<string, unknown>>;
      };
    };
    const shown = body.receipt;
    const firstItem = shown?.items?.[0];
    const secondItem = shown?.items?.[1];

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["receipt"]);
    expect(shown).toEqual({
      lotId: created.lotId,
      title: "Frozen lot",
      description: "Sealed duel",
      endedAt: receiptEndedAt.toISOString(),
      finalAmount: "12.50",
      winnerParticipantNo: 7,
      items: [
        expect.objectContaining({
          position: 1,
          cardId: created.firstCardId,
          quantity: 2,
          cardName: "Frozen Dragon",
          imagePath: "https://images.example/frozen.jpg",
          cardSnapshot: {
            id: created.firstCardId,
            name: "Frozen Dragon",
            atk: 2500,
          },
        }),
        expect.objectContaining({
          position: 2,
          cardId: created.secondCardId,
          quantity: 1,
          cardName: "Second Card",
          imagePath: "https://images.example/second.jpg",
        }),
      ],
    });
    expect(firstItem?.cardSnapshot).not.toHaveProperty("card_images");
    expect(firstItem?.cardName).not.toBe("Renamed Catalog Dragon");
    expect(Object.keys(shown ?? {}).sort()).toEqual([
      "description",
      "endedAt",
      "finalAmount",
      "items",
      "lotId",
      "title",
      "winnerParticipantNo",
    ]);
    expect(Object.keys(firstItem ?? {}).sort()).toEqual([
      "cardId",
      "cardName",
      "cardSnapshot",
      "id",
      "imagePath",
      "position",
      "quantity",
    ]);
    expect(Object.keys(secondItem ?? {}).sort()).toEqual([
      "cardId",
      "cardName",
      "cardSnapshot",
      "id",
      "imagePath",
      "position",
      "quantity",
    ]);
    expect(raw).not.toContain(created.shareToken);
    expect(raw).not.toContain(created.winner.id);
    expect(raw).not.toContain(created.winner.email);
    expect(raw).not.toContain(created.winner.name);
    expect(raw).not.toContain(created.auctioneer.id);
    expect(raw).not.toContain(created.auctioneer.email);
    expect(raw).not.toContain(created.auctioneer.name);
    expect(raw).not.toContain(created.winningBidId);
    expect(raw).not.toContain(created.bidHash);
    expect(raw).not.toContain(created.headHash);
    expect(raw).not.toContain("card_images");
    expect(raw).not.toContain("ygoprodeck");
  });

  it("returns RECEIPT_NOT_FOUND when the share token is unknown", async () => {
    const response = await app.handle(
      request(`/public/receipts/${createShareToken()}`),
    );
    const body = (await response.json()) as {
      code?: string;
      message?: string;
    };

    expect(response.status).toBe(404);
    expect(body).toEqual({
      code: "RECEIPT_NOT_FOUND",
      message: "Receipt was not found.",
    });
  });

  it("rejects a lot id because it is not a share token", async () => {
    const created = await insertSettledReceipt();
    const response = await app.handle(
      request(`/public/receipts/${created.lotId}`),
    );
    const body = (await response.json()) as { type?: string };

    expect(response.status).toBe(422);
    expect(body.type).toBe("validation");
  });
});
