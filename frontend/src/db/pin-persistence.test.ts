import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { IDBFactory, IDBObjectStore } from "fake-indexeddb"

import { createRollposDatabase, TABLES } from "./database"
import { seedStaffingIfEmpty } from "./seed"
import { loadStaff } from "./snapshot"
import {
  authenticateStaff,
  changeStaffPin,
  upsertStaff,
} from "./staffing-write"

const originalIndexedDB = globalThis.indexedDB
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})
afterEach(() => {
  globalThis.indexedDB = originalIndexedDB
})

async function boot(dbName = crypto.randomUUID()) {
  const database = createRollposDatabase({ dbName })
  // Jalur startup aplikasi: load IndexedDB, lalu seed pada store baru.
  await seedStaffingIfEmpty(database)
  return { database, dbName }
}

describe("persistensi PIN staff", () => {
  test("PIN seed yang diganti bertahan setelah load dan dua kali startup ulang", async () => {
    const { database, dbName } = await boot()
    const member = (await loadStaff(database))[0]
    await authenticateStaff(database, member.id, "000000")
    await changeStaffPin(database, member.id, "000000", "042681")
    const saved = database.store.getTable(TABLES.staffMembers)
    expect(saved[member.id].pinSalt).not.toBe(member.pinSalt)
    expect(saved[member.id].pinHash).not.toBe(member.pinHash)

    const loaded = createRollposDatabase({ dbName })
    await loaded.ready
    expect(loaded.store.getTable(TABLES.staffMembers)).toEqual(saved)
    await seedStaffingIfEmpty(loaded)
    expect(loaded.store.getTable(TABLES.staffMembers)).toEqual(saved)
    await authenticateStaff(loaded, member.id, "042681")
    await expect(
      authenticateStaff(loaded, member.id, "000000")
    ).rejects.toThrow("PIN salah")

    const restarted = (await boot(dbName)).database
    expect(restarted.store.getTable(TABLES.staffMembers)).toEqual(saved)
    await authenticateStaff(restarted, member.id, "042681")
    await expect(
      authenticateStaff(restarted, member.id, "000000")
    ).rejects.toThrow("PIN salah")
  })

  test("PIN staff baru dan hasil reset owner tetap tersimpan saat startup ulang", async () => {
    const { database, dbName } = await boot()
    const owner = (await loadStaff(database)).find((member) =>
      member.roles.includes("owner")
    )!
    const staffId = await upsertStaff(database, owner, {
      name: "Budi Santoso",
      nickname: "Budi",
      pin: "051923",
      roles: ["kasir"],
      isActive: true,
    })
    const saved = database.store.getRow(TABLES.staffMembers, staffId)
    const reloaded = (await boot(dbName)).database
    expect(reloaded.store.getRow(TABLES.staffMembers, staffId)).toEqual(saved)
    await authenticateStaff(reloaded, staffId, "051923")
    await expect(
      authenticateStaff(reloaded, staffId, "000000")
    ).rejects.toThrow("PIN salah")

    await changeStaffPin(reloaded, staffId, "", "073514", owner)
    const reset = reloaded.store.getRow(TABLES.staffMembers, staffId)
    const restarted = (await boot(dbName)).database
    expect(restarted.store.getRow(TABLES.staffMembers, staffId)).toEqual(reset)
    await authenticateStaff(restarted, staffId, "073514")
    await expect(
      authenticateStaff(restarted, staffId, "051923")
    ).rejects.toThrow("PIN salah")
    await expect(
      authenticateStaff(restarted, staffId, "000000")
    ).rejects.toThrow("PIN salah")
  })

  test("gagal commit perubahan PIN mempertahankan PIN sebelumnya setelah reload", async () => {
    const { database, dbName } = await boot()
    const member = (await loadStaff(database))[0]
    await changeStaffPin(database, member.id, "000000", "042681")
    const before = database.store.getContent()
    const original = IDBObjectStore.prototype.put
    const failure = spyOn(IDBObjectStore.prototype, "put").mockImplementation(
      function (...args) {
        const request = original.apply(this, args)
        request.addEventListener("success", () => {
          try {
            this.transaction.abort()
          } catch {
            /* transaksi sudah dibatalkan */
          }
        })
        return request
      }
    )
    try {
      await expect(
        changeStaffPin(database, member.id, "042681", "073514")
      ).rejects.toThrow("Transaksi tidak tersimpan")
      expect(database.store.getContent()).toEqual(before)
    } finally {
      failure.mockRestore()
    }
    const restarted = (await boot(dbName)).database
    expect(restarted.store.getContent()).toEqual(before)
    await authenticateStaff(restarted, member.id, "042681")
    await expect(
      authenticateStaff(restarted, member.id, "073514")
    ).rejects.toThrow("PIN salah")
  })
})
