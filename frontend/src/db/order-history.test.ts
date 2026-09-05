import { describe, expect, test } from "bun:test"
import { createRollposDatabase, TABLES } from "./database"
import { historyCapacity, historyPage, loadOrderHistory } from "./order-history"
import { createOpenOrder, payOrderNonCash } from "./orders"

const latte = {
  menuProductId: "latte",
  name: "Cafe Latte",
  quantity: 2,
  price: 28000,
  modifiers: [{ id: "shot", name: "Extra Shot", additionalPrice: 6000 }],
}

describe("riwayat transaksi lokal", () => {
  test("hanya PAID, diurutkan waktu bayar; membaca snapshot dan staff tanpa mutasi", async () => {
    const database = createRollposDatabase({ inMemory: true })
    database.store.setRow(TABLES.staffMembers, "rani", {
      name: "Rani",
      isActive: false,
    })
    const first = await createOpenOrder(database, [latte])
    const second = await createOpenOrder(database, [
      { ...latte, name: "Iced Latte" },
    ])
    await createOpenOrder(database, [latte])
    await payOrderNonCash(database, {
      orderId: second.id,
      method: "CARD",
      actorStaffId: "rani",
      paidAt: 1000,
    })
    await payOrderNonCash(database, {
      orderId: first.id,
      method: "QRIS",
      actorStaffId: "rani",
      paidAt: 2000,
    })
    const before = database.store.getJson()
    const rows = await loadOrderHistory(database)
    expect(rows.map((row) => row.id)).toEqual([first.id, second.id])
    expect(rows[0]).toMatchObject({
      status: "PAID",
      staffName: "Rani",
      total: 56000,
      items: [
        {
          name: "Cafe Latte",
          quantity: 2,
          price: 28000,
          subtotal: 56000,
          modifiers: latte.modifiers,
        },
      ],
      payment: { method: "QRIS", paidAt: 2000 },
    })
    expect(rows[1].payment?.method).toBe("CARD")
    expect(database.store.getJson()).toBe(before)
  })

  test("tetap menampilkan tunai, staff terhapus, dan PAID lama tanpa pembayaran", async () => {
    const database = createRollposDatabase({ inMemory: true })
    const order = await createOpenOrder(database, [latte])
    database.store.setCell(TABLES.orders, order.id, "status", "PAID")
    expect((await loadOrderHistory(database))[0]).toMatchObject({
      staffName: "Tidak tercatat",
      payment: undefined,
    })
    database.store.setRow(TABLES.payments, "cash", {
      orderId: order.id,
      method: "CASH",
      amount: 60000,
      change: 4000,
      actorStaffId: "rani",
      paidAt: 2000,
    })
    expect((await loadOrderHistory(database))[0]).toMatchObject({
      staffName: "Staff rani",
      payment: { method: "CASH", amount: 60000, change: 4000 },
    })
  })

  test("pembayaran baru muncul pada pembacaan berikutnya", async () => {
    const database = createRollposDatabase({ inMemory: true })
    const order = await createOpenOrder(database, [latte])
    expect(await loadOrderHistory(database)).toEqual([])
    await payOrderNonCash(database, {
      orderId: order.id,
      method: "CARD",
      actorStaffId: "rani",
    })
    expect(await loadOrderHistory(database)).toHaveLength(1)
  })

  test("pagination tidak melewatkan atau menggandakan transaksi dan membatasi halaman", () => {
    const rows = Array.from({ length: 13 }, (_, i) => i)
    expect(
      [1, 2, 3].flatMap((page) => historyPage(rows, page, 5).rows)
    ).toEqual(rows)
    expect(historyPage(rows, 99, 5)).toEqual({
      rows: [10, 11, 12],
      page: 3,
      pageCount: 3,
    })
    expect(historyPage([], 2, 5)).toEqual({ rows: [], page: 1, pageCount: 1 })
    expect(historyPage(rows, -1, 5).page).toBe(1)
    expect(historyPage(rows, 3, 10).page).toBe(2)
    expect(historyCapacity(660, 132)).toBe(5)
    expect(historyCapacity(659, 132)).toBe(4)
    expect(historyCapacity(0, 132)).toBe(1)
  })
})
