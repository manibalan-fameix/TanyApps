import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      // `pnpm test:coverage` enforces full coverage of the money code; ordinary `pnpm test` does not collect coverage.
      include: ["lib/cabs/fare.ts", "lib/cabs/time.ts"],
      reporter: ["text"],
      thresholds: { perFile: true, statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
})
