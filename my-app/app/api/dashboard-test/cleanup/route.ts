import { NextResponse } from "next/server";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { prisma } from "@/src/lib/db";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTestProofUrl(value: string) {
  return /^\/api\/customer\/payment-proofs\/[a-f0-9]{32}\.(?:jpg|png|webp|pdf)$/.test(value);
}

export async function GET() {
  if (process.env.NODE_ENV === "production" || process.env.ENABLE_CUSTOMER_FLOW_TESTS !== "true") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const accounts = await prisma.pelanggan.findMany({
    where: { email: { startsWith: "zt-", endsWith: "@example.invalid" } },
    select: { id_pelanggan: true },
  });
  return NextResponse.json({ customerIds: accounts.map((account) => account.id_pelanggan) });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" || process.env.ENABLE_CUSTOMER_FLOW_TESTS !== "true") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!isRecord(body) || typeof body.customerId !== "string" || !/^ZT[A-F0-9]{8}$/.test(body.customerId)) {
    return NextResponse.json({ error: "Invalid test account." }, { status: 400 });
  }
  const customerId = body.customerId;
  const productId = typeof body.productId === "string" && /^ZT[A-F0-9]{8}$/.test(body.productId)
    ? body.productId
    : undefined;
  const uploadedProofUrl = typeof body.proofUrl === "string" && isTestProofUrl(body.proofUrl)
    ? body.proofUrl
    : undefined;

  const result = await prisma.$transaction(async (tx) => {
    const customer = await tx.pelanggan.findUnique({
      where: { id_pelanggan: customerId },
      select: { email: true },
    });
    if (!customer?.email.startsWith("zt-") || !customer.email.endsWith("@example.invalid")) {
      return false;
    }

    const orders = await tx.pesanan.findMany({
      where: { id_pelanggan: customerId },
      select: { no_pesanan: true, status_pesanan: true },
    });
    const orderNumbers = orders.map((order) => order.no_pesanan);
    const ordersToRestock = orders.filter((order) => order.status_pesanan !== "Dibatalkan");
    const detailOrderNumbers = ordersToRestock.map((order) => order.no_pesanan);
    const details = detailOrderNumbers.length
      ? await tx.detailPesanan.findMany({
          where: { no_pesanan: { in: detailOrderNumbers } },
          select: { id_produk: true, jumlah: true },
        })
      : [];
    const payments = orderNumbers.length
      ? await tx.pembayaran.findMany({
          where: { no_pesanan: { in: orderNumbers } },
          select: { bukti_pembayaran_url: true },
        })
      : [];
    for (const detail of details) {
      await tx.produk.update({
        where: { id_produk: detail.id_produk },
        data: { stok_produk: { increment: detail.jumlah } },
      });
    }
    for (const order of orders) {
      await tx.ulasan.deleteMany({ where: { no_pesanan: order.no_pesanan } });
      await tx.produksi.deleteMany({ where: { no_pesanan: order.no_pesanan } });
      await tx.penyerahan.deleteMany({ where: { no_pesanan: order.no_pesanan } });
      await tx.pembayaran.deleteMany({ where: { no_pesanan: order.no_pesanan } });
      await tx.detailPesanan.deleteMany({ where: { no_pesanan: order.no_pesanan } });
    }
    await tx.pesanan.deleteMany({ where: { id_pelanggan: customerId } });
    await tx.pelanggan.delete({ where: { id_pelanggan: customerId } });
    if (productId) {
      const product = await tx.produk.findUnique({
        where: { id_produk: productId },
        select: { nama_produk: true },
      });
      if (product?.nama_produk === "Produk Uji") {
        await tx.produk.delete({ where: { id_produk: productId } });
      }
    }
    return {
      cleaned: true,
      proofUrls: [
        ...payments.flatMap((payment) =>
          payment.bukti_pembayaran_url ? [payment.bukti_pembayaran_url] : []),
        ...(uploadedProofUrl ? [uploadedProofUrl] : []),
      ],
    };
  }, { maxWait: 10000, timeout: 30000 });

  if (result === false) return NextResponse.json({ error: "Test account not found." }, { status: 404 });
  const proofDirectory = process.env.PAYMENT_PROOF_DIR ?? resolve(process.cwd(), ".uploads/payment-proofs");
  await Promise.all(result.proofUrls.filter(isTestProofUrl).map((proofUrl) =>
    rm(join(proofDirectory, proofUrl.split("/").at(-1)!), { force: true })));
  return NextResponse.json({ cleaned: true });
}
