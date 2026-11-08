import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { Prisma, type PrismaClient } from "@/src/generated/prisma/client";
import { resources, type ResourceKey } from "@/src/lib/catalog";
import { getCurrentUser, type AuthUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { queries } from "@/src/lib/queries";
import { executeSql, queryRows } from "@/src/lib/prisma-raw";

type JsonRecord = Record<string, unknown>;
type Operation = "create" | "update";
type QueryClient = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
  }
}

async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  client: QueryClient,
  sql: string,
  values: unknown[] = [],
) {
  if (/^\s*(SELECT|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) {
    return queryRows<T>(client, sql, values);
  }
  const rowCount = await executeSql(client, sql, values);
  return { rows: [] as T[], rowCount };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

async function normalizeValues(
  resource: ResourceKey,
  raw: unknown,
  operation: Operation,
): Promise<JsonRecord> {
  if (!isRecord(raw)) {
    throw new RequestError("Form data must be an object.");
  }

  const definition = resources[resource];
  const allowedFields = new Set(definition.fields.map((field) => field.name));
  const unknownFields = Object.keys(raw).filter((key) => !allowedFields.has(key));
  if (unknownFields.length > 0) {
    throw new RequestError(`Unsupported field: ${unknownFields[0]}.`);
  }

  const normalized: JsonRecord = {};
  for (const field of definition.fields) {
    const hasValue = Object.hasOwn(raw, field.name);
    if (!hasValue) {
      if (operation === "create" && field.required) {
        throw new RequestError(`${field.label} wajib diisi.`);
      }
      if (operation === "create" && field.kind === "date" && !field.required) {
        normalized[field.name] = null;
      }
      continue;
    }

    const value = raw[field.name];
    if (field.kind === "password") {
      if (typeof value !== "string" || value.length === 0) {
        if (operation === "create" && field.required) {
          throw new RequestError(`${field.label} wajib diisi.`);
        }
        continue;
      }

      const byteLength = new TextEncoder().encode(value).length;
      if (byteLength < 8 || byteLength > 72) {
        throw new RequestError(`${field.label} harus berisi 8 hingga 72 byte.`);
      }
      normalized[field.name] = await bcrypt.hash(value, 12);
      continue;
    }

    if (field.kind === "date") {
      if ((value === "" || value === null) && !field.required) {
        normalized[field.name] = null;
        continue;
      }
      if (typeof value !== "string" || !isDate(value)) {
        throw new RequestError(`${field.label} harus berupa tanggal yang valid.`);
      }
      normalized[field.name] = value;
      continue;
    }

    if (field.kind === "number") {
      if (value === "" || value === null || value === undefined) {
        throw new RequestError(`${field.label} wajib diisi.`);
      }
      const numberValue = typeof value === "number" ? value : Number(value);
      if (!Number.isSafeInteger(numberValue)) {
        throw new RequestError(`${field.label} harus berupa bilangan bulat.`);
      }
      if (field.min !== undefined && numberValue < field.min) {
        throw new RequestError(`${field.label} minimal ${field.min}.`);
      }
      if (field.max !== undefined && numberValue > field.max) {
        throw new RequestError(`${field.label} maksimal ${field.max}.`);
      }
      normalized[field.name] = numberValue;
      continue;
    }

    if (field.kind === "money") {
      const moneyValue = typeof value === "number" ? String(value) : value;
      if (typeof moneyValue !== "string" || !/^\d{1,19}$/.test(moneyValue)) {
        throw new RequestError(`${field.label} harus berupa bilangan bulat non-negatif.`);
      }
      normalized[field.name] = moneyValue;
      continue;
    }

    if (typeof value !== "string") {
      throw new RequestError(`${field.label} harus berupa teks.`);
    }

    if (field.required && value.trim().length === 0) {
      throw new RequestError(`${field.label} wajib diisi.`);
    }
    if (field.maxLength !== undefined && value.length > field.maxLength) {
      throw new RequestError(`${field.label} maksimal ${field.maxLength} karakter.`);
    }
    if (field.kind === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new RequestError(`${field.label} tidak valid.`);
    }
    if (field.options && !field.options.includes(value)) {
      throw new RequestError(`Nilai ${field.label} tidak didukung.`);
    }

    normalized[field.name] = value.trim();
  }

  if (
    resource === "production" &&
    normalized.status_produksi === "Selesai" &&
    !normalized.tanggal_selesai_produksi
  ) {
    throw new RequestError("Tanggal selesai wajib diisi saat produksi ditandai selesai.");
  }

  return normalized;
}

function normalizeKeys(resource: ResourceKey, raw: unknown): string[] {
  if (!isRecord(raw)) {
    throw new RequestError("Record key is required.");
  }

  const keyFields = queries[resource].keyFields;
  return keyFields.map((field) => {
    const value = raw[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new RequestError(`${field} is required.`);
    }
    return value.trim();
  });
}

function keyWhere(resource: ResourceKey, startIndex = 1) {
  return queries[resource].keyFields
    .map((field, index) => `"${field}" = $${startIndex + index}`)
    .join(" AND ");
}

function databaseError(error: unknown) {
  if (error instanceof RequestError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const code =
    isRecord(error) && typeof error.code === "string" ? error.code : undefined;
  if (code === "P2002" || code === "23505") {
    return NextResponse.json(
      { error: "A record with the same primary key already exists." },
      { status: 409 },
    );
  }
  if (code === "P2003" || code === "23503") {
    return NextResponse.json(
      { error: "A selected related record does not exist, or this record is still referenced by related data." },
      { status: 409 },
    );
  }
  if (["P2000", "P2011", "P2012", "22001", "22P02", "22003"].includes(code ?? "")) {
    return NextResponse.json(
      { error: "One or more values exceed the database's accepted format or range." },
      { status: 400 },
    );
  }

  console.error("Dapur Abita database request failed.", error);
  return NextResponse.json(
    { error: "The database request failed. Check the server logs for details." },
    { status: 500 },
  );
}

function parseResource(value: string): ResourceKey {
  if (!Object.hasOwn(resources, value)) {
    throw new RequestError("Menu not found.", 404);
  }
  return value as ResourceKey;
}

function canAccess(user: AuthUser, resource: ResourceKey, method: string) {
  if (user.role === "ADMIN") return true;
  if (method === "GET") {
    if (user.role === "OWNER") {
      return !["customers", "users"].includes(resource);
    }
    if (user.role === "EMPLOYEE") {
      return ["products", "orders", "order-details", "production"].includes(resource);
    }
    return ["products", "orders", "order-details", "payments", "handover", "reviews"].includes(resource);
  }
  if (user.role === "EMPLOYEE") return resource === "production" && method === "PUT";
  if (user.role === "CUSTOMER") {
    return resource === "reviews" && method === "POST";
  }
  return false;
}

function assertCanAccess(user: AuthUser, resource: ResourceKey, method: string) {
  if (!canAccess(user, resource, method)) {
    throw new RequestError("Anda tidak memiliki izin untuk tindakan ini.", 403);
  }
}

function scopeFor(user: AuthUser, resource: ResourceKey) {
  if (user.role === "CUSTOMER") {
    switch (resource) {
      case "orders":
        return { clause: `p.id_pelanggan = $1`, values: [user.id] };
      case "order-details":
        return { clause: `EXISTS (SELECT 1 FROM "Pesanan" own_order WHERE own_order.no_pesanan = dp.no_pesanan AND own_order.id_pelanggan = $1)`, values: [user.id] };
      case "payments":
        return { clause: `EXISTS (SELECT 1 FROM "Pesanan" own_order WHERE own_order.no_pesanan = py.no_pesanan AND own_order.id_pelanggan = $1)`, values: [user.id] };
      case "handover":
        return { clause: `EXISTS (SELECT 1 FROM "Pesanan" own_order WHERE own_order.no_pesanan = s.no_pesanan AND own_order.id_pelanggan = $1)`, values: [user.id] };
      case "reviews":
        return { clause: `EXISTS (SELECT 1 FROM "Pesanan" own_order WHERE own_order.no_pesanan = u.no_pesanan AND own_order.id_pelanggan = $1)`, values: [user.id] };
      default:
        return { clause: "", values: [] as string[] };
    }
  }
  if (user.role === "EMPLOYEE") {
    switch (resource) {
      case "production":
        return { clause: `prd.id_karyawan = $1`, values: [user.id] };
      case "orders":
        return { clause: `EXISTS (SELECT 1 FROM "Produksi" assigned WHERE assigned.no_pesanan = p.no_pesanan AND assigned.id_karyawan = $1)`, values: [user.id] };
      case "order-details":
        return { clause: `EXISTS (SELECT 1 FROM "Produksi" assigned WHERE assigned.no_pesanan = dp.no_pesanan AND assigned.id_karyawan = $1)`, values: [user.id] };
      default:
        return { clause: "", values: [] as string[] };
    }
  }
  return { clause: "", values: [] as string[] };
}

async function getList(resource: ResourceKey, request: Request, user: AuthUser) {
  const searchTerm = new URL(request.url).searchParams.get("q")?.trim();
  if (searchTerm && searchTerm.length > 100) {
    throw new RequestError("Search text must be 100 characters or fewer.");
  }
  const definition = queries[resource];
  let sql = definition.select;
  const scope = scopeFor(user, resource);
  const values: string[] = [...scope.values];
  const clauses = scope.clause ? [scope.clause] : [];

  if (searchTerm) {
    values.push(`%${searchTerm}%`);
    const searchColumns = resources[resource].searchFields;
    clauses.push(`(${searchColumns.map((column) => `${column}::text ILIKE $${values.length}`).join(" OR ")})`);
  }

  if (clauses.length) sql += ` WHERE ${clauses.join(" AND ")}`;
  sql += ` ORDER BY ${definition.orderBy}`;
  const result = await query(prisma, sql, values);
  return NextResponse.json(result.rows);
}

function parseDetailValues(values: unknown) {
  if (!isRecord(values)) {
    throw new RequestError("Form data must be an object.");
  }
  const orderNumber = values.no_pesanan;
  const productId = values.id_produk;
  const quantity = typeof values.jumlah === "number" ? values.jumlah : Number(values.jumlah);

  if (typeof orderNumber !== "string" || !orderNumber.trim() || orderNumber.length > 10) {
    throw new RequestError("Pilih pesanan yang valid.");
  }
  if (typeof productId !== "string" || !productId.trim() || productId.length > 10) {
    throw new RequestError("Pilih produk yang valid.");
  }
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new RequestError("Jumlah harus berupa bilangan bulat minimal 1.");
  }

  return { orderNumber: orderNumber.trim(), productId: productId.trim(), quantity };
}

async function detailCreate(client: Prisma.TransactionClient, values: unknown) {
  const detail = parseDetailValues(values);
  const product = await query<{ stok_produk: number | null; harga_produk: string | null }>(
    client,
    `SELECT stok_produk, harga_produk
     FROM "Produk"
     WHERE id_produk = $1
     FOR UPDATE`,
    [detail.productId],
  );

  if (product.rowCount === 0) {
    throw new RequestError("Produk tidak ditemukan.", 404);
  }
  const stock: number | null = product.rows[0].stok_produk;
  const price: string | null = product.rows[0].harga_produk;
  if (stock === null || price === null) {
    throw new RequestError("Isi stok dan harga produk terlebih dahulu.", 409);
  }
  if (detail.quantity > stock) {
    throw new RequestError("Stok produk tidak mencukupi.", 409);
  }

  const stockAfter = stock - detail.quantity;
  await query(client,
    `INSERT INTO "DetailPesanan"
       (no_pesanan, id_produk, jumlah, harga_satuan, stok_produk_sebelum, stok_produk_sesudah)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      detail.orderNumber,
      detail.productId,
      detail.quantity,
      price,
      stock,
      stockAfter,
    ],
  );
  await query(client, `UPDATE "Produk" SET stok_produk = $1 WHERE id_produk = $2`, [
    stockAfter,
    detail.productId,
  ]);
  return { ...detail, harga_satuan: price, stok_produk_sebelum: stock, stok_produk_sesudah: stockAfter };
}

async function detailUpdate(client: Prisma.TransactionClient, keys: string[], values: unknown) {
  const detail = parseDetailValues(values);
  if (keys[0] !== detail.orderNumber || keys[1] !== detail.productId) {
    throw new RequestError("Order and product keys cannot be changed.", 400);
  }

  const product = await query<{ stok_produk: number | null }>(
    client,
    `SELECT stok_produk
     FROM "Produk"
     WHERE id_produk = $1
     FOR UPDATE`,
    [detail.productId],
  );
  const stock: number | null = product.rows[0]?.stok_produk ?? null;
  if (stock === null) {
    throw new RequestError("Stok produk belum diatur; stok detail tidak dapat diselaraskan.", 409);
  }

  const currentDetail = await query<{ jumlah: number; harga_satuan: string }>(
    client,
    `SELECT jumlah, harga_satuan
     FROM "DetailPesanan"
     WHERE no_pesanan = $1 AND id_produk = $2
     FOR UPDATE`,
    keys,
  );
  if (currentDetail.rowCount === 0) {
    throw new RequestError("Order detail not found.", 404);
  }

  const available = stock + Number(currentDetail.rows[0].jumlah);
  if (detail.quantity > available) {
    throw new RequestError("Stok produk tidak mencukupi.", 409);
  }
  const stockAfter = available - detail.quantity;
  await query(client,
    `UPDATE "DetailPesanan"
     SET jumlah = $1, stok_produk_sebelum = $2, stok_produk_sesudah = $3
     WHERE no_pesanan = $4 AND id_produk = $5`,
    [detail.quantity, available, stockAfter, ...keys],
  );
  await query(client, `UPDATE "Produk" SET stok_produk = $1 WHERE id_produk = $2`, [
    stockAfter,
    detail.productId,
  ]);
  return {
    ...detail,
    harga_satuan: currentDetail.rows[0].harga_satuan,
    stok_produk_sebelum: available,
    stok_produk_sesudah: stockAfter,
  };
}

async function detailDelete(client: Prisma.TransactionClient, keys: string[]) {
  const product = await query<{ stok_produk: number | null }>(
    client,
    `SELECT stok_produk
     FROM "Produk"
     WHERE id_produk = $1
     FOR UPDATE`,
    [keys[1]],
  );
  const stock: number | null = product.rows[0]?.stok_produk ?? null;
  if (stock === null) {
    throw new RequestError("Stok produk belum diatur; stok detail tidak dapat diselaraskan.", 409);
  }

  const currentDetail = await query<{ jumlah: number }>(
    client,
    `SELECT jumlah
     FROM "DetailPesanan"
     WHERE no_pesanan = $1 AND id_produk = $2
     FOR UPDATE`,
    keys,
  );
  if (currentDetail.rowCount === 0) {
    throw new RequestError("Order detail not found.", 404);
  }

  await query(client,
    `UPDATE "Produk" SET stok_produk = $1 WHERE id_produk = $2`,
    [stock + Number(currentDetail.rows[0].jumlah), keys[1]],
  );
  await query(client,
    `DELETE FROM "DetailPesanan" WHERE no_pesanan = $1 AND id_produk = $2`,
    keys,
  );
}

async function inTransaction<T>(work: (client: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(work, { maxWait: 5000, timeout: 15000 });
}

async function saveRecord(resource: ResourceKey, operation: Operation, body: unknown, user: AuthUser) {
  if (!isRecord(body)) {
    throw new RequestError("Request body must be an object.");
  }
  const values = await normalizeValues(resource, body.values, operation);
  const definition = queries[resource];

  if (resource === "order-details") {
    if (operation === "create") {
      return inTransaction((client) => detailCreate(client, body.values));
    }
    const keys = normalizeKeys(resource, body.keys);
    return inTransaction((client) => detailUpdate(client, keys, body.values));
  }

  const keys = operation === "update" ? normalizeKeys(resource, body.keys) : [];
  if (
    (resource === "customers" || resource === "users") &&
    typeof values.email === "string"
  ) {
    const excludeCustomer = resource === "customers" && operation === "update"
      ? ` AND id_pelanggan <> $2`
      : "";
    const excludeUser = resource === "users" && operation === "update"
      ? ` AND id_pengguna <> $2`
      : "";
    const emailValues = [values.email.toLocaleLowerCase("en")];
    if (excludeCustomer || excludeUser) emailValues.push(keys[0]);
    const existing = await query(prisma,
      `SELECT 1 FROM "Pelanggan" WHERE lower(email) = $1${excludeCustomer}
       UNION ALL
       SELECT 1 FROM "Pengguna" WHERE lower(email) = $1${excludeUser}
       LIMIT 1`,
      emailValues,
    );
    if (existing.rowCount) throw new RequestError("Email sudah digunakan.", 409);
  }

  if (operation === "create") {
    const columns = Object.keys(values);
    if (columns.length === 0) {
      throw new RequestError("At least one field is required.");
    }
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
    const result = await query(prisma,
      `INSERT INTO ${definition.table} (${columns.map((column) => `"${column}"`).join(", ")})
       VALUES (${placeholders})
       RETURNING ${definition.keyFields.map((field) => `"${field}"`).join(", ")}`,
      columns.map((column) => values[column]),
    );
    return result.rows[0];
  }

  const updatedFields = Object.keys(values).filter(
    (field) => !definition.keyFields.includes(field),
  );
  if (updatedFields.length === 0) {
    throw new RequestError("No editable fields were provided.");
  }
  const setClause = updatedFields
    .map((field, index) => `"${field}" = $${index + 1}`)
    .join(", ");
  const scopeClause = user.role === "EMPLOYEE" && resource === "production"
    ? ` AND "id_karyawan" = $${updatedFields.length + keys.length + 1}`
    : "";
  const whereClause = `${keyWhere(resource, updatedFields.length + 1)}${scopeClause}`;
  const result = await query(prisma,
    `UPDATE ${definition.table}
     SET ${setClause}
     WHERE ${whereClause}
     RETURNING ${definition.keyFields.map((field) => `"${field}"`).join(", ")}`,
    [
      ...updatedFields.map((field) => values[field]),
      ...keys,
      ...(scopeClause ? [user.id] : []),
    ],
  );
  if (result.rowCount === 0) {
    throw new RequestError("Record not found.", 404);
  }
  return result.rows[0];
}

async function deleteRecord(resource: ResourceKey, body: unknown) {
  const keys = normalizeKeys(resource, body);
  const definition = queries[resource];

  if (resource === "order-details") {
    return inTransaction((client) => detailDelete(client, keys));
  }

  const result = await query(prisma,
    `DELETE FROM ${definition.table}
     WHERE ${keyWhere(resource)}
     RETURNING ${definition.keyFields.map((field) => `"${field}"`).join(", ")}`,
    keys,
  );
  if (result.rowCount === 0) {
    throw new RequestError("Record not found.", 404);
  }
  return result.rows[0];
}

export async function GET(
  request: Request,
  context: { params: Promise<{ resource: string }> },
) {
  try {
    const { resource: resourceName } = await context.params;
    const resource = parseResource(resourceName);
    const user = await getCurrentUser();
    if (!user) throw new RequestError("Silakan masuk terlebih dahulu.", 401);
    assertCanAccess(user, resource, "GET");
    return await getList(resource, request, user);
  } catch (error) {
    return databaseError(error);
  }
}

async function requestBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new RequestError("Request body must contain valid JSON.");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ resource: string }> },
) {
  try {
    const { resource: resourceName } = await context.params;
    const resource = parseResource(resourceName);
    const user = await getCurrentUser();
    if (!user) throw new RequestError("Silakan masuk terlebih dahulu.", 401);
    assertCanAccess(user, resource, "POST");
    if (user.role === "CUSTOMER") {
      if (resource !== "reviews") {
        throw new RequestError("Buat pesanan melalui alur pemesanan pelanggan.", 400);
      }
      const body = await requestBody(request);
      return NextResponse.json(await createCustomerReview(user, body), { status: 201 });
    }
    const result = await saveRecord(resource, "create", await requestBody(request), user);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return databaseError(error);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ resource: string }> },
) {
  try {
    const { resource: resourceName } = await context.params;
    const resource = parseResource(resourceName);
    const user = await getCurrentUser();
    if (!user) throw new RequestError("Silakan masuk terlebih dahulu.", 401);
    assertCanAccess(user, resource, "PUT");
    const body = await requestBody(request);
    if (user.role === "EMPLOYEE") {
      const values = isRecord(body.values) ? Object.keys(body.values) : [];
      if (!values.length || values.some((field) => !["status_produksi", "tanggal_selesai_produksi"].includes(field))) {
        throw new RequestError("Karyawan hanya dapat memperbarui status dan tanggal selesai produksi.", 403);
      }
    }
    const result = await saveRecord(resource, "update", body, user);
    return NextResponse.json(result);
  } catch (error) {
    return databaseError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ resource: string }> },
) {
  try {
    const { resource: resourceName } = await context.params;
    const resource = parseResource(resourceName);
    const user = await getCurrentUser();
    if (!user) throw new RequestError("Silakan masuk terlebih dahulu.", 401);
    assertCanAccess(user, resource, "DELETE");
    const result = await deleteRecord(resource, await requestBody(request));
    return NextResponse.json(result);
  } catch (error) {
    return databaseError(error);
  }
}

async function createCustomerReview(user: AuthUser, body: unknown) {
  if (!isRecord(body) || !isRecord(body.values)) {
    throw new RequestError("Form data must be an object.");
  }
  const orderNumber = body.values.no_pesanan;
  const rating = Number(body.values.rating);
  const review = body.values.isi_ulasan;
  if (typeof orderNumber !== "string" || !orderNumber.trim() || orderNumber.length > 10) {
    throw new RequestError("Pilih pesanan yang valid.");
  }
  if (!Number.isSafeInteger(rating) || rating < 1 || rating > 5) {
    throw new RequestError("Rating harus antara 1 dan 5.");
  }
  if (typeof review !== "string" || !review.trim() || review.trim().length > 255) {
    throw new RequestError("Ulasan wajib diisi dan maksimal 255 karakter.");
  }
  return inTransaction(async (client) => {
    await client.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${orderNumber.trim()}))`);
    const order = await query(client,
      `SELECT 1 FROM "Pesanan" p
       JOIN "Penyerahan" h ON h.no_pesanan = p.no_pesanan AND h.status_penyerahan = 'Diserahkan'
       WHERE p.no_pesanan = $1 AND p.id_pelanggan = $2`,
      [orderNumber.trim(), user.id],
    );
    if (!order.rowCount) throw new RequestError("Ulasan tersedia setelah pesanan diserahkan.", 409);
    const existing = await query(client,
      `SELECT 1 FROM "Ulasan" WHERE no_pesanan = $1`,
      [orderNumber.trim()],
    );
    if (existing.rowCount) throw new RequestError("Pesanan ini sudah memiliki ulasan.", 409);

    let id: string;
    for (let attempt = 0; ; attempt++) {
      id = `UL${randomBytes(4).toString("hex").toUpperCase()}`;
      const collision = await query(client, `SELECT 1 FROM "Ulasan" WHERE id_ulasan = $1`, [id]);
      if (!collision.rowCount) break;
      if (attempt === 4) throw new RequestError("ID ulasan tidak dapat dibuat. Coba lagi.", 500);
    }
    await query(client,
      `INSERT INTO "Ulasan" (id_ulasan, no_pesanan, rating, isi_ulasan, tanggal_ulasan)
       VALUES ($1, $2, $3, $4, CURRENT_DATE)`,
      [id, orderNumber.trim(), rating, review.trim()],
    );
    return { id_ulasan: id, no_pesanan: orderNumber.trim(), rating, isi_ulasan: review.trim() };
  });
}
