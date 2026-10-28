//* Libraries imports
import { asc, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";

//* Models imports
import { findBidById } from "../../models/bid";
import { markLotEnded } from "../../models/lot";
import { findLotParticipantByUserId } from "../../models/lot-participant";
import { insertReceipt } from "../../models/receipt";
import {
  decreaseTotalAndCommittedBalance,
  findWalletByUserId,
  increaseTotalBalance,
} from "../../models/wallet";

//* Local imports
import { db } from "../../db/index";
import {
  bid,
  lot,
  lotParticipant,
  receipt,
  user,
  wallet,
  walletMovement,
} from "../../db/schema";

//* Services imports
import { cancelLot, CancelLotError } from "./cancel-lot";
import { placeBid, PlaceBidError } from "./place-bid";
import { joinPublicLotRoom } from "./public-lot-live";
import {
  describeSettlementFailure,
  LotSettlementError,
  settleDueLots,
  type SettleDueLotsDependencies,
} from "./settle-due-lots";

const clock = new Date("1999-06-15T12:00:00.000Z");
const hour = 60 * 60 * 1000;
const minute = 60 * 1000;
const createdUserIds: string[] = [];
const createdLotIds: string[] = [];

function shift(base: Date, milliseconds: number) {
  return new Date(base.getTime() + milliseconds);
}

function placeFor(userId: string, lotId: string, amount: string, at: Date) {
  return placeBid(
    {
      lotId,
      userId,
      role: "BIDDER",
      amount,
    },
    { now: () => at },
  );
}

function settleFor(at: Date) {
  return settleDueLots({ now: () => at });
}

function cancelFor(auctioneerId: string, lotId: string, at: Date) {
  return cancelLot(
    {
      lotId,
      auctioneerId,
      role: "AUCTIONEER",
    },
    { now: () => at },
  );
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
    name: "Settlement Tester",
    email: `settle-${id}@example.com`,
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
    openingBid?: string;
    minIncrement?: string;
  },
) {
  const rows = await db
    .insert(lot)
    .values({
      auctioneerId,
      title: "Settlement lot",
      description: null,
      openingBid: values.openingBid ?? "10.00",
      minIncrement: values.minIncrement ?? "0.50",
      startsAt: values.startsAt,
      originalEndsAt: values.endsAt,
      endsAt: values.endsAt,
    })
    .returning({ id: lot.id });
  const row = rows[0];

  if (!row) {
    throw new Error("Insert lot did not return a row");
  }

  createdLotIds.push(row.id);

  return row.id;
}

async function openLot(
  values: {
    startsAt?: Date;
    endsAt?: Date;
    openingBid?: string;
    minIncrement?: string;
  } = {},
) {
  const auctioneerId = await insertUser("AUCTIONEER");
  const auctioneerWalletId = await insertWallet(auctioneerId, "0.00");
  const startsAt = values.startsAt ?? shift(clock, -2 * hour);
  const endsAt = values.endsAt ?? shift(clock, 2 * hour);
  const lotId = await insertLot(auctioneerId, {
    startsAt,
    endsAt,
    openingBid: values.openingBid,
    minIncrement: values.minIncrement,
  });

  return { auctioneerId, auctioneerWalletId, lotId, startsAt, endsAt };
}

async function leadLot(
  lotId: string,
  amount: string,
  at: Date,
  totalBalance = "100.00",
) {
  const bidderId = await insertUser("BIDDER");
  const walletId = await insertWallet(bidderId, totalBalance);
  const accepted = await placeFor(bidderId, lotId, amount, at);

  return { bidderId, walletId, accepted };
}

async function readLot(lotId: string) {
  const rows = await db
    .select({
      status: lot.status,
      endsAt: lot.endsAt,
      originalEndsAt: lot.originalEndsAt,
      extensionCount: lot.extensionCount,
      currentBidId: lot.currentBidId,
      bidCount: lot.bidCount,
      winnerId: lot.winnerId,
      endedAt: lot.endedAt,
      settledAt: lot.settledAt,
      canceledAt: lot.canceledAt,
    })
    .from(lot)
    .where(eq(lot.id, lotId));

  return rows[0];
}

async function readBids(lotId: string) {
  return db
    .select({
      id: bid.id,
      bidderId: bid.bidderId,
      amount: bid.amount,
      sequence: bid.sequence,
    })
    .from(bid)
    .where(eq(bid.lotId, lotId))
    .orderBy(asc(bid.sequence));
}

async function readMovements(lotId: string) {
  return db
    .select({
      type: walletMovement.type,
      amount: walletMovement.amount,
      bidId: walletMovement.bidId,
      walletId: walletMovement.walletId,
    })
    .from(walletMovement)
    .where(eq(walletMovement.lotId, lotId))
    .orderBy(asc(walletMovement.createdAt), asc(walletMovement.id));
}

async function readReceipts(lotId: string) {
  return db
    .select({
      lotId: receipt.lotId,
      winningBidId: receipt.winningBidId,
      winnerId: receipt.winnerId,
      winnerParticipantNo: receipt.winnerParticipantNo,
      finalAmount: receipt.finalAmount,
      endedAt: receipt.endedAt,
      shareToken: receipt.shareToken,
    })
    .from(receipt)
    .where(eq(receipt.lotId, lotId));
}

async function readWallet(userId: string) {
  const balances = await findWalletByUserId(db, userId);

  if (balances === null) {
    throw new Error("Wallet was not found");
  }

  return balances;
}

function forLot<Row extends { lotId: string }>(rows: Row[], lotId: string) {
  return rows.filter((row) => row.lotId === lotId);
}

function settlementError(error: unknown, lotId: string) {
  if (!(error instanceof AggregateError)) {
    return undefined;
  }

  return error.errors.find(
    (entry): entry is LotSettlementError =>
      entry instanceof LotSettlementError && entry.lotId === lotId,
  );
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
    await db.delete(receipt).where(inArray(receipt.lotId, createdLotIds));
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

describe("settleDueLots", () => {
  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe("when the lot has a winning bid", () => {
    it("debits the winner, credits the auctioneer, and stores one receipt", async () => {
      const endsAt = shift(clock, 2 * hour);
      const settleAt = shift(endsAt, hour);
      const opened = await openLot({ endsAt });
      const leader = await leadLot(opened.lotId, "25.00", clock);

      const result = await settleFor(settleAt);
      const stored = await readLot(opened.lotId);
      const movements = await readMovements(opened.lotId);
      const receipts = await readReceipts(opened.lotId);
      const winner = await readWallet(leader.bidderId);
      const auctioneer = await readWallet(opened.auctioneerId);
      const receiptRow = receipts[0];

      expect(leader.accepted.participantNo).toBe(1);
      expect(leader.accepted.endsAt).toEqual(endsAt);
      expect(forLot(result, opened.lotId)).toEqual([
        {
          lotId: opened.lotId,
          outcome: "settled",
          winnerId: leader.bidderId,
          endedAt: endsAt,
          settledAt: settleAt,
        },
      ]);
      expect(stored).toMatchObject({
        status: "ENDED",
        winnerId: leader.bidderId,
        currentBidId: leader.accepted.id,
        bidCount: 1,
        endedAt: endsAt,
        settledAt: settleAt,
        canceledAt: null,
      });
      expect(stored?.endedAt).not.toEqual(stored?.settledAt);
      expect(winner).toMatchObject({
        totalBalance: "75.00",
        committedBalance: "0.00",
        availableBalance: "75.00",
      });
      expect(auctioneer).toMatchObject({
        totalBalance: "25.00",
        committedBalance: "0.00",
        availableBalance: "25.00",
      });
      expect(movements).toHaveLength(3);
      expect(movements).toEqual(
        expect.arrayContaining([
          {
            type: "HOLD",
            amount: "25.00",
            bidId: leader.accepted.id,
            walletId: leader.walletId,
          },
          {
            type: "SETTLEMENT_DEBIT",
            amount: "25.00",
            bidId: null,
            walletId: leader.walletId,
          },
          {
            type: "SETTLEMENT_CREDIT",
            amount: "25.00",
            bidId: null,
            walletId: opened.auctioneerWalletId,
          },
        ]),
      );
      expect(receipts).toHaveLength(1);
      expect(receiptRow).toMatchObject({
        lotId: opened.lotId,
        winningBidId: leader.accepted.id,
        winnerId: leader.bidderId,
        winnerParticipantNo: 1,
        finalAmount: "25.00",
        endedAt: endsAt,
      });
      expect(receiptRow?.shareToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(receiptRow?.shareToken).not.toContain(leader.bidderId);
      expect(receiptRow?.shareToken).not.toContain(opened.lotId);
      expect(receiptRow?.shareToken).not.toContain(leader.accepted.id);
      expect(receiptRow?.shareToken.includes("@")).toBe(false);
    });

    it("stores a distinct share token on each receipt", async () => {
      const endsAt = shift(clock, hour);
      const settleAt = shift(endsAt, hour);
      const first = await openLot({ endsAt, openingBid: "10.00" });
      const second = await openLot({ endsAt, openingBid: "10.00" });
      const bidderId = await insertUser("BIDDER");
      await insertWallet(bidderId, "100.00");

      await placeFor(bidderId, first.lotId, "10.00", clock);
      await placeFor(bidderId, second.lotId, "10.00", clock);
      await settleFor(settleAt);

      const firstReceipt = (await readReceipts(first.lotId))[0];
      const secondReceipt = (await readReceipts(second.lotId))[0];

      expect(firstReceipt?.shareToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(secondReceipt?.shareToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(firstReceipt?.shareToken).not.toBe(secondReceipt?.shareToken);
      expect(firstReceipt?.winnerParticipantNo).toBe(1);
      expect(secondReceipt?.winnerParticipantNo).toBe(1);
    });
  });

  describe("when the lot has no bids", () => {
    it("ends the lot without a movement or a receipt", async () => {
      const endsAt = shift(clock, -hour);
      const settleAt = clock;
      const opened = await openLot({
        startsAt: shift(endsAt, -hour),
        endsAt,
      });

      const result = await settleFor(settleAt);
      const stored = await readLot(opened.lotId);

      expect(forLot(result, opened.lotId)).toEqual([
        {
          lotId: opened.lotId,
          outcome: "settled",
          winnerId: null,
          endedAt: endsAt,
          settledAt: settleAt,
        },
      ]);
      expect(stored).toMatchObject({
        status: "ENDED",
        winnerId: null,
        currentBidId: null,
        bidCount: 0,
        endedAt: endsAt,
        settledAt: settleAt,
      });
      expect(stored?.endedAt).not.toEqual(stored?.settledAt);
      expect(await readMovements(opened.lotId)).toEqual([]);
      expect(await readReceipts(opened.lotId)).toEqual([]);
    });

    it("ends a lot whose current end equals the job time", async () => {
      const settleAt = clock;
      const opened = await openLot({
        startsAt: shift(settleAt, -hour),
        endsAt: settleAt,
      });

      const result = await settleFor(settleAt);
      const stored = await readLot(opened.lotId);

      expect(forLot(result, opened.lotId)).toEqual([
        {
          lotId: opened.lotId,
          outcome: "settled",
          winnerId: null,
          endedAt: settleAt,
          settledAt: settleAt,
        },
      ]);
      expect(stored).toMatchObject({
        status: "ENDED",
        endedAt: settleAt,
        settledAt: settleAt,
        winnerId: null,
      });
      expect(await readMovements(opened.lotId)).toEqual([]);
      expect(await readReceipts(opened.lotId)).toEqual([]);
    });
  });

  describe("when settlement runs again", () => {
    it("keeps a single debit, credit, and receipt", async () => {
      const endsAt = shift(clock, hour);
      const settleAt = shift(endsAt, hour);
      const opened = await openLot({ endsAt });
      const leader = await leadLot(opened.lotId, "25.00", clock);

      const first = await settleFor(settleAt);
      const second = await settleFor(settleAt);
      const movements = await readMovements(opened.lotId);

      expect(forLot(first, opened.lotId)).toHaveLength(1);
      expect(forLot(second, opened.lotId)).toEqual([]);
      expect(
        movements.filter((movement) => movement.type === "SETTLEMENT_DEBIT"),
      ).toEqual([
        {
          type: "SETTLEMENT_DEBIT",
          amount: "25.00",
          bidId: null,
          walletId: leader.walletId,
        },
      ]);
      expect(
        movements.filter((movement) => movement.type === "SETTLEMENT_CREDIT"),
      ).toHaveLength(1);
      expect(await readReceipts(opened.lotId)).toHaveLength(1);
      expect(await readWallet(leader.bidderId)).toMatchObject({
        totalBalance: "75.00",
        committedBalance: "0.00",
      });
    });
  });

  describe("when two settlements overlap", () => {
    it("keeps a single debit, credit, and receipt", async () => {
      const endsAt = shift(clock, hour);
      const settleAt = shift(endsAt, hour);
      const opened = await openLot({ endsAt });
      await leadLot(opened.lotId, "25.00", clock);

      const [first, second] = await Promise.all([
        settleFor(settleAt),
        settleFor(settleAt),
      ]);
      const settled = [...first, ...second].filter(
        (entry) => entry.lotId === opened.lotId && entry.outcome === "settled",
      );
      const movements = await readMovements(opened.lotId);

      expect(settled).toHaveLength(1);
      expect(
        movements.filter((movement) => movement.type === "SETTLEMENT_DEBIT"),
      ).toHaveLength(1);
      expect(
        movements.filter((movement) => movement.type === "SETTLEMENT_CREDIT"),
      ).toHaveLength(1);
      expect(await readReceipts(opened.lotId)).toHaveLength(1);
    });
  });

  describe("when the lot is canceled", () => {
    it("does not settle the lot", async () => {
      const opened = await openLot({ endsAt: shift(clock, 2 * hour) });
      const leader = await leadLot(opened.lotId, "25.00", clock);
      await cancelFor(opened.auctioneerId, opened.lotId, clock);
      const pastEnd = shift(clock, -2 * hour);

      await db
        .update(lot)
        .set({
          startsAt: shift(pastEnd, -hour),
          originalEndsAt: pastEnd,
          endsAt: pastEnd,
        })
        .where(eq(lot.id, opened.lotId));

      const result = await settleFor(clock);
      const stored = await readLot(opened.lotId);
      const movements = await readMovements(opened.lotId);

      expect(forLot(result, opened.lotId)).toEqual([]);
      expect(stored).toMatchObject({
        status: "CANCELED",
        winnerId: null,
        endedAt: null,
        settledAt: null,
        currentBidId: leader.accepted.id,
      });
      expect(movements.map((movement) => movement.type)).toEqual([
        "HOLD",
        "RELEASE",
      ]);
      expect(await readReceipts(opened.lotId)).toEqual([]);
      expect(await readWallet(leader.bidderId)).toMatchObject({
        totalBalance: "100.00",
        committedBalance: "0.00",
        availableBalance: "100.00",
      });
      expect(await readWallet(opened.auctioneerId)).toMatchObject({
        totalBalance: "0.00",
        committedBalance: "0.00",
        availableBalance: "0.00",
      });
    });
  });

  describe("when the lot is still open", () => {
    it("leaves a lot active one millisecond before its end", async () => {
      const endsAt = shift(clock, 3 * hour);
      const settleAt = shift(endsAt, -1);
      const opened = await openLot({ endsAt });
      const leader = await leadLot(opened.lotId, "10.00", clock);

      const result = await settleFor(settleAt);
      const stored = await readLot(opened.lotId);

      expect(forLot(result, opened.lotId)).toEqual([]);
      expect(stored).toMatchObject({
        status: "ACTIVE",
        endsAt,
        extensionCount: 0,
        winnerId: null,
        endedAt: null,
        settledAt: null,
        currentBidId: leader.accepted.id,
      });
      expect(await readMovements(opened.lotId)).toEqual([
        {
          type: "HOLD",
          amount: "10.00",
          bidId: leader.accepted.id,
          walletId: leader.walletId,
        },
      ]);
      expect(await readReceipts(opened.lotId)).toEqual([]);
      expect(await readWallet(leader.bidderId)).toMatchObject({
        totalBalance: "100.00",
        committedBalance: "10.00",
        availableBalance: "90.00",
      });
    });

    it("leaves a lot active when a bid extended its end past now", async () => {
      const originalEndsAt = shift(clock, minute);
      const opened = await openLot({ endsAt: originalEndsAt });
      const leader = await leadLot(opened.lotId, "10.00", clock);
      const extendedEndsAt = shift(originalEndsAt, 2 * minute);

      expect(leader.accepted.endsAt).toEqual(extendedEndsAt);
      expect(leader.accepted.extensionCount).toBe(1);

      const result = await settleFor(originalEndsAt);
      const stored = await readLot(opened.lotId);

      expect(forLot(result, opened.lotId)).toEqual([]);
      expect(stored).toMatchObject({
        status: "ACTIVE",
        endsAt: extendedEndsAt,
        originalEndsAt,
        extensionCount: 1,
        winnerId: null,
        endedAt: null,
        settledAt: null,
      });
      expect(await readReceipts(opened.lotId)).toEqual([]);
      expect(
        (await readMovements(opened.lotId)).map((movement) => movement.type),
      ).toEqual(["HOLD"]);
      expect(await readWallet(leader.bidderId)).toMatchObject({
        totalBalance: "100.00",
        committedBalance: "10.00",
        availableBalance: "90.00",
      });
    });
  });

  describe("when the winner leads another lot", () => {
    it("keeps the reserve of the other lot", async () => {
      const dueEndsAt = shift(clock, hour);
      const liveEndsAt = shift(clock, 5 * hour);
      const settleAt = shift(clock, 2 * hour);
      const dueLot = await openLot({
        endsAt: dueEndsAt,
        openingBid: "10.15",
      });
      const liveLot = await openLot({
        endsAt: liveEndsAt,
        openingBid: "20.40",
      });
      const bidderId = await insertUser("BIDDER");
      const walletId = await insertWallet(bidderId, "100.00");
      const dueBid = await placeFor(bidderId, dueLot.lotId, "10.15", clock);
      const liveBid = await placeFor(bidderId, liveLot.lotId, "20.40", clock);

      await settleFor(settleAt);

      const dueStored = await readLot(dueLot.lotId);
      const liveStored = await readLot(liveLot.lotId);
      const dueMovements = await readMovements(dueLot.lotId);
      const balances = await readWallet(bidderId);

      expect(dueStored).toMatchObject({
        status: "ENDED",
        winnerId: bidderId,
        endedAt: dueEndsAt,
        settledAt: settleAt,
      });
      expect(liveStored).toMatchObject({
        status: "ACTIVE",
        winnerId: null,
        settledAt: null,
        currentBidId: liveBid.id,
        endsAt: liveEndsAt,
      });
      expect(dueMovements.map((movement) => movement.type).sort()).toEqual([
        "HOLD",
        "SETTLEMENT_CREDIT",
        "SETTLEMENT_DEBIT",
      ]);
      expect(
        dueMovements.find((movement) => movement.type === "SETTLEMENT_DEBIT"),
      ).toMatchObject({
        amount: "10.15",
        bidId: null,
        walletId,
      });
      expect(await readMovements(liveLot.lotId)).toEqual([
        {
          type: "HOLD",
          amount: "20.40",
          bidId: liveBid.id,
          walletId,
        },
      ]);
      expect(await readReceipts(dueLot.lotId)).toHaveLength(1);
      expect(await readReceipts(liveLot.lotId)).toEqual([]);
      expect(balances).toMatchObject({
        totalBalance: "89.85",
        committedBalance: "20.40",
        availableBalance: "69.45",
      });
      expect(dueBid.amount).toBe("10.15");
    });
  });

  describe("when the winning bid has cents", () => {
    it("debits and credits the bid amount and keeps available equal to total minus committed", async () => {
      const endsAt = shift(clock, hour);
      const settleAt = shift(endsAt, hour);
      const opened = await openLot({ endsAt, openingBid: "10.37" });
      const leader = await leadLot(opened.lotId, "10.37", clock);

      await settleFor(settleAt);

      const movements = await readMovements(opened.lotId);
      const debit = movements.find(
        (movement) => movement.type === "SETTLEMENT_DEBIT",
      );
      const credit = movements.find(
        (movement) => movement.type === "SETTLEMENT_CREDIT",
      );
      const winner = await readWallet(leader.bidderId);
      const auctioneer = await readWallet(opened.auctioneerId);

      expect(debit).toMatchObject({
        amount: "10.37",
        bidId: null,
        walletId: leader.walletId,
      });
      expect(credit).toMatchObject({
        amount: "10.37",
        bidId: null,
        walletId: opened.auctioneerWalletId,
      });
      expect(
        movements.filter((movement) => movement.type === "RELEASE"),
      ).toEqual([]);
      expect(winner).toMatchObject({
        totalBalance: "89.63",
        committedBalance: "0.00",
        availableBalance: "89.63",
      });
      expect(auctioneer).toMatchObject({
        totalBalance: "10.37",
        committedBalance: "0.00",
        availableBalance: "10.37",
      });
      expect((await readReceipts(opened.lotId))[0]).toMatchObject({
        finalAmount: "10.37",
        winnerParticipantNo: leader.accepted.participantNo,
      });
    });
  });

  describe("when a bid races settlement", () => {
    it("keeps a single valid outcome and accepts no bid on an ended lot", async () => {
      const endsAt = shift(clock, 2 * hour);
      const bidAt = shift(endsAt, -1);
      const opened = await openLot({
        endsAt,
        openingBid: "10.00",
        minIncrement: "0.50",
      });
      const leader = await leadLot(opened.lotId, "10.00", clock);
      const challengerId = await insertUser("BIDDER");
      await insertWallet(challengerId, "100.00");

      const [bidResult, settlement] = await Promise.all([
        settle(placeFor(challengerId, opened.lotId, "10.50", bidAt)),
        settle(settleFor(endsAt)),
      ]);
      const stored = await readLot(opened.lotId);
      const bids = await readBids(opened.lotId);
      const movements = await readMovements(opened.lotId);
      const receipts = await readReceipts(opened.lotId);
      const challengerBids = bids.filter(
        (entry) => entry.bidderId === challengerId,
      );
      const settlements = movements.filter(
        (movement) =>
          movement.type === "SETTLEMENT_DEBIT" ||
          movement.type === "SETTLEMENT_CREDIT",
      );

      expect(stored).toBeDefined();

      if (stored?.status === "ENDED") {
        expect(bidResult.status).toBe("rejected");

        if (bidResult.status === "rejected") {
          expect(bidResult.error).toBeInstanceOf(PlaceBidError);
          expect(bidResult.error).toMatchObject({ code: "LOT_ENDED" });
        }

        expect(challengerBids).toEqual([]);
        expect(settlements).toHaveLength(2);
        expect(receipts).toHaveLength(1);
        expect(stored.winnerId).toBe(leader.bidderId);
        expect(stored.endedAt).toEqual(endsAt);
        expect(
          movements.filter((movement) => movement.type === "RELEASE"),
        ).toEqual([]);
        expect(await readWallet(leader.bidderId)).toMatchObject({
          totalBalance: "90.00",
          committedBalance: "0.00",
          availableBalance: "90.00",
        });
        expect(await readWallet(challengerId)).toMatchObject({
          totalBalance: "100.00",
          committedBalance: "0.00",
          availableBalance: "100.00",
        });
      } else {
        expect(stored?.status).toBe("ACTIVE");
        expect(bidResult.status).toBe("fulfilled");
        expect(stored?.endsAt.getTime()).toBeGreaterThan(endsAt.getTime());
        expect(stored?.winnerId).toBeNull();
        expect(stored?.settledAt).toBeNull();
        expect(stored?.endedAt).toBeNull();
        expect(challengerBids).toHaveLength(1);
        expect(settlements).toEqual([]);
        expect(receipts).toEqual([]);
        expect(
          forLot(
            settlement.status === "fulfilled" ? settlement.value : [],
            opened.lotId,
          ).filter((entry) => entry.outcome === "settled"),
        ).toEqual([]);
        expect(await readWallet(leader.bidderId)).toMatchObject({
          totalBalance: "100.00",
          committedBalance: "0.00",
          availableBalance: "100.00",
        });
        expect(await readWallet(challengerId)).toMatchObject({
          totalBalance: "100.00",
          committedBalance: "10.50",
          availableBalance: "89.50",
        });
      }

      expect(await readWallet(opened.auctioneerId)).toMatchObject({
        committedBalance: "0.00",
        availableBalance: stored?.status === "ENDED" ? "10.00" : "0.00",
        totalBalance: stored?.status === "ENDED" ? "10.00" : "0.00",
      });
    });

    it("rejects a bid after the lot is settled and keeps the single settlement", async () => {
      const endsAt = shift(clock, hour);
      const settleAt = shift(endsAt, hour);
      const opened = await openLot({ endsAt });
      const leader = await leadLot(opened.lotId, "10.00", clock);
      await settleFor(settleAt);
      const challengerId = await insertUser("BIDDER");
      await insertWallet(challengerId, "100.00");

      await expect(
        placeFor(challengerId, opened.lotId, "10.50", settleAt),
      ).rejects.toMatchObject({ code: "LOT_ENDED" });

      const movements = await readMovements(opened.lotId);

      expect(await readBids(opened.lotId)).toHaveLength(1);
      expect(
        movements.filter((movement) => movement.type === "SETTLEMENT_DEBIT"),
      ).toHaveLength(1);
      expect(
        movements.filter((movement) => movement.type === "SETTLEMENT_CREDIT"),
      ).toHaveLength(1);
      expect(await readReceipts(opened.lotId)).toHaveLength(1);
      expect(await readLot(opened.lotId)).toMatchObject({
        status: "ENDED",
        winnerId: leader.bidderId,
        bidCount: 1,
      });
    });
  });

  describe("when cancellation races settlement", () => {
    it("keeps a single valid outcome and does not cancel a settled lot", async () => {
      const endsAt = shift(clock, 2 * hour);
      const cancelAt = shift(endsAt, -1);
      const opened = await openLot({ endsAt });
      const leader = await leadLot(opened.lotId, "25.00", clock);

      const [cancelResult, settlement] = await Promise.all([
        settle(cancelFor(opened.auctioneerId, opened.lotId, cancelAt)),
        settle(settleFor(endsAt)),
      ]);
      const stored = await readLot(opened.lotId);
      const movements = await readMovements(opened.lotId);
      const receipts = await readReceipts(opened.lotId);
      const releases = movements.filter(
        (movement) => movement.type === "RELEASE",
      );
      const settlements = movements.filter(
        (movement) =>
          movement.type === "SETTLEMENT_DEBIT" ||
          movement.type === "SETTLEMENT_CREDIT",
      );
      const settled = (
        settlement.status === "fulfilled" ? settlement.value : []
      ).filter(
        (entry) => entry.lotId === opened.lotId && entry.outcome === "settled",
      );

      expect(stored).toBeDefined();

      if (stored?.status === "CANCELED") {
        expect(cancelResult.status).toBe("fulfilled");
        expect(settled).toEqual([]);
        expect(stored.winnerId).toBeNull();
        expect(stored.settledAt).toBeNull();
        expect(stored.endedAt).toBeNull();
        expect(receipts).toEqual([]);
        expect(settlements).toEqual([]);
        expect(releases).toEqual([
          {
            type: "RELEASE",
            amount: "25.00",
            bidId: leader.accepted.id,
            walletId: leader.walletId,
          },
        ]);
        expect(await readWallet(leader.bidderId)).toMatchObject({
          totalBalance: "100.00",
          committedBalance: "0.00",
          availableBalance: "100.00",
        });
        expect(await readWallet(opened.auctioneerId)).toMatchObject({
          totalBalance: "0.00",
          committedBalance: "0.00",
        });
      } else {
        expect(stored?.status).toBe("ENDED");
        expect(cancelResult.status).toBe("rejected");

        if (cancelResult.status === "rejected") {
          expect(cancelResult.error).toBeInstanceOf(CancelLotError);
          expect(cancelResult.error).toMatchObject({
            code: "LOT_NOT_CANCELABLE",
          });
        }

        expect(settled).toHaveLength(1);
        expect(stored?.winnerId).toBe(leader.bidderId);
        expect(stored?.canceledAt).toBeNull();
        expect(stored?.endedAt).toEqual(endsAt);
        expect(receipts).toHaveLength(1);
        expect(settlements).toHaveLength(2);
        expect(releases).toEqual([]);
        expect(await readWallet(leader.bidderId)).toMatchObject({
          totalBalance: "75.00",
          committedBalance: "0.00",
          availableBalance: "75.00",
        });
        expect(await readWallet(opened.auctioneerId)).toMatchObject({
          totalBalance: "25.00",
          committedBalance: "0.00",
          availableBalance: "25.00",
        });
      }
    });

    it("rejects cancellation after settlement and keeps the debit", async () => {
      const endsAt = shift(clock, hour);
      const settleAt = shift(endsAt, hour);
      const opened = await openLot({ endsAt });
      const leader = await leadLot(opened.lotId, "25.00", clock);
      await settleFor(settleAt);

      await expect(
        cancelFor(opened.auctioneerId, opened.lotId, settleAt),
      ).rejects.toMatchObject({ code: "LOT_NOT_CANCELABLE" });

      const movements = await readMovements(opened.lotId);

      expect(await readLot(opened.lotId)).toMatchObject({
        status: "ENDED",
        winnerId: leader.bidderId,
        canceledAt: null,
      });
      expect(
        movements.filter((movement) => movement.type === "RELEASE"),
      ).toEqual([]);
      expect(
        movements.filter((movement) => movement.type === "SETTLEMENT_DEBIT"),
      ).toHaveLength(1);
      expect(
        movements.filter((movement) => movement.type === "SETTLEMENT_CREDIT"),
      ).toHaveLength(1);
      expect(await readReceipts(opened.lotId)).toHaveLength(1);
      expect(await readWallet(leader.bidderId)).toMatchObject({
        totalBalance: "75.00",
        committedBalance: "0.00",
        availableBalance: "75.00",
      });
    });
  });

  describe("when a later bid wins", () => {
    it("debits only the winner and records that participant", async () => {
      const endsAt = shift(clock, 2 * hour);
      const settleAt = shift(endsAt, hour);
      const opened = await openLot({
        endsAt,
        openingBid: "10.00",
        minIncrement: "0.50",
      });
      const first = await leadLot(opened.lotId, "10.00", clock);
      const winnerId = await insertUser("BIDDER");
      const winnerWalletId = await insertWallet(winnerId, "100.00");
      const winning = await placeFor(
        winnerId,
        opened.lotId,
        "10.50",
        shift(clock, minute),
      );

      await settleFor(settleAt);

      const movements = await readMovements(opened.lotId);

      expect(winning.participantNo).toBe(2);
      expect(await readLot(opened.lotId)).toMatchObject({
        status: "ENDED",
        winnerId,
        bidCount: 2,
        currentBidId: winning.id,
        endedAt: endsAt,
        settledAt: settleAt,
      });
      expect(await readWallet(first.bidderId)).toMatchObject({
        totalBalance: "100.00",
        committedBalance: "0.00",
        availableBalance: "100.00",
      });
      expect(await readWallet(winnerId)).toMatchObject({
        totalBalance: "89.50",
        committedBalance: "0.00",
        availableBalance: "89.50",
      });
      expect(await readWallet(opened.auctioneerId)).toMatchObject({
        totalBalance: "10.50",
        committedBalance: "0.00",
        availableBalance: "10.50",
      });
      expect(
        movements.filter((movement) => movement.type === "RELEASE"),
      ).toEqual([
        {
          type: "RELEASE",
          amount: "10.00",
          bidId: first.accepted.id,
          walletId: first.walletId,
        },
      ]);
      expect(
        movements.filter((movement) => movement.type === "SETTLEMENT_DEBIT"),
      ).toEqual([
        {
          type: "SETTLEMENT_DEBIT",
          amount: "10.50",
          bidId: null,
          walletId: winnerWalletId,
        },
      ]);
      expect(
        movements.filter((movement) => movement.type === "SETTLEMENT_CREDIT"),
      ).toEqual([
        {
          type: "SETTLEMENT_CREDIT",
          amount: "10.50",
          bidId: null,
          walletId: opened.auctioneerWalletId,
        },
      ]);
      expect((await readReceipts(opened.lotId))[0]).toMatchObject({
        winningBidId: winning.id,
        winnerId,
        winnerParticipantNo: 2,
        finalAmount: "10.50",
        endedAt: endsAt,
      });
    });
  });

  describe("when a bid extended the lot", () => {
    it("settles at the extended end for the winning amount", async () => {
      const originalEndsAt = shift(clock, minute);
      const extendedEndsAt = shift(originalEndsAt, 2 * minute);
      const settleAt = shift(extendedEndsAt, hour);
      const opened = await openLot({ endsAt: originalEndsAt });
      const leader = await leadLot(opened.lotId, "10.00", clock);

      expect(leader.accepted.endsAt).toEqual(extendedEndsAt);
      expect(leader.accepted.extensionCount).toBe(1);

      const result = await settleFor(settleAt);
      const stored = await readLot(opened.lotId);
      const movements = await readMovements(opened.lotId);

      expect(forLot(result, opened.lotId)).toEqual([
        {
          lotId: opened.lotId,
          outcome: "settled",
          winnerId: leader.bidderId,
          endedAt: extendedEndsAt,
          settledAt: settleAt,
        },
      ]);
      expect(stored).toMatchObject({
        status: "ENDED",
        endsAt: extendedEndsAt,
        originalEndsAt,
        extensionCount: 1,
        winnerId: leader.bidderId,
        endedAt: extendedEndsAt,
        settledAt: settleAt,
      });
      expect(
        movements.filter((movement) => movement.type === "SETTLEMENT_DEBIT"),
      ).toEqual([
        {
          type: "SETTLEMENT_DEBIT",
          amount: "10.00",
          bidId: null,
          walletId: leader.walletId,
        },
      ]);
      expect((await readReceipts(opened.lotId))[0]).toMatchObject({
        winningBidId: leader.accepted.id,
        winnerParticipantNo: 1,
        finalAmount: "10.00",
        endedAt: extendedEndsAt,
      });
      expect(await readWallet(leader.bidderId)).toMatchObject({
        totalBalance: "90.00",
        committedBalance: "0.00",
        availableBalance: "90.00",
      });
    });
  });

  describe("when one due lot cannot settle", () => {
    it("keeps the settled sibling and leaves the broken lot active with its reserve", async () => {
      const settleAt = shift(clock, 3 * hour);
      const sound = await openLot({ endsAt: shift(clock, hour) });
      const broken = await openLot({ endsAt: shift(clock, 2 * hour) });
      const soundLeader = await leadLot(sound.lotId, "25.00", clock);
      const brokenLeader = await leadLot(broken.lotId, "15.00", clock);

      await db
        .update(lot)
        .set({ currentBidId: null })
        .where(eq(lot.id, broken.lotId));

      let failure: unknown;

      try {
        await settleFor(settleAt);
      } catch (error) {
        failure = error;
      }

      const soundMovements = await readMovements(sound.lotId);
      const brokenMovements = await readMovements(broken.lotId);

      expect(failure).toBeInstanceOf(AggregateError);
      expect(describeSettlementFailure(failure)).toContain(broken.lotId);
      expect(describeSettlementFailure(failure)).toContain("stay ACTIVE");
      expect(describeSettlementFailure(failure)).not.toContain(sound.lotId);
      expect(await readLot(sound.lotId)).toMatchObject({
        status: "ENDED",
        winnerId: soundLeader.bidderId,
        settledAt: settleAt,
      });
      expect(
        soundMovements.filter(
          (movement) => movement.type === "SETTLEMENT_DEBIT",
        ),
      ).toHaveLength(1);
      expect(await readReceipts(sound.lotId)).toHaveLength(1);
      expect(await readWallet(soundLeader.bidderId)).toMatchObject({
        totalBalance: "75.00",
        committedBalance: "0.00",
        availableBalance: "75.00",
      });
      expect(await readLot(broken.lotId)).toMatchObject({
        status: "ACTIVE",
        winnerId: null,
        endedAt: null,
        settledAt: null,
        currentBidId: null,
        bidCount: 1,
      });
      expect(brokenMovements).toEqual([
        {
          type: "HOLD",
          amount: "15.00",
          bidId: brokenLeader.accepted.id,
          walletId: brokenLeader.walletId,
        },
      ]);
      expect(await readReceipts(broken.lotId)).toEqual([]);
      expect(await readWallet(brokenLeader.bidderId)).toMatchObject({
        totalBalance: "100.00",
        committedBalance: "15.00",
        availableBalance: "85.00",
      });
    });
  });

  describe("when the winner reserve cannot be settled", () => {
    it("does not debit a winner whose winning hold was already released", async () => {
      const dueEndsAt = shift(clock, hour);
      const liveEndsAt = shift(clock, 5 * hour);
      const settleAt = shift(clock, 2 * hour);
      const dueLot = await openLot({
        endsAt: dueEndsAt,
        openingBid: "10.15",
      });
      const liveLot = await openLot({
        endsAt: liveEndsAt,
        openingBid: "20.40",
      });
      const bidderId = await insertUser("BIDDER");
      const walletId = await insertWallet(bidderId, "100.00");
      const dueBid = await placeFor(bidderId, dueLot.lotId, "10.15", clock);
      const liveBid = await placeFor(bidderId, liveLot.lotId, "20.40", clock);

      await db.insert(walletMovement).values({
        walletId,
        type: "RELEASE",
        amount: "10.15",
        lotId: dueLot.lotId,
        bidId: dueBid.id,
      });
      await db
        .update(wallet)
        .set({ committedBalance: "20.40" })
        .where(eq(wallet.id, walletId));

      let failure: unknown;

      try {
        await settleFor(settleAt);
      } catch (error) {
        failure = error;
      }

      expect(failure).toBeInstanceOf(AggregateError);
      expect(settlementError(failure, dueLot.lotId)?.cause).toMatchObject({
        message: "Open hold for the winning bid was not found",
      });
      expect(await readLot(dueLot.lotId)).toMatchObject({
        status: "ACTIVE",
        winnerId: null,
        settledAt: null,
        currentBidId: dueBid.id,
      });
      expect(await readLot(liveLot.lotId)).toMatchObject({
        status: "ACTIVE",
        currentBidId: liveBid.id,
        settledAt: null,
      });
      expect(
        (await readMovements(dueLot.lotId))
          .map((movement) => movement.type)
          .sort(),
      ).toEqual(["HOLD", "RELEASE"]);
      expect(await readMovements(liveLot.lotId)).toEqual([
        {
          type: "HOLD",
          amount: "20.40",
          bidId: liveBid.id,
          walletId,
        },
      ]);
      expect(await readReceipts(dueLot.lotId)).toEqual([]);
      expect(await readWallet(bidderId)).toMatchObject({
        totalBalance: "100.00",
        committedBalance: "20.40",
        availableBalance: "79.60",
      });
    });

    it("does not settle when the committed balance is below the winning bid", async () => {
      const endsAt = shift(clock, hour);
      const settleAt = shift(endsAt, hour);
      const opened = await openLot({ endsAt });
      const leader = await leadLot(opened.lotId, "25.00", clock);

      await db
        .update(wallet)
        .set({ committedBalance: "10.00" })
        .where(eq(wallet.id, leader.walletId));

      let failure: unknown;

      try {
        await settleFor(settleAt);
      } catch (error) {
        failure = error;
      }

      expect(failure).toBeInstanceOf(AggregateError);
      expect(settlementError(failure, opened.lotId)?.cause).toMatchObject({
        message: "Winner committed balance does not cover the winning bid",
      });
      expect(await readLot(opened.lotId)).toMatchObject({
        status: "ACTIVE",
        winnerId: null,
        settledAt: null,
        currentBidId: leader.accepted.id,
      });
      expect(await readMovements(opened.lotId)).toEqual([
        {
          type: "HOLD",
          amount: "25.00",
          bidId: leader.accepted.id,
          walletId: leader.walletId,
        },
      ]);
      expect(await readReceipts(opened.lotId)).toEqual([]);
      expect(await readWallet(leader.bidderId)).toMatchObject({
        totalBalance: "100.00",
        committedBalance: "10.00",
        availableBalance: "90.00",
      });
      expect(await readWallet(opened.auctioneerId)).toMatchObject({
        totalBalance: "0.00",
        committedBalance: "0.00",
        availableBalance: "0.00",
      });
    });
  });

  describe("when a financial write fails", () => {
    const injectedFailure = new Error("Injected settlement failure");
    const cases = [
      {
        stage: "winner debit",
        dependencies: {
          decreaseTotalAndCommittedBalance: async (...args) => {
            await decreaseTotalAndCommittedBalance(...args);
            throw injectedFailure;
          },
        },
      },
      {
        stage: "auctioneer credit",
        dependencies: {
          increaseTotalBalance: async (...args) => {
            await increaseTotalBalance(...args);
            throw injectedFailure;
          },
        },
      },
      {
        stage: "receipt insertion",
        dependencies: {
          insertReceipt: async (...args) => {
            await insertReceipt(...args);
            throw injectedFailure;
          },
        },
      },
      {
        stage: "lot closure",
        dependencies: {
          markLotEnded: async (...args) => {
            await markLotEnded(...args);
            throw injectedFailure;
          },
        },
      },
      {
        stage: "share token validation",
        dependencies: { createShareToken: () => "invalid-token" },
      },
    ] satisfies {
      stage: string;
      dependencies: Partial<SettleDueLotsDependencies>;
    }[];

    it.each(cases)(
      "rolls back $stage and publishes nothing, then permits a retry",
      async ({ stage, dependencies }) => {
        const opened = await openLot({ endsAt: shift(clock, hour) });
        const leader = await leadLot(opened.lotId, "25.00", clock);
        const messages: string[] = [];
        const leave = await joinPublicLotRoom(opened.lotId, (payload) =>
          messages.push(payload),
        );
        messages.length = 0;

        try {
          const result = await settle(
            settleDueLots({
              ...dependencies,
              now: () => shift(clock, 2 * hour),
            }),
          );
          expect(result.status).toBe("rejected");
          if (result.status !== "rejected") {
            throw new Error("Expected settlement failure");
          }
          expect(settlementError(result.error, opened.lotId)?.cause).toEqual(
            stage === "share token validation"
              ? new Error("Share token must be 32 bytes encoded as base64url")
              : injectedFailure,
          );
          expect(await readLot(opened.lotId)).toMatchObject({
            status: "ACTIVE",
            winnerId: null,
            endedAt: null,
            settledAt: null,
            currentBidId: leader.accepted.id,
          });
          expect(await readWallet(leader.bidderId)).toMatchObject({
            totalBalance: "100.00",
            committedBalance: "25.00",
            availableBalance: "75.00",
          });
          expect(await readWallet(opened.auctioneerId)).toMatchObject({
            totalBalance: "0.00",
            committedBalance: "0.00",
            availableBalance: "0.00",
          });
          expect(await readMovements(opened.lotId)).toEqual([
            {
              type: "HOLD",
              amount: "25.00",
              bidId: leader.accepted.id,
              walletId: leader.walletId,
            },
          ]);
          expect(await readReceipts(opened.lotId)).toEqual([]);
          expect(messages).toEqual([]);

          await settleFor(shift(clock, 2 * hour));
          await settleFor(shift(clock, 2 * hour));
          expect(await readLot(opened.lotId)).toMatchObject({
            status: "ENDED",
            winnerId: leader.bidderId,
          });
          expect(await readWallet(leader.bidderId)).toMatchObject({
            totalBalance: "75.00",
            committedBalance: "0.00",
          });
          expect(await readWallet(opened.auctioneerId)).toMatchObject({
            totalBalance: "25.00",
          });
          expect(
            (await readMovements(opened.lotId))
              .map((entry) => entry.type)
              .sort(),
          ).toEqual(["HOLD", "SETTLEMENT_CREDIT", "SETTLEMENT_DEBIT"]);
          expect(await readReceipts(opened.lotId)).toHaveLength(1);
          expect(messages).toHaveLength(1);
        } finally {
          leave();
        }
      },
    );
  });

  it("publishes the winning settlement only after the transaction commits", async () => {
    const opened = await openLot({ endsAt: shift(clock, hour) });
    const leader = await leadLot(opened.lotId, "25.00", clock);
    let committed = false;
    const deliveries: { committed: boolean; payload: string }[] = [];
    const leave = await joinPublicLotRoom(opened.lotId, (payload) => {
      deliveries.push({ committed, payload });
    });
    deliveries.length = 0;

    try {
      await settleDueLots({
        now: () => shift(clock, 2 * hour),
        runInTransaction: async (work) => {
          const result = await db.transaction(async (tx) => {
            const settlement = await work(tx);
            expect(deliveries).toEqual([]);
            // A separate connection still sees the pre-commit state.
            expect(await readLot(opened.lotId)).toMatchObject({
              status: "ACTIVE",
            });
            expect(await readWallet(leader.bidderId)).toMatchObject({
              totalBalance: "100.00",
              committedBalance: "25.00",
            });
            expect(await readReceipts(opened.lotId)).toEqual([]);
            return settlement;
          });
          expect(deliveries).toEqual([]);
          expect(await readLot(opened.lotId)).toMatchObject({
            status: "ENDED",
          });
          expect(await readWallet(leader.bidderId)).toMatchObject({
            totalBalance: "75.00",
            committedBalance: "0.00",
          });
          expect(await readWallet(opened.auctioneerId)).toMatchObject({
            totalBalance: "25.00",
          });
          expect(await readReceipts(opened.lotId)).toHaveLength(1);
          committed = true;
          return result;
        },
      });
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]?.committed).toBe(true);
      expect(JSON.parse(deliveries[0]!.payload).lot).toMatchObject({
        status: "ENDED",
        winnerParticipantNo: 1,
      });
    } finally {
      leave();
    }
  });

  describe("when winner validation fails", () => {
    const cases = [
      {
        reason: "missing bid",
        dependencies: {
          findBidById: async (executor) =>
            findBidById(executor, crypto.randomUUID()),
        },
        message: "Current bid was not found",
      },
      {
        reason: "missing participant",
        dependencies: {
          findLotParticipantByUserId: async (executor, lotId) =>
            findLotParticipantByUserId(executor, lotId, crypto.randomUUID()),
        },
        message: "Winner participant was not found",
      },
      {
        reason: "missing wallets",
        dependencies: { lockWalletsByUserIds: async () => [] },
        message: "Settlement wallet was not found",
      },
      {
        reason: "missing hold",
        dependencies: { findOpenHoldForBid: async () => null },
        message: "Open hold for the winning bid was not found",
      },
      {
        reason: "mismatched hold",
        dependencies: { findOpenHoldForBid: async () => ({ amount: "24.99" }) },
        message: "Open hold for the winning bid was not found",
      },
    ] satisfies {
      reason: string;
      dependencies: Partial<SettleDueLotsDependencies>;
      message: string;
    }[];

    it.each(cases)(
      "rejects $reason and preserves the reserve",
      async ({ dependencies, message }) => {
        const opened = await openLot({ endsAt: shift(clock, hour) });
        const leader = await leadLot(opened.lotId, "25.00", clock);
        const result = await settle(
          settleDueLots({ ...dependencies, now: () => shift(clock, 2 * hour) }),
        );

        expect(result.status).toBe("rejected");
        if (result.status !== "rejected") {
          throw new Error("Expected settlement failure");
        }
        expect(
          settlementError(result.error, opened.lotId)?.cause,
        ).toMatchObject({ message });
        expect(await readLot(opened.lotId)).toMatchObject({
          status: "ACTIVE",
          winnerId: null,
          endedAt: null,
          settledAt: null,
        });
        expect(await readWallet(leader.bidderId)).toMatchObject({
          totalBalance: "100.00",
          committedBalance: "25.00",
        });
        expect(await readWallet(opened.auctioneerId)).toMatchObject({
          totalBalance: "0.00",
        });
        expect(await readMovements(opened.lotId)).toEqual([
          {
            type: "HOLD",
            amount: "25.00",
            bidId: leader.accepted.id,
            walletId: leader.walletId,
          },
        ]);
        expect(await readReceipts(opened.lotId)).toEqual([]);
      },
    );
  });
});
