export type ResourceKey =
  | "customers"
  | "users"
  | "products"
  | "orders"
  | "order-details"
  | "payments"
  | "production"
  | "handover"
  | "reviews";

export type FieldKind =
  | "text"
  | "email"
  | "password"
  | "number"
  | "money"
  | "date"
  | "select"
  | "textarea";

export type FormField = {
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  options?: string[];
  reference?: ResourceKey;
};

export type ResourceDefinition = {
  title: string;
  titlePlural: string;
  idFields: string[];
  searchFields: string[];
  fields: FormField[];
};

const orderStatuses = ["Baru", "Diproses", "Selesai", "Dibatalkan"];
const productionStatuses = ["Diproses", "Selesai"];
const deliveryStatuses = ["Diproses", "Diserahkan"];

export const resources: Record<ResourceKey, ResourceDefinition> = {
  customers: {
    title: "Pelanggan",
    titlePlural: "Pelanggan",
    idFields: ["id_pelanggan"],
    searchFields: ["id_pelanggan", "nama_pelanggan", "no_telepon", "email"],
    fields: [
      { name: "id_pelanggan", label: "ID pelanggan", kind: "text", required: true, maxLength: 10 },
      { name: "nama_pelanggan", label: "Nama pelanggan", kind: "text", required: true, maxLength: 50 },
      {
        name: "jenis_kelamin",
        label: "Jenis kelamin",
        kind: "select",
        required: true,
        maxLength: 10,
        options: ["Perempuan", "Laki-laki"],
      },
      { name: "no_telepon", label: "Nomor telepon", kind: "text", required: true, maxLength: 16 },
      { name: "email", label: "Email", kind: "email", required: true, maxLength: 40 },
      { name: "password", label: "Kata sandi", kind: "password", required: true, maxLength: 255 },
      { name: "nama_jalan", label: "Nama jalan", kind: "text", required: true, maxLength: 50 },
      { name: "nomor", label: "Nomor alamat", kind: "text", required: true, maxLength: 10 },
      { name: "kota", label: "Kota", kind: "text", required: true, maxLength: 15 },
    ],
  },
  users: {
    title: "Pengguna",
    titlePlural: "Pengguna",
    idFields: ["id_pengguna"],
    searchFields: ["id_pengguna", "nama_pengguna", "no_telepon", "email", "peran"],
    fields: [
      { name: "id_pengguna", label: "ID pengguna", kind: "text", required: true, maxLength: 10 },
      { name: "nama_pengguna", label: "Nama pengguna", kind: "text", required: true, maxLength: 50 },
      {
        name: "jenis_kelamin",
        label: "Jenis kelamin",
        kind: "select",
        required: true,
        maxLength: 10,
        options: ["Perempuan", "Laki-laki"],
      },
      { name: "no_telepon", label: "Nomor telepon", kind: "text", required: true, maxLength: 16 },
      { name: "email", label: "Email", kind: "email", required: true, maxLength: 40 },
      {
        name: "peran",
        label: "Peran",
        kind: "select",
        required: true,
        maxLength: 10,
        options: ["Owner", "Admin", "Employee", "Karyawan"],
      },
      { name: "tanggal_bergabung", label: "Tanggal bergabung", kind: "date", required: true },
      { name: "password", label: "Kata sandi", kind: "password", required: true, maxLength: 255 },
    ],
  },
  products: {
    title: "Produk",
    titlePlural: "Produk",
    idFields: ["id_produk"],
    searchFields: ["id_produk", "nama_produk", "kategori_produk"],
    fields: [
      { name: "id_produk", label: "ID produk", kind: "text", required: true, maxLength: 10 },
      { name: "nama_produk", label: "Nama produk", kind: "text", required: true, maxLength: 30 },
      { name: "kategori_produk", label: "Kategori", kind: "text", required: true, maxLength: 20 },
      { name: "satuan_produk", label: "Satuan", kind: "text", required: true, maxLength: 10 },
      { name: "harga_produk", label: "Harga", kind: "money", required: true, min: 0 },
      { name: "stok_minimum", label: "Stok minimum", kind: "number", required: true, min: 0 },
      { name: "stok_produk", label: "Stok saat ini", kind: "number", required: true, min: 0 },
    ],
  },
  orders: {
    title: "Pesanan",
    titlePlural: "Pesanan",
    idFields: ["no_pesanan"],
    searchFields: ["p.no_pesanan", "pl.nama_pelanggan", "pg.nama_pengguna", "p.status_pesanan"],
    fields: [
      { name: "no_pesanan", label: "Nomor pesanan", kind: "text", required: true, maxLength: 10 },
      { name: "id_pelanggan", label: "Pelanggan", kind: "select", required: true, reference: "customers" },
      { name: "id_admin", label: "Admin", kind: "select", required: true, reference: "users" },
      { name: "tanggal_pesanan", label: "Tanggal pesanan", kind: "date", required: true },
      {
        name: "status_pesanan",
        label: "Status pesanan",
        kind: "select",
        required: true,
        maxLength: 10,
        options: orderStatuses,
      },
    ],
  },
  "order-details": {
    title: "Detail pesanan",
    titlePlural: "Detail pesanan",
    idFields: ["no_pesanan", "id_produk"],
    searchFields: ["dp.no_pesanan", "dp.id_produk", "pr.nama_produk"],
    fields: [
      { name: "no_pesanan", label: "Pesanan", kind: "select", required: true, reference: "orders" },
      { name: "id_produk", label: "Produk", kind: "select", required: true, reference: "products" },
      { name: "jumlah", label: "Jumlah", kind: "number", required: true, min: 1 },
    ],
  },
  payments: {
    title: "Pembayaran",
    titlePlural: "Pembayaran",
    idFields: ["id_pembayaran"],
    searchFields: ["py.id_pembayaran", "py.no_pesanan", "py.metode_pembayaran", "py.status_pembayaran"],
    fields: [
      { name: "id_pembayaran", label: "ID pembayaran", kind: "text", required: true, maxLength: 10 },
      { name: "no_pesanan", label: "Pesanan", kind: "select", required: true, reference: "orders" },
      {
        name: "metode_pembayaran",
        label: "Metode pembayaran",
        kind: "select",
        required: true,
        maxLength: 10,
        options: ["Transfer", "Tunai", "QRIS"],
      },
      { name: "jumlah_bayar", label: "Jumlah bayar", kind: "money", required: true, min: 0 },
      { name: "tanggal_bayar", label: "Tanggal bayar", kind: "date", required: true },
      {
        name: "status_pembayaran",
        label: "Status pembayaran",
        kind: "select",
        required: true,
        maxLength: 10,
        options: ["Menunggu", "Berhasil", "Gagal"],
      },
    ],
  },
  production: {
    title: "Produksi",
    titlePlural: "Produksi",
    idFields: ["id_produksi"],
    searchFields: ["prd.id_produksi", "prd.no_pesanan", "pg.nama_pengguna", "prd.status_produksi"],
    fields: [
      { name: "id_produksi", label: "ID produksi", kind: "text", required: true, maxLength: 10 },
      { name: "no_pesanan", label: "Pesanan", kind: "select", required: true, reference: "orders" },
      { name: "id_karyawan", label: "Karyawan", kind: "select", required: true, reference: "users" },
      {
        name: "status_produksi",
        label: "Status produksi",
        kind: "select",
        required: true,
        maxLength: 10,
        options: productionStatuses,
      },
      { name: "tanggal_mulai_produksi", label: "Tanggal mulai", kind: "date", required: true },
      { name: "tanggal_selesai_produksi", label: "Tanggal selesai", kind: "date" },
    ],
  },
  handover: {
    title: "Penyerahan",
    titlePlural: "Penyerahan",
    idFields: ["id_penyerahan"],
    searchFields: ["s.id_penyerahan", "s.no_pesanan", "s.metode_penyerahan", "s.status_penyerahan"],
    fields: [
      { name: "id_penyerahan", label: "ID penyerahan", kind: "text", required: true, maxLength: 10 },
      { name: "no_pesanan", label: "Pesanan", kind: "select", required: true, reference: "orders" },
      {
        name: "metode_penyerahan",
        label: "Metode penyerahan",
        kind: "select",
        required: true,
        maxLength: 20,
        options: ["Diantar", "Ambil di Tempat"],
      },
      {
        name: "status_penyerahan",
        label: "Status penyerahan",
        kind: "select",
        required: true,
        maxLength: 15,
        options: deliveryStatuses,
      },
      { name: "tanggal_penyerahan", label: "Tanggal penyerahan", kind: "date", required: true },
    ],
  },
  reviews: {
    title: "Ulasan",
    titlePlural: "Ulasan",
    idFields: ["id_ulasan"],
    searchFields: ["u.id_ulasan", "u.no_pesanan", "u.isi_ulasan", "p.nama_pelanggan"],
    fields: [
      { name: "id_ulasan", label: "ID ulasan", kind: "text", required: true, maxLength: 10 },
      { name: "no_pesanan", label: "Pesanan", kind: "select", required: true, reference: "orders" },
      { name: "rating", label: "Rating", kind: "number", required: true, min: 1, max: 5 },
      { name: "isi_ulasan", label: "Isi ulasan", kind: "textarea", required: true, maxLength: 255 },
      { name: "tanggal_ulasan", label: "Tanggal ulasan", kind: "date", required: true },
    ],
  },
};

export const resourceOrder: ResourceKey[] = [
  "customers",
  "users",
  "products",
  "orders",
  "order-details",
  "payments",
  "production",
  "handover",
  "reviews",
];
