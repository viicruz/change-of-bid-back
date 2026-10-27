//* Schemas imports
import { moneyValidationMessage, normalizeMoney } from "../../schemas/money";

//* Models imports
import type { DatabaseExecutor } from "../../models/executor";
import { findCardsByIds } from "../../models/card";
import { insertLot } from "../../models/lot";
import { insertLotItems } from "../../models/lot-item";

//* Local imports
import { db } from "../../db/index";

const createLotErrorCodes = [
  "NOT_AUCTIONEER",
  "INVALID_SCHEDULE",
  "INVALID_MONEY",
  "UNKNOWN_CARDS",
  "CARD_WITHOUT_IMAGE",
] as const;

const minimumLotDurationMs = 24 * 60 * 60 * 1000;

export type CreateLotErrorCode = (typeof createLotErrorCodes)[number];

export class CreateLotError extends Error {
  readonly code: CreateLotErrorCode;
  readonly cardIds: number[] | undefined;

  constructor(
    code: CreateLotErrorCode,
    message: string,
    cardIds?: number[],
  ) {
    super(message);
    this.name = "CreateLotError";
    this.code = code;
    this.cardIds = cardIds;
  }
}

export type CreateLotInput = {
  auctioneerId: string;
  role: string;
  title: string;
  description: string | null;
  openingBid: string;
  minIncrement: string;
  startsAt: Date;
  endsAt: Date;
  cardIds: number[];
};

type StoredLot = Awaited<ReturnType<typeof insertLot>>;

export type CreatedLotItem = {
  id: string;
  position: number;
  cardId: number;
  quantity: number;
  cardName: string;
  imagePath: string;
};

export type CreatedLot = {
  id: string;
  auctioneerId: string;
  title: string;
  description: string | null;
  openingBid: string;
  minIncrement: string;
  startsAt: Date;
  originalEndsAt: Date;
  endsAt: Date;
  status: StoredLot["status"];
  items: CreatedLotItem[];
};

export type CreateLotDependencies = {
  now: () => Date;
  runInTransaction: <Result>(
    work: (executor: DatabaseExecutor) => Promise<Result>,
  ) => Promise<Result>;
  findCardsByIds: typeof findCardsByIds;
  insertLot: typeof insertLot;
  insertLotItems: typeof insertLotItems;
};

export async function createLot(
  input: CreateLotInput,
  dependencies: CreateLotDependencies = createDefaultDependencies(),
): Promise<CreatedLot> {
  if (input.role !== "AUCTIONEER") {
    throw new CreateLotError(
      "NOT_AUCTIONEER",
      "Only an auctioneer can create a lot.",
    );
  }

  const openingBid = requireMoney(input.openingBid);
  const minIncrement = requireMoney(input.minIncrement);
  assertSchedule(input.startsAt, input.endsAt, dependencies.now());

  if (input.cardIds.length === 0) {
    throw new CreateLotError(
      "UNKNOWN_CARDS",
      "A lot must include at least one card.",
    );
  }

  return dependencies.runInTransaction(async (executor) => {
    const requestedIds = uniqueIds(input.cardIds);
    const cards = await dependencies.findCardsByIds(executor, requestedIds);
    const cardsById = new Map(cards.map((entry) => [entry.id, entry]));
    const missingIds = requestedIds.filter((id) => !cardsById.has(id));

    if (missingIds.length > 0) {
      throw new CreateLotError(
        "UNKNOWN_CARDS",
        "One or more cards are not in the catalog.",
        missingIds,
      );
    }

    const cardsWithoutImage = requestedIds.filter((id) => {
      const entry = cardsById.get(id);

      return entry === undefined || !hasImage(entry.imagePath);
    });

    if (cardsWithoutImage.length > 0) {
      throw new CreateLotError(
        "CARD_WITHOUT_IMAGE",
        "One or more cards do not have an image.",
        cardsWithoutImage,
      );
    }

    const createdLot = await dependencies.insertLot(executor, {
      auctioneerId: input.auctioneerId,
      title: input.title,
      description: input.description,
      openingBid,
      minIncrement,
      startsAt: input.startsAt,
      originalEndsAt: input.endsAt,
      endsAt: input.endsAt,
    });

    const itemRows = input.cardIds.map((cardId, index) => {
      const entry = cardsById.get(cardId);

      if (entry === undefined || !hasImage(entry.imagePath)) {
        throw new CreateLotError(
          "CARD_WITHOUT_IMAGE",
          "One or more cards do not have an image.",
          [cardId],
        );
      }

      return {
        lotId: createdLot.id,
        position: index + 1,
        cardId: entry.id,
        quantity: 1,
        cardName: entry.name,
        cardSnapshot: entry.raw,
        imagePath: entry.imagePath,
      };
    });

    const createdItems = await dependencies.insertLotItems(executor, itemRows);
    const itemsByPosition = new Map(
      createdItems.map((item) => [item.position, item]),
    );

    return {
      id: createdLot.id,
      auctioneerId: createdLot.auctioneerId,
      title: createdLot.title,
      description: createdLot.description,
      openingBid: createdLot.openingBid,
      minIncrement: createdLot.minIncrement,
      startsAt: createdLot.startsAt,
      originalEndsAt: createdLot.originalEndsAt,
      endsAt: createdLot.endsAt,
      status: createdLot.status,
      items: itemRows.map((item) => {
        const created = itemsByPosition.get(item.position);

        if (created === undefined) {
          throw new Error("Insert lot items did not return every position");
        }

        return {
          id: created.id,
          position: created.position,
          cardId: created.cardId,
          quantity: created.quantity,
          cardName: created.cardName,
          imagePath: created.imagePath,
        };
      }),
    };
  });
}

function createDefaultDependencies(): CreateLotDependencies {
  return {
    now: () => new Date(),
    runInTransaction: (work) => db.transaction((tx) => work(tx)),
    findCardsByIds,
    insertLot,
    insertLotItems,
  };
}

function requireMoney(value: string): string {
  const normalized = normalizeMoney(value);

  if (normalized === null) {
    throw new CreateLotError(
      "INVALID_MONEY",
      moneyValidationMessage,
    );
  }

  return normalized;
}

function assertSchedule(startsAt: Date, endsAt: Date, now: Date): void {
  const startTime = startsAt.getTime();
  const endTime = endsAt.getTime();

  if (
    Number.isNaN(startTime) ||
    Number.isNaN(endTime) ||
    endTime - startTime < minimumLotDurationMs ||
    endTime <= now.getTime()
  ) {
    throw new CreateLotError(
      "INVALID_SCHEDULE",
      "The lot must last at least 24 hours, and the end must be in the future.",
    );
  }
}

function uniqueIds(ids: readonly number[]): number[] {
  const seen = new Set<number>();
  const unique: number[] = [];

  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }

    seen.add(id);
    unique.push(id);
  }

  return unique;
}

function hasImage(imagePath: string | null): imagePath is string {
  return imagePath !== null && imagePath.trim().length > 0;
}
