import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  // Imported after dotenv, because the db client reads the validated env when it is created.
  const { db } = await import("../src/lib/db");
  const { seedJobs } = await import("../src/server/demo/seed-jobs");
  try {
    const count = await seedJobs(db);
    console.log(`Seeded ${count} sample jobs.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
