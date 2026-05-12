import { defineConfig } from "vitest/config"

/**
 * Integration test configuration.
 * - Requires Docker (testcontainers spins a real PostgreSQL instance).
 * - Longer timeout: container startup can take 20-30s on cold pull.
 * - Run with: npm run test:integration
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // Provide required env vars — vitest doesn't load .env files automatically
    env: {
      JWT_SECRET: "integration-test-jwt-secret-minimum-32-chars-xx",
      NODE_ENV: "test",
      REGISTRATION_ENABLED: "true",
      EMAIL_WEBHOOK_SECRET: "integration-test-email-webhook-secret-32chars!",
      SECRET_ENCRYPTION_KEY: "a".repeat(64),
      // Colima (macOS): point Testcontainers at the correct Docker socket
      // and disable Ryuk (which tries to bind-mount the socket path, unsupported on Colima)
      DOCKER_HOST: process.env.DOCKER_HOST ?? "unix:///var/run/docker.sock",
      TESTCONTAINERS_RYUK_DISABLED: "true",
    },
    // Longer timeout for container startup
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Run integration tests sequentially to avoid port conflicts
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
    },
  },
})
