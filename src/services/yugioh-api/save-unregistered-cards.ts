//* Libraries imports
import { inArray, type InferInsertModel } from "drizzle-orm";

//* Schemas imports
import type { Card } from "../../schemas/ygo-pro-deck";

//* Local imports
import { db } from "../../db/index";
import { card } from "../../db/schema";

type CardRow = InferInsertModel<typeof card>;

export type CardCatalog = {
  findExistingIds(ids: number[]): Promise<number[]>;
  insertCards(rows: CardRow[]): Promise<void>;
};

/**
 * Insert cards returned by a search when their ids are not already stored.
 * Existing rows are left unchanged.
 */
export async function saveUnregisteredCards(
  cards: readonly Card[],
  catalog: CardCatalog = createCardCatalog(),
): Promise<void> {
  const unique = uniqueCards(cards);

  if (unique.length === 0) {
    return;
  }

  const existingIds = new Set(await catalog.findExistingIds(unique.map((entry) => entry.id)));
  const missing = unique.filter((entry) => !existingIds.has(entry.id));

  if (missing.length === 0) {
    return;
  }

  const fetchedAt = new Date();

  await catalog.insertCards(missing.map((entry) => toCardRow(entry, fetchedAt)));
}

function uniqueCards(cards: readonly Card[]): Card[] {
  const seen = new Set<number>();
  const unique: Card[] = [];

  for (const entry of cards) {
    if (seen.has(entry.id)) {
      continue;
    }

    seen.add(entry.id);
    unique.push(entry);
  }

  return unique;
}

function toCardRow(entry: Card, fetchedAt: Date): CardRow {
  return {
    id: entry.id,
    name: entry.name,
    type: entry.type ?? "",
    frameType: entry.frameType ?? "",
    description: entry.desc,
    race: entry.race ?? null,
    attribute: entry.attribute ?? null,
    atk: entry.atk ?? null,
    def: entry.def ?? null,
    level: entry.level ?? null,
    raw: toRawCard(entry),
    imagePath: entry.card_images?.[0]?.image_url ?? null,
    fetchedAt,
  };
}

function toRawCard(entry: Card): Record<string, unknown> {
  return { ...entry };
}

function createCardCatalog(): CardCatalog {
  return {
    async findExistingIds(ids) {
      const rows = await db
        .select({ id: card.id })
        .from(card)
        .where(inArray(card.id, ids));

      return rows.map((row) => row.id);
    },
    async insertCards(rows) {
      await db.insert(card).values(rows).onConflictDoNothing({ target: card.id });
    },
  };
}
