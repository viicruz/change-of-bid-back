//* Libraries imports
import { describe, expect, it } from "vitest";

//* Local imports
import {
  listAuctioneerLotsResponseSchema,
  listPublicLotsResponseSchema,
  publicLotListingItemLimit,
} from "./list-lots";

describe("listPublicLotsResponseSchema", () => {
  it("drops personal and internal fields", () => {
    const startsAt = new Date("2026-10-26T15:00:00.000Z");
    const endsAt = new Date("2026-10-26T17:00:00.000Z");
    const lotId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    const parsed = listPublicLotsResponseSchema.parse({
      lots: [
        {
          id: lotId,
          title: "Blue-Eyes",
          description: null,
          openingBid: "10.00",
          minIncrement: "1.00",
          startsAt,
          endsAt,
          status: "SCHEDULED",
          currentBid: null,
          bidCount: 0,
          sold: false,
          winnerId: "user-1",
          auctioneerId: "user-2",
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
          status: "SCHEDULED",
          currentBid: null,
          bidCount: 0,
          sold: false,
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

  it("rejects a lot with more than five items", () => {
    const startsAt = new Date("2026-10-26T15:00:00.000Z");
    const endsAt = new Date("2026-10-26T17:00:00.000Z");
    const items = Array.from(
      { length: publicLotListingItemLimit + 1 },
      (_, index) => ({
        id: crypto.randomUUID(),
        position: index + 1,
        cardId: index + 1,
        quantity: 1,
        cardName: `Card ${index + 1}`,
        imagePath: "https://images.example/card.jpg",
      }),
    );
    const parsed = listPublicLotsResponseSchema.safeParse({
      lots: [
        {
          id: crypto.randomUUID(),
          title: "Blue-Eyes",
          description: null,
          openingBid: "10.00",
          minIncrement: "1.00",
          startsAt,
          endsAt,
          status: "SCHEDULED",
          currentBid: null,
          bidCount: 0,
          sold: false,
          items,
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });
});

describe("listAuctioneerLotsResponseSchema", () => {
  it("drops personal and internal fields", () => {
    const startsAt = new Date("2026-10-26T15:00:00.000Z");
    const endsAt = new Date("2026-10-26T17:00:00.000Z");
    const lotId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    const parsed = listAuctioneerLotsResponseSchema.parse({
      totalReceived: "25.50",
      winnerName: "Hidden Name",
      email: "hidden@example.com",
      lots: [
        {
          id: lotId,
          title: "Blue-Eyes",
          description: null,
          openingBid: "10.00",
          minIncrement: "1.00",
          startsAt,
          endsAt,
          status: "CANCELED",
          currentBid: null,
          bidCount: 0,
          sold: false,
          receivedAmount: null,
          winnerId: "user-1",
          auctioneerId: "user-2",
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
            },
          ],
        },
      ],
    });

    expect(parsed).toEqual({
      totalReceived: "25.50",
      lots: [
        {
          id: lotId,
          title: "Blue-Eyes",
          description: null,
          openingBid: "10.00",
          minIncrement: "1.00",
          startsAt,
          endsAt,
          status: "CANCELED",
          currentBid: null,
          bidCount: 0,
          sold: false,
          receivedAmount: null,
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
