import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // Fallback lets `prisma generate` run without a database (CI install).
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/jobhunter",
  },
});
