import { z } from "zod";

export const lotStatusSchema = z.enum([
  "SCHEDULED",
  "LIVE",
  "ENDED",
  "CANCELED",
]);

export const listedLotItemSchema = z.object({
  id: z.uuid(),
  position: z.number().int(),
  cardId: z.number().int(),
  quantity: z.number().int(),
  cardName: z.string(),
  imagePath: z.string(),
});

export const shownLotItemSchema = listedLotItemSchema.extend({
  cardSnapshot: z.record(z.string(), z.unknown()),
});

export const lotSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  openingBid: z.string(),
  minIncrement: z.string(),
  startsAt: z.date(),
  endsAt: z.date(),
  status: lotStatusSchema,
  currentBid: z.string().nullable(),
  bidCount: z.number().int(),
});

const shownLotBidSchema = z.object({
  sequence: z.number().int(),
  amount: z.string(),
  createdAt: z.date(),
  participantNo: z.number().int(),
});

export const shownLotSchema = lotSummarySchema.extend({
  extensionCount: z.number().int(),
  leaderParticipantNo: z.number().int().nullable(),
  sold: z.boolean(),
  winnerParticipantNo: z.number().int().nullable(),
  items: z.array(shownLotItemSchema),
  bids: z.array(shownLotBidSchema),
});
