import { describe, expect, test } from "bun:test"

import { createRollposDatabase, listRows, TABLES } from "./database"
import {
  loadInventory,
  loadInventoryLots,
  receiveInventory,
  seedInventoryIfEmpty,
} from "./inventory"

async function setup() {
  const database = createRollposDatabase({ inMemory: true })
  await seedInventoryIfEmpty(database)
  const strawberry = loadInventory(database).find(
    (item) => item.name === "Strawberry"
  )!
  return { database, strawberry }
}

describe("inventory offline", () => {
  test("seed idempotent membuat enam master item", async () => {
    const { database } = await setup()
    await seedInventoryIfEmpty(database)
    expect(loadInventory(database)).toHaveLength(6)
  })

  test("receive membuat lot, movement, dan menaikkan saldo", async () => {
    const { database, strawberry } = await setup()
    const lotId = receiveInventory(database, {
      inventoryItemId: strawberry.id,
      quantity: 2,
      unit: "kg",
      receivedDate: "2026-09-01",
      expiryDate: "2026-09-10",
      lotCode: "2026-09-01-001",
      containerCode: "TEST-A.1",
      actorStaffId: "staff-1",
    })

    expect(
      loadInventory(database).find((item) => item.id === strawberry.id)?.balance
    ).toBe(2)
    expect(loadInventoryLots(database, strawberry.id)).toEqual([
      expect.objectContaining({
        id: lotId,
        containerCode: "TEST-A.1",
        remainingQuantity: 2,
      }),
    ])
    expect(listRows(database, TABLES.inventoryStockMovements)).toEqual([
      expect.objectContaining({
        inventoryLotId: lotId,
        lotCode: "2026-09-01-001",
        containerCode: "TEST-A.1",
        movementType: "RECEIVE",
        quantity: 2,
      }),
    ])
  })

  test("input invalid ditolak tanpa menulis lot atau movement", async () => {
    const { database, strawberry } = await setup()
    expect(() =>
      receiveInventory(database, {
        inventoryItemId: strawberry.id,
        quantity: 0,
        unit: "kg",
        receivedDate: "2026-09-01",
        actorStaffId: "staff-1",
      })
    ).toThrow("Quantity harus lebih dari 0")
    expect(() =>
      receiveInventory(database, {
        inventoryItemId: strawberry.id,
        quantity: 2,
        unit: "kg",
        receivedDate: "2026-09-10",
        expiryDate: "2026-09-01",
        actorStaffId: "staff-1",
      })
    ).toThrow("Expiry tidak boleh sebelum")
    expect(listRows(database, TABLES.inventoryLots)).toHaveLength(0)
    expect(listRows(database, TABLES.inventoryStockMovements)).toHaveLength(0)
  })
})
