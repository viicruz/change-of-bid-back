//* Libraries imports
import { and, asc, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";

//* Models imports
import { lockLotForUpdate } from "../../models/lot";

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
import { cancelLot, CancelLotError } from "./cancel-lot";

const now = new Date("2026-10-26T15:00:00.000Z");
const createdUserIds: string[] = [];
const createdLotIds: string[] = [];

function hoursFromNow(hours: number) {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

function cancelFor(
  auctioneerId: string,
  lotId: string,
  role: "AUCTIONEER" | "BIDDER" = "AUCTIONEER",
) {
  return cancelLot(
    {
      lotId,
      auctioneerId,
      role,
    },
    { now: () => now },
  );
}

async function insertUser(role: "AUCTIONEER" | "BIDDER") {
  const id = crypto.randomUUID();

  await db.insert(user).values({
    id,
    name: "Cancel Tester",
    email: `cancel-${id}@example.com`,
    role,
  });
  createdUserIds.push(id);

  return id;
}

async function insertLot(
  auctioneerId: string,
  values: {
    startsAt: Date;
    endsAt: Date;
    status?: "ACTIVE" | "ENDED" | "CANCELED";
    winnerId?: string;
    canceledAt?: Date;
  },
) {
  const status = values.status ?? "ACTIVE";
  const rows = await db
    .insert(lot)
    .values({
      auctioneerId,
      title: "Cancelable lot",
      description: null,
      openingBid: "10.00",
      minIncrement: "1.00",
      startsAt: values.startsAt,
      originalEndsAt: values.endsAt,
      endsAt: values.endsAt,
      status,
      winnerId: values.winnerId ?? null,
      endedAt: status === "ENDED" ? values.endsAt : null,
      canceledAt: status === "CANCELED" ? (values.canceledAt ?? now) : null,
    })
    .returning({ id: lot.id });
  const row = rows[0];

  if (!row) {
    throw new Error("Insert lot did not return a row");
  }

  createdLotIds.push(row.id);

  return row.id;
}

async function attachLeadingBid(lotId: string, amount: string) {
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
      headHash: "hash-1",
    })
    .where(eq(lot.id, lotId));

  const wallets = await db
    .insert(wallet)
    .values({
      userId: bidderId,
      totalBalance: "100.00",
      committedBalance: amount,
    })
    .returning({ id: wallet.id });
  const leaderWallet = wallets[0];

  if (!leaderWallet) {
    throw new Error("Insert wallet did not return a row");
  }

  await db.insert(walletMovement).values({
    walletId: leaderWallet.id,
    type: "HOLD",
    amount,
    lotId,
    bidId: createdBid.id,
  });

  return {
    bidderId,
    bidId: createdBid.id,
    walletId: leaderWallet.id,
  };
}

async function insertWallet(
  userId: string,
  totalBalance: string,
  committedBalance: string,
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

async function insertAcceptedBid(
  lotId: string,
  values: {
    bidderId: string;
    walletId: string;
    amount: string;
    participantNo: number;
    sequence: number;
    released: boolean;
    leading: boolean;
  },
) {
  const participants = await db
    .insert(lotParticipant)
    .values({
      lotId,
      userId: values.bidderId,
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
      lotId,
      participantId: participant.id,
      bidderId: values.bidderId,
      sequence: values.sequence,
      amount: values.amount,
      previousHash: `genesis-${values.sequence}`,
      hash: `hash-${values.sequence}`,
      createdAt: new Date(now.getTime() + values.sequence * 1000),
    })
    .returning({ id: bid.id });
  const createdBid = bids[0];

  if (!createdBid) {
    throw new Error("Insert bid did not return a row");
  }

  if (values.leading) {
    await db
      .update(lot)
      .set({
        currentBidId: createdBid.id,
        bidCount: values.sequence,
        headHash: `hash-${values.sequence}`,
      })
      .where(eq(lot.id, lotId));
  }

  await db.insert(walletMovement).values({
    walletId: values.walletId,
    type: "HOLD",
    amount: values.amount,
    lotId,
    bidId: createdBid.id,
    createdAt: new Date(now.getTime() + values.sequence * 1000),
  });

  if (values.released) {
    await db.insert(walletMovement).values({
      walletId: values.walletId,
      type: "RELEASE",
      amount: values.amount,
      lotId,
      bidId: createdBid.id,
      createdAt: new Date(now.getTime() + values.sequence * 1000 + 1),
    });
  }

  return {
    bidId: createdBid.id,
  };
}

async function endDueLot(lotId: string, endedAt: Date) {
  return db.transaction(async (executor) => {
    const locked = await lockLotForUpdate(executor, lotId);

    if (
      locked === null ||
      locked.status !== "ACTIVE" ||
      locked.endsAt.getTime() > endedAt.getTime()
    ) {
      return "skipped" as const;
    }

    const rows = await executor
      .update(lot)
      .set({
        status: "ENDED",
        endedAt,
        settledAt: endedAt,
      })
      .where(and(eq(lot.id, lotId), eq(lot.status, "ACTIVE")))
      .returning({ id: lot.id });

    if (!rows[0]) {
      return "skipped" as const;
    }

    return "ended" as const;
  });
}

async function readLot(lotId: string) {
  const rows = await db
    .select({
      status: lot.status,
      canceledAt: lot.canceledAt,
      currentBidId: lot.currentBidId,
      bidCount: lot.bidCount,
      headHash: lot.headHash,
      winnerId: lot.winnerId,
      endsAt: lot.endsAt,
    })
    .from(lot)
    .where(eq(lot.id, lotId));

  return rows[0];
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

async function readMovements(lotId: string) {
  return db
    .select({
      type: walletMovement.type,
      amount: walletMovement.amount,
      bidId: walletMovement.bidId,
    })
    .from(walletMovement)
    .where(eq(walletMovement.lotId, lotId))
    .orderBy(asc(walletMovement.createdAt), asc(walletMovement.type));
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

describe("cancelLot", () => {
  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe("when the lot is scheduled and has no bids", () => {
    it("marks the lot as canceled without a wallet movement", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(auctioneerId, {
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(25),
      });

      const canceled = await cancelFor(auctioneerId, lotId);
      const stored = await readLot(lotId);
      const movements = await readMovements(lotId);

      expect(canceled).toEqual({
        id: lotId,
        status: "CANCELED",
        canceledAt: now,
      });
      expect(stored).toMatchObject({
        status: "CANCELED",
        canceledAt: now,
        currentBidId: null,
        bidCount: 0,
        headHash: null,
        winnerId: null,
      });
      expect(movements).toEqual([]);
    });
  });

  describe("when the lot is live and has a leading bid", () => {
    it("releases the leader reserve once and keeps the bid history", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(auctioneerId, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
      });
      const leader = await attachLeadingBid(lotId, "25.00");
      const bidsBefore = await db
        .select()
        .from(bid)
        .where(eq(bid.lotId, lotId));

      const canceled = await cancelFor(auctioneerId, lotId);
      const stored = await readLot(lotId);
      const leaderWallet = await readWallet(leader.walletId);
      const movements = await readMovements(lotId);
      const bidsAfter = await db
        .select()
        .from(bid)
        .where(eq(bid.lotId, lotId));

      expect(canceled.status).toBe("CANCELED");
      expect(canceled.canceledAt).toEqual(now);
      expect(stored).toMatchObject({
        status: "CANCELED",
        currentBidId: leader.bidId,
        bidCount: 1,
        headHash: "hash-1",
        winnerId: null,
      });
      expect(leaderWallet).toEqual({
        totalBalance: "100.00",
        committedBalance: "0.00",
      });
      expect(movements).toEqual([
        { type: "HOLD", amount: "25.00", bidId: leader.bidId },
        { type: "RELEASE", amount: "25.00", bidId: leader.bidId },
      ]);
      expect(bidsAfter).toEqual(bidsBefore);
    });
  });

  describe("when cancellation is repeated", () => {
    it("does not release the reserve again", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(auctioneerId, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
      });
      const leader = await attachLeadingBid(lotId, "25.00");

      const first = await cancelFor(auctioneerId, lotId);
      const second = await cancelFor(auctioneerId, lotId);
      const leaderWallet = await readWallet(leader.walletId);
      const releases = (await readMovements(lotId)).filter(
        (movement) => movement.type === "RELEASE",
      );

      expect(second).toEqual(first);
      expect(leaderWallet).toEqual({
        totalBalance: "100.00",
        committedBalance: "0.00",
      });
      expect(releases).toEqual([
        { type: "RELEASE", amount: "25.00", bidId: leader.bidId },
      ]);
    });
  });

  describe("when the caller is not an auctioneer", () => {
    it("rejects the request", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(auctioneerId, {
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(25),
      });

      await expect(cancelFor(auctioneerId, lotId, "BIDDER")).rejects.toBeInstanceOf(
        CancelLotError,
      );
      await expect(cancelFor(auctioneerId, lotId, "BIDDER")).rejects.toMatchObject({
        code: "NOT_AUCTIONEER",
      });

      const stored = await readLot(lotId);

      expect(stored?.status).toBe("ACTIVE");
    });

    it("leaves the leader reserve untouched", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(auctioneerId, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
      });
      const leader = await attachLeadingBid(lotId, "25.00");

      await expect(cancelFor(auctioneerId, lotId, "BIDDER")).rejects.toMatchObject({
        code: "NOT_AUCTIONEER",
      });

      const stored = await readLot(lotId);
      const leaderWallet = await readWallet(leader.walletId);
      const movements = await readMovements(lotId);

      expect(stored?.status).toBe("ACTIVE");
      expect(leaderWallet).toEqual({
        totalBalance: "100.00",
        committedBalance: "25.00",
      });
      expect(movements).toEqual([
        { type: "HOLD", amount: "25.00", bidId: leader.bidId },
      ]);
    });
  });

  describe("when the lot belongs to another auctioneer", () => {
    it("rejects the request", async () => {
      const ownerId = await insertUser("AUCTIONEER");
      const otherId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(ownerId, {
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(25),
      });

      await expect(cancelFor(otherId, lotId)).rejects.toMatchObject({
        code: "LOT_NOT_OWNED",
      });

      const stored = await readLot(lotId);

      expect(stored?.status).toBe("ACTIVE");
    });

    it("leaves the leader reserve untouched", async () => {
      const ownerId = await insertUser("AUCTIONEER");
      const otherId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(ownerId, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
      });
      const leader = await attachLeadingBid(lotId, "25.00");

      await expect(cancelFor(otherId, lotId)).rejects.toMatchObject({
        code: "LOT_NOT_OWNED",
      });

      const stored = await readLot(lotId);
      const leaderWallet = await readWallet(leader.walletId);
      const movements = await readMovements(lotId);

      expect(stored?.status).toBe("ACTIVE");
      expect(leaderWallet).toEqual({
        totalBalance: "100.00",
        committedBalance: "25.00",
      });
      expect(movements).toEqual([
        { type: "HOLD", amount: "25.00", bidId: leader.bidId },
      ]);
    });
  });

  describe("when the lot does not exist", () => {
    it("rejects the request", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");

      await expect(
        cancelFor(auctioneerId, crypto.randomUUID()),
      ).rejects.toMatchObject({
        code: "LOT_NOT_FOUND",
      });
    });
  });

  describe("when the lot has ended", () => {
    it("rejects an ended lot without changing the wallet", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const winnerId = await insertUser("BIDDER");
      const lotId = await insertLot(auctioneerId, {
        startsAt: hoursFromNow(-48),
        endsAt: hoursFromNow(-1),
        status: "ENDED",
        winnerId,
      });
      const leader = await attachLeadingBid(lotId, "25.00");

      await expect(cancelFor(auctioneerId, lotId)).rejects.toMatchObject({
        code: "LOT_NOT_CANCELABLE",
      });

      const stored = await readLot(lotId);
      const leaderWallet = await readWallet(leader.walletId);
      const movements = await readMovements(lotId);

      expect(stored).toMatchObject({
        status: "ENDED",
        winnerId,
        canceledAt: null,
      });
      expect(leaderWallet).toEqual({
        totalBalance: "100.00",
        committedBalance: "25.00",
      });
      expect(movements).toEqual([
        { type: "HOLD", amount: "25.00", bidId: leader.bidId },
      ]);
    });

    it("rejects an active lot whose end has already passed", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(auctioneerId, {
        startsAt: hoursFromNow(-48),
        endsAt: hoursFromNow(-1),
      });
      const leader = await attachLeadingBid(lotId, "25.00");

      await expect(cancelFor(auctioneerId, lotId)).rejects.toMatchObject({
        code: "LOT_NOT_CANCELABLE",
      });

      const stored = await readLot(lotId);
      const leaderWallet = await readWallet(leader.walletId);
      const movements = await readMovements(lotId);

      expect(stored).toMatchObject({
        status: "ACTIVE",
        canceledAt: null,
        currentBidId: leader.bidId,
      });
      expect(leaderWallet).toEqual({
        totalBalance: "100.00",
        committedBalance: "25.00",
      });
      expect(movements).toEqual([
        { type: "HOLD", amount: "25.00", bidId: leader.bidId },
      ]);
    });

    it("rejects a lot that ends at the current instant and keeps the reserve", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(auctioneerId, {
        startsAt: hoursFromNow(-1),
        endsAt: now,
      });
      const leader = await attachLeadingBid(lotId, "25.00");

      await expect(cancelFor(auctioneerId, lotId)).rejects.toMatchObject({
        code: "LOT_NOT_CANCELABLE",
      });

      const stored = await readLot(lotId);
      const leaderWallet = await readWallet(leader.walletId);
      const movements = await readMovements(lotId);

      expect(stored).toMatchObject({
        status: "ACTIVE",
        canceledAt: null,
        currentBidId: leader.bidId,
      });
      expect(leaderWallet).toEqual({
        totalBalance: "100.00",
        committedBalance: "25.00",
      });
      expect(movements).toEqual([
        { type: "HOLD", amount: "25.00", bidId: leader.bidId },
      ]);
    });
  });

  describe("when the lot ends one millisecond later", () => {
    it("cancels the lot and releases the reserve", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(auctioneerId, {
        startsAt: hoursFromNow(-1),
        endsAt: new Date(now.getTime() + 1),
      });
      const leader = await attachLeadingBid(lotId, "25.00");

      const canceled = await cancelFor(auctioneerId, lotId);
      const leaderWallet = await readWallet(leader.walletId);
      const movements = await readMovements(lotId);

      expect(canceled).toEqual({
        id: lotId,
        status: "CANCELED",
        canceledAt: now,
      });
      expect(leaderWallet).toEqual({
        totalBalance: "100.00",
        committedBalance: "0.00",
      });
      expect(movements).toEqual([
        { type: "HOLD", amount: "25.00", bidId: leader.bidId },
        { type: "RELEASE", amount: "25.00", bidId: leader.bidId },
      ]);
    });
  });

  describe("when the leading bid has cents", () => {
    it("releases the exact reserved amount", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(auctioneerId, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
      });
      const leader = await attachLeadingBid(lotId, "10.50");

      await cancelFor(auctioneerId, lotId);
      const leaderWallet = await readWallet(leader.walletId);
      const movements = await readMovements(lotId);

      expect(leaderWallet).toEqual({
        totalBalance: "100.00",
        committedBalance: "0.00",
      });
      expect(movements).toEqual([
        { type: "HOLD", amount: "10.50", bidId: leader.bidId },
        { type: "RELEASE", amount: "10.50", bidId: leader.bidId },
      ]);
    });
  });

  describe("when the leader also leads another lot", () => {
    it("releases only the reserve of the canceled lot", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const bidderId = await insertUser("BIDDER");
      const walletId = await insertWallet(bidderId, "100.00", "40.15");
      const canceledLotId = await insertLot(auctioneerId, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
      });
      const otherLotId = await insertLot(auctioneerId, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(3),
      });
      const canceledBid = await insertAcceptedBid(canceledLotId, {
        bidderId,
        walletId,
        amount: "25.10",
        participantNo: 1,
        sequence: 1,
        released: false,
        leading: true,
      });
      const otherBid = await insertAcceptedBid(otherLotId, {
        bidderId,
        walletId,
        amount: "15.05",
        participantNo: 1,
        sequence: 1,
        released: false,
        leading: true,
      });

      await cancelFor(auctioneerId, canceledLotId);
      const leaderWallet = await readWallet(walletId);
      const canceledMovements = await readMovements(canceledLotId);
      const otherMovements = await readMovements(otherLotId);
      const otherLot = await readLot(otherLotId);

      expect(leaderWallet).toEqual({
        totalBalance: "100.00",
        committedBalance: "15.05",
      });
      expect(canceledMovements).toEqual([
        { type: "HOLD", amount: "25.10", bidId: canceledBid.bidId },
        { type: "RELEASE", amount: "25.10", bidId: canceledBid.bidId },
      ]);
      expect(otherMovements).toEqual([
        { type: "HOLD", amount: "15.05", bidId: otherBid.bidId },
      ]);
      expect(otherLot).toMatchObject({
        status: "ACTIVE",
        canceledAt: null,
        currentBidId: otherBid.bidId,
      });
    });
  });

  describe("when a previous bidder was already outbid", () => {
    it("releases only the current leader and leaves the previous bidder unchanged", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(auctioneerId, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
      });
      const previousBidderId = await insertUser("BIDDER");
      const leaderId = await insertUser("BIDDER");
      const previousWalletId = await insertWallet(previousBidderId, "80.00", "0.00");
      const leaderWalletId = await insertWallet(leaderId, "100.00", "25.00");
      const previousBid = await insertAcceptedBid(lotId, {
        bidderId: previousBidderId,
        walletId: previousWalletId,
        amount: "10.00",
        participantNo: 1,
        sequence: 1,
        released: true,
        leading: false,
      });
      const leadingBid = await insertAcceptedBid(lotId, {
        bidderId: leaderId,
        walletId: leaderWalletId,
        amount: "25.00",
        participantNo: 2,
        sequence: 2,
        released: false,
        leading: true,
      });

      await cancelFor(auctioneerId, lotId);
      const previousWallet = await readWallet(previousWalletId);
      const leaderWallet = await readWallet(leaderWalletId);
      const movements = await readMovements(lotId);
      const stored = await readLot(lotId);
      const storedBids = await db
        .select({ id: bid.id })
        .from(bid)
        .where(eq(bid.lotId, lotId))
        .orderBy(asc(bid.sequence));

      expect(previousWallet).toEqual({
        totalBalance: "80.00",
        committedBalance: "0.00",
      });
      expect(leaderWallet).toEqual({
        totalBalance: "100.00",
        committedBalance: "0.00",
      });
      expect(movements).toEqual([
        { type: "HOLD", amount: "10.00", bidId: previousBid.bidId },
        { type: "RELEASE", amount: "10.00", bidId: previousBid.bidId },
        { type: "HOLD", amount: "25.00", bidId: leadingBid.bidId },
        { type: "RELEASE", amount: "25.00", bidId: leadingBid.bidId },
      ]);
      expect(stored).toMatchObject({
        status: "CANCELED",
        currentBidId: leadingBid.bidId,
        bidCount: 2,
        headHash: "hash-2",
        winnerId: null,
      });
      expect(storedBids.map((entry) => entry.id)).toEqual([
        previousBid.bidId,
        leadingBid.bidId,
      ]);
    });
  });

  describe("when two cancellations run at the same time", () => {
    it("releases the reserve once", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(auctioneerId, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
      });
      const leader = await attachLeadingBid(lotId, "25.00");

      const [first, second] = await Promise.all([
        cancelFor(auctioneerId, lotId),
        cancelFor(auctioneerId, lotId),
      ]);
      const leaderWallet = await readWallet(leader.walletId);
      const releases = (await readMovements(lotId)).filter(
        (movement) => movement.type === "RELEASE",
      );

      expect(second).toEqual(first);
      expect(first).toMatchObject({
        id: lotId,
        status: "CANCELED",
      });
      expect(leaderWallet).toEqual({
        totalBalance: "100.00",
        committedBalance: "0.00",
      });
      expect(releases).toEqual([
        { type: "RELEASE", amount: "25.00", bidId: leader.bidId },
      ]);
    });
  });

  describe("when cancellation races the ending of the same lot", () => {
    it("cancels a live lot and leaves it canceled", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(auctioneerId, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
      });
      const leader = await attachLeadingBid(lotId, "25.00");

      const [ending, canceled] = await Promise.all([
        endDueLot(lotId, now),
        cancelFor(auctioneerId, lotId),
      ]);
      const stored = await readLot(lotId);
      const leaderWallet = await readWallet(leader.walletId);
      const releases = (await readMovements(lotId)).filter(
        (movement) => movement.type === "RELEASE",
      );

      expect(ending).toBe("skipped");
      expect(canceled).toMatchObject({
        id: lotId,
        status: "CANCELED",
      });
      expect(stored).toMatchObject({
        status: "CANCELED",
        winnerId: null,
        currentBidId: leader.bidId,
      });
      expect(leaderWallet).toEqual({
        totalBalance: "100.00",
        committedBalance: "0.00",
      });
      expect(releases).toEqual([
        { type: "RELEASE", amount: "25.00", bidId: leader.bidId },
      ]);
    });

    it("keeps the reserve when the lot is already due", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(auctioneerId, {
        startsAt: hoursFromNow(-48),
        endsAt: hoursFromNow(-1),
      });
      const leader = await attachLeadingBid(lotId, "25.00");
      const cancellation = cancelFor(auctioneerId, lotId).then(
        (value) => ({ status: "fulfilled" as const, value }),
        (error: unknown) => ({ status: "rejected" as const, error }),
      );

      const [ending, result] = await Promise.all([
        endDueLot(lotId, now),
        cancellation,
      ]);
      const stored = await readLot(lotId);
      const leaderWallet = await readWallet(leader.walletId);
      const movements = await readMovements(lotId);

      expect(ending).toBe("ended");
      expect(result.status).toBe("rejected");

      if (result.status === "rejected") {
        expect(result.error).toMatchObject({
          code: "LOT_NOT_CANCELABLE",
        });
      }

      expect(stored).toMatchObject({
        status: "ENDED",
        canceledAt: null,
        currentBidId: leader.bidId,
        winnerId: null,
      });
      expect(leaderWallet).toEqual({
        totalBalance: "100.00",
        committedBalance: "25.00",
      });
      expect(movements).toEqual([
        { type: "HOLD", amount: "25.00", bidId: leader.bidId },
      ]);
    });
  });
});
