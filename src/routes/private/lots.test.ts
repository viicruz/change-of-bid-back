//* Libraries imports
import { asc, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

//* Local imports
import { app } from "../../app";
import { db } from "../../db/index";
import { card, lot, lotItem, user, wallet } from "../../db/schema";

import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { cardImageStorage } from "../../lib/card-image-storage";

vi.mock("../../lib/card-image-storage", async () => {
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  return { cardImageStorage: { assets: await mkdtemp(join(tmpdir(), "lot-route-images-")), prefix: "/card-images" } };
});

const password = "Correct-horse-battery-1";
const createdEmails: string[] = [];
const createdCardIds: number[] = [];

function requiredEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

const baseUrl = requiredEnv("BETTER_AUTH_URL", process.env.BETTER_AUTH_URL);
const pageOrigin = requiredEnv("PAGE_ORIGIN", process.env.PAGE_ORIGIN);

type RegisteredUser = {
  email: string;
  userId: string;
  token: string;
};

function request(
  path: string,
  headers?: RequestInit["headers"],
  method = "GET",
  body?: string,
) {
  return new Request(`${baseUrl}${path}`, {
    method,
    headers,
    body,
  });
}

async function registerUser(role?: string): Promise<RegisteredUser> {
  const email = `lot-${crypto.randomUUID()}@example.com`;
  const response = await app.handle(
    request(
      "/api/auth/sign-up/email",
      {
        "content-type": "application/json",
        origin: pageOrigin,
      },
      "POST",
      JSON.stringify({
        name: "Lot Tester",
        email,
        password,
        ...(role === undefined ? {} : { role }),
      }),
    ),
  );
  const rawBody = await response.text();

  if (!response.ok) {
    throw new Error(
      `Sign-up failed with status ${response.status}: ${rawBody}`,
    );
  }

  createdEmails.push(email);

  const body = JSON.parse(rawBody) as {
    user?: {
      id?: string;
    };
  };
  const userId = body.user?.id;
  const token = response.headers.get("set-auth-token");

  if (!userId) {
    throw new Error("Sign-up did not return a user id");
  }

  if (!token) {
    throw new Error("Sign-up did not return a bearer token");
  }

  return {
    email,
    userId,
    token,
  };
}

async function registerAuctioneer() {
  return registerUser("AUCTIONEER");
}

function randomCardId() {
  return 1_000_000_000 + Math.floor(Math.random() * 1_000_000_000);
}

async function insertCatalogCard(name: string, imagePath: string | null) {
  const id = randomCardId();

  createdCardIds.push(id);
  if (imagePath?.trim()) {
    await mkdir(cardImageStorage.assets, { recursive: true });
    await writeFile(join(cardImageStorage.assets, `${id}.jpg`), new Uint8Array([255, 216, 255, 224, 255, 217]));
    imagePath = `/card-images/${id}.jpg`;
  }

  await db.insert(card).values({
    id,
    name,
    type: "Effect Monster",
    frameType: "effect",
    description: null,
    raw: { id, name },
    imagePath,
    fetchedAt: new Date(),
  });

  return id;
}

const minimumLotDurationMs = 1 * 60 * 1000;

function createLotPayload(cardIds: number[]) {
  const startsAt = new Date(Date.now() - minimumLotDurationMs / 2);

  return {
    title: "Blue-Eyes lot",
    description: "  ",
    openingBid: "10",
    minIncrement: "0.5",
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + minimumLotDurationMs).toISOString(),
    cardIds,
  };
}

function toOffsetIso(instant: Date, offset: string): string {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset);

  if (match === null) {
    throw new Error(`Invalid offset: ${offset}`);
  }

  const sign = match[1] === "+" ? 1 : -1;
  const totalMinutes = sign * (Number(match[2]) * 60 + Number(match[3]));
  const wallClock = new Date(instant.getTime() + totalMinutes * 60_000);

  return `${wallClock.toISOString().replace("Z", "")}${offset}`;
}

function postLot(token: string | undefined, payload: unknown) {
  return app.handle(
    request(
      "/private/lots",
      {
        "content-type": "application/json",
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
      "POST",
      JSON.stringify(payload),
    ),
  );
}

async function cleanup(emails: string[], cardIds: number[]) {
  if (emails.length > 0) {
    const users = await db
      .select({ id: user.id })
      .from(user)
      .where(inArray(user.email, emails));
    const userIds = users.map((entry) => entry.id);

    if (userIds.length > 0) {
      const lots = await db
        .select({ id: lot.id })
        .from(lot)
        .where(inArray(lot.auctioneerId, userIds));
      const lotIds = lots.map((entry) => entry.id);

      if (lotIds.length > 0) {
        await db.delete(lotItem).where(inArray(lotItem.lotId, lotIds));
        await db.delete(lot).where(inArray(lot.id, lotIds));
      }

      await db.delete(wallet).where(inArray(wallet.userId, userIds));
      await db.delete(user).where(inArray(user.id, userIds));
    }
  }

  if (cardIds.length > 0) {
    await db.delete(card).where(inArray(card.id, cardIds));
  }
}

afterAll(async () => {
  await db.$client.end();
  await rm(cardImageStorage.assets, { recursive: true, force: true });
});

describe("POST /private/lots", () => {
  afterEach(async () => {
    const emails = createdEmails.splice(0, createdEmails.length);
    const cardIds = createdCardIds.splice(0, createdCardIds.length);

    await cleanup(emails, cardIds);
  });

  it("rejects a request with no session", async () => {
    const response = await postLot(undefined, createLotPayload([1]));

    expect(response.status).toBe(401);
  });

  it("rejects a bidder", async () => {
    const account = await registerUser();
    const response = await postLot(account.token, createLotPayload([1]));
    const body = (await response.json()) as { code?: string };
    const lots = await db
      .select({ id: lot.id })
      .from(lot)
      .where(eq(lot.auctioneerId, account.userId));

    expect(response.status).toBe(403);
    expect(body.code).toBe("NOT_AUCTIONEER");
    expect(lots).toHaveLength(0);
  });

  it("stores the auctioneer role when sign-up sends it", async () => {
    const account = await registerUser("AUCTIONEER");
    const [stored] = await db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, account.userId));

    expect(stored?.role).toBe("AUCTIONEER");
  });

  it("creates the lot and its items for an auctioneer", async () => {
    const account = await registerAuctioneer();
    const tornadoId = await insertCatalogCard(
      "Tornado Dragon",
      "https://images.example/tornado.jpg",
    );
    const decodeId = await insertCatalogCard(
      "Decode Talker",
      "https://images.example/decode.jpg",
    );
    const payload = createLotPayload([decodeId, tornadoId]);
    const response = await postLot(account.token, payload);
    const body = (await response.json()) as {
      id?: string;
      auctioneerId?: string;
      title?: string;
      description?: string | null;
      openingBid?: string;
      minIncrement?: string;
      status?: string;
      originalEndsAt?: string;
      endsAt?: string;
      items?: Array<{
        position?: number;
        cardId?: number;
        quantity?: number;
        cardName?: string;
        imagePath?: string;
      }>;
    };

    expect(response.status).toBe(201);
    expect(body.auctioneerId).toBe(account.userId);
    expect(body.title).toBe("Blue-Eyes lot");
    expect(body.description).toBeNull();
    expect(body.openingBid).toBe("10.00");
    expect(body.minIncrement).toBe("0.50");
    expect(body.status).toBe("ACTIVE");
    expect(body.endsAt).toBe(body.originalEndsAt);
    expect(body.items).toEqual([
      expect.objectContaining({
        position: 1,
        cardId: decodeId,
        quantity: 1,
        cardName: "Decode Talker",
        imagePath: `/card-images/${decodeId}.jpg`,
      }),
      expect.objectContaining({
        position: 2,
        cardId: tornadoId,
        quantity: 1,
        cardName: "Tornado Dragon",
        imagePath: `/card-images/${tornadoId}.jpg`,
      }),
    ]);

    const storedItems = await db
      .select()
      .from(lotItem)
      .where(eq(lotItem.lotId, body.id ?? ""))
      .orderBy(asc(lotItem.position));

    expect(storedItems.map((item) => item.cardSnapshot)).toEqual([
      { id: decodeId, name: "Decode Talker" },
      { id: tornadoId, name: "Tornado Dragon" },
    ]);
  });

  it("rejects unknown card ids without leaving a lot", async () => {
    const account = await registerAuctioneer();
    const missingId = randomCardId();
    const response = await postLot(
      account.token,
      createLotPayload([missingId]),
    );
    const body = (await response.json()) as {
      code?: string;
      cardIds?: number[];
    };
    const lots = await db
      .select({ id: lot.id })
      .from(lot)
      .where(eq(lot.auctioneerId, account.userId));

    expect(response.status).toBe(422);
    expect(body.code).toBe("UNKNOWN_CARDS");
    expect(body.cardIds).toEqual([missingId]);
    expect(lots).toHaveLength(0);
  });

  it("rejects an empty card list", async () => {
    const account = await registerAuctioneer();
    const response = await postLot(account.token, createLotPayload([]));

    expect(response.status).toBe(422);
  });

  it("rejects a lot that lasts less than 1 minute", async () => {
    const account = await registerAuctioneer();
    const startsAt = new Date();
    const response = await postLot(account.token, {
      ...createLotPayload([1]),
      startsAt: startsAt.toISOString(),
      endsAt: new Date(
        startsAt.getTime() + minimumLotDurationMs - 1,
      ).toISOString(),
    });
    const body = (await response.json()) as { code?: string };
    const lots = await db
      .select({ id: lot.id })
      .from(lot)
      .where(eq(lot.auctioneerId, account.userId));

    expect(response.status).toBe(422);
    expect(body.code).toBe("INVALID_SCHEDULE");
    expect(lots).toHaveLength(0);
  });

  it("stores the same instant when the schedule uses a -03:00 offset", async () => {
    const account = await registerAuctioneer();
    const cardId = await insertCatalogCard(
      "Tornado Dragon",
      "https://images.example/tornado.jpg",
    );
    const startsAt = new Date(Date.now() + 60_000);
    const endsAt = new Date(startsAt.getTime() + minimumLotDurationMs);
    const response = await postLot(account.token, {
      ...createLotPayload([cardId]),
      startsAt: toOffsetIso(startsAt, "-03:00"),
      endsAt: toOffsetIso(endsAt, "-03:00"),
    });
    const body = (await response.json()) as {
      startsAt?: string;
      endsAt?: string;
      originalEndsAt?: string;
    };

    expect(response.status).toBe(201);
    expect(body.startsAt).toBe(startsAt.toISOString());
    expect(body.endsAt).toBe(endsAt.toISOString());
    expect(body.originalEndsAt).toBe(endsAt.toISOString());
  });

  it("rejects a datetime without a timezone offset", async () => {
    const account = await registerAuctioneer();
    const response = await postLot(account.token, {
      ...createLotPayload([1]),
      startsAt: "2026-10-26T18:00:00",
      endsAt: "2026-10-27T18:00:00",
    });
    const body = (await response.json()) as { code?: string; type?: string };

    expect(response.status).toBe(422);
    expect(body.type).toBe("validation");
    expect(body.code).toBeUndefined();
  });
});

describe("GET /private/lots", () => {
  afterEach(async () => {
    const emails = createdEmails.splice(0, createdEmails.length);
    const cardIds = createdCardIds.splice(0, createdCardIds.length);

    await cleanup(emails, cardIds);
  });

  function getLots(token: string | undefined, query = "") {
    return app.handle(
      request(
        `/private/lots${query}`,
        token === undefined
          ? undefined
          : { authorization: `Bearer ${token}` },
      ),
    );
  }

  it("rejects a request with no session", async () => {
    const response = await getLots(undefined);

    expect(response.status).toBe(401);
  });

  it("rejects a bidder", async () => {
    const account = await registerUser();
    const response = await getLots(account.token);
    const body = (await response.json()) as { code?: string };

    expect(response.status).toBe(403);
    expect(body.code).toBe("NOT_AUCTIONEER");
  });

  it("rejects the stored active status", async () => {
    const account = await registerAuctioneer();
    const response = await getLots(account.token, "?status=ACTIVE");
    const body = (await response.json()) as { type?: string };

    expect(response.status).toBe(422);
    expect(body.type).toBe("validation");
  });

  it("returns the auctioneer's lot without personal fields", async () => {
    const account = await registerAuctioneer();
    const cardId = await insertCatalogCard(
      "Panel Dragon",
      "https://images.example/panel.jpg",
    );
    const title = `listing-${crypto.randomUUID()}`;
    const created = await postLot(account.token, {
      ...createLotPayload([cardId]),
      title,
    });
    const createdBody = (await created.json()) as {
      id?: string;
      startsAt?: string;
      endsAt?: string;
    };
    const response = await getLots(
      account.token,
      `?q=${encodeURIComponent(`  ${title}  `)}`,
    );
    const body = (await response.json()) as {
      totalReceived?: string;
      lots?: Array<{
        id?: string;
        items?: Array<{ cardName?: string; imagePath?: string }>;
      }>;
    };
    const listed = body.lots?.[0];
    const item = listed?.items?.[0];

    expect(created.status).toBe(201);
    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["lots", "totalReceived"]);
    expect(body.totalReceived).toBe("0.00");
    expect(body.lots).toEqual([
      expect.objectContaining({
        id: createdBody.id,
        title,
        description: null,
        openingBid: "10.00",
        minIncrement: "0.50",
        startsAt: createdBody.startsAt,
        endsAt: createdBody.endsAt,
        status: "LIVE",
        currentBid: null,
        bidCount: 0,
        sold: false,
        receivedAmount: null,
        items: [
          expect.objectContaining({
            position: 1,
            cardId,
            quantity: 1,
            cardName: "Panel Dragon",
            imagePath: `/card-images/${cardId}.jpg`,
          }),
        ],
      }),
    ]);
    expect(Object.keys(listed ?? {}).sort()).toEqual([
      "bidCount",
      "currentBid",
      "description",
      "endsAt",
      "id",
      "items",
      "minIncrement",
      "openingBid",
      "receivedAmount",
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
});

describe("POST /private/lots/:id/cancel", () => {
  afterEach(async () => {
    const emails = createdEmails.splice(0, createdEmails.length);
    const cardIds = createdCardIds.splice(0, createdCardIds.length);

    await cleanup(emails, cardIds);
  });

  function cancelLotRequest(token: string | undefined, lotId: string) {
    return app.handle(
      request(
        `/private/lots/${lotId}/cancel`,
        token === undefined
          ? undefined
          : { authorization: `Bearer ${token}` },
        "POST",
      ),
    );
  }

  async function insertStoredLot(
    auctioneerId: string,
    values: {
      startsAt: Date;
      endsAt: Date;
      status?: "ACTIVE" | "ENDED";
    },
  ) {
    const status = values.status ?? "ACTIVE";
    const rows = await db
      .insert(lot)
      .values({
        auctioneerId,
        title: "Stored lot",
        openingBid: "10.00",
        minIncrement: "1.00",
        startsAt: values.startsAt,
        originalEndsAt: values.endsAt,
        endsAt: values.endsAt,
        status,
        endedAt: status === "ENDED" ? values.endsAt : null,
      })
      .returning({ id: lot.id });
    const row = rows[0];

    if (!row) {
      throw new Error("Insert lot did not return a row");
    }

    return row.id;
  }

  it("rejects a request with no session", async () => {
    const response = await cancelLotRequest(undefined, crypto.randomUUID());

    expect(response.status).toBe(401);
  });

  it("rejects a bidder", async () => {
    const account = await registerUser();
    const response = await cancelLotRequest(account.token, crypto.randomUUID());
    const body = (await response.json()) as { code?: string };

    expect(response.status).toBe(403);
    expect(body.code).toBe("NOT_AUCTIONEER");
  });

  it("rejects a lot owned by another auctioneer", async () => {
    const owner = await registerAuctioneer();
    const other = await registerAuctioneer();
    const startsAt = new Date(Date.now() + 60 * 60 * 1000);
    const lotId = await insertStoredLot(owner.userId, {
      startsAt,
      endsAt: new Date(startsAt.getTime() + minimumLotDurationMs),
    });
    const response = await cancelLotRequest(other.token, lotId);
    const body = (await response.json()) as { code?: string };
    const [stored] = await db
      .select({ status: lot.status })
      .from(lot)
      .where(eq(lot.id, lotId));

    expect(response.status).toBe(403);
    expect(body.code).toBe("LOT_NOT_OWNED");
    expect(stored?.status).toBe("ACTIVE");
  });

  it("rejects an unknown lot", async () => {
    const account = await registerAuctioneer();
    const response = await cancelLotRequest(account.token, crypto.randomUUID());
    const body = (await response.json()) as { code?: string };

    expect(response.status).toBe(404);
    expect(body.code).toBe("LOT_NOT_FOUND");
  });

  it("rejects an ended lot", async () => {
    const account = await registerAuctioneer();
    const endsAt = new Date(Date.now() - 60 * 60 * 1000);
    const lotId = await insertStoredLot(account.userId, {
      startsAt: new Date(endsAt.getTime() - minimumLotDurationMs),
      endsAt,
      status: "ENDED",
    });
    const response = await cancelLotRequest(account.token, lotId);
    const body = (await response.json()) as { code?: string };
    const [stored] = await db
      .select({ status: lot.status, canceledAt: lot.canceledAt })
      .from(lot)
      .where(eq(lot.id, lotId));

    expect(response.status).toBe(409);
    expect(body.code).toBe("LOT_NOT_CANCELABLE");
    expect(stored).toMatchObject({
      status: "ENDED",
      canceledAt: null,
    });
  });

  it("rejects an active lot whose end has already passed", async () => {
    const account = await registerAuctioneer();
    const endsAt = new Date(Date.now() - 60 * 60 * 1000);
    const lotId = await insertStoredLot(account.userId, {
      startsAt: new Date(endsAt.getTime() - minimumLotDurationMs),
      endsAt,
    });
    const response = await cancelLotRequest(account.token, lotId);
    const body = (await response.json()) as { code?: string };
    const [stored] = await db
      .select({ status: lot.status, canceledAt: lot.canceledAt })
      .from(lot)
      .where(eq(lot.id, lotId));

    expect(response.status).toBe(409);
    expect(body.code).toBe("LOT_NOT_CANCELABLE");
    expect(stored).toMatchObject({
      status: "ACTIVE",
      canceledAt: null,
    });
  });

  it("cancels the auctioneer's lot and returns the same result when repeated", async () => {
    const account = await registerAuctioneer();
    const cardId = await insertCatalogCard(
      "Cancel Dragon",
      "https://images.example/cancel.jpg",
    );
    const created = await postLot(account.token, createLotPayload([cardId]));
    const createdBody = (await created.json()) as { id?: string };
    const lotId = createdBody.id ?? "";
    const response = await cancelLotRequest(account.token, lotId);
    const body = (await response.json()) as {
      id?: string;
      status?: string;
      canceledAt?: string;
    };
    const repeated = await cancelLotRequest(account.token, lotId);
    const repeatedBody = (await repeated.json()) as {
      id?: string;
      status?: string;
      canceledAt?: string;
    };
    const [stored] = await db
      .select({
        status: lot.status,
        canceledAt: lot.canceledAt,
        bidCount: lot.bidCount,
      })
      .from(lot)
      .where(eq(lot.id, lotId));

    expect(created.status).toBe(201);
    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["canceledAt", "id", "status"]);
    expect(body).toMatchObject({
      id: lotId,
      status: "CANCELED",
    });
    expect(repeated.status).toBe(200);
    expect(repeatedBody).toEqual(body);
    expect(stored).toMatchObject({
      status: "CANCELED",
      bidCount: 0,
    });
    expect(stored?.canceledAt?.toISOString()).toBe(body.canceledAt);
  });
});

describe("GET /private/lots/:id", () => {
  afterEach(async () => {
    const emails = createdEmails.splice(0, createdEmails.length);
    const cardIds = createdCardIds.splice(0, createdCardIds.length);

    await cleanup(emails, cardIds);
  });

  function getLot(token: string | undefined, lotId: string) {
    return app.handle(
      request(
        `/private/lots/${lotId}`,
        token === undefined
          ? undefined
          : { authorization: `Bearer ${token}` },
      ),
    );
  }

  it("rejects a request with no session", async () => {
    const response = await getLot(undefined, crypto.randomUUID());

    expect(response.status).toBe(401);
  });

  it("rejects a bidder", async () => {
    const account = await registerUser();
    const response = await getLot(account.token, crypto.randomUUID());
    const body = (await response.json()) as { code?: string };

    expect(response.status).toBe(403);
    expect(body.code).toBe("NOT_AUCTIONEER");
  });

  it("rejects a lot owned by another auctioneer", async () => {
    const owner = await registerAuctioneer();
    const other = await registerAuctioneer();
    const cardId = await insertCatalogCard(
      "Owned Dragon",
      "https://images.example/owned.jpg",
    );
    const created = await postLot(owner.token, createLotPayload([cardId]));
    const createdBody = (await created.json()) as { id?: string };
    const response = await getLot(other.token, createdBody.id ?? "");
    const body = (await response.json()) as { code?: string };

    expect(created.status).toBe(201);
    expect(response.status).toBe(403);
    expect(body.code).toBe("LOT_NOT_OWNED");
  });

  it("rejects an unknown lot", async () => {
    const account = await registerAuctioneer();
    const response = await getLot(account.token, crypto.randomUUID());
    const body = (await response.json()) as { code?: string };

    expect(response.status).toBe(404);
    expect(body).toEqual({
      code: "LOT_NOT_FOUND",
      message: "Lot was not found.",
    });
  });

  it("rejects an id that is not a uuid", async () => {
    const account = await registerAuctioneer();
    const response = await getLot(account.token, "not-a-uuid");
    const body = (await response.json()) as { type?: string };

    expect(response.status).toBe(422);
    expect(body.type).toBe("validation");
  });

  it("returns the auctioneer's lot without personal fields", async () => {
    const account = await registerAuctioneer();
    const cardId = await insertCatalogCard(
      "Shown Dragon",
      "https://images.example/shown.jpg",
    );
    const created = await postLot(account.token, createLotPayload([cardId]));
    const createdBody = (await created.json()) as {
      id?: string;
      startsAt?: string;
      endsAt?: string;
    };
    const response = await getLot(account.token, createdBody.id ?? "");
    const raw = await response.text();
    const body = JSON.parse(raw) as {
      serverNow?: string;
      lot?: {
        items?: Array<Record<string, unknown>>;
        bids?: unknown[];
      };
    };
    const shown = body.lot;
    const item = shown?.items?.[0];

    expect(created.status).toBe(201);
    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["lot", "serverNow"]);
    expect(shown).toEqual(
      expect.objectContaining({
        id: createdBody.id,
        title: "Blue-Eyes lot",
        description: null,
        openingBid: "10.00",
        minIncrement: "0.50",
        startsAt: createdBody.startsAt,
        endsAt: createdBody.endsAt,
        extensionCount: 0,
        status: "LIVE",
        currentBid: null,
        leaderParticipantNo: null,
        bidCount: 0,
        sold: false,
        winnerParticipantNo: null,
        receivedAmount: null,
        bids: [],
        items: [
          expect.objectContaining({
            position: 1,
            cardId,
            quantity: 1,
            cardName: "Shown Dragon",
            imagePath: `/card-images/${cardId}.jpg`,
          }),
        ],
      }),
    );
    expect(Object.keys(shown ?? {}).sort()).toEqual([
      "bidCount",
      "bids",
      "currentBid",
      "description",
      "endsAt",
      "extensionCount",
      "id",
      "items",
      "leaderParticipantNo",
      "minIncrement",
      "openingBid",
      "receivedAmount",
      "sold",
      "startsAt",
      "status",
      "title",
      "winnerParticipantNo",
    ]);
    expect(Object.keys(item ?? {}).sort()).toEqual([
      "cardId",
      "cardName",
      "cardSnapshot",
      "id",
      "imagePath",
      "position",
      "quantity",
    ]);
    expect(raw).not.toContain(account.email);
    expect(raw).not.toContain(account.userId);
    expect(raw).not.toContain("Lot Tester");
    expect(
      Math.abs(Date.parse(body.serverNow ?? "") - Date.now()),
    ).toBeLessThan(5_000);
  });
});
