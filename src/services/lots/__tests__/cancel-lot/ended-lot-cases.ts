//* Libraries imports
import { describe, expect, it } from "vitest";

//* Local imports
import { attachLeadingBid, insertLotWithLeader } from "./bids";
import { cancelFor, hoursFromNow, insertLot, insertUser, now } from "./fixtures";
import { expectLeaderReserveKept, readLot } from "./reads";

export function registerEndedLotCases() {
  describe("when the lot has ended", () => {
    registerEndedStatusCases();
    registerPassedEndCases();
  });
}

function registerEndedStatusCases() {
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

    expect(stored).toMatchObject({
      status: "ENDED",
      winnerId,
      canceledAt: null,
    });
    await expectLeaderReserveKept(lotId, leader, "25.00");
  });
}

function registerPassedEndCases() {
  it("rejects an active lot whose end has already passed", async () => {
    const { auctioneerId, lotId, leader } = await insertLotWithLeader(
      { startsAt: hoursFromNow(-48), endsAt: hoursFromNow(-1) },
      "25.00",
    );

    await expect(cancelFor(auctioneerId, lotId)).rejects.toMatchObject({
      code: "LOT_NOT_CANCELABLE",
    });

    const stored = await readLot(lotId);

    expect(stored).toMatchObject({
      status: "ACTIVE",
      canceledAt: null,
      currentBidId: leader.bidId,
    });
    await expectLeaderReserveKept(lotId, leader, "25.00");
  });

  it("rejects a lot that ends at the current instant and keeps the reserve", async () => {
    const { auctioneerId, lotId, leader } = await insertLotWithLeader(
      { startsAt: hoursFromNow(-1), endsAt: now },
      "25.00",
    );

    await expect(cancelFor(auctioneerId, lotId)).rejects.toMatchObject({
      code: "LOT_NOT_CANCELABLE",
    });

    const stored = await readLot(lotId);

    expect(stored).toMatchObject({
      status: "ACTIVE",
      canceledAt: null,
      currentBidId: leader.bidId,
    });
    await expectLeaderReserveKept(lotId, leader, "25.00");
  });
}
