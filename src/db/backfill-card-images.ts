import { db } from "./index";
import { cardImageBackfillStore } from "../models/card-image-backfill";
import { backfillCardImages } from "../services/yugioh-api/backfill-card-images";
import { downloadCardImage } from "../services/yugioh-api/save-card-image";

try {
  const result = await backfillCardImages(cardImageBackfillStore(db), downloadCardImage, (row, error) => {
    console.error(`${row.table} ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.card.failed + result.lot_item.failed > 0) process.exitCode = 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
