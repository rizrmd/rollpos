import { describe, expect, test } from "bun:test"
import { createRollposDatabase, TABLES } from "./database"
import {
  cancelOrder,
  createOpenOrder,
  loadOrders,
  payOrderCash,
  payOrderNonCash,
} from "./orders"
import { openDrawerSession } from "./drawers"
import {
  enqueuePaidOrder,
  loadKitchenOrders,
  syncPaidOrdersToKitchen,
} from "./kitchen"
import { loadOrderHistory } from "./order-history"

const latte = {
  menuProductId: "latte",
  name: "Cafe Latte",
  quantity: 2,
  price: 28000,
  modifiers: [{ id: "shot", name: "Extra Shot", additionalPrice: 6000 }],
}
const setup = async () => {
  const database = createRollposDatabase({ inMemory: true })
  const order = await createOpenOrder(database, [latte])
  return { database, order, input: { orderId: order.id, actorStaffId: "rani" } }
}

describe("Cancel Order OPEN", () => {
  test("menyimpan CANCELLED dan audit di Riwayat; hanya row order berubah", async () => {
    const { database, order, input } = await setup()
    database.store.setRow(TABLES.staffMembers, "rani", { name: "Rani" })
    database.store.setRow(TABLES.inventoryLots, "milk", {
      remainingQuantity: 1200,
    })
    database.store.setRow(TABLES.inventoryStockMovements, "receive", {
      movementType: "RECEIVE",
      quantity: 1200,
    })
    const before = database.store.getTables()
    await cancelOrder(database, input)
    const after = database.store.getTables()
    expect({ ...after, [TABLES.orders]: before[TABLES.orders] }).toEqual(before)
    expect(after[TABLES.orders][order.id]).toEqual({
      ...before[TABLES.orders][order.id],
      status: "CANCELLED",
      cancelledAt: expect.any(Number),
      cancelledByStaffId: "rani",
      updatedAt: expect.any(Number),
    })
    const [cancelled] = await loadOrders(database)
    expect(cancelled).toMatchObject({
      ...order,
      status: "CANCELLED",
      cancelledByStaffId: "rani",
    })
    expect((await loadOrderHistory(database))[0]).toMatchObject({
      id: order.id,
      status: "CANCELLED",
      staffName: "Rani",
      items: order.items,
    })
    const reopened = createRollposDatabase({ inMemory: true })
    await reopened.ready
    reopened.store.setTables(after)
    expect((await loadOrderHistory(reopened))[0]).toEqual(
      (await loadOrderHistory(database))[0]
    )
  })

  test("CANCELLED menolak CASH, QRIS, CARD dan Kitchen tanpa efek samping", async () => {
    const { database, order, input } = await setup()
    await openDrawerSession(database, { actorStaffId: "rani" })
    await cancelOrder(database, input)
    const before = database.store.getJson()
    await expect(
      payOrderCash(database, { ...input, amount: 60000 })
    ).rejects.toThrow("dibatalkan")
    for (const method of ["QRIS", "CARD"] as const) {
      await expect(
        payOrderNonCash(database, { ...input, method })
      ).rejects.toThrow("dibatalkan")
    }
    expect(() => enqueuePaidOrder(database, order.id, Date.now())).toThrow(
      "Hanya order PAID"
    )
    await syncPaidOrdersToKitchen(database)
    expect(await loadKitchenOrders(database)).toEqual([])
    expect(database.store.getJson()).toBe(before)
  })

  test("PAID, pembatalan berulang, input kosong dan order hilang tidak mengubah data", async () => {
    for (const paid of [true, false]) {
      const { database, input } = await setup()
      if (paid) await payOrderNonCash(database, { ...input, method: "CARD" })
      else await cancelOrder(database, input)
      const before = database.store.getJson()
      await expect(cancelOrder(database, input)).rejects.toThrow(
        "Hanya order OPEN"
      )
      expect(database.store.getJson()).toBe(before)
    }
    const { database, input } = await setup()
    const before = database.store.getJson()
    for (const invalid of [
      { ...input, orderId: "" },
      { ...input, orderId: "missing" },
      { ...input, actorStaffId: " " },
    ]) {
      await expect(cancelOrder(database, invalid)).rejects.toThrow()
      expect(database.store.getJson()).toBe(before)
    }
  })

  test("pembayaran bersamaan dengan pembatalan hanya menghasilkan satu transisi", async () => {
    for (const method of ["CASH", "QRIS", "CARD"] as const) {
      const { database, input } = await setup()
      await openDrawerSession(database, { actorStaffId: "rani" })
      const results = await Promise.allSettled([
        method === "CASH"
          ? payOrderCash(database, { ...input, amount: 60000 })
          : payOrderNonCash(database, { ...input, method }),
        cancelOrder(database, input),
      ])
      expect(
        results.filter((result) => result.status === "fulfilled")
      ).toHaveLength(1)
      const [order] = await loadOrders(database)
      expect(["PAID", "CANCELLED"]).toContain(order.status)
      expect(Boolean(order.payment)).toBe(order.status === "PAID")
      expect(await loadKitchenOrders(database)).toHaveLength(
        order.status === "PAID" ? 1 : 0
      )
    }
  })
})
