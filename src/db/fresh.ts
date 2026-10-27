//* Libraries imports
import { spawnSync } from "node:child_process";
import path from "node:path";
import "dotenv/config";
import { Client } from "pg";

const databaseNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const protectedDatabases = new Set(["postgres", "template0", "template1"]);

function readDatabaseName(databaseUrl: string) {
  let databaseName: string;

  try {
    databaseName = decodeURIComponent(
      new URL(databaseUrl).pathname.replace(/^\//, ""),
    );
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }

  if (!databaseNamePattern.test(databaseName)) {
    throw new Error(
      `Database name "${databaseName}" must match ${databaseNamePattern.source}`,
    );
  }

  if (protectedDatabases.has(databaseName)) {
    throw new Error(`Database "${databaseName}" cannot be reset`);
  }

  return databaseName;
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function adminConnectionString(databaseUrl: string) {
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  return adminUrl.toString();
}

async function resetDatabase(databaseUrl: string, databaseName: string) {
  const client = new Client({
    connectionString: adminConnectionString(databaseUrl),
  });

  await client.connect();

  try {
    const quotedName = quoteIdentifier(databaseName);
    await client.query(`DROP DATABASE IF EXISTS ${quotedName} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${quotedName}`);
  } finally {
    await client.end();
  }
}

function runMigrations() {
  const drizzleKit = path.resolve("node_modules/.bin/drizzle-kit");
  const result = spawnSync(drizzleKit, ["migrate"], {
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function fresh() {
  // if (process.env.NODE_ENV === "production") {
  //   throw new Error("db:fresh cannot run when NODE_ENV is production");
  // }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const databaseName = readDatabaseName(databaseUrl);

  console.log(`Dropping and recreating database ${databaseName}`);
  await resetDatabase(databaseUrl, databaseName);

  console.log("Running migrations");
  runMigrations();
}

fresh().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
