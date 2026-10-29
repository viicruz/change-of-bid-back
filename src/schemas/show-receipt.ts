//* Libraries imports
import { z } from "zod";
import { shownLotItemSchema } from "./lot-read";

// 32 bytes in base64url, without padding.
const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const shareTokenSchema = z.string().regex(SHARE_TOKEN_PATTERN);

export const showPublicReceiptParamsSchema = z.object({
  shareToken: shareTokenSchema,
});

const shownPublicReceiptSchema = z.object({
  lotId: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  endedAt: z.date(),
  finalAmount: z.string(),
  winnerParticipantNo: z.number().int(),
  items: z.array(shownLotItemSchema),
});

export const showPublicReceiptResponseSchema = z.object({
  receipt: shownPublicReceiptSchema,
});

export const showPublicReceiptNotFoundSchema = z.object({
  code: z.literal("RECEIPT_NOT_FOUND"),
  message: z.string(),
});
