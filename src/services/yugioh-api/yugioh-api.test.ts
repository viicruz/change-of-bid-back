//* Libraries imports
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

//* Schemas imports
import type { Card } from "../../schemas/ygo-pro-deck";

//* Local imports
import {
  RequestRateGate,
  YGOProDeckApiClient,
  YGOProDeckApiError,
} from "./yugioh-api";

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

const condemnedDarklord = {
  id: 35306215,
  name: "Condemned Darklord",
  type: "Link Monster",
  humanReadableCardType: "Link Monster",
  frameType: "link",
  desc: "2 Effect Monsters",
  atk: 1600,
  def: null,
  level: null,
  linkval: 2,
  linkmarkers: ["Bottom-Left", "Bottom-Right"],
  race: "Fiend",
  attribute: "DARK",
  ygoprodeck_url: "https://ygoprodeck.com/card/condemned-darklord-35306215",
  card_images: [
    {
      id: 35306215,
      image_url: "https://images.ygoprodeck.com/images/cards/35306215.jpg",
      image_url_small: "https://images.ygoprodeck.com/images/cards_small/35306215.jpg",
    },
  ],
  card_prices: [
    {
      cardmarket_price: "0.18",
      tcgplayer_price: "0.22",
      ebay_price: "1.49",
      amazon_price: "0.50",
      coolstuffinc_price: "0.49",
    },
  ],
} satisfies Card;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createClient(fetchImpl: (url: string) => Promise<Response>) {
  return new YGOProDeckApiClient({
    fetch: fetchImpl,
    gate: new RequestRateGate(),
  });
}

describe("YGOProDeckApiClient", () => {
  describe("searchCards", () => {
    it("builds the query string from lists and numeric comparisons", async () => {
      const fetchMock = vi.fn(async (_url: string) => jsonResponse({ data: [tornadoDragon] }));
      const client = createClient(fetchMock);

      await client.searchCards({
        name: ["Baby Dragon", "Time Wizard"],
        fname: "Dragon",
        type: ["Effect Monster", "Normal Monster"],
        race: ["Dragon", "Spellcaster"],
        attribute: ["LIGHT", "DARK"],
        linkmarker: ["Top", "Bottom"],
        atk: { operator: "gte", value: 2500 },
        def: 2000,
        level: { operator: "lte", value: 8 },
        link: 2,
        scale: 8,
        cardset: "Metal Raiders",
        archetype: "Blue-Eyes",
        banlist: "tcg",
        sort: "atk",
        format: "tcg",
        misc: true,
        staple: true,
        has_effect: false,
        startdate: "2000-01-01",
        enddate: "2002-08-23",
        dateregion: "tcg",
        language: "pt",
        num: 5,
        offset: 10,
      });

      const url = new URL(fetchMock.mock.calls[0][0]);

      expect(`${url.origin}${url.pathname}`).toBe(
        "https://db.ygoprodeck.com/api/v7/cardinfo.php",
      );
      expect(url.searchParams.get("name")).toBe("Baby Dragon|Time Wizard");
      expect(url.searchParams.get("fname")).toBe("Dragon");
      expect(url.searchParams.get("type")).toBe("Effect Monster,Normal Monster");
      expect(url.searchParams.get("race")).toBe("Dragon,Spellcaster");
      expect(url.searchParams.get("attribute")).toBe("LIGHT,DARK");
      expect(url.searchParams.get("linkmarker")).toBe("Top,Bottom");
      expect(url.searchParams.get("atk")).toBe("gte2500");
      expect(url.searchParams.get("def")).toBe("2000");
      expect(url.searchParams.get("level")).toBe("lte8");
      expect(url.searchParams.get("link")).toBe("2");
      expect(url.searchParams.get("scale")).toBe("8");
      expect(url.searchParams.get("cardset")).toBe("Metal Raiders");
      expect(url.searchParams.get("archetype")).toBe("Blue-Eyes");
      expect(url.searchParams.get("banlist")).toBe("tcg");
      expect(url.searchParams.get("sort")).toBe("atk");
      expect(url.searchParams.get("format")).toBe("tcg");
      expect(url.searchParams.get("misc")).toBe("yes");
      expect(url.searchParams.get("staple")).toBe("yes");
      expect(url.searchParams.get("has_effect")).toBe("false");
      expect(url.searchParams.get("startdate")).toBe("2000-01-01");
      expect(url.searchParams.get("enddate")).toBe("2002-08-23");
      expect(url.searchParams.get("dateregion")).toBe("tcg");
      expect(url.searchParams.get("language")).toBe("pt");
      expect(url.searchParams.get("num")).toBe("5");
      expect(url.searchParams.get("offset")).toBe("10");
    });

    it("sends a page size of 32 and an offset of 0 when they are omitted", async () => {
      const fetchMock = vi.fn(async (_url: string) => jsonResponse({ data: [tornadoDragon] }));
      const client = createClient(fetchMock);

      await client.searchCards({ fname: "Dragon" });

      const url = new URL(fetchMock.mock.calls[0][0]);

      expect(url.searchParams.get("num")).toBe("32");
      expect(url.searchParams.get("offset")).toBe("0");
    });

    it("joins card ids with commas", async () => {
      const fetchMock = vi.fn(async (_url: string) => jsonResponse({ data: [tornadoDragon] }));
      const client = createClient(fetchMock);

      await client.searchCards({ id: [6983839, 46986414] });

      const url = new URL(fetchMock.mock.calls[0][0]);

      expect(url.searchParams.get("id")).toBe("6983839,46986414");
      expect(url.searchParams.get("name")).toBeNull();
    });

    it("returns a link monster when its level is null", async () => {
      const fetchMock = vi.fn(async () => jsonResponse({
        data: [condemnedDarklord],
        meta: {
          current_rows: 1,
          total_rows: 1,
          rows_remaining: 0,
        },
      }));
      const client = createClient(fetchMock);

      const result = await client.searchCards({ fname: "dark" });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.name).toBe("Condemned Darklord");
      expect(result.data[0]?.level).toBeNull();
      expect(result.data[0]?.def).toBeNull();
    });

    it("returns the parsed cards when the response matches the schema", async () => {
      const fetchMock = vi.fn(async () => jsonResponse({
        data: [tornadoDragon],
        meta: {
          current_rows: 1,
          total_rows: 1,
          rows_remaining: 0,
        },
      }));
      const client = createClient(fetchMock);

      const result = await client.searchCards({ fname: "Tornado" });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.name).toBe("Tornado Dragon");
      expect(result.meta?.total_rows).toBe(1);
    });

    it("throws the API message when the body is an error", async () => {
      const fetchMock = vi.fn(async () => jsonResponse(
        { error: "No card matching your query was found in the database." },
        400,
      ));
      const client = createClient(fetchMock);

      await expect(client.searchCards({ fname: "Missing" })).rejects.toThrow(
        new YGOProDeckApiError(
          "No card matching your query was found in the database.",
        ),
      );
    });

    it("throws when the response body is not valid JSON", async () => {
      const fetchMock = vi.fn(async () => new Response("nope", { status: 502 }));
      const client = createClient(fetchMock);

      await expect(client.searchCards({ fname: "Tornado" })).rejects.toThrow(
        new YGOProDeckApiError("Response body is not valid JSON"),
      );
    });

    it("throws when the response body does not match the schema", async () => {
      const fetchMock = vi.fn(async () => jsonResponse({ data: [{ id: 1 }] }));
      const client = createClient(fetchMock);

      await expect(client.searchCards({ fname: "Tornado" })).rejects.toThrow(
        YGOProDeckApiError,
      );
    });

    it("throws when name and id are used together", async () => {
      const fetchMock = vi.fn(async () => jsonResponse({ data: [tornadoDragon] }));
      const client = createClient(fetchMock);

      await expect(client.searchCards({
        name: "Dark Magician",
        id: 46986414,
      })).rejects.toThrow(
        new YGOProDeckApiError("name and id cannot be used together"),
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("rate limit", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("sends 16 simultaneous searches without waiting", async () => {
      const fetchMock = vi.fn(async () => jsonResponse({ data: [tornadoDragon] }));
      const client = createClient(fetchMock);
      const pending = Promise.all(
        Array.from({ length: 16 }, () => client.searchCards({ fname: "Magician" })),
      );

      await vi.advanceTimersByTimeAsync(0);

      expect(fetchMock).toHaveBeenCalledTimes(16);
      await pending;
    });

    it("waits 1 second before sending the 17th search", async () => {
      const fetchMock = vi.fn(async () => jsonResponse({ data: [tornadoDragon] }));
      const client = createClient(fetchMock);
      const pending = Promise.all(
        Array.from({ length: 17 }, () => client.searchCards({ fname: "Magician" })),
      );

      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(16);

      await vi.advanceTimersByTimeAsync(999);
      expect(fetchMock).toHaveBeenCalledTimes(16);

      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(17);
      await pending;
    });

    it("sends the next 16 searches after that single wait", async () => {
      const fetchMock = vi.fn(async () => jsonResponse({ data: [tornadoDragon] }));
      const client = createClient(fetchMock);
      const pending = Promise.all(
        Array.from({ length: 32 }, () => client.searchCards({ fname: "Magician" })),
      );

      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(16);

      await vi.advanceTimersByTimeAsync(1000);
      expect(fetchMock).toHaveBeenCalledTimes(32);
      await pending;
    });
  });
});
