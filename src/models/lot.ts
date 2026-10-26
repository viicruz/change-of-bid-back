//* Local imports
import { lot } from "../db/schema";
import type { DatabaseExecutor } from "./executor";

export async function insertLot(
  executor: DatabaseExecutor,
  values: typeof lot.$inferInsert,
) {
  const rows = await executor.insert(lot).values(values).returning();
  const row = rows[0];

  if (!row) {
    throw new Error("Insert lot did not return a row");
  }

  return row;
}
