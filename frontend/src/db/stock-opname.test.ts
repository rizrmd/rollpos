import { describe, expect, spyOn, test } from "bun:test"
import { createRollposDatabase, listRows, TABLES } from "./database"
import {
  loadInventory,
  receiveInventory,
  recordInventoryWaste,
  seedInventoryIfEmpty,
} from "./inventory"
import { recordStockOpname } from "./stock-opname"

async function setup() {
  const database = createRollposDatabase({ inMemory: true })
  await seedInventoryIfEmpty(database)
  const item = loadInventory(database)[0]!
  const lotId = receiveInventory(database, {
    inventoryItemId: item.id,
    quantity: 10,
    unit: item.baseUnit,
    receivedDate: "2026-09-05",
    lotCode: "LOT-0509",
    containerCode: "A1",
    actorStaffId: "receiver",
  })
  return { database, item, lotId }
}

describe("stock opname", () => {
  for (const physicalQuantity of [12.5, 7.25, 0, 10]) {
    test(`saldo fisik ${physicalQuantity}: ledger, lot dan audit konsisten`, async () => {
      const { database, item, lotId } = await setup()
      const before = database.store.getRow(TABLES.inventoryLots, lotId)
      const receive = listRows(database, TABLES.inventoryStockMovements)[0]
      const start = Date.now()
      let observations = 0
      database.store.addTablesListener(() => {
        observations++
        expect(
          database.store.getCell(
            TABLES.inventoryLots,
            lotId,
            "remainingQuantity"
          )
        ).toBe(physicalQuantity)
        expect(
          loadInventory(database).find((row) => row.id === item.id)?.balance
        ).toBe(physicalQuantity)
      })
      const id = recordStockOpname(database, {
        inventoryLotId: lotId,
        systemQuantity: 10,
        physicalQuantity,
        actorStaffId: "counter",
      })
      const movement = database.store.getRow(TABLES.inventoryStockMovements, id)
      expect(movement).toMatchObject({
        movementType: "ADJUSTMENT",
        inventoryLotId: lotId,
        inventoryItemId: item.id,
        quantity: physicalQuantity - 10,
        systemQuantity: 10,
        physicalQuantity,
        actorStaffId: "counter",
        lotCode: "LOT-0509",
        containerCode: "A1",
        unit: item.baseUnit,
        referenceType: "STOCK_OPNAME",
      })
      expect(Number(movement.createdAt)).toBeGreaterThanOrEqual(start)
      expect(database.store.getRow(TABLES.inventoryLots, lotId)).toEqual({
        ...before,
        remainingQuantity: physicalQuantity,
        updatedAt: movement.createdAt,
      })
      expect(listRows(database, TABLES.inventoryStockMovements)[0]).toEqual(
        receive
      )
      expect(observations).toBe(1)
    })
  }

  test("input invalid dan saldo usang ditolak tanpa perubahan", async () => {
    const { database, lotId } = await setup()
    const valid = {
      inventoryLotId: lotId,
      systemQuantity: 10,
      physicalQuantity: 8,
      actorStaffId: "counter",
    }
    for (const input of [
      { ...valid, inventoryLotId: "missing" },
      { ...valid, actorStaffId: " " },
      ...[-1, NaN, Infinity, -Infinity].map((physicalQuantity) => ({
        ...valid,
        physicalQuantity,
      })),
      { ...valid, systemQuantity: 9 },
      { ...valid, systemQuantity: NaN },
    ]) {
      const before = database.store.getTables()
      expect(() => recordStockOpname(database, input)).toThrow()
      expect(database.store.getTables()).toEqual(before)
    }
  })

  test("kegagalan update lot me-rollback movement dan saldo", async () => {
    const { database, lotId } = await setup()
    const before = database.store.getTables()
    const original = database.store.setPartialRow
    const failure = spyOn(database.store, "setPartialRow").mockImplementation(
      (...args) => {
        original(...args)
        throw new Error("Simulasi gagal tulis")
      }
    )
    try {
      expect(() =>
        recordStockOpname(database, {
          inventoryLotId: lotId,
          systemQuantity: 10,
          physicalQuantity: 3,
          actorStaffId: "counter",
        })
      ).toThrow("Simulasi gagal tulis")
      expect(database.store.getTables()).toEqual(before)
    } finally {
      failure.mockRestore()
    }
    recordStockOpname(database, {
      inventoryLotId: lotId,
      systemQuantity: 10,
      physicalQuantity: 3,
      actorStaffId: "counter",
    })
    expect(
      database.store.getCell(TABLES.inventoryLots, lotId, "remainingQuantity")
    ).toBe(3)
  })

  test("waste menolak opname usang, lot kosong dapat ditambah kembali", async () => {
    const { database, lotId, item } = await setup()
    recordInventoryWaste(database, {
      inventoryLotId: lotId,
      quantity: 10,
      reason: "Damaged",
      actorStaffId: "staff",
    })
    const before = database.store.getTables()
    const movements = listRows(database, TABLES.inventoryStockMovements)
    expect(() =>
      recordStockOpname(database, {
        inventoryLotId: lotId,
        systemQuantity: 10,
        physicalQuantity: 2,
        actorStaffId: "counter",
      })
    ).toThrow("Saldo sistem berubah")
    expect(database.store.getTables()).toEqual(before)
    recordStockOpname(database, {
      inventoryLotId: lotId,
      systemQuantity: 0,
      physicalQuantity: 2,
      actorStaffId: "counter",
    })
    expect(
      loadInventory(database).find((row) => row.id === item.id)?.balance
    ).toBe(2)
    expect(
      listRows(database, TABLES.inventoryStockMovements).filter(
        (row) => row.movementType !== "ADJUSTMENT"
      )
    ).toEqual(movements)
  })
})
