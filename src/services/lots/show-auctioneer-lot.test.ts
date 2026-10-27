//* Libraries imports
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
  user,
  wallet,
  walletMovement,
} from "../../db/schema";
import { showAuctioneerLot } from "./show-auctioneer-lot";

const now = new Date("2026-10-26T15:00:00.000Z");
const createdUserIds: string[] = [];
const createdCardIds: number[] = [];
const createdLotIds: string[] = [];

function hoursFromNow(hours: number) {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

function showFor(auctioneerId: string, lotId: string, role = "AUCTIONEER") {
  return showAuctioneerLot(
    {
      lotId,
      auctioneerId,
      role,
    },
    {
      now: () => now,
    },
  );
}

async function insertUser(role: "AUCTIONEER" | "BIDDER", name = "Show Tester") {
  const id = crypto.randomUUID();

  await db.insert(user).values({
    id,
    name,
    email: `show-auctioneer-${id}@example.com`,
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
    fetchedAt: now,
  });
  createdCardIds.push(id);

  return id;
}

async function insertLot(
  auctioneerId: string,
  values: {
    title: string;
    description?: string | null;
    startsAt: Date;
    endsAt: Date;
    originalEndsAt?: Date;
    extensionCount?: number;
    status?: "ACTIVE" | "ENDED" | "CANCELED";
    items: Array<{
      position: number;
      cardId: number;
      cardName: string;
      imagePath: string;
      cardSnapshot: Record<string, unknown>;
    }>;
  },
) {
  const status = values.status ?? "ACTIVE";
  const rows = await db
    .insert(lot)
    .values({
      auctioneerId,
      title: values.title,
      description: values.description ?? null,
      openingBid: "10.00",
      minIncrement: "1.00",
      startsAt: values.startsAt,
      originalEndsAt: values.originalEndsAt ?? values.endsAt,
      endsAt: values.endsAt,
      extensionCount: values.extensionCount ?? 0,
      status,
      endedAt: status === "ENDED" ? values.endsAt : null,
      canceledAt: status === "CANCELED" ? now : null,
    })
    .returning({ id: lot.id });
  const row = rows[0];

  if (!row) {
    throw new Error("Insert lot did not return a row");
  }

  createdLotIds.push(row.id);

  await db.insert(lotItem).values(
    values.items.map((item) => ({
      lotId: row.id,
      position: item.position,
      cardId: item.cardId,
      quantity: 1,
      cardName: item.cardName,
      cardSnapshot: item.cardSnapshot,
      imagePath: item.imagePath,
    })),
  );

  return row.id;
}

async function attachBids(
  lotId: string,
  entries: Array<{
    sequence: number;
    participantNo: number;
    amount: string;
    createdAt: Date;
  }>,
  options?: { winner?: boolean },
) {
  const inserted: Array<{ id: string; userId: string; sequence: number }> = [];
  const participantsByNo = new Map<number, { id: string; userId: string }>();

  for (const entry of entries) {
    let participant = participantsByNo.get(entry.participantNo);

    if (participant === undefined) {
      const bidderId = await insertUser(
        "BIDDER",
        `Bidder ${entry.participantNo}`,
      );
      const participants = await db
        .insert(lotParticipant)
        .values({
          lotId,
          userId: bidderId,
          participantNo: entry.participantNo,
        })
        .returning({ id: lotParticipant.id });
      const createdParticipant = participants[0];

      if (!createdParticipant) {
        throw new Error("Insert participant did not return a row");
      }

      participant = {
        id: createdParticipant.id,
        userId: bidderId,
      };
      participantsByNo.set(entry.participantNo, participant);
    }

    const bids = await db
      .insert(bid)
      .values({
        lotId,
        participantId: participant.id,
        bidderId: participant.userId,
        sequence: entry.sequence,
        amount: entry.amount,
        createdAt: entry.createdAt,
        previousHash: "genesis",
        hash: `hash-${entry.sequence}`,
      })
      .returning({ id: bid.id });
    const createdBid = bids[0];

    if (!createdBid) {
      throw new Error("Insert bid did not return a row");
    }

    inserted.push({
      id: createdBid.id,
      userId: participant.userId,
      sequence: entry.sequence,
    });
  }

  const leader = inserted.reduce((current, entry) => {
    return entry.sequence > current.sequence ? entry : current;
  });

  await db
    .update(lot)
    .set({
      currentBidId: leader.id,
      bidCount: entries.length,
      ...(options?.winner
        ? {
            winnerId: leader.userId,
            status: "ENDED" as const,
            endedAt: now,
          }
        : {}),
    })
    .where(eq(lot.id, lotId));

  return inserted;
}

async function insertWallet(userId: string, totalBalance: string) {
  const rows = await db
    .insert(wallet)
    .values({
      userId,
      totalBalance,
      committedBalance: "0.00",
    })
    .returning({ id: wallet.id });
  const row = rows[0];

  if (!row) {
    throw new Error("Insert wallet did not return a row");
  }

  return row.id;
}

async function insertMovement(values: {
  walletId: string;
  type:
    | "DEPOSIT"
    | "HOLD"
    | "RELEASE"
    | "SETTLEMENT_DEBIT"
    | "SETTLEMENT_CREDIT";
  amount: string;
  lotId?: string;
  bidId?: string;
}) {
  await db.insert(walletMovement).values({
    walletId: values.walletId,
    type: values.type,
    amount: values.amount,
    lotId: values.lotId ?? null,
    bidId: values.bidId ?? null,
  });
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

describe("showAuctioneerLot", () => {
  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe("authorization", () => {
    it("rejects a user who is not an auctioneer", async () => {
      const bidderId = await insertUser("BIDDER");

      await expect(
        showFor(bidderId, crypto.randomUUID(), "BIDDER"),
      ).rejects.toMatchObject({
        name: "ShowAuctioneerLotError",
        code: "NOT_AUCTIONEER",
        message: "Only an auctioneer can view their lot.",
      });
    });

    it("rejects a lot that does not exist", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");

      await expect(
        showFor(auctioneerId, crypto.randomUUID()),
      ).rejects.toMatchObject({
        name: "ShowAuctioneerLotError",
        code: "LOT_NOT_FOUND",
        message: "Lot was not found.",
      });
    });

    it("rejects a lot owned by another auctioneer", async () => {
      const ownerId = await insertUser("AUCTIONEER", "Owner");
      const otherId = await insertUser("AUCTIONEER", "Other");
      const cardId = await insertCard("Owned Dragon");
      const lotId = await insertLot(ownerId, {
        title: "Owned room",
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(3),
        items: [
          {
            position: 1,
            cardId,
            cardName: "Owned Dragon",
            imagePath: "https://images.example/owned.jpg",
            cardSnapshot: { id: cardId, name: "Owned Dragon" },
          },
        ],
      });

      await expect(showFor(otherId, lotId)).rejects.toMatchObject({
        name: "ShowAuctioneerLotError",
        code: "LOT_NOT_OWNED",
        message: "Only the owner can view this lot.",
      });
    });
  });

  describe("when the lot is scheduled", () => {
    it("returns the frozen card snapshot and an empty bid history", async () => {
      const auctioneerId = await insertUser("AUCTIONEER", "Panel Owner");
      const cardId = await insertCard("Catalog Dragon");
      const lotId = await insertLot(auctioneerId, {
        title: "Scheduled room",
        description: "Opens later",
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(3),
        items: [
          {
            position: 2,
            cardId,
            cardName: "Second Card",
            imagePath: "https://images.example/second.jpg",
            cardSnapshot: { id: cardId, name: "Second Card" },
          },
          {
            position: 1,
            cardId,
            cardName: "Frozen Dragon",
            imagePath: "https://images.example/frozen.jpg",
            cardSnapshot: {
              id: cardId,
              name: "Frozen Dragon",
              atk: 2500,
              card_images: [
                {
                  image_url: "https://images.ygoprodeck.com/images/cards/1.jpg",
                },
              ],
            },
          },
        ],
      });

      await db
        .update(card)
        .set({ name: "Renamed Catalog Dragon" })
        .where(eq(card.id, cardId));

      const shown = await showFor(auctioneerId, lotId);
      const firstItem = shown.lot.items[0];
      const serialized = JSON.stringify(shown);

      expect(shown.serverNow).toEqual(now);
      expect(shown.lot).toMatchObject({
        id: lotId,
        title: "Scheduled room",
        description: "Opens later",
        openingBid: "10.00",
        minIncrement: "1.00",
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(3),
        extensionCount: 0,
        status: "SCHEDULED",
        currentBid: null,
        leaderParticipantNo: null,
        bidCount: 0,
        sold: false,
        winnerParticipantNo: null,
        receivedAmount: null,
        bids: [],
      });
      expect(shown.lot.items.map((item) => item.position)).toEqual([1, 2]);
      expect(firstItem).toMatchObject({
        cardId,
        cardName: "Frozen Dragon",
        imagePath: "https://images.example/frozen.jpg",
        cardSnapshot: { id: cardId, name: "Frozen Dragon", atk: 2500 },
      });
      expect(firstItem?.cardSnapshot).not.toHaveProperty("card_images");
      expect(Object.keys(shown).sort()).toEqual(["lot", "serverNow"]);
      expect(Object.keys(shown.lot).sort()).toEqual([
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
        "receivedAmount",
        "sold",
        "startsAt",
        "status",
        "title",
        "winnerParticipantNo",
      ]);
      expect(serialized).not.toContain(auctioneerId);
      expect(serialized).not.toContain("Panel Owner");
    });
  });

  describe("when the clock is exactly at the start", () => {
    it("returns live", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const cardId = await insertCard("Start Dragon");
      const lotId = await insertLot(auctioneerId, {
        title: "Starting room",
        startsAt: now,
        endsAt: hoursFromNow(2),
        items: [
          {
            position: 1,
            cardId,
            cardName: "Start Dragon",
            imagePath: "https://images.example/start.jpg",
            cardSnapshot: { id: cardId, name: "Start Dragon" },
          },
        ],
      });

      const shown = await showFor(auctioneerId, lotId);

      expect(shown.lot.status).toBe("LIVE");
    });
  });

  describe("when the lot is live", () => {
    it("returns accepted bids in sequence order", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const cardId = await insertCard("Live Dragon");
      const firstBidAt = new Date("2026-10-26T14:10:00.000Z");
      const secondBidAt = new Date("2026-10-26T14:20:00.000Z");
      const lotId = await insertLot(auctioneerId, {
        title: "Live room",
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(1),
        extensionCount: 2,
        items: [
          {
            position: 1,
            cardId,
            cardName: "Live Dragon",
            imagePath: "https://images.example/live.jpg",
            cardSnapshot: { id: cardId, name: "Live Dragon" },
          },
        ],
      });
      const placed = await attachBids(lotId, [
        {
          sequence: 2,
          participantNo: 4,
          amount: "15.00",
          createdAt: secondBidAt,
        },
        {
          sequence: 1,
          participantNo: 2,
          amount: "10.00",
          createdAt: firstBidAt,
        },
      ]);

      const shown = await showFor(auctioneerId, lotId);
      const serialized = JSON.stringify(shown);

      expect(shown.lot).toMatchObject({
        status: "LIVE",
        extensionCount: 2,
        currentBid: "15.00",
        leaderParticipantNo: 4,
        bidCount: 2,
        sold: false,
        winnerParticipantNo: null,
        receivedAmount: null,
        bids: [
          {
            sequence: 1,
            amount: "10.00",
            createdAt: firstBidAt,
            participantNo: 2,
          },
          {
            sequence: 2,
            amount: "15.00",
            createdAt: secondBidAt,
            participantNo: 4,
          },
        ],
      });
      expect(Object.keys(shown.lot.bids[0] ?? {}).sort()).toEqual([
        "amount",
        "createdAt",
        "participantNo",
        "sequence",
      ]);

      for (const entry of placed) {
        expect(serialized).not.toContain(entry.userId);
      }

      expect(serialized).not.toContain("Bidder 2");
      expect(serialized).not.toContain("Bidder 4");
      expect(serialized).not.toContain("Show Tester");
    });

    it("follows the latest bid when one participant bids twice", async () => {
      const auctioneerId = await insertUser("AUCTIONEER", "Repeat Owner");
      const cardId = await insertCard("Repeat Dragon");
      const firstBidAt = new Date("2026-10-26T14:10:00.000Z");
      const secondBidAt = new Date("2026-10-26T14:25:00.000Z");
      const lotId = await insertLot(auctioneerId, {
        title: "Repeat room",
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(1),
        items: [
          {
            position: 1,
            cardId,
            cardName: "Repeat Dragon",
            imagePath: "https://images.example/repeat.jpg",
            cardSnapshot: { id: cardId, name: "Repeat Dragon" },
          },
        ],
      });
      const placed = await attachBids(lotId, [
        {
          sequence: 2,
          participantNo: 3,
          amount: "18.00",
          createdAt: secondBidAt,
        },
        {
          sequence: 1,
          participantNo: 3,
          amount: "10.00",
          createdAt: firstBidAt,
        },
      ]);

      const shown = await showFor(auctioneerId, lotId);
      const serialized = JSON.stringify(shown);

      expect(shown.lot).toMatchObject({
        status: "LIVE",
        currentBid: "18.00",
        leaderParticipantNo: 3,
        bidCount: 2,
        sold: false,
        winnerParticipantNo: null,
        receivedAmount: null,
        bids: [
          {
            sequence: 1,
            amount: "10.00",
            createdAt: firstBidAt,
            participantNo: 3,
          },
          {
            sequence: 2,
            amount: "18.00",
            createdAt: secondBidAt,
            participantNo: 3,
          },
        ],
      });
      expect(new Set(placed.map((entry) => entry.userId)).size).toBe(1);
      expect(serialized).not.toContain(placed[0]?.userId);
      expect(serialized).not.toContain("Bidder 3");
      expect(serialized).not.toContain("Repeat Owner");
    });
  });

  describe("when the clock is exactly at the end", () => {
    it("returns ended without a winner", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const cardId = await insertCard("Ending Dragon");
      const lotId = await insertLot(auctioneerId, {
        title: "Ending room",
        startsAt: hoursFromNow(-2),
        endsAt: now,
        items: [
          {
            position: 1,
            cardId,
            cardName: "Ending Dragon",
            imagePath: "https://images.example/ending.jpg",
            cardSnapshot: { id: cardId, name: "Ending Dragon" },
          },
        ],
      });

      const shown = await showFor(auctioneerId, lotId);

      expect(shown.lot.status).toBe("ENDED");
      expect(shown.lot.sold).toBe(false);
      expect(shown.lot.receivedAmount).toBeNull();
    });
  });

  describe("when the lot is past its end and still awaiting settlement", () => {
    it("returns ended with the leading bid and no received amount", async () => {
      const auctioneerId = await insertUser("AUCTIONEER", "Pending Owner");
      const cardId = await insertCard("Pending Dragon");
      const bidAt = new Date("2026-10-26T13:00:00.000Z");
      const lotId = await insertLot(auctioneerId, {
        title: "Pending room",
        startsAt: hoursFromNow(-3),
        endsAt: hoursFromNow(-1),
        items: [
          {
            position: 1,
            cardId,
            cardName: "Pending Dragon",
            imagePath: "https://images.example/pending.jpg",
            cardSnapshot: { id: cardId, name: "Pending Dragon" },
          },
        ],
      });
      const placed = await attachBids(lotId, [
        {
          sequence: 1,
          participantNo: 8,
          amount: "22.00",
          createdAt: bidAt,
        },
      ]);

      const shown = await showFor(auctioneerId, lotId);
      const serialized = JSON.stringify(shown);

      expect(shown.lot).toMatchObject({
        status: "ENDED",
        currentBid: "22.00",
        leaderParticipantNo: 8,
        bidCount: 1,
        sold: false,
        winnerParticipantNo: null,
        receivedAmount: null,
        bids: [
          {
            sequence: 1,
            amount: "22.00",
            createdAt: bidAt,
            participantNo: 8,
          },
        ],
      });
      expect(serialized).not.toContain(placed[0]?.userId);
      expect(serialized).not.toContain("Bidder 8");
      expect(serialized).not.toContain("Pending Owner");
    });
  });

  describe("when the lot is settled", () => {
    it("returns the winner participant number and the credited amount", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const cardId = await insertCard("Settled Dragon");
      const bidAt = new Date("2026-10-26T14:00:00.000Z");
      const lotId = await insertLot(auctioneerId, {
        title: "Settled room",
        startsAt: hoursFromNow(-3),
        endsAt: hoursFromNow(-1),
        status: "ENDED",
        items: [
          {
            position: 1,
            cardId,
            cardName: "Settled Dragon",
            imagePath: "https://images.example/settled.jpg",
            cardSnapshot: { id: cardId, name: "Settled Dragon" },
          },
        ],
      });
      const placed = await attachBids(
        lotId,
        [
          {
            sequence: 1,
            participantNo: 7,
            amount: "30.00",
            createdAt: bidAt,
          },
        ],
        { winner: true },
      );
      const winner = placed[0];

      if (winner === undefined) {
        throw new Error("Inserted bid was not returned");
      }

      const auctioneerWalletId = await insertWallet(auctioneerId, "0.00");
      const winnerWalletId = await insertWallet(winner.userId, "30.00");

      await insertMovement({
        walletId: winnerWalletId,
        type: "SETTLEMENT_DEBIT",
        amount: "30.00",
        lotId,
        bidId: winner.id,
      });
      await insertMovement({
        walletId: auctioneerWalletId,
        type: "SETTLEMENT_CREDIT",
        amount: "30.00",
        lotId,
      });

      const shown = await showFor(auctioneerId, lotId);
      const serialized = JSON.stringify(shown);

      expect(shown.lot).toMatchObject({
        status: "ENDED",
        currentBid: "30.00",
        leaderParticipantNo: 7,
        sold: true,
        winnerParticipantNo: 7,
        receivedAmount: "30.00",
      });
      expect(serialized).not.toContain(winner.userId);
      expect(serialized).not.toContain(auctioneerId);
    });
  });

  describe("when the lot has no settlement credit", () => {
    it("ignores a hold and a deposit", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const cardId = await insertCard("Held Dragon");
      const lotId = await insertLot(auctioneerId, {
        title: "Held room",
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
        items: [
          {
            position: 1,
            cardId,
            cardName: "Held Dragon",
            imagePath: "https://images.example/held.jpg",
            cardSnapshot: { id: cardId, name: "Held Dragon" },
          },
        ],
      });
      const placed = await attachBids(lotId, [
        {
          sequence: 1,
          participantNo: 1,
          amount: "15.00",
          createdAt: new Date("2026-10-26T14:30:00.000Z"),
        },
      ]);
      const leader = placed[0];

      if (leader === undefined) {
        throw new Error("Inserted bid was not returned");
      }

      const auctioneerWalletId = await insertWallet(auctioneerId, "100.00");
      const leaderWalletId = await insertWallet(leader.userId, "100.00");

      await insertMovement({
        walletId: auctioneerWalletId,
        type: "DEPOSIT",
        amount: "100.00",
      });
      await insertMovement({
        walletId: leaderWalletId,
        type: "HOLD",
        amount: "15.00",
        lotId,
        bidId: leader.id,
      });

      const shown = await showFor(auctioneerId, lotId);

      expect(shown.lot).toMatchObject({
        status: "LIVE",
        currentBid: "15.00",
        sold: false,
        receivedAmount: null,
      });
    });

    it("ignores a release of the current bid", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const cardId = await insertCard("Released Dragon");
      const lotId = await insertLot(auctioneerId, {
        title: "Released room",
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
        items: [
          {
            position: 1,
            cardId,
            cardName: "Released Dragon",
            imagePath: "https://images.example/released.jpg",
            cardSnapshot: { id: cardId, name: "Released Dragon" },
          },
        ],
      });
      const placed = await attachBids(lotId, [
        {
          sequence: 1,
          participantNo: 6,
          amount: "15.00",
          createdAt: new Date("2026-10-26T14:40:00.000Z"),
        },
      ]);
      const leader = placed[0];

      if (leader === undefined) {
        throw new Error("Inserted bid was not returned");
      }

      const leaderWalletId = await insertWallet(leader.userId, "100.00");

      await insertMovement({
        walletId: leaderWalletId,
        type: "RELEASE",
        amount: "15.00",
        lotId,
        bidId: leader.id,
      });

      const shown = await showFor(auctioneerId, lotId);

      expect(shown.lot).toMatchObject({
        status: "LIVE",
        currentBid: "15.00",
        leaderParticipantNo: 6,
        sold: false,
        receivedAmount: null,
      });
    });

    it("ignores a settlement credit that belongs to another lot", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const openCardId = await insertCard("Open Dragon");
      const paidCardId = await insertCard("Paid Dragon");
      const openLotId = await insertLot(auctioneerId, {
        title: "Open room",
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
        items: [
          {
            position: 1,
            cardId: openCardId,
            cardName: "Open Dragon",
            imagePath: "https://images.example/open.jpg",
            cardSnapshot: { id: openCardId, name: "Open Dragon" },
          },
        ],
      });
      const paidLotId = await insertLot(auctioneerId, {
        title: "Paid room",
        startsAt: hoursFromNow(-3),
        endsAt: hoursFromNow(-1),
        status: "ENDED",
        items: [
          {
            position: 1,
            cardId: paidCardId,
            cardName: "Paid Dragon",
            imagePath: "https://images.example/paid.jpg",
            cardSnapshot: { id: paidCardId, name: "Paid Dragon" },
          },
        ],
      });
      const auctioneerWalletId = await insertWallet(auctioneerId, "20.00");

      await insertMovement({
        walletId: auctioneerWalletId,
        type: "SETTLEMENT_CREDIT",
        amount: "20.00",
        lotId: paidLotId,
      });

      const openLot = await showFor(auctioneerId, openLotId);
      const paidLot = await showFor(auctioneerId, paidLotId);

      expect(openLot.lot.receivedAmount).toBeNull();
      expect(paidLot.lot.receivedAmount).toBe("20.00");
    });
  });

  describe("when the lot is canceled after its end", () => {
    it("stays canceled", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const cardId = await insertCard("Late Cancel Dragon");
      const lotId = await insertLot(auctioneerId, {
        title: "Late cancel room",
        startsAt: hoursFromNow(-3),
        endsAt: hoursFromNow(-1),
        status: "CANCELED",
        items: [
          {
            position: 1,
            cardId,
            cardName: "Late Cancel Dragon",
            imagePath: "https://images.example/late-cancel.jpg",
            cardSnapshot: { id: cardId, name: "Late Cancel Dragon" },
          },
        ],
      });

      const shown = await showFor(auctioneerId, lotId);

      expect(shown.lot.status).toBe("CANCELED");
      expect(shown.lot.sold).toBe(false);
      expect(shown.lot.receivedAmount).toBeNull();
    });

    it("keeps the accepted history and reports no sale", async () => {
      const auctioneerId = await insertUser("AUCTIONEER", "Cancel Owner");
      const cardId = await insertCard("Canceled Bid Dragon");
      const bidAt = new Date("2026-10-26T13:30:00.000Z");
      const lotId = await insertLot(auctioneerId, {
        title: "Canceled bid room",
        startsAt: hoursFromNow(-3),
        endsAt: hoursFromNow(-1),
        status: "CANCELED",
        items: [
          {
            position: 1,
            cardId,
            cardName: "Canceled Bid Dragon",
            imagePath: "https://images.example/canceled-bid.jpg",
            cardSnapshot: { id: cardId, name: "Canceled Bid Dragon" },
          },
        ],
      });
      const placed = await attachBids(lotId, [
        {
          sequence: 1,
          participantNo: 9,
          amount: "12.00",
          createdAt: bidAt,
        },
      ]);
      const leader = placed[0];

      if (leader === undefined) {
        throw new Error("Inserted bid was not returned");
      }

      const leaderWalletId = await insertWallet(leader.userId, "12.00");

      await insertMovement({
        walletId: leaderWalletId,
        type: "HOLD",
        amount: "12.00",
        lotId,
        bidId: leader.id,
      });

      const shown = await showFor(auctioneerId, lotId);
      const serialized = JSON.stringify(shown);

      expect(shown.lot).toMatchObject({
        status: "CANCELED",
        currentBid: "12.00",
        leaderParticipantNo: 9,
        bidCount: 1,
        sold: false,
        winnerParticipantNo: null,
        receivedAmount: null,
        bids: [
          {
            sequence: 1,
            amount: "12.00",
            createdAt: bidAt,
            participantNo: 9,
          },
        ],
      });
      expect(serialized).not.toContain(leader.userId);
      expect(serialized).not.toContain("Bidder 9");
      expect(serialized).not.toContain("Cancel Owner");
    });
  });

  describe("when the credited amount has fewer than two decimal digits", () => {
    it("shows a whole credit with two decimal places", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const cardId = await insertCard("Whole Credit Dragon");
      const lotId = await insertLot(auctioneerId, {
        title: "Whole credit room",
        startsAt: hoursFromNow(-3),
        endsAt: hoursFromNow(-1),
        status: "ENDED",
        items: [
          {
            position: 1,
            cardId,
            cardName: "Whole Credit Dragon",
            imagePath: "https://images.example/whole-credit.jpg",
            cardSnapshot: { id: cardId, name: "Whole Credit Dragon" },
          },
        ],
      });
      const auctioneerWalletId = await insertWallet(auctioneerId, "30.00");

      await insertMovement({
        walletId: auctioneerWalletId,
        type: "SETTLEMENT_CREDIT",
        amount: "30",
        lotId,
      });

      const shown = await showFor(auctioneerId, lotId);

      expect(shown.lot.receivedAmount).toBe("30.00");
    });

    it("shows a single decimal digit with two decimal places", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const cardId = await insertCard("Short Credit Dragon");
      const lotId = await insertLot(auctioneerId, {
        title: "Short credit room",
        startsAt: hoursFromNow(-3),
        endsAt: hoursFromNow(-1),
        status: "ENDED",
        items: [
          {
            position: 1,
            cardId,
            cardName: "Short Credit Dragon",
            imagePath: "https://images.example/short-credit.jpg",
            cardSnapshot: { id: cardId, name: "Short Credit Dragon" },
          },
        ],
      });
      const auctioneerWalletId = await insertWallet(auctioneerId, "30.50");

      await insertMovement({
        walletId: auctioneerWalletId,
        type: "SETTLEMENT_CREDIT",
        amount: "30.5",
        lotId,
      });

      const shown = await showFor(auctioneerId, lotId);

      expect(shown.lot.receivedAmount).toBe("30.50");
    });
  });
});
