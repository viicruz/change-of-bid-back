//* Libraries imports
import { describe, expect, it, vi } from "vitest";

//* Schemas imports
import type { Card } from "../../schemas/ygo-pro-deck";

//* Local imports
import {
  saveUnregisteredCards,
  type CardCatalog,
} from "./save-unregistered-cards";

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
    findExistingIds: vi.fn(async (ids: number[]) => {
      return ids.filter((id) => existingIds.includes(id));
    }),
    insertCards: vi.fn(async () => undefined),
  };

  return catalog;
}

describe("saveUnregisteredCards", () => {
  it("does not query the database when the search returns no cards", async () => {
    const catalog = createCatalog();

    await saveUnregisteredCards([], catalog);

    expect(catalog.findExistingIds).not.toHaveBeenCalled();
    expect(catalog.insertCards).not.toHaveBeenCalled();
  });

  it("inserts only cards whose ids are not in the database", async () => {
    const catalog = createCatalog([tornadoDragon.id]);

    await saveUnregisteredCards([tornadoDragon, decodeTalker], catalog);

    expect(catalog.findExistingIds).toHaveBeenCalledWith([
      tornadoDragon.id,
      decodeTalker.id,
    ]);
    expect(catalog.insertCards).toHaveBeenCalledTimes(1);
    expect(catalog.insertCards).toHaveBeenCalledWith([
      expect.objectContaining({
        id: decodeTalker.id,
        name: "Decode Talker",
        def: null,
      }),
    ]);
  });

  it("leaves cards that are already registered unchanged", async () => {
    const catalog = createCatalog([tornadoDragon.id, decodeTalker.id]);

    await saveUnregisteredCards([tornadoDragon, decodeTalker], catalog);

    expect(catalog.findExistingIds).toHaveBeenCalledOnce();
    expect(catalog.insertCards).not.toHaveBeenCalled();
  });

  it("inserts one row when the same card id appears twice", async () => {
    const catalog = createCatalog();
    const renamed = { ...tornadoDragon, name: "Tornado Dragon (reprint)" };

    await saveUnregisteredCards([tornadoDragon, renamed], catalog);

    expect(catalog.findExistingIds).toHaveBeenCalledWith([tornadoDragon.id]);
    expect(catalog.insertCards).toHaveBeenCalledWith([
      expect.objectContaining({
        id: tornadoDragon.id,
        name: "Tornado Dragon",
      }),
    ]);
  });

  it("maps the api payload onto catalog columns", async () => {
    const catalog = createCatalog();

    await saveUnregisteredCards([tornadoDragon], catalog);

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
        imagePath: tornadoDragon.card_images[0]?.image_url,
        fetchedAt: expect.any(Date),
      }),
    ]);
  });
});
