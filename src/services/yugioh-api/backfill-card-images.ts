import { ensureCardImage, type StoredCardImage } from "./ensure-card-image";
import { downloadCardImage, type ImageDownload } from "./save-card-image";

export type ImageBackfillRow = StoredCardImage & {
  table: "card" | "lot_item";
  id: number | string;
};

export type ImageBackfillStore = {
  rows(): AsyncIterable<ImageBackfillRow>;
  updateImagePath(row: ImageBackfillRow, imagePath: string): Promise<void>;
};

export async function backfillCardImages(
  store: ImageBackfillStore,
  download: ImageDownload = downloadCardImage,
  onFailure: (row: ImageBackfillRow, error: unknown) => void = () => {},
) {
  const result = {
    card: { scanned: 0, updated: 0, unchanged: 0, failed: 0 },
    lot_item: { scanned: 0, updated: 0, unchanged: 0, failed: 0 },
  };
  // One image at a time; no unbounded promises or open DB transaction while downloading.
  for await (const row of store.rows()) {
    const count = result[row.table];
    count.scanned++;
    try {
      const imagePath = await ensureCardImage(row, download);
      if (imagePath !== row.imagePath) {
        await store.updateImagePath(row, imagePath);
        count.updated++;
      } else {
        count.unchanged++;
      }
    } catch (error) {
      count.failed++;
      onFailure(row, error);
    }
  }
  return result;
}
