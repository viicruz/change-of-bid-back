//* Libraries imports
import { vi } from "vitest";

//* Local imports
import type { DatabaseExecutor } from "../../../../models/executor";
import type {
  CreateLotDependencies,
  CreateLotInput,
} from "../../create-lot";

export const now = new Date("2026-10-26T12:00:00.000Z");
export const minimumLotDurationMs = 4 * 60 * 1000;

type CatalogCard = Awaited<
  ReturnType<CreateLotDependencies["findCardsByIds"]>
>[number];

type InsertedLot = Awaited<ReturnType<CreateLotDependencies["insertLot"]>>;

type InsertedLotItem = Awaited<
  ReturnType<CreateLotDependencies["insertLotItems"]>
>[number];

export const tornadoDragon = catalogCard({
  id: 10,
  name: "Tornado Dragon",
  imagePath: "/card-images/10.jpg",
});

export const decodeTalker = catalogCard({
  id: 20,
  name: "Decode Talker",
  imagePath: "https://images.example/decode.jpg",
});

export function catalogCard(card: {
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

export function lotInput(overrides: Partial<CreateLotInput> = {}): CreateLotInput {
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

export function createDependencies(cards: CatalogCard[]) {
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
