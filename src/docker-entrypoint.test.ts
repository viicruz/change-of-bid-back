import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const entrypoint = fileURLToPath(new URL("../docker-entrypoint.sh", import.meta.url));
let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "docker-entrypoint-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("Docker entrypoint", () => {
  it.each([0, 23])("starts only the server and returns its exit code %s", async (exitCode) => {
    const log = path.join(directory, "commands.log");
    await writeFile(
      path.join(directory, "npm"),
      '#!/bin/sh\nprintf \'npm %s\\n\' "$*" >> "$ENTRYPOINT_TEST_LOG"\n',
      { mode: 0o755 },
    );
    await writeFile(
      path.join(directory, "node"),
      `#!/bin/sh\nprintf 'node %s\\n' "$*" >> "$ENTRYPOINT_TEST_LOG"\nexit ${exitCode}\n`,
      { mode: 0o755 },
    );

    const result = spawnSync("/bin/sh", [entrypoint], {
      env: { PATH: directory, NODE_ENV: "production", ENTRYPOINT_TEST_LOG: log },
      encoding: "utf8",
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(exitCode);
    expect(result.stderr).toBe("");
    expect(await readFile(log, "utf8")).toBe("node dist/index.js\n");
  });
});
