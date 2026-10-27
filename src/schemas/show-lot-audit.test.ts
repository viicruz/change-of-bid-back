//* Libraries imports
import { describe, expect, it } from "vitest";

//* Local imports
import {
  showPublicLotAuditParamsSchema,
  showPublicLotAuditResponseSchema,
} from "./show-lot-audit";

describe("showPublicLotAuditParamsSchema", () => {
  it("accepts a uuid and rejects any other id", () => {
    expect(
      showPublicLotAuditParamsSchema.safeParse({ id: crypto.randomUUID() })
        .success,
    ).toBe(true);
    expect(
      showPublicLotAuditParamsSchema.safeParse({ id: "not-a-uuid" }).success,
    ).toBe(false);
  });
});

describe("showPublicLotAuditResponseSchema", () => {
  it("drops personal data and hash material", () => {
    const createdAt = new Date("2026-10-26T15:00:00.000Z");
    const lotId = crypto.randomUUID();
    const secret = "bid-hash-secret-value-at-least-32";
    const parsed = showPublicLotAuditResponseSchema.parse({
      email: "hidden@example.com",
      name: "Hidden Name",
      userId: "user-1",
      bidderId: "user-1",
      participantId: crypto.randomUUID(),
      previousHash: "previous-hash",
      hash: "bid-hash",
      headHash: "head-hash",
      BID_HASH_SECRET: secret,
      audit: {
        lotId,
        status: "INTACT",
        email: "hidden@example.com",
        name: "Hidden Name",
        userId: "user-1",
        bidderId: "user-1",
        headHash: "head-hash",
        previousHash: "previous-hash",
        hash: "bid-hash",
        bids: [
          {
            sequence: 1,
            amount: "10.00",
            createdAt,
            participantNo: 1,
            email: "hidden@example.com",
            name: "Hidden Name",
            userId: "user-1",
            bidderId: "user-1",
            participantId: crypto.randomUUID(),
            previousHash: "previous-hash",
            hash: "bid-hash",
            headHash: "head-hash",
          },
        ],
      },
    });

    expect(parsed).toEqual({
      audit: {
        lotId,
        status: "INTACT",
        bids: [
          {
            sequence: 1,
            amount: "10.00",
            createdAt,
            participantNo: 1,
          },
        ],
      },
    });
    expect(JSON.stringify(parsed)).not.toContain(secret);
    expect(JSON.stringify(parsed)).not.toContain("hidden@example.com");
    expect(JSON.stringify(parsed)).not.toContain("Hidden Name");
  });
});
