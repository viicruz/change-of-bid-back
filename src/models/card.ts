//* Libraries imports
import { inArray } from "drizzle-orm";

//* Local imports
import { card } from "../db/schema";
import type { DatabaseExecutor } from "./executor";

export async function findCardsByIds(executor: DatabaseExecutor, ids: number[]) {
  if (ids.length === 0) {
    return [];
  }

  return executor
    .select({
      id: card.id,
      name: card.name,
      raw: card.raw,
      imagePath: card.imagePath,
    })
    .from(card)
    .where(inArray(card.id, ids));
}
