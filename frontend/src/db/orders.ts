import {
  addRow,
  cellNum,
  cellStr,
  listRows,
  transact,
  type Database,
  TABLES,
  updateRow,
} from "./database"
import { enqueuePaidOrder } from "./kitchen"
import { loadOpenDrawerSession } from "./drawers"

export type OrderStatus = "OPEN" | "PAID"
export type PaymentMethod = "CASH" | "QRIS" | "CARD"
export type NonCashPaymentMethod = Exclude<PaymentMethod, "CASH">

export type PosPayment = {
  id: string
  orderId: string
  drawerSessionId?: string
  method: PaymentMethod
  amount: number
  change: number
  actorStaffId: string
  paidAt: number
}

export type OrderItemInput = {
  menuProductId: string
  name: string
  quantity: number
  price: number
  modifiers?: OrderModifierSnapshot[]
}

export type OrderModifierSnapshot = {
  id: string
  name: string
  additionalPrice: number
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
  payment?: PosPayment
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
        modifiersSnapshot: JSON.stringify(item.modifiers),
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
  const payments = listRows(database, TABLES.payments)
  return listRows(database, TABLES.orders)
    .map((order) => {
      const payment = payments.find(
        (row) => cellStr(row, "orderId") === order.id
      )
      return {
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
            modifiers: parseModifierSnapshot(
              cellStr(line, "modifiersSnapshot")
            ),
            quantity: cellNum(line, "quantity"),
            price: cellNum(line, "price"),
            subtotal: cellNum(line, "subtotal"),
          })),
        payment: payment
          ? {
              id: payment.id,
              orderId: order.id,
              drawerSessionId: cellStr(payment, "drawerSessionId") || undefined,
              method: cellStr(payment, "method") as PaymentMethod,
              amount: cellNum(payment, "amount"),
              change: cellNum(payment, "change"),
              actorStaffId: cellStr(payment, "actorStaffId"),
              paidAt: cellNum(payment, "paidAt"),
            }
          : undefined,
      }
    })
    .sort((a, b) => b.createdAt - a.createdAt)
}

export async function payOrderCash(
  database: Database,
  input: {
    orderId: string
    amount: number
    actorStaffId: string
    paidAt?: number
  }
): Promise<PosPayment> {
  await database.ready
  const orderId = input.orderId.trim()
  const actorStaffId = input.actorStaffId.trim()
  const amount = Number(input.amount)
  if (!orderId) throw new Error("Order wajib dipilih.")
  if (!actorStaffId) throw new Error("Actor staff wajib tercatat.")
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Uang diterima tidak valid.")
  }

  const paidAt = input.paidAt ?? Date.now()
  const drawerSession = await loadOpenDrawerSession(database, actorStaffId)
  if (!drawerSession) {
    throw new Error("Buka laci sebelum menerima pembayaran tunai.")
  }
  let paymentId = ""
  let change = 0

  transact(database, () => {
    const currentDrawer = database.store.getRow(
      TABLES.drawerSessions,
      drawerSession.id
    )
    if (
      !database.store.hasRow(TABLES.drawerSessions, drawerSession.id) ||
      cellStr(currentDrawer, "status") !== "OPEN"
    ) {
      throw new Error("Sesi laci sudah ditutup. Buka sesi baru.")
    }
    const order = database.store.getRow(TABLES.orders, orderId)
    if (!database.store.hasRow(TABLES.orders, orderId)) {
      throw new Error("Order tidak ditemukan.")
    }
    if (cellStr(order, "status") !== "OPEN") {
      throw new Error("Order ini sudah dibayar.")
    }
    if (
      listRows(database, TABLES.payments).some(
        (row) => cellStr(row, "orderId") === orderId
      )
    ) {
      throw new Error("Order ini sudah memiliki pembayaran.")
    }
    const total = cellNum(order, "total")
    if (amount < total) throw new Error("Uang diterima masih kurang.")
    change = amount - total
    paymentId = addRow(database, TABLES.payments, {
      orderId,
      drawerSessionId: drawerSession.id,
      method: "CASH",
      amount,
      change,
      actorStaffId,
      paidAt,
      createdAt: paidAt,
    })
    updateRow(database, TABLES.orders, orderId, {
      status: "PAID",
      updatedAt: paidAt,
    })
    enqueuePaidOrder(database, orderId, paidAt)
  })

  return {
    id: paymentId,
    orderId,
    drawerSessionId: drawerSession.id,
    method: "CASH",
    amount,
    change,
    actorStaffId,
    paidAt,
  }
}

export async function payOrderNonCash(
  database: Database,
  input: {
    orderId: string
    method: NonCashPaymentMethod
    actorStaffId: string
    paidAt?: number
  }
): Promise<PosPayment> {
  await database.ready
  const orderId = input.orderId.trim()
  const actorStaffId = input.actorStaffId.trim()
  if (!orderId) throw new Error("Order wajib dipilih.")
  if (!actorStaffId) throw new Error("Actor staff wajib tercatat.")
  if (input.method !== "QRIS" && input.method !== "CARD") {
    throw new Error("Metode pembayaran non-tunai tidak valid.")
  }

  const paidAt = input.paidAt ?? Date.now()
  let paymentId = ""
  let amount = 0

  transact(database, () => {
    const order = database.store.getRow(TABLES.orders, orderId)
    if (!database.store.hasRow(TABLES.orders, orderId)) {
      throw new Error("Order tidak ditemukan.")
    }
    if (cellStr(order, "status") !== "OPEN") {
      throw new Error("Order ini sudah dibayar.")
    }
    if (
      listRows(database, TABLES.payments).some(
        (row) => cellStr(row, "orderId") === orderId
      )
    ) {
      throw new Error("Order ini sudah memiliki pembayaran.")
    }

    amount = cellNum(order, "total")
    paymentId = addRow(database, TABLES.payments, {
      orderId,
      method: input.method,
      amount,
      change: 0,
      actorStaffId,
      paidAt,
      createdAt: paidAt,
    })
    updateRow(database, TABLES.orders, orderId, {
      status: "PAID",
      updatedAt: paidAt,
    })
    enqueuePaidOrder(database, orderId, paidAt)
  })

  return {
    id: paymentId,
    orderId,
    method: input.method,
    amount,
    change: 0,
    actorStaffId,
    paidAt,
  }
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
  const modifiers = (item.modifiers ?? []).map((modifier) => {
    const id = modifier.id.trim()
    const modifierName = modifier.name.trim()
    const additionalPrice = Number(modifier.additionalPrice)
    if (
      !id ||
      !modifierName ||
      !Number.isFinite(additionalPrice) ||
      additionalPrice < 0
    ) {
      throw new Error("Snapshot modifier tidak valid.")
    }
    return { id, name: modifierName, additionalPrice }
  })
  return { menuProductId, name, quantity, price, modifiers }
}

function parseModifierSnapshot(value: string): OrderModifierSnapshot[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (modifier): modifier is OrderModifierSnapshot =>
        typeof modifier === "object" &&
        modifier !== null &&
        typeof modifier.id === "string" &&
        typeof modifier.name === "string" &&
        typeof modifier.additionalPrice === "number"
    )
  } catch {
    return []
  }
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
