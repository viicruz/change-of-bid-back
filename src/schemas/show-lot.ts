//* Libraries imports
import { z } from "zod";

const showPublicLotStatusSchema = z.enum([
  "SCHEDULED",
  "LIVE",
  "ENDED",
  "CANCELED",
]);

export const showPublicLotParamsSchema = z.object({
  id: z.uuid(),
});

const shownPublicLotItemSchema = z.object({
  id: z.uuid(),
  position: z.number().int(),
  cardId: z.number().int(),
  quantity: z.number().int(),
  cardName: z.string(),
  imagePath: z.string(),
  cardSnapshot: z.record(z.string(), z.unknown()),
});

const shownPublicLotBidSchema = z.object({
  sequence: z.number().int(),
  amount: z.string(),
  createdAt: z.date(),
  participantNo: z.number().int(),
});

const shownPublicLotSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  openingBid: z.string(),
  minIncrement: z.string(),
  startsAt: z.date(),
  endsAt: z.date(),
  extensionCount: z.number().int(),
  status: showPublicLotStatusSchema,
  currentBid: z.string().nullable(),
  leaderParticipantNo: z.number().int().nullable(),
  bidCount: z.number().int(),
  sold: z.boolean(),
  winnerParticipantNo: z.number().int().nullable(),
  items: z.array(shownPublicLotItemSchema),
  bids: z.array(shownPublicLotBidSchema),
});

export const showPublicLotResponseSchema = z.object({
  serverNow: z.date(),
  viewerParticipantNo: z.number().int().nullable(),
  lot: shownPublicLotSchema,
});

export const showPublicLotNotFoundSchema = z.object({
  code: z.literal("LOT_NOT_FOUND"),
  message: z.string(),
});

export type ShowPublicLotStatus = z.infer<typeof showPublicLotStatusSchema>;
