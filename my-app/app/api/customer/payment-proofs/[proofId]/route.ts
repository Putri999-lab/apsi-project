import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { getPaymentProofDirectory, getPaymentProofType, paymentProofUrl } from "@/src/lib/payment-proof";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ proofId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Silakan masuk terlebih dahulu." }, { status: 401 });
  if (!["CUSTOMER", "ADMIN", "OWNER"].includes(user.role)) {
    return NextResponse.json({ error: "Anda tidak memiliki izin untuk melihat bukti pembayaran." }, { status: 403 });
  }

  const { proofId } = await context.params;
  const contentType = getPaymentProofType(proofId);
  if (!contentType) return NextResponse.json({ error: "Bukti pembayaran tidak ditemukan." }, { status: 404 });

  const payment = await prisma.pembayaran.findFirst({
    where: {
      bukti_pembayaran_url: paymentProofUrl(proofId),
      ...(user.role === "CUSTOMER" ? { pesanan: { id_pelanggan: user.id } } : {}),
    },
    select: { id_pembayaran: true },
  });
  if (!payment) return NextResponse.json({ error: "Bukti pembayaran tidak ditemukan." }, { status: 404 });

  try {
    const bytes = await readFile(join(getPaymentProofDirectory(), proofId));
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": contentType === "application/pdf" ? "attachment" : "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return NextResponse.json({ error: "File bukti pembayaran tidak ditemukan." }, { status: 404 });
    }
    console.error("Could not read customer payment proof.", error);
    return NextResponse.json({ error: "Bukti pembayaran tidak dapat dibuka." }, { status: 500 });
  }
}
