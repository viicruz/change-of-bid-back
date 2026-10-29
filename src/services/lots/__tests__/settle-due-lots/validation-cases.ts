//* Libraries imports
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

//* Local imports
import { db } from "../../../../db/index";
import { lot, wallet, walletMovement } from "../../../../db/schema";
import {
  describeSettlementFailure,
  settleDueLots,
  type SettleDueLotsDependencies,
} from "../../settle-due-lots";
import {
  clock,
  hour,
  insertUser,
  insertWallet,
  leadLot,
  openLot,
  placeFor,
  settle,
  settleFor,
  settlementError,
  shift,
} from "./fixtures";
import { readLot, readMovements, readReceipts, readWallet } from "./reads";

//* Models imports
import { findBidById } from "../../../../models/bid";
import { findLotParticipantByUserId } from "../../../../models/lot-participant";

export function registerBrokenSiblingCases() {
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
}

export function registerInvalidReserveCases() {
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
}

export function registerWinnerValidationCases() {
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
}
