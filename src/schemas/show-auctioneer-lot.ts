//* Libraries imports
import { z } from "zod";
import { lotStatusSchema, shownLotSchema } from "./lot-read";

const showAuctioneerLotStatusSchema = lotStatusSchema;

export const showAuctioneerLotParamsSchema = z.object({
  id: z.uuid(),
});

const shownAuctioneerLotSchema = shownLotSchema.extend({
  receivedAmount: z.string().nullable(),
});

export const showAuctioneerLotResponseSchema = z.object({
  serverNow: z.date(),
  lot: shownAuctioneerLotSchema,
});

export const showAuctioneerLotForbiddenSchema = z.object({
  code: z.enum(["NOT_AUCTIONEER", "LOT_NOT_OWNED"]),
  message: z.string(),
});

export const showAuctioneerLotNotFoundSchema = z.object({
  code: z.literal("LOT_NOT_FOUND"),
  message: z.string(),
});

export type ShowAuctioneerLotStatus = z.infer<
  typeof showAuctioneerLotStatusSchema
>;
