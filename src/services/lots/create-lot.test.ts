//* Libraries imports
import { describe, expect, it, vi } from "vitest";

//* Local imports
import type { DatabaseExecutor } from "../../models/executor";
import {
  createLot,
  CreateLotError,
  type CreateLotDependencies,
  type CreateLotInput,
} from "./create-lot";

const now = new Date("2026-10-26T12:00:00.000Z");
const minimumLotDurationMs = 24 * 60 * 60 * 1000;

type CatalogCard = Awaited<
  ReturnType<CreateLotDependencies["findCardsByIds"]>
>[number];

type InsertedLot = Awaited<ReturnType<CreateLotDependencies["insertLot"]>>;

type InsertedLotItem = Awaited<
  ReturnType<CreateLotDependencies["insertLotItems"]>
>[number];

const tornadoDragon = catalogCard({
  id: 10,
  name: "Tornado Dragon",
  imagePath: "https://images.example/tornado.jpg",
});

const decodeTalker = catalogCard({
  id: 20,
  name: "Decode Talker",
  imagePath: "https://images.example/decode.jpg",
});

function catalogCard(card: {
  id: number;
  name: string;
  imagePath: string | null;
}): CatalogCard {
  return {
    id: card.id,
    name: card.name,
    imagePath: card.imagePath,
    raw: {
      id: card.id,
      name: card.name,
    },
  };
}

function lotInput(overrides: Partial<CreateLotInput> = {}): CreateLotInput {
  return {
    auctioneerId: "auctioneer-1",
    role: "AUCTIONEER",
    title: "Weekend lot",
    description: null,
    openingBid: "10",
    minIncrement: "0.5",
    startsAt: new Date("2026-10-26T11:00:00.000Z"),
    endsAt: new Date("2026-10-27T11:00:00.000Z"),
    cardIds: [tornadoDragon.id, decodeTalker.id],
    ...overrides,
  };
}

function createDependencies(cards: CatalogCard[]) {
  const dependencies = {
    now: () => now,
    runInTransaction: (work) => work({} as DatabaseExecutor),
    findCardsByIds: vi.fn(async (_executor, ids) => {
      return cards.filter((entry) => ids.includes(entry.id));
    }),
    insertLot: vi.fn(async (_executor, values) => {
      return {
        id: "lot-1",
        auctioneerId: values.auctioneerId,
        title: values.title,
        description: values.description ?? null,
        openingBid: values.openingBid,
        minIncrement: values.minIncrement,
        startsAt: values.startsAt,
        originalEndsAt: values.originalEndsAt,
        endsAt: values.endsAt,
        extensionCount: values.extensionCount ?? 0,
        status: values.status ?? "ACTIVE",
        currentBidId: values.currentBidId ?? null,
        winnerId: values.winnerId ?? null,
        bidCount: values.bidCount ?? 0,
        headHash: values.headHash ?? null,
        endedAt: values.endedAt ?? null,
        settledAt: values.settledAt ?? null,
        canceledAt: values.canceledAt ?? null,
        createdAt: now,
        updatedAt: now,
      } satisfies InsertedLot;
    }),
    insertLotItems: vi.fn<CreateLotDependencies["insertLotItems"]>(
      async (_executor, rows) => {
        return rows.map((row, index) => {
          return {
            id: `item-${index + 1}`,
            lotId: row.lotId,
            position: row.position,
            cardId: row.cardId,
            quantity: row.quantity ?? 1,
            cardName: row.cardName,
            cardSnapshot: row.cardSnapshot,
            imagePath: row.imagePath,
            createdAt: now,
          } satisfies InsertedLotItem;
        });
      },
    ),
  } satisfies CreateLotDependencies;

  return dependencies;
}

describe("createLot", () => {
  describe("when the auctioneer and cards are valid", () => {
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
            imagePath: "https://images.example/tornado.jpg",
          }),
        ],
      );
    });

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

    it("accepts a duration of exactly 24 hours when the start is in the past", async () => {
      const dependencies = createDependencies([tornadoDragon]);
      const startsAt = new Date("2026-10-26T11:00:00.000Z");
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

    it("accepts a duration of exactly 24 hours when the start is in the future", async () => {
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
  });

  describe("when the request is rejected", () => {
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

    it("does not insert a lot when the duration is shorter than 24 hours", async () => {
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

    it("does not insert a lot when the end is in the past even if it lasts longer than 24 hours", async () => {
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
  });
});
