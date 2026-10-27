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
import type { AuctioneerLotStatus } from "../../schemas/list-lots";
import {
  listAuctioneerLots,
  ListAuctioneerLotsError,
} from "./list-auctioneer-lots";

const now = new Date("2026-10-26T15:00:00.000Z");
const createdUserIds: string[] = [];
const createdCardIds: number[] = [];
const createdLotIds: string[] = [];

function createToken() {
  return `listing-${crypto.randomUUID()}`;
}

function hoursFromNow(hours: number) {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

function dependencies() {
  return {
    now: () => now,
    executor: db,
  };
}

function listFor(
  auctioneerId: string,
  query: { q?: string; status?: AuctioneerLotStatus } = {},
) {
  return listAuctioneerLots(
    {
      auctioneerId,
      role: "AUCTIONEER",
      q: query.q,
      status: query.status,
    },
    dependencies(),
  );
}

async function insertUser(role: "AUCTIONEER" | "BIDDER") {
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
    status?: "ACTIVE" | "ENDED" | "CANCELED";
    canceledAt?: Date;
    items: Array<{
      cardId: number;
      cardName: string;
      imagePath: string;
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
      originalEndsAt: values.endsAt,
      endsAt: values.endsAt,
      status,
      endedAt: status === "ENDED" ? values.endsAt : null,
      canceledAt: status === "CANCELED" ? (values.canceledAt ?? now) : null,
    })
    .returning({ id: lot.id });
  const row = rows[0];

  if (!row) {
    throw new Error("Insert lot did not return a row");
  }

  createdLotIds.push(row.id);

  await db.insert(lotItem).values(
    values.items.map((item, index) => ({
      lotId: row.id,
      position: index + 1,
      cardId: item.cardId,
      quantity: 1,
      cardName: item.cardName,
      cardSnapshot: { id: item.cardId, name: item.cardName },
      imagePath: item.imagePath,
    })),
  );

  return row.id;
}

async function attachBid(lotId: string, amount: string, winner: boolean) {
  const bidderId = await insertUser("BIDDER");
  const participants = await db
    .insert(lotParticipant)
    .values({
      lotId,
      userId: bidderId,
      participantNo: 1,
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
      sequence: 1,
      amount,
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
      ...(winner
        ? {
            winnerId: bidderId,
            status: "ENDED" as const,
            endedAt: now,
          }
        : {}),
    })
    .where(eq(lot.id, lotId));

  return {
    bidderId,
    bidId: createdBid.id,
  };
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
  type: "DEPOSIT" | "HOLD" | "SETTLEMENT_DEBIT" | "SETTLEMENT_CREDIT";
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

describe("listAuctioneerLots", () => {
  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe("authorization", () => {
    it("rejects a bidder", async () => {
      const rejection = listAuctioneerLots(
        {
          auctioneerId: crypto.randomUUID(),
          role: "BIDDER",
          q: undefined,
        },
        dependencies(),
      );

      await expect(rejection).rejects.toBeInstanceOf(ListAuctioneerLotsError);
      await expect(rejection).rejects.toMatchObject({
        code: "NOT_AUCTIONEER",
      });
    });
  });

  describe("effective status", () => {
    it("reports a future lot as scheduled", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const token = createToken();
      const cardId = await insertCard("Scheduled Dragon");
      const lotId = await insertLot(auctioneerId, {
        title: token,
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(3),
        items: [
          {
            cardId,
            cardName: "Scheduled Dragon",
            imagePath: "https://images.example/scheduled.jpg",
          },
        ],
      });

      const listed = await listFor(auctioneerId, { q: token });

      expect(listed.lots).toEqual([
        expect.objectContaining({
          id: lotId,
          status: "SCHEDULED",
          currentBid: null,
          bidCount: 0,
          sold: false,
          receivedAmount: null,
        }),
      ]);
    });

    it("reports a lot as live at the start instant", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const token = createToken();
      const cardId = await insertCard("Opening Dragon");
      const lotId = await insertLot(auctioneerId, {
        title: token,
        startsAt: now,
        endsAt: hoursFromNow(1),
        items: [
          {
            cardId,
            cardName: "Opening Dragon",
            imagePath: "https://images.example/opening.jpg",
          },
        ],
      });

      const listed = await listFor(auctioneerId, { q: token });

      expect(listed.lots).toEqual([
        expect.objectContaining({
          id: lotId,
          status: "LIVE",
        }),
      ]);
    });

    it("reports a lot as ended at the end instant", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const token = createToken();
      const cardId = await insertCard("Closing Dragon");
      const lotId = await insertLot(auctioneerId, {
        title: token,
        startsAt: hoursFromNow(-1),
        endsAt: now,
        items: [
          {
            cardId,
            cardName: "Closing Dragon",
            imagePath: "https://images.example/closing.jpg",
          },
        ],
      });

      const listed = await listFor(auctioneerId, { q: token });

      expect(listed.lots).toEqual([
        expect.objectContaining({
          id: lotId,
          status: "ENDED",
          sold: false,
          receivedAmount: null,
        }),
      ]);
    });

    it("reports an active lot as ended once the current time is past ends at", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const token = createToken();
      const cardId = await insertCard("Past Dragon");
      const lotId = await insertLot(auctioneerId, {
        title: token,
        startsAt: hoursFromNow(-3),
        endsAt: hoursFromNow(-1),
        items: [
          {
            cardId,
            cardName: "Past Dragon",
            imagePath: "https://images.example/past.jpg",
          },
        ],
      });

      const listed = await listFor(auctioneerId, { q: token });

      expect(listed.lots).toEqual([
        expect.objectContaining({
          id: lotId,
          status: "ENDED",
          sold: false,
        }),
      ]);
    });

    it("lists live lots, then scheduled lots, then ended lots, then canceled lots", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const token = createToken();
      const liveSoonCard = await insertCard("Live Soon");
      const liveLaterCard = await insertCard("Live Later");
      const scheduledSoonCard = await insertCard("Scheduled Soon");
      const scheduledLaterCard = await insertCard("Scheduled Later");
      const endedRecentCard = await insertCard("Ended Recent");
      const endedOlderCard = await insertCard("Ended Older");
      const canceledRecentCard = await insertCard("Canceled Recent");
      const canceledOlderCard = await insertCard("Canceled Older");
      const liveSoonId = await insertLot(auctioneerId, {
        title: `${token} live soon`,
        startsAt: hoursFromNow(-2),
        endsAt: hoursFromNow(1),
        items: [
          {
            cardId: liveSoonCard,
            cardName: "Live Soon",
            imagePath: "https://images.example/live-soon.jpg",
          },
        ],
      });
      const liveLaterId = await insertLot(auctioneerId, {
        title: `${token} live later`,
        startsAt: hoursFromNow(-2),
        endsAt: hoursFromNow(3),
        items: [
          {
            cardId: liveLaterCard,
            cardName: "Live Later",
            imagePath: "https://images.example/live-later.jpg",
          },
        ],
      });
      const scheduledSoonId = await insertLot(auctioneerId, {
        title: `${token} scheduled soon`,
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(5),
        items: [
          {
            cardId: scheduledSoonCard,
            cardName: "Scheduled Soon",
            imagePath: "https://images.example/scheduled-soon.jpg",
          },
        ],
      });
      const scheduledLaterId = await insertLot(auctioneerId, {
        title: `${token} scheduled later`,
        startsAt: hoursFromNow(4),
        endsAt: hoursFromNow(8),
        items: [
          {
            cardId: scheduledLaterCard,
            cardName: "Scheduled Later",
            imagePath: "https://images.example/scheduled-later.jpg",
          },
        ],
      });
      const endedRecentId = await insertLot(auctioneerId, {
        title: `${token} ended recent`,
        startsAt: hoursFromNow(-10),
        endsAt: hoursFromNow(-1),
        status: "ENDED",
        items: [
          {
            cardId: endedRecentCard,
            cardName: "Ended Recent",
            imagePath: "https://images.example/ended-recent.jpg",
          },
        ],
      });
      const endedOlderId = await insertLot(auctioneerId, {
        title: `${token} ended older`,
        startsAt: hoursFromNow(-20),
        endsAt: hoursFromNow(-5),
        status: "ENDED",
        items: [
          {
            cardId: endedOlderCard,
            cardName: "Ended Older",
            imagePath: "https://images.example/ended-older.jpg",
          },
        ],
      });
      const canceledRecentId = await insertLot(auctioneerId, {
        title: `${token} canceled recent`,
        startsAt: hoursFromNow(-2),
        endsAt: hoursFromNow(2),
        status: "CANCELED",
        canceledAt: now,
        items: [
          {
            cardId: canceledRecentCard,
            cardName: "Canceled Recent",
            imagePath: "https://images.example/canceled-recent.jpg",
          },
        ],
      });
      const canceledOlderId = await insertLot(auctioneerId, {
        title: `${token} canceled older`,
        startsAt: hoursFromNow(-4),
        endsAt: hoursFromNow(2),
        status: "CANCELED",
        canceledAt: hoursFromNow(-2),
        items: [
          {
            cardId: canceledOlderCard,
            cardName: "Canceled Older",
            imagePath: "https://images.example/canceled-older.jpg",
          },
        ],
      });

      const listed = await listFor(auctioneerId, { q: token });

      expect(listed.lots.map((entry) => entry.id)).toEqual([
        liveSoonId,
        liveLaterId,
        scheduledSoonId,
        scheduledLaterId,
        endedRecentId,
        endedOlderId,
        canceledRecentId,
        canceledOlderId,
      ]);
      expect(listed.lots.map((entry) => entry.status)).toEqual([
        "LIVE",
        "LIVE",
        "SCHEDULED",
        "SCHEDULED",
        "ENDED",
        "ENDED",
        "CANCELED",
        "CANCELED",
      ]);
    });
  });

  describe("canceled lots", () => {
    it("includes a canceled lot in the unfiltered list", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const token = createToken();
      const cardId = await insertCard("Canceled Dragon");
      const lotId = await insertLot(auctioneerId, {
        title: token,
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
        status: "CANCELED",
        items: [
          {
            cardId,
            cardName: "Canceled Dragon",
            imagePath: "https://images.example/canceled.jpg",
          },
        ],
      });

      const listed = await listFor(auctioneerId);

      expect(listed.lots).toEqual([
        expect.objectContaining({
          id: lotId,
          status: "CANCELED",
          sold: false,
          receivedAmount: null,
        }),
      ]);
    });

    it("returns a canceled lot only when the status filter is canceled", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const token = createToken();
      const liveCard = await insertCard("Visible Dragon");
      const canceledCard = await insertCard("Canceled Dragon");
      const liveId = await insertLot(auctioneerId, {
        title: `${token} live`,
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
        items: [
          {
            cardId: liveCard,
            cardName: "Visible Dragon",
            imagePath: "https://images.example/visible.jpg",
          },
        ],
      });
      const canceledId = await insertLot(auctioneerId, {
        title: `${token} canceled`,
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
        status: "CANCELED",
        items: [
          {
            cardId: canceledCard,
            cardName: `${token} canceled card`,
            imagePath: "https://images.example/canceled.jpg",
          },
        ],
      });

      const unfiltered = await listFor(auctioneerId, { q: token });
      const canceled = await listFor(auctioneerId, {
        q: token,
        status: "CANCELED",
      });
      const live = await listFor(auctioneerId, { q: token, status: "LIVE" });
      const scheduled = await listFor(auctioneerId, {
        q: token,
        status: "SCHEDULED",
      });
      const ended = await listFor(auctioneerId, { q: token, status: "ENDED" });

      expect(unfiltered.lots.map((entry) => entry.id)).toEqual([
        liveId,
        canceledId,
      ]);
      expect(canceled.lots.map((entry) => entry.id)).toEqual([canceledId]);
      expect(live.lots.map((entry) => entry.id)).toEqual([liveId]);
      expect(scheduled.lots).toEqual([]);
      expect(ended.lots).toEqual([]);
    });
  });

  describe("text search", () => {
    it("matches a lot by title", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const token = createToken();
      const matchingCard = await insertCard("Other Card");
      const decoyCard = await insertCard("Decoy Card");
      const matchingId = await insertLot(auctioneerId, {
        title: `${token} Blue-Eyes`,
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(3),
        items: [
          {
            cardId: matchingCard,
            cardName: "Other Card",
            imagePath: "https://images.example/other.jpg",
          },
        ],
      });

      await insertLot(auctioneerId, {
        title: "Different title",
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(4),
        items: [
          {
            cardId: decoyCard,
            cardName: "Decoy Card",
            imagePath: "https://images.example/decoy.jpg",
          },
        ],
      });

      const listed = await listFor(auctioneerId, { q: token });

      expect(listed.lots.map((entry) => entry.id)).toEqual([matchingId]);
    });

    it("matches a lot by the stored card name", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const token = createToken();
      const matchingCard = await insertCard("Named Dragon");
      const decoyCard = await insertCard("Other Dragon");
      const matchingId = await insertLot(auctioneerId, {
        title: "Plain title",
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(3),
        items: [
          {
            cardId: matchingCard,
            cardName: `${token} Dragon`,
            imagePath: "https://images.example/named.jpg",
          },
        ],
      });

      await insertLot(auctioneerId, {
        title: "Another title",
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(4),
        items: [
          {
            cardId: decoyCard,
            cardName: "Other Dragon",
            imagePath: "https://images.example/other.jpg",
          },
        ],
      });

      const listed = await listFor(auctioneerId, { q: token });

      expect(listed.lots.map((entry) => entry.id)).toEqual([matchingId]);
    });

    it("combines the text search with the status filter", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const token = createToken();
      const liveCard = await insertCard("Combined Live");
      const scheduledCard = await insertCard("Combined Scheduled");
      const liveId = await insertLot(auctioneerId, {
        title: `${token} live`,
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
        items: [
          {
            cardId: liveCard,
            cardName: "Combined Live",
            imagePath: "https://images.example/combined-live.jpg",
          },
        ],
      });

      await insertLot(auctioneerId, {
        title: `${token} scheduled`,
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(4),
        items: [
          {
            cardId: scheduledCard,
            cardName: "Combined Scheduled",
            imagePath: "https://images.example/combined-scheduled.jpg",
          },
        ],
      });

      const listed = await listFor(auctioneerId, { q: token, status: "LIVE" });

      expect(listed.lots.map((entry) => entry.id)).toEqual([liveId]);
    });

    it("returns a lot once when several items match", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const token = createToken();
      const firstCard = await insertCard("First");
      const secondCard = await insertCard("Second");
      const lotId = await insertLot(auctioneerId, {
        title: `${token} pair`,
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(3),
        items: [
          {
            cardId: firstCard,
            cardName: `${token} Alpha`,
            imagePath: "https://images.example/alpha.jpg",
          },
          {
            cardId: secondCard,
            cardName: `${token} Beta`,
            imagePath: "https://images.example/beta.jpg",
          },
        ],
      });

      const listed = await listFor(auctioneerId, { q: token });

      expect(listed.lots).toHaveLength(1);
      expect(listed.lots[0]?.id).toBe(lotId);
      expect(listed.lots[0]?.items.map((item) => item.cardName)).toEqual([
        `${token} Alpha`,
        `${token} Beta`,
      ]);
      expect(listed.lots[0]?.items.map((item) => item.position)).toEqual([
        1, 2,
      ]);
    });

    it("treats like wildcards in the search as literal characters", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const token = createToken();
      const literalCard = await insertCard("Literal");
      const similarCard = await insertCard("Similar");
      const literalId = await insertLot(auctioneerId, {
        title: `${token} 100%_off`,
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(3),
        items: [
          {
            cardId: literalCard,
            cardName: "Literal",
            imagePath: "https://images.example/literal.jpg",
          },
        ],
      });

      await insertLot(auctioneerId, {
        title: `${token} 100XYoff`,
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(4),
        items: [
          {
            cardId: similarCard,
            cardName: "Similar",
            imagePath: "https://images.example/similar.jpg",
          },
        ],
      });

      const listed = await listFor(auctioneerId, { q: `${token} 100%_off` });

      expect(listed.lots.map((entry) => entry.id)).toEqual([literalId]);
    });

    it("returns an empty list when nothing matches", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const listed = await listFor(auctioneerId, { q: createToken() });

      expect(listed).toEqual({
        totalReceived: "0.00",
        lots: [],
      });
    });

    it("ignores a blank search", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const token = createToken();
      const cardId = await insertCard("Blank Search");
      const lotId = await insertLot(auctioneerId, {
        title: token,
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(3),
        items: [
          {
            cardId,
            cardName: "Blank Search",
            imagePath: "https://images.example/blank.jpg",
          },
        ],
      });

      const listed = await listFor(auctioneerId, { q: "   " });

      expect(listed.lots.map((entry) => entry.id)).toEqual([lotId]);
    });
  });

  describe("ownership", () => {
    it("omits a lot that belongs to another auctioneer", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const otherAuctioneerId = await insertUser("AUCTIONEER");
      const token = createToken();
      const ownCard = await insertCard("Own Dragon");
      const otherCard = await insertCard("Other Dragon");
      const ownId = await insertLot(auctioneerId, {
        title: `${token} own`,
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(3),
        items: [
          {
            cardId: ownCard,
            cardName: "Own Dragon",
            imagePath: "https://images.example/own.jpg",
          },
        ],
      });

      await insertLot(otherAuctioneerId, {
        title: `${token} other`,
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(3),
        items: [
          {
            cardId: otherCard,
            cardName: "Other Dragon",
            imagePath: "https://images.example/other.jpg",
          },
        ],
      });

      const listed = await listFor(auctioneerId, { q: token });

      expect(listed.lots.map((entry) => entry.id)).toEqual([ownId]);
    });
  });

  describe("received amounts", () => {
    it("ignores a hold and a deposit when totaling what the auctioneer received", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const token = createToken();
      const cardId = await insertCard("Held Dragon");
      const lotId = await insertLot(auctioneerId, {
        title: token,
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
        items: [
          {
            cardId,
            cardName: "Held Dragon",
            imagePath: "https://images.example/held.jpg",
          },
        ],
      });
      const placed = await attachBid(lotId, "15.00", false);
      const auctioneerWalletId = await insertWallet(auctioneerId, "100.00");

      await insertMovement({
        walletId: auctioneerWalletId,
        type: "DEPOSIT",
        amount: "100.00",
      });
      await insertMovement({
        walletId: auctioneerWalletId,
        type: "HOLD",
        amount: "15.00",
        lotId,
        bidId: placed.bidId,
      });

      const listed = await listFor(auctioneerId, { q: token });

      expect(listed.totalReceived).toBe("0.00");
      expect(listed.lots).toEqual([
        expect.objectContaining({
          id: lotId,
          status: "LIVE",
          currentBid: "15.00",
          sold: false,
          receivedAmount: null,
        }),
      ]);
    });

    it("returns the settlement credit on the sold lot and in the total", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const otherAuctioneerId = await insertUser("AUCTIONEER");
      const token = createToken();
      const firstCard = await insertCard("Sold First");
      const secondCard = await insertCard("Sold Second");
      const otherCard = await insertCard("Sold Other");
      const firstId = await insertLot(auctioneerId, {
        title: `${token} first`,
        startsAt: hoursFromNow(-6),
        endsAt: hoursFromNow(-1),
        status: "ENDED",
        items: [
          {
            cardId: firstCard,
            cardName: "Sold First",
            imagePath: "https://images.example/sold-first.jpg",
          },
        ],
      });
      const secondId = await insertLot(auctioneerId, {
        title: `${token} second`,
        startsAt: hoursFromNow(-8),
        endsAt: hoursFromNow(-2),
        status: "ENDED",
        items: [
          {
            cardId: secondCard,
            cardName: "Sold Second",
            imagePath: "https://images.example/sold-second.jpg",
          },
        ],
      });
      const otherId = await insertLot(otherAuctioneerId, {
        title: `${token} other`,
        startsAt: hoursFromNow(-6),
        endsAt: hoursFromNow(-1),
        status: "ENDED",
        items: [
          {
            cardId: otherCard,
            cardName: "Sold Other",
            imagePath: "https://images.example/sold-other.jpg",
          },
        ],
      });

      await attachBid(firstId, "20.00", true);
      await attachBid(secondId, "5.50", true);
      await attachBid(otherId, "99.00", true);

      const auctioneerWalletId = await insertWallet(auctioneerId, "25.50");
      const otherWalletId = await insertWallet(otherAuctioneerId, "99.00");

      await insertMovement({
        walletId: auctioneerWalletId,
        type: "SETTLEMENT_CREDIT",
        amount: "20.00",
        lotId: firstId,
      });
      await insertMovement({
        walletId: auctioneerWalletId,
        type: "SETTLEMENT_CREDIT",
        amount: "5.50",
        lotId: secondId,
      });
      await insertMovement({
        walletId: otherWalletId,
        type: "SETTLEMENT_CREDIT",
        amount: "99.00",
        lotId: otherId,
      });

      const listed = await listFor(auctioneerId, { q: token });

      expect(listed.totalReceived).toBe("25.50");
      expect(listed.lots).toEqual([
        expect.objectContaining({
          id: firstId,
          status: "ENDED",
          sold: true,
          currentBid: "20.00",
          receivedAmount: "20.00",
        }),
        expect.objectContaining({
          id: secondId,
          status: "ENDED",
          sold: true,
          currentBid: "5.50",
          receivedAmount: "5.50",
        }),
      ]);
    });

    it("leaves an ended lot without a winner and a canceled lot uncredited", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const token = createToken();
      const unsoldCard = await insertCard("Unsold Dragon");
      const canceledCard = await insertCard("Canceled Dragon");
      const soldCard = await insertCard("Sold Dragon");
      const unsoldId = await insertLot(auctioneerId, {
        title: `${token} unsold`,
        startsAt: hoursFromNow(-4),
        endsAt: hoursFromNow(-1),
        status: "ENDED",
        items: [
          {
            cardId: unsoldCard,
            cardName: "Unsold Dragon",
            imagePath: "https://images.example/unsold.jpg",
          },
        ],
      });
      const canceledId = await insertLot(auctioneerId, {
        title: `${token} canceled`,
        startsAt: hoursFromNow(-2),
        endsAt: hoursFromNow(2),
        status: "CANCELED",
        items: [
          {
            cardId: canceledCard,
            cardName: "Canceled Dragon",
            imagePath: "https://images.example/canceled.jpg",
          },
        ],
      });
      const soldId = await insertLot(auctioneerId, {
        title: `${token} sold`,
        startsAt: hoursFromNow(-6),
        endsAt: hoursFromNow(-2),
        status: "ENDED",
        items: [
          {
            cardId: soldCard,
            cardName: "Sold Dragon",
            imagePath: "https://images.example/sold.jpg",
          },
        ],
      });
      const bidderId = await insertUser("BIDDER");
      const bidderWalletId = await insertWallet(bidderId, "10.00");
      const auctioneerWalletId = await insertWallet(auctioneerId, "10.00");

      await attachBid(soldId, "10.00", true);
      await insertMovement({
        walletId: bidderWalletId,
        type: "SETTLEMENT_DEBIT",
        amount: "10.00",
        lotId: soldId,
      });
      await insertMovement({
        walletId: auctioneerWalletId,
        type: "SETTLEMENT_CREDIT",
        amount: "10.00",
        lotId: soldId,
      });

      const listed = await listFor(auctioneerId, { q: token });
      const byId = new Map(listed.lots.map((entry) => [entry.id, entry]));

      expect(listed.totalReceived).toBe("10.00");
      expect(byId.get(unsoldId)).toMatchObject({
        status: "ENDED",
        sold: false,
        receivedAmount: null,
      });
      expect(byId.get(canceledId)).toMatchObject({
        status: "CANCELED",
        sold: false,
        receivedAmount: null,
      });
      expect(byId.get(soldId)).toMatchObject({
        status: "ENDED",
        sold: true,
        receivedAmount: "10.00",
      });
    });

    it("keeps the credited total when the list is filtered", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const token = createToken();
      const soldCard = await insertCard("Filtered Sold");
      const scheduledCard = await insertCard("Filtered Scheduled");
      const soldId = await insertLot(auctioneerId, {
        title: `${token} sold`,
        startsAt: hoursFromNow(-6),
        endsAt: hoursFromNow(-1),
        status: "ENDED",
        items: [
          {
            cardId: soldCard,
            cardName: "Filtered Sold",
            imagePath: "https://images.example/filtered-sold.jpg",
          },
        ],
      });
      const scheduledId = await insertLot(auctioneerId, {
        title: `${token} scheduled`,
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(4),
        items: [
          {
            cardId: scheduledCard,
            cardName: "Filtered Scheduled",
            imagePath: "https://images.example/filtered-scheduled.jpg",
          },
        ],
      });
      const auctioneerWalletId = await insertWallet(auctioneerId, "10.00");

      await attachBid(soldId, "10.00", true);
      await insertMovement({
        walletId: auctioneerWalletId,
        type: "SETTLEMENT_CREDIT",
        amount: "10.00",
        lotId: soldId,
      });

      const listed = await listFor(auctioneerId, {
        q: token,
        status: "SCHEDULED",
      });

      expect(listed.totalReceived).toBe("10.00");
      expect(listed.lots.map((entry) => entry.id)).toEqual([scheduledId]);
      expect(listed.lots[0]?.receivedAmount).toBeNull();
    });
  });
});
