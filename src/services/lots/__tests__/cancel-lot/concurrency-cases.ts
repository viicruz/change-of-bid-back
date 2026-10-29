//* Libraries imports
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

//* Models imports
import { lockLotForUpdate } from "../../../../models/lot";

//* Local imports
import { db } from "../../../../db/index";
import { lot } from "../../../../db/schema";
import { insertLotWithLeader } from "./bids";
import { cancelFor, hoursFromNow, now } from "./fixtures";
import {
  expectLeaderReserveKept,
  readLot,
  readReleases,
  readWallet,
} from "./reads";

export function registerConcurrentCancellationCases() {
  describe("when two cancellations run at the same time", () => {
    it("releases the reserve once", async () => {
      const { auctioneerId, lotId, leader } = await insertLotWithLeader(
        { startsAt: hoursFromNow(-1), endsAt: hoursFromNow(2) },
        "25.00",
      );

      const [first, second] = await Promise.all([
        cancelFor(auctioneerId, lotId),
        cancelFor(auctioneerId, lotId),
      ]);
      const leaderWallet = await readWallet(leader.walletId);
      const releases = await readReleases(lotId);

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
}

export function registerEndingRaceCases() {
  describe("when cancellation races the ending of the same lot", () => {
    registerLiveLotRaceCases();
    registerDueLotRaceCases();
  });
}

function registerLiveLotRaceCases() {
  it("cancels a live lot and leaves it canceled", async () => {
    const { auctioneerId, lotId, leader } = await insertLotWithLeader(
      { startsAt: hoursFromNow(-1), endsAt: hoursFromNow(2) },
      "25.00",
    );

    const [ending, canceled] = await Promise.all([
      endDueLot(lotId, now),
      cancelFor(auctioneerId, lotId),
    ]);
    const stored = await readLot(lotId);
    const leaderWallet = await readWallet(leader.walletId);
    const releases = await readReleases(lotId);

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
}

function registerDueLotRaceCases() {
  it("keeps the reserve when the lot is already due", async () => {
    const { auctioneerId, lotId, leader } = await insertLotWithLeader(
      { startsAt: hoursFromNow(-48), endsAt: hoursFromNow(-1) },
      "25.00",
    );
    const cancellation = cancelFor(auctioneerId, lotId).then(
      (value) => ({ status: "fulfilled" as const, value }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    );

    const [ending, result] = await Promise.all([
      endDueLot(lotId, now),
      cancellation,
    ]);
    const stored = await readLot(lotId);

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
    await expectLeaderReserveKept(lotId, leader, "25.00");
  });
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
