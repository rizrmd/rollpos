# RollPOS frontend

Vite + React + TypeScript + shadcn/ui, menggunakan **Bun**. Semua data aplikasi, termasuk inventory, disimpan offline pada satu perangkat melalui TinyBase + IndexedDB.

Inventory menyimpan item, lot, dan stock movement pada database IndexedDB browser bernama `rollpos`. Saldo dihitung dari ledger lokal. Tidak ada backend, API, sinkronisasi antarperangkat, atau `DATABASE_URL` pada tahap ini. Menghapus data situs/browser juga menghapus data lokal aplikasi.

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
