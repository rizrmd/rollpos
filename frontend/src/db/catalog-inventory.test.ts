import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import { IDBFactory, IDBObjectStore } from "fake-indexeddb"
import {
  createRollposDatabase,
  listRows,
  persistentOperation,
  TABLES,
} from "./database"
import {
  createProduct,
  deleteProduct,
  loadProducts,
  loadRecipeLines,
  seedCatalogIfEmpty,
  setRecipe,
  updateProduct,
} from "./catalog"
import {
  loadInventory,
  loadInventoryLots,
  receiveInventory,
  recordInventoryWaste,
} from "./inventory"
import { loadRecipes, saveRecipe } from "./recipes"
import { loadKitchenOrders, startKitchenItem } from "./kitchen"
import { createOpenOrder, payOrderNonCash } from "./orders"
import { type StaffRecord } from "@/lib/types"

const originalIndexedDB = globalThis.indexedDB
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})
afterEach(() => {
  globalThis.indexedDB = originalIndexedDB
})
const actor = { id: "owner", roles: ["owner"] } as StaffRecord
const menuInput = { name: "Latte", sku: "LAT", price: 28000, stock: 0 }
const milkInput = {
  name: "Susu",
  sku: "SUS",
  price: 0,
  stock: 1000,
  kind: "ingredient" as const,
  unit: "ml",
  lowStock: 100,
}

async function fixture() {
  const dbName = crypto.randomUUID()
  const db = createRollposDatabase({ dbName })
  const menu = await createProduct(db, actor, menuInput)
  const milk = await createProduct(db, actor, milkInput)
  const inventory = loadInventory(db)[0]!
  await setRecipe(db, actor, menu.id, [{ ingredientId: milk.id, qty: 100 }])
  const order = await createOpenOrder(db, [
    { menuProductId: menu.id, name: menu.name, quantity: 2, price: menu.price },
  ])
  await payOrderNonCash(db, {
    orderId: order.id,
    method: "QRIS",
    actorStaffId: actor.id,
  })
  return { db, dbName, menu, milk, inventory }
}

test("Katalog ↔ Recipe → Kitchen START → stok memakai data yang sama, termasuk reload", async () => {
  const { db, dbName, menu, milk, inventory } = await fixture()
  const recipe = (await loadRecipes(db))[0]!
  expect(recipe.ingredients[0]!.inventoryItemId).toBe(inventory.id)
  const snapshots: number[] = []
  const listener = db.store.addTablesListener(() =>
    snapshots.push(loadInventory(db)[0]!.balance)
  )
  await saveRecipe(
    db,
    {
      menuProductId: menu.id,
      version: 3,
      isActive: true,
      ingredients: [
        { inventoryItemId: inventory.id, quantity: 0.2, unit: "l" },
      ],
    },
    recipe.id
  )
  expect((await loadRecipeLines(db))[0]!.qty).toBe(200)
  await setRecipe(db, actor, menu.id, [{ ingredientId: milk.id, qty: 150 }])
  expect((await loadRecipes(db))[0]).toMatchObject({
    id: recipe.id,
    version: 3,
    ingredients: [{ quantity: 150, unit: "ml" }],
  })
  const kitchenItem = (await loadKitchenOrders(db))[0]!.items[0]!
  expect(kitchenItem.recipe!.ingredients[0]!.quantity).toBe(150)
  await startKitchenItem(db, kitchenItem.id)
  expect(loadInventory(db)[0]!.balance).toBe(700)
  expect(
    (await loadProducts(db)).find((row) => row.id === milk.id)!.stock
  ).toBe(700)
  expect(loadInventoryLots(db, inventory.id)[0]!.remainingQuantity).toBe(700)
  expect(snapshots.at(-1)).toBe(700)
  db.store.delListener(listener)
  const reopened = createRollposDatabase({ dbName })
  await reopened.ready
  expect(await loadProducts(reopened)).toEqual(await loadProducts(db))
  expect(await loadRecipes(reopened)).toEqual(await loadRecipes(db))
  expect(await loadKitchenOrders(reopened)).toEqual(await loadKitchenOrders(db))
  expect(listRows(reopened, TABLES.recipeLines)).toEqual([])
  expect(
    listRows(reopened, TABLES.products).every((row) => row.kind === "menu")
  ).toBe(true)
})

test("receive/waste langsung terlihat di katalog; form metadata usang tidak menimpa saldo", async () => {
  const { db, milk, inventory } = await fixture()
  const lot = await receiveInventory(db, {
    inventoryItemId: inventory.id,
    quantity: 500,
    unit: "ml",
    receivedDate: "2026-09-05",
    actorStaffId: actor.id,
  })
  await recordInventoryWaste(db, {
    inventoryLotId: lot,
    quantity: 50,
    reason: "Damaged",
    actorStaffId: actor.id,
  })
  await updateProduct(db, actor, milk.id, {
    ...milkInput,
    name: "Susu segar",
    lowStock: 200,
    isActive: false,
  })
  expect(loadInventory(db)[0]).toMatchObject({
    name: "Susu segar",
    balance: 1450,
    minimumStock: 200,
    isActive: false,
  })
  expect(
    (await loadProducts(db)).find((row) => row.id === milk.id)
  ).toMatchObject({ stock: 1450, name: "Susu segar" })
  expect((await loadRecipes(db))[0]!.ingredients[0]!.inventoryItemName).toBe(
    "Susu segar"
  )
  const before = db.store.getContent()
  await expect(
    updateProduct(db, actor, milk.id, { ...milkInput, unit: "g" })
  ).rejects.toThrow("Satuan")
  await expect(deleteProduct(db, actor, milk)).rejects.toThrow("dipakai")
  expect(db.store.getContent()).toEqual(before)
})

test("nonaktif dan hapus recipe dari katalog langsung memblokir START; seed tidak menghidupkannya kembali", async () => {
  const { db, dbName, menu, milk, inventory } = await fixture()
  const recipe = (await loadRecipes(db))[0]!
  await saveRecipe(
    db,
    {
      menuProductId: menu.id,
      version: 4,
      isActive: false,
      ingredients: [
        { inventoryItemId: inventory.id, quantity: 100, unit: "ml" },
      ],
    },
    recipe.id
  )
  await setRecipe(db, actor, menu.id, [{ ingredientId: milk.id, qty: 200 }])
  const item = (await loadKitchenOrders(db))[0]!.items[0]!
  expect(item.recipe).toBeNull()
  await expect(startKitchenItem(db, item.id)).rejects.toThrow(
    "aktif belum tersedia"
  )
  await setRecipe(db, actor, menu.id, [])
  const reopened = createRollposDatabase({ dbName })
  await seedCatalogIfEmpty(reopened)
  expect(await loadRecipes(reopened)).toEqual([])
  expect(await loadRecipeLines(reopened)).toEqual([])
})

test("migrasi lokal idempotent mempertahankan inventory/recipe canonical serta saldo lama yang belum ada", async () => {
  const { db, dbName, menu, inventory } = await fixture()
  await persistentOperation(async (draft) => {
    draft.store.setRow(TABLES.products, "legacy-milk", {
      ...milkInput,
      stock: 9999,
      createdAt: 1,
      updatedAt: 1,
    })
    draft.store.setRow(TABLES.products, "legacy-beans", {
      name: "Biji kopi",
      sku: "BEAN",
      kind: "ingredient",
      unit: "g",
      stock: 250,
      price: 0,
      note: "Arabika",
      createdAt: 1,
      updatedAt: 1,
    })
    draft.store.setRow(TABLES.products, "espresso", {
      ...menuInput,
      name: "Espresso",
      sku: "ESP",
      kind: "menu",
    })
    draft.store.setRow(TABLES.recipeLines, "old-milk", {
      productId: menu.id,
      ingredientId: "legacy-milk",
      qty: 999,
    })
    draft.store.setRow(TABLES.recipeLines, "old-beans", {
      productId: "espresso",
      ingredientId: "legacy-beans",
      qty: 18,
    })
  })(db)
  const reopened = createRollposDatabase({ dbName })
  await reopened.ready
  expect(
    loadInventory(reopened).find((row) => row.id === inventory.id)!.balance
  ).toBe(1000)
  expect(loadInventory(reopened)).toHaveLength(2)
  expect(
    (await loadRecipes(reopened)).find((row) => row.menuProductId === menu.id)!
      .ingredients[0]!.quantity
  ).toBe(100)
  const beans = (await loadProducts(reopened)).find(
    (row) => row.sku === "BEAN"
  )!
  expect(beans).toMatchObject({ stock: 250, note: "Arabika" })
  expect(
    (await loadRecipeLines(reopened)).find(
      (row) => row.productId === "espresso"
    )
  ).toMatchObject({ ingredientId: beans.id, qty: 18 })
  const again = createRollposDatabase({ dbName })
  await again.ready
  expect(again.store.getContent()).toEqual(reopened.store.getContent())
})

test("gagal commit recipe tidak menerbitkan perubahan parsial ke katalog/Kitchen atau reload", async () => {
  const { db, dbName, menu, milk } = await fixture()
  const before = db.store.getContent()
  const mock = spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
    throw new Error("quota")
  })
  try {
    await expect(
      setRecipe(db, actor, menu.id, [{ ingredientId: milk.id, qty: 300 }])
    ).rejects.toThrow("IndexedDB")
    expect(db.store.getContent()).toEqual(before)
  } finally {
    mock.mockRestore()
  }
  const reopened = createRollposDatabase({ dbName })
  await reopened.ready
  expect(reopened.store.getContent()).toEqual(before)
})

test("migrasi gagal commit tetap menyimpan tabel lama utuh dan dapat dicoba ulang", async () => {
  const dbName = crypto.randomUUID()
  const db = createRollposDatabase({ dbName })
  await persistentOperation(async (draft) => {
    draft.store.setRow(TABLES.products, "legacy", { ...milkInput, stock: 300 })
  })(db)
  const before = db.store.getContent()
  const mock = spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
    throw new Error("quota")
  })
  try {
    const failed = createRollposDatabase({ dbName })
    await expect(failed.ready).rejects.toThrow("quota")
    expect(failed.store.getTable(TABLES.inventoryItems)).toEqual({})
  } finally {
    mock.mockRestore()
  }
  const { openStorage, readStorage } = await import("./indexed-db")
  const storage = await openStorage(dbName)
  expect(await readStorage(storage)).toEqual(before)
  storage.close()
  const retry = createRollposDatabase({ dbName })
  await retry.ready
  expect(loadInventory(retry)[0]!.balance).toBe(300)
})

test("migrasi SKU sama dengan unit berbeda memakai inventory yang sama dan mengonversi resep", async () => {
  const dbName = crypto.randomUUID()
  const db = createRollposDatabase({ dbName })
  await persistentOperation(async (draft) => {
    draft.store.setRow(TABLES.inventoryItems, "beans", {
      name: "Biji kopi",
      sku: "BEAN",
      baseUnit: "kg",
    })
    draft.store.setRow(TABLES.products, "old-beans", {
      name: "Biji kopi",
      sku: "BEAN",
      kind: "ingredient",
      unit: "g",
      stock: 2000,
    })
    draft.store.setRow(TABLES.products, "espresso", {
      ...menuInput,
      kind: "menu",
    })
    draft.store.setRow(TABLES.recipeLines, "line", {
      productId: "espresso",
      ingredientId: "old-beans",
      qty: 18,
    })
  })(db)
  const reopened = createRollposDatabase({ dbName })
  await reopened.ready
  expect(loadInventory(reopened)).toHaveLength(1)
  expect(loadInventory(reopened)[0]!.balance).toBe(0)
  expect((await loadRecipes(reopened))[0]!.ingredients[0]).toMatchObject({
    inventoryItemId: "beans",
    quantity: 18,
    unit: "g",
  })
  expect((await loadRecipeLines(reopened))[0]!.qty).toBe(0.018)
})
