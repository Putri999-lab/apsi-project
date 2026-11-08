"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const roles = [
  { value: "CUSTOMER", label: "Pelanggan" },
  { value: "EMPLOYEE", label: "Produksi" },
  { value: "OWNER", label: "Owner" },
  { value: "ADMIN", label: "Admin" },
] as const;

type Role = (typeof roles)[number]["value"];

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [role, setRole] = useState<Role>("CUSTOMER");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/auth", { cache: "no-store" })
      .then(async (response) => {
        if (response.ok && active) router.replace("/dashboard");
      })
      .catch(() => {
        if (active) setError("Tidak dapat menghubungi server. Coba muat ulang halaman.");
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload: Record<string, string> = Object.fromEntries(
      [...form.entries()].map(([key, value]) => [key, String(value)]),
    );
    payload.action = mode === "login" ? "login" : "register";
    if (mode === "register") payload.role = role;
    else payload.selectedRole = role;

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof result === "object" && result !== null && "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Permintaan tidak dapat diproses.";
        throw new Error(message);
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Permintaan tidak dapat diproses.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-logo" aria-label="Dapur Abita">DA</div>
        <p className="auth-kicker">DAPUR ABITA</p>
        <h1 id="auth-title">{mode === "login" ? "Masuk" : "Daftar akun"}</h1>
        <p className="auth-intro">
          {mode === "login" ? "Masuk untuk melanjutkan ke ruang kerja Anda." : "Buat akun untuk mulai menggunakan Dapur Abita."}
        </p>

        <form className="auth-form" onSubmit={submit}>
          {mode === "register" && (
            <>
              <label className="auth-field">
                <span>Daftar sebagai</span>
                <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
                  {roles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="auth-field">
                <span>Nama lengkap</span>
                <input name="name" autoComplete="name" maxLength={50} required />
              </label>
            </>
          )}

          <label className="auth-field">
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" maxLength={40} required />
          </label>
          <label className="auth-field">
            <span>Kata sandi</span>
            <input
              name="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={8}
              maxLength={72}
              required
            />
          </label>

          {mode === "register" && (
            <>
              <label className="auth-field">
                <span>Jenis kelamin</span>
                <select name="gender" required defaultValue="">
                  <option value="" disabled>Pilih jenis kelamin</option>
                  <option>Perempuan</option>
                  <option>Laki-laki</option>
                </select>
              </label>
              <label className="auth-field">
                <span>Nomor telepon</span>
                <input name="phone" type="tel" autoComplete="tel" maxLength={16} required />
              </label>
              {role === "CUSTOMER" ? (
                <div className="auth-address-grid">
                  <label className="auth-field auth-address-street">
                    <span>Nama jalan</span><input name="street" autoComplete="street-address" maxLength={50} required />
                  </label>
                  <label className="auth-field">
                    <span>Nomor</span><input name="number" maxLength={10} required />
                  </label>
                  <label className="auth-field">
                    <span>Kota</span><input name="city" autoComplete="address-level2" maxLength={15} required />
                  </label>
                </div>
              ) : (
                <label className="auth-field">
                  <span>Kode undangan {role === "EMPLOYEE" ? "karyawan" : role.toLocaleLowerCase("id")}</span>
                  <input name="invitationCode" type="password" autoComplete="off" required />
                  <small>Akun staf dibuat dengan kode undangan yang diberikan pengelola.</small>
                </label>
              )}
            </>
          )}

          {mode === "login" && (
            <div className="auth-role-shortcuts" aria-label="Pilih ruang kerja">
              <span>Masuk sebagai</span>
              {roles.map((item) => (
                <button
                  type="button"
                  key={item.value}
                  className={role === item.value ? "auth-role-chip selected" : "auth-role-chip"}
                  onClick={() => setRole(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}

          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={loading || checking}>
            {loading ? "Memproses..." : mode === "login" ? "Masuk" : "Buat akun"}
          </button>
        </form>

        <div className="auth-switch">
          <span>{mode === "login" ? "Belum memiliki akun?" : "Sudah memiliki akun?"}</span>
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
          >
            {mode === "login" ? "Daftar" : "Masuk"}
          </button>
        </div>
      </section>
    </main>
  );
}
