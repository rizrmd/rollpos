# RollPOS frontend

Vite + React + TypeScript + shadcn/ui, using **Bun**. Katalog + staffing lama masih berada di TinyBase/IndexedDB. Inventory tidak memakai TinyBase: sumber kebenarannya adalah PostgreSQL melalui REST API.

## Inventory API + PostgreSQL

Salin nilai koneksi PostgreSQL yang nyata ke environment (jangan commit secret), lalu jalankan:

```bash
export DATABASE_URL='postgres://...'
bun run db:migrate
bun run db:seed
bun run dev
```

Production menjalankan `bun run build && NODE_ENV=production bun run start`. API dan UI dilayani pada port yang sama (`PORT`, default 3000). Startup production menjalankan migrasi ketika `DATABASE_URL` tersedia, tetapi tidak menjalankan seed otomatis. Untuk sandbox development yang memang boleh menerima enam master item development, set `ROLLPOS_SEED_DEVELOPMENT=true`; seed idempotent berdasarkan SKU dan tidak membuat transaksi stok palsu.

`GET /api/health` tetap tersedia ketika database belum dikonfigurasi. Responsnya `503` dengan status `degraded`, tanpa membuka connection string atau detail error database.

Autorisasi inventory UI saat ini mengikuti sesi PIN owner/manager yang sudah ada. Karena sesi staff tersebut masih browser-local, `actorStaffId` belum dapat diverifikasi server-side; ini adalah keterbatasan eksplisit slice pertama, bukan jaminan keamanan backend.

## Scripts

```bash
bun install
bun run dev
bun run build
bun run preview
```

## Adding components

```bash
bunx --bun shadcn@latest add button
```

Components land in `src/components/ui`. Import them like this:

```tsx
import { Button } from "@/components/ui/button"
```
