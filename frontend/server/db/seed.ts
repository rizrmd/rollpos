import { createSql } from "./client"

const items = [
  ["Strawberry", "INV-STRAWBERRY", "kg", 2],
  ["Gula Cair", "INV-GULA-CAIR", "ml", 500],
  ["Air", "INV-AIR", "ml", 2000],
  ["Es Batu", "INV-ES-BATU", "g", 1000],
  ["Straw", "INV-STRAW", "pcs", 30],
  ["Botol PET", "INV-BOTOL-PET", "pcs", 20],
] as const

export async function seedInventory(): Promise<void> {
  const sql = createSql()
  try {
    for (const [name, sku, unit, minimum] of items) {
      await sql`INSERT INTO inventory_items (name, sku, base_unit, minimum_stock)
        VALUES (${name}, ${sku}, ${unit}, ${minimum})
        ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name, base_unit = EXCLUDED.base_unit,
          minimum_stock = EXCLUDED.minimum_stock, updated_at = now()`
    }
    console.info(
      "Seed development inventory selesai (tanpa transaksi stok palsu)."
    )
  } finally {
    await sql.end()
  }
}

if (import.meta.main) await seedInventory()
