//* Libraries imports
import { describe, expect, it } from "vitest";

//* Local imports
import {
  clock,
  hour,
  insertUser,
  insertWallet,
  leadLot,
  minute,
  openLot,
  placeFor,
  settleFor,
  shift,
} from "./fixtures";
import { readLot, readMovements, readReceipts, readWallet } from "./reads";

export function registerOtherLotReserveCases() {
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
}

export function registerWinningBidWithCentsCases() {
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
}

export function registerLaterWinningBidCases() {
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
}
