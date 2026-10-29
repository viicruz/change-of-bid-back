//* Libraries imports
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

//* Local imports
import { db } from "../../../../db/index";
import { lot } from "../../../../db/schema";
import {
  cancelFor,
  clock,
  forLot,
  hour,
  leadLot,
  minute,
  openLot,
  settleFor,
  shift,
} from "./fixtures";
import { readLot, readMovements, readReceipts, readWallet } from "./reads";

export function registerCanceledLotCases() {
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
}

export function registerOpenLotCases() {
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
}

export function registerExtendedLotCases() {
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
}
