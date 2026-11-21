import { afterAll, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { assertTestDatabase } from "./global-setup";

assertTestDatabase(process.env.DATABASE_URL ?? "");

/** Truncate every table before each test; runs per file in the test database. */
beforeEach(async () => {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await db.$disconnect();
});
