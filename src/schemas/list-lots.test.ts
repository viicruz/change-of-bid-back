//* Libraries imports
import { describe, expect, it } from "vitest";

//* Local imports
import { listPublicLotsResponseSchema } from "./list-lots";

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
});
