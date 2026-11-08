import { NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Silakan masuk terlebih dahulu." }, { status: 401 });
    if (user.role !== "ADMIN" && user.role !== "OWNER") {
      return NextResponse.json({ error: "Anda tidak memiliki izin untuk melihat ringkasan operasional." }, { status: 403 });
    }

    const [customerCount, productCount, orderCount, paymentCount, productionCount, handoverCount, userRoles] =
      await prisma.$transaction([
        prisma.pelanggan.count(),
        prisma.produk.count(),
        prisma.pesanan.count(),
        prisma.pembayaran.count(),
        prisma.produksi.count(),
        prisma.penyerahan.count(),
        prisma.pengguna.groupBy({
          by: ["peran"],
          orderBy: { peran: "asc" },
          _count: true,
        }),
      ]);

    return NextResponse.json({
      customerCount,
      productCount,
      orderCount,
      paymentCount,
      productionCount,
      handoverCount,
      userRoles: userRoles.map(({ peran, _count }) => ({ role: peran, count: _count })),
    });
  } catch (error) {
    console.error("Could not load operations summary.", error);
    return NextResponse.json({ error: "Ringkasan operasional tidak dapat dimuat." }, { status: 500 });
  }
}
