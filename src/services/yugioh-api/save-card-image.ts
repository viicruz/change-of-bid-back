//* Node imports
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

//* Local imports
import { cardImageStorage } from "../../lib/card-image-storage";

export type ImageDownload = (url: string) => Promise<Response>;

export const downloadCardImage: ImageDownload = (url) =>
  fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000) });

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
    !Number.isSafeInteger(id) || id < 0 ||
    !contentType || !["http:", "https:"].includes(url.protocol)
  ) {
    throw new Error("Invalid card image path");
  }

  const filename = `${id}${extension}`;
  const response = await download(imageUrl);
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
  await writeFile(join(cardImageStorage.assets, filename), bytes);

  return `${cardImageStorage.prefix}/${filename}`;
}
