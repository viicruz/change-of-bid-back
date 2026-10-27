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
  wallet,
  walletMovement,
} from "../../db/schema";
import {
  listBidderParticipations,
  ListBidderParticipationsError,
} from "./list-bidder-participations";

const now = new Date("2026-10-26T15:00:00.000Z");
const createdUserIds: string[] = [];
const createdCardIds: number[] = [];
const createdLotIds: string[] = [];

function hoursFromNow(hours: number) {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

function createShareToken() {
  return randomBytes(32).toString("base64url");
}

function dependencies() {
  return {
    now: () => now,
    executor: db,
  };
}

function listFor(userId: string) {
  return listBidderParticipations(
    {
      userId,
      role: "BIDDER",
    },
    dependencies(),
  );
}

async function insertUser(role: "AUCTIONEER" | "BIDDER") {
  const id = crypto.randomUUID();

  await db.insert(user).values({
    id,
    name: "Participation Tester",
    email: `participation-${id}@example.com`,
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
    openingBid?: string;
    minIncrement?: string;
    startsAt: Date;
    endsAt: Date;
    status?: "ACTIVE" | "ENDED" | "CANCELED";
    canceledAt?: Date;
    items: Array<{
      cardId: number;
      cardName: string;
      imagePath: string;
      quantity?: number;
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
      openingBid: values.openingBid ?? "10.00",
      minIncrement: values.minIncrement ?? "1.00",
      startsAt: values.startsAt,
      originalEndsAt: values.endsAt,
      endsAt: values.endsAt,
      status,
      endedAt: status === "ENDED" ? values.endsAt : null,
      canceledAt: status === "CANCELED" ? (values.canceledAt ?? now) : null,
      headHash: "secret-hash",
    })
    .returning({ id: lot.id });
  const row = rows[0];

  if (!row) {
    throw new Error("Insert lot did not return a row");
  }

  createdLotIds.push(row.id);

  const insertedItems = await db
    .insert(lotItem)
    .values(
      values.items.map((item, index) => ({
        lotId: row.id,
        position: index + 1,
        cardId: item.cardId,
        quantity: item.quantity ?? 1,
        cardName: item.cardName,
        cardSnapshot: { id: item.cardId, name: item.cardName },
        imagePath: item.imagePath,
      })),
    )
    .returning({
      id: lotItem.id,
      position: lotItem.position,
      cardId: lotItem.cardId,
      quantity: lotItem.quantity,
      cardName: lotItem.cardName,
      imagePath: lotItem.imagePath,
    });

  return {
    id: row.id,
    items: insertedItems,
  };
}

async function insertAcceptedBid(values: {
  lotId: string;
  userId: string;
  participantNo: number;
  sequence: number;
  amount: string;
  current?: boolean;
  winner?: boolean;
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
      sequence: values.sequence,
      amount: values.amount,
      previousHash: "genesis",
      hash: `hash-${values.lotId}-${values.sequence}`,
    })
    .returning({ id: bid.id });
  const createdBid = bids[0];

  if (!createdBid) {
    throw new Error("Insert bid did not return a row");
  }

  if (values.current === true || values.winner === true) {
    await db
      .update(lot)
      .set({
        ...(values.current === true
          ? {
              currentBidId: createdBid.id,
              bidCount: values.sequence,
            }
          : {}),
        ...(values.winner === true
          ? {
              winnerId: values.userId,
              status: "ENDED" as const,
              endedAt: now,
              settledAt: now,
            }
          : {}),
      })
      .where(eq(lot.id, values.lotId));
  }

  return createdBid.id;
}

async function insertReceipt(values: {
  lotId: string;
  winningBidId: string;
  winnerId: string;
  winnerParticipantNo: number;
  finalAmount: string;
  shareToken: string;
  endedAt?: Date;
}) {
  await db.insert(receipt).values({
    lotId: values.lotId,
    winningBidId: values.winningBidId,
    winnerId: values.winnerId,
    winnerParticipantNo: values.winnerParticipantNo,
    finalAmount: values.finalAmount,
    endedAt: values.endedAt ?? now,
    shareToken: values.shareToken,
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
    await db.delete(receipt).where(inArray(receipt.lotId, createdLotIds));
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

describe("listBidderParticipations", () => {
  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe("accepted bids", () => {
    it("returns the lot after this bidder has an accepted bid", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const bidderId = await insertUser("BIDDER");
      const firstCardId = await insertCard("Catalog Dragon");
      const secondCardId = await insertCard("Catalog Magician");
      const created = await insertLot(auctioneerId, {
        title: "Blue-Eyes lot",
        description: "Signed lot",
        openingBid: "10.00",
        minIncrement: "1.50",
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
        items: [
          {
            cardId: firstCardId,
            cardName: "Snapshot Dragon",
            imagePath: "https://images.example/dragon.jpg",
            quantity: 2,
          },
          {
            cardId: secondCardId,
            cardName: "Snapshot Magician",
            imagePath: "https://images.example/magician.jpg",
          },
        ],
      });

      await insertAcceptedBid({
        lotId: created.id,
        userId: bidderId,
        participantNo: 3,
        sequence: 1,
        amount: "12.00",
        current: true,
      });

      const listed = await listFor(bidderId);

      expect(listed).toEqual({
        lots: [
          {
            id: created.id,
            title: "Blue-Eyes lot",
            description: "Signed lot",
            openingBid: "10.00",
            minIncrement: "1.50",
            startsAt: hoursFromNow(-1),
            endsAt: hoursFromNow(2),
            status: "LIVE",
            currentBid: "12.00",
            bidCount: 1,
            participantNo: 3,
            won: false,
            shareToken: null,
            items: [
              {
                id: created.items[0]?.id,
                position: 1,
                cardId: firstCardId,
                quantity: 2,
                cardName: "Snapshot Dragon",
                imagePath: "https://images.example/dragon.jpg",
              },
              {
                id: created.items[1]?.id,
                position: 2,
                cardId: secondCardId,
                quantity: 1,
                cardName: "Snapshot Magician",
                imagePath: "https://images.example/magician.jpg",
              },
            ],
          },
        ],
      });
    });

    it("omits a lot where this bidder has no accepted bid", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const bidderId = await insertUser("BIDDER");
      const participatedCardId = await insertCard("Joined Dragon");
      const untouchedCardId = await insertCard("Untouched Dragon");
      const participated = await insertLot(auctioneerId, {
        title: "Joined lot",
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
        items: [
          {
            cardId: participatedCardId,
            cardName: "Joined Dragon",
            imagePath: "https://images.example/joined.jpg",
          },
        ],
      });
      await insertLot(auctioneerId, {
        title: "Untouched lot",
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(3),
        items: [
          {
            cardId: untouchedCardId,
            cardName: "Untouched Dragon",
            imagePath: "https://images.example/untouched.jpg",
          },
        ],
      });

      await insertAcceptedBid({
        lotId: participated.id,
        userId: bidderId,
        participantNo: 1,
        sequence: 1,
        amount: "11.00",
        current: true,
      });

      const listed = await listFor(bidderId);

      expect(listed.lots.map((entry) => entry.id)).toEqual([participated.id]);
    });

    it("omits another bidder's participation", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const bidderId = await insertUser("BIDDER");
      const otherBidderId = await insertUser("BIDDER");
      const ownCardId = await insertCard("Own Dragon");
      const otherCardId = await insertCard("Other Dragon");
      const ownLot = await insertLot(auctioneerId, {
        title: "Own lot",
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
        items: [
          {
            cardId: ownCardId,
            cardName: "Own Dragon",
            imagePath: "https://images.example/own.jpg",
          },
        ],
      });
      const otherLot = await insertLot(auctioneerId, {
        title: "Other lot",
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(3),
        items: [
          {
            cardId: otherCardId,
            cardName: "Other Dragon",
            imagePath: "https://images.example/other.jpg",
          },
        ],
      });

      await insertAcceptedBid({
        lotId: ownLot.id,
        userId: bidderId,
        participantNo: 1,
        sequence: 1,
        amount: "11.00",
        current: true,
      });
      await insertAcceptedBid({
        lotId: otherLot.id,
        userId: otherBidderId,
        participantNo: 1,
        sequence: 1,
        amount: "11.00",
        current: true,
      });

      const listed = await listFor(bidderId);

      expect(listed.lots.map((entry) => entry.id)).toEqual([ownLot.id]);
      expect(listed.lots.map((entry) => entry.participantNo)).toEqual([1]);
    });

    it("returns an empty list when there is no accepted bid", async () => {
      const bidderId = await insertUser("BIDDER");

      const listed = await listFor(bidderId);

      expect(listed).toEqual({ lots: [] });
    });
  });

  describe("won", () => {
    it("marks won only when winner_id is this user", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const bidderId = await insertUser("BIDDER");
      const cardId = await insertCard("Won Dragon");
      const created = await insertLot(auctioneerId, {
        title: "Won lot",
        startsAt: hoursFromNow(-3),
        endsAt: hoursFromNow(-1),
        status: "ENDED",
        items: [
          {
            cardId,
            cardName: "Won Dragon",
            imagePath: "https://images.example/won.jpg",
          },
        ],
      });

      const winningBidId = await insertAcceptedBid({
        lotId: created.id,
        userId: bidderId,
        participantNo: 1,
        sequence: 1,
        amount: "20.00",
        current: true,
        winner: true,
      });
      const token = createShareToken();

      await insertReceipt({
        lotId: created.id,
        winningBidId,
        winnerId: bidderId,
        winnerParticipantNo: 1,
        finalAmount: "20.00",
        shareToken: token,
      });

      const listed = await listFor(bidderId);

      expect(listed.lots).toEqual([
        expect.objectContaining({
          id: created.id,
          status: "ENDED",
          currentBid: "20.00",
          won: true,
          shareToken: token,
        }),
      ]);
    });

    it("leaves won false when this bidder only leads a lot that is still live", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const bidderId = await insertUser("BIDDER");
      const cardId = await insertCard("Leading Dragon");
      const created = await insertLot(auctioneerId, {
        title: "Leading lot",
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
        items: [
          {
            cardId,
            cardName: "Leading Dragon",
            imagePath: "https://images.example/leading.jpg",
          },
        ],
      });

      await insertAcceptedBid({
        lotId: created.id,
        userId: bidderId,
        participantNo: 1,
        sequence: 1,
        amount: "15.00",
        current: true,
      });

      const listed = await listFor(bidderId);

      expect(listed.lots).toEqual([
        expect.objectContaining({
          id: created.id,
          status: "LIVE",
          currentBid: "15.00",
          won: false,
        }),
      ]);
    });

    it("leaves won false when the end has passed and winner_id is still null", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const bidderId = await insertUser("BIDDER");
      const cardId = await insertCard("Due Dragon");
      const created = await insertLot(auctioneerId, {
        title: "Due lot",
        startsAt: hoursFromNow(-3),
        endsAt: hoursFromNow(-1),
        items: [
          {
            cardId,
            cardName: "Due Dragon",
            imagePath: "https://images.example/due.jpg",
          },
        ],
      });

      await insertAcceptedBid({
        lotId: created.id,
        userId: bidderId,
        participantNo: 1,
        sequence: 1,
        amount: "18.00",
        current: true,
      });

      const listed = await listFor(bidderId);
      const [stored] = await db
        .select({
          status: lot.status,
          winnerId: lot.winnerId,
        })
        .from(lot)
        .where(eq(lot.id, created.id));

      expect(stored).toMatchObject({
        status: "ACTIVE",
        winnerId: null,
      });
      expect(listed.lots).toEqual([
        expect.objectContaining({
          id: created.id,
          status: "ENDED",
          currentBid: "18.00",
          won: false,
        }),
      ]);
    });

    it("includes an ended lot that another bidder won with won false", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const bidderId = await insertUser("BIDDER");
      const winnerId = await insertUser("BIDDER");
      const cardId = await insertCard("Lost Dragon");
      const created = await insertLot(auctioneerId, {
        title: "Lost lot",
        startsAt: hoursFromNow(-4),
        endsAt: hoursFromNow(-1),
        status: "ENDED",
        items: [
          {
            cardId,
            cardName: "Lost Dragon",
            imagePath: "https://images.example/lost.jpg",
          },
        ],
      });

      await insertAcceptedBid({
        lotId: created.id,
        userId: bidderId,
        participantNo: 1,
        sequence: 1,
        amount: "11.00",
      });
      await insertAcceptedBid({
        lotId: created.id,
        userId: winnerId,
        participantNo: 2,
        sequence: 2,
        amount: "15.00",
        current: true,
        winner: true,
      });

      const listed = await listFor(bidderId);

      expect(listed.lots).toEqual([
        expect.objectContaining({
          id: created.id,
          status: "ENDED",
          currentBid: "15.00",
          bidCount: 2,
          participantNo: 1,
          won: false,
        }),
      ]);
    });
  });

  describe("canceled lots", () => {
    it("includes a canceled lot this bidder participated in with status CANCELED and won false", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const bidderId = await insertUser("BIDDER");
      const cardId = await insertCard("Canceled Dragon");
      const created = await insertLot(auctioneerId, {
        title: "Canceled lot",
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
        status: "CANCELED",
        canceledAt: now,
        items: [
          {
            cardId,
            cardName: "Canceled Dragon",
            imagePath: "https://images.example/canceled.jpg",
          },
        ],
      });

      await insertAcceptedBid({
        lotId: created.id,
        userId: bidderId,
        participantNo: 4,
        sequence: 1,
        amount: "13.00",
        current: true,
      });

      const listed = await listFor(bidderId);

      expect(listed.lots).toEqual([
        expect.objectContaining({
          id: created.id,
          status: "CANCELED",
          currentBid: "13.00",
          participantNo: 4,
          won: false,
        }),
      ]);
    });
  });

  describe("shareToken", () => {
    it("includes the settlement share token when this bidder won the lot", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const bidderId = await insertUser("BIDDER");
      const cardId = await insertCard("Settled Dragon");
      const created = await insertLot(auctioneerId, {
        title: "Settled lot",
        startsAt: hoursFromNow(-3),
        endsAt: hoursFromNow(-1),
        status: "ENDED",
        items: [
          {
            cardId,
            cardName: "Settled Dragon",
            imagePath: "https://images.example/settled.jpg",
          },
        ],
      });
      const token = createShareToken();
      const winningBidId = await insertAcceptedBid({
        lotId: created.id,
        userId: bidderId,
        participantNo: 4,
        sequence: 1,
        amount: "22.00",
        current: true,
        winner: true,
      });

      await insertReceipt({
        lotId: created.id,
        winningBidId,
        winnerId: bidderId,
        winnerParticipantNo: 4,
        finalAmount: "22.00",
        shareToken: token,
      });

      const listed = await listFor(bidderId);
      const serialized = JSON.stringify(listed);

      expect(listed.lots).toEqual([
        expect.objectContaining({
          id: created.id,
          status: "ENDED",
          won: true,
          shareToken: token,
        }),
      ]);
      expect(serialized).not.toContain(bidderId);
      expect(serialized).not.toContain(auctioneerId);
      expect(serialized).not.toContain(winningBidId);
    });

    it("returns a null share token for a live, lost, or canceled participation and for another bidder", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const bidderId = await insertUser("BIDDER");
      const winnerId = await insertUser("BIDDER");
      const live = await insertLot(auctioneerId, {
        title: "Live lot",
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
        items: [
          {
            cardId: await insertCard("Live Dragon"),
            cardName: "Live Dragon",
            imagePath: "https://images.example/live.jpg",
          },
        ],
      });
      const lost = await insertLot(auctioneerId, {
        title: "Lost lot",
        startsAt: hoursFromNow(-4),
        endsAt: hoursFromNow(-1),
        status: "ENDED",
        items: [
          {
            cardId: await insertCard("Lost Dragon"),
            cardName: "Lost Dragon",
            imagePath: "https://images.example/lost.jpg",
          },
        ],
      });
      const canceled = await insertLot(auctioneerId, {
        title: "Canceled lot",
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
        status: "CANCELED",
        canceledAt: now,
        items: [
          {
            cardId: await insertCard("Canceled Dragon"),
            cardName: "Canceled Dragon",
            imagePath: "https://images.example/canceled.jpg",
          },
        ],
      });
      const winnerToken = createShareToken();

      await insertAcceptedBid({
        lotId: live.id,
        userId: bidderId,
        participantNo: 1,
        sequence: 1,
        amount: "11.00",
        current: true,
      });
      await insertAcceptedBid({
        lotId: lost.id,
        userId: bidderId,
        participantNo: 1,
        sequence: 1,
        amount: "11.00",
      });
      const winningBidId = await insertAcceptedBid({
        lotId: lost.id,
        userId: winnerId,
        participantNo: 2,
        sequence: 2,
        amount: "19.00",
        current: true,
        winner: true,
      });

      await insertReceipt({
        lotId: lost.id,
        winningBidId,
        winnerId,
        winnerParticipantNo: 2,
        finalAmount: "19.00",
        shareToken: winnerToken,
      });
      await insertAcceptedBid({
        lotId: canceled.id,
        userId: bidderId,
        participantNo: 3,
        sequence: 1,
        amount: "13.00",
        current: true,
      });

      const listed = await listFor(bidderId);

      expect(listed.lots.map((entry) => entry.id)).toEqual([
        live.id,
        lost.id,
        canceled.id,
      ]);
      expect(listed.lots.map((entry) => entry.status)).toEqual([
        "LIVE",
        "ENDED",
        "CANCELED",
      ]);
      expect(listed.lots.map((entry) => entry.won)).toEqual([
        false,
        false,
        false,
      ]);
      expect(listed.lots.map((entry) => entry.shareToken)).toEqual([
        null,
        null,
        null,
      ]);
      expect(JSON.stringify(listed)).not.toContain(winnerToken);
      expect(JSON.stringify(listed)).not.toContain(winnerId);
    });

    it("fails the listing when this bidder won and the receipt is missing", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const bidderId = await insertUser("BIDDER");
      const cardId = await insertCard("Unsettled Dragon");
      const created = await insertLot(auctioneerId, {
        title: "Unsettled lot",
        startsAt: hoursFromNow(-3),
        endsAt: hoursFromNow(-1),
        status: "ENDED",
        items: [
          {
            cardId,
            cardName: "Unsettled Dragon",
            imagePath: "https://images.example/unsettled.jpg",
          },
        ],
      });

      await insertAcceptedBid({
        lotId: created.id,
        userId: bidderId,
        participantNo: 1,
        sequence: 1,
        amount: "21.00",
        current: true,
        winner: true,
      });

      const listed = listFor(bidderId);

      await expect(listed).rejects.toThrow(
        "Won participation is missing its receipt",
      );
      await expect(listed).rejects.not.toBeInstanceOf(
        ListBidderParticipationsError,
      );
    });
  });

  describe("ordering", () => {
    it("orders live, scheduled, ended, and canceled lots like the auctioneer list", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const bidderId = await insertUser("BIDDER");
      const liveSoon = await insertLot(auctioneerId, {
        title: "Live soon",
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(1),
        items: [
          {
            cardId: await insertCard("Live Soon"),
            cardName: "Live Soon",
            imagePath: "https://images.example/live-soon.jpg",
          },
        ],
      });
      const liveLater = await insertLot(auctioneerId, {
        title: "Live later",
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(3),
        items: [
          {
            cardId: await insertCard("Live Later"),
            cardName: "Live Later",
            imagePath: "https://images.example/live-later.jpg",
          },
        ],
      });
      const scheduledSoon = await insertLot(auctioneerId, {
        title: "Scheduled soon",
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(4),
        items: [
          {
            cardId: await insertCard("Scheduled Soon"),
            cardName: "Scheduled Soon",
            imagePath: "https://images.example/scheduled-soon.jpg",
          },
        ],
      });
      const scheduledLater = await insertLot(auctioneerId, {
        title: "Scheduled later",
        startsAt: hoursFromNow(2),
        endsAt: hoursFromNow(5),
        items: [
          {
            cardId: await insertCard("Scheduled Later"),
            cardName: "Scheduled Later",
            imagePath: "https://images.example/scheduled-later.jpg",
          },
        ],
      });
      const endedRecent = await insertLot(auctioneerId, {
        title: "Ended recent",
        startsAt: hoursFromNow(-10),
        endsAt: hoursFromNow(-1),
        status: "ENDED",
        items: [
          {
            cardId: await insertCard("Ended Recent"),
            cardName: "Ended Recent",
            imagePath: "https://images.example/ended-recent.jpg",
          },
        ],
      });
      const endedOlder = await insertLot(auctioneerId, {
        title: "Ended older",
        startsAt: hoursFromNow(-20),
        endsAt: hoursFromNow(-5),
        status: "ENDED",
        items: [
          {
            cardId: await insertCard("Ended Older"),
            cardName: "Ended Older",
            imagePath: "https://images.example/ended-older.jpg",
          },
        ],
      });
      const canceledRecent = await insertLot(auctioneerId, {
        title: "Canceled recent",
        startsAt: hoursFromNow(-2),
        endsAt: hoursFromNow(2),
        status: "CANCELED",
        canceledAt: now,
        items: [
          {
            cardId: await insertCard("Canceled Recent"),
            cardName: "Canceled Recent",
            imagePath: "https://images.example/canceled-recent.jpg",
          },
        ],
      });
      const canceledOlder = await insertLot(auctioneerId, {
        title: "Canceled older",
        startsAt: hoursFromNow(-4),
        endsAt: hoursFromNow(2),
        status: "CANCELED",
        canceledAt: hoursFromNow(-2),
        items: [
          {
            cardId: await insertCard("Canceled Older"),
            cardName: "Canceled Older",
            imagePath: "https://images.example/canceled-older.jpg",
          },
        ],
      });

      // Participation rows are inserted against the expected order. The
      // listing starts from lot_participant, so a missing ORDER BY would
      // follow this sequence instead of live, scheduled, ended, canceled.
      for (const created of [
        canceledOlder,
        canceledRecent,
        endedOlder,
        endedRecent,
        scheduledLater,
        scheduledSoon,
        liveLater,
        liveSoon,
      ]) {
        await insertAcceptedBid({
          lotId: created.id,
          userId: bidderId,
          participantNo: 1,
          sequence: 1,
          amount: "11.00",
          current: true,
        });
      }

      const listed = await listFor(bidderId);

      expect(listed.lots.map((entry) => entry.id)).toEqual([
        liveSoon.id,
        liveLater.id,
        scheduledSoon.id,
        scheduledLater.id,
        endedRecent.id,
        endedOlder.id,
        canceledRecent.id,
        canceledOlder.id,
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

  describe("authorization", () => {
    it("rejects a role other than BIDDER with NOT_BIDDER", async () => {
      const rejection = listBidderParticipations(
        {
          userId: crypto.randomUUID(),
          role: "AUCTIONEER",
        },
        dependencies(),
      );

      await expect(rejection).rejects.toBeInstanceOf(
        ListBidderParticipationsError,
      );
      await expect(rejection).rejects.toMatchObject({
        code: "NOT_BIDDER",
        message: "Only a bidder can list their participations.",
      });
    });
  });
});
