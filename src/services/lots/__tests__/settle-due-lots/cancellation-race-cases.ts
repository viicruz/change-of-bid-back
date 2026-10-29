//* Libraries imports
import { describe, expect, it } from "vitest";

//* Local imports
import { CancelLotError } from "../../cancel-lot";
import {
  cancelFor,
  clock,
  hour,
  leadLot,
  openLot,
  settle,
  settleFor,
  shift,
} from "./fixtures";
import { readLot, readMovements, readReceipts, readWallet } from "./reads";

export function registerCancellationRaceCases() {
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
}
