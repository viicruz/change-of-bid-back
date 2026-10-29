//* Libraries imports
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

//* Local imports
import { db } from "../../../../db/index";
import { bid } from "../../../../db/schema";
import { insertLotWithLeader } from "./bids";
import { cancelFor, hoursFromNow, insertLot, insertUser, now } from "./fixtures";
import {
  expectLeaderReserveReleased,
  readLot,
  readMovements,
  readReleases,
  readWallet,
} from "./reads";

export function registerScheduledLotCases() {
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
}

export function registerLeadingBidCases() {
  describe("when the lot is live and has a leading bid", () => {
    it("releases the leader reserve once and keeps the bid history", async () => {
      const { auctioneerId, lotId, leader } = await insertLotWithLeader(
        { startsAt: hoursFromNow(-1), endsAt: hoursFromNow(2) },
        "25.00",
      );
      const bidsBefore = await db
        .select()
        .from(bid)
        .where(eq(bid.lotId, lotId));

      const canceled = await cancelFor(auctioneerId, lotId);
      const stored = await readLot(lotId);
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
      await expectLeaderReserveReleased(lotId, leader, "25.00");
      expect(bidsAfter).toEqual(bidsBefore);
    });
  });
}

export function registerRepeatedCancellationCases() {
  describe("when cancellation is repeated", () => {
    it("does not release the reserve again", async () => {
      const { auctioneerId, lotId, leader } = await insertLotWithLeader(
        { startsAt: hoursFromNow(-1), endsAt: hoursFromNow(2) },
        "25.00",
      );

      const first = await cancelFor(auctioneerId, lotId);
      const second = await cancelFor(auctioneerId, lotId);
      const leaderWallet = await readWallet(leader.walletId);
      const releases = await readReleases(lotId);

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
}

export function registerOneMillisecondBeforeEndCases() {
  describe("when the lot ends one millisecond later", () => {
    it("cancels the lot and releases the reserve", async () => {
      const { auctioneerId, lotId, leader } = await insertLotWithLeader(
        { startsAt: hoursFromNow(-1), endsAt: new Date(now.getTime() + 1) },
        "25.00",
      );

      const canceled = await cancelFor(auctioneerId, lotId);

      expect(canceled).toEqual({
        id: lotId,
        status: "CANCELED",
        canceledAt: now,
      });
      await expectLeaderReserveReleased(lotId, leader, "25.00");
    });
  });
}

export function registerLeadingBidWithCentsCases() {
  describe("when the leading bid has cents", () => {
    it("releases the exact reserved amount", async () => {
      const { auctioneerId, lotId, leader } = await insertLotWithLeader(
        { startsAt: hoursFromNow(-1), endsAt: hoursFromNow(2) },
        "10.50",
      );

      await cancelFor(auctioneerId, lotId);

      await expectLeaderReserveReleased(lotId, leader, "10.50");
    });
  });
}
