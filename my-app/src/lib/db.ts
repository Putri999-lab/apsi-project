import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@/src/generated/prisma/client";

if (!process.env.DATABASE_URL) {
  const result = config({ path: resolve(process.cwd(), "..", ".env") });
  if (result.error && "code" in result.error && result.error.code !== "ENOENT") {
    throw new Error(`Could not load the workspace database configuration: ${result.error.message}`);
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not configured. Set it in the environment or the workspace root .env file.",
  );
}

const globalForPrisma = globalThis as typeof globalThis & { apsiPrisma?: PrismaClient };

export const prisma =
  globalForPrisma.apsiPrisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.apsiPrisma = prisma;
}
