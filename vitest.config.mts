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
    // Live Kane tests cost credits and upload to the account. They run only via `npm run test:live-kane`.
    exclude: ["tests/live/**", "node_modules/**"],
    environment: "node",
  },
});
