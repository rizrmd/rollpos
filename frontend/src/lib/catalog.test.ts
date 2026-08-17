import { describe, expect, test } from "bun:test"

import {
  categoryLabel,
  inferMenuCategory,
  isLowStock,
  matchesQuery,
  menusOf,
  prettyCategoryName,
  recipeCountFor,
  slugifyCategory,
  sortCatalog,
  suggestSku,
  usedInMenus,
} from "@/lib/catalog"
import type { ProductRecord, RecipeLineRecord } from "@/lib/types"

function item(
  partial: Partial<ProductRecord> & Pick<ProductRecord, "id" | "name">
): ProductRecord {
  return {
    sku: "",
    price: 0,
    stock: 0,
    kind: "menu",
    category: "minuman",
    unit: "porsi",
    note: "",
    isActive: true,
    lowStock: 0,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  }
}

describe("catalog helpers", () => {
  test("infer kategori makanan dari nama pastry", () => {
    expect(inferMenuCategory("Butter Croissant")).toBe("makanan")
    expect(inferMenuCategory("Roti Sobek")).toBe("makanan")
    expect(inferMenuCategory("Cafe Latte")).toBe("minuman")
    expect(inferMenuCategory("Espresso")).toBe("minuman")
  })

  test("SKU otomatis dari nama", () => {
    expect(suggestSku("Cafe Latte")).toBe("RNB-CAF-LAT")
    expect(suggestSku("Espresso")).toBe("RNB-ESP")
    expect(suggestSku("Susu full cream", "ingredient")).toBe("BHN-SUS-FUL-CRE")
  })

  test("stok rendah hanya jika ambang > 0 dan stok menipis", () => {
    expect(isLowStock({ stock: 10, lowStock: 0 })).toBe(false)
    expect(isLowStock({ stock: 10, lowStock: 8 })).toBe(false)
    expect(isLowStock({ stock: 8, lowStock: 8 })).toBe(true)
    expect(isLowStock({ stock: 2, lowStock: 8 })).toBe(true)
  })

  test("filter dan resep mengikuti id", () => {
    const latte = item({ id: "m1", name: "Cafe Latte", sku: "RNB-LAT" })
    const milk = item({
      id: "b1",
      name: "Susu",
      kind: "ingredient",
      category: "bahan",
    })
    const recipes: RecipeLineRecord[] = [
      { id: "r1", productId: "m1", ingredientId: "b1", qty: 180, createdAt: 0 },
    ]
    expect(menusOf([latte, milk])).toEqual([latte])
    expect(recipeCountFor("m1", recipes)).toBe(1)
    expect(usedInMenus("b1", recipes, [latte, milk])).toEqual([latte])
    expect(matchesQuery(latte, "latte")).toBe(true)
    expect(matchesQuery(latte, "RNB")).toBe(true)
    expect(matchesQuery(latte, "teh")).toBe(false)
    expect(categoryLabel("minuman")).toBe("Minuman")
    expect(categoryLabel("snack", [{ slug: "snack", name: "Snack" }])).toBe("Snack")
  })

  test("slug kategori dari nama bebas", () => {
    expect(slugifyCategory("Snack")).toBe("snack")
    expect(slugifyCategory("Es Krim")).toBe("es-krim")
    expect(slugifyCategory("  Paket Hemat  ")).toBe("paket-hemat")
    expect(prettyCategoryName("es-krim")).toBe("Es Krim")
  })

  test("urut aktif dulu lalu nama", () => {
    const a = item({ id: "1", name: "Americano", isActive: false })
    const b = item({ id: "2", name: "Espresso" })
    expect(sortCatalog([a, b]).map((row) => row.name)).toEqual([
      "Espresso",
      "Americano",
    ])
  })
})
