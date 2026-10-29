import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cardImageStorage } from "../../lib/card-image-storage";
import { backfillCardImages, type ImageBackfillRow, type ImageBackfillStore } from "./backfill-card-images";

vi.mock("../../lib/card-image-storage", async () => {
  const { tmpdir } = await import("node:os");
  return { cardImageStorage: { assets: await mkdtemp(join(tmpdir(), "card-backfill-")), prefix: "/card-images" } };
});
const bytes = new Uint8Array([255, 216, 255, 224, 255, 217]);
const url = (id: number) => `https://images.ygoprodeck.com/images/cards/${id}.jpg`;
const snapshot = (id: number) => ({ name: "Frozen name", desc: "Frozen text", card_images: [{ id, image_url: url(id) }] });
const download = vi.fn(async (_url: string) => new Response(bytes, { headers: { "content-type": "image/jpeg" } }));

function storeFor(rows: ImageBackfillRow[]) {
  const store: ImageBackfillStore = {
    async *rows() { yield* rows; },
    updateImagePath: vi.fn(async (row, imagePath) => { row.imagePath = imagePath; }),
  };
  return store;
}

beforeEach(async () => {
  download.mockReset().mockImplementation(async () => new Response(bytes, { headers: { "content-type": "image/jpeg" } }));
  await rm(cardImageStorage.assets, { recursive: true, force: true });
});
afterAll(async () => { await rm(cardImageStorage.assets, { recursive: true, force: true }); });

describe("backfillCardImages", () => {
  it("uses each item's frozen artwork, changes only locations, and is safe to rerun offline", async () => {
    const rows: ImageBackfillRow[] = [
      { table: "card", id: 1, cardId: 1, imagePath: url(1), snapshot: snapshot(1) },
      { table: "lot_item", id: "item", cardId: 1, imagePath: url(1), snapshot: snapshot(99) },
    ];
    const before = structuredClone(rows);
    const store = storeFor(rows);
    expect(await backfillCardImages(store, download)).toEqual({
      card: { scanned: 1, updated: 1, unchanged: 0, failed: 0 },
      lot_item: { scanned: 1, updated: 1, unchanged: 0, failed: 0 },
    });
    expect(rows.map((row) => row.imagePath)).toEqual(["/card-images/1.jpg", "/card-images/99.jpg"]);
    expect(rows.map(({ imagePath: _, ...rest }) => rest)).toEqual(before.map(({ imagePath: _, ...rest }) => rest));
    expect(download.mock.calls.map(([source]) => source)).toEqual([url(1), url(99)]);
    expect(await readFile(join(cardImageStorage.assets, "99.jpg"))).toEqual(Buffer.from(bytes));
    download.mockClear().mockRejectedValue(new Error("offline"));
    const rerun = await backfillCardImages(store, download);
    expect(rerun.card.unchanged).toBe(1);
    expect(rerun.lot_item.unchanged).toBe(1);
    expect(download).not.toHaveBeenCalled();
    expect(store.updateImagePath).toHaveBeenCalledTimes(2);
  });

  it("recovers missing files, reuses valid local paths without a source, and isolates failures", async () => {
    await mkdir(cardImageStorage.assets, { recursive: true });
    await writeFile(join(cardImageStorage.assets, "3.jpg"), bytes);
    const rows: ImageBackfillRow[] = [
      { table: "card", id: 1, cardId: 1, imagePath: "/card-images/1.jpg", snapshot: snapshot(1) },
      { table: "lot_item", id: "missing-ref", cardId: 2, imagePath: "/card-images/2.jpg", snapshot: {} },
      { table: "lot_item", id: "local", cardId: 3, imagePath: "/card-images/3.jpg", snapshot: {} },
      { table: "lot_item", id: "remote", cardId: 4, imagePath: url(4), snapshot: {} },
      { table: "card", id: 5, cardId: 5, imagePath: null, snapshot: snapshot(5) },
    ];
    download.mockRejectedValueOnce(new Error("offline"));
    const failure = vi.fn();
    const result = await backfillCardImages(storeFor(rows), download, failure);
    expect(result.card).toEqual({ scanned: 2, updated: 1, unchanged: 0, failed: 1 });
    expect(result.lot_item).toEqual({ scanned: 3, updated: 1, unchanged: 1, failed: 1 });
    expect(failure.mock.calls.map(([row]) => row.id)).toEqual([1, "missing-ref"]);
    expect(rows[0]?.imagePath).toBe("/card-images/1.jpg");
    expect(rows[1]?.imagePath).toBe("/card-images/2.jpg");
  });

  it("waits for each download and continues after a persistence error", async () => {
    const rows: ImageBackfillRow[] = [1, 2].map((id) => ({ table: "card", id, cardId: id, imagePath: null, snapshot: snapshot(id) }));
    const store = storeFor(rows);
    const gate = Promise.withResolvers<Response>();
    download.mockImplementationOnce(() => gate.promise);
    vi.mocked(store.updateImagePath).mockRejectedValueOnce(new Error("database write failed"));
    const run = backfillCardImages(store, download);
    await vi.waitFor(() => expect(download).toHaveBeenCalledExactlyOnceWith(url(1)));
    gate.resolve(new Response(bytes, { headers: { "content-type": "image/jpeg" } }));
    expect((await run).card).toEqual({ scanned: 2, updated: 1, unchanged: 0, failed: 1 });
    const result = await backfillCardImages(store, download);
    expect(result.card.failed).toBe(0);
    expect(download).toHaveBeenCalledTimes(2);
  });
});
