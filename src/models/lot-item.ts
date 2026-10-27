//* Local imports
import { lotItem } from "../db/schema";
import type { DatabaseExecutor } from "./executor";

export async function insertLotItems(
  executor: DatabaseExecutor,
  rows: (typeof lotItem.$inferInsert)[],
) {
  const inserted = await executor.insert(lotItem).values(rows).returning();

  if (inserted.length === 0) {
    throw new Error("Insert lot items did not return rows");
  }

  return inserted;
}
