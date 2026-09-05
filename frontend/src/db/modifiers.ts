import {
  persistentOperation,
  addRow,
  cellNum,
  cellStr,
  deleteMatching,
  deleteRow,
  listRows,
  transact,
  updateRow,
  type Database,
  TABLES,
} from "@/db/database"
import { loadMenuModifiers, loadModifiers } from "@/db/snapshot"
import { canManageProducts } from "@/lib/permissions"
import {
  productKindOf,
  type ModifierRecord,
  type StaffRecord,
} from "@/lib/types"

export type ModifierInput = {
  name: string
  additionalPrice: number
  isActive?: boolean
}

function assertCanManage(actor: StaffRecord): void {
  if (!canManageProducts(actor.roles)) {
    throw new Error("Hanya owner atau manager yang boleh mengelola modifier.")
  }
}

function normalizeInput(input: ModifierInput): Required<ModifierInput> {
  const name = input.name.trim()
  const additionalPrice = Number(input.additionalPrice)
  if (!name) throw new Error("Nama modifier wajib diisi.")
  if (!Number.isFinite(additionalPrice) || additionalPrice < 0) {
    throw new Error("Harga tambahan tidak boleh negatif.")
  }
  return { name, additionalPrice, isActive: input.isActive ?? true }
}

function assertUniqueName(
  database: Database,
  name: string,
  exceptId?: string
): void {
  const normalized = name.toLocaleLowerCase("id")
  const duplicate = listRows(database, TABLES.modifiers).some(
    (row) =>
      row.id !== exceptId &&
      cellStr(row, "name").trim().toLocaleLowerCase("id") === normalized
  )
  if (duplicate) throw new Error("Nama modifier sudah ada.")
}

function toRecord(
  id: string,
  input: Required<ModifierInput>,
  createdAt: number,
  updatedAt: number
): ModifierRecord {
  return { id, ...input, createdAt, updatedAt }
}

export { loadMenuModifiers, loadModifiers }

export const createModifier = persistentOperation(async function (
  database: Database,
  actor: StaffRecord,
  input: ModifierInput
): Promise<ModifierRecord> {
  assertCanManage(actor)
  await database.ready
  const normalized = normalizeInput(input)
  assertUniqueName(database, normalized.name)
  const now = Date.now()
  const id = addRow(database, TABLES.modifiers, {
    ...normalized,
    createdAt: now,
    updatedAt: now,
  })
  return toRecord(id, normalized, now, now)
})

export const updateModifier = persistentOperation(async function (
  database: Database,
  actor: StaffRecord,
  id: string,
  input: ModifierInput
): Promise<ModifierRecord> {
  assertCanManage(actor)
  await database.ready
  const existing = listRows(database, TABLES.modifiers).find(
    (row) => row.id === id
  )
  if (!existing) throw new Error("Modifier tidak ditemukan.")
  const normalized = normalizeInput(input)
  assertUniqueName(database, normalized.name, id)
  const now = Date.now()
  const createdAt = cellNum(existing, "createdAt") || now
  updateRow(database, TABLES.modifiers, id, { ...normalized, updatedAt: now })
  return toRecord(id, normalized, createdAt, now)
})

export const deleteModifier = persistentOperation(async function (
  database: Database,
  actor: StaffRecord,
  id: string
): Promise<void> {
  assertCanManage(actor)
  await database.ready
  if (!database.store.hasRow(TABLES.modifiers, id)) {
    throw new Error("Modifier tidak ditemukan.")
  }
  transact(database, () => {
    deleteMatching(
      database,
      TABLES.menuModifiers,
      (row) => cellStr(row, "modifierId") === id
    )
    deleteRow(database, TABLES.modifiers, id)
  })
})

export const setMenuModifiers = persistentOperation(async function (
  database: Database,
  actor: StaffRecord,
  menuProductId: string,
  modifierIds: readonly string[]
): Promise<void> {
  assertCanManage(actor)
  await database.ready
  const menu = database.store.getRow(TABLES.products, menuProductId)
  if (
    !database.store.hasRow(TABLES.products, menuProductId) ||
    productKindOf(cellStr(menu, "kind")) !== "menu"
  ) {
    throw new Error("Menu tidak ditemukan.")
  }
  const uniqueIds = [...new Set(modifierIds)]
  for (const modifierId of uniqueIds) {
    if (!database.store.hasRow(TABLES.modifiers, modifierId)) {
      throw new Error("Modifier yang dipilih tidak ditemukan.")
    }
  }
  transact(database, () => {
    deleteMatching(
      database,
      TABLES.menuModifiers,
      (row) => cellStr(row, "menuProductId") === menuProductId
    )
    const now = Date.now()
    for (const modifierId of uniqueIds) {
      addRow(database, TABLES.menuModifiers, {
        menuProductId,
        modifierId,
        createdAt: now,
      })
    }
  })
})
