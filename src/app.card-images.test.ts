//* Node imports
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

//* Libraries imports
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

//* Local imports
import { cardImageStorage } from "./lib/card-image-storage";
import { env } from "./env";
import { eq, inArray } from "drizzle-orm";
import { db } from "./db/index";
import { card, lot, lotItem, user } from "./db/schema";
import { createLot } from "./services/lots/create-lot";

vi.mock("./lib/card-image-storage", async (importOriginal) => {
  const original = await importOriginal<typeof import("./lib/card-image-storage")>();
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "card-images-static-"));

  return {
    cardImageStorage: {
      ...original.cardImageStorage,
      assets: join(root, "cards"),
    },
  };
});

type ListeningServer = {
  stop(): unknown;
  raw?: {
    ready?(): Promise<unknown>;
    node?: { server?: { address(): { port: number } | string | null } };
  };
};

let server: ListeningServer;
let baseUrl: string;

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "production");
  const { app } = await import("./app");
  server = await new Promise<ListeningServer>((resolve) => {
    app.listen({ hostname: "127.0.0.1", port: 0 }, (info) => {
      resolve(info as ListeningServer);
    });
  });
  await server.raw?.ready?.();
  const address = server.raw?.node?.server?.address();

  if (!address || typeof address === "string" || !address.port) {
    throw new Error("Card image test server did not bind a port");
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
  await mkdir(cardImageStorage.assets, { recursive: true });
});

afterAll(async () => {
  await server?.stop();
  vi.unstubAllEnvs();
  await db.$client.end();
  await rm(join(cardImageStorage.assets, ".."), { recursive: true, force: true });
});

describe("card image static plugin", () => {
  it("serves files created after route registration in production with CORS", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
    await writeFile(join(cardImageStorage.assets, "6983839.jpg"), bytes);

    const origin = env.PAGE_ORIGIN;
    const response = await fetch(`${baseUrl}/card-images/6983839.jpg`, {
      headers: { origin },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/jpeg");
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("does not serve index HTML or collide with public API routes", async () => {
    await writeFile(join(cardImageStorage.assets, "index.html"), "Unexpected index");

    const directory = await fetch(`${baseUrl}/card-images`);
    const publicApi = await fetch(`${baseUrl}/public`);

    expect(directory.status).toBe(404);
    expect(publicApi.status).toBe(200);
    expect(await publicApi.text()).toBe("Hello World");
  });

  it("re-downloads a canonical image missing from disk and serves it", async () => {
    const id = 2_000_000_000 + Math.floor(Math.random() * 100_000_000);
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
    const nativeFetch = globalThis.fetch;
    let available = true;
    const provider = vi.fn(async (_url: string) => available
      ? new Response(bytes, { headers: { "content-type": "image/jpeg" } })
      : new Response("Not found", { status: 404 }));
    vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      return url.startsWith("https://images.ygoprodeck.com/") ? provider(url) : nativeFetch(input, init);
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const restored = await fetch(`${baseUrl}/card-images/${id}.jpg`);
      expect(restored.status).toBe(200);
      expect(new Uint8Array(await restored.arrayBuffer())).toEqual(bytes);
      expect(provider).toHaveBeenCalledExactlyOnceWith(`https://images.ygoprodeck.com/images/cards/${id}.jpg`);

      await fetch(`${baseUrl}/card-images/${id}.jpg`);
      expect(provider).toHaveBeenCalledOnce();

      available = false;
      const missing = await fetch(`${baseUrl}/card-images/${id + 1}.jpg`);
      expect(missing.status).toBe(404);
    } finally {
      warn.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});


describe("local card image workflow", () => {
  it("searches, repairs legacy catalog images, publishes and serves a frozen lot while YGOPRODeck is offline", async () => {
    const id = 1_000_000_000 + Math.floor(Math.random() * 100_000_000);
    const auctioneerId = crypto.randomUUID();
    const bytes = new Uint8Array([255, 216, 255, 224, 255, 217]);
    const remote = `https://images.ygoprodeck.com/images/cards/${id}.jpg`;
    const remoteSmall = `https://images.ygoprodeck.com/images/cards_small/${id}.jpg`;
    const payload = {
      id, name: "Frozen Dragon", type: "Effect Monster", humanReadableCardType: "Effect Monster",
      frameType: "effect", desc: "Original description", ygoprodeck_url: null,
      card_images: [{ id, image_url: remote, image_url_small: remoteSmall }],
    };
    const nativeFetch = globalThis.fetch;
    let offline = false;
    let downloadFails = false;
    const provider = vi.fn(async (url: string) => {
      if (offline) throw new Error("YGOPRODeck is unavailable");
      if (url.startsWith("https://db.ygoprodeck.com/")) return Response.json({
        data: [payload], meta: { current_rows: 1, total_rows: 1, rows_remaining: 0 },
      });
      return new Response(bytes, { status: downloadFails ? 503 : 200, headers: { "content-type": "image/jpeg" } });
    });
    vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith("https://db.ygoprodeck.com/") || url.startsWith("https://images.ygoprodeck.com/")) {
        return provider(url);
      }
      return nativeFetch(input, init);
    });
    let lotId: string | undefined;
    try {
      const search = await fetch(`${baseUrl}/public/yugioh/cards/search?id=${id}`);
      expect(search.status).toBe(200);
      const body = await search.json() as { data: (typeof payload & { imagePath: string | null })[]; meta: { total_rows: number } };
      expect(body.data[0]).toEqual({ ...payload, imagePath: `/card-images/${id}.jpg` });
      expect(body.meta.total_rows).toBe(1);
      expect(provider).toHaveBeenCalledTimes(2);

      await fetch(`${baseUrl}/public/yugioh/cards/search?id=${id}`);
      expect(provider).toHaveBeenCalledTimes(3); // Query still goes to provider; image is reused.

      await db.update(card).set({ imagePath: remote }).where(eq(card.id, id));
      await rm(join(cardImageStorage.assets, `${id}.jpg`));
      downloadFails = true;
      const failed = await (await fetch(`${baseUrl}/public/yugioh/cards/search?id=${id}`)).json() as typeof body;
      expect(failed.data[0].imagePath).toBeNull();
      expect(failed.data[0].card_images[0].image_url).toBe(remote);
      await expect(createLot({
        auctioneerId, role: "AUCTIONEER", title: "Missing image", description: null,
        openingBid: "10", minIncrement: "1", startsAt: new Date(), endsAt: new Date(Date.now() + 86_400_000), cardIds: [id],
      })).rejects.toMatchObject({ code: "CARD_WITHOUT_IMAGE", cardIds: [id] });

      downloadFails = false;
      const recovered = await (await fetch(`${baseUrl}/public/yugioh/cards/search?id=${id}`)).json() as typeof body;
      expect(recovered.data[0].imagePath).toBe(`/card-images/${id}.jpg`);
      await db.insert(user).values({ id: auctioneerId, name: "Image Test", email: `${auctioneerId}@example.com`, role: "AUCTIONEER" });
      const created = await createLot({
        auctioneerId, role: "AUCTIONEER", title: "Prepared lot", description: null,
        openingBid: "10", minIncrement: "1", startsAt: new Date(), endsAt: new Date(Date.now() + 86_400_000), cardIds: [id],
      });
      lotId = created.id;
      await db.update(card).set({ name: "New catalog name", raw: { name: "Changed" } }).where(eq(card.id, id));
      offline = true;
      provider.mockClear();
      const shown = await (await fetch(`${baseUrl}/public/lots/${lotId}`)).json() as { lot: { items: { cardSnapshot: Record<string, unknown>; imagePath: string }[] } };
      expect(shown.lot.items[0].cardSnapshot.name).toBe("Frozen Dragon");
      expect(shown.lot.items[0].cardSnapshot).not.toHaveProperty("card_images");
      const image = await fetch(new URL(shown.lot.items[0].imagePath, baseUrl));
      expect(image.status).toBe(200);
      expect(image.headers.get("content-type")).toContain("image/jpeg");
      expect(new Uint8Array(await image.arrayBuffer())).toEqual(bytes);
      expect(provider).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      if (lotId) {
        await db.delete(lotItem).where(eq(lotItem.lotId, lotId));
        await db.delete(lot).where(eq(lot.id, lotId));
      }
      await db.delete(card).where(inArray(card.id, [id]));
      await db.delete(user).where(eq(user.id, auctioneerId));
    }
  });
});
