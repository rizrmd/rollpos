export type InventoryItem = {
  id: string
  name: string
  sku: string
  baseUnit: string
  minimumStock: number
  isActive: boolean
  balance: number
}

export type InventoryLot = {
  id: string
  inventoryItemId: string
  lotCode: string | null
  receivedQuantity: number
  remainingQuantity: number
  baseUnit: string
  receivedAt: string
  expiryDate: string | null
  containerCode: string | null
  notes: string | null
}

export type StockStatus = "OK" | "LOW" | "OUT OF STOCK"

export function stockStatus(
  item: Pick<InventoryItem, "balance" | "minimumStock">
): StockStatus {
  if (item.balance <= 0) return "OUT OF STOCK"
  if (item.balance <= item.minimumStock) return "LOW"
  return "OK"
}
