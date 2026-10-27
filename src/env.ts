//* Libraries imports
import z from "zod";

const envSchema = z.object({
    BETTER_AUTH_SECRET: z.string().min(1),
    PAGE_ORIGIN: z.string().min(1),
    // HMAC key for the accepted-bid chain. It stays on the server.
    BID_HASH_SECRET: z.string().min(32),
});

export const env = envSchema.parse(process.env);