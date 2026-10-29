//* Node imports
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

//* Libraries imports
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

//* Local imports
import { cardImageStorage } from "../../lib/card-image-storage";
import { downloadCardImage, saveCardImage } from "./save-card-image";

vi.mock("../../lib/card-image-storage", async () => {
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  return {
    cardImageStorage: {
      assets: await mkdtemp(join(tmpdir(), "card-images-origin-")),
      prefix: "/card-images",
    },
  };
});

const imageUrl = "https://images.ygoprodeck.com/images/cards/6983839.jpg";
const imageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
const download = vi.fn(async (_url: string) => new Response(imageBytes, {
  headers: { "content-type": "image/jpeg" },
}));

beforeEach(async () => {
  download.mockClear();
  await rm(cardImageStorage.assets, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await rm(cardImageStorage.assets, { recursive: true, force: true });
});

describe("saveCardImage", () => {
  it.each([
    "http://127.0.0.1:9876/card.jpg",
    "https://localhost/card.jpg",
    "https://127.0.0.1/card.jpg",
    "https://[::1]/card.jpg",
    "https://10.0.0.1/card.jpg",
    "https://172.16.0.1/card.jpg",
    "https://192.168.0.1/card.jpg",
    "https://169.254.169.254/card.jpg",
    "https://[fd00::1]/card.jpg",
    "https://2130706433/card.jpg",
    "https://images.ygoprodeck.com.evil.example/card.jpg",
    "https://evil-images.ygoprodeck.com/card.jpg",
    "https://sub.images.ygoprodeck.com/card.jpg",
    "https://images.ygoprodeck.com./card.jpg",
    "https://db.ygoprodeck.com/card.jpg",
    "https://images.ygoprodeck.com@evil.example/card.jpg",
    "https://user@images.ygoprodeck.com/card.jpg",
    "https://:password@images.ygoprodeck.com/card.jpg",
    "https://user:password@images.ygoprodeck.com/card.jpg",
    "https://images.ygoprodeck.com:444/card.jpg",
    "http://images.ygoprodeck.com/card.jpg",
    "ftp://images.ygoprodeck.com/card.jpg",
    "blob:https://images.ygoprodeck.com/card.jpg",
    "file:///images/cards/card.jpg",
    "//images.ygoprodeck.com/card.jpg",
    "not a URL",
  ])("rejects an untrusted URL before downloading or using cache (%s)", async (url) => {
    await expect(saveCardImage(6983839, url, download)).rejects.toThrow();
    expect(download).not.toHaveBeenCalled();

    await mkdir(cardImageStorage.assets, { recursive: true });
    const cachedFile = join(cardImageStorage.assets, "6983839.jpg");
    await writeFile(cachedFile, imageBytes);

    await expect(saveCardImage(6983839, url, download)).rejects.toThrow();

    expect(download).not.toHaveBeenCalled();
    expect(await readFile(cachedFile)).toEqual(Buffer.from(imageBytes));
  });

  it.each([
    imageUrl,
    "https://IMAGES.YGOPRODECK.COM/images/cards/6983839.jpg",
    "https://images.ygoprodeck.com:443/images/cards/6983839.jpg",
  ])("downloads an image from the normalized expected origin (%s)", async (url) => {
    await expect(saveCardImage(6983839, url, download))
      .resolves.toBe("/card-images/6983839.jpg");

    expect(download).toHaveBeenCalledExactlyOnceWith(imageUrl);
    expect(await readFile(join(cardImageStorage.assets, "6983839.jpg")))
      .toEqual(Buffer.from(imageBytes));
  });

  it("reuses a cached image without downloading it again", async () => {
    await saveCardImage(6983839, imageUrl, download);
    download.mockClear();

    await expect(saveCardImage(6983839, imageUrl, download))
      .resolves.toBe("/card-images/6983839.jpg");

    expect(download).not.toHaveBeenCalled();
    expect(await readFile(join(cardImageStorage.assets, "6983839.jpg")))
      .toEqual(Buffer.from(imageBytes));
  });
});

describe("downloadCardImage", () => {
  it("passes redirect rejection and a 15-second timeout signal to fetch", async () => {
    const response = new Response(imageBytes);
    const fetchImage = vi.fn<typeof fetch>().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchImage);
    const signal = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(signal);

    try {
      await expect(downloadCardImage(imageUrl)).resolves.toBe(response);

      expect(timeout).toHaveBeenCalledExactlyOnceWith(15_000);
      expect(fetchImage).toHaveBeenCalledExactlyOnceWith(imageUrl, {
        redirect: "error",
        signal,
      });
    } finally {
      timeout.mockRestore();
    }
  });
});

describe("atomic image storage", () => {
  it("coalesces simultaneous downloads and exposes only a complete final file", async () => {
    const { readdir } = await import("node:fs/promises");
    const gate = Promise.withResolvers<Response>();
    const fetchImage = vi.fn(() => gate.promise);
    const first = saveCardImage(6983839, imageUrl, fetchImage);
    const second = saveCardImage(6983839, imageUrl, fetchImage);
    await vi.waitFor(() => expect(fetchImage).toHaveBeenCalledOnce());
    await expect(readFile(join(cardImageStorage.assets, "6983839.jpg"))).rejects.toThrow();
    gate.resolve(new Response(imageBytes, { headers: { "content-type": "image/jpeg" } }));
    expect(await Promise.all([first, second])).toEqual(["/card-images/6983839.jpg", "/card-images/6983839.jpg"]);
    expect(await readFile(join(cardImageStorage.assets, "6983839.jpg"))).toEqual(Buffer.from(imageBytes));
    expect(await readdir(cardImageStorage.assets)).toEqual(["6983839.jpg"]);
  });

  it.each([new Uint8Array(), new Uint8Array([255, 216, 255]), new TextEncoder().encode("not an image")])(
    "replaces an invalid legacy file", async (bytes) => {
      await mkdir(cardImageStorage.assets, { recursive: true });
      await writeFile(join(cardImageStorage.assets, "6983839.jpg"), bytes);
      await saveCardImage(6983839, imageUrl, download);
      expect(download).toHaveBeenCalledOnce();
      expect(await readFile(join(cardImageStorage.assets, "6983839.jpg"))).toEqual(Buffer.from(imageBytes));
    },
  );

  it("clears failed concurrent work so a later request can retry", async () => {
    const gate = Promise.withResolvers<Response>();
    const fetchImage = vi.fn(() => gate.promise);
    const first = saveCardImage(6983839, imageUrl, fetchImage);
    const second = saveCardImage(6983839, imageUrl, fetchImage);
    const settled = Promise.allSettled([first, second]);
    await vi.waitFor(() => expect(fetchImage).toHaveBeenCalledOnce());
    gate.reject(new Error("offline"));
    expect((await settled).map((entry) => entry.status)).toEqual(["rejected", "rejected"]);
    await expect(readFile(join(cardImageStorage.assets, "6983839.jpg"))).rejects.toThrow();
    await expect(saveCardImage(6983839, imageUrl, download)).resolves.toBe("/card-images/6983839.jpg");
  });

  it("separates different source variants even when their supplied id is the same", async () => {
    const original = await saveCardImage(6983839, imageUrl, download);
    const variant = await saveCardImage(6983839, imageUrl.replace("/cards/", "/cards_small/"), download);
    expect(variant).not.toBe(original);
    expect(download).toHaveBeenCalledTimes(2);
  });
});
