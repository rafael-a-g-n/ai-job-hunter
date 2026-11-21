import { execSync } from "node:child_process";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/jobhunter_test";

/** Abort unless the URL is the local test database. */
export function assertTestDatabase(url: string): void {
  const u = new URL(url);
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  const dbName = u.pathname.replace(/^\//, "");
  if (!(local && (u.port === "5433" || dbName.endsWith("_test")))) {
    throw new Error(`Refusing to run integration tests against ${u.hostname}:${u.port}/${dbName}`);
  }
}

/** Runs once: apply pending migrations (idempotent, non-destructive). */
export default function globalSetup() {
  assertTestDatabase(TEST_DATABASE_URL);
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
