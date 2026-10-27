//* Libraries imports
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";

//* Local imports
import { db } from "../../db/index";
import { bid, card, lot, lotItem, lotParticipant, user } from "../../db/schema";
import { runShowPublicLotRead, showPublicLot } from "./show-public-lot";

const now = new Date("2026-10-26T15:00:00.000Z");
const createdUserIds: string[] = [];
const createdCardIds: number[] = [];
const createdLotIds: string[] = [];

function hoursFromNow(hours: number) {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

function dependencies(viewerId: string | null = null) {
  return {
    now: () => now,
    viewerId,
  };
}

async function insertUser(role: "AUCTIONEER" | "BIDDER") {
  const id = crypto.randomUUID();

  await db.insert(user).values({
    id,
    name: "Show Tester",
    email: `show-${id}@example.com`,
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

async function insertLot(values: {
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
}) {
  const auctioneerId = await insertUser("AUCTIONEER");
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

  for (const entry of entries) {
    const bidderId = await insertUser("BIDDER");
    const participants = await db
      .insert(lotParticipant)
      .values({
        lotId,
        userId: bidderId,
        participantNo: entry.participantNo,
      })
      .returning({ id: lotParticipant.id });
    const participant = participants[0];

    if (!participant) {
      throw new Error("Insert participant did not return a row");
    }

    const bids = await db
      .insert(bid)
      .values({
        lotId,
        participantId: participant.id,
        bidderId,
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
      userId: bidderId,
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

async function cleanup() {
  if (createdLotIds.length > 0) {
    await db
      .update(lot)
      .set({ currentBidId: null, winnerId: null })
      .where(inArray(lot.id, createdLotIds));
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

describe("showPublicLot", () => {
  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe("when the lot is scheduled", () => {
    it("returns the frozen card snapshot and an empty bid history", async () => {
      const cardId = await insertCard("Catalog Dragon");
      const lotId = await insertLot({
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
                  image_url:
                    "https://images.ygoprodeck.com/images/cards/1.jpg",
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

      const shown = await showPublicLot(lotId, dependencies());
      const firstItem = shown.lot.items[0];

      expect(shown.serverNow).toEqual(now);
      expect(shown.viewerParticipantNo).toBeNull();
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
      expect(Object.keys(shown).sort()).toEqual([
        "lot",
        "serverNow",
        "viewerParticipantNo",
      ]);
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
        "sold",
        "startsAt",
        "status",
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
    });
  });

  describe("when the clock is exactly at the start", () => {
    it("returns live", async () => {
      const cardId = await insertCard("Start Dragon");
      const lotId = await insertLot({
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

      const shown = await showPublicLot(lotId, dependencies());

      expect(shown.lot.status).toBe("LIVE");
    });
  });

  describe("when the lot is live", () => {
    it("returns the current bid and the leader participant number", async () => {
      const cardId = await insertCard("Live Dragon");
      const firstBidAt = new Date("2026-10-26T14:10:00.000Z");
      const secondBidAt = new Date("2026-10-26T14:20:00.000Z");
      const lotId = await insertLot({
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

      await attachBids(lotId, [
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

      const shown = await showPublicLot(lotId, dependencies());
      const firstBid = shown.lot.bids[0];

      expect(shown.lot).toMatchObject({
        status: "LIVE",
        extensionCount: 2,
        currentBid: "15.00",
        leaderParticipantNo: 4,
        bidCount: 2,
        sold: false,
        winnerParticipantNo: null,
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
      expect(Object.keys(firstBid ?? {}).sort()).toEqual([
        "amount",
        "createdAt",
        "participantNo",
        "sequence",
      ]);
    });

    it("stays live when the original end has passed and the current end has not", async () => {
      const cardId = await insertCard("Extended Dragon");
      const lotId = await insertLot({
        title: "Extended room",
        startsAt: hoursFromNow(-2),
        originalEndsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(1),
        extensionCount: 3,
        items: [
          {
            position: 1,
            cardId,
            cardName: "Extended Dragon",
            imagePath: "https://images.example/extended.jpg",
            cardSnapshot: { id: cardId, name: "Extended Dragon" },
          },
        ],
      });

      const shown = await showPublicLot(lotId, dependencies());

      expect(shown.lot.status).toBe("LIVE");
      expect(shown.lot.endsAt).toEqual(hoursFromNow(1));
      expect(shown.lot.extensionCount).toBe(3);
    });
  });

  describe("when the clock is exactly at the end", () => {
    it("returns ended", async () => {
      const cardId = await insertCard("Ending Dragon");
      const lotId = await insertLot({
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

      const shown = await showPublicLot(lotId, dependencies());

      expect(shown.lot.status).toBe("ENDED");
      expect(shown.lot.sold).toBe(false);
    });
  });

  describe("when the lot has passed its end without settlement", () => {
    it("returns ended with sold false", async () => {
      const cardId = await insertCard("Pending Dragon");
      const bidAt = new Date("2026-10-26T13:00:00.000Z");
      const lotId = await insertLot({
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

      await attachBids(lotId, [
        {
          sequence: 1,
          participantNo: 1,
          amount: "20.00",
          createdAt: bidAt,
        },
      ]);

      const shown = await showPublicLot(lotId, dependencies());

      expect(shown.lot).toMatchObject({
        status: "ENDED",
        currentBid: "20.00",
        leaderParticipantNo: 1,
        bidCount: 1,
        sold: false,
        winnerParticipantNo: null,
      });
    });
  });

  describe("when the lot is settled", () => {
    it("returns the winner participant number", async () => {
      const cardId = await insertCard("Settled Dragon");
      const bidAt = new Date("2026-10-26T14:00:00.000Z");
      const lotId = await insertLot({
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

      await attachBids(
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

      const shown = await showPublicLot(lotId, dependencies());

      expect(shown.lot).toMatchObject({
        status: "ENDED",
        currentBid: "30.00",
        leaderParticipantNo: 7,
        sold: true,
        winnerParticipantNo: 7,
      });
    });
  });

  describe("when the lot is canceled", () => {
    it("returns the canceled status and the accepted bids in sequence order", async () => {
      const cardId = await insertCard("Canceled Dragon");
      const firstBidAt = new Date("2026-10-26T14:30:00.000Z");
      const secondBidAt = new Date("2026-10-26T14:40:00.000Z");
      const lotId = await insertLot({
        title: "Canceled room",
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
        status: "CANCELED",
        items: [
          {
            position: 1,
            cardId,
            cardName: "Canceled Dragon",
            imagePath: "https://images.example/canceled.jpg",
            cardSnapshot: { id: cardId, name: "Canceled Dragon" },
          },
        ],
      });

      await attachBids(lotId, [
        {
          sequence: 2,
          participantNo: 5,
          amount: "18.00",
          createdAt: secondBidAt,
        },
        {
          sequence: 1,
          participantNo: 3,
          amount: "11.00",
          createdAt: firstBidAt,
        },
      ]);

      const shown = await showPublicLot(lotId, dependencies());

      expect(shown.lot).toMatchObject({
        status: "CANCELED",
        currentBid: "18.00",
        leaderParticipantNo: 5,
        bidCount: 2,
        sold: false,
        winnerParticipantNo: null,
        bids: [
          {
            sequence: 1,
            amount: "11.00",
            createdAt: firstBidAt,
            participantNo: 3,
          },
          {
            sequence: 2,
            amount: "18.00",
            createdAt: secondBidAt,
            participantNo: 5,
          },
        ],
      });
    });
  });

  describe("when the lot is canceled after its end", () => {
    it("stays canceled", async () => {
      const cardId = await insertCard("Late Cancel Dragon");
      const lotId = await insertLot({
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

      const shown = await showPublicLot(lotId, dependencies());

      expect(shown.lot.status).toBe("CANCELED");
      expect(shown.lot.sold).toBe(false);
    });
  });

  describe("when the lot is marked ended before its end", () => {
    it("stays ended", async () => {
      const cardId = await insertCard("Early End Dragon");
      const lotId = await insertLot({
        title: "Early end room",
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
        status: "ENDED",
        items: [
          {
            position: 1,
            cardId,
            cardName: "Early End Dragon",
            imagePath: "https://images.example/early-end.jpg",
            cardSnapshot: { id: cardId, name: "Early End Dragon" },
          },
        ],
      });

      const shown = await showPublicLot(lotId, dependencies());

      expect(shown.lot.status).toBe("ENDED");
      expect(shown.lot.endsAt).toEqual(hoursFromNow(2));
    });
  });

  describe("when a bid commits during the read", () => {
    it("returns the current bid and the history from the same snapshot", async () => {
      const cardId = await insertCard("Snapshot Dragon");
      const firstBidAt = new Date("2026-10-26T14:00:00.000Z");
      const secondBidAt = new Date("2026-10-26T14:05:00.000Z");
      const lotId = await insertLot({
        title: "Snapshot room",
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(1),
        items: [
          {
            position: 1,
            cardId,
            cardName: "Snapshot Dragon",
            imagePath: "https://images.example/snapshot.jpg",
            cardSnapshot: { id: cardId, name: "Snapshot Dragon" },
          },
        ],
      });

      await attachBids(lotId, [
        {
          sequence: 1,
          participantNo: 1,
          amount: "10.00",
          createdAt: firstBidAt,
        },
      ]);

      let openSnapshot = () => {};
      const snapshotReady = new Promise<void>((resolve) => {
        openSnapshot = resolve;
      });
      let finishWrite = () => {};
      const writeFinished = new Promise<void>((resolve) => {
        finishWrite = resolve;
      });
      const shownPromise = showPublicLot(lotId, {
        now: () => now,
        runInTransaction: (work) =>
          runShowPublicLotRead(async (executor) => {
            await executor.execute(sql`select 1`);
            openSnapshot();
            await writeFinished;
            return work(executor);
          }),
      });

      try {
        await snapshotReady;
        await attachBids(lotId, [
          {
            sequence: 2,
            participantNo: 2,
            amount: "25.00",
            createdAt: secondBidAt,
          },
        ]);
      } finally {
        finishWrite();
      }

      const shown = await shownPromise;

      expect(shown.lot.currentBid).toBe("10.00");
      expect(shown.lot.leaderParticipantNo).toBe(1);
      expect(shown.lot.bidCount).toBe(1);
      expect(shown.lot.bids).toEqual([
        {
          sequence: 1,
          amount: "10.00",
          createdAt: firstBidAt,
          participantNo: 1,
        },
      ]);
    });
  });

  describe("when the viewer has bid on the lot", () => {
    it("returns each bidder their own participant number", async () => {
      const cardId = await insertCard("Viewer Dragon");
      const lotId = await insertLot({
        title: "Viewer room",
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(1),
        items: [
          {
            position: 1,
            cardId,
            cardName: "Viewer Dragon",
            imagePath: "https://images.example/viewer.jpg",
            cardSnapshot: { id: cardId, name: "Viewer Dragon" },
          },
        ],
      });
      const placed = await attachBids(lotId, [
        {
          sequence: 1,
          participantNo: 2,
          amount: "10.00",
          createdAt: new Date("2026-10-26T14:10:00.000Z"),
        },
        {
          sequence: 2,
          participantNo: 4,
          amount: "15.00",
          createdAt: new Date("2026-10-26T14:20:00.000Z"),
        },
      ]);
      const previous = placed.find((entry) => entry.sequence === 1);
      const leader = placed.find((entry) => entry.sequence === 2);

      if (previous === undefined || leader === undefined) {
        throw new Error("Inserted bids were not returned");
      }

      const passed = await showPublicLot(lotId, dependencies(previous.userId));
      const winning = await showPublicLot(lotId, dependencies(leader.userId));

      expect(passed.viewerParticipantNo).toBe(2);
      expect(passed.lot.leaderParticipantNo).toBe(4);
      expect(winning.viewerParticipantNo).toBe(4);
      expect(winning.lot.leaderParticipantNo).toBe(4);
      expect(JSON.stringify(passed)).not.toContain(previous.userId);
      expect(JSON.stringify(winning)).not.toContain(leader.userId);
    });
  });

  describe("when the viewer has not joined the lot", () => {
    it("returns a null viewer participant number", async () => {
      const cardId = await insertCard("Stranger Dragon");
      const strangerId = await insertUser("BIDDER");
      const lotId = await insertLot({
        title: "Stranger room",
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(3),
        items: [
          {
            position: 1,
            cardId,
            cardName: "Stranger Dragon",
            imagePath: "https://images.example/stranger.jpg",
            cardSnapshot: { id: cardId, name: "Stranger Dragon" },
          },
        ],
      });

      const shown = await showPublicLot(lotId, dependencies(strangerId));

      expect(shown.viewerParticipantNo).toBeNull();
      expect(JSON.stringify(shown)).not.toContain(strangerId);
    });
  });

  describe("when the lot does not exist", () => {
    it("rejects the request", async () => {
      await expect(
        showPublicLot(crypto.randomUUID(), dependencies()),
      ).rejects.toMatchObject({
        name: "ShowPublicLotError",
        code: "LOT_NOT_FOUND",
        message: "Lot was not found.",
      });
    });
  });
});
