//* Libraries imports
import { inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";

//* Local imports
import { app } from "../../app";
import { db } from "../../db/index";
import { card, lot, lotItem, user } from "../../db/schema";

const createdUserIds: string[] = [];
const createdCardIds: number[] = [];
const createdLotIds: string[] = [];

function requiredEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

const baseUrl = requiredEnv("BETTER_AUTH_URL", process.env.BETTER_AUTH_URL);

function request(path: string) {
  return new Request(`${baseUrl}${path}`);
}

async function insertUser() {
  const id = crypto.randomUUID();

  await db.insert(user).values({
    id,
    name: "Listing Tester",
    email: `listing-${id}@example.com`,
    role: "AUCTIONEER",
  });
  createdUserIds.push(id);

  return id;
}

async function insertCard(name: string) {
  const id = 1_000_000_000 + Math.floor(Math.random() * 1_000_000_000);

  await db.insert(card).values({
    id,
    name,
    type: "Effect Monster",
    frameType: "effect",
    description: null,
    raw: { id, name },
    imagePath: `https://images.example/catalog-${id}.jpg`,
    fetchedAt: new Date(),
  });
  createdCardIds.push(id);

  return id;
}

async function insertScheduledLot(title: string, cardName: string) {
  const auctioneerId = await insertUser();
  const cardId = await insertCard(cardName);
  const startsAt = new Date(Date.now() + 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
  const rows = await db
    .insert(lot)
    .values({
      auctioneerId,
      title,
      description: null,
      openingBid: "10.00",
      minIncrement: "1.00",
      startsAt,
      originalEndsAt: endsAt,
      endsAt,
    })
    .returning({ id: lot.id });
  const row = rows[0];

  if (!row) {
    throw new Error("Insert lot did not return a row");
  }

  createdLotIds.push(row.id);

  await db.insert(lotItem).values({
    lotId: row.id,
    position: 1,
    cardId,
    quantity: 1,
    cardName,
    cardSnapshot: { id: cardId, name: cardName },
    imagePath: "https://images.example/scheduled.jpg",
  });

  return {
    id: row.id,
    cardId,
    startsAt,
    endsAt,
  };
}

async function cleanup() {
  if (createdLotIds.length > 0) {
    await db.delete(lotItem).where(inArray(lotItem.lotId, createdLotIds));
    await db.delete(lot).where(inArray(lot.id, createdLotIds));
  }

  if (createdUserIds.length > 0) {
    await db.delete(user).where(inArray(user.id, createdUserIds));
  }

  if (createdCardIds.length > 0) {
    await db.delete(card).where(inArray(card.id, createdCardIds));
  }

  createdLotIds.length = 0;
  createdUserIds.length = 0;
  createdCardIds.length = 0;
}

describe("GET /public/lots", () => {
  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("returns a matching lot without a session", async () => {
    const token = `listing-${crypto.randomUUID()}`;
    const created = await insertScheduledLot(token, "Scheduled Dragon");
    const response = await app.handle(
      request(
        `/public/lots?q=${encodeURIComponent(`  ${token}  `)}&status=SCHEDULED`,
      ),
    );
    const body = (await response.json()) as {
      lots?: Array<{
        id?: string;
        status?: string;
        startsAt?: string;
        endsAt?: string;
        sold?: boolean;
        currentBid?: string | null;
        items?: Array<{ cardName?: string; imagePath?: string }>;
      }>;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      lots: [
        expect.objectContaining({
          id: created.id,
          title: token,
          description: null,
          openingBid: "10.00",
          minIncrement: "1.00",
          startsAt: created.startsAt.toISOString(),
          endsAt: created.endsAt.toISOString(),
          status: "SCHEDULED",
          currentBid: null,
          bidCount: 0,
          sold: false,
          items: [
            expect.objectContaining({
              position: 1,
              cardId: created.cardId,
              quantity: 1,
              cardName: "Scheduled Dragon",
              imagePath: "https://images.example/scheduled.jpg",
            }),
          ],
        }),
      ],
    });

    const lot = body.lots?.[0];
    const item = lot?.items?.[0];

    expect(Object.keys(lot ?? {}).sort()).toEqual([
      "bidCount",
      "currentBid",
      "description",
      "endsAt",
      "id",
      "items",
      "minIncrement",
      "openingBid",
      "sold",
      "startsAt",
      "status",
      "title",
    ]);
    expect(Object.keys(item ?? {}).sort()).toEqual([
      "cardId",
      "cardName",
      "id",
      "imagePath",
      "position",
      "quantity",
    ]);
  });

  it("rejects an unknown status", async () => {
    const response = await app.handle(
      request("/public/lots?status=CANCELED"),
    );
    const body = (await response.json()) as { type?: string };

    expect(response.status).toBe(422);
    expect(body.type).toBe("validation");
  });

  it("rejects the stored active status", async () => {
    const response = await app.handle(request("/public/lots?status=ACTIVE"));
    const body = (await response.json()) as { type?: string };

    expect(response.status).toBe(422);
    expect(body.type).toBe("validation");
  });

  it("returns an empty list when nothing matches", async () => {
    const response = await app.handle(
      request(`/public/lots?q=${encodeURIComponent(crypto.randomUUID())}`),
    );
    const body = (await response.json()) as { lots?: unknown[] };

    expect(response.status).toBe(200);
    expect(body).toEqual({ lots: [] });
  });
});
