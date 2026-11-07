import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dapur Abita | Sistem Manajemen Pesanan",
  description: "Sistem informasi manajemen pesanan, produksi, dan penjualan Dapur Abita.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
