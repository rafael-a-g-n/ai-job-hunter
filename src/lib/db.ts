import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

const globalForDb = globalThis as unknown as { db?: PrismaClient };

function create(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });
}

export const db: PrismaClient = globalForDb.db ?? create();
if (process.env.NODE_ENV !== "production") globalForDb.db = db;
