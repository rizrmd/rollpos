import { describe, expect, test } from "bun:test"

import { seedCatalogIfEmpty } from "./catalog"
import { createRollposDatabase, listRows, TABLES } from "./database"
import { seedInventoryIfEmpty } from "./inventory"
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

  test("START hanya mengubah status item dan tidak menulis stock movement", async () => {
    const database = await fixture()
    const [order] = await loadKitchenOrders(database)
    const item = order?.items[0]
    expect(item).toBeDefined()
    const movementsBefore = listRows(database, TABLES.inventoryStockMovements)

    await startKitchenItem(database, item!.id)

    const [updated] = await loadKitchenOrders(database)
    expect(updated?.items[0]?.status).toBe("started")
    expect(updated?.items[0]?.startedAt).toBeGreaterThan(0)
    expect(listRows(database, TABLES.inventoryStockMovements)).toEqual(
      movementsBefore
    )
  })

  test("START menolak item yang tidak ada", async () => {
    const database = await fixture()
    await expect(startKitchenItem(database, "missing")).rejects.toThrow(
      "tidak ditemukan"
    )
  })
})
