//* Libraries imports
import { eq, inArray, sql, type InferInsertModel } from "drizzle-orm";

//* Schemas imports
import type { Card } from "../../schemas/ygo-pro-deck";

//* Local imports
import { db } from "../../db/index";
import { card } from "../../db/schema";
import {
  downloadCardImage,
  type ImageDownload,
} from "./save-card-image";

import { ensureCardImage } from "./ensure-card-image";

type CardRow = InferInsertModel<typeof card>;

export type CardCatalog = {
  findExistingCards(ids: number[]): Promise<{ id: number; imagePath: string | null; raw: Record<string, unknown> }[]>;
  updateImagePath(id: number, imagePath: string): Promise<void>;
  insertCards(rows: CardRow[]): Promise<void>;
};

/** Register new cards and repair existing image locations without refreshing metadata. */
export async function saveUnregisteredCards(
  cards: readonly Card[],
  catalog: CardCatalog = createCardCatalog(),
  download: ImageDownload = downloadCardImage,
): Promise<Map<number, string>> {
  const unique = uniqueCards(cards);
  const paths = new Map<number, string>();
  if (unique.length === 0) return paths;

  const existing = new Map((await catalog.findExistingCards(unique.map((entry) => entry.id)))
    .map((entry) => [entry.id, entry]));
  const fetchedAt = new Date();
  const rows: CardRow[] = [];

  // Sequential downloads bound resource use for each search.
  for (const entry of unique) {
    const stored = existing.get(entry.id);
    let imagePath: string;
    try {
      imagePath = await ensureCardImage({
        cardId: entry.id,
        imagePath: stored?.imagePath ?? null,
        snapshot: stored?.raw ?? entry,
      }, download);
    } catch {
      // A fresh search reference may repair a catalog entry with no old source.
      try {
        if (!stored) continue;
        const oldImages = stored.raw.card_images;
        const first = Array.isArray(oldImages) ? oldImages[0] : undefined;
        if (first?.image_url === entry.card_images?.[0]?.image_url) continue;
        imagePath = await ensureCardImage({ cardId: entry.id, imagePath: null, snapshot: entry }, download);
      } catch {
        continue;
      }
    }
    if (stored) {
      if (stored.imagePath !== imagePath) await catalog.updateImagePath(entry.id, imagePath);
    } else {
      rows.push(toCardRow(entry, fetchedAt, imagePath));
    }
    paths.set(entry.id, imagePath);
  }
  if (rows.length > 0) await catalog.insertCards(rows);
  return paths;
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

function toCardRow(entry: Card, fetchedAt: Date, imagePath: string): CardRow {
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
    imagePath,
    fetchedAt,
  };
}

function toRawCard(entry: Card): Record<string, unknown> {
  return { ...entry };
}

function createCardCatalog(): CardCatalog {
  return {
    async findExistingCards(ids) {
      const rows = await db
        .select({ id: card.id, imagePath: card.imagePath, raw: card.raw })
        .from(card)
        .where(inArray(card.id, ids));

      return rows;
    },
    async updateImagePath(id, imagePath) {
      await db.update(card).set({ imagePath }).where(eq(card.id, id));
    },
    async insertCards(rows) {
      await db.insert(card).values(rows).onConflictDoUpdate({ target: card.id, set: { imagePath: sql`excluded.image_path` } });
    },
  };
}
