//* Libraries imports
import { z } from "zod";

export const placeBidParamsSchema = z.object({
  id: z.uuid(),
});

// The service rejects a bad amount as INVALID_MONEY.
// Validating it here would hide that code behind a framework error.
export const placeBidBodySchema = z.object({
  amount: z.unknown().optional(),
});

export const placeBidResponseSchema = z.object({
  id: z.uuid(),
  sequence: z.number().int().positive(),
  amount: z.string(),
  createdAt: z.date(),
  participantNo: z.number().int().positive(),
  endsAt: z.date(),
  extensionCount: z.number().int().nonnegative(),
});

export const placeBidForbiddenSchema = z.object({
  code: z.literal("NOT_BIDDER"),
  message: z.string(),
});

export const placeBidNotFoundSchema = z.object({
  code: z.literal("LOT_NOT_FOUND"),
  message: z.string(),
});

export const placeBidUnprocessableSchema = z.object({
  code: z.literal("INVALID_MONEY"),
  message: z.string(),
});

export const placeBidConflictSchema = z.object({
  code: z.enum([
    "BID_BELOW_MINIMUM",
    "INSUFFICIENT_BALANCE",
    "ALREADY_LEADER",
    "LOT_NOT_STARTED",
    "LOT_ENDED",
    "LOT_CANCELED",
  ]),
  message: z.string(),
});
