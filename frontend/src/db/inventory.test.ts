import { describe, expect, test } from "bun:test"

import { createRollposDatabase, listRows, TABLES } from "./database"
import {
  loadInventory,
  loadInventoryLots,
  recordInventoryWaste,
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
    const lotId = await receiveInventory(database, {
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
    await expect(
      receiveInventory(database, {
        inventoryItemId: strawberry.id,
        quantity: 0,
        unit: "kg",
        receivedDate: "2026-09-01",
        actorStaffId: "staff-1",
      })
    ).rejects.toThrow("Quantity harus lebih dari 0")
    await expect(
      receiveInventory(database, {
        inventoryItemId: strawberry.id,
        quantity: 2,
        unit: "kg",
        receivedDate: "2026-09-10",
        expiryDate: "2026-09-01",
        actorStaffId: "staff-1",
      })
    ).rejects.toThrow("Expiry tidak boleh sebelum")
    expect(listRows(database, TABLES.inventoryLots)).toHaveLength(0)
    expect(listRows(database, TABLES.inventoryStockMovements)).toHaveLength(0)
  })

  test("waste mengurangi saldo lot dan membuat movement dengan actor", async () => {
    const { database, strawberry } = await setup()
    const lotId = await receiveInventory(database, {
      inventoryItemId: strawberry.id,
      quantity: 2,
      unit: "kg",
      receivedDate: "2026-09-01",
      lotCode: "LOT-WASTE-01",
      containerCode: "BIN-A1",
      actorStaffId: "receiver-1",
    })

    const movementId = await recordInventoryWaste(database, {
      inventoryLotId: lotId,
      quantity: 0.75,
      reason: "Spillage",
      actorStaffId: "staff-operator",
    })

    expect(
      loadInventoryLots(database, strawberry.id)[0]?.remainingQuantity
    ).toBe(1.25)
    expect(
      loadInventory(database).find((item) => item.id === strawberry.id)?.balance
    ).toBe(1.25)
    expect(
      listRows(database, TABLES.inventoryStockMovements).find(
        (movement) => movement.id === movementId
      )
    ).toMatchObject({
      inventoryLotId: lotId,
      lotCode: "LOT-WASTE-01",
      containerCode: "BIN-A1",
      movementType: "WASTE",
      quantity: -0.75,
      reason: "Spillage",
      actorStaffId: "staff-operator",
    })
  })

  test("waste melebihi saldo lot ditolak tanpa perubahan", async () => {
    const { database, strawberry } = await setup()
    const lotId = await receiveInventory(database, {
      inventoryItemId: strawberry.id,
      quantity: 1,
      unit: "kg",
      receivedDate: "2026-09-01",
      actorStaffId: "receiver-1",
    })
    const movementsBefore = listRows(database, TABLES.inventoryStockMovements)

    await expect(
      recordInventoryWaste(database, {
        inventoryLotId: lotId,
        quantity: 1.001,
        reason: "Damaged",
        actorStaffId: "staff-operator",
      })
    ).rejects.toThrow("tidak boleh melebihi saldo lot")
    expect(
      loadInventoryLots(database, strawberry.id)[0]?.remainingQuantity
    ).toBe(1)
    expect(listRows(database, TABLES.inventoryStockMovements)).toEqual(
      movementsBefore
    )
  })
})
