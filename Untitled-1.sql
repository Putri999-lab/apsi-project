
-- ============================================================
-- DATABASE SISTEM INFORMASI MANAJEMEN DAPUR ABITA
-- CRUD DAN OPERASI PERHITUNGAN TRANSAKSI
-- PostgreSQL / NEON DATABASE
-- ============================================================


-- ============================================================
-- 1. TABEL PELANGGAN
-- ============================================================

-- CREATE
-- Menambahkan pelanggan baru
INSERT INTO "Pelanggan"
(id_pelanggan, nama_pelanggan, jenis_kelamin, no_telepon,
 email, password, nama_jalan, nomor, kota)
VALUES
('PL11', 'Pelanggan Contoh', 'Perempuan', '081234567891',
 'pelanggancontoh@gmail.com', 'HASH_PASSWORD',
 'Jl. Contoh', '10', 'Padang');

-- READ
SELECT * FROM "Pelanggan";

-- UPDATE
UPDATE "Pelanggan"
SET nama_pelanggan = 'Pelanggan Update',
    no_telepon = '081299988877'
WHERE id_pelanggan = 'PL11';

-- DELETE
DELETE FROM "Pelanggan"
WHERE id_pelanggan = 'PL11';


-- ============================================================
-- 2. TABEL PENGGUNA
-- ============================================================

-- CREATE
INSERT INTO "Pengguna"
(id_pengguna, nama_pengguna, jenis_kelamin, no_telepon,
 email, password, peran, tanggal_bergabung)
VALUES
('U07', 'Pengguna Contoh', 'Perempuan', '081234567892',
 'pengguna@gmail.com', 'HASH_PASSWORD',
 'Admin', CURRENT_DATE);

-- READ
SELECT * FROM "Pengguna";

-- UPDATE
UPDATE "Pengguna"
SET nama_pengguna = 'Pengguna Update',
    no_telepon = '081299988866'
WHERE id_pengguna = 'U07';

-- DELETE
DELETE FROM "Pengguna"
WHERE id_pengguna = 'U07';


-- ============================================================
-- 3. TABEL PRODUK
-- MENU SUDAH TERSEDIA, TIDAK MENAMBAHKAN MENU BARU
-- ============================================================

-- READ: Menampilkan seluruh menu yang tersedia
SELECT
    id_produk,
    nama_produk,
    kategori_produk,
    satuan_produk,
    harga_produk,
    stok_produk,
    stok_minimum
FROM "Produk"
ORDER BY nama_produk;

-- UPDATE: Memperbarui harga produk yang sudah tersedia
UPDATE "Produk"
SET harga_produk = harga_produk
WHERE id_produk = 'PR01';

-- UPDATE: Memperbarui stok produk
UPDATE "Produk"
SET stok_produk = stok_produk + 10
WHERE id_produk = 'PR01';

-- DELETE: Menghapus produk jika memang diperlukan
-- Pastikan produk tidak sedang digunakan dalam transaksi
-- DELETE FROM "Produk" WHERE id_produk = 'PR01';


-- ============================================================
-- PERHITUNGAN PERSEDIAAN PRODUK
-- ============================================================

-- Menghitung nilai persediaan setiap produk
SELECT
    id_produk,
    nama_produk,
    stok_produk,
    harga_produk,
    stok_produk * harga_produk AS nilai_persediaan,
    CASE
        WHEN stok_produk <= stok_minimum
        THEN 'Stok Perlu Ditambah'
        ELSE 'Stok Aman'
    END AS status_stok
FROM "Produk";

-- Menghitung total nilai persediaan seluruh produk
SELECT
    SUM(stok_produk * harga_produk) AS total_nilai_persediaan
FROM "Produk";

-- Menghitung jumlah produk yang stoknya perlu ditambah
SELECT
    COUNT(*) AS jumlah_produk_stok_minimum
FROM "Produk"
WHERE stok_produk <= stok_minimum;


-- ============================================================
-- 4. TABEL PESANAN
-- ============================================================

-- CREATE
INSERT INTO "Pesanan"
(no_pesanan, id_pelanggan, id_admin,
 tanggal_pesanan, status_pesanan)
VALUES
('DA-0011', 'PL01', 'U03',
 CURRENT_DATE, 'Diproses');

-- READ
SELECT
    p.no_pesanan,
    pl.nama_pelanggan,
    pg.nama_pengguna AS nama_admin,
    p.tanggal_pesanan,
    p.status_pesanan
FROM "Pesanan" p
JOIN "Pelanggan" pl
    ON p.id_pelanggan = pl.id_pelanggan
JOIN "Pengguna" pg
    ON p.id_admin = pg.id_pengguna
ORDER BY p.tanggal_pesanan DESC;

-- UPDATE
UPDATE "Pesanan"
SET status_pesanan = 'Selesai'
WHERE no_pesanan = 'DA-0011';

-- DELETE
-- Hapus hanya jika tidak memiliki data transaksi terkait
-- DELETE FROM "Pesanan" WHERE no_pesanan = 'DA-0011';

-- Menghitung jumlah pesanan berdasarkan status
SELECT
    status_pesanan,
    COUNT(*) AS jumlah_pesanan
FROM "Pesanan"
GROUP BY status_pesanan;


-- ============================================================
-- 5. TABEL DETAIL PESANAN
-- ============================================================

-- CREATE
-- Menggunakan produk yang sudah tersedia di tabel Produk
-- Harga satuan diambil dari harga produk saat transaksi
INSERT INTO "DetailPesanan"
(no_pesanan, id_produk, jumlah, harga_satuan,
 stok_produk_sebelum, stok_produk_sesudah)
SELECT
    'DA-0011',
    id_produk,
    2,
    harga_produk,
    stok_produk,
    stok_produk - 2
FROM "Produk"
WHERE id_produk = 'PR01'
  AND stok_produk >= 2;

-- READ
SELECT
    dp.no_pesanan,
    pr.nama_produk,
    dp.jumlah,
    dp.harga_satuan,
    dp.jumlah * dp.harga_satuan AS subtotal,
    dp.stok_produk_sebelum,
    dp.stok_produk_sesudah
FROM "DetailPesanan" dp
JOIN "Produk" pr
    ON dp.id_produk = pr.id_produk;

-- UPDATE
UPDATE "DetailPesanan"
SET jumlah = 3
WHERE no_pesanan = 'DA-0011'
AND id_produk = 'PR01';

-- DELETE
DELETE FROM "DetailPesanan"
WHERE no_pesanan = 'DA-0011'
AND id_produk = 'PR01';


-- ============================================================
-- PERHITUNGAN TRANSAKSI
-- ============================================================

-- A. Menghitung subtotal setiap produk
SELECT
    dp.no_pesanan,
    pr.nama_produk,
    dp.jumlah,
    dp.harga_satuan,
    dp.jumlah * dp.harga_satuan AS subtotal
FROM "DetailPesanan" dp
JOIN "Produk" pr
    ON dp.id_produk = pr.id_produk;


-- B. Menghitung total seluruh produk dalam pesanan
SELECT
    no_pesanan,
    SUM(jumlah) AS total_item,
    SUM(jumlah * harga_satuan) AS total_pesanan
FROM "DetailPesanan"
GROUP BY no_pesanan;


-- C. Menghitung total penjualan seluruh transaksi
SELECT
    SUM(jumlah * harga_satuan) AS total_penjualan
FROM "DetailPesanan";


-- D. Menghitung jumlah produk terjual berdasarkan menu
SELECT
    pr.id_produk,
    pr.nama_produk,
    SUM(dp.jumlah) AS total_terjual,
    SUM(dp.jumlah * dp.harga_satuan) AS total_pendapatan
FROM "DetailPesanan" dp
JOIN "Produk" pr
    ON dp.id_produk = pr.id_produk
GROUP BY pr.id_produk, pr.nama_produk
ORDER BY total_terjual DESC;


-- ============================================================
-- 6. TABEL PEMBAYARAN
-- ============================================================

-- CREATE
INSERT INTO "Pembayaran"
(id_pembayaran, no_pesanan, metode_pembayaran,
 jumlah_bayar, tanggal_bayar, status_pembayaran)
VALUES
('BYR11', 'DA-0011', 'Tunai',
 100000, CURRENT_DATE, 'Berhasil');

-- READ
SELECT
    py.id_pembayaran,
    py.no_pesanan,
    py.metode_pembayaran,
    py.jumlah_bayar,
    py.tanggal_bayar,
    py.status_pembayaran
FROM "Pembayaran" py;

-- UPDATE
UPDATE "Pembayaran"
SET status_pembayaran = 'Berhasil'
WHERE id_pembayaran = 'BYR11';

-- DELETE
DELETE FROM "Pembayaran"
WHERE id_pembayaran = 'BYR11';


-- ============================================================
-- PERHITUNGAN PEMBAYARAN
-- ============================================================

-- E. Menghitung total pembayaran berhasil setiap pesanan
SELECT
    no_pesanan,
    SUM(jumlah_bayar) AS total_pembayaran
FROM "Pembayaran"
WHERE status_pembayaran = 'Berhasil'
GROUP BY no_pesanan;


-- F. Menghitung kekurangan pembayaran
WITH TotalPesanan AS (
    SELECT
        no_pesanan,
        SUM(jumlah * harga_satuan) AS total_tagihan
    FROM "DetailPesanan"
    GROUP BY no_pesanan
),
TotalBayar AS (
    SELECT
        no_pesanan,
        SUM(jumlah_bayar) AS total_dibayar
    FROM "Pembayaran"
    WHERE status_pembayaran = 'Berhasil'
    GROUP BY no_pesanan
)
SELECT
    tp.no_pesanan,
    tp.total_tagihan,
    COALESCE(tb.total_dibayar, 0) AS total_dibayar,
    GREATEST(
        tp.total_tagihan - COALESCE(tb.total_dibayar, 0),
        0
    ) AS kekurangan_pembayaran
FROM TotalPesanan tp
LEFT JOIN TotalBayar tb
    ON tp.no_pesanan = tb.no_pesanan;


-- G. Menghitung kelebihan pembayaran atau kembalian
WITH TotalPesanan AS (
    SELECT
        no_pesanan,
        SUM(jumlah * harga_satuan) AS total_tagihan
    FROM "DetailPesanan"
    GROUP BY no_pesanan
),
TotalBayar AS (
    SELECT
        no_pesanan,
        SUM(jumlah_bayar) AS total_dibayar
    FROM "Pembayaran"
    WHERE status_pembayaran = 'Berhasil'
    GROUP BY no_pesanan
)
SELECT
    tp.no_pesanan,
    tp.total_tagihan,
    COALESCE(tb.total_dibayar, 0) AS total_dibayar,
    GREATEST(
        COALESCE(tb.total_dibayar, 0) - tp.total_tagihan,
        0
    ) AS kelebihan_pembayaran
FROM TotalPesanan tp
LEFT JOIN TotalBayar tb
    ON tp.no_pesanan = tb.no_pesanan;


-- H. Menentukan status pembayaran
WITH TotalPesanan AS (
    SELECT
        no_pesanan,
        SUM(jumlah * harga_satuan) AS total_tagihan
    FROM "DetailPesanan"
    GROUP BY no_pesanan
),
TotalBayar AS (
    SELECT
        no_pesanan,
        SUM(jumlah_bayar) AS total_dibayar
    FROM "Pembayaran"
    WHERE status_pembayaran = 'Berhasil'
    GROUP BY no_pesanan
)
SELECT
    tp.no_pesanan,
    tp.total_tagihan,
    COALESCE(tb.total_dibayar, 0) AS total_dibayar,
    CASE
        WHEN COALESCE(tb.total_dibayar, 0) = 0
            THEN 'Belum Dibayar'
        WHEN COALESCE(tb.total_dibayar, 0) < tp.total_tagihan
            THEN 'Belum Lunas'
        WHEN COALESCE(tb.total_dibayar, 0) = tp.total_tagihan
            THEN 'Lunas'
        ELSE 'Kelebihan Pembayaran'
    END AS status_pembayaran
FROM TotalPesanan tp
LEFT JOIN TotalBayar tb
    ON tp.no_pesanan = tb.no_pesanan;


-- ============================================================
-- 7. TABEL PRODUKSI
-- ============================================================

-- CREATE
INSERT INTO "Produksi"
(id_produksi, no_pesanan, id_karyawan,
 status_produksi, tanggal_mulai_produksi,
 tanggal_selesai_produksi)
VALUES
('PRD11', 'DA-0011', 'U04',
 'Diproses', CURRENT_DATE, NULL);

-- READ
SELECT
    prd.id_produksi,
    prd.no_pesanan,
    pg.nama_pengguna AS nama_karyawan,
    prd.status_produksi,
    prd.tanggal_mulai_produksi,
    prd.tanggal_selesai_produksi
FROM "Produksi" prd
JOIN "Pengguna" pg
    ON prd.id_karyawan = pg.id_pengguna;

-- UPDATE
UPDATE "Produksi"
SET status_produksi = 'Selesai',
    tanggal_selesai_produksi = CURRENT_DATE
WHERE id_produksi = 'PRD11';

-- DELETE
DELETE FROM "Produksi"
WHERE id_produksi = 'PRD11';

-- I. Menghitung durasi produksi dalam hari
SELECT
    id_produksi,
    no_pesanan,
    tanggal_mulai_produksi,
    tanggal_selesai_produksi,
    tanggal_selesai_produksi - tanggal_mulai_produksi
        AS durasi_produksi_hari
FROM "Produksi"
WHERE tanggal_selesai_produksi IS NOT NULL;

-- J. Menghitung rata-rata durasi produksi
SELECT
    ROUND(
        AVG(tanggal_selesai_produksi - tanggal_mulai_produksi),
        2
    ) AS rata_rata_durasi_produksi
FROM "Produksi"
WHERE tanggal_selesai_produksi IS NOT NULL;


-- ============================================================
-- 8. TABEL PENYERAHAN
-- ============================================================

-- CREATE
INSERT INTO "Penyerahan"
(id_penyerahan, no_pesanan, metode_penyerahan,
 status_penyerahan, tanggal_penyerahan)
VALUES
('SRH11', 'DA-0011', 'Diantar',
 'Diproses', CURRENT_DATE);

-- READ
SELECT * FROM "Penyerahan";

-- UPDATE
UPDATE "Penyerahan"
SET status_penyerahan = 'Diserahkan'
WHERE id_penyerahan = 'SRH11';

-- DELETE
DELETE FROM "Penyerahan"
WHERE id_penyerahan = 'SRH11';

-- K. Menghitung jumlah penyerahan berdasarkan metode
SELECT
    metode_penyerahan,
    COUNT(*) AS jumlah_penyerahan
FROM "Penyerahan"
GROUP BY metode_penyerahan;


-- ============================================================
-- 9. TABEL ULASAN
-- ============================================================

-- CREATE
INSERT INTO "Ulasan"
(id_ulasan, no_pesanan, rating, isi_ulasan, tanggal_ulasan)
VALUES
('ULS11', 'DA-0011', 5,
 'Produk enak dan pelayanan memuaskan', CURRENT_DATE);

-- READ
SELECT
    u.id_ulasan,
    u.no_pesanan,
    pl.nama_pelanggan,
    u.rating,
    u.isi_ulasan,
    u.tanggal_ulasan
FROM "Ulasan" u
JOIN "Pesanan" p
    ON u.no_pesanan = p.no_pesanan
JOIN "Pelanggan" pl
    ON p.id_pelanggan = pl.id_pelanggan;

-- UPDATE
UPDATE "Ulasan"
SET rating = 4,
    isi_ulasan = 'Produk enak dan pelayanan baik'
WHERE id_ulasan = 'ULS11';

-- DELETE
DELETE FROM "Ulasan"
WHERE id_ulasan = 'ULS11';

-- L. Menghitung rata-rata rating
SELECT
    ROUND(AVG(rating), 2) AS rata_rata_rating
FROM "Ulasan";

-- M. Menghitung jumlah ulasan setiap rating
SELECT
    rating,
    COUNT(*) AS jumlah_ulasan
FROM "Ulasan"
GROUP BY rating
ORDER BY rating DESC;


-- ============================================================
-- 10. LAPORAN TRANSAKSI KESELURUHAN
-- ============================================================

WITH TotalPesanan AS (
    SELECT
        no_pesanan,
        SUM(jumlah * harga_satuan) AS total_tagihan,
        SUM(jumlah) AS total_item
    FROM "DetailPesanan"
    GROUP BY no_pesanan
),
TotalBayar AS (
    SELECT
        no_pesanan,
        SUM(jumlah_bayar) AS total_dibayar
    FROM "Pembayaran"
    WHERE status_pembayaran = 'Berhasil'
    GROUP BY no_pesanan
)
SELECT
    p.no_pesanan,
    pl.nama_pelanggan,
    p.tanggal_pesanan,
    COALESCE(tp.total_item, 0) AS total_item,
    COALESCE(tp.total_tagihan, 0) AS total_tagihan,
    COALESCE(tb.total_dibayar, 0) AS total_dibayar,
    GREATEST(
        COALESCE(tp.total_tagihan, 0)
        - COALESCE(tb.total_dibayar, 0),
        0
    ) AS kekurangan_pembayaran,
    GREATEST(
        COALESCE(tb.total_dibayar, 0)
        - COALESCE(tp.total_tagihan, 0),
        0
    ) AS kelebihan_pembayaran,
    p.status_pesanan
FROM "Pesanan" p
JOIN "Pelanggan" pl
    ON p.id_pelanggan = pl.id_pelanggan
LEFT JOIN TotalPesanan tp
    ON p.no_pesanan = tp.no_pesanan
LEFT JOIN TotalBayar tb
    ON p.no_pesanan = tb.no_pesanan
ORDER BY p.tanggal_pesanan DESC;


-- ============================================================
-- 11. LAPORAN JUMLAH DATA 9 TABEL
-- ============================================================

SELECT 'Pelanggan' AS nama_tabel, COUNT(*) AS jumlah_data
FROM "Pelanggan"

UNION ALL

SELECT 'Pengguna', COUNT(*)
FROM "Pengguna"

UNION ALL

SELECT 'Produk', COUNT(*)
FROM "Produk"

UNION ALL

SELECT 'Pesanan', COUNT(*)
FROM "Pesanan"

UNION ALL

SELECT 'DetailPesanan', COUNT(*)
FROM "DetailPesanan"

UNION ALL

SELECT 'Pembayaran', COUNT(*)
FROM "Pembayaran"

UNION ALL

SELECT 'Produksi', COUNT(*)
FROM "Produksi"

UNION ALL

SELECT 'Penyerahan', COUNT(*)
FROM "Penyerahan"

UNION ALL

SELECT 'Ulasan', COUNT(*)
FROM "Ulasan";


-- ============================================================
-- SELESAI
-- ============================================================
