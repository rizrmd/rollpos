import {
  addRow,
  deleteRow,
  listRows,
  transact,
  type Database,
  TABLES,
} from "@/db/database"
import { loadProducts } from "@/db/snapshot"
import type { ProductRecord } from "@/lib/types"

export type ProductInput = {
  name: string
  sku: string
  price: number
  stock: number
}

export const DEMO_PRODUCTS: ProductInput[] = [
  { name: "Espresso", sku: "RNB-ESP", price: 18_000, stock: 40 },
  { name: "Americano", sku: "RNB-AME", price: 22_000, stock: 36 },
  { name: "Cafe Latte", sku: "RNB-LAT", price: 28_000, stock: 30 },
  { name: "Butter Croissant", sku: "RNB-CRO", price: 18_000, stock: 16 },
]

const catalogSeed = new WeakMap<object, Promise<boolean>>()

export async function createProduct(
  database: Database,
  input: ProductInput
): Promise<ProductRecord> {
  await database.ready
  const now = Date.now()
  const id = addRow(database, TABLES.products, {
    name: input.name,
    sku: input.sku,
    price: input.price,
    stock: input.stock,
    createdAt: now,
    updatedAt: now,
  })
  return {
    id,
    name: input.name,
    sku: input.sku,
    price: input.price,
    stock: input.stock,
    createdAt: now,
    updatedAt: now,
  }
}

export async function deleteProduct(
  database: Database,
  product: { id: string }
): Promise<void> {
  await database.ready
  deleteRow(database, TABLES.products, product.id)
}

export function seedCatalogIfEmpty(database: Database): Promise<boolean> {
  const key = database.store
  let pending = catalogSeed.get(key)
  if (!pending) {
    pending = seedCatalogOnce(database)
    catalogSeed.set(key, pending)
  }
  return pending
}

async function seedCatalogOnce(database: Database): Promise<boolean> {
  await database.ready
  if (listRows(database, TABLES.products).length > 0) {
    return false
  }

  const now = Date.now()
  transact(database, () => {
    for (const item of DEMO_PRODUCTS) {
      addRow(database, TABLES.products, {
        name: item.name,
        sku: item.sku,
        price: item.price,
        stock: item.stock,
        createdAt: now,
        updatedAt: now,
      })
    }
  })

  return true
}

export { loadProducts }
