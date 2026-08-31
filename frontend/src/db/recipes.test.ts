import { describe, expect, test } from "bun:test"

import { addRow, createRollposDatabase, TABLES } from "./database"
import { loadRecipes, saveRecipe } from "./recipes"

function fixture() {
  const database = createRollposDatabase({ inMemory: true })
  const menuProductId = addRow(database, TABLES.products, {
    name: "Jus Strawberry",
    sku: "RNB-JUS-STRAWBERRY",
    kind: "menu",
    isActive: true,
  })
  const strawberryId = addRow(database, TABLES.inventoryItems, {
    name: "Strawberry",
    sku: "INV-STRAWBERRY",
    baseUnit: "kg",
    isActive: true,
  })
  return { database, menuProductId, strawberryId }
}

describe("recipe lokal", () => {
  test("menyimpan header, versi, status, dan ingredient inventory", async () => {
    const { database, menuProductId, strawberryId } = fixture()
    await saveRecipe(database, {
      menuProductId,
      version: 2,
      isActive: true,
      ingredients: [
        { inventoryItemId: strawberryId, quantity: 200, unit: "g" },
      ],
    })
    const [recipe] = await loadRecipes(database)
    expect(recipe.menuName).toBe("Jus Strawberry")
    expect(recipe.version).toBe(2)
    expect(recipe.ingredients[0]).toMatchObject({
      inventoryItemName: "Strawberry",
      quantity: 200,
      unit: "g",
    })
  })

  test("edit mengganti ingredient secara atomik dan mempertahankan id", async () => {
    const { database, menuProductId, strawberryId } = fixture()
    const id = await saveRecipe(database, {
      menuProductId,
      version: 1,
      isActive: true,
      ingredients: [
        { inventoryItemId: strawberryId, quantity: 200, unit: "g" },
      ],
    })
    await saveRecipe(
      database,
      {
        menuProductId,
        version: 2,
        isActive: false,
        ingredients: [
          { inventoryItemId: strawberryId, quantity: 250, unit: "g" },
        ],
      },
      id
    )
    const [recipe] = await loadRecipes(database)
    expect(recipe).toMatchObject({ id, version: 2, isActive: false })
    expect(recipe.ingredients).toHaveLength(1)
    expect(recipe.ingredients[0].quantity).toBe(250)
  })

  test("menolak quantity nol dan ingredient ganda", async () => {
    const { database, menuProductId, strawberryId } = fixture()
    await expect(
      saveRecipe(database, {
        menuProductId,
        version: 1,
        isActive: true,
        ingredients: [
          { inventoryItemId: strawberryId, quantity: 0, unit: "g" },
        ],
      })
    ).rejects.toThrow("lebih dari 0")
    await expect(
      saveRecipe(database, {
        menuProductId,
        version: 1,
        isActive: true,
        ingredients: [
          { inventoryItemId: strawberryId, quantity: 100, unit: "g" },
          { inventoryItemId: strawberryId, quantity: 100, unit: "g" },
        ],
      })
    ).rejects.toThrow("dua kali")
  })
})
