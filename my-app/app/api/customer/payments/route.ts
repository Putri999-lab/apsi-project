import { randomBytes } from "node:crypto";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { Prisma } from "@/src/generated/prisma/client";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { getPaymentProofDirectory, getPaymentProofFilename, paymentProofUrl } from "@/src/lib/payment-proof";

class PaymentRequestError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new PaymentRequestError("Silakan masuk terlebih dahulu.", 401);
    if (user.role !== "CUSTOMER") {
      throw new PaymentRequestError("Tindakan ini hanya tersedia untuk pelanggan.", 403);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new PaymentRequestError("Permintaan tidak valid.");
    }
    if (!isRecord(body) || typeof body.orderNumber !== "string" || body.orderNumber.length > 10) {
      throw new PaymentRequestError("Pesanan tidak valid.");
    }
    const orderNumber = body.orderNumber.trim();
    const method = body.paymentMethod;
    if (method !== "Transfer" && method !== "Tunai" && method !== "QRIS") {
      throw new PaymentRequestError("Pilih metode pembayaran yang valid.");
    }

    let proofUrl: string | null = null;
    if (method !== "Tunai") {
      if (typeof body.proofUrl !== "string" || body.proofUrl.length > 500) {
        throw new PaymentRequestError("Unggah bukti transfer atau QRIS terlebih dahulu.");
      }
      const filename = getPaymentProofFilename(body.proofUrl);
      if (!filename) throw new PaymentRequestError("Bukti pembayaran tidak valid.");
      try {
        await access(join(getPaymentProofDirectory(), filename));
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
          throw new PaymentRequestError("File bukti pembayaran tidak ditemukan. Unggah kembali.", 400);
        }
        throw error;
      }
      proofUrl = paymentProofUrl(filename);
    } else if (body.proofUrl !== undefined && body.proofUrl !== "") {
      throw new PaymentRequestError("Bukti pembayaran hanya digunakan untuk transfer atau QRIS.");
    }

    const payment = await prisma.$transaction(async (tx) => {
      const orders = await tx.$queryRaw<Array<{ status_pesanan: string }>>(
        Prisma.sql`SELECT status_pesanan FROM "Pesanan"
          WHERE no_pesanan = ${orderNumber} AND id_pelanggan = ${user.id}
          FOR UPDATE`,
      );
      const order = orders[0];
      if (!order) throw new PaymentRequestError("Pesanan tidak ditemukan.", 404);
      if (order.status_pesanan === "Dibatalkan") {
        throw new PaymentRequestError("Pesanan yang dibatalkan tidak dapat dibayar.", 409);
      }

      const current = await tx.$queryRaw<Array<{ id_pembayaran: string; status_pembayaran: string }>>(
        Prisma.sql`SELECT id_pembayaran, status_pembayaran FROM "Pembayaran"
          WHERE no_pesanan = ${orderNumber} FOR UPDATE`,
      );
      const row = current[0];
      if (!row) {
        const details = await tx.detailPesanan.findMany({
          where: { no_pesanan: orderNumber },
          select: { jumlah: true, harga_satuan: true },
        });
        if (!details.length) {
          throw new PaymentRequestError("Pesanan belum memiliki rincian yang dapat ditagihkan.", 409);
        }
        const total = details.reduce((sum, detail) =>
          sum + BigInt(detail.harga_satuan.toString()) * BigInt(detail.jumlah), BigInt(0));
        if (total > BigInt("9999999999999999999")) {
          throw new PaymentRequestError("Total pesanan melebihi batas nilai transaksi.", 409);
        }

        let paymentId = "";
        for (let attempt = 0; attempt < 5; attempt++) {
          paymentId = `BY${randomBytes(4).toString("hex").toUpperCase()}`;
          const exists = await tx.pembayaran.findUnique({
            where: { id_pembayaran: paymentId },
            select: { id_pembayaran: true },
          });
          if (!exists) break;
          paymentId = "";
        }
        if (!paymentId) {
          throw new PaymentRequestError("ID pembayaran tidak dapat dibuat. Coba lagi.", 500);
        }

        return tx.pembayaran.create({
          data: {
            id_pembayaran: paymentId,
            no_pesanan: orderNumber,
            metode_pembayaran: method,
            jumlah_bayar: total.toString(),
            tanggal_bayar: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`),
            status_pembayaran: method === "Tunai" ? "Menunggu" : "Konfirmasi",
            bukti_pembayaran_url: proofUrl,
          },
          select: {
            id_pembayaran: true,
            no_pesanan: true,
            metode_pembayaran: true,
            jumlah_bayar: true,
            tanggal_bayar: true,
            status_pembayaran: true,
          },
        });
      }

      if (row.status_pembayaran === "Berhasil") {
        throw new PaymentRequestError("Pembayaran ini sudah diverifikasi.", 409);
      }
      if (row.status_pembayaran === "Konfirmasi") {
        throw new PaymentRequestError("Konfirmasi pembayaran sedang menunggu verifikasi.", 409);
      }

      return tx.pembayaran.update({
        where: { id_pembayaran: row.id_pembayaran },
        data: {
          metode_pembayaran: method,
          status_pembayaran: method === "Tunai" ? "Menunggu" : "Konfirmasi",
          bukti_pembayaran_url: proofUrl,
        },
        select: {
          id_pembayaran: true,
          no_pesanan: true,
          metode_pembayaran: true,
          jumlah_bayar: true,
          tanggal_bayar: true,
          status_pembayaran: true,
        },
      });
    });

    return NextResponse.json({ payment }, { status: 200 });
  } catch (error) {
    const status = error instanceof PaymentRequestError ? error.status : 500;
    if (!(error instanceof PaymentRequestError)) {
      const failure = error as { name?: string; code?: string };
      console.error("Could not update customer payment.", failure.name, failure.code);
    }
    return NextResponse.json(
      { error: error instanceof PaymentRequestError ? error.message : "Pembayaran tidak dapat diperbarui." },
      { status },
    );
  }
}
