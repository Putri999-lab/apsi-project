import "dotenv/config";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const tables = [
  {
    name: "Pelanggan",
    delegate: "pelanggan",
    columns: [
      { field: "id_pelanggan", header: "id_pelanggan (PK)", index: 2 },
      { field: "nama_pelanggan", header: "nama_pelanggan", index: 3 },
      { field: "jenis_kelamin", header: "jenis_kelamin", index: 4 },
      { field: "no_telepon", header: "no_telepon", index: 5 },
      { field: "email", header: "email", index: 6 },
      { field: "nama_jalan", header: "nama_jalan", index: 7 },
      { field: "nomor", header: "nomor", index: 8 },
      { field: "kota", header: "kota", index: 9 },
    ],
    primaryKey: ["id_pelanggan"],
    uniqueKeys: [["id_pelanggan"]],
    lookupFields: ["id_pelanggan"],
    dateFields: [],
    intFields: [],
  },
  {
    name: "Pengguna",
    delegate: "pengguna",
    columns: [
      { field: "id_pengguna", header: "id_pengguna (PK)", index: 11 },
      { field: "nama_pengguna", header: "nama_pengguna", index: 12 },
      { field: "jenis_kelamin", header: "jenis_kelamin", index: 13 },
      { field: "no_telepon", header: "no_telepon", index: 14 },
      { field: "email", header: "email", index: 15 },
      { field: "peran", header: "peran", index: 16 },
      { field: "tanggal_bergabung", header: "tanggal_bergabung", index: 17 },
    ],
    primaryKey: ["id_pengguna"],
    uniqueKeys: [["id_pengguna"]],
    lookupFields: ["id_pengguna"],
    dateFields: ["tanggal_bergabung"],
    intFields: [],
  },
  {
    name: "Produk",
    delegate: "produk",
    columns: [
      { field: "id_produk", header: "id_produk (PK)", index: 19 },
      { field: "nama_produk", header: "nama_produk", index: 20 },
      { field: "kategori_produk", header: "kategori_produk", index: 21 },
      { field: "satuan_produk", header: "satuan_produk", index: 22 },
      { field: "stok_minimum", header: "stok_minimum", index: 23 },
    ],
    primaryKey: ["id_produk"],
    uniqueKeys: [["id_produk"]],
    lookupFields: ["id_produk"],
    dateFields: [],
    intFields: ["stok_minimum"],
  },
  {
    name: "Pesanan",
    delegate: "pesanan",
    columns: [
      { field: "no_pesanan", header: "no_pesanan (PK)", index: 25 },
      { field: "id_pelanggan", header: "id_pelanggan (FK)", index: 26 },
      { field: "id_admin", header: "id_admin (FK)", index: 27 },
      { field: "tanggal_pesanan", header: "tanggal_pesanan", index: 28 },
      { field: "status_pesanan", header: "status_pesanan", index: 29 },
    ],
    primaryKey: ["no_pesanan"],
    uniqueKeys: [["no_pesanan"]],
    lookupFields: ["no_pesanan"],
    dateFields: ["tanggal_pesanan"],
    intFields: [],
  },
  {
    name: "DetailPesanan",
    delegate: "detailPesanan",
    columns: [
      { field: "no_pesanan", header: "no_pesanan (PK, FK)", index: 31 },
      { field: "id_produk", header: "id_produk (PK, FK)", index: 32 },
      { field: "jumlah", header: "jumlah", index: 33 },
      { field: "harga_satuan", header: "harga_satuan", index: 34 },
      { field: "stok_produk_sebelum", header: "stok_produk_sebelum", index: 35 },
      { field: "stok_produk_sesudah", header: "stok_produk_sesudah", index: 36 },
    ],
    primaryKey: ["no_pesanan", "id_produk"],
    uniqueKeys: [["no_pesanan", "id_produk"]],
    lookupFields: ["no_pesanan", "id_produk"],
    dateFields: [],
    intFields: [
      "jumlah",
      "harga_satuan",
      "stok_produk_sebelum",
      "stok_produk_sesudah",
    ],
  },
  {
    name: "Pembayaran",
    delegate: "pembayaran",
    columns: [
      { field: "id_pembayaran", header: "id_pembayaran (PK)", index: 38 },
      { field: "no_pesanan", header: "no_pesanan (FK)", index: 39 },
      { field: "metode_pembayaran", header: "metode_pembayaran", index: 40 },
      { field: "jumlah_bayar", header: "jumlah_bayar", index: 41 },
      { field: "tanggal_bayar", header: "tanggal_bayar", index: 42 },
      { field: "status_pembayaran", header: "status_pembayaran", index: 43 },
    ],
    primaryKey: ["id_pembayaran"],
    uniqueKeys: [["id_pembayaran"], ["no_pesanan"]],
    lookupFields: ["id_pembayaran", "no_pesanan"],
    dateFields: ["tanggal_bayar"],
    intFields: ["jumlah_bayar"],
  },
  {
    name: "Produksi",
    delegate: "produksi",
    columns: [
      { field: "id_produksi", header: "id_produksi (PK)", index: 45 },
      { field: "no_pesanan", header: "no_pesanan (FK)", index: 46 },
      { field: "id_karyawan", header: "id_karyawan (FK)", index: 47 },
      { field: "status_produksi", header: "status_produksi", index: 48 },
      {
        field: "tanggal_mulai_produksi",
        header: "tanggal_mulai_produksi",
        index: 49,
      },
      {
        field: "tanggal_selesai_produksi",
        header: "tanggal_selesai_produksi",
        index: 50,
      },
    ],
    primaryKey: ["id_produksi"],
    uniqueKeys: [["id_produksi"], ["no_pesanan"]],
    lookupFields: ["id_produksi", "no_pesanan"],
    dateFields: ["tanggal_mulai_produksi", "tanggal_selesai_produksi"],
    intFields: [],
  },
  {
    name: "Penyerahan",
    delegate: "penyerahan",
    columns: [
      { field: "id_penyerahan", header: "id_penyerahan (PK)", index: 52 },
      { field: "no_pesanan", header: "no_pesanan (FK)", index: 53 },
      { field: "metode_penyerahan", header: "metode_penyerahan", index: 54 },
      { field: "status_penyerahan", header: "status_penyerahan", index: 55 },
      { field: "tanggal_penyerahan", header: "tanggal_penyerahan", index: 56 },
    ],
    primaryKey: ["id_penyerahan"],
    uniqueKeys: [["id_penyerahan"], ["no_pesanan"]],
    lookupFields: ["id_penyerahan", "no_pesanan"],
    dateFields: ["tanggal_penyerahan"],
    intFields: [],
  },
  {
    name: "Ulasan",
    delegate: "ulasan",
    columns: [
      { field: "id_ulasan", header: "id_ulasan (PK)", index: 58 },
      { field: "no_pesanan", header: "no_pesanan (FK)", index: 59 },
      { field: "rating", header: "rating", index: 60 },
      { field: "isi_ulasan", header: "isi_ulasan", index: 61 },
      { field: "tanggal_ulasan", header: "tanggal_ulasan", index: 62 },
    ],
    primaryKey: ["id_ulasan"],
    uniqueKeys: [["id_ulasan"], ["no_pesanan"]],
    lookupFields: ["id_ulasan", "no_pesanan"],
    dateFields: ["tanggal_ulasan"],
    intFields: ["rating"],
  },
];

const readWorkbook = String.raw`
import json
import sys
from datetime import datetime
from openpyxl import load_workbook

workbook_path = sys.argv[1]
tables = json.loads(sys.argv[2])
workbook = load_workbook(workbook_path, data_only=True, read_only=True)
if "3NF" not in workbook.sheetnames:
    raise ValueError("The workbook does not contain the expected 3NF worksheet.")
worksheet = workbook["3NF"]
result = {}

for table in tables:
    headers = table["columns"]
    actual_headers = [worksheet.cell(3, column["index"]).value for column in headers]
    expected_headers = [column["header"] for column in headers]
    if actual_headers != expected_headers:
        raise ValueError(
            f'{table["name"]} headers do not match the Prisma model: '
            f"expected {expected_headers}, found {actual_headers}"
        )

    records = []
    for row_number in range(4, worksheet.max_row + 1):
        values = {
            column["field"]: worksheet.cell(row_number, column["index"]).value
            for column in headers
        }
        if all(value is None for value in values.values()):
            continue
        for field, value in values.items():
            if value is None:
                raise ValueError(
                    f'{table["name"]} row {row_number} has a missing value in {field}.'
                )
            if field in table["dateFields"]:
                if not isinstance(value, datetime):
                    raise ValueError(
                        f'{table["name"]} row {row_number} has a non-date value in {field}.'
                    )
                values[field] = value.date().isoformat()
        records.append(values)

    if not records:
        raise ValueError(f'{table["name"]} contains no data rows on the 3NF worksheet.')
    result[table["name"]] = records

print(json.dumps(result, ensure_ascii=False))
`;

const workbookPath = resolve(
  process.argv[2] ?? String.raw`C:\Users\User\Downloads\unf dan nf.xlsx`,
);
const pythonResult = spawnSync(
  "python",
  [
    "-c",
    readWorkbook,
    workbookPath,
    JSON.stringify(
      tables.map(({ name, columns, dateFields }) => ({
        name,
        columns,
        dateFields,
      })),
    ),
  ],
  { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
);

if (pythonResult.error) {
  throw new Error(`Could not read the Excel workbook: ${pythonResult.error.message}`);
}
if (pythonResult.status !== 0) {
  throw new Error(`Could not read the Excel workbook:\n${pythonResult.stderr}`);
}

const sourceData = JSON.parse(pythonResult.stdout);
const foreignKeys = [
  ["Pesanan", "id_pelanggan", "Pelanggan", "id_pelanggan"],
  ["Pesanan", "id_admin", "Pengguna", "id_pengguna"],
  ["DetailPesanan", "no_pesanan", "Pesanan", "no_pesanan"],
  ["DetailPesanan", "id_produk", "Produk", "id_produk"],
  ["Pembayaran", "no_pesanan", "Pesanan", "no_pesanan"],
  ["Produksi", "no_pesanan", "Pesanan", "no_pesanan"],
  ["Produksi", "id_karyawan", "Pengguna", "id_pengguna"],
  ["Penyerahan", "no_pesanan", "Pesanan", "no_pesanan"],
  ["Ulasan", "no_pesanan", "Pesanan", "no_pesanan"],
];

function keyOf(record, fields) {
  return JSON.stringify(fields.map((field) => record[field]));
}

function sameValue(left, right, field) {
  if (left instanceof Date && right instanceof Date) {
    return left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10);
  }
  return left === right;
}

function sameRecord(left, right, fields) {
  return fields.every((field) => sameValue(left[field], right[field], field));
}

for (const table of tables) {
  const rows = sourceData[table.name];
  const uniqueKeys = new Set();
  for (const [index, row] of rows.entries()) {
    for (const field of table.columns.map((column) => column.field)) {
      if (row[field] === null || row[field] === undefined) {
        throw new Error(`${table.name} source row ${index + 1} is missing ${field}.`);
      }
    }
    for (const field of table.dateFields) {
      if (
        typeof row[field] !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(row[field]) ||
        Number.isNaN(Date.parse(`${row[field]}T00:00:00.000Z`))
      ) {
        throw new Error(`${table.name} source row ${index + 1} has an invalid ${field}.`);
      }
      row[field] = new Date(`${row[field]}T00:00:00.000Z`);
    }
    for (const field of table.intFields) {
      if (!Number.isInteger(row[field])) {
        throw new Error(`${table.name} source row ${index + 1} has a non-integer ${field}.`);
      }
    }
    for (const uniqueKey of table.uniqueKeys) {
      const key = keyOf(row, uniqueKey);
      if (uniqueKeys.has(`${uniqueKey.join(",")}:${key}`)) {
        throw new Error(`${table.name} contains a duplicate key for ${uniqueKey.join(", ")}.`);
      }
      uniqueKeys.add(`${uniqueKey.join(",")}:${key}`);
    }
  }
}

for (const [childName, childField, parentName, parentField] of foreignKeys) {
  const parentValues = new Set(
    sourceData[parentName].map((row) => row[parentField]),
  );
  const missing = sourceData[childName].find((row) => !parentValues.has(row[childField]));
  if (missing) {
    throw new Error(
      `${childName} contains a ${childField} value without a matching ${parentName} record.`,
    );
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured.");
}

const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
  import("../generated/prisma/client.ts"),
  import("@prisma/adapter-pg"),
]);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

try {
  const preflight = await Promise.all(
    tables.map(async (table) => {
      const rows = sourceData[table.name];
      const lookupFilters = table.lookupFields.map((field) => ({
        [field]: { in: [...new Set(rows.map((row) => row[field]))] },
      }));
      const existing = await prisma[table.delegate].findMany({
        where: { OR: lookupFilters },
      });

      const newRows = [];
      for (const row of rows) {
        const collisions = existing.filter((stored) =>
          table.uniqueKeys.some((fields) =>
            fields.every((field) => stored[field] === row[field]),
          ),
        );
        if (collisions.some((stored) => !sameRecord(stored, row, table.columns.map((c) => c.field)))) {
          throw new Error(
            `${table.name} has an existing record with a conflicting value; no data was written.`,
          );
        }
        if (collisions.length === 0) {
          newRows.push(row);
        }
      }
      return { table, rows, newRows };
    }),
  );

  const inserted = await prisma.$transaction(
    async (transaction) => {
      const counts = {};
      for (const { table, rows, newRows } of preflight) {
        const model = transaction[table.delegate];
        const result =
          newRows.length === 0
            ? { count: 0 }
            : await model.createMany({ data: newRows, skipDuplicates: true });

        const lookupFilters = table.lookupFields.map((field) => ({
          [field]: { in: [...new Set(rows.map((row) => row[field]))] },
        }));
        const storedRows = await model.findMany({ where: { OR: lookupFilters } });
        const byPrimaryKey = new Map(
          storedRows.map((row) => [keyOf(row, table.primaryKey), row]),
        );
        for (const sourceRow of rows) {
          const stored = byPrimaryKey.get(keyOf(sourceRow, table.primaryKey));
          if (!stored || !sameRecord(stored, sourceRow, table.columns.map((c) => c.field))) {
            throw new Error(
              `${table.name} verification failed; the import transaction was rolled back.`,
            );
          }
        }
        counts[table.name] = result.count;
      }
      return counts;
    },
    { timeout: 120_000 },
  );

  const totals = await Promise.all(
    tables.map(async (table) => [
      table.name,
      await prisma[table.delegate].count(),
    ]),
  );
  const report = tables.map((table) => ({
    table: table.name,
    sourceRows: sourceData[table.name].length,
    importedNow: inserted[table.name],
    alreadyPresent: sourceData[table.name].length - inserted[table.name],
    totalInDatabase: Object.fromEntries(totals)[table.name],
    verified: true,
  }));
  console.log(JSON.stringify({ workbook: workbookPath, sheet: "3NF", tables: report }, null, 2));
} finally {
  await prisma.$disconnect();
}
