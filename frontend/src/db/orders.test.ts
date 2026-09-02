import { describe, expect, test } from "bun:test"

import { createRollposDatabase, listRows, TABLES } from "./database"
import { createOpenOrder, loadOrders, payOrderCash } from "./orders"

describe("order kasir lokal", () => {
  test("membuat order OPEN beserta snapshot item dan nominalnya", async () => {
    const database = createRollposDatabase({ inMemory: true })
    const order = await createOpenOrder(database, [
      {
        menuProductId: "espresso",
        name: "Espresso",
        quantity: 2,
        price: 18_000,
      },
      {
        menuProductId: "croissant",
        name: "Butter Croissant",
        quantity: 1,
        price: 18_000,
      },
    ])

    expect(order).toMatchObject({
      status: "OPEN",
      subtotal: 54_000,
      total: 54_000,
      items: [
        { name: "Espresso", quantity: 2, price: 18_000, subtotal: 36_000 },
        {
          name: "Butter Croissant",
          quantity: 1,
          price: 18_000,
          subtotal: 18_000,
        },
      ],
    })
    expect(order.orderNumber).toMatch(/^ORD-/)
    expect(listRows(database, TABLES.orders)).toHaveLength(1)
    expect(listRows(database, TABLES.orderItems)).toHaveLength(2)
    await expect(loadOrders(database)).resolves.toEqual([order])
  })

  test("menolak order tanpa item tanpa membuat data parsial", async () => {
    const database = createRollposDatabase({ inMemory: true })
    await expect(createOpenOrder(database, [])).rejects.toThrow(
      "Cart masih kosong"
    )
    expect(listRows(database, TABLES.orders)).toHaveLength(0)
    expect(listRows(database, TABLES.orderItems)).toHaveLength(0)
  })

  test("membayar order tunai secara atomik dan mencatat actor", async () => {
    const database = createRollposDatabase({ inMemory: true })
    const order = await createOpenOrder(database, [
      {
        menuProductId: "latte",
        name: "Cafe Latte",
        quantity: 2,
        price: 25_000,
      },
    ])

    const payment = await payOrderCash(database, {
      orderId: order.id,
      amount: 60_000,
      actorStaffId: "staff-kasir",
      paidAt: 1_788_381_000_000,
    })

    expect(payment).toMatchObject({
      method: "CASH",
      amount: 60_000,
      change: 10_000,
      actorStaffId: "staff-kasir",
      paidAt: 1_788_381_000_000,
    })
    expect((await loadOrders(database))[0]).toMatchObject({
      status: "PAID",
      payment,
    })
    expect(listRows(database, TABLES.payments)).toHaveLength(1)
  })

  test("menolak uang kurang dan pembayaran ulang tanpa data parsial", async () => {
    const database = createRollposDatabase({ inMemory: true })
    const order = await createOpenOrder(database, [
      {
        menuProductId: "latte",
        name: "Cafe Latte",
        quantity: 1,
        price: 25_000,
      },
    ])

    await expect(
      payOrderCash(database, {
        orderId: order.id,
        amount: 20_000,
        actorStaffId: "staff-kasir",
      })
    ).rejects.toThrow("masih kurang")
    expect((await loadOrders(database))[0].status).toBe("OPEN")
    expect(listRows(database, TABLES.payments)).toHaveLength(0)

    await payOrderCash(database, {
      orderId: order.id,
      amount: 25_000,
      actorStaffId: "staff-kasir",
    })
    await expect(
      payOrderCash(database, {
        orderId: order.id,
        amount: 25_000,
        actorStaffId: "staff-kasir",
      })
    ).rejects.toThrow("sudah dibayar")
    expect(listRows(database, TABLES.payments)).toHaveLength(1)
  })
})
