import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import {
  getPaymentProofDirectory,
  isPaymentProofContentValid,
  paymentProofUrl,
} from "@/src/lib/payment-proof";

export const runtime = "nodejs";

const maxProofSize = 5 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse("Silakan masuk terlebih dahulu.", 401);
    if (user.role !== "CUSTOMER") {
      return errorResponse("Tindakan ini hanya tersedia untuk pelanggan.", 403);
    }

    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxProofSize + 64 * 1024) {
      return errorResponse("Ukuran bukti pembayaran maksimal 5 MB.", 413);
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return errorResponse("Formulir unggah tidak valid.", 400);
    }

    const orderNumber = form.get("orderNumber");
    const file = form.get("file");
    if (typeof orderNumber !== "string" || !orderNumber.trim() || orderNumber.length > 10) {
      return errorResponse("Pesanan tidak valid.", 400);
    }
    if (!(file instanceof File) || file.size === 0 || file.size > maxProofSize) {
      return errorResponse("Pilih bukti pembayaran berukuran maksimal 5 MB.", 400);
    }
    if (!allowedTypes.has(file.type)) {
      return errorResponse("Bukti harus berupa gambar JPG, PNG, WebP, atau PDF.", 400);
    }

    const order = await prisma.pesanan.findFirst({
      where: {
        no_pesanan: orderNumber.trim(),
        id_pelanggan: user.id,
      },
      select: {
        status_pesanan: true,
        pembayaran: { select: { status_pembayaran: true } },
      },
    });
    if (!order) return errorResponse("Pesanan tidak ditemukan.", 404);
    if (order.status_pesanan === "Dibatalkan") {
      return errorResponse("Pesanan yang dibatalkan tidak dapat dibayar.", 409);
    }
    const payment = order.pembayaran[0];
    if (payment?.status_pembayaran === "Berhasil") {
      return errorResponse("Pembayaran ini sudah diverifikasi.", 409);
    }
    if (payment?.status_pembayaran === "Konfirmasi") {
      return errorResponse("Konfirmasi pembayaran sedang menunggu verifikasi.", 409);
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (!isPaymentProofContentValid(bytes, file.type)) {
      return errorResponse("Isi file tidak sesuai dengan format bukti pembayaran.", 400);
    }

    const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const filename = `${randomBytes(16).toString("hex")}.${extension}`;
    const directory = getPaymentProofDirectory();
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, filename), bytes, { flag: "wx", mode: 0o600 });

    return NextResponse.json({ proofUrl: paymentProofUrl(filename) }, { status: 201 });
  } catch (error) {
    console.error("Could not upload customer payment proof.", error);
    return errorResponse("Bukti pembayaran tidak dapat diunggah.", 500);
  }
}
