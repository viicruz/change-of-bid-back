//* Libraries imports
import { randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";

//* Local imports
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
import {
  showPublicReceipt,
  ShowPublicReceiptError,
} from "./show-public-receipt";

const lotStartsAt = new Date("2026-10-26T12:00:00.000Z");
const lotEndsAt = new Date("2026-10-26T14:00:00.000Z");
const receiptEndedAt = new Date("2026-10-26T14:45:00.000Z");
const createdUserIds: string[] = [];
const createdCardIds: number[] = [];
const createdLotIds: string[] = [];

function createShareToken() {
  return randomBytes(32).toString("base64url");
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

  const items = await db
    .insert(lotItem)
    .values([
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
    ])
    .returning({ id: lotItem.id, position: lotItem.position });
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

  const firstItem = items.find((item) => item.position === 1);
  const secondItem = items.find((item) => item.position === 2);

  if (!firstItem || !secondItem) {
    throw new Error("Insert lot items did not return both rows");
  }

  return {
    shareToken,
    lotId: createdLot.id,
    winner,
    auctioneer,
    winningBidId: winningBid.id,
    bidHash,
    headHash,
    firstItemId: firstItem.id,
    secondItemId: secondItem.id,
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

describe("showPublicReceipt", () => {
  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe("when the share token matches a receipt", () => {
    it("returns the frozen card snapshot and omits personal data", async () => {
      const created = await insertSettledReceipt();
      const shown = await showPublicReceipt(created.shareToken);
      const serialized = JSON.stringify(shown);
      const firstItem = shown.receipt.items[0];

      expect(shown).toEqual({
        receipt: {
          lotId: created.lotId,
          title: "Frozen lot",
          description: "Sealed duel",
          endedAt: receiptEndedAt,
          finalAmount: "12.50",
          winnerParticipantNo: 7,
          items: [
            {
              id: created.firstItemId,
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
            },
            {
              id: created.secondItemId,
              position: 2,
              cardId: created.secondCardId,
              quantity: 1,
              cardName: "Second Card",
              imagePath: "https://images.example/second.jpg",
              cardSnapshot: {
                id: created.secondCardId,
                name: "Second Card",
              },
            },
          ],
        },
      });
      expect(shown.receipt.endedAt).not.toEqual(lotEndsAt);
      expect(firstItem?.cardSnapshot).not.toHaveProperty("card_images");
      expect(firstItem?.cardName).not.toBe("Renamed Catalog Dragon");
      expect(Object.keys(shown).sort()).toEqual(["receipt"]);
      expect(Object.keys(shown.receipt).sort()).toEqual([
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
      expect(serialized).not.toContain(created.shareToken);
      expect(serialized).not.toContain(created.winner.id);
      expect(serialized).not.toContain(created.winner.email);
      expect(serialized).not.toContain(created.winner.name);
      expect(serialized).not.toContain(created.auctioneer.id);
      expect(serialized).not.toContain(created.auctioneer.email);
      expect(serialized).not.toContain(created.auctioneer.name);
      expect(serialized).not.toContain(created.winningBidId);
      expect(serialized).not.toContain(created.bidHash);
      expect(serialized).not.toContain(created.headHash);
      expect(serialized).not.toContain("card_images");
      expect(serialized).not.toContain("ygoprodeck");
    });
  });

  describe("when the share token is unknown", () => {
    it("throws RECEIPT_NOT_FOUND", async () => {
      const missing = showPublicReceipt(createShareToken());

      await expect(missing).rejects.toBeInstanceOf(ShowPublicReceiptError);
      await expect(missing).rejects.toMatchObject({
        code: "RECEIPT_NOT_FOUND",
        message: "Receipt was not found.",
      });
    });
  });

  describe("when the value is a lot id", () => {
    it("throws RECEIPT_NOT_FOUND", async () => {
      const created = await insertSettledReceipt();
      const byLotId = showPublicReceipt(created.lotId);

      await expect(byLotId).rejects.toBeInstanceOf(ShowPublicReceiptError);
      await expect(byLotId).rejects.toMatchObject({
        code: "RECEIPT_NOT_FOUND",
        message: "Receipt was not found.",
      });
    });
  });
});
