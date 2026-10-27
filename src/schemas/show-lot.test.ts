//* Libraries imports
import { describe, expect, it } from "vitest";

//* Local imports
import { showPublicLotResponseSchema } from "./show-lot";

describe("showPublicLotResponseSchema", () => {
  it("drops personal and internal fields", () => {
    const serverNow = new Date("2026-10-27T12:00:00.000Z");
    const startsAt = new Date("2026-10-27T13:00:00.000Z");
    const endsAt = new Date("2026-10-27T15:00:00.000Z");
    const createdAt = new Date("2026-10-27T13:05:00.000Z");
    const lotId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    const parsed = showPublicLotResponseSchema.parse({
      serverNow,
      viewerParticipantNo: 3,
      viewerId: "user-1",
      lot: {
        id: lotId,
        title: "Blue-Eyes",
        description: null,
        openingBid: "10.00",
        minIncrement: "1.00",
        startsAt,
        endsAt,
        extensionCount: 0,
        status: "SCHEDULED",
        currentBid: "12.00",
        leaderParticipantNo: 1,
        bidCount: 1,
        sold: false,
        winnerParticipantNo: null,
        winnerId: "user-1",
        auctioneerId: "user-2",
        email: "hidden@example.com",
        name: "Hidden Name",
        headHash: "abc",
        bidderId: "user-1",
        hash: "bid-hash",
        previousHash: "genesis",
        items: [
          {
            id: itemId,
            position: 1,
            cardId: 1,
            quantity: 1,
            cardName: "Blue-Eyes",
            imagePath: "https://images.example/card.jpg",
            cardSnapshot: { id: 1, name: "Blue-Eyes" },
            userId: "user-1",
          },
        ],
        bids: [
          {
            sequence: 1,
            amount: "12.00",
            createdAt,
            participantNo: 1,
            bidderId: "user-1",
            email: "hidden@example.com",
            hash: "bid-hash",
            previousHash: "genesis",
          },
        ],
      },
    });

    expect(parsed).toEqual({
      serverNow,
      viewerParticipantNo: 3,
      lot: {
        id: lotId,
        title: "Blue-Eyes",
        description: null,
        openingBid: "10.00",
        minIncrement: "1.00",
        startsAt,
        endsAt,
        extensionCount: 0,
        status: "SCHEDULED",
        currentBid: "12.00",
        leaderParticipantNo: 1,
        bidCount: 1,
        sold: false,
        winnerParticipantNo: null,
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
        bids: [
          {
            sequence: 1,
            amount: "12.00",
            createdAt,
            participantNo: 1,
          },
        ],
      },
    });
  });
});
