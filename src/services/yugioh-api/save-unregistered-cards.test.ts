//* Node imports
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

//* Libraries imports
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

//* Schemas imports
import type { Card } from "../../schemas/ygo-pro-deck";

//* Local imports
import { cardImageStorage } from "../../lib/card-image-storage";
import {
  saveUnregisteredCards,
  type CardCatalog,
} from "./save-unregistered-cards";

vi.mock("../../lib/card-image-storage", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/card-image-storage")>();
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  return {
    cardImageStorage: {
      ...original.cardImageStorage,
      assets: await mkdtemp(join(tmpdir(), "card-images-catalog-")),
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

const tornadoDragon = {
  id: 6983839,
  name: "Tornado Dragon",
  type: "XYZ Monster",
  humanReadableCardType: "Xyz Monster",
  frameType: "xyz",
  desc: "2 Level 4 monsters",
  atk: 2100,
  def: 2000,
  level: 4,
  race: "Wyrm",
  attribute: "WIND",
  ygoprodeck_url: "https://ygoprodeck.com/card/tornado-dragon-6983839",
  card_images: [
    {
      id: 6983839,
      image_url: "https://images.ygoprodeck.com/images/cards/6983839.jpg",
      image_url_small: "https://images.ygoprodeck.com/images/cards_small/6983839.jpg",
    },
  ],
  card_prices: [
    {
      cardmarket_price: "0.42",
      tcgplayer_price: "0.48",
      ebay_price: "2.99",
      amazon_price: "0.77",
      coolstuffinc_price: "0.99",
    },
  ],
} satisfies Card;

const decodeTalker = {
  id: 1861629,
  name: "Decode Talker",
  type: "Link Monster",
  humanReadableCardType: "Link Effect Monster",
  frameType: "link",
  desc: "2+ Effect Monsters",
  atk: 2300,
  def: null,
  race: "Cyberse",
  attribute: "DARK",
  ygoprodeck_url: "https://ygoprodeck.com/card/decode-talker-1861629",
  card_images: [
    {
      id: 1861629,
      image_url: "https://images.ygoprodeck.com/images/cards/1861629.jpg",
      image_url_small: "https://images.ygoprodeck.com/images/cards_small/1861629.jpg",
    },
  ],
  card_prices: [
    {
      cardmarket_price: "0.10",
      tcgplayer_price: "0.14",
      ebay_price: "1.00",
      amazon_price: "0.50",
      coolstuffinc_price: "0.25",
    },
  ],
} satisfies Card;

function createCatalog(existingIds: number[] = []) {
  const catalog: CardCatalog = {
    findExistingCards: vi.fn(async (ids: number[]) => {
      return ids.filter((id) => existingIds.includes(id)).map((id) => ({
        id, imagePath: `/card-images/${id}.jpg`, raw: id === tornadoDragon.id ? tornadoDragon : decodeTalker,
      }));
    }),
    insertCards: vi.fn(async () => undefined),
    updateImagePath: vi.fn(async () => undefined),
  };

  return catalog;
}

describe("saveUnregisteredCards", () => {
  it.each(["https://images.ygoprodeck.com/images/cards/6983839.jpg", null])(
    "repairs a registered legacy path (%s) without inserting or refreshing the row", async (imagePath) => {
      const catalog = createCatalog();
      const raw = { ...tornadoDragon, name: "Frozen catalog name" };
      catalog.findExistingCards = vi.fn(async () => [{ id: tornadoDragon.id, raw, imagePath }]);
      const paths = await saveUnregisteredCards([tornadoDragon], catalog, download);
      expect(paths.get(tornadoDragon.id)).toBe("/card-images/6983839.jpg");
      expect(catalog.updateImagePath).toHaveBeenCalledExactlyOnceWith(tornadoDragon.id, "/card-images/6983839.jpg");
      expect(catalog.insertCards).not.toHaveBeenCalled();
      expect(raw.name).toBe("Frozen catalog name");
    },
  );

  it("returns no local availability when repairing a missing file fails", async () => {
    const catalog = createCatalog([tornadoDragon.id]);
    download.mockRejectedValueOnce(new Error("offline"));
    const paths = await saveUnregisteredCards([tornadoDragon], catalog, download);
    expect(paths.has(tornadoDragon.id)).toBe(false);
    expect(catalog.updateImagePath).not.toHaveBeenCalled();
    expect(download).toHaveBeenCalledOnce();
  });

  it("does not query the database when the search returns no cards", async () => {
    const catalog = createCatalog();

    await saveUnregisteredCards([], catalog, download);

    expect(catalog.findExistingCards).not.toHaveBeenCalled();
    expect(catalog.insertCards).not.toHaveBeenCalled();
  });

  it("inserts only cards whose ids are not in the database", async () => {
    const catalog = createCatalog([tornadoDragon.id]);

    await saveUnregisteredCards([tornadoDragon, decodeTalker], catalog, download);

    expect(catalog.findExistingCards).toHaveBeenCalledWith([
      tornadoDragon.id,
      decodeTalker.id,
    ]);
    expect(catalog.insertCards).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledTimes(2);
    expect(catalog.insertCards).toHaveBeenCalledWith([
      expect.objectContaining({
        id: decodeTalker.id,
        name: "Decode Talker",
        def: null,
      }),
    ]);
  });

  it("reuses valid local images of registered cards without changing metadata", async () => {
    await mkdir(cardImageStorage.assets, { recursive: true });
    await writeFile(join(cardImageStorage.assets, "6983839.jpg"), imageBytes);
    await writeFile(join(cardImageStorage.assets, "1861629.jpg"), imageBytes);
    const catalog = createCatalog([tornadoDragon.id, decodeTalker.id]);

    await saveUnregisteredCards([tornadoDragon, decodeTalker], catalog, download);

    expect(catalog.findExistingCards).toHaveBeenCalledOnce();
    expect(catalog.insertCards).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("inserts one row when the same card id appears twice", async () => {
    const catalog = createCatalog();
    const renamed = { ...tornadoDragon, name: "Tornado Dragon (reprint)" };

    await saveUnregisteredCards([tornadoDragon, renamed], catalog, download);

    expect(catalog.findExistingCards).toHaveBeenCalledWith([tornadoDragon.id]);
    expect(catalog.insertCards).toHaveBeenCalledWith([
      expect.objectContaining({
        id: tornadoDragon.id,
        name: "Tornado Dragon",
      }),
    ]);
  });

  it("maps the api payload onto catalog columns", async () => {
    const catalog = createCatalog();

    await saveUnregisteredCards([tornadoDragon], catalog, download);

    expect(catalog.insertCards).toHaveBeenCalledWith([
      expect.objectContaining({
        id: tornadoDragon.id,
        name: tornadoDragon.name,
        type: tornadoDragon.type,
        frameType: tornadoDragon.frameType,
        description: tornadoDragon.desc,
        race: tornadoDragon.race,
        attribute: tornadoDragon.attribute,
        atk: tornadoDragon.atk,
        def: tornadoDragon.def,
        level: tornadoDragon.level,
        raw: tornadoDragon,
        imagePath: "/card-images/6983839.jpg",
        fetchedAt: expect.any(Date),
      }),
    ]);
    expect(await readFile(join(cardImageStorage.assets, "6983839.jpg")))
      .toEqual(Buffer.from(imageBytes));
  });

  it("skips a failed download and inserts the next card without storing remote URLs", async () => {
    const catalog = createCatalog();
    download.mockRejectedValueOnce(new Error("Download failed"));

    await saveUnregisteredCards([tornadoDragon, decodeTalker], catalog, download);

    expect(download).toHaveBeenCalledTimes(2);
    expect(catalog.insertCards).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ id: decodeTalker.id, imagePath: "/card-images/1861629.jpg" }),
    ]);
  });

  it("does not insert a card when its only download fails and can try again later", async () => {
    const catalog = createCatalog();
    download.mockRejectedValueOnce(new Error("Download failed"));

    await saveUnregisteredCards([tornadoDragon], catalog, download);
    expect(catalog.insertCards).not.toHaveBeenCalled();

    await saveUnregisteredCards([tornadoDragon], catalog, download);
    expect(catalog.insertCards).toHaveBeenCalledOnce();
    expect(download).toHaveBeenCalledTimes(2);
  });

  it("skips an untrusted image URL before downloading and continues with the next card", async () => {
    const catalog = createCatalog();
    const untrusted = {
      ...tornadoDragon,
      card_images: [{
        ...tornadoDragon.card_images[0],
        image_url: "https://127.0.0.1/card.jpg",
      }],
    };

    await saveUnregisteredCards([untrusted, decodeTalker], catalog, download);

    expect(download).toHaveBeenCalledExactlyOnceWith(decodeTalker.card_images[0].image_url);
    expect(catalog.insertCards).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ id: decodeTalker.id, imagePath: "/card-images/1861629.jpg" }),
    ]);
  });

  it.each([undefined, null, []])("does not download or insert a card without images (%s)", async (cardImages) => {
    const catalog = createCatalog();

    await saveUnregisteredCards([{ ...tornadoDragon, card_images: cardImages }], catalog, download);

    expect(download).not.toHaveBeenCalled();
    expect(catalog.insertCards).not.toHaveBeenCalled();
  });

  it("downloads only the first image and finishes writing before inserting", async () => {
    const catalog = createCatalog();
    catalog.insertCards = vi.fn(async () => {
      expect(await readFile(join(cardImageStorage.assets, "6983839.jpg")))
        .toEqual(Buffer.from(imageBytes));
    });

    await saveUnregisteredCards([{
      ...tornadoDragon,
      card_images: [...tornadoDragon.card_images, ...decodeTalker.card_images],
    }], catalog, download);

    expect(download).toHaveBeenCalledExactlyOnceWith(tornadoDragon.card_images[0].image_url);
    expect(catalog.insertCards).toHaveBeenCalledOnce();
  });

  it.each([
    ["jpg", "image/jpeg"],
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"],
  ])("stores a %s image using the card id and URL extension", async (extension, contentType) => {
    const catalog = createCatalog();
    download.mockResolvedValueOnce(new Response(extension === "png"
      ? Buffer.from("89504e470d0a1a0a0000000049454e44ae426082", "hex")
      : extension === "webp" ? Buffer.from("524946460c000000574542505650384c00000000", "hex") : imageBytes, {
      headers: { "content-type": contentType },
    }));
    const entry = {
      ...tornadoDragon,
      card_images: [{ ...tornadoDragon.card_images[0], image_url: `https://images.ygoprodeck.com/images/cards/6983839.${extension}` }],
    };

    await saveUnregisteredCards([entry], catalog, download);

    expect(catalog.insertCards).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ imagePath: `/card-images/6983839.${extension}`, raw: entry }),
    ]);
  });

  it.each(["gif", "svg", "jpg/other", "jpg%2fother", "jpg.exe"])(
    "rejects an unsupported or unsafe image extension (%s) before downloading",
    async (extension) => {
      const catalog = createCatalog();
      const entry = {
        ...tornadoDragon,
        card_images: [{ ...tornadoDragon.card_images[0], image_url: `https://images.ygoprodeck.com/images/cards/6983839.${extension}` }],
      };

      await saveUnregisteredCards([entry], catalog, download);

      expect(download).not.toHaveBeenCalled();
      expect(catalog.insertCards).not.toHaveBeenCalled();
    },
  );

  it.each(["text/html", "image/gif", "image/png", "application/octet-stream", ""])(
    "does not insert a JPEG with an invalid content type (%s)",
    async (contentType) => {
      const catalog = createCatalog();
      download.mockResolvedValueOnce(new Response(imageBytes, { headers: { "content-type": contentType } }));

      await saveUnregisteredCards([tornadoDragon], catalog, download);

      expect(catalog.insertCards).not.toHaveBeenCalled();
    },
  );

  it("does not insert a failed HTTP response", async () => {
    const catalog = createCatalog();
    download.mockResolvedValueOnce(new Response(imageBytes, { status: 503, headers: { "content-type": "image/jpeg" } }));

    await saveUnregisteredCards([tornadoDragon], catalog, download);

    expect(download).toHaveBeenCalledOnce();
    expect(catalog.insertCards).not.toHaveBeenCalled();
  });

  it("waits for each download before starting the next one", async () => {
    const catalog = createCatalog();
    const firstDownload = Promise.withResolvers<Response>();
    download.mockImplementationOnce(() => firstDownload.promise);

    const saving = saveUnregisteredCards([tornadoDragon, decodeTalker], catalog, download);
    await vi.waitFor(() => expect(download).toHaveBeenCalledExactlyOnceWith(tornadoDragon.card_images[0].image_url));
    firstDownload.resolve(new Response(imageBytes, { headers: { "content-type": "image/jpeg" } }));
    await saving;

    expect(download).toHaveBeenCalledTimes(2);
    expect(catalog.insertCards).toHaveBeenCalledOnce();
  });

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects an invalid card id (%s) before downloading",
    async (id) => {
      const catalog = createCatalog();

      await saveUnregisteredCards([{ ...tornadoDragon, id }], catalog, download);

      expect(download).not.toHaveBeenCalled();
      expect(catalog.insertCards).not.toHaveBeenCalled();
    },
  );

  it("does not insert an empty image", async () => {
    const catalog = createCatalog();
    download.mockResolvedValueOnce(new Response(null, { headers: { "content-type": "image/jpeg" } }));

    await saveUnregisteredCards([tornadoDragon], catalog, download);

    expect(catalog.insertCards).not.toHaveBeenCalled();
  });

  it("skips a failed file write and continues with the next card", async () => {
    const catalog = createCatalog();
    await mkdir(join(cardImageStorage.assets, "6983839.jpg"), { recursive: true });

    await saveUnregisteredCards([tornadoDragon, decodeTalker], catalog, download);

    expect(catalog.insertCards).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ id: decodeTalker.id, imagePath: "/card-images/1861629.jpg" }),
    ]);
  });

  it("does not insert a card when the storage directory cannot be created", async () => {
    const catalog = createCatalog();
    await writeFile(cardImageStorage.assets, "Not a directory");

    await saveUnregisteredCards([tornadoDragon], catalog, download);

    expect(catalog.insertCards).not.toHaveBeenCalled();
  });
});
