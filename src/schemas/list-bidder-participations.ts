//* Libraries imports
import { z } from "zod";
import {
  listedLotItemSchema,
  lotStatusSchema,
  lotSummarySchema,
} from "./lot-read";

//* Schemas imports
import { shareTokenSchema } from "./show-receipt";

const bidderParticipationStatusSchema = lotStatusSchema;

const bidderParticipationSchema = lotSummarySchema.extend({
  participantNo: z.number().int().positive(),
  won: z.boolean(),
  shareToken: shareTokenSchema.nullable(),
  items: z.array(listedLotItemSchema),
});

export const listBidderParticipationsResponseSchema = z.object({
  lots: z.array(bidderParticipationSchema),
});

export type BidderParticipationStatus = z.infer<
  typeof bidderParticipationStatusSchema
>;
