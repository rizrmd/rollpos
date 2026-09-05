import { convertQuantity } from "@/lib/recipe-units"
import {
  persistentOperation,
  addRow,
  cellFlag,
  cellNum,
  cellStr,
  deleteMatching,
  listRows,
  transact,
  updateRow,
  type Database,
  TABLES,
} from "./database"

export const RECIPE_UNITS = ["g", "kg", "ml", "l", "pcs"] as const
export type RecipeUnit = (typeof RECIPE_UNITS)[number]

export type RecipeIngredient = {
  id: string
  inventoryItemId: string
  inventoryItemName: string
  quantity: number
  unit: RecipeUnit
  sortOrder: number
}

export type Recipe = {
  id: string
  menuProductId: string
  menuName: string
  version: number
  isActive: boolean
  ingredients: RecipeIngredient[]
  createdAt: number
  updatedAt: number
}

export type SaveRecipeInput = {
  menuProductId: string
  version: number
  isActive: boolean
  ingredients: Array<{
    inventoryItemId: string
    quantity: number
    unit: string
  }>
}

function isRecipeUnit(value: string): value is RecipeUnit {
  return (RECIPE_UNITS as readonly string[]).includes(value)
}

export async function loadRecipes(database: Database): Promise<Recipe[]> {
  await database.ready
  const products = new Map(
    listRows(database, TABLES.products).map((row) => [
      row.id,
      { name: cellStr(row, "name"), kind: cellStr(row, "kind") },
    ])
  )
  const inventory = new Map(
    listRows(database, TABLES.inventoryItems).map((row) => [
      row.id,
      cellStr(row, "name"),
    ])
  )
  const lines = listRows(database, TABLES.recipeIngredients)

  return listRows(database, TABLES.recipes)
    .map((row) => ({
      id: row.id,
      menuProductId: cellStr(row, "menuProductId"),
      menuName:
        products.get(cellStr(row, "menuProductId"))?.name ||
        "Menu tidak ditemukan",
      version: cellNum(row, "version"),
      isActive: cellFlag(row, "isActive"),
      createdAt: cellNum(row, "createdAt"),
      updatedAt: cellNum(row, "updatedAt"),
      ingredients: lines
        .filter((line) => cellStr(line, "recipeId") === row.id)
        .map((line) => ({
          id: line.id,
          inventoryItemId: cellStr(line, "inventoryItemId"),
          inventoryItemName:
            inventory.get(cellStr(line, "inventoryItemId")) ||
            "Ingredient tidak ditemukan",
          quantity: cellNum(line, "quantity"),
          unit: cellStr(line, "unit") as RecipeUnit,
          sortOrder: cellNum(line, "sortOrder"),
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .sort((a, b) => a.menuName.localeCompare(b.menuName, "id"))
}

function validateRecipe(
  database: Database,
  input: SaveRecipeInput,
  recipeId?: string
) {
  const product = database.store.getRow(TABLES.products, input.menuProductId)
  if (
    !database.store.hasRow(TABLES.products, input.menuProductId) ||
    cellStr(product, "kind") !== "menu"
  ) {
    throw new Error("Menu wajib dipilih dan harus tersedia di katalog.")
  }
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new Error("Versi recipe harus berupa angka bulat minimal 1.")
  }
  if (input.ingredients.length === 0)
    throw new Error("Tambahkan minimal satu ingredient.")
  const duplicate = new Set<string>()
  for (const line of input.ingredients) {
    if (!database.store.hasRow(TABLES.inventoryItems, line.inventoryItemId)) {
      throw new Error("Ingredient inventory tidak ditemukan.")
    }
    if (duplicate.has(line.inventoryItemId))
      throw new Error("Ingredient yang sama tidak boleh ditambahkan dua kali.")
    duplicate.add(line.inventoryItemId)
    if (!Number.isFinite(line.quantity) || line.quantity <= 0)
      throw new Error("Quantity ingredient harus lebih dari 0.")
    convertQuantity(
      line.quantity,
      line.unit,
      cellStr(
        database.store.getRow(TABLES.inventoryItems, line.inventoryItemId),
        "baseUnit"
      )
    )
    if (!isRecipeUnit(line.unit))
      throw new Error("Unit ingredient tidak valid.")
  }
  const menuUsed = listRows(database, TABLES.recipes).some(
    (row) =>
      row.id !== recipeId &&
      cellStr(row, "menuProductId") === input.menuProductId
  )
  if (menuUsed)
    throw new Error(
      "Menu tersebut sudah memiliki recipe. Edit recipe yang ada."
    )
}

export const saveRecipe = persistentOperation(async function (
  database: Database,
  input: SaveRecipeInput,
  recipeId?: string
): Promise<string> {
  await database.ready
  validateRecipe(database, input, recipeId)
  if (recipeId && !database.store.hasRow(TABLES.recipes, recipeId)) {
    throw new Error("Recipe tidak ditemukan.")
  }
  const now = Date.now()
  let id = recipeId ?? ""
  transact(database, () => {
    if (recipeId) {
      updateRow(database, TABLES.recipes, recipeId, {
        menuProductId: input.menuProductId,
        version: input.version,
        isActive: input.isActive,
        updatedAt: now,
      })
      deleteMatching(
        database,
        TABLES.recipeIngredients,
        (row) => cellStr(row, "recipeId") === recipeId
      )
    } else {
      id = addRow(database, TABLES.recipes, {
        menuProductId: input.menuProductId,
        version: input.version,
        isActive: input.isActive,
        createdAt: now,
        updatedAt: now,
      })
    }
    input.ingredients.forEach((line, index) => {
      addRow(database, TABLES.recipeIngredients, {
        recipeId: id,
        inventoryItemId: line.inventoryItemId,
        quantity: line.quantity,
        unit: line.unit,
        sortOrder: index,
        createdAt: now,
        updatedAt: now,
      })
    })
  })
  return id
})
