//* Libraries imports
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";

//* Local imports
import { relations } from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

export const db = drizzle(connectionString, {
  relations,
});
