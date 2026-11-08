import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@/src/generated/prisma/client";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";

class OrderRequestError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
  }
}

type OrderItem = { productId: string; quantity: number };

function parseItems(value: unknown): OrderItem[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 30) {
    throw new OrderRequestError("Pilih setidaknya satu produk (maksimal 30).");
  }
  const quantities = new Map<string, number>();
  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new OrderRequestError("Rincian produk tidak valid.");
    }
    const productId = "productId" in item ? item.productId : undefined;
    const rawQuantity = "quantity" in item ? item.quantity : undefined;
    const quantity = typeof rawQuantity === "number" ? rawQuantity : Number(rawQuantity);
    if (typeof productId !== "string" || productId.trim().length === 0 || productId.length > 10) {
      throw new OrderRequestError("Produk tidak valid.");
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999) {
      throw new OrderRequestError("Jumlah produk harus antara 1 dan 999.");
    }
    const combined = (quantities.get(productId.trim()) ?? 0) + quantity;
    if (combined > 999) throw new OrderRequestError("Jumlah produk maksimal 999.");
    quantities.set(productId.trim(), combined);
  }
  return [...quantities]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((left, right) => left.productId.localeCompare(right.productId));
}

async function newId(client: Prisma.TransactionClient, prefix: "PS" | "BY" | "PN") {
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = `${prefix}${randomBytes(4).toString("hex").toUpperCase()}`;
    const exists = prefix === "PS"
      ? await client.pesanan.findUnique({ where: { no_pesanan: id }, select: { no_pesanan: true } })
      : prefix === "BY"
        ? await client.pembayaran.findUnique({ where: { id_pembayaran: id }, select: { id_pembayaran: true } })
        : await client.penyerahan.findUnique({ where: { id_penyerahan: id }, select: { id_penyerahan: true } });
    if (!exists) return id;
  }
  throw new OrderRequestError("Nomor pesanan tidak dapat dibuat. Coba lagi.", 500);
}

async function runOrder(userId: string, items: OrderItem[], paymentMethod: string, handoverMethod: string) {
  return prisma.$transaction(async (client) => {
    const admin = await client.pengguna.findFirst({
      where: { peran: { equals: "Admin", mode: "insensitive" } },
      orderBy: { id_pengguna: "asc" },
      select: { id_pengguna: true },
    });
    if (!admin) {
      throw new OrderRequestError("Pesanan belum dapat dibuat karena akun admin belum tersedia.", 409);
    }

    const orderNumber = await newId(client, "PS");
    const products: Array<OrderItem & { price: string; stock: number }> = [];
    for (const item of items) {
      const result = await client.$queryRaw<Array<{
        id_produk: string;
        harga_produk: Prisma.Decimal | null;
        stok_produk: number | null;
      }>>(Prisma.sql`SELECT id_produk, harga_produk, stok_produk
         FROM "Produk" WHERE id_produk = ${item.productId} FOR UPDATE`);
      const product = result[0];
      if (!product) throw new OrderRequestError("Salah satu produk tidak ditemukan.", 404);
      if (product.harga_produk === null || product.stok_produk === null) {
        throw new OrderRequestError("Harga atau stok salah satu produk belum tersedia.", 409);
      }
      if (item.quantity > product.stok_produk) {
        throw new OrderRequestError(`Stok ${item.productId} tidak mencukupi.`, 409);
      }
      products.push({
        ...item,
        price: product.harga_produk.toString(),
        stock: product.stok_produk,
      });
    }

    const date = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    await client.pesanan.create({
      data: {
        no_pesanan: orderNumber,
        id_pelanggan: userId,
        id_admin: admin.id_pengguna,
        tanggal_pesanan: date,
        status_pesanan: "Baru",
      },
    });
    let total = BigInt(0);
    for (const product of products) {
      const after = product.stock - product.quantity;
      total += BigInt(product.price) * BigInt(product.quantity);
      await client.detailPesanan.create({
        data: {
          no_pesanan: orderNumber,
          id_produk: product.productId,
          jumlah: product.quantity,
          harga_satuan: product.price,
          stok_produk_sebelum: product.stock,
          stok_produk_sesudah: after,
        },
      });
      await client.produk.update({
        where: { id_produk: product.productId },
        data: { stok_produk: after },
      });
    }

    if (total > BigInt("9999999999999999999")) {
      throw new OrderRequestError("Total pesanan melebihi batas nilai transaksi.", 409);
    }

    const paymentId = await newId(client, "BY");
    await client.pembayaran.create({
      data: {
        id_pembayaran: paymentId,
        no_pesanan: orderNumber,
        metode_pembayaran: paymentMethod,
        jumlah_bayar: total.toString(),
        tanggal_bayar: date,
        status_pembayaran: "Menunggu",
      },
    });
    const handoverId = await newId(client, "PN");
    await client.penyerahan.create({
      data: {
        id_penyerahan: handoverId,
        no_pesanan: orderNumber,
        metode_penyerahan: handoverMethod,
        status_penyerahan: "Diproses",
        tanggal_penyerahan: date,
      },
    });

    return { no_pesanan: orderNumber, total: total.toString(), status_pesanan: "Baru" };
  }, { maxWait: 5000, timeout: 15000 });
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Silakan masuk terlebih dahulu." }, { status: 401 });
    if (user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Tindakan ini hanya tersedia untuk pelanggan." }, { status: 403 });
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new OrderRequestError("Permintaan tidak valid.");
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new OrderRequestError("Permintaan tidak valid.");
    }
    const input = body as Record<string, unknown>;
    const paymentMethod = input.paymentMethod;
    const handoverMethod = input.handoverMethod;
    if (!["Transfer", "Tunai", "QRIS"].includes(String(paymentMethod))) {
      throw new OrderRequestError("Pilih metode pembayaran yang valid.");
    }
    if (!["Diantar", "Ambil di Tempat"].includes(String(handoverMethod))) {
      throw new OrderRequestError("Pilih metode penyerahan yang valid.");
    }
    const result = await runOrder(
      user.id,
      parseItems(input.items),
      paymentMethod as string,
      handoverMethod as string,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const status = error instanceof OrderRequestError ? error.status : 500;
    if (status >= 500) console.error("Could not create customer order.", error);
    return NextResponse.json(
      { error: error instanceof OrderRequestError ? error.message : "Pesanan tidak dapat dibuat." },
      { status },
    );
  }
}
