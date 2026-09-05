import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { IDBDatabase, IDBFactory, IDBObjectStore } from "fake-indexeddb"
import { createStore } from "tinybase"
import { createIndexedDbPersister } from "tinybase/persisters/persister-indexed-db"
import {
  addRow,
  createRollposDatabase,
  persistentOperation,
  TABLES,
} from "./database"
import {
  cancelOrder,
  createOpenOrder,
  payOrderCash,
  payOrderNonCash,
} from "./orders"
import { closeDrawerSession, openDrawerSession } from "./drawers"
import {
  loadInventory,
  receiveInventory,
  recordInventoryWaste,
  seedInventoryIfEmpty,
} from "./inventory"
import { recordStockOpname } from "./stock-opname"
import { startKitchenItem } from "./kitchen"
import { saveRecipe } from "./recipes"

const item = [
  { menuProductId: "latte", name: "Cafe Latte", quantity: 1, price: 25000 },
]
const originalIndexedDB = globalThis.indexedDB
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})
afterEach(() => {
  globalThis.indexedDB = originalIndexedDB
})

async function fixture() {
  const dbName = crypto.randomUUID()
  const database = createRollposDatabase({ dbName })
  await database.ready
  return { database, dbName }
}
async function reload(dbName: string) {
  const database = createRollposDatabase({ dbName })
  await database.ready
  return database.store.getContent()
}

/** Abort after a successful request: this is not a synchronous validation error. */
function abortWrite() {
  const original = IDBObjectStore.prototype.put
  return spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
    ...args
  ) {
    const request = original.apply(this, args)
    request.addEventListener("success", () => {
      try {
        this.transaction.abort()
      } catch {
        /* already aborted */
      }
    })
    return request
  })
}

describe("persistence wajib IndexedDB", () => {
  test("IndexedDB tidak tersedia atau gagal open: tidak ada fallback memory", async () => {
    globalThis.indexedDB = undefined as unknown as IDBFactory
    const unavailable = createRollposDatabase()
    await expect(unavailable.ready).rejects.toThrow("IndexedDB tidak tersedia")
    await expect(createOpenOrder(unavailable, item)).rejects.toThrow()
    expect(unavailable.store.getTables()).toEqual({})
    globalThis.indexedDB = new IDBFactory()
    const failure = spyOn(indexedDB, "open").mockImplementation(() => {
      throw new DOMException("Storage ditolak", "SecurityError")
    })
    try {
      const denied = createRollposDatabase()
      await expect(createOpenOrder(denied, item)).rejects.toThrow(
        "Storage ditolak"
      )
      expect(denied.store.getTables()).toEqual({})
    } finally {
      failure.mockRestore()
    }
  })

  test("gagal load tidak menimpa data lama dengan database kosong", async () => {
    const { database, dbName } = await fixture()
    await createOpenOrder(database, item)
    const before = database.store.getContent()
    const original = IDBDatabase.prototype.transaction
    const failure = spyOn(
      IDBDatabase.prototype,
      "transaction"
    ).mockImplementation(function (...args) {
      const tx = original.apply(this, args)
      if (args[1] === "readonly") queueMicrotask(() => tx.abort())
      return tx
    })
    try {
      const failed = createRollposDatabase({ dbName })
      await expect(failed.ready).rejects.toThrow()
      await expect(createOpenOrder(failed, item)).rejects.toThrow()
      expect(failed.store.getTables()).toEqual({})
    } finally {
      failure.mockRestore()
    }
    expect(await reload(dbName)).toEqual(before)
  })

  test("data format persister TinyBase lama tetap terbaca dan dapat disimpan", async () => {
    const dbName = crypto.randomUUID()
    const store = createStore().setRow("orders", "legacy", {
      status: "OPEN",
      orderNumber: "ORD-OLD",
    })
    const persister = createIndexedDbPersister(store, dbName)
    await persister.save()
    await persister.destroy()
    const database = createRollposDatabase({ dbName })
    await database.ready
    expect(database.store.getCell("orders", "legacy", "orderNumber")).toBe(
      "ORD-OLD"
    )
    await createOpenOrder(database, item)
    expect((await reload(dbName))[0].orders.legacy.orderNumber).toBe("ORD-OLD")
  })

  test("sebelum oncomplete: promise belum sukses dan tampilan belum berubah", async () => {
    const { database, dbName } = await fixture()
    let confirm!: () => void
    let signal!: () => void
    const reached = new Promise<void>((resolve) => {
      signal = resolve
    })
    const original = IDBDatabase.prototype.transaction
    const hold = spyOn(IDBDatabase.prototype, "transaction").mockImplementation(
      function (...args) {
        const tx = original.apply(this, args)
        if (args[1] === "readwrite") {
          Object.defineProperty(tx, "oncomplete", {
            set(handler) {
              tx.addEventListener("complete", (event) => {
                confirm = () => handler.call(tx, event)
                signal()
              })
            },
          })
        }
        return tx
      }
    )
    let settled = false
    const pending = createOpenOrder(database, item).then((order) => {
      settled = true
      return order
    })
    try {
      await reached
      expect(settled).toBe(false)
      expect(database.store.getTables()).toEqual({})
      confirm()
      const saved = await pending
      expect((await reload(dbName))[0].orders[saved.id].status).toBe("OPEN")
    } finally {
      hold.mockRestore()
    }
  })

  test("quota error setelah sebagian put: seluruh write di-abort, retry tidak membawa data gagal", async () => {
    const { database, dbName } = await fixture()
    const original = IDBObjectStore.prototype.put
    let calls = 0
    const failure = spyOn(IDBObjectStore.prototype, "put").mockImplementation(
      function (...args) {
        if (++calls === 2)
          throw new DOMException("Quota habis", "QuotaExceededError")
        return original.apply(this, args)
      }
    )
    try {
      await expect(createOpenOrder(database, item)).rejects.toThrow(
        "Transaksi tidak tersimpan"
      )
      expect(database.store.getTables()).toEqual({})
    } finally {
      failure.mockRestore()
    }
    expect((await reload(dbName))[0]).toEqual({})
    await createOpenOrder(database, item)
    expect(Object.keys((await reload(dbName))[0].orders)).toHaveLength(1)
  })

  for (const action of [
    "order",
    "cash",
    "qris",
    "card",
    "cancel",
    "drawer-open",
    "drawer-close",
    "receive",
    "waste",
    "opname",
    "kitchen",
  ] as const) {
    test(`${action}: abort sesudah request sukses tidak menyisakan data parsial`, async () => {
      const { database, dbName } = await fixture()
      const order = await createOpenOrder(database, item)
      const drawer = await openDrawerSession(database, {
        actorStaffId: "kasir",
      })
      await seedInventoryIfEmpty(database)
      const inventory = loadInventory(database)[0]
      const receive = {
        inventoryItemId: inventory.id,
        quantity: 10,
        unit: inventory.baseUnit,
        receivedDate: "2026-09-05",
        actorStaffId: "kasir",
      }
      const lotId = await receiveInventory(database, receive)
      await persistentOperation(async (draft) => {
        draft.store.setRow(TABLES.products, "latte", {
          name: "Cafe Latte",
          kind: "menu",
          price: 25000,
        })
      })(database)
      await saveRecipe(database, {
        menuProductId: "latte",
        version: 1,
        isActive: true,
        ingredients: [
          {
            inventoryItemId: inventory.id,
            quantity: 1,
            unit: inventory.baseUnit,
          },
        ],
      })
      if (action === "kitchen")
        await payOrderNonCash(database, {
          orderId: order.id,
          method: "QRIS",
          actorStaffId: "kasir",
        })
      const before = database.store.getContent()
      let notifications = 0
      database.store.addTablesListener(() => {
        notifications++
      })
      const failure = abortWrite()
      try {
        const run = () => {
          switch (action) {
            case "order":
              return createOpenOrder(database, item)
            case "cash":
              return payOrderCash(database, {
                orderId: order.id,
                amount: 25000,
                actorStaffId: "kasir",
              })
            case "qris":
            case "card":
              return payOrderNonCash(database, {
                orderId: order.id,
                method: action === "qris" ? "QRIS" : "CARD",
                actorStaffId: "kasir",
              })
            case "cancel":
              return cancelOrder(database, {
                orderId: order.id,
                actorStaffId: "kasir",
              })
            case "drawer-open":
              return openDrawerSession(database, { actorStaffId: "kasir-2" })
            case "drawer-close":
              return closeDrawerSession(database, {
                sessionId: drawer.id,
                actualCash: 0,
              })
            case "receive":
              return receiveInventory(database, receive)
            case "waste":
              return recordInventoryWaste(database, {
                inventoryLotId: lotId,
                quantity: 1,
                reason: "Damaged",
                actorStaffId: "kasir",
              })
            case "opname":
              return recordStockOpname(database, {
                inventoryLotId: lotId,
                systemQuantity: 10,
                physicalQuantity: 8,
                actorStaffId: "kasir",
              })
            case "kitchen":
              return startKitchenItem(
                database,
                database.store.getRowIds(TABLES.kitchenOrderItems)[0]
              )
          }
        }
        await expect(run()).rejects.toThrow("Transaksi tidak tersimpan")
        expect(database.store.getContent()).toEqual(before)
        expect(notifications).toBe(0)
      } finally {
        failure.mockRestore()
      }
      expect(await reload(dbName)).toEqual(before)
    })
  }

  test("operasi bersamaan diserialisasi: pembayaran tidak ganda atau tertimpa", async () => {
    const { database, dbName } = await fixture()
    const order = await createOpenOrder(database, item)
    const results = await Promise.allSettled(
      ["QRIS", "CARD"].map((method) =>
        payOrderNonCash(database, {
          orderId: order.id,
          method: method as "QRIS" | "CARD",
          actorStaffId: "kasir",
        })
      )
    )
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "rejected",
    ])
    const saved = await reload(dbName)
    expect(Object.keys(saved[0].payments)).toHaveLength(1)
    expect(Object.keys(saved[0].kitchenOrders)).toHaveLength(1)
  })

  test("exception setelah mutasi draft membatalkan seluruh operasi", async () => {
    const { database, dbName } = await fixture()
    const fail = persistentOperation(async (draft) => {
      addRow(draft, TABLES.orders, { status: "OPEN" })
      throw new Error("gagal membuat item")
    })
    await expect(fail(database)).rejects.toThrow("gagal membuat item")
    expect(database.store.getTables()).toEqual({})
    expect((await reload(dbName))[0]).toEqual({})
  })
})
