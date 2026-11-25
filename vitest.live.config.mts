import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const fromRoot = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Opt-in configuration for tests that run the real Kane CLI. Use `npm run test:live-kane`.
export default defineConfig({
  resolve: {
    alias: {
      "@": fromRoot("./src"),
      "server-only": fromRoot("./tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["tests/live/**/*.live.test.ts"],
    environment: "node",
    testTimeout: 700_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
