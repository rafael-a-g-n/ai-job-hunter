import path from "node:path";
import { defineConfig } from "vitest/config";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/jobhunter_test";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/int/**/*.test.ts"],
    globalSetup: ["tests/int/global-setup.ts"],
    setupFiles: ["tests/int/setup.ts"],
    fileParallelism: false,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      APP_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0000",
      AI_PROVIDER: "mock",
      EMBEDDINGS_PROVIDER: "fake",
      STORAGE_PROVIDER: "local",
      MAIL_PROVIDER: "console",
      EMAIL_FROM: "Test <test@example.com>",
      CRON_SECRET: "test-cron-secret",
      TURNSTILE_BYPASS: "true",
    },
  },
});
