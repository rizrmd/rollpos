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

export async function apiRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  const data = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new Error(data.error || "Permintaan inventory gagal.")
  return data
}
