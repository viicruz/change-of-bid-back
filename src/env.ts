//* Libraries imports
import z from "zod";

const envSchema = z.object({
    BETTER_AUTH_SECRET: z.string().min(1),
    PAGE_ORIGIN: z.string().min(1),
});

export const env = envSchema.parse(process.env);