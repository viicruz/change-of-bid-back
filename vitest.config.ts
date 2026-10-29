//* Libraries imports
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    // Suites share a database; settlement scans must not see other suites' fixtures.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/__tests__/**", "src/test/**"],
      reporter: ["text", "json", "lcov"],
    },
  },
});
