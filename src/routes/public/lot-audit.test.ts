//* Libraries imports
import { asc, eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";

//* Local imports
import { app } from "../../app";
import { db } from "../../db/index";
import { bid, lot, lotParticipant } from "../../db/schema";
import { env } from "../../env";

import {
  createPublicLotAuditFixtures,
  expectTextOmitsPrivateAuditData,
} from "../../test/public-lot-audit-fixtures";

const {
  hoursFromNow,
  insertUser,
  insertBidder,
  insertLot,
  placeAcceptedBids,
  cleanup,
} = createPublicLotAuditFixtures("audit-route");

function requiredEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

const baseUrl = requiredEnv("BETTER_AUTH_URL", process.env.BETTER_AUTH_URL);

function request(path: string) {
  return new Request(`${baseUrl}${path}`, {
    method: "GET",
  });
}

async function readStoredSecrets(lotId: string) {
  const anchors = await db
    .select({
      headHash: lot.headHash,
    })
    .from(lot)
    .where(eq(lot.id, lotId));
  const rows = await db
    .select({
      id: bid.id,
      previousHash: bid.previousHash,
      hash: bid.hash,
      bidderId: bid.bidderId,
      participantId: lotParticipant.id,
    })
    .from(bid)
    .innerJoin(lotParticipant, eq(bid.participantId, lotParticipant.id))
    .where(eq(bid.lotId, lotId))
    .orderBy(asc(bid.sequence));
  const anchor = anchors[0];

  if (!anchor) {
    throw new Error("Lot was not found");
  }

  return {
    headHash: anchor.headHash,
    rows,
  };
}

describe("GET /public/lots/:id/audit", () => {
  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe("when the lot chain is intact", () => {
    it("returns only the public audit keys without a session", async () => {
      const auctioneer = await insertUser("AUCTIONEER", "Hidden Auctioneer");
      const firstBidder = await insertBidder("Hidden First Bidder");
      const secondBidder = await insertBidder("Hidden Second Bidder");
      const lotId = await insertLot(auctioneer.id, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
      });
      const accepted = await placeAcceptedBids(
        lotId,
        [firstBidder, secondBidder],
        2,
      );
      const stored = await readStoredSecrets(lotId);
      const response = await app.handle(
        request(`/public/lots/${lotId}/audit`),
      );
      const raw = await response.text();
      const body = JSON.parse(raw) as {
        audit?: {
          lotId?: string;
          status?: string;
          bids?: Array<Record<string, unknown>>;
        };
      };
      const audit = body.audit;

      expect(response.status).toBe(200);
      expect(Object.keys(body).sort()).toEqual(["audit"]);
      expect(Object.keys(audit ?? {}).sort()).toEqual([
        "bids",
        "lotId",
        "status",
      ]);
      expect(audit).toEqual({
        lotId,
        status: "INTACT",
        bids: accepted.map((entry) => ({
          sequence: entry.sequence,
          amount: entry.amount,
          createdAt: entry.createdAt.toISOString(),
          participantNo: entry.participantNo,
        })),
      });

      for (const entry of audit?.bids ?? []) {
        expect(Object.keys(entry).sort()).toEqual([
          "amount",
          "createdAt",
          "participantNo",
          "sequence",
        ]);
      }

      expectTextOmitsPrivateAuditData(raw, {
        accounts: [auctioneer, firstBidder, secondBidder],
        rows: stored.rows,
        headHash: stored.headHash,
        hashSecret: env.BID_HASH_SECRET,
      });
    });
  });

  describe("when the lot does not exist", () => {
    it("returns LOT_NOT_FOUND for an unknown uuid", async () => {
      const response = await app.handle(
        request(`/public/lots/${crypto.randomUUID()}/audit`),
      );
      const body = (await response.json()) as {
        code?: string;
        message?: string;
      };

      expect(response.status).toBe(404);
      expect(body).toEqual({
        code: "LOT_NOT_FOUND",
        message: "Lot was not found.",
      });
    });
  });

  describe("when the id is not a uuid", () => {
    it("rejects the request with the existing validation response", async () => {
      const response = await app.handle(
        request("/public/lots/not-a-uuid/audit"),
      );
      const body = (await response.json()) as { type?: string };

      expect(response.status).toBe(422);
      expect(body.type).toBe("validation");
    });
  });

  describe("when the bid chain is tampered", () => {
    it("returns tampered instead of an error", async () => {
      const auctioneer = await insertUser("AUCTIONEER", "Hidden Auctioneer");
      const bidder = await insertBidder("Hidden First Bidder");
      const lotId = await insertLot(auctioneer.id, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
      });
      const accepted = await placeAcceptedBids(lotId, [bidder], 1);
      const placed = accepted[0];

      if (placed === undefined) {
        throw new Error("Accepted bid was not stored");
      }

      await db.update(bid).set({ amount: "99.00" }).where(eq(bid.lotId, lotId));
      const stored = await readStoredSecrets(lotId);

      const response = await app.handle(
        request(`/public/lots/${lotId}/audit`),
      );
      const raw = await response.text();
      const body = JSON.parse(raw) as {
        code?: string;
        audit?: {
          lotId?: string;
          status?: string;
          bids?: Array<{
            sequence?: number;
            amount?: string;
            createdAt?: string;
            participantNo?: number;
          }>;
        };
      };

      expect(response.status).toBe(200);
      expect(body.code).toBeUndefined();
      expect(body.audit).toEqual({
        lotId,
        status: "TAMPERED",
        bids: [
          {
            sequence: placed.sequence,
            amount: "99.00",
            createdAt: placed.createdAt.toISOString(),
            participantNo: placed.participantNo,
          },
        ],
      });
      expectTextOmitsPrivateAuditData(raw, {
        accounts: [auctioneer, bidder],
        rows: stored.rows,
        headHash: stored.headHash,
        hashSecret: env.BID_HASH_SECRET,
      });
    });
  });
});
