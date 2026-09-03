import { describe, expect, test } from "bun:test"

import { addRow, createRollposDatabase, listRows, TABLES } from "@/db/database"
import {
  createModifier,
  deleteModifier,
  loadMenuModifiers,
  loadModifiers,
  setMenuModifiers,
  updateModifier,
} from "@/db/modifiers"
import type { StaffRecord } from "@/lib/types"

const owner: StaffRecord = {
  id: "owner",
  name: "Owner",
  nickname: "Owner",
  pinHash: "",
  pinSalt: "",
  isActive: true,
  outletId: "main",
  roles: ["owner"],
}

const cashier: StaffRecord = { ...owner, id: "cashier", roles: ["kasir"] }

function fixture() {
  const database = createRollposDatabase({ inMemory: true })
  const menuProductId = addRow(database, TABLES.products, {
    name: "Cafe Latte",
    kind: "menu",
    isActive: true,
  })
  const ingredientId = addRow(database, TABLES.products, {
    name: "Susu",
    kind: "ingredient",
    isActive: true,
  })
  return { database, menuProductId, ingredientId }
}

describe("modifier catalog", () => {
  test("owner membuat dan mengubah master modifier", async () => {
    const { database } = fixture()
    const created = await createModifier(database, owner, {
      name: " Extra shot ",
      additionalPrice: 8_000,
    })
    expect(created.name).toBe("Extra shot")
    expect(created.additionalPrice).toBe(8_000)
    expect(created.isActive).toBe(true)

    const updated = await updateModifier(database, owner, created.id, {
      name: "Extra shot",
      additionalPrice: 9_000,
      isActive: false,
    })
    expect(updated.additionalPrice).toBe(9_000)
    expect(updated.isActive).toBe(false)
    expect(await loadModifiers(database)).toHaveLength(1)
  })

  test("validasi menolak nama kosong, harga negatif, duplikat, dan role tanpa akses", async () => {
    const { database } = fixture()
    await expect(
      createModifier(database, owner, { name: "", additionalPrice: 0 })
    ).rejects.toThrow("Nama modifier wajib diisi.")
    await expect(
      createModifier(database, owner, { name: "Syrup", additionalPrice: -1 })
    ).rejects.toThrow("Harga tambahan tidak boleh negatif.")
    await createModifier(database, owner, {
      name: "Syrup",
      additionalPrice: 5_000,
    })
    await expect(
      createModifier(database, owner, {
        name: " syrup ",
        additionalPrice: 6_000,
      })
    ).rejects.toThrow("Nama modifier sudah ada.")
    await expect(
      createModifier(database, cashier, { name: "Es", additionalPrice: 0 })
    ).rejects.toThrow("Hanya owner atau manager")
  })

  test("satu menu dapat dikaitkan ke beberapa modifier tanpa duplikat", async () => {
    const { database, menuProductId } = fixture()
    const shot = await createModifier(database, owner, {
      name: "Extra shot",
      additionalPrice: 8_000,
    })
    const oat = await createModifier(database, owner, {
      name: "Oat milk",
      additionalPrice: 10_000,
    })

    await setMenuModifiers(database, owner, menuProductId, [
      shot.id,
      oat.id,
      shot.id,
    ])
    const links = await loadMenuModifiers(database)
    expect(links).toHaveLength(2)
    expect(new Set(links.map((row) => row.modifierId))).toEqual(
      new Set([shot.id, oat.id])
    )
  })

  test("relasi hanya menerima menu dan modifier yang tersedia", async () => {
    const { database, ingredientId, menuProductId } = fixture()
    const modifier = await createModifier(database, owner, {
      name: "Panas",
      additionalPrice: 0,
    })
    await expect(
      setMenuModifiers(database, owner, ingredientId, [modifier.id])
    ).rejects.toThrow("Menu tidak ditemukan.")
    await expect(
      setMenuModifiers(database, owner, menuProductId, ["missing"])
    ).rejects.toThrow("Modifier yang dipilih tidak ditemukan.")
    expect(listRows(database, TABLES.menuModifiers)).toHaveLength(0)
  })

  test("hapus modifier membersihkan seluruh relasinya", async () => {
    const { database, menuProductId } = fixture()
    const modifier = await createModifier(database, owner, {
      name: "Less ice",
      additionalPrice: 0,
    })
    await setMenuModifiers(database, owner, menuProductId, [modifier.id])
    await deleteModifier(database, owner, modifier.id)
    expect(await loadModifiers(database)).toHaveLength(0)
    expect(await loadMenuModifiers(database)).toHaveLength(0)
  })
})
