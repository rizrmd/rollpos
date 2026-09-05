import {
  catalogIngredientId,
  inventoryIdFromCatalog,
  migrateCatalogInventory,
} from "./catalog-inventory-migration"
import { loadInventory, receiveInventory } from "./inventory"
import { saveRecipe } from "./recipes"
import { todayJakarta } from "@/lib/time"
import {
  persistentOperation,
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
import {
  loadMenuCategories,
  loadProducts,
  loadRecipeLines,
} from "@/db/snapshot"
import {
  inferMenuCategory,
  isReservedCategorySlug,
  prettyCategoryName,
  slugifyCategory,
  suggestSku,
} from "@/lib/catalog"
import { canManageProducts } from "@/lib/permissions"
import {
  DEFAULT_MENU_CATEGORY_DEFS,
  productKindOf,
  type MenuCategoryRecord,
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

function categoryRows(database: Database) {
  return listRows(database, TABLES.menuCategories)
}

function findCategory(
  database: Database,
  nameOrSlug: string
):
  | (ReturnType<typeof listRows>[number] & { slug: string; name: string })
  | undefined {
  const raw = nameOrSlug.trim()
  if (!raw) return undefined
  const slug = slugifyCategory(raw)
  const lower = raw.toLowerCase()
  return categoryRows(database).find((row) => {
    const rowSlug = cellStr(row, "slug")
    const rowName = cellStr(row, "name")
    return (
      rowSlug === slug || rowSlug === raw || rowName.toLowerCase() === lower
    )
  }) as
    | (ReturnType<typeof listRows>[number] & { slug: string; name: string })
    | undefined
}

function nextCategorySort(database: Database): number {
  let max = 0
  for (const row of categoryRows(database)) {
    const order = typeof row.sortOrder === "number" ? row.sortOrder : 0
    if (order > max) max = order
  }
  return max + 1
}

function toCategoryRecord(
  id: string,
  slug: string,
  name: string,
  sortOrder: number,
  createdAt: number,
  updatedAt: number
): MenuCategoryRecord {
  return { id, slug, name, sortOrder, createdAt, updatedAt }
}

function writeCategory(
  database: Database,
  name: string,
  options?: { allowExisting?: boolean }
): MenuCategoryRecord {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error("Nama kategori wajib diisi.")
  }
  const slug = slugifyCategory(trimmed)
  if (!slug || isReservedCategorySlug(slug)) {
    throw new Error("Nama kategori tidak valid.")
  }
  const existing =
    findCategory(database, trimmed) ?? findCategory(database, slug)
  if (existing) {
    if (options?.allowExisting) {
      return toCategoryRecord(
        existing.id,
        cellStr(existing, "slug"),
        cellStr(existing, "name"),
        typeof existing.sortOrder === "number" ? existing.sortOrder : 0,
        typeof existing.createdAt === "number"
          ? existing.createdAt
          : Date.now(),
        typeof existing.updatedAt === "number" ? existing.updatedAt : Date.now()
      )
    }
    throw new Error("Kategori sudah ada.")
  }
  const now = Date.now()
  const sortOrder = nextCategorySort(database)
  const id = addRow(database, TABLES.menuCategories, {
    slug,
    name: trimmed,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  })
  return toCategoryRecord(id, slug, trimmed, sortOrder, now, now)
}

function registerMenuCategory(database: Database, category: string): string {
  return writeCategory(database, prettyCategoryName(category), {
    allowExisting: true,
  }).slug
}

function ensureDefaultCategories(database: Database): boolean {
  let changed = false
  for (const def of DEFAULT_MENU_CATEGORY_DEFS) {
    if (findCategory(database, def.slug)) continue
    writeCategory(database, def.name, { allowExisting: true })
    changed = true
  }
  return changed
}

function ensureCategoriesFromProducts(database: Database): boolean {
  let changed = false
  for (const row of listRows(database, TABLES.products)) {
    if (productKindOf(cellStr(row, "kind")) !== "menu") continue
    const category = cellStr(row, "category").trim()
    if (!category || isReservedCategorySlug(category)) continue
    if (findCategory(database, category)) continue
    writeCategory(database, prettyCategoryName(category), {
      allowExisting: true,
    })
    changed = true
  }
  return changed
}

export const createMenuCategory = persistentOperation(async function (
  database: Database,
  actor: StaffRecord,
  input: { name: string }
): Promise<MenuCategoryRecord> {
  assertCanManageProducts(actor)
  await database.ready
  return writeCategory(database, input.name)
})

export const deleteMenuCategory = persistentOperation(async function (
  database: Database,
  actor: StaffRecord,
  category: { id: string }
): Promise<void> {
  assertCanManageProducts(actor)
  await database.ready
  const existing = categoryRows(database).find((row) => row.id === category.id)
  if (!existing) {
    throw new Error("Kategori tidak ditemukan.")
  }
  const slug = cellStr(existing, "slug")
  const used = listRows(database, TABLES.products).filter(
    (row) =>
      productKindOf(cellStr(row, "kind")) === "menu" &&
      cellStr(row, "category") === slug
  )
  if (used.length > 0) {
    throw new Error(`Tidak bisa hapus: masih dipakai ${used.length} menu.`)
  }
  deleteRow(database, TABLES.menuCategories, existing.id)
})

function skuTaken(database: Database, sku: string, exceptId?: string): boolean {
  const want = sku.toUpperCase()
  return [
    ...listRows(database, TABLES.products),
    ...listRows(database, TABLES.inventoryItems).map((row) => ({
      ...row,
      id: catalogIngredientId(row.id),
    })),
  ].some(
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

export const createProduct = persistentOperation(async function (
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
  if (normalized.kind === "menu") {
    normalized.category = registerMenuCategory(
      database,
      normalized.category ?? ""
    )
  }
  normalized.sku = uniqueSku(database, normalized.sku)
  const now = Date.now()
  if (normalized.kind === "ingredient") {
    if (!Number.isFinite(input.stock) || input.stock < 0)
      throw new Error("Stok awal tidak valid.")
    const id = addRow(
      database,
      TABLES.inventoryItems,
      inventoryCells(normalized, now)
    )
    if (normalized.stock > 0)
      await receiveInventory(database, {
        inventoryItemId: id,
        quantity: normalized.stock,
        unit: normalized.unit!,
        receivedDate: todayJakarta(),
        notes: "Stok awal katalog",
        actorStaffId: actor.id,
      })
    return toRecord(catalogIngredientId(id), normalized, now, now)
  }
  const id = addRow(database, TABLES.products, cellsOf(normalized, now))
  return toRecord(id, normalized, now, now)
})

export const updateProduct = persistentOperation(async function (
  database: Database,
  actor: StaffRecord,
  id: string,
  input: ProductInput
): Promise<ProductRecord> {
  assertCanManageProducts(actor)
  await database.ready
  const inventoryId = inventoryIdFromCatalog(id)
  if (inventoryId) {
    const existing = loadInventory(database).find(
      (item) => item.id === inventoryId
    )
    if (!existing) throw new Error("Bahan tidak ditemukan.")
    const normalized = normalizeInput(input)
    if (!normalized.name) throw new Error("Nama wajib diisi.")
    if (normalized.kind !== "ingredient")
      throw new Error("Jenis bahan tidak dapat diubah.")
    // Stock is edited through lot operations; a stale catalog form cannot overwrite it.
    normalized.stock = existing.balance
    const referenced =
      listRows(database, TABLES.inventoryLots).some(
        (row) => row.inventoryItemId === inventoryId
      ) ||
      listRows(database, TABLES.recipeIngredients).some(
        (row) => row.inventoryItemId === inventoryId
      )
    if (normalized.unit !== existing.baseUnit && referenced)
      throw new Error("Satuan bahan yang sudah dipakai tidak dapat diubah.")
    normalized.sku = uniqueSku(database, normalized.sku, id)
    const now = Date.now()
    const createdAt = Number(
      database.store.getCell(TABLES.inventoryItems, inventoryId, "createdAt")
    )
    updateRow(
      database,
      TABLES.inventoryItems,
      inventoryId,
      inventoryCells(normalized, now, createdAt)
    )
    return toRecord(id, normalized, createdAt, now)
  }
  const existing = productById(database, id)
  if (!existing) {
    throw new Error("Produk tidak ditemukan.")
  }
  const normalized = normalizeInput(input)
  if (!normalized.name) {
    throw new Error("Nama wajib diisi.")
  }
  if (normalized.kind === "menu") {
    normalized.category = registerMenuCategory(
      database,
      normalized.category ?? ""
    )
  }
  if (normalized.kind !== "menu")
    throw new Error("Jenis menu tidak dapat diubah.")
  normalized.sku = uniqueSku(database, normalized.sku, id)
  const now = Date.now()
  const createdAt =
    typeof existing.createdAt === "number" ? existing.createdAt : now
  updateRow(database, TABLES.products, id, cellsOf(normalized, now, createdAt))
  return toRecord(id, normalized, createdAt, now)
})

export const deleteProduct = persistentOperation(async function (
  database: Database,
  actor: StaffRecord,
  product: { id: string }
): Promise<void> {
  assertCanManageProducts(actor)
  await database.ready
  const inventoryId = inventoryIdFromCatalog(product.id)
  if (inventoryId) {
    if (!database.store.hasRow(TABLES.inventoryItems, inventoryId))
      throw new Error("Bahan tidak ditemukan.")
    const used = (await loadRecipeLines(database)).filter(
      (line) => line.ingredientId === product.id
    )
    if (used.length) {
      const names = used.map((line) =>
        cellStr(database.store.getRow(TABLES.products, line.productId), "name")
      )
      throw new Error(`Tidak bisa hapus: dipakai di ${uniq(names).join(", ")}.`)
    }
    if (
      listRows(database, TABLES.inventoryStockMovements).some(
        (row) => row.inventoryItemId === inventoryId
      )
    ) {
      throw new Error(
        "Bahan memiliki riwayat stok. Nonaktifkan bahan untuk menyimpan riwayat lot."
      )
    }
    deleteRow(database, TABLES.inventoryItems, inventoryId)
    return
  }
  const existing = productById(database, product.id)
  if (!existing) {
    throw new Error("Produk tidak ditemukan.")
  }

  transact(database, () => {
    for (const recipe of listRows(database, TABLES.recipes).filter(
      (row) => row.menuProductId === product.id
    )) {
      deleteMatching(
        database,
        TABLES.recipeIngredients,
        (row) => row.recipeId === recipe.id
      )
      deleteRow(database, TABLES.recipes, recipe.id)
    }
    deleteMatching(
      database,
      TABLES.menuModifiers,
      (row) => cellStr(row, "menuProductId") === product.id
    )
    deleteRow(database, TABLES.products, product.id)
  })
})

export const setRecipe = persistentOperation(async function (
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
    const inventoryId = inventoryIdFromCatalog(line.ingredientId)
    if (!database.store.hasRow(TABLES.inventoryItems, inventoryId))
      throw new Error("Bahan resep tidak ditemukan.")
    const existing = cleaned.find(
      (item) => item.ingredientId === line.ingredientId
    )
    if (existing) existing.qty += Number(line.qty)
    else
      cleaned.push({ ingredientId: line.ingredientId, qty: Number(line.qty) })
  }
  const recipe = listRows(database, TABLES.recipes).find(
    (row) => row.menuProductId === productId
  )
  if (!cleaned.length) {
    if (recipe) {
      deleteMatching(
        database,
        TABLES.recipeIngredients,
        (row) => row.recipeId === recipe.id
      )
      deleteRow(database, TABLES.recipes, recipe.id)
    }
  } else {
    await saveRecipe(
      database,
      {
        menuProductId: productId,
        version: recipe ? Number(recipe.version) : 1,
        isActive: recipe ? Boolean(recipe.isActive) : true,
        ingredients: cleaned.map((line) => {
          const inventoryItemId = inventoryIdFromCatalog(line.ingredientId)
          return {
            inventoryItemId,
            quantity: line.qty,
            unit: cellStr(
              database.store.getRow(TABLES.inventoryItems, inventoryItemId),
              "baseUnit"
            ),
          }
        }),
      },
      recipe?.id
    )
  }

  return (await loadRecipeLines(database)).filter(
    (row) => row.productId === productId
  )
})

export function seedCatalogIfEmpty(database: Database): Promise<boolean> {
  const key = database.store
  let pending = catalogSeed.get(key)
  if (!pending) {
    pending = ensureCatalog(database)
    catalogSeed.set(key, pending)
  }
  return pending
}

const ensureCatalog = persistentOperation(async function (
  database: Database
): Promise<boolean> {
  await database.ready
  migrateCatalogInventory(database.store)
  const existing = listRows(database, TABLES.products)
  if (existing.length === 0) {
    seedFreshCatalog(database)
    return true
  }
  return backfillCatalog(database)
})

function seedFreshCatalog(database: Database): void {
  const now = Date.now()
  transact(database, () => {
    ensureDefaultCategories(database)
    const bySku = new Map<string, string>()
    for (const item of [...DEMO_PRODUCTS, ...DEMO_INGREDIENTS]) {
      const normalized = normalizeInput(item)
      const id =
        normalized.kind === "ingredient"
          ? seedIngredient(database, normalized, now)
          : addRow(database, TABLES.products, cellsOf(normalized, now))
      bySku.set(normalized.sku, id)
    }
    writeDemoRecipes(database, bySku, now)
  })
}

function backfillCatalog(database: Database): boolean {
  const now = Date.now()
  let changed = false
  transact(database, () => {
    if (ensureDefaultCategories(database)) changed = true
    if (ensureCategoriesFromProducts(database)) changed = true
    for (const row of listRows(database, TABLES.products)) {
      const kind = productKindOf(cellStr(row, "kind"))
      const name = cellStr(row, "name")
      const patch: Record<string, string | number | boolean> = {}
      if (!cellStr(row, "kind")) {
        patch.kind = kind
      }
      if (!cellStr(row, "category")) {
        patch.category =
          kind === "ingredient" ? "bahan" : inferMenuCategory(name)
      }
      if (!cellStr(row, "unit")) {
        patch.unit =
          kind === "ingredient"
            ? "g"
            : name.toLowerCase().includes("croissant")
              ? "pcs"
              : "porsi"
      }
      if (!("isActive" in row)) {
        patch.isActive = true
      }
      if (Object.keys(patch).length > 0) {
        updateRow(database, TABLES.products, row.id, {
          ...patch,
          updatedAt: now,
        })
        changed = true
      }
    }

    const bySku = skuIndex(database)
    if (listRows(database, TABLES.inventoryItems).length === 0) {
      for (const item of DEMO_INGREDIENTS) {
        const sku = item.sku.toUpperCase()
        if (bySku.has(sku)) continue
        const normalized = normalizeInput(item)
        const id = seedIngredient(database, normalized, now)
        bySku.set(sku, id)
        changed = true
      }

      if (listRows(database, TABLES.recipes).length === 0) {
        writeDemoRecipes(database, bySku, now)
        changed = true
      }
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
    if (
      listRows(database, TABLES.recipes).some(
        (row) => row.menuProductId === productId
      )
    )
      continue
    const recipeId = addRow(database, TABLES.recipes, {
      menuProductId: productId,
      version: 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    lines.forEach((line, sortOrder) => {
      const inventoryItemId = bySku.get(line.sku)
      if (!inventoryItemId) return
      addRow(database, TABLES.recipeIngredients, {
        recipeId,
        inventoryItemId,
        quantity: line.qty,
        unit: cellStr(
          database.store.getRow(TABLES.inventoryItems, inventoryItemId),
          "baseUnit"
        ),
        sortOrder,
        createdAt: now,
        updatedAt: now,
      })
    })
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

export { loadMenuCategories, loadProducts, loadRecipeLines }

function inventoryCells(input: ProductInput, now: number, createdAt = now) {
  return {
    name: input.name,
    sku: input.sku,
    baseUnit: input.unit ?? "g",
    minimumStock: input.lowStock ?? 0,
    isActive: input.isActive ?? true,
    price: input.price,
    note: input.note ?? "",
    category: input.category ?? "bahan",
    createdAt,
    updatedAt: now,
  }
}

function seedIngredient(
  database: Database,
  input: ProductInput,
  now: number
): string {
  const existing = listRows(database, TABLES.inventoryItems).find(
    (row) => row.sku === input.sku
  )
  if (existing) return existing.id
  const id = addRow(database, TABLES.inventoryItems, inventoryCells(input, now))
  if (input.stock > 0) {
    const lotId = addRow(database, TABLES.inventoryLots, {
      inventoryItemId: id,
      receivedQuantity: input.stock,
      remainingQuantity: input.stock,
      baseUnit: input.unit!,
      receivedAt: todayJakarta(),
      notes: "Stok awal katalog",
      createdAt: now,
      updatedAt: now,
    })
    addRow(database, TABLES.inventoryStockMovements, {
      inventoryItemId: id,
      inventoryLotId: lotId,
      movementType: "ADJUSTMENT",
      quantity: input.stock,
      unit: input.unit!,
      referenceType: "CATALOG_SEED",
      referenceId: id,
      reason: "Stok awal katalog",
      createdAt: now,
    })
  }
  return id
}
