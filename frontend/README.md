# RollPOS frontend

Vite + React + TypeScript + shadcn/ui, using **Bun**.

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
