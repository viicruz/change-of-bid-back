//* Libraries imports
import { z } from "zod";
import { lotStatusSchema, shownLotSchema } from "./lot-read";

const showPublicLotStatusSchema = lotStatusSchema;

export const showPublicLotParamsSchema = z.object({
  id: z.uuid(),
});

export const showPublicLotResponseSchema = z.object({
  serverNow: z.date(),
  viewerParticipantNo: z.number().int().nullable(),
  lot: shownLotSchema,
});

export const showPublicLotNotFoundSchema = z.object({
  code: z.literal("LOT_NOT_FOUND"),
  message: z.string(),
});

export type ShowPublicLotStatus = z.infer<typeof showPublicLotStatusSchema>;
