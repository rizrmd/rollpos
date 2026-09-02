import {
  addRow,
  cellNum,
  cellStr,
  listRows,
  transact,
  type Database,
  TABLES,
} from "./database"

export type OrderStatus = "OPEN"

export type OrderItemInput = {
  menuProductId: string
  name: string
  quantity: number
  price: number
}

export type PosOrderItem = OrderItemInput & {
  id: string
  subtotal: number
}

export type PosOrder = {
  id: string
  orderNumber: string
  status: OrderStatus
  subtotal: number
  total: number
  createdAt: number
  items: PosOrderItem[]
}

export async function createOpenOrder(
  database: Database,
  items: readonly OrderItemInput[]
): Promise<PosOrder> {
  await database.ready
  const normalized = items.map(normalizeItem)
  if (normalized.length === 0) throw new Error("Cart masih kosong.")

  const now = Date.now()
  const subtotal = normalized.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  )
  const orderNumber = makeOrderNumber(database, now)
  let orderId = ""
  const savedItems: PosOrderItem[] = []

  transact(database, () => {
    orderId = addRow(database, TABLES.orders, {
      orderNumber,
      status: "OPEN",
      subtotal,
      total: subtotal,
      createdAt: now,
      updatedAt: now,
    })
    normalized.forEach((item, sortOrder) => {
      const lineSubtotal = item.price * item.quantity
      const id = addRow(database, TABLES.orderItems, {
        orderId,
        menuProductId: item.menuProductId,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        subtotal: lineSubtotal,
        sortOrder,
        createdAt: now,
      })
      savedItems.push({ id, ...item, subtotal: lineSubtotal })
    })
  })

  return {
    id: orderId,
    orderNumber,
    status: "OPEN",
    subtotal,
    total: subtotal,
    createdAt: now,
    items: savedItems,
  }
}

export async function loadOrders(database: Database): Promise<PosOrder[]> {
  await database.ready
  const lines = listRows(database, TABLES.orderItems)
  return listRows(database, TABLES.orders)
    .map((order) => ({
      id: order.id,
      orderNumber: cellStr(order, "orderNumber"),
      status: cellStr(order, "status") as OrderStatus,
      subtotal: cellNum(order, "subtotal"),
      total: cellNum(order, "total"),
      createdAt: cellNum(order, "createdAt"),
      items: lines
        .filter((line) => cellStr(line, "orderId") === order.id)
        .sort((a, b) => cellNum(a, "sortOrder") - cellNum(b, "sortOrder"))
        .map((line) => ({
          id: line.id,
          menuProductId: cellStr(line, "menuProductId"),
          name: cellStr(line, "name"),
          quantity: cellNum(line, "quantity"),
          price: cellNum(line, "price"),
          subtotal: cellNum(line, "subtotal"),
        })),
    }))
    .sort((a, b) => b.createdAt - a.createdAt)
}

function normalizeItem(item: OrderItemInput): OrderItemInput {
  const menuProductId = item.menuProductId.trim()
  const name = item.name.trim()
  const quantity = Number(item.quantity)
  const price = Number(item.price)
  if (!menuProductId || !name) throw new Error("Item cart tidak lengkap.")
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("Quantity item harus lebih dari 0.")
  }
  if (!Number.isFinite(price) || price < 0)
    throw new Error("Harga item tidak valid.")
  return { menuProductId, name, quantity, price }
}

function makeOrderNumber(database: Database, now: number): string {
  const base = `ORD-${now}`
  const existing = new Set(
    listRows(database, TABLES.orders).map((row) => cellStr(row, "orderNumber"))
  )
  let number = base
  let suffix = 1
  while (existing.has(number)) number = `${base}-${suffix++}`
  return number
}
