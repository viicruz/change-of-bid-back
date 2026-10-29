//* Libraries imports
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

//* Models imports
import type { findCardsByIds } from "../models/card";

//* Schemas imports
import type { Card } from "../schemas/ygo-pro-deck";

//* Services imports
import { YGOProDeckApiClient, YGOProDeckApiError } from "../services/yugioh-api/yugioh-api";

//* Local imports
import type { DeckLot } from "./deck-fixtures";
import { planSeedLots } from "./seed-lot-plan";
import { seedLots } from "./seed-lots";

const mocks = vi.hoisted(() => {
  const transactionExecutor = { name: "seed transaction" };
  const findAuctioneer = vi.fn();
  const findExistingTitles = vi.fn();

  return {
    transactionExecutor,
    findAuctioneer,
    findExistingTitles,
    loadDeckFixtures: vi.fn<() => Promise<DeckLot[]>>(),
    findCardsByIds: vi.fn<typeof findCardsByIds>(),
    saveUnregisteredCards: vi.fn<(cards: Card[]) => Promise<void>>(),
    insertLot: vi.fn(async (_executor: unknown, values: { title: string }) => ({
      id: `lot-${values.title}`,
      title: values.title,
    })),
    insertLotItems: vi.fn(async (_executor: unknown, _items: unknown[]) => []),
    transaction: vi.fn(async (run: (executor: unknown) => Promise<unknown>) => run(transactionExecutor)),
    select: vi.fn((fields: { id?: unknown }) => ({
      from: vi.fn(() => ({
        where: fields.id === undefined
          ? findExistingTitles
          : vi.fn(() => ({ limit: findAuctioneer })),
      })),
    })),
  };
});

// Importing the seed cannot create a real database connection or download images.
vi.mock("./index", () => ({ db: { select: mocks.select, transaction: mocks.transaction } }));
vi.mock("./deck-fixtures", () => ({ loadDeckFixtures: mocks.loadDeckFixtures }));
vi.mock("../models/card", () => ({ findCardsByIds: mocks.findCardsByIds }));
vi.mock("../models/lot", () => ({ insertLot: mocks.insertLot }));
vi.mock("../models/lot-item", () => ({ insertLotItems: mocks.insertLotItems }));
vi.mock("../services/yugioh-api/save-unregistered-cards", () => ({
  saveUnregisteredCards: mocks.saveUnregisteredCards,
}));

const now = new Date("2026-10-28T15:00:00.000Z");
const email = "auctioneer@example.test";
const plans = planSeedLots(now);
type CatalogCard = Awaited<ReturnType<typeof findCardsByIds>>[number];
let decks: DeckLot[];
let existingTitles: Set<string>;
let catalog: Map<number, CatalogCard>;
let searchCards: ReturnType<typeof vi.fn<YGOProDeckApiClient["searchCards"]>>;

function apiCard(id: number): Card {
  return {
    id,
    name: `Catalog card ${id}`,
    type: "Normal Monster",
    humanReadableCardType: "Normal Monster",
    frameType: "normal",
    desc: "Seed test card",
    ygoprodeck_url: `https://ygoprodeck.com/card/${id}`,
  };
}

function catalogCard(id: number, imagePath: string | null = `/card-images/${id}.jpg`): CatalogCard {
  return { id, name: `Catalog card ${id}`, raw: apiCard(id), imagePath };
}

function deck(name: string, ids: number[]): DeckLot {
  return {
    name,
    description: `Description of ${name}`,
    cards: ids.map((passcode, index) => ({
      name: `Fixture card ${passcode}`,
      passcode,
      quantity: index + 1,
      position: index + 1,
    })),
  };
}

function runSeed() {
  return seedLots(email, now, { searchCards });
}

beforeEach(() => {
  vi.clearAllMocks();
  decks = Array.from({ length: 40 }, (_, index) => deck(`Deck ${index}`, [1]));
  existingTitles = new Set(decks.slice(1).map((entry) => entry.name));
  catalog = new Map([[1, catalogCard(1)]]);
  searchCards = vi.fn<YGOProDeckApiClient["searchCards"]>().mockResolvedValue({ data: [apiCard(1)] });
  mocks.loadDeckFixtures.mockImplementation(async () => decks);
  mocks.findAuctioneer.mockResolvedValue([{ id: "auctioneer-id" }]);
  mocks.findExistingTitles.mockImplementation(async () => [...existingTitles].map((title) => ({ title })));
  mocks.findCardsByIds.mockImplementation(async (_executor, ids) => {
    return ids.flatMap((id) => {
      const card = catalog.get(id);
      return card === undefined ? [] : [card];
    });
  });
  mocks.saveUnregisteredCards.mockImplementation(async (cards) => {
    for (const card of cards) {
      catalog.set(card.id, catalogCard(card.id));
    }
  });
  mocks.insertLot.mockImplementation(async (_executor, values) => {
    existingTitles.add(values.title);
    return { id: `lot-${values.title}`, title: values.title };
  });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network request"); }));
});

afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("seedLots orchestration", () => {
  it("uses the catalog without searching or saving cards already stored", async () => {
    await expect(runSeed()).resolves.toEqual([
      { id: "lot-Deck 0", title: "Deck 0", plan: plans[0] },
    ]);

    expect(searchCards).not.toHaveBeenCalled();
    expect(mocks.saveUnregisteredCards).not.toHaveBeenCalled();
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.insertLot).toHaveBeenCalledExactlyOnceWith(mocks.transactionExecutor, {
      auctioneerId: "auctioneer-id",
      title: "Deck 0",
      description: "Description of Deck 0",
      openingBid: "25.00",
      minIncrement: "5.00",
      startsAt: plans[0].insertStartsAt,
      originalEndsAt: plans[0].insertEndsAt,
      endsAt: plans[0].insertEndsAt,
    });
    expect(mocks.insertLotItems).toHaveBeenCalledExactlyOnceWith(mocks.transactionExecutor, [{
      lotId: "lot-Deck 0",
      position: 1,
      cardId: 1,
      quantity: 1,
      cardName: "Catalog card 1",
      cardSnapshot: apiCard(1),
      imagePath: "/card-images/1.jpg",
    }]);
  });

  it("skips existing titles and performs no catalog work on a second run", async () => {
    await runSeed();
    vi.clearAllMocks();

    await expect(runSeed()).resolves.toEqual([]);

    expect(mocks.findCardsByIds).not.toHaveBeenCalled();
    expect(searchCards).not.toHaveBeenCalled();
    expect(mocks.saveUnregisteredCards).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.insertLot).not.toHaveBeenCalled();
    expect(mocks.insertLotItems).not.toHaveBeenCalled();
  });

  it("keeps each pending deck's original plan, item order, positions and quantities", async () => {
    existingTitles.delete("Deck 20");
    decks[0] = deck("Deck 0", [2, 1, 2]);
    decks[20] = deck("Deck 20", [1, 2]);
    // Existing decks must not contribute passcodes to the catalog request.
    decks[1] = deck("Deck 1", [999]);
    catalog.set(2, catalogCard(2));

    const result = await runSeed();

    expect(result).toEqual([
      { id: "lot-Deck 0", title: "Deck 0", plan: plans[0] },
      { id: "lot-Deck 20", title: "Deck 20", plan: plans[20] },
    ]);
    expect(mocks.findCardsByIds).toHaveBeenCalledExactlyOnceWith(expect.anything(), [2, 1]);
    expect(mocks.insertLot).toHaveBeenNthCalledWith(2, mocks.transactionExecutor, expect.objectContaining({
      title: "Deck 20",
      startsAt: plans[20].insertStartsAt,
      endsAt: plans[20].insertEndsAt,
    }));
    expect(mocks.insertLotItems).toHaveBeenNthCalledWith(1, mocks.transactionExecutor, [
      expect.objectContaining({ cardId: 2, position: 1, quantity: 1 }),
      expect.objectContaining({ cardId: 1, position: 2, quantity: 2 }),
      expect.objectContaining({ cardId: 2, position: 3, quantity: 3 }),
    ]);
    expect(mocks.insertLotItems).toHaveBeenNthCalledWith(2, mocks.transactionExecutor, [
      expect.objectContaining({ cardId: 1, position: 1, quantity: 1 }),
      expect.objectContaining({ cardId: 2, position: 2, quantity: 2 }),
    ]);
  });

  it("rejects an unknown auctioneer before loading fixtures", async () => {
    mocks.findAuctioneer.mockResolvedValueOnce([]);

    await expect(runSeed()).rejects.toThrow(`Auctioneer ${email} was not found`);

    expect(mocks.loadDeckFixtures).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects a fixture count that does not match the plan before catalog work", async () => {
    decks.pop();

    await expect(runSeed()).rejects.toThrow("Expected 40 deck fixtures and found 39");

    expect(mocks.findExistingTitles).not.toHaveBeenCalled();
    expect(mocks.findCardsByIds).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([null, "", "   "])("rejects a catalog card with imagePath %j before inserting any lot", async (imagePath) => {
    existingTitles.delete("Deck 1");
    decks[1] = deck("Deck 1", [2]);
    catalog.set(2, catalogCard(2, imagePath));

    await expect(runSeed()).rejects.toThrow("Card Fixture card 2 (2) from deck Deck 1 does not have an image");

    expect(searchCards).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.insertLotItems).not.toHaveBeenCalled();
  });

  it("reloads saved cards and rejects any missing catalog entry before lot insertion", async () => {
    catalog.clear();
    mocks.saveUnregisteredCards.mockResolvedValueOnce(undefined);

    await expect(runSeed()).rejects.toThrow("Card Fixture card 1 (1) from deck Deck 0 is not in the catalog");

    expect(mocks.saveUnregisteredCards).toHaveBeenCalledExactlyOnceWith([apiCard(1)]);
    expect(mocks.findCardsByIds).toHaveBeenCalledTimes(2);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("propagates catalog persistence failures before creating lots", async () => {
    catalog.clear();
    const error = new Error("Catalog unavailable");
    mocks.saveUnregisteredCards.mockRejectedValueOnce(error);

    await expect(runSeed()).rejects.toBe(error);

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("propagates item insertion failures from the same lot transaction", async () => {
    const error = new Error("Item insertion failed");
    mocks.insertLotItems.mockRejectedValueOnce(error);

    await expect(runSeed()).rejects.toBe(error);

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.insertLotItems).toHaveBeenCalledWith(mocks.transactionExecutor, expect.any(Array));
  });
});

describe("seedLots catalog pagination", () => {
  beforeEach(() => {
    catalog.clear();
  });

  it("stops on an empty page even when metadata claims more rows", async () => {
    searchCards.mockResolvedValueOnce({ data: [], meta: { current_rows: 0, total_rows: 1, rows_remaining: 1 } });

    await expect(runSeed()).rejects.toThrow("is not in the catalog");

    expect(searchCards).toHaveBeenCalledExactlyOnceWith({ id: [1], num: 32, offset: 0 });
    expect(mocks.saveUnregisteredCards).toHaveBeenCalledExactlyOnceWith([]);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("treats absent metadata as the final page", async () => {
    await runSeed();

    expect(searchCards).toHaveBeenCalledExactlyOnceWith({ id: [1], num: 32, offset: 0 });
    expect(mocks.saveUnregisteredCards).toHaveBeenCalledExactlyOnceWith([apiCard(1)]);
  });

  it("advances by the number of received cards and keeps all pages in order", async () => {
    decks[0] = deck("Deck 0", [1, 2, 3]);
    searchCards
      .mockResolvedValueOnce({ data: [apiCard(3)], meta: { current_rows: 1, total_rows: 3, rows_remaining: 2 } })
      .mockResolvedValueOnce({ data: [apiCard(1), apiCard(2)], meta: { current_rows: 2, total_rows: 3, rows_remaining: 0 } });

    await runSeed();

    expect(searchCards.mock.calls).toEqual([
      [{ id: [1, 2, 3], num: 32, offset: 0 }],
      [{ id: [1, 2, 3], num: 32, offset: 1 }],
    ]);
    expect(mocks.saveUnregisteredCards).toHaveBeenCalledExactlyOnceWith([apiCard(3), apiCard(1), apiCard(2)]);
    expect(mocks.insertLotItems).toHaveBeenCalledWith(mocks.transactionExecutor, [
      expect.objectContaining({ cardId: 1, position: 1 }),
      expect.objectContaining({ cardId: 2, position: 2 }),
      expect.objectContaining({ cardId: 3, position: 3 }),
    ]);
  });

  it("stops when the requested chunk is exhausted even if metadata still claims rows", async () => {
    searchCards.mockResolvedValueOnce({ data: [apiCard(1)], meta: { current_rows: 1, total_rows: 2, rows_remaining: 1 } });

    await runSeed();

    expect(searchCards).toHaveBeenCalledOnce();
  });

  it("stops when a later page is empty and retains cards from previous pages", async () => {
    decks[0] = deck("Deck 0", [1, 2]);
    searchCards
      .mockResolvedValueOnce({ data: [apiCard(1)], meta: { current_rows: 1, total_rows: 2, rows_remaining: 1 } })
      .mockResolvedValueOnce({ data: [] });

    await expect(runSeed()).rejects.toThrow("Card Fixture card 2 (2) from deck Deck 0 is not in the catalog");

    expect(searchCards).toHaveBeenCalledTimes(2);
    expect(mocks.saveUnregisteredCards).toHaveBeenCalledExactlyOnceWith([apiCard(1)]);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("accepts only the API's unknown-card error as an incomplete result", async () => {
    searchCards.mockRejectedValueOnce(new YGOProDeckApiError("No card matching your query was found in the database."));

    await expect(runSeed()).rejects.toThrow("Card Fixture card 1 (1) from deck Deck 0 is not in the catalog");

    expect(searchCards).toHaveBeenCalledOnce();
    expect(mocks.saveUnregisteredCards).toHaveBeenCalledExactlyOnceWith([]);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("retains earlier pages when a later page reports an unknown card", async () => {
    decks[0] = deck("Deck 0", [1, 2]);
    searchCards
      .mockResolvedValueOnce({ data: [apiCard(1)], meta: { current_rows: 1, total_rows: 2, rows_remaining: 1 } })
      .mockRejectedValueOnce(new YGOProDeckApiError("No card matching your query was found in the database."));

    await expect(runSeed()).rejects.toThrow("Card Fixture card 2 (2) from deck Deck 0 is not in the catalog");

    expect(mocks.saveUnregisteredCards).toHaveBeenCalledExactlyOnceWith([apiCard(1)]);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    new YGOProDeckApiError("Rate limit exceeded"),
    new Error("No card matching your query was found in the database."),
    new Error("Connection reset"),
  ])("propagates unexpected errors unchanged (%s)", async (error) => {
    searchCards.mockRejectedValueOnce(error);

    await expect(runSeed()).rejects.toBe(error);

    expect(mocks.saveUnregisteredCards).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("splits unique missing passcodes into chunks of 32 and resets each offset", async () => {
    const ids = Array.from({ length: 66 }, (_, index) => index + 1);
    decks[0] = deck("Deck 0", [...ids, 3, 1]);
    existingTitles.delete("Deck 1");
    decks[1] = deck("Deck 1", [66, 1]);
    catalog.set(2, catalogCard(2));
    const missingIds = ids.filter((id) => id !== 2);
    searchCards
      .mockResolvedValueOnce({ data: missingIds.slice(0, 32).map(apiCard) })
      .mockResolvedValueOnce({ data: missingIds.slice(32, 64).map(apiCard) })
      .mockResolvedValueOnce({ data: missingIds.slice(64).map(apiCard) });

    await runSeed();

    expect(searchCards.mock.calls).toEqual([
      [{ id: missingIds.slice(0, 32), num: 32, offset: 0 }],
      [{ id: missingIds.slice(32, 64), num: 32, offset: 0 }],
      [{ id: [66], num: 32, offset: 0 }],
    ]);
    expect(mocks.saveUnregisteredCards).toHaveBeenCalledExactlyOnceWith(missingIds.map(apiCard));
    expect(mocks.findCardsByIds).toHaveBeenNthCalledWith(2, expect.anything(), missingIds);
    expect(mocks.insertLotItems).toHaveBeenCalledTimes(2);
  });

  it("uses the real default client with a simulated transport when no client is supplied", async () => {
    const search = vi.spyOn(YGOProDeckApiClient.prototype, "searchCards").mockResolvedValueOnce({ data: [apiCard(1)] });

    await seedLots(email, now);

    expect(search).toHaveBeenCalledExactlyOnceWith({ id: [1], num: 32, offset: 0 });
    expect(mocks.insertLot).toHaveBeenCalledOnce();
  });
});
