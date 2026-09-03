import { describe, expect, test } from "bun:test"

import { createRollposDatabase, listRows, TABLES } from "./database"
import { loadOpenDrawerSession, openDrawerSession } from "./drawers"

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
})
