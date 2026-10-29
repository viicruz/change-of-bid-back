import { downloadCardImage, hasLocalCardImage, saveCardImage, type ImageDownload } from "./save-card-image";

export type StoredCardImage = {
  cardId: number;
  imagePath: string | null;
  snapshot: Record<string, unknown>;
};

export async function ensureCardImage(
  source: StoredCardImage,
  download: ImageDownload = downloadCardImage,
): Promise<string> {
  if (!Number.isSafeInteger(source.cardId) || source.cardId < 0) {
    throw new Error("Invalid card id");
  }

  // The item's own frozen reference wins over a legacy path. Never consult the
  // current catalog to replace artwork or any other part of a lot snapshot.
  const images = source.snapshot.card_images;
  const first: unknown = Array.isArray(images) ? images[0] : undefined;
  const image = first && typeof first === "object" ? first as Record<string, unknown> : undefined;
  if (typeof image?.image_url !== "string" && await hasLocalCardImage(source.imagePath)) {
    return source.imagePath!;
  }
  const url = typeof image?.image_url === "string" ? image.image_url : source.imagePath;
  const id = typeof image?.id === "number" ? image.id : source.cardId;
  if (!url) throw new Error("No preserved card image reference");
  return saveCardImage(id, url, download);
}
