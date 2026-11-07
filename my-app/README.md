# Dapur Abita

Next.js application for managing the existing PostgreSQL order, production, and sales database.

## Run locally

The app reads `DATABASE_URL` from the process environment or from the workspace-root `.env` file:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/apsi_db"
```

Keep credentials out of source control. From `my-app`, run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The app uses the nine existing tables and does not run Prisma migrations automatically. Do not run `prisma migrate reset` or apply the checked-in initial migration to the existing database.

## Existing data notes

The approved additive fields are nullable so current records were preserved without invented values:

- `Pelanggan.password` and `Pengguna.password` store bcrypt hashes for passwords set through the app. Existing records remain without a password until one is set.
- `Produk.stok_produk` and `Produk.harga_produk` must be initialized for existing products before they can be used in order details.

Order-detail create, update, and delete operations run in transactions and adjust product stock. Stock changes are unavailable until a product's stock is initialized.

## Security

Password values are hashed with bcrypt and are never returned by the API. This development version does not yet include sign-in or session authorization. Keep it on a trusted local environment; do not expose it publicly until authentication and authorization are added.
