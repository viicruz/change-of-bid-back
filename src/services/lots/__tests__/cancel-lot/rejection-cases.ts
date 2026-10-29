//* Libraries imports
import { describe, expect, it } from "vitest";

//* Local imports
import { CancelLotError } from "../../cancel-lot";
import { attachLeadingBid, insertLotWithLeader } from "./bids";
import { cancelFor, hoursFromNow, insertLot, insertUser } from "./fixtures";
import { expectLeaderReserveKept, readLot } from "./reads";

export function registerNonAuctioneerCases() {
  describe("when the caller is not an auctioneer", () => {
    it("rejects the request", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(auctioneerId, {
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(25),
      });

      await expect(cancelFor(auctioneerId, lotId, "BIDDER")).rejects.toBeInstanceOf(
        CancelLotError,
      );
      await expect(cancelFor(auctioneerId, lotId, "BIDDER")).rejects.toMatchObject({
        code: "NOT_AUCTIONEER",
      });

      const stored = await readLot(lotId);

      expect(stored?.status).toBe("ACTIVE");
    });

    it("leaves the leader reserve untouched", async () => {
      const { auctioneerId, lotId, leader } = await insertLotWithLeader(
        { startsAt: hoursFromNow(-1), endsAt: hoursFromNow(2) },
        "25.00",
      );

      await expect(cancelFor(auctioneerId, lotId, "BIDDER")).rejects.toMatchObject({
        code: "NOT_AUCTIONEER",
      });

      const stored = await readLot(lotId);

      expect(stored?.status).toBe("ACTIVE");
      await expectLeaderReserveKept(lotId, leader, "25.00");
    });
  });
}

export function registerForeignLotCases() {
  describe("when the lot belongs to another auctioneer", () => {
    it("rejects the request", async () => {
      const ownerId = await insertUser("AUCTIONEER");
      const otherId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(ownerId, {
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(25),
      });

      await expect(cancelFor(otherId, lotId)).rejects.toMatchObject({
        code: "LOT_NOT_OWNED",
      });

      const stored = await readLot(lotId);

      expect(stored?.status).toBe("ACTIVE");
    });

    it("leaves the leader reserve untouched", async () => {
      const ownerId = await insertUser("AUCTIONEER");
      const otherId = await insertUser("AUCTIONEER");
      const lotId = await insertLot(ownerId, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
      });
      const leader = await attachLeadingBid(lotId, "25.00");

      await expect(cancelFor(otherId, lotId)).rejects.toMatchObject({
        code: "LOT_NOT_OWNED",
      });

      const stored = await readLot(lotId);

      expect(stored?.status).toBe("ACTIVE");
      await expectLeaderReserveKept(lotId, leader, "25.00");
    });
  });
}

export function registerMissingLotCases() {
  describe("when the lot does not exist", () => {
    it("rejects the request", async () => {
      const auctioneerId = await insertUser("AUCTIONEER");

      await expect(
        cancelFor(auctioneerId, crypto.randomUUID()),
      ).rejects.toMatchObject({
        code: "LOT_NOT_FOUND",
      });
    });
  });
}
