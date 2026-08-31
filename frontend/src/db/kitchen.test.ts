import { describe, expect, test } from "bun:test"

import { seedCatalogIfEmpty } from "./catalog"
import { createRollposDatabase, listRows, TABLES } from "./database"
import {
  loadInventory,
  receiveInventory,
  seedInventoryIfEmpty,
} from "./inventory"
import {
  loadKitchenOrders,
  seedKitchenDemoIfEmpty,
  startKitchenItem,
} from "./kitchen"

async function fixture() {
  const database = createRollposDatabase({ inMemory: true })
  await seedCatalogIfEmpty(database)
  await seedInventoryIfEmpty(database)
  await seedKitchenDemoIfEmpty(database)
  return database
}

function stockAllIngredients(database: Awaited<ReturnType<typeof fixture>>) {
  for (const item of loadInventory(database)) {
    receiveInventory(database, {
      inventoryItemId: item.id,
      quantity: item.baseUnit === "kg" ? 2 : 2_000,
      unit: item.baseUnit,
      receivedDate: "2026-08-31",
      actorStaffId: "staff-1",
    })
  }
}

describe("Kitchen View lokal", () => {
  test("seed idempoten menyediakan order, menu, dan Recipe/SOP aktif", async () => {
    const database = await fixture()
    await seedKitchenDemoIfEmpty(database)

    const orders = await loadKitchenOrders(database)
    expect(orders).toHaveLength(2)
    expect(listRows(database, TABLES.kitchenOrders)).toHaveLength(2)
    expect(orders[0]?.items[0]).toMatchObject({
      menuName: "Jus Strawberry",
      quantity: 2,
      status: "queued",
    })
    expect(orders[0]?.items[0]?.recipe).toMatchObject({
      version: 1,
      isActive: true,
    })
    expect(orders[0]?.items[0]?.recipe?.ingredients).toHaveLength(4)
  })

  test("START mengonsumsi recipe dikali quantity dan menyimpan referensi order/menu", async () => {
    const database = await fixture()
    stockAllIngredients(database)
    const [order] = await loadKitchenOrders(database)
    const item = order?.items[0]
    expect(item).toBeDefined()
    const before = new Map(
      loadInventory(database).map((item) => [item.name, item.balance])
    )

    await startKitchenItem(database, item!.id)

    const [updated] = await loadKitchenOrders(database)
    expect(updated?.items[0]?.status).toBe("started")
    expect(updated?.items[0]?.startedAt).toBeGreaterThan(0)
    expect(
      loadInventory(database).find((item) => item.name === "Strawberry")
        ?.balance
    ).toBe((before.get("Strawberry") ?? 0) - 0.4)
    expect(
      loadInventory(database).find((item) => item.name === "Gula Cair")?.balance
    ).toBe((before.get("Gula Cair") ?? 0) - 40)
    const consumption = listRows(
      database,
      TABLES.inventoryStockMovements
    ).filter((movement) => movement.movementType === "CONSUMPTION")
    expect(consumption).toHaveLength(4)
    expect(consumption[0]).toMatchObject({
      orderId: order!.id,
      menuProductId: item!.menuProductId,
      kitchenOrderItemId: item!.id,
      referenceType: "KITCHEN_ORDER_MENU",
    })

    await startKitchenItem(database, item!.id)
    expect(
      listRows(database, TABLES.inventoryStockMovements).filter(
        (movement) => movement.movementType === "CONSUMPTION"
      )
    ).toHaveLength(4)
  })

  test("START ditolak secara atomik ketika satu ingredient tidak cukup", async () => {
    const database = await fixture()
    const [order] = await loadKitchenOrders(database)
    const item = order!.items[0]!
    const before = listRows(database, TABLES.inventoryStockMovements)

    await expect(startKitchenItem(database, item.id)).rejects.toThrow(
      "tidak cukup"
    )

    expect(listRows(database, TABLES.inventoryStockMovements)).toEqual(before)
    expect((await loadKitchenOrders(database))[0]?.items[0]?.status).toBe(
      "queued"
    )
  })

  test("START membagi konsumsi ke lot berikutnya dan mengurangi saldo tiap lot", async () => {
    const database = await fixture()
    stockAllIngredients(database)
    const strawberry = loadInventory(database).find(
      (item) => item.name === "Strawberry"
    )!
    const firstLotId = receiveInventory(database, {
      inventoryItemId: strawberry.id,
      quantity: 0.1,
      unit: "kg",
      receivedDate: "2026-08-01",
      lotCode: "LOT-A",
      containerCode: "A.1",
      actorStaffId: "staff-1",
    })
    const secondLotId = receiveInventory(database, {
      inventoryItemId: strawberry.id,
      quantity: 0.3,
      unit: "kg",
      receivedDate: "2026-08-02",
      lotCode: "LOT-B",
      containerCode: "A.2",
      actorStaffId: "staff-1",
    })
    const [order] = await loadKitchenOrders(database)
    const item = order!.items[0]!

    await startKitchenItem(database, item.id)

    const strawberryConsumption = listRows(
      database,
      TABLES.inventoryStockMovements
    ).filter(
      (movement) =>
        movement.movementType === "CONSUMPTION" &&
        movement.inventoryItemId === strawberry.id
    )
    expect(strawberryConsumption).toEqual([
      expect.objectContaining({
        inventoryLotId: firstLotId,
        lotCode: "LOT-A",
        containerCode: "A.1",
        quantity: -0.1,
      }),
      expect.objectContaining({
        inventoryLotId: secondLotId,
        lotCode: "LOT-B",
        containerCode: "A.2",
        quantity: -0.3,
      }),
    ])
    const lots = new Map(
      listRows(database, TABLES.inventoryLots).map((lot) => [lot.id, lot])
    )
    expect(lots.get(firstLotId)?.remainingQuantity).toBe(0)
    expect(lots.get(secondLotId)?.remainingQuantity).toBe(0)

    await startKitchenItem(database, item.id)
    expect(
      listRows(database, TABLES.inventoryStockMovements).filter(
        (movement) => movement.movementType === "CONSUMPTION"
      )
    ).toHaveLength(5)
  })

  test("START menolak item yang tidak ada", async () => {
    const database = await fixture()
    await expect(startKitchenItem(database, "missing")).rejects.toThrow(
      "tidak ditemukan"
    )
  })
})
