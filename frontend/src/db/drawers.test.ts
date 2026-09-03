import { describe, expect, test } from "bun:test"

import { createRollposDatabase, listRows, TABLES } from "./database"
import {
  closeDrawerSession,
  getDrawerExpectedCash,
  loadOpenDrawerSession,
  openDrawerSession,
} from "./drawers"
import { createOpenOrder, payOrderCash } from "./orders"

describe("sesi laci kasir lokal", () => {
  test("membuka dan memuat sesi OPEN untuk actor staff", async () => {
    const database = createRollposDatabase({ inMemory: true })
    const session = await openDrawerSession(database, {
      actorStaffId: "staff-kasir",
      openedAt: 1_788_381_000_000,
    })

    expect(session).toMatchObject({
      actorStaffId: "staff-kasir",
      openedAt: 1_788_381_000_000,
      status: "OPEN",
    })
    await expect(
      loadOpenDrawerSession(database, "staff-kasir")
    ).resolves.toEqual(session)
    expect(listRows(database, TABLES.drawerSessions)).toHaveLength(1)
  })

  test("menolak dua sesi laci aktif untuk staff yang sama", async () => {
    const database = createRollposDatabase({ inMemory: true })
    await openDrawerSession(database, { actorStaffId: "staff-kasir" })

    await expect(
      openDrawerSession(database, { actorStaffId: "staff-kasir" })
    ).rejects.toThrow("sudah memiliki sesi laci aktif")
    expect(listRows(database, TABLES.drawerSessions)).toHaveLength(1)
  })

  test("staff berbeda dapat memiliki sesi laci aktif masing-masing", async () => {
    const database = createRollposDatabase({ inMemory: true })
    await openDrawerSession(database, { actorStaffId: "staff-a" })
    await openDrawerSession(database, { actorStaffId: "staff-b" })

    expect(listRows(database, TABLES.drawerSessions)).toHaveLength(2)
  })

  test("menutup sesi dengan expected, actual, dan discrepancy tersimpan", async () => {
    const database = createRollposDatabase({ inMemory: true })
    const drawer = await openDrawerSession(database, {
      actorStaffId: "staff-kasir",
      openedAt: 1_788_381_000_000,
    })
    const order = await createOpenOrder(database, [
      {
        menuProductId: "latte",
        name: "Cafe Latte",
        quantity: 2,
        price: 25_000,
      },
    ])
    await payOrderCash(database, {
      orderId: order.id,
      amount: 60_000,
      actorStaffId: "staff-kasir",
    })

    await expect(getDrawerExpectedCash(database, drawer.id)).resolves.toBe(
      50_000
    )
    const closed = await closeDrawerSession(database, {
      sessionId: drawer.id,
      actualCash: 49_000,
      closedAt: 1_788_381_600_000,
    })

    expect(closed).toEqual({
      ...drawer,
      status: "CLOSED",
      expectedCash: 50_000,
      actualCash: 49_000,
      discrepancy: -1_000,
      closedAt: 1_788_381_600_000,
    })
    await expect(
      loadOpenDrawerSession(database, "staff-kasir")
    ).resolves.toBeUndefined()
    expect(listRows(database, TABLES.drawerSessions)[0]).toMatchObject({
      status: "CLOSED",
      expectedCash: 50_000,
      actualCash: 49_000,
      discrepancy: -1_000,
      closedAt: 1_788_381_600_000,
    })
  })

  test("menolak cash count invalid dan penutupan berulang", async () => {
    const database = createRollposDatabase({ inMemory: true })
    const drawer = await openDrawerSession(database, {
      actorStaffId: "staff-kasir",
    })

    await expect(
      closeDrawerSession(database, {
        sessionId: drawer.id,
        actualCash: -1,
      })
    ).rejects.toThrow("Cash count tidak valid")
    await closeDrawerSession(database, {
      sessionId: drawer.id,
      actualCash: 0,
    })
    await expect(
      closeDrawerSession(database, {
        sessionId: drawer.id,
        actualCash: 0,
      })
    ).rejects.toThrow("sudah ditutup")
  })
})
