import { defineConfig } from "vitest/config"
import path from "path"

/**
 * Unit test configuration.
 * - No DB required; all external deps are mocked.
 * - Fast: no containers, no network calls.
 */
export default defineConfig({
  resolve: {
    alias: {
      // Allows console-targeting tests (tests/unit/console/**) to import
      // source files that use the "@/" alias defined in console/tsconfig.json.
      // The backend has no "@/" alias of its own, so there is no collision.
      "@": path.resolve("console/src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    env: {
      // Minimal env vars to satisfy config validation during unit test imports.
      // No actual DB or JWT operations are performed in unit tests.
      JWT_SECRET: "unit-test-secret-not-used-minimum-32-chars-long",
      DATABASE_URL: "postgresql://unused:unused@localhost:5434/unused",
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/infra/db/migrate.ts"],
      thresholds: {
        lines: 70,
        branches: 60,
        functions: 70,
        statements: 70,
      },
    },
  },
})
