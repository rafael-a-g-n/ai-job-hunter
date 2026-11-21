export const E2E_PORT = 3100;

/** Same server as the integration tests (localhost:5433), so CI needs one service for both. */
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/jobhunter_test";

/** Everything the app and the setup scripts need; all providers are fakes. Never the dev database. */
export const E2E_ENV: Record<string, string> = {
  DATABASE_URL: E2E_DATABASE_URL,
  APP_URL: `http://localhost:${E2E_PORT}`,
  BETTER_AUTH_SECRET: "e2e-only-secret-not-for-real-use-0123456789",
  AI_PROVIDER: "mock",
  EMBEDDINGS_PROVIDER: "fake",
  STORAGE_PROVIDER: "local",
  MAIL_PROVIDER: "console",
  EMAIL_FROM: "AI Job Hunter <noreply@example.com>",
  CRON_SECRET: "e2e-only-cron-secret",
  TURNSTILE_BYPASS: "true",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
  E2E: "1",
};

/** Abort unless the URL is the local test database. */
export function assertLocalTestDatabase(url: string): void {
  const u = new URL(url);
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  const dbName = u.pathname.replace(/^\//, "");
  if (!(local && (u.port === "5433" || dbName.endsWith("_test") || dbName.endsWith("_e2e")))) {
    throw new Error(`Refusing to run e2e against ${u.hostname}:${u.port}/${dbName}`);
  }
}
