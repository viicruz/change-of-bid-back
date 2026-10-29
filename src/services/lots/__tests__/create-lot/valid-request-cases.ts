//* Libraries imports
import { describe, expect, it } from "vitest";

//* Local imports
import { createLot } from "../../create-lot";
import {
  createDependencies,
  decodeTalker,
  lotInput,
  minimumLotDurationMs,
  now,
  tornadoDragon,
} from "./fixtures";

export function registerValidRequestCases() {
  describe("when the auctioneer and cards are valid", () => {
    registerItemCreationCases();
    registerStoredLotCases();
    registerMinimumDurationCases();
    registerMoneyCases();
    registerRepeatedCardCases();
  });
}

function registerItemCreationCases() {
  it("creates one item per card id in the request order", async () => {
    const dependencies = createDependencies([decodeTalker, tornadoDragon]);

    const result = await createLot(lotInput(), dependencies);

    expect(result.items.map((item) => item.cardId)).toEqual([10, 20]);
    expect(result.items.map((item) => item.position)).toEqual([1, 2]);
    expect(result.items.map((item) => item.quantity)).toEqual([1, 1]);
    expect(dependencies.findCardsByIds).toHaveBeenCalledWith(
      expect.anything(),
      [10, 20],
    );
  });

  it("freezes the card name, raw payload, and image path on each item", async () => {
    const dependencies = createDependencies([tornadoDragon, decodeTalker]);

    await createLot(lotInput({ cardIds: [10] }), dependencies);

    expect(dependencies.insertLotItems).toHaveBeenCalledWith(
      expect.anything(),
      [
        expect.objectContaining({
          position: 1,
          cardId: 10,
          quantity: 1,
          cardName: "Tornado Dragon",
          cardSnapshot: tornadoDragon.raw,
          imagePath: "/card-images/10.jpg",
        }),
      ],
    );
  });
}

function registerStoredLotCases() {
  it("stores an active lot for the auctioneer with one shared end instant", async () => {
    const dependencies = createDependencies([tornadoDragon]);
    const endsAt = new Date("2026-10-27T11:00:00.000Z");

    const result = await createLot(
      lotInput({
        cardIds: [10],
        endsAt,
      }),
      dependencies,
    );

    const values = dependencies.insertLot.mock.calls[0]?.[1];

    expect(values).not.toHaveProperty("status");
    expect(values?.auctioneerId).toBe("auctioneer-1");
    expect(values?.originalEndsAt).toBe(endsAt);
    expect(values?.endsAt).toBe(endsAt);
    expect(result.status).toBe("ACTIVE");
    expect(result.auctioneerId).toBe("auctioneer-1");
    expect(result.originalEndsAt).toBe(endsAt);
    expect(result.endsAt).toBe(endsAt);
  });
}

function registerMinimumDurationCases() {
  it("accepts a duration of exactly 1 minute when the start is in the past", async () => {
    const dependencies = createDependencies([tornadoDragon]);
    const startsAt = new Date(now.getTime() - minimumLotDurationMs / 2);
    const endsAt = new Date(startsAt.getTime() + minimumLotDurationMs);

    const result = await createLot(
      lotInput({
        cardIds: [10],
        startsAt,
        endsAt,
      }),
      dependencies,
    );

    expect(result.startsAt).toBe(startsAt);
    expect(result.endsAt).toBe(endsAt);
    expect(endsAt.getTime() - startsAt.getTime()).toBe(minimumLotDurationMs);
    expect(endsAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it("accepts a duration of exactly 1 minute when the start is in the future", async () => {
    const dependencies = createDependencies([tornadoDragon]);
    const startsAt = new Date("2026-10-26T13:00:00.000Z");
    const endsAt = new Date(startsAt.getTime() + minimumLotDurationMs);

    const result = await createLot(
      lotInput({
        cardIds: [10],
        startsAt,
        endsAt,
      }),
      dependencies,
    );

    expect(result.startsAt).toBe(startsAt);
    expect(result.endsAt).toBe(endsAt);
    expect(startsAt.getTime()).toBeGreaterThan(now.getTime());
  });
}

function registerMoneyCases() {
  it("normalizes money to two decimal places", async () => {
    const dependencies = createDependencies([tornadoDragon]);

    const result = await createLot(
      lotInput({
        cardIds: [10],
        openingBid: "10",
        minIncrement: "0.5",
      }),
      dependencies,
    );

    expect(result.openingBid).toBe("10.00");
    expect(result.minIncrement).toBe("0.50");
  });
}

function registerRepeatedCardCases() {
  it("creates a separate item for each repeated card id", async () => {
    const dependencies = createDependencies([tornadoDragon]);

    const result = await createLot(
      lotInput({ cardIds: [10, 10] }),
      dependencies,
    );

    expect(dependencies.findCardsByIds).toHaveBeenCalledWith(
      expect.anything(),
      [10],
    );
    expect(result.items).toEqual([
      expect.objectContaining({ position: 1, cardId: 10, quantity: 1 }),
      expect.objectContaining({ position: 2, cardId: 10, quantity: 1 }),
    ]);
  });
}
