"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthUser } from "@/src/lib/auth";

type Row = Record<string, unknown>;
type Resource =
  | "products"
  | "orders"
  | "order-details"
  | "payments"
  | "production"
  | "handover"
  | "reviews";
type Data = Partial<Record<Resource, Row[]>>;
type Summary = {
  customerCount: number;
  userRoles: Array<{ role: string; count: number }>;
};

const resourceTitles: Record<Resource, string> = {
  products: "Produk",
  orders: "Pesanan",
  "order-details": "Detail pesanan",
  payments: "Pembayaran",
  production: "Produksi",
  handover: "Penyerahan",
  reviews: "Ulasan",
};

const ownerMenus = [
  "Ringkasan",
  "Laporan",
  "Produk",
  "Pesanan",
  "Pembayaran",
  "Produksi",
  "Penyerahan",
  "Ulasan",
] as const;
const employeeMenus = ["Pekerjaan Produksi", "Riwayat Produksi"] as const;
type Menu = (typeof ownerMenus)[number] | (typeof employeeMenus)[number];

const ownerResources: Resource[] = [
  "products",
  "orders",
  "order-details",
  "payments",
  "production",
  "handover",
  "reviews",
];
const employeeResources: Resource[] = ["orders", "order-details", "production", "products"];
const ownerResourceByMenu: Partial<Record<Menu, Resource>> = {
  Produk: "products",
  Pesanan: "orders",
  Pembayaran: "payments",
  Produksi: "production",
  Penyerahan: "handover",
  Ulasan: "reviews",
};

function text(value: unknown) {
  return value == null || value === "" ? "—" : String(value);
}

function dateInputValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function dateLabel(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(date);
}

function money(value: unknown) {
  try {
    const amount = BigInt(String(value ?? 0));
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return "—";
  }
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const content = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function statusBadge(value: unknown) {
  return <span className="badge badge-status">{text(value)}</span>;
}

function table(
  headers: string[],
  rows: Row[],
  cells: (row: Row) => React.ReactNode[],
  emptyText: string,
) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td className="empty-state" colSpan={headers.length}>{emptyText}</td></tr>
          ) : rows.map((row, index) => (
            <tr key={String(row.id_produksi ?? row.no_pesanan ?? row.id_produk ?? row.id_pembayaran ?? row.id_penyerahan ?? row.id_ulasan ?? index)}>
              {cells(row).map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OperationsWorkspace({ user }: { user: AuthUser }) {
  const router = useRouter();
  const owner = user.role === "OWNER";
  const menus: readonly Menu[] = owner ? ownerMenus : employeeMenus;
  const [activeMenu, setActiveMenu] = useState<Menu>(menus[0]);
  const [data, setData] = useState<Data>({});
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const resources = owner ? ownerResources : employeeResources;
      const entries = await Promise.all(resources.map(async (resource) => {
        const response = await fetch(`/api/${resource}`, { cache: "no-store" });
        const payload: unknown = await response.json();
        if (!response.ok) {
          if (response.status === 401) router.replace("/");
          const message = typeof payload === "object" && payload !== null &&
            "error" in payload && typeof payload.error === "string"
            ? payload.error
            : `Data ${resourceTitles[resource]} tidak dapat dimuat.`;
          throw new Error(message);
        }
        if (!Array.isArray(payload)) throw new Error(`Data ${resourceTitles[resource]} tidak valid.`);
        return [resource, payload as Row[]] as const;
      }));
      setData(Object.fromEntries(entries));
      if (owner) {
        const response = await fetch("/api/operations/summary", { cache: "no-store" });
        const payload: unknown = await response.json();
        if (!response.ok || typeof payload !== "object" || payload === null ||
            !("customerCount" in payload) || !("userRoles" in payload) ||
            typeof payload.customerCount !== "number" || !Array.isArray(payload.userRoles)) {
          throw new Error(
            typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "Ringkasan bisnis tidak valid.",
          );
        }
        const roleEntries = payload.userRoles.filter((entry: unknown): entry is { role: string; count: number } =>
          typeof entry === "object" && entry !== null &&
          "role" in entry && typeof entry.role === "string" &&
          "count" in entry && typeof entry.count === "number",
        );
        setSummary({ customerCount: payload.customerCount, userRoles: roleEntries });
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Data tidak dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, [owner, router]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const products = useMemo(() => data.products ?? [], [data.products]);
  const orders = useMemo(() => data.orders ?? [], [data.orders]);
  const detailsData = data["order-details"];
  const details = useMemo(() => detailsData ?? [], [detailsData]);
  const paymentData = data.payments;
  const payments = useMemo(() => paymentData ?? [], [paymentData]);
  const production = data.production ?? [];
  const handovers = data.handover ?? [];
  const reviews = data.reviews ?? [];
  const successfulPayments = useMemo(
    () => payments.filter((payment) => payment.status_pembayaran === "Berhasil"),
    [payments],
  );
  const successfulRevenue = successfulPayments.reduce(
    (sum, payment) => sum + BigInt(String(payment.jumlah_bayar ?? 0)),
    BigInt(0),
  );
  const rangePayments = useMemo(() => successfulPayments.filter((payment) => {
    const date = String(payment.tanggal_bayar ?? "").slice(0, 10);
    return (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
  }), [fromDate, successfulPayments, toDate]);
  const rangeRevenue = rangePayments.reduce(
    (sum, payment) => sum + BigInt(String(payment.jumlah_bayar ?? 0)),
    BigInt(0),
  );
  const rangeOrderNumbers = useMemo(
    () => new Set(rangePayments.map((payment) => String(payment.no_pesanan))),
    [rangePayments],
  );
  const productSales = useMemo(() => {
    const totals = new Map<string, { quantity: number; revenue: bigint }>();
    for (const detail of details) {
      const orderNumber = String(detail.no_pesanan);
      if (!rangeOrderNumbers.has(orderNumber)) continue;
      const productId = String(detail.id_produk);
      const previous = totals.get(productId) ?? { quantity: 0, revenue: BigInt(0) };
      const quantity = Number(detail.jumlah ?? 0);
      totals.set(productId, {
        quantity: previous.quantity + quantity,
        revenue: previous.revenue + BigInt(String(detail.harga_satuan ?? 0)) * BigInt(quantity),
      });
    }
    return [...totals].map(([id, sales]) => ({
      id,
      product: products.find((item) => item.id_produk === id),
      ...sales,
    })).sort((left, right) => right.quantity - left.quantity);
  }, [details, products, rangeOrderNumbers]);

  const filteredOrders = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("id");
    return orders.filter((order) => {
      const date = String(order.tanggal_pesanan ?? "").slice(0, 10);
      const matchesDate = (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
      const matchesSearch = !needle || Object.values(order)
        .some((value) => String(value ?? "").toLocaleLowerCase("id").includes(needle));
      return matchesDate && matchesSearch;
    });
  }, [fromDate, orders, search, toDate]);

  async function logout() {
    setBusy("logout");
    try {
      const response = await fetch("/api/auth", { method: "DELETE" });
      if (!response.ok) throw new Error("Sesi tidak dapat diakhiri.");
      router.replace("/");
      router.refresh();
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "Sesi tidak dapat diakhiri.");
      setBusy("");
    }
  }

  async function updateProduction(row: Row, nextStatus: "Diproses" | "Selesai") {
    const productionId = String(row.id_produksi);
    setBusy(productionId);
    setError("");
    setNotice("");
    const today = dateInputValue();
    const values = nextStatus === "Diproses"
      ? { status_produksi: nextStatus, tanggal_mulai_produksi: today }
      : { status_produksi: nextStatus, tanggal_selesai_produksi: today };
    try {
      const response = await fetch("/api/production", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keys: { id_produksi: productionId },
          values,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = typeof payload === "object" && payload !== null &&
          "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Status produksi tidak dapat diperbarui.";
        throw new Error(message);
      }
      setNotice(nextStatus === "Selesai" ? "Produksi ditandai selesai." : "Produksi berhasil dimulai.");
      await loadData();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Status produksi tidak dapat diperbarui.");
    } finally {
      setBusy("");
    }
  }

  function exportSales() {
    const rows: unknown[][] = [[
      "No. pesanan",
      "Tanggal pembayaran",
      "ID produk",
      "Nama produk",
      "Jumlah",
      "Harga satuan",
      "Subtotal",
    ]];
    for (const payment of rangePayments) {
      const orderNumber = String(payment.no_pesanan);
      for (const detail of details.filter((item) => item.no_pesanan === orderNumber)) {
        rows.push([
          orderNumber,
          String(payment.tanggal_bayar ?? "").slice(0, 10),
          detail.id_produk,
          detail.nama_produk,
          detail.jumlah,
          detail.harga_satuan,
          (BigInt(String(detail.jumlah ?? 0)) * BigInt(String(detail.harga_satuan ?? 0))).toString(),
        ]);
      }
    }
    downloadCsv("laporan-penjualan-dapur-abita.csv", rows);
  }

  function exportInventory() {
    downloadCsv("laporan-persediaan-dapur-abita.csv", [
      ["ID produk", "Nama produk", "Kategori", "Satuan", "Harga", "Stok aktual", "Stok minimum", "Kondisi"],
      ...products.map((product) => [
        product.id_produk,
        product.nama_produk,
        product.kategori_produk,
        product.satuan_produk,
        product.harga_produk,
        product.stok_produk,
        product.stok_minimum,
        product.stok_produk == null
          ? "Belum tersedia"
          : Number(product.stok_produk) <= Number(product.stok_minimum)
            ? "Stok terbatas"
            : "Tersedia",
      ]),
    ]);
  }

  const heading = owner ? "Pemantauan Bisnis" : "Ruang Produksi";
  const activeResource: Resource | null = owner ? ownerResourceByMenu[activeMenu] ?? null : null;
  const productionRows = production.filter((row) =>
    activeMenu === "Riwayat Produksi"
      ? row.status_produksi === "Selesai"
      : row.status_produksi !== "Selesai",
  );
  const filteredProductionRows = productionRows.filter((row) => {
    const date = String(row.tanggal_mulai_produksi ?? "").slice(0, 10);
    const needle = search.trim().toLocaleLowerCase("id");
    const relatedOrder = orders.find((order) => order.no_pesanan === row.no_pesanan);
    const relatedDetails = details.filter((detail) => detail.no_pesanan === row.no_pesanan);
    const matchesText = !needle || [row.id_produksi, row.no_pesanan, relatedOrder?.nama_pelanggan,
      ...relatedDetails.map((detail) => detail.nama_produk)]
      .some((value) => String(value ?? "").toLocaleLowerCase("id").includes(needle));
    return matchesText && (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
  });

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">DA</span>
          <span><strong>Dapur Abita</strong><small>Order &amp; Production</small></span>
        </div>
        <p className="nav-caption">MENU UTAMA</p>
        <nav className="main-nav" aria-label="Menu utama">
          {menus.map((menu, index) => (
            <button
              className={`nav-item ${activeMenu === menu ? "nav-item-active" : ""}`}
              key={menu}
              onClick={() => {
                setActiveMenu(menu);
                setSearch("");
                setError("");
              }}
            >
              <span className="nav-number">{String(index + 1).padStart(2, "0")}</span>
              <span>{menu}</span>
              {owner && activeMenu === menu && <span className="nav-count">●</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="connection-dot" />
          <span>PostgreSQL · database aplikasi</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="crumb">Dapur Abita <span>/</span> {heading}</div>
          <div className="topbar-right">
            <span className="today-label">{user.name}</span>
            <button className="button button-secondary" onClick={() => void logout()} disabled={busy === "logout"}>
              {busy === "logout" ? "Keluar..." : "Keluar"}
            </button>
            <div className="avatar">{user.name.slice(0, 2).toLocaleUpperCase("id")}</div>
          </div>
        </header>

        <div className="content">
          <div className="welcome-row">
            <div>
              <p className="eyebrow">{owner ? "LAPORAN & OPERASIONAL" : "AKTIVITAS PRODUKSI"}</p>
              <h1>{owner ? "Selamat datang, Owner" : "Daftar pekerjaan produksi"}</h1>
              <p className="welcome-subtitle">
                {owner
                  ? "Pantau penjualan dan operasional berdasarkan transaksi yang tersimpan."
                  : "Kelola hanya pekerjaan produksi yang ditugaskan kepada Anda."}
              </p>
            </div>
            <button className="button button-secondary" onClick={() => void loadData()} disabled={loading}>
              <span className={loading ? "refresh-icon spin" : "refresh-icon"}>↻</span>
              Muat ulang
            </button>
          </div>

          {(error || notice) && (
            <div className={`alert ${error ? "alert-error" : "alert-success"}`} role={error ? "alert" : "status"}>
              <span>{error || notice}</span>
              <button className="alert-close" aria-label="Tutup notifikasi" onClick={() => {
                setError("");
                setNotice("");
              }}>×</button>
            </div>
          )}

          {loading ? (
            <section className="data-card"><p className="empty-state">Memuat data dari database...</p></section>
          ) : error && Object.keys(data).length === 0 ? (
            <section className="data-card"><p className="empty-state">Data belum dapat ditampilkan.</p></section>
          ) : owner ? (
            <>
              {activeMenu === "Ringkasan" && (
                <>
                  <div className="summary-grid">
                    <SummaryCard label="Pendapatan terverifikasi" value={money(successfulRevenue)} foot="pembayaran berhasil" />
                    <SummaryCard label="Transaksi" value={successfulPayments.length} foot="pembayaran berhasil" />
                    <SummaryCard label="Pelanggan" value={summary?.customerCount ?? "—"} foot="terdaftar di database" />
                    <SummaryCard label="Produk" value={products.length} foot="produk terdaftar" accent />
                    <SummaryCard label="Pesanan diproses" value={orders.filter((row) => row.status_pesanan === "Diproses").length} foot="menunggu produksi" />
                    <SummaryCard label="Pesanan selesai" value={orders.filter((row) => row.status_pesanan === "Selesai").length} foot="belum diserahkan" />
                    <SummaryCard label="Menunggu pembayaran" value={payments.filter((row) => row.status_pembayaran !== "Berhasil" && row.status_pembayaran !== "Ditolak").length} foot="perlu tindak lanjut" />
                    <SummaryCard label="Stok perlu perhatian" value={products.filter((row) => row.stok_produk == null || Number(row.stok_produk) <= Number(row.stok_minimum)).length} foot="kosong atau pada/bawah minimum" />
                    <SummaryCard
                      label="Tim operasional"
                      value={summary?.userRoles.reduce((total, item) => total + item.count, 0) ?? "—"}
                      foot="Admin, Karyawan, dan Owner"
                    />
                  </div>
                  <section className="data-card">
                    <div className="data-card-header">
                      <div><p className="eyebrow">RINGKASAN OPERASIONAL</p><h2>Aktivitas pesanan</h2></div>
                    </div>
                    {table(
                      ["No. pesanan", "Tanggal", "Pelanggan", "Total", "Status pesanan", "Pembayaran"],
                      filteredOrders.slice(0, 12),
                      (order) => {
                        const payment = payments.find((row) => row.no_pesanan === order.no_pesanan);
                        const total = details.filter((row) => row.no_pesanan === order.no_pesanan)
                          .reduce((sum, row) => sum + BigInt(String(row.jumlah ?? 0)) * BigInt(String(row.harga_satuan ?? 0)), BigInt(0));
                        return [
                          text(order.no_pesanan),
                          dateLabel(order.tanggal_pesanan),
                          text(order.nama_pelanggan),
                          money(total),
                          statusBadge(order.status_pesanan),
                          statusBadge(payment?.status_pembayaran),
                        ];
                      },
                      "Belum ada pesanan.",
                    )}
                  </section>
                </>
              )}

              {activeMenu === "Laporan" && (
                <>
                  <section className="data-card">
                    <div className="data-card-header">
                      <div><p className="eyebrow">LAPORAN PENJUALAN</p><h2>Periode laporan</h2></div>
                      <div className="form-actions">
                        <button className="button button-secondary" onClick={exportSales}>Ekspor penjualan CSV</button>
                        <button className="button button-secondary" onClick={exportInventory}>Ekspor persediaan CSV</button>
                      </div>
                    </div>
                    <div className="table-toolbar">
                      <label className="form-field"><span>Dari tanggal</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
                      <label className="form-field"><span>Sampai tanggal</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
                      <span className="record-count">{rangePayments.length} transaksi terverifikasi · {money(rangeRevenue)}</span>
                    </div>
                    <p className="eyebrow sales-chart-label">PENJUALAN PER TANGGAL PEMBAYARAN</p>
                    <div className="sales-bars" aria-label="Grafik penjualan per tanggal">
                      {rangePayments.length === 0 ? <p className="empty-state">Belum ada penjualan terverifikasi pada periode ini.</p> :
                        [...rangePayments.reduce((days, payment) => {
                          const date = String(payment.tanggal_bayar ?? "").slice(0, 10);
                          days.set(date, (days.get(date) ?? BigInt(0)) + BigInt(String(payment.jumlah_bayar ?? 0)));
                          return days;
                        }, new Map<string, bigint>())].sort(([left], [right]) => left.localeCompare(right)).map(([date, amount], index, values) => {
                          const maximum = values.reduce((top, [, value]) => value > top ? value : top, BigInt(1));
                          return (
                            <div className="sales-bar-row" key={`${date}-${index}`}>
                              <span>{dateLabel(date)}</span>
                              <div className="sales-bar-track"><div className="sales-bar-fill" style={{ width: `${Math.max(3, Number(amount) / Number(maximum) * 100)}%` }} /></div>
                              <strong>{money(amount)}</strong>
                            </div>
                          );
                        })}
                    </div>
                  </section>
                  <section className="data-card">
                    <div className="data-card-header"><div><p className="eyebrow">KINERJA PRODUK</p><h2>Produk terjual</h2></div></div>
                    {table(
                      ["Produk", "Jumlah terjual", "Pendapatan transaksi", "Kontribusi"],
                      productSales.map((item) => ({ id_produk: item.id, nama_produk: item.product?.nama_produk, ...item })),
                      (item) => [
                        text(item.nama_produk),
                        text(item.quantity),
                        money(item.revenue),
                        rangeRevenue > BigInt(0) ? `${(Number(item.revenue) / Number(rangeRevenue) * 100).toFixed(1)}%` : "0%",
                      ],
                      "Belum ada rincian produk yang dibayar.",
                    )}
                  </section>
                </>
              )}

              {activeResource && (
                <section className="data-card">
                  <div className="data-card-header">
                    <div><p className="eyebrow">DATA DATABASE</p><h2>{resourceTitles[activeResource]}</h2></div>
                    {activeResource === "products" && <button className="button button-secondary" onClick={exportInventory}>Ekspor CSV</button>}
                    {activeResource === "orders" && <button className="button button-secondary" onClick={() => downloadCsv("laporan-pesanan-dapur-abita.csv", [
                      ["No. pesanan", "Tanggal", "Pelanggan", "Status"],
                      ...filteredOrders.map((row) => [row.no_pesanan, row.tanggal_pesanan, row.nama_pelanggan, row.status_pesanan]),
                    ])}>Ekspor CSV</button>}
                    {activeResource === "payments" && <button className="button button-secondary" onClick={() => downloadCsv("laporan-pembayaran-dapur-abita.csv", [
                      ["ID pembayaran", "No. pesanan", "Metode", "Jumlah", "Tanggal", "Status"],
                      ...payments.map((row) => [row.id_pembayaran, row.no_pesanan, row.metode_pembayaran, row.jumlah_bayar, row.tanggal_bayar, row.status_pembayaran]),
                    ])}>Ekspor CSV</button>}
                  </div>
                  {(activeResource === "orders" || activeResource === "payments") && (
                    <div className="table-toolbar">
                      <label className="search-box"><span className="search-icon">⌕</span>
                        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nomor pesanan atau pelanggan..." />
                      </label>
                      <label className="form-field"><span>Dari</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
                      <label className="form-field"><span>Sampai</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
                    </div>
                  )}
                  {activeResource === "products" && table(
                    ["ID", "Produk", "Kategori", "Harga", "Stok aktual", "Stok minimum", "Kondisi"],
                    products,
                    (row) => [
                      text(row.id_produk), text(row.nama_produk), text(row.kategori_produk), money(row.harga_produk),
                      row.stok_produk == null ? <span className="badge badge-muted">Belum tersedia</span> : text(row.stok_produk),
                      text(row.stok_minimum),
                      row.stok_produk == null
                        ? <span className="badge badge-muted">Stok belum tersedia</span>
                        : Number(row.stok_produk) <= Number(row.stok_minimum)
                          ? <span className="badge badge-warning">Stok terbatas</span>
                          : <span className="badge badge-status">Tersedia</span>,
                    ],
                    "Belum ada produk.",
                  )}
                  {activeResource === "orders" && table(
                    ["No. pesanan", "Tanggal", "Pelanggan", "Total", "Status"],
                    filteredOrders,
                    (order) => [
                      text(order.no_pesanan), dateLabel(order.tanggal_pesanan), text(order.nama_pelanggan),
                      money(details.filter((row) => row.no_pesanan === order.no_pesanan)
                        .reduce((sum, row) => sum + BigInt(String(row.jumlah ?? 0)) * BigInt(String(row.harga_satuan ?? 0)), BigInt(0))),
                      statusBadge(order.status_pesanan),
                    ],
                    "Belum ada pesanan.",
                  )}
                  {activeResource === "payments" && table(
                    ["ID", "Pesanan", "Metode", "Jumlah", "Tanggal", "Status"],
                    payments.filter((row) => {
                      const date = String(row.tanggal_bayar ?? "").slice(0, 10);
                      const needle = search.trim().toLocaleLowerCase("id");
                      return (!fromDate || date >= fromDate) && (!toDate || date <= toDate) &&
                        (!needle || Object.values(row).some((value) => String(value ?? "").toLocaleLowerCase("id").includes(needle)));
                    }),
                    (row) => [text(row.id_pembayaran), text(row.no_pesanan), text(row.metode_pembayaran), money(row.jumlah_bayar), dateLabel(row.tanggal_bayar), statusBadge(row.status_pembayaran)],
                    "Belum ada pembayaran.",
                  )}
                  {activeResource === "production" && table(
                    ["ID produksi", "Pesanan", "Karyawan", "Mulai", "Selesai", "Status"],
                    production,
                    (row) => [text(row.id_produksi), text(row.no_pesanan), text(row.nama_karyawan), dateLabel(row.tanggal_mulai_produksi), dateLabel(row.tanggal_selesai_produksi), statusBadge(row.status_produksi)],
                    "Belum ada produksi.",
                  )}
                  {activeResource === "handover" && table(
                    ["ID penyerahan", "Pesanan", "Metode", "Tanggal", "Status"],
                    handovers,
                    (row) => [text(row.id_penyerahan), text(row.no_pesanan), text(row.metode_penyerahan), dateLabel(row.tanggal_penyerahan), statusBadge(row.status_penyerahan)],
                    "Belum ada data penyerahan.",
                  )}
                  {activeResource === "reviews" && table(
                    ["Pesanan", "Pelanggan", "Rating", "Ulasan", "Tanggal"],
                    reviews,
                    (row) => [text(row.no_pesanan), text(row.nama_pelanggan), `${text(row.rating)} / 5`, text(row.isi_ulasan), dateLabel(row.tanggal_ulasan)],
                    "Belum ada ulasan.",
                  )}
                </section>
              )}
            </>
          ) : (
            <>
              <div className="summary-grid">
                <SummaryCard label="Menunggu dikerjakan" value={production.filter((row) => row.status_produksi === "Menunggu").length} foot="pekerjaan ditugaskan" />
                <SummaryCard label="Sedang diproses" value={production.filter((row) => row.status_produksi === "Diproses").length} foot="pekerjaan aktif" />
                <SummaryCard label="Produksi selesai" value={production.filter((row) => row.status_produksi === "Selesai").length} foot="riwayat pekerjaan" accent />
                <SummaryCard label="Pesanan ditugaskan" value={orders.length} foot="khusus akun Anda" />
              </div>
              <p className="table-note">Pekerjaan yang muncul di sini telah ditugaskan kepada akun Anda. Pesanan berstatus Diproses/Selesai hanya dibuat setelah pembayaran diverifikasi.</p>
              <section className="data-card">
                <div className="data-card-header">
                  <div><p className="eyebrow">{activeMenu === "Riwayat Produksi" ? "RIWAYAT PRODUKSI" : "PEKERJAAN AKTIF"}</p><h2>{activeMenu}</h2></div>
                  <span className="record-count">{filteredProductionRows.length} pekerjaan</span>
                </div>
                <div className="table-toolbar">
                  <label className="search-box"><span className="search-icon">⌕</span>
                    <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nomor pesanan atau produk..." />
                  </label>
                  <label className="form-field"><span>Dari</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
                  <label className="form-field"><span>Sampai</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
                </div>
                {filteredProductionRows.length === 0 ? (
                  <div className="empty-state">{activeMenu === "Riwayat Produksi" ? "Belum ada pekerjaan produksi yang selesai." : "Belum ada pekerjaan yang ditugaskan kepada Anda."}</div>
                ) : filteredProductionRows.map((job) => {
                  const orderNumber = String(job.no_pesanan);
                  const order = orders.find((row) => row.no_pesanan === orderNumber);
                  const jobDetails = details.filter((row) => row.no_pesanan === orderNumber);
                  return (
                    <article className="production-job" key={String(job.id_produksi)}>
                      <div className="production-job-heading">
                        <div><p className="eyebrow">PESANAN {orderNumber}</p><h3>{text(order?.nama_pelanggan)}</h3></div>
                        {statusBadge(job.status_produksi)}
                      </div>
                      <p className="welcome-subtitle">Tanggal pesanan {dateLabel(order?.tanggal_pesanan)} · Status pesanan {text(order?.status_pesanan)}</p>
                      {table(
                        ["Produk", "Jumlah", "Satuan", "Stok aktual"],
                        jobDetails,
                        (item) => {
                          const currentStock = item.stok_produk;
                          const minimumStock = Number(item.stok_minimum ?? 0);
                          const stockLabel = currentStock == null
                            ? <span className="badge badge-muted">Belum dicatat</span>
                            : Number(currentStock) === 0
                              ? <span className="badge badge-warning">Habis · 0</span>
                              : Number(currentStock) <= minimumStock
                                ? <span className="badge badge-warning">Terbatas · {text(currentStock)}</span>
                                : <span className="badge badge-status">Tersedia · {text(currentStock)}</span>;
                          return [
                            text(item.nama_produk),
                            text(item.jumlah),
                            text(products.find((product) => product.id_produk === item.id_produk)?.satuan_produk),
                            stockLabel,
                          ];
                        },
                        "Rincian produk pesanan tidak tersedia.",
                      )}
                      <div className="production-job-footer">
                        <span>Mulai: {dateLabel(job.tanggal_mulai_produksi)} · Selesai: {dateLabel(job.tanggal_selesai_produksi)}</span>
                        {activeMenu !== "Riwayat Produksi" && job.status_produksi === "Menunggu" && (
                          <button className="button button-primary" disabled={busy === String(job.id_produksi)} onClick={() => void updateProduction(job, "Diproses")}>
                            {busy === String(job.id_produksi) ? "Menyimpan..." : "Mulai produksi"}
                          </button>
                        )}
                        {activeMenu !== "Riwayat Produksi" && job.status_produksi === "Diproses" && (
                          <button className="button button-primary" disabled={busy === String(job.id_produksi)} onClick={() => void updateProduction(job, "Selesai")}>
                            {busy === String(job.id_produksi) ? "Menyimpan..." : "Tandai selesai"}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </section>
            </>
          )}

          <footer className="page-footer">Dapur Abita <span>·</span> Sistem Informasi Manajemen Pesanan &amp; Produksi</footer>
        </div>
      </section>
    </main>
  );
}

function SummaryCard({ label, value, foot, accent = false }: { label: string; value: React.ReactNode; foot: string; accent?: boolean }) {
  return (
    <div className={`summary-card ${accent ? "summary-card-accent" : ""}`}>
      <span className="summary-label">{label}</span>
      <strong>{value}</strong>
      <span className="summary-foot">{foot}</span>
    </div>
  );
}
