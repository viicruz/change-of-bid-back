//* Libraries imports
import { z } from "zod";

export const showPublicLotAuditParamsSchema = z.object({
  id: z.uuid(),
});

export const showPublicLotAuditStatusSchema = z.enum([
  "INTACT",
  "TAMPERED",
  "VERIFICATION_FAILED",
]);

const shownPublicLotAuditBidSchema = z.object({
  sequence: z.number().int(),
  amount: z.string(),
  createdAt: z.date(),
  participantNo: z.number().int(),
});

const shownPublicLotAuditSchema = z.object({
  lotId: z.uuid(),
  status: showPublicLotAuditStatusSchema,
  bids: z.array(shownPublicLotAuditBidSchema),
});

export const showPublicLotAuditResponseSchema = z.object({
  audit: shownPublicLotAuditSchema,
});

export const showPublicLotAuditNotFoundSchema = z.object({
  code: z.literal("LOT_NOT_FOUND"),
  message: z.string(),
});

export type ShowPublicLotAuditStatus = z.infer<
  typeof showPublicLotAuditStatusSchema
>;
