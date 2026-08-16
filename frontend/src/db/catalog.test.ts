import { describe, expect, test } from "bun:test"

import {
  createProduct,
  deleteProduct,
  updateProduct,
} from "@/db/catalog"
import { createRollposDatabase } from "@/db/database"
import { loadProducts } from "@/db/snapshot"
import { canManageProducts } from "@/lib/permissions"
import { DEFAULT_OUTLET_ID, type StaffRecord, type StaffRole } from "@/lib/types"

let dbSeq = 0

async function freshDb() {
  dbSeq += 1
  return createRollposDatabase({
    dbName: `rollpos-catalog-${dbSeq}-${Date.now()}`,
    inMemory: true,
  })
}

function person(roles: StaffRole[], name = "Tester"): StaffRecord {
  return {
    id: `staff-${roles.join("-")}`,
    name,
    nickname: name,
    pinHash: "",
    pinSalt: "",
    isActive: true,
    outletId: DEFAULT_OUTLET_ID,
    roles,
  }
}

const sample = {
  name: "Kopi Susu",
  sku: "RNB-KS",
  price: 24_000,
  stock: 12,
}

describe("catalog product writes", () => {
  test("hanya owner dan manager yang boleh kelola produk", () => {
    expect(canManageProducts(["owner"])).toBe(true)
    expect(canManageProducts(["manager"])).toBe(true)
    expect(canManageProducts(["owner", "barista"])).toBe(true)
    expect(canManageProducts(["kasir", "manager"])).toBe(true)
    expect(canManageProducts(["kasir"])).toBe(false)
    expect(canManageProducts(["barista"])).toBe(false)
    expect(canManageProducts(["kitchen"])).toBe(false)
    expect(canManageProducts([])).toBe(false)
  })

  test("owner dan manager bisa menambah, mengubah, dan menghapus", async () => {
    for (const role of ["owner", "manager"] as const) {
      const database = await freshDb()
      const actor = person([role], role)
      const created = await createProduct(database, actor, sample)
      let rows = await loadProducts(database)
      expect(rows).toHaveLength(1)
      expect(rows[0]?.name).toBe("Kopi Susu")

      const updated = await updateProduct(database, actor, created.id, {
        ...sample,
        name: "Kopi Susu Gula Aren",
        price: 28_000,
      })
      expect(updated.name).toBe("Kopi Susu Gula Aren")
      rows = await loadProducts(database)
      expect(rows[0]?.price).toBe(28_000)

      await deleteProduct(database, actor, created)
      rows = await loadProducts(database)
      expect(rows).toHaveLength(0)
    }
  })

  test("kasir, barista, dan kitchen ditolak saat menulis produk", async () => {
    const database = await freshDb()
    const owner = person(["owner"], "Ayu")
    const created = await createProduct(database, owner, sample)

    for (const role of ["kasir", "barista", "kitchen"] as const) {
      const actor = person([role], role)
      await expect(createProduct(database, actor, sample)).rejects.toThrow(
        "Hanya owner atau manager yang boleh menambah atau mengubah produk."
      )
      await expect(
        updateProduct(database, actor, created.id, {
          ...sample,
          price: 1,
        })
      ).rejects.toThrow(
        "Hanya owner atau manager yang boleh menambah atau mengubah produk."
      )
      await expect(deleteProduct(database, actor, created)).rejects.toThrow(
        "Hanya owner atau manager yang boleh menambah atau mengubah produk."
      )
    }

    const rows = await loadProducts(database)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.price).toBe(24_000)
  })
})
