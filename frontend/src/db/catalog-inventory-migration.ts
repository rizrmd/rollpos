import { convertQuantity } from "../lib/recipe-units"
import type { Store } from "tinybase"
import { TABLES } from "./schema"

/** Destructive only to the retired tables: canonical inventory/recipes always win. */
export function migrateCatalogInventory(store: Store): void {
  const ingredients = Object.entries(store.getTable(TABLES.products)).filter(
    ([, row]) => row.kind === "ingredient"
  )
  const lines = Object.entries(store.getTable(TABLES.recipeLines))
  if (!ingredients.length && !lines.length) return
  const now = Date.now()
  const inventoryIds = new Map<string, string>()
  store.transaction(() => {
    for (const [id, row] of ingredients) {
      const match = Object.entries(store.getTable(TABLES.inventoryItems)).find(
        ([, item]) =>
          String(item.sku).toUpperCase() === String(row.sku).toUpperCase()
      )
      if (match) convertQuantity(1, String(row.unit || "g"), String(match[1].baseUnit))
      const inventoryId = match?.[0] ?? `catalog:${id}`
      inventoryIds.set(id, inventoryId)
      if (!match) {
        store.setRow(TABLES.inventoryItems, inventoryId, {
          name: row.name,
          sku: row.sku,
          baseUnit: row.unit || "g",
          price: row.price,
          note: row.note,
          category: row.category,
          minimumStock: row.lowStock,
          isActive: row.isActive,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })
        const quantity = Number(row.stock) || 0
        if (quantity !== 0) {
          const lotId = `catalog-opening:${id}`
          store.setRow(TABLES.inventoryLots, lotId, {
            inventoryItemId: inventoryId,
            lotCode: lotId,
            receivedQuantity: Math.max(0, quantity),
            remainingQuantity: quantity,
            baseUnit: row.unit || "g",
            receivedAt: new Date(now).toISOString().slice(0, 10),
            notes: "Saldo awal migrasi katalog",
            createdAt: now,
            updatedAt: now,
          })
          store.setRow(TABLES.inventoryStockMovements, lotId, {
            inventoryItemId: inventoryId,
            inventoryLotId: lotId,
            movementType: "ADJUSTMENT",
            quantity,
            unit: row.unit || "g",
            referenceType: "CATALOG_MIGRATION",
            referenceId: id,
            reason: "Saldo awal migrasi katalog",
            actorStaffId: "",
            createdAt: now,
          })
        }
      }
    }
    for (const menuId of new Set(
      lines.map(([, row]) => String(row.productId))
    )) {
      if (
        Object.values(store.getTable(TABLES.recipes)).some(
          (row) => row.menuProductId === menuId
        )
      )
        continue
      const recipeId = `catalog:${menuId}`
      store.setRow(TABLES.recipes, recipeId, {
        menuProductId: menuId,
        version: 1,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      lines
        .filter(([, row]) => row.productId === menuId)
        .forEach(([id, row], sortOrder) => {
          const inventoryItemId = inventoryIds.get(String(row.ingredientId))
          if (!inventoryItemId)
            throw new Error(
              "Bahan resep lama tidak ditemukan. Migrasi dibatalkan."
            )
          store.setRow(TABLES.recipeIngredients, `catalog:${id}`, {
            recipeId,
            inventoryItemId,
            quantity: row.qty,
            unit: String(
              store.getCell(TABLES.products, String(row.ingredientId), "unit") || "g"
            ),
            sortOrder,
            createdAt: row.createdAt,
            updatedAt: now,
          })
        })
    }
    for (const [id] of ingredients) store.delRow(TABLES.products, id)
    store.delTable(TABLES.recipeLines)
  })
}

export const catalogIngredientId = (id: string) => `inventory:${id}`
export const inventoryIdFromCatalog = (id: string) =>
  id.startsWith("inventory:") ? id.slice("inventory:".length) : ""
