import { NextResponse } from "next/server";
import { Prisma } from "@/src/generated/prisma/client";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";

class CancelOrderError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ orderNumber: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new CancelOrderError("Silakan masuk terlebih dahulu.", 401);
    if (user.role !== "CUSTOMER") {
      throw new CancelOrderError("Tindakan ini hanya tersedia untuk pelanggan.", 403);
    }

    const { orderNumber } = await context.params;
    if (!orderNumber.trim() || orderNumber.length > 10) {
      throw new CancelOrderError("Nomor pesanan tidak valid.");
    }

    await prisma.$transaction(async (tx) => {
      const orders = await tx.$queryRaw<Array<{ status_pesanan: string }>>(
        Prisma.sql`SELECT status_pesanan FROM "Pesanan"
          WHERE no_pesanan = ${orderNumber} AND id_pelanggan = ${user.id}
          FOR UPDATE`,
      );
      const order = orders[0];
      if (!order) throw new CancelOrderError("Pesanan tidak ditemukan.", 404);
      if (order.status_pesanan !== "Baru") {
        throw new CancelOrderError("Pesanan hanya dapat dibatalkan sebelum diproses.", 409);
      }

      const payments = await tx.$queryRaw<Array<{ status_pembayaran: string }>>(
        Prisma.sql`SELECT status_pembayaran FROM "Pembayaran" WHERE no_pesanan = ${orderNumber}`,
      );
      if (payments.some((payment) => ["Konfirmasi", "Berhasil"].includes(payment.status_pembayaran))) {
        throw new CancelOrderError("Pembayaran sedang diverifikasi atau sudah berhasil; pesanan tidak dapat dibatalkan.", 409);
      }

      const production = await tx.produksi.findFirst({
        where: { no_pesanan: orderNumber },
        select: { id_produksi: true },
      });
      if (production) {
        throw new CancelOrderError("Pesanan yang sudah masuk produksi tidak dapat dibatalkan.", 409);
      }

      const details = await tx.$queryRaw<Array<{
        id_produk: string;
        jumlah: number;
        stok_produk: number | null;
      }>>(Prisma.sql`SELECT dp.id_produk, dp.jumlah, pr.stok_produk
        FROM "DetailPesanan" dp
        JOIN "Produk" pr ON pr.id_produk = dp.id_produk
        WHERE dp.no_pesanan = ${orderNumber}
        FOR UPDATE OF pr`);
      if (details.some((detail) => detail.stok_produk === null)) {
        throw new CancelOrderError("Stok produk belum tercatat; hubungi Admin sebelum membatalkan pesanan.", 409);
      }

      const updated = await tx.$queryRaw<Array<{ no_pesanan: string }>>(
        Prisma.sql`UPDATE "Pesanan" SET status_pesanan = 'Dibatalkan'
          WHERE no_pesanan = ${orderNumber}
            AND id_pelanggan = ${user.id}
            AND status_pesanan = 'Baru'
          RETURNING no_pesanan`,
      );
      if (!updated.length) throw new CancelOrderError("Status pesanan berubah. Muat ulang halaman dan coba lagi.", 409);

      for (const detail of details) {
        await tx.produk.update({
          where: { id_produk: detail.id_produk },
          data: { stok_produk: { increment: detail.jumlah } },
        });
      }
    }, { maxWait: 5000, timeout: 15000 });

    return NextResponse.json({ no_pesanan: orderNumber, status_pesanan: "Dibatalkan" });
  } catch (error) {
    const status = error instanceof CancelOrderError ? error.status : 500;
    if (!(error instanceof CancelOrderError)) {
      console.error("Could not cancel customer order.", error);
    }
    return NextResponse.json(
      { error: error instanceof CancelOrderError ? error.message : "Pesanan tidak dapat dibatalkan." },
      { status },
    );
  }
}
