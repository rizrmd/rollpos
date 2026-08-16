import type {
  MenuCategory,
  ProductKind,
  ProductRecord,
  RecipeLineRecord,
} from "@/lib/types"
import { productKindOf } from "@/lib/types"

const FOOD_NAME =
  /croissant|roti|pastry|sandwich|toast|kue|nasi|mie|pasta|salad|donat|bread/i

export function inferMenuCategory(name: string): MenuCategory {
  return FOOD_NAME.test(name) ? "makanan" : "minuman"
}

export function suggestSku(name: string, kind: ProductKind = "menu"): string {
  const parts = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Z0-9]/g, ""))
    .filter(Boolean)
    .map((part) => part.slice(0, 3))
  const body = parts.join("-")
  if (!body) return kind === "ingredient" ? "BHN" : "RNB"
  return kind === "ingredient" ? `BHN-${body}` : `RNB-${body}`
}

export function isLowStock(product: Pick<ProductRecord, "stock" | "lowStock">): boolean {
  return product.lowStock > 0 && product.stock <= product.lowStock
}

export function categoryLabel(category: string): string {
  if (category === "minuman") return "Minuman"
  if (category === "makanan") return "Makanan"
  if (category === "bahan") return "Bahan"
  return category || "Tanpa kategori"
}

export function menusOf(products: readonly ProductRecord[]): ProductRecord[] {
  return products.filter((item) => productKindOf(item.kind) === "menu")
}

export function ingredientsOf(products: readonly ProductRecord[]): ProductRecord[] {
  return products.filter((item) => productKindOf(item.kind) === "ingredient")
}

export function recipeCountFor(
  productId: string,
  recipes: readonly RecipeLineRecord[]
): number {
  return recipes.filter((line) => line.productId === productId).length
}

export function usedInMenus(
  ingredientId: string,
  recipes: readonly RecipeLineRecord[],
  products: readonly ProductRecord[]
): ProductRecord[] {
  const menuIds = new Set(
    recipes.filter((line) => line.ingredientId === ingredientId).map((line) => line.productId)
  )
  return products.filter((item) => menuIds.has(item.id))
}

export function matchesQuery(product: ProductRecord, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return (
    product.name.toLowerCase().includes(needle) ||
    product.sku.toLowerCase().includes(needle) ||
    product.category.toLowerCase().includes(needle) ||
    product.note.toLowerCase().includes(needle)
  )
}

export function sortCatalog(products: readonly ProductRecord[]): ProductRecord[] {
  return [...products].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
    return a.name.localeCompare(b.name, "id")
  })
}
