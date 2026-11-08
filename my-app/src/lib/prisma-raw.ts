import type { PrismaClient } from "@/src/generated/prisma/client";

type PrismaQueryClient = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

export async function queryRows<T extends Record<string, unknown>>(
  client: PrismaQueryClient,
  sql: string,
  values: unknown[] = [],
) {
  const rows = await client.$queryRawUnsafe<T[]>(sql, ...values);
  return { rows, rowCount: rows.length };
}

export async function executeSql(
  client: PrismaQueryClient,
  sql: string,
  values: unknown[] = [],
) {
  return client.$executeRawUnsafe(sql, ...values);
}
