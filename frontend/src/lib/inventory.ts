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
export type ExpiryStatus = "EXPIRED" | "EXPIRING SOON" | "OK" | "NO EXPIRY"

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000

function utcDate(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  return Date.UTC(year, month - 1, day)
}

export function expiryStatus(
  expiryDate: string | null,
  currentDate: string
): ExpiryStatus {
  if (!expiryDate) return "NO EXPIRY"

  const daysUntilExpiry =
    (utcDate(expiryDate) - utcDate(currentDate)) / DAY_IN_MILLISECONDS

  if (daysUntilExpiry < 0) return "EXPIRED"
  if (daysUntilExpiry <= 7) return "EXPIRING SOON"
  return "OK"
}

export function stockStatus(
  item: Pick<InventoryItem, "balance" | "minimumStock">
): StockStatus {
  if (item.balance <= 0) return "OUT OF STOCK"
  if (item.balance <= item.minimumStock) return "LOW"
  return "OK"
}
