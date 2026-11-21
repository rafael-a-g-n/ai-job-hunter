import { execSync } from "node:child_process";
import { Client } from "pg";
import { assertLocalTestDatabase, E2E_DATABASE_URL, E2E_ENV } from "./env";

/** Applies migrations (never a reset), empties every app table, then seeds the sample jobs. */
export default async function globalSetup() {
  assertLocalTestDatabase(E2E_DATABASE_URL);
  const env = { ...process.env, ...E2E_ENV };
  execSync("npx prisma migrate deploy", { stdio: "inherit", env });

  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
    );
    if (rows.length > 0) {
      const list = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
      await client.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await client.end();
  }

  execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env });
}
