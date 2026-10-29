//* Libraries imports
import { and, eq, inArray } from "drizzle-orm";

//* Local imports
import { loadDeckFixtures, type DeckLot, type DeckLotCard } from "./deck-fixtures";
import { db } from "./index";
import { planSeedLots, type SeedLotPlan } from "./seed-lot-plan";
import { findSeedUserByEmail } from "./seed-user-lookup";
import { lot } from "./schema";

//* Models imports
import { findCardsByIds } from "../models/card";
import { insertLot } from "../models/lot";
import { insertLotItems } from "../models/lot-item";

//* Schemas imports
import type { Card } from "../schemas/ygo-pro-deck";

//* Services imports
import { saveUnregisteredCards } from "../services/yugioh-api/save-unregistered-cards";
import {
  YGOProDeckApiClient,
  YGOProDeckApiError,
} from "../services/yugioh-api/yugioh-api";

const cardPageSize = 32;

type CatalogCard = Awaited<ReturnType<typeof findCardsByIds>>[number];
type CardSearchClient = Pick<YGOProDeckApiClient, "searchCards">;

export type SeededLot = {
  id: string;
  title: string;
  plan: SeedLotPlan;
};

export async function seedLots(
  auctioneerEmail: string,
  now = new Date(),
  client?: CardSearchClient,
) {
  const auctioneerId = await findAuctioneerId(auctioneerEmail);
  const fixtures = await loadDeckFixtures();
  const plans = planSeedLots(now);

  if (fixtures.length < plans.length) {
    throw new Error(
      `Expected at least ${plans.length} deck fixtures and found ${fixtures.length}`,
    );
  }

  const decks = fixtures.slice(0, plans.length);
  const existingTitles = await findExistingLotTitles(
    auctioneerId,
    decks.map((deck) => deck.name),
  );
  const pending = decks.flatMap((deck, index) => {
    const plan = plans[index];

    if (!plan) {
      throw new Error(`Missing seed plan for deck ${deck.name}`);
    }

    if (existingTitles.has(deck.name)) {
      console.log(`skipped lot ${deck.name}`);
      return [];
    }

    return [{ deck, plan }];
  });

  if (pending.length === 0) {
    return [];
  }

  const cardsById = await ensureCatalogCards(
    uniquePasscodes(pending.map((entry) => entry.deck)),
    client,
  );
  const pendingLots = pending.map((entry) => ({
    deck: entry.deck,
    plan: entry.plan,
    items: entry.deck.cards.map((card) => {
      const stored = requireCatalogCard(entry.deck, card, cardsById);

      return {
        position: card.position,
        cardId: stored.id,
        quantity: card.quantity,
        cardName: stored.name,
        cardSnapshot: stored.raw,
        imagePath: stored.imagePath,
      };
    }),
  }));
  const seededLots: SeededLot[] = [];

  for (const pendingLot of pendingLots) {
    const created = await db.transaction(async (tx) => {
      const createdLot = await insertLot(tx, {
        auctioneerId,
        title: pendingLot.deck.name,
        description: pendingLot.deck.description,
        openingBid: pendingLot.plan.openingBid,
        minIncrement: pendingLot.plan.minIncrement,
        startsAt: pendingLot.plan.insertStartsAt,
        originalEndsAt: pendingLot.plan.insertEndsAt,
        endsAt: pendingLot.plan.insertEndsAt,
      });

      await insertLotItems(
        tx,
        pendingLot.items.map((item) => ({
          lotId: createdLot.id,
          ...item,
        })),
      );

      return createdLot;
    });

    seededLots.push({
      id: created.id,
      title: created.title,
      plan: pendingLot.plan,
    });
    console.log(
      `created ${pendingLot.plan.status} lot ${created.title} (${created.id})`,
    );
  }

  return seededLots;
}

async function findAuctioneerId(email: string) {
  const auctioneer = await findSeedUserByEmail(db, email);

  if (!auctioneer) {
    throw new Error(`Auctioneer ${email} was not found`);
  }

  return auctioneer.id;
}

async function findExistingLotTitles(auctioneerId: string, titles: string[]) {
  if (titles.length === 0) {
    return new Set<string>();
  }

  const rows = await db
    .select({ title: lot.title })
    .from(lot)
    .where(and(eq(lot.auctioneerId, auctioneerId), inArray(lot.title, titles)));

  return new Set(rows.map((row) => row.title));
}

async function ensureCatalogCards(passcodes: number[], client?: CardSearchClient) {
  const stored = await findCardsByIds(db, passcodes);
  const cardsById = new Map(stored.map((card) => [card.id, card]));
  const missingIds = passcodes.filter((passcode) => !cardsById.has(passcode));

  if (missingIds.length === 0) {
    return cardsById;
  }

  const fetched = await fetchCardsByPasscodes(missingIds, client);

  await saveUnregisteredCards(fetched);

  const inserted = await findCardsByIds(db, missingIds);

  for (const card of inserted) {
    cardsById.set(card.id, card);
  }

  return cardsById;
}

async function fetchCardsByPasscodes(
  passcodes: number[],
  client: CardSearchClient = new YGOProDeckApiClient(),
) {
  const cards: Card[] = [];

  for (let start = 0; start < passcodes.length; start += cardPageSize) {
    const chunk = passcodes.slice(start, start + cardPageSize);
    const page = await fetchPasscodeChunk(client, chunk);

    cards.push(...page);
  }

  return cards;
}

async function fetchPasscodeChunk(
  client: CardSearchClient,
  passcodes: number[],
) {
  const cards: Card[] = [];
  let offset = 0;

  while (offset < passcodes.length) {
    let page: Awaited<ReturnType<YGOProDeckApiClient["searchCards"]>>;

    try {
      page = await client.searchCards({
        id: passcodes,
        num: cardPageSize,
        offset,
      });
    } catch (error) {
      if (isUnknownCardError(error)) {
        return cards;
      }

      throw error;
    }

    if (page.data.length === 0) {
      return cards;
    }

    cards.push(...page.data);

    const remaining = page.meta?.rows_remaining ?? 0;

    if (remaining <= 0) {
      return cards;
    }

    offset += page.data.length;
  }

  return cards;
}

function isUnknownCardError(error: unknown) {
  return (
    error instanceof YGOProDeckApiError &&
    error.message.includes("No card matching your query")
  );
}

function uniquePasscodes(decks: readonly DeckLot[]) {
  const seen = new Set<number>();
  const passcodes: number[] = [];

  for (const deck of decks) {
    for (const card of deck.cards) {
      if (seen.has(card.passcode)) {
        continue;
      }

      seen.add(card.passcode);
      passcodes.push(card.passcode);
    }
  }

  return passcodes;
}

function requireCatalogCard(
  deck: DeckLot,
  card: DeckLotCard,
  cardsById: Map<number, CatalogCard>,
) {
  const stored = cardsById.get(card.passcode);

  if (!stored) {
    throw new Error(
      `Card ${card.name} (${card.passcode}) from deck ${deck.name} is not in the catalog`,
    );
  }

  if (!hasImage(stored.imagePath)) {
    throw new Error(
      `Card ${card.name} (${card.passcode}) from deck ${deck.name} does not have an image`,
    );
  }

  return {
    id: stored.id,
    name: stored.name,
    raw: stored.raw,
    imagePath: stored.imagePath,
  };
}

function hasImage(imagePath: string | null): imagePath is string {
  return imagePath !== null && imagePath.trim().length > 0;
}
