import { randomUUID, createHash } from "node:crypto";
import { lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { cardImageStorage } from "../../lib/card-image-storage";

export type ImageDownload = (url: string) => Promise<Response>;

// YGOPRODeck allows 20 requests/second; stay below it across every download path.
export const CARD_IMAGE_DOWNLOADS_PER_SECOND = 15;

// Spaces request starts evenly, so no one-second window holds more than `perSecond` starts.
export function rateLimitDownload(download: ImageDownload, perSecond: number): ImageDownload {
  const interval = 1000 / perSecond;
  let nextStart = 0;
  return async (url) => {
    const now = Date.now();
    const start = Math.max(now, nextStart);
    nextStart = start + interval;
    if (start > now) await new Promise((resolve) => setTimeout(resolve, start - now));
    return download(url);
  };
}

export const downloadCardImage: ImageDownload = rateLimitDownload(
  (url) => fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000) }),
  CARD_IMAGE_DOWNLOADS_PER_SECOND,
);

export const CARD_IMAGE_ORIGIN = "https://images.ygoprodeck.com";
const contentTypes = new Map([
  [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"],
  [".png", "image/png"], [".webp", "image/webp"],
]);
const pending = new Map<string, Promise<string>>();

// Check signatures and end/length markers as well as HTTP content type. This also
// rejects empty/truncated files left by older versions of the downloader.
function validImage(bytes: Uint8Array, extension: string): boolean {
  const data = Buffer.from(bytes);
  if (extension === ".jpg" || extension === ".jpeg") {
    return data.length >= 6 && data.subarray(0, 3).equals(Buffer.from([255, 216, 255])) &&
      data.subarray(-2).equals(Buffer.from([255, 217]));
  }
  if (extension === ".png") {
    return data.length >= 20 &&
      data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      data.subarray(-12).equals(Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]));
  }
  return extension === ".webp" && data.length >= 20 &&
    data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP" &&
    data.readUInt32LE(4) === data.length - 8;
}

export async function hasLocalCardImage(imagePath: string | null): Promise<boolean> {
  if (!imagePath || !/^\/card-images\/\d+(?:-[a-f0-9]{16})?\.(?:jpe?g|png|webp)$/.test(imagePath)) {
    return false;
  }
  const filename = imagePath.slice(cardImageStorage.prefix.length + 1);
  const filePath = join(cardImageStorage.assets, filename);
  try {
    if (!(await lstat(filePath)).isFile()) return false;
    return validImage(await readFile(filePath), extname(filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function saveCardImage(
  id: number,
  imageUrl: string,
  download: ImageDownload,
): Promise<string> {
  const url = new URL(imageUrl);
  const extension = extname(url.pathname);
  const contentType = contentTypes.get(extension);
  if (url.protocol !== "https:" || url.origin !== CARD_IMAGE_ORIGIN || url.username || url.password) {
    throw new Error("Invalid card image origin");
  }
  if (!Number.isSafeInteger(id) || id < 0 || !contentType) {
    throw new Error("Invalid card image path");
  }

  // Canonical full-size images retain existing filenames. Other references get
  // their own key, so alternate artwork/variants cannot overwrite a frozen image.
  const canonical = url.pathname === `/images/cards/${id}${extension}` && !url.search;
  const suffix = canonical ? "" : `-${createHash("sha256").update(url.href).digest("hex").slice(0, 16)}`;
  const filename = `${id}${suffix}${extension}`;
  const filePath = join(cardImageStorage.assets, filename);
  const imagePath = `${cardImageStorage.prefix}/${filename}`;
  const existing = pending.get(filePath);
  if (existing) return existing;

  const task = (async () => {
    if (await hasLocalCardImage(imagePath)) return imagePath;
    const response = await download(url.href);
    const receivedType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (!response.ok || receivedType !== contentType) {
      throw new Error("Card image download returned an invalid response");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!validImage(bytes, extension)) throw new Error("Card image download returned an invalid file");

    await mkdir(cardImageStorage.assets, { recursive: true });
    const temporary = join(cardImageStorage.assets, `.${filename}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, bytes, { flag: "wx" });
      // Atomic on the same filesystem, including across independent processes.
      await rename(temporary, filePath);
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
    return imagePath;
  })();
  pending.set(filePath, task);
  try {
    return await task;
  } finally {
    if (pending.get(filePath) === task) pending.delete(filePath);
  }
}
