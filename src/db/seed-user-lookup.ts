//* Libraries imports
import { eq } from "drizzle-orm";

//* Local imports
import { user } from "./schema";

export async function findSeedUserByEmail(
  executor: Pick<typeof import("./index").db, "select">,
  email: string,
) {
  const rows = await executor
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  return rows[0];
}
