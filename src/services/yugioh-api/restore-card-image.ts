import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { cardImageStorage } from "../../lib/card-image-storage";
import { CARD_IMAGE_ORIGIN, downloadCardImage, saveCardImage, type ImageDownload } from "./save-card-image";

// Only canonical filenames map back to a YGOPRODeck URL; hashed variants cannot be rebuilt.
const canonicalFilename = /^(\d+)\.jpg$/;

// Hosts with ephemeral disks (e.g. Render) lose downloaded images on restart while the
// database keeps their paths. Re-download a missing canonical image before it is served.
export async function restoreMissingCardImage(
  pathname: string,
  download: ImageDownload = downloadCardImage,
): Promise<string | undefined> {
  if (!pathname.startsWith(`${cardImageStorage.prefix}/`)) return;
  const filename = pathname.slice(cardImageStorage.prefix.length + 1);
  const id = Number(canonicalFilename.exec(filename)?.[1]);
  if (!Number.isSafeInteger(id)) return;

  try {
    await lstat(join(cardImageStorage.assets, filename));
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return saveCardImage(id, `${CARD_IMAGE_ORIGIN}/images/cards/${filename}`, download);
}
