import {
  persistentOperation,
  addRow,
  cellFlag,
  cellNum,
  cellStr,
  listRows,
  transact,
  updateRow,
  type Database,
  TABLES,
} from "./database"
import {
  isWasteReason,
  type InventoryItem,
  type InventoryLot,
  type WasteReason,
} from "@/lib/inventory"

const INVENTORY_SEED = [
  ["Strawberry", "INV-STRAWBERRY", "kg", 2],
  ["Gula Cair", "INV-GULA-CAIR", "ml", 500],
  ["Air", "INV-AIR", "ml", 2000],
  ["Es Batu", "INV-ES-BATU", "g", 1000],
  ["Straw", "INV-STRAW", "pcs", 30],
  ["Botol PET", "INV-BOTOL-PET", "pcs", 20],
] as const

export type ReceiveInventoryInput = {
  inventoryItemId: string
  quantity: number
  unit: string
  receivedDate: string
  expiryDate?: string | null
  lotCode?: string | null
  containerCode?: string | null
  notes?: string | null
  actorStaffId: string
}

export type RecordWasteInput = {
  inventoryLotId: string
  quantity: number
  reason: WasteReason
  actorStaffId: string
}

export const seedInventoryIfEmpty = persistentOperation(async function (database: Database): Promise<void> {
  await database.ready
  if (listRows(database, TABLES.inventoryItems).length > 0) return
  const now = Date.now()
  transact(database, () => {
    for (const [name, sku, baseUnit, minimumStock] of INVENTORY_SEED) {
      addRow(database, TABLES.inventoryItems, {
        name,
        sku,
        baseUnit,
        minimumStock,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
    }
  })
})

export function loadInventory(database: Database): InventoryItem[] {
  const balances = new Map<string, number>()
  for (const row of listRows(database, TABLES.inventoryStockMovements)) {
    const itemId = cellStr(row, "inventoryItemId")
    balances.set(itemId, (balances.get(itemId) ?? 0) + cellNum(row, "quantity"))
  }
  return listRows(database, TABLES.inventoryItems)
    .map((row) => ({
      id: row.id,
      name: cellStr(row, "name"),
      sku: cellStr(row, "sku"),
      baseUnit: cellStr(row, "baseUnit"),
      minimumStock: cellNum(row, "minimumStock"),
      isActive: cellFlag(row, "isActive"),
      balance: balances.get(row.id) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "id"))
}

export function loadInventoryLots(
  database: Database,
  itemId: string
): InventoryLot[] {
  return listRows(database, TABLES.inventoryLots)
    .filter((row) => cellStr(row, "inventoryItemId") === itemId)
    .map((row) => ({
      id: row.id,
      inventoryItemId: itemId,
      lotCode: cellStr(row, "lotCode") || null,
      receivedQuantity: cellNum(row, "receivedQuantity"),
      remainingQuantity: cellNum(row, "remainingQuantity"),
      baseUnit: cellStr(row, "baseUnit"),
      receivedAt: cellStr(row, "receivedAt"),
      expiryDate: cellStr(row, "expiryDate") || null,
      containerCode: cellStr(row, "containerCode") || null,
      notes: cellStr(row, "notes") || null,
    }))
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
}

function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  )
}

export const receiveInventory = persistentOperation(async function (
  database: Database,
  input: ReceiveInventoryInput
): Promise<string> {
  const itemRow = database.store.getRow(
    TABLES.inventoryItems,
    input.inventoryItemId
  )
  if (!database.store.hasRow(TABLES.inventoryItems, input.inventoryItemId))
    throw new Error("Item inventory tidak ditemukan.")
  if (!cellFlag(itemRow, "isActive"))
    throw new Error("Item inventory tidak aktif.")
  if (!Number.isFinite(input.quantity) || input.quantity <= 0)
    throw new Error("Quantity harus lebih dari 0.")
  if (input.unit !== cellStr(itemRow, "baseUnit"))
    throw new Error("Unit harus sama dengan base unit item.")
  if (!validDate(input.receivedDate))
    throw new Error("Received Date tidak valid.")
  if (input.expiryDate && !validDate(input.expiryDate))
    throw new Error("Expiry Date tidak valid.")
  if (input.expiryDate && input.expiryDate < input.receivedDate)
    throw new Error("Expiry tidak boleh sebelum tanggal penerimaan.")
  if (!input.actorStaffId.trim())
    throw new Error("Staff penerima wajib tersedia.")

  const now = Date.now()
  let lotId = ""
  transact(database, () => {
    lotId = addRow(database, TABLES.inventoryLots, {
      inventoryItemId: input.inventoryItemId,
      lotCode: input.lotCode?.trim() ?? "",
      receivedQuantity: input.quantity,
      remainingQuantity: input.quantity,
      baseUnit: input.unit,
      receivedAt: input.receivedDate,
      expiryDate: input.expiryDate ?? "",
      containerCode: input.containerCode?.trim() ?? "",
      notes: input.notes?.trim() ?? "",
      createdAt: now,
      updatedAt: now,
    })
    addRow(database, TABLES.inventoryStockMovements, {
      inventoryItemId: input.inventoryItemId,
      inventoryLotId: lotId,
      lotCode: input.lotCode?.trim() ?? "",
      containerCode: input.containerCode?.trim() ?? "",
      movementType: "RECEIVE",
      quantity: input.quantity,
      unit: input.unit,
      referenceType: "INVENTORY_RECEIVE",
      referenceId: lotId,
      reason: input.notes?.trim() ?? "",
      actorStaffId: input.actorStaffId,
      createdAt: now,
    })
  })
  return lotId
})

export const recordInventoryWaste = persistentOperation(async function (
  database: Database,
  input: RecordWasteInput
): Promise<string> {
  const lot = database.store.getRow(TABLES.inventoryLots, input.inventoryLotId)
  if (!database.store.hasRow(TABLES.inventoryLots, input.inventoryLotId))
    throw new Error("Lot inventory tidak ditemukan.")
  if (!Number.isFinite(input.quantity) || input.quantity <= 0)
    throw new Error("Quantity waste harus lebih dari 0.")
  if (!isWasteReason(input.reason)) throw new Error("Alasan waste tidak valid.")
  if (!input.actorStaffId.trim())
    throw new Error("Staff pencatat wajib tersedia.")

  const remainingQuantity = cellNum(lot, "remainingQuantity")
  if (input.quantity > remainingQuantity)
    throw new Error("Quantity waste tidak boleh melebihi saldo lot.")

  const now = Date.now()
  let movementId = ""
  transact(database, () => {
    movementId = addRow(database, TABLES.inventoryStockMovements, {
      inventoryItemId: cellStr(lot, "inventoryItemId"),
      inventoryLotId: input.inventoryLotId,
      lotCode: cellStr(lot, "lotCode"),
      containerCode: cellStr(lot, "containerCode"),
      movementType: "WASTE",
      quantity: -input.quantity,
      unit: cellStr(lot, "baseUnit"),
      referenceType: "INVENTORY_WASTE",
      referenceId: input.inventoryLotId,
      reason: input.reason,
      actorStaffId: input.actorStaffId,
      createdAt: now,
    })
    updateRow(database, TABLES.inventoryLots, input.inventoryLotId, {
      remainingQuantity: remainingQuantity - input.quantity,
      updatedAt: now,
    })
  })
  return movementId
})
