ALTER TABLE "Produk"
  ADD COLUMN "deskripsi_produk" VARCHAR(255),
  ADD COLUMN "url_gambar" VARCHAR(500);

ALTER TABLE "Pembayaran"
  ADD COLUMN "bukti_pembayaran_url" VARCHAR(500);
