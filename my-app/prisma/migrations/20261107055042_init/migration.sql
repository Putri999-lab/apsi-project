-- CreateTable
CREATE TABLE "Pelanggan" (
    "id_pelanggan" TEXT NOT NULL,
    "nama_pelanggan" TEXT NOT NULL,
    "jenis_kelamin" TEXT NOT NULL,
    "no_telepon" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nama_jalan" TEXT NOT NULL,
    "nomor" TEXT NOT NULL,
    "kota" TEXT NOT NULL,

    CONSTRAINT "Pelanggan_pkey" PRIMARY KEY ("id_pelanggan")
);

-- CreateTable
CREATE TABLE "Pengguna" (
    "id_pengguna" TEXT NOT NULL,
    "nama_pengguna" TEXT NOT NULL,
    "jenis_kelamin" TEXT NOT NULL,
    "no_telepon" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "peran" TEXT NOT NULL,
    "tanggal_bergabung" DATE NOT NULL,

    CONSTRAINT "Pengguna_pkey" PRIMARY KEY ("id_pengguna")
);

-- CreateTable
CREATE TABLE "Produk" (
    "id_produk" TEXT NOT NULL,
    "nama_produk" TEXT NOT NULL,
    "kategori_produk" TEXT NOT NULL,
    "satuan_produk" TEXT NOT NULL,
    "stok_minimum" INTEGER NOT NULL,

    CONSTRAINT "Produk_pkey" PRIMARY KEY ("id_produk")
);

-- CreateTable
CREATE TABLE "Pesanan" (
    "no_pesanan" TEXT NOT NULL,
    "id_pelanggan" TEXT NOT NULL,
    "id_admin" TEXT NOT NULL,
    "tanggal_pesanan" DATE NOT NULL,
    "status_pesanan" TEXT NOT NULL,

    CONSTRAINT "Pesanan_pkey" PRIMARY KEY ("no_pesanan")
);

-- CreateTable
CREATE TABLE "DetailPesanan" (
    "no_pesanan" TEXT NOT NULL,
    "id_produk" TEXT NOT NULL,
    "jumlah" INTEGER NOT NULL,
    "harga_satuan" INTEGER NOT NULL,
    "stok_produk_sebelum" INTEGER NOT NULL,
    "stok_produk_sesudah" INTEGER NOT NULL,

    CONSTRAINT "DetailPesanan_pkey" PRIMARY KEY ("no_pesanan","id_produk")
);

-- CreateTable
CREATE TABLE "Pembayaran" (
    "id_pembayaran" TEXT NOT NULL,
    "no_pesanan" TEXT NOT NULL,
    "metode_pembayaran" TEXT NOT NULL,
    "jumlah_bayar" INTEGER NOT NULL,
    "tanggal_bayar" DATE NOT NULL,
    "status_pembayaran" TEXT NOT NULL,

    CONSTRAINT "Pembayaran_pkey" PRIMARY KEY ("id_pembayaran")
);

-- CreateTable
CREATE TABLE "Produksi" (
    "id_produksi" TEXT NOT NULL,
    "no_pesanan" TEXT NOT NULL,
    "id_karyawan" TEXT NOT NULL,
    "status_produksi" TEXT NOT NULL,
    "tanggal_mulai_produksi" DATE NOT NULL,
    "tanggal_selesai_produksi" DATE NOT NULL,

    CONSTRAINT "Produksi_pkey" PRIMARY KEY ("id_produksi")
);

-- CreateTable
CREATE TABLE "Penyerahan" (
    "id_penyerahan" TEXT NOT NULL,
    "no_pesanan" TEXT NOT NULL,
    "metode_penyerahan" TEXT NOT NULL,
    "status_penyerahan" TEXT NOT NULL,
    "tanggal_penyerahan" DATE NOT NULL,

    CONSTRAINT "Penyerahan_pkey" PRIMARY KEY ("id_penyerahan")
);

-- CreateTable
CREATE TABLE "Ulasan" (
    "id_ulasan" TEXT NOT NULL,
    "no_pesanan" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "isi_ulasan" TEXT NOT NULL,
    "tanggal_ulasan" DATE NOT NULL,

    CONSTRAINT "Ulasan_pkey" PRIMARY KEY ("id_ulasan")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pembayaran_no_pesanan_key" ON "Pembayaran"("no_pesanan");

-- CreateIndex
CREATE UNIQUE INDEX "Produksi_no_pesanan_key" ON "Produksi"("no_pesanan");

-- CreateIndex
CREATE UNIQUE INDEX "Penyerahan_no_pesanan_key" ON "Penyerahan"("no_pesanan");

-- CreateIndex
CREATE UNIQUE INDEX "Ulasan_no_pesanan_key" ON "Ulasan"("no_pesanan");

-- AddForeignKey
ALTER TABLE "Pesanan" ADD CONSTRAINT "Pesanan_id_pelanggan_fkey" FOREIGN KEY ("id_pelanggan") REFERENCES "Pelanggan"("id_pelanggan") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pesanan" ADD CONSTRAINT "Pesanan_id_admin_fkey" FOREIGN KEY ("id_admin") REFERENCES "Pengguna"("id_pengguna") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetailPesanan" ADD CONSTRAINT "DetailPesanan_no_pesanan_fkey" FOREIGN KEY ("no_pesanan") REFERENCES "Pesanan"("no_pesanan") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetailPesanan" ADD CONSTRAINT "DetailPesanan_id_produk_fkey" FOREIGN KEY ("id_produk") REFERENCES "Produk"("id_produk") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pembayaran" ADD CONSTRAINT "Pembayaran_no_pesanan_fkey" FOREIGN KEY ("no_pesanan") REFERENCES "Pesanan"("no_pesanan") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produksi" ADD CONSTRAINT "Produksi_no_pesanan_fkey" FOREIGN KEY ("no_pesanan") REFERENCES "Pesanan"("no_pesanan") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produksi" ADD CONSTRAINT "Produksi_id_karyawan_fkey" FOREIGN KEY ("id_karyawan") REFERENCES "Pengguna"("id_pengguna") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Penyerahan" ADD CONSTRAINT "Penyerahan_no_pesanan_fkey" FOREIGN KEY ("no_pesanan") REFERENCES "Pesanan"("no_pesanan") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ulasan" ADD CONSTRAINT "Ulasan_no_pesanan_fkey" FOREIGN KEY ("no_pesanan") REFERENCES "Pesanan"("no_pesanan") ON DELETE RESTRICT ON UPDATE CASCADE;
