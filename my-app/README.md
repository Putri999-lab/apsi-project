# Dapur Abita

Next.js application for managing the existing PostgreSQL order, production, and sales database.

## Run locally

The app reads `DATABASE_URL`, `AUTH_SECRET`, and `PAYMENT_PROOF_DIR` from the process environment or the workspace-root `.env` file. `AUTH_SECRET` must contain at least 32 bytes.

```env
DATABASE_URL="postgresql://user:password@localhost:5432/apsi_db"
```

Keep credentials out of source control. From `my-app`, run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The application routes customers to their customer dashboard, Admin to `/workspace`, and Owner/Karyawan Produksi to their role dashboard at `/dashboard`. All dashboards read from the connected PostgreSQL database and enforce role permissions in server routes. Checkout, payment verification, production, handover, and review workflows use the existing nine tables. Product descriptions/photos and payment-proof links use nullable columns added by the customer catalog migration; apply pending migrations with `npx prisma migrate deploy` before deploying. Do not run `prisma migrate reset` or apply the checked-in initial migration to an existing database.

## Existing data notes

The approved additive fields are nullable so current records were preserved without invented values:

- `Pelanggan.password` and `Pengguna.password` store bcrypt hashes for passwords set through the app. Existing records remain without a password until one is set.
- `Produk.harga_produk` for PR01–PR05 uses the approved transaction prices: Rp35.000, Rp45.000, Rp5.000, Rp6.000, and Rp72.000. Their `stok_minimum` values remain 20, 10, 50, 30, and 5.
- Actual stock (`Produk.stok_produk`) was reconciled on 2026-11-08 from the final `stok_produk_sesudah` values in transactions DA-0001 through DA-0010: PR01 248, PR02 109, PR03 400, PR04 240, and PR05 34. Checkout reads and locks the live database stock, then decrements it only within the successful order transaction. Admin can update stock from confirmed inventory counts; products without a recorded stock cannot be checked out.

The Admin can maintain product prices and confirmed stock counts, verify payments, and assign eligible paid orders to production staff. Customers can cancel their own orders only while still awaiting processing and payment verification; the stock return and status update happen in one transaction and cannot be repeated. Employees only see and update their assigned production jobs. Owners have read-only operational summaries, period-based sales reports, product analysis, and CSV exports. Order, payment, production, handover, and review history is protected from deletion or direct order-total edits.

Bank-transfer and QRIS proof uploads accept JPG, PNG, WebP, or PDF files up to 5 MB. Files are stored outside the public directory and served only to the order's customer and authorized administrators. Set `PAYMENT_PROOF_DIR` to persistent storage in deployments; the Docker Compose setup uses the `payment_proofs` volume. Payment confirmation remains pending until an administrator verifies it.

The end-to-end customer/role-flow fixture is available as `node .customer-flow-test.mjs` from `my-app`. It creates and removes temporary customer, product, order, payment, proof, production, handover, and review fixtures in the configured database; its temporary staff sessions use existing accounts without changing them. Enable its helper endpoints only for a local development server with `ENABLE_CUSTOMER_FLOW_TESTS=true`; they are unavailable in production.

## Security

Passwords are hashed with bcrypt and are never returned by the API. Customer sessions are signed and HTTP-only; customer API reads are scoped by the logged-in customer's ID. Dashboard test endpoints are disabled in production.
