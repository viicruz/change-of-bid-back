import { asc, eq, gt } from "drizzle-orm";
import { card, lotItem } from "../db/schema";
import type { DatabaseExecutor } from "./executor";
import type { ImageBackfillStore } from "../services/yugioh-api/backfill-card-images";

export function cardImageBackfillStore(executor: DatabaseExecutor): ImageBackfillStore {
  return {
    async *rows() {
      let cardCursor: number | undefined;
      while (true) {
        const rows = await executor.select({ id: card.id, imagePath: card.imagePath, snapshot: card.raw })
          .from(card).where(cardCursor === undefined ? undefined : gt(card.id, cardCursor))
          .orderBy(asc(card.id)).limit(100);
        if (rows.length === 0) break;
        for (const row of rows) yield { ...row, cardId: row.id, table: "card" as const };
        cardCursor = rows[rows.length - 1]!.id;
      }
      let itemCursor: string | undefined;
      while (true) {
        const rows = await executor.select({
          id: lotItem.id, cardId: lotItem.cardId, imagePath: lotItem.imagePath, snapshot: lotItem.cardSnapshot,
        }).from(lotItem).where(itemCursor === undefined ? undefined : gt(lotItem.id, itemCursor))
          .orderBy(asc(lotItem.id)).limit(100);
        if (rows.length === 0) break;
        for (const row of rows) yield { ...row, table: "lot_item" as const };
        itemCursor = rows[rows.length - 1]!.id;
      }
    },
    async updateImagePath(row, imagePath) {
      if (row.table === "card") {
        await executor.update(card).set({ imagePath }).where(eq(card.id, Number(row.id)));
      } else {
        await executor.update(lotItem).set({ imagePath }).where(eq(lotItem.id, String(row.id)));
      }
    },
  };
}
