//* Libraries imports
import { spawnSync } from "node:child_process";
import path from "node:path";
import "dotenv/config";
import { Client } from "pg";

// Lives outside the dropped schemas so the marker survives the reset.
const markerTable = "deploy_state.reset_run";

function readResetKey() {
  const key = process.env.DEPLOY_RESET_KEY || process.env.RENDER_GIT_COMMIT;

  return key?.trim() || undefined;
}

function runBin(bin: string, args: string[]) {
  const result = spawnSync(path.resolve("node_modules/.bin", bin), args, {
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${bin} ${args.join(" ")} exited with ${result.status}`);
  }
}

async function deployReset() {
  const key = readResetKey();

  if (!key) {
    console.log("No deploy reset key set, skipping database reset");
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = new Client({ connectionString: databaseUrl });

  await client.connect();

  try {
    await client.query("CREATE SCHEMA IF NOT EXISTS deploy_state");
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${markerTable} (
        key text PRIMARY KEY,
        ran_at timestamptz NOT NULL DEFAULT now()
      )`,
    );

    const done = await client.query(
      `SELECT 1 FROM ${markerTable} WHERE key = $1`,
      [key],
    );

    if (done.rowCount) {
      console.log(`Database already reset for deploy ${key}, skipping`);
      return;
    }

    console.log(`Resetting database for deploy ${key}`);
    // Dropping the schemas instead of the database works without CREATEDB.
    await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");

    console.log("Running migrations");
    runBin("drizzle-kit", ["migrate"]);

    console.log("Seeding demo data");
    runBin("tsx", ["src/db/seed.ts"]);

    // Recorded last so a failed reset is retried on the next boot.
    await client.query(`INSERT INTO ${markerTable} (key) VALUES ($1)`, [key]);
  } finally {
    await client.end();
  }
}

deployReset().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
