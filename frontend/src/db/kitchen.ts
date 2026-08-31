import {
  addRow,
  cellNum,
  cellStr,
  listRows,
  transact,
  updateRow,
  type Database,
  TABLES,
} from "./database"
import { loadRecipes, type Recipe } from "./recipes"

export type KitchenItemStatus = "queued" | "started"

export type KitchenOrderItem = {
  id: string
  menuProductId: string
  menuName: string
  quantity: number
  status: KitchenItemStatus
  startedAt: number
  recipe: Recipe | null
}

export type KitchenOrder = {
  id: string
  orderNumber: string
  customerName: string
  status: string
  placedAt: number
  items: KitchenOrderItem[]
}

const DEMO_ORDERS = [
  {
    orderNumber: "K-021",
    customerName: "Meja 4",
    minutesAgo: 8,
    items: [{ sku: "RNB-JUS-STRAWBERRY", quantity: 2 }],
  },
  {
    orderNumber: "K-022",
    customerName: "Take away · Nanda",
    minutesAgo: 3,
    items: [{ sku: "RNB-JUS-STRAWBERRY", quantity: 1 }],
  },
] as const

const DEMO_RECIPES: Record<
  string,
  Array<{ sku: string; quantity: number; unit: string }>
> = {
  "RNB-JUS-STRAWBERRY": [
    { sku: "INV-STRAWBERRY", quantity: 200, unit: "g" },
    { sku: "INV-GULA-CAIR", quantity: 20, unit: "ml" },
    { sku: "INV-AIR", quantity: 180, unit: "ml" },
    { sku: "INV-ES-BATU", quantity: 20, unit: "g" },
  ],
}

export async function seedKitchenDemoIfEmpty(
  database: Database
): Promise<void> {
  await database.ready
  if (listRows(database, TABLES.kitchenOrders).length > 0) return

  const products = listRows(database, TABLES.products)
  const inventory = listRows(database, TABLES.inventoryItems)
  const recipes = listRows(database, TABLES.recipes)
  const productsBySku = new Map(
    products.map((row) => [cellStr(row, "sku"), row])
  )
  const inventoryBySku = new Map(
    inventory.map((row) => [cellStr(row, "sku"), row])
  )
  const now = Date.now()

  transact(database, () => {
    if (!productsBySku.has("RNB-JUS-STRAWBERRY")) {
      const id = addRow(database, TABLES.products, {
        name: "Jus Strawberry",
        sku: "RNB-JUS-STRAWBERRY",
        price: 25_000,
        stock: 0,
        kind: "menu",
        category: "minuman",
        unit: "porsi",
        note: "Menu demo Kitchen View",
        isActive: true,
        lowStock: 0,
        createdAt: now,
        updatedAt: now,
      })
      productsBySku.set("RNB-JUS-STRAWBERRY", {
        id,
        ...database.store.getRow(TABLES.products, id),
      })
    }
    for (const [menuSku, lines] of Object.entries(DEMO_RECIPES)) {
      const menu = productsBySku.get(menuSku)
      if (!menu) continue
      const existing = recipes.find(
        (row) => cellStr(row, "menuProductId") === menu.id
      )
      if (existing) continue
      const resolved = lines.flatMap((line) => {
        const ingredient = inventoryBySku.get(line.sku)
        return ingredient ? [{ ...line, inventoryItemId: ingredient.id }] : []
      })
      if (resolved.length !== lines.length) continue
      const recipeId = addRow(database, TABLES.recipes, {
        menuProductId: menu.id,
        version: 1,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      resolved.forEach((line, index) => {
        addRow(database, TABLES.recipeIngredients, {
          recipeId,
          inventoryItemId: line.inventoryItemId,
          quantity: line.quantity,
          unit: line.unit,
          sortOrder: index,
          createdAt: now,
          updatedAt: now,
        })
      })
    }

    for (const order of DEMO_ORDERS) {
      const orderId = addRow(database, TABLES.kitchenOrders, {
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        status: "queued",
        placedAt: now - order.minutesAgo * 60_000,
        createdAt: now,
        updatedAt: now,
      })
      order.items.forEach((item, index) => {
        const menu = productsBySku.get(item.sku)
        if (!menu) return
        addRow(database, TABLES.kitchenOrderItems, {
          orderId,
          menuProductId: menu.id,
          quantity: item.quantity,
          status: "queued",
          startedAt: 0,
          sortOrder: index,
          createdAt: now,
          updatedAt: now,
        })
      })
    }
  })
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
      orderNumber: cellStr(order, "orderNumber"),
      customerName: cellStr(order, "customerName"),
      status: cellStr(order, "status"),
      placedAt: cellNum(order, "placedAt"),
      items: itemRows
        .filter((item) => cellStr(item, "orderId") === order.id)
        .sort((a, b) => cellNum(a, "sortOrder") - cellNum(b, "sortOrder"))
        .map((item) => {
          const menuProductId = cellStr(item, "menuProductId")
          return {
            id: item.id,
            menuProductId,
            menuName: productNames.get(menuProductId) ?? "Menu tidak ditemukan",
            quantity: cellNum(item, "quantity"),
            status: cellStr(item, "status") as KitchenItemStatus,
            startedAt: cellNum(item, "startedAt"),
            recipe: activeRecipeByMenu.get(menuProductId) ?? null,
          }
        }),
    }))
    .sort((a, b) => a.placedAt - b.placedAt)
}

export async function startKitchenItem(
  database: Database,
  itemId: string
): Promise<void> {
  await database.ready
  const row = database.store.getRow(TABLES.kitchenOrderItems, itemId)
  if (!database.store.hasRow(TABLES.kitchenOrderItems, itemId)) {
    throw new Error("Item order dapur tidak ditemukan.")
  }
  if (cellStr(row, "status") === "started") return
  const now = Date.now()
  updateRow(database, TABLES.kitchenOrderItems, itemId, {
    status: "started",
    startedAt: now,
    updatedAt: now,
  })
}
