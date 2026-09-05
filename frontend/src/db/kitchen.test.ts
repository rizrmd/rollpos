import {
  afterEach,
  beforeEach,
  describe,
  expect,
  setSystemTime,
  test,
} from "bun:test"

import { seedCatalogIfEmpty } from "./catalog"
import { createRollposDatabase, listRows, TABLES } from "./database"
import { openDrawerSession } from "./drawers"
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
      modifiers: [
        { id: "extra-shot", name: "Extra Shot", additionalPrice: 6_000 },
        { id: "oat-milk", name: "Oat Milk", additionalPrice: 8_000 },
      ],
    },
  ])
  await openDrawerSession(database, { actorStaffId: "staff-kasir" })
  return { database, order, strawberry }
}

describe("integrasi Kasir ke Kitchen", () => {
  beforeEach(() => setSystemTime(new Date("2026-09-05T17:30:00Z")))
  afterEach(() => setSystemTime())

  test("START melewati lot expired dan memakai FEFO termasuk hari expiry serta tanpa expiry", async () => {
    const { database, order, strawberry } = await fixture()
    const receive = (quantity: number, expiryDate?: string) =>
      receiveInventory(database, {
        inventoryItemId: strawberry.id,
        quantity,
        unit: "kg",
        receivedDate: "2026-08-01",
        expiryDate,
        actorStaffId: "staff-1",
      })
    const expired = await receive(1, "2026-09-05")
    const noExpiry = await receive(0.3)
    const later = await receive(0.1, "2026-09-07")
    const today = await receive(0.1, "2026-09-06")
    await payOrderCash(database, {
      orderId: order.id,
      amount: order.total,
      actorStaffId: "staff-kasir",
    })
    const item = (await loadKitchenOrders(database))[0]!.items[0]!
    const expiredBefore = database.store.getRow(TABLES.inventoryLots, expired)

    await startKitchenItem(database, item.id)

    const consumption = listRows(
      database,
      TABLES.inventoryStockMovements
    ).filter((row) => row.movementType === "CONSUMPTION")
    expect(consumption.map((row) => row.inventoryLotId)).toEqual([
      today,
      later,
      noExpiry,
    ])
    expect(consumption.map((row) => row.quantity)).toEqual([
      -0.1,
      -0.1,
      expect.closeTo(-0.2),
    ])
    expect(database.store.getRow(TABLES.inventoryLots, expired)).toEqual(
      expiredBefore
    )
    expect(
      database.store.getCell(TABLES.kitchenOrderItems, item.id, "status")
    ).toBe("started")
  })

  test.each([0, 0.2])(
    "START ditolak atomik ketika stok valid hanya %s kg meskipun lot expired cukup",
    async (validQuantity) => {
      const { database, order, strawberry } = await fixture()
      // Bahan pertama cukup agar kegagalan bahan berikutnya juga menguji alokasi parsial.
      const other = loadInventory(database).find(
        (item) => item.id !== strawberry.id
      )!
      await saveRecipe(
        database,
        {
          menuProductId: order.items[0]!.menuProductId,
          version: 2,
          isActive: true,
          ingredients: [
            { inventoryItemId: other.id, quantity: 1, unit: other.baseUnit },
            { inventoryItemId: strawberry.id, quantity: 200, unit: "g" },
          ],
        },
        listRows(database, TABLES.recipes)[0]!.id
      )
      await receiveInventory(database, {
        inventoryItemId: other.id,
        quantity: 10,
        unit: other.baseUnit,
        receivedDate: "2026-08-01",
        actorStaffId: "staff-1",
      })
      for (const [quantity, expiryDate] of [
        [1, "2026-09-05"],
        [validQuantity, "2026-09-07"],
      ] as const) {
        if (!quantity) continue
        await receiveInventory(database, {
          inventoryItemId: strawberry.id,
          quantity,
          unit: "kg",
          receivedDate: "2026-08-01",
          expiryDate,
          actorStaffId: "staff-1",
        })
      }
      await payOrderCash(database, {
        orderId: order.id,
        amount: order.total,
        actorStaffId: "staff-kasir",
      })
      const item = (await loadKitchenOrders(database))[0]!.items[0]!
      const before = database.store.getJson()

      await expect(startKitchenItem(database, item.id)).rejects.toThrow(
        "Stok Strawberry tidak cukup"
      )

      expect(database.store.getJson()).toBe(before)
    }
  )

  test("hanya order PAID masuk dengan snapshot item, modifier, dan quantity", async () => {
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
            modifiers: [
              {
                id: "extra-shot",
                name: "Extra Shot",
                quantity: 2,
                additionalPrice: 6_000,
              },
              {
                id: "oat-milk",
                name: "Oat Milk",
                quantity: 2,
                additionalPrice: 8_000,
              },
            ],
          }),
        ],
      }),
    ])
    expect(listRows(database, TABLES.inventoryStockMovements)).toHaveLength(0)
  })

  test("Kitchen mempertahankan snapshot modifier saat master berubah", async () => {
    const { database, order } = await fixture()
    await payOrderCash(database, {
      orderId: order.id,
      amount: order.total,
      actorStaffId: "staff-kasir",
    })

    const kitchenItem = listRows(database, TABLES.kitchenOrderItems)[0]!
    expect(JSON.parse(String(kitchenItem.modifiersSnapshot))).toEqual(
      order.items[0]!.modifiers
    )
    expect((await loadKitchenOrders(database))[0]!.items[0]!.modifiers).toEqual(
      [
        {
          id: "extra-shot",
          name: "Extra Shot",
          quantity: 2,
          additionalPrice: 6_000,
        },
        {
          id: "oat-milk",
          name: "Oat Milk",
          quantity: 2,
          additionalPrice: 8_000,
        },
      ]
    )
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
    await receiveInventory(database, {
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
    const later = await receiveInventory(database, {
      inventoryItemId: strawberry.id,
      quantity: 0.3,
      unit: "kg",
      receivedDate: "2026-08-01",
      expiryDate: "2026-09-20",
      actorStaffId: "staff-1",
    })
    const nearest = await receiveInventory(database, {
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
