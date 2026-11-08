"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppRole, AuthUser } from "@/src/lib/auth";

type Row = Record<string, unknown>;
type Resource = "products" | "orders" | "order-details" | "payments" | "production" | "handover" | "reviews";
type Data = Partial<Record<Resource, Row[]>>;

const resourceNames: Record<Resource, string> = {
  products: "Produk",
  orders: "Pesanan",
  "order-details": "Detail pesanan",
  payments: "Pembayaran",
  production: "Produksi",
  handover: "Penyerahan",
  reviews: "Ulasan",
};

const roleTitles: Record<AppRole, string> = {
  CUSTOMER: "Pelanggan",
  EMPLOYEE: "Karyawan Produksi",
  OWNER: "Owner",
  ADMIN: "Admin",
};

const roleMenus: Record<AppRole, string[]> = {
  CUSTOMER: ["Menu & Pesan", "Pesanan Saya", "Ulasan"],
  EMPLOYEE: ["Daftar Pesanan", "Produksi"],
  OWNER: ["Dashboard", "Laporan", "Ulasan"],
  ADMIN: ["Dashboard"],
};

const roleResources: Record<AppRole, Resource[]> = {
  CUSTOMER: ["products", "orders", "order-details", "payments", "handover", "reviews"],
  EMPLOYEE: ["orders", "order-details", "production", "products"],
  OWNER: ["products", "orders", "order-details", "payments", "production", "handover", "reviews"],
  ADMIN: ["products", "orders", "order-details", "payments", "production", "handover", "reviews"],
};

function asText(value: unknown) {
  return value == null || value === "" ? "—" : String(value);
}

function currency(value: unknown) {
  try {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(Number(value ?? 0));
  } catch {
    return "Rp0";
  }
}

function dateLabel(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(date);
}

function sectionFor(role: AppRole, menu: string): Resource | "overview" | "reports" {
  if (role === "CUSTOMER") {
    if (menu === "Pesanan Saya") return "orders";
    if (menu === "Ulasan") return "reviews";
    return "products";
  }
  if (role === "EMPLOYEE") return menu === "Produksi" ? "production" : "orders";
  if (role === "OWNER") {
    if (menu === "Laporan") return "reports";
    if (menu === "Ulasan") return "reviews";
  }
  return "overview";
}

export default function Dashboard({ user }: { user: AuthUser }) {
  const router = useRouter();
  const [activeMenu, setActiveMenu] = useState(roleMenus[user.role][0]);
  const [data, setData] = useState<Data>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState("QRIS");
  const [handoverMethod, setHandoverMethod] = useState("Ambil di Tempat");
  const [reviewOrder, setReviewOrder] = useState("");
  const [reviewRating, setReviewRating] = useState("5");
  const [reviewText, setReviewText] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const entries = await Promise.all(roleResources[user.role].map(async (resource) => {
        const response = await fetch(`/api/${resource}`, { cache: "no-store" });
        const payload: unknown = await response.json();
        if (!response.ok) {
          const message = typeof payload === "object" && payload !== null &&
            "error" in payload && typeof payload.error === "string"
            ? payload.error
            : `Data ${resourceNames[resource]} tidak dapat dimuat.`;
          if (response.status === 401) router.replace("/");
          throw new Error(message);
        }
        if (!Array.isArray(payload)) throw new Error(`Data ${resourceNames[resource]} tidak valid.`);
        return [resource, payload as Row[]] as const;
      }));
      setData(Object.fromEntries(entries));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Data tidak dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, [router, user.role]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const products = useMemo(() => data.products ?? [], [data.products]);
  const orders = data.orders ?? [];
  const details = data["order-details"] ?? [];
  const payments = data.payments ?? [];
  const production = data.production ?? [];
  const reviews = data.reviews ?? [];
  const handovers = data.handover ?? [];
  const activeSection = sectionFor(user.role, activeMenu);
  const cartTotal = useMemo(() => products.reduce((sum, product) => {
    const quantity = cart[asText(product.id_produk)] ?? 0;
    return sum + BigInt(String(product.harga_produk ?? 0)) * BigInt(quantity);
  }, BigInt(0)), [cart, products]);
  const successfulSales = payments
    .filter((payment) => payment.status_pembayaran === "Berhasil")
    .reduce((sum, payment) => sum + BigInt(String(payment.jumlah_bayar ?? 0)), BigInt(0));
  const reviewableOrders = orders.filter((order) => {
    const handedOver = handovers.some((handover) =>
      handover.no_pesanan === order.no_pesanan && handover.status_penyerahan === "Diserahkan");
    const alreadyReviewed = reviews.some((review) => review.no_pesanan === order.no_pesanan);
    return handedOver && !alreadyReviewed;
  });

  async function logout() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth", { method: "DELETE" });
      if (!response.ok) throw new Error("Sesi tidak dapat diakhiri.");
      router.replace("/");
      router.refresh();
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "Sesi tidak dapat diakhiri.");
      setBusy(false);
    }
  }

  async function placeOrder() {
    const items = Object.entries(cart)
      .filter(([, quantity]) => quantity > 0)
      .map(([productId, quantity]) => ({ productId, quantity }));
    if (!items.length) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/customer/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, paymentMethod, handoverMethod }),
      });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(
        typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
          ? result.error
          : "Pesanan tidak dapat dibuat.",
      );
      setCart({});
      setNotice("Pesanan berhasil dibuat. Lihat statusnya di Pesanan Saya.");
      await loadData();
    } catch (orderError) {
      setError(orderError instanceof Error ? orderError.message : "Pesanan tidak dapat dibuat.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          values: {
            no_pesanan: reviewOrder,
            rating: Number(reviewRating),
            isi_ulasan: reviewText,
          },
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(
        typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
          ? result.error
          : "Ulasan tidak dapat dikirim.",
      );
      setReviewOrder("");
      setReviewText("");
      setNotice("Terima kasih, ulasan Anda telah dikirim.");
      await loadData();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Ulasan tidak dapat dikirim.");
    } finally {
      setBusy(false);
    }
  }

  async function updateProduction(row: Row, status: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/production", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keys: { id_produksi: asText(row.id_produksi) },
          values: {
            status_produksi: status,
            ...(status === "Selesai" ? { tanggal_selesai_produksi: new Date().toISOString().slice(0, 10) } : {}),
          },
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(
        typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
          ? result.error
          : "Status produksi tidak dapat diperbarui.",
      );
      setNotice("Status produksi diperbarui.");
      await loadData();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Status produksi tidak dapat diperbarui.");
    } finally {
      setBusy(false);
    }
  }

  const title = activeSection === "overview" ? "Dashboard"
    : activeSection === "reports" ? "Laporan"
      : activeSection === "orders" ? (user.role === "CUSTOMER" ? "Pesanan Saya" : "Daftar Pesanan")
        : resourceNames[activeSection];

  return (
    <main className="role-shell">
      <aside className="role-sidebar">
        <div className="role-brand"><span className="role-logo">DA</span><strong>Dapur Abita</strong></div>
        <p className="role-nav-label">MENU UTAMA</p>
        <nav className="role-nav" aria-label="Navigasi">
          {roleMenus[user.role].map((menu, index) => (
            <button key={menu} className={menu === activeMenu ? "role-nav-item active" : "role-nav-item"}
              onClick={() => { setActiveMenu(menu); setError(""); setNotice(""); }}>
              <span className="role-nav-index">{String(index + 1).padStart(2, "0")}</span>{menu}
            </button>
          ))}
          {user.role === "ADMIN" && (
            <a className="role-nav-item role-nav-link" href="/workspace">
              <span className="role-nav-index">02</span>Manajemen data
            </a>
          )}
        </nav>
        <div className="role-user">
          <div className="role-avatar">{user.name.slice(0, 1).toLocaleUpperCase("id")}</div>
          <div className="role-user-copy"><strong>{user.name}</strong><span>{roleTitles[user.role]}</span></div>
          <button className="role-logout" onClick={logout} disabled={busy} aria-label="Keluar">↗</button>
        </div>
      </aside>

      <section className="role-main">
        <header className="role-topbar">
          <div><span className="role-breadcrumb">Dapur Abita</span><span className="role-slash">/</span>{title}</div>
          <span>{new Intl.DateTimeFormat("id-ID", { dateStyle: "full" }).format(new Date())}</span>
          <button className="role-mobile-logout" onClick={logout} disabled={busy}>Keluar</button>
        </header>
        <div className="role-content">
          <div className="role-heading">
            <div>
              <p className="role-eyebrow">{roleTitles[user.role].toLocaleUpperCase("id")} · DAPUR ABITA</p>
              <h1>{user.role === "CUSTOMER" ? `Halo, ${user.name.split(" ")[0]}` : title}</h1>
              <p>{headingDescription(user.role, activeSection)}</p>
            </div>
            {user.role === "ADMIN" && <a className="role-primary-button" href="/workspace">Buka manajemen data</a>}
            {user.role === "CUSTOMER" && activeSection === "products" && cartTotal > BigInt(0) && (
              <button className="role-primary-button" onClick={() => document.getElementById("customer-checkout")?.scrollIntoView({ behavior: "smooth" })}>
                Lihat keranjang · {currency(cartTotal)}
              </button>
            )}
          </div>

          {(error || notice) && <div className={error ? "role-alert error" : "role-alert"} role={error ? "alert" : "status"}>
            {error || notice}<button onClick={() => { setError(""); setNotice(""); }} aria-label="Tutup">×</button>
          </div>}

          {activeSection === "overview" && (
            <Overview role={user.role} products={products} orders={orders} payments={payments} production={production}
              sales={successfulSales} loading={loading} onNavigate={setActiveMenu} />
          )}
          {activeSection === "reports" && <Reports products={products} orders={orders} payments={payments} production={production} />}
          {activeSection === "products" && user.role === "CUSTOMER" && (
            <CustomerMenu products={products} cart={cart} setCart={setCart} busy={busy}
              paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}
              handoverMethod={handoverMethod} setHandoverMethod={setHandoverMethod} onOrder={placeOrder} />
          )}
          {activeSection === "orders" && <Orders role={user.role} orders={orders} details={details} payments={payments}
            handovers={handovers} production={production} loading={loading} onUpdate={updateProduction} busy={busy} />}
          {activeSection === "production" && <ProductionRows rows={production} orders={orders} details={details}
            loading={loading} onUpdate={updateProduction} busy={busy} />}
          {activeSection === "reviews" && (
            <ReviewPanel role={user.role} reviews={reviews} reviewableOrders={reviewableOrders}
              reviewOrder={reviewOrder} setReviewOrder={setReviewOrder} rating={reviewRating}
              setRating={setReviewRating} text={reviewText} setText={setReviewText}
              onSubmit={submitReview} busy={busy} />
          )}
        </div>
      </section>
    </main>
  );
}

function headingDescription(role: AppRole, section: string) {
  if (role === "CUSTOMER") {
    if (section === "orders") return "Lihat perkembangan, pembayaran, dan penyerahan pesanan Anda.";
    if (section === "reviews") return "Bagikan pengalaman setelah pesanan diterima.";
    return "Pilih menu favorit dan pesan langsung dari Dapur Abita.";
  }
  if (role === "EMPLOYEE") return "Pantau pesanan yang ditugaskan dan perbarui progres produksi.";
  if (role === "OWNER" && section === "reports") return "Ringkasan penjualan, pesanan, produk, dan performa produksi.";
  return "Ringkasan aktivitas operasional Dapur Abita.";
}

function Overview({ role, products, orders, payments, production, sales, loading, onNavigate }: {
  role: AppRole; products: Row[]; orders: Row[]; payments: Row[]; production: Row[];
  sales: bigint; loading: boolean; onNavigate: (menu: string) => void;
}) {
  const lowStock = products.filter((item) =>
    item.stok_produk != null && item.stok_minimum != null && Number(item.stok_produk) <= Number(item.stok_minimum));
  const activeOrders = orders.filter((order) => !["Selesai", "Dibatalkan"].includes(String(order.status_pesanan)));
  const cards = role === "CUSTOMER" ? [
    ["Pesanan aktif", activeOrders.length, "sedang diproses"],
    ["Menunggu pembayaran", payments.filter((item) => item.status_pembayaran === "Menunggu").length, "pembayaran belum selesai"],
    ["Produk tersedia", products.filter((item) => Number(item.stok_produk ?? 0) > 0).length, "pilihan menu"],
  ] : role === "EMPLOYEE" ? [
    ["Pesanan ditugaskan", orders.length, "pesanan dalam antrean"],
    ["Sedang diproduksi", production.filter((item) => item.status_produksi === "Diproses").length, "perlu ditindaklanjuti"],
    ["Selesai", production.filter((item) => item.status_produksi === "Selesai").length, "produksi selesai"],
  ] : [
    ["Total pesanan", orders.length, "seluruh pesanan terdaftar"],
    ["Dalam produksi", production.filter((item) => item.status_produksi === "Diproses").length, "sedang dikerjakan"],
    ["Penjualan berhasil", currency(sales), "pembayaran berhasil"],
    ["Stok perlu perhatian", lowStock.length, "produk di bawah batas minimum"],
  ];
  return (
    <>
      <div className="role-metric-grid">
        {cards.map(([label, value, caption]) => <article className="role-metric" key={String(label)}>
          <span>{label}</span><strong>{loading ? "—" : value}</strong><small>{caption}</small>
        </article>)}
      </div>
      {role === "CUSTOMER" ? (
        <section className="role-panel">
          <div className="role-panel-head"><div><span className="role-eyebrow">MULAI PESAN</span><h2>Menu hari ini</h2></div>
            <button className="role-text-button" onClick={() => onNavigate("Menu & Pesan")}>Lihat semua produk →</button></div>
          <div className="role-mini-grid">{products.slice(0, 4).map((product) =>
            <div className="role-product-mini" key={asText(product.id_produk)}>
              <span>{asText(product.kategori_produk)}</span><strong>{asText(product.nama_produk)}</strong>
              <small>{currency(product.harga_produk)}</small>
            </div>)}
          </div>
        </section>
      ) : (
        <section className="role-panel">
          <div className="role-panel-head"><div><span className="role-eyebrow">{role === "EMPLOYEE" ? "ANTREAN" : "AKTIVITAS TERBARU"}</span>
            <h2>{role === "EMPLOYEE" ? "Pesanan produksi" : "Pesanan terbaru"}</h2></div></div>
          <OrderTable rows={orders.slice(0, 7)} />
        </section>
      )}
    </>
  );
}

function CustomerMenu({ products, cart, setCart, busy, paymentMethod, setPaymentMethod,
  handoverMethod, setHandoverMethod, onOrder }: {
  products: Row[]; cart: Record<string, number>; setCart: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  busy: boolean; paymentMethod: string; setPaymentMethod: (value: string) => void;
  handoverMethod: string; setHandoverMethod: (value: string) => void; onOrder: () => void;
}) {
  const items = products.filter((product) => Number(product.stok_produk ?? 0) > 0);
  const total = items.reduce((sum, product) => sum + BigInt(String(product.harga_produk ?? 0)) *
    BigInt(cart[asText(product.id_produk)] ?? 0), BigInt(0));
  return (
    <>
      <div className="role-product-grid">
        {items.map((product) => {
          const id = asText(product.id_produk);
          const count = cart[id] ?? 0;
          return <article className="role-product-card" key={id}>
            <div className="role-product-art"><span>{asText(product.kategori_produk).slice(0, 1)}</span></div>
            <div className="role-product-info">
              <small>{asText(product.kategori_produk)} · {asText(product.satuan_produk)}</small>
              <h2>{asText(product.nama_produk)}</h2><strong>{currency(product.harga_produk)}</strong>
              <small>Sisa stok {asText(product.stok_produk)}</small>
              <div className="role-quantity">
                <button aria-label={`Kurangi ${asText(product.nama_produk)}`} onClick={() =>
                  setCart((current) => ({ ...current, [id]: Math.max(0, count - 1) }))}>−</button>
                <span>{count}</span>
                <button aria-label={`Tambah ${asText(product.nama_produk)}`} onClick={() =>
                  setCart((current) => ({ ...current, [id]: Math.min(Number(product.stok_produk), count + 1) }))}>+</button>
              </div>
            </div>
          </article>;
        })}
        {!items.length && <EmptyState text="Belum ada produk dengan stok yang tersedia." />}
      </div>
      {total > BigInt(0) && <section className="role-panel role-checkout" id="customer-checkout">
        <div className="role-panel-head"><div><span className="role-eyebrow">CHECKOUT</span><h2>Keranjang pesanan</h2></div>
          <strong>{currency(total)}</strong></div>
        <div className="role-checkout-grid">
          <label>Metode pembayaran<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
            <option>QRIS</option><option>Transfer</option><option>Tunai</option>
          </select></label>
          <label>Metode penyerahan<select value={handoverMethod} onChange={(event) => setHandoverMethod(event.target.value)}>
            <option>Ambil di Tempat</option><option>Diantar</option>
          </select></label>
          <button className="role-primary-button" onClick={onOrder} disabled={busy}>
            {busy ? "Memproses..." : "Buat pesanan"}
          </button>
        </div>
      </section>}
    </>
  );
}

function Orders({ role, orders, details, payments, handovers, production, loading, onUpdate, busy }: {
  role: AppRole; orders: Row[]; details: Row[]; payments: Row[]; handovers: Row[];
  production: Row[]; loading: boolean; onUpdate: (row: Row, status: string) => void; busy: boolean;
}) {
  if (loading) return <LoadingState />;
  if (!orders.length) return <EmptyState text="Belum ada pesanan untuk ditampilkan." />;
  return <div className="role-order-list">{orders.map((order) => {
    const number = asText(order.no_pesanan);
    const orderDetails = details.filter((detail) => detail.no_pesanan === order.no_pesanan);
    const payment = payments.find((row) => row.no_pesanan === order.no_pesanan);
    const handover = handovers.find((row) => row.no_pesanan === order.no_pesanan);
    const productionRow = production.find((row) => row.no_pesanan === order.no_pesanan);
    return <article className="role-order-card" key={number}>
      <div className="role-order-head"><div><span>Pesanan {number}</span><small>{dateLabel(order.tanggal_pesanan)}</small></div>
        <Status value={order.status_pesanan} /></div>
      <div className="role-order-lines">{orderDetails.map((detail) =>
        <div key={`${number}-${asText(detail.id_produk)}`}><span>{asText(detail.nama_produk)} × {asText(detail.jumlah)}</span>
          <span>{currency(BigInt(String(detail.harga_satuan ?? 0)) * BigInt(Number(detail.jumlah ?? 0)))}</span></div>)}
      </div>
      <div className="role-order-meta">
        {payment && <span>Pembayaran <Status value={payment.status_pembayaran} /></span>}
        {handover && <span>Penyerahan <Status value={handover.status_penyerahan} /></span>}
        {productionRow && <span>Produksi <Status value={productionRow.status_produksi} /></span>}
      </div>
      {role === "EMPLOYEE" && productionRow && productionRow.status_produksi !== "Selesai" &&
        <button className="role-small-button" disabled={busy} onClick={() => onUpdate(productionRow, "Selesai")}>
          Tandai produksi selesai
        </button>}
    </article>;
  })}</div>;
}

function ProductionRows({ rows, orders, details, loading, onUpdate, busy }: {
  rows: Row[]; orders: Row[]; details: Row[]; loading: boolean;
  onUpdate: (row: Row, status: string) => void; busy: boolean;
}) {
  if (loading) return <LoadingState />;
  if (!rows.length) return <EmptyState text="Belum ada pesanan yang ditugaskan kepada Anda." />;
  return <div className="role-order-list">{rows.map((row) => {
    const order = orders.find((item) => item.no_pesanan === row.no_pesanan);
    const lines = details.filter((item) => item.no_pesanan === row.no_pesanan);
    return <article className="role-order-card" key={asText(row.id_produksi)}>
      <div className="role-order-head"><div><span>Pesanan {asText(row.no_pesanan)}</span>
        <small>Mulai {dateLabel(row.tanggal_mulai_produksi)}</small></div><Status value={row.status_produksi} /></div>
      <p className="role-production-customer">Pelanggan: {asText(order?.nama_pelanggan)}</p>
      <div className="role-order-lines">{lines.map((line) => <div key={asText(line.id_produk)}>
        <span>{asText(line.nama_produk)}</span><span>× {asText(line.jumlah)}</span></div>)}</div>
      {row.status_produksi !== "Selesai" &&
        <button className="role-small-button" disabled={busy} onClick={() => onUpdate(row, "Selesai")}>Tandai selesai</button>}
    </article>;
  })}</div>;
}

function Reports({ products, orders, payments, production }: {
  products: Row[]; orders: Row[]; payments: Row[]; production: Row[];
}) {
  const total = payments.filter((item) => item.status_pembayaran === "Berhasil")
    .reduce((sum, item) => sum + BigInt(String(item.jumlah_bayar ?? 0)), BigInt(0));
  const monthly = new Map<string, bigint>();
  for (const payment of payments) {
    if (payment.status_pembayaran !== "Berhasil") continue;
    const month = String(payment.tanggal_bayar ?? "").slice(0, 7) || "Lainnya";
    monthly.set(month, (monthly.get(month) ?? BigInt(0)) + BigInt(String(payment.jumlah_bayar ?? 0)));
  }
  const bars = [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6);
  const max = bars.reduce((largest, [, amount]) => amount > largest ? amount : largest, BigInt(1));
  return <>
    <div className="role-metric-grid">
      <Metric title="Penjualan berhasil" value={currency(total)} caption="total pembayaran berhasil" />
      <Metric title="Pesanan terdaftar" value={orders.length} caption="pesanan sepanjang periode" />
      <Metric title="Produk aktif" value={products.length} caption="item katalog produk" />
      <Metric title="Produksi selesai" value={production.filter((row) => row.status_produksi === "Selesai").length} caption="catatan produksi selesai" />
    </div>
    <section className="role-panel"><div className="role-panel-head"><div><span className="role-eyebrow">PENJUALAN</span><h2>Ringkasan per bulan</h2></div></div>
      {bars.length ? <div className="role-bars">{bars.map(([month, amount]) =>
        <div className="role-bar-col" key={month}><strong>{currency(amount)}</strong>
          <div><span style={{ height: `${Math.max(8, Number(amount * BigInt(100) / max))}%` }} /></div>
          <small>{month}</small></div>)}</div> : <EmptyState text="Belum ada pembayaran berhasil untuk dilaporkan." />}
    </section>
  </>;
}

function ReviewPanel({ role, reviews, reviewableOrders, reviewOrder, setReviewOrder,
  rating, setRating, text, setText, onSubmit, busy }: {
  role: AppRole; reviews: Row[]; reviewableOrders: Row[]; reviewOrder: string; setReviewOrder: (value: string) => void;
  rating: string; setRating: (value: string) => void; text: string; setText: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; busy: boolean;
}) {
  return <div className="role-review-layout">
    {role === "CUSTOMER" && <form className="role-panel role-review-form" onSubmit={onSubmit}>
      <span className="role-eyebrow">BAGIKAN PENGALAMAN</span><h2>Tulis ulasan</h2>
      <label>Pesanan<select value={reviewOrder} onChange={(event) => setReviewOrder(event.target.value)} required>
        <option value="">Pilih pesanan yang sudah diterima</option>
        {reviewableOrders.map((order) => <option key={asText(order.no_pesanan)} value={asText(order.no_pesanan)}>
          {asText(order.no_pesanan)} · {dateLabel(order.tanggal_pesanan)}
        </option>)}
      </select></label>
      <label>Rating<select value={rating} onChange={(event) => setRating(event.target.value)}>
        {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} dari 5</option>)}
      </select></label>
      <label>Ulasan<textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={255} rows={4} required /></label>
      <button className="role-primary-button" disabled={busy || !reviewOrder}>Kirim ulasan</button>
      {!reviewableOrders.length && <small>Pesanan yang sudah diserahkan dapat diberi ulasan satu kali.</small>}
    </form>}
    <section className="role-panel role-review-list"><div className="role-panel-head"><div>
      <span className="role-eyebrow">MASUKAN PELANGGAN</span><h2>{role === "CUSTOMER" ? "Ulasan Anda" : "Ulasan pelanggan"}</h2>
    </div></div>
      {reviews.length ? reviews.map((review) => <article className="role-review-row" key={asText(review.id_ulasan)}>
        <div><strong>Pesanan {asText(review.no_pesanan)}</strong><small>{asText(review.nama_pelanggan)} · {dateLabel(review.tanggal_ulasan)}</small></div>
        <span className="role-rating">{"★".repeat(Math.min(5, Number(review.rating)))}{"☆".repeat(Math.max(0, 5 - Number(review.rating)))}</span>
        <p>{asText(review.isi_ulasan)}</p>
      </article>) : <EmptyState text="Belum ada ulasan." />}
    </section>
  </div>;
}

function Metric({ title, value, caption }: { title: string; value: string | number; caption: string }) {
  return <article className="role-metric"><span>{title}</span><strong>{value}</strong><small>{caption}</small></article>;
}

function OrderTable({ rows }: { rows: Row[] }) {
  if (!rows.length) return <EmptyState text="Belum ada pesanan." />;
  return <div className="role-table-wrap"><table className="role-table"><thead><tr>
    <th>Nomor pesanan</th><th>Pelanggan</th><th>Tanggal</th><th>Status</th>
  </tr></thead><tbody>{rows.map((row) => <tr key={asText(row.no_pesanan)}>
    <td>{asText(row.no_pesanan)}</td><td>{asText(row.nama_pelanggan)}</td>
    <td>{dateLabel(row.tanggal_pesanan)}</td><td><Status value={row.status_pesanan} /></td>
  </tr>)}</tbody></table></div>;
}

function Status({ value }: { value: unknown }) {
  const status = asText(value);
  return <span className="role-status">{status}</span>;
}

function LoadingState() {
  return <div className="role-empty" aria-live="polite">Memuat data...</div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="role-empty">{text}</div>;
}
