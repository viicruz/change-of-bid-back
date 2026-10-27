//* Libraries imports
import { z } from "zod";

export const cancelLotParamsSchema = z.object({
  id: z.uuid(),
});

export const cancelLotResponseSchema = z.object({
  id: z.uuid(),
  status: z.literal("CANCELED"),
  canceledAt: z.date(),
});

export const cancelLotForbiddenSchema = z.object({
  code: z.enum(["NOT_AUCTIONEER", "LOT_NOT_OWNED"]),
  message: z.string(),
});

export const cancelLotNotFoundSchema = z.object({
  code: z.literal("LOT_NOT_FOUND"),
  message: z.string(),
});

export const cancelLotConflictSchema = z.object({
  code: z.literal("LOT_NOT_CANCELABLE"),
  message: z.string(),
});
