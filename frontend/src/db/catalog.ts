import {
  addRow,
  cellStr,
  deleteMatching,
  deleteRow,
  listRows,
  transact,
  updateRow,
  type Database,
  TABLES,
} from "@/db/database"
import { loadProducts, loadRecipeLines } from "@/db/snapshot"
import { inferMenuCategory, suggestSku } from "@/lib/catalog"
import { canManageProducts } from "@/lib/permissions"
import {
  productKindOf,
  type ProductKind,
  type ProductRecord,
  type RecipeLineRecord,
  type StaffRecord,
} from "@/lib/types"

export type ProductInput = {
  name: string
  sku: string
  price: number
  stock: number
  kind?: ProductKind
  category?: string
  unit?: string
  note?: string
  isActive?: boolean
  lowStock?: number
}

export type RecipeLineInput = {
  ingredientId: string
  qty: number
}

export const DEMO_PRODUCTS: ProductInput[] = [
  {
    name: "Espresso",
    sku: "RNB-ESP",
    price: 18_000,
    stock: 0,
    kind: "menu",
    category: "minuman",
    unit: "porsi",
    isActive: true,
  },
  {
    name: "Americano",
    sku: "RNB-AME",
    price: 22_000,
    stock: 0,
    kind: "menu",
    category: "minuman",
    unit: "porsi",
    isActive: true,
  },
  {
    name: "Cafe Latte",
    sku: "RNB-LAT",
    price: 28_000,
    stock: 0,
    kind: "menu",
    category: "minuman",
    unit: "porsi",
    isActive: true,
  },
  {
    name: "Butter Croissant",
    sku: "RNB-CRO",
    price: 18_000,
    stock: 0,
    kind: "menu",
    category: "makanan",
    unit: "pcs",
    isActive: true,
  },
]

export const DEMO_INGREDIENTS: ProductInput[] = [
  {
    name: "Biji espresso",
    sku: "BHN-ESP",
    price: 0,
    stock: 2_000,
    kind: "ingredient",
    category: "bahan",
    unit: "g",
    lowStock: 400,
    isActive: true,
  },
  {
    name: "Susu full cream",
    sku: "BHN-SUS",
    price: 0,
    stock: 4_000,
    kind: "ingredient",
    category: "bahan",
    unit: "ml",
    lowStock: 800,
    isActive: true,
  },
  {
    name: "Gula aren",
    sku: "BHN-GAR",
    price: 0,
    stock: 1_500,
    kind: "ingredient",
    category: "bahan",
    unit: "g",
    lowStock: 300,
    isActive: true,
  },
  {
    name: "Tepung terigu",
    sku: "BHN-TEP",
    price: 0,
    stock: 5_000,
    kind: "ingredient",
    category: "bahan",
    unit: "g",
    lowStock: 1_000,
    isActive: true,
  },
  {
    name: "Butter",
    sku: "BHN-BTR",
    price: 0,
    stock: 2_000,
    kind: "ingredient",
    category: "bahan",
    unit: "g",
    lowStock: 400,
    isActive: true,
  },
]

const DEMO_RECIPES: Record<string, Array<{ sku: string; qty: number }>> = {
  "RNB-ESP": [{ sku: "BHN-ESP", qty: 18 }],
  "RNB-AME": [{ sku: "BHN-ESP", qty: 18 }],
  "RNB-LAT": [
    { sku: "BHN-ESP", qty: 18 },
    { sku: "BHN-SUS", qty: 180 },
  ],
  "RNB-CRO": [
    { sku: "BHN-TEP", qty: 80 },
    { sku: "BHN-BTR", qty: 40 },
  ],
}

const catalogSeed = new WeakMap<object, Promise<boolean>>()

function assertCanManageProducts(actor: StaffRecord): void {
  if (!canManageProducts(actor.roles)) {
    throw new Error(
      "Hanya owner atau manager yang boleh menambah atau mengubah produk."
    )
  }
}

function normalizeInput(input: ProductInput): ProductInput {
  const kind = productKindOf(input.kind ?? "menu")
  const name = input.name.trim()
  const sku = (input.sku.trim() || suggestSku(name, kind)).toUpperCase()
  const category =
    (input.category ?? "").trim() ||
    (kind === "ingredient" ? "bahan" : inferMenuCategory(name))
  const unit =
    (input.unit ?? "").trim() || (kind === "ingredient" ? "g" : "porsi")
  return {
    name,
    sku,
    price: Number(input.price) || 0,
    stock: Number(input.stock) || 0,
    kind,
    category,
    unit,
    note: (input.note ?? "").trim(),
    isActive: input.isActive ?? true,
    lowStock: Number(input.lowStock) || 0,
  }
}

function cellsOf(input: ProductInput, now: number, createdAt?: number) {
  return {
    name: input.name,
    sku: input.sku,
    price: input.price,
    stock: input.stock,
    kind: input.kind ?? "menu",
    category: input.category ?? "",
    unit: input.unit ?? "",
    note: input.note ?? "",
    isActive: input.isActive ?? true,
    lowStock: input.lowStock ?? 0,
    createdAt: createdAt ?? now,
    updatedAt: now,
  }
}

function toRecord(
  id: string,
  input: ProductInput,
  createdAt: number,
  updatedAt: number
): ProductRecord {
  const normalized = normalizeInput(input)
  return {
    id,
    name: normalized.name,
    sku: normalized.sku,
    price: normalized.price,
    stock: normalized.stock,
    kind: productKindOf(normalized.kind ?? "menu"),
    category: normalized.category ?? "",
    unit: normalized.unit ?? "",
    note: normalized.note ?? "",
    isActive: normalized.isActive ?? true,
    lowStock: normalized.lowStock ?? 0,
    createdAt,
    updatedAt,
  }
}

function skuTaken(
  database: Database,
  sku: string,
  exceptId?: string
): boolean {
  const want = sku.toUpperCase()
  return listRows(database, TABLES.products).some(
    (row) => row.id !== exceptId && cellStr(row, "sku").toUpperCase() === want
  )
}

function uniqueSku(database: Database, sku: string, exceptId?: string): string {
  if (!skuTaken(database, sku, exceptId)) return sku
  let n = 2
  while (skuTaken(database, `${sku}-${n}`, exceptId)) n += 1
  return `${sku}-${n}`
}

function productById(database: Database, id: string) {
  return listRows(database, TABLES.products).find((row) => row.id === id)
}

export async function createProduct(
  database: Database,
  actor: StaffRecord,
  input: ProductInput
): Promise<ProductRecord> {
  assertCanManageProducts(actor)
  await database.ready
  const normalized = normalizeInput(input)
  if (!normalized.name) {
    throw new Error("Nama wajib diisi.")
  }
  normalized.sku = uniqueSku(database, normalized.sku)
  const now = Date.now()
  const id = addRow(database, TABLES.products, cellsOf(normalized, now))
  return toRecord(id, normalized, now, now)
}

export async function updateProduct(
  database: Database,
  actor: StaffRecord,
  id: string,
  input: ProductInput
): Promise<ProductRecord> {
  assertCanManageProducts(actor)
  await database.ready
  const existing = productById(database, id)
  if (!existing) {
    throw new Error("Produk tidak ditemukan.")
  }
  const normalized = normalizeInput(input)
  if (!normalized.name) {
    throw new Error("Nama wajib diisi.")
  }
  normalized.sku = uniqueSku(database, normalized.sku, id)
  const now = Date.now()
  const createdAt =
    typeof existing.createdAt === "number" ? existing.createdAt : now
  updateRow(database, TABLES.products, id, cellsOf(normalized, now, createdAt))
  return toRecord(id, normalized, createdAt, now)
}

export async function deleteProduct(
  database: Database,
  actor: StaffRecord,
  product: { id: string }
): Promise<void> {
  assertCanManageProducts(actor)
  await database.ready
  const existing = productById(database, product.id)
  if (!existing) {
    throw new Error("Produk tidak ditemukan.")
  }

  const kind = productKindOf(cellStr(existing, "kind"))
  if (kind === "ingredient") {
    const used = listRows(database, TABLES.recipeLines).filter(
      (row) => cellStr(row, "ingredientId") === product.id
    )
    if (used.length > 0) {
      const names = used.map((line) => {
        const menu = productById(database, cellStr(line, "productId"))
        return menu ? cellStr(menu, "name") : "menu"
      })
      throw new Error(`Tidak bisa hapus: dipakai di ${uniq(names).join(", ")}.`)
    }
  }

  transact(database, () => {
    deleteMatching(
      database,
      TABLES.recipeLines,
      (row) => cellStr(row, "productId") === product.id
    )
    deleteRow(database, TABLES.products, product.id)
  })
}

export async function setRecipe(
  database: Database,
  actor: StaffRecord,
  productId: string,
  lines: readonly RecipeLineInput[]
): Promise<RecipeLineRecord[]> {
  assertCanManageProducts(actor)
  await database.ready
  const product = productById(database, productId)
  if (!product) {
    throw new Error("Produk tidak ditemukan.")
  }
  if (productKindOf(cellStr(product, "kind")) !== "menu") {
    throw new Error("Resep hanya untuk menu.")
  }

  const cleaned: RecipeLineInput[] = []
  for (const line of lines) {
    if (!line.ingredientId || !(Number(line.qty) > 0)) continue
    const ingredient = productById(database, line.ingredientId)
    if (!ingredient) {
      throw new Error("Bahan resep tidak ditemukan.")
    }
    if (productKindOf(cellStr(ingredient, "kind")) !== "ingredient") {
      throw new Error("Baris resep harus memakai bahan, bukan menu lain.")
    }
    const existing = cleaned.find((item) => item.ingredientId === line.ingredientId)
    if (existing) {
      existing.qty += Number(line.qty)
    } else {
      cleaned.push({ ingredientId: line.ingredientId, qty: Number(line.qty) })
    }
  }

  const now = Date.now()
  transact(database, () => {
    deleteMatching(
      database,
      TABLES.recipeLines,
      (row) => cellStr(row, "productId") === productId
    )
    for (const line of cleaned) {
      addRow(database, TABLES.recipeLines, {
        productId,
        ingredientId: line.ingredientId,
        qty: line.qty,
        createdAt: now,
      })
    }
  })

  return (await loadRecipeLines(database)).filter((row) => row.productId === productId)
}

export function seedCatalogIfEmpty(database: Database): Promise<boolean> {
  const key = database.store
  let pending = catalogSeed.get(key)
  if (!pending) {
    pending = ensureCatalog(database)
    catalogSeed.set(key, pending)
  }
  return pending
}

async function ensureCatalog(database: Database): Promise<boolean> {
  await database.ready
  const existing = listRows(database, TABLES.products)
  if (existing.length === 0) {
    seedFreshCatalog(database)
    return true
  }
  return backfillCatalog(database)
}

function seedFreshCatalog(database: Database): void {
  const now = Date.now()
  transact(database, () => {
    const bySku = new Map<string, string>()
    for (const item of [...DEMO_PRODUCTS, ...DEMO_INGREDIENTS]) {
      const normalized = normalizeInput(item)
      const id = addRow(database, TABLES.products, cellsOf(normalized, now))
      bySku.set(normalized.sku, id)
    }
    writeDemoRecipes(database, bySku, now)
  })
}

function backfillCatalog(database: Database): boolean {
  const now = Date.now()
  let changed = false
  transact(database, () => {
    for (const row of listRows(database, TABLES.products)) {
      const kind = productKindOf(cellStr(row, "kind"))
      const name = cellStr(row, "name")
      const patch: Record<string, string | number | boolean> = {}
      if (!cellStr(row, "kind")) {
        patch.kind = kind
      }
      if (!cellStr(row, "category")) {
        patch.category = kind === "ingredient" ? "bahan" : inferMenuCategory(name)
      }
      if (!cellStr(row, "unit")) {
        patch.unit = kind === "ingredient" ? "g" : name.toLowerCase().includes("croissant")
          ? "pcs"
          : "porsi"
      }
      if (!("isActive" in row)) {
        patch.isActive = true
      }
      if (Object.keys(patch).length > 0) {
        updateRow(database, TABLES.products, row.id, { ...patch, updatedAt: now })
        changed = true
      }
    }

    const bySku = skuIndex(database)
    for (const item of DEMO_INGREDIENTS) {
      const sku = item.sku.toUpperCase()
      if (bySku.has(sku)) continue
      const normalized = normalizeInput(item)
      const id = addRow(database, TABLES.products, cellsOf(normalized, now))
      bySku.set(sku, id)
      changed = true
    }

    if (listRows(database, TABLES.recipeLines).length === 0) {
      writeDemoRecipes(database, bySku, now)
      changed = true
    }
  })
  return changed
}

function writeDemoRecipes(
  database: Database,
  bySku: Map<string, string>,
  now: number
): void {
  for (const [menuSku, lines] of Object.entries(DEMO_RECIPES)) {
    const productId = bySku.get(menuSku)
    if (!productId) continue
    for (const line of lines) {
      const ingredientId = bySku.get(line.sku)
      if (!ingredientId) continue
      addRow(database, TABLES.recipeLines, {
        productId,
        ingredientId,
        qty: line.qty,
        createdAt: now,
      })
    }
  }
}

function skuIndex(database: Database): Map<string, string> {
  const bySku = new Map<string, string>()
  for (const row of listRows(database, TABLES.products)) {
    const sku = cellStr(row, "sku").toUpperCase()
    if (sku) bySku.set(sku, row.id)
  }
  return bySku
}

function uniq(values: string[]): string[] {
  return [...new Set(values)]
}

export { loadProducts, loadRecipeLines }
