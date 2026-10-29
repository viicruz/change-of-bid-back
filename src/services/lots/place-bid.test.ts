//* Libraries imports
import { asc, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";

//* Schemas imports
import { addMoney, compareMoney } from "../../schemas/money";

//* Local imports
import { db } from "../../db/index";
import {
  bid,
  lot,
  lotParticipant,
  user,
  wallet,
  walletMovement,
} from "../../db/schema";
import { env } from "../../env";
import { insertBid } from "../../models/bid";
import { markLotLeadingBid } from "../../models/lot";
import { canonicalBidTimestamp, chainBidHash, genesisBidHash } from "./bid-hash";
import { cancelLot } from "./cancel-lot";
import { placeBid, PlaceBidError } from "./place-bid";
import { joinPublicLotRoom } from "./public-lot-live";

const now = new Date("2026-10-26T15:00:00.000Z");
const createdUserIds: string[] = [];
const createdLotIds: string[] = [];

type StoredBid = {
  id: string;
  sequence: number;
  amount: string;
  createdAt: Date;
  previousHash: string;
  hash: string;
  bidderId: string;
  participantId: string;
  participantNo: number;
};

function hoursFromNow(hours: number) {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

function placeFor(
  userId: string,
  lotId: string,
  amount: unknown,
  role: "AUCTIONEER" | "BIDDER" = "BIDDER",
  at: Date = now,
) {
  return placeBid(
    {
      lotId,
      userId,
      role,
      amount,
    },
    { now: () => at },
  );
}

function minutesFromNow(minutes: number, at: Date = now) {
  return new Date(at.getTime() + minutes * 60 * 1000);
}

async function settle<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ status: "fulfilled" as const, value }),
    (error: unknown) => ({ status: "rejected" as const, error }),
  );
}

async function insertUser(role: "AUCTIONEER" | "BIDDER") {
  const id = crypto.randomUUID();

  await db.insert(user).values({
    id,
    name: "Bid Tester",
    email: `bid-${id}@example.com`,
    role,
  });
  createdUserIds.push(id);

  return id;
}

async function insertWallet(
  userId: string,
  totalBalance: string,
  committedBalance = "0.00",
) {
  const rows = await db
    .insert(wallet)
    .values({
      userId,
      totalBalance,
      committedBalance,
    })
    .returning({ id: wallet.id });
  const row = rows[0];

  if (!row) {
    throw new Error("Insert wallet did not return a row");
  }

  return row.id;
}

async function insertLot(
  auctioneerId: string,
  values: {
    startsAt: Date;
    endsAt: Date;
    status?: "ACTIVE" | "ENDED" | "CANCELED";
    openingBid?: string;
    minIncrement?: string;
    extensionCount?: number;
  },
) {
  const status = values.status ?? "ACTIVE";
  const rows = await db
    .insert(lot)
    .values({
      auctioneerId,
      title: "Biddable lot",
      description: null,
      openingBid: values.openingBid ?? "10.00",
      minIncrement: values.minIncrement ?? "0.50",
      startsAt: values.startsAt,
      originalEndsAt: values.endsAt,
      endsAt: values.endsAt,
      extensionCount: values.extensionCount ?? 0,
      status,
      endedAt: status === "ENDED" ? now : null,
      canceledAt: status === "CANCELED" ? now : null,
    })
    .returning({ id: lot.id });
  const row = rows[0];

  if (!row) {
    throw new Error("Insert lot did not return a row");
  }

  createdLotIds.push(row.id);

  return row.id;
}

async function liveLot(
  values: {
    openingBid?: string;
    minIncrement?: string;
    endsAt?: Date;
    extensionCount?: number;
  } = {},
) {
  const auctioneerId = await insertUser("AUCTIONEER");
  const endsAt = values.endsAt ?? hoursFromNow(2);
  const lotId = await insertLot(auctioneerId, {
    startsAt: hoursFromNow(-1),
    endsAt,
    openingBid: values.openingBid,
    minIncrement: values.minIncrement,
    extensionCount: values.extensionCount,
  });

  return { auctioneerId, lotId, endsAt };
}

async function readLot(lotId: string) {
  const rows = await db
    .select({
      status: lot.status,
      startsAt: lot.startsAt,
      endsAt: lot.endsAt,
      originalEndsAt: lot.originalEndsAt,
      extensionCount: lot.extensionCount,
      currentBidId: lot.currentBidId,
      bidCount: lot.bidCount,
      headHash: lot.headHash,
      canceledAt: lot.canceledAt,
    })
    .from(lot)
    .where(eq(lot.id, lotId));

  return rows[0];
}

async function readBids(lotId: string): Promise<StoredBid[]> {
  return db
    .select({
      id: bid.id,
      sequence: bid.sequence,
      amount: bid.amount,
      createdAt: bid.createdAt,
      previousHash: bid.previousHash,
      hash: bid.hash,
      bidderId: bid.bidderId,
      participantId: lotParticipant.id,
      participantNo: lotParticipant.participantNo,
    })
    .from(bid)
    .innerJoin(lotParticipant, eq(bid.participantId, lotParticipant.id))
    .where(eq(bid.lotId, lotId))
    .orderBy(asc(bid.sequence));
}

async function readMovements(lotId: string) {
  return db
    .select({
      type: walletMovement.type,
      amount: walletMovement.amount,
      bidId: walletMovement.bidId,
    })
    .from(walletMovement)
    .where(eq(walletMovement.lotId, lotId))
    .orderBy(
      asc(walletMovement.createdAt),
      asc(walletMovement.type),
      asc(walletMovement.id),
    );
}

async function readWallet(walletId: string) {
  const rows = await db
    .select({
      totalBalance: wallet.totalBalance,
      committedBalance: wallet.committedBalance,
    })
    .from(wallet)
    .where(eq(wallet.id, walletId));

  return rows[0];
}

function expectHashChain(lotId: string, rows: StoredBid[]) {
  let previousHash = genesisBidHash(env.BID_HASH_SECRET, lotId);

  for (const row of rows) {
    const createdAt = canonicalBidTimestamp(row.createdAt);

    expect(row.previousHash).toBe(previousHash);
    expect(row.hash).toBe(
      chainBidHash(env.BID_HASH_SECRET, {
        previousHash,
        lotId,
        sequence: row.sequence,
        participantNo: row.participantNo,
        amount: row.amount,
        createdAt,
      }),
    );
    previousHash = row.hash;
  }

  return previousHash;
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
    await db.delete(lot).where(inArray(lot.id, createdLotIds));
  }

  if (walletIds.length > 0) {
    await db.delete(wallet).where(inArray(wallet.id, walletIds));
  }

  if (createdUserIds.length > 0) {
    await db.delete(user).where(inArray(user.id, createdUserIds));
  }

  createdLotIds.length = 0;
  createdUserIds.length = 0;
}

describe("placeBid", () => {
  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe("when the caller is not a bidder", () => {
    it("rejects an auctioneer and does not store a bid", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(auctioneerId, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
      });
      const before = await readLot(lotId);

      await expect(
        placeFor(auctioneerId, lotId, "10.00", "AUCTIONEER"),
      ).rejects.toMatchObject({
        code: "NOT_BIDDER",
      });

      expect(await readLot(lotId)).toEqual(before);
      expect(await readBids(lotId)).toEqual([]);
      expect(await readMovements(lotId)).toEqual([]);
    });
  });

  describe("when the amount is not valid money", () => {
    it("rejects the bid and does not change the lot", async () => {
      const bidderId = await insertUser("BIDDER");
      const walletId = await insertWallet(bidderId, "100.00");
      const { lotId } = await liveLot();
      const before = await readLot(lotId);
      const invalidAmounts = ["0", "0.00", "-1", "10.001", "abc", "  ", 10, null];

      for (const amount of invalidAmounts) {
        await expect(placeFor(bidderId, lotId, amount)).rejects.toBeInstanceOf(
          PlaceBidError,
        );
        await expect(placeFor(bidderId, lotId, amount)).rejects.toMatchObject({
          code: "INVALID_MONEY",
        });
      }

      expect(await readLot(lotId)).toEqual(before);
      expect(await readBids(lotId)).toEqual([]);
      expect(await readMovements(lotId)).toEqual([]);
      expect(await readWallet(walletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: "0.00",
      });
    });
  });

  describe("when the lot does not exist", () => {
    it("rejects the bid", async () => {
      const bidderId = await insertUser("BIDDER");
      await insertWallet(bidderId, "100.00");

      await expect(
        placeFor(bidderId, crypto.randomUUID(), "10.00"),
      ).rejects.toMatchObject({
        code: "LOT_NOT_FOUND",
      });
    });
  });

  describe("when the lot is outside the live window", () => {
    it("rejects a bid one millisecond before the start", async () => {
      const bidderId = await insertUser("BIDDER");
      const walletId = await insertWallet(bidderId, "100.00");
      const auctioneerId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(auctioneerId, {
        startsAt: new Date(now.getTime() + 1),
        endsAt: hoursFromNow(2),
      });

      await expect(placeFor(bidderId, lotId, "10.00")).rejects.toMatchObject({
        code: "LOT_NOT_STARTED",
      });

      expect(await readBids(lotId)).toEqual([]);
      expect(await readWallet(walletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: "0.00",
      });
    });

    it("accepts a bid at the start instant", async () => {
      const bidderId = await insertUser("BIDDER");
      await insertWallet(bidderId, "100.00");
      const auctioneerId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(auctioneerId, {
        startsAt: now,
        endsAt: hoursFromNow(24),
      });

      const accepted = await placeFor(bidderId, lotId, "10.00");

      expect(accepted.sequence).toBe(1);
      expect(await readBids(lotId)).toHaveLength(1);
    });

    it("rejects a bid at the end instant", async () => {
      const bidderId = await insertUser("BIDDER");
      const walletId = await insertWallet(bidderId, "100.00");
      const auctioneerId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(auctioneerId, {
        startsAt: hoursFromNow(-1),
        endsAt: now,
      });
      const before = await readLot(lotId);

      await expect(placeFor(bidderId, lotId, "10.00")).rejects.toMatchObject({
        code: "LOT_ENDED",
      });

      expect(await readLot(lotId)).toEqual(before);
      expect(await readBids(lotId)).toEqual([]);
      expect(await readWallet(walletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: "0.00",
      });
    });

    it("rejects a bid after the end", async () => {
      const bidderId = await insertUser("BIDDER");
      const walletId = await insertWallet(bidderId, "100.00");
      const auctioneerId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(auctioneerId, {
        startsAt: hoursFromNow(-2),
        endsAt: new Date(now.getTime() - 1),
      });

      await expect(placeFor(bidderId, lotId, "10.00")).rejects.toMatchObject({
        code: "LOT_ENDED",
      });

      expect(await readBids(lotId)).toEqual([]);
      expect(await readWallet(walletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: "0.00",
      });
    });

    it("accepts a bid one millisecond before the end", async () => {
      const bidderId = await insertUser("BIDDER");
      await insertWallet(bidderId, "100.00");
      const auctioneerId = await insertUser("AUCTIONEER");
      const endsAt = new Date(now.getTime() + 1);
      const lotId = await insertLot(auctioneerId, {
        startsAt: hoursFromNow(-1),
        endsAt,
      });

      await placeFor(bidderId, lotId, "10.00");
      const stored = await readLot(lotId);

      expect(stored).toMatchObject({
        status: "ACTIVE",
        bidCount: 1,
        endsAt: minutesFromNow(2, endsAt),
        extensionCount: 1,
      });
    });

    it("rejects a lot already marked ended", async () => {
      const bidderId = await insertUser("BIDDER");
      const walletId = await insertWallet(bidderId, "100.00");
      const auctioneerId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(auctioneerId, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
        status: "ENDED",
      });

      await expect(placeFor(bidderId, lotId, "10.00")).rejects.toMatchObject({
        code: "LOT_ENDED",
      });

      expect(await readBids(lotId)).toEqual([]);
      expect(await readWallet(walletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: "0.00",
      });
    });

    it("rejects a canceled lot", async () => {
      const bidderId = await insertUser("BIDDER");
      const walletId = await insertWallet(bidderId, "100.00");
      const auctioneerId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(auctioneerId, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
        status: "CANCELED",
      });

      await expect(placeFor(bidderId, lotId, "10.00")).rejects.toMatchObject({
        code: "LOT_CANCELED",
      });

      expect(await readLot(lotId)).toMatchObject({
        status: "CANCELED",
        bidCount: 0,
        currentBidId: null,
      });
      expect(await readBids(lotId)).toEqual([]);
      expect(await readWallet(walletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: "0.00",
      });
    });
  });

  describe("when the lot is live and has no bids", () => {
    it("accepts a bid that uses the entire available balance", async () => {
      const bidderId = await insertUser("BIDDER");
      const walletId = await insertWallet(bidderId, "10.00");
      const { lotId } = await liveLot();

      const accepted = await placeFor(bidderId, lotId, "10.00");

      expect(accepted.amount).toBe("10.00");
      expect(await readWallet(walletId)).toEqual({
        totalBalance: "10.00",
        committedBalance: "10.00",
      });
    });

    it("accepts a bid equal to the opening bid", async () => {
      const bidderId = await insertUser("BIDDER");
      const walletId = await insertWallet(bidderId, "100.00");
      const { lotId, endsAt } = await liveLot({ extensionCount: 3 });

      const accepted = await placeFor(bidderId, lotId, "10");
      const stored = await readLot(lotId);
      const bids = await readBids(lotId);
      const movements = await readMovements(lotId);

      expect(Object.keys(accepted).sort()).toEqual([
        "amount",
        "createdAt",
        "endsAt",
        "extensionCount",
        "id",
        "participantNo",
        "sequence",
      ]);
      expect(accepted).toMatchObject({
        sequence: 1,
        amount: "10.00",
        participantNo: 1,
        endsAt,
        extensionCount: 3,
      });
      expect(accepted.createdAt.toISOString()).toBe(now.toISOString());
      expect(bids).toHaveLength(1);
      expect(bids[0]).toMatchObject({
        id: accepted.id,
        bidderId,
        amount: "10.00",
        sequence: 1,
        participantNo: 1,
      });
      expect(stored).toMatchObject({
        status: "ACTIVE",
        currentBidId: accepted.id,
        bidCount: 1,
        headHash: bids[0]?.hash,
        endsAt,
        extensionCount: 3,
      });
      expect(movements).toEqual([
        { type: "HOLD", amount: "10.00", bidId: accepted.id },
      ]);
      expect(await readWallet(walletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: "10.00",
      });
    });

    it("rejects a bid below the opening bid and leaves the lot unchanged", async () => {
      const bidderId = await insertUser("BIDDER");
      const walletId = await insertWallet(bidderId, "100.00");
      const { lotId } = await liveLot();
      const before = await readLot(lotId);

      await expect(placeFor(bidderId, lotId, "9.99")).rejects.toMatchObject({
        code: "BID_BELOW_MINIMUM",
      });

      expect(await readLot(lotId)).toEqual(before);
      expect(await readBids(lotId)).toEqual([]);
      expect(await readMovements(lotId)).toEqual([]);
      expect(await readWallet(walletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: "0.00",
      });
    });

    it("accepts a bid above the opening amount and reserves that full amount", async () => {
      const bidderId = await insertUser("BIDDER");
      const walletId = await insertWallet(bidderId, "100.00");
      const { lotId } = await liveLot();

      const accepted = await placeFor(bidderId, lotId, "25.00");

      expect(accepted.amount).toBe("25.00");
      expect(await readWallet(walletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: "25.00",
      });
    });
  });

  describe("when an accepted bid lands in the final two minutes", () => {
    it("extends the current end by two minutes", async () => {
      const bidderId = await insertUser("BIDDER");
      await insertWallet(bidderId, "100.00");
      const endsAt = new Date(now.getTime() + 30_000);
      const { lotId } = await liveLot({
        endsAt,
        extensionCount: 4,
      });

      const accepted = await placeFor(bidderId, lotId, "10.00");
      const stored = await readLot(lotId);
      const extendedEnd = minutesFromNow(2, endsAt);

      expect(accepted).toMatchObject({
        endsAt: extendedEnd,
        extensionCount: 5,
      });
      expect(stored).toMatchObject({
        bidCount: 1,
        endsAt: extendedEnd,
        originalEndsAt: endsAt,
        extensionCount: 5,
      });
    });

    it("extends a bid that lands exactly two minutes before the end", async () => {
      const bidderId = await insertUser("BIDDER");
      await insertWallet(bidderId, "100.00");
      const endsAt = minutesFromNow(2);
      const { lotId } = await liveLot({ endsAt });

      await placeFor(bidderId, lotId, "10.00");
      const stored = await readLot(lotId);

      expect(stored).toMatchObject({
        endsAt: minutesFromNow(2, endsAt),
        originalEndsAt: endsAt,
        extensionCount: 1,
      });
    });

    it("leaves the end unchanged when more than two minutes remain", async () => {
      const bidderId = await insertUser("BIDDER");
      await insertWallet(bidderId, "100.00");
      const endsAt = new Date(minutesFromNow(2).getTime() + 1);
      const { lotId } = await liveLot({ endsAt, extensionCount: 2 });

      await placeFor(bidderId, lotId, "10.00");
      const stored = await readLot(lotId);

      expect(stored).toMatchObject({
        endsAt,
        originalEndsAt: endsAt,
        extensionCount: 2,
      });
    });

    it("leaves the end unchanged when the bid is refused", async () => {
      const bidderId = await insertUser("BIDDER");
      const walletId = await insertWallet(bidderId, "100.00");
      const endsAt = new Date(now.getTime() + 30_000);
      const { lotId } = await liveLot({ endsAt, extensionCount: 4 });

      await expect(placeFor(bidderId, lotId, "9.99")).rejects.toMatchObject({
        code: "BID_BELOW_MINIMUM",
      });
      const stored = await readLot(lotId);

      expect(stored).toMatchObject({
        bidCount: 0,
        currentBidId: null,
        endsAt,
        extensionCount: 4,
      });
      expect(await readBids(lotId)).toEqual([]);
      expect(await readWallet(walletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: "0.00",
      });
    });

    it("extends again when a later bid also lands in the final two minutes", async () => {
      const leaderId = await insertUser("BIDDER");
      const challengerId = await insertUser("BIDDER");
      await insertWallet(leaderId, "100.00");
      await insertWallet(challengerId, "100.00");
      const endsAt = new Date(now.getTime() + 30_000);
      const { lotId } = await liveLot({ endsAt });
      const secondAt = new Date(now.getTime() + 60_000);

      await placeFor(leaderId, lotId, "10.00");
      const accepted = await placeFor(
        challengerId,
        lotId,
        "10.50",
        "BIDDER",
        secondAt,
      );
      const stored = await readLot(lotId);
      const extendedEnd = minutesFromNow(4, endsAt);

      expect(accepted).toMatchObject({
        endsAt: extendedEnd,
        extensionCount: 2,
      });
      expect(stored).toMatchObject({
        bidCount: 2,
        endsAt: extendedEnd,
        originalEndsAt: endsAt,
        extensionCount: 2,
      });
    });

    it("does not extend a following bid that sits outside the new final two minutes", async () => {
      const leaderId = await insertUser("BIDDER");
      const challengerId = await insertUser("BIDDER");
      await insertWallet(leaderId, "100.00");
      await insertWallet(challengerId, "100.00");
      const endsAt = new Date(now.getTime() + 30_000);
      const { lotId } = await liveLot({ endsAt });

      await placeFor(leaderId, lotId, "10.00");
      await placeFor(challengerId, lotId, "10.50");
      const stored = await readLot(lotId);

      expect(stored).toMatchObject({
        bidCount: 2,
        endsAt: minutesFromNow(2, endsAt),
        originalEndsAt: endsAt,
        extensionCount: 1,
      });
    });
  });

  describe("when the lot already has a leader", () => {
    it("rejects the current leader and keeps the lot unchanged", async () => {
      const leaderId = await insertUser("BIDDER");
      const leaderWalletId = await insertWallet(leaderId, "100.00");
      const { lotId } = await liveLot();

      await placeFor(leaderId, lotId, "10.00");
      const beforeLot = await readLot(lotId);
      const beforeBids = await readBids(lotId);
      const beforeMovements = await readMovements(lotId);

      await expect(placeFor(leaderId, lotId, "20.00")).rejects.toMatchObject({
        code: "ALREADY_LEADER",
      });

      expect(await readLot(lotId)).toEqual(beforeLot);
      expect(await readBids(lotId)).toEqual(beforeBids);
      expect(await readMovements(lotId)).toEqual(beforeMovements);
      expect(await readWallet(leaderWalletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: "10.00",
      });
    });

    it("rejects a bid below the current amount plus the minimum increment", async () => {
      const leaderId = await insertUser("BIDDER");
      const challengerId = await insertUser("BIDDER");
      const leaderWalletId = await insertWallet(leaderId, "100.00");
      const challengerWalletId = await insertWallet(challengerId, "100.00");
      const { lotId } = await liveLot();

      await placeFor(leaderId, lotId, "10.00");
      const beforeLot = await readLot(lotId);
      const beforeBids = await readBids(lotId);
      const beforeMovements = await readMovements(lotId);

      await expect(placeFor(challengerId, lotId, "10.49")).rejects.toMatchObject({
        code: "BID_BELOW_MINIMUM",
      });

      expect(await readLot(lotId)).toEqual(beforeLot);
      expect(await readBids(lotId)).toEqual(beforeBids);
      expect(await readMovements(lotId)).toEqual(beforeMovements);
      expect(await readWallet(leaderWalletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: "10.00",
      });
      expect(await readWallet(challengerWalletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: "0.00",
      });
    });

    it("accepts the next bid at the minimum and releases only the previous reserve", async () => {
      const leaderId = await insertUser("BIDDER");
      const challengerId = await insertUser("BIDDER");
      const leaderWalletId = await insertWallet(leaderId, "100.00");
      const challengerWalletId = await insertWallet(challengerId, "100.00");
      const { lotId, endsAt } = await liveLot({ extensionCount: 2 });

      const first = await placeFor(leaderId, lotId, "10.00");
      const second = await placeFor(challengerId, lotId, "10.50");
      const stored = await readLot(lotId);
      const bids = await readBids(lotId);
      const movements = await readMovements(lotId);

      expect(second).toMatchObject({
        sequence: 2,
        amount: "10.50",
        participantNo: 2,
      });
      expect(bids.map((entry) => entry.id)).toEqual([first.id, second.id]);
      expect(stored).toMatchObject({
        currentBidId: second.id,
        bidCount: 2,
        headHash: bids[1]?.hash,
        endsAt,
        extensionCount: 2,
      });
      expect(movements).toEqual([
        { type: "HOLD", amount: "10.00", bidId: first.id },
        { type: "HOLD", amount: "10.50", bidId: second.id },
        { type: "RELEASE", amount: "10.00", bidId: first.id },
      ]);
      expect(await readWallet(leaderWalletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: "0.00",
      });
      expect(await readWallet(challengerWalletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: "10.50",
      });
    });

    it("reuses the participant number when the same bidder returns", async () => {
      const firstBidderId = await insertUser("BIDDER");
      const secondBidderId = await insertUser("BIDDER");
      const firstWalletId = await insertWallet(firstBidderId, "100.00");
      const secondWalletId = await insertWallet(secondBidderId, "100.00");
      const { lotId } = await liveLot();

      const first = await placeFor(firstBidderId, lotId, "10.00");
      const second = await placeFor(secondBidderId, lotId, "10.50");
      const third = await placeFor(firstBidderId, lotId, "11.00");
      const bids = await readBids(lotId);
      const participants = await db
        .select({
          userId: lotParticipant.userId,
          participantNo: lotParticipant.participantNo,
        })
        .from(lotParticipant)
        .where(eq(lotParticipant.lotId, lotId))
        .orderBy(asc(lotParticipant.participantNo));

      expect(third.participantNo).toBe(first.participantNo);
      expect(third.sequence).toBe(3);
      expect(bids.map((entry) => entry.participantNo)).toEqual([1, 2, 1]);
      expect(bids.map((entry) => entry.participantId)).toEqual([
        bids[0]?.participantId,
        bids[1]?.participantId,
        bids[0]?.participantId,
      ]);
      expect(participants).toEqual([
        { userId: firstBidderId, participantNo: 1 },
        { userId: secondBidderId, participantNo: 2 },
      ]);
      expect(second.participantNo).toBe(2);
      expect(await readWallet(firstWalletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: "11.00",
      });
      expect(await readWallet(secondWalletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: "0.00",
      });
    });
  });

  describe("when the available balance does not cover the bid", () => {
    it("rejects the bid without changing the balance or the accepted history", async () => {
      const leaderId = await insertUser("BIDDER");
      const challengerId = await insertUser("BIDDER");
      const leaderWalletId = await insertWallet(leaderId, "100.00");
      const challengerWalletId = await insertWallet(challengerId, "10.00");
      const { lotId } = await liveLot();

      await placeFor(leaderId, lotId, "10.00");
      const beforeLot = await readLot(lotId);
      const beforeBids = await readBids(lotId);
      const beforeMovements = await readMovements(lotId);

      await expect(placeFor(challengerId, lotId, "10.50")).rejects.toMatchObject({
        code: "INSUFFICIENT_BALANCE",
      });

      expect(await readLot(lotId)).toEqual(beforeLot);
      expect(await readBids(lotId)).toEqual(beforeBids);
      expect(await readMovements(lotId)).toEqual(beforeMovements);
      expect(await readWallet(leaderWalletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: "10.00",
      });
      expect(await readWallet(challengerWalletId)).toEqual({
        totalBalance: "10.00",
        committedBalance: "0.00",
      });
    });
  });

  describe("when the bidder leads another lot", () => {
    it("keeps the reserve of the other lot", async () => {
      const bidderId = await insertUser("BIDDER");
      const walletId = await insertWallet(bidderId, "100.00");
      const { lotId: leadingLotId } = await liveLot();
      const { lotId: nextLotId } = await liveLot();

      const leadingBid = await placeFor(bidderId, leadingLotId, "20.00");
      const nextBid = await placeFor(bidderId, nextLotId, "15.00");
      const leadingLot = await readLot(leadingLotId);
      const leadingMovements = await readMovements(leadingLotId);
      const nextMovements = await readMovements(nextLotId);

      expect(nextBid.amount).toBe("15.00");
      expect(leadingLot).toMatchObject({
        status: "ACTIVE",
        currentBidId: leadingBid.id,
        bidCount: 1,
      });
      expect(leadingMovements).toEqual([
        { type: "HOLD", amount: "20.00", bidId: leadingBid.id },
      ]);
      expect(nextMovements).toEqual([
        { type: "HOLD", amount: "15.00", bidId: nextBid.id },
      ]);
      expect(await readWallet(walletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: "35.00",
      });
    });

    it("rejects a bid that fits the total but not the remaining available balance", async () => {
      const bidderId = await insertUser("BIDDER");
      const walletId = await insertWallet(bidderId, "30.00");
      const { lotId: leadingLotId } = await liveLot();
      const { lotId: nextLotId } = await liveLot();

      await placeFor(bidderId, leadingLotId, "20.00");
      const before = await readLot(nextLotId);

      await expect(placeFor(bidderId, nextLotId, "15.00")).rejects.toMatchObject({
        code: "INSUFFICIENT_BALANCE",
      });

      expect(await readLot(nextLotId)).toEqual(before);
      expect(await readBids(nextLotId)).toEqual([]);
      expect(await readMovements(nextLotId)).toEqual([]);
      expect(await readWallet(walletId)).toEqual({
        totalBalance: "30.00",
        committedBalance: "20.00",
      });
    });

    it("keeps the other lot reserved when this lot changes leader", async () => {
      const leaderId = await insertUser("BIDDER");
      const challengerId = await insertUser("BIDDER");
      const leaderWalletId = await insertWallet(leaderId, "100.00");
      const challengerWalletId = await insertWallet(challengerId, "100.00");
      const { lotId: leadingLotId } = await liveLot();
      const { lotId: otherLotId } = await liveLot();

      const otherBid = await placeFor(leaderId, otherLotId, "15.00");
      const leadingBid = await placeFor(leaderId, leadingLotId, "20.00");
      const challenge = await placeFor(challengerId, leadingLotId, "20.50");

      expect(await readLot(otherLotId)).toMatchObject({
        currentBidId: otherBid.id,
        bidCount: 1,
      });
      expect(await readMovements(otherLotId)).toEqual([
        { type: "HOLD", amount: "15.00", bidId: otherBid.id },
      ]);
      expect(await readMovements(leadingLotId)).toEqual([
        { type: "HOLD", amount: "20.00", bidId: leadingBid.id },
        { type: "HOLD", amount: "20.50", bidId: challenge.id },
        { type: "RELEASE", amount: "20.00", bidId: leadingBid.id },
      ]);
      expect(await readWallet(leaderWalletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: "15.00",
      });
      expect(await readWallet(challengerWalletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: "20.50",
      });
    });
  });

  describe("when the bid is accepted", () => {
    it("stores a hash that matches the canonical chain and the lot head", async () => {
      const firstBidderId = await insertUser("BIDDER");
      const secondBidderId = await insertUser("BIDDER");
      await insertWallet(firstBidderId, "100.00");
      await insertWallet(secondBidderId, "100.00");
      const { lotId } = await liveLot();

      const first = await placeFor(firstBidderId, lotId, "10.00");
      const second = await placeFor(secondBidderId, lotId, "10.50");
      const bids = await readBids(lotId);
      const stored = await readLot(lotId);
      const headHash = expectHashChain(lotId, bids);

      expect(bids).toHaveLength(2);
      expect(first.createdAt.toISOString()).toBe(
        canonicalBidTimestamp(bids[0]?.createdAt ?? new Date(Number.NaN)),
      );
      expect(second.createdAt.toISOString()).toBe(
        canonicalBidTimestamp(bids[1]?.createdAt ?? new Date(Number.NaN)),
      );
      expect(stored).toMatchObject({
        bidCount: 2,
        headHash,
        currentBidId: second.id,
      });
      expect(headHash).toBe(bids[1]?.hash);
    });
  });

  describe("when accepting the bid fails inside the transaction", () => {
    it("rolls back a bid whose stored timestamp differs from its hashed instant", async () => {
      const bidderId = await insertUser("BIDDER");
      const walletId = await insertWallet(bidderId, "100.00");
      const { lotId } = await liveLot({ endsAt: minutesFromNow(1) });
      const beforeLot = await readLot(lotId);

      await expect(
        placeBid(
          { lotId, userId: bidderId, role: "BIDDER", amount: "10.00" },
          {
            now: () => now,
            insertBid: (executor, values) => insertBid(executor, {
              ...values,
              createdAt: new Date(values.createdAt.getTime() + 1),
            }),
          },
        ),
      ).rejects.toThrow("Persisted bid timestamp does not match the hashed instant");

      expect(await readLot(lotId)).toEqual(beforeLot);
      expect(await readBids(lotId)).toEqual([]);
      expect(await readMovements(lotId)).toEqual([]);
      expect(
        await db
          .select()
          .from(lotParticipant)
          .where(eq(lotParticipant.lotId, lotId)),
      ).toEqual([]);
      expect(await readWallet(walletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: "0.00",
      });
    });

    it("restores both reserves, the chain and schedule, and sends no event after a final write fails", async () => {
      const leaderId = await insertUser("BIDDER");
      const bidderId = await insertUser("BIDDER");
      const leaderWalletId = await insertWallet(leaderId, "100.00");
      const bidderWalletId = await insertWallet(bidderId, "100.00");
      const { lotId, endsAt } = await liveLot();
      await placeFor(leaderId, lotId, "10.00");
      const beforeLot = await readLot(lotId);
      const beforeBids = await readBids(lotId);
      const beforeMovements = await readMovements(lotId);
      const beforeParticipants = await db
        .select()
        .from(lotParticipant)
        .where(eq(lotParticipant.lotId, lotId));
      const messages: string[] = [];
      const leave = await joinPublicLotRoom(lotId, (payload) => messages.push(payload));
      const failure = new Error("Final lot write failed");

      try {
        await expect(
          placeBid(
            { lotId, userId: bidderId, role: "BIDDER", amount: "10.50" },
            {
              now: () => minutesFromNow(-1, endsAt),
              markLotLeadingBid: async (executor, id, values) => {
                await markLotLeadingBid(executor, id, values);
                throw failure;
              },
            },
          ),
        ).rejects.toBe(failure);

        expect(messages).toHaveLength(1); // Only the subscription snapshot.
        expect(await readLot(lotId)).toEqual(beforeLot);
        expect(await readBids(lotId)).toEqual(beforeBids);
        expect(await readMovements(lotId)).toEqual(beforeMovements);
        expect(
          await db
            .select()
            .from(lotParticipant)
            .where(eq(lotParticipant.lotId, lotId)),
        ).toEqual(beforeParticipants);
        expect(await readWallet(leaderWalletId)).toEqual({
          totalBalance: "100.00",
          committedBalance: "10.00",
        });
        expect(await readWallet(bidderWalletId)).toEqual({
          totalBalance: "100.00",
          committedBalance: "0.00",
        });
      } finally {
        leave();
      }
    });
  });

  describe("when the next minimum is above the business bid limit", () => {
    it("rejects the bid and leaves the leading reserve in place", async () => {
      const leaderId = await insertUser("BIDDER");
      const challengerId = await insertUser("BIDDER");
      const leaderWalletId = await insertWallet(
        leaderId,
        "1000000.00",
      );
      const challengerWalletId = await insertWallet(challengerId, "100.00");
      const { lotId } = await liveLot({
        openingBid: "1000000.00",
        minIncrement: "0.01",
      });

      await placeFor(leaderId, lotId, "1000000.00");
      const beforeLot = await readLot(lotId);
      const beforeBids = await readBids(lotId);

      await expect(placeFor(challengerId, lotId, "1.00")).rejects.toMatchObject({
        code: "BID_BELOW_MINIMUM",
      });

      expect(await readLot(lotId)).toEqual(beforeLot);
      expect(await readBids(lotId)).toEqual(beforeBids);
      expect(await readWallet(leaderWalletId)).toEqual({
        totalBalance: "1000000.00",
        committedBalance: "1000000.00",
      });
      expect(await readWallet(challengerWalletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: "0.00",
      });
    });
  });

  describe("when the lot head does not match the leading bid", () => {
    it("rejects the new bid and keeps the existing reserve", async () => {
      const leaderId = await insertUser("BIDDER");
      const challengerId = await insertUser("BIDDER");
      const leaderWalletId = await insertWallet(leaderId, "100.00");
      const challengerWalletId = await insertWallet(challengerId, "100.00");
      const { lotId } = await liveLot();

      await placeFor(leaderId, lotId, "10.00");
      await db
        .update(lot)
        .set({ headHash: "0".repeat(64) })
        .where(eq(lot.id, lotId));
      const beforeBids = await readBids(lotId);

      await expect(placeFor(challengerId, lotId, "10.50")).rejects.toThrow(
        "Current bid does not match the lot head",
      );

      expect(await readBids(lotId)).toEqual(beforeBids);
      expect(await readWallet(leaderWalletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: "10.00",
      });
      expect(await readWallet(challengerWalletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: "0.00",
      });
      expect(await readLot(lotId)).toMatchObject({
        bidCount: 1,
        headHash: "0".repeat(64),
      });
    });
  });

  describe("when two bids arrive at the same time", () => {
    it("keeps a single valid bid order on the same lot", async () => {
      const firstBidderId = await insertUser("BIDDER");
      const secondBidderId = await insertUser("BIDDER");
      const firstWalletId = await insertWallet(firstBidderId, "100.00");
      const secondWalletId = await insertWallet(secondBidderId, "100.00");
      const { lotId, endsAt } = await liveLot({ extensionCount: 1 });

      const [firstResult, secondResult] = await Promise.all([
        settle(placeFor(firstBidderId, lotId, "10.00")),
        settle(placeFor(secondBidderId, lotId, "12.00")),
      ]);
      const bids = await readBids(lotId);
      const stored = await readLot(lotId);
      const movements = await readMovements(lotId);
      const successes = [firstResult, secondResult].filter(
        (result) => result.status === "fulfilled",
      );
      const failures = [firstResult, secondResult].filter(
        (result) => result.status === "rejected",
      );

      expect(successes.length).toBeGreaterThan(0);
      expect(successes).toHaveLength(bids.length);
      expect(bids.map((entry) => entry.sequence)).toEqual(
        bids.map((_, index) => index + 1),
      );

      let minimum = "10.00";

      for (const entry of bids) {
        expect(compareMoney(entry.amount, minimum) >= 0).toBe(true);
        minimum = addMoney(entry.amount, "0.50");
      }

      const headHash = expectHashChain(lotId, bids);
      const leader = bids.at(-1);

      expect(stored).toMatchObject({
        status: "ACTIVE",
        currentBidId: leader?.id,
        bidCount: bids.length,
        headHash,
        endsAt,
        extensionCount: 1,
      });

      for (const [index, entry] of bids.entries()) {
        const related = movements.filter((movement) => movement.bidId === entry.id);
        const isLeader = index === bids.length - 1;

        expect(related).toEqual(
          isLeader
            ? [{ type: "HOLD", amount: entry.amount, bidId: entry.id }]
            : [
                { type: "HOLD", amount: entry.amount, bidId: entry.id },
                { type: "RELEASE", amount: entry.amount, bidId: entry.id },
              ],
        );
      }

      expect(movements).toHaveLength(bids.length + Math.max(bids.length - 1, 0));

      for (const failure of failures) {
        expect(failure.status).toBe("rejected");

        if (failure.status === "rejected") {
          expect(failure.error).toMatchObject({ code: "BID_BELOW_MINIMUM" });
        }
      }

      const firstWallet = await readWallet(firstWalletId);
      const secondWallet = await readWallet(secondWalletId);
      const committedByBidder = new Map<string, string>([
        [firstBidderId, "0.00"],
        [secondBidderId, "0.00"],
      ]);

      if (leader) {
        committedByBidder.set(leader.bidderId, leader.amount);
      }

      expect(firstWallet).toEqual({
        totalBalance: "100.00",
        committedBalance: committedByBidder.get(firstBidderId),
      });
      expect(secondWallet).toEqual({
        totalBalance: "100.00",
        committedBalance: committedByBidder.get(secondBidderId),
      });
    });

    it("accepts only one opening bid when two arrive together", async () => {
      const firstBidderId = await insertUser("BIDDER");
      const secondBidderId = await insertUser("BIDDER");
      const firstWalletId = await insertWallet(firstBidderId, "100.00");
      const secondWalletId = await insertWallet(secondBidderId, "100.00");
      const { lotId } = await liveLot();

      const [firstResult, secondResult] = await Promise.all([
        settle(placeFor(firstBidderId, lotId, "10.00")),
        settle(placeFor(secondBidderId, lotId, "10.00")),
      ]);
      const results = [firstResult, secondResult];
      const bids = await readBids(lotId);
      const stored = await readLot(lotId);
      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter((result) => result.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toEqual([
        expect.objectContaining({
          status: "rejected",
          error: expect.objectContaining({ code: "BID_BELOW_MINIMUM" }),
        }),
      ]);
      expect(bids).toHaveLength(1);
      expect(bids[0]).toMatchObject({
        sequence: 1,
        amount: "10.00",
      });
      expect(stored).toMatchObject({
        currentBidId: bids[0]?.id,
        bidCount: 1,
        headHash: bids[0]?.hash,
      });
      expect(await readMovements(lotId)).toEqual([
        { type: "HOLD", amount: "10.00", bidId: bids[0]?.id },
      ]);

      const committed = new Map<string, string>([
        [firstBidderId, "0.00"],
        [secondBidderId, "0.00"],
      ]);
      const leaderId = bids[0]?.bidderId;

      if (leaderId) {
        committed.set(leaderId, "10.00");
      }

      expect(await readWallet(firstWalletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: committed.get(firstBidderId),
      });
      expect(await readWallet(secondWalletId)).toEqual({
        totalBalance: "100.00",
        committedBalance: committed.get(secondBidderId),
      });
    });

    it("does not reserve the same available balance on two lots", async () => {
      const bidderId = await insertUser("BIDDER");
      const walletId = await insertWallet(bidderId, "15.00");
      const firstLot = await liveLot({ openingBid: "10.00" });
      const secondLot = await liveLot({ openingBid: "10.00" });

      const [firstResult, secondResult] = await Promise.all([
        settle(placeFor(bidderId, firstLot.lotId, "10.00")),
        settle(placeFor(bidderId, secondLot.lotId, "10.00")),
      ]);
      const results = [firstResult, secondResult];
      const firstBids = await readBids(firstLot.lotId);
      const secondBids = await readBids(secondLot.lotId);
      const acceptedLots = [firstBids, secondBids].filter(
        (entries) => entries.length > 0,
      );
      const emptyLots = [firstBids, secondBids].filter(
        (entries) => entries.length === 0,
      );

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toEqual([
        expect.objectContaining({
          status: "rejected",
          error: expect.objectContaining({ code: "INSUFFICIENT_BALANCE" }),
        }),
      ]);
      expect(acceptedLots).toHaveLength(1);
      expect(emptyLots).toHaveLength(1);
      expect(await readWallet(walletId)).toEqual({
        totalBalance: "15.00",
        committedBalance: "10.00",
      });
      expect(await readMovements(firstLot.lotId)).toHaveLength(firstBids.length);
      expect(await readMovements(secondLot.lotId)).toHaveLength(secondBids.length);
      expect(await readLot(firstLot.lotId)).toMatchObject({
        endsAt: firstLot.endsAt,
        extensionCount: 0,
      });
      expect(await readLot(secondLot.lotId)).toMatchObject({
        endsAt: secondLot.endsAt,
        extensionCount: 0,
      });
    });
  });

  describe("when a bid races cancellation of the same lot", () => {
    it("ends canceled without leaving the reserve held", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const bidderId = await insertUser("BIDDER");
      const walletId = await insertWallet(bidderId, "50.00");
      const lotId = await insertLot(auctioneerId, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
      });

      const [bidResult, cancelResult] = await Promise.all([
        settle(placeFor(bidderId, lotId, "10.00")),
        settle(
          cancelLot(
            {
              lotId,
              auctioneerId,
              role: "AUCTIONEER",
            },
            { now: () => now },
          ),
        ),
      ]);
      const stored = await readLot(lotId);
      const bids = await readBids(lotId);
      const movements = await readMovements(lotId);

      expect(cancelResult.status).toBe("fulfilled");
      expect(stored?.status).toBe("CANCELED");
      expect(await readWallet(walletId)).toEqual({
        totalBalance: "50.00",
        committedBalance: "0.00",
      });

      if (bids.length === 0) {
        expect(bidResult.status).toBe("rejected");

        if (bidResult.status === "rejected") {
          expect(bidResult.error).toMatchObject({ code: "LOT_CANCELED" });
        }

        expect(movements).toEqual([]);
        expect(stored).toMatchObject({
          currentBidId: null,
          bidCount: 0,
        });
      } else {
        expect(bidResult.status).toBe("fulfilled");
        expect(bids).toHaveLength(1);
        expect(movements).toHaveLength(2);
        expect(movements).toEqual(
          expect.arrayContaining([
            { type: "HOLD", amount: "10.00", bidId: bids[0]?.id },
            { type: "RELEASE", amount: "10.00", bidId: bids[0]?.id },
          ]),
        );
      }
    });
  });
});
