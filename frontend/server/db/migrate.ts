import { readdir } from "node:fs/promises"
import path from "node:path"

import { createSql } from "./client"

export async function migrate(): Promise<void> {
  const sql = createSql()
  const directory = path.resolve(import.meta.dir, "migrations")
  try {
    await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`
    const applied = new Set(
      (await sql<{ name: string }[]>`SELECT name FROM schema_migrations`).map(
        (row) => row.name
      )
    )
    for (const name of (await readdir(directory))
      .filter((file) => file.endsWith(".sql"))
      .sort()) {
      if (applied.has(name)) continue
      const migration = await Bun.file(path.join(directory, name)).text()
      await sql.begin(async (tx) => {
        await tx.unsafe(migration)
        await tx`INSERT INTO schema_migrations (name) VALUES (${name})`
      })
      console.info(`Migrasi diterapkan: ${name}`)
    }
  } finally {
    await sql.end()
  }
}

if (import.meta.main) await migrate()
