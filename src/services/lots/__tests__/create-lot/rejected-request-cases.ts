//* Libraries imports
import { describe, expect, it } from "vitest";

//* Local imports
import { createLot, CreateLotError } from "../../create-lot";
import {
  catalogCard,
  createDependencies,
  lotInput,
  minimumLotDurationMs,
  now,
  tornadoDragon,
} from "./fixtures";

export function registerRejectedRequestCases() {
  describe("when the request is rejected", () => {
    registerCallerRejectionCases();
    registerCatalogRejectionCases();
    registerDurationRejectionCases();
    registerPastEndRejectionCases();
  });
}

function registerCallerRejectionCases() {
  it("does not insert a lot when the caller is not an auctioneer", async () => {
    const dependencies = createDependencies([tornadoDragon]);

    const creation = createLot(
      lotInput({ role: "BIDDER", cardIds: [10] }),
      dependencies,
    );

    await expect(creation).rejects.toMatchObject({
      code: "NOT_AUCTIONEER",
    });
    await expect(creation).rejects.toBeInstanceOf(CreateLotError);
    expect(dependencies.insertLot).not.toHaveBeenCalled();
    expect(dependencies.findCardsByIds).not.toHaveBeenCalled();
  });
}

function registerCatalogRejectionCases() {
  it("does not insert a lot when a card id is missing", async () => {
    const dependencies = createDependencies([tornadoDragon]);

    const creation = createLot(
      lotInput({ cardIds: [10, 30] }),
      dependencies,
    );

    await expect(creation).rejects.toMatchObject({
      code: "UNKNOWN_CARDS",
      cardIds: [30],
    });
    expect(dependencies.insertLot).not.toHaveBeenCalled();
  });

  it("does not insert a lot when a card has no image", async () => {
    const dependencies = createDependencies([
      catalogCard({
        id: 10,
        name: "Tornado Dragon",
        imagePath: null,
      }),
    ]);

    const creation = createLot(lotInput({ cardIds: [10] }), dependencies);

    await expect(creation).rejects.toMatchObject({
      code: "CARD_WITHOUT_IMAGE",
      cardIds: [10],
    });
    expect(dependencies.insertLot).not.toHaveBeenCalled();
  });
}

function registerDurationRejectionCases() {
  it("does not insert a lot when the start is not before the end", async () => {
    const dependencies = createDependencies([tornadoDragon]);
    const instant = new Date("2026-10-26T13:00:00.000Z");

    const creation = createLot(
      lotInput({
        cardIds: [10],
        startsAt: instant,
        endsAt: instant,
      }),
      dependencies,
    );

    await expect(creation).rejects.toMatchObject({
      code: "INVALID_SCHEDULE",
    });
    expect(dependencies.insertLot).not.toHaveBeenCalled();
  });

  it("does not insert a lot when the duration is shorter than 1 minute", async () => {
    const dependencies = createDependencies([tornadoDragon]);
    const startsAt = now;
    const endsAt = new Date(startsAt.getTime() + minimumLotDurationMs - 1);

    const creation = createLot(
      lotInput({
        cardIds: [10],
        startsAt,
        endsAt,
      }),
      dependencies,
    );

    await expect(creation).rejects.toMatchObject({
      code: "INVALID_SCHEDULE",
    });
    expect(endsAt.getTime()).toBeGreaterThan(now.getTime());
    expect(dependencies.insertLot).not.toHaveBeenCalled();
  });
}

function registerPastEndRejectionCases() {
  it("does not insert a lot when the end is in the past even if it lasts longer than 1 minute", async () => {
    const dependencies = createDependencies([tornadoDragon]);
    const endsAt = new Date(now.getTime() - 60_000);
    const startsAt = new Date(endsAt.getTime() - minimumLotDurationMs - 60_000);

    const creation = createLot(
      lotInput({
        cardIds: [10],
        startsAt,
        endsAt,
      }),
      dependencies,
    );

    await expect(creation).rejects.toMatchObject({
      code: "INVALID_SCHEDULE",
    });
    expect(endsAt.getTime() - startsAt.getTime()).toBeGreaterThan(
      minimumLotDurationMs,
    );
    expect(dependencies.insertLot).not.toHaveBeenCalled();
  });
}
