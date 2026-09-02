import { describe, expect, test } from "bun:test"

import { seedCatalogIfEmpty } from "./catalog"
import { createRollposDatabase, listRows, TABLES } from "./database"
import {
  loadInventory,
  receiveInventory,
  seedInventoryIfEmpty,
} from "./inventory"
import {
  enqueuePaidOrder,
  loadKitchenOrders,
  startKitchenItem,
  syncPaidOrdersToKitchen,
} from "./kitchen"
import { createOpenOrder, payOrderCash } from "./orders"
import { saveRecipe } from "./recipes"

async function fixture() {
  const database = createRollposDatabase({ inMemory: true })
  await seedCatalogIfEmpty(database)
  await seedInventoryIfEmpty(database)
  const menu = listRows(database, TABLES.products).find(
    (row) => row.kind === "menu"
  )!
  const strawberry = loadInventory(database).find(
    (item) => item.name === "Strawberry"
  )!
  await saveRecipe(database, {
    menuProductId: menu.id,
    version: 1,
    isActive: true,
    ingredients: [{ inventoryItemId: strawberry.id, quantity: 200, unit: "g" }],
  })
  const order = await createOpenOrder(database, [
    {
      menuProductId: menu.id,
      name: String(menu.name),
      quantity: 2,
      price: Number(menu.price),
    },
  ])
  return { database, order, strawberry }
}

describe("integrasi Kasir ke Kitchen", () => {
  test("hanya order PAID masuk dengan snapshot item dan quantity", async () => {
    const { database, order } = await fixture()
    await syncPaidOrdersToKitchen(database)
    expect(await loadKitchenOrders(database)).toEqual([])

    await payOrderCash(database, {
      orderId: order.id,
      amount: order.total,
      actorStaffId: "staff-kasir",
      paidAt: 1_788_381_000_000,
    })

    expect(await loadKitchenOrders(database)).toEqual([
      expect.objectContaining({
        sourceOrderId: order.id,
        orderNumber: order.orderNumber,
        placedAt: 1_788_381_000_000,
        items: [
          expect.objectContaining({
            menuName: order.items[0]!.name,
            quantity: 2,
            status: "queued",
          }),
        ],
      }),
    ])
    expect(listRows(database, TABLES.inventoryStockMovements)).toHaveLength(0)
  })

  test("sinkronisasi dan enqueue ulang tidak menduplikasi order", async () => {
    const { database, order } = await fixture()
    await payOrderCash(database, {
      orderId: order.id,
      amount: order.total,
      actorStaffId: "staff-kasir",
    })
    enqueuePaidOrder(database, order.id, Date.now())
    await syncPaidOrdersToKitchen(database)

    expect(listRows(database, TABLES.kitchenOrders)).toHaveLength(1)
    expect(listRows(database, TABLES.kitchenOrderItems)).toHaveLength(1)
  })

  test("order OPEN ditolak bila dipaksa masuk Kitchen", async () => {
    const { database, order } = await fixture()
    expect(() => enqueuePaidOrder(database, order.id, Date.now())).toThrow(
      "Hanya order PAID"
    )
    expect(listRows(database, TABLES.kitchenOrders)).toHaveLength(0)
  })

  test("inventory baru berkurang saat START dan tetap idempoten", async () => {
    const { database, order, strawberry } = await fixture()
    receiveInventory(database, {
      inventoryItemId: strawberry.id,
      quantity: 1,
      unit: "kg",
      receivedDate: "2026-08-31",
      actorStaffId: "staff-1",
    })
    await payOrderCash(database, {
      orderId: order.id,
      amount: order.total,
      actorStaffId: "staff-kasir",
    })
    const item = (await loadKitchenOrders(database))[0]!.items[0]!
    const before = loadInventory(database).find(
      (row) => row.id === strawberry.id
    )!.balance

    await startKitchenItem(database, item.id)
    expect(
      loadInventory(database).find((row) => row.id === strawberry.id)!.balance
    ).toBe(before - 0.4)
    const movement = listRows(database, TABLES.inventoryStockMovements).find(
      (row) => row.movementType === "CONSUMPTION"
    )
    expect(movement).toMatchObject({
      orderId: order.id,
      menuProductId: item.menuProductId,
      kitchenOrderItemId: item.id,
    })

    await startKitchenItem(database, item.id)
    expect(
      listRows(database, TABLES.inventoryStockMovements).filter(
        (row) => row.movementType === "CONSUMPTION"
      )
    ).toHaveLength(1)
  })

  test("START tetap memakai FEFO lintas lot", async () => {
    const { database, order, strawberry } = await fixture()
    const later = receiveInventory(database, {
      inventoryItemId: strawberry.id,
      quantity: 0.3,
      unit: "kg",
      receivedDate: "2026-08-01",
      expiryDate: "2026-09-20",
      actorStaffId: "staff-1",
    })
    const nearest = receiveInventory(database, {
      inventoryItemId: strawberry.id,
      quantity: 0.1,
      unit: "kg",
      receivedDate: "2026-08-02",
      expiryDate: "2026-09-10",
      actorStaffId: "staff-1",
    })
    await payOrderCash(database, {
      orderId: order.id,
      amount: order.total,
      actorStaffId: "staff-kasir",
    })
    const item = (await loadKitchenOrders(database))[0]!.items[0]!

    await startKitchenItem(database, item.id)

    expect(
      listRows(database, TABLES.inventoryStockMovements)
        .filter((row) => row.movementType === "CONSUMPTION")
        .map((row) => [row.inventoryLotId, row.quantity])
    ).toEqual([
      [nearest, -0.1],
      [later, -0.3],
    ])
  })
})
