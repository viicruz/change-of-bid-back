//* Libraries imports
import { z } from "zod";

const DEFAULT_MOVEMENT_PAGE = 1;
const DEFAULT_MOVEMENT_LIMIT = 20;
const MAX_MOVEMENT_LIMIT = 50;
const MAX_MOVEMENT_PAGE = 1_000;

const walletMovementTypeSchema = z.enum([
  "DEPOSIT",
  "HOLD",
  "RELEASE",
  "SETTLEMENT_DEBIT",
  "SETTLEMENT_CREDIT",
]);

export const walletResponseSchema = z.object({
  totalBalance: z.string(),
  committedBalance: z.string(),
  availableBalance: z.string(),
});

export const walletNotFoundSchema = z.object({
  code: z.literal("WALLET_NOT_FOUND"),
  message: z.string(),
});

// The deposit service rejects a bad amount as INVALID_MONEY.
// Validating it here would hide that code behind a framework error.
export const depositBodySchema = z.object({
  amount: z.unknown().optional(),
});

export const depositForbiddenSchema = z.object({
  code: z.literal("NOT_BIDDER"),
  message: z.string(),
});

export const depositUnprocessableSchema = z.object({
  code: z.enum(["INVALID_MONEY", "AMOUNT_OUT_OF_RANGE"]),
  message: z.string(),
});

export const listWalletMovementsQuerySchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_MOVEMENT_PAGE)
    .default(DEFAULT_MOVEMENT_PAGE),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_MOVEMENT_LIMIT)
    .default(DEFAULT_MOVEMENT_LIMIT),
});

const walletMovementSchema = z.object({
  id: z.uuid(),
  type: walletMovementTypeSchema,
  amount: z.string(),
  lotId: z.uuid().nullable(),
  bidId: z.uuid().nullable(),
  createdAt: z.date(),
});

export const listWalletMovementsResponseSchema = z.object({
  movements: z.array(walletMovementSchema),
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
});

export { MAX_MOVEMENT_PAGE };

export type WalletResponse = z.infer<typeof walletResponseSchema>;
export type ListWalletMovementsQuery = z.infer<
  typeof listWalletMovementsQuerySchema
>;
export type WalletMovementRecord = z.infer<typeof walletMovementSchema>;
export type ListWalletMovementsResponse = z.infer<
  typeof listWalletMovementsResponseSchema
>;
