//* Libraries imports
import { describe, expect, it } from "vitest";

//* Local imports
import {
  showPublicReceiptParamsSchema,
  showPublicReceiptResponseSchema,
} from "./show-receipt";

describe("showPublicReceiptParamsSchema", () => {
  it("rejects a lot id and accepts a 32-byte base64url token", () => {
    const lotId = crypto.randomUUID();
    const shareToken = "a".repeat(43);

    expect(
      showPublicReceiptParamsSchema.safeParse({ shareToken: lotId }).success,
    ).toBe(false);
    expect(
      showPublicReceiptParamsSchema.safeParse({
        shareToken: `${"a".repeat(42)}+`,
      }).success,
    ).toBe(false);
    expect(
      showPublicReceiptParamsSchema.safeParse({ shareToken }).success,
    ).toBe(true);
  });
});

describe("showPublicReceiptResponseSchema", () => {
  it("drops winner id, winning bid id, share token, email, and name", () => {
    const endedAt = new Date("2026-10-26T14:45:00.000Z");
    const lotId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    const shareToken = "a".repeat(43);
    const parsed = showPublicReceiptResponseSchema.parse({
      email: "hidden@example.com",
      name: "Hidden Name",
      winnerId: "user-1",
      receipt: {
        lotId,
        title: "Blue-Eyes",
        description: null,
        endedAt,
        finalAmount: "12.50",
        winnerParticipantNo: 4,
        winnerId: "user-1",
        winningBidId: crypto.randomUUID(),
        shareToken,
        email: "hidden@example.com",
        name: "Hidden Name",
        headHash: "abc",
        items: [
          {
            id: itemId,
            position: 1,
            cardId: 1,
            quantity: 1,
            cardName: "Blue-Eyes",
            imagePath: "https://images.example/card.jpg",
            cardSnapshot: { id: 1, name: "Blue-Eyes" },
            email: "hidden@example.com",
            name: "Hidden Name",
            userId: "user-1",
          },
        ],
      },
    });

    expect(parsed).toEqual({
      receipt: {
        lotId,
        title: "Blue-Eyes",
        description: null,
        endedAt,
        finalAmount: "12.50",
        winnerParticipantNo: 4,
        items: [
          {
            id: itemId,
            position: 1,
            cardId: 1,
            quantity: 1,
            cardName: "Blue-Eyes",
            imagePath: "https://images.example/card.jpg",
            cardSnapshot: { id: 1, name: "Blue-Eyes" },
          },
        ],
      },
    });
    expect(JSON.stringify(parsed)).not.toContain(shareToken);
    expect(JSON.stringify(parsed)).not.toContain("hidden@example.com");
  });
});
