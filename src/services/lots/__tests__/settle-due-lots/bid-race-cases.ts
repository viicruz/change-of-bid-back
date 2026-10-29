//* Libraries imports
import { assert, describe, expect, it } from "vitest";

//* Models imports
import { lockLotForUpdate } from "../../../../models/lot";

//* Local imports
import { PlaceBidError, placeBid, type AcceptedBid } from "../../place-bid";
import { settleDueLots, type LotSettlement } from "../../settle-due-lots";
import {
  clock,
  forLot,
  hour,
  insertUser,
  insertWallet,
  leadLot,
  minute,
  openLot,
  placeFor,
  settle,
  settleFor,
  shift,
} from "./fixtures";
import { readBids, readLot, readMovements, readReceipts, readWallet } from "./reads";

type Race = Awaited<ReturnType<typeof prepareRace>>;

type BidResult = Awaited<ReturnType<typeof settle<AcceptedBid>>>;

type SettlementResult = Awaited<ReturnType<typeof settle<LotSettlement[]>>>;

type Balances = Pick<
  Awaited<ReturnType<typeof readWallet>>,
  "totalBalance" | "committedBalance" | "availableBalance"
>;

async function prepareRace() {
  const endsAt = shift(clock, 2 * hour);
  const bidAt = shift(endsAt, -1);
  const opened = await openLot({ endsAt });
  const leader = await leadLot(opened.lotId, "10.00", clock);
  const challengerId = await insertUser("BIDDER");
  const challengerWalletId = await insertWallet(challengerId, "100.00");

  return { opened, leader, challengerId, challengerWalletId, bidAt, endsAt };
}

function expectSettlementResult(
  race: Race,
  settlement: SettlementResult,
  expected: LotSettlement[],
) {
  assert(settlement.status === "fulfilled", "Settlement must succeed");
  expect(forLot(settlement.value, race.opened.lotId)).toEqual(expected);
}

async function expectBalances(
  race: Race,
  expected: { leader: Balances; challenger: Balances; auctioneer: Balances },
) {
  expect(await readWallet(race.leader.bidderId)).toMatchObject(
    expected.leader,
  );
  expect(await readWallet(race.challengerId)).toMatchObject(
    expected.challenger,
  );
  expect(await readWallet(race.opened.auctioneerId)).toMatchObject(
    expected.auctioneer,
  );
}

async function expectMovements(
  race: Race,
  expected: Awaited<ReturnType<typeof readMovements>>,
) {
  const movements = await readMovements(race.opened.lotId);
  expect(movements).toHaveLength(expected.length);
  expect(movements).toEqual(expect.arrayContaining(expected));
}

function initialHold({ leader }: Race) {
  return {
    type: "HOLD" as const,
    amount: "10.00",
    bidId: leader.accepted.id,
    walletId: leader.walletId,
  };
}

function initialBid({ leader }: Race) {
  return {
    id: leader.accepted.id,
    bidderId: leader.bidderId,
    amount: "10.00",
    sequence: 1,
  };
}

async function expectSettlementToWinRace(
  race: Race,
  bidResult: BidResult,
  settlement: SettlementResult,
) {
  const { opened, leader, endsAt } = race;
  assert(
    bidResult.status === "rejected",
    "Bid must be rejected after settlement",
  );
  expect(bidResult.error).toBeInstanceOf(PlaceBidError);
  expect(bidResult.error).toMatchObject({ code: "LOT_ENDED" });
  expectSettlementResult(race, settlement, [
    {
      lotId: opened.lotId,
      outcome: "settled",
      winnerId: leader.bidderId,
      endedAt: endsAt,
      settledAt: endsAt,
    },
  ]);
  expect(await readLot(opened.lotId)).toMatchObject({
    status: "ENDED",
    currentBidId: leader.accepted.id,
    bidCount: 1,
    endsAt,
    originalEndsAt: endsAt,
    extensionCount: 0,
    winnerId: leader.bidderId,
    endedAt: endsAt,
    settledAt: endsAt,
    canceledAt: null,
  });
  expect(await readBids(opened.lotId)).toEqual([initialBid(race)]);
  expect(await readReceipts(opened.lotId)).toEqual([
    expect.objectContaining({
      lotId: opened.lotId,
      winningBidId: leader.accepted.id,
      winnerId: leader.bidderId,
      winnerParticipantNo: leader.accepted.participantNo,
      finalAmount: "10.00",
      endedAt: endsAt,
    }),
  ]);
  await expectMovements(race, [
    initialHold(race),
    {
      type: "SETTLEMENT_DEBIT",
      amount: "10.00",
      bidId: null,
      walletId: leader.walletId,
    },
    {
      type: "SETTLEMENT_CREDIT",
      amount: "10.00",
      bidId: null,
      walletId: opened.auctioneerWalletId,
    },
  ]);
  await expectBalances(race, {
    leader: {
      totalBalance: "90.00",
      committedBalance: "0.00",
      availableBalance: "90.00",
    },
    challenger: {
      totalBalance: "100.00",
      committedBalance: "0.00",
      availableBalance: "100.00",
    },
    auctioneer: {
      totalBalance: "10.00",
      committedBalance: "0.00",
      availableBalance: "10.00",
    },
  });
}

async function expectBidToWinRace(
  race: Race,
  bidResult: BidResult,
  settlement: SettlementResult,
) {
  const { opened, leader, challengerId, challengerWalletId, endsAt } = race;
  const extendedEndsAt = shift(endsAt, 2 * minute);
  assert(
    bidResult.status === "fulfilled",
    "Bid must succeed before settlement",
  );
  const accepted = bidResult.value;
  expect(accepted).toMatchObject({
    sequence: 2,
    amount: "10.50",
    participantNo: 2,
    endsAt: extendedEndsAt,
    extensionCount: 1,
  });
  // The due scan can run before or after the bid commits, so it may omit
  // the extended lot or lock it and explicitly skip it. Neither may fail.
  assert(settlement.status === "fulfilled", "Settlement must succeed");
  const results = forLot(settlement.value, opened.lotId);
  expect([[], [{ lotId: opened.lotId, outcome: "skipped" }]]).toContainEqual(
    results,
  );
  expect(await readLot(opened.lotId)).toMatchObject({
    status: "ACTIVE",
    currentBidId: accepted.id,
    bidCount: 2,
    endsAt: extendedEndsAt,
    originalEndsAt: endsAt,
    extensionCount: 1,
    winnerId: null,
    settledAt: null,
    endedAt: null,
    canceledAt: null,
  });
  expect(await readBids(opened.lotId)).toEqual([
    initialBid(race),
    {
      id: accepted.id,
      bidderId: challengerId,
      amount: "10.50",
      sequence: 2,
    },
  ]);
  expect(await readReceipts(opened.lotId)).toEqual([]);
  await expectMovements(race, [
    initialHold(race),
    {
      type: "HOLD",
      amount: "10.50",
      bidId: accepted.id,
      walletId: challengerWalletId,
    },
    {
      type: "RELEASE",
      amount: "10.00",
      bidId: leader.accepted.id,
      walletId: leader.walletId,
    },
  ]);
  await expectBalances(race, {
    leader: {
      totalBalance: "100.00",
      committedBalance: "0.00",
      availableBalance: "100.00",
    },
    challenger: {
      totalBalance: "100.00",
      committedBalance: "10.50",
      availableBalance: "89.50",
    },
    auctioneer: {
      totalBalance: "0.00",
      committedBalance: "0.00",
      availableBalance: "0.00",
    },
  });
}

export function registerBidRaceCases() {
  describe("when a bid races settlement", () => {
    it("keeps a single valid outcome and accepts no bid on an ended lot", async () => {
      const race = await prepareRace();
      const [bidResult, settlement] = await Promise.all([
        settle(
          placeFor(race.challengerId, race.opened.lotId, "10.50", race.bidAt),
        ),
        settle(settleFor(race.endsAt)),
      ]);
      const stored = await readLot(race.opened.lotId);
      assert(stored, "Raced lot must still exist");

      if (stored.status === "ENDED") {
        await expectSettlementToWinRace(race, bidResult, settlement);
      } else {
        await expectBidToWinRace(race, bidResult, settlement);
      }
    });

    it("skips a due lot when the bid commits before settlement locks it", async () => {
      const race = await prepareRace();
      let bidResult: BidResult | undefined;
      const settlement = await settle(
        settleDueLots({
          now: () => race.endsAt,
          lockLotForUpdate: async (executor, lotId) => {
            expect(lotId).toBe(race.opened.lotId);
            // The real due scan has finished. Commit the bid on another
            // connection before settlement takes the row lock and revalidates.
            bidResult = await settle(
              placeFor(race.challengerId, lotId, "10.50", race.bidAt),
            );
            return lockLotForUpdate(executor, lotId);
          },
        }),
      );

      assert(bidResult, "Settlement must attempt to lock the scanned lot");
      expectSettlementResult(race, settlement, [
        { lotId: race.opened.lotId, outcome: "skipped" },
      ]);
      await expectBidToWinRace(race, bidResult, settlement);
    });

    it("rejects the pending bid when settlement commits before the bid locks the lot", async () => {
      const race = await prepareRace();
      let settlement: SettlementResult | undefined;
      const bidResult = await settle(
        placeBid(
          {
            lotId: race.opened.lotId,
            userId: race.challengerId,
            role: "BIDDER",
            amount: "10.50",
          },
          {
            now: () => race.bidAt,
            lockLotForUpdate: async (executor, lotId) => {
              expect(lotId).toBe(race.opened.lotId);
              // Even with a timestamp before endsAt, the pending bid must read
              // the settled state committed on another connection before locking.
              settlement = await settle(settleFor(race.endsAt));
              return lockLotForUpdate(executor, lotId);
            },
          },
        ),
      );

      assert(settlement, "Bid must attempt to lock the lot");
      await expectSettlementToWinRace(race, bidResult, settlement);
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
}
