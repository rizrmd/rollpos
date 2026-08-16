import type { Database } from "@nozbe/watermelondb"

import Product from "./models/Product"

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

export function productsCollection(database: Database) {
  return database.get<Product>("products")
}

export async function createProduct(
  database: Database,
  input: ProductInput
): Promise<Product> {
  const now = Date.now()

  return database.write(async () => {
    return productsCollection(database).create((product) => {
      product.name = input.name
      product.sku = input.sku
      product.price = input.price
      product.stock = input.stock
      product.createdAt = now
      product.updatedAt = now
    })
  })
}

export async function deleteProduct(
  database: Database,
  product: Product
): Promise<void> {
  await database.write(async () => {
    await product.destroyPermanently()
  })
}

let seedInFlight: Promise<boolean> | null = null

export function seedCatalogIfEmpty(database: Database): Promise<boolean> {
  seedInFlight ??= seedCatalogOnce(database)
  return seedInFlight
}

async function seedCatalogOnce(database: Database): Promise<boolean> {
  const existing = await productsCollection(database).query().fetchCount()
  if (existing > 0) {
    return false
  }

  await database.write(async () => {
    const now = Date.now()
    const records = DEMO_PRODUCTS.map((item) =>
      productsCollection(database).prepareCreate((product) => {
        product.name = item.name
        product.sku = item.sku
        product.price = item.price
        product.stock = item.stock
        product.createdAt = now
        product.updatedAt = now
      })
    )
    await database.batch(records)
  })

  return true
}
