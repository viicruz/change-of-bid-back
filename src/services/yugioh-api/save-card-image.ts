//* Node imports
import { statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

//* Local imports
import { cardImageStorage } from "../../lib/card-image-storage";

export type ImageDownload = (url: string) => Promise<Response>;

export const downloadCardImage: ImageDownload = (url) =>
  fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000) });

// Image origin documented at https://ygoprodeck.com/api-guide/#card-images.
const CARD_IMAGE_ORIGIN = "https://images.ygoprodeck.com";

const contentTypes = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

export async function saveCardImage(
  id: number,
  imageUrl: string,
  download: ImageDownload,
): Promise<string> {
  const url = new URL(imageUrl);
  const extension = extname(url.pathname);
  const contentType = contentTypes.get(extension);

  if (
    url.protocol !== "https:" || url.origin !== CARD_IMAGE_ORIGIN ||
    url.username || url.password
  ) {
    throw new Error("Invalid card image origin");
  }

  if (!Number.isSafeInteger(id) || id < 0 || !contentType) {
    throw new Error("Invalid card image path");
  }

  const filename = `${id}${extension}`;
  const filePath = join(cardImageStorage.assets, filename);
  const imagePath = `${cardImageStorage.prefix}/${filename}`;

  //* Check if the file already exists
  if (statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
    return imagePath;
  }

  //* Download the image
  const response = await download(url.href);
  const receivedType = response.headers.get("content-type")
    ?.split(";")[0]?.trim().toLowerCase();

  if (!response.ok || receivedType !== contentType) {
    throw new Error("Card image download returned an invalid response");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());

  if (bytes.length === 0) {
    throw new Error("Card image download returned an empty file");
  }

  await mkdir(cardImageStorage.assets, { recursive: true });
  await writeFile(filePath, bytes);

  return imagePath;
}
