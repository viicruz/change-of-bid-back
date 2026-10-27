//* Libraries imports
import { describe, expect, it } from "vitest";

//* Local imports
import { listBidderParticipationsResponseSchema } from "./list-bidder-participations";

describe("listBidderParticipationsResponseSchema", () => {
  it("drops email, name, winnerId, and hash while keeping shareToken", () => {
    const startsAt = new Date("2026-10-26T15:00:00.000Z");
    const endsAt = new Date("2026-10-26T17:00:00.000Z");
    const lotId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    const shareToken = "a".repeat(43);
    const parsed = listBidderParticipationsResponseSchema.parse({
      email: "hidden@example.com",
      name: "Hidden Name",
      winnerId: "user-1",
      hash: "abc",
      lots: [
        {
          id: lotId,
          title: "Blue-Eyes",
          description: null,
          openingBid: "10.00",
          minIncrement: "1.00",
          startsAt,
          endsAt,
          status: "ENDED",
          currentBid: "12.00",
          bidCount: 1,
          participantNo: 2,
          won: true,
          email: "hidden@example.com",
          name: "Hidden Name",
          winnerId: "user-1",
          userId: "user-1",
          hash: "abc",
          headHash: "abc",
          token: "secret-token",
          shareToken,
          items: [
            {
              id: itemId,
              position: 1,
              cardId: 1,
              quantity: 1,
              cardName: "Blue-Eyes",
              imagePath: "https://images.example/card.jpg",
              email: "hidden@example.com",
              name: "Hidden Name",
            },
          ],
        },
      ],
    });

    expect(parsed).toEqual({
      lots: [
        {
          id: lotId,
          title: "Blue-Eyes",
          description: null,
          openingBid: "10.00",
          minIncrement: "1.00",
          startsAt,
          endsAt,
          status: "ENDED",
          currentBid: "12.00",
          bidCount: 1,
          participantNo: 2,
          won: true,
          shareToken,
          items: [
            {
              id: itemId,
              position: 1,
              cardId: 1,
              quantity: 1,
              cardName: "Blue-Eyes",
              imagePath: "https://images.example/card.jpg",
            },
          ],
        },
      ],
    });
  });
});
