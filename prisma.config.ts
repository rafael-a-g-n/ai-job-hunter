import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: {
    // The CLI (migrations) prefers a direct, unpooled connection: Neon's pooler does not suit
    // migrations. The app itself always connects through DATABASE_URL (src/lib/db.ts).
    // The last fallback lets `prisma generate` run without a database (CI install).
    url:
      process.env.DIRECT_DATABASE_URL ||
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5432/jobhunter",
  },
});
