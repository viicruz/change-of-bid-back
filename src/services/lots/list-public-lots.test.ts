//* Libraries imports
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";

//* Local imports
import { db } from "../../db/index";
import { bid, card, lot, lotItem, lotParticipant, user } from "../../db/schema";
import type { PublicLotStatus } from "../../schemas/list-lots";
import { listPublicLots } from "./list-public-lots";

const now = new Date("2026-10-26T15:00:00.000Z");
const createdUserIds: string[] = [];
const createdCardIds: number[] = [];
const createdLotIds: string[] = [];

function createToken() {
  return `listing-${crypto.randomUUID()}`;
}

function hoursFromNow(hours: number) {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

function dependencies() {
  return {
    now: () => now,
    executor: db,
  };
}

function listByToken(token: string, status?: PublicLotStatus) {
  return listPublicLots(
    {
      q: token,
      ...(status === undefined ? {} : { status }),
    },
    dependencies(),
  );
}

async function insertUser(role: "AUCTIONEER" | "BIDDER") {
  const id = crypto.randomUUID();

  await db.insert(user).values({
    id,
    name: "Listing Tester",
    email: `listing-${id}@example.com`,
    role,
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
    fetchedAt: now,
  });
  createdCardIds.push(id);

  return id;
}

async function insertLot(values: {
  title: string;
  description?: string | null;
  startsAt: Date;
  endsAt: Date;
  originalEndsAt?: Date;
  status?: "ACTIVE" | "ENDED" | "CANCELED";
  items: Array<{
    cardId: number;
    cardName: string;
    imagePath: string;
  }>;
}) {
  const auctioneerId = await insertUser("AUCTIONEER");
  const status = values.status ?? "ACTIVE";
  const rows = await db
    .insert(lot)
    .values({
      auctioneerId,
      title: values.title,
      description: values.description ?? null,
      openingBid: "10.00",
      minIncrement: "1.00",
      startsAt: values.startsAt,
      originalEndsAt: values.originalEndsAt ?? values.endsAt,
      endsAt: values.endsAt,
      status,
      endedAt: status === "ENDED" ? values.endsAt : null,
      canceledAt: status === "CANCELED" ? now : null,
    })
    .returning({ id: lot.id });
  const row = rows[0];

  if (!row) {
    throw new Error("Insert lot did not return a row");
  }

  createdLotIds.push(row.id);

  await db.insert(lotItem).values(
    values.items.map((item, index) => ({
      lotId: row.id,
      position: index + 1,
      cardId: item.cardId,
      quantity: 1,
      cardName: item.cardName,
      cardSnapshot: { id: item.cardId, name: item.cardName },
      imagePath: item.imagePath,
    })),
  );

  return row.id;
}

async function attachBid(lotId: string, amount: string, winner: boolean) {
  const bidderId = await insertUser("BIDDER");
  const participants = await db
    .insert(lotParticipant)
    .values({
      lotId,
      userId: bidderId,
      participantNo: 1,
    })
    .returning({ id: lotParticipant.id });
  const participant = participants[0];

  if (!participant) {
    throw new Error("Insert participant did not return a row");
  }

  const bids = await db
    .insert(bid)
    .values({
      lotId,
      participantId: participant.id,
      bidderId,
      sequence: 1,
      amount,
      previousHash: "genesis",
      hash: "hash-1",
    })
    .returning({ id: bid.id });
  const createdBid = bids[0];

  if (!createdBid) {
    throw new Error("Insert bid did not return a row");
  }

  await db
    .update(lot)
    .set({
      currentBidId: createdBid.id,
      bidCount: 1,
      ...(winner
        ? {
            winnerId: bidderId,
            status: "ENDED" as const,
            endedAt: now,
          }
        : {}),
    })
    .where(eq(lot.id, lotId));
}

async function cleanup() {
  if (createdLotIds.length > 0) {
    await db
      .update(lot)
      .set({ currentBidId: null, winnerId: null })
      .where(inArray(lot.id, createdLotIds));
    await db.delete(bid).where(inArray(bid.lotId, createdLotIds));
    await db
      .delete(lotParticipant)
      .where(inArray(lotParticipant.lotId, createdLotIds));
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

describe("listPublicLots", () => {
  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe("effective status", () => {
    it("reports a future lot as scheduled", async () => {
      const token = createToken();
      const cardId = await insertCard("Scheduled Dragon");
      const lotId = await insertLot({
        title: token,
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(3),
        items: [
          {
            cardId,
            cardName: "Scheduled Dragon",
            imagePath: "https://images.example/scheduled.jpg",
          },
        ],
      });

      const listed = await listByToken(token);

      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({
        id: lotId,
        status: "SCHEDULED",
        currentBid: null,
        bidCount: 0,
        sold: false,
      });
    });

    it("reports a lot inside its window as live", async () => {
      const token = createToken();
      const cardId = await insertCard("Live Dragon");
      const lotId = await insertLot({
        title: token,
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(1),
        items: [
          {
            cardId,
            cardName: "Live Dragon",
            imagePath: "https://images.example/live.jpg",
          },
        ],
      });

      const listed = await listByToken(token);

      expect(listed).toEqual([
        expect.objectContaining({
          id: lotId,
          status: "LIVE",
        }),
      ]);
    });

    it("reports an active lot as ended once the current time is past ends at", async () => {
      const token = createToken();
      const cardId = await insertCard("Past Dragon");
      const lotId = await insertLot({
        title: token,
        startsAt: hoursFromNow(-3),
        endsAt: hoursFromNow(-1),
        items: [
          {
            cardId,
            cardName: "Past Dragon",
            imagePath: "https://images.example/past.jpg",
          },
        ],
      });

      const listed = await listByToken(token);

      expect(listed).toEqual([
        expect.objectContaining({
          id: lotId,
          status: "ENDED",
          sold: false,
        }),
      ]);
    });

    it("reports a stored ended lot as ended while the clock is still inside its window", async () => {
      const token = createToken();
      const cardId = await insertCard("Closed Dragon");
      const lotId = await insertLot({
        title: token,
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
        status: "ENDED",
        items: [
          {
            cardId,
            cardName: "Closed Dragon",
            imagePath: "https://images.example/closed.jpg",
          },
        ],
      });

      const listed = await listByToken(token);

      expect(listed).toEqual([
        expect.objectContaining({
          id: lotId,
          status: "ENDED",
        }),
      ]);
    });

    it("reports a lot as live at the start instant", async () => {
      const token = createToken();
      const cardId = await insertCard("Opening Dragon");
      const lotId = await insertLot({
        title: token,
        startsAt: now,
        endsAt: hoursFromNow(1),
        items: [
          {
            cardId,
            cardName: "Opening Dragon",
            imagePath: "https://images.example/opening.jpg",
          },
        ],
      });

      const listed = await listByToken(token);

      expect(listed).toEqual([
        expect.objectContaining({
          id: lotId,
          status: "LIVE",
        }),
      ]);
    });

    it("reports a lot as ended at the end instant", async () => {
      const token = createToken();
      const cardId = await insertCard("Closing Dragon");
      const lotId = await insertLot({
        title: token,
        startsAt: hoursFromNow(-1),
        endsAt: now,
        items: [
          {
            cardId,
            cardName: "Closing Dragon",
            imagePath: "https://images.example/closing.jpg",
          },
        ],
      });

      const listed = await listByToken(token);

      expect(listed).toEqual([
        expect.objectContaining({
          id: lotId,
          status: "ENDED",
        }),
      ]);
    });

    it("lists live lots, then scheduled lots, then ended lots", async () => {
      const token = createToken();
      const liveSoonCard = await insertCard("Live Soon");
      const liveLaterCard = await insertCard("Live Later");
      const scheduledSoonCard = await insertCard("Scheduled Soon");
      const scheduledLaterCard = await insertCard("Scheduled Later");
      const endedRecentCard = await insertCard("Ended Recent");
      const endedOlderCard = await insertCard("Ended Older");
      const liveSoonId = await insertLot({
        title: `${token} live soon`,
        startsAt: hoursFromNow(-2),
        endsAt: hoursFromNow(1),
        items: [
          {
            cardId: liveSoonCard,
            cardName: "Live Soon",
            imagePath: "https://images.example/live-soon.jpg",
          },
        ],
      });
      const liveLaterId = await insertLot({
        title: `${token} live later`,
        startsAt: hoursFromNow(-2),
        endsAt: hoursFromNow(3),
        items: [
          {
            cardId: liveLaterCard,
            cardName: "Live Later",
            imagePath: "https://images.example/live-later.jpg",
          },
        ],
      });
      const scheduledSoonId = await insertLot({
        title: `${token} scheduled soon`,
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(5),
        items: [
          {
            cardId: scheduledSoonCard,
            cardName: "Scheduled Soon",
            imagePath: "https://images.example/scheduled-soon.jpg",
          },
        ],
      });
      const scheduledLaterId = await insertLot({
        title: `${token} scheduled later`,
        startsAt: hoursFromNow(4),
        endsAt: hoursFromNow(8),
        items: [
          {
            cardId: scheduledLaterCard,
            cardName: "Scheduled Later",
            imagePath: "https://images.example/scheduled-later.jpg",
          },
        ],
      });
      const endedRecentId = await insertLot({
        title: `${token} ended recent`,
        startsAt: hoursFromNow(-10),
        endsAt: hoursFromNow(-1),
        status: "ENDED",
        items: [
          {
            cardId: endedRecentCard,
            cardName: "Ended Recent",
            imagePath: "https://images.example/ended-recent.jpg",
          },
        ],
      });
      const endedOlderId = await insertLot({
        title: `${token} ended older`,
        startsAt: hoursFromNow(-20),
        endsAt: hoursFromNow(-5),
        status: "ENDED",
        items: [
          {
            cardId: endedOlderCard,
            cardName: "Ended Older",
            imagePath: "https://images.example/ended-older.jpg",
          },
        ],
      });

      const listed = await listByToken(token);

      expect(listed.map((entry) => entry.id)).toEqual([
        liveSoonId,
        liveLaterId,
        scheduledSoonId,
        scheduledLaterId,
        endedRecentId,
        endedOlderId,
      ]);
      expect(listed.map((entry) => entry.status)).toEqual([
        "LIVE",
        "LIVE",
        "SCHEDULED",
        "SCHEDULED",
        "ENDED",
        "ENDED",
      ]);
    });

    it("keeps an extended lot live after the original end", async () => {
      const token = createToken();
      const cardId = await insertCard("Extended Dragon");
      const lotId = await insertLot({
        title: token,
        startsAt: hoursFromNow(-2),
        originalEndsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(1),
        items: [
          {
            cardId,
            cardName: "Extended Dragon",
            imagePath: "https://images.example/extended.jpg",
          },
        ],
      });

      const listed = await listByToken(token);

      expect(listed).toEqual([
        expect.objectContaining({
          id: lotId,
          status: "LIVE",
          endsAt: hoursFromNow(1),
        }),
      ]);
    });

    it("lists an unsettled lot with bids as ended and unsold", async () => {
      const token = createToken();
      const cardId = await insertCard("Pending Dragon");
      const lotId = await insertLot({
        title: token,
        startsAt: hoursFromNow(-3),
        endsAt: hoursFromNow(-1),
        items: [
          {
            cardId,
            cardName: "Pending Dragon",
            imagePath: "https://images.example/pending.jpg",
          },
        ],
      });

      await attachBid(lotId, "15.00", false);

      const ended = await listByToken(token, "ENDED");
      const live = await listByToken(token, "LIVE");
      const scheduled = await listByToken(token, "SCHEDULED");

      expect(ended).toEqual([
        expect.objectContaining({
          id: lotId,
          status: "ENDED",
          sold: false,
          bidCount: 1,
          currentBid: "15.00",
        }),
      ]);
      expect(live).toEqual([]);
      expect(scheduled).toEqual([]);
    });
  });

  describe("canceled lots", () => {
    it("omits a canceled lot from the unfiltered list and from every status filter", async () => {
      const token = createToken();
      const visibleCard = await insertCard("Visible Dragon");
      const canceledCard = await insertCard("Canceled Dragon");
      const visibleId = await insertLot({
        title: `${token} visible`,
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
        items: [
          {
            cardId: visibleCard,
            cardName: "Visible Dragon",
            imagePath: "https://images.example/visible.jpg",
          },
        ],
      });

      await insertLot({
        title: `${token} canceled`,
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
        status: "CANCELED",
        items: [
          {
            cardId: canceledCard,
            cardName: `${token} canceled card`,
            imagePath: "https://images.example/canceled.jpg",
          },
        ],
      });

      const unfiltered = await listByToken(token);
      const live = await listByToken(token, "LIVE");
      const scheduled = await listByToken(token, "SCHEDULED");
      const ended = await listByToken(token, "ENDED");

      expect(unfiltered.map((entry) => entry.id)).toEqual([visibleId]);
      expect(live.map((entry) => entry.id)).toEqual([visibleId]);
      expect(scheduled).toEqual([]);
      expect(ended).toEqual([]);
    });
  });

  describe("text search", () => {
    it("matches a lot by title", async () => {
      const token = createToken();
      const matchingCard = await insertCard("Other Card");
      const decoyCard = await insertCard("Decoy Card");
      const matchingId = await insertLot({
        title: `${token} Blue-Eyes`,
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(3),
        items: [
          {
            cardId: matchingCard,
            cardName: "Other Card",
            imagePath: "https://images.example/other.jpg",
          },
        ],
      });

      await insertLot({
        title: "Decoy lot",
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(3),
        items: [
          {
            cardId: decoyCard,
            cardName: "Decoy Card",
            imagePath: "https://images.example/decoy.jpg",
          },
        ],
      });

      const listed = await listPublicLots(
        { q: `  ${token} blue-eyes  ` },
        dependencies(),
      );

      expect(listed.map((entry) => entry.id)).toEqual([matchingId]);
    });

    it("matches a lot by the stored card name", async () => {
      const token = createToken();
      const cardId = await insertCard("Catalog Name");
      const lotId = await insertLot({
        title: "Plain lot",
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(3),
        items: [
          {
            cardId,
            cardName: `${token} Dragon`,
            imagePath: "https://images.example/snapshot.jpg",
          },
        ],
      });

      await db
        .update(card)
        .set({ name: "Renamed in catalog" })
        .where(eq(card.id, cardId));

      const listed = await listByToken(`${token} dragon`);
      const renamed = await listPublicLots(
        { q: "Renamed in catalog" },
        dependencies(),
      );

      expect(listed).toHaveLength(1);
      expect(listed[0]?.id).toBe(lotId);
      expect(listed[0]?.items).toEqual([
        expect.objectContaining({
          position: 1,
          cardId,
          cardName: `${token} Dragon`,
          imagePath: "https://images.example/snapshot.jpg",
        }),
      ]);
      expect(renamed.some((entry) => entry.id === lotId)).toBe(false);
    });

    it("combines the text search with the status filter", async () => {
      const token = createToken();
      const liveCard = await insertCard("Combined Live");
      const scheduledCard = await insertCard("Combined Scheduled");
      const otherLiveCard = await insertCard("Combined Other");
      const liveId = await insertLot({
        title: `${token} live`,
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
        items: [
          {
            cardId: liveCard,
            cardName: "Combined Live",
            imagePath: "https://images.example/combined-live.jpg",
          },
        ],
      });

      await insertLot({
        title: `${token} scheduled`,
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(4),
        items: [
          {
            cardId: scheduledCard,
            cardName: "Combined Scheduled",
            imagePath: "https://images.example/combined-scheduled.jpg",
          },
        ],
      });
      await insertLot({
        title: "Another live lot",
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
        items: [
          {
            cardId: otherLiveCard,
            cardName: "Combined Other",
            imagePath: "https://images.example/combined-other.jpg",
          },
        ],
      });

      const listed = await listByToken(token, "LIVE");

      expect(listed.map((entry) => entry.id)).toEqual([liveId]);
    });

    it("returns a lot once when several items match", async () => {
      const token = createToken();
      const firstCard = await insertCard("First");
      const secondCard = await insertCard("Second");
      const lotId = await insertLot({
        title: `${token} pair`,
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(3),
        items: [
          {
            cardId: firstCard,
            cardName: `${token} Alpha`,
            imagePath: "https://images.example/alpha.jpg",
          },
          {
            cardId: secondCard,
            cardName: `${token} Beta`,
            imagePath: "https://images.example/beta.jpg",
          },
        ],
      });

      const listed = await listByToken(token);

      expect(listed).toHaveLength(1);
      expect(listed[0]?.id).toBe(lotId);
      expect(listed[0]?.items.map((item) => item.cardName)).toEqual([
        `${token} Alpha`,
        `${token} Beta`,
      ]);
      expect(listed[0]?.items.map((item) => item.position)).toEqual([1, 2]);
    });

    it("treats like wildcards in the search as literal characters", async () => {
      const token = createToken();
      const literalCard = await insertCard("Literal");
      const similarCard = await insertCard("Similar");
      const slashCard = await insertCard("Slash");
      const plainCard = await insertCard("Plain");
      const literalId = await insertLot({
        title: `${token} 100%_off`,
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(3),
        items: [
          {
            cardId: literalCard,
            cardName: "Literal",
            imagePath: "https://images.example/literal.jpg",
          },
        ],
      });

      await insertLot({
        title: `${token} 100XYoff`,
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(4),
        items: [
          {
            cardId: similarCard,
            cardName: "Similar",
            imagePath: "https://images.example/similar.jpg",
          },
        ],
      });

      const slashId = await insertLot({
        title: `${token} a\\b`,
        startsAt: hoursFromNow(2),
        endsAt: hoursFromNow(5),
        items: [
          {
            cardId: slashCard,
            cardName: "Slash",
            imagePath: "https://images.example/slash.jpg",
          },
        ],
      });

      await insertLot({
        title: `${token} ab`,
        startsAt: hoursFromNow(2),
        endsAt: hoursFromNow(6),
        items: [
          {
            cardId: plainCard,
            cardName: "Plain",
            imagePath: "https://images.example/plain.jpg",
          },
        ],
      });

      const literalMatches = await listPublicLots(
        { q: `${token} 100%_off` },
        dependencies(),
      );
      const slashMatches = await listPublicLots(
        { q: `${token} a\\b` },
        dependencies(),
      );

      expect(literalMatches.map((entry) => entry.id)).toEqual([literalId]);
      expect(slashMatches.map((entry) => entry.id)).toEqual([slashId]);
    });

    it("returns an empty array when nothing matches", async () => {
      const listed = await listByToken(createToken());

      expect(listed).toEqual([]);
    });

    it("does not match a term that appears only in the description", async () => {
      const token = createToken();
      const cardId = await insertCard("Described Dragon");

      await insertLot({
        title: "Plain title",
        description: `${token} seller notes`,
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(3),
        items: [
          {
            cardId,
            cardName: "Described Dragon",
            imagePath: "https://images.example/described.jpg",
          },
        ],
      });

      const listed = await listByToken(token);

      expect(listed).toEqual([]);
    });

    it("ignores a blank search", async () => {
      const token = createToken();
      const cardId = await insertCard("Blank Search");
      const lotId = await insertLot({
        title: token,
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(3),
        items: [
          {
            cardId,
            cardName: "Blank Search",
            imagePath: "https://images.example/blank.jpg",
          },
        ],
      });

      const listed = await listPublicLots({ q: "   " }, dependencies());

      expect(listed.some((entry) => entry.id === lotId)).toBe(true);
    });
  });

  describe("public fields", () => {
    it("returns the current bid and whether the lot was sold without user ids", async () => {
      const token = createToken();
      const liveCard = await insertCard("Bidding Live");
      const endedCard = await insertCard("Bidding Ended");
      const liveStartsAt = hoursFromNow(-1);
      const liveEndsAt = hoursFromNow(2);
      const endedStartsAt = hoursFromNow(-4);
      const endedEndsAt = hoursFromNow(-1);
      const liveId = await insertLot({
        title: `${token} live`,
        description: "Seller notes",
        startsAt: liveStartsAt,
        endsAt: liveEndsAt,
        items: [
          {
            cardId: liveCard,
            cardName: "Bidding Live",
            imagePath: "https://images.example/bidding-live.jpg",
          },
        ],
      });
      const endedId = await insertLot({
        title: `${token} ended`,
        startsAt: endedStartsAt,
        endsAt: endedEndsAt,
        status: "ENDED",
        items: [
          {
            cardId: endedCard,
            cardName: "Bidding Ended",
            imagePath: "https://images.example/bidding-ended.jpg",
          },
        ],
      });

      await attachBid(liveId, "15.00", false);
      await attachBid(endedId, "25.50", true);

      const listed = await listByToken(token);

      expect(listed).toEqual([
        {
          id: liveId,
          title: `${token} live`,
          description: "Seller notes",
          openingBid: "10.00",
          minIncrement: "1.00",
          startsAt: liveStartsAt,
          endsAt: liveEndsAt,
          status: "LIVE",
          currentBid: "15.00",
          bidCount: 1,
          sold: false,
          totalItems: 1,
          items: [
            expect.objectContaining({
              position: 1,
              cardId: liveCard,
              quantity: 1,
              cardName: "Bidding Live",
              imagePath: "https://images.example/bidding-live.jpg",
            }),
          ],
        },
        {
          id: endedId,
          title: `${token} ended`,
          description: null,
          openingBid: "10.00",
          minIncrement: "1.00",
          startsAt: endedStartsAt,
          endsAt: endedEndsAt,
          status: "ENDED",
          currentBid: "25.50",
          bidCount: 1,
          sold: true,
          totalItems: 1,
          items: [
            expect.objectContaining({
              position: 1,
              cardId: endedCard,
              quantity: 1,
              cardName: "Bidding Ended",
              imagePath: "https://images.example/bidding-ended.jpg",
            }),
          ],
        },
      ]);
    });

    it("returns at most five items ordered by position and the full item count", async () => {
      const token = createToken();
      const cards = await Promise.all(
        Array.from({ length: 6 }, (_, index) =>
          insertCard(`Preview ${index + 1}`),
        ),
      );

      await insertLot({
        title: token,
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(3),
        items: cards.map((cardId, index) => ({
          cardId,
          cardName: `Preview ${index + 1}`,
          imagePath: `https://images.example/preview-${index + 1}.jpg`,
        })),
      });

      const listed = await listByToken(token);

      expect(listed).toHaveLength(1);
      expect(listed[0]?.totalItems).toBe(6);
      expect(listed[0]?.items.map((item) => item.position)).toEqual([
        1, 2, 3, 4, 5,
      ]);
      expect(listed[0]?.items.map((item) => item.cardName)).toEqual([
        "Preview 1",
        "Preview 2",
        "Preview 3",
        "Preview 4",
        "Preview 5",
      ]);
    });
  });
});
