"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  resourceOrder,
  resources,
  type ResourceKey,
  type FormField,
} from "@/src/lib/catalog";

type Row = Record<string, unknown>;
type Records = Record<ResourceKey, Row[]>;
type DialogState =
  | { kind: "create"; resource: ResourceKey }
  | { kind: "edit"; resource: ResourceKey; row: Row }
  | { kind: "detail"; resource: ResourceKey; row: Row }
  | null;

const emptyRecords: Records = {
  customers: [],
  users: [],
  products: [],
  orders: [],
  "order-details": [],
  payments: [],
  production: [],
  handover: [],
  reviews: [],
};

const tableColumns: Record<ResourceKey, string[]> = {
  customers: ["id_pelanggan", "nama_pelanggan", "no_telepon", "email", "kota"],
  users: ["id_pengguna", "nama_pengguna", "peran", "email", "no_telepon"],
  products: [
    "id_produk",
    "nama_produk",
    "kategori_produk",
    "harga_produk",
    "stok_produk",
    "stok_minimum",
  ],
  orders: [
    "no_pesanan",
    "nama_pelanggan",
    "nama_admin",
    "tanggal_pesanan",
    "status_pesanan",
  ],
  "order-details": [
    "no_pesanan",
    "nama_produk",
    "jumlah",
    "harga_satuan",
    "subtotal",
    "stok_produk_sebelum",
    "stok_produk_sesudah",
  ],
  payments: [
    "id_pembayaran",
    "no_pesanan",
    "metode_pembayaran",
    "jumlah_bayar",
    "tanggal_bayar",
    "status_pembayaran",
  ],
  production: [
    "id_produksi",
    "no_pesanan",
    "nama_karyawan",
    "status_produksi",
    "tanggal_mulai_produksi",
    "tanggal_selesai_produksi",
  ],
  handover: [
    "id_penyerahan",
    "no_pesanan",
    "metode_penyerahan",
    "status_penyerahan",
    "tanggal_penyerahan",
  ],
  reviews: [
    "id_ulasan",
    "no_pesanan",
    "nama_pelanggan",
    "rating",
    "isi_ulasan",
    "tanggal_ulasan",
  ],
};

const labels: Record<string, string> = {
  id_pelanggan: "ID pelanggan",
  nama_pelanggan: "Nama pelanggan",
  jenis_kelamin: "Jenis kelamin",
  no_telepon: "Nomor telepon",
  email: "Email",
  nama_jalan: "Nama jalan",
  nomor: "Nomor",
  kota: "Kota",
  id_pengguna: "ID pengguna",
  nama_pengguna: "Nama pengguna",
  peran: "Peran",
  tanggal_bergabung: "Tanggal bergabung",
  id_produk: "ID produk",
  nama_produk: "Nama produk",
  kategori_produk: "Kategori",
  satuan_produk: "Satuan",
  harga_produk: "Harga",
  stok_minimum: "Stok minimum",
  stok_produk: "Stok saat ini",
  no_pesanan: "Nomor pesanan",
  id_admin: "Admin",
  id_karyawan: "Karyawan",
  tanggal_pesanan: "Tanggal pesanan",
  status_pesanan: "Status pesanan",
  jumlah: "Jumlah",
  harga_satuan: "Harga satuan",
  stok_produk_sebelum: "Stok sebelum",
  stok_produk_sesudah: "Stok sesudah",
  id_pembayaran: "ID pembayaran",
  metode_pembayaran: "Metode pembayaran",
  jumlah_bayar: "Jumlah bayar",
  tanggal_bayar: "Tanggal bayar",
  status_pembayaran: "Status pembayaran",
  id_produksi: "ID produksi",
  status_produksi: "Status produksi",
  tanggal_mulai_produksi: "Tanggal mulai",
  tanggal_selesai_produksi: "Tanggal selesai",
  id_penyerahan: "ID penyerahan",
  metode_penyerahan: "Metode penyerahan",
  status_penyerahan: "Status penyerahan",
  tanggal_penyerahan: "Tanggal penyerahan",
  id_ulasan: "ID ulasan",
  rating: "Rating",
  isi_ulasan: "Isi ulasan",
  tanggal_ulasan: "Tanggal ulasan",
  nama_admin: "Admin",
  nama_karyawan: "Karyawan",
  has_password: "Kata sandi tersimpan",
  subtotal: "Subtotal",
};

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function text(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  return String(value);
}

function formattedValue(field: string, value: unknown) {
  if (value === null || value === undefined || value === "") {
    return field === "stok_produk" || field === "harga_produk" ? "Belum diatur" : "—";
  }
  if (["harga_produk", "harga_satuan", "jumlah_bayar"].includes(field)) {
    try {
      const amount = BigInt(String(value));
      return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return String(value);
    }
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return value.slice(0, 10);
  }
  return text(value);
}

function primaryKey(resource: ResourceKey, row: Row) {
  return resources[resource].idFields.map((field) => text(row[field])).join(" / ");
}

function optionText(resource: ResourceKey, row: Row) {
  switch (resource) {
    case "customers":
      return `${text(row.id_pelanggan)} · ${text(row.nama_pelanggan)}`;
    case "users":
      return `${text(row.id_pengguna)} · ${text(row.nama_pengguna)} (${text(row.peran)})`;
    case "products":
      return `${text(row.id_produk)} · ${text(row.nama_produk)}`;
    case "orders":
      return `${text(row.no_pesanan)} · ${text(row.nama_pelanggan)}`;
    default:
      return primaryKey(resource, row);
  }
}

function optionRows(field: FormField, records: Records) {
  if (!field.reference) return [];
  const rows = records[field.reference];
  if (field.reference === "users" && field.name === "id_admin") {
    return rows.filter((row) => row.peran === "Owner" || row.peran === "Admin");
  }
  if (field.reference === "users" && field.name === "id_karyawan") {
    return rows.filter((row) => row.peran === "Employee" || row.peran === "Karyawan");
  }
  return rows;
}

function fieldValue(field: FormField, row?: Row) {
  const value = row?.[field.name];
  if (value === null || value === undefined) {
    if (field.kind === "date" && field.required) return localDate();
    return field.options?.[0] ?? "";
  }
  if (field.kind === "date") return String(value).slice(0, 10);
  return String(value);
}

function fieldInputType(field: FormField) {
  if (field.kind === "email" || field.kind === "password" || field.kind === "date") {
    return field.kind;
  }
  if (field.kind === "number" || field.kind === "money") return "number";
  return "text";
}

function filteredRows(rows: Row[], query: string) {
  const needle = query.trim().toLocaleLowerCase("id");
  if (!needle) return rows;
  return rows.filter((row) =>
    Object.values(row).some((value) => String(value ?? "").toLocaleLowerCase("id").includes(needle)),
  );
}

function isLowStock(row: Row) {
  return (
    typeof row.stok_produk === "number" &&
    typeof row.stok_minimum === "number" &&
    row.stok_produk < row.stok_minimum
  );
}

export default function Home() {
  const [activeResource, setActiveResource] = useState<ResourceKey>("orders");
  const [records, setRecords] = useState<Records>(emptyRecords);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [today, setToday] = useState("");

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const loaded = await Promise.all(
        resourceOrder.map(async (resource) => {
          const response = await fetch(`/api/${resource}`, { cache: "no-store" });
          const payload: unknown = await response.json();
          if (!response.ok) {
            const message =
              typeof payload === "object" &&
              payload !== null &&
              "error" in payload &&
              typeof payload.error === "string"
                ? payload.error
                : "Gagal memuat data.";
            throw new Error(message);
          }
          if (!Array.isArray(payload)) {
            throw new Error(`Respons ${resources[resource].title} tidak valid.`);
          }
          return [resource, payload as Row[]] as const;
        }),
      );
      const next = { ...emptyRecords };
      for (const [resource, rows] of loaded) {
        next[resource] = rows;
      }
      setRecords(next);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Gagal memuat data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadRecords);
  }, [loadRecords]);

  useEffect(() => {
    void Promise.resolve().then(() =>
      setToday(new Intl.DateTimeFormat("id-ID", { dateStyle: "full" }).format(new Date())),
    );
  }, []);

  const current = resources[activeResource];
  const rows = useMemo(
    () => filteredRows(records[activeResource], search),
    [activeResource, records, search],
  );

  function openDialog(nextDialog: Exclude<DialogState, null>) {
    const row = nextDialog.kind === "create" ? undefined : nextDialog.row;
    const values: Record<string, string> = {};
    for (const field of resources[nextDialog.resource].fields) {
      values[field.name] = fieldValue(field, row);
    }
    if (nextDialog.kind === "edit") {
      for (const field of resources[nextDialog.resource].fields) {
        if (field.kind === "password") values[field.name] = "";
      }
    }
    setFormValues(values);
    setError("");
    setDialog(nextDialog);
  }

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || dialog.kind === "detail") return;
    setSaving(true);
    setError("");

    const definition = resources[dialog.resource];
    const values: Record<string, string | number> = {};
    for (const field of definition.fields) {
      if (dialog.kind === "edit" && definition.idFields.includes(field.name)) continue;
      const value = formValues[field.name] ?? "";
      if (field.kind === "password" && dialog.kind === "edit" && value === "") continue;
      if (field.kind === "number") {
        values[field.name] = Number(value);
      } else {
        values[field.name] = value;
      }
    }

    const body =
      dialog.kind === "edit"
        ? {
            keys: Object.fromEntries(
              definition.idFields.map((field) => [field, text(dialog.row[field])]),
            ),
            values,
          }
        : { values };

    try {
      const response = await fetch(`/api/${dialog.resource}`, {
        method: dialog.kind === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Perubahan tidak dapat disimpan.";
        throw new Error(message);
      }
      setDialog(null);
      setNotice(`${current.title} berhasil ${dialog.kind === "create" ? "ditambahkan" : "diperbarui"}.`);
      await loadRecords();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Perubahan tidak dapat disimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(resource: ResourceKey, row: Row) {
    const identity = primaryKey(resource, row);
    if (!window.confirm(`Hapus ${resources[resource].title.toLocaleLowerCase("id")} ${identity}?`)) {
      return;
    }

    setError("");
    setNotice("");
    try {
      const keys = Object.fromEntries(
        resources[resource].idFields.map((field) => [field, text(row[field])]),
      );
      const response = await fetch(`/api/${resource}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(keys),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Data tidak dapat dihapus.";
        throw new Error(message);
      }
      setNotice(`${resources[resource].title} berhasil dihapus.`);
      await loadRecords();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Data tidak dapat dihapus.");
    }
  }

  function renderField(field: FormField) {
    const value = formValues[field.name] ?? "";
    const editing = dialog?.kind === "edit";
    const lockedKey = editing && current.idFields.includes(field.name);
    const completionDateRequired =
      dialog?.resource === "production" &&
      field.name === "tanggal_selesai_produksi" &&
      formValues.status_produksi === "Selesai";
    const required = Boolean(
      (field.required || completionDateRequired) &&
        !lockedKey &&
        !(editing && field.kind === "password"),
    );
    const common = {
      id: `field-${field.name}`,
      name: field.name,
      required,
      disabled: lockedKey || saving,
      maxLength: field.maxLength,
      min: field.min,
      max: field.max,
      value,
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
      ) => setFormValues((previous) => ({ ...previous, [field.name]: event.target.value })),
    };

    return (
      <label className={`form-field ${field.kind === "textarea" ? "field-wide" : ""}`} key={field.name}>
        <span>
          {field.label}
          {field.kind === "password" && editing ? " (kosongkan jika tidak diubah)" : ""}
        </span>
        {field.kind === "select" ? (
          <select {...common}>
            {field.reference ? (
              <>
                <option value="">Pilih {field.label.toLocaleLowerCase("id")}</option>
                {optionRows(field, records).map((row) => {
                  const key = row[field.reference === "customers" ? "id_pelanggan" : field.reference === "users" ? "id_pengguna" : field.reference === "products" ? "id_produk" : "no_pesanan"];
                  return (
                    <option key={text(key)} value={text(key)}>
                      {optionText(field.reference!, row)}
                    </option>
                  );
                })}
              </>
            ) : (
              <>
                {!field.required && <option value="">Belum selesai</option>}
                {field.options?.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </>
            )}
          </select>
        ) : field.kind === "textarea" ? (
          <textarea {...common} rows={4} />
        ) : (
          <input
            {...common}
            type={fieldInputType(field)}
            step={field.kind === "money" ? "1" : undefined}
            autoComplete={field.kind === "password" ? "new-password" : undefined}
          />
        )}
      </label>
    );
  }

  function renderCell(field: string, row: Row) {
    if (field === "subtotal") {
      if (row.harga_satuan == null || row.jumlah == null) return "—";
      try {
        return formattedValue(
          "harga_satuan",
          (BigInt(String(row.harga_satuan)) * BigInt(String(row.jumlah))).toString(),
        );
      } catch {
        return "—";
      }
    }
    if (field === "stok_produk" && (row.stok_produk === null || row.stok_produk === undefined)) {
      return <span className="badge badge-muted">Belum diatur</span>;
    }
    if (field === "harga_produk" && (row.harga_produk === null || row.harga_produk === undefined)) {
      return <span className="badge badge-muted">Belum diatur</span>;
    }
    if (field === "stok_produk" && isLowStock(row)) {
      return <span className="badge badge-warning">{formattedValue(field, row[field])} · rendah</span>;
    }
    if (field.startsWith("status_")) {
      return <span className="badge badge-status">{formattedValue(field, row[field])}</span>;
    }
    if (field === "isi_ulasan") {
      const review = text(row[field]);
      return review.length > 58 ? `${review.slice(0, 58)}…` : review;
    }
    return formattedValue(field, row[field]);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">DA</span>
          <span>
            <strong>Dapur Abita</strong>
            <small>Order &amp; Production</small>
          </span>
        </div>
        <p className="nav-caption">MENU UTAMA</p>
        <nav className="main-nav" aria-label="Menu utama">
          {resourceOrder.map((resource, index) => (
            <button
              className={`nav-item ${activeResource === resource ? "nav-item-active" : ""}`}
              key={resource}
              onClick={() => {
                setActiveResource(resource);
                setSearch("");
                setError("");
              }}
            >
              <span className="nav-number">{String(index + 1).padStart(2, "0")}</span>
              <span>{resources[resource].title}</span>
              <span className="nav-count">{records[resource].length}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="connection-dot" />
          <span>PostgreSQL · apsi_db</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="crumb">Dapur Abita <span>/</span> {current.title}</div>
          <div className="topbar-right">
            <span className="today-label">{today}</span>
            <div className="avatar">DA</div>
          </div>
        </header>

        <div className="content">
          <div className="welcome-row">
            <div>
              <p className="eyebrow">SISTEM INFORMASI DAPUR ABITA</p>
              <h1>Selamat datang kembali</h1>
              <p className="welcome-subtitle">Kelola pesanan, produksi, dan penjualan dalam satu tempat.</p>
            </div>
            <button className="button button-primary" onClick={() => openDialog({ kind: "create", resource: activeResource })}>
              <span className="button-plus">+</span> Tambah {current.title}
            </button>
          </div>

          <div className="summary-grid">
            <div className="summary-card">
              <span className="summary-label">Total pesanan</span>
              <strong>{records.orders.length}</strong>
              <span className="summary-foot">terdaftar di sistem</span>
            </div>
            <div className="summary-card">
              <span className="summary-label">Dalam produksi</span>
              <strong>{records.production.filter((row) => row.status_produksi === "Diproses").length}</strong>
              <span className="summary-foot">pesanan sedang dikerjakan</span>
            </div>
            <div className="summary-card">
              <span className="summary-label">Produk perlu perhatian</span>
              <strong>{records.products.filter((row) => row.stok_produk == null || isLowStock(row)).length}</strong>
              <span className="summary-foot">stok rendah atau belum diatur</span>
            </div>
            <div className="summary-card summary-card-accent">
              <span className="summary-label">Pelanggan</span>
              <strong>{records.customers.length}</strong>
              <span className="summary-foot">pelanggan terdaftar</span>
            </div>
          </div>

          {(error || notice) && (
            <div className={`alert ${error ? "alert-error" : "alert-success"}`} role={error ? "alert" : "status"}>
              <span>{error || notice}</span>
              <button
                className="alert-close"
                aria-label="Tutup notifikasi"
                onClick={() => {
                  setError("");
                  setNotice("");
                }}
              >
                ×
              </button>
            </div>
          )}

          <section className="data-card">
            <div className="data-card-header">
              <div>
                <p className="eyebrow">DATA MASTER &amp; TRANSAKSI</p>
                <h2>{current.titlePlural}</h2>
                <p className="data-description">Kelola informasi {current.title.toLocaleLowerCase("id")} Dapur Abita.</p>
              </div>
              <button className="button button-secondary" onClick={() => void loadRecords()} disabled={loading}>
                <span className={loading ? "refresh-icon spin" : "refresh-icon"}>↻</span>
                Muat ulang
              </button>
            </div>
            <div className="table-toolbar">
              <label className="search-box">
                <span className="search-icon">⌕</span>
                <input
                  type="search"
                  placeholder={`Cari ${current.title.toLocaleLowerCase("id")}...`}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label={`Cari ${current.title}`}
                />
              </label>
              <span className="record-count">{rows.length} data</span>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {tableColumns[activeResource].map((column) => (
                      <th key={column}>{labels[column] ?? column}</th>
                    ))}
                    <th className="actions-heading">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td className="empty-state" colSpan={tableColumns[activeResource].length + 1}>Memuat data...</td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td className="empty-state" colSpan={tableColumns[activeResource].length + 1}>
                        {error ? "Data belum dapat ditampilkan." : "Belum ada data yang cocok."}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={primaryKey(activeResource, row)}>
                        {tableColumns[activeResource].map((column) => (
                          <td key={column}>{renderCell(column, row)}</td>
                        ))}
                        <td>
                          <div className="row-actions">
                            <button className="action-button" onClick={() => openDialog({ kind: "detail", resource: activeResource, row })}>Detail</button>
                            <button className="action-button" onClick={() => openDialog({ kind: "edit", resource: activeResource, row })}>Edit</button>
                            <button className="action-button action-delete" onClick={() => void deleteRow(activeResource, row)}>Hapus</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {activeResource === "order-details" && (
              <p className="table-note">Harga satuan disalin dari katalog produk. Penambahan detail mengurangi stok; penghapusan detail mengembalikan stok dalam satu transaksi.</p>
            )}
            {activeResource === "products" && (
              <p className="table-note">Data stok dan harga yang belum diatur harus diisi sebelum produk dapat digunakan pada detail pesanan.</p>
            )}
          </section>
          <footer className="page-footer">Dapur Abita <span>·</span> Sistem Informasi Manajemen Pesanan &amp; Produksi</footer>
        </div>
      </section>

      {dialog && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) setDialog(null);
        }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">
                  {dialog.kind === "detail" ? "RINCIAN DATA" : dialog.kind === "create" ? "DATA BARU" : "PERBARUI DATA"}
                </p>
                <h2 id="modal-title">
                  {dialog.kind === "detail"
                    ? `Detail ${resources[dialog.resource].title}`
                    : dialog.kind === "create"
                      ? `Tambah ${resources[dialog.resource].title}`
                      : `Edit ${resources[dialog.resource].title}`}
                </h2>
              </div>
              <button className="modal-close" aria-label="Tutup" onClick={() => setDialog(null)} disabled={saving}>×</button>
            </div>

            {dialog.kind === "detail" ? (
              <div className="detail-grid">
                {Object.entries(dialog.row)
                  .filter(([key]) => key !== "password")
                  .map(([key, value]) => (
                    <div className="detail-item" key={key}>
                      <span>{labels[key] ?? key}</span>
                      <strong>{formattedValue(key, value)}</strong>
                    </div>
                  ))}
              </div>
            ) : (
              <form className="record-form" onSubmit={submitForm}>
                <div className="form-grid">
                  {resources[dialog.resource].fields.map(renderField)}
                </div>
                <div className="form-footer">
                  <span className="required-note">* Wajib diisi</span>
                  <div className="form-actions">
                    <button className="button button-secondary" type="button" onClick={() => setDialog(null)} disabled={saving}>Batal</button>
                    <button className="button button-primary" type="submit" disabled={saving}>
                      {saving ? "Menyimpan..." : dialog.kind === "create" ? "Simpan data" : "Simpan perubahan"}
                    </button>
                  </div>
                </div>
                {error && <p className="form-error" role="alert">{error}</p>}
              </form>
            )}

            {dialog.kind === "detail" && (
              <div className="form-actions detail-actions">
                <button className="button button-secondary" onClick={() => setDialog(null)}>Tutup</button>
                <button className="button button-primary" onClick={() => openDialog({ kind: "edit", resource: dialog.resource, row: dialog.row })}>Edit data</button>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
