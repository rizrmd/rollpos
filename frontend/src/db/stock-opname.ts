import {
  persistentOperation,
  addRow,
  cellNum,
  cellStr,
  TABLES,
  transact,
  updateRow,
  type Database,
} from "./database"

export type StockOpnameInput = {
  inventoryLotId: string
  systemQuantity: number
  physicalQuantity: number
  actorStaffId: string
}

export const recordStockOpname = persistentOperation(async function (
  database: Database,
  input: StockOpnameInput
): Promise<string> {
  let movementId = ""
  transact(database, () => {
    if (!database.store.hasRow(TABLES.inventoryLots, input.inventoryLotId))
      throw new Error("Lot inventory tidak ditemukan.")
    if (!input.actorStaffId.trim())
      throw new Error("Staff pencatat wajib tersedia.")
    if (!Number.isFinite(input.physicalQuantity) || input.physicalQuantity < 0)
      throw new Error("Saldo fisik harus berupa angka 0 atau lebih.")
    const lot = database.store.getRow(
      TABLES.inventoryLots,
      input.inventoryLotId
    )
    const systemQuantity = cellNum(lot, "remainingQuantity")
    if (
      !Number.isFinite(input.systemQuantity) ||
      input.systemQuantity !== systemQuantity
    )
      throw new Error(
        "Saldo sistem berubah. Periksa saldo terbaru lalu simpan kembali."
      )
    const now = Date.now()
    movementId = addRow(database, TABLES.inventoryStockMovements, {
      inventoryItemId: cellStr(lot, "inventoryItemId"),
      inventoryLotId: input.inventoryLotId,
      lotCode: cellStr(lot, "lotCode"),
      containerCode: cellStr(lot, "containerCode"),
      movementType: "ADJUSTMENT",
      quantity: input.physicalQuantity - systemQuantity,
      systemQuantity,
      physicalQuantity: input.physicalQuantity,
      unit: cellStr(lot, "baseUnit"),
      referenceType: "STOCK_OPNAME",
      referenceId: input.inventoryLotId,
      reason: "Stock opname",
      actorStaffId: input.actorStaffId,
      createdAt: now,
    })
    updateRow(database, TABLES.inventoryLots, input.inventoryLotId, {
      remainingQuantity: input.physicalQuantity,
      updatedAt: now,
    })
  })
  return movementId
})
