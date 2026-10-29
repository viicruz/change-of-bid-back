//* Libraries imports
import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

//* Local imports
import { db } from "../../../../db/index";
import { bid } from "../../../../db/schema";
import { insertAcceptedBid } from "./bids";
import {
  cancelFor,
  hoursFromNow,
  insertLot,
  insertUser,
  insertWallet,
} from "./fixtures";
import { readLot, readMovements, readWallet } from "./reads";

export function registerLeaderOfAnotherLotCases() {
  describe("when the leader also leads another lot", () => {
    it("releases only the reserve of the canceled lot", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const { walletId, canceledLotId, otherLotId, canceledBid, otherBid } =
        await insertLeaderOfTwoLots(auctioneerId);

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
}

// One bidder leads two lots: 25.10 on the lot to cancel and 15.05 on the other.
async function insertLeaderOfTwoLots(auctioneerId: string) {
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

  return { walletId, canceledLotId, otherLotId, canceledBid, otherBid };
}

export function registerOutbidBidderCases() {
  describe("when a previous bidder was already outbid", () => {
    it("releases only the current leader and leaves the previous bidder unchanged", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(auctioneerId, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
      });
      const { previousWalletId, leaderWalletId, previousBid, leadingBid } =
        await insertOutbidHistory(lotId);

      await cancelFor(auctioneerId, lotId);
      const previousWallet = await readWallet(previousWalletId);
      const leaderWallet = await readWallet(leaderWalletId);
      const movements = await readMovements(lotId);
      const stored = await readLot(lotId);
      const storedBids = await readBidIdsBySequence(lotId);

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
      expect(storedBids).toEqual([previousBid.bidId, leadingBid.bidId]);
    });
  });
}

// A released 10.00 bid from the previous bidder, then a leading 25.00 bid.
async function insertOutbidHistory(lotId: string) {
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

  return { previousWalletId, leaderWalletId, previousBid, leadingBid };
}

async function readBidIdsBySequence(lotId: string) {
  const rows = await db
    .select({ id: bid.id })
    .from(bid)
    .where(eq(bid.lotId, lotId))
    .orderBy(asc(bid.sequence));

  return rows.map((entry) => entry.id);
}
