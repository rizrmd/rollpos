import {
  persistentOperation,
  addRow,
  cellNum,
  cellStr,
  deleteMatching,
  listRows,
  transact,
  updateRow,
  type Database,
  TABLES,
} from "./database"
import { loadRecipes, type Recipe } from "./recipes"

export type KitchenItemStatus = "queued" | "started"

export type KitchenOrderModifier = {
  id: string
  name: string
  quantity: number
  additionalPrice: number
}

export type KitchenOrderItem = {
  id: string
  menuProductId: string
  menuName: string
  quantity: number
  modifiers: KitchenOrderModifier[]
  status: KitchenItemStatus
  startedAt: number
  recipe: Recipe | null
}

export type KitchenOrder = {
  id: string
  sourceOrderId: string
  orderNumber: string
  customerName: string
  status: string
  placedAt: number
  items: KitchenOrderItem[]
}

export const syncPaidOrdersToKitchen = persistentOperation(async function (
  database: Database
): Promise<void> {
  await database.ready
  transact(database, () => {
    const legacyOrderIds = listRows(database, TABLES.kitchenOrders)
      .filter((order) => !cellStr(order, "sourceOrderId"))
      .map((order) => order.id)
    for (const kitchenOrderId of legacyOrderIds) {
      deleteMatching(
        database,
        TABLES.kitchenOrderItems,
        (item) => cellStr(item, "orderId") === kitchenOrderId
      )
      database.store.delRow(TABLES.kitchenOrders, kitchenOrderId)
    }
    for (const order of listRows(database, TABLES.orders)) {
      if (cellStr(order, "status") === "PAID") {
        enqueuePaidOrder(
          database,
          order.id,
          cellNum(order, "updatedAt") || cellNum(order, "createdAt")
        )
      }
    }
  })
})

/** Dipanggil di dalam transaksi pembayaran agar PAID dan antrean bersifat atomik. */
export function enqueuePaidOrder(
  database: Database,
  sourceOrderId: string,
  placedAt: number
): string {
  const source = database.store.getRow(TABLES.orders, sourceOrderId)
  if (!database.store.hasRow(TABLES.orders, sourceOrderId)) {
    throw new Error("Order Kasir tidak ditemukan.")
  }
  if (cellStr(source, "status") !== "PAID") {
    throw new Error("Hanya order PAID yang dapat masuk Kitchen.")
  }
  const existing = listRows(database, TABLES.kitchenOrders).find(
    (order) => cellStr(order, "sourceOrderId") === sourceOrderId
  )
  if (existing) return existing.id

  const now = Date.now()
  const kitchenOrderId = addRow(database, TABLES.kitchenOrders, {
    sourceOrderId,
    orderNumber: cellStr(source, "orderNumber"),
    customerName: "Order Kasir",
    status: "queued",
    placedAt,
    createdAt: now,
    updatedAt: now,
  })
  listRows(database, TABLES.orderItems)
    .filter((item) => cellStr(item, "orderId") === sourceOrderId)
    .sort((a, b) => cellNum(a, "sortOrder") - cellNum(b, "sortOrder"))
    .forEach((item, sortOrder) => {
      addRow(database, TABLES.kitchenOrderItems, {
        orderId: kitchenOrderId,
        sourceOrderItemId: item.id,
        menuProductId: cellStr(item, "menuProductId"),
        menuName: cellStr(item, "name"),
        modifiersSnapshot: cellStr(item, "modifiersSnapshot"),
        quantity: cellNum(item, "quantity"),
        status: "queued",
        startedAt: 0,
        sortOrder,
        createdAt: now,
        updatedAt: now,
      })
    })
  return kitchenOrderId
}

export async function loadKitchenOrders(
  database: Database
): Promise<KitchenOrder[]> {
  await database.ready
  const recipes = await loadRecipes(database)
  const activeRecipeByMenu = new Map(
    recipes
      .filter((recipe) => recipe.isActive)
      .map((recipe) => [recipe.menuProductId, recipe])
  )
  const productNames = new Map(
    listRows(database, TABLES.products).map((row) => [
      row.id,
      cellStr(row, "name"),
    ])
  )
  const itemRows = listRows(database, TABLES.kitchenOrderItems)

  return listRows(database, TABLES.kitchenOrders)
    .map((order) => ({
      id: order.id,
      sourceOrderId: cellStr(order, "sourceOrderId"),
      orderNumber: cellStr(order, "orderNumber"),
      customerName: cellStr(order, "customerName"),
      status: cellStr(order, "status"),
      placedAt: cellNum(order, "placedAt"),
      items: itemRows
        .filter((item) => cellStr(item, "orderId") === order.id)
        .sort((a, b) => cellNum(a, "sortOrder") - cellNum(b, "sortOrder"))
        .map((item) => {
          const menuProductId = cellStr(item, "menuProductId")
          const quantity = cellNum(item, "quantity")
          return {
            id: item.id,
            menuProductId,
            menuName:
              cellStr(item, "menuName") ||
              productNames.get(menuProductId) ||
              "Menu tidak ditemukan",
            quantity,
            modifiers: parseModifierSnapshot(
              cellStr(item, "modifiersSnapshot"),
              quantity
            ),
            status: cellStr(item, "status") as KitchenItemStatus,
            startedAt: cellNum(item, "startedAt"),
            recipe: activeRecipeByMenu.get(menuProductId) ?? null,
          }
        }),
    }))
    .sort((a, b) => a.placedAt - b.placedAt)
}

function parseModifierSnapshot(
  value: string,
  quantity: number
): KitchenOrderModifier[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((modifier) => {
      if (
        typeof modifier !== "object" ||
        modifier === null ||
        typeof modifier.id !== "string" ||
        typeof modifier.name !== "string" ||
        typeof modifier.additionalPrice !== "number" ||
        !Number.isFinite(modifier.additionalPrice)
      ) {
        return []
      }
      return [
        {
          id: modifier.id,
          name: modifier.name,
          quantity,
          additionalPrice: modifier.additionalPrice,
        },
      ]
    })
  } catch {
    return []
  }
}

export const startKitchenItem = persistentOperation(async function (
  database: Database,
  itemId: string
): Promise<void> {
  await database.ready
  const row = database.store.getRow(TABLES.kitchenOrderItems, itemId)
  if (!database.store.hasRow(TABLES.kitchenOrderItems, itemId)) {
    throw new Error("Item order dapur tidak ditemukan.")
  }
  if (cellStr(row, "status") === "started") return

  const orderId = cellStr(row, "orderId")
  const sourceOrderId = cellStr(
    database.store.getRow(TABLES.kitchenOrders, orderId),
    "sourceOrderId"
  )
  const menuProductId = cellStr(row, "menuProductId")
  const quantity = cellNum(row, "quantity")
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Quantity order harus lebih dari 0.")
  }

  const alreadyConsumed = listRows(
    database,
    TABLES.inventoryStockMovements
  ).some(
    (movement) =>
      cellStr(movement, "movementType") === "CONSUMPTION" &&
      cellStr(movement, "kitchenOrderItemId") === itemId
  )
  if (alreadyConsumed) return

  const activeRecipes = listRows(database, TABLES.recipes).filter(
    (recipe) =>
      cellStr(recipe, "menuProductId") === menuProductId &&
      Boolean(recipe.isActive)
  )
  if (activeRecipes.length === 0) {
    throw new Error("Recipe / SOP aktif belum tersedia.")
  }
  const recipe = activeRecipes.sort(
    (a, b) => cellNum(b, "version") - cellNum(a, "version")
  )[0]!
  const recipeLines = listRows(database, TABLES.recipeIngredients).filter(
    (line) => cellStr(line, "recipeId") === recipe.id
  )
  if (recipeLines.length === 0) {
    throw new Error("Recipe / SOP aktif tidak memiliki ingredient.")
  }

  const inventoryRows = new Map(
    listRows(database, TABLES.inventoryItems).map((item) => [item.id, item])
  )
  const requirements = new Map<
    string,
    { quantity: number; unit: string; name: string }
  >()
  for (const line of recipeLines) {
    const inventoryItemId = cellStr(line, "inventoryItemId")
    const inventory = inventoryRows.get(inventoryItemId)
    if (!inventory) throw new Error("Ingredient inventory tidak ditemukan.")
    const baseUnit = cellStr(inventory, "baseUnit")
    const required = convertQuantity(
      cellNum(line, "quantity") * quantity,
      cellStr(line, "unit"),
      baseUnit
    )
    const current = requirements.get(inventoryItemId)
    requirements.set(inventoryItemId, {
      quantity: (current?.quantity ?? 0) + required,
      unit: baseUnit,
      name: cellStr(inventory, "name"),
    })
  }

  const lotsByInventory = new Map<string, ReturnType<typeof listRows>>()
  for (const lot of listRows(database, TABLES.inventoryLots)) {
    const inventoryItemId = cellStr(lot, "inventoryItemId")
    const current = lotsByInventory.get(inventoryItemId) ?? []
    current.push(lot)
    lotsByInventory.set(inventoryItemId, current)
  }
  for (const lots of lotsByInventory.values()) {
    lots.sort((a, b) => {
      const aExpiry = cellStr(a, "expiryDate")
      const bExpiry = cellStr(b, "expiryDate")
      return (
        (aExpiry ? 0 : 1) - (bExpiry ? 0 : 1) ||
        aExpiry.localeCompare(bExpiry) ||
        cellStr(a, "receivedAt").localeCompare(cellStr(b, "receivedAt")) ||
        cellNum(a, "createdAt") - cellNum(b, "createdAt") ||
        a.id.localeCompare(b.id)
      )
    })
  }

  const allocations: Array<{
    inventoryItemId: string
    lot: ReturnType<typeof listRows>[number]
    quantity: number
    unit: string
  }> = []
  for (const [inventoryItemId, required] of requirements) {
    let remaining = required.quantity
    for (const lot of lotsByInventory.get(inventoryItemId) ?? []) {
      const available = cellNum(lot, "remainingQuantity")
      if (available <= 0) continue
      const allocated = Math.min(available, remaining)
      allocations.push({
        inventoryItemId,
        lot,
        quantity: allocated,
        unit: required.unit,
      })
      remaining -= allocated
      if (remaining <= Number.EPSILON) break
    }
    if (remaining > Number.EPSILON) {
      const available = required.quantity - remaining
      throw new Error(
        `Stok ${required.name} tidak cukup. Tersedia ${available} ${required.unit}, dibutuhkan ${required.quantity} ${required.unit}.`
      )
    }
  }

  const now = Date.now()
  transact(database, () => {
    for (const allocation of allocations) {
      addRow(database, TABLES.inventoryStockMovements, {
        inventoryItemId: allocation.inventoryItemId,
        inventoryLotId: allocation.lot.id,
        lotCode: cellStr(allocation.lot, "lotCode"),
        containerCode: cellStr(allocation.lot, "containerCode"),
        movementType: "CONSUMPTION",
        quantity: -allocation.quantity,
        unit: allocation.unit,
        referenceType: "KITCHEN_ORDER_MENU",
        referenceId: `${orderId}:${menuProductId}`,
        orderId: sourceOrderId || orderId,
        menuProductId,
        kitchenOrderItemId: itemId,
        reason: `Kitchen START · recipe v${cellNum(recipe, "version")}`,
        actorStaffId: "",
        createdAt: now,
      })
      updateRow(database, TABLES.inventoryLots, allocation.lot.id, {
        remainingQuantity:
          cellNum(allocation.lot, "remainingQuantity") - allocation.quantity,
        updatedAt: now,
      })
    }
    updateRow(database, TABLES.kitchenOrderItems, itemId, {
      status: "started",
      startedAt: now,
      updatedAt: now,
    })
  })
})

function convertQuantity(quantity: number, from: string, to: string): number {
  if (from === to) return quantity
  const factors: Record<string, number> = {
    g: 1,
    kg: 1000,
    ml: 1,
    l: 1000,
    pcs: 1,
  }
  const groups: Record<string, string> = {
    g: "mass",
    kg: "mass",
    ml: "volume",
    l: "volume",
    pcs: "count",
  }
  if (!factors[from] || !factors[to] || groups[from] !== groups[to]) {
    throw new Error(`Unit recipe ${from} tidak kompatibel dengan stok ${to}.`)
  }
  return (quantity * factors[from]) / factors[to]
}
