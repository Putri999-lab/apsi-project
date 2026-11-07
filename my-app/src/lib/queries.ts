import type { ResourceKey } from "./catalog";

export type QueryDefinition = {
  table: string;
  alias: string;
  keyFields: string[];
  select: string;
  orderBy: string;
};

export const queries: Record<ResourceKey, QueryDefinition> = {
  customers: {
    table: '"Pelanggan"',
    alias: "pl",
    keyFields: ["id_pelanggan"],
    select: `SELECT pl.id_pelanggan, pl.nama_pelanggan, pl.jenis_kelamin, pl.no_telepon,
                    pl.email, pl.nama_jalan, pl.nomor, pl.kota,
                    (pl.password IS NOT NULL) AS has_password
             FROM "Pelanggan" pl`,
    orderBy: "pl.id_pelanggan",
  },
  users: {
    table: '"Pengguna"',
    alias: "pg",
    keyFields: ["id_pengguna"],
    select: `SELECT pg.id_pengguna, pg.nama_pengguna, pg.jenis_kelamin, pg.no_telepon,
                    pg.email, pg.peran, pg.tanggal_bergabung,
                    (pg.password IS NOT NULL) AS has_password
             FROM "Pengguna" pg`,
    orderBy: "pg.id_pengguna",
  },
  products: {
    table: '"Produk"',
    alias: "pr",
    keyFields: ["id_produk"],
    select: `SELECT pr.id_produk, pr.nama_produk, pr.kategori_produk, pr.satuan_produk,
                    pr.harga_produk, pr.stok_minimum, pr.stok_produk
             FROM "Produk" pr`,
    orderBy: "pr.id_produk",
  },
  orders: {
    table: '"Pesanan"',
    alias: "p",
    keyFields: ["no_pesanan"],
    select: `SELECT p.no_pesanan, p.id_pelanggan, p.id_admin, p.tanggal_pesanan,
                    p.status_pesanan, pl.nama_pelanggan, pg.nama_pengguna AS nama_admin
             FROM "Pesanan" p
             JOIN "Pelanggan" pl ON pl.id_pelanggan = p.id_pelanggan
             JOIN "Pengguna" pg ON pg.id_pengguna = p.id_admin`,
    orderBy: "p.tanggal_pesanan DESC, p.no_pesanan",
  },
  "order-details": {
    table: '"DetailPesanan"',
    alias: "dp",
    keyFields: ["no_pesanan", "id_produk"],
    select: `SELECT dp.no_pesanan, dp.id_produk, dp.jumlah, dp.harga_satuan,
                    dp.stok_produk_sebelum, dp.stok_produk_sesudah, pr.nama_produk
             FROM "DetailPesanan" dp
             JOIN "Produk" pr ON pr.id_produk = dp.id_produk`,
    orderBy: "dp.no_pesanan, dp.id_produk",
  },
  payments: {
    table: '"Pembayaran"',
    alias: "py",
    keyFields: ["id_pembayaran"],
    select: `SELECT py.id_pembayaran, py.no_pesanan, py.metode_pembayaran,
                    py.jumlah_bayar, py.tanggal_bayar, py.status_pembayaran
             FROM "Pembayaran" py`,
    orderBy: "py.tanggal_bayar DESC, py.id_pembayaran",
  },
  production: {
    table: '"Produksi"',
    alias: "prd",
    keyFields: ["id_produksi"],
    select: `SELECT prd.id_produksi, prd.no_pesanan, prd.id_karyawan,
                    prd.status_produksi, prd.tanggal_mulai_produksi,
                    prd.tanggal_selesai_produksi, pg.nama_pengguna AS nama_karyawan
             FROM "Produksi" prd
             JOIN "Pengguna" pg ON pg.id_pengguna = prd.id_karyawan`,
    orderBy: "prd.tanggal_mulai_produksi DESC, prd.id_produksi",
  },
  handover: {
    table: '"Penyerahan"',
    alias: "s",
    keyFields: ["id_penyerahan"],
    select: `SELECT s.id_penyerahan, s.no_pesanan, s.metode_penyerahan,
                    s.status_penyerahan, s.tanggal_penyerahan
             FROM "Penyerahan" s`,
    orderBy: "s.tanggal_penyerahan DESC, s.id_penyerahan",
  },
  reviews: {
    table: '"Ulasan"',
    alias: "u",
    keyFields: ["id_ulasan"],
    select: `SELECT u.id_ulasan, u.no_pesanan, u.rating, u.isi_ulasan,
                    u.tanggal_ulasan, pl.nama_pelanggan
             FROM "Ulasan" u
             JOIN "Pesanan" p ON p.no_pesanan = u.no_pesanan
             JOIN "Pelanggan" pl ON pl.id_pelanggan = p.id_pelanggan`,
    orderBy: "u.tanggal_ulasan DESC, u.id_ulasan",
  },
};
