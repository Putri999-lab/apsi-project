import "server-only";
import { config } from "dotenv";
import { Pool } from "pg";
import { resolve } from "node:path";

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

const globalForPg = globalThis as typeof globalThis & { apsiPool?: Pool };

export const pool =
  globalForPg.apsiPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.apsiPool = pool;
}
