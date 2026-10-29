import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { relations } from "../db/schema";
import { cardImageStorage } from "../lib/card-image-storage";
import { backfillCardImages } from "../services/yugioh-api/backfill-card-images";
import { cardImageBackfillStore } from "./card-image-backfill";

vi.mock("../lib/card-image-storage", async () => {
  const { tmpdir } = await import("node:os");
  return { cardImageStorage: { assets: await mkdtemp(join(tmpdir(), "backfill-db-images-")), prefix: "/card-images" } };
});

// Dedicated schema: the backfill cannot scan or modify the application's tables.
const schema = `image_test_${randomUUID().replaceAll("-", "")}`;
const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}` });
const executor = drizzle({ client: pool, relations });
const remote = (id: number) => `https://images.ygoprodeck.com/images/cards/${id}.jpg`;

beforeAll(async () => {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await pool.query(`CREATE TABLE card (id integer PRIMARY KEY, image_path text, raw jsonb NOT NULL, untouched text)`);
  await pool.query(`CREATE TABLE lot_item (id uuid PRIMARY KEY, card_id integer, image_path text, card_snapshot jsonb NOT NULL, untouched text)`);
});
afterAll(async () => {
  await pool.end();
  await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.end();
  await rm(cardImageStorage.assets, { recursive: true, force: true });
});

it("pages through catalog and lot items and persists only image_path on repeated runs", async () => {
  for (let id = 1; id <= 101; id++) {
    await pool.query("INSERT INTO card VALUES ($1,$2,$3,$4)", [id, remote(id), { name: `Current ${id}`, card_images: [{ id, image_url: remote(id) }] }, "untouched catalog"]);
    await pool.query("INSERT INTO lot_item VALUES ($1,$2,$3,$4,$5)", [randomUUID(), id, remote(id), { name: `Frozen ${id}`, desc: "Old description", card_images: [{ id: 1000 + id, image_url: remote(1000 + id) }] }, "untouched item"]);
  }
  const beforeCards = (await pool.query("SELECT * FROM card ORDER BY id")).rows;
  const beforeItems = (await pool.query("SELECT * FROM lot_item ORDER BY id")).rows;
  const download = vi.fn(async () => new Response(new Uint8Array([255, 216, 255, 224, 255, 217]), { headers: { "content-type": "image/jpeg" } }));
  const store = cardImageBackfillStore(executor);
  const result = await backfillCardImages(store, download);
  expect(result.card).toEqual({ scanned: 101, updated: 101, unchanged: 0, failed: 0 });
  expect(result.lot_item).toEqual({ scanned: 101, updated: 101, unchanged: 0, failed: 0 });
  const afterCards = (await pool.query("SELECT * FROM card ORDER BY id")).rows;
  const afterItems = (await pool.query("SELECT * FROM lot_item ORDER BY id")).rows;
  expect(afterCards).toEqual(beforeCards.map((row) => ({ ...row, image_path: `/card-images/${row.id}.jpg` })));
  expect(afterItems).toEqual(beforeItems.map((row) => ({ ...row, image_path: `/card-images/${1000 + row.card_id}.jpg` })));
  download.mockClear().mockRejectedValue(new Error("offline"));
  const rerun = await backfillCardImages(store, download);
  expect(rerun.card.unchanged).toBe(101);
  expect(rerun.lot_item.unchanged).toBe(101);
  expect(download).not.toHaveBeenCalled();
});
