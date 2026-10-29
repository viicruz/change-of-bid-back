//* Node imports
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

//* Libraries imports
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

//* Local imports
import { cardImageStorage } from "../../lib/card-image-storage";
import { restoreMissingCardImage } from "./restore-card-image";

vi.mock("../../lib/card-image-storage", async () => {
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  return {
    cardImageStorage: {
      assets: await mkdtemp(join(tmpdir(), "card-images-restore-")),
      prefix: "/card-images",
    },
  };
});

const imageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
const download = vi.fn(async (_url: string) => new Response(imageBytes, {
  headers: { "content-type": "image/jpeg" },
}));

beforeEach(async () => {
  download.mockClear();
  await rm(cardImageStorage.assets, { recursive: true, force: true });
});

afterAll(async () => {
  await rm(cardImageStorage.assets, { recursive: true, force: true });
});

describe("restoreMissingCardImage", () => {
  it("downloads a missing canonical image from YGOPRODeck", async () => {
    await expect(restoreMissingCardImage("/card-images/26077387.jpg", download))
      .resolves.toBe("/card-images/26077387.jpg");

    expect(download).toHaveBeenCalledExactlyOnceWith("https://images.ygoprodeck.com/images/cards/26077387.jpg");
    expect(new Uint8Array(await readFile(join(cardImageStorage.assets, "26077387.jpg")))).toEqual(imageBytes);
  });

  it("leaves images already on disk alone", async () => {
    await mkdir(cardImageStorage.assets, { recursive: true });
    await writeFile(join(cardImageStorage.assets, "26077387.jpg"), imageBytes);

    await expect(restoreMissingCardImage("/card-images/26077387.jpg", download)).resolves.toBeUndefined();
    expect(download).not.toHaveBeenCalled();
  });

  it.each([
    "/public/lots",
    "/card-images",
    "/card-images/",
    "/card-images/26077387-0123456789abcdef.jpg",
    "/card-images/26077387.png",
    "/card-images/../26077387.jpg",
    "/card-images/nested/26077387.jpg",
    "/card-images/99999999999999999999.jpg",
  ])("ignores %s", async (pathname) => {
    await expect(restoreMissingCardImage(pathname, download)).resolves.toBeUndefined();
    expect(download).not.toHaveBeenCalled();
  });

  it("propagates download failures", async () => {
    download.mockResolvedValueOnce(new Response("Not found", { status: 404 }));

    await expect(restoreMissingCardImage("/card-images/26077387.jpg", download)).rejects.toThrow(
      "Card image download returned an invalid response",
    );
  });
});
