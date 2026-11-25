import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const fromRoot = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": fromRoot("./src"),
      // `server-only` throws outside a React Server build; stub it for unit tests.
      "server-only": fromRoot("./tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
