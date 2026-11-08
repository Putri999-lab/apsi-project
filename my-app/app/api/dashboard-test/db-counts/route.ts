import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";

export async function GET() {
  if (process.env.NODE_ENV === "production" || process.env.ENABLE_CUSTOMER_FLOW_TESTS !== "true") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const [
    customers,
    users,
    products,
    orders,
    orderDetails,
    payments,
    production,
    handovers,
    reviews,
    productRows,
  ] = await Promise.all([
    prisma.pelanggan.count(),
    prisma.pengguna.count(),
    prisma.produk.count(),
    prisma.pesanan.count(),
    prisma.detailPesanan.count(),
    prisma.pembayaran.count(),
    prisma.produksi.count(),
    prisma.penyerahan.count(),
    prisma.ulasan.count(),
    prisma.produk.findMany({
      select: { harga_produk: true, stok_produk: true, deskripsi_produk: true, url_gambar: true },
    }),
  ]);
  return NextResponse.json({
    counts: { customers, users, products, orders, orderDetails, payments, production, handovers, reviews },
    productAvailability: {
      priced: productRows.filter((product) => product.harga_produk !== null).length,
      withStock: productRows.filter((product) => product.stok_produk !== null).length,
      available: productRows.filter((product) => product.harga_produk !== null && Number(product.stok_produk) > 0).length,
      descriptions: productRows.filter((product) => Boolean(product.deskripsi_produk)).length,
      images: productRows.filter((product) => Boolean(product.url_gambar)).length,
    },
  });
}
