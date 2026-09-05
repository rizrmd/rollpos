import { describe, expect, test } from "bun:test"

import {
  createMenuCategory,
  createProduct,
  deleteMenuCategory,
  deleteProduct,
  seedCatalogIfEmpty,
  setRecipe,
  updateProduct,
} from "@/db/catalog"
import { createRollposDatabase } from "@/db/database"
import {
  loadMenuCategories,
  loadProducts,
  loadRecipeLines,
} from "@/db/snapshot"
import { canManageProducts } from "@/lib/permissions"
import {
  DEFAULT_OUTLET_ID,
  type StaffRecord,
  type StaffRole,
} from "@/lib/types"

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

  test("menu baru otomatis dapat kategori dan SKU", async () => {
    const database = await freshDb()
    const actor = person(["owner"])
    const created = await createProduct(database, actor, {
      name: "Butter Croissant",
      sku: "",
      price: 18_000,
      stock: 0,
    })
    expect(created.kind).toBe("menu")
    expect(created.category).toBe("makanan")
    expect(created.sku).toBe("RNB-BUT-CRO")
    expect(created.isActive).toBe(true)
  })

  test("bahan bisa ditambah dan dipakai di resep", async () => {
    const database = await freshDb()
    const actor = person(["manager"])
    const milk = await createProduct(database, actor, {
      name: "Susu full cream",
      sku: "BHN-SUS",
      price: 0,
      stock: 4000,
      kind: "ingredient",
      unit: "ml",
      lowStock: 800,
    })
    const beans = await createProduct(database, actor, {
      name: "Biji espresso",
      sku: "BHN-ESP",
      price: 0,
      stock: 2000,
      kind: "ingredient",
      unit: "g",
      lowStock: 400,
    })
    const latte = await createProduct(database, actor, {
      name: "Cafe Latte",
      sku: "RNB-LAT",
      price: 28_000,
      stock: 0,
      kind: "menu",
      category: "minuman",
    })

    const lines = await setRecipe(database, actor, latte.id, [
      { ingredientId: beans.id, qty: 18 },
      { ingredientId: milk.id, qty: 180 },
    ])
    expect(lines).toHaveLength(2)

    await expect(deleteProduct(database, actor, milk)).rejects.toThrow(
      "Tidak bisa hapus: dipakai di Cafe Latte."
    )

    await deleteProduct(database, actor, latte)
    const leftover = await loadRecipeLines(database)
    expect(leftover).toHaveLength(0)
    await expect(deleteProduct(database, actor, milk)).rejects.toThrow(
      "Bahan memiliki riwayat stok"
    )
    await updateProduct(database, actor, milk.id, { ...milk, isActive: false })
    const remaining = await loadProducts(database)
    expect(
      remaining.filter((row) => row.isActive).map((row) => row.id)
    ).toEqual([beans.id])
  })

  test("SKU bentrok ditambahkan nomor", async () => {
    const database = await freshDb()
    const actor = person(["owner"])
    await createProduct(database, actor, sample)
    const second = await createProduct(database, actor, sample)
    expect(second.sku).toBe("RNB-KS-2")
  })

  test("seed mengisi menu, bahan, dan resep", async () => {
    const database = await freshDb()
    const seeded = await seedCatalogIfEmpty(database)
    expect(seeded).toBe(true)
    const products = await loadProducts(database)
    const recipes = await loadRecipeLines(database)
    expect(products.filter((row) => row.kind === "menu")).toHaveLength(4)
    expect(products.filter((row) => row.kind === "ingredient")).toHaveLength(5)
    expect(recipes.length).toBeGreaterThan(0)
    const latte = products.find((row) => row.sku === "RNB-LAT")
    expect(latte?.category).toBe("minuman")
    expect(recipes.filter((line) => line.productId === latte?.id)).toHaveLength(
      2
    )
  })

  test("backfill menambahkan bahan ke katalog lama", async () => {
    const database = await freshDb()
    const actor = person(["owner"])
    await createProduct(database, actor, {
      name: "Espresso",
      sku: "RNB-ESP",
      price: 18_000,
      stock: 40,
    })
    const first = await seedCatalogIfEmpty(database)
    expect(first).toBe(true)
    const products = await loadProducts(database)
    expect(products.some((row) => row.sku === "BHN-ESP")).toBe(true)
    expect(products.find((row) => row.sku === "RNB-ESP")?.category).toBe(
      "minuman"
    )
    const recipes = await loadRecipeLines(database)
    expect(recipes.length).toBeGreaterThan(0)
  })

  test("kategori menu bisa ditambah dan dipakai produk", async () => {
    const database = await freshDb()
    const actor = person(["owner"])
    const snack = await createMenuCategory(database, actor, { name: "Snack" })
    expect(snack.slug).toBe("snack")
    expect(snack.name).toBe("Snack")

    await expect(
      createMenuCategory(database, actor, { name: "snack" })
    ).rejects.toThrow("Kategori sudah ada.")
    await expect(
      createMenuCategory(database, actor, { name: "  " })
    ).rejects.toThrow("Nama kategori wajib diisi.")

    const chips = await createProduct(database, actor, {
      name: "Keripik singkong",
      sku: "RNB-KRP",
      price: 12_000,
      stock: 0,
      category: "Snack",
    })
    expect(chips.category).toBe("snack")

    await expect(deleteMenuCategory(database, actor, snack)).rejects.toThrow(
      "Tidak bisa hapus: masih dipakai 1 menu."
    )

    await deleteProduct(database, actor, chips)
    await deleteMenuCategory(database, actor, snack)
    const leftover = await loadMenuCategories(database)
    expect(leftover.some((row) => row.slug === "snack")).toBe(false)
  })

  test("menu dengan kategori baru otomatis mendaftarkan kategori", async () => {
    const database = await freshDb()
    const actor = person(["manager"])
    const created = await createProduct(database, actor, {
      name: "Paket pagi",
      sku: "RNB-PKT",
      price: 45_000,
      stock: 0,
      category: "Paket",
    })
    expect(created.category).toBe("paket")
    const cats = await loadMenuCategories(database)
    expect(
      cats.some((row) => row.slug === "paket" && row.name === "Paket")
    ).toBe(true)
  })

  test("seed mengisi kategori default minuman dan makanan", async () => {
    const database = await freshDb()
    await seedCatalogIfEmpty(database)
    const cats = await loadMenuCategories(database)
    expect(cats.map((row) => row.slug).sort()).toEqual(["makanan", "minuman"])
  })
})
