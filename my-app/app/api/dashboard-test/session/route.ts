import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { setSession } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production" || process.env.ENABLE_CUSTOMER_FLOW_TESTS !== "true") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const role = new URL(request.url).searchParams.get("role");
  if (role === "customer") {
    const id = `ZT${randomBytes(4).toString("hex").toUpperCase()}`;
    const email = `zt-${randomBytes(6).toString("hex")}@example.invalid`;
    const productId = `ZT${randomBytes(4).toString("hex").toUpperCase()}`;
    const customer = await prisma.pelanggan.create({
      data: {
        id_pelanggan: id,
        nama_pelanggan: "Pelanggan Uji",
        jenis_kelamin: "Perempuan",
        no_telepon: "0000000000",
        email,
        nama_jalan: "Jalan Uji",
        nomor: "1",
        kota: "Padang",
      },
      select: { id_pelanggan: true, nama_pelanggan: true, email: true },
    });
    await prisma.produk.create({
      data: {
        id_produk: productId,
        nama_produk: "Produk Uji",
        kategori_produk: "Pengujian",
        satuan_produk: "pcs",
        stok_minimum: 0,
        stok_produk: 1,
        harga_produk: 1000,
        deskripsi_produk: "Data sementara untuk pengujian transaksi lokal.",
      },
    });
    await setSession({
      id: customer.id_pelanggan,
      name: customer.nama_pelanggan,
      email: customer.email,
      role: "CUSTOMER",
    }, "customer");
    return NextResponse.json({ customerId: customer.id_pelanggan, productId });
  }
  if (role === "admin") {
    const admin = await prisma.pengguna.findFirst({
      where: { peran: { equals: "Admin", mode: "insensitive" } },
      select: { id_pengguna: true, nama_pengguna: true, email: true },
    });
    if (!admin) return NextResponse.json({ error: "Admin account unavailable." }, { status: 409 });
    await setSession({
      id: admin.id_pengguna,
      name: admin.nama_pengguna,
      email: admin.email,
      role: "ADMIN",
    }, "staff");
    return NextResponse.json({ role: "admin" });
  }
  if (role === "employee" || role === "owner") {
    const account = await prisma.pengguna.findFirst({
      where: role === "employee"
        ? { peran: { in: ["Karyawan", "Employee"], mode: "insensitive" } }
        : { peran: { equals: "Owner", mode: "insensitive" } },
      orderBy: { id_pengguna: "asc" },
      select: { id_pengguna: true, nama_pengguna: true, email: true },
    });
    if (!account) {
      return NextResponse.json({ error: `${role} account unavailable.` }, { status: 409 });
    }
    await setSession({
      id: account.id_pengguna,
      name: account.nama_pengguna,
      email: account.email,
      role: role === "employee" ? "EMPLOYEE" : "OWNER",
    }, "staff");
    return NextResponse.json({ role, userId: account.id_pengguna });
  }
  return NextResponse.json({ error: "Unknown test role." }, { status: 400 });
}
