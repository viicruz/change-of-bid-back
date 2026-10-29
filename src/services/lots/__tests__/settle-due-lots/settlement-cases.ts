//* Libraries imports
import { describe, expect, it } from "vitest";

//* Local imports
import {
  clock,
  forLot,
  hour,
  insertUser,
  insertWallet,
  leadLot,
  openLot,
  placeFor,
  settleFor,
  shift,
} from "./fixtures";
import { readLot, readMovements, readReceipts, readWallet } from "./reads";

export function registerWinningBidCases() {
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
}

export function registerNoBidCases() {
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
}

export function registerRepeatedSettlementCases() {
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
}

export function registerOverlappingSettlementCases() {
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
}
